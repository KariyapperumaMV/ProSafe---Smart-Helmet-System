"""
ProSafe ML V2 HTTP service: the decision service the ProSafe backend calls.
(The old ProSafe-ML service on port 8000 is kept but no longer used by the backend.)

Endpoints
---------
GET  /health        model identity + verification. 200 {"status": "ok", ...} only when the loaded
                    model is the expected production model (XGBoost, EXTENDED, 38 features in the
                    frozen order, unscaled); otherwise 503 {"status": "unhealthy", "problems": [...]}
                    and both predict endpoints answer 503 too.
GET  /schema        the V2 feature contract (order, aliases, deferrable features, outputs)
POST /predict/raw   PRODUCTION path. Body = one raw 1 Hz reading or {"readings": [...]} (a batched
                    upload, processed strictly in the given order). Each reading:
                      {"worker_id", "timestamp" (ISO, site-local offset), "helmet_id",
                       "heart_rate", "body_temperature", "ambient_temperature", "uv_index", "gas", "noise",
                       "baseline_hr", "baseline_body_temperature"}
                    Sensor values may be null (missing channel). Baselines are the worker's stored
                    profile values (context only, never model features); null -> UNCERTAIN
                    BASELINE_UNAVAILABLE. A changed baseline restarts only that worker's session.
                    Per-worker streaming state (windows, counters, session gas baseline) lives in this
                    process; a restart re-enters warm-up (UNCERTAIN), never a guessed SAFE.
                      200 {"results": [...one per reading, same order...], "latest": {...}, model identity}
POST /predict       MODEL-READY path (testing / offline use). Body = one V2 feature vector.
                      200 {"predicted_class": "SAFE|WARNING|CRITICAL", "probabilities": {...}}
                      200 {"predicted_class": "UNCERTAIN", ...} when a required feature is null
                      400 when keys are absent or values are non-numeric (contract violation)

Environment
-----------
PORT                              default 8001
PROSAFE_ENABLE_RAW_ENDPOINT       default 1 (set 0 to disable /predict/raw -> 501)
PROSAFE_EXPECTED_MODEL            default XGBoost
PROSAFE_EXPECTED_FEATURE_SET      default EXTENDED
PROSAFE_MAX_BATCH                 default 600 readings per request

Run from the project root:
    python serve.py
"""

from __future__ import annotations

import os
import sys
import threading
from pathlib import Path

from flask import Flask, jsonify, request

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))

from inference_pipeline import ProSafeInferencePipeline  # noqa: E402
from predict import SafetyPredictor  # noqa: E402
from streaming_preprocessor import WorkerProfile  # noqa: E402
from utils import (  # noqa: E402
    DEFERRABLE_FEATURES, EXTENDED_FEATURE_COLUMNS, INPUT_ALIASES, RISK_CLASSES, SYSTEM_OUTPUTS, normalize_keys,
)

RAW_ENABLED = os.environ.get("PROSAFE_ENABLE_RAW_ENDPOINT", "1") != "0"
EXPECTED_MODEL = os.environ.get("PROSAFE_EXPECTED_MODEL", "XGBoost")
EXPECTED_FEATURE_SET = os.environ.get("PROSAFE_EXPECTED_FEATURE_SET", "EXTENDED")
MAX_BATCH = int(os.environ.get("PROSAFE_MAX_BATCH", "600"))
BASELINE_KEYS = ("baseline_hr", "baseline_body_temperature")


def verify_predictor(p: SafetyPredictor) -> list[str]:
    """Refuse to serve anything but the promoted production model."""
    problems = []
    if p.model_name != EXPECTED_MODEL:
        problems.append(f"model_name is {p.model_name!r}, expected {EXPECTED_MODEL!r}")
    if p.feature_set != EXPECTED_FEATURE_SET:
        problems.append(f"feature_set is {p.feature_set!r}, expected {EXPECTED_FEATURE_SET!r}")
    if EXPECTED_FEATURE_SET == "EXTENDED" and list(p.feature_columns) != list(EXTENDED_FEATURE_COLUMNS):
        problems.append(f"feature_columns differ from the 38 frozen EXTENDED columns (got {len(p.feature_columns)})")
    if p.use_scaled != (p.scaler is not None):
        problems.append(f"use_scaled={p.use_scaled} but scaler is {'present' if p.scaler is not None else 'absent'}")
    n_model = getattr(p.model, "n_features_in_", None)
    if n_model is not None and n_model != len(p.feature_columns):
        problems.append(f"model expects {n_model} features, metadata lists {len(p.feature_columns)}")
    return problems


def _load():
    try:
        p = SafetyPredictor.load()
    except Exception as exc:  # missing/corrupt artifacts -> report unhealthy instead of serving
        return None, None, [f"model failed to load: {exc}"]
    return p, ProSafeInferencePipeline(p), verify_predictor(p)


app = Flask(__name__)
predictor, pipeline, PROBLEMS = _load()      # loaded once at start-up
LOCK = threading.Lock()                     # streaming state is per-process and not thread-safe
if PROBLEMS:
    print("ProSafe ML V2: UNHEALTHY -> " + "; ".join(PROBLEMS), file=sys.stderr, flush=True)


def _identity() -> dict:
    if predictor is None:
        return {"model_name": None, "feature_set": None, "feature_count": 0, "model_version": None}
    return {"model_name": predictor.model_name, "feature_set": predictor.feature_set,
            "feature_count": len(predictor.feature_columns),
            "model_version": predictor.meta.get("model_version", predictor.meta.get("version"))}


def _unhealthy():
    return jsonify({"message": "ML service is not serving the expected model", "problems": PROBLEMS,
                    **_identity()}), 503


@app.get("/health")
def health():
    body = {"status": "unhealthy" if PROBLEMS else "ok", "service": "prosafe-ml-v2", **_identity(),
            "n_features": _identity()["feature_count"], "use_scaled": getattr(predictor, "use_scaled", None),
            "raw_endpoint_enabled": RAW_ENABLED, "problems": PROBLEMS}
    return jsonify(body), (503 if PROBLEMS else 200)


@app.get("/schema")
def schema():
    if predictor is None:
        return _unhealthy()
    return jsonify({
        "feature_columns": predictor.feature_columns,
        "deferrable_features_nullable": [c for c in DEFERRABLE_FEATURES if c in predictor.feature_columns],
        "input_aliases": INPUT_ALIASES,
        "classifier_classes": [c.upper() for c in RISK_CLASSES],
        "system_outputs": SYSTEM_OUTPUTS,
        **_identity(),
        "note": "UNCERTAIN is produced by the data-quality gate, never by the classifier. "
                "'gas' is in the V2 dataset's sensor units, not calibrated ppm. "
                "Baselines are worker context for deviations, never model features.",
    })


@app.post("/predict")
def predict():
    if PROBLEMS:
        return _unhealthy()
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"message": "Request body must be a JSON object"}), 400
    try:
        with LOCK:
            return jsonify(pipeline.predict_model_ready(payload))
    except KeyError as exc:
        return jsonify({"message": str(exc.args[0]), "expected_features": predictor.feature_columns}), 400
    except ValueError as exc:
        return jsonify({"message": str(exc)}), 400


def _register_baseline(reading: dict) -> None:
    """Refresh the worker profile from the reading's baseline context (null clears it)."""
    p = normalize_keys(reading)
    wid = p.get("worker_id")
    if not isinstance(wid, str) or not wid or not any(k in p for k in BASELINE_KEYS):
        return

    def num(v):
        return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and v > 0 else None

    existing = pipeline.preprocessor.get_profile(wid)
    gas_bl = existing.gas_baseline if existing else None
    pipeline.preprocessor.register_worker(
        WorkerProfile(wid, num(p.get("baseline_hr")), num(p.get("baseline_body_temperature")), gas_bl))


@app.post("/predict/raw")
def predict_raw():
    if not RAW_ENABLED:
        return jsonify({"message": "Raw-stream inference is disabled (PROSAFE_ENABLE_RAW_ENDPOINT=0)."}), 501
    if PROBLEMS:
        return _unhealthy()
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"message": "Request body must be a JSON object"}), 400
    batched = "readings" in payload
    readings = payload["readings"] if batched else [payload]
    if not isinstance(readings, list) or not readings:
        return jsonify({"message": "'readings' must be a non-empty list"}), 400
    if len(readings) > MAX_BATCH:
        return jsonify({"message": f"at most {MAX_BATCH} readings per request"}), 413
    if not all(isinstance(r, dict) for r in readings):
        return jsonify({"message": "each reading must be a JSON object"}), 400
    results = []
    with LOCK:  # one batch at a time, in the received order (no reordering: late samples -> UNCERTAIN)
        for r in readings:
            _register_baseline(r)
            results.append(pipeline.process_raw(r))
    if not batched:
        return jsonify(results[0])
    return jsonify({"results": results, "latest": results[-1], "count": len(results), **_identity()})


if __name__ == "__main__":
    print(f"ProSafe ML V2 serving {_identity()} status={'UNHEALTHY' if PROBLEMS else 'ok'} "
          f"raw_endpoint={'on' if RAW_ENABLED else 'off'}", flush=True)
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8001)), threaded=True)
