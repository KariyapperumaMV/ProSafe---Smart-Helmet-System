"""
ProSafe ML V2 -- external evaluation of the three training strategies on a NEW unseen real worker, W_003.

    EXPERIMENT 1   Synthetic -> W_003                    train synthetic S_001-S_004          (historical test W_001)
    EXPERIMENT 2   Hybrid Synthetic + W_001 -> W_003     train synthetic S_001-S_004 + W_001  (historical test W_002)
    EXPERIMENT 3   W_001 -> W_003                        train W_001                          (historical test W_002)

The training side is imported unchanged from run_experiments.py: the same feature sets, the same four algorithms,
the same 12 seeded configurations x 3 feature sets = 36 candidates per algorithm per experiment, the same
training-side validation (LeaveOneGroupOut by worker for Experiments 1-2; 5 contiguous chronological blocks with a
300-row purge for Experiment 3), the same fold-internal imputation / scaling / class weights / XGBoost early stopping,
and the same selection rule (accuracy within 0.01 of the best, then macro F1 -> balanced accuracy -> Critical recall
-> lowest Critical->Safe rate).

W_003 is evaluation only. It is loaded separately from the training data and never enters the training context,
the folds, early stopping, class weighting, feature-set selection or the selection rule. Each selected configuration
is refitted on the full training data, frozen (saved), and only then scored ONCE on W_003. Everything after that
(best-model statements, strategy comparison, post-hoc failure analysis) is descriptive and feeds nothing back.

Nothing here changes the production model (models/best_model.pkl and its metadata), the original experiment
artifacts (models/experiments/) or the original outputs (outputs/*.csv|md|png). New files go to
outputs/experiment_v2/ and models/experiment_v2/ only.

Run from the project root:
    python src/run_experiment_v2.py                     # full run (~3 h)
    python src/run_experiment_v2.py --check             # validations only (schema, contract, isolation, hashes)
    python src/run_experiment_v2.py --report-only       # rebuild reports/plots from the frozen models + CSV
    python src/run_experiment_v2.py --audit PATH        # optional W_003 audit file for the post-hoc analysis
                                                        # (default: data/prosafe_W003_preprocessed_audit.csv)
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
    WORKER_COLUMN,
    _read_ml_ready,
    is_forbidden_predictor,
    model_slug,
)

NEW_WORKER = "W_003"
W003_DATA_PATH = DATA_DIR / "prosafe_W003_ml_ready.csv"
DEFAULT_AUDIT_PATH = DATA_DIR / "prosafe_W003_preprocessed_audit.csv"
OUT_DIR = OUTPUTS_DIR / "experiment_v2"
MODEL_OUT_DIR = MODELS_DIR / "experiment_v2"
ORIGINAL_RESULTS = OUTPUTS_DIR / "experiment_results.csv"
EXPECTED_COLUMNS = [WORKER_COLUMN, TIMESTAMP_COLUMN] + EXTENDED_FEATURE_COLUMNS + [TARGET_COLUMN]
LINE = rx.LINE
ALGORITHMS = rx.ALGORITHMS
FEATURE_SETS = rx.FEATURE_SETS
SHORT = rx.SHORT

# The three strategies of run_experiments.py; only the final evaluation worker changes.
EXPERIMENTS = [
    {"id": 1, "name": "Synthetic -> W_003", "strategy": "Synthetic only (S_001-S_004)", "short": "Synthetic only",
     "train": ["synthetic"], "cv": "workers", "historical_test": "W_001"},
    {"id": 2, "name": "Hybrid Synthetic + W_001 -> W_003", "strategy": "Hybrid: Synthetic S_001-S_004 + W_001",
     "short": "Hybrid Synthetic + W_001", "train": ["synthetic", "W_001"], "cv": "workers", "historical_test": "W_002"},
    {"id": 3, "name": "W_001 -> W_003", "strategy": "W_001 only (real worker 1)", "short": "W_001 only",
     "train": ["W_001"], "cv": "time_blocks", "historical_test": "W_002"},
]
for _e, _o in zip(EXPERIMENTS, rx.EXPERIMENTS):  # same training strategies as the original experiments
    assert _e["id"] == _o["id"] and _e["train"] == _o["train"] and _e["cv"] == _o["cv"] and _e["historical_test"] == _o["test"]
FILES = {"synthetic": SYNTHETIC_DATA_PATH.name, "W_001": W001_DATA_PATH.name, NEW_WORKER: W003_DATA_PATH.name}


# ---------------------------------------------------------------------------
# Protected files: hashed before and after the run
# ---------------------------------------------------------------------------
def protected_files() -> list[Path]:
    prod = [BEST_MODEL_PATH, BEST_MODEL_META_PATH, MODELS_DIR / "all_models_meta.pkl", LABEL_ENCODER_PATH,
            MODELS_DIR / "frozen_config.json"]
    return ([p for p in prod if p.exists()] + sorted(rx.EXPERIMENT_MODELS_DIR.glob("*.pkl"))
            + sorted(p for p in OUTPUTS_DIR.iterdir() if p.is_file()) + sorted(DATA_DIR.glob("*.csv"))
            + [rx.SRC_DIR / "run_experiments.py"])


def snapshot() -> dict[str, str]:
    out = {}
    for p in protected_files():
        h = hashlib.sha256()
        with open(p, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        out[str(p.relative_to(rx.SRC_DIR.parent))] = h.hexdigest()
    return out


def compare_snapshots(before: dict, after: dict) -> list[str]:
    return sorted(k for k in set(before) | set(after) if before.get(k) != after.get(k))


# ---------------------------------------------------------------------------
# W_003 validation
# ---------------------------------------------------------------------------
def load_w003() -> pd.DataFrame:
    """Read + validate W_003 (utils checks required columns and that labels are Safe/Warning/Critical only)."""
    df = _read_ml_ready(W003_DATA_PATH)
    cols = [c for c in df.columns if not c.startswith("_")]
    if len(cols) != len(EXPECTED_COLUMNS) or set(cols) != set(EXPECTED_COLUMNS):
        raise ValueError(f"W_003 columns differ from the V2 contract. Extra: {sorted(set(cols) - set(EXPECTED_COLUMNS))}, "
                         f"missing: {sorted(set(EXPECTED_COLUMNS) - set(cols))}")
    # Every ML-ready file stores noise_dose_pct after the exposure counters; models always select features BY NAME
    # in contract order (train[cols]), so the file layout must simply match the training files.
    if cols != list(pd.read_csv(W001_DATA_PATH, nrows=0).columns):
        raise ValueError("W_003 column layout differs from the training files")
    if set(df[WORKER_COLUMN]) != {NEW_WORKER}:
        raise ValueError(f"W_003 file contains worker IDs {sorted(set(df[WORKER_COLUMN]))}")
    forbidden = [c for c in cols if c not in (WORKER_COLUMN, TIMESTAMP_COLUMN, TARGET_COLUMN) and is_forbidden_predictor(c)]
    if forbidden or {"baseline_hr", "baseline_body_temperature"} & set(cols):
        raise ValueError(f"Forbidden / raw-baseline columns present in W_003: {forbidden}")
    for fs, fcols in FEATURE_SETS.items():
        if [c for c in fcols if c not in cols]:
            raise ValueError(f"W_003 lacks features of {fs}")
    return df.reset_index(drop=True)


def print_w003_validation(w3: pd.DataFrame) -> None:
    vc = w3[TARGET_COLUMN].value_counts()
    na = w3[EXTENDED_FEATURE_COLUMNS].isna().sum()
    print("W_003 dataset:")
    print(f"  File:     data/{W003_DATA_PATH.name}")
    print(f"  Rows:     {len(w3):,}")
    print(f"  Columns:  {len(EXPECTED_COLUMNS)} (worker_id, timestamp, {len(EXTENDED_FEATURE_COLUMNS)} EXTENDED features, risk_level)")
    print(f"  Worker:   {', '.join(sorted(w3[WORKER_COLUMN].unique()))}")
    for c in RISK_CLASSES:
        print(f"  {c + ':':<10}{int(vc.get(c, 0)):>6,}  ({vc.get(c, 0) / len(w3):.1%})")
    print(f"  Time span: {w3['_ts_minute'].min()} -> {w3['_ts_minute'].max()}")
    print(f"  Feature count: {len(EXTENDED_FEATURE_COLUMNS)} (exact utils.EXTENDED_FEATURE_COLUMNS names; same column layout "
          "as the training files; models select features by name in contract order)")
    print(f"  Missing values: {int(na.sum()):,} cells in {int((na > 0).sum())} features"
          + (" (" + ", ".join(f"{k} {int(v)}" for k, v in na[na > 0].items()) + ")" if na.sum() else ""))
    print("  Forbidden predictors / raw baselines / audit columns: none")


# ---------------------------------------------------------------------------
# Training side (no W_003 anywhere in here)
# ---------------------------------------------------------------------------
class TrainingContext:
    """The attributes rx.evaluate_candidates needs -- built from the TRAINING sources only. There is no test set."""

    def __init__(self, exp: dict, sources: dict[str, pd.DataFrame], row_step: int = 1):
        if NEW_WORKER in sources:
            raise RuntimeError("W_003 must not be passed to the training side")
        self.exp = exp
        self.train = pd.concat([sources[s] for s in exp["train"]], ignore_index=True)
        if row_step > 1:  # --smoke only
            self.train = self.train.iloc[::row_step].reset_index(drop=True)
        if NEW_WORKER in set(self.train[WORKER_COLUMN]):
            raise RuntimeError("W_003 leaked into the training data")
        self.y_lab = self.train[TARGET_COLUMN].values
        self.y_code = np.array([RISK_CLASSES.index(c) for c in self.y_lab], dtype=np.int8)
        self.groups = self.train[WORKER_COLUMN].values
        self.folds, self.cv_desc = rx.internal_folds(self.train, exp["cv"])
        self.es = [rx.xgb_es_split(self.groups, tr) for tr, _ in self.folds]
        self.X = {fs: self.train[cols].to_numpy(np.float32) for fs, cols in FEATURE_SETS.items()}


def overlapping_rows(train: pd.DataFrame, w3: pd.DataFrame) -> int:
    """W_003 rows whose full 38-feature vector also occurs in the training data (duplicate-leak check)."""
    key = lambda d: pd.util.hash_pandas_object(d[EXTENDED_FEATURE_COLUMNS].round(6), index=False)  # noqa: E731
    return int(key(w3).isin(set(key(train))).sum())


def rel(path: Path) -> str:
    """Project-relative path where possible (smoke runs write outside the project)."""
    try:
        return str(path.relative_to(rx.SRC_DIR.parent))
    except ValueError:
        return str(path)


def w003_flag(m: dict) -> str:
    r = m["critical_recall"]
    if r == 0:
        return "UNSAFE CRITICAL DETECTION: missed every W_003 Critical observation."
    if r < 0.25:
        return f"POOR CRITICAL DETECTION (Critical recall {r:.3f})"
    if r < 0.5:
        return f"LIMITED CRITICAL DETECTION (Critical recall {r:.3f})"
    return ""


def original_results() -> pd.DataFrame | None:
    return pd.read_csv(ORIGINAL_RESULTS) if ORIGINAL_RESULTS.exists() else None


def same_as_original(orig: pd.DataFrame | None, key: str, algo: str, fs: str, params: dict) -> str:
    if orig is None:
        return "original results not found"
    r = orig[(orig.experiment == key) & (orig.model == algo)]
    if r.empty:
        return "not in original results"
    same = r.iloc[0].feature_set == fs and json.loads(r.iloc[0].hyperparameters) == json.loads(json.dumps(params))
    return "yes" if same else "NO"


def save_frozen(exp: dict, algo: str, chosen: dict, params: dict, cols: list, fm: FittedModel, ctx: TrainingContext,
                models_dir: Path) -> Path:
    models_dir.mkdir(parents=True, exist_ok=True)
    path = models_dir / f"exp{exp['id']}_{model_slug(algo)}.pkl"
    joblib.dump({
        "experiment": f"EXP{exp['id']}", "experiment_name": exp["name"], "training_strategy": exp["strategy"],
        "original_historical_test": exp["historical_test"], "external_evaluation_worker": NEW_WORKER,
        "algorithm": algo, "feature_set": chosen["feature_set"], "feature_columns": cols, "hyperparameters": params,
        "model": fm.estimator, "scaler": fm.preprocessor, "use_scaled": fm.use_scaled,
        "label_encoder": fm.label_encoder, "classes": RISK_CLASSES,
        "trained_on": [FILES[s] for s in exp["train"]], "n_train": len(ctx.train),
        "cross_validation": {k: chosen[k] for k in chosen if k.startswith("cv_")},
        "note": "Frozen on the training side before W_003 was scored. Evaluation-study model, NOT the production model.",
    }, path)
    return path


def load_frozen(exp: dict, algo: str, models_dir: Path) -> FittedModel:
    a = joblib.load(models_dir / f"exp{exp['id']}_{model_slug(algo)}.pkl")
    return FittedModel(algo, a["hyperparameters"], list(a["feature_columns"]), a["model"], a["scaler"], a["label_encoder"])


# ---------------------------------------------------------------------------
# One experiment: optimize on training data only -> refit -> freeze -> score W_003 once
# ---------------------------------------------------------------------------
def run_experiment(exp: dict, sources: dict, w3: pd.DataFrame, orig, models_dir: Path, smoke: bool) -> dict:
    ctx = TrainingContext(exp, sources, row_step=3 if smoke else 1)
    key = f"EXP{exp['id']}"
    print(f"\n{LINE}\nEXPERIMENT {exp['id']}: {exp['name'].upper()}\n{LINE}")
    print(f"Training strategy:\n  {exp['strategy']}  ({' + '.join(FILES[s] for s in exp['train'])})")
    print(f"Historical evaluation:\n  {exp['historical_test']} (original run_experiments.py result, not re-run)")
    print(f"New external evaluation:\n  {NEW_WORKER} ({FILES[NEW_WORKER]}, evaluation only)\n")
    print(f"Training rows: {len(ctx.train):,}   workers: {', '.join(dict.fromkeys(ctx.train[WORKER_COLUMN]))}")
    print(f"W_003 rows:    {len(w3):,}\n")
    print("Training class distribution:\n" + rx.class_distribution(ctx.train))
    print(f"\nTraining-side validation: {ctx.cv_desc}")

    finals, preds, fitted = [], {}, {}
    for algo in ALGORITHMS:
        print(f"\nOptimizing {algo} on training data only...")
        t0 = time.time()
        configs = rx.sample_configs(algo)[: 1 if smoke else None]
        cands = rx.evaluate_candidates(ctx, algo, configs)  # training side only
        valid = [c for c in cands if c["converged"]]
        if smoke and not valid:  # smoke test only; the full run behaves exactly like run_experiments.py
            valid = cands
        chosen = rx.select(valid, "cv_")
        params = dict(chosen["params"])
        if algo == "XGBoost":
            params["n_estimators"] = chosen["trees_median"]
        cols = FEATURE_SETS[chosen["feature_set"]]
        fm = fit_model(algo, params, ctx.train, cols, probability=(algo == "SVM"))
        path = save_frozen(exp, algo, chosen, params, cols, fm, ctx, models_dir)  # frozen BEFORE W_003 is scored
        match = same_as_original(orig, key, algo, chosen["feature_set"], params)

        pred = fm.predict_labels(w3)  # the single W_003 evaluation of this frozen model
        m = rx.full_metrics(w3[TARGET_COLUMN].values, pred)
        flag = w003_flag(m)
        row = {"experiment": key, "experiment_name": exp["name"], "training_strategy": exp["strategy"],
               "original_historical_test": exp["historical_test"], "evaluation_worker": NEW_WORKER,
               "training_data": " + ".join(FILES[s] for s in exp["train"]), "model": algo,
               "feature_set": chosen["feature_set"], "n_features": len(cols), "hyperparameters": json.dumps(params),
               "same_config_as_original_run": match, "candidates_evaluated": len(cands),
               "non_converged_discarded": len(cands) - len(valid),
               **{k: chosen[k] for k in chosen if k.startswith("cv_")},
               **{k: v for k, v in m.items() if k != "confusion_matrix"},
               "confusion_matrix": json.dumps(m["confusion_matrix"]), "critical_flag": flag or "OK",
               "n_train": len(ctx.train), "n_w003": len(w3), "model_file": rel(path),
               "optimization_seconds": round(time.time() - t0, 1)}
        finals.append(row)
        preds[algo], fitted[algo] = pred, fm
        print(f"  Candidates evaluated: {len(cands)} ({len(configs)} configurations x 3 feature sets)"
              + (f", {len(cands) - len(valid)} non-converged discarded" if len(cands) > len(valid) else ""))
        print(f"  Selected feature set: {chosen['feature_set']}")
        print(f"  Selected parameters:  {rx.fmt_params(params)}")
        print(f"  Same configuration as the original run_experiments.py selection: {match}")
        print(f"  CV Accuracy:          {chosen['cv_accuracy']:.4f}")
        print(f"  CV Macro F1:          {chosen['cv_macro_f1']:.4f}")
        print(f"  Frozen model:         {row['model_file']}")
        print(f"  W_003 Accuracy:       {m['accuracy']:.4f}")
        print(f"  W_003 Balanced Acc.:  {m['balanced_accuracy']:.4f}")
        print(f"  W_003 Macro F1:       {m['macro_f1']:.4f}")
        print(f"  W_003 Critical P/R/F1: {m['critical_precision']:.4f} / {m['critical_recall']:.4f} / {m['critical_f1']:.4f}")
        print(f"  Critical -> Warning:  {m['critical_to_warning_count']} ({m['critical_to_warning_pct']:.1f} %)   "
              f"Critical -> Safe: {m['critical_to_safe_count']} ({m['critical_to_safe_pct']:.1f} %)")
        if flag:
            print(f"  !! {flag}")
        print(f"  Time: {(time.time() - t0) / 60:.1f} min")

    print_experiment_summary(exp, finals, preds, w3)
    return {"exp": exp, "finals": finals, "preds": preds, "fitted": fitted, "cv_desc": ctx.cv_desc,
            "train": ctx.train}


def comparison_table(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame([{"Model": r["model"], "Feature Set": SHORT[r["feature_set"]], "Accuracy": r["accuracy"],
                          "Balanced Accuracy": r["balanced_accuracy"], "Macro F1": r["macro_f1"],
                          "Critical Precision": r["critical_precision"], "Critical Recall": r["critical_recall"],
                          "Critical F1": r["critical_f1"], "Critical->Safe": int(r["critical_to_safe_count"])} for r in rows])


def print_experiment_summary(exp: dict, finals: list[dict], preds: dict, w3: pd.DataFrame) -> None:
    print(f"\nMODEL COMPARISON ON W_003  (experiment {exp['id']}: {exp['name']}; "
          f"original historical test {exp['historical_test']})\n{'-' * 60}")
    print(comparison_table(finals).to_string(index=False, float_format=lambda v: f"{v:.4f}"))
    for r in finals:
        if r["critical_flag"] != "OK":
            print(f"  !! {r['model']}: {r['critical_flag']}")
    best = rx.select(finals, "")
    cv_best = rx.select(finals, "cv_")
    print(f"\nBest model on W_003 (selection rule applied descriptively to W_003 results): {best['model']} ({best['feature_set']})")
    print(f"Training-side choice (selection rule on CV metrics, W_003 not used): {cv_best['model']} ({cv_best['feature_set']})")
    print(f"\nDETAILED CLASSIFICATION REPORTS ON W_003  (experiment {exp['id']})")
    for r in finals:
        print(f"\n--- {r['model']} ({r['feature_set']}) ---")
        print(classification_report(w3[TARGET_COLUMN], preds[r["model"]], labels=RISK_CLASSES, digits=4, zero_division=0))
        print("Confusion matrix (rows = true, columns = predicted: Safe, Warning, Critical)")
        for c, row in zip(RISK_CLASSES, json.loads(r["confusion_matrix"])):
            print(f"  {c:<9}{row[0]:>8,}{row[1]:>8,}{row[2]:>8,}")


# ---------------------------------------------------------------------------
# Cross-experiment analysis (descriptive; after every model is frozen and scored)
# ---------------------------------------------------------------------------
def with_rates(df: pd.DataFrame) -> list[dict]:
    return [dict(r) for _, r in df.iterrows()]


def strategy_analysis(res: pd.DataFrame) -> dict:
    """Pre-specified comparison: per-strategy representative = the selection rule over its four models; best strategy
    = the same rule over the three representatives. Mean over algorithms and per-algorithm wins are reported too."""
    reps = {e["id"]: rx.select(with_rates(res[res.experiment == f"EXP{e['id']}"]), "") for e in EXPERIMENTS}
    best_rep = rx.select(list(reps.values()), "")
    best_strategy = int(best_rep["experiment"][-1])
    overall = rx.select(with_rates(res), "")
    metrics = ["accuracy", "balanced_accuracy", "macro_f1", "critical_recall", "critical_f1"]
    means = res.groupby("experiment")[metrics].mean()
    per_algo = {a: {e["id"]: res[(res.experiment == f"EXP{e['id']}") & (res.model == a)].iloc[0] for e in EXPERIMENTS}
                for a in ALGORITHMS}
    wins = {m: {e["id"]: sum(max(per_algo[a].values(), key=lambda r: r[m])["experiment"] == f"EXP{e['id']}"
                             for a in ALGORITHMS) for e in EXPERIMENTS} for m in metrics}
    h_vs_1 = {m: sum(per_algo[a][2][m] > per_algo[a][1][m] for a in ALGORITHMS) for m in metrics}
    h_vs_3 = {m: sum(per_algo[a][2][m] > per_algo[a][3][m] for a in ALGORITHMS) for m in metrics}
    if best_strategy == 2 and h_vs_1["macro_f1"] >= 3 and h_vs_3["macro_f1"] >= 3:
        verdict = "YES"
    elif best_strategy != 2 and (h_vs_1["macro_f1"] <= 1 or h_vs_3["macro_f1"] <= 1):
        verdict = "NO"
    else:
        verdict = "MIXED"
    return {"reps": reps, "best_strategy": best_strategy, "overall": overall, "means": means, "per_algo": per_algo,
            "wins": wins, "h_vs_1": h_vs_1, "h_vs_3": h_vs_3, "verdict": verdict}


def historical_comparison(res: pd.DataFrame, orig: pd.DataFrame | None) -> pd.DataFrame:
    rows = []
    for _, r in res.iterrows():
        o = None if orig is None else orig[(orig.experiment == r.experiment) & (orig.model == r.model)]
        o = None if o is None or o.empty else o.iloc[0]
        row = {"experiment": r.experiment, "model": r.model, "historical_test": r.original_historical_test}
        for m in ("accuracy", "balanced_accuracy", "macro_f1", "critical_recall", "critical_f1"):
            row[f"hist_{m}"] = float(o[m]) if o is not None else np.nan
            row[f"w003_{m}"] = float(r[m])
            row[f"delta_{m}"] = row[f"w003_{m}"] - row[f"hist_{m}"]
        row["hist_feature_set"] = o.feature_set if o is not None else ""
        rows.append(row)
    return pd.DataFrame(rows)


def production_check(w3: pd.DataFrame, exp2_xgb_pred) -> dict | None:
    """Read-only: score the deployed model (models/best_model.pkl) on W_003 and compare with the re-trained Exp 2 XGBoost."""
    if not (BEST_MODEL_PATH.exists() and BEST_MODEL_META_PATH.exists() and LABEL_ENCODER_PATH.exists()):
        return None
    meta = joblib.load(BEST_MODEL_META_PATH)
    model, le = joblib.load(BEST_MODEL_PATH), joblib.load(LABEL_ENCODER_PATH)
    if meta.get("use_scaled"):
        return None
    pred = le.inverse_transform(model.predict(w3[list(meta["feature_columns"])]).astype(int))
    m = rx.full_metrics(w3[TARGET_COLUMN].values, pred)
    return {"model_name": meta.get("model_name"), "model_version": meta.get("model_version"),
            "feature_set": meta.get("feature_set"), "metrics": m, "flag": w003_flag(m),
            "agreement_with_exp2_xgboost": float(np.mean(pred == exp2_xgb_pred)) if exp2_xgb_pred is not None else np.nan}


def deployed_verdict(res: pd.DataFrame, sa: dict) -> dict:
    """Pre-specified, from the project selection rule: SUPPORTED if Exp 2 XGBoost is the overall W_003 best;
    PARTIALLY SUPPORTED if it is inside the rule's 0.01 accuracy band of the best accuracy; otherwise NOT SUPPORTED.
    Critical detection is judged separately by the Critical-recall flag."""
    r = res[(res.experiment == "EXP2") & (res.model == "XGBoost")].iloc[0]
    best_acc = res.accuracy.max()
    best_f1 = res.macro_f1.max()
    is_best = sa["overall"]["experiment"] == "EXP2" and sa["overall"]["model"] == "XGBoost"
    in_band = r.accuracy >= best_acc - rx.ACCURACY_BAND - 1e-12
    order = sorted(with_rates(res), key=lambda i: (-i["accuracy"]))
    return {"row": r, "verdict": "SUPPORTED" if is_best else ("PARTIALLY SUPPORTED" if in_band else "NOT SUPPORTED"),
            "accuracy_rank": 1 + [(i["experiment"], i["model"]) for i in order].index(("EXP2", "XGBoost")),
            "gap_accuracy": best_acc - r.accuracy, "gap_macro_f1": best_f1 - r.macro_f1,
            "macro_f1_rank": 1 + int((res.macro_f1 > r.macro_f1).sum()), "in_band": bool(in_band),
            "critical_flag": r.critical_flag}


# ---------------------------------------------------------------------------
# Post-hoc failure analysis -- NOT used for model selection
# ---------------------------------------------------------------------------
KEY_FEATURES = ["ambient_temperature", "uv_index", "gas_ratio_to_baseline", "noise", "noise_rolling_mean_60s",
                "hr_deviation_pct", "body_temp_deviation_c", "temp_warning_exposure_sec", "temp_critical_exposure_sec",
                "uv_warning_exposure_sec", "uv_critical_exposure_sec", "gas_critical_exposure_sec",
                "noise_critical_exposure_sec", "hr_critical_exposure_sec", "body_temp_critical_exposure_sec",
                "noise_dose_pct"]


def critical_outcomes(runs: list[dict], w3: pd.DataFrame) -> pd.DataFrame:
    crit = (w3[TARGET_COLUMN] == "Critical").values
    rows = []
    for run in runs:
        for algo in ALGORITHMS:
            fm, pred = run["fitted"][algo], run["preds"][algo]
            proba = fm.predict_proba(w3)
            pc = np.nan if proba is None else float(proba[crit, list(fm.label_encoder.classes_).index("Critical")].mean())
            p = pred[crit]
            rows.append({"experiment": run["exp"]["id"], "model": algo, "critical_seconds": int(crit.sum()),
                         "caught": int((p == "Critical").sum()), "to_warning": int((p == "Warning").sum()),
                         "to_safe": int((p == "Safe").sum()), "mean_p_critical_on_true_critical": pc})
    return pd.DataFrame(rows)


def align_audit(audit_path: Path | None, w3: pd.DataFrame) -> tuple[pd.DataFrame | None, pd.DataFrame | None, str]:
    """Audit rows that became ML-ready rows (non-null label), verified row by row against the ML-ready file."""
    if audit_path is None or not audit_path.exists():
        return None, None, f"audit file not found ({audit_path}); audit part skipped"
    a = pd.read_csv(audit_path, low_memory=False)
    kept = a[a[TARGET_COLUMN].notna()].reset_index(drop=True)
    if len(kept) != len(w3):
        return a, None, f"audit has {len(kept)} labelled rows vs {len(w3)} ML-ready rows; row alignment skipped"
    same = (kept[TARGET_COLUMN].values == w3[TARGET_COLUMN].values).all() and all(
        np.allclose(kept[c].astype(float), w3[c].astype(float), equal_nan=True, atol=1e-6)
        for c in ("heart_rate", "ambient_temperature", "uv_index", "hr_deviation_pct", "noise_dose_pct"))
    if not same:
        return a, None, "audit rows do not match the ML-ready rows value by value; row alignment skipped"
    return a, kept, "aligned row by row (labels and five feature columns identical)"


def training_audit_rules(audit_path: Path | None) -> dict[str, pd.Series]:
    """Critical rules_triggered in the training audits, if they sit next to the W_003 audit file (descriptive only)."""
    out = {}
    if audit_path is None:
        return out
    for name, fname in (("synthetic", "prosafe_synthetic_preprocessed_audit.csv"), ("W_001", "prosafe_W001_preprocessed_audit.csv")):
        p = audit_path.parent / fname
        if p.exists():
            d = pd.read_csv(p, usecols=[TARGET_COLUMN, "rules_triggered"], low_memory=False)
            out[name] = d.loc[d[TARGET_COLUMN] == "Critical", "rules_triggered"].fillna("(none)").value_counts()
    return out


def posthoc(runs: list[dict], w3: pd.DataFrame, sources: dict, audit_path: Path | None, ref_pred) -> dict:
    out = {"outcomes": critical_outcomes(runs, w3)}
    crit_w3 = w3[w3[TARGET_COLUMN] == "Critical"].copy()
    crit_w3["outcome"] = np.asarray(ref_pred)[crit_w3.index]
    groups = {"Train Critical: synthetic": sources["synthetic"][sources["synthetic"][TARGET_COLUMN] == "Critical"],
              "Train Critical: W_001": sources["W_001"][sources["W_001"][TARGET_COLUMN] == "Critical"],
              "W_003 Critical (all)": crit_w3}
    for o, label in (("Critical", "detected"), ("Warning", "-> Warning"), ("Safe", "-> Safe")):
        groups[f"W_003 Critical {label}"] = crit_w3[crit_w3.outcome == o]
    out["counts"] = {k: len(v) for k, v in groups.items()}
    out["medians"] = pd.DataFrame({k: v[KEY_FEATURES].median() for k, v in groups.items() if len(v)}).round(2)
    pooled = pd.concat([groups["Train Critical: synthetic"], groups["Train Critical: W_001"]])
    lo, hi = pooled[KEY_FEATURES].quantile(0.10), pooled[KEY_FEATURES].quantile(0.90)
    med = crit_w3[KEY_FEATURES].median()
    out["mismatch"] = [(f, med[f], lo[f], hi[f], "below" if med[f] < lo[f] else "above")
                       for f in KEY_FEATURES if med[f] < lo[f] or med[f] > hi[f]]
    # Hazard-counter signatures (same definitions as run_experiments.py's analysis)
    d = pd.concat([sources["synthetic"].assign(source="synthetic"), sources["W_001"].assign(source="W_001"),
                   w3.assign(source=NEW_WORKER)], ignore_index=True)
    act = pd.DataFrame({k: d[v] > 0 for k, v in rx.HAZARDS.items()})
    d["signature"] = act.apply(lambda r: " + ".join(k for k in rx.HAZARDS if r[k]) or "(none)", axis=1)
    cr = d[d[TARGET_COLUMN] == "Critical"]
    out["hazard_share"] = pd.DataFrame({s: act.loc[g.index].mean() for s, g in cr.groupby("source", sort=False)}).round(3)
    w3_sig = cr[cr.source == NEW_WORKER]["signature"].value_counts()
    out["w3_signatures"] = w3_sig.head(5)
    out["train_labels_for_top_sig"] = {
        s: d[(d.source != NEW_WORKER) & (d.signature == s)][TARGET_COLUMN].value_counts().reindex(RISK_CLASSES, fill_value=0)
        for s in w3_sig.index[:3]}
    out["episodes"] = {s: rx._episodes(g[TARGET_COLUMN].values) for s, g in d.groupby("source", sort=False)}
    audit, kept, msg = align_audit(audit_path, w3)
    out["audit_msg"] = msg
    if audit is not None:
        out["audit_quality"] = audit["data_quality_status"].value_counts() if "data_quality_status" in audit else None
        out["audit_uncertain"] = audit["uncertain_reason"].value_counts() if "uncertain_reason" in audit else None
    if kept is not None:
        kc = kept.loc[crit_w3.index].assign(outcome=crit_w3.outcome.values)
        out["audit_rules"] = kc.groupby("outcome")["rules_triggered"].apply(lambda s: s.fillna("(none)").value_counts()).unstack(0).fillna(0).astype(int)
        out["audit_reason"] = kc["label_reason"].fillna("(none)").value_counts().head(5)
        out["audit_dq"] = kc.groupby("outcome")["data_quality_status"].value_counts().unstack(0).fillna(0).astype(int)
        out["train_rules"] = training_audit_rules(audit_path)
    return out


# ---------------------------------------------------------------------------
# Plots
# ---------------------------------------------------------------------------
def plot_model_comparison(res: pd.DataFrame, out_dir: Path) -> None:
    metrics = ["Accuracy", "Balanced Accuracy", "Macro F1", "Critical Recall"]
    keys = ["accuracy", "balanced_accuracy", "macro_f1", "critical_recall"]
    fig, axes = plt.subplots(3, 1, figsize=(10.5, 16.5))
    for ax, e in zip(axes, EXPERIMENTS):
        sub = res[res.experiment == f"EXP{e['id']}"].set_index("model").loc[ALGORITHMS].reset_index()
        cats = [f"{r.model} ({SHORT[r.feature_set]})" + ("  - misses all Critical" if r.critical_recall == 0 else "")
                for _, r in sub.iterrows()]
        ps.grouped_hbar(ax, cats, {m: sub[k].tolist() for m, k in zip(metrics, keys)}, dict(zip(metrics, ps.SERIES)),
                        xlim=(0, 1.12), bar_h=0.19)
        ax.set_title(f"Experiment {e['id']}: {e['name']}")
        ps.subtitle(ax, f"Training: {e['strategy']} - historical test {e['historical_test']} - evaluated on {NEW_WORKER}")
    axes[-1].legend(loc="lower center", bbox_to_anchor=(0.45, -0.2), ncol=4)
    ps.save(fig, out_dir / "w003_model_comparison.png")


def plot_critical_recall(res: pd.DataFrame, out_dir: Path) -> None:
    series = {f"Exp {e['id']}: {e['short']}": [float(res[(res.experiment == f"EXP{e['id']}") & (res.model == a)]
                                               .critical_recall.iloc[0]) for a in ALGORITHMS] for e in EXPERIMENTS}
    fig, ax = plt.subplots(figsize=(10.5, 6.0))
    ps.grouped_hbar(ax, ALGORITHMS, series, dict(zip(series, ps.SERIES)), xlim=(0, 1.12), bar_h=0.24)
    ax.set_title(f"Critical recall on {NEW_WORKER} by training strategy and algorithm")
    ps.subtitle(ax, f"{int(res.critical_support.iloc[0])} Critical seconds in {NEW_WORKER}; "
                    "each bar is the training-side-selected configuration")
    ax.legend(loc="lower center", bbox_to_anchor=(0.45, -0.2), ncol=3)
    ps.save(fig, out_dir / "w003_critical_recall_comparison.png")


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
    ax.set_title(f"Exp {exp['id']}: {model} ({SHORT[feature_set]}) on {NEW_WORKER}", fontsize=12)
    ps.subtitle(ax, f"Best model on {NEW_WORKER} in this experiment - counts and % of each true class")
    ps.save(fig, out_dir / f"confusion_matrix_exp{exp['id']}_w003.png")


# ---------------------------------------------------------------------------
# Markdown report
# ---------------------------------------------------------------------------
def f4(v) -> str:
    return "-" if v is None or (isinstance(v, float) and np.isnan(v)) else f"{v:.4f}"


def write_report(res, hist, sa, dep, prod, ph, w3, cv_desc, runtime_min, out_dir: Path, smoke: bool) -> None:
    vc = w3[TARGET_COLUMN].value_counts()
    na = w3[EXTENDED_FEATURE_COLUMNS].isna().sum()
    L = [f"# ProSafe ML V2 - new-worker external evaluation on {NEW_WORKER}", "",
         "Generated by `python src/run_experiment_v2.py`." + (" **SMOKE TEST - reduced budget, not a result.**" if smoke else ""), "",
         "## Purpose", "",
         f"How well do the three previously developed ProSafe training strategies generalize to a completely new real "
         f"worker, {NEW_WORKER}? W_001 and W_002 were examined extensively during earlier development (and the deployment "
         f"decision was taken after the W_002 results were known), so {NEW_WORKER} gives a more independent estimate.", "",
         "## Independence of W_003", "",
         f"* Before this run, {NEW_WORKER} was only checked for schema, worker ID, labels, row/class counts and missing "
         "values (and the audit file for its structure). No code, feature definition, feature set, hyperparameter space, "
         f"threshold, class weighting, selection rule or synthetic data was changed because of {NEW_WORKER}: the whole "
         "training side is imported unchanged from `src/run_experiments.py`.",
         f"* {NEW_WORKER} never entered the training context, the folds, early stopping, class weighting, feature-set "
         "selection or the selection rule. Each configuration was refitted on the training data, saved (frozen) and then "
         f"scored once on {NEW_WORKER}. Under these conditions {NEW_WORKER} acts as the new unseen external evaluation worker.",
         "* Limits: the method itself (feature engineering, selection rule, search spaces) was designed while W_001/W_002 "
         f"results were known, and {NEW_WORKER} was labelled by the same rule-based labelling framework as the other "
         "workers, so this measures agreement with that framework on a new person, not clinical ground truth. "
         f"{NEW_WORKER} is a single worker on a single day.", "",
         "## W_003 data validation", "",
         f"* File `data/{W003_DATA_PATH.name}`: {len(w3):,} rows, {len(EXPECTED_COLUMNS)} columns (worker_id, timestamp, "
         f"the {len(EXTENDED_FEATURE_COLUMNS)} EXTENDED features, risk_level); worker {NEW_WORKER} only. The column layout "
         "is identical to the training files (which store `noise_dose_pct` after the exposure counters); every model "
         "selects its features by name in the contract order.",
         "* Classes: " + ", ".join(f"{c} {int(vc.get(c, 0)):,} ({vc.get(c, 0) / len(w3):.1%})" for c in RISK_CLASSES)
         + ". Not rebalanced, no rows removed or relabelled.",
         f"* Missing values: {int(na.sum()):,} cells in {int((na > 0).sum())} features (warm-up / sensor gaps; tree models "
         "use NaN natively, SVM / Logistic Regression impute with the training-fold median).",
         "* No raw baseline, label, evidence, rule, quality or audit column is present; the feature names match "
         "`utils.EXTENDED_FEATURE_COLUMNS` exactly.", "",
         "## Method (identical to run_experiments.py)", "",
         "| Experiment | Training strategy | Training data | Original historical test | New external test | Training-side validation |",
         "|---|---|---|---|---|---|"]
    for e in EXPERIMENTS:
        r = res[res.experiment == f"EXP{e['id']}"].iloc[0]
        L.append(f"| {e['id']} {e['name']} | {e['strategy']} | {r.training_data} ({int(r.n_train):,} rows) | "
                 f"{e['historical_test']} | {NEW_WORKER} | {cv_desc[e['id']]} |")
    budget = int(res.candidates_evaluated.iloc[0])
    L += ["",
          f"* Algorithms: {', '.join(ALGORITHMS)}. Feature sets: " + ", ".join(f"{k} ({len(v)})" for k, v in FEATURE_SETS.items()) + ".",
          f"* Budget: {budget} candidates per algorithm per experiment (12 seeded configurations x 3 feature sets, seed "
          f"{RANDOM_STATE}); the same search spaces, class-weight handling and XGBoost early stopping as run_experiments.py.",
          f"* Selection rule: accuracy within {rx.ACCURACY_BAND} of the best CV accuracy, then macro F1 -> balanced accuracy "
          "-> Critical recall -> lowest Critical->Safe rate.",
          "* Reproduction check: " + (
              "every selected feature set and hyperparameter set is identical to the original run_experiments.py selection."
              if (res.same_config_as_original_run == "yes").all() else
              "selections that differ from the original run: " + ", ".join(
                  f"Exp {r.experiment[-1]} {r.model} ({r.same_config_as_original_run})"
                  for _, r in res[res.same_config_as_original_run != "yes"].iterrows())), ""]
    for e in EXPERIMENTS:
        sub = res[res.experiment == f"EXP{e['id']}"]
        best = rx.select(with_rates(sub), "")
        cvb = rx.select(with_rates(sub), "cv_")
        L += [f"## Experiment {e['id']}: {e['name']}" + (" (main hybrid strategy)" if e["id"] == 2 else ""), "",
              f"Training: {e['strategy']}. Original historical test: {e['historical_test']}. New external test: {NEW_WORKER}.", "",
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
        for _, r in sub.iterrows():
            L.append(f"* {r.model}: `{json.loads(r.confusion_matrix)}`")
        L += ["", f"**Best model on {NEW_WORKER}** (selection rule applied descriptively to the {NEW_WORKER} results): "
              f"{best['model']} ({best['feature_set']}). Training-side choice (rule on CV metrics): {cvb['model']} "
              f"({cvb['feature_set']}).", ""]
        for _, r in sub.iterrows():
            if r.critical_flag != "OK":
                L.append(f"* {r.model}: **{r.critical_flag}**")
        L += ["", "Selected configurations (training side only):", ""]
        for _, r in sub.iterrows():
            L.append(f"* **{r.model}** - {r.feature_set}; {rx.fmt_params(json.loads(r.hyperparameters))}; CV accuracy "
                     f"{r.cv_accuracy:.4f}, CV macro F1 {r.cv_macro_f1:.4f}; same as original run: {r.same_config_as_original_run}.")
        L += ["", f"![confusion matrix](confusion_matrix_exp{e['id']}_w003.png)", ""]

    L += [f"## Final {NEW_WORKER} external-evaluation comparison (all 12 models)", "",
          "| experiment | training strategy | model | feature set | accuracy | bal. acc. | macro F1 | Crit P | Crit R | Crit F1 | Crit->Safe | flag |",
          "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for _, r in res.iterrows():
        L.append(f"| {r.experiment[-1]} | {EXPERIMENTS[int(r.experiment[-1]) - 1]['short']} | {r.model} | {SHORT[r.feature_set]} | "
                 f"{f4(r.accuracy)} | {f4(r.balanced_accuracy)} | {f4(r.macro_f1)} | {f4(r.critical_precision)} | "
                 f"{f4(r.critical_recall)} | {f4(r.critical_f1)} | {int(r.critical_to_safe_count)} | "
                 f"{r.critical_flag if r.critical_flag != 'OK' else 'ok'} |")
    ov = sa["overall"]
    L += ["", "![model comparison](w003_model_comparison.png)", "", "![critical recall](w003_critical_recall_comparison.png)", "",
          f"**Best overall result on {NEW_WORKER}** (selection rule over all 12): Experiment {ov['experiment'][-1]} "
          f"{ov['model']} ({ov['feature_set']}) - accuracy {ov['accuracy']:.4f}, macro F1 {ov['macro_f1']:.4f}, "
          f"Critical recall {ov['critical_recall']:.4f}.",
          f"Highest Critical recall: " + ", ".join(
              f"Exp {r.experiment[-1]} {r.model} ({r.critical_recall:.4f})"
              for _, r in res[res.critical_recall == res.critical_recall.max()].iterrows()) + ".", "",
          "## Training strategies compared on the same unseen worker", "",
          f"All three strategies are scored on the same {NEW_WORKER} rows, so they can be compared directly.", "",
          "| model | metric | Exp 1 synthetic only | Exp 2 hybrid | Exp 3 W_001 only | Exp 2 - Exp 1 | Exp 2 - Exp 3 |",
          "|---|---|---|---|---|---|---|"]
    names = {"accuracy": "Accuracy", "balanced_accuracy": "Balanced Accuracy", "macro_f1": "Macro F1",
             "critical_recall": "Critical Recall", "critical_f1": "Critical F1"}
    for a in ALGORITHMS:
        p = sa["per_algo"][a]
        for m, lab in names.items():
            L.append(f"| {a} | {lab} | {f4(p[1][m])} | {f4(p[2][m])} | {f4(p[3][m])} | {p[2][m] - p[1][m]:+.4f} | {p[2][m] - p[3][m]:+.4f} |")
    L += ["", "Mean over the four algorithms:", "", "| strategy | " + " | ".join(names.values()) + " |", "|---|---|---|---|---|---|"]
    for e in EXPERIMENTS:
        mm = sa["means"].loc[f"EXP{e['id']}"]
        L.append(f"| Exp {e['id']} {e['short']} | " + " | ".join(f4(mm[m]) for m in names) + " |")
    L += ["", "Representative per strategy (selection rule over its four models):", ""]
    for e in EXPERIMENTS:
        r = sa["reps"][e["id"]]
        L.append(f"* Exp {e['id']} {e['short']}: {r['model']} ({SHORT[r['feature_set']]}) - accuracy {r['accuracy']:.4f}, "
                 f"macro F1 {r['macro_f1']:.4f}, Critical recall {r['critical_recall']:.4f}.")
    bs = EXPERIMENTS[sa["best_strategy"] - 1]
    L += ["", "### Primary research question", "",
          f"*Does combining synthetic data with real W_001 data improve generalization to {NEW_WORKER} compared with "
          "synthetic-only and W_001-only training?*", "",
          f"* Best strategy on {NEW_WORKER} (pre-specified: the selection rule over the three representatives): "
          f"**Experiment {bs['id']} - {bs['strategy']}**.",
          f"* Hybrid (Exp 2) beats synthetic-only (Exp 1) for "
          + ", ".join(f"{names[m]} {sa['h_vs_1'][m]}/4" for m in names) + " algorithms.",
          f"* Hybrid (Exp 2) beats W_001-only (Exp 3) for "
          + ", ".join(f"{names[m]} {sa['h_vs_3'][m]}/4" for m in names) + " algorithms.",
          "* Strategy with the highest value per algorithm (wins out of 4): " + "; ".join(
              f"{names[m]}: " + ", ".join(f"Exp {k} {v}" for k, v in sa["wins"][m].items()) for m in names) + ".",
          f"* Answer (pre-specified rule: YES if Exp 2 is the best strategy and beats both others on macro F1 for at least "
          f"3 of 4 algorithms; NO if another strategy is best and Exp 2 beats one of the others on macro F1 for at most "
          f"1 of 4; otherwise MIXED): **{sa['verdict']}**.", "",
          "## Comparison with the previous historical test results", "",
          f"Previous results are read from `outputs/experiment_results.csv` (not re-run). Experiment 1's historical test "
          f"worker was W_001; Experiments 2-3 used W_002. The selected configurations are the same models.", "",
          "| experiment | model | historical worker | hist. accuracy | W_003 accuracy | hist. macro F1 | W_003 macro F1 | "
          "hist. Crit R | W_003 Crit R | delta accuracy | delta macro F1 | delta Crit R |",
          "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for _, h in hist.iterrows():
        L.append(f"| {h.experiment[-1]} | {h.model} | {h.historical_test} | {f4(h.hist_accuracy)} | {f4(h.w003_accuracy)} | "
                 f"{f4(h.hist_macro_f1)} | {f4(h.w003_macro_f1)} | {f4(h.hist_critical_recall)} | {f4(h.w003_critical_recall)} | "
                 f"{h.delta_accuracy:+.4f} | {h.delta_macro_f1:+.4f} | {h.delta_critical_recall:+.4f} |")
    r = dep["row"]
    L += ["", "## Is the deployed Experiment 2 XGBoost supported by W_003?", "",
          f"* Experiment 2 XGBoost on {NEW_WORKER}: accuracy {r.accuracy:.4f}, balanced accuracy {r.balanced_accuracy:.4f}, "
          f"macro F1 {r.macro_f1:.4f}, Critical precision / recall / F1 {r.critical_precision:.4f} / {r.critical_recall:.4f} / "
          f"{r.critical_f1:.4f}.",
          f"* Rank among the 12 models: accuracy #{dep['accuracy_rank']} (gap to best {dep['gap_accuracy']:.4f}), macro F1 "
          f"#{dep['macro_f1_rank']} (gap {dep['gap_macro_f1']:.4f}); inside the 0.01 accuracy band of the best: "
          f"{'yes' if dep['in_band'] else 'no'}.",
          f"* Verdict for overall classification (pre-specified: SUPPORTED if it is the overall best under the selection rule, "
          f"PARTIALLY SUPPORTED if inside the accuracy band, else NOT SUPPORTED): **{dep['verdict']}**.",
          f"* Critical detection: **{dep['critical_flag'] if dep['critical_flag'] != 'OK' else 'no Critical-recall flag'}**."]
    if prod:
        pm = prod["metrics"]
        L += [f"* The production artifact itself (`models/best_model.pkl`, {prod['model_version']}) was scored read-only on "
              f"{NEW_WORKER}: accuracy {pm['accuracy']:.4f}, macro F1 {pm['macro_f1']:.4f}, Critical recall "
              f"{pm['critical_recall']:.4f}; prediction agreement with the re-trained Experiment 2 XGBoost "
              f"{prod['agreement_with_exp2_xgboost']:.2%}. The production model was not changed."]
    L += ["", "## POST-HOC ANALYSIS - NOT USED FOR MODEL SELECTION", "",
          f"Done after every model was frozen and scored. Nothing here was fed back into training, tuning or thresholds.", "",
          f"### Critical outcomes of every model ({int(ph['outcomes'].critical_seconds.iloc[0])} W_003 Critical seconds)", "",
          ph["outcomes"].rename(columns={"mean_p_critical_on_true_critical": "mean P(Critical) on true Critical"})
          .to_markdown(index=False, floatfmt=".3f"), "",
          "### Feature medians: training Critical vs W_003 Critical", "",
          "W_003 outcome groups use the Experiment 2 XGBoost predictions (the deployed strategy). Group sizes: "
          + ", ".join(f"{k} {v:,}" for k, v in ph["counts"].items()) + ".", "",
          ph["medians"].to_markdown(), "",
          "W_003 Critical medians outside the 10th-90th percentile range of the pooled training Critical rows "
          "(synthetic + W_001):", ""]
    L += [f"* `{f}`: W_003 median {v:.2f} is {d} the training Critical range [{lo:.2f}, {hi:.2f}]"
          for f, v, lo, hi, d in ph["mismatch"]] or ["* none"]
    L += ["", "### Hazard-counter signatures of Critical rows", "",
          "Share of Critical rows whose exposure counter is active (definitions from run_experiments.py):", "",
          ph["hazard_share"].to_markdown(), "",
          "Most frequent W_003 Critical signatures and how the training data labels rows with the same signature:", ""]
    for sig, n in ph["w3_signatures"].items():
        tl = ph["train_labels_for_top_sig"].get(sig)
        L.append(f"* `{sig}` - {n} W_003 Critical rows" + ("" if tl is None else
                 "; training rows: " + ", ".join(f"{c} {int(tl[c]):,}" for c in RISK_CLASSES)))
    L += ["", "* Critical episodes: " + ", ".join(
        f"{s} {len(v)} (median {int(np.median(v)) if v else 0} s)" for s, v in ph["episodes"].items()), "",
          "### Audit file (verification and failure analysis only)", "", f"* Alignment: {ph['audit_msg']}."]
    if ph.get("audit_quality") is not None:
        L.append("* Data-quality status of all audit rows: " + ", ".join(f"{k} {int(v):,}" for k, v in ph["audit_quality"].items())
                 + ". UNCERTAIN rows are not in the ML-ready file (reasons: " + ", ".join(
                     f"{k} {int(v)}" for k, v in ph["audit_uncertain"].items()) + ").")
    if "audit_rules" in ph:
        L += ["", "Labelling rule (`rules_triggered`) of W_003 Critical rows by Experiment 2 XGBoost outcome:", "",
              ph["audit_rules"].to_markdown(), "", "Most frequent label reasons of W_003 Critical rows:", ""]
        L += [f"* {k} ({int(v)})" for k, v in ph["audit_reason"].items()]
        L += ["", "Data-quality status of W_003 Critical rows by outcome:", "", ph["audit_dq"].to_markdown(), ""]
        for s, vc_ in ph["train_rules"].items():
            L.append(f"* Training audit {s}: Critical rules " + ", ".join(f"{k} {int(v):,}" for k, v in vc_.head(6).items()) + ".")
    L += ["", "## Files", "",
          "* `w003_results.csv` - every metric of the 12 models; `w003_summary.csv` - key metrics with the historical comparison.",
          "* Models: `models/experiment_v2/exp{1,2,3}_{random_forest,xgboost,svm,logistic_regression}.pkl` (frozen before "
          "scoring W_003). `models/best_model.pkl`, `models/experiments/` and the original `outputs/` files were not changed.",
          "* No production decision is taken here; the results are for review.",
          f"* Total runtime: {runtime_min:.1f} min.", ""]
    (out_dir / "W003_EXPERIMENT_RESULTS.md").write_text("\n".join(L), encoding="utf-8")


# ---------------------------------------------------------------------------
# Final console summary
# ---------------------------------------------------------------------------
def print_final(res: pd.DataFrame, hist: pd.DataFrame, sa: dict, dep: dict, prod: dict | None, ph: dict) -> None:
    print(f"\n{LINE}\nFINAL W_003 EXTERNAL-EVALUATION COMPARISON\n{LINE}")
    show = pd.DataFrame({"Experiment": res.experiment.str[-1],
                         "Training Strategy": [EXPERIMENTS[int(e[-1]) - 1]["short"] for e in res.experiment],
                         "Model": res.model, "Feature Set": res.feature_set.map(SHORT), "Accuracy": res.accuracy,
                         "Balanced Accuracy": res.balanced_accuracy, "Macro F1": res.macro_f1,
                         "Critical Precision": res.critical_precision, "Critical Recall": res.critical_recall,
                         "Critical F1": res.critical_f1, "Critical -> Safe": res.critical_to_safe_count.astype(int)})
    print(show.to_string(index=False, float_format=lambda v: f"{v:.4f}"))
    flagged = res[res.critical_flag != "OK"]
    if len(flagged):
        print("\nCritical-detection warnings on W_003:")
        for _, r in flagged.iterrows():
            print(f"  !! Exp {r.experiment[-1]} {r.model}: {r.critical_flag}")

    print(f"\n{LINE}\nTRAINING STRATEGIES ON THE SAME UNSEEN WORKER (W_003)\n{LINE}")
    print(f"{'Model':<21}{'Metric':<19}{'Exp1 Synth':>11}{'Exp2 Hybrid':>12}{'Exp3 W_001':>11}{'2 - 1':>9}{'2 - 3':>9}")
    names = {"accuracy": "Accuracy", "balanced_accuracy": "Balanced Accuracy", "macro_f1": "Macro F1",
             "critical_recall": "Critical Recall", "critical_f1": "Critical F1"}
    for a in ALGORITHMS:
        p = sa["per_algo"][a]
        for m, lab in names.items():
            print(f"{a:<21}{lab:<19}{p[1][m]:>11.4f}{p[2][m]:>12.4f}{p[3][m]:>11.4f}{p[2][m] - p[1][m]:>+9.4f}{p[2][m] - p[3][m]:>+9.4f}")
    print("\nMean over the four algorithms:")
    print(sa["means"].rename(index=lambda k: f"Exp {k[-1]} {EXPERIMENTS[int(k[-1]) - 1]['short']}", columns=names)
          .to_string(float_format=lambda v: f"{v:.4f}"))
    print("\nHybrid (Exp 2) better than synthetic-only (Exp 1): " + ", ".join(f"{names[m]} {v}/4" for m, v in sa["h_vs_1"].items()))
    print("Hybrid (Exp 2) better than W_001-only (Exp 3):     " + ", ".join(f"{names[m]} {v}/4" for m, v in sa["h_vs_3"].items()))
    for e in EXPERIMENTS:
        r = sa["reps"][e["id"]]
        print(f"Best model in Exp {e['id']} on W_003: {r['model']} ({SHORT[r['feature_set']]})  acc {r['accuracy']:.4f}  "
              f"macro F1 {r['macro_f1']:.4f}  Crit R {r['critical_recall']:.4f}")
    ov = sa["overall"]
    print(f"Best overall result on W_003: Exp {ov['experiment'][-1]} {ov['model']} ({SHORT[ov['feature_set']]})")
    print(f"Best training strategy on W_003: Exp {sa['best_strategy']} - {EXPERIMENTS[sa['best_strategy'] - 1]['strategy']}")
    print(f"Did hybrid Synthetic + W_001 training improve generalization to W_003? {sa['verdict']}")

    print(f"\n{LINE}\nW_003 vs PREVIOUS HISTORICAL TEST (from outputs/experiment_results.csv)\n{LINE}")
    print(f"{'Exp':<4}{'Model':<21}{'Hist':<7}{'Acc hist':>9}{'Acc W3':>8}{'F1 hist':>9}{'F1 W3':>8}{'CritR hist':>11}{'CritR W3':>9}")
    for _, h in hist.iterrows():
        print(f"{h.experiment[-1]:<4}{h.model:<21}{h.historical_test:<7}{h.hist_accuracy:>9.4f}{h.w003_accuracy:>8.4f}"
              f"{h.hist_macro_f1:>9.4f}{h.w003_macro_f1:>8.4f}{h.hist_critical_recall:>11.4f}{h.w003_critical_recall:>9.4f}")

    r = dep["row"]
    print(f"\n{LINE}\nDEPLOYED MODEL CHECK (Experiment 2 XGBoost)\n{LINE}")
    print(f"W_003 Accuracy {r.accuracy:.4f} | Macro F1 {r.macro_f1:.4f} | Critical Recall {r.critical_recall:.4f}")
    print(f"Accuracy rank #{dep['accuracy_rank']} of 12, macro F1 rank #{dep['macro_f1_rank']}; verdict: {dep['verdict']}"
          f"; Critical: {dep['critical_flag']}")
    if prod:
        print(f"Production artifact (read-only) on W_003: accuracy {prod['metrics']['accuracy']:.4f}, macro F1 "
              f"{prod['metrics']['macro_f1']:.4f}, Critical recall {prod['metrics']['critical_recall']:.4f}; agreement with "
              f"re-trained Exp 2 XGBoost {prod['agreement_with_exp2_xgboost']:.2%}")

    print(f"\n{LINE}\nPOST-HOC ANALYSIS - NOT USED FOR MODEL SELECTION\n{LINE}")
    print(ph["outcomes"].to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    print("\nFeature medians (training Critical vs W_003 Critical by Exp 2 XGBoost outcome):")
    print(ph["medians"].to_string())
    for f, v, lo, hi, d in ph["mismatch"]:
        print(f"  mismatch: {f} W_003 median {v:.2f} {d} training Critical 10-90 % range [{lo:.2f}, {hi:.2f}]")
    print(f"Audit: {ph['audit_msg']}")
    if "audit_rules" in ph:
        print(ph["audit_rules"].to_string())


# ---------------------------------------------------------------------------
def build_outputs(runs, res, w3, sources, orig, audit_path, cv_desc, runtime_min, out_dir, smoke) -> None:
    ps.apply()
    sa = strategy_analysis(res)
    hist = historical_comparison(res, orig)
    exp2_xgb = next(run["preds"]["XGBoost"] for run in runs if run["exp"]["id"] == 2)
    prod = production_check(w3, exp2_xgb)
    dep = deployed_verdict(res, sa)
    summary = res[["experiment", "experiment_name", "training_strategy", "original_historical_test", "evaluation_worker",
                   "model", "feature_set", "accuracy", "balanced_accuracy", "macro_f1", "weighted_f1", "critical_precision",
                   "critical_recall", "critical_f1", "critical_to_warning_count", "critical_to_safe_count", "critical_flag",
                   "same_config_as_original_run"]].copy()
    summary["best_on_w003_in_experiment"] = [sa["reps"][int(e[-1])]["model"] == m for e, m in zip(res.experiment, res.model)]
    summary["training_side_choice_in_experiment"] = [
        rx.select(with_rates(res[res.experiment == e]), "cv_")["model"] == m for e, m in zip(res.experiment, res.model)]
    summary = summary.merge(hist.drop(columns=[c for c in hist.columns if c.startswith("w003_")] + ["historical_test"]),
                            on=["experiment", "model"])
    summary.to_csv(out_dir / "w003_summary.csv", index=False)
    plot_model_comparison(res, out_dir)
    plot_critical_recall(res, out_dir)
    for e in EXPERIMENTS:
        b = sa["reps"][e["id"]]
        plot_confusion(e, b["model"], b["feature_set"], json.loads(b["confusion_matrix"]), out_dir)
    ph = posthoc(runs, w3, sources, audit_path, exp2_xgb)
    write_report(res, hist, sa, dep, prod, ph, w3, cv_desc, runtime_min, out_dir, smoke)
    print_final(res, hist, sa, dep, prod, ph)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="validations only, no training")
    ap.add_argument("--report-only", action="store_true", help="rebuild reports from the frozen models and w003_results.csv")
    ap.add_argument("--audit", type=Path, default=DEFAULT_AUDIT_PATH, help="W_003 audit CSV (post-hoc analysis only)")
    ap.add_argument("--smoke", action="store_true", help="pipeline test: 1 config, every 3rd training row (needs --out-dir/--models-dir)")
    ap.add_argument("--out-dir", type=Path, default=OUT_DIR)
    ap.add_argument("--models-dir", type=Path, default=MODEL_OUT_DIR)
    args = ap.parse_args()
    if args.smoke and (args.out_dir == OUT_DIR or args.models_dir == MODEL_OUT_DIR):
        ap.error("--smoke must write to a separate --out-dir and --models-dir")

    t_all = time.time()
    warnings.filterwarnings("ignore", category=UserWarning)
    before = snapshot()
    sources = {"synthetic": _read_ml_ready(SYNTHETIC_DATA_PATH), "W_001": _read_ml_ready(W001_DATA_PATH)}
    w3 = load_w003()
    orig = original_results()

    print(f"{LINE}\nPROSAFE ML V2 - NEW WORKER W_003 EXTERNAL EVALUATION\n{LINE}")
    print_w003_validation(w3)
    print("\nFeature sets:\n" + "\n".join(f"  {k} ({len(v)})" for k, v in FEATURE_SETS.items()))
    print(f"\nRandom seed:\n  {RANDOM_STATE}")
    print(f"\nSearch budget: {rx.CONFIGS_PER_FEATURE_SET} configurations x 3 feature sets = {3 * rx.CONFIGS_PER_FEATURE_SET} "
          "candidates per algorithm per experiment (imported from run_experiments.py)")
    print(f"Selection: accuracy within {rx.ACCURACY_BAND} of the best CV accuracy -> macro F1 -> balanced accuracy -> "
          "Critical recall -> lowest Critical->Safe rate")
    print("\nImportant:\n  W_003 is evaluation only.\n  No model selection or tuning uses W_003.")
    if args.smoke:
        print("\n!! SMOKE TEST: 1 configuration per algorithm, every 3rd training row. Not a result.")

    print("\nIsolation checks:")
    for e in EXPERIMENTS:
        ctx = TrainingContext(e, sources, row_step=3 if args.smoke else 1)
        workers = sorted(set(ctx.train[WORKER_COLUMN]))
        fold_rows = set(np.concatenate([np.concatenate(f) for f in ctx.folds]))
        print(f"  Exp {e['id']}: training rows {len(ctx.train):,} (workers {', '.join(workers)}); {len(ctx.folds)} folds over "
              f"training rows only (max index {max(fold_rows):,} < {len(ctx.train):,}); "
              f"W_003 rows duplicated in training: {overlapping_rows(ctx.train, w3)}")
        assert NEW_WORKER not in workers and max(fold_rows) < len(ctx.train)
    print(f"  Protected files hashed: {len(before)} (production model, models/experiments, original outputs, data, "
          "run_experiments.py)")
    if args.check:
        print("\nChecks passed. (--check: no training performed)")
        return

    args.out_dir.mkdir(parents=True, exist_ok=True)
    if args.report_only:
        res = pd.read_csv(args.out_dir / "w003_results.csv")
        runs = []
        for e in EXPERIMENTS:
            fitted = {a: load_frozen(e, a, args.models_dir) for a in ALGORITHMS}
            runs.append({"exp": e, "fitted": fitted, "preds": {a: fm.predict_labels(w3) for a, fm in fitted.items()}})
        cv_desc = {e["id"]: TrainingContext(e, sources).cv_desc for e in EXPERIMENTS}
        runtime = float(res.optimization_seconds.sum() / 60)
    else:
        runs = [run_experiment(e, sources, w3, orig, args.models_dir, args.smoke) for e in EXPERIMENTS]
        res = pd.DataFrame([r for run in runs for r in run["finals"]])
        res.to_csv(args.out_dir / "w003_results.csv", index=False)  # saved before any reporting
        cv_desc = {run["exp"]["id"]: run["cv_desc"] for run in runs}
        runtime = (time.time() - t_all) / 60
    build_outputs(runs, res, w3, sources, orig, args.audit, cv_desc, runtime, args.out_dir, args.smoke)

    changed = compare_snapshots(before, snapshot())
    print(f"\nProtected files unchanged: {'yes' if not changed else 'NO - ' + ', '.join(changed)}")
    print("Production model (models/best_model.pkl) was NOT changed. No model was deployed.")
    print(f"Outputs: {args.out_dir}")
    print(f"Total runtime: {(time.time() - t_all) / 60:.1f} min")
    if changed:
        sys.exit(1)


if __name__ == "__main__":
    main()
