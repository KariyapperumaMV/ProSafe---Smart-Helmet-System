"""
Drives app.py (the V2 Safety Predictor demo) headlessly with Streamlit's AppTest:
real widgets, real reruns, real session state, the real V2 pipeline.

    python tests/test_streamlit_app.py
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from streamlit.testing.v1 import AppTest  # noqa: E402

APP = str(ROOT / "app.py")


def button(at, label):
    return next(b for b in at.button if b.label == label)


def page_text(at) -> str:
    return "\n".join(m.value for m in at.markdown) + "\n" + "\n".join(c.value for c in at.caption)


def status(at) -> str:
    for m in at.markdown:
        if "font-size:40px" in m.value:
            for s in ("SAFE", "WARNING", "CRITICAL", "UNCERTAIN"):
                if f">{s}<" in m.value:
                    return s
    return ""


def metric(at, label):
    return next(m.value for m in at.metric if m.label == label)


def simulate(at, seconds):
    at.select_slider[0].set_value(seconds).run(timeout=120)
    button(at, f"Simulate {seconds} s").click().run(timeout=120)


class StreamlitDemo(unittest.TestCase):
    def setUp(self):
        self.at = AppTest.from_file(APP, default_timeout=120)
        self.at.run()
        self.assertFalse(self.at.exception, self.at.exception)

    def test_page_loads_production_model_and_inputs(self):
        at = self.at
        self.assertEqual(at.title[0].value, "ProSafe V2 Safety Predictor")
        self.assertIn("**XGBoost** · EXTENDED · 38 features", page_text(at))
        labels = {w.label for w in [*at.number_input, *at.slider]}
        for label in ("Baseline Heart Rate (BPM)", "Baseline Body Temperature (°C)", "Ambient Temperature (°C)", "UV Index",
                      "Gas sensor value (sensor units, not ppm)", "Noise (dB)", "Body Temperature (°C)", "Heart Rate (BPM)"):
            self.assertIn(label, labels)
        self.assertNotIn("gas_ppm", page_text(at))
        self.assertFalse([s for s in at.selectbox if "model" in s.label.lower()], "no model picker")

    def test_single_second_is_uncertain_warmup_without_probabilities(self):
        at = self.at
        button(at, "Process 1 Second").click().run()
        self.assertEqual(status(at), "UNCERTAIN")
        self.assertIn("`SENSOR_WARMUP`", page_text(at))
        self.assertIn("no probabilities", page_text(at))
        self.assertEqual(metric(at, "Confidence"), "—")
        self.assertEqual(metric(at, "Model ready"), "No")
        self.assertEqual(metric(at, "Samples in session"), "1")
        # Session state persists across reruns: a second click is sample 2.
        button(at, "Process 1 Second").click().run()
        self.assertEqual(metric(at, "Samples in session"), "2")

    def test_simulation_reaches_ready_then_reset(self):
        at = self.at
        simulate(at, 180)
        self.assertEqual(status(at), "UNCERTAIN")            # 180 samples = still inside the 180-s warm-up
        simulate(at, 10)
        self.assertEqual(status(at), "SAFE")                 # Typical Safe preset, READY
        self.assertEqual(metric(at, "Model ready"), "Yes")
        self.assertEqual(metric(at, "Samples in session"), "190")
        self.assertRegex(metric(at, "Confidence"), r"^\d+\.\d%$")
        self.assertIn("Class probabilities", page_text(at))
        self.assertNotEqual(metric(at, "HR deviation"), "—")  # deviations read from the preprocessor
        self.assertIn("**Rolling statistics**", page_text(at))

        button(at, "Reset Session").click().run()
        button(at, "Process 1 Second").click().run()
        self.assertEqual(status(at), "UNCERTAIN")
        self.assertIn("`INSUFFICIENT_HISTORY`", page_text(at))  # warm restart: 20 samples, no 180-s warm-up
        self.assertEqual(metric(at, "Samples in session"), "1")

    def test_elevated_readings_after_warmup(self):
        at = self.at
        button(at, "Typical Critical").click().run()
        simulate(at, 300)
        self.assertEqual(status(at), "CRITICAL")
        self.assertEqual(metric(at, "Data quality"), "VALID")


if __name__ == "__main__":
    unittest.main(verbosity=2)
