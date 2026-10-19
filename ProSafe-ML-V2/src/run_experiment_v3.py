"""
ProSafe ML V2 -- common-worker comparison: the three training strategies all evaluated on the SAME worker, W_002.

    EXPERIMENT 1   Synthetic -> W_002            train synthetic S_001-S_004
    EXPERIMENT 2   Synthetic + W_001 -> W_002    train synthetic S_001-S_004 + W_001   (production training strategy)
    EXPERIMENT 3   W_001 -> W_002                train W_001

Because every strategy is scored on the same W_002 rows, the strategies are directly comparable. W_002 is NOT a
pristine unseen test worker: it was used in earlier ProSafe development and the deployment decision was taken after
its results were known. This is a controlled comparative evaluation; W_003 (run_experiment_v2.py) remains the newer
independent evaluation worker.

The training side is imported unchanged from run_experiments.py (feature sets, four algorithms, 12 seeded
configurations x 3 feature sets = 36 candidates per algorithm per experiment, LeaveOneGroupOut by worker for
Experiments 1-2, 5 contiguous chronological blocks with a 300-row purge for Experiment 3, fold-internal imputation /
scaling / class weights / XGBoost early stopping, and the selection rule). W_002 never enters the training context,
the folds or the selection; each selected configuration is refitted, frozen (saved), and only then scored once on W_002.

Nothing here changes the production model, models/experiments/, models/experiment_v2/, the original outputs or
outputs/experiment_v2/. New files go to outputs/experiment_v3/ and models/experiment_v3/ only.

Run from the project root:
    python src/run_experiment_v3.py                  # full run (~3 h)
    python src/run_experiment_v3.py --check          # validations only
    python src/run_experiment_v3.py --report-only    # rebuild reports/plots from the frozen models + CSV
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
from modeling import FittedModel, fit_model
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
    SYNTHETIC_DATA_PATH,
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

EVAL_WORKER = "W_002"
OUT_DIR = OUTPUTS_DIR / "experiment_v3"
MODEL_OUT_DIR = MODELS_DIR / "experiment_v3"
V2_RESULTS = OUTPUTS_DIR / "experiment_v2" / "w003_results.csv"
EXPECTED_COLUMNS = [WORKER_COLUMN, TIMESTAMP_COLUMN] + EXTENDED_FEATURE_COLUMNS + [TARGET_COLUMN]
LINE = rx.LINE
ALGORITHMS = rx.ALGORITHMS
FEATURE_SETS = rx.FEATURE_SETS
SHORT = rx.SHORT
METRICS = {"accuracy": "Accuracy", "balanced_accuracy": "Balanced Accuracy", "macro_f1": "Macro F1",
           "critical_recall": "Critical Recall", "critical_f1": "Critical F1"}

EXPERIMENTS = [
    {"id": 1, "name": "Synthetic -> W_002", "strategy": "Synthetic only (S_001-S_004)", "short": "Synthetic only",
     "train_label": "S_001-S_004", "train": ["synthetic"], "cv": "workers", "original_test": "W_001"},
    {"id": 2, "name": "Synthetic + W_001 -> W_002", "strategy": "Hybrid: Synthetic S_001-S_004 + W_001",
     "short": "Synthetic + W_001", "train_label": "S_001-S_004 + W_001", "train": ["synthetic", "W_001"],
     "cv": "workers", "original_test": "W_002"},
    {"id": 3, "name": "W_001 -> W_002", "strategy": "W_001 only (real worker 1)", "short": "W_001 only",
     "train_label": "W_001", "train": ["W_001"], "cv": "time_blocks", "original_test": "W_002"},
]
for _e, _o in zip(EXPERIMENTS, rx.EXPERIMENTS):  # same training strategies as the original experiments
    assert _e["id"] == _o["id"] and _e["train"] == _o["train"] and _e["cv"] == _o["cv"] and _e["original_test"] == _o["test"]
FILES = {"synthetic": SYNTHETIC_DATA_PATH.name, "W_001": W001_DATA_PATH.name, EVAL_WORKER: W002_DATA_PATH.name}


# ---------------------------------------------------------------------------
# Protected files (hashed before and after)
# ---------------------------------------------------------------------------
def protected_files() -> list[Path]:
    prod = [BEST_MODEL_PATH, BEST_MODEL_META_PATH, MODELS_DIR / "all_models_meta.pkl", LABEL_ENCODER_PATH,
            MODELS_DIR / "frozen_config.json"]
    v2_out = OUTPUTS_DIR / "experiment_v2"
    return ([p for p in prod if p.exists()] + sorted(rx.EXPERIMENT_MODELS_DIR.glob("*.pkl"))
            + sorted(v2.MODEL_OUT_DIR.glob("*.pkl")) + sorted(p for p in OUTPUTS_DIR.iterdir() if p.is_file())
            + (sorted(p for p in v2_out.iterdir() if p.is_file()) if v2_out.exists() else [])
            + sorted(DATA_DIR.glob("*.csv")) + [rx.SRC_DIR / "run_experiments.py", rx.SRC_DIR / "run_experiment_v2.py"])


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
# W_002 validation
# ---------------------------------------------------------------------------
def load_w002() -> pd.DataFrame:
    """W_002 through the guarded loader (frozen-config gate + label check), then the V2 feature-contract checks."""
    df = load_external_test_data()
    cols = [c for c in df.columns if not c.startswith("_")]
    if len(cols) != len(EXPECTED_COLUMNS) or set(cols) != set(EXPECTED_COLUMNS):
        raise ValueError(f"W_002 columns differ from the V2 contract. Extra: {sorted(set(cols) - set(EXPECTED_COLUMNS))}, "
                         f"missing: {sorted(set(EXPECTED_COLUMNS) - set(cols))}")
    if cols != list(pd.read_csv(W001_DATA_PATH, nrows=0).columns):  # models select features by name
        raise ValueError("W_002 column layout differs from the training files")
    if set(df[WORKER_COLUMN]) != {EVAL_WORKER}:
        raise ValueError(f"W_002 file contains worker IDs {sorted(set(df[WORKER_COLUMN]))}")
    forbidden = [c for c in cols if c not in (WORKER_COLUMN, TIMESTAMP_COLUMN, TARGET_COLUMN) and is_forbidden_predictor(c)]
    if forbidden or {"baseline_hr", "baseline_body_temperature"} & set(cols):
        raise ValueError(f"Forbidden / raw-baseline columns present in W_002: {forbidden}")
    for fs, fcols in FEATURE_SETS.items():
        assert not [c for c in fcols if is_forbidden_predictor(c)], fs
    return df.reset_index(drop=True)


def print_w002_validation(w2: pd.DataFrame) -> None:
    vc = w2[TARGET_COLUMN].value_counts()
    na = w2[EXTENDED_FEATURE_COLUMNS].isna().sum()
    print(f"Dataset:\n  {W002_DATA_PATH.name}")
    print(f"\nRows:\n  {len(w2):,}")
    print(f"\nWorker:\n  {', '.join(sorted(w2[WORKER_COLUMN].unique()))}")
    print("\nClass distribution:")
    for c in RISK_CLASSES:
        print(f"  {c + ':':<10}{int(vc.get(c, 0)):>6,}  ({vc.get(c, 0) / len(w2):.1%})")
    print(f"\nColumns: {len(EXPECTED_COLUMNS)} (worker_id, timestamp, {len(EXTENDED_FEATURE_COLUMNS)} EXTENDED features, "
          "risk_level); exact contract names, same layout as the training files")
    print(f"Missing values: {int(na.sum()):,} cells in {int((na > 0).sum())} features")
    print("Not predictors: worker_id, timestamp, risk_level; no raw baseline, evidence or audit column present")


# ---------------------------------------------------------------------------
# Training side (no W_002 anywhere in here)
# ---------------------------------------------------------------------------
class TrainingContext:
    """The attributes rx.evaluate_candidates needs, built from the TRAINING sources only. There is no test set."""

    def __init__(self, exp: dict, sources: dict[str, pd.DataFrame], row_step: int = 1):
        if EVAL_WORKER in sources:
            raise RuntimeError("W_002 must not be passed to the training side")
        self.exp = exp
        self.train = pd.concat([sources[s] for s in exp["train"]], ignore_index=True)
        if row_step > 1:  # --smoke only
            self.train = self.train.iloc[::row_step].reset_index(drop=True)
        if EVAL_WORKER in set(self.train[WORKER_COLUMN]):
            raise RuntimeError("W_002 leaked into the training data")
        self.y_lab = self.train[TARGET_COLUMN].values
        self.y_code = np.array([RISK_CLASSES.index(c) for c in self.y_lab], dtype=np.int8)
        self.groups = self.train[WORKER_COLUMN].values
        self.folds, self.cv_desc = rx.internal_folds(self.train, exp["cv"])
        self.es = [rx.xgb_es_split(self.groups, tr) for tr, _ in self.folds]
        self.X = {fs: self.train[cols].to_numpy(np.float32) for fs, cols in FEATURE_SETS.items()}


def overlapping_rows(train: pd.DataFrame, w2: pd.DataFrame) -> int:
    key = lambda d: pd.util.hash_pandas_object(d[EXTENDED_FEATURE_COLUMNS].round(6), index=False)  # noqa: E731
    return int(key(w2).isin(set(key(train))).sum())


def w002_flag(m: dict) -> str:
    r = m["critical_recall"]
    if r == 0:
        return "UNSAFE CRITICAL DETECTION: missed every W_002 Critical observation."
    if r < 0.25:
        return f"POOR CRITICAL DETECTION (Critical recall {r:.3f})"
    if r < 0.5:
        return f"LIMITED CRITICAL DETECTION (Critical recall {r:.3f})"
    return ""


def same_as_v2(v2res: pd.DataFrame | None, key: str, algo: str, fs: str, params: dict) -> str:
    if v2res is None:
        return "V2 results not found"
    r = v2res[(v2res.experiment == key) & (v2res.model == algo)]
    if r.empty:
        return "not in V2 results"
    return "yes" if r.iloc[0].feature_set == fs and json.loads(r.iloc[0].hyperparameters) == json.loads(json.dumps(params)) else "NO"


def reproduces_original(orig: pd.DataFrame | None, exp: dict, algo: str, cm) -> str:
    """Experiments 2-3 were originally tested on W_002 too: their confusion matrices must be identical."""
    if exp["original_test"] != EVAL_WORKER:
        return f"n/a (original test {exp['original_test']})"
    if orig is None:
        return "original results not found"
    r = orig[(orig.experiment == f"EXP{exp['id']}") & (orig.model == algo)]
    return "n/a" if r.empty else ("yes" if json.loads(r.iloc[0].confusion_matrix) == cm else "NO")


def save_frozen(exp: dict, algo: str, chosen: dict, params: dict, cols: list, fm: FittedModel, ctx: TrainingContext,
                models_dir: Path) -> Path:
    models_dir.mkdir(parents=True, exist_ok=True)
    path = models_dir / f"exp{exp['id']}_{model_slug(algo)}.pkl"
    joblib.dump({
        "experiment": f"EXP{exp['id']}", "experiment_name": exp["name"], "training_strategy": exp["strategy"],
        "common_evaluation_worker": EVAL_WORKER, "algorithm": algo, "feature_set": chosen["feature_set"],
        "feature_columns": cols, "hyperparameters": params, "model": fm.estimator, "scaler": fm.preprocessor,
        "use_scaled": fm.use_scaled, "label_encoder": fm.label_encoder, "classes": RISK_CLASSES,
        "trained_on": [FILES[s] for s in exp["train"]], "n_train": len(ctx.train),
        "cross_validation": {k: chosen[k] for k in chosen if k.startswith("cv_")},
        "note": "Frozen on the training side before W_002 was scored. Evaluation-study model, NOT the production model.",
    }, path)
    return path


# ---------------------------------------------------------------------------
# One experiment: optimize on training data only -> refit -> freeze -> score W_002 once
# ---------------------------------------------------------------------------
def run_experiment(exp: dict, sources: dict, w2: pd.DataFrame, orig, v2res, models_dir: Path, smoke: bool) -> dict:
    ctx = TrainingContext(exp, sources, row_step=3 if smoke else 1)
    key = f"EXP{exp['id']}"
    print(f"\n{LINE}\nEXPERIMENT {exp['id']}: {exp['name'].upper()}\n{LINE}")
    print(f"Train:\n  {exp['train_label']}  ({' + '.join(FILES[s] for s in exp['train'])})")
    print(f"\nEvaluate:\n  {EVAL_WORKER}  ({FILES[EVAL_WORKER]})\n")
    print(f"Training rows: {len(ctx.train):,}   workers: {', '.join(dict.fromkeys(ctx.train[WORKER_COLUMN]))}")
    print(f"W_002 rows:    {len(w2):,}\n")
    print("Training class distribution:\n" + rx.class_distribution(ctx.train))
    print(f"\nTraining-side validation: {ctx.cv_desc}")

    finals, preds = [], {}
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
        path = save_frozen(exp, algo, chosen, params, cols, fm, ctx, models_dir)  # frozen BEFORE W_002 is scored
        match = v2.same_as_original(orig, key, algo, chosen["feature_set"], params)
        match_v2 = same_as_v2(v2res, key, algo, chosen["feature_set"], params)

        pred = fm.predict_labels(w2)  # the single W_002 evaluation of this frozen model
        m = rx.full_metrics(w2[TARGET_COLUMN].values, pred)
        flag = w002_flag(m)
        repro = reproduces_original(orig, exp, algo, m["confusion_matrix"])
        finals.append({
            "experiment": key, "experiment_name": exp["name"], "training_strategy": exp["strategy"],
            "evaluation_worker": EVAL_WORKER, "original_test_in_run_experiments": exp["original_test"],
            "training_data": " + ".join(FILES[s] for s in exp["train"]), "model": algo,
            "feature_set": chosen["feature_set"], "n_features": len(cols), "hyperparameters": json.dumps(params),
            "same_config_as_original_run": match, "same_config_as_v2_run": match_v2,
            "reproduces_original_w002_result": repro, "candidates_evaluated": len(cands),
            "non_converged_discarded": len(cands) - len(valid),
            **{k: chosen[k] for k in chosen if k.startswith("cv_")},
            **{k: v for k, v in m.items() if k != "confusion_matrix"},
            "confusion_matrix": json.dumps(m["confusion_matrix"]), "critical_flag": flag or "OK",
            "n_train": len(ctx.train), "n_w002": len(w2), "model_file": v2.rel(path),
            "optimization_seconds": round(time.time() - t0, 1)})
        preds[algo] = pred
        print(f"  Candidates evaluated: {len(cands)} ({len(configs)} configurations x 3 feature sets)"
              + (f", {len(cands) - len(valid)} non-converged discarded" if len(cands) > len(valid) else ""))
        print(f"  Selected feature set: {chosen['feature_set']}")
        print(f"  Selected parameters:  {rx.fmt_params(params)}")
        print(f"  Same configuration as run_experiments.py: {match}; as run_experiment_v2.py: {match_v2}")
        print(f"  CV Accuracy:          {chosen['cv_accuracy']:.4f}")
        print(f"  CV Macro F1:          {chosen['cv_macro_f1']:.4f}")
        print(f"  Frozen model:         {v2.rel(path)}")
        print(f"  W_002 Accuracy:       {m['accuracy']:.4f}")
        print(f"  W_002 Balanced Acc.:  {m['balanced_accuracy']:.4f}")
        print(f"  W_002 Macro F1:       {m['macro_f1']:.4f}")
        print(f"  W_002 Critical P/R/F1: {m['critical_precision']:.4f} / {m['critical_recall']:.4f} / {m['critical_f1']:.4f}")
        print(f"  Critical -> Warning:  {m['critical_to_warning_count']} ({m['critical_to_warning_pct']:.1f} %)   "
              f"Critical -> Safe: {m['critical_to_safe_count']} ({m['critical_to_safe_pct']:.1f} %)")
        print(f"  Reproduces the original run_experiments.py W_002 result: {repro}")
        if flag:
            print(f"  !! {flag}")
        print(f"  Time: {(time.time() - t0) / 60:.1f} min")

    print(f"\nMODEL COMPARISON ON W_002  (experiment {exp['id']}: {exp['name']})\n{'-' * 60}")
    print(v2.comparison_table(finals).to_string(index=False, float_format=lambda v: f"{v:.4f}"))
    for r in finals:
        if r["critical_flag"] != "OK":
            print(f"  !! {r['model']}: {r['critical_flag']}")
    best, cv_best = rx.select(finals, ""), rx.select(finals, "cv_")
    print(f"\nBest model on W_002 (selection rule applied descriptively to W_002 results): {best['model']} ({best['feature_set']})")
    print(f"Training-side choice (selection rule on CV metrics, W_002 not used): {cv_best['model']} ({cv_best['feature_set']})")
    print(f"\nDETAILED CLASSIFICATION REPORTS ON W_002  (experiment {exp['id']})")
    for r in finals:
        print(f"\n--- {r['model']} ({r['feature_set']}) ---")
        print(classification_report(w2[TARGET_COLUMN], preds[r["model"]], labels=RISK_CLASSES, digits=4, zero_division=0))
        print("Confusion matrix (rows = true, columns = predicted: Safe, Warning, Critical)")
        for c, row in zip(RISK_CLASSES, json.loads(r["confusion_matrix"])):
            print(f"  {c:<9}{row[0]:>8,}{row[1]:>8,}{row[2]:>8,}")
    return {"exp": exp, "finals": finals, "cv_desc": ctx.cv_desc}


# ---------------------------------------------------------------------------
# Comparisons (descriptive; after every model is frozen and scored)
# ---------------------------------------------------------------------------
def extra_strategy_facts(sa: dict) -> dict:
    """Exp 1 vs Exp 3, and where Experiment 2 is strongest (per algorithm, representative, mean)."""
    pa = sa["per_algo"]
    s_vs_w = {m: sum(pa[a][1][m] > pa[a][3][m] for a in ALGORITHMS) for m in METRICS}
    e2_best = {m: sum(pa[a][2][m] >= max(pa[a][1][m], pa[a][3][m]) for a in ALGORITHMS) for m in METRICS}
    rep_best = {m: max(sa["reps"].items(), key=lambda kv: kv[1][m])[0] for m in METRICS}
    mean_best = {m: int(sa["means"][m].idxmax()[-1]) for m in METRICS}
    return {"s_vs_w": s_vs_w, "e2_best": e2_best, "rep_best": rep_best, "mean_best": mean_best}


def v2_comparison(res: pd.DataFrame, v2res: pd.DataFrame | None) -> tuple[pd.DataFrame | None, dict]:
    if v2res is None:
        return None, {}
    rows = []
    for _, r in res.iterrows():
        o = v2res[(v2res.experiment == r.experiment) & (v2res.model == r.model)]
        if o.empty:
            continue
        o = o.iloc[0]
        row = {"experiment": r.experiment, "model": r.model, "w002_feature_set": r.feature_set, "w003_feature_set": o.feature_set}
        for m in METRICS:
            row[f"w002_{m}"], row[f"w003_{m}"] = float(r[m]), float(o[m])
            row[f"w003_minus_w002_{m}"] = float(o[m]) - float(r[m])
        rows.append(row)
    cmp_ = pd.DataFrame(rows)
    if cmp_.empty:
        return None, {}
    sa3 = v2.strategy_analysis(v2res)
    facts = {"mean_abs": {m: float(cmp_[f"w003_minus_w002_{m}"].abs().mean()) for m in METRICS},
             "spearman_macro_f1": float(cmp_[["w002_macro_f1", "w003_macro_f1"]].corr(method="spearman").iloc[0, 1]),
             "spearman_accuracy": float(cmp_[["w002_accuracy", "w003_accuracy"]].corr(method="spearman").iloc[0, 1]),
             "best_strategy_w003": sa3["best_strategy"], "verdict_w003": sa3["verdict"],
             "overall_w003": (sa3["overall"]["experiment"], sa3["overall"]["model"])}
    return cmp_, facts


# ---------------------------------------------------------------------------
# Plots
# ---------------------------------------------------------------------------
def plot_model_comparison(res: pd.DataFrame, out_dir: Path) -> None:
    labels, keys = list(METRICS.values())[:4], list(METRICS)[:4]
    fig, axes = plt.subplots(3, 1, figsize=(10.5, 16.5))
    for ax, e in zip(axes, EXPERIMENTS):
        sub = res[res.experiment == f"EXP{e['id']}"].set_index("model").loc[ALGORITHMS].reset_index()
        cats = [f"{r.model} ({SHORT[r.feature_set]})" + ("  - misses all Critical" if r.critical_recall == 0 else "")
                for _, r in sub.iterrows()]
        ps.grouped_hbar(ax, cats, {m: sub[k].tolist() for m, k in zip(labels, keys)}, dict(zip(labels, ps.SERIES)),
                        xlim=(0, 1.12), bar_h=0.19)
        ax.set_title(f"Experiment {e['id']}: {e['name']}")
        ps.subtitle(ax, f"Training: {e['strategy']} - common evaluation worker {EVAL_WORKER}")
    axes[-1].legend(loc="lower center", bbox_to_anchor=(0.45, -0.2), ncol=4)
    ps.save(fig, out_dir / "w002_model_comparison.png")


def _strategy_series(res: pd.DataFrame, metric: str) -> dict:
    return {f"Exp {e['id']}: {e['short']}": [float(res[(res.experiment == f"EXP{e['id']}") & (res.model == a)][metric].iloc[0])
                                             for a in ALGORITHMS] for e in EXPERIMENTS}


def plot_strategy_comparison(res: pd.DataFrame, out_dir: Path) -> None:
    fig, axes = plt.subplots(2, 2, figsize=(14, 10.5))
    for ax, m in zip(axes.flat, ["accuracy", "balanced_accuracy", "macro_f1", "critical_f1"]):
        series = _strategy_series(res, m)
        ps.grouped_hbar(ax, ALGORITHMS, series, dict(zip(series, ps.SERIES)), xlim=(0, 1.15), bar_h=0.24)
        ax.set_title(METRICS[m], fontsize=12)
    ps.subtitle(axes[0, 0], f"Three training strategies on the same worker {EVAL_WORKER}")
    axes[1, 0].legend(loc="lower center", bbox_to_anchor=(1.05, -0.22), ncol=3)
    ps.save(fig, out_dir / "w002_training_strategy_comparison.png")


def plot_critical_recall(res: pd.DataFrame, out_dir: Path) -> None:
    series = _strategy_series(res, "critical_recall")
    fig, ax = plt.subplots(figsize=(10.5, 6.0))
    ps.grouped_hbar(ax, ALGORITHMS, series, dict(zip(series, ps.SERIES)), xlim=(0, 1.12), bar_h=0.24)
    ax.set_title(f"Critical recall on {EVAL_WORKER} by training strategy and algorithm")
    ps.subtitle(ax, f"{int(res.critical_support.iloc[0])} Critical seconds in {EVAL_WORKER}; "
                    "each bar is the training-side-selected configuration")
    ax.legend(loc="lower center", bbox_to_anchor=(0.45, -0.2), ncol=3)
    ps.save(fig, out_dir / "w002_critical_recall_comparison.png")


def plot_confusion(exp: dict, model: str, feature_set: str, cm, out_dir: Path) -> None:
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
    ax.set_title(f"Exp {exp['id']}: {model} ({SHORT[feature_set]}) on {EVAL_WORKER}", fontsize=12)
    ps.subtitle(ax, f"Best model on {EVAL_WORKER} in this experiment - counts and % of each true class")
    ps.save(fig, out_dir / f"confusion_matrix_exp{exp['id']}_w002.png")


# ---------------------------------------------------------------------------
# Markdown report
# ---------------------------------------------------------------------------
f4 = v2.f4


def write_report(res, sa, fx, cmp_, cf, w2, cv_desc, runtime_min, out_dir: Path, smoke: bool, v2_path: Path) -> None:
    vc = w2[TARGET_COLUMN].value_counts()
    na = w2[EXTENDED_FEATURE_COLUMNS].isna().sum()
    L = [f"# ProSafe ML V2 - common evaluation of the three training strategies on {EVAL_WORKER}", "",
         "Generated by `python src/run_experiment_v3.py`." + (" **SMOKE TEST - reduced budget, not a result.**" if smoke else ""), "",
         "## Purpose and status of W_002", "",
         f"All three training strategies are evaluated on exactly the same worker, {EVAL_WORKER}, so they are directly "
         "comparable (in the original `run_experiments.py`, Experiment 1 was tested on W_001 instead).", "",
         f"* **{EVAL_WORKER} is not a pristine unseen test worker.** It was used in earlier ProSafe development: the "
         "original Experiments 2-3 were scored on it, Critical failures were analysed on it, and the decision to deploy the "
         "Experiment 2 XGBoost was taken after its results were known. These results are a **controlled comparative "
         "evaluation**, not a new external validation.",
         f"* Within this run, {EVAL_WORKER} never entered training, the folds, early stopping, class weighting, feature-set "
         "selection or the selection rule. Each configuration was refitted on the training data, saved (frozen) and then "
         f"scored once on {EVAL_WORKER}.",
         "* **W_003** (`run_experiment_v2.py`, `outputs/experiment_v2/`) remains the newer, more independent evaluation worker.", "",
         "## W_002 data validation", "",
         f"* `data/{W002_DATA_PATH.name}`: {len(w2):,} rows, {len(EXPECTED_COLUMNS)} columns (worker_id, timestamp, "
         f"{len(EXTENDED_FEATURE_COLUMNS)} EXTENDED features, risk_level); worker {EVAL_WORKER} only; loaded through the "
         "guarded `utils.load_external_test_data()`.",
         "* Classes: " + ", ".join(f"{c} {int(vc.get(c, 0)):,} ({vc.get(c, 0) / len(w2):.1%})" for c in RISK_CLASSES)
         + ". Not rebalanced; no rows removed or relabelled.",
         f"* Missing values: {int(na.sum()):,} cells in {int((na > 0).sum())} features. worker_id, timestamp and risk_level "
         "are not predictors; no raw baseline, evidence or audit column is present; feature names match "
         "`utils.EXTENDED_FEATURE_COLUMNS` exactly.", "",
         "## Method (identical to run_experiments.py)", "",
         "| Experiment | Training strategy | Training data | Evaluation | Training-side validation |", "|---|---|---|---|---|"]
    for e in EXPERIMENTS:
        r = res[res.experiment == f"EXP{e['id']}"].iloc[0]
        L.append(f"| {e['id']} {e['name']} | {e['strategy']} | {r.training_data} ({int(r.n_train):,} rows) | {EVAL_WORKER} | "
                 f"{cv_desc[e['id']]} |")
    L += ["",
          f"* Algorithms: {', '.join(ALGORITHMS)}. Feature sets: " + ", ".join(f"{k} ({len(v)})" for k, v in FEATURE_SETS.items()) + ".",
          f"* Budget: {int(res.candidates_evaluated.iloc[0])} candidates per algorithm per experiment (12 seeded configurations "
          f"x 3 feature sets, seed {RANDOM_STATE}), with the search spaces, class-weight handling and XGBoost early stopping "
          "of run_experiments.py.",
          f"* Selection rule: accuracy within {rx.ACCURACY_BAND} of the best CV accuracy, then macro F1 -> balanced accuracy "
          "-> Critical recall -> lowest Critical->Safe rate.",
          "* Reproduction checks: selected configuration identical to run_experiments.py for "
          f"{int((res.same_config_as_original_run == 'yes').sum())}/12 models and to run_experiment_v2.py for "
          f"{int((res.same_config_as_v2_run == 'yes').sum())}/12; Experiments 2-3 reproduce the original W_002 confusion "
          f"matrices for {int((res.reproduces_original_w002_result == 'yes').sum())}/8 models.", ""]
    for e in EXPERIMENTS:
        sub = res[res.experiment == f"EXP{e['id']}"]
        best, cvb = rx.select(v2.with_rates(sub), ""), rx.select(v2.with_rates(sub), "cv_")
        L += [f"## Experiment {e['id']}: {e['name']}" + (" (production training strategy)" if e["id"] == 2 else ""), "",
              "| model | feature set | accuracy | bal. acc. | macro P | macro R | macro F1 | weighted P | weighted R | weighted F1 | "
              "Crit P | Crit R | Crit F1 | Crit FN | Crit FN rate | Crit->Warning | Crit->Safe |",
              "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
        for _, r in sub.iterrows():
            L.append(f"| {r.model} | {SHORT[r.feature_set]} | " + " | ".join(f4(r[c]) for c in (
                "accuracy", "balanced_accuracy", "macro_precision", "macro_recall", "macro_f1", "weighted_precision",
                "weighted_recall", "weighted_f1", "critical_precision", "critical_recall", "critical_f1")) +
                f" | {int(r.critical_false_negative_count)} | {f4(r.critical_false_negative_rate)} | "
                f"{int(r.critical_to_warning_count)} ({r.critical_to_warning_pct:.1f} %) | "
                f"{int(r.critical_to_safe_count)} ({r.critical_to_safe_pct:.1f} %) |")
        L += ["", "Per-class precision / recall / F1:", "", "| model | Safe | Warning | Critical |", "|---|---|---|---|"]
        for _, r in sub.iterrows():
            L.append(f"| {r.model} | " + " | ".join(f"{r[c + '_precision']:.3f} / {r[c + '_recall']:.3f} / {r[c + '_f1']:.3f}"
                                                   for c in ("safe", "warning", "critical")) + " |")
        L += ["", "Confusion matrices (rows true Safe / Warning / Critical; columns predicted in the same order):", ""]
        L += [f"* {r.model}: `{json.loads(r.confusion_matrix)}`" for _, r in sub.iterrows()]
        L += ["", f"**Best model on {EVAL_WORKER}** (selection rule applied descriptively): {best['model']} "
              f"({best['feature_set']}). Training-side choice (rule on CV metrics): {cvb['model']} ({cvb['feature_set']}).", ""]
        L += [f"* {r.model}: **{r.critical_flag}**" for _, r in sub.iterrows() if r.critical_flag != "OK"]
        L += ["", "Selected configurations (training side only):", ""]
        L += [f"* **{r.model}** - {r.feature_set}; {rx.fmt_params(json.loads(r.hyperparameters))}; CV accuracy {r.cv_accuracy:.4f}, "
              f"CV macro F1 {r.cv_macro_f1:.4f}." for _, r in sub.iterrows()]
        L += ["", f"![confusion matrix](confusion_matrix_exp{e['id']}_w002.png)", ""]

    ov = sa["overall"]
    L += [f"## Final common-worker comparison (all 12 models on {EVAL_WORKER})", "",
          "| experiment | training strategy | model | feature set | accuracy | bal. acc. | macro F1 | Crit P | Crit R | Crit F1 | Crit->Safe | flag |",
          "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for _, r in res.iterrows():
        L.append(f"| {r.experiment[-1]} | {EXPERIMENTS[int(r.experiment[-1]) - 1]['short']} | {r.model} | {SHORT[r.feature_set]} | "
                 f"{f4(r.accuracy)} | {f4(r.balanced_accuracy)} | {f4(r.macro_f1)} | {f4(r.critical_precision)} | "
                 f"{f4(r.critical_recall)} | {f4(r.critical_f1)} | {int(r.critical_to_safe_count)} | "
                 f"{r.critical_flag if r.critical_flag != 'OK' else 'ok'} |")
    L += ["", "![model comparison](w002_model_comparison.png)", "",
          f"**Best overall result on {EVAL_WORKER}** (selection rule over all 12): Experiment {ov['experiment'][-1]} "
          f"{ov['model']} ({ov['feature_set']}) - accuracy {ov['accuracy']:.4f}, macro F1 {ov['macro_f1']:.4f}, "
          f"Critical recall {ov['critical_recall']:.4f}.", "",
          "## Primary comparison: training strategies on the same worker", "",
          "| model | metric | Exp 1 synthetic only | Exp 2 synthetic + W_001 | Exp 3 W_001 only | Exp 2 - Exp 1 | Exp 2 - Exp 3 | Exp 1 - Exp 3 |",
          "|---|---|---|---|---|---|---|---|"]
    for a in ALGORITHMS:
        p = sa["per_algo"][a]
        for m, lab in METRICS.items():
            L.append(f"| {a} | {lab} | {f4(p[1][m])} | {f4(p[2][m])} | {f4(p[3][m])} | {p[2][m] - p[1][m]:+.4f} | "
                     f"{p[2][m] - p[3][m]:+.4f} | {p[1][m] - p[3][m]:+.4f} |")
    L += ["", "Mean over the four algorithms:", "", "| strategy | " + " | ".join(METRICS.values()) + " |", "|---|---|---|---|---|---|"]
    for e in EXPERIMENTS:
        mm = sa["means"].loc[f"EXP{e['id']}"]
        L.append(f"| Exp {e['id']} {e['short']} | " + " | ".join(f4(mm[m]) for m in METRICS) + " |")
    L += ["", "Representative per strategy (selection rule over its four models):", ""]
    for e in EXPERIMENTS:
        r = sa["reps"][e["id"]]
        L.append(f"* Exp {e['id']} {e['short']}: {r['model']} ({SHORT[r['feature_set']]}) - accuracy {r['accuracy']:.4f}, "
                 f"macro F1 {r['macro_f1']:.4f}, Critical recall {r['critical_recall']:.4f}.")
    bs = EXPERIMENTS[sa["best_strategy"] - 1]
    L += ["", "![training strategies](w002_training_strategy_comparison.png)", "",
          "![critical recall](w002_critical_recall_comparison.png)", "",
          "### Answers", "",
          "* **Does adding real W_001 data to synthetic data improve performance on W_002?** Experiment 2 is higher than "
          "Experiment 1 for " + ", ".join(f"{METRICS[m]} {sa['h_vs_1'][m]}/4" for m in METRICS) + " algorithms.",
          "* **Synthetic-only vs W_001-only:** Experiment 1 is higher than Experiment 3 for "
          + ", ".join(f"{METRICS[m]} {fx['s_vs_w'][m]}/4" for m in METRICS) + " algorithms.",
          "* Experiment 2 vs W_001-only (Experiment 3): higher for " + ", ".join(f"{METRICS[m]} {sa['h_vs_3'][m]}/4" for m in METRICS)
          + " algorithms.",
          f"* **Strongest overall generalization to {EVAL_WORKER}** (pre-specified: selection rule over the three strategy "
          f"representatives): **Experiment {bs['id']} - {bs['strategy']}**.",
          f"* Hybrid-improvement verdict (same pre-specified rule as run_experiment_v2.py: YES if Exp 2 is the best strategy "
          f"and beats both others on macro F1 for at least 3 of 4 algorithms; NO if another strategy is best and Exp 2 beats "
          f"one of the others on macro F1 for at most 1 of 4; otherwise MIXED): **{sa['verdict']}**.", "",
          "### Experiment 2 (production training strategy) - is it the strongest?", "",
          "| metric | algorithms where Exp 2 is highest (of 4) | strategy with the best representative | strategy with the best mean |",
          "|---|---|---|---|"]
    for m in ("accuracy", "macro_f1", "balanced_accuracy", "critical_recall"):
        L.append(f"| {METRICS[m]} | {fx['e2_best'][m]} | Exp {fx['rep_best'][m]} | Exp {fx['mean_best'][m]} |")
    x2 = res[(res.experiment == "EXP2") & (res.model == "XGBoost")].iloc[0]
    L += ["", f"Experiment 2 XGBoost on {EVAL_WORKER}: accuracy {x2.accuracy:.4f}, balanced accuracy {x2.balanced_accuracy:.4f}, "
          f"macro F1 {x2.macro_f1:.4f}, Critical recall {x2.critical_recall:.4f} ({x2.critical_flag if x2.critical_flag != 'OK' else 'no flag'}).", "",
          "## Comparison with the V2 W_003 results (descriptive)", ""]
    if cmp_ is None:
        L += [f"* V2 results not found at `{v2.rel(v2_path)}`; comparison skipped.", ""]
    else:
        L += [f"Source: `{v2.rel(v2_path)}` (not re-run). Same training strategies; the evaluation worker differs.", "",
              "| experiment | model | W_002 accuracy | W_003 accuracy | W_002 macro F1 | W_003 macro F1 | W_002 Crit R | W_003 Crit R | "
              "W_003 - W_002 macro F1 |", "|---|---|---|---|---|---|---|---|---|"]
        for _, h in cmp_.iterrows():
            L.append(f"| {h.experiment[-1]} | {h.model} | {f4(h.w002_accuracy)} | {f4(h.w003_accuracy)} | {f4(h.w002_macro_f1)} | "
                     f"{f4(h.w003_macro_f1)} | {f4(h.w002_critical_recall)} | {f4(h.w003_critical_recall)} | "
                     f"{h.w003_minus_w002_macro_f1:+.4f} |")
        ow = cf["overall_w003"]
        L += ["", "Consistency:", "",
              "* Mean absolute difference W_003 vs W_002: " + ", ".join(f"{METRICS[m]} {v:.4f}" for m, v in cf["mean_abs"].items()) + ".",
              f"* Spearman rank correlation of the 12 models between workers: accuracy {cf['spearman_accuracy']:.3f}, "
              f"macro F1 {cf['spearman_macro_f1']:.3f}.",
              f"* Best strategy: W_002 Experiment {sa['best_strategy']}, W_003 Experiment {cf['best_strategy_w003']}. "
              f"Hybrid verdict: W_002 {sa['verdict']}, W_003 {cf['verdict_w003']}. Best overall model: W_002 Exp "
              f"{ov['experiment'][-1]} {ov['model']}, W_003 Exp {ow[0][-1]} {ow[1]}.", ""]
    L += ["## Files", "",
          "* `w002_results.csv` - every metric of the 12 models; `w002_summary.csv` - key metrics with the W_003 comparison.",
          "* Models: `models/experiment_v3/exp{1,2,3}_{random_forest,xgboost,svm,logistic_regression}.pkl` (frozen before "
          "scoring W_002). The production model, `models/experiments/`, `models/experiment_v2/` and earlier outputs were not changed.",
          "* No production decision is taken here; the results are for review.",
          f"* Total runtime: {runtime_min:.1f} min.", ""]
    (out_dir / "W002_COMMON_EVALUATION_RESULTS.md").write_text("\n".join(L), encoding="utf-8")


# ---------------------------------------------------------------------------
def print_final(res: pd.DataFrame, sa: dict, fx: dict, cmp_, cf: dict) -> None:
    print(f"\n{LINE}\nFINAL COMMON-WORKER COMPARISON\n{LINE}")
    show = pd.DataFrame({"Experiment": res.experiment.str[-1],
                         "Training Strategy": [EXPERIMENTS[int(e[-1]) - 1]["short"] for e in res.experiment],
                         "Model": res.model, "Feature Set": res.feature_set.map(SHORT), "Accuracy": res.accuracy,
                         "Balanced Accuracy": res.balanced_accuracy, "Macro F1": res.macro_f1,
                         "Critical Precision": res.critical_precision, "Critical Recall": res.critical_recall,
                         "Critical F1": res.critical_f1, "Critical -> Safe": res.critical_to_safe_count.astype(int)})
    print(show.to_string(index=False, float_format=lambda v: f"{v:.4f}"))
    flagged = res[res.critical_flag != "OK"]
    if len(flagged):
        print("\nCritical-detection warnings on W_002:")
        for _, r in flagged.iterrows():
            print(f"  !! Exp {r.experiment[-1]} {r.model}: {r.critical_flag}")

    print(f"\n{LINE}\nPRIMARY COMPARISON: TRAINING STRATEGIES ON W_002\n{LINE}")
    print(f"{'Model':<21}{'Metric':<19}{'Exp1 Synth':>11}{'Exp2 S+W1':>11}{'Exp3 W_001':>11}{'2 - 1':>9}{'2 - 3':>9}{'1 - 3':>9}")
    for a in ALGORITHMS:
        p = sa["per_algo"][a]
        for m, lab in METRICS.items():
            print(f"{a:<21}{lab:<19}{p[1][m]:>11.4f}{p[2][m]:>11.4f}{p[3][m]:>11.4f}{p[2][m] - p[1][m]:>+9.4f}"
                  f"{p[2][m] - p[3][m]:>+9.4f}{p[1][m] - p[3][m]:>+9.4f}")
    print("\nMean over the four algorithms:")
    print(sa["means"].rename(index=lambda k: f"Exp {k[-1]} {EXPERIMENTS[int(k[-1]) - 1]['short']}", columns=METRICS)
          .to_string(float_format=lambda v: f"{v:.4f}"))
    print("\nAdding W_001 to synthetic (Exp 2 > Exp 1): " + ", ".join(f"{METRICS[m]} {v}/4" for m, v in sa["h_vs_1"].items()))
    print("Synthetic + W_001 vs W_001 only (Exp 2 > Exp 3): " + ", ".join(f"{METRICS[m]} {v}/4" for m, v in sa["h_vs_3"].items()))
    print("Synthetic only vs W_001 only (Exp 1 > Exp 3): " + ", ".join(f"{METRICS[m]} {v}/4" for m, v in fx["s_vs_w"].items()))
    for e in EXPERIMENTS:
        r = sa["reps"][e["id"]]
        print(f"Best model in Exp {e['id']} on W_002: {r['model']} ({SHORT[r['feature_set']]})  acc {r['accuracy']:.4f}  "
              f"macro F1 {r['macro_f1']:.4f}  Crit R {r['critical_recall']:.4f}")
    ov = sa["overall"]
    print(f"Best overall result on W_002: Exp {ov['experiment'][-1]} {ov['model']} ({SHORT[ov['feature_set']]})")
    print(f"Strongest training strategy on W_002: Exp {sa['best_strategy']} - {EXPERIMENTS[sa['best_strategy'] - 1]['strategy']}")
    print(f"Does Synthetic + W_001 improve generalization to W_002? {sa['verdict']}")
    print("\nIs Experiment 2 the strongest? (algorithms where Exp 2 is highest / best representative / best mean)")
    for m in ("accuracy", "macro_f1", "balanced_accuracy", "critical_recall"):
        print(f"  {METRICS[m]:<19}{fx['e2_best'][m]}/4   Exp {fx['rep_best'][m]}   Exp {fx['mean_best'][m]}")
    x2 = res[(res.experiment == "EXP2") & (res.model == "XGBoost")].iloc[0]
    print(f"Experiment 2 XGBoost on W_002: accuracy {x2.accuracy:.4f}, macro F1 {x2.macro_f1:.4f}, "
          f"Critical recall {x2.critical_recall:.4f}")

    print(f"\n{LINE}\nW_002 (V3) vs W_003 (V2, from saved outputs)\n{LINE}")
    if cmp_ is None:
        print("V2 W_003 results not found; comparison skipped.")
        return
    print(f"{'Exp':<4}{'Model':<21}{'Acc W2':>8}{'Acc W3':>8}{'F1 W2':>8}{'F1 W3':>8}{'CritR W2':>10}{'CritR W3':>10}")
    for _, h in cmp_.iterrows():
        print(f"{h.experiment[-1]:<4}{h.model:<21}{h.w002_accuracy:>8.4f}{h.w003_accuracy:>8.4f}{h.w002_macro_f1:>8.4f}"
              f"{h.w003_macro_f1:>8.4f}{h.w002_critical_recall:>10.4f}{h.w003_critical_recall:>10.4f}")
    print("Mean |W_003 - W_002|: " + ", ".join(f"{METRICS[m]} {v:.4f}" for m, v in cf["mean_abs"].items()))
    print(f"Spearman (12 models): accuracy {cf['spearman_accuracy']:.3f}, macro F1 {cf['spearman_macro_f1']:.3f}; "
          f"best strategy W_002 Exp {sa['best_strategy']} vs W_003 Exp {cf['best_strategy_w003']}")


def build_outputs(res, w2, v2res, cv_desc, runtime_min, out_dir, smoke, v2_path) -> None:
    ps.apply()
    sa = v2.strategy_analysis(res)
    fx = extra_strategy_facts(sa)
    cmp_, cf = v2_comparison(res, v2res)
    summary = res[["experiment", "experiment_name", "training_strategy", "evaluation_worker", "model", "feature_set",
                   "accuracy", "balanced_accuracy", "macro_f1", "weighted_f1", "critical_precision", "critical_recall",
                   "critical_f1", "critical_to_warning_count", "critical_to_safe_count", "critical_flag",
                   "same_config_as_original_run", "same_config_as_v2_run", "reproduces_original_w002_result"]].copy()
    summary["best_on_w002_in_experiment"] = [sa["reps"][int(e[-1])]["model"] == m for e, m in zip(res.experiment, res.model)]
    summary["training_side_choice_in_experiment"] = [
        rx.select(v2.with_rates(res[res.experiment == e]), "cv_")["model"] == m for e, m in zip(res.experiment, res.model)]
    if cmp_ is not None:
        keep = ["experiment", "model"] + [c for c in cmp_.columns if c.startswith("w003_")]
        summary = summary.merge(cmp_[keep], on=["experiment", "model"], how="left")
    summary.to_csv(out_dir / "w002_summary.csv", index=False)
    plot_model_comparison(res, out_dir)
    plot_strategy_comparison(res, out_dir)
    plot_critical_recall(res, out_dir)
    for e in EXPERIMENTS:
        b = sa["reps"][e["id"]]
        plot_confusion(e, b["model"], b["feature_set"], json.loads(b["confusion_matrix"]), out_dir)
    write_report(res, sa, fx, cmp_, cf, w2, cv_desc, runtime_min, out_dir, smoke, v2_path)
    print_final(res, sa, fx, cmp_, cf)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="validations only, no training")
    ap.add_argument("--report-only", action="store_true", help="rebuild reports from the frozen models and w002_results.csv")
    ap.add_argument("--smoke", action="store_true", help="pipeline test: 1 config, every 3rd training row (needs --out-dir/--models-dir)")
    ap.add_argument("--out-dir", type=Path, default=OUT_DIR)
    ap.add_argument("--models-dir", type=Path, default=MODEL_OUT_DIR)
    ap.add_argument("--v2-results", type=Path, default=V2_RESULTS, help="saved V2 W_003 results (descriptive comparison)")
    args = ap.parse_args()
    if args.smoke and (args.out_dir == OUT_DIR or args.models_dir == MODEL_OUT_DIR):
        ap.error("--smoke must write to a separate --out-dir and --models-dir")

    t_all = time.time()
    warnings.filterwarnings("ignore", category=UserWarning)
    before = snapshot()
    sources = {"synthetic": _read_ml_ready(SYNTHETIC_DATA_PATH), "W_001": _read_ml_ready(W001_DATA_PATH)}
    w2 = load_w002()
    orig = v2.original_results()
    v2res = pd.read_csv(args.v2_results) if args.v2_results.exists() else None

    print(f"{LINE}\nPROSAFE ML V2 - COMMON W_002 EVALUATION\n{LINE}")
    print("Purpose:\n  Compare all three training strategies on the same Worker 2 dataset.")
    print("\nImportant:\n  W_002 is NOT part of training.\n  W_002 has been used previously, so this is a comparative "
          "evaluation rather\n  than a pristine unseen external test.\n")
    print_w002_validation(w2)
    print("\nFeature sets: " + ", ".join(f"{k} ({len(v)})" for k, v in FEATURE_SETS.items()))
    print(f"Random seed: {RANDOM_STATE}")
    print(f"Search budget: {rx.CONFIGS_PER_FEATURE_SET} configurations x 3 feature sets = {3 * rx.CONFIGS_PER_FEATURE_SET} "
          "candidates per algorithm per experiment (imported from run_experiments.py)")
    print(f"Selection: accuracy within {rx.ACCURACY_BAND} of the best CV accuracy -> macro F1 -> balanced accuracy -> "
          "Critical recall -> lowest Critical->Safe rate")
    print(f"V2 W_003 results for comparison: {'found' if v2res is not None else 'not found'} ({v2.rel(args.v2_results)})")
    if args.smoke:
        print("\n!! SMOKE TEST: 1 configuration per algorithm, every 3rd training row. Not a result.")

    print("\nIsolation checks:")
    for e in EXPERIMENTS:
        ctx = TrainingContext(e, sources, row_step=3 if args.smoke else 1)
        workers = sorted(set(ctx.train[WORKER_COLUMN]))
        fold_rows = set(np.concatenate([np.concatenate(f) for f in ctx.folds]))
        print(f"  Exp {e['id']}: training rows {len(ctx.train):,} (workers {', '.join(workers)}); {len(ctx.folds)} folds over "
              f"training rows only (max index {max(fold_rows):,} < {len(ctx.train):,}); "
              f"W_002 rows duplicated in training: {overlapping_rows(ctx.train, w2)}")
        assert EVAL_WORKER not in workers and max(fold_rows) < len(ctx.train)
    print(f"  Protected files hashed: {len(before)} (production model, models/experiments, models/experiment_v2, original "
          "outputs, outputs/experiment_v2, data, run_experiments.py, run_experiment_v2.py)")
    if args.check:
        print("\nChecks passed. (--check: no training performed)")
        return

    args.out_dir.mkdir(parents=True, exist_ok=True)
    if args.report_only:
        res = pd.read_csv(args.out_dir / "w002_results.csv")
        cv_desc = {e["id"]: TrainingContext(e, sources).cv_desc for e in EXPERIMENTS}
        runtime = float(res.optimization_seconds.sum() / 60)
    else:
        runs = [run_experiment(e, sources, w2, orig, v2res, args.models_dir, args.smoke) for e in EXPERIMENTS]
        res = pd.DataFrame([r for run in runs for r in run["finals"]])
        res.to_csv(args.out_dir / "w002_results.csv", index=False)  # saved before any reporting
        cv_desc = {run["exp"]["id"]: run["cv_desc"] for run in runs}
        runtime = (time.time() - t_all) / 60
    build_outputs(res, w2, v2res, cv_desc, runtime, args.out_dir, args.smoke, args.v2_results)

    changed = v2.compare_snapshots(before, snapshot())
    print(f"\nProtected files unchanged: {'yes' if not changed else 'NO - ' + ', '.join(changed)}")
    print("Production model (models/best_model.pkl) was NOT changed. No model was deployed.")
    print(f"Outputs: {args.out_dir}")
    print(f"Total runtime: {(time.time() - t_all) / 60:.1f} min")
    if changed:
        sys.exit(1)


if __name__ == "__main__":
    main()
