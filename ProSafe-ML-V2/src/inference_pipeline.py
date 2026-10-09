"""
ProSafeInferencePipeline -- the complete V2 decision system (prototype).

    raw reading
      -> StreamingPreprocessor (Component A: features + data-quality gate)
      -> UNCERTAIN?  yes -> return UNCERTAIN, the classifier is NOT called
                     no  -> SafetyPredictor (Component B) -> SAFE / WARNING / CRITICAL

System outputs: SAFE, WARNING, CRITICAL, UNCERTAIN.
Classifier outputs: Safe, Warning, Critical only.

Output contract (backwards compatible with the old ML service, which
returned only `predicted_class` + `probabilities`):

    READY      {"predicted_class": "SAFE|WARNING|CRITICAL",
                "probabilities": {"SAFE": p, "WARNING": p, "CRITICAL": p},
                "data_quality": "VALID|IMPUTED", "model_ready": true,
                "model_name", "model_version", "feature_set",
                "derived": {hr_deviation_pct, body_temp_deviation_pct, ...},  # raw path, audit only
                "worker_id", "timestamp", "session_id", "session_elapsed_s", ...}
    UNCERTAIN  {"predicted_class": "UNCERTAIN", "probabilities": {},
                "uncertain_reason": "...", "uncertain_reasons": [...],
                "data_quality": "UNCERTAIN", "model_ready": false,
                "model_name", "model_version", "feature_set", ...}

`probabilities` is always empty for UNCERTAIN: the classifier was not called,
so there is nothing to report and nothing is invented. `derived` repeats a few
already-computed V2 features so the backend can store/display them without
re-implementing any feature formula; it is never fed back into a prediction.
"""

from __future__ import annotations

import numbers
from typing import Optional, Union

from predict import NotModelReadyError, SafetyPredictor
from preprocessing import DEFAULT_CONFIG, PreprocessingConfig, PreprocessResult, RawReading, UncertainReason
from streaming_preprocessor import BaselineProvider, StreamingPreprocessor, WorkerProfile
from utils import SYSTEM_UNCERTAIN, normalize_keys

# V2 features echoed back on a READY raw-path result for storage/analytics only.
DERIVED_AUDIT_FEATURES = (
    "hr_deviation_bpm", "hr_deviation_pct", "body_temp_deviation_c", "body_temp_deviation_pct",
    "gas_ratio_to_baseline", "noise_dose_pct", "noise_critical_exposure_sec", "hr_warning_exposure_sec",
)


def _model_version(predictor) -> Optional[str]:
    meta = getattr(predictor, "meta", None) or {}
    return meta.get("model_version", meta.get("version"))


def _json_number(v):
    return None if v is None or v != v else float(v)  # NaN -> null (JSON has no NaN)


def uncertain_response(reason: str, reasons: Optional[list[str]] = None, **extra) -> dict:
    return {
        "predicted_class": SYSTEM_UNCERTAIN,
        "probabilities": {},
        "uncertain_reason": reason,
        "uncertain_reasons": reasons or [reason],
        "data_quality": "UNCERTAIN",
        "model_ready": False,
        **extra,
    }


def model_response(result: dict, predictor: SafetyPredictor, **extra) -> dict:
    return {
        "predicted_class": result["risk_level"].upper(),
        "probabilities": {k.upper(): v for k, v in result["probabilities"].items()},
        "model_ready": True,
        "model_name": predictor.model_name,
        "feature_set": predictor.feature_set,
        "model_version": _model_version(predictor),
        **extra,
    }


class ProSafeInferencePipeline:
    def __init__(self, predictor: Optional[SafetyPredictor] = None, baseline_provider: BaselineProvider = None,
                 config: PreprocessingConfig = DEFAULT_CONFIG, preprocessor: Optional[StreamingPreprocessor] = None):
        self.predictor = predictor or SafetyPredictor.load()
        self.preprocessor = preprocessor or StreamingPreprocessor(baseline_provider, config)
        self.model_calls = 0  # instrumentation: proves UNCERTAIN never reaches the classifier

    @property
    def model_identity(self) -> dict:
        return {"model_name": self.predictor.model_name, "feature_set": self.predictor.feature_set,
                "model_version": _model_version(self.predictor)}

    # ---------------------------------------------------------------- raw
    def register_worker(self, worker_id: str, baseline_hr: Optional[float], baseline_body_temperature: Optional[float],
                        gas_baseline: Optional[float] = None) -> None:
        self.preprocessor.register_worker(WorkerProfile(worker_id, baseline_hr, baseline_body_temperature, gas_baseline))

    def process_raw(self, reading: Union[dict, RawReading]) -> dict:
        """One raw helmet reading -> system output (also returns the preprocessing status)."""
        pre: PreprocessResult = self.preprocessor.process(reading)
        context = {"worker_id": pre.worker_id, "timestamp": pre.timestamp, "session_id": pre.session_id,
                   "session_elapsed_s": pre.session_elapsed_s}
        if not pre.model_ready:
            return uncertain_response(pre.reason, pre.reasons, **self.model_identity, **context)
        derived = {k: _json_number(pre.features.get(k)) for k in DERIVED_AUDIT_FEATURES}
        return self._classify(pre.features, data_quality=pre.quality.value, imputed_channels=pre.imputed_channels,
                              deferred_features=pre.deferred_features, derived=derived, **context)

    # --------------------------------------------------------- model-ready
    def predict_model_ready(self, features: dict) -> dict:
        """Features already produced by a V2-compatible preprocessor.

        Raises KeyError for absent keys / ValueError for non-numeric values
        (contract violations). A present-but-null REQUIRED feature means the
        caller's input is not model-ready -> UNCERTAIN, model not called.
        """
        f = normalize_keys(features)
        for c in self.predictor.feature_columns:
            if c in f and f[c] is not None and (isinstance(f[c], bool) or not isinstance(f[c], numbers.Real)):
                raise ValueError(f"Feature '{c}' must be numeric or null")
        absent = [c for c in self.predictor.feature_columns if c not in f]
        if absent:
            raise KeyError(f"Missing required feature key(s): {absent}")
        missing = self.predictor.missing_required(f)
        if missing:
            return uncertain_response(UncertainReason.REQUIRED_FEATURES_UNAVAILABLE.value,
                                      missing_features=missing, **self.model_identity)
        return self._classify(f, data_quality="VALID")

    def _classify(self, features: dict, **extra) -> dict:
        try:
            self.model_calls += 1
            result = self.predictor.predict_with_confidence(features)
        except NotModelReadyError as exc:  # defensive: the gate should have caught this
            self.model_calls -= 1
            return uncertain_response(UncertainReason.REQUIRED_FEATURES_UNAVAILABLE.value, missing_features=exc.missing,
                                      **self.model_identity, **extra)
        return model_response(result, self.predictor, **extra)
