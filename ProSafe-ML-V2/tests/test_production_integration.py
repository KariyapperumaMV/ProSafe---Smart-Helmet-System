"""
Integration tests for the promoted production model and the service contract the backend relies on.

    python tests/test_production_integration.py

* ProductionArtifact   promoted files == models/experiments/exp2_xgboost.pkl (same W_002 predictions
                       and probabilities), metadata complete, no scaler needed
* FeatureContract      exactly the 38 EXTENDED features in frozen order, baselines never features,
                       the streaming preprocessor emits exactly that vector
* BaselineLifecycle    null baseline -> UNCERTAIN; mid-session change/clear restarts only that worker
* RawReplayParity      raw W_001 replayed through the streaming preprocessor gives the same production
                       predictions as the offline W_001 feature rows
* HttpContract         /health identity, batch order, out-of-order, baseline handling, response fields

W_002 is read only to prove that the promoted artifact reproduces the experiment artifact's predictions.
Nothing here trains, tunes or selects anything.
"""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

from predict import SafetyPredictor  # noqa: E402
from streaming_preprocessor import StreamingPreprocessor, WorkerProfile  # noqa: E402
from utils import (  # noqa: E402
    BEST_MODEL_META_PATH, EXTENDED_FEATURE_COLUMNS, MODELS_DIR, SCALER_PATH, W002_DATA_PATH, _read_ml_ready,
    is_forbidden_predictor,
)

SOURCE_BUNDLE = MODELS_DIR / "experiments" / "exp2_xgboost.pkl"
T0 = datetime(2026, 7, 21, 9, 0, 0)
BASE = dict(heart_rate=80.0, body_temperature=36.6, ambient_temperature=26.0, uv_index=2.0, gas=8.0, noise=65.0)


def reading(i, worker="W_T", t0=T0, **over):
    return {"worker_id": worker, "timestamp": (t0 + timedelta(seconds=i)).isoformat(), **BASE, **over}


class ProductionArtifact(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.p = SafetyPredictor.load()
        cls.bundle = joblib.load(SOURCE_BUNDLE)
        cls.meta = joblib.load(BEST_MODEL_META_PATH)

    def test_identity(self):
        self.assertEqual((self.p.model_name, self.p.feature_set, len(self.p.feature_columns), self.p.use_scaled),
                         ("XGBoost", "EXTENDED", 38, False))
        self.assertIsNone(self.p.scaler)
        self.assertFalse(SCALER_PATH.exists(), "an unscaled production model must not need scaler.pkl")

    def test_metadata_complete(self):
        for key in ("model_name", "model_version", "feature_set", "feature_columns", "use_scaled", "training_data",
                    "external_test_data", "test_accuracy", "test_macro_f1", "test_critical_recall", "hyperparameters"):
            self.assertIn(key, self.meta)
        self.assertAlmostEqual(self.meta["test_accuracy"], 0.9546, places=4)
        self.assertAlmostEqual(self.meta["test_macro_f1"], 0.6848, places=4)
        self.assertAlmostEqual(self.meta["test_critical_recall"], 0.0885, places=4)
        self.assertEqual(self.meta["hyperparameters"], self.bundle["hyperparameters"])
        self.assertNotIn("W002", " ".join(self.meta["training_data"]))
        self.assertNotIn("W_002", self.meta["trained_on_workers"])

    def test_same_predictions_as_experiment_artifact(self):
        df = _read_ml_ready(W002_DATA_PATH)
        X = df[self.bundle["feature_columns"]]
        src = self.bundle["label_encoder"].inverse_transform(self.bundle["model"].predict(X).astype(int))
        prod = self.p.predict_frame(df)
        np.testing.assert_array_equal(prod, src)
        src_p = self.bundle["model"].predict_proba(X)
        prod_p = self.p.predict_proba_frame(df)[list(self.bundle["label_encoder"].classes_)].to_numpy()
        np.testing.assert_array_equal(prod_p, src_p)
        crit = df["risk_level"].to_numpy() == "Critical"
        self.assertEqual(int((prod[crit] == "Critical").sum()), 23)       # the documented limitation: 23/260
        self.assertEqual(int((prod[crit] == "Safe").sum()), 0)


class FeatureContract(unittest.TestCase):
    def test_exact_ordered_38(self):
        p = SafetyPredictor.load()
        self.assertEqual(list(p.feature_columns), list(EXTENDED_FEATURE_COLUMNS))
        self.assertEqual(len(set(p.feature_columns)), 38)
        self.assertEqual(int(p.model.n_features_in_), 38)
        self.assertEqual(list(p.model.get_booster().feature_names), list(EXTENDED_FEATURE_COLUMNS))

    def test_baselines_are_never_features(self):
        for c in EXTENDED_FEATURE_COLUMNS:
            self.assertFalse(is_forbidden_predictor(c), c)
        for c in ("baseline_hr", "baseline_body_temperature", "baselineHeartRate", "baselineBodyTemperature"):
            self.assertNotIn(c, EXTENDED_FEATURE_COLUMNS)

    def test_streaming_emits_exactly_the_contract(self):
        pre = StreamingPreprocessor({"W_T": WorkerProfile("W_T", 80.0, 36.6)})
        res = [pre.process(reading(i)) for i in range(200)][-1]
        self.assertTrue(res.model_ready)
        self.assertEqual(list(res.features), list(EXTENDED_FEATURE_COLUMNS))


class BaselineLifecycle(unittest.TestCase):
    def test_null_baseline_is_uncertain(self):
        pre = StreamingPreprocessor({"W_T": WorkerProfile("W_T", None, None)})
        out = [pre.process(reading(i)) for i in range(220)]
        self.assertTrue(all(not r.model_ready for r in out))
        self.assertIn("BASELINE_UNAVAILABLE", out[-1].reasons)

    def test_change_restarts_only_that_worker(self):
        pre = StreamingPreprocessor({"W_A": WorkerProfile("W_A", 80.0, 36.6), "W_B": WorkerProfile("W_B", 75.0, 36.4)})
        for i in range(200):
            a, b = pre.process(reading(i, "W_A")), pre.process(reading(i, "W_B"))
        self.assertTrue(a.model_ready and b.model_ready)
        sid_a, sid_b = a.session_id, b.session_id
        pre.register_worker(WorkerProfile("W_A", 90.0, 36.6))             # admin edits W_A's baseline
        a, b = pre.process(reading(200, "W_A")), pre.process(reading(200, "W_B"))
        self.assertNotEqual(a.session_id, sid_a)
        self.assertEqual(pre.get_state("W_A").last_session_end_reason, "BASELINE_CHANGED")
        self.assertFalse(a.model_ready)
        self.assertIn("INSUFFICIENT_HISTORY", a.reasons)                   # warm restart: 20 samples, no 180 s
        self.assertEqual(b.session_id, sid_b)
        self.assertTrue(b.model_ready)
        later = [pre.process(reading(i, "W_A")) for i in range(201, 225)][-1]
        self.assertTrue(later.model_ready)
        self.assertAlmostEqual(later.features["hr_deviation_bpm"], 80.0 - 90.0)

    def test_cleared_baseline_mid_session(self):
        pre = StreamingPreprocessor({"W_T": WorkerProfile("W_T", 80.0, 36.6)})
        for i in range(200):
            r = pre.process(reading(i))
        self.assertTrue(r.model_ready)
        pre.register_worker(WorkerProfile("W_T", None, None))
        r = pre.process(reading(200))
        self.assertFalse(r.model_ready)
        self.assertIn("BASELINE_UNAVAILABLE", r.reasons)

    def test_unchanged_baseline_keeps_session(self):
        pre = StreamingPreprocessor({"W_T": WorkerProfile("W_T", 80.0, 36.6)})
        first = pre.process(reading(0))
        for i in range(1, 200):
            pre.register_worker(WorkerProfile("W_T", 80.0, 36.6))       # re-sent every reading by the backend
            r = pre.process(reading(i))
        self.assertEqual(r.session_id, first.session_id)
        self.assertTrue(r.model_ready)


class RawReplayParity(unittest.TestCase):
    """Online features from raw W_001 readings -> same production predictions as the offline feature rows."""

    def test_w001_replay(self):
        import test_preprocessing_parity as tp
        from utils import load_development_data
        df = load_development_data()
        g = df[df["worker_id"] == "W_001"].reset_index(drop=True).rename(columns={"_ts_minute": "ts_minute"})
        g["session"] = tp._sessions(g)
        rec, _ = tp.exact_parity_replay(g)
        full = rec[rec["pos"] >= 299]          # every look-back window (max 300 s) inside the replayed run
        p = SafetyPredictor.load()
        on = pd.DataFrame({c: full[f"on__{c}"].astype(float).to_numpy() for c in EXTENDED_FEATURE_COLUMNS})
        off = pd.DataFrame({c: full[f"off__{c}"].astype(float).to_numpy() for c in EXTENDED_FEATURE_COLUMNS})
        agree = (p.predict_frame(on) == p.predict_frame(off)).mean()
        print(f"\n  W_001 raw replay: {len(full)} rows, online vs offline prediction agreement {agree:.4%}")
        self.assertGreater(len(full), 1000)
        self.assertGreaterEqual(agree, 0.995)


class HttpContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import serve
        cls.serve = serve
        cls.c = serve.app.test_client()

    def post(self, readings):
        resp = self.c.post("/predict/raw", json={"readings": readings})
        self.assertEqual(resp.status_code, 200, resp.get_json())
        return resp.get_json()

    def test_health_reports_production_model(self):
        h = self.c.get("/health")
        self.assertEqual(h.status_code, 200)
        body = h.get_json()
        self.assertEqual((body["status"], body["model_name"], body["feature_set"], body["feature_count"]),
                         ("ok", "XGBoost", "EXTENDED", 38))
        self.assertTrue(body["model_version"].startswith("prosafe-ml-v2-xgboost-extended-exp2"))
        self.assertTrue(body["raw_endpoint_enabled"])

    def test_wrong_model_is_reported_unhealthy(self):
        class Wrong:
            model_name, feature_set, feature_columns, use_scaled, scaler, model = "Logistic Regression", "CORE", [], True, None, None
        self.assertEqual(len(self.serve.verify_predictor(Wrong())), 4)

    def test_batch_in_order_warmup_then_ready(self):
        rs = [dict(reading(i, "W_HTTP1"), baseline_hr=80, baseline_body_temperature=36.6) for i in range(200)]
        body = self.post(rs)
        res = body["results"]
        self.assertEqual(len(res), 200)
        self.assertEqual([r["session_elapsed_s"] for r in res], [float(i) for i in range(200)])
        self.assertEqual(res[0]["predicted_class"], "UNCERTAIN")
        self.assertEqual(res[0]["uncertain_reason"], "SENSOR_WARMUP")
        self.assertEqual(res[0]["probabilities"], {})
        last = body["latest"]
        self.assertIn(last["predicted_class"], ("SAFE", "WARNING", "CRITICAL"))
        self.assertEqual((last["model_name"], last["feature_set"], last["data_quality"]), ("XGBoost", "EXTENDED", "VALID"))
        self.assertAlmostEqual(sum(last["probabilities"].values()), 1.0, places=5)
        self.assertEqual(set(last["derived"]) >= {"hr_deviation_pct", "body_temp_deviation_pct"}, True)
        self.assertEqual(body["model_name"], "XGBoost")

    def test_out_of_order_inside_a_batch(self):
        rs = [dict(reading(i, "W_HTTP2"), baseline_hr=80, baseline_body_temperature=36.6) for i in (0, 1, 2, 1, 3)]
        res = self.post(rs)["results"]
        self.assertEqual(res[3]["uncertain_reason"], "OUT_OF_ORDER_TIMESTAMP")
        self.assertNotEqual(res[4]["uncertain_reason"], "OUT_OF_ORDER_TIMESTAMP")

    def test_null_baseline_over_http(self):
        rs = [dict(reading(i, "W_HTTP3"), baseline_hr=None, baseline_body_temperature=None) for i in range(200)]
        last = self.post(rs)["latest"]
        self.assertEqual(last["predicted_class"], "UNCERTAIN")
        self.assertIn("BASELINE_UNAVAILABLE", last["uncertain_reasons"])

    def test_baseline_change_over_http(self):
        rs = [dict(reading(i, "W_HTTP4"), baseline_hr=80, baseline_body_temperature=36.6) for i in range(200)]
        before = self.post(rs)["latest"]
        after = self.post([dict(reading(200, "W_HTTP4"), baseline_hr=95, baseline_body_temperature=36.6)])["latest"]
        self.assertNotEqual(before["session_id"], after["session_id"])
        self.assertEqual(after["predicted_class"], "UNCERTAIN")

    def test_missing_channel_passes_through(self):
        rs = [dict(reading(i, "W_HTTP5"), baseline_hr=80, baseline_body_temperature=36.6) for i in range(200)]
        rs += [dict(reading(i, "W_HTTP5", gas=None, noise=None), baseline_hr=80, baseline_body_temperature=36.6)
               for i in range(200, 210)]
        last = self.post(rs)["latest"]
        self.assertEqual(last["predicted_class"], "UNCERTAIN")
        self.assertIn("TOO_MANY_MISSING_SENSORS", last["uncertain_reasons"])

    def test_bad_requests(self):
        self.assertEqual(self.c.post("/predict/raw", json={"readings": []}).status_code, 400)
        self.assertEqual(self.c.post("/predict/raw", json={"readings": [1]}).status_code, 400)
        too_many = [reading(i, "W_HTTP6") for i in range(self.serve.MAX_BATCH + 1)]
        self.assertEqual(self.c.post("/predict/raw", json={"readings": too_many}).status_code, 413)
        bad = self.c.post("/predict/raw", json={"readings": [{"timestamp": "2026-07-21T09:00:00"}]}).get_json()
        self.assertEqual(bad["results"][0]["uncertain_reason"], "INVALID_PACKET")


if __name__ == "__main__":
    unittest.main(verbosity=2)
