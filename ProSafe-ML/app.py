"""
Streamlit demo UI for the Worker Safety ML model.

Run from project root:
    streamlit run app.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import joblib
import pandas as pd
import streamlit as st

# Make src/ importable so we can reuse SafetyPredictor and constants
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))

from predict import SafetyPredictor  # noqa: E402
from utils import ALL_MODELS_META_PATH, BEST_MODEL_META_PATH, FEATURE_COLUMNS  # noqa: E402


# ---------------------------------------------------------------------------
# Page setup
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="Worker Safety Monitor",
    page_icon="⛑️",
    layout="wide",
)

RISK_COLORS = {"Safe": "#2ecc71", "Warning": "#f39c12", "Critical": "#e74c3c"}
RISK_EMOJI = {"Safe": "✅", "Warning": "⚠️", "Critical": "🚨"}

PRESETS = {
    "Safe — calm conditions": {
        "ambient_temp_c": 24.0, "uv_index": 2.0, "gas_ppm": 80.0, "noise_db": 65.0,
        "body_temp_c": 36.6, "heart_rate_bpm": 78,
        "baseline_hr_bpm": 75, "baseline_body_temp_c": 36.7,
    },
    "Warning — moderately stressful": {
        "ambient_temp_c": 31.0, "uv_index": 6.0, "gas_ppm": 220.0, "noise_db": 83.0,
        "body_temp_c": 37.6, "heart_rate_bpm": 96,
        "baseline_hr_bpm": 75, "baseline_body_temp_c": 36.8,
    },
    "Critical — heat stress + toxic gas": {
        "ambient_temp_c": 38.5, "uv_index": 9.2, "gas_ppm": 350.0, "noise_db": 88.0,
        "body_temp_c": 39.1, "heart_rate_bpm": 115,
        "baseline_hr_bpm": 75, "baseline_body_temp_c": 36.8,
    },
}


@st.cache_resource
def load_predictor(model_name: str) -> SafetyPredictor:
    """Load a specific model once and cache it. Streamlit reruns the whole
    script on every widget change, so caching by model_name is essential —
    switching algorithms hits the disk only on the first selection of each."""
    return SafetyPredictor.load_named(model_name)


@st.cache_data
def load_model_registry() -> dict:
    """Return {model_name: {path, use_scaled, metrics}} for the picker."""
    return SafetyPredictor.list_available_models()


def init_state() -> None:
    """Seed session_state with the Safe preset on first load."""
    if "form_values" not in st.session_state:
        st.session_state.form_values = dict(PRESETS["Safe — calm conditions"])


def apply_preset(preset_name: str) -> None:
    """Overwrite form values from a preset (called by preset buttons)."""
    st.session_state.form_values = dict(PRESETS[preset_name])


def compute_deviations(values: dict) -> tuple[float, float]:
    """Personalized deviation = (current - baseline) / baseline * 100."""
    hr_dev = (values["heart_rate_bpm"] - values["baseline_hr_bpm"]) / values["baseline_hr_bpm"] * 100
    bt_dev = (values["body_temp_c"] - values["baseline_body_temp_c"]) / values["baseline_body_temp_c"] * 100
    return hr_dev, bt_dev


# ---------------------------------------------------------------------------
# Sidebar — model info + preset loader
# ---------------------------------------------------------------------------
init_state()

with st.sidebar:
    st.title("⛑️ Worker Safety")
    st.caption("Personalized ML for construction site monitoring")
    st.divider()

    st.subheader("Quick presets")
    st.caption("One-click sample readings for the demo.")
    for name in PRESETS:
        # Color the button to match the expected outcome
        risk_word = name.split(" — ")[0]
        st.button(
            name,
            use_container_width=True,
            on_click=apply_preset,
            args=(name,),
            type="primary" if risk_word == "Critical" else "secondary",
        )

    st.divider()
    st.subheader("Algorithm")

    registry = load_model_registry()
    if not registry:
        st.warning(
            "Model registry not found.\n"
            "Run `python src/train_models.py` first."
        )
        st.stop()

    # Default to the winning model so opening the app shows the best result first
    try:
        best_name = joblib.load(BEST_MODEL_META_PATH)["model_name"]
    except FileNotFoundError:
        best_name = next(iter(registry))

    model_options = list(registry.keys())
    default_idx = model_options.index(best_name) if best_name in model_options else 0
    selected_model = st.selectbox(
        "Select model",
        model_options,
        index=default_idx,
        help="Switch between trained algorithms to compare how each performs on the same input.",
    )
    if selected_model == best_name:
        st.caption(f"⭐ {selected_model} is the best-performing model.")

    entry = registry[selected_model]
    st.markdown(f"**Scaling:** {'enabled' if entry['use_scaled'] else 'not needed'}")

    metrics = entry.get("metrics", {})
    if metrics:
        st.metric("F1 Score (weighted)", f"{metrics.get('F1-Score', 0):.4f}")
        st.metric("Accuracy", f"{metrics.get('Accuracy', 0):.4f}")


# ---------------------------------------------------------------------------
# Main — title, form, prediction
# ---------------------------------------------------------------------------
st.title("Real-Time Worker Safety Risk Predictor")
st.markdown(
    "Enter sensor readings from the smart helmet. The model uses **personalized "
    "deviation** from each worker's physiological baseline — not fixed thresholds — "
    "to classify risk as **Safe**, **Warning**, or **Critical**."
)

predictor = load_predictor(selected_model)
vals = st.session_state.form_values

# Two columns: environmental on the left, physiological on the right
col_env, col_phys = st.columns(2)

with col_env:
    st.subheader("🌡️ Environmental sensors")
    vals["ambient_temp_c"] = st.slider(
        "Ambient temperature (°C)", 15.0, 50.0, float(vals["ambient_temp_c"]), 0.1,
        help="Site air temperature. Risk thresholds: <27 safe, 27–35 warning, >35 critical.",
    )
    vals["uv_index"] = st.slider(
        "UV index", 0.0, 12.0, float(vals["uv_index"]), 0.1,
        help="UV radiation. Risk thresholds: <3 safe, 3–8 warning, >8 critical.",
    )
    vals["gas_ppm"] = st.slider(
        "Gas concentration (PPM, MQ2)", 0.0, 600.0, float(vals["gas_ppm"]), 1.0,
        help="Combustible gas. Risk thresholds: <150 safe, 150–300 warning, >300 critical.",
    )
    vals["noise_db"] = st.slider(
        "Noise level (dB)", 40.0, 120.0, float(vals["noise_db"]), 0.5,
        help="Ambient noise. Risk thresholds: <80 safe, 80–85 warning, >85 critical.",
    )

with col_phys:
    st.subheader("❤️ Physiological sensors")
    vals["body_temp_c"] = st.slider(
        "Body temperature (°C)", 34.0, 42.0, float(vals["body_temp_c"]), 0.1,
        help="Worker's current body temperature.",
    )
    vals["heart_rate_bpm"] = st.slider(
        "Heart rate (BPM)", 40, 200, int(vals["heart_rate_bpm"]), 1,
        help="Worker's current heart rate.",
    )

    st.markdown("**Personal baselines** (worker-specific)")
    vals["baseline_hr_bpm"] = st.slider(
        "Baseline HR (BPM)", 50, 110, int(vals["baseline_hr_bpm"]), 1,
        help="Worker's resting heart rate — measured during onboarding.",
    )
    vals["baseline_body_temp_c"] = st.slider(
        "Baseline body temp (°C)", 35.0, 38.0, float(vals["baseline_body_temp_c"]), 0.1,
        help="Worker's normal body temperature — measured during onboarding.",
    )

# Auto-compute deviations and show as read-only metrics
hr_dev, bt_dev = compute_deviations(vals)
vals["hr_deviation_pct"] = hr_dev
vals["body_temp_deviation_pct"] = bt_dev

st.subheader("📊 Personalized deviations (auto-computed)")
d1, d2 = st.columns(2)
d1.metric(
    "Heart rate deviation",
    f"{hr_dev:+.2f}%",
    help="<15% safe · 15–30% warning · >30% critical",
)
d2.metric(
    "Body temp deviation",
    f"{bt_dev:+.2f}%",
    help="<15% safe · 15–30% warning · >30% critical",
)

st.divider()

# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------
predict_clicked = st.button(
    "🔍 Predict Risk Level", type="primary", use_container_width=True
)

if predict_clicked:
    sensor_data = {c: vals[c] for c in FEATURE_COLUMNS}
    result = predictor.predict_with_confidence(sensor_data)
    label = result["risk_level"]
    color = RISK_COLORS[label]
    emoji = RISK_EMOJI[label]

    # Full-width colored banner — readable from the back of the room
    st.markdown(
        f"""
        <div style="
            background-color: {color};
            color: white;
            padding: 30px;
            border-radius: 12px;
            text-align: center;
            margin: 20px 0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        ">
            <div style="font-size: 60px;">{emoji}</div>
            <div style="font-size: 42px; font-weight: bold; letter-spacing: 2px;">
                {label.upper()}
            </div>
            <div style="font-size: 18px; opacity: 0.9; margin-top: 8px;">
                Predicted Risk Level
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # Probabilities as a colored bar chart
    if result["probabilities"]:
        st.subheader("Model confidence")
        prob_df = pd.DataFrame(
            [
                {"Risk": k, "Probability": v}
                for k, v in result["probabilities"].items()
            ]
        )
        # Order naturally Safe → Warning → Critical
        order = ["Safe", "Warning", "Critical"]
        prob_df["Risk"] = pd.Categorical(prob_df["Risk"], categories=order, ordered=True)
        prob_df = prob_df.sort_values("Risk").reset_index(drop=True)

        for _, row in prob_df.iterrows():
            pct = row["Probability"] * 100
            risk = row["Risk"]
            bar_color = RISK_COLORS[risk]
            st.markdown(
                f"""
                <div style="margin: 8px 0;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="font-weight: 600;">{risk}</span>
                        <span style="font-weight: 600;">{pct:.1f}%</span>
                    </div>
                    <div style="background:#eee; border-radius:6px; height:22px; overflow:hidden;">
                        <div style="
                            width:{pct}%;
                            background:{bar_color};
                            height:100%;
                            transition: width 0.3s;
                        "></div>
                    </div>
                </div>
                """,
                unsafe_allow_html=True,
            )

# ---------------------------------------------------------------------------
# Expandable: feature importance + raw input
# ---------------------------------------------------------------------------
with st.expander("🔬 What is the model looking at?"):
    st.caption(
        "Feature importance from the trained model — higher means the model "
        "relies on this signal more when deciding."
    )
    if hasattr(predictor.model, "feature_importances_"):
        imp_df = pd.DataFrame(
            {"Feature": FEATURE_COLUMNS, "Importance": predictor.model.feature_importances_}
        ).sort_values("Importance", ascending=False).reset_index(drop=True)
        st.bar_chart(imp_df.set_index("Feature"))
        st.dataframe(imp_df, use_container_width=True, hide_index=True)
    else:
        st.info("This model type does not expose feature importance.")

with st.expander("📋 Raw sensor values sent to the model"):
    st.json({c: vals[c] for c in FEATURE_COLUMNS})

st.caption(
    "Research project: Personalized AI-Driven Wearable Safety Monitoring "
    "System for Construction Workers."
)
