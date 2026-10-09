"""
Streamlit demo for ProSafe ML V2.

  Tab 1  Model-ready prediction - pick any ML-ready row, see the V2 classifier output.
  Tab 2  Raw-stream replay      - feed raw 1 Hz sensor values through the full V2
                                  pipeline (streaming preprocessor -> quality gate ->
                                  classifier) and watch UNCERTAIN warm-up, imputation
                                  and SAFE / WARNING / CRITICAL decisions.

Run from the project root:
    streamlit run app.py
"""

from __future__ import annotations

import sys
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
import streamlit as st

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))

import plot_style as ps  # noqa: E402
from inference_pipeline import ProSafeInferencePipeline  # noqa: E402
from predict import SafetyPredictor  # noqa: E402
from utils import (  # noqa: E402
    RAW_SENSOR_COLUMNS,
    RISK_CLASSES,
    SYNTHETIC_DATA_PATH,
    W001_DATA_PATH,
    W002_DATA_PATH,
    _read_ml_ready,
    load_frozen_config,
)

st.set_page_config(page_title="ProSafe ML V2", page_icon="⛑️", layout="wide")
COLORS = {"SAFE": ps.STATUS["Safe"], "WARNING": ps.STATUS["Warning"], "CRITICAL": ps.STATUS["Critical"], "UNCERTAIN": "#898781"}


@st.cache_resource
def load_predictor(name: str) -> SafetyPredictor:
    return SafetyPredictor.load_named(name)


@st.cache_data
def load_rows() -> pd.DataFrame:
    df = pd.concat([_read_ml_ready(p) for p in (SYNTHETIC_DATA_PATH, W001_DATA_PATH, W002_DATA_PATH)], ignore_index=True)
    df["row_in_worker"] = df.groupby("worker_id").cumcount()
    return df


registry = SafetyPredictor.list_available_models()
if not registry:
    st.error("No production model found. Run `python src/promote_model.py` first.")
    st.stop()
cfg = load_frozen_config()
best = next(n for n, e in registry.items() if e.get("is_best"))

with st.sidebar:
    st.title("⛑️ ProSafe ML V2")
    st.caption("Preprocessing + quality gate + 3-class safety classifier")
    name = st.selectbox("Model", list(registry), index=list(registry).index(best))
    if name == best:
        st.caption(f"⭐ production model {cfg.get('model_version', '')} ({cfg['feature_set']}, {len(cfg['feature_columns'])} features)")
    m = registry[name]["metrics"]
    st.metric("W_002 test macro F1", f"{m['macro_f1']:.3f}")
    st.metric("W_002 test Critical recall", f"{m['critical_recall']:.3f}")
    st.caption("Known limitation: most W_002 Critical seconds are predicted Warning (UV-driven Critical is rare in training).")
    st.caption("UNCERTAIN is a data-quality outcome of the preprocessing gate - never a classifier class.")

predictor = load_predictor(name)
rows = load_rows()
tab1, tab2 = st.tabs(["Model-ready prediction", "Raw-stream replay"])

with tab1:
    c1, c2 = st.columns(2)
    worker = c1.selectbox("Worker", sorted(rows["worker_id"].unique()))
    wrows = rows[rows["worker_id"] == worker]
    idx = c2.slider("Row", 0, len(wrows) - 1, min(600, len(wrows) - 1))
    row = wrows.iloc[idx]
    feats = {c: (None if pd.isna(row[c]) else float(row[c])) for c in predictor.feature_columns}
    pipe = ProSafeInferencePipeline(predictor)
    out = pipe.predict_model_ready(feats)
    label = out["predicted_class"]
    st.markdown(f"### Prediction: **{label}**   ·   offline label: **{row['risk_level'].upper()}**")
    if out["probabilities"]:
        st.bar_chart(pd.Series(out["probabilities"]).reindex([c.upper() for c in RISK_CLASSES]))
    if label == "UNCERTAIN":
        st.info(f"Not model-ready: {out['uncertain_reason']} - {out.get('missing_features')}")
    with st.expander("Feature vector sent to the classifier"):
        st.dataframe(pd.Series(feats, name="value").to_frame(), width="stretch")

with tab2:
    st.write("Raw sensor columns of a worker are replayed at 1 Hz from a fresh session through the streaming "
             "preprocessor. The baselines are the worker's stored profile values. The first 180 s of a "
             "workday are SENSOR_WARMUP, as in the offline framework.")
    c1, c2, c3 = st.columns(3)
    worker2 = c1.selectbox("Worker ", sorted(rows["worker_id"].unique()), key="w2")
    w = rows[rows["worker_id"] == worker2].reset_index(drop=True)
    start = c2.number_input("Start row", 0, max(0, len(w) - 60), 0, step=60)
    n = c3.slider("Seconds to replay", 60, 1800, 600, step=60)
    seg = w.iloc[int(start):int(start) + n]
    hr_bl = float((w["heart_rate"] - w["hr_deviation_bpm"]).median())
    bt_bl = float((w["body_temperature"] - w["body_temp_deviation_c"]).median())
    pipe2 = ProSafeInferencePipeline(predictor)
    pipe2.register_worker(worker2, hr_bl, bt_bl)
    t0 = datetime(2026, 7, 21, 9, 0, 0)
    outs = []
    for i, (_, r) in enumerate(seg.iterrows()):
        reading = {"worker_id": worker2, "timestamp": (t0 + timedelta(seconds=i)).isoformat(),
                   **{c: (None if pd.isna(r[c]) else float(r[c])) for c in RAW_SENSOR_COLUMNS}}
        o = pipe2.process_raw(reading)
        outs.append({"second": i, "system": o["predicted_class"], "offline_label": r["risk_level"].upper(),
                     "reason": o.get("uncertain_reason")})
    res = pd.DataFrame(outs)
    a, b, c = st.columns(3)
    a.metric("Classifier calls", pipe2.model_calls)
    b.metric("UNCERTAIN seconds", int((res.system == "UNCERTAIN").sum()))
    ready = res[res.system != "UNCERTAIN"]
    c.metric("Agreement with offline label (READY s)", f"{(ready.system == ready.offline_label).mean():.1%}" if len(ready) else "-")
    ps.apply()
    fig, ax = plt.subplots(figsize=(12, 2.6))
    order = ["UNCERTAIN", "SAFE", "WARNING", "CRITICAL"]
    for k in order:
        s = res[res.system == k]
        ax.scatter(s.second, [order.index(k)] * len(s), s=6, marker="|", color=COLORS[k], label=k)
    ax.set_yticks(range(4))
    ax.set_yticklabels(order)
    ax.set_xlabel("seconds since session start")
    ax.grid(axis="y", visible=False)
    st.pyplot(fig)
    st.write("UNCERTAIN reasons:", dict(Counter(res.reason.dropna())))
