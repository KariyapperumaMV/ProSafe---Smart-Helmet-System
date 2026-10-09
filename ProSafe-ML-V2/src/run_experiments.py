"""
ProSafe ML V2 -- final, fair optimization of all four algorithms on the three experiments.

    EXPERIMENT 1   Synthetic -> Worker 1 Real              train synthetic          test W_001
    EXPERIMENT 2   Synthetic + Worker 1 -> Worker 2 Real   train synthetic + W_001  test W_002   (primary, hybrid)
    EXPERIMENT 3   Worker 1 -> Worker 2 Real               train W_001              test W_002

Random Forest, XGBoost, SVM and Logistic Regression receive the SAME search
budget: 12 seeded hyperparameter configurations x 3 feature sets
(BASIC_PERSONALIZED, TEMPORAL_PERSONALIZED, EXTENDED) = 36 candidates per
algorithm per experiment. Feature set, hyperparameters and class weighting are
chosen together, on the TRAINING side only:

  * Experiments 1-2: LeaveOneGroupOut with worker_id as the group;
  * Experiment 3 (a single training worker): 5 contiguous chronological blocks,
    300 rows purged on both sides of each validation block (longest feature window).

Imputation, scaling, class weights and XGBoost early stopping are fitted inside
each training fold. Selection rule (per algorithm, and for the descriptive
"best overall model" of an experiment): keep the candidates whose accuracy is
within 0.01 of the best, then maximize macro F1 -> balanced accuracy ->
Critical recall -> lowest Critical->Safe rate. The chosen configuration is
refitted on the whole training data and scored ONCE on the test worker.

Nothing here changes models/best_model.pkl (the production decision comes later).

Run from the project root:
    python src/run_experiments.py                 # full run
    python src/run_experiments.py --charts-only   # redraw plots from the saved CSVs
"""

from __future__ import annotations

import json
import os
import sys
import time
import warnings
from itertools import product
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from joblib import Parallel, delayed
from sklearn.exceptions import ConvergenceWarning
from sklearn.metrics import classification_report, precision_recall_fscore_support
from sklearn.model_selection import ParameterSampler

import plot_style as ps
from modeling import build_estimator, class_sample_weights, compute_metrics, fit_model, make_label_encoder
from utils import (
    CORE_FEATURE_COLUMNS,
    DEVIATION_COLUMNS,
    EXPOSURE_COLUMNS,
    EXTENDED_FEATURE_COLUMNS,
    GAS_RATIO_COLUMNS,
    MODELS_DIR,
    NOISE_DOSE_COLUMNS,
    OUTPUTS_DIR,
    RANDOM_STATE,
    RAW_SENSOR_COLUMNS,
    RISK_CLASSES,
    ROLLING_COLUMNS,
    SYNTHETIC_DATA_PATH,
    TARGET_COLUMN,
    TREND_COLUMNS,
    W001_DATA_PATH,
    W002_DATA_PATH,
    WORKER_COLUMN,
    _read_ml_ready,
    assert_feature_contract,
    load_external_test_data,
    model_slug,
)

SRC_DIR = Path(__file__).resolve().parent
EXPERIMENT_MODELS_DIR = MODELS_DIR / "experiments"
LINE = "=" * 60

# ---------------------------------------------------------------------------
# Feature sets (unchanged definitions)
# ---------------------------------------------------------------------------
BASIC_PERSONALIZED = RAW_SENSOR_COLUMNS + DEVIATION_COLUMNS + GAS_RATIO_COLUMNS
TEMPORAL_PERSONALIZED = BASIC_PERSONALIZED + ROLLING_COLUMNS + TREND_COLUMNS + NOISE_DOSE_COLUMNS
EXTENDED = TEMPORAL_PERSONALIZED + EXPOSURE_COLUMNS
FEATURE_SETS = {
    "BASIC_PERSONALIZED": BASIC_PERSONALIZED,
    "TEMPORAL_PERSONALIZED": TEMPORAL_PERSONALIZED,
    "EXTENDED": EXTENDED,
}
SHORT = {"BASIC_PERSONALIZED": "BASIC", "TEMPORAL_PERSONALIZED": "TEMPORAL", "EXTENDED": "EXTENDED"}
assert TEMPORAL_PERSONALIZED == CORE_FEATURE_COLUMNS and EXTENDED == EXTENDED_FEATURE_COLUMNS
for _cols in FEATURE_SETS.values():
    assert_feature_contract(_cols)

EXPERIMENTS = [
    {"id": 1, "name": "Synthetic -> Worker 1 Real", "train": ["synthetic"], "test": "W_001", "cv": "workers"},
    {"id": 2, "name": "Synthetic + Worker 1 -> Worker 2 Real", "train": ["synthetic", "W_001"], "test": "W_002", "cv": "workers"},
    {"id": 3, "name": "Worker 1 -> Worker 2 Real", "train": ["W_001"], "test": "W_002", "cv": "time_blocks"},
]
FILES = {"synthetic": SYNTHETIC_DATA_PATH.name, "W_001": W001_DATA_PATH.name, "W_002": W002_DATA_PATH.name}
TIME_BLOCKS, PURGE_ROWS = 5, 300

# ---------------------------------------------------------------------------
# Search budget and spaces -- the same number of candidates for every algorithm
# ---------------------------------------------------------------------------
ALGORITHMS = ["Random Forest", "XGBoost", "SVM", "Logistic Regression"]
CONFIGS_PER_FEATURE_SET = 12
ACCURACY_BAND = 0.01
PARALLEL_WORKERS = max(1, min(14, (os.cpu_count() or 4) - 2))

RF_SPACE = {
    "n_estimators": [200, 300, 500, 700, 1000],
    "max_depth": [None, 8, 12, 16, 24, 32],
    "min_samples_split": [2, 4, 8, 12, 20],
    "min_samples_leaf": [1, 2, 4, 6, 10],
    "max_features": ["sqrt", "log2", 0.5, 0.75, 1.0],
    "criterion": ["gini", "entropy", "log_loss"],
    "class_weight": ["balanced", "balanced_subsample", None],
    "bootstrap": [True, False],
}
# XGBoost class weighting = training-only sample weights: unweighted, or 'balanced' x Critical/Warning multipliers.
XGB_WEIGHTINGS = [(None, 1.0, 1.0)] + [("balanced", c, w) for c in (1.0, 1.25, 1.5, 2.0, 3.0) for w in (0.75, 1.0, 1.25)]
XGB_SPACE = {
    "n_estimators": [150, 300, 500, 700, 1000],
    "learning_rate": [0.01, 0.02, 0.03, 0.05, 0.08, 0.1, 0.15],
    "max_depth": [2, 3, 4, 5, 6, 8],
    "min_child_weight": [1, 3, 5, 8, 10],
    "subsample": [0.6, 0.7, 0.8, 0.9, 1.0],
    "colsample_bytree": [0.6, 0.7, 0.8, 0.9, 1.0],
    "gamma": [0, 0.05, 0.1, 0.25, 0.5, 1.0],
    "reg_alpha": [0, 0.01, 0.05, 0.1, 0.5, 1.0],
    "reg_lambda": [0.5, 1, 2, 5, 10],
    "weighting": list(range(len(XGB_WEIGHTINGS))),
}
XGB_ES_ROUNDS, ES_BLOCK, ES_EVERY, ES_BLOCK_PURGE = 50, 300, 7, 60

SVM_GRIDS = {  # stratified by kernel so every kernel is searched
    "rbf": ([{"kernel": "rbf", "C": c, "gamma": g, "class_weight": cw}
             for c in (0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100)
             for g in ("scale", "auto", 0.0001, 0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1.0)
             for cw in ("balanced", None)], 8),
    "linear": ([{"kernel": "linear", "C": c, "class_weight": cw} for c in (0.001, 0.01, 0.1, 1, 10, 100)
                for cw in ("balanced", None)], 2),
    "poly": ([{"kernel": "poly", "degree": d, "C": c, "gamma": g, "class_weight": cw}
              for d in (2, 3) for c in (0.1, 1, 10) for g in ("scale", 0.01, 0.1) for cw in ("balanced", None)], 2),
}
LR_C = (0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100)
LR_GRIDS = {  # valid solver / penalty combinations only, stratified by penalty
    "l2": ([{"penalty": "l2", "solver": s, "C": c, "class_weight": cw, "max_iter": 5000}
            for s in ("lbfgs", "newton-cg", "saga") for c in LR_C for cw in ("balanced", None)], 6),
    "l1": ([{"penalty": "l1", "solver": s, "C": c, "class_weight": cw, "max_iter": 5000}
            for s in ("liblinear", "saga") for c in LR_C for cw in ("balanced", None)], 3),
    "elasticnet": ([{"penalty": "elasticnet", "solver": "saga", "l1_ratio": r, "C": c, "class_weight": cw, "max_iter": 5000}
                    for r in (0.25, 0.5, 0.75) for c in LR_C for cw in ("balanced", None)], 3),
}


def _plain(v):
    return v.item() if hasattr(v, "item") else v


def sample_configs(algo: str) -> list[dict]:
    """12 reproducible configurations per algorithm (seed 42); each is tried with all 3 feature sets."""
    if algo in ("Random Forest", "XGBoost"):
        space = RF_SPACE if algo == "Random Forest" else XGB_SPACE
        configs = [{k: _plain(v) for k, v in c.items()}
                   for c in ParameterSampler(space, n_iter=CONFIGS_PER_FEATURE_SET, random_state=RANDOM_STATE)]
        if algo == "XGBoost":
            for c in configs:
                cw, cm, wm = XGB_WEIGHTINGS[c.pop("weighting")]
                c.update({"class_weight": cw, "critical_weight": cm, "warning_weight": wm})
        return configs
    rng = np.random.default_rng(RANDOM_STATE)
    grids = SVM_GRIDS if algo == "SVM" else LR_GRIDS
    out = []
    for grid, k in grids.values():
        out += [grid[i] for i in sorted(rng.choice(len(grid), size=k, replace=False))]
    return out


# ---------------------------------------------------------------------------
# Metrics, flags, selection rule
# ---------------------------------------------------------------------------
def full_metrics(y_true, y_pred) -> dict:
    m = compute_metrics(y_true, y_pred)
    wp, wr, _, _ = precision_recall_fscore_support(y_true, y_pred, labels=RISK_CLASSES, average="weighted", zero_division=0)
    cm = np.asarray(m["confusion_matrix"])
    crit, warn, safe = (RISK_CLASSES.index(c) for c in ("Critical", "Warning", "Safe"))
    n = int(cm[crit].sum())
    m.update({
        "weighted_precision": float(wp), "weighted_recall": float(wr), "critical_support": n,
        "critical_false_negative_count": int(n - cm[crit, crit]),
        "critical_to_warning_count": int(cm[crit, warn]),
        "critical_to_warning_pct": float(100 * cm[crit, warn] / n) if n else float("nan"),
        "critical_to_safe_count": int(cm[crit, safe]),
        "critical_to_safe_pct": float(100 * cm[crit, safe] / n) if n else float("nan"),
    })
    return m


def critical_flag(m: dict) -> str:
    r = m["critical_recall"]
    if r == 0:
        return "UNSAFE CRITICAL DETECTION: model missed every Critical test observation."
    if r < 0.25:
        return f"POOR CRITICAL DETECTION (Critical recall {r:.3f})"
    if r < 0.5:
        return f"LIMITED CRITICAL DETECTION (Critical recall {r:.3f})"
    return ""


def _nz(x, default):
    return default if x is None or (isinstance(x, float) and np.isnan(x)) else x


def select(items: list[dict], prefix: str) -> dict:
    """Accuracy within 0.01 of the best, then macro F1 -> balanced accuracy -> Critical recall -> lowest Critical->Safe rate."""
    best = max(i[prefix + "accuracy"] for i in items)
    band = [i for i in items if i[prefix + "accuracy"] >= best - ACCURACY_BAND - 1e-12]
    return max(band, key=lambda i: (i[prefix + "macro_f1"], i[prefix + "balanced_accuracy"],
                                    _nz(i[prefix + "critical_recall"], -1.0), -_nz(i[prefix + "critical_to_safe_rate"], 1.0)))


def fmt_params(p: dict) -> str:
    return ", ".join(f"{k}={v}" for k, v in p.items())


# ---------------------------------------------------------------------------
# Data and training-side folds
# ---------------------------------------------------------------------------
def load_sources() -> dict[str, pd.DataFrame]:
    """The three ML-ready files (label check: Safe/Warning/Critical only -- utils stops on anything else)."""
    return {"synthetic": _read_ml_ready(SYNTHETIC_DATA_PATH), "W_001": _read_ml_ready(W001_DATA_PATH),
            "W_002": load_external_test_data()}


def internal_folds(train: pd.DataFrame, mode: str) -> tuple[list, str]:
    n = len(train)
    if mode == "workers":
        workers = list(dict.fromkeys(train[WORKER_COLUMN]))
        g = train[WORKER_COLUMN].values
        folds = [(np.where(g != w)[0], np.where(g == w)[0]) for w in workers]
        return folds, f"LeaveOneGroupOut by worker_id ({len(workers)} folds: {', '.join(workers)})"
    edges = np.linspace(0, n, TIME_BLOCKS + 1).astype(int)
    idx = np.arange(n)
    folds = [(idx[(idx < a - PURGE_ROWS) | (idx >= b + PURGE_ROWS)], idx[a:b]) for a, b in zip(edges[:-1], edges[1:])]
    return folds, (f"{TIME_BLOCKS} contiguous chronological blocks of W_001, {PURGE_ROWS} rows purged on both sides "
                   "of each validation block")


def xgb_es_split(groups: np.ndarray, idx: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Early-stopping rows INSIDE a training fold: every 7th 300-row block of each worker (60-row purge around it)."""
    fit, es = [], []
    for g in pd.unique(groups[idx]):
        gi = idx[groups[idx] == g]
        pos = np.arange(len(gi))
        is_es = (pos // ES_BLOCK) % ES_EVERY == ES_EVERY // 2
        near = np.zeros(len(gi), dtype=bool)
        for b in np.unique(pos[is_es] // ES_BLOCK):
            near[max(0, b * ES_BLOCK - ES_BLOCK_PURGE):(b + 1) * ES_BLOCK + ES_BLOCK_PURGE] = True
        es.append(gi[is_es])
        fit.append(gi[~near])
    return np.concatenate(fit), np.concatenate(es)


class Context:
    def __init__(self, exp: dict, data: dict):
        self.exp = exp
        self.train = pd.concat([data[s] for s in exp["train"]], ignore_index=True)
        self.test = data[exp["test"]].reset_index(drop=True)
        self.y_lab = self.train[TARGET_COLUMN].values
        self.y_code = np.array([RISK_CLASSES.index(c) for c in self.y_lab], dtype=np.int8)
        self.groups = self.train[WORKER_COLUMN].values
        self.folds, self.cv_desc = internal_folds(self.train, exp["cv"])
        self.es = [xgb_es_split(self.groups, tr) for tr, _ in self.folds]
        self.X = {fs: self.train[cols].to_numpy(np.float32) for fs, cols in FEATURE_SETS.items()}


# ---------------------------------------------------------------------------
# Candidate evaluation (pooled out-of-fold predictions on the training side)
# ---------------------------------------------------------------------------
def _fit_predict_job(src_dir, algo, params, cols, X, y_code, tr, va):
    """One fold of one SVM / Logistic Regression candidate (runs in a worker process, single-threaded)."""
    if src_dir not in sys.path:
        sys.path.insert(0, src_dir)
    from threadpoolctl import threadpool_limits
    from modeling import fit_model as _fit
    from utils import RISK_CLASSES as _CLASSES, TARGET_COLUMN as _TARGET
    df = pd.DataFrame(X[tr], columns=cols)
    df[_TARGET] = np.asarray(_CLASSES, dtype=object)[y_code[tr]]
    t0 = time.time()
    with threadpool_limits(1), warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        fm = _fit(algo, params, df, cols)
        pred = fm.predict_labels(pd.DataFrame(X[va], columns=cols))
    converged = not any(issubclass(w.category, ConvergenceWarning) for w in caught)
    return np.array([_CLASSES.index(p) for p in pred], dtype=np.int8), converged, time.time() - t0


def _xgb_fold(ctx: Context, k: int, params: dict, fs: str):
    tr, va = ctx.folds[k]
    fit, es = ctx.es[k]
    X = ctx.X[fs]
    w = np.zeros(len(ctx.y_lab))
    w[tr] = class_sample_weights(ctx.y_lab[tr], params["class_weight"], params["critical_weight"], params["warning_weight"])
    le = make_label_encoder()
    y = le.transform(ctx.y_lab)
    model = build_estimator("XGBoost", params).set_params(early_stopping_rounds=XGB_ES_ROUNDS, n_jobs=3)
    model.fit(X[fit], y[fit], sample_weight=w[fit], eval_set=[(X[es], y[es])], sample_weight_eval_set=[w[es]], verbose=False)
    return va, le.inverse_transform(model.predict(X[va])), model.best_iteration + 1


def evaluate_candidates(ctx: Context, algo: str, configs: list[dict]) -> list[dict]:
    cands = [{"feature_set": fs, "params": p} for fs in FEATURE_SETS for p in configs]
    n = len(ctx.y_lab)
    if algo in ("SVM", "Logistic Regression"):
        jobs = [(i, k) for i in range(len(cands)) for k in range(len(ctx.folds))]
        outs = Parallel(n_jobs=PARALLEL_WORKERS, backend="loky")(
            delayed(_fit_predict_job)(str(SRC_DIR), algo, cands[i]["params"], FEATURE_SETS[cands[i]["feature_set"]],
                                      ctx.X[cands[i]["feature_set"]], ctx.y_code, *ctx.folds[k]) for i, k in jobs)
        preds = {i: np.full(n, -1, dtype=np.int8) for i in range(len(cands))}
        conv = {i: True for i in range(len(cands))}
        for (i, k), (p, ok, _) in zip(jobs, outs):
            preds[i][ctx.folds[k][1]] = p
            conv[i] &= ok
        for i, c in enumerate(cands):
            c["converged"] = conv[i]
            c["pred"] = np.asarray(RISK_CLASSES, dtype=object)[preds[i]]
    else:
        for c in cands:
            pred = np.empty(n, dtype=object)
            trees = []
            if algo == "XGBoost":
                outs = Parallel(n_jobs=len(ctx.folds), prefer="threads")(
                    delayed(_xgb_fold)(ctx, k, c["params"], c["feature_set"]) for k in range(len(ctx.folds)))
                for va, p, t in outs:
                    pred[va] = p
                    trees.append(t)
                c["trees_median"] = int(max(10, round(float(np.median(trees)))))
            else:
                cols = FEATURE_SETS[c["feature_set"]]
                for tr, va in ctx.folds:
                    fm = fit_model(algo, c["params"], ctx.train.iloc[tr], cols)
                    pred[va] = fm.predict_labels(ctx.train.iloc[va])
            c["converged"] = True
            c["pred"] = pred
    for c in cands:
        m = full_metrics(ctx.y_lab, c.pop("pred"))
        c.update({f"cv_{k}": m[k] for k in ("accuracy", "balanced_accuracy", "macro_f1", "weighted_f1", "critical_precision",
                                            "critical_recall", "critical_f1", "critical_to_safe_rate")})
    return cands


# ---------------------------------------------------------------------------
# One experiment
# ---------------------------------------------------------------------------
def class_distribution(df: pd.DataFrame) -> str:
    vc = df[TARGET_COLUMN].value_counts()
    return "\n".join(f"  {c:<9}{int(vc.get(c, 0)):>7,}  ({vc.get(c, 0) / len(df):6.1%})" for c in RISK_CLASSES)


def run_experiment(exp: dict, data: dict) -> dict:
    ctx = Context(exp, data)
    key = f"EXP{exp['id']}"
    print(f"\n{LINE}\nEXPERIMENT {exp['id']}: {exp['name'].upper()}\n{LINE}")
    print(f"Training data: {' + '.join(FILES[s] for s in exp['train'])}")
    print(f"Testing data:  {FILES[exp['test']]}\n")
    print(f"Training rows: {len(ctx.train):,}")
    print(f"Testing rows:  {len(ctx.test):,}\n")
    print("Training class distribution:\n" + class_distribution(ctx.train))
    print("\nTesting class distribution:\n" + class_distribution(ctx.test))
    print(f"\nTraining-side validation: {ctx.cv_desc}")

    finals, fs_rows, models = [], [], {}
    for algo in ALGORITHMS:
        print(f"\nOptimizing {algo}...")
        t0 = time.time()
        cands = evaluate_candidates(ctx, algo, sample_configs(algo))
        valid = [c for c in cands if c["converged"]]
        chosen = select(valid, "cv_")
        for fs in FEATURE_SETS:
            pool = [c for c in valid if c["feature_set"] == fs]
            b = select(pool, "cv_") if pool else None
            fs_rows.append({"experiment": key, "model": algo, "feature_set": fs,
                            "candidates": sum(c["feature_set"] == fs for c in cands),
                            "non_converged_discarded": sum(c["feature_set"] == fs and not c["converged"] for c in cands),
                            "best_params": json.dumps(b["params"]) if b else "",
                            **({k: b[k] for k in b if k.startswith("cv_")} if b else {}),
                            "selected_for_algorithm": b is chosen})
        params = dict(chosen["params"])
        if algo == "XGBoost":
            params["n_estimators"] = chosen["trees_median"]  # median early-stopped tree count of the folds
        cols = FEATURE_SETS[chosen["feature_set"]]
        fm = fit_model(algo, params, ctx.train, cols, probability=(algo == "SVM"))
        pred = fm.predict_labels(ctx.test)
        m = full_metrics(ctx.test[TARGET_COLUMN].values, pred)
        row = {"experiment": key, "experiment_name": exp["name"],
               "training_data": " + ".join(FILES[s] for s in exp["train"]), "test_data": FILES[exp["test"]],
               "model": algo, "feature_set": chosen["feature_set"], "n_features": len(cols),
               "hyperparameters": json.dumps(params), "candidates_evaluated": len(cands),
               "non_converged_discarded": len(cands) - len(valid),
               **{k: chosen[k] for k in chosen if k.startswith("cv_")},
               **{k: v for k, v in m.items() if k != "confusion_matrix"},
               "critical_false_negative_rate": m["critical_false_negative_rate"],
               "confusion_matrix": json.dumps(m["confusion_matrix"]),
               "critical_flag": critical_flag(m) or "OK", "n_train": len(ctx.train), "n_test": len(ctx.test),
               "optimization_seconds": round(time.time() - t0, 1)}
        finals.append(row)
        models[algo] = (fm, pred, m)
        print(f"  Candidates evaluated: {len(cands)} ({CONFIGS_PER_FEATURE_SET} configurations x 3 feature sets)"
              + (f", {len(cands) - len(valid)} non-converged discarded" if len(cands) > len(valid) else ""))
        print(f"  Selected feature set: {chosen['feature_set']}")
        print(f"  Selected parameters:  {fmt_params(params)}")
        print(f"  CV Accuracy:          {chosen['cv_accuracy']:.4f}")
        print(f"  CV Macro F1:          {chosen['cv_macro_f1']:.4f}")
        print(f"  Test Accuracy:        {m['accuracy']:.4f}")
        print(f"  Balanced Accuracy:    {m['balanced_accuracy']:.4f}")
        print(f"  Macro F1:             {m['macro_f1']:.4f}")
        print(f"  Critical Recall:      {m['critical_recall']:.4f}")
        if critical_flag(m):
            print(f"  !! {critical_flag(m)}")
        print(f"  Time: {(time.time() - t0) / 60:.1f} min")

        EXPERIMENT_MODELS_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump({
            "experiment": key, "experiment_name": exp["name"], "algorithm": algo,
            "feature_set": chosen["feature_set"], "feature_columns": cols, "hyperparameters": params,
            "model": fm.estimator, "scaler": fm.preprocessor, "use_scaled": fm.use_scaled,
            "label_encoder": fm.label_encoder, "classes": RISK_CLASSES,
            "trained_on": [FILES[s] for s in exp["train"]], "n_train": len(ctx.train),
            "cross_validation": {k: chosen[k] for k in chosen if k.startswith("cv_")},
            "test_metrics": {k: v for k, v in m.items() if k != "confusion_matrix"},
            "note": "Final fair-comparison experiment model. NOT the production model (models/best_model.pkl is unchanged).",
        }, EXPERIMENT_MODELS_DIR / f"exp{exp['id']}_{model_slug(algo)}.pkl")

    comp = pd.DataFrame([{"Model": r["model"], "Feature Set": SHORT[r["feature_set"]], "Accuracy": r["accuracy"],
                          "Balanced Accuracy": r["balanced_accuracy"], "Macro F1": r["macro_f1"],
                          "Critical Precision": r["critical_precision"], "Critical Recall": r["critical_recall"],
                          "Critical F1": r["critical_f1"], "Critical->Safe": r["critical_to_safe_count"]} for r in finals])
    print(f"\nMODEL COMPARISON  (experiment {exp['id']}, test = {exp['test']})\n{'-' * 60}")
    print(comp.to_string(index=False, float_format=lambda v: f"{v:.4f}"))
    for r in finals:
        if r["critical_flag"] != "OK":
            print(f"  !! {r['model']}: {r['critical_flag']}")
    best = select([{**r, "critical_to_safe_rate": r["critical_to_safe_count"] / max(1, r["critical_support"])} for r in finals], "")
    print(f"\nBEST OVERALL MODEL (experiment {exp['id']}): {best['model']} ({best['feature_set']})")

    print(f"\nDETAILED CLASSIFICATION REPORTS  (experiment {exp['id']})")
    for algo, (fm, pred, m) in models.items():
        print(f"\n--- {algo} ({finals[ALGORITHMS.index(algo)]['feature_set']}) ---")
        print(classification_report(ctx.test[TARGET_COLUMN], pred, labels=RISK_CLASSES, digits=4, zero_division=0))
        cm = np.asarray(m["confusion_matrix"])
        print("Confusion matrix (rows = true, columns = predicted: Safe, Warning, Critical)")
        for c, r in zip(RISK_CLASSES, cm):
            print(f"  {c:<9}{r[0]:>8,}{r[1]:>8,}{r[2]:>8,}")
    return {"exp": exp, "finals": finals, "fs_rows": fs_rows, "best": best["model"], "comp": comp,
            "cv_desc": ctx.cv_desc, "models": models, "ctx": ctx}


# ---------------------------------------------------------------------------
# Plots (existing filenames)
# ---------------------------------------------------------------------------
def plot_experiment(exp: dict, comp: pd.DataFrame) -> None:
    metrics = ["Accuracy", "Balanced Accuracy", "Macro F1", "Critical Recall"]
    cats = [f"{r.Model} ({r['Feature Set']})" + ("  - misses all Critical" if r["Critical Recall"] == 0 else "")
            for _, r in comp.iterrows()]
    fig, ax = plt.subplots(figsize=(10.5, 6.2))
    ps.grouped_hbar(ax, cats, {m: comp[m].tolist() for m in metrics}, dict(zip(metrics, ps.SERIES)), xlim=(0, 1.12), bar_h=0.19)
    ax.set_title(f"Experiment {exp['id']}: {exp['name']}")
    ps.subtitle(ax, f"Test worker {exp['test']} - every algorithm tuned with the same training-side search")
    ax.legend(loc="lower center", bbox_to_anchor=(0.45, -0.2), ncol=4)
    ps.save(fig, OUTPUTS_DIR / f"model_comparison_experiment_{exp['id']}.png")


def plot_across(results: pd.DataFrame, metric: str, label: str, fname: str) -> None:
    cats = [f"Exp {e['id']}  {e['name']}" for e in EXPERIMENTS]
    series = {a: [float(results[(results.experiment == f"EXP{e['id']}") & (results.model == a)][metric].iloc[0])
                  for e in EXPERIMENTS] for a in ALGORITHMS}
    fig, ax = plt.subplots(figsize=(10.5, 6.0))
    ps.grouped_hbar(ax, cats, series, ps.MODEL_COLOR, xlim=(0, 1.12), bar_h=0.19)
    ax.set_title(f"{label} by experiment and algorithm")
    ps.subtitle(ax, "Final fair comparison: each algorithm's training-side-selected configuration on the test worker")
    ax.legend(loc="lower center", bbox_to_anchor=(0.45, -0.2), ncol=4)
    ps.save(fig, OUTPUTS_DIR / fname)


def plot_confusion(exp: dict, model: str, feature_set: str, cm) -> None:
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
    ax.set_title(f"Exp {exp['id']}: {model} ({SHORT[feature_set]})", fontsize=12)
    ps.subtitle(ax, f"Best overall model, test {exp['test']} - counts and % of each true class")
    ps.save(fig, OUTPUTS_DIR / f"confusion_matrix_experiment_{exp['id']}.png")


def all_plots(results: pd.DataFrame, final: pd.DataFrame) -> None:
    ps.apply()
    for exp in EXPERIMENTS:
        sub = results[results.experiment == f"EXP{exp['id']}"].set_index("model").loc[ALGORITHMS].reset_index()
        comp = pd.DataFrame({"Model": sub["model"], "Feature Set": sub["feature_set"].map(SHORT), "Accuracy": sub["accuracy"],
                             "Balanced Accuracy": sub["balanced_accuracy"], "Macro F1": sub["macro_f1"],
                             "Critical Recall": sub["critical_recall"]})
        plot_experiment(exp, comp)
        best = final[(final.experiment == f"EXP{exp['id']}") & final.best_in_experiment].iloc[0]
        row = sub[sub["model"] == best["model"]].iloc[0]
        plot_confusion(exp, row["model"], row["feature_set"], json.loads(row["confusion_matrix"]))
    plot_across(results, "critical_recall", "Critical recall", "critical_recall_comparison.png")
    plot_across(results, "macro_f1", "Macro F1", "macro_f1_comparison.png")
    plot_across(results, "accuracy", "Accuracy", "accuracy_comparison.png")


# ---------------------------------------------------------------------------
# Reports (existing filenames)
# ---------------------------------------------------------------------------
def write_results_md(results: pd.DataFrame, final: pd.DataFrame, fs_tab: pd.DataFrame, cv_desc: dict, runtime_min: float) -> None:
    f4 = lambda v: f"{v:.4f}"  # noqa: E731
    L = ["# ProSafe ML V2 - final fair model comparison (three experiments)", "",
         "Generated by `python src/run_experiments.py`.", "",
         "## Fairness of this comparison", "",
         "Earlier, XGBoost had been optimized more deeply than the other algorithms (a separate XGBoost-only study). "
         "This final experiment corrects that imbalance by giving **Random Forest, XGBoost, SVM and Logistic Regression "
         "comparable training-only hyperparameter and feature-set optimization**: the same budget of "
         f"{CONFIGS_PER_FEATURE_SET} seeded configurations x 3 feature sets = {3 * CONFIGS_PER_FEATURE_SET} candidates per "
         "algorithm per experiment, the same folds, and the same selection rule. **This result replaces the earlier, "
         "unfair model comparison for algorithm-selection purposes.**", "",
         "## How to read these numbers", "",
         "The previous ProSafe model reported about **98.9 % XGBoost accuracy** on a random row-level 80/20 split, where "
         "highly related neighbouring seconds of the same workers were divided randomly between training and testing. "
         "Here every model is tested on a **different dataset / worker** than it was trained on (cross-dataset, "
         "cross-worker transfer). That is a harder generalization problem, so the two kinds of score are not "
         "comparable; the old split was not reproduced.", "",
         "Accuracy is shown first, but a model is flagged when it fails on Critical: **UNSAFE** (Critical recall = 0), "
         "**POOR** (< 0.25), **LIMITED** (0.25-0.50).", "",
         "## Method", "",
         "| Experiment | Train | Test | Training-side validation |", "|---|---|---|---|"]
    for e in EXPERIMENTS:
        L.append(f"| {e['id']} {e['name']} | {' + '.join(FILES[s] for s in e['train'])} | {FILES[e['test']]} | {cv_desc[e['id']]} |")
    L += ["",
          "* **Search space** (sampled reproducibly, seed 42, the same 12 configurations tried with every feature set): "
          "Random Forest - n_estimators, max_depth, min_samples_split/leaf, max_features, criterion, class_weight "
          "(balanced / balanced_subsample / None), bootstrap; XGBoost - n_estimators (cap, early-stopped), learning_rate, "
          "max_depth, min_child_weight, subsample, colsample_bytree, gamma, reg_alpha, reg_lambda, training-only sample "
          "weights (unweighted, or balanced x Critical {1, 1.25, 1.5, 2, 3} x Warning {0.75, 1, 1.25}); SVM - 8 RBF "
          "(C 0.01-100, gamma scale/auto/0.0001-1), 2 linear (C 0.001-100), 2 polynomial (degree 2-3), class_weight "
          "balanced / None, probability=False during tuning; Logistic Regression - 6 L2 (lbfgs / newton-cg / saga), "
          "3 L1 (liblinear / saga), 3 elastic-net (saga, l1_ratio 0.25-0.75), C 0.001-100, class_weight balanced / None, "
          "max_iter 5000; non-converged configurations are discarded, not used.",
          "* Imputation (median) and StandardScaler for SVM / Logistic Regression, class weights and XGBoost early "
          "stopping (interleaved 300-row blocks inside the training fold, never the validation or test rows) are all "
          "fitted on the training fold only.",
          f"* **Selection rule:** candidates within {ACCURACY_BAND} of the best cross-validated accuracy, then highest "
          "macro F1 -> balanced accuracy -> Critical recall -> lowest Critical->Safe rate. The selected configuration "
          "is refitted on the whole training data and evaluated once on the test worker.",
          "* Validation folds without Critical (S_002 in Experiments 1-2; time blocks 1-2 of W_001 in Experiment 3) are "
          "kept as they are: metrics are computed on the pooled out-of-fold predictions, which contain all three classes.",
          ""]
    for e in EXPERIMENTS:
        sub = results[results.experiment == f"EXP{e['id']}"]
        best = final[(final.experiment == f"EXP{e['id']}") & final.best_in_experiment].iloc[0]
        L += [f"## Experiment {e['id']}: {e['name']}" + (" (primary hybrid experiment)" if e["id"] == 2 else ""), "",
              "| model | feature set | accuracy | bal. acc. | macro P | macro R | macro F1 | weighted F1 | Crit P | Crit R | "
              "Crit F1 | Crit->Warning | Crit->Safe | CV acc. | CV macro F1 |",
              "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
        for _, r in sub.iterrows():
            L.append(f"| {r.model} | {SHORT[r.feature_set]} | " + " | ".join(f4(r[c]) for c in (
                "accuracy", "balanced_accuracy", "macro_precision", "macro_recall", "macro_f1", "weighted_f1",
                "critical_precision", "critical_recall", "critical_f1")) +
                f" | {int(r.critical_to_warning_count)} ({r.critical_to_warning_pct:.1f} %) | {int(r.critical_to_safe_count)} "
                f"({r.critical_to_safe_pct:.1f} %) | {f4(r.cv_accuracy)} | {f4(r.cv_macro_f1)} |")
        L += ["", f"**Best overall model:** {best.model} ({best.feature_set}).", ""]
        for _, r in sub.iterrows():
            if r.critical_flag != "OK":
                L.append(f"* {r.model}: {r.critical_flag}")
        L += ["", "Selected configurations (training side):", ""]
        for _, r in sub.iterrows():
            L.append(f"* **{r.model}** - {r.feature_set}; {fmt_params(json.loads(r.hyperparameters))}; "
                     f"{int(r.candidates_evaluated)} candidates"
                     + (f" ({int(r.non_converged_discarded)} non-converged discarded)" if r.non_converged_discarded else "")
                     + f"; {r.optimization_seconds / 60:.1f} min.")
        L += ["", "Per-class (precision / recall / F1):", "",
              "| model | Safe | Warning | Critical |", "|---|---|---|---|"]
        for _, r in sub.iterrows():
            L.append(f"| {r.model} | " + " | ".join(
                f"{r[c + '_precision']:.3f} / {r[c + '_recall']:.3f} / {r[c + '_f1']:.3f}" for c in ("safe", "warning", "critical")) + " |")
        L += ["", f"![model comparison](model_comparison_experiment_{e['id']}.png)",
              f"![confusion matrix of the best overall model](confusion_matrix_experiment_{e['id']}.png)", ""]
    L += ["## Final three-experiment comparison (every algorithm)", "",
          "| experiment | model | feature set | accuracy | bal. acc. | macro F1 | Crit R | Crit F1 | flag |", "|---|---|---|---|---|---|---|---|---|"]
    for _, r in results.iterrows():
        L.append(f"| {r.experiment[-1]} | {r.model} | {SHORT[r.feature_set]} | {f4(r.accuracy)} | {f4(r.balanced_accuracy)} | "
                 f"{f4(r.macro_f1)} | {f4(r.critical_recall)} | {f4(r.critical_f1)} | {r.critical_flag if r.critical_flag != 'OK' else 'ok'} |")
    L += ["", "![accuracy](accuracy_comparison.png) ![macro F1](macro_f1_comparison.png) ![critical recall](critical_recall_comparison.png)", "",
          "## Did synthetic augmentation help? Experiment 2 (synthetic + W_001 -> W_002) minus Experiment 3 (W_001 -> W_002)", "",
          "| model | delta accuracy | delta bal. acc. | delta macro F1 | delta Critical recall |", "|---|---|---|---|---|"]
    for a in ALGORITHMS:
        e2 = results[(results.experiment == "EXP2") & (results.model == a)].iloc[0]
        e3 = results[(results.experiment == "EXP3") & (results.model == a)].iloc[0]
        L.append(f"| {a} | {e2.accuracy - e3.accuracy:+.4f} | {e2.balanced_accuracy - e3.balanced_accuracy:+.4f} | "
                 f"{e2.macro_f1 - e3.macro_f1:+.4f} | {e2.critical_recall - e3.critical_recall:+.4f} |")
    piv = fs_tab.pivot_table(index=["experiment", "model"], columns="feature_set", values="cv_accuracy").round(4)
    piv2 = fs_tab.pivot_table(index=["experiment", "model"], columns="feature_set", values="cv_macro_f1").round(4)
    L += ["", "## Feature sets (training side only)", "",
          "Best cross-validated candidate within each feature set (same selection rule). Test metrics are reported only "
          "for the configuration finally selected per algorithm. Full rows: `feature_set_comparison.csv`.", "",
          "CV accuracy:", "", piv.to_markdown(), "", "CV macro F1:", "", piv2.to_markdown(), "",
          "## Notes", "",
          "* W_001 and W_002 were already evaluated in earlier work. Selection here used only the training side, but any "
          "redesign motivated by these results needs a NEW unseen real worker for an unbiased estimate.",
          "* Why Critical is missed on W_002 (UV-driven Critical absent from training): `critical_failure_analysis.md`.",
          "* Models: `models/experiments/exp{1,2,3}_{random_forest,xgboost,svm,logistic_regression}.pkl`. "
          "`models/best_model.pkl` (previous candidate) was not changed.",
          f"* Total runtime: {runtime_min:.1f} min.", ""]
    (OUTPUTS_DIR / "EXPERIMENT_RESULTS.md").write_text("\n".join(L), encoding="utf-8")


HAZARDS = {"heat": "temp_warning_exposure_sec", "uv": "uv_warning_exposure_sec", "uv_crit": "uv_critical_exposure_sec",
           "gas": "gas_warning_exposure_sec", "noise": "noise_warning_exposure_sec", "hr": "hr_warning_exposure_sec",
           "hr_crit": "hr_critical_exposure_sec", "body_temp": "body_temp_warning_exposure_sec"}


def _episodes(y: np.ndarray) -> list[int]:
    c = (y == "Critical").astype(int)
    s = np.flatnonzero(np.diff(np.r_[0, c]) == 1)
    e = np.flatnonzero(np.diff(np.r_[c, 0]) == -1)
    return (e - s + 1).tolist()


def write_critical_failure_md(data: dict, runs: list[dict]) -> None:
    """Why Critical is missed on the test workers -- model-independent evidence + the final models' Critical handling."""
    L = ["# Why Critical is missed on the test workers (final fair comparison)", "",
         "Generated by `python src/run_experiments.py`. Diagnosis only: no label, row, threshold, feature or model was "
         "changed because of it. W_001 and W_002 were already evaluated before; any redesign motivated by this analysis "
         "needs a NEW unseen real worker.", "",
         "## 1. Critical outcomes of every final model", "",
         "| experiment | model | Critical seconds | caught | -> Warning | -> Safe | Critical recall | mean P(Critical) on true Critical |",
         "|---|---|---|---|---|---|---|---|"]
    for run in runs:
        ctx = run["ctx"]
        crit = (ctx.test[TARGET_COLUMN] == "Critical").values
        for algo, (fm, pred, m) in run["models"].items():
            proba = fm.predict_proba(ctx.test)
            pc = "-" if proba is None else f"{proba[crit, list(fm.label_encoder.classes_).index('Critical')].mean():.3f}"
            cm = np.asarray(m["confusion_matrix"])
            L.append(f"| {run['exp']['id']} | {algo} | {int(cm[2].sum())} | {int(cm[2, 2])} | {int(cm[2, 1])} | "
                     f"{int(cm[2, 0])} | {m['critical_recall']:.3f} | {pc} |")
    L.append("")
    d = pd.concat([data[s].assign(source=s) for s in ("synthetic", "W_001", "W_002")], ignore_index=True)
    crit_rows = d[d[TARGET_COLUMN] == "Critical"]
    share = pd.DataFrame({s: pd.DataFrame({k: g[v] > 0 for k, v in HAZARDS.items()}).mean()
                          for s, g in crit_rows.groupby("source", sort=False)})
    sig = pd.DataFrame({k: d[v] > 0 for k, v in HAZARDS.items()}).apply(lambda r: " + ".join(k for k in HAZARDS if r[k]) or "(none)", axis=1)
    d["signature"] = sig
    w2_sig = d[(d.source == "W_002") & (d[TARGET_COLUMN] == "Critical")]["signature"].value_counts()
    top_sig = w2_sig.index[0]
    tr = d[(d.source != "W_002") & (d.signature == top_sig)][TARGET_COLUMN].value_counts()
    uvc = {s: (g.loc[g[HAZARDS["uv_crit"]] > 0, TARGET_COLUMN] == "Critical").mean() for s, g in d.groupby("source", sort=False)}
    eps = {s: _episodes(g[TARGET_COLUMN].values) for s, g in d.groupby("source", sort=False)}
    med = crit_rows.groupby("source", sort=False)[["hr_deviation_pct", "body_temp_deviation_c", "ambient_temperature",
                                                   "uv_rolling_mean_300s"]].median().round(2)
    L += ["## 2. The Critical class is produced by different hazard mechanisms", "",
          "Share of Critical rows whose exposure counter is active for each hazard:", "", share.round(3).to_markdown(), "",
          f"* W_002's most frequent Critical signature is `{top_sig}` ({w2_sig.iloc[0] / w2_sig.sum():.0%} of its Critical "
          f"rows); it occurs in only **{int(tr.sum())} training rows** (synthetic + W_001), labelled "
          + ", ".join(f"{c} {int(tr.get(c, 0))}" for c in RISK_CLASSES) + ".",
          "* Share of seconds labelled Critical when the UV-critical counter is active: "
          + ", ".join(f"{s} {v:.0%}" for s, v in uvc.items()) + ". The synthetic data maps critical UV to Warning far more "
          "often than the real workers do.",
          "* Critical episodes: " + ", ".join(f"{s} {len(v)} (median {int(np.median(v)) if v else 0} s)" for s, v in eps.items())
          + " - tens of independent events, not thousands.", "",
          "Median feature values of Critical rows:", "", med.to_markdown(), "",
          "## 3. Conclusion", "",
          "* Training Critical is driven by long **heat exposure and heart-rate / body-temperature escalation**. W_002's "
          "Critical is driven by **sustained critical UV with moderately raised heart rate and no heat**. That mechanism is "
          "almost absent from every training set, so no training-side search can reward detecting it: missed W_002 Critical "
          "seconds land in Warning (rarely Safe). This is a training-data coverage problem, not an algorithm or tuning failure.",
          "* Exposure-duration features encode *which* hazards co-occurred with Critical in training. They raise overall "
          "accuracy but specialize models to the training mechanisms.",
          "* Next data step (not done here): collect / simulate UV-, gas- and noise-driven Critical episodes without heat, "
          "and validate on a new unseen real worker. Until then deterministic critical-exposure rules should run alongside "
          "the classifier.", ""]
    (OUTPUTS_DIR / "critical_failure_analysis.md").write_text("\n".join(L), encoding="utf-8")


# ---------------------------------------------------------------------------
def main() -> None:
    OUTPUTS_DIR.mkdir(exist_ok=True)
    if "--charts-only" in sys.argv:
        all_plots(pd.read_csv(OUTPUTS_DIR / "experiment_results.csv"), pd.read_csv(OUTPUTS_DIR / "final_experiment_summary.csv"))
        print("Plots redrawn from the saved CSVs.")
        return
    t_all = time.time()
    warnings.filterwarnings("ignore", category=UserWarning)
    data = load_sources()
    print(f"{LINE}\nPROSAFE ML V2 - FINAL FAIR MODEL OPTIMIZATION\n{LINE}")
    print("Datasets loaded (labels verified: Safe / Warning / Critical only):")
    for s in ("synthetic", "W_001", "W_002"):
        print(f"  {FILES[s]:<34}{len(data[s]):>7,} rows  workers: {', '.join(sorted(data[s][WORKER_COLUMN].unique()))}")
    print("Feature sets: " + ", ".join(f"{k} ({len(v)})" for k, v in FEATURE_SETS.items()))
    print(f"Random seed: {RANDOM_STATE}")
    print(f"Search budget: {CONFIGS_PER_FEATURE_SET} configurations x 3 feature sets = {3 * CONFIGS_PER_FEATURE_SET} "
          "candidates per algorithm per experiment (all four algorithms)")
    print(f"Selection: accuracy within {ACCURACY_BAND} of the best CV accuracy -> macro F1 -> balanced accuracy -> "
          "Critical recall -> lowest Critical->Safe rate")
    print("Validation: Exp 1-2 LeaveOneGroupOut by worker_id; Exp 3 contiguous time blocks with 300-row purge")

    runs = [run_experiment(exp, data) for exp in EXPERIMENTS]
    results = pd.DataFrame([r for run in runs for r in run["finals"]])
    best = {f"EXP{run['exp']['id']}": run["best"] for run in runs}
    final = results[["experiment", "experiment_name", "model", "feature_set", "accuracy", "balanced_accuracy", "macro_f1",
                     "weighted_f1", "critical_precision", "critical_recall", "critical_f1", "critical_to_safe_count",
                     "critical_flag"]].copy()
    final["best_in_experiment"] = [best[e] == m for e, m in zip(final.experiment, final.model)]
    fs_tab = pd.DataFrame([r for run in runs for r in run["fs_rows"]])
    results.to_csv(OUTPUTS_DIR / "experiment_results.csv", index=False)
    final.to_csv(OUTPUTS_DIR / "final_experiment_summary.csv", index=False)
    fs_tab.to_csv(OUTPUTS_DIR / "feature_set_comparison.csv", index=False)
    all_plots(results, final)
    write_critical_failure_md(data, runs)
    runtime = (time.time() - t_all) / 60
    write_results_md(results, final, fs_tab, {run["exp"]["id"]: run["cv_desc"] for run in runs}, runtime)

    print(f"\n{LINE}\nFINAL THREE-EXPERIMENT COMPARISON\n{LINE}")
    show = results[["experiment", "model", "feature_set", "accuracy", "balanced_accuracy", "macro_f1", "critical_recall", "critical_f1"]].copy()
    show["experiment"] = show["experiment"].str[-1]
    show["feature_set"] = show["feature_set"].map(SHORT)
    show["best"] = np.where(final["best_in_experiment"], "<- best", "")
    show.columns = ["Experiment", "Model", "Feature Set", "Accuracy", "Balanced Accuracy", "Macro F1", "Critical Recall", "Critical F1", ""]
    print(show.to_string(index=False, float_format=lambda v: f"{v:.4f}"))
    print(f"\nEXPERIMENT 2 vs EXPERIMENT 3 (synthetic augmentation effect on W_002: Exp 2 minus Exp 3)\n{'-' * 60}")
    print(f"{'Model':<22}{'d Accuracy':>12}{'d Bal Acc':>12}{'d Macro F1':>12}{'d Crit Recall':>15}")
    for a in ALGORITHMS:
        e2 = results[(results.experiment == "EXP2") & (results.model == a)].iloc[0]
        e3 = results[(results.experiment == "EXP3") & (results.model == a)].iloc[0]
        print(f"{a:<22}{e2.accuracy - e3.accuracy:>+12.4f}{e2.balanced_accuracy - e3.balanced_accuracy:>+12.4f}"
              f"{e2.macro_f1 - e3.macro_f1:>+12.4f}{e2.critical_recall - e3.critical_recall:>+15.4f}")
    flagged = results[results.critical_flag != "OK"]
    if len(flagged):
        print("\nCritical-detection warnings:")
        for _, r in flagged.iterrows():
            print(f"  !! Exp {r.experiment[-1]} {r.model}: {r.critical_flag}")
    print("\nBest overall model per experiment (accuracy band 0.01 -> macro F1 -> ...; descriptive only): "
          + ", ".join(f"Exp {k[-1]}: {v}" for k, v in best.items()))
    print("Production model (models/best_model.pkl) was NOT changed.")
    print(f"Total runtime: {runtime:.1f} min")


if __name__ == "__main__":
    main()
