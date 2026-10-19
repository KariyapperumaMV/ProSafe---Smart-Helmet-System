"""
ProSafe ML V2 -- real-worker combination: train on two real workers (W_001 + W_002), evaluate on W_003.

    EXPERIMENT V4   W_001 + W_002 -> W_003

The training side is imported unchanged from run_experiments.py (feature sets, four algorithms, 12 seeded
configurations x 3 feature sets = 36 candidates per algorithm, fold-internal imputation / scaling / class weights /
XGBoost early stopping, and the selection rule). Training-side validation is LeaveOneGroupOut by worker_id over the
two training workers (2 folds: validate W_001, validate W_002). W_003 is loaded and validated by run_experiment_v2.py's
loader and never enters the training context; each selected configuration is refitted on W_001 + W_002, frozen
(saved), and only then scored once on W_003.

Methodological status: this strategy was specified after run_experiment_v2.py had produced W_003 results, so W_003 is
no longer untouched for the decision to try it. V4 is an additional comparative evaluation on W_003, not a pristine
independent test.

Nothing here changes the production model, earlier experiment models or earlier outputs. New files go to
outputs/experiment_v4/ and models/experiment_v4/ only.

Run from the project root:
    python src/run_experiment_v4.py                  # full run
    python src/run_experiment_v4.py --check          # validations only
    python src/run_experiment_v4.py --report-only    # rebuild reports/plots from the frozen models + CSV
    python src/run_experiment_v4.py --audit PATH     # optional W_003 audit file for the post-hoc analysis
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import warnings
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import classification_report

import plot_style as ps
import run_experiments as rx
import run_experiment_v2 as v2
from modeling import fit_model
from utils import (
    BEST_MODEL_META_PATH,
    BEST_MODEL_PATH,
    DATA_DIR,
    EXTENDED_FEATURE_COLUMNS,
    LABEL_ENCODER_PATH,
    MODELS_DIR,
    OUTPUTS_DIR,
    RANDOM_STATE,
    RISK_CLASSES,
    TARGET_COLUMN,
    TIMESTAMP_COLUMN,
    W001_DATA_PATH,
    W002_DATA_PATH,
    WORKER_COLUMN,
    _read_ml_ready,
    is_forbidden_predictor,
    load_external_test_data,
    model_slug,
)

NEW_WORKER = v2.NEW_WORKER  # W_003
OUT_DIR = OUTPUTS_DIR / "experiment_v4"
MODEL_OUT_DIR = MODELS_DIR / "experiment_v4"
V2_RESULTS = OUTPUTS_DIR / "experiment_v2" / "w003_results.csv"
LINE = rx.LINE
ALGORITHMS = rx.ALGORITHMS
FEATURE_SETS = rx.FEATURE_SETS
SHORT = rx.SHORT
METRICS = {"accuracy": "Accuracy", "balanced_accuracy": "Balanced Accuracy", "macro_f1": "Macro F1",
           "critical_recall": "Critical Recall", "critical_f1": "Critical F1"}
EXP = {"id": 4, "key": "V4", "name": "W_001 + W_002 -> W_003", "strategy": "Real workers W_001 + W_002",
       "short": "W_001 + W_002", "train": ["W_001", "W_002"], "cv": "workers"}
FILES = {"W_001": W001_DATA_PATH.name, "W_002": W002_DATA_PATH.name, NEW_WORKER: v2.W003_DATA_PATH.name}
# Strategies on the same W_003 worker: V2 experiments 1-3 (saved results) + this V4.
STRATEGIES = {"EXP1": "Synthetic only", "EXP2": "Synthetic + W_001", "EXP3": "W_001 only", "V4": "W_001 + W_002"}


# ---------------------------------------------------------------------------
# Protected files (hashed before and after)
# ---------------------------------------------------------------------------
def protected_files() -> list[Path]:
    prod = [BEST_MODEL_PATH, BEST_MODEL_META_PATH, MODELS_DIR / "all_models_meta.pkl", LABEL_ENCODER_PATH,
            MODELS_DIR / "frozen_config.json"]
    files = [p for p in prod if p.exists()] + sorted(p for p in OUTPUTS_DIR.iterdir() if p.is_file())
    for d in (MODELS_DIR / "experiments", MODELS_DIR / "experiment_v2", MODELS_DIR / "experiment_v3",
              OUTPUTS_DIR / "experiment_v2", OUTPUTS_DIR / "experiment_v3"):
        if d.exists():
            files += sorted(p for p in d.iterdir() if p.is_file())
    return files + sorted(DATA_DIR.glob("*.csv")) + [rx.SRC_DIR / f for f in
                                                      ("run_experiments.py", "run_experiment_v2.py", "run_experiment_v3.py")
                                                      if (rx.SRC_DIR / f).exists()]


def snapshot() -> dict[str, str]:
    out = {}
    for p in protected_files():
        h = hashlib.sha256()
        with open(p, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        out[v2.rel(p)] = h.hexdigest()
    return out


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------
def check_training_file(df: pd.DataFrame, worker: str, path: Path) -> None:
    cols = [c for c in df.columns if not c.startswith("_")]
    if set(cols) != set(v2.EXPECTED_COLUMNS) or len(cols) != len(v2.EXPECTED_COLUMNS):
        raise ValueError(f"{path.name} columns differ from the V2 contract")
    if set(df[WORKER_COLUMN]) != {worker}:
        raise ValueError(f"{path.name} contains worker IDs {sorted(set(df[WORKER_COLUMN]))}")
    bad = [c for c in cols if c not in (WORKER_COLUMN, TIMESTAMP_COLUMN, TARGET_COLUMN) and is_forbidden_predictor(c)]
    if bad:
        raise ValueError(f"{path.name}: forbidden predictor columns {bad}")


def load_sources() -> dict[str, pd.DataFrame]:
    """W_001 (development worker) and W_002 (guarded loader: frozen-config gate + label check) as TRAINING data."""
    src = {"W_001": _read_ml_ready(W001_DATA_PATH), "W_002": load_external_test_data()}
    check_training_file(src["W_001"], "W_001", W001_DATA_PATH)
    check_training_file(src["W_002"], "W_002", W002_DATA_PATH)
    return src


def class_counts(df: pd.DataFrame) -> str:
    vc = df[TARGET_COLUMN].value_counts()
    return ", ".join(f"{c} {int(vc.get(c, 0)):,}" for c in RISK_CLASSES)


# ---------------------------------------------------------------------------
# Training + single W_003 evaluation
# ---------------------------------------------------------------------------
def save_frozen(algo, chosen, params, cols, fm, ctx, models_dir: Path) -> Path:
    models_dir.mkdir(parents=True, exist_ok=True)
    path = models_dir / f"{model_slug(algo)}.pkl"
    joblib.dump({
        "experiment": EXP["key"], "experiment_name": EXP["name"], "training_strategy": EXP["strategy"],
        "external_evaluation_worker": NEW_WORKER, "algorithm": algo, "feature_set": chosen["feature_set"],
        "feature_columns": cols, "hyperparameters": params, "model": fm.estimator, "scaler": fm.preprocessor,
        "use_scaled": fm.use_scaled, "label_encoder": fm.label_encoder, "classes": RISK_CLASSES,
        "trained_on": [FILES[s] for s in EXP["train"]], "n_train": len(ctx.train),
        "cross_validation": {k: chosen[k] for k in chosen if k.startswith("cv_")},
        "note": "Frozen on the training side before W_003 was scored. Evaluation-study model, NOT the production model.",
    }, path)
    return path


def load_frozen(algo: str, models_dir: Path):
    a = joblib.load(models_dir / f"{model_slug(algo)}.pkl")
    return v2.FittedModel(algo, a["hyperparameters"], list(a["feature_columns"]), a["model"], a["scaler"], a["label_encoder"])


def run_v4(sources: dict, w3: pd.DataFrame, models_dir: Path, smoke: bool) -> dict:
    ctx = v2.TrainingContext(EXP, sources, row_step=3 if smoke else 1)  # refuses W_003 in sources / training
    print(f"\n{LINE}\nEXPERIMENT V4: {EXP['name'].upper()}\n{LINE}")
    print(f"Training rows: {len(ctx.train):,}  (" + ", ".join(
        f"{w} {int((ctx.train[WORKER_COLUMN] == w).sum()):,}" for w in dict.fromkeys(ctx.train[WORKER_COLUMN])) + ")")
    print(f"Testing rows:  {len(w3):,}  ({NEW_WORKER})\n")
    print("Training class distribution:\n" + rx.class_distribution(ctx.train))
    print("\nTesting class distribution:\n" + rx.class_distribution(w3))
    print(f"\nTraining-side validation: {ctx.cv_desc}")

    finals, preds, fitted = [], {}, {}
    for algo in ALGORITHMS:
        print(f"\nOptimizing {algo} on training data only...")
        t0 = time.time()
        configs = rx.sample_configs(algo)[: 1 if smoke else None]
        cands = rx.evaluate_candidates(ctx, algo, configs)  # training side only
        valid = [c for c in cands if c["converged"]]
        if smoke and not valid:
            valid = cands
        chosen = rx.select(valid, "cv_")
        params = dict(chosen["params"])
        if algo == "XGBoost":
            params["n_estimators"] = chosen["trees_median"]
        cols = FEATURE_SETS[chosen["feature_set"]]
        fm = fit_model(algo, params, ctx.train, cols, probability=(algo == "SVM"))
        path = save_frozen(algo, chosen, params, cols, fm, ctx, models_dir)  # frozen BEFORE W_003 is scored

        pred = fm.predict_labels(w3)  # the single W_003 evaluation of this frozen model
        m = rx.full_metrics(w3[TARGET_COLUMN].values, pred)
        flag = v2.w003_flag(m)
        finals.append({
            "experiment": EXP["key"], "experiment_name": EXP["name"], "training_strategy": EXP["strategy"],
            "evaluation_worker": NEW_WORKER, "training_data": " + ".join(FILES[s] for s in EXP["train"]),
            "model": algo, "feature_set": chosen["feature_set"], "n_features": len(cols),
            "hyperparameters": json.dumps(params), "candidates_evaluated": len(cands),
            "non_converged_discarded": len(cands) - len(valid),
            **{k: chosen[k] for k in chosen if k.startswith("cv_")},
            **{k: v for k, v in m.items() if k != "confusion_matrix"},
            "confusion_matrix": json.dumps(m["confusion_matrix"]), "critical_flag": flag or "OK",
            "n_train": len(ctx.train), "n_w003": len(w3), "model_file": v2.rel(path),
            "optimization_seconds": round(time.time() - t0, 1)})
        preds[algo], fitted[algo] = pred, fm
        print(f"  Candidates evaluated: {len(cands)} ({len(configs)} configurations x 3 feature sets)"
              + (f", {len(cands) - len(valid)} non-converged discarded" if len(cands) > len(valid) else ""))
        print(f"  Selected feature set: {chosen['feature_set']}")
        print(f"  Selected parameters:  {rx.fmt_params(params)}")
        print(f"  CV Accuracy:          {chosen['cv_accuracy']:.4f}")
        print(f"  CV Macro F1:          {chosen['cv_macro_f1']:.4f}")
        print(f"  Frozen model:         {v2.rel(path)}")
        print(f"  W_003 Accuracy:       {m['accuracy']:.4f}")
        print(f"  W_003 Balanced Acc.:  {m['balanced_accuracy']:.4f}")
        print(f"  W_003 Macro F1:       {m['macro_f1']:.4f}")
        print(f"  W_003 Critical P/R/F1: {m['critical_precision']:.4f} / {m['critical_recall']:.4f} / {m['critical_f1']:.4f}")
        print(f"  Critical -> Warning:  {m['critical_to_warning_count']} ({m['critical_to_warning_pct']:.1f} %)   "
              f"Critical -> Safe: {m['critical_to_safe_count']} ({m['critical_to_safe_pct']:.1f} %)")
        if flag:
            print(f"  !! {flag}")
        print(f"  Time: {(time.time() - t0) / 60:.1f} min")
    return {"finals": finals, "preds": preds, "fitted": fitted, "cv_desc": ctx.cv_desc}


def print_comparison(res: pd.DataFrame, preds: dict, w3: pd.DataFrame) -> dict:
    print(f"\n{LINE}\nMODEL COMPARISON ON W_003\n{LINE}")
    print(v2.comparison_table(v2.with_rates(res)).to_string(index=False, float_format=lambda v: f"{v:.4f}"))
    for _, r in res.iterrows():
        if r.critical_flag != "OK":
            print(f"  !! {r.model}: {r.critical_flag}")
    print("\nDETAILED CLASSIFICATION REPORTS ON W_003")
    for _, r in res.iterrows():
        print(f"\n--- {r.model} ({r.feature_set}) ---")
        print(classification_report(w3[TARGET_COLUMN], preds[r.model], labels=RISK_CLASSES, digits=4, zero_division=0))
        print("Confusion matrix (rows = true, columns = predicted: Safe, Warning, Critical)")
        for c, row in zip(RISK_CLASSES, json.loads(r.confusion_matrix)):
            print(f"  {c:<9}{row[0]:>8,}{row[1]:>8,}{row[2]:>8,}")
    best = rx.select(v2.with_rates(res), "")
    cvb = rx.select(v2.with_rates(res), "cv_")
    print(f"\n{LINE}\nBEST MODEL\n{LINE}")
    print(f"Best V4 model on W_003 (accuracy-band selection rule, descriptive only): {best['model']} ({best['feature_set']})")
    print(f"Training-side choice (selection rule on CV metrics, W_003 not used): {cvb['model']} ({cvb['feature_set']})")
    print("Not deployed. The production model is unchanged.")
    return best


# ---------------------------------------------------------------------------
# Comparison with the V2 strategies on the same W_003 worker (descriptive)
# ---------------------------------------------------------------------------
def compare_strategies(res: pd.DataFrame, v2res: pd.DataFrame | None) -> dict | None:
    if v2res is None:
        return None
    allr = pd.concat([v2res, res], ignore_index=True)
    reps = {k: rx.select(v2.with_rates(allr[allr.experiment == k]), "") for k in STRATEGIES}
    best_key = rx.select(list(reps.values()), "")["experiment"]
    per_algo = {a: {k: allr[(allr.experiment == k) & (allr.model == a)].iloc[0] for k in STRATEGIES} for a in ALGORITHMS}
    means = allr.groupby("experiment")[list(METRICS)].mean().loc[list(STRATEGIES)]
    answers = {}
    for k in ("EXP1", "EXP2", "EXP3"):
        wins = {m: sum(per_algo[a]["V4"][m] > per_algo[a][k][m] for a in ALGORITHMS) for m in METRICS}
        rep_wins = rx.select([reps["V4"], reps[k]], "")["experiment"] == "V4"
        verdict = ("YES" if rep_wins and wins["macro_f1"] >= 3 else
                   "NO" if not rep_wins and wins["macro_f1"] <= 1 else "MIXED")
        answers[k] = {"wins": wins, "rep_wins": rep_wins, "verdict": verdict}
    prod = per_algo["XGBoost"]["EXP2"]
    v4x = per_algo["XGBoost"]["V4"]
    v4b = reps["V4"]
    overall = rx.select(v2.with_rates(allr), "")
    in_band = prod.accuracy >= allr.accuracy.max() - rx.ACCURACY_BAND - 1e-12
    prod_verdict = ("SUPPORTED" if overall["experiment"] == "EXP2" and overall["model"] == "XGBoost" else
                    "PARTIALLY SUPPORTED" if in_band else "NOT SUPPORTED")
    return {"all": allr, "reps": reps, "best_key": best_key, "per_algo": per_algo, "means": means, "answers": answers,
            "prod": prod, "v4_xgb": v4x, "v4_best": v4b, "overall": overall, "prod_verdict": prod_verdict,
            "prod_in_band": bool(in_band)}


# ---------------------------------------------------------------------------
# Post-hoc failure analysis -- NOT used for model selection
# ---------------------------------------------------------------------------
def posthoc(fitted: dict, preds: dict, w3: pd.DataFrame, sources: dict, best_model: str, audit_path: Path | None) -> dict:
    out = {"outcomes": v2.critical_outcomes([{"exp": {"id": 4}, "fitted": fitted, "preds": preds}], w3).drop(columns="experiment")}
    crit_w3 = w3[w3[TARGET_COLUMN] == "Critical"].copy()
    crit_w3["outcome"] = np.asarray(preds[best_model])[crit_w3.index]
    groups = {f"Train Critical: {w}": sources[w][sources[w][TARGET_COLUMN] == "Critical"] for w in EXP["train"]}
    groups["W_003 Critical (all)"] = crit_w3
    for o, label in (("Critical", "detected"), ("Warning", "-> Warning"), ("Safe", "-> Safe")):
        groups[f"W_003 Critical {label}"] = crit_w3[crit_w3.outcome == o]
    out["counts"] = {k: len(v) for k, v in groups.items()}
    out["medians"] = pd.DataFrame({k: v[v2.KEY_FEATURES].median() for k, v in groups.items() if len(v)}).round(2)
    pooled = pd.concat([groups[f"Train Critical: {w}"] for w in EXP["train"]])
    lo, hi = pooled[v2.KEY_FEATURES].quantile(0.10), pooled[v2.KEY_FEATURES].quantile(0.90)
    med = crit_w3[v2.KEY_FEATURES].median()
    out["mismatch"] = [(f, med[f], lo[f], hi[f], "below" if med[f] < lo[f] else "above")
                       for f in v2.KEY_FEATURES if med[f] < lo[f] or med[f] > hi[f]]
    d = pd.concat([sources[w].assign(source=w) for w in EXP["train"]] + [w3.assign(source=NEW_WORKER)], ignore_index=True)
    act = pd.DataFrame({k: d[v] > 0 for k, v in rx.HAZARDS.items()})
    d["signature"] = act.apply(lambda r: " + ".join(k for k in rx.HAZARDS if r[k]) or "(none)", axis=1)
    cr = d[d[TARGET_COLUMN] == "Critical"]
    out["hazard_share"] = pd.DataFrame({s: act.loc[g.index].mean() for s, g in cr.groupby("source", sort=False)}).round(3)
    sig = cr[cr.source == NEW_WORKER]["signature"].value_counts()
    out["w3_signatures"] = sig.head(5)
    out["train_labels_for_top_sig"] = {
        s: d[(d.source != NEW_WORKER) & (d.signature == s)][TARGET_COLUMN].value_counts().reindex(RISK_CLASSES, fill_value=0)
        for s in sig.index[:3]}
    out["episodes"] = {s: rx._episodes(g[TARGET_COLUMN].values) for s, g in d.groupby("source", sort=False)}
    _, kept, msg = v2.align_audit(audit_path, w3)
    out["audit_msg"] = msg
    if kept is not None:
        kc = kept.loc[crit_w3.index].assign(outcome=crit_w3.outcome.values)
        out["audit_rules"] = (kc.groupby("outcome")["rules_triggered"].apply(lambda s: s.fillna("(none)").value_counts())
                              .unstack(0).fillna(0).astype(int))
        out["train_rules"] = {}
        for w, fname in (("W_001", "prosafe_W001_preprocessed_audit.csv"), ("W_002", "prosafe_W002_preprocessed_audit.csv")):
            p = audit_path.parent / fname
            if p.exists():
                a = pd.read_csv(p, usecols=[TARGET_COLUMN, "rules_triggered"], low_memory=False)
                out["train_rules"][w] = a.loc[a[TARGET_COLUMN] == "Critical", "rules_triggered"].fillna("(none)").value_counts()
    return out


# ---------------------------------------------------------------------------
# Plots
# ---------------------------------------------------------------------------
def plot_model_comparison(res: pd.DataFrame, out_dir: Path) -> None:
    labels, keys = list(METRICS.values())[:4], list(METRICS)[:4]
    sub = res.set_index("model").loc[ALGORITHMS].reset_index()
    cats = [f"{r.model} ({SHORT[r.feature_set]})" + ("  - misses all Critical" if r.critical_recall == 0 else "")
            for _, r in sub.iterrows()]
    fig, ax = plt.subplots(figsize=(10.5, 6.2))
    ps.grouped_hbar(ax, cats, {m: sub[k].tolist() for m, k in zip(labels, keys)}, dict(zip(labels, ps.SERIES)),
                    xlim=(0, 1.12), bar_h=0.19)
    ax.set_title(f"Experiment V4: {EXP['name']}")
    ps.subtitle(ax, f"Training: W_001 + W_002 (LeaveOneGroupOut) - evaluated once on {NEW_WORKER}")
    ax.legend(loc="lower center", bbox_to_anchor=(0.45, -0.2), ncol=4)
    ps.save(fig, out_dir / "w003_model_comparison.png")


def _series(cmp_: dict, metric: str) -> dict:
    return {f"{k if k == 'V4' else 'Exp ' + k[-1]}: {v}": [float(cmp_["per_algo"][a][k][metric]) for a in ALGORITHMS]
            for k, v in STRATEGIES.items()}


def plot_strategy_comparison(cmp_: dict, out_dir: Path) -> None:
    fig, axes = plt.subplots(2, 2, figsize=(14, 11.5))
    for ax, m in zip(axes.flat, ["accuracy", "balanced_accuracy", "macro_f1", "critical_f1"]):
        s = _series(cmp_, m)
        ps.grouped_hbar(ax, ALGORITHMS, s, dict(zip(s, ps.SERIES)), xlim=(0, 1.15), bar_h=0.18, fmt="{:.2f}")
        ax.set_title(METRICS[m], fontsize=12)
    ps.subtitle(axes[0, 0], f"Four training strategies on the same worker {NEW_WORKER}")
    axes[1, 0].legend(loc="lower center", bbox_to_anchor=(1.05, -0.24), ncol=4)
    ps.save(fig, out_dir / "w003_strategy_comparison.png")


def plot_critical_recall(res: pd.DataFrame, cmp_: dict | None, out_dir: Path) -> None:
    s = _series(cmp_, "critical_recall") if cmp_ else {"V4: W_001 + W_002": res.set_index("model").loc[ALGORITHMS].critical_recall.tolist()}
    fig, ax = plt.subplots(figsize=(10.5, 6.6))
    ps.grouped_hbar(ax, ALGORITHMS, s, dict(zip(s, ps.SERIES)), xlim=(0, 1.12), bar_h=0.18)
    ax.set_title(f"Critical recall on {NEW_WORKER} by training strategy and algorithm")
    ps.subtitle(ax, f"{int(res.critical_support.iloc[0])} Critical seconds in {NEW_WORKER}; "
                    "V2 strategies from saved results, V4 from this run")
    ax.legend(loc="lower center", bbox_to_anchor=(0.45, -0.2), ncol=4)
    ps.save(fig, out_dir / "w003_critical_recall_comparison.png")


def plot_confusion(model: str, feature_set: str, cm, out_dir: Path) -> None:
    from matplotlib.colors import LinearSegmentedColormap
    cm = np.asarray(cm)
    pct = cm / cm.sum(axis=1, keepdims=True).clip(min=1)
    fig, ax = plt.subplots(figsize=(6.4, 5.4))
    ax.imshow(pct, cmap=LinearSegmentedColormap.from_list("seq", ps.SEQ_BLUE), vmin=0, vmax=1)
    for i in range(3):
        for j in range(3):
            ax.text(j, i, f"{cm[i, j]:,}\n{pct[i, j]:.1%}", ha="center", va="center", fontsize=10,
                    color="white" if pct[i, j] > 0.55 else ps.INK)
    ax.set_xticks(range(3))
    ax.set_yticks(range(3))
    ax.set_xticklabels([f"pred {c}" for c in RISK_CLASSES])
    ax.set_yticklabels([f"true {c}" for c in RISK_CLASSES])
    ax.grid(False)
    ax.set_title(f"V4: {model} ({SHORT[feature_set]}) on {NEW_WORKER}", fontsize=12)
    ps.subtitle(ax, "Best V4 model (descriptive) - counts and % of each true class")
    ps.save(fig, out_dir / "confusion_matrix_best_w003.png")


# ---------------------------------------------------------------------------
# Markdown report
# ---------------------------------------------------------------------------
f4 = v2.f4


def write_report(res, best, cmp_, prod, ph, sources, w3, cv_desc, runtime_min, out_dir: Path, smoke: bool, v2_path) -> None:
    na = w3[EXTENDED_FEATURE_COLUMNS].isna().sum()
    n1, n2 = len(sources["W_001"]), len(sources["W_002"])
    L = [f"# ProSafe ML V2 - real-worker combination: W_001 + W_002 -> {NEW_WORKER}", "",
         "Generated by `python src/run_experiment_v4.py`." + (" **SMOKE TEST - reduced budget, not a result.**" if smoke else ""), "",
         "## Purpose", "",
         f"How well does training on two real workers, W_001 and W_002, generalize to a new real worker, {NEW_WORKER}? "
         "The result is compared with the three run_experiment_v2.py strategies on the same worker.", "",
         "## Methodological status of W_003", "",
         f"* This V4 strategy was specified **after** run_experiment_v2.py had produced {NEW_WORKER} results. {NEW_WORKER} is "
         "therefore no longer untouched for the decision to try this strategy, and V4 is **an additional comparative "
         f"evaluation on {NEW_WORKER}**, not a pristine independent test. Comparing several strategies on the same worker "
         "and preferring the best one would also make that worker's score optimistic for the chosen strategy.",
         f"* Within this run, {NEW_WORKER} never entered the training context, the folds, early stopping, class weighting, "
         "feature-set selection or the selection rule. Each configuration was refitted on W_001 + W_002, saved (frozen) "
         f"and then scored once on {NEW_WORKER}. No code, feature, search space, threshold or data was changed for V4.",
         "* W_002 is used here as **training** data. It was previously the external test worker of run_experiments.py; it "
         "does not appear in any evaluation of this run.", "",
         "## Data", "",
         f"* Training: `{W001_DATA_PATH.name}` {n1:,} rows ({class_counts(sources['W_001'])}) + `{W002_DATA_PATH.name}` "
         f"{n2:,} rows ({class_counts(sources['W_002'])}) = {n1 + n2:,} rows.",
         f"* Evaluation: `{v2.W003_DATA_PATH.name}` {len(w3):,} rows, worker {NEW_WORKER} only ({class_counts(w3)}); "
         f"{int(na.sum()):,} missing cells in {int((na > 0).sum())} features. Not rebalanced; no rows removed or relabelled.",
         "* All three files: 41 columns (worker_id, timestamp, 38 EXTENDED features, risk_level) with the exact contract "
         "names and the same layout; worker_id is used only for grouping, timestamp only for ordering; no raw baseline, "
         "evidence, rule, quality or audit column is present.", "",
         "## Method (identical to run_experiments.py)", "",
         f"* Training-side validation: {cv_desc}.",
         f"* Algorithms: {', '.join(ALGORITHMS)}. Feature sets: " + ", ".join(f"{k} ({len(v)})" for k, v in FEATURE_SETS.items()) + ".",
         f"* Budget: {int(res.candidates_evaluated.iloc[0])} candidates per algorithm (12 seeded configurations x 3 feature "
         f"sets, seed {RANDOM_STATE}); the search spaces, class-weight handling and XGBoost early stopping of run_experiments.py.",
         f"* Selection rule: accuracy within {rx.ACCURACY_BAND} of the best CV accuracy, then macro F1 -> balanced accuracy "
         "-> Critical recall -> lowest Critical->Safe rate.", "",
         f"## Results on {NEW_WORKER}", "",
         "| model | feature set | accuracy | bal. acc. | macro P | macro R | macro F1 | weighted P | weighted R | weighted F1 | "
         "Crit P | Crit R | Crit F1 | Crit FN | Crit FN rate | Crit->Warning | Crit->Safe |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for _, r in res.iterrows():
        L.append(f"| {r.model} | {SHORT[r.feature_set]} | " + " | ".join(f4(r[c]) for c in (
            "accuracy", "balanced_accuracy", "macro_precision", "macro_recall", "macro_f1", "weighted_precision",
            "weighted_recall", "weighted_f1", "critical_precision", "critical_recall", "critical_f1")) +
            f" | {int(r.critical_false_negative_count)} | {f4(r.critical_false_negative_rate)} | "
            f"{int(r.critical_to_warning_count)} ({r.critical_to_warning_pct:.1f} %) | "
            f"{int(r.critical_to_safe_count)} ({r.critical_to_safe_pct:.1f} %) |")
    L += ["", "Per-class precision / recall / F1:", "", "| model | Safe | Warning | Critical |", "|---|---|---|---|"]
    for _, r in res.iterrows():
        L.append(f"| {r.model} | " + " | ".join(f"{r[c + '_precision']:.3f} / {r[c + '_recall']:.3f} / {r[c + '_f1']:.3f}"
                                               for c in ("safe", "warning", "critical")) + " |")
    L += ["", "Confusion matrices (rows true Safe / Warning / Critical; columns predicted in the same order):", ""]
    L += [f"* {r.model}: `{json.loads(r.confusion_matrix)}`" for _, r in res.iterrows()]
    L += [""] + [f"* {r.model}: **{r.critical_flag}**" for _, r in res.iterrows() if r.critical_flag != "OK"]
    L += ["", "Selected configurations (training side only):", ""]
    L += [f"* **{r.model}** - {r.feature_set}; {rx.fmt_params(json.loads(r.hyperparameters))}; CV accuracy {r.cv_accuracy:.4f}, "
          f"CV macro F1 {r.cv_macro_f1:.4f}; {r.optimization_seconds / 60:.1f} min." for _, r in res.iterrows()]
    cvb = rx.select(v2.with_rates(res), "cv_")
    L += ["", f"**Best V4 model** (accuracy-band selection rule on the {NEW_WORKER} results, descriptive only): "
          f"{best['model']} ({best['feature_set']}) - accuracy {best['accuracy']:.4f}, macro F1 {best['macro_f1']:.4f}, "
          f"Critical recall {best['critical_recall']:.4f}. Training-side choice (rule on CV metrics): {cvb['model']} "
          f"({cvb['feature_set']}). Not deployed.", "",
          f"Best accuracy {res.accuracy.max():.4f} ({res.loc[res.accuracy.idxmax(), 'model']}); best macro F1 "
          f"{res.macro_f1.max():.4f} ({res.loc[res.macro_f1.idxmax(), 'model']}); best Critical recall "
          f"{res.critical_recall.max():.4f} ({res.loc[res.critical_recall.idxmax(), 'model']}).", "",
          "![model comparison](w003_model_comparison.png)", "", "![confusion matrix](confusion_matrix_best_w003.png)", "",
          f"## Comparison with the run_experiment_v2.py strategies on {NEW_WORKER}", ""]
    if cmp_ is None:
        L += [f"* V2 results not found at `{v2.rel(v2_path)}`; comparison skipped.", ""]
    else:
        L += [f"Source of strategies 1-3: `{v2.rel(v2_path)}` (not re-run). All four strategies are scored on the same "
              f"{NEW_WORKER} rows.", "",
              "| model | metric | Exp 1 synthetic only | Exp 2 synthetic + W_001 | Exp 3 W_001 only | V4 W_001 + W_002 | "
              "V4 - Exp 1 | V4 - Exp 2 | V4 - Exp 3 |", "|---|---|---|---|---|---|---|---|---|"]
        for a in ALGORITHMS:
            p = cmp_["per_algo"][a]
            for m, lab in METRICS.items():
                L.append(f"| {a} | {lab} | {f4(p['EXP1'][m])} | {f4(p['EXP2'][m])} | {f4(p['EXP3'][m])} | {f4(p['V4'][m])} | "
                         f"{p['V4'][m] - p['EXP1'][m]:+.4f} | {p['V4'][m] - p['EXP2'][m]:+.4f} | {p['V4'][m] - p['EXP3'][m]:+.4f} |")
        L += ["", "Mean over the four algorithms:", "", "| strategy | " + " | ".join(METRICS.values()) + " |", "|---|---|---|---|---|---|"]
        for k, v in STRATEGIES.items():
            L.append(f"| {k} {v} | " + " | ".join(f4(cmp_['means'].loc[k, m]) for m in METRICS) + " |")
        L += ["", "Representative per strategy (selection rule over its four models):", ""]
        for k, v in STRATEGIES.items():
            r = cmp_["reps"][k]
            L.append(f"* {k} {v}: {r['model']} ({SHORT[r['feature_set']]}) - accuracy {r['accuracy']:.4f}, macro F1 "
                     f"{r['macro_f1']:.4f}, Critical recall {r['critical_recall']:.4f}.")
        L += ["", "![strategy comparison](w003_strategy_comparison.png)", "", "![critical recall](w003_critical_recall_comparison.png)", "",
              "### Primary research question", "",
              f"*Does training on two real workers (W_001 + W_002) generalize better to {NEW_WORKER} than the earlier strategies?*", "",
              "Pre-specified rule for each comparison: YES if the V4 representative beats the other strategy's representative "
              "under the selection rule AND V4 has the higher macro F1 for at least 3 of 4 algorithms; NO if the other "
              "representative wins and V4 has the higher macro F1 for at most 1 of 4; otherwise MIXED.", ""]
        for k in ("EXP1", "EXP2", "EXP3"):
            a = cmp_["answers"][k]
            L.append(f"* **vs {STRATEGIES[k]} (Exp {k[-1]}): {a['verdict']}** - V4 representative wins: "
                     f"{'yes' if a['rep_wins'] else 'no'}; V4 higher for " + ", ".join(f"{METRICS[m]} {v}/4" for m, v in a["wins"].items())
                     + " algorithms.")
        bk = cmp_["best_key"]
        L += [f"* Best of the four strategies on {NEW_WORKER} (selection rule over representatives): **{bk} {STRATEGIES[bk]}**.", "",
              "### Current production strategy (Synthetic + W_001, XGBoost EXTENDED) vs V4", "",
              "| comparison | delta accuracy | delta bal. acc. | delta macro F1 | delta Crit R | delta Crit F1 |", "|---|---|---|---|---|---|"]
        pr = cmp_["prod"]
        for lab, r in (("V4 XGBoost - Exp 2 XGBoost", cmp_["v4_xgb"]), (f"V4 best ({cmp_['v4_best']['model']}) - Exp 2 XGBoost", cmp_["v4_best"])):
            L.append(f"| {lab} | " + " | ".join(f"{r[m] - pr[m]:+.4f}" for m in METRICS) + " |")
        ov = cmp_["overall"]
        L += ["", f"* Exp 2 XGBoost on {NEW_WORKER}: accuracy {pr.accuracy:.4f}, macro F1 {pr.macro_f1:.4f}, Critical recall "
              f"{pr.critical_recall:.4f}.",
              f"* Best of all 16 models (12 V2 + 4 V4) under the selection rule: {ov['experiment']} {ov['model']} "
              f"({SHORT[ov['feature_set']]}).",
              f"* Production strategy (pre-specified: SUPPORTED if Exp 2 XGBoost is the best of the 16; PARTIALLY SUPPORTED "
              f"if inside the 0.01 accuracy band of the best accuracy; else NOT SUPPORTED): **{cmp_['prod_verdict']}**. "
              f"Critical detection: {pr.critical_flag if pr.critical_flag != 'OK' else 'no flag'}."]
        if prod:
            L.append(f"* The production artifact itself (read-only): accuracy {prod['metrics']['accuracy']:.4f}, macro F1 "
                     f"{prod['metrics']['macro_f1']:.4f}, Critical recall {prod['metrics']['critical_recall']:.4f}.")
        L.append("")
    L += ["## POST-HOC ANALYSIS - NOT USED FOR MODEL SELECTION", "",
          "Done after every model was frozen and scored. Nothing here was fed back into training, tuning or thresholds.", "",
          f"### Critical outcomes of the V4 models ({int(ph['outcomes'].critical_seconds.iloc[0])} W_003 Critical seconds)", "",
          ph["outcomes"].rename(columns={"mean_p_critical_on_true_critical": "mean P(Critical) on true Critical"})
          .to_markdown(index=False, floatfmt=".3f"), "",
          "### Feature medians: W_001 / W_002 training Critical vs W_003 Critical", "",
          f"W_003 outcome groups use the best V4 model ({best['model']}). Group sizes: "
          + ", ".join(f"{k} {v:,}" for k, v in ph["counts"].items()) + ".", "", ph["medians"].to_markdown(), "",
          "W_003 Critical medians outside the 10th-90th percentile range of the pooled W_001 + W_002 Critical rows:", ""]
    L += [f"* `{f}`: W_003 median {v:.2f} is {d} the training Critical range [{lo:.2f}, {hi:.2f}]"
          for f, v, lo, hi, d in ph["mismatch"]] or ["* none"]
    L += ["", "### Hazard-counter signatures of Critical rows", "", ph["hazard_share"].to_markdown(), ""]
    for s, n in ph["w3_signatures"].items():
        tl = ph["train_labels_for_top_sig"].get(s)
        L.append(f"* `{s}` - {n} W_003 Critical rows" + ("" if tl is None else
                 "; W_001 + W_002 rows with this signature: " + ", ".join(f"{c} {int(tl[c]):,}" for c in RISK_CLASSES)))
    L += ["", "* Critical episodes: " + ", ".join(f"{s} {len(v)} (median {int(np.median(v)) if v else 0} s)"
                                                 for s, v in ph["episodes"].items()),
          "", f"* Audit file: {ph['audit_msg']}."]
    if "audit_rules" in ph:
        L += ["", "Labelling rule of W_003 Critical rows by best-V4-model outcome:", "", ph["audit_rules"].to_markdown(), ""]
        L += [f"* Training audit {w}: Critical rules " + ", ".join(f"{k} {int(v):,}" for k, v in vc.head(6).items()) + "."
              for w, vc in ph["train_rules"].items()]
    L += ["", "## Files", "",
          "* `w003_results.csv` - every metric of the four V4 models; `w003_summary.csv` - key metrics with the V2 comparison.",
          "* Models: `models/experiment_v4/{random_forest,xgboost,svm,logistic_regression}.pkl` (frozen before scoring W_003). "
          "The production model and all earlier experiment files were not changed. Nothing was promoted.",
          f"* Total runtime: {runtime_min:.1f} min.", ""]
    (out_dir / "W003_REAL_WORKER_COMBINATION_RESULTS.md").write_text("\n".join(L), encoding="utf-8")


def print_final(res: pd.DataFrame, cmp_: dict | None, ph: dict) -> None:
    if cmp_ is None:
        print("\nV2 W_003 results not found; strategy comparison skipped.")
    else:
        print(f"\n{LINE}\nTRAINING STRATEGIES ON THE SAME WORKER W_003 (V2 saved results + V4)\n{LINE}")
        print(f"{'Model':<21}{'Metric':<19}{'Exp1 Syn':>9}{'Exp2 S+W1':>10}{'Exp3 W1':>9}{'V4 W1+W2':>10}"
              f"{'V4-E1':>9}{'V4-E2':>9}{'V4-E3':>9}")
        for a in ALGORITHMS:
            p = cmp_["per_algo"][a]
            for m, lab in METRICS.items():
                print(f"{a:<21}{lab:<19}{p['EXP1'][m]:>9.4f}{p['EXP2'][m]:>10.4f}{p['EXP3'][m]:>9.4f}{p['V4'][m]:>10.4f}"
                      f"{p['V4'][m] - p['EXP1'][m]:>+9.4f}{p['V4'][m] - p['EXP2'][m]:>+9.4f}{p['V4'][m] - p['EXP3'][m]:>+9.4f}")
        print("\nMean over the four algorithms:")
        print(cmp_["means"].rename(index=lambda k: f"{k} {STRATEGIES[k]}", columns=METRICS).to_string(float_format=lambda v: f"{v:.4f}"))
        for k in ("EXP1", "EXP2", "EXP3"):
            a = cmp_["answers"][k]
            print(f"Does W_001 + W_002 generalize better than {STRATEGIES[k]}? {a['verdict']}  (V4 representative wins: "
                  f"{'yes' if a['rep_wins'] else 'no'}; V4 higher macro F1 for {a['wins']['macro_f1']}/4 algorithms)")
        print(f"Best of the four strategies on W_003: {cmp_['best_key']} {STRATEGIES[cmp_['best_key']]}")
        pr = cmp_["prod"]
        print("\nProduction strategy (Exp 2 XGBoost EXTENDED) vs V4 XGBoost: " + ", ".join(
            f"{METRICS[m]} {cmp_['v4_xgb'][m] - pr[m]:+.4f}" for m in METRICS))
        print(f"Production strategy vs best V4 ({cmp_['v4_best']['model']}): " + ", ".join(
            f"{METRICS[m]} {cmp_['v4_best'][m] - pr[m]:+.4f}" for m in METRICS))
        print(f"Production strategy on W_003: {cmp_['prod_verdict']} (Critical: {pr.critical_flag})")
    print(f"\n{LINE}\nPOST-HOC ANALYSIS - NOT USED FOR MODEL SELECTION\n{LINE}")
    print(ph["outcomes"].to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    print("\nFeature medians (W_001 / W_002 training Critical vs W_003 Critical by best-V4 outcome):")
    print(ph["medians"].to_string())
    for f, v, lo, hi, d in ph["mismatch"]:
        print(f"  mismatch: {f} W_003 median {v:.2f} {d} training Critical 10-90 % range [{lo:.2f}, {hi:.2f}]")
    print(f"Audit: {ph['audit_msg']}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="validations only, no training")
    ap.add_argument("--report-only", action="store_true", help="rebuild reports from the frozen models and w003_results.csv")
    ap.add_argument("--audit", type=Path, default=v2.DEFAULT_AUDIT_PATH, help="W_003 audit CSV (post-hoc analysis only)")
    ap.add_argument("--smoke", action="store_true", help="pipeline test: 1 config, every 3rd training row (needs --out-dir/--models-dir)")
    ap.add_argument("--out-dir", type=Path, default=OUT_DIR)
    ap.add_argument("--models-dir", type=Path, default=MODEL_OUT_DIR)
    ap.add_argument("--v2-results", type=Path, default=V2_RESULTS, help="saved V2 W_003 results (strategy comparison)")
    args = ap.parse_args()
    if args.smoke and (args.out_dir == OUT_DIR or args.models_dir == MODEL_OUT_DIR):
        ap.error("--smoke must write to a separate --out-dir and --models-dir")

    t_all = time.time()
    warnings.filterwarnings("ignore", category=UserWarning)
    before = snapshot()
    sources = load_sources()
    w3 = v2.load_w003()
    v2res = pd.read_csv(args.v2_results) if args.v2_results.exists() else None

    print(f"{LINE}\nPROSAFE ML V2 - REAL WORKER COMBINATION EVALUATION\n{LINE}")
    print("Training:\n  W_001 + W_002\n\nEvaluation:\n  W_003\n")
    print("Purpose:\n  Evaluate whether combining two real workers improves generalization to a new\n  real worker.\n")
    print("W_003 is evaluation-only.")
    print("Note: this strategy was specified after run_experiment_v2.py W_003 results existed, so this is an\n"
          "additional comparative evaluation on W_003, not a pristine independent test.\n")
    print("Training-side validation:\n  LeaveOneGroupOut by worker_id\n")
    print(f"Random seed:\n  {RANDOM_STATE}\n")
    print("Feature sets:\n" + "\n".join(f"  {k} ({len(v)})" for k, v in FEATURE_SETS.items()))
    print(f"\nSearch budget: {rx.CONFIGS_PER_FEATURE_SET} configurations x 3 feature sets = {3 * rx.CONFIGS_PER_FEATURE_SET} "
          "candidates per algorithm (imported from run_experiments.py)")
    print(f"\nW_001: {len(sources['W_001']):,} rows ({class_counts(sources['W_001'])})")
    print(f"W_002: {len(sources['W_002']):,} rows ({class_counts(sources['W_002'])})")
    print(f"Combined training: {len(sources['W_001']) + len(sources['W_002']):,} rows\n")
    v2.print_w003_validation(w3)
    print(f"\nV2 W_003 results for comparison: {'found' if v2res is not None else 'not found'} ({v2.rel(args.v2_results)})")
    if args.smoke:
        print("\n!! SMOKE TEST: 1 configuration per algorithm, every 3rd training row. Not a result.")

    ctx = v2.TrainingContext(EXP, sources, row_step=3 if args.smoke else 1)
    workers = sorted(set(ctx.train[WORKER_COLUMN]))
    fold_rows = set(np.concatenate([np.concatenate(f) for f in ctx.folds]))
    print("\nIsolation checks:")
    print(f"  Training rows {len(ctx.train):,} (workers {', '.join(workers)}); {ctx.cv_desc}; folds index training rows "
          f"only (max {max(fold_rows):,} < {len(ctx.train):,}); W_003 rows duplicated in training: {v2.overlapping_rows(ctx.train, w3)}")
    assert NEW_WORKER not in workers and workers == ["W_001", "W_002"] and len(ctx.folds) == 2 and max(fold_rows) < len(ctx.train)
    print(f"  Protected files hashed: {len(before)} (production model, earlier experiment models and outputs, data, "
          "run_experiments.py, run_experiment_v2.py, run_experiment_v3.py)")
    if args.check:
        print("\nChecks passed. (--check: no training performed)")
        return

    args.out_dir.mkdir(parents=True, exist_ok=True)
    if args.report_only:
        res = pd.read_csv(args.out_dir / "w003_results.csv")
        fitted = {a: load_frozen(a, args.models_dir) for a in ALGORITHMS}
        preds = {a: fm.predict_labels(w3) for a, fm in fitted.items()}
        cv_desc, runtime = ctx.cv_desc, float(res.optimization_seconds.sum() / 60)
    else:
        run = run_v4(sources, w3, args.models_dir, args.smoke)
        res = pd.DataFrame(run["finals"])
        res.to_csv(args.out_dir / "w003_results.csv", index=False)  # saved before any reporting
        fitted, preds, cv_desc = run["fitted"], run["preds"], run["cv_desc"]
        runtime = (time.time() - t_all) / 60

    ps.apply()
    best = print_comparison(res, preds, w3)
    cmp_ = compare_strategies(res, v2res)
    prod = v2.production_check(w3, None)
    summary = res[["experiment", "training_strategy", "evaluation_worker", "model", "feature_set", "accuracy",
                   "balanced_accuracy", "macro_f1", "weighted_f1", "critical_precision", "critical_recall", "critical_f1",
                   "critical_to_warning_count", "critical_to_safe_count", "critical_flag", "cv_accuracy", "cv_macro_f1"]].copy()
    summary["best_v4_model"] = summary.model == best["model"]
    if cmp_ is not None:
        for k in ("EXP1", "EXP2", "EXP3"):
            for m in METRICS:
                summary[f"{k.lower()}_{m}"] = [float(cmp_["per_algo"][a][k][m]) for a in summary.model]
                summary[f"v4_minus_{k.lower()}_{m}"] = summary[m] - summary[f"{k.lower()}_{m}"]
    summary.to_csv(args.out_dir / "w003_summary.csv", index=False)
    plot_model_comparison(res, args.out_dir)
    if cmp_ is not None:
        plot_strategy_comparison(cmp_, args.out_dir)
    plot_critical_recall(res, cmp_, args.out_dir)
    plot_confusion(best["model"], best["feature_set"], json.loads(best["confusion_matrix"]), args.out_dir)
    ph = posthoc(fitted, preds, w3, sources, best["model"], args.audit)
    write_report(res, best, cmp_, prod, ph, sources, w3, cv_desc, runtime, args.out_dir, args.smoke, args.v2_results)
    print_final(res, cmp_, ph)

    changed = v2.compare_snapshots(before, snapshot())
    print(f"\nProtected files unchanged: {'yes' if not changed else 'NO - ' + ', '.join(changed)}")
    print("Production model (models/best_model.pkl) was NOT changed. No model was promoted.")
    print(f"Outputs: {args.out_dir}")
    print(f"Total runtime: {(time.time() - t_all) / 60:.1f} min")
    if changed:
        sys.exit(1)


if __name__ == "__main__":
    main()
