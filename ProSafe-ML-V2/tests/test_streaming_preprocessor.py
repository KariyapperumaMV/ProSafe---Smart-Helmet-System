"""
Behavioural tests for the V2 streaming preprocessor, quality gate, inference
pipeline and HTTP service.

Run:  python tests/test_streaming_preprocessor.py      (or: python -m pytest tests)
"""

from __future__ import annotations

import math
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT))

from inference_pipeline import ProSafeInferencePipeline  # noqa: E402
from preprocessing import PreprocessStatus, QualityState, parse_raw_reading  # noqa: E402
from streaming_preprocessor import StreamingPreprocessor, WorkerProfile  # noqa: E402
from utils import BEST_MODEL_PATH, DEFERRABLE_FEATURES, EXTENDED_FEATURE_COLUMNS, RISK_CLASSES  # noqa: E402

T0 = datetime(2026, 7, 21, 9, 0, 0)
BASE = dict(heart_rate=80.0, body_temperature=36.6, ambient_temperature=26.0, uv_index=2.0, gas=8.0, noise=65.0)


def reading(i, worker="W_T", t0=T0, **over):
    r = {"worker_id": worker, "timestamp": (t0 + timedelta(seconds=i)).isoformat(), **BASE}
    r.update(over)
    return r


def pre_with(*workers, **kw):
    return StreamingPreprocessor({w: WorkerProfile(w, 80.0, 36.6) for w in workers}, **kw)


def run(pre, n, start=0, worker="W_T", t0=T0, **over):
    return [pre.process(reading(i, worker, t0, **over)) for i in range(start, start + n)]


class WarmUpAndHistory(unittest.TestCase):
    def test_cold_start_is_uncertain_for_180_s(self):
        res = run(pre_with("W_T"), 182)
        self.assertTrue(all(r.status == PreprocessStatus.UNCERTAIN and r.reason == "SENSOR_WARMUP" for r in res[:180]))
        self.assertEqual(res[180].status, PreprocessStatus.READY)

    def test_warm_restart_needs_20_samples_and_never_zero_fills(self):
        pre = pre_with("W_T")
        run(pre, 300)
        t_lunch = T0 + timedelta(hours=2)          # 2 h gap -> new (warm) session, same workday
        res = run(pre, 260, t0=t_lunch)
        self.assertTrue(all(r.reason == "INSUFFICIENT_HISTORY" for r in res[:19]))
        first = res[19]
        self.assertEqual(first.status, PreprocessStatus.READY)
        for c in DEFERRABLE_FEATURES:                # long windows not yet filled: NaN, listed, never 0
            self.assertTrue(math.isnan(first.features[c]), c)
            self.assertIn(c, first.deferred_features)
        self.assertTrue(math.isnan(res[248].features["body_temp_trend_300s_c_per_min"]))
        self.assertFalse(math.isnan(res[249].features["body_temp_trend_300s_c_per_min"]))  # 250th sample
        self.assertFalse(math.isnan(res[59].features["body_temp_rolling_mean_300s"]))       # 60th sample

    def test_baseline_unavailable_until_registered(self):
        pre = StreamingPreprocessor({})
        res = run(pre, 200)
        self.assertEqual(res[-1].reason, "BASELINE_UNAVAILABLE")
        pre.register_worker(WorkerProfile("W_T", 80.0, 36.6))
        self.assertEqual(pre.process(reading(200)).status, PreprocessStatus.READY)


class IsolationAndSessions(unittest.TestCase):
    def test_workers_never_share_history(self):
        alone_a, alone_b = pre_with("A"), pre_with("B")
        mixed = pre_with("A", "B")
        for i in range(400):
            ra = reading(i, "A", heart_rate=80 + (i % 7))
            rb = reading(i, "B", heart_rate=120 - (i % 5), noise=92.0)
            a1, b1 = alone_a.process(ra), alone_b.process(rb)
            a2, b2 = mixed.process(ra), mixed.process(rb)
        for c in EXTENDED_FEATURE_COLUMNS:
            for x, y in ((a1, a2), (b1, b2)):
                self.assertTrue((math.isnan(x.features[c]) and math.isnan(y.features[c])) or x.features[c] == y.features[c], c)
        self.assertNotEqual(a2.features["noise_dose_pct"], b2.features["noise_dose_pct"])

    def test_session_gap_resets_counters_but_not_workday_dose(self):
        pre = pre_with("W_T")
        last = run(pre, 400, noise=92.0, ambient_temperature=31.0)[-1]
        self.assertGreater(last.features["noise_warning_exposure_sec"], 300)
        self.assertGreater(last.features["temp_warning_exposure_sec"], 300)
        dose = last.features["noise_dose_pct"]
        after = run(pre, 25, t0=T0 + timedelta(hours=2), noise=60.0, ambient_temperature=25.0)[-1]
        self.assertEqual(after.status, PreprocessStatus.READY)
        self.assertEqual(after.features["noise_warning_exposure_sec"], 0.0)
        self.assertEqual(after.features["temp_warning_exposure_sec"], 0.0)
        self.assertAlmostEqual(after.features["noise_dose_pct"], dose)       # same workday
        self.assertNotEqual(after.session_id, last.session_id)
        nextday = run(pre, 1, t0=T0 + timedelta(days=1))[-1]
        self.assertEqual(pre.get_state("W_T").noise_dose_pct, 0.0)          # new workday
        self.assertEqual(nextday.reason, "SENSOR_WARMUP")

    def test_manual_reset(self):
        pre = pre_with("W_T")
        run(pre, 200, noise=92.0)
        pre.reset_session("W_T")
        r = pre.process(reading(200, noise=92.0))
        self.assertEqual(r.reason, "INSUFFICIENT_HISTORY")
        self.assertGreater(pre.get_state("W_T").noise_dose_pct, 0.0)

    def test_helmet_changing_wearer_ends_previous_session(self):
        pre = pre_with("A", "B")
        run(pre, 200, worker="A", helmet_id="H1")
        self.assertIsNotNone(pre.get_state("A").session)
        pre.process(reading(200, "B", helmet_id="H1"))
        self.assertIsNone(pre.get_state("A").session)
        self.assertEqual(pre.get_state("A").last_session_end_reason, "WORKER_CHANGED_ON_HELMET")


class MissingDataAndArtifacts(unittest.TestCase):
    def setUp(self):
        self.pre = pre_with("W_T")
        run(self.pre, 200)

    def test_short_dropout_is_imputed_long_dropout_is_uncertain(self):
        res = run(self.pre, 8, start=200, uv_index=None)
        self.assertEqual(res[0].status, PreprocessStatus.READY)
        self.assertEqual(res[0].quality, QualityState.IMPUTED)
        self.assertEqual(res[0].imputed_channels, ["uv_index"])
        self.assertEqual(res[0].features["uv_index"], 2.0)          # causal LOCF, not interpolation
        self.assertEqual(res[-1].reason, "SENSOR_UNAVAILABLE")       # > 5 s hold

    def test_lost_hr_contact(self):
        res = run(self.pre, 6, start=200, heart_rate=-1)              # firmware sentinel
        self.assertEqual(res[-1].reason, "BODY_CONTACT_FAILURE")

    def test_two_channels_down(self):
        res = run(self.pre, 12, start=200, gas=None, noise=None)
        self.assertIn("TOO_MANY_MISSING_SENSORS", res[-1].reasons)

    def test_out_of_order_is_rejected_without_state_change(self):
        before = self.pre.export_state("W_T")
        r = self.pre.process(reading(150))
        self.assertEqual(r.reason, "OUT_OF_ORDER_TIMESTAMP")
        self.assertEqual(self.pre.export_state("W_T"), before)

    def test_single_hr_spike_is_held_not_learned(self):
        r = self.pre.process(reading(200, heart_rate=150.0))
        self.assertEqual(r.quality, QualityState.IMPUTED)
        self.assertEqual(r.features["heart_rate"], 80.0)
        self.assertEqual(r.features["heart_rate_rolling_mean_30s"], 80.0)

    def test_persistent_hr_shift_is_accepted(self):
        res = run(self.pre, 4, start=200, heart_rate=130.0)
        self.assertEqual(res[1].features["heart_rate"], 80.0)         # held while unconfirmed
        self.assertEqual(res[2].features["heart_rate"], 130.0)        # 3rd consistent sample confirms
        self.assertEqual(res[3].quality, QualityState.VALID)

    def test_major_gap_refill(self):
        res = run(self.pre, 31, start=260)                            # 60 s hole after t=199
        self.assertTrue(all("MAJOR_TIMESTAMP_GAP" in r.reasons for r in res[:19]))
        self.assertEqual(res[19].reasons, ["PACKET_LOSS"])            # 20 of the last 60 s received
        self.assertEqual(res[29].status, PreprocessStatus.READY)      # coverage back to 50 %

    def test_sixty_second_packets_never_become_ready(self):
        """Current firmware cadence (one packet per 60 s) cannot support V2 features."""
        pre = pre_with("W_X")
        res = [pre.process(reading(60 * i, "W_X")) for i in range(30)]
        self.assertTrue(all(not r.model_ready for r in res))

    def test_export_import_roundtrip(self):
        snap = self.pre.export_state("W_T")
        clone = pre_with("W_T")
        clone.import_state(snap)
        for i in range(200, 260):
            a = self.pre.process(reading(i, heart_rate=80 + i % 9, noise=70 + i % 23))
            b = clone.process(reading(i, heart_rate=80 + i % 9, noise=70 + i % 23))
            self.assertEqual(a.to_dict(), b.to_dict())


class Parsing(unittest.TestCase):
    def test_old_and_backend_aliases(self):
        r = parse_raw_reading({"workerId": "W1", "timestamp": "2026-07-21T09:00:00", "heart_rate_bpm": 90,
                               "body_temp_c": 36.9, "ambientTemp": 30, "uv": 4, "gas_ppm": 9.5, "noise_db": 70})
        self.assertEqual((r.worker_id, r.heart_rate, r.body_temperature, r.ambient_temperature, r.uv_index, r.gas, r.noise),
                         ("W1", 90.0, 36.9, 30.0, 4.0, 9.5, 70.0))

    def test_invalid_packet(self):
        res = StreamingPreprocessor().process({"timestamp": "2026-07-21T09:00:00"})
        self.assertEqual(res.reason, "INVALID_PACKET")


class FakePredictor:
    model_name, feature_set = "fake", "EXTENDED"
    feature_columns = list(EXTENDED_FEATURE_COLUMNS)

    def __init__(self):
        self.calls = 0

    def missing_required(self, f):
        return [c for c in self.feature_columns if c not in DEFERRABLE_FEATURES and (f.get(c) is None or f[c] != f[c])]

    def predict_with_confidence(self, f):
        self.calls += 1
        return {"risk_level": "Warning", "probabilities": {"Safe": 0.1, "Warning": 0.8, "Critical": 0.1}}


class Pipeline(unittest.TestCase):
    def test_uncertain_never_calls_the_classifier(self):
        fake = FakePredictor()
        pipe = ProSafeInferencePipeline(fake, {"W_T": WorkerProfile("W_T", 80.0, 36.6)})
        outs = [pipe.process_raw(reading(i)) for i in range(185)]
        self.assertEqual(fake.calls, 5)                                   # only the 5 READY seconds
        self.assertEqual(outs[0], {**outs[0], "predicted_class": "UNCERTAIN", "probabilities": {},
                                   "uncertain_reason": "SENSOR_WARMUP", "model_ready": False})
        self.assertEqual(outs[-1]["predicted_class"], "WARNING")
        self.assertEqual(set(outs[-1]["probabilities"]), {"SAFE", "WARNING", "CRITICAL"})

    def test_model_ready_null_required_feature_is_uncertain(self):
        fake = FakePredictor()
        pipe = ProSafeInferencePipeline(fake)
        f = {c: 1.0 for c in fake.feature_columns}
        f["heart_rate"] = None
        out = pipe.predict_model_ready(f)
        self.assertEqual((out["predicted_class"], fake.calls), ("UNCERTAIN", 0))
        f["heart_rate"] = 80.0
        f[DEFERRABLE_FEATURES[0]] = None                                  # warm-up feature may be null
        self.assertEqual(pipe.predict_model_ready(f)["predicted_class"], "WARNING")


@unittest.skipUnless(BEST_MODEL_PATH.exists(), "trained artifacts not present in models/")
class TrainedArtifacts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from predict import SafetyPredictor
        from utils import load_development_data
        cls.p = SafetyPredictor.load()
        dev = load_development_data()
        cls.rows = dev.groupby("risk_level").head(3)

    def test_label_encoder_has_exactly_three_classes(self):
        self.assertEqual(sorted(self.p.label_encoder.classes_.tolist()), sorted(RISK_CLASSES))

    def test_predictions_are_three_class(self):
        for _, row in self.rows.iterrows():
            out = self.p.predict_with_confidence(row[self.p.feature_columns].to_dict())
            self.assertIn(out["risk_level"], RISK_CLASSES)
            if out["probabilities"]:
                self.assertAlmostEqual(sum(out["probabilities"].values()), 1.0, places=5)

    def test_registry_loads(self):
        for name in self.p.list_available_models():
            self.assertEqual(type(self.p).load_named(name).model_name, name)

    def test_http_service(self):
        import serve
        c = serve.app.test_client()
        health = c.get("/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.get_json()["model_name"], "XGBoost")
        row = {k: (None if v != v else float(v)) for k, v in self.rows.iloc[0][self.p.feature_columns].to_dict().items()}
        ok = c.post("/predict", json=row)
        self.assertEqual(ok.status_code, 200)
        self.assertIn(ok.get_json()["predicted_class"], ["SAFE", "WARNING", "CRITICAL"])
        bad = dict(row)
        bad.pop("heart_rate")
        self.assertEqual(c.post("/predict", json=bad).status_code, 400)
        null = dict(row, heart_rate=None)
        self.assertEqual(c.post("/predict", json=null).get_json()["predicted_class"], "UNCERTAIN")
        raw = c.post("/predict/raw", json=reading(0))                    # enabled by default since integration
        self.assertEqual(raw.status_code, 200)
        self.assertEqual(raw.get_json()["uncertain_reason"], "BASELINE_UNAVAILABLE")


if __name__ == "__main__":
    unittest.main(verbosity=2)
