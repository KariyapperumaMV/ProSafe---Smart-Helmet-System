"""
ProSafe V2 -- Component A building blocks: preprocessing / feature engineering.

This module is stateless. It holds:

* the single source of truth for every preprocessing rule (windows,
  min-sample rules, trend estimator, exposure-counter rules, NIOSH noise dose,
  sensor plausibility limits, artifact limits, hold limits, gap/session rules);
* the data-quality vocabulary (VALID / IMPUTED / UNCERTAIN and the
  UNCERTAIN reasons);
* small numeric primitives (deviations, rolling statistics over a time window,
  median-split trend, Leq, NIOSH dose increment);
* the raw-reading parser (with old-name aliases) and the result structure.

The stateful, per-worker engine that applies these rules to a live 1 Hz stream
is `streaming_preprocessor.StreamingPreprocessor`.

How the rule values were obtained
---------------------------------
The ML-ready training CSVs were produced by an OFFLINE pipeline whose code is
not in this repository. The rules below were reverse-engineered from those
files and verified row-by-row on contiguous 1 Hz stretches (see
tests/test_preprocessing_parity.py and PREPROCESSING_V2_DESIGN.md):

* rolling mean/std            -> exact (ddof=1 std)
* median-split trends         -> exact
* exposure counters           -> >= 99.94 % per-row state agreement
* NIOSH noise dose increments -> exact to CSV rounding (1e-4)

Values that could NOT be recovered from the data are marked ASSUMED.
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Iterable, Optional

import numpy as np

from utils import (
    CORE_FEATURE_COLUMNS,
    DEFERRABLE_FEATURES,
    EXTENDED_FEATURE_COLUMNS,
    RAW_SENSOR_COLUMNS,
    normalize_keys,
)

NaN = float("nan")


# ===========================================================================
# Data-quality vocabulary
# ===========================================================================
class QualityState(str, Enum):
    VALID = "VALID"          # every model input observed this second
    IMPUTED = "IMPUTED"      # >=1 raw input briefly held (causal LOCF) -- still model-ready
    UNCERTAIN = "UNCERTAIN"  # not enough trustworthy information -> classifier NOT called


class PreprocessStatus(str, Enum):
    READY = "READY"
    UNCERTAIN = "UNCERTAIN"


class UncertainReason(str, Enum):
    INVALID_PACKET = "INVALID_PACKET"
    OUT_OF_ORDER_TIMESTAMP = "OUT_OF_ORDER_TIMESTAMP"
    BASELINE_UNAVAILABLE = "BASELINE_UNAVAILABLE"
    SENSOR_WARMUP = "SENSOR_WARMUP"
    INSUFFICIENT_HISTORY = "INSUFFICIENT_HISTORY"
    MAJOR_TIMESTAMP_GAP = "MAJOR_TIMESTAMP_GAP"
    PACKET_LOSS = "PACKET_LOSS"
    BODY_CONTACT_FAILURE = "BODY_CONTACT_FAILURE"
    TOO_MANY_MISSING_SENSORS = "TOO_MANY_MISSING_SENSORS"
    SENSOR_UNAVAILABLE = "SENSOR_UNAVAILABLE"
    UNSTABLE_HR = "UNSTABLE_HR"
    GAS_BASELINE_UNAVAILABLE = "GAS_BASELINE_UNAVAILABLE"
    REQUIRED_FEATURES_UNAVAILABLE = "REQUIRED_FEATURES_UNAVAILABLE"


# Highest priority first: the primary `reason` of an UNCERTAIN result is the
# first entry here that applies; all applicable reasons are still returned.
UNCERTAIN_REASON_PRIORITY: list[UncertainReason] = list(UncertainReason)

UNCERTAIN_REASON_TEXT: dict[UncertainReason, str] = {
    UncertainReason.INVALID_PACKET: "Reading could not be parsed (missing worker_id/timestamp or non-numeric values).",
    UncertainReason.OUT_OF_ORDER_TIMESTAMP: "Timestamp is not after the worker's previous reading (duplicate or out of order); reading ignored.",
    UncertainReason.BASELINE_UNAVAILABLE: "Worker has no stored HR / body-temperature baseline, so personalized deviations cannot be computed.",
    UncertainReason.SENSOR_WARMUP: "Cold start: sensors (notably the MQ-2 heater) are inside the warm-up period.",
    UncertainReason.INSUFFICIENT_HISTORY: "Session too young for the minimum safe feature set.",
    UncertainReason.MAJOR_TIMESTAMP_GAP: "A large gap in the stream; short windows are being re-filled.",
    UncertainReason.PACKET_LOSS: "Too few samples received in the last 60 s.",
    UncertainReason.BODY_CONTACT_FAILURE: "Heart-rate / body-temperature sensor has no reliable skin contact beyond the hold limit.",
    UncertainReason.TOO_MANY_MISSING_SENSORS: "Two or more sensor channels are unavailable beyond their hold limits.",
    UncertainReason.SENSOR_UNAVAILABLE: "A required sensor channel is unavailable beyond its hold limit.",
    UncertainReason.UNSTABLE_HR: "Heart-rate signal is unstable (implausible variability or unconfirmed jumps).",
    UncertainReason.GAS_BASELINE_UNAVAILABLE: "Session gas baseline is not yet established, so gas_ratio_to_baseline is unavailable.",
    UncertainReason.REQUIRED_FEATURES_UNAVAILABLE: "One or more required (non-deferrable) model features could not be computed.",
}


# ===========================================================================
# Configuration -- every tunable in one place
# ===========================================================================
@dataclass(frozen=True)
class RollingSpec:
    feature: str
    channel: str
    window_s: int
    stat: str            # "mean" | "std"
    min_samples: int


@dataclass(frozen=True)
class TrendSpec:
    """Median-split trend: (median(last k s) - median(first k s of window)) / (W-k) s * 60.

    Recovered exactly from the training data: W=60 -> k=20; W=300 -> k=100;
    each segment needs >= k/2 samples.
    """
    feature: str
    channel: str
    window_s: int
    segment_s: int
    min_samples_per_segment: int


@dataclass(frozen=True)
class ExposureRule:
    """Exposure counter = consecutive seconds the SMOOTHED signal is >= threshold.

    Starts at 1 s on the first qualifying sample, +dt each further qualifying
    sample, resets to 0 on the first non-qualifying sample. The warning counter
    therefore also runs while the critical level is exceeded.
    """
    feature: str
    signal: str          # see StreamingPreprocessor._exposure_signal
    window_s: int
    threshold: float
    assumed: bool = False


ROLLING_SPECS: tuple[RollingSpec, ...] = (
    RollingSpec("heart_rate_rolling_mean_30s", "heart_rate", 30, "mean", 6),
    RollingSpec("heart_rate_rolling_mean_60s", "heart_rate", 60, "mean", 12),
    RollingSpec("heart_rate_rolling_std_60s", "heart_rate", 60, "std", 12),
    RollingSpec("body_temp_rolling_mean_300s", "body_temperature", 300, "mean", 60),
    RollingSpec("ambient_temp_rolling_mean_300s", "ambient_temperature", 300, "mean", 60),
    RollingSpec("uv_rolling_mean_300s", "uv_index", 300, "mean", 60),
    RollingSpec("gas_rolling_mean_30s", "gas", 30, "mean", 6),
    RollingSpec("noise_rolling_mean_60s", "noise", 60, "mean", 12),
)

TREND_SPECS: tuple[TrendSpec, ...] = (
    TrendSpec("hr_trend_60s_bpm_per_min", "heart_rate", 60, 20, 10),
    TrendSpec("body_temp_trend_300s_c_per_min", "body_temperature", 300, 100, 50),
    TrendSpec("ambient_temp_trend_300s_c_per_min", "ambient_temperature", 300, 100, 50),
    TrendSpec("uv_trend_300s_per_min", "uv_index", 300, 100, 50),
    TrendSpec("gas_trend_60s_per_min", "gas", 60, 20, 10),
    TrendSpec("noise_trend_60s_db_per_min", "noise", 60, 20, 10),
)

EXPOSURE_RULES: tuple[ExposureRule, ...] = (
    ExposureRule("temp_warning_exposure_sec", "ambient_temperature_mean", 30, 30.0),
    ExposureRule("temp_critical_exposure_sec", "ambient_temperature_mean", 30, 35.0),
    ExposureRule("uv_warning_exposure_sec", "uv_index_mean", 10, 3.0),
    ExposureRule("uv_critical_exposure_sec", "uv_index_mean", 10, 8.0),
    ExposureRule("gas_warning_exposure_sec", "gas_ratio_mean", 10, 2.0),
    ExposureRule("gas_critical_exposure_sec", "gas_ratio_mean", 10, 4.0),
    ExposureRule("noise_warning_exposure_sec", "noise_leq", 10, 80.0),
    ExposureRule("noise_critical_exposure_sec", "noise_leq", 10, 85.0),
    ExposureRule("hr_warning_exposure_sec", "hr_deviation_pct_mean", 30, 20.0),
    ExposureRule("hr_critical_exposure_sec", "hr_deviation_pct_mean", 30, 40.0),
    ExposureRule("body_temp_warning_exposure_sec", "body_temp_deviation_c_mean", 60, 0.5),
    # Never active anywhere in the training data, so its threshold cannot be
    # recovered; 1.0 degC is ASSUMED by analogy with the other warning->critical
    # steps. The feature is constant 0 in training, so the model ignores it.
    ExposureRule("body_temp_critical_exposure_sec", "body_temp_deviation_c_mean", 60, 1.0, assumed=True),
)

# NIOSH REL (recovered exactly from the training data): 85 dBA criterion,
# 3 dB exchange rate, 80 dBA threshold, 8 h reference; accumulates per WORKDAY
# (not reset at the lunch-break session boundary); missing noise adds nothing.
NIOSH_CRITERION_DBA = 85.0
NIOSH_EXCHANGE_DB = 3.0
NIOSH_THRESHOLD_DBA = 80.0
NIOSH_REFERENCE_MIN = 480.0


@dataclass(frozen=True)
class ChannelLimits:
    min_value: float
    max_value: float
    max_hold_s: float              # causal LOCF limit before the channel is "unavailable"
    artifact_jump: Optional[float]  # |x - median(last 5 accepted)| above this is a suspected artifact


@dataclass(frozen=True)
class PreprocessingConfig:
    # Nominal sample period of the V2 stream (training data is 1 Hz).
    sample_period_s: float = 1.0

    # --- sensor plausibility, hold and artifact limits ----------------------
    # Artifact limits are deliberately ABOVE the largest 1-s change present in
    # the (already cleaned) training data (HR max 29 bpm vs median-of-5,
    # body temp max 0.29 degC), so clean data passes untouched and only gross
    # artifacts are caught. Environmental channels have no jump filter: a
    # sudden gas/noise rise is a real hazard, not an artifact.
    channels: dict = field(default_factory=lambda: {
        "heart_rate": ChannelLimits(30.0, 220.0, 3.0, 40.0),
        "body_temperature": ChannelLimits(30.0, 43.0, 10.0, 1.0),
        "ambient_temperature": ChannelLimits(-20.0, 60.0, 10.0, None),
        "uv_index": ChannelLimits(0.0, 15.0, 5.0, None),
        "gas": ChannelLimits(0.0, 10000.0, 5.0, None),
        "noise": ChannelLimits(20.0, 140.0, 5.0, None),
    })
    artifact_reference_n: int = 5
    artifact_confirm_n: int = 3        # consecutive consistent "jumps" accepted as a real level change
    hr_unstable_std_bpm: float = 30.0  # development data max rolling-60 s std is 16.3 bpm
    hr_unstable_suspect_run: int = 6   # unconfirmed suspect HR samples in a row

    # --- warm-up (mirrors the offline framework) ----------------------------
    min_session_samples: int = 20       # offline: first READY row = 20th sample of a warm session
    sensor_warmup_s: float = 180.0      # offline: first 180 s of each workday's first session dropped
    cold_start_after_s: float = 4 * 3600.0  # previous session ended longer ago -> cold start
    post_gap_min_samples: int = 20

    # --- gas baseline (per session) ------------------------------------------
    gas_baseline_window_s: float = 180.0   # median of valid gas samples in the first 180 s
    gas_baseline_min_samples: int = 20     # provisional (running) median allowed from 20 samples

    # --- gaps / sessions -------------------------------------------------------
    minor_gap_s: float = 1.5               # dt above this is packet loss
    major_gap_s: float = 10.0              # dt above this -> MAJOR_TIMESTAMP_GAP re-fill
    counter_bridge_max_s: float = 120.0    # exposure counters bridge gaps up to this (backend EXPOSURE_MAX_GAP_SECONDS)
    session_gap_s: float = 1800.0          # dt above this -> new session
    packet_loss_window_s: float = 60.0
    packet_loss_min_coverage: float = 0.5
    workday_boundary_hour: int = 0         # local hour at which a new workday (noise-dose day) starts

    # --- gate -------------------------------------------------------------------
    allow_deferrable_missing: bool = True  # long-window features may be NaN during warm-up (as in training)


DEFAULT_CONFIG = PreprocessingConfig()

REQUIRED_FEATURES: list[str] = [f for f in EXTENDED_FEATURE_COLUMNS if f not in DEFERRABLE_FEATURES]

# Every window any rule reads, per channel -> buffer horizon.
CHANNEL_HORIZON_S: dict[str, int] = {
    ch: max(
        [s.window_s for s in ROLLING_SPECS if s.channel == ch]
        + [s.window_s for s in TREND_SPECS if s.channel == ch]
        + [60]
    )
    for ch in RAW_SENSOR_COLUMNS
}


# ===========================================================================
# Numeric primitives
# ===========================================================================
def hr_deviation(heart_rate: float, baseline_hr: Optional[float]) -> tuple[float, float]:
    """(bpm, pct) -- pct = (HR - baseline) / baseline * 100."""
    if baseline_hr is None or not baseline_hr > 0 or not _finite(heart_rate):
        return NaN, NaN
    d = heart_rate - baseline_hr
    return d, d / baseline_hr * 100.0


def body_temp_deviation(body_temperature: float, baseline_bt: Optional[float]) -> tuple[float, float]:
    """(degC, pct) -- pct = (BT - baseline) / baseline * 100."""
    if baseline_bt is None or not baseline_bt > 0 or not _finite(body_temperature):
        return NaN, NaN
    d = body_temperature - baseline_bt
    return d, d / baseline_bt * 100.0


def gas_ratio(gas: float, gas_baseline: Optional[float]) -> float:
    if gas_baseline is None or not gas_baseline > 0 or not _finite(gas):
        return NaN
    return gas / gas_baseline


def niosh_allowed_minutes(level_dba: float) -> float:
    return NIOSH_REFERENCE_MIN / 2.0 ** ((level_dba - NIOSH_CRITERION_DBA) / NIOSH_EXCHANGE_DB)


def niosh_dose_increment_pct(level_dba: float, seconds: float) -> float:
    """Daily-dose percentage added by `seconds` at `level_dba` (0 below 80 dBA)."""
    if not _finite(level_dba) or level_dba < NIOSH_THRESHOLD_DBA or seconds <= 0:
        return 0.0
    return 100.0 * (seconds / 60.0) / niosh_allowed_minutes(level_dba)


def leq_db(levels: np.ndarray) -> float:
    """Energy-equivalent level: 10*log10(mean(10^(L/10)))."""
    if levels.size == 0:
        return NaN
    return float(10.0 * np.log10(np.mean(np.power(10.0, levels / 10.0))))


def _finite(x: Any) -> bool:
    return isinstance(x, (int, float, np.floating, np.integer)) and math.isfinite(float(x))


class TimedWindow:
    """Bounded (timestamp, value) buffer of ACCEPTED observations for one channel.

    Windows are half-open in time: (now - W, now]. At 1 Hz this equals the
    offline row-count windows exactly. Imputed / rejected samples are never
    stored, matching the offline behaviour of skipping NaN.
    """

    __slots__ = ("horizon_s", "_t", "_v", "_cache")

    def __init__(self, horizon_s: float):
        self.horizon_s = float(horizon_s)
        self._t: deque[float] = deque()
        self._v: deque[float] = deque()
        self._cache: Optional[tuple[np.ndarray, np.ndarray]] = None

    def push(self, t: float, v: float) -> None:
        self._t.append(t)
        self._v.append(float(v))
        self._cache = None

    def prune(self, now: float) -> None:
        cutoff = now - self.horizon_s
        while self._t and self._t[0] <= cutoff + 1e-9:
            self._t.popleft()
            self._v.popleft()
            self._cache = None

    def clear(self) -> None:
        self._t.clear()
        self._v.clear()
        self._cache = None

    def __len__(self) -> int:
        return len(self._t)

    def arrays(self) -> tuple[np.ndarray, np.ndarray]:
        if self._cache is None:
            self._cache = (np.fromiter(self._t, float, len(self._t)), np.fromiter(self._v, float, len(self._v)))
        return self._cache

    def values(self, now: float, window_s: float, end_offset_s: float = 0.0) -> np.ndarray:
        """Values with t in (now - window_s, now - end_offset_s]."""
        t, v = self.arrays()
        if t.size == 0:
            return v
        lo = now - window_s + 1e-9
        hi = now - end_offset_s + 1e-9
        return v[(t > lo) & (t <= hi)]

    def last(self) -> Optional[tuple[float, float]]:
        return (self._t[-1], self._v[-1]) if self._t else None

    def tail_values(self, n: int) -> list[float]:
        return list(self._v)[-n:]

    def to_list(self) -> list[list[float]]:
        return [[t, v] for t, v in zip(self._t, self._v)]

    @classmethod
    def from_list(cls, horizon_s: float, items: Iterable) -> "TimedWindow":
        w = cls(horizon_s)
        for t, v in items:
            w.push(float(t), float(v))
        return w


def window_stat(values: np.ndarray, stat: str, min_samples: int) -> float:
    if values.size < min_samples or values.size == 0:
        return NaN
    if stat == "mean":
        return float(values.mean())
    if stat == "std":
        return float(values.std(ddof=1)) if values.size > 1 else NaN
    raise ValueError(stat)


def median_split_trend(window: TimedWindow, now: float, spec: TrendSpec) -> float:
    head = window.values(now, spec.window_s, end_offset_s=spec.window_s - spec.segment_s)
    tail = window.values(now, spec.segment_s)
    if head.size < spec.min_samples_per_segment or tail.size < spec.min_samples_per_segment:
        return NaN
    span = spec.window_s - spec.segment_s
    return float((np.median(tail) - np.median(head)) / span * 60.0)


# ===========================================================================
# Raw input
# ===========================================================================
# Firmware marks an invalid reading with -1 (ProSafe-Helmet/src/main.cpp
# sendNormalPacket) and a lost finger with heart rate 0.
SENTINEL_INVALID_VALUES = (-1.0,)


@dataclass
class RawReading:
    """One raw helmet observation (nominally 1 Hz). Unknown/invalid values -> None."""
    worker_id: str
    timestamp: float  # epoch seconds
    heart_rate: Optional[float] = None
    body_temperature: Optional[float] = None
    ambient_temperature: Optional[float] = None
    uv_index: Optional[float] = None
    gas: Optional[float] = None
    noise: Optional[float] = None
    helmet_id: Optional[str] = None
    hr_contact: Optional[bool] = None   # optional firmware finger/skin-contact flag
    bt_contact: Optional[bool] = None
    local_date: Optional[str] = None     # workday key source (YYYY-MM-DD in site-local time)
    local_hour: Optional[int] = None

    def channel(self, name: str) -> Optional[float]:
        return getattr(self, name)


def parse_timestamp(value: Any) -> tuple[float, str, int]:
    """-> (epoch_seconds, local_date 'YYYY-MM-DD', local_hour).

    Naive datetimes / ISO strings without an offset are treated as SITE-LOCAL
    time (the helmet's clock); their wall-clock date defines the workday.
    """
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        dt = datetime.fromtimestamp(float(value), tz=timezone.utc)
        return float(value), dt.date().isoformat(), dt.hour
    if isinstance(value, str):
        s = value.strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
    elif isinstance(value, datetime):
        dt = value
    elif hasattr(value, "to_pydatetime"):
        dt = value.to_pydatetime()
    else:
        raise ValueError(f"Unsupported timestamp: {value!r}")
    if dt.tzinfo is None:
        epoch = dt.replace(tzinfo=timezone.utc).timestamp()  # naive -> treat wall clock as a consistent timeline
    else:
        epoch = dt.timestamp()
    return epoch, dt.date().isoformat(), dt.hour


def _num_or_none(v: Any) -> Optional[float]:
    if v is None or isinstance(v, bool):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(f) or f in SENTINEL_INVALID_VALUES:
        return None
    return f


def parse_raw_reading(payload: dict) -> RawReading:
    """Build a RawReading from a dict, accepting old ProSafe / backend names.

    Raises ValueError for a structurally invalid packet (no worker_id or
    timestamp). Individual sensor values that are missing, non-numeric, NaN
    or the firmware sentinel -1 become None (handled by the quality gate).
    """
    if not isinstance(payload, dict):
        raise ValueError("reading must be a JSON object")
    p = normalize_keys(payload)
    worker_id = p.get("worker_id")
    if not worker_id or not isinstance(worker_id, str):
        raise ValueError("worker_id is required")
    if p.get("timestamp") in (None, ""):
        raise ValueError("timestamp is required")
    epoch, local_date, local_hour = parse_timestamp(p["timestamp"])
    return RawReading(
        worker_id=worker_id,
        timestamp=epoch,
        heart_rate=_num_or_none(p.get("heart_rate")),
        body_temperature=_num_or_none(p.get("body_temperature")),
        ambient_temperature=_num_or_none(p.get("ambient_temperature")),
        uv_index=_num_or_none(p.get("uv_index")),
        gas=_num_or_none(p.get("gas")),
        noise=_num_or_none(p.get("noise")),
        helmet_id=p.get("helmet_id"),
        hr_contact=p.get("hr_contact") if isinstance(p.get("hr_contact"), bool) else None,
        bt_contact=p.get("bt_contact") if isinstance(p.get("bt_contact"), bool) else None,
        local_date=local_date,
        local_hour=local_hour,
    )


# ===========================================================================
# Result
# ===========================================================================
@dataclass
class PreprocessResult:
    status: PreprocessStatus
    worker_id: Optional[str]
    timestamp: Optional[float]
    quality: QualityState
    reason: Optional[str] = None
    reasons: list[str] = field(default_factory=list)
    features: Optional[dict[str, float]] = None
    session_id: Optional[str] = None
    session_elapsed_s: Optional[float] = None
    imputed_channels: list[str] = field(default_factory=list)
    deferred_features: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    diagnostics: dict = field(default_factory=dict)

    @property
    def model_ready(self) -> bool:
        return self.status == PreprocessStatus.READY

    def feature_vector(self, feature_columns: list[str]) -> dict[str, float]:
        if not self.model_ready or self.features is None:
            raise RuntimeError("feature_vector() requested for a non-READY result")
        return {c: self.features[c] for c in feature_columns}

    def to_dict(self, include_features: bool = True) -> dict:
        d: dict = {
            "status": self.status.value,
            "model_ready": self.model_ready,
            "quality": self.quality.value,
            "worker_id": self.worker_id,
            "timestamp": self.timestamp,
            "session_id": self.session_id,
            "session_elapsed_s": self.session_elapsed_s,
        }
        if self.model_ready:
            if include_features:
                d["features"] = {k: (None if not _finite(v) else float(v)) for k, v in (self.features or {}).items()}
            d["imputed_channels"] = self.imputed_channels
            d["deferred_features"] = self.deferred_features
        else:
            d["reason"] = self.reason
            d["reasons"] = self.reasons
        if self.notes:
            d["notes"] = self.notes
        return d


__all__ = [
    "CORE_FEATURE_COLUMNS",
    "EXTENDED_FEATURE_COLUMNS",
    "DEFERRABLE_FEATURES",
    "REQUIRED_FEATURES",
    "QualityState",
    "PreprocessStatus",
    "UncertainReason",
    "PreprocessingConfig",
    "DEFAULT_CONFIG",
    "ROLLING_SPECS",
    "TREND_SPECS",
    "EXPOSURE_RULES",
    "TimedWindow",
    "RawReading",
    "parse_raw_reading",
    "PreprocessResult",
]
