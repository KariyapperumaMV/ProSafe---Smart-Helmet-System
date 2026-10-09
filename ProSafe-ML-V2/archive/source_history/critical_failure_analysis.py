"""
Why did the V2 hybrid model (Logistic Regression, EXTENDED, trained on synthetic
+ W_001) predict none of W_002's Critical seconds?

Diagnosis only. Nothing is modified: no labels, no data, no thresholds, no
features, no models. W_002 was already evaluated; any redesign motivated by
this analysis needs a NEW unseen real worker for unbiased validation.

Writes outputs/critical_failure_analysis.md and one supporting figure.

Run from the project root (after src/run_experiments.py, whose
outputs/experiment_results.csv is used for the feature-set evidence):
    python src/critical_failure_analysis.py
"""

from __future__ import annotations

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import plot_style as ps
from predict import SafetyPredictor
from utils import (
    EXPERIMENT_OUTPUTS_DIR,
    EXPOSURE_COLUMNS,
    EXTENDED_FEATURE_COLUMNS,
    OUTPUTS_DIR,
    RISK_CLASSES,
    SYNTHETIC_DATA_PATH,
    TARGET_COLUMN,
    W001_DATA_PATH,
    _read_ml_ready,
    load_external_test_data,
)

HAZARDS = {  # exposure counter active (> 0 s) = that hazard is at warning / critical level right now
    "heat": "temp_warning_exposure_sec", "heat_crit": "temp_critical_exposure_sec",
    "uv": "uv_warning_exposure_sec", "uv_crit": "uv_critical_exposure_sec",
    "gas": "gas_warning_exposure_sec", "noise": "noise_warning_exposure_sec",
    "hr": "hr_warning_exposure_sec", "hr_crit": "hr_critical_exposure_sec",
    "body_temp": "body_temp_warning_exposure_sec",
}
KEY_FEATURES = ["heart_rate", "hr_deviation_pct", "heart_rate_rolling_mean_30s", "body_temp_deviation_c",
                "ambient_temperature", "ambient_temp_rolling_mean_300s", "uv_index", "uv_rolling_mean_300s",
                "gas_ratio_to_baseline", "noise_rolling_mean_60s", "noise_dose_pct"]


def load() -> pd.DataFrame:
    parts = []
    for name, df in [("synthetic", _read_ml_ready(SYNTHETIC_DATA_PATH)), ("W_001", _read_ml_ready(W001_DATA_PATH)),
                     ("W_002", load_external_test_data())]:
        parts.append(df.assign(source=name))
    d = pd.concat(parts, ignore_index=True)
    active = pd.DataFrame({k: d[v] > 0 for k, v in HAZARDS.items()})
    d["signature"] = active.apply(lambda r: " + ".join(k for k in HAZARDS if r[k]) or "(none)", axis=1)
    return d


def episodes(g: pd.DataFrame) -> list[int]:
    c = (g[TARGET_COLUMN] == "Critical").astype(int).values
    starts = np.flatnonzero(np.diff(np.r_[0, c]) == 1)
    ends = np.flatnonzero(np.diff(np.r_[c, 0]) == -1)
    return (ends - starts + 1).tolist()


def md(df: pd.DataFrame, **kw) -> str:
    return df.to_markdown(floatfmt=".3f", **kw)


def main() -> None:
    ps.apply()
    d = load()
    train = d[d.source != "W_002"]
    w2 = d[d.source == "W_002"]
    crit_tr, crit_w2 = train[train[TARGET_COLUMN] == "Critical"], w2[w2[TARGET_COLUMN] == "Critical"]
    L = ["# Why the V2 hybrid model missed W_002's Critical seconds", "",
         "Model analysed: the current V2 production candidate `models/best_model.pkl` = Logistic Regression, EXTENDED "
         "(38 features), trained on synthetic + W_001. On W_002 it reached 90.9 % accuracy and 0.615 macro F1 but "
         "**0 of 260 Critical seconds** were predicted Critical (all 260 were predicted Warning, none Safe).", "",
         "This is a diagnosis only. No label, dataset, threshold, feature or model was changed because of it.", ""]

    # 1. Critical class: training vs W_002 -------------------------------------
    rows = []
    for src, g in d.groupby("source", sort=False):
        eps = sum((episodes(gg) for _, gg in g.groupby("worker_id")), [])
        rows.append({"source": src, "rows": len(g), "Critical rows": int((g[TARGET_COLUMN] == "Critical").sum()),
                     "Critical share": (g[TARGET_COLUMN] == "Critical").mean(), "Critical episodes": len(eps),
                     "episode lengths (s)": ", ".join(map(str, sorted(eps, reverse=True)[:8])) + (" ..." if len(eps) > 8 else "")})
    L += ["## 1. The Critical class in training vs W_002", "", md(pd.DataFrame(rows).set_index("source")), "",
          f"W_002 has only **{len(episodes(w2))} Critical episodes**, so its Critical recall rests on three events.", ""]

    # 2. Hazard mechanisms ------------------------------------------------------
    share = {}
    for src, g in d[d[TARGET_COLUMN] == "Critical"].groupby("source", sort=False):
        share[src] = pd.DataFrame({k: g[v] > 0 for k, v in HAZARDS.items()}).mean()
    share = pd.DataFrame(share)
    top = {src: g["signature"].value_counts(normalize=True).head(4) for src, g in d[d[TARGET_COLUMN] == "Critical"].groupby("source", sort=False)}
    L += ["## 2. Different hazard mechanisms behind \"Critical\"", "",
          "Share of Critical rows in which each hazard's exposure counter is active (signal at warning/critical level):", "",
          md(share), "", "Most frequent combinations of active hazards among Critical rows:", ""]
    for src, s in top.items():
        L.append(f"* **{src}:** " + "; ".join(f"`{k}` {v:.0%}" for k, v in s.items()))
    sig_w2 = crit_w2["signature"].value_counts().index[:3]
    cons = []
    for sgn in sig_w2:
        t = train[train.signature == sgn][TARGET_COLUMN].value_counts()
        w = w2[w2.signature == sgn][TARGET_COLUMN].value_counts()
        cons.append({"active-hazard signature": sgn, "training rows": int(t.sum()),
                     "training labels (Safe/Warning/Critical)": "/".join(str(int(t.get(c, 0))) for c in RISK_CLASSES),
                     "W_002 rows": int(w.sum()), "W_002 labels (Safe/Warning/Critical)": "/".join(str(int(w.get(c, 0))) for c in RISK_CLASSES)})
    L += ["", "How often W_002's Critical signatures occur in the training data at all:", "",
          pd.DataFrame(cons).to_markdown(index=False), "",
          "Synthetic Critical is almost always **heat + escalating physiology** (heat exposure plus HR >= 40 % above "
          "baseline and/or a body-temperature rise). W_001 Critical is **heat + UV + elevated HR**. W_002 Critical is "
          "**sustained critical UV + moderately elevated HR with no heat exposure**, a combination that appears in only "
          f"{cons[0]['training rows']} training rows.", ""]

    same = w2[(w2[HAZARDS["uv_crit"]] > 0) & (w2[HAZARDS["hr"]] > 0)]
    dur = same.groupby(TARGET_COLUMN)[[HAZARDS["uv_crit"], HAZARDS["hr"], "hr_deviation_pct", "uv_rolling_mean_300s"]].median().reindex(
        [c for c in RISK_CLASSES if c in set(same[TARGET_COLUMN])])
    L += ["Inside W_002, seconds with **the same active hazards** (UV-critical + HR-warning) split into Warning and "
          "Critical mainly by how **long** the exposures have lasted (medians):", "", md(dur), ""]

    # 3. Feature distributions by class -----------------------------------------
    med = d.groupby(["source", TARGET_COLUMN])[KEY_FEATURES].median().reindex(
        pd.MultiIndex.from_product([["synthetic", "W_001", "W_002"], RISK_CLASSES])).T
    med.columns = [f"{s} {c}" for s, c in med.columns]
    L += ["## 3. Feature distributions by class (medians)", "", md(med), ""]

    # 4. Which features differ most --------------------------------------------
    sd = train[EXTENDED_FEATURE_COLUMNS].std().replace(0, np.nan)
    smd = ((crit_w2[EXTENDED_FEATURE_COLUMNS].mean() - crit_tr[EXTENDED_FEATURE_COLUMNS].mean()) / sd)
    diff = pd.DataFrame({"training Critical mean": crit_tr[EXTENDED_FEATURE_COLUMNS].mean(),
                         "W_002 Critical mean": crit_w2[EXTENDED_FEATURE_COLUMNS].mean(),
                         "difference / training std": smd}).dropna().sort_values("difference / training std", key=abs, ascending=False)
    L += ["## 4. Features that differ most: W_002 Critical vs training Critical", "",
          "Standardized mean difference (in units of the training-data standard deviation):", "",
          md(diff.head(12)), ""]

    # Nearest training-class centroid (standardized TEMPORAL + EXTENDED space)
    from sklearn.impute import SimpleImputer
    from sklearn.preprocessing import StandardScaler
    imp = SimpleImputer(strategy="median").fit(train[EXTENDED_FEATURE_COLUMNS])
    sc = StandardScaler().fit(imp.transform(train[EXTENDED_FEATURE_COLUMNS]))
    Z = lambda x: sc.transform(imp.transform(x[EXTENDED_FEATURE_COLUMNS]))  # noqa: E731
    cent = {c: Z(train[train[TARGET_COLUMN] == c]).mean(axis=0) for c in RISK_CLASSES}
    zc = Z(crit_w2)
    nearest = pd.Series([min(cent, key=lambda c: np.linalg.norm(z - cent[c])) for z in zc]).value_counts()
    L += [f"Nearest training-class centroid for each W_002 Critical second (standardized 38-feature space): "
          + ", ".join(f"{c} {int(nearest.get(c, 0))}" for c in RISK_CLASSES)
          + ". To the training data, W_002's Critical seconds look like Warning.", ""]

    # 5. The model's view ----------------------------------------------------
    p = SafetyPredictor.load()
    proba_w2 = p.predict_proba_frame(w2)
    proba_tr = p.predict_proba_frame(crit_tr)
    pc = pd.DataFrame({
        "training Critical (in-sample)": proba_tr["Critical"].describe(percentiles=[.1, .5, .9])[["min", "10%", "50%", "90%", "max"]],
        "W_002 Critical": proba_w2["Critical"][(w2[TARGET_COLUMN] == "Critical").values].describe(percentiles=[.1, .5, .9])[["min", "10%", "50%", "90%", "max"]],
        "W_002 Warning": proba_w2["Critical"][(w2[TARGET_COLUMN] == "Warning").values].describe(percentiles=[.1, .5, .9])[["min", "10%", "50%", "90%", "max"]],
    })
    pred_path = EXPERIMENT_OUTPUTS_DIR / "w002_predictions.csv"
    cm_txt = ""
    if pred_path.exists():
        pr = pd.read_csv(pred_path)
        cm = pd.crosstab(pr["y_true"], pr["pred_EXP3"]).reindex(index=RISK_CLASSES, columns=RISK_CLASSES, fill_value=0)
        cm_txt = "Confusion matrix of this model on W_002 (rows true, columns predicted):\n\n" + cm.to_markdown() + "\n"
    cls = list(p.label_encoder.classes_)
    coef = p.model.coef_[cls.index("Critical")] - p.model.coef_[cls.index("Warning")]
    icpt = p.model.intercept_[cls.index("Critical")] - p.model.intercept_[cls.index("Warning")]
    contrib = lambda df: pd.DataFrame(p.scaler.transform(df[p.feature_columns]) * coef, columns=p.feature_columns).mean()  # noqa: E731
    c_tr, c_w2 = contrib(crit_tr), contrib(crit_w2)
    gap = (c_w2 - c_tr).sort_values()
    dec = pd.DataFrame({"training Critical": c_tr, "W_002 Critical": c_w2, "W_002 - training": c_w2 - c_tr}).loc[
        list(gap.index[:8]) + list(gap.index[-3:])]
    from sklearn.metrics import roc_auc_score
    y_c = (w2[TARGET_COLUMN] == "Critical").values
    pcrit = proba_w2["Critical"].values
    auc = roc_auc_score(y_c, pcrit)
    thr_rows = []
    for q in (0.5, 0.9):
        t = float(np.quantile(pcrit[y_c], 1 - q))
        flagged = pcrit >= t
        thr_rows.append({"Critical seconds caught": f"{q:.0%}", "P(Critical) threshold": t,
                         "non-Critical seconds also flagged": int((flagged & ~y_c).sum()),
                         "precision": float((flagged & y_c).sum() / flagged.sum())})
    thr = pd.DataFrame(thr_rows)
    L += ["## 5. What the model sees", "", cm_txt,
          "Predicted P(Critical):", "", md(pc), "",
          f"Ranking quality on W_002 (Critical vs rest, ROC AUC of P(Critical)): **{auc:.3f}**. What a lowered "
          "threshold would cost (diagnostic only - choosing a threshold on W_002 is not allowed):", "",
          thr.to_markdown(index=False, floatfmt=".3f"), "",
          "Critical-vs-Warning score of the logistic model, averaged over Critical seconds "
          f"(> 0 favours Critical): training **{c_tr.sum() + icpt:+.2f}**, W_002 **{c_w2.sum() + icpt:+.2f}**. "
          "Per-feature contributions (coefficient x standardized value), largest losses and gains for W_002:", "",
          md(dec), "",
          "The largest coefficients for Critical-over-Warning are `hr_critical_exposure_sec`, UV level and trend, "
          "body-temperature deviation and `temp_warning_exposure_sec`. W_002's Critical seconds lack the HR-critical "
          "exposure and body-temperature rise typical of synthetic Critical, and the heat exposure present in 94-99 % of "
          "all training Critical seconds; their UV evidence raises the score but cannot offset that.", ""]

    # 6. Exposure features: over-specialised? ----------------------------------
    co = pd.DataFrame({src: {
        "P(Critical | heat counter active)": (g.loc[g[HAZARDS['heat']] > 0, TARGET_COLUMN] == "Critical").mean(),
        "P(Critical | UV-critical counter active)": (g.loc[g[HAZARDS['uv_crit']] > 0, TARGET_COLUMN] == "Critical").mean(),
        "P(Critical | HR-critical counter active)": (g.loc[g[HAZARDS['hr_crit']] > 0, TARGET_COLUMN] == "Critical").mean(),
        "P(heat active | Critical)": (g.loc[g[TARGET_COLUMN] == "Critical", HAZARDS['heat']] > 0).mean(),
    } for src, g in d.groupby("source", sort=False)}).round(3).astype(object).where(lambda x: x.notna(), "n/a (never active)")
    L += ["## 6. Are the exposure-duration features over-specialized?", "", md(co), ""]
    res_path = OUTPUTS_DIR / "experiment_results.csv"
    e2_note = ""
    if res_path.exists():
        r = pd.read_csv(res_path)
        e2 = r[r.experiment == "EXP2"].pivot_table(index="model", columns="feature_set", values="critical_recall")
        e2 = e2[[c for c in ("BASIC_PERSONALIZED", "TEMPORAL_PERSONALIZED", "EXTENDED") if c in e2.columns]]
        if {"Logistic Regression"} <= set(e2.index) and {"BASIC_PERSONALIZED", "TEMPORAL_PERSONALIZED", "EXTENDED"} <= set(e2.columns):
            lr = e2.loc["Logistic Regression"]
            e2_note = (f" Direct evidence: in Experiment 2 Logistic Regression detects {lr['BASIC_PERSONALIZED']:.1%} (BASIC) and "
                       f"{lr['TEMPORAL_PERSONALIZED']:.1%} (TEMPORAL) of W_002 Critical seconds, but {lr['EXTENDED']:.1%} once the "
                       "exposure counters are added (EXTENDED). The tree models detect none with any feature set, so the counters "
                       "make the problem worse but are not its only cause.")
        L += ["Experiment 2 (synthetic + W_001 -> W_002) Critical recall by feature set "
              "(each with training-side-selected settings, from `outputs/experiment_results.csv`):", "", md(e2), ""]
    L += ["In the training data the counters encode *which* hazards co-occurred with Critical: heat exposure is "
          "active in 94-99 % of training Critical seconds, and the HR-critical counter marks the synthetic mechanism. "
          "A model given these counters learns \"Critical = long heat exposure and/or HR >= 40 % above baseline\". "
          "That makes the exposure features **specialized to the training hazard mechanisms**: they are highly "
          "informative inside that population and actively misleading for a Critical caused by a different hazard "
          "(here UV), because the *absence* of heat/HR-critical exposure is read as evidence against Critical.", ""]

    # Figure ------------------------------------------------------------------
    feats = ["hr_deviation_pct", "body_temp_deviation_c", "ambient_temp_rolling_mean_300s", "uv_rolling_mean_300s",
             "temp_warning_exposure_sec", "uv_critical_exposure_sec"]
    fig, axes = plt.subplots(2, 3, figsize=(14, 8))
    groups = [("synthetic", "Critical"), ("W_001", "Critical"), ("W_002", "Critical"), ("W_002", "Warning")]
    colors = [ps.SERIES[0], ps.SERIES[1], ps.STATUS["Critical"], ps.STATUS["Warning"]]
    for ax, f in zip(axes.ravel(), feats):
        data = [d[(d.source == s) & (d[TARGET_COLUMN] == c)][f].dropna().values for s, c in groups]
        bp = ax.boxplot(data, widths=0.55, patch_artist=True, showfliers=False,
                        medianprops={"color": ps.INK, "linewidth": 1.5}, whiskerprops={"color": ps.AXIS}, capprops={"color": ps.AXIS})
        for patch, col in zip(bp["boxes"], colors):
            patch.set_facecolor(col)
            patch.set_alpha(0.8)
            patch.set_edgecolor(ps.SURFACE)
        ax.set_xticks(range(1, 5))
        ax.set_xticklabels(["synthetic\nCritical", "W_001\nCritical", "W_002\nCritical", "W_002\nWarning"], fontsize=9)
        ax.set_title(f, fontsize=10.5, pad=8)
        ax.grid(axis="x", visible=False)
    fig.suptitle("W_002 Critical looks unlike training Critical: no heat, milder physiology, sustained UV",
                 x=0.01, ha="left", fontsize=13, fontweight="semibold", color=ps.INK)
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    fig.savefig(OUTPUTS_DIR / "critical_failure_feature_distributions.png", dpi=160, bbox_inches="tight")
    plt.close(fig)

    # Conclusion ----------------------------------------------------------------
    n_sig = cons[0]["training rows"]
    L += ["![feature distributions](critical_failure_feature_distributions.png)", "",
          "## 7. Conclusion", "",
          f"1. **Different hazard mechanism (main cause).** {share.loc['uv_crit', 'W_002']:.0%} of W_002 Critical seconds "
          f"have critical UV exposure and only {share.loc['heat', 'W_002']:.0%} have heat exposure; in training, "
          f"{share.loc['heat', 'synthetic']:.0%} (synthetic) and {share.loc['heat', 'W_001']:.0%} (W_001) of Critical seconds "
          f"have heat exposure. W_002's dominant Critical pattern occurs in only {n_sig} training rows.",
          "2. **Milder physiology.** W_002 Critical has a median HR deviation of "
          f"{crit_w2.hr_deviation_pct.median():.1f} % and body-temperature deviation of {crit_w2.body_temp_deviation_c.median():.2f} degC, "
          f"against {d[(d.source == 'synthetic') & (d[TARGET_COLUMN] == 'Critical')].hr_deviation_pct.median():.1f} % / "
          f"{d[(d.source == 'synthetic') & (d[TARGET_COLUMN] == 'Critical')].body_temp_deviation_c.median():.2f} degC "
          "in synthetic Critical. Its labels appear to be driven by the **duration** of UV-critical plus HR-warning "
          "exposure, not by physiological escalation.",
          "3. **The model's evidence points to Warning.** P(Critical) on W_002 Critical seconds stays far below the "
          f"decision boundary (median {np.median(pcrit[y_c]):.3f}), and in standardized feature space they sit closest to the "
          f"training *Warning* centroid. The model does rank them above most other seconds (AUC {auc:.2f}), "
          f"but catching even half of them would also flag {thr_rows[0]['non-Critical seconds also flagged']:,} "
          f"non-Critical seconds (precision {thr_rows[0]['precision']:.2f}). This is mainly a coverage problem, not a calibration problem.",
          "4. **Exposure features are over-specialized** to the training mechanisms (heat, HR-critical). They help "
          "within the training population and hurt for an unseen mechanism." + e2_note,
          f"5. **The synthetic data maps UV to risk differently.** When the UV-critical counter is active, only "
          f"{co.loc['P(Critical | UV-critical counter active)', 'synthetic']:.0%} of synthetic seconds are Critical, against "
          f"{co.loc['P(Critical | UV-critical counter active)', 'W_001']:.0%} (W_001) and "
          f"{co.loc['P(Critical | UV-critical counter active)', 'W_002']:.0%} (W_002). The synthetic Critical class is driven by "
          "heat and HR escalation, so synthetic augmentation cannot teach a UV-driven Critical mechanism.",
          "6. **Small external evidence base:** 260 seconds in 3 episodes.", "",
          "**Not a preprocessing bug:** the same rules reproduce the training features exactly (parity tests). "
          "Within W_002, Critical and Warning seconds with the same active hazards differ mainly in exposure duration, "
          "which is consistent with a duration-based labelling rule (inferred from the data, not from the labelling code).", "",
          "### Implications (no changes made here)", "",
          "* The training data does not cover all Critical mechanisms the labelling framework can produce. Future "
          "synthetic generation and real data collection should deliberately include UV-, gas- and noise-driven Critical "
          "episodes without heat. This is a design principle, not a W_002-specific tweak.",
          "* Until then, deterministic critical-exposure rules should run alongside the classifier.",
          "* **Any redesign motivated by this analysis must be validated on a NEW unseen real worker:** W_002 can no "
          "longer give an unbiased estimate.", ""]
    (OUTPUTS_DIR / "critical_failure_analysis.md").write_text("\n".join(L), encoding="utf-8")
    print("Written outputs/critical_failure_analysis.md and outputs/critical_failure_feature_distributions.png")


if __name__ == "__main__":
    main()
