"""
ProSafe V2 -- online (streaming) preprocessor.

    raw 1 Hz reading
      -> packet / timestamp checks
      -> per-channel validation, causal artifact screening, causal LOCF hold
      -> personalized baseline (worker profile snapshot per session)
      -> deviations, session gas baseline + ratio
      -> rolling statistics, median-split trends
      -> exposure-duration counters, workday NIOSH noise dose
      -> data-quality gate
      -> READY (model-ready feature dict)  |  UNCERTAIN (+ reason)

Design decision -- OPTION A, fully causal
-----------------------------------------
Every output for time t uses ONLY readings with timestamp <= t. Nothing waits
for future samples. The offline training pipeline was allowed a few seconds of
look-ahead (artifact confirmation / interpolation) and a retrospective session
gas baseline; this engine replaces those with causal equivalents:

* a suspected HR/body-temperature artifact is held (LOCF, marked IMPUTED)
  instead of being interpolated from a future sample; if the "jump" persists
  for `artifact_confirm_n` consistent samples it is accepted as a real change
  and those samples are added to the windows retroactively (affects only
  FUTURE outputs);
* the session gas baseline is a running (provisional) median of the session's
  first 180 s, frozen at 180 s, instead of a value computed with hindsight.

See PREPROCESSING_V2_DESIGN.md section "Offline vs online" for the trade-off
against OPTION B (a fixed 3-5 s buffering delay).

State isolation
---------------
All temporal state lives in a `WorkerState` keyed by worker_id. Histories are
never shared between workers; a helmet that changes wearer ends the previous
wearer's session.
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field
from datetime import date as _date, timedelta
from typing import Callable, Optional, Union

import numpy as np

from preprocessing import (
    CHANNEL_HORIZON_S,
    DEFAULT_CONFIG,
    EXPOSURE_RULES,
    REQUIRED_FEATURES,
    ROLLING_SPECS,
    TREND_SPECS,
    UNCERTAIN_REASON_PRIORITY,
    NaN,
    PreprocessingConfig,
    PreprocessResult,
    PreprocessStatus,
    QualityState,
    RawReading,
    TimedWindow,
    UncertainReason,
    body_temp_deviation,
    gas_ratio,
    hr_deviation,
    leq_db,
    median_split_trend,
    niosh_dose_increment_pct,
    parse_raw_reading,
    window_stat,
)
from utils import DEFERRABLE_FEATURES, EXTENDED_FEATURE_COLUMNS, RAW_SENSOR_COLUMNS


def _finite(x) -> bool:
    return x is not None and isinstance(x, (int, float, np.floating)) and math.isfinite(float(x))


# ===========================================================================
# Worker profile (baselines) -- supplied by the backend, never inferred here
# ===========================================================================
@dataclass
class WorkerProfile:
    worker_id: str
    baseline_hr: Optional[float]
    baseline_body_temperature: Optional[float]
    # Optional calibrated clean-air gas reference. When given it overrides
    # the per-session calibration (useful if the backend calibrates helmets).
    gas_baseline: Optional[float] = None


BaselineProvider = Union[Callable[[str], Optional[WorkerProfile]], dict, None]


# ===========================================================================
# State
# ===========================================================================
@dataclass
class ExposureCounterState:
    value_s: float = 0.0
    active: bool = False


@dataclass
class ChannelState:
    last_accepted_t: Optional[float] = None
    last_accepted_v: Optional[float] = None
    suspects: list = field(default_factory=list)   # pending [(t, v)] suspected artifacts
    unconfirmed_run: int = 0
    artifacts_rejected: int = 0
    level_changes_confirmed: int = 0


@dataclass
class GasBaselineCalibrator:
    start_t: float
    window_s: float
    min_samples: int
    override: Optional[float] = None
    samples: list = field(default_factory=list)
    frozen: Optional[float] = None

    def observe(self, t: float, gas: float) -> None:
        if self.override is not None or self.frozen is not None:
            return
        if t - self.start_t < self.window_s or len(self.samples) < self.min_samples:
            self.samples.append(float(gas))

    def current(self, t: float) -> tuple[Optional[float], bool]:
        """-> (baseline, provisional)."""
        if self.override is not None:
            return self.override, False
        if self.frozen is not None:
            return self.frozen, False
        if len(self.samples) >= self.min_samples:
            value = float(np.median(self.samples))
            if t - self.start_t >= self.window_s:
                self.frozen = value
                return value, False
            return value, True
        return None, True


@dataclass
class SessionState:
    session_id: str
    started_at: float
    cold_start: bool
    helmet_id: Optional[str]
    baseline_hr: Optional[float]
    baseline_body_temperature: Optional[float]
    gas: GasBaselineCalibrator
    windows: dict = field(default_factory=dict)       # channel -> TimedWindow (accepted samples only)
    channels: dict = field(default_factory=dict)      # channel -> ChannelState
    counters: dict = field(default_factory=dict)      # feature -> ExposureCounterState
    receipts: deque = field(default_factory=deque)    # timestamps of every processed reading
    sample_count: int = 0
    samples_since_gap: int = 0
    gap_refill: bool = False
    last_t: Optional[float] = None


@dataclass
class WorkerState:
    worker_id: str
    workday: Optional[str] = None
    noise_dose_pct: float = 0.0          # NIOSH daily dose -- per WORKDAY, survives session breaks
    sessions_today: int = 0
    session: Optional[SessionState] = None
    last_session_end_t: Optional[float] = None
    last_session_end_reason: Optional[str] = None
    last_t: Optional[float] = None
    last_quality: Optional[str] = None


# ===========================================================================
# Engine
# ===========================================================================
class StreamingPreprocessor:
    """Per-worker online feature engineering + data-quality gate.

    Usage::

        pre = StreamingPreprocessor({"W_001": WorkerProfile("W_001", 83, 36.69)})
        result = pre.process({"worker_id": "W_001", "timestamp": "...", "heart_rate": 84, ...})
        if result.model_ready:
            features = result.features
    """

    def __init__(self, baseline_provider: BaselineProvider = None, config: PreprocessingConfig = DEFAULT_CONFIG,
                 debug_features: bool = False):
        self.config = config
        # When True, UNCERTAIN results also carry the (untrusted) computed
        # features, for audit logging and parity testing. They are never used
        # for prediction -- status stays UNCERTAIN.
        self.debug_features = debug_features
        self._profiles: dict[str, WorkerProfile] = {}
        self._provider_fn: Optional[Callable[[str], Optional[WorkerProfile]]] = None
        if isinstance(baseline_provider, dict):
            self._profiles.update(baseline_provider)
        elif callable(baseline_provider):
            self._provider_fn = baseline_provider
        self._workers: dict[str, WorkerState] = {}
        self._helmet_owner: dict[str, str] = {}

    # ------------------------------------------------------------------ public
    def register_worker(self, profile: WorkerProfile) -> None:
        self._profiles[profile.worker_id] = profile

    def get_profile(self, worker_id: str) -> Optional[WorkerProfile]:
        return self._profile(worker_id)

    def get_state(self, worker_id: str) -> Optional[WorkerState]:
        return self._workers.get(worker_id)

    def reset_session(self, worker_id: str, reason: str = "MANUAL_RESET") -> None:
        """Manual reset: the next reading starts a new session (counters/windows cleared).
        The workday noise dose is kept -- use reset_workday() to clear it too."""
        ws = self._workers.get(worker_id)
        if ws and ws.session:
            self._end_session(ws, reason)

    def reset_workday(self, worker_id: str) -> None:
        ws = self._workers.get(worker_id)
        if ws:
            if ws.session:
                self._end_session(ws, "MANUAL_WORKDAY_RESET")
            ws.workday = None
            ws.noise_dose_pct = 0.0
            ws.sessions_today = 0

    def process(self, reading: Union[RawReading, dict]) -> PreprocessResult:
        if not isinstance(reading, RawReading):
            try:
                reading = parse_raw_reading(reading)
            except (ValueError, TypeError) as exc:
                wid = reading.get("worker_id") if isinstance(reading, dict) else None
                return self._uncertain_only(wid, None, [UncertainReason.INVALID_PACKET], notes=[str(exc)])
        return self._process(reading)

    # --------------------------------------------------------------- internals
    def _profile(self, worker_id: str) -> Optional[WorkerProfile]:
        if worker_id in self._profiles:
            return self._profiles[worker_id]
        if self._provider_fn is not None:
            return self._provider_fn(worker_id)
        return None

    def _baseline_changed(self, s: SessionState, worker_id: str) -> bool:
        """True when the session was built on baselines that the profile no longer holds
        (edited, or cleared to null). A session that has no baseline yet is not "changed":
        a baseline registered later is adopted in place, since nothing was computed from it."""
        if s.baseline_hr is None or s.baseline_body_temperature is None:
            return False
        prof = self._profile(worker_id)
        new = (prof.baseline_hr, prof.baseline_body_temperature) if prof else (None, None)
        old = (s.baseline_hr, s.baseline_body_temperature)
        return any(n is None or abs(float(n) - float(o)) > 1e-9 for n, o in zip(new, old))

    def _workday_key(self, r: RawReading) -> str:
        d = _date.fromisoformat(r.local_date)
        if r.local_hour is not None and r.local_hour < self.config.workday_boundary_hour:
            d = d - timedelta(days=1)
        return d.isoformat()

    def _end_session(self, ws: WorkerState, reason: str) -> None:
        if ws.session is not None:
            ws.last_session_end_t = ws.session.last_t if ws.session.last_t is not None else ws.session.started_at
        ws.session = None
        ws.last_session_end_reason = reason

    def _start_session(self, ws: WorkerState, r: RawReading) -> SessionState:
        cfg = self.config
        cold = ws.sessions_today == 0 or (
            ws.last_session_end_t is not None and r.timestamp - ws.last_session_end_t >= cfg.cold_start_after_s
        )
        ws.sessions_today += 1
        prof = self._profile(ws.worker_id)
        s = SessionState(
            # The start time keeps ids unique across service restarts (sessions_today restarts at 1),
            # so a backend that clears its prediction history on a new session_id never misses one.
            session_id=f"{ws.worker_id}:{ws.workday}:{ws.sessions_today}:{int(r.timestamp)}",
            started_at=r.timestamp,
            cold_start=cold,
            helmet_id=r.helmet_id,
            baseline_hr=prof.baseline_hr if prof else None,
            baseline_body_temperature=prof.baseline_body_temperature if prof else None,
            gas=GasBaselineCalibrator(
                start_t=r.timestamp,
                window_s=cfg.gas_baseline_window_s,
                min_samples=cfg.gas_baseline_min_samples,
                override=prof.gas_baseline if prof and prof.gas_baseline else None,
            ),
            windows={ch: TimedWindow(CHANNEL_HORIZON_S[ch]) for ch in RAW_SENSOR_COLUMNS},
            channels={ch: ChannelState() for ch in RAW_SENSOR_COLUMNS},
            counters={rule.feature: ExposureCounterState() for rule in EXPOSURE_RULES},
        )
        ws.session = s
        return s

    def _uncertain_only(self, worker_id, t, reasons, notes=None) -> PreprocessResult:
        reasons = sorted(set(reasons), key=UNCERTAIN_REASON_PRIORITY.index)
        return PreprocessResult(
            status=PreprocessStatus.UNCERTAIN,
            worker_id=worker_id,
            timestamp=t,
            quality=QualityState.UNCERTAIN,
            reason=reasons[0].value,
            reasons=[x.value for x in reasons],
            notes=notes or [],
        )

    # ------------------------------------------------------------ channel step
    def _update_channel(self, s: SessionState, ch: str, r: RawReading, t: float):
        """-> (output_value, status in {OBSERVED, IMPUTED, UNAVAILABLE}, invalid_reason)."""
        cfg = self.config
        lim = cfg.channels[ch]
        cs: ChannelState = s.channels[ch]
        w: TimedWindow = s.windows[ch]
        raw = r.channel(ch)

        invalid = None
        if raw is None:
            invalid = "MISSING"
        elif ch == "heart_rate" and (r.hr_contact is False or raw == 0):
            invalid = "NO_CONTACT"
        elif ch == "body_temperature" and (r.bt_contact is False or raw < lim.min_value):
            invalid = "NO_CONTACT"   # LM35 below body range = not on skin
        elif not (lim.min_value <= raw <= lim.max_value):
            invalid = "OUT_OF_RANGE"

        accepted = False
        if invalid is None and lim.artifact_jump is not None:
            ref = w.tail_values(cfg.artifact_reference_n)
            recent = cs.last_accepted_t is not None and t - cs.last_accepted_t <= 10.0
            if len(ref) >= 3 and recent:
                if abs(raw - float(np.median(ref))) > lim.artifact_jump:
                    cs.suspects.append((t, raw))
                    vals = [v for _, v in cs.suspects]
                    if len(cs.suspects) >= cfg.artifact_confirm_n and max(vals) - min(vals) <= lim.artifact_jump:
                        # Persistent, self-consistent jump -> genuine level change.
                        for ts, vs in cs.suspects:
                            w.push(ts, vs)
                        cs.last_accepted_t, cs.last_accepted_v = t, raw
                        cs.suspects.clear()
                        cs.unconfirmed_run = 0
                        cs.level_changes_confirmed += 1
                        accepted = True
                    else:
                        if len(cs.suspects) >= cfg.artifact_confirm_n:
                            cs.suspects = cs.suspects[-(cfg.artifact_confirm_n - 1):]
                        cs.unconfirmed_run += 1
                        cs.artifacts_rejected += 1
                        invalid = "SUSPECTED_ARTIFACT"
                else:
                    cs.suspects.clear()
                    cs.unconfirmed_run = 0
        if invalid is None and not accepted:
            w.push(t, raw)
            cs.last_accepted_t, cs.last_accepted_v = t, raw
            accepted = True
        if accepted:
            return raw, "OBSERVED", None
        if cs.last_accepted_t is not None and t - cs.last_accepted_t <= lim.max_hold_s:
            return cs.last_accepted_v, "IMPUTED", invalid
        return NaN, "UNAVAILABLE", invalid

    # ---------------------------------------------------------- exposure step
    def _exposure_signal(self, s: SessionState, signal: str, window_s: int, t: float, gas_bl) -> float:
        if signal == "ambient_temperature_mean":
            v = s.windows["ambient_temperature"].values(t, window_s)
            return float(v.mean()) if v.size else NaN
        if signal == "uv_index_mean":
            v = s.windows["uv_index"].values(t, window_s)
            return float(v.mean()) if v.size else NaN
        if signal == "gas_ratio_mean":
            v = s.windows["gas"].values(t, window_s)
            return float(v.mean()) / gas_bl if (v.size and gas_bl) else NaN
        if signal == "noise_leq":
            return leq_db(s.windows["noise"].values(t, window_s))
        if signal == "hr_deviation_pct_mean":
            v = s.windows["heart_rate"].values(t, window_s)
            b = s.baseline_hr
            return (float(v.mean()) - b) / b * 100.0 if (v.size and b) else NaN
        if signal == "body_temp_deviation_c_mean":
            v = s.windows["body_temperature"].values(t, window_s)
            b = s.baseline_body_temperature
            return float(v.mean()) - b if (v.size and b) else NaN
        raise ValueError(signal)

    # ------------------------------------------------------------------ main
    def _process(self, r: RawReading) -> PreprocessResult:
        cfg = self.config
        t = r.timestamp
        notes: list[str] = []
        ws = self._workers.get(r.worker_id)
        if ws is None:
            ws = self._workers[r.worker_id] = WorkerState(worker_id=r.worker_id)

        # Helmet changed hands -> close the previous wearer's session.
        if r.helmet_id:
            owner = self._helmet_owner.get(r.helmet_id)
            if owner and owner != r.worker_id and self._workers.get(owner) and self._workers[owner].session:
                self._end_session(self._workers[owner], "WORKER_CHANGED_ON_HELMET")
            self._helmet_owner[r.helmet_id] = r.worker_id

        if ws.last_t is not None and t <= ws.last_t + 1e-9:
            return self._uncertain_only(r.worker_id, t, [UncertainReason.OUT_OF_ORDER_TIMESTAMP],
                                        notes=[f"previous timestamp {ws.last_t}"])

        workday = self._workday_key(r)
        if ws.workday != workday:
            if ws.session:
                self._end_session(ws, "NEW_WORKDAY")
            ws.workday, ws.noise_dose_pct, ws.sessions_today = workday, 0.0, 0

        if ws.session is not None:
            s0 = ws.session
            if s0.last_t is not None and t - s0.last_t > cfg.session_gap_s:
                self._end_session(ws, "SESSION_GAP")
                notes.append("new session after long gap")
            elif r.helmet_id and s0.helmet_id and r.helmet_id != s0.helmet_id:
                self._end_session(ws, "HELMET_CHANGED")
                notes.append("new session: helmet changed")
            elif self._baseline_changed(s0, r.worker_id):
                # Deviations, deviation-based counters and windows were built on the old
                # baseline -> restart this worker's session only (other workers untouched).
                self._end_session(ws, "BASELINE_CHANGED")
                notes.append("new session: worker baseline changed")
        s = ws.session or self._start_session(ws, r)

        dt = None if s.last_t is None else t - s.last_t
        if dt is not None and dt > cfg.major_gap_s:
            s.gap_refill, s.samples_since_gap = True, 0
            notes.append(f"gap of {dt:.0f} s")

        if s.baseline_hr is None or s.baseline_body_temperature is None:
            prof = self._profile(r.worker_id)  # baseline may have been registered mid-session
            if prof and prof.baseline_hr and prof.baseline_body_temperature:
                s.baseline_hr, s.baseline_body_temperature = prof.baseline_hr, prof.baseline_body_temperature

        for w in s.windows.values():
            w.prune(t)

        # ---- 1. channels: validate, screen, hold --------------------------
        out: dict[str, float] = {}
        status: dict[str, str] = {}
        invalid: dict[str, Optional[str]] = {}
        for ch in RAW_SENSOR_COLUMNS:
            out[ch], status[ch], invalid[ch] = self._update_channel(s, ch, r, t)

        # ---- 2. session gas baseline --------------------------------------
        if status["gas"] == "OBSERVED":
            s.gas.observe(t, out["gas"])
        gas_bl, gas_provisional = s.gas.current(t)

        # ---- 3. workday NIOSH noise dose (observed samples only) ----------
        if status["noise"] == "OBSERVED":
            credit = cfg.sample_period_s if dt is None else min(max(dt, 0.0), cfg.sample_period_s)
            ws.noise_dose_pct += niosh_dose_increment_pct(out["noise"], credit)

        # ---- 4. features ----------------------------------------------------
        f: dict[str, float] = {ch: out[ch] for ch in RAW_SENSOR_COLUMNS}
        f["hr_deviation_bpm"], f["hr_deviation_pct"] = hr_deviation(out["heart_rate"], s.baseline_hr)
        f["body_temp_deviation_c"], f["body_temp_deviation_pct"] = body_temp_deviation(
            out["body_temperature"], s.baseline_body_temperature)
        f["gas_ratio_to_baseline"] = gas_ratio(out["gas"], gas_bl)
        for spec in ROLLING_SPECS:
            f[spec.feature] = window_stat(s.windows[spec.channel].values(t, spec.window_s), spec.stat, spec.min_samples)
        for spec in TREND_SPECS:
            f[spec.feature] = median_split_trend(s.windows[spec.channel], t, spec)
        f["noise_dose_pct"] = ws.noise_dose_pct

        # ---- 5. exposure counters -------------------------------------------
        for rule in EXPOSURE_RULES:
            sig = self._exposure_signal(s, rule.signal, rule.window_s, t, gas_bl)
            st: ExposureCounterState = s.counters[rule.feature]
            if _finite(sig) and sig >= rule.threshold:
                if st.active and dt is not None and dt <= cfg.counter_bridge_max_s:
                    st.value_s += dt
                else:
                    st.active, st.value_s = True, cfg.sample_period_s
            else:
                st.active, st.value_s = False, 0.0
            f[rule.feature] = st.value_s

        # ---- 6. bookkeeping ---------------------------------------------------
        s.sample_count += 1
        s.samples_since_gap += 1
        s.last_t = ws.last_t = t
        s.receipts.append(t)
        while s.receipts and s.receipts[0] <= t - cfg.packet_loss_window_s + 1e-9:
            s.receipts.popleft()

        # ---- 7. quality gate ----------------------------------------------------
        reasons: list[UncertainReason] = []
        elapsed = t - s.started_at
        if s.baseline_hr is None or s.baseline_body_temperature is None:
            reasons.append(UncertainReason.BASELINE_UNAVAILABLE)
        if s.cold_start and elapsed < cfg.sensor_warmup_s - 1e-9:
            reasons.append(UncertainReason.SENSOR_WARMUP)
        if s.sample_count < cfg.min_session_samples:
            reasons.append(UncertainReason.INSUFFICIENT_HISTORY)
        if s.gap_refill:
            if s.samples_since_gap < cfg.post_gap_min_samples:
                reasons.append(UncertainReason.MAJOR_TIMESTAMP_GAP)
            else:
                s.gap_refill = False
        if elapsed >= cfg.packet_loss_window_s:
            expected = cfg.packet_loss_window_s / cfg.sample_period_s
            if len(s.receipts) / expected < cfg.packet_loss_min_coverage:
                reasons.append(UncertainReason.PACKET_LOSS)

        unavailable = [ch for ch in RAW_SENSOR_COLUMNS if status[ch] == "UNAVAILABLE"]
        for ch in unavailable:
            if ch in ("heart_rate", "body_temperature"):
                if ch == "heart_rate" and invalid[ch] == "SUSPECTED_ARTIFACT":
                    reasons.append(UncertainReason.UNSTABLE_HR)
                elif invalid[ch] in ("NO_CONTACT", "MISSING"):
                    reasons.append(UncertainReason.BODY_CONTACT_FAILURE)
                else:
                    reasons.append(UncertainReason.SENSOR_UNAVAILABLE)
            else:
                reasons.append(UncertainReason.SENSOR_UNAVAILABLE)
        if len(unavailable) >= 2:
            reasons.append(UncertainReason.TOO_MANY_MISSING_SENSORS)
        hr_std = f["heart_rate_rolling_std_60s"]
        if (_finite(hr_std) and hr_std > cfg.hr_unstable_std_bpm) or \
                s.channels["heart_rate"].unconfirmed_run >= cfg.hr_unstable_suspect_run:
            reasons.append(UncertainReason.UNSTABLE_HR)
        if gas_bl is None:
            reasons.append(UncertainReason.GAS_BASELINE_UNAVAILABLE)

        missing_required = [c for c in REQUIRED_FEATURES if not _finite(f[c])]
        deferred = [c for c in DEFERRABLE_FEATURES if not _finite(f[c])]
        if missing_required or (deferred and not cfg.allow_deferrable_missing):
            reasons.append(UncertainReason.REQUIRED_FEATURES_UNAVAILABLE)

        imputed = [ch for ch in RAW_SENSOR_COLUMNS if status[ch] == "IMPUTED"]
        if gas_provisional and gas_bl is not None:
            notes.append("gas baseline provisional (session calibration window still open)")
        diagnostics = {
            "dt_s": dt,
            "gas_baseline": gas_bl,
            "gas_baseline_provisional": gas_provisional,
            "channel_status": status,
            "channel_invalid_reason": {k: v for k, v in invalid.items() if v},
            "missing_required_features": missing_required,
            "cold_start": s.cold_start,
            "sample_count": s.sample_count,
        }

        if reasons:
            res = self._uncertain_only(r.worker_id, t, reasons, notes)
            res.session_id, res.session_elapsed_s, res.diagnostics = s.session_id, elapsed, diagnostics
            res.imputed_channels = imputed
            if self.debug_features:
                res.features = {c: f[c] for c in EXTENDED_FEATURE_COLUMNS}
            ws.last_quality = QualityState.UNCERTAIN.value
            return res

        quality = QualityState.IMPUTED if imputed else QualityState.VALID
        ws.last_quality = quality.value
        return PreprocessResult(
            status=PreprocessStatus.READY,
            worker_id=r.worker_id,
            timestamp=t,
            quality=quality,
            features={c: f[c] for c in EXTENDED_FEATURE_COLUMNS},
            session_id=s.session_id,
            session_elapsed_s=elapsed,
            imputed_channels=imputed,
            deferred_features=deferred,
            notes=notes,
            diagnostics=diagnostics,
        )

    # ----------------------------------------------------- state persistence
    def export_state(self, worker_id: str) -> Optional[dict]:
        """JSON-serializable snapshot (for a backend state store / restarts)."""
        ws = self._workers.get(worker_id)
        if ws is None:
            return None
        d = {k: getattr(ws, k) for k in ("worker_id", "workday", "noise_dose_pct", "sessions_today",
                                         "last_session_end_t", "last_session_end_reason", "last_t", "last_quality")}
        s = ws.session
        if s is not None:
            d["session"] = {
                **{k: getattr(s, k) for k in ("session_id", "started_at", "cold_start", "helmet_id", "baseline_hr",
                                              "baseline_body_temperature", "sample_count", "samples_since_gap",
                                              "gap_refill", "last_t")},
                "gas": {k: getattr(s.gas, k) for k in ("start_t", "window_s", "min_samples", "override", "samples", "frozen")},
                "windows": {ch: w.to_list() for ch, w in s.windows.items()},
                "channels": {ch: {k: getattr(c, k) for k in ("last_accepted_t", "last_accepted_v", "suspects",
                                                              "unconfirmed_run", "artifacts_rejected",
                                                              "level_changes_confirmed")}
                             for ch, c in s.channels.items()},
                "counters": {k: {"value_s": c.value_s, "active": c.active} for k, c in s.counters.items()},
                "receipts": list(s.receipts),
            }
        return d

    def import_state(self, d: dict) -> None:
        ws = WorkerState(**{k: d[k] for k in ("worker_id", "workday", "noise_dose_pct", "sessions_today",
                                              "last_session_end_t", "last_session_end_reason", "last_t", "last_quality")})
        sd = d.get("session")
        if sd:
            ws.session = SessionState(
                **{k: sd[k] for k in ("session_id", "started_at", "cold_start", "helmet_id", "baseline_hr",
                                      "baseline_body_temperature", "sample_count", "samples_since_gap",
                                      "gap_refill", "last_t")},
                gas=GasBaselineCalibrator(**sd["gas"]),
                windows={ch: TimedWindow.from_list(CHANNEL_HORIZON_S[ch], items) for ch, items in sd["windows"].items()},
                channels={ch: ChannelState(**{**c, "suspects": [tuple(x) for x in c["suspects"]]})
                          for ch, c in sd["channels"].items()},
                counters={k: ExposureCounterState(**c) for k, c in sd["counters"].items()},
                receipts=deque(sd["receipts"]),
            )
        self._workers[ws.worker_id] = ws
