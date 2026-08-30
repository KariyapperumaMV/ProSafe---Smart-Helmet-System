"""
Shared helpers for the Worker Safety ML project.

Centralizes:
- Project paths (resolved from this file, so scripts work from any CWD)
- The canonical feature list and target column
- Dataset loading with friendly errors
- A reusable label map for plots

Importing from utils keeps train_models.py, eda.py, and predict.py in sync —
if a column is renamed, this is the only place to edit.
"""

from __future__ import annotations

from pathlib import Path
from typing import Final

import pandas as pd

# ---------------------------------------------------------------------------
# Paths — resolved from this file so scripts run correctly from any CWD
# ---------------------------------------------------------------------------
# utils.py lives in <root>/src/, so parents[1] is the project root.
PROJECT_ROOT: Final[Path] = Path(__file__).resolve().parents[1]
DATA_DIR: Final[Path] = PROJECT_ROOT / "data"
MODELS_DIR: Final[Path] = PROJECT_ROOT / "models"
OUTPUTS_DIR: Final[Path] = PROJECT_ROOT / "outputs"
EDA_OUTPUTS_DIR: Final[Path] = OUTPUTS_DIR / "eda"

DATASET_PATH: Final[Path] = DATA_DIR / "worker_safety_dataset.csv"

# Artifact paths — single source of truth for save/load
BEST_MODEL_PATH: Final[Path] = MODELS_DIR / "best_model.pkl"
SCALER_PATH: Final[Path] = MODELS_DIR / "scaler.pkl"
LABEL_ENCODER_PATH: Final[Path] = MODELS_DIR / "label_encoder.pkl"
# Records which model won, so predict.py knows whether to apply the scaler
BEST_MODEL_META_PATH: Final[Path] = MODELS_DIR / "best_model_meta.pkl"
# Records ALL trained models so the Streamlit UI can switch between them.
# Schema: {model_name: {"path": Path, "use_scaled": bool, "metrics": dict}}
ALL_MODELS_META_PATH: Final[Path] = MODELS_DIR / "all_models_meta.pkl"


def model_slug(name: str) -> str:
    """Turn 'Random Forest' into 'random_forest' for filenames."""
    return name.lower().replace(" ", "_")

# ---------------------------------------------------------------------------
# Schema — the 10 features fed to the model
# ---------------------------------------------------------------------------
# worker_id and timestamp are identifiers, NOT predictive features.
# Order is fixed: predict.py builds a DataFrame in this exact order so the
# scaler/model never sees columns in a shuffled order.
FEATURE_COLUMNS: Final[list[str]] = [
    "ambient_temp_c",
    "uv_index",
    "gas_ppm",
    "noise_db",
    "body_temp_c",
    "heart_rate_bpm",
    "baseline_hr_bpm",
    "baseline_body_temp_c",
    "hr_deviation_pct",
    "body_temp_deviation_pct",
]
TARGET_COLUMN: Final[str] = "risk_level"

# Fixed display order for plots — keeps Safe→Warning→Critical reading naturally
# regardless of LabelEncoder's alphabetical ordering (Critical, Safe, Warning).
RISK_LEVELS_DISPLAY_ORDER: Final[list[str]] = ["Safe", "Warning", "Critical"]

RANDOM_STATE: Final[int] = 42


def ensure_dirs() -> None:
    """Create output directories if missing. Safe to call repeatedly."""
    for d in (MODELS_DIR, OUTPUTS_DIR, EDA_OUTPUTS_DIR):
        d.mkdir(parents=True, exist_ok=True)


def load_dataset(path: Path = DATASET_PATH) -> pd.DataFrame:
    """Load the worker safety CSV with a helpful error if it's missing.

    Validates that all expected feature columns and the target are present —
    catches typos and schema drift early rather than mid-training.
    """
    if not path.exists():
        raise FileNotFoundError(
            f"Dataset not found at {path}.\n"
            f"Place worker_safety_dataset.csv in the data/ folder."
        )

    df = pd.read_csv(path)

    missing = [c for c in FEATURE_COLUMNS + [TARGET_COLUMN] if c not in df.columns]
    if missing:
        raise ValueError(f"Dataset is missing required columns: {missing}")

    return df


def split_features_target(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """Return (X, y) using the canonical feature list and target column."""
    return df[FEATURE_COLUMNS].copy(), df[TARGET_COLUMN].copy()
