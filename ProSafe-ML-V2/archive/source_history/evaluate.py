"""
ProSafe ML V2 -- frozen-model experiments (run AFTER src/train_models.py).

The frozen configuration (models/frozen_config.json) fixes algorithm, feature
set, feature order, hyperparameters, scaling, class weighting and label
mapping. Every experiment re-fits that SAME configuration on its own training
data; nothing here feeds back into selection.

  Experiment 1  Synthetic -> Synthetic      leave-one-synthetic-worker-out, pooled OOF
  Experiment 2  Synthetic -> W_002          train S_001..S_004, test once on W_002
  Experiment 3  W_001 + Synthetic -> W_002  PRIMARY; the shipped production artifact
  Experiment 4  W_001 -> W_002              real-only baseline

Reference rows (development data only, no W_002):
  DEV-CV        frozen config, leave-one-worker-out over the 5 development workers
  DEV-TRANSFER  Synthetic -> W_001

Post-freeze transparency (NOT used for any decision): every candidate x
feature set in the Experiment-3 setting; confidence-threshold coverage;
permutation importance on W_002.

Run from the project root:
    python src/evaluate.py
"""

from __future__ import annotations

import json

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import plot_style as ps
from modeling import ALGORITHMS, DEFAULT_PARAMS, METRIC_COLUMNS, compute_metrics, fit_model, lowo_cv
from predict import SafetyPredictor
from utils import (
    BEST_MODEL_META_PATH,
    EDA_OUTPUTS_DIR,
    EXPERIMENT_OUTPUTS_DIR,
    FEATURE_SETS,
    FROZEN_CONFIG_PATH,
    OUTPUTS_DIR,
    REAL_DEV_WORKER,
    RISK_CLASSES,
    SYNTHETIC_WORKERS,
    TARGET_COLUMN,
    WORKER_COLUMN,
    ensure_dirs,
    file_sha256,
    load_development_data,
    load_external_test_data,
    load_frozen_config,
)

SUMMARY_COLUMNS = ["experiment", "role", "training_data", "test_data", "model", "feature_set"] + METRIC_COLUMNS + ["n_train", "n_test"]
EXP_LABEL = {
    "EXP1": "Exp 1  Synthetic -> Synthetic",
    "EXP2": "Exp 2  Synthetic -> W_002",
    "EXP3": "Exp 3  W_001 + Synthetic -> W_002",
    "EXP4": "Exp 4  W_001 -> W_002",
}


def _row(exp, role, train_desc, test_desc, cfg, metrics, n_train) -> dict:
    r = {"experiment": exp, "role": role, "training_data": train_desc, "test_data": test_desc,
         "model": cfg["algorithm"], "feature_set": cfg["feature_set"]}
    r.update({k: metrics[k] for k in METRIC_COLUMNS})
    r.update({"n_train": int(n_train), "n_test": int(metrics["n_test"])})
    return r


def run_experiments(cfg, dev, w2):
    algo, fs, cols, params = cfg["algorithm"], cfg["feature_set"], cfg["feature_columns"], cfg["hyperparameters"]
    syn = dev[dev[WORKER_COLUMN].isin(SYNTHETIC_WORKERS)]
    w1 = dev[dev[WORKER_COLUMN] == REAL_DEV_WORKER]
    rows, cms, preds = [], {}, {}

    print("Experiment 1: Synthetic -> Synthetic (leave-one-synthetic-worker-out)")
    r1 = lowo_cv(syn, SYNTHETIC_WORKERS, algo, params, fs, cols)
    rows.append(_row("EXP1", "experiment", "S_001-S_004 (leave one synthetic worker out)",
                     "held-out synthetic worker (pooled out-of-fold)", cfg, r1.pooled, len(syn) - len(syn) / 4))
    rows[-1]["n_train"] = int(np.mean([f["n_train"] for f in r1.per_fold]))
    cms["EXP1"] = r1.pooled["confusion_matrix"]
    pd.DataFrame(r1.per_fold).drop(columns=["confusion_matrix"]).to_csv(EXPERIMENT_OUTPUTS_DIR / "exp1_per_fold.csv", index=False)

    print("Experiment 2: Synthetic -> W_002")
    m2 = fit_model(algo, params, syn, cols)
    p2 = m2.predict_labels(w2)
    met2 = compute_metrics(w2[TARGET_COLUMN], p2)
    rows.append(_row("EXP2", "experiment", "S_001-S_004 (all synthetic)", "W_002", cfg, met2, len(syn)))
    cms["EXP2"], preds["EXP2"] = met2["confusion_matrix"], p2

    print("Experiment 3: W_001 + Synthetic -> W_002 (production artifact)")
    predictor = SafetyPredictor.load()
    meta = joblib.load(BEST_MODEL_META_PATH)
    if meta["frozen_config_sha256"] != file_sha256(FROZEN_CONFIG_PATH):
        raise RuntimeError("Production artifact was not trained from the current frozen_config.json")
    assert predictor.model_name == algo and predictor.feature_columns == cols
    p3 = predictor.predict_frame(w2)
    refit = fit_model(algo, params, dev, cols).predict_labels(w2)
    agreement = float((refit == p3).mean())
    met3 = compute_metrics(w2[TARGET_COLUMN], p3)
    rows.append(_row("EXP3", "experiment (PRIMARY)", "W_001 + S_001-S_004", "W_002", cfg, met3, len(dev)))
    cms["EXP3"], preds["EXP3"] = met3["confusion_matrix"], p3

    print("Experiment 4: W_001 -> W_002")
    m4 = fit_model(algo, params, w1, cols)
    p4 = m4.predict_labels(w2)
    met4 = compute_metrics(w2[TARGET_COLUMN], p4)
    rows.append(_row("EXP4", "experiment", "W_001 only", "W_002", cfg, met4, len(w1)))
    cms["EXP4"], preds["EXP4"] = met4["confusion_matrix"], p4

    print("Reference: DEV-CV and DEV-TRANSFER (development data only)")
    rdev = lowo_cv(dev, SYNTHETIC_WORKERS + [REAL_DEV_WORKER], algo, params, fs, cols)
    rows.append(_row("DEV-CV", "reference (development)", "4 of 5 development workers",
                     "held-out development worker (pooled out-of-fold)", cfg, rdev.pooled, 0))
    rows[-1]["n_train"] = int(np.mean([f["n_train"] for f in rdev.per_fold]))
    w1_fold = next(f for f in rdev.per_fold if f["held_out_worker"] == REAL_DEV_WORKER)
    rows.append(_row("DEV-TRANSFER", "reference (development)", "S_001-S_004 (all synthetic)", "W_001", cfg, w1_fold, w1_fold["n_train"]))
    pd.DataFrame(rdev.per_fold).drop(columns=["confusion_matrix"]).to_csv(EXPERIMENT_OUTPUTS_DIR / "dev_cv_frozen_per_fold.csv", index=False)

    return pd.DataFrame(rows)[SUMMARY_COLUMNS], cms, preds, predictor, agreement


def post_freeze_all_candidates(dev, w2) -> pd.DataFrame:
    """Transparency only: how every candidate would have done on W_002 (Experiment-3 setting)."""
    cfg = load_frozen_config()
    out = []
    for fs, cols in FEATURE_SETS.items():
        for algo in ALGORITHMS:
            frozen = algo == cfg["algorithm"] and fs == cfg["feature_set"]
            params = cfg["hyperparameters"] if algo == cfg["algorithm"] else DEFAULT_PARAMS[algo]
            m = fit_model(algo, params, dev, cols)
            met = compute_metrics(w2[TARGET_COLUMN], m.predict_labels(w2))
            out.append({"model": algo, "feature_set": fs, "is_frozen_choice": frozen,
                        "hyperparameters": "frozen (tuned)" if algo == cfg["algorithm"] else "default",
                        **{k: met[k] for k in METRIC_COLUMNS}})
    df = pd.DataFrame(out)
    df.to_csv(EXPERIMENT_OUTPUTS_DIR / "w002_all_candidates_post_freeze.csv", index=False)
    return df


def confidence_analysis(predictor, w2) -> pd.DataFrame:
    """Backend accepts a prediction only if max probability >= ML_CONFIDENCE_THRESHOLD (0.70)."""
    proba = predictor.predict_proba_frame(w2)
    if proba is None:
        return pd.DataFrame()
    pred = predictor.predict_frame(w2)
    conf = proba.max(axis=1).values
    y = w2[TARGET_COLUMN].values
    rows = []
    for thr in (0.5, 0.6, 0.7, 0.8, 0.9):
        acc = conf >= thr
        crit = y == "Critical"
        rows.append({"threshold": thr, "accepted_share": acc.mean(),
                     "accuracy_when_accepted": (pred[acc] == y[acc]).mean() if acc.any() else np.nan,
                     "critical_rows_accepted_share": acc[crit].mean() if crit.any() else np.nan,
                     "critical_recall_among_accepted": (pred[acc & crit] == "Critical").mean() if (acc & crit).any() else np.nan})
    df = pd.DataFrame(rows)
    df.to_csv(EXPERIMENT_OUTPUTS_DIR / "exp3_confidence_threshold_analysis.csv", index=False)
    return df


def feature_importance(predictor, w2, n_repeats=3) -> tuple[pd.DataFrame, pd.DataFrame]:
    cols = predictor.feature_columns
    model = predictor.model
    if hasattr(model, "get_booster"):
        gain = model.get_booster().get_score(importance_type="gain")
        imp = pd.Series({c: gain.get(c, 0.0) for c in cols})
        kind = "XGBoost gain"
    elif hasattr(model, "feature_importances_"):
        imp = pd.Series(model.feature_importances_, index=cols)
        kind = "impurity decrease"
    elif hasattr(model, "coef_"):
        imp = pd.Series(np.abs(model.coef_).mean(axis=0), index=cols)
        kind = "mean |coefficient| (standardized)"
    else:
        imp = pd.Series(np.nan, index=cols)
        kind = "n/a"
    builtin = (imp / imp.sum()).sort_values(ascending=False).rename("importance").to_frame()
    builtin["kind"] = kind
    builtin.to_csv(EXPERIMENT_OUTPUTS_DIR / "feature_importance_builtin.csv")

    rng = np.random.default_rng(42)
    y = w2[TARGET_COLUMN].values
    base = compute_metrics(y, predictor.predict_frame(w2))["macro_f1"]
    drops = {}
    for c in cols:
        d = []
        for _ in range(n_repeats):
            shuf = w2.copy()
            shuf[c] = rng.permutation(shuf[c].values)
            d.append(base - compute_metrics(y, predictor.predict_frame(shuf))["macro_f1"])
        drops[c] = (np.mean(d), np.std(d))
    perm = pd.DataFrame(drops, index=["macro_f1_drop_mean", "macro_f1_drop_std"]).T.sort_values("macro_f1_drop_mean", ascending=False)
    perm.to_csv(EXPERIMENT_OUTPUTS_DIR / "feature_importance_permutation_w002.csv")
    return builtin, perm


# ---------------------------------------------------------------------------
# Charts
# ---------------------------------------------------------------------------
def charts(summary, cms, builtin, perm, cfg):
    ps.apply()
    exp = summary[summary.experiment.isin(EXP_LABEL)].set_index("experiment").loc[list(EXP_LABEL)]
    labels = [EXP_LABEL[e] for e in exp.index]
    for metric, fname, title, sub, lo_better in [
        ("macro_f1", "experiments_macro_f1.png", "Macro F1 by experiment", "Frozen model; Exp 3 is the shipped production candidate", False),
        ("balanced_accuracy", "experiments_balanced_accuracy.png", "Balanced accuracy by experiment", "Mean of per-class recall", False),
        ("critical_recall", "experiments_critical_recall.png", "Critical recall by experiment", "Share of true Critical seconds predicted Critical", False),
        ("critical_false_negative_rate", "experiments_critical_fnr.png", "Critical false-negative rate by experiment",
         "Share of true Critical seconds NOT predicted Critical (lower is better)", True),
    ]:
        fig, ax = plt.subplots(figsize=(9, 3.6))
        vals = [float(v) for v in exp[metric]]
        ps.single_hbar(ax, labels, vals, xlim=(0, 1.08), highlight=2)
        ax.set_title(title)
        ps.subtitle(ax, sub)
        ps.save(fig, EXPERIMENT_OUTPUTS_DIR / fname)

    # transfer gap
    dev_t = summary[summary.experiment == "DEV-TRANSFER"].iloc[0]
    scen = ["Synthetic -> Synthetic (Exp 1)", "Synthetic -> W_001 (dev)", "Synthetic -> W_002 (Exp 2)"]
    vals = {"Macro F1": [exp.loc["EXP1", "macro_f1"], dev_t["macro_f1"], exp.loc["EXP2", "macro_f1"]],
            "Critical recall": [exp.loc["EXP1", "critical_recall"], dev_t["critical_recall"], exp.loc["EXP2", "critical_recall"]]}
    fig, ax = plt.subplots(figsize=(9, 4.2))
    ps.grouped_hbar(ax, scen, {k: [float(x) for x in v] for k, v in vals.items()},
                    {"Macro F1": ps.SERIES[0], "Critical recall": ps.SERIES[1]}, xlim=(0, 1.1))
    gap = float(exp.loc["EXP1", "macro_f1"] - exp.loc["EXP2", "macro_f1"])
    ax.set_title("Synthetic-to-real transfer gap")
    ps.subtitle(ax, f"Model trained on synthetic workers only; macro F1 drops by {gap:.3f} from held-out synthetic workers to real W_002")
    ax.legend(loc="lower center", bbox_to_anchor=(0.5, -0.27), ncol=2)
    ps.save(fig, EXPERIMENT_OUTPUTS_DIR / "transfer_gap.png")

    # confusion matrix (primary)
    def cm_plot(ax, cm, title):
        cm = np.asarray(cm)
        pct = cm / cm.sum(axis=1, keepdims=True).clip(min=1)
        from matplotlib.colors import LinearSegmentedColormap
        cmap = LinearSegmentedColormap.from_list("seq", ps.SEQ_BLUE)
        ax.imshow(pct, cmap=cmap, vmin=0, vmax=1)
        for i in range(3):
            for j in range(3):
                ax.text(j, i, f"{cm[i, j]:,}\n{pct[i, j]:.1%}", ha="center", va="center", fontsize=10,
                        color="white" if pct[i, j] > 0.55 else ps.INK)
        ax.set_xticks(range(3))
        ax.set_yticks(range(3))
        ax.set_xticklabels([f"pred {c}" for c in RISK_CLASSES])
        ax.set_yticklabels([f"true {c}" for c in RISK_CLASSES])
        ax.grid(False)
        ax.set_title(title, fontsize=11.5)

    fig, ax = plt.subplots(figsize=(6.4, 5.4))
    cm_plot(ax, cms["EXP3"], "W_002 confusion matrix - Exp 3 (W_001 + Synthetic)")
    ps.subtitle(ax, "Counts and row-normalised % (recall per true class)")
    ps.save(fig, EXPERIMENT_OUTPUTS_DIR / "w002_confusion_matrix.png")

    fig, axes = plt.subplots(2, 2, figsize=(12, 10.5))
    for ax, e in zip(axes.ravel(), EXP_LABEL):
        cm_plot(ax, cms[e], EXP_LABEL[e])
    ps.save(fig, EXPERIMENT_OUTPUTS_DIR / "experiments_confusion_matrices.png")

    # per-class F1
    fig, ax = plt.subplots(figsize=(10, 4.8))
    series = {c: [float(exp.loc[e, f"{c.lower()}_f1"]) for e in EXP_LABEL] for c in RISK_CLASSES}
    ps.grouped_hbar(ax, labels, series, ps.STATUS, xlim=(0, 1.1), bar_h=0.24)
    ax.set_title("Per-class F1 by experiment")
    ps.subtitle(ax, "Safe / Warning / Critical F1 of the frozen model")
    ax.legend(loc="lower center", bbox_to_anchor=(0.5, -0.24), ncol=3)
    ps.save(fig, EXPERIMENT_OUTPUTS_DIR / "per_class_f1.png")

    # feature importance
    top = 15
    fig, axes = plt.subplots(1, 2, figsize=(15, 6.2))
    b = builtin.head(top)
    ps.single_hbar(axes[0], list(b.index), list(b["importance"]), xlim=(0, b["importance"].max() * 1.25), fmt="{:.3f}")
    axes[0].set_title(f"Production model - {b['kind'].iloc[0]} (normalised)", fontsize=11.5)
    p = perm.head(top)
    ps.single_hbar(axes[1], list(p.index), list(p["macro_f1_drop_mean"]), color=ps.SERIES[1],
                   xlim=(min(0, p["macro_f1_drop_mean"].min()), max(1e-3, p["macro_f1_drop_mean"].max() * 1.25)), fmt="{:.3f}")
    axes[1].set_title("Permutation importance on W_002 (macro-F1 drop)", fontsize=11.5)
    fig.suptitle(f"Feature importance - {cfg['algorithm']} / {cfg['feature_set']}", x=0.01, ha="left",
                 fontsize=13, fontweight="semibold", color=ps.INK)
    ps.save(fig, EXPERIMENT_OUTPUTS_DIR / "feature_importance.png")


def write_summary(summary, cfg, agreement, all_cand, conf, builtin, perm) -> None:
    summary.to_csv(OUTPUTS_DIR / "experiment_summary.csv", index=False)
    e = summary.set_index("experiment")
    f = lambda x: f"{x:.4f}" if isinstance(x, (float, np.floating)) and not np.isnan(x) else str(x)  # noqa: E731
    key = ["accuracy", "balanced_accuracy", "macro_f1", "weighted_f1", "critical_recall", "critical_false_negative_rate",
           "critical_to_safe_rate", "n_train", "n_test"]
    lines = ["# ProSafe ML V2 - experiment summary", "",
             f"Frozen model: **{cfg['algorithm']}** on the **{cfg['feature_set']}** feature set "
             f"({len(cfg['feature_columns'])} features); frozen at {cfg['frozen_at_utc']} before W_002 was evaluated.", "",
             "Metrics cover Safe / Warning / Critical only. UNCERTAIN observations were removed upstream by the data-quality "
             "gate and are reported separately (data-quality coverage below), not in these confusion matrices.", "",
             "## Headline metrics", "",
             "| experiment | training data | test data | " + " | ".join(key) + " |",
             "|---|---|---|" + "---|" * len(key)]
    for exp_id, r in e.iterrows():
        lines.append(f"| {exp_id} | {r['training_data']} | {r['test_data']} | " + " | ".join(f(r[k]) for k in key) + " |")
    lines += ["", "## Per-class precision / recall / F1", "",
              "| experiment | " + " | ".join(f"{c} {m}" for c in ("safe", "warning", "critical") for m in ("P", "R", "F1")) + " |",
              "|---|" + "---|" * 9]
    for exp_id, r in e.iterrows():
        lines.append(f"| {exp_id} | " + " | ".join(f(r[f'{c}_{m}']) for c in ("safe", "warning", "critical")
                                                   for m in ("precision", "recall", "f1")) + " |")
    d = lambda a, b, m: e.loc[a, m] - e.loc[b, m]  # noqa: E731
    lines += ["", "## Comparisons", "",
              f"- **Synthetic-to-real transfer gap** (Exp 1 - Exp 2): macro F1 {d('EXP1', 'EXP2', 'macro_f1'):+.4f}, "
              f"critical recall {d('EXP1', 'EXP2', 'critical_recall'):+.4f}.",
              f"- **Effect of adding real W_001 to synthetic** (Exp 3 - Exp 2): macro F1 {d('EXP3', 'EXP2', 'macro_f1'):+.4f}, "
              f"balanced accuracy {d('EXP3', 'EXP2', 'balanced_accuracy'):+.4f}, critical recall {d('EXP3', 'EXP2', 'critical_recall'):+.4f}.",
              f"- **Effect of adding synthetic to real W_001** (Exp 3 - Exp 4): macro F1 {d('EXP3', 'EXP4', 'macro_f1'):+.4f}, "
              f"balanced accuracy {d('EXP3', 'EXP4', 'balanced_accuracy'):+.4f}, critical recall {d('EXP3', 'EXP4', 'critical_recall'):+.4f}, "
              f"Critical->Safe {d('EXP3', 'EXP4', 'critical_to_safe_rate'):+.4f}.",
              f"- Production artifact vs fresh refit of the frozen config on W_002: {agreement:.4%} identical predictions.", "",
              "## Post-freeze transparency: every candidate in the Experiment-3 setting (NOT used for selection)", "",
              all_cand.round(4).to_markdown(index=False), "",
              "## Exp 3 confidence-threshold coverage (backend accepts max probability >= 0.70)", "",
              conf.round(4).to_markdown(index=False) if len(conf) else "(model has no probabilities)", "",
              "## Feature importance (production model)", "",
              builtin.head(15).round(4).to_markdown(), "",
              "Permutation importance on W_002 (macro-F1 drop, 3 repeats):", "",
              perm.head(15).round(4).to_markdown(), ""]
    cov_path = EDA_OUTPUTS_DIR / "data_quality_coverage_inferred.csv"
    if cov_path.exists():
        cov = pd.read_csv(cov_path)
        tot = cov.groupby("worker_id")[["expected_observations_1hz", "ml_ready_observations_valid_or_imputed",
                                        "uncertain_observations_inferred"]].sum()
        tot["uncertain_pct"] = (100 * tot["uncertain_observations_inferred"] / tot["expected_observations_1hz"]).round(2)
        lines += ["## Data-quality coverage (INFERRED from the 1 Hz timeline; no audit file available)", "",
                  tot.to_markdown(), ""]
    (OUTPUTS_DIR / "experiment_summary.md").write_text("\n".join(lines), encoding="utf-8")


def charts_only() -> None:
    """Redraw experiment charts from saved outputs (no refitting)."""
    cfg = load_frozen_config()
    summary = pd.read_csv(OUTPUTS_DIR / "experiment_summary.csv")
    cms = {k: v["matrix"] for k, v in json.loads((EXPERIMENT_OUTPUTS_DIR / "confusion_matrices.json").read_text()).items()}
    builtin = pd.read_csv(EXPERIMENT_OUTPUTS_DIR / "feature_importance_builtin.csv", index_col=0)
    perm = pd.read_csv(EXPERIMENT_OUTPUTS_DIR / "feature_importance_permutation_w002.csv", index_col=0)
    charts(summary, cms, builtin, perm, cfg)


def main() -> None:
    import sys
    ensure_dirs()
    if "--charts-only" in sys.argv:
        charts_only()
        return
    cfg = load_frozen_config()
    print(f"Frozen config: {cfg['algorithm']} / {cfg['feature_set']} (frozen {cfg['frozen_at_utc']})")
    dev = load_development_data()
    w2 = load_external_test_data()
    summary, cms, preds, predictor, agreement = run_experiments(cfg, dev, w2)
    (EXPERIMENT_OUTPUTS_DIR / "confusion_matrices.json").write_text(json.dumps(
        {k: {"labels": RISK_CLASSES, "matrix": v} for k, v in cms.items()}, indent=2), encoding="utf-8")
    pd.DataFrame({WORKER_COLUMN: w2[WORKER_COLUMN], "timestamp": w2["timestamp"], "y_true": w2[TARGET_COLUMN],
                  **{f"pred_{k}": v for k, v in preds.items()}}).to_csv(EXPERIMENT_OUTPUTS_DIR / "w002_predictions.csv", index=False)
    print("Post-freeze analyses ...")
    all_cand = post_freeze_all_candidates(dev, w2)
    conf = confidence_analysis(predictor, w2)
    builtin, perm = feature_importance(predictor, w2)
    charts(summary, cms, builtin, perm, cfg)
    write_summary(summary, cfg, agreement, all_cand, conf, builtin, perm)
    print(summary[["experiment", "macro_f1", "balanced_accuracy", "critical_recall", "critical_false_negative_rate",
                   "critical_to_safe_rate", "n_train", "n_test"]].round(4).to_string(index=False))
    print(f"\nWritten: {OUTPUTS_DIR / 'experiment_summary.csv'} and .md")


if __name__ == "__main__":
    main()
