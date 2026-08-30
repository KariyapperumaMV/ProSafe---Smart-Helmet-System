"""
Minimal HTTP wrapper around SafetyPredictor so the Node backend has a real
POST /predict endpoint to call. Does not change how the model is trained or
loaded (still src/predict.py + the .pkl artifacts) — this only exposes it.

Run from project root:
    pip install -r requirements.txt
    python serve.py

Listens on PORT (default 8000), matching ML_SERVICE_URL in the backend's
config.env.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from flask import Flask, jsonify, request

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))

from predict import SafetyPredictor  # noqa: E402
from utils import FEATURE_COLUMNS  # noqa: E402

app = Flask(__name__)

# Loaded once at process start, per SafetyPredictor's own guidance — joblib
# loads are not free, so this must not happen per-request.
predictor = SafetyPredictor.load()


@app.get("/health")
def health():
    return jsonify({"status": "ok", "model": predictor.model_name})


@app.post("/predict")
def predict():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"message": "Request body must be a JSON object"}), 400

    missing = [c for c in FEATURE_COLUMNS if c not in payload]
    if missing:
        return jsonify({"message": f"Missing required feature(s): {missing}"}), 400

    try:
        sensor_data = {c: float(payload[c]) for c in FEATURE_COLUMNS}
    except (TypeError, ValueError):
        return jsonify({"message": "All feature values must be numeric"}), 400

    result = predictor.predict_with_confidence(sensor_data)

    # Normalize to the backend's contract: uppercase SAFE/WARNING/CRITICAL.
    predicted_class = result["risk_level"].upper()
    probabilities = {k.upper(): v for k, v in result["probabilities"].items()}

    return jsonify({"predicted_class": predicted_class, "probabilities": probabilities})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port)
