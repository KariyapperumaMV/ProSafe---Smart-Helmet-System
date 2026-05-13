"""
Inference for the Worker Safety classifier.

Loads the saved artifacts (best model, scaler, label encoder, metadata),
applies the correct preprocessing automatically, and returns a human-readable
risk level: "Safe" / "Warning" / "Critical".

Run from project root for a demo on 3 sample readings (Safe, Warning, Critical):
    python src/predict.py
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import joblib
import pandas as pd

from utils import (
    ALL_MODELS_META_PATH,
    BEST_MODEL_META_PATH,
    BEST_MODEL_PATH,
    FEATURE_COLUMNS,
    LABEL_ENCODER_PATH,
    SCALER_PATH,
)


@dataclass
class SafetyPredictor:
    """Bundles the model + scaler + label encoder behind one predict method.

    Build once at process start (or app startup in a Flask/FastAPI service)
    and reuse — joblib loads are not free, so don't do them per-request.
    """
    model: Any
    scaler: Any
    label_encoder: Any
    use_scaled: bool
    model_name: str

    @classmethod
    def load(cls) -> "SafetyPredictor":
        """Load all artifacts from disk; raises FileNotFoundError with guidance."""
        for path in (
            BEST_MODEL_PATH,
            SCALER_PATH,
            LABEL_ENCODER_PATH,
            BEST_MODEL_META_PATH,
        ):
            if not path.exists():
                raise FileNotFoundError(
                    f"Required artifact not found: {path}\n"
                    f"Run `python src/train_models.py` first to generate it."
                )

        meta = joblib.load(BEST_MODEL_META_PATH)
        return cls(
            model=joblib.load(BEST_MODEL_PATH),
            scaler=joblib.load(SCALER_PATH),
            label_encoder=joblib.load(LABEL_ENCODER_PATH),
            use_scaled=meta["use_scaled"],
            model_name=meta["model_name"],
        )

    @classmethod
    def load_named(cls, model_name: str) -> "SafetyPredictor":
        """Load a specific algorithm by name (e.g. 'XGBoost', 'SVM').

        Used by the Streamlit UI's model picker. Falls back to a helpful error
        if the model name isn't in the registry, listing what is available.
        """
        if not ALL_MODELS_META_PATH.exists():
            raise FileNotFoundError(
                f"Model registry not found at {ALL_MODELS_META_PATH}.\n"
                f"Run `python src/train_models.py` to generate it."
            )

        registry = joblib.load(ALL_MODELS_META_PATH)
        if model_name not in registry:
            raise KeyError(
                f"Unknown model '{model_name}'. Available: {list(registry)}"
            )

        entry = registry[model_name]
        return cls(
            model=joblib.load(entry["path"]),
            scaler=joblib.load(SCALER_PATH),
            label_encoder=joblib.load(LABEL_ENCODER_PATH),
            use_scaled=entry["use_scaled"],
            model_name=model_name,
        )

    @staticmethod
    def list_available_models() -> dict[str, dict]:
        """Return the model registry — name -> {path, use_scaled, metrics}."""
        if not ALL_MODELS_META_PATH.exists():
            return {}
        return joblib.load(ALL_MODELS_META_PATH)

    def predict_risk(self, sensor_data: dict) -> str:
        """Predict risk level from a single sensor reading.

        Args:
            sensor_data: dict containing all 10 feature keys (see FEATURE_COLUMNS).
                Extra keys are ignored. Missing keys raise KeyError listing them.

        Returns:
            One of "Safe", "Warning", "Critical".
        """
        missing = [c for c in FEATURE_COLUMNS if c not in sensor_data]
        if missing:
            raise KeyError(f"Missing required feature(s): {missing}")

        # Build a 1-row DataFrame in the canonical column order. Using a
        # DataFrame (rather than np.array) preserves feature names, which keeps
        # sklearn's "feature names should match" warning quiet.
        row = pd.DataFrame([{c: sensor_data[c] for c in FEATURE_COLUMNS}])

        # Apply scaling only if the winning model required it during training.
        X = self.scaler.transform(row) if self.use_scaled else row

        pred_int = self.model.predict(X)[0]
        return str(self.label_encoder.inverse_transform([pred_int])[0])

    def predict_with_confidence(self, sensor_data: dict) -> dict:
        """Like predict_risk, but also returns per-class probabilities.

        Useful for a backend API that wants to show confidence to the user
        or apply a custom decision threshold (e.g., escalate any Critical
        probability > 20% even if Warning is the top class).
        """
        missing = [c for c in FEATURE_COLUMNS if c not in sensor_data]
        if missing:
            raise KeyError(f"Missing required feature(s): {missing}")

        row = pd.DataFrame([{c: sensor_data[c] for c in FEATURE_COLUMNS}])
        X = self.scaler.transform(row) if self.use_scaled else row

        label = str(self.label_encoder.inverse_transform(self.model.predict(X))[0])

        # SVC(probability=False) doesn't expose predict_proba; degrade gracefully
        probs: dict[str, float] = {}
        if hasattr(self.model, "predict_proba"):
            raw = self.model.predict_proba(X)[0]
            probs = {
                str(cls): float(p)
                for cls, p in zip(self.label_encoder.classes_, raw)
            }

        return {"risk_level": label, "probabilities": probs}


def _demo() -> None:
    """Run three example predictions, one per expected risk level."""
    predictor = SafetyPredictor.load()
    print(f"Loaded model: {predictor.model_name} (scaling={'on' if predictor.use_scaled else 'off'})\n")

    examples = {
        "Safe — calm office-like conditions": {
            "ambient_temp_c": 24.0,
            "uv_index": 2.0,
            "gas_ppm": 80.0,
            "noise_db": 65.0,
            "body_temp_c": 36.6,
            "heart_rate_bpm": 78,
            "baseline_hr_bpm": 75,
            "baseline_body_temp_c": 36.7,
            "hr_deviation_pct": ((78 - 75) / 75) * 100,
            "body_temp_deviation_pct": ((36.6 - 36.7) / 36.7) * 100,
        },
        "Warning — moderately stressful site": {
            "ambient_temp_c": 31.0,
            "uv_index": 6.0,
            "gas_ppm": 220.0,
            "noise_db": 83.0,
            "body_temp_c": 37.6,
            "heart_rate_bpm": 96,
            "baseline_hr_bpm": 75,
            "baseline_body_temp_c": 36.8,
            "hr_deviation_pct": ((96 - 75) / 75) * 100,
            "body_temp_deviation_pct": ((37.6 - 36.8) / 36.8) * 100,
        },
        "Critical — heat-stress + toxic gas": {
            "ambient_temp_c": 38.5,
            "uv_index": 9.2,
            "gas_ppm": 350.0,
            "noise_db": 88.0,
            "body_temp_c": 39.1,
            "heart_rate_bpm": 115,
            "baseline_hr_bpm": 75,
            "baseline_body_temp_c": 36.8,
            "hr_deviation_pct": ((115 - 75) / 75) * 100,
            "body_temp_deviation_pct": ((39.1 - 36.8) / 36.8) * 100,
        },
    }

    for label, reading in examples.items():
        result = predictor.predict_with_confidence(reading)
        print(f"--- {label} ---")
        print(f"  Predicted: {result['risk_level']}")
        if result["probabilities"]:
            probs = ", ".join(
                f"{cls}={p:.2%}" for cls, p in result["probabilities"].items()
            )
            print(f"  Probabilities: {probs}")
        print()


if __name__ == "__main__":
    _demo()
