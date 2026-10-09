"""
V2 SafetyPredictor -- Component B inference on MODEL-READY features only.

Public surface kept from the old ProSafe-ML predictor:
    SafetyPredictor.load()
    SafetyPredictor.load_named(name)
    SafetyPredictor.list_available_models()
    SafetyPredictor.predict_risk(features)            -> "Safe" | "Warning" | "Critical"
    SafetyPredictor.predict_with_confidence(features) -> {"risk_level", "probabilities"}

What changed (deliberately, not for naming compatibility):
* the feature contract is the frozen V2 feature list (CORE or EXTENDED), read
  from best_model_meta.pkl -- not the old 10 columns with raw baselines;
* the predictor never returns UNCERTAIN and the LabelEncoder holds only the
  three risk classes. A feature dict that is not model-ready raises
  NotModelReadyError; deciding UNCERTAIN is the job of the preprocessing
  gate / ProSafeInferencePipeline, which must not call this class then;
* deferrable long-window features may be None/NaN (session warm-up), exactly
  as in the training data; every other feature must be a finite number.

Run from the project root for a demo:
    python src/predict.py
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Optional

import joblib
import numpy as np
import pandas as pd

from utils import (
    ALL_MODELS_META_PATH,
    BEST_MODEL_META_PATH,
    BEST_MODEL_PATH,
    DEFERRABLE_FEATURES,
    LABEL_ENCODER_PATH,
    MODELS_DIR,
    RISK_CLASSES,
    SCALER_PATH,
    normalize_keys,
)


class NotModelReadyError(ValueError):
    """Input is not a complete model-ready feature vector (required feature missing/NaN)."""

    def __init__(self, missing: list[str]):
        super().__init__(f"Not model-ready; required feature(s) missing or NaN: {missing}")
        self.missing = missing


def _is_missing(v: Any) -> bool:
    if v is None:
        return True
    try:
        return math.isnan(float(v))
    except (TypeError, ValueError):
        return False


@dataclass
class SafetyPredictor:
    """Bundles model + scaler + label encoder + V2 feature contract.

    Build once at process start and reuse (joblib loads are not free).
    """
    model: Any
    scaler: Any
    label_encoder: Any
    use_scaled: bool
    model_name: str
    feature_columns: list[str]
    meta: dict = field(default_factory=dict)

    # ------------------------------------------------------------- loading
    @classmethod
    def load(cls) -> "SafetyPredictor":
        for path in (BEST_MODEL_PATH, LABEL_ENCODER_PATH, BEST_MODEL_META_PATH):
            if not path.exists():
                raise FileNotFoundError(f"Required artifact not found: {path}\nThese are written by src/promote_model.py.")
        meta = joblib.load(BEST_MODEL_META_PATH)
        return cls(
            model=joblib.load(BEST_MODEL_PATH),
            scaler=cls._scaler_if_needed(meta["use_scaled"]),
            label_encoder=cls._checked_encoder(),
            use_scaled=meta["use_scaled"],
            model_name=meta["model_name"],
            feature_columns=list(meta["feature_columns"]),
            meta=meta,
        )

    @classmethod
    def load_named(cls, model_name: str) -> "SafetyPredictor":
        registry = cls.list_available_models()
        if not registry:
            raise FileNotFoundError(f"Model registry not found at {ALL_MODELS_META_PATH}. It is written by src/promote_model.py.")
        if model_name not in registry:
            raise KeyError(f"Unknown model '{model_name}'. Available: {list(registry)}")
        entry = registry[model_name]
        best_meta = joblib.load(BEST_MODEL_META_PATH) if BEST_MODEL_META_PATH.exists() else {}
        return cls(
            model=joblib.load(MODELS_DIR / entry["path"]),
            scaler=cls._scaler_if_needed(entry["use_scaled"]),
            label_encoder=cls._checked_encoder(),
            use_scaled=entry["use_scaled"],
            model_name=model_name,
            feature_columns=list(entry["feature_columns"]),
            meta={**best_meta, **entry, "model_name": model_name},
        )

    @staticmethod
    def list_available_models() -> dict[str, dict]:
        """Registry: name -> {path, use_scaled, feature_set, feature_columns, hyperparameters, metrics, is_best}."""
        if not ALL_MODELS_META_PATH.exists():
            return {}
        return joblib.load(ALL_MODELS_META_PATH)

    @staticmethod
    def _scaler_if_needed(use_scaled: bool):
        """Only a scaled model needs scaler.pkl; the promoted XGBoost model has use_scaled=False and no scaler."""
        if not use_scaled:
            return None
        if not SCALER_PATH.exists():
            raise FileNotFoundError(f"Model metadata says use_scaled=True but {SCALER_PATH} is missing")
        return joblib.load(SCALER_PATH)

    @staticmethod
    def _checked_encoder():
        le = joblib.load(LABEL_ENCODER_PATH)
        if sorted(le.classes_.tolist()) != sorted(RISK_CLASSES):
            raise RuntimeError(f"label_encoder.pkl must contain exactly {RISK_CLASSES}, found {le.classes_.tolist()}")
        return le

    # ---------------------------------------------------------- inference
    @property
    def feature_set(self) -> str:
        return self.meta.get("feature_set", "?")

    def missing_required(self, features: dict) -> list[str]:
        f = normalize_keys(features)
        return [c for c in self.feature_columns if c not in DEFERRABLE_FEATURES and _is_missing(f.get(c))]

    def _frame(self, features: dict) -> pd.DataFrame:
        f = normalize_keys(features)
        absent = [c for c in self.feature_columns if c not in f]
        if absent:
            raise KeyError(f"Missing required feature key(s): {absent}")
        missing = self.missing_required(f)
        if missing:
            raise NotModelReadyError(missing)
        row = {c: (np.nan if _is_missing(f[c]) else float(f[c])) for c in self.feature_columns}
        return pd.DataFrame([row], columns=self.feature_columns)

    def _X(self, frame: pd.DataFrame):
        return self.scaler.transform(frame) if self.use_scaled else frame

    def predict_risk(self, features: dict) -> str:
        X = self._X(self._frame(features))
        return str(self.label_encoder.inverse_transform(self.model.predict(X).astype(int))[0])

    def predict_with_confidence(self, features: dict) -> dict:
        X = self._X(self._frame(features))
        label = str(self.label_encoder.inverse_transform(self.model.predict(X).astype(int))[0])
        probs: dict[str, float] = {}
        if hasattr(self.model, "predict_proba"):
            try:
                raw = self.model.predict_proba(X)[0]
                probs = {str(c): float(p) for c, p in zip(self.label_encoder.classes_, raw)}
                probs = {c: probs[c] for c in RISK_CLASSES}
            except AttributeError:  # SVC trained without probability estimates
                probs = {}
        return {"risk_level": label, "probabilities": probs}

    def predict_frame(self, frame: pd.DataFrame) -> np.ndarray:
        """Batch prediction for evaluation (rows must already be model-ready)."""
        X = self._X(frame[self.feature_columns])
        return self.label_encoder.inverse_transform(self.model.predict(X).astype(int))

    def predict_proba_frame(self, frame: pd.DataFrame) -> Optional[pd.DataFrame]:
        if not hasattr(self.model, "predict_proba"):
            return None
        X = self._X(frame[self.feature_columns])
        p = self.model.predict_proba(X)
        return pd.DataFrame(p, columns=self.label_encoder.classes_)[RISK_CLASSES]


def _demo() -> None:
    from utils import load_development_data

    predictor = SafetyPredictor.load()
    print(f"Loaded {predictor.model_name} | feature set {predictor.feature_set} ({len(predictor.feature_columns)} features) "
          f"| scaling={'on' if predictor.use_scaled else 'off'}\n")
    dev = load_development_data()
    for cls in RISK_CLASSES:
        row = dev[(dev["risk_level"] == cls) & dev[predictor.feature_columns].notna().all(axis=1)].iloc[len(dev) // 50 % 97]
        res = predictor.predict_with_confidence(row[predictor.feature_columns].to_dict())
        probs = ", ".join(f"{k}={v:.1%}" for k, v in res["probabilities"].items())
        print(f"--- development row {row.name} ({row['worker_id']}), offline label {cls} ---")
        print(f"  Predicted: {res['risk_level']}   [{probs}]\n")


if __name__ == "__main__":
    _demo()
