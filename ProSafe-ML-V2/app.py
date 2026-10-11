"""
ProSafe V2 Safety Predictor - manual live-prediction demo.

Enter raw helmet readings and the worker's baselines; each processed second goes
through the SAME path the backend uses:

    raw reading + worker baselines
      -> ProSafeInferencePipeline.process_raw
      -> StreamingPreprocessor (per-worker state: windows, trends, exposure counters,
         noise dose, session gas baseline) -> 38 EXTENDED features
      -> UNCERTAIN gate -> XGBoost (only when READY)

Nothing is recomputed here: features, deviations and diagnostics shown are the
preprocessor's own output. The model needs history (30/60/300-s windows, a 180-s
cold-start warm-up, a session gas baseline), so a new session starts UNCERTAIN.
"Simulate" feeds one reading per simulated second through the same pipeline to
reach READY without waiting in real time.

Run from this folder:
    python -m streamlit run app.py
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import streamlit as st

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))

from inference_pipeline import ProSafeInferencePipeline  # noqa: E402
from predict import SafetyPredictor  # noqa: E402
from preprocessing import DEFAULT_CONFIG, UNCERTAIN_REASON_TEXT, UncertainReason  # noqa: E402
from streaming_preprocessor import StreamingPreprocessor  # noqa: E402
from utils import (  # noqa: E402
    DEVIATION_COLUMNS,
    EXPOSURE_COLUMNS,
    GAS_RATIO_COLUMNS,
    NOISE_DOSE_COLUMNS,
    RAW_SENSOR_COLUMNS,
    ROLLING_COLUMNS,
    TREND_COLUMNS,
)

st.set_page_config(page_title="ProSafe V2 Safety Predictor", page_icon="⛑️", layout="wide")

STATUS_STYLE = {
    "SAFE": ("#22c55e", "✅", "Safe"),
    "WARNING": ("#f59e0b", "⚠️", "Warning"),
    "CRITICAL": ("#ef4444", "🚨", "Critical"),
    "UNCERTAIN": ("#8b969a", "❔", "Uncertain"),
}
SIM_DURATIONS = [1, 10, 30, 60, 180, 300]
FEATURE_GROUPS = [
    ("Raw (after validation / short hold)", RAW_SENSOR_COLUMNS),
    ("Personalized deviations", DEVIATION_COLUMNS),
    ("Gas ratio (vs. session gas baseline)", GAS_RATIO_COLUMNS),
    ("Rolling statistics", ROLLING_COLUMNS),
    ("Trends (per minute)", TREND_COLUMNS),
    ("Exposure durations (s)", EXPOSURE_COLUMNS),
    ("Noise dose (NIOSH, % of daily limit)", NOISE_DOSE_COLUMNS),
]
CH = DEFAULT_CONFIG.channels  # the V2 per-channel plausibility ranges

# Median raw readings of real W_001 seconds per offline label (with W_001's
# baselines). Through the real pipeline they settle on SAFE / WARNING / CRITICAL.
PRESETS = {
    "Typical Safe": dict(ambient_temperature=27.2, uv_index=2.49, gas=8.1, noise=64.7, body_temperature=36.83, heart_rate=87.0),
    "Typical Warning": dict(ambient_temperature=30.7, uv_index=4.42, gas=8.3, noise=65.4, body_temperature=36.99, heart_rate=96.0),
    "Typical Critical": dict(ambient_temperature=31.7, uv_index=7.68, gas=8.0, noise=66.8, body_temperature=37.07, heart_rate=105.0),
}
DEFAULT_BASELINES = dict(baseline_hr=83.0, baseline_body_temperature=36.69)


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
@st.cache_resource
def load_predictor() -> SafetyPredictor:
    """The production model only (models/best_model.pkl via SafetyPredictor.load)."""
    return SafetyPredictor.load()


def new_pipeline() -> ProSafeInferencePipeline:
    # debug_features=True: UNCERTAIN results also expose the (provisional)
    # features for display. They are never sent to the classifier.
    return ProSafeInferencePipeline(load_predictor(), preprocessor=StreamingPreprocessor(debug_features=True))


def init_state() -> None:
    ss = st.session_state
    if "pipeline" not in ss:
        ss.pipeline = new_pipeline()
        # Simulated helmet clock: +1 s per processed reading (timestamps must increase).
        ss.clock = datetime.now().replace(microsecond=0)
        ss.history = []          # compact per-second results for the period list
        ss.last = None           # last full pipeline response
        ss.last_baselines = None
        ss.notice = None
        for k, v in {**PRESETS["Typical Safe"], **DEFAULT_BASELINES}.items():
            ss[k] = v
        ss.worker_id = "DEMO-WORKER"
        ss.helmet_id = "DEMO-HELMET"


def apply_preset(name: str) -> None:
    for k, v in PRESETS[name].items():
        st.session_state[k] = v


def process_seconds(n: int) -> None:
    """Feed n consecutive 1 Hz readings (same values, sequential timestamps)."""
    ss = st.session_state
    worker = ss.worker_id.strip() or "DEMO-WORKER"
    baselines = (float(ss.baseline_hr), float(ss.baseline_body_temperature))
    if ss.last_baselines is not None and baselines != ss.last_baselines:
        ss.notice = "Baseline changed: V2 restarted this worker's session (BASELINE_CHANGED), as in production."
    ss.last_baselines = baselines
    reading_values = {c: float(ss[c]) for c in RAW_SENSOR_COLUMNS}

    progress = st.progress(0.0, text="Processing readings...") if n > 30 else None
    for i in range(n):
        # Same profile registration the V2 service does for every reading.
        ss.pipeline.register_worker(worker, *baselines)
        ss.clock += timedelta(seconds=1)
        reading = {"worker_id": worker, "helmet_id": ss.helmet_id.strip() or None,
                   "timestamp": ss.clock.isoformat(), **reading_values}
        out = ss.pipeline.process_raw(reading, include_details=True)
        ss.history.append({"time": ss.clock, "status": out["predicted_class"],
                           "reason": out.get("uncertain_reason"), "session": out.get("session_id")})
        ss.last = out
        if progress and (i % 10 == 0 or i == n - 1):
            progress.progress((i + 1) / n, text=f"Processed {i + 1}/{n} simulated seconds")
    ss.history = ss.history[-3600:]
    if progress:
        progress.empty()


def reset_session(cold: bool) -> None:
    ss = st.session_state
    worker = ss.worker_id.strip() or "DEMO-WORKER"
    if cold:
        ss.pipeline.preprocessor.reset_workday(worker)
        ss.notice = "New workday: the next reading starts a cold session (180-s sensor warm-up, noise dose reset)."
    else:
        ss.pipeline.preprocessor.reset_session(worker)
        ss.notice = "Session reset: windows, counters and gas baseline cleared (warm restart: 20 samples of history needed)."
    ss.history = []
    ss.last = None


def periods(history: list[dict]) -> pd.DataFrame:
    rows = []
    for h in history:
        key = (h["status"], h["reason"], h["session"])
        if rows and rows[-1]["_key"] == key:
            rows[-1]["To"] = h["time"]
            rows[-1]["Seconds"] += 1
        else:
            rows.append({"_key": key, "Status": h["status"], "Reason": h["reason"] or "", "From": h["time"], "To": h["time"], "Seconds": 1})
    df = pd.DataFrame(rows[::-1]).drop(columns="_key") if rows else pd.DataFrame()
    for c in ("From", "To"):
        if c in df:
            df[c] = df[c].dt.strftime("%H:%M:%S")
    return df


def signed(v, nd: int, unit: str) -> str:
    return "—" if v is None else f"{v:+.{nd}f}{unit}"


# ---------------------------------------------------------------------------
# Sidebar: model information (read-only), worker, session, presets
# ---------------------------------------------------------------------------
init_state()
predictor = load_predictor()
ss = st.session_state

with st.sidebar:
    st.title("⛑️ ProSafe V2")
    st.caption("Streaming preprocessing + data-quality gate + safety classifier")

    st.subheader("Model")
    st.markdown(f"**{predictor.model_name}** · {predictor.feature_set} · {len(predictor.feature_columns)} features")
    with st.expander("Model information"):
        meta = predictor.meta
        st.markdown(
            f"- Version: `{meta.get('model_version', '?')}`\n"
            f"- Trained on: synthetic S_001–S_004 + real W_001\n"
            f"- External test: W_002 (accuracy {meta.get('test_accuracy', float('nan')):.4f}, "
            f"Critical recall {meta.get('test_critical_recall', float('nan')):.4f})\n"
            f"- Scaling: {'yes' if predictor.use_scaled else 'none'}\n"
            "- Baselines are worker context for deviations, **never model features**.\n"
            "- Known limitation: most W_002 Critical seconds were predicted Warning."
        )

    st.subheader("Worker")
    st.text_input("Worker ID", key="worker_id")
    st.text_input("Helmet ID", key="helmet_id")

    st.subheader("Session")
    st.button("Reset Session", on_click=reset_session, args=(False,), width="stretch",
              help="End only this worker's current V2 session (windows, counters, gas baseline).")
    st.button("Start new workday (cold start)", on_click=reset_session, args=(True,), width="stretch",
              help="Also resets the workday noise dose; the next session needs the 180-s sensor warm-up.")

    st.subheader("Quick inputs")
    st.caption("Median readings of real W_001 seconds per label.")
    for name in PRESETS:
        st.button(name, on_click=apply_preset, args=(name,), width="stretch")


# ---------------------------------------------------------------------------
# Main: inputs
# ---------------------------------------------------------------------------
st.title("ProSafe V2 Safety Predictor")
st.markdown(
    "Enter the worker's baselines and the helmet readings. Every processed second runs through the "
    "**real V2 pipeline** (streaming preprocessing → 38 EXTENDED features → UNCERTAIN gate → XGBoost)."
)

c_base, c_env, c_phys = st.columns([1, 1.2, 1.2])
with c_base:
    st.subheader("Worker Baseline")
    st.number_input("Baseline Heart Rate (BPM)", min_value=CH["heart_rate"].min_value, max_value=CH["heart_rate"].max_value,
                    step=1.0, key="baseline_hr", help="Resting heart rate. Context for deviations only.")
    st.number_input("Baseline Body Temperature (°C)", min_value=CH["body_temperature"].min_value,
                    max_value=CH["body_temperature"].max_value, step=0.01, format="%.2f", key="baseline_body_temperature")
with c_env:
    st.subheader("Environmental Sensors")
    st.slider("Ambient Temperature (°C)", CH["ambient_temperature"].min_value, CH["ambient_temperature"].max_value, step=0.1, key="ambient_temperature")
    st.slider("UV Index", CH["uv_index"].min_value, CH["uv_index"].max_value, step=0.01, key="uv_index")
    st.number_input("Gas sensor value (sensor units, not ppm)", min_value=CH["gas"].min_value, max_value=CH["gas"].max_value,
                    step=0.1, key="gas", help="Uncalibrated MQ-2 sensor units as in the V2 data. V2 also compares it with the session gas baseline.")
    st.slider("Noise (dB)", CH["noise"].min_value, CH["noise"].max_value, step=0.1, key="noise")
with c_phys:
    st.subheader("Physiological Sensors")
    st.slider("Body Temperature (°C)", CH["body_temperature"].min_value, CH["body_temperature"].max_value, step=0.01, key="body_temperature")
    st.slider("Heart Rate (BPM)", CH["heart_rate"].min_value, CH["heart_rate"].max_value, step=1.0, key="heart_rate")

a1, a2, a3 = st.columns([1, 1, 1])
with a1:
    process_one = st.button("Process 1 Second", type="primary", width="stretch")
with a2:
    duration = st.select_slider("Simulation duration (s)", options=SIM_DURATIONS, value=60)
with a3:
    simulate = st.button(f"Simulate {duration} s", width="stretch")
st.caption("**Simulation / demo acceleration:** the same values are fed once per simulated second, with sequential "
           "timestamps, through the same preprocessing call: no step is skipped and no history is invented.")

if process_one:
    process_seconds(1)
if simulate:
    process_seconds(int(duration))
if ss.notice:
    st.info(ss.notice)
    ss.notice = None

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
st.divider()
out = ss.last
st.subheader("Current V2 Status")
if out is None:
    st.write("No reading processed yet in this session. Click **Process 1 Second** or **Simulate**.")
else:
    status = out["predicted_class"]
    color, icon, word = STATUS_STYLE.get(status, STATUS_STYLE["UNCERTAIN"])
    ready = bool(out.get("model_ready"))
    reason = out.get("uncertain_reason")
    subtitle = "Model prediction (READY)" if ready else UNCERTAIN_REASON_TEXT.get(UncertainReason(reason), reason) if reason in UncertainReason._value2member_map_ else (reason or "")
    st.markdown(
        f"""<div style="background:{color};color:white;padding:22px;border-radius:12px;text-align:center;margin:8px 0 16px">
        <div style="font-size:44px;line-height:1">{icon}</div>
        <div style="font-size:40px;font-weight:800;letter-spacing:2px">{status}</div>
        <div style="font-size:16px;opacity:.95;margin-top:6px">{subtitle}</div></div>""",
        unsafe_allow_html=True,
    )

    diag = out.get("diagnostics") or {}
    m1, m2, m3, m4 = st.columns(4)
    probs = out.get("probabilities") or {}
    m1.metric("Confidence", f"{probs[status] * 100:.1f}%" if ready and status in probs else "—")
    m2.metric("Data quality", out.get("data_quality", "—"))
    m3.metric("Model ready", "Yes" if ready else "No")
    m4.metric("Samples in session", diag.get("sample_count", "—"))
    st.caption(f"Model: {out.get('model_name')} · Feature set: {out.get('feature_set')} · "
               f"Simulated time: {ss.clock.strftime('%H:%M:%S')} · Session elapsed: {out.get('session_elapsed_s') or 0:.0f} s")

    if not ready:
        reasons = out.get("uncertain_reasons") or [reason]
        st.markdown("**Why UNCERTAIN** (no probabilities: the classifier was not called)")
        for r in reasons:
            text = UNCERTAIN_REASON_TEXT.get(UncertainReason(r)) if r in UncertainReason._value2member_map_ else ""
            st.markdown(f"- `{r}` — {text}")
    else:
        st.markdown("**Class probabilities**")
        for cls in ("SAFE", "WARNING", "CRITICAL"):
            pct = probs.get(cls, 0.0) * 100
            st.markdown(
                f"""<div style="margin:6px 0"><div style="display:flex;justify-content:space-between">
                <b>{STATUS_STYLE[cls][2]}</b><b>{pct:.1f}%</b></div>
                <div style="background:rgba(128,128,128,.25);border-radius:6px;height:16px;overflow:hidden">
                <div style="width:{pct}%;background:{STATUS_STYLE[cls][0]};height:100%"></div></div></div>""",
                unsafe_allow_html=True,
            )

    feats = out.get("v2_features") or {}
    st.markdown("**Personalized values** (computed by the V2 preprocessor)" + ("" if ready else " — provisional, not used for prediction"))
    p1, p2, p3, p4 = st.columns(4)
    p1.metric("HR deviation", signed(feats.get("hr_deviation_bpm"), 1, " bpm"))
    p2.metric("HR deviation %", signed(feats.get("hr_deviation_pct"), 1, "%"))
    p3.metric("Body temp deviation", signed(feats.get("body_temp_deviation_c"), 2, " °C"))
    p4.metric("Body temp deviation %", signed(feats.get("body_temp_deviation_pct"), 2, "%"))

    with st.expander("Session details"):
        gas_bl = diag.get("gas_baseline")
        st.markdown(
            f"- Session: `{out.get('session_id')}` ({'cold start' if diag.get('cold_start') else 'warm start'})\n"
            f"- Samples processed in session: {diag.get('sample_count', '—')} · elapsed {out.get('session_elapsed_s') or 0:.0f} s\n"
            f"- Gas baseline: {'not established yet' if gas_bl is None else f'{gas_bl:.2f}'}"
            f"{' (provisional, calibration window still open)' if gas_bl is not None and diag.get('gas_baseline_provisional') else ''}\n"
            f"- Channel status: {diag.get('channel_status', {})}"
        )
        if out.get("notes"):
            st.markdown("- Notes: " + "; ".join(out["notes"]))

    with st.expander("V2 Generated Features"):
        if not feats:
            st.write("No features for this result.")
        else:
            st.caption(f"{len(predictor.feature_columns)} EXTENDED features produced by StreamingPreprocessor. "
                       + ("These were sent to the classifier." if ready else
                          "UNCERTAIN: shown for inspection only, NOT sent to the classifier. Empty = not available yet."))
            for title, cols in FEATURE_GROUPS:
                st.markdown(f"**{title}**")
                st.dataframe(pd.DataFrame({"feature": cols, "value": [feats.get(c) for c in cols]}),
                             hide_index=True, width="stretch")

    with st.expander("Status periods in this session"):
        df = periods(ss.history)
        if df.empty:
            st.write("—")
        else:
            st.dataframe(df, hide_index=True, width="stretch")

st.caption("Research project: Personalized AI-Driven Wearable Safety Monitoring System for Construction Workers.")
