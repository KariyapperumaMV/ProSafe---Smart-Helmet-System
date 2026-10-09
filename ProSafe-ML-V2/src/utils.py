"""
Shared constants and guarded data access for ProSafe ML V2.

Centralizes:
- Project paths (resolved from this file, so scripts work from any CWD)
- The V2 feature contract (CORE / EXTENDED feature sets, fixed order)
- Columns that must NEVER be used as predictors
- Old-name -> V2-name input aliases (backwards compatibility)
- Dataset loading with schema validation and the W_002 isolation guard

W_002 is the strictly unseen external test worker. Nothing in model
selection, tuning, scaling or preprocessing-rule design may touch it, so the
only way to load it is `load_external_test_data()`, which refuses to run until
the frozen model configuration has been written to disk.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Final

import pandas as pd

# Windows consoles default to cp1252; every script prints a few non-ASCII
# characters (arrows, degree signs), so force UTF-8 once, centrally.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT: Final[Path] = Path(__file__).resolve().parents[1]
DATA_DIR: Final[Path] = PROJECT_ROOT / "data"
MODELS_DIR: Final[Path] = PROJECT_ROOT / "models"
OUTPUTS_DIR: Final[Path] = PROJECT_ROOT / "outputs"
EDA_OUTPUTS_DIR: Final[Path] = OUTPUTS_DIR / "eda"
COMPARISON_OUTPUTS_DIR: Final[Path] = OUTPUTS_DIR / "comparison"
EXPERIMENT_OUTPUTS_DIR: Final[Path] = OUTPUTS_DIR / "experiments"

SYNTHETIC_DATA_PATH: Final[Path] = DATA_DIR / "prosafe_synthetic_ml_ready.csv"
W001_DATA_PATH: Final[Path] = DATA_DIR / "prosafe_W001_ml_ready.csv"
W002_DATA_PATH: Final[Path] = DATA_DIR / "prosafe_W002_ml_ready.csv"

# Artifact names are kept identical to the old ProSafe-ML project so the
# integration step can swap directories rather than rename files.
BEST_MODEL_PATH: Final[Path] = MODELS_DIR / "best_model.pkl"
BEST_MODEL_META_PATH: Final[Path] = MODELS_DIR / "best_model_meta.pkl"
ALL_MODELS_META_PATH: Final[Path] = MODELS_DIR / "all_models_meta.pkl"
SCALER_PATH: Final[Path] = MODELS_DIR / "scaler.pkl"
LABEL_ENCODER_PATH: Final[Path] = MODELS_DIR / "label_encoder.pkl"
# Written by the (archived) archive/source_history/train_models.py BEFORE W_002 was first loaded.
# load_external_test_data() refuses to open W_002 without it (access gate).
FROZEN_CONFIG_PATH: Final[Path] = MODELS_DIR / "frozen_config.json"


def model_slug(name: str) -> str:
    """'Random Forest' -> 'random_forest' for filenames."""
    return name.lower().replace(" ", "_")


def ensure_dirs() -> None:
    for d in (MODELS_DIR, OUTPUTS_DIR, EDA_OUTPUTS_DIR, COMPARISON_OUTPUTS_DIR, EXPERIMENT_OUTPUTS_DIR):
        d.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Workers / roles
# ---------------------------------------------------------------------------
SYNTHETIC_WORKERS: Final[list[str]] = ["S_001", "S_002", "S_003", "S_004"]
REAL_DEV_WORKER: Final[str] = "W_001"
EXTERNAL_TEST_WORKER: Final[str] = "W_002"
DEV_WORKERS: Final[list[str]] = SYNTHETIC_WORKERS + [REAL_DEV_WORKER]

WORKER_COLUMN: Final[str] = "worker_id"
TIMESTAMP_COLUMN: Final[str] = "timestamp"
TARGET_COLUMN: Final[str] = "risk_level"

# ---------------------------------------------------------------------------
# Classes. UNCERTAIN is deliberately NOT here: it is a data-quality outcome
# produced by the preprocessing gate, never a classifier target.
# ---------------------------------------------------------------------------
RISK_CLASSES: Final[list[str]] = ["Safe", "Warning", "Critical"]  # display / severity order
SYSTEM_UNCERTAIN: Final[str] = "UNCERTAIN"
SYSTEM_OUTPUTS: Final[list[str]] = ["SAFE", "WARNING", "CRITICAL", SYSTEM_UNCERTAIN]

RANDOM_STATE: Final[int] = 42

# ---------------------------------------------------------------------------
# Feature contract (fixed order = training order = inference order)
# ---------------------------------------------------------------------------
RAW_SENSOR_COLUMNS: Final[list[str]] = [
    "ambient_temperature",
    "uv_index",
    "gas",  # MQ-2 reading in the V2 dataset's sensor units -- NOT calibrated ppm
    "noise",
    "body_temperature",
    "heart_rate",
]
DEVIATION_COLUMNS: Final[list[str]] = [
    "hr_deviation_bpm",
    "hr_deviation_pct",
    "body_temp_deviation_c",
    "body_temp_deviation_pct",
]
GAS_RATIO_COLUMNS: Final[list[str]] = ["gas_ratio_to_baseline"]
ROLLING_COLUMNS: Final[list[str]] = [
    "heart_rate_rolling_mean_30s",
    "heart_rate_rolling_mean_60s",
    "heart_rate_rolling_std_60s",
    "body_temp_rolling_mean_300s",
    "ambient_temp_rolling_mean_300s",
    "uv_rolling_mean_300s",
    "gas_rolling_mean_30s",
    "noise_rolling_mean_60s",
]
TREND_COLUMNS: Final[list[str]] = [
    "hr_trend_60s_bpm_per_min",
    "body_temp_trend_300s_c_per_min",
    "ambient_temp_trend_300s_c_per_min",
    "uv_trend_300s_per_min",
    "gas_trend_60s_per_min",
    "noise_trend_60s_db_per_min",
]
NOISE_DOSE_COLUMNS: Final[list[str]] = ["noise_dose_pct"]
EXPOSURE_COLUMNS: Final[list[str]] = [
    "temp_warning_exposure_sec",
    "temp_critical_exposure_sec",
    "uv_warning_exposure_sec",
    "uv_critical_exposure_sec",
    "gas_warning_exposure_sec",
    "gas_critical_exposure_sec",
    "noise_warning_exposure_sec",
    "noise_critical_exposure_sec",
    "hr_warning_exposure_sec",
    "hr_critical_exposure_sec",
    "body_temp_warning_exposure_sec",
    "body_temp_critical_exposure_sec",
]

CORE_FEATURE_COLUMNS: Final[list[str]] = (
    RAW_SENSOR_COLUMNS
    + DEVIATION_COLUMNS
    + GAS_RATIO_COLUMNS
    + ROLLING_COLUMNS
    + TREND_COLUMNS
    + NOISE_DOSE_COLUMNS
)
EXTENDED_FEATURE_COLUMNS: Final[list[str]] = CORE_FEATURE_COLUMNS + EXPOSURE_COLUMNS

FEATURE_SETS: Final[dict[str, list[str]]] = {
    "CORE": CORE_FEATURE_COLUMNS,
    "EXTENDED": EXTENDED_FEATURE_COLUMNS,
}

# Long-window features that are legitimately unavailable (NaN) during the
# first minutes of a session in BOTH the offline training data and the online
# streaming preprocessor (same min-sample rules). A READY result may carry NaN
# here; every other model feature must be present.
DEFERRABLE_FEATURES: Final[list[str]] = [
    "body_temp_rolling_mean_300s",
    "ambient_temp_rolling_mean_300s",
    "uv_rolling_mean_300s",
    "hr_trend_60s_bpm_per_min",
    "gas_trend_60s_per_min",
    "noise_trend_60s_db_per_min",
    "body_temp_trend_300s_c_per_min",
    "ambient_temp_trend_300s_c_per_min",
    "uv_trend_300s_per_min",
]

# ---------------------------------------------------------------------------
# Never predictors. Raw baselines are excluded because with only six workers
# a stored baseline value behaves like a worker identifier; personalization
# is carried by the deviation features instead.
# ---------------------------------------------------------------------------
FORBIDDEN_PREDICTORS: Final[list[str]] = [
    WORKER_COLUMN,
    TIMESTAMP_COLUMN,
    TARGET_COLUMN,
    "baseline_hr",
    "baseline_body_temperature",
    "baseline_hr_bpm",
    "baseline_body_temp_c",
    "risk_evidence_score",
    "label_reason",
    "rules_triggered",
    "uncertain_reason",
]
# Any column whose name contains one of these fragments is audit/label
# metadata (per-sensor evidence labels, artifact flags, quality flags).
FORBIDDEN_PREDICTOR_FRAGMENTS: Final[list[str]] = [
    "evidence",
    "label",
    "rule",
    "artifact",
    "quality",
    "uncertain",
    "imputed",
    "flag",
]


def is_forbidden_predictor(column: str) -> bool:
    c = column.lower()
    return c in FORBIDDEN_PREDICTORS or any(f in c for f in FORBIDDEN_PREDICTOR_FRAGMENTS)


def assert_feature_contract(feature_columns: list[str]) -> None:
    """Fail loudly if a forbidden column ever sneaks into a feature list."""
    bad = [c for c in feature_columns if is_forbidden_predictor(c)]
    if bad:
        raise ValueError(f"Forbidden predictor(s) in feature list: {bad}")


for _fs in FEATURE_SETS.values():
    assert_feature_contract(_fs)

# ---------------------------------------------------------------------------
# Input aliases: old ProSafe-ML / backend names -> V2 names.
# `gas_ppm` maps to `gas` for compatibility only; the V2 value is NOT ppm.
# Baseline aliases are accepted on RAW input (they configure the worker's
# baseline) but are never model features.
# ---------------------------------------------------------------------------
INPUT_ALIASES: Final[dict[str, str]] = {
    # old ML service (ProSafe-ML/src/utils.py FEATURE_COLUMNS)
    "ambient_temp_c": "ambient_temperature",
    "gas_ppm": "gas",
    "noise_db": "noise",
    "body_temp_c": "body_temperature",
    "heart_rate_bpm": "heart_rate",
    "baseline_hr_bpm": "baseline_hr",
    "baseline_body_temp_c": "baseline_body_temperature",
    # backend raw packet names (ProSafe-Web/backend validationService.js)
    "ambientTemp": "ambient_temperature",
    "uv": "uv_index",
    "bodyTemp": "body_temperature",
    "heartRate": "heart_rate",
    "baselineHeartRate": "baseline_hr",
    "baselineBodyTemperature": "baseline_body_temperature",
    "workerId": "worker_id",
    "helmetId": "helmet_id",
}


def normalize_keys(payload: dict) -> dict:
    """Return a copy with alias keys renamed to V2 names.

    If both an alias and its V2 name are present, the V2 name wins (explicit
    beats legacy), so a client can migrate field by field.
    """
    out: dict = {}
    for k, v in payload.items():
        target = INPUT_ALIASES.get(k, k)
        if target != k and target in payload:
            continue
        out[target] = v
    return out


# ---------------------------------------------------------------------------
# Loading + validation
# ---------------------------------------------------------------------------
class UncertainLabelError(RuntimeError):
    """Raised when an ML-ready file contains a label outside Safe/Warning/Critical.

    UNCERTAIN rows belong to the data-quality gate, not the safety classifier,
    so training must stop and the cause must be investigated.
    """


def _read_ml_ready(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")
    df = pd.read_csv(path)
    required = [WORKER_COLUMN, TIMESTAMP_COLUMN, TARGET_COLUMN] + EXTENDED_FEATURE_COLUMNS
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"{path.name} is missing required columns: {missing}")
    unexpected = sorted(set(df[TARGET_COLUMN].dropna().unique()) - set(RISK_CLASSES))
    if unexpected or df[TARGET_COLUMN].isna().any():
        raise UncertainLabelError(
            f"{path.name}: risk_level contains {unexpected or ['<null>']} -- only "
            f"{RISK_CLASSES} are valid classifier targets. UNCERTAIN rows must be "
            f"handled by the preprocessing quality gate, not trained as a class."
        )
    # Minute-resolution timestamps ("7/21/2026 9:03"); within-minute order is
    # the file's row order (1 Hz), which every temporal feature already encodes.
    df["_ts_minute"] = pd.to_datetime(df[TIMESTAMP_COLUMN], format="%m/%d/%Y %H:%M")
    df["_source_file"] = path.name
    return df


def load_development_data() -> pd.DataFrame:
    """Synthetic S_001..S_004 + real W_001. Never contains W_002."""
    df = pd.concat([_read_ml_ready(SYNTHETIC_DATA_PATH), _read_ml_ready(W001_DATA_PATH)], ignore_index=True)
    if EXTERNAL_TEST_WORKER in set(df[WORKER_COLUMN]):
        raise RuntimeError("W_002 leaked into the development data")
    return df


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_frozen_config() -> dict:
    if not FROZEN_CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"{FROZEN_CONFIG_PATH} not found (it is written by archive/source_history/train_models.py): "
            "the model configuration must be frozen before W_002 may be evaluated."
        )
    return json.loads(FROZEN_CONFIG_PATH.read_text(encoding="utf-8"))


def load_external_test_data() -> pd.DataFrame:
    """W_002 -- only after the configuration is frozen."""
    cfg = load_frozen_config()
    if not cfg.get("frozen_before_external_test", False):
        raise RuntimeError("Frozen config does not certify it was frozen before external testing")
    return _read_ml_ready(W002_DATA_PATH)


def external_test_structure_inventory() -> tuple[dict, list[dict]]:
    """Structure-only inventory of W_002 (rows, nulls, duplicates, labels).

    The brief requires verifying every dataset's structure and labels before
    training. This returns counts only -- never feature values or
    distributions -- so it cannot inform any modelling or preprocessing choice.
    """
    df = _read_ml_ready(W002_DATA_PATH)
    return dataset_inventory(df, W002_DATA_PATH.name), session_coverage(df)


def session_coverage(df: pd.DataFrame) -> list[dict]:
    """INFERRED data-quality coverage per worker session.

    No audit file is available, so UNCERTAIN rows are inferred from the
    timeline: the stream is 1 Hz, every second of a session that has no
    ML-ready row was dropped by the offline quality gate. The first session of
    a day starts 180 s before its first ML-ready row (the offline warm-up:
    every such session's first kept row is exactly hh:mm:00 + 180 s); a later
    session starts at its first minute stamp. A final partial minute is taken
    as the session end.
    """
    out = []
    for wid, g in df.groupby(WORKER_COLUMN, sort=False):
        ts = g["_ts_minute"]
        sess = (ts.diff().dt.total_seconds().fillna(0) > 600).cumsum()
        for k, s in g.groupby(sess):
            per_min = s.groupby("_ts_minute").size()
            span_min = int((per_min.index[-1] - per_min.index[0]).total_seconds() // 60) + 1
            warmup = 180 if k == 0 else 60 - int(per_min.iloc[0])
            expected = span_min * 60 - (60 - int(per_min.iloc[-1])) + (180 if k == 0 else 0)
            kept = int(len(s))
            removed = expected - kept
            out.append({
                "worker_id": wid, "session": int(k) + 1,
                "session_start_inferred": str(per_min.index[0] - pd.Timedelta(seconds=180 if k == 0 else 0)),
                "expected_observations_1hz": expected,
                "ml_ready_observations_valid_or_imputed": kept,
                "uncertain_observations_inferred": removed,
                "of_which_session_start_warmup": warmup,
                "of_which_mid_session": removed - warmup,
                "uncertain_pct": round(100 * removed / expected, 2),
            })
    return out


def dataset_inventory(df: pd.DataFrame, name: str) -> dict:
    """Structure report (rows, columns, workers, timestamps, nulls, dups, classes); used by the archived eda.py."""
    cols = [c for c in df.columns if not c.startswith("_")]
    body = df[cols]
    return {
        "dataset": name,
        "rows": int(len(body)),
        "columns": int(len(cols)),
        "workers": {w: int(n) for w, n in body[WORKER_COLUMN].value_counts().sort_index().items()},
        "timestamp_first": str(df["_ts_minute"].min()),
        "timestamp_last": str(df["_ts_minute"].max()),
        "timestamp_resolution": "minute (seconds not stored; rows are 1 Hz in file order)",
        "distinct_minute_timestamps": int(df["_ts_minute"].nunique()),
        "null_cells_total": int(body.isna().sum().sum()),
        "null_cells_by_column": {c: int(n) for c, n in body.isna().sum().items() if n},
        "duplicate_rows": int(body.duplicated().sum()),
        "duplicate_worker_timestamp_pairs": int(body.duplicated([WORKER_COLUMN, TIMESTAMP_COLUMN]).sum()),
        "risk_level_unique": sorted(body[TARGET_COLUMN].unique().tolist(), key=RISK_CLASSES.index),
        "class_distribution": {c: int((body[TARGET_COLUMN] == c).sum()) for c in RISK_CLASSES},
        "raw_baseline_columns_present": [c for c in ("baseline_hr", "baseline_body_temperature") if c in body.columns],
        "forbidden_columns_present": [c for c in cols if is_forbidden_predictor(c) and c not in (WORKER_COLUMN, TIMESTAMP_COLUMN, TARGET_COLUMN)],
    }
