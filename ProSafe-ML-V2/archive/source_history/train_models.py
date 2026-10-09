"""
ProSafe ML V2 -- model selection, tuning, freezing and production training.

Uses DEVELOPMENT data only (S_001..S_004 + W_001). W_002 is never loaded here.

Stages
  1. Candidate comparison: 4 algorithms x {CORE, EXTENDED}, leave-one-worker-out
     over the 5 development workers, all fitting inside the training fold.
  2. Selection with the pre-registered ranking rule (modeling.rank_candidates)
     and the EXTENDED parsimony margin (modeling.EXTENDED_MIN_GAIN).
  3. Moderate group-aware (LOWO) hyperparameter search for the selected
     algorithm; tuned params are kept only if they out-rank the defaults.
  4. FREEZE: algorithm, feature set, feature order, hyperparameters, scaling,
     class weighting and label mapping -> models/frozen_config.json.
  5. Production candidate: frozen config fitted on W_001 + all synthetic;
     compatibility artifacts written to models/.

Run from the project root:
    python src/train_models.py
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.model_selection import ParameterGrid, ParameterSampler

import plot_style as ps
from modeling import (
    ALGORITHMS,
    CLASS_WEIGHTING,
    DEFAULT_PARAMS,
    EXTENDED_MIN_GAIN,
    MACRO_F1_TIE_TOL,
    METRIC_COLUMNS,
    PREPROCESSING_FOR_SCALED_MODELS,
    USES_SCALING,
    fit_model,
    lowo_cv,
    make_label_encoder,
    rank_candidates,
)
from utils import (
    ALL_MODELS_META_PATH,
    BEST_MODEL_META_PATH,
    BEST_MODEL_PATH,
    COMPARISON_OUTPUTS_DIR,
    DEFERRABLE_FEATURES,
    DEV_WORKERS,
    EXTERNAL_TEST_WORKER,
    FEATURE_SETS,
    FROZEN_CONFIG_PATH,
    LABEL_ENCODER_PATH,
    MODELS_DIR,
    RANDOM_STATE,
    RISK_CLASSES,
    SCALER_PATH,
    SYNTHETIC_DATA_PATH,
    W001_DATA_PATH,
    WORKER_COLUMN,
    ensure_dirs,
    file_sha256,
    load_development_data,
    model_slug,
)

SEARCH_SPACES: dict[str, dict] = {
    "XGBoost": {
        "n_estimators": [150, 300, 500, 800],
        "max_depth": [3, 4, 5, 6, 8],
        "learning_rate": [0.03, 0.05, 0.1, 0.2],
        "subsample": [0.6, 0.8, 1.0],
        "colsample_bytree": [0.5, 0.7, 0.8, 1.0],
        "min_child_weight": [1, 3, 5, 10],
        "reg_lambda": [0.5, 1.0, 2.0, 5.0],
        "gamma": [0.0, 0.5, 1.0],
    },
    "Random Forest": {
        "n_estimators": [200, 300, 500],
        "max_depth": [None, 8, 12, 16, 24],
        "min_samples_leaf": [1, 2, 5, 10, 20],
        "max_features": ["sqrt", 0.3, 0.5],
    },
    "Logistic Regression": {"C": [0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 10.0], "max_iter": [3000]},
    "SVM": {"C": [0.3, 1.0, 3.0, 10.0], "gamma": ["scale", 0.01, 0.03, 0.1]},
}
N_SEARCH_ITER = {"XGBoost": 24, "Random Forest": 20}


def _row(r) -> dict:
    return r.summary_row() | {"params": json.dumps(r.params, default=str)}


# ---------------------------------------------------------------------------
def stage1_candidates(dev: pd.DataFrame):
    print("=" * 72 + "\nSTAGE 1  candidate comparison (leave-one-worker-out, 5 development workers)\n" + "=" * 72)
    results = []
    for fs_name, cols in FEATURE_SETS.items():
        for algo in ALGORITHMS:
            r = lowo_cv(dev, DEV_WORKERS, algo, None, fs_name, cols)
            results.append(r)
            p = r.pooled
            print(f"  {fs_name:<8} {algo:<20} macroF1={p['macro_f1']:.4f}  critRecall={p['critical_recall']:.4f}  "
                  f"balAcc={p['balanced_accuracy']:.4f}  crit->safe={p['critical_to_safe_rate']:.4f}  ({r.seconds:.0f}s)")
    table = pd.DataFrame([_row(r) for r in results])
    folds = pd.DataFrame([{"model": r.name, "feature_set": r.feature_set, **{k: f[k] for k in ["held_out_worker", "n_train", "n_test"] + METRIC_COLUMNS}}
                          for r in results for f in r.per_fold])
    table.to_csv(COMPARISON_OUTPUTS_DIR / "candidate_lowo_results.csv", index=False)
    folds.to_csv(COMPARISON_OUTPUTS_DIR / "candidate_lowo_per_fold.csv", index=False)
    return results, table, folds


def stage2_select(table: pd.DataFrame) -> tuple[dict, dict]:
    rows = table.to_dict("records")
    ranked = rank_candidates(rows)
    top = ranked[0]
    best_core = next(r for r in ranked if r["feature_set"] == "CORE")
    best_ext = next(r for r in ranked if r["feature_set"] == "EXTENDED")
    if top["feature_set"] == "EXTENDED" and top["macro_f1"] - best_core["macro_f1"] <= EXTENDED_MIN_GAIN:
        chosen = best_core
        why = (f"EXTENDED ranked first ({top['model']}, macro F1 {top['macro_f1']:.4f}) but its gain over the best CORE "
               f"candidate ({best_core['macro_f1']:.4f}) is <= the pre-registered margin {EXTENDED_MIN_GAIN}; CORE chosen.")
    else:
        chosen = top
        why = f"Ranked first under the pre-registered rule ({chosen['feature_set']} {chosen['model']})."
        if chosen["feature_set"] == "EXTENDED":
            why += f" EXTENDED beats best CORE by {top['macro_f1'] - best_core['macro_f1']:.4f} > {EXTENDED_MIN_GAIN}."
    selection = {
        "selected_model": chosen["model"],
        "selected_feature_set": chosen["feature_set"],
        "reason": why,
        "ranking_rule": {
            "1": f"pooled out-of-fold macro F1 (candidates within {MACRO_F1_TIE_TOL} of the best are tied)",
            "2": "critical recall", "3": "balanced accuracy", "4": "lower Critical->Safe rate",
            "extended_parsimony_margin": EXTENDED_MIN_GAIN,
        },
        "ranked": [{k: r[k] for k in ("model", "feature_set", "macro_f1", "critical_recall", "balanced_accuracy",
                                      "critical_to_safe_rate")} for r in ranked],
        "best_core": {k: best_core[k] for k in ("model", "macro_f1", "critical_recall")},
        "best_extended": {k: best_ext[k] for k in ("model", "macro_f1", "critical_recall")},
    }
    (COMPARISON_OUTPUTS_DIR / "selection.json").write_text(json.dumps(selection, indent=2, default=float), encoding="utf-8")
    print("\nSTAGE 2  selection:", why)
    return chosen, selection


def stage3_tune(dev: pd.DataFrame, algo: str, fs_name: str, default_row: dict) -> tuple[dict, pd.DataFrame, dict]:
    print("=" * 72 + f"\nSTAGE 3  group-aware (LOWO) tuning: {algo} / {fs_name}\n" + "=" * 72)
    space = SEARCH_SPACES[algo]
    if algo in N_SEARCH_ITER:
        candidates = list(ParameterSampler(space, n_iter=N_SEARCH_ITER[algo], random_state=RANDOM_STATE))
    else:
        candidates = list(ParameterGrid(space))
    rows = [dict(default_row, params=json.dumps(DEFAULT_PARAMS[algo], default=str), config="default")]
    for i, params in enumerate(candidates, 1):
        params = {k: (v.item() if hasattr(v, "item") else v) for k, v in params.items()}
        r = lowo_cv(dev, DEV_WORKERS, algo, params, fs_name, FEATURE_SETS[fs_name])
        row = _row(r) | {"config": f"search_{i:02d}"}
        rows.append(row)
        print(f"  [{i:02d}/{len(candidates)}] macroF1={r.pooled['macro_f1']:.4f} critRecall={r.pooled['critical_recall']:.4f} {params}")
    table = pd.DataFrame(rows)
    table.to_csv(COMPARISON_OUTPUTS_DIR / "tuning_results.csv", index=False)
    best = rank_candidates(table.to_dict("records"))[0]
    params = json.loads(best["params"])
    info = {"search": "ParameterSampler" if algo in N_SEARCH_ITER else "ParameterGrid", "n_configs": len(candidates),
            "cv": "leave-one-worker-out over development workers (pooled out-of-fold metrics)",
            "chosen_config": best["config"], "chosen_params": params,
            "chosen_macro_f1": best["macro_f1"], "default_macro_f1": default_row["macro_f1"],
            "chosen_critical_recall": best["critical_recall"], "default_critical_recall": default_row["critical_recall"]}
    print(f"\n  tuning result: {best['config']} (macro F1 {best['macro_f1']:.4f} vs default {default_row['macro_f1']:.4f})")
    return params, table, info


def stage4_freeze(algo: str, fs_name: str, params: dict, selection: dict, tuning: dict, dev: pd.DataFrame) -> dict:
    le = make_label_encoder()
    cfg = {
        "frozen_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "frozen_before_external_test": True,
        "external_test_worker": EXTERNAL_TEST_WORKER,
        "external_test_policy": ("W_002 was never loaded by model selection, tuning, scaling or preprocessing-rule design. "
                                 "Before this freeze it was opened only for the brief-mandated structure/label inventory "
                                 "(src/eda.py: counts, nulls, unique labels)."),
        "algorithm": algo,
        "feature_set": fs_name,
        "feature_columns": FEATURE_SETS[fs_name],
        "hyperparameters": params,
        "uses_scaling": USES_SCALING[algo],
        "scaling": PREPROCESSING_FOR_SCALED_MODELS if USES_SCALING[algo] else "none (tree model; NaN handled natively)",
        "class_weighting": CLASS_WEIGHTING[algo],
        "label_mapping": {c: int(i) for c, i in zip(le.classes_, le.transform(le.classes_))},
        "classes": RISK_CLASSES,
        "uncertain_is_a_class": False,
        "deferrable_features_may_be_nan": [c for c in DEFERRABLE_FEATURES if c in FEATURE_SETS[fs_name]],
        "random_state": RANDOM_STATE,
        "development_workers": DEV_WORKERS,
        "development_rows": int(len(dev)),
        "development_data_sha256": {SYNTHETIC_DATA_PATH.name: file_sha256(SYNTHETIC_DATA_PATH),
                                    W001_DATA_PATH.name: file_sha256(W001_DATA_PATH)},
        "selection": {k: selection[k] for k in ("selected_model", "selected_feature_set", "reason", "ranking_rule")},
        "tuning": tuning,
    }
    FROZEN_CONFIG_PATH.write_text(json.dumps(cfg, indent=2, default=str), encoding="utf-8")
    print(f"\nSTAGE 4  configuration FROZEN -> {FROZEN_CONFIG_PATH}")
    return cfg


def stage5_production(dev: pd.DataFrame, cfg: dict, cand_table: pd.DataFrame, tuning_table: pd.DataFrame) -> None:
    print("=" * 72 + "\nSTAGE 5  production candidate: frozen config on W_001 + all synthetic\n" + "=" * 72)
    fs_name, cols, best = cfg["feature_set"], cfg["feature_columns"], cfg["algorithm"]
    registry, fitted = {}, {}
    for algo in ALGORITHMS:
        params = cfg["hyperparameters"] if algo == best else DEFAULT_PARAMS[algo]
        fm = fit_model(algo, params, dev, cols, probability=(algo == "SVM"))
        fitted[algo] = fm
        fname = f"{model_slug(algo)}.pkl"
        joblib.dump(fm.estimator, MODELS_DIR / fname)
        row = cand_table[(cand_table.model == algo) & (cand_table.feature_set == fs_name)].iloc[0]
        source = "development leave-one-worker-out (pooled out-of-fold, default hyperparameters)"
        if algo == best:  # report the frozen (tuned) configuration's own LOWO score
            row = tuning_table[tuning_table.config == cfg["tuning"]["chosen_config"]].iloc[0]
            source = "development leave-one-worker-out (pooled out-of-fold, frozen hyperparameters)"
        registry[algo] = {
            "path": fname,  # relative to models/ (the old registry stored absolute Windows paths)
            "use_scaled": fm.use_scaled,
            "feature_set": fs_name,
            "feature_columns": cols,
            "hyperparameters": params,
            "is_best": algo == best,
            "metrics": {"source": source,
                        **{k: float(row[k]) for k in METRIC_COLUMNS}},
        }
        print(f"  {algo:<20} fitted in {fm.fit_seconds:.1f}s  use_scaled={fm.use_scaled}")

    # The scaler artifact is the numeric preprocessing used by scale-sensitive
    # models (LR, SVM), fitted on the production training rows only.
    scaler = next(fm.preprocessor for fm in fitted.values() if fm.preprocessor is not None)
    joblib.dump(scaler, SCALER_PATH)
    joblib.dump(make_label_encoder(), LABEL_ENCODER_PATH)
    joblib.dump(fitted[best].estimator, BEST_MODEL_PATH)
    meta = {
        "model_name": best,
        "use_scaled": fitted[best].use_scaled,
        "version": "prosafe-ml-v2",
        "feature_set": fs_name,
        "feature_columns": cols,
        "classes": RISK_CLASSES,
        "hyperparameters": cfg["hyperparameters"],
        "supports_missing_values": True,
        "deferrable_features": cfg["deferrable_features_may_be_nan"],
        "trained_on_workers": DEV_WORKERS,
        "n_train": int(len(dev)),
        "frozen_config_sha256": file_sha256(FROZEN_CONFIG_PATH),
        "trained_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    joblib.dump(meta, BEST_MODEL_META_PATH)
    joblib.dump(registry, ALL_MODELS_META_PATH)
    (MODELS_DIR / "best_model_meta.json").write_text(json.dumps(meta, indent=2, default=str), encoding="utf-8")
    (MODELS_DIR / "all_models_meta.json").write_text(json.dumps(registry, indent=2, default=str), encoding="utf-8")
    print(f"\n  best_model.pkl = {best} ({fs_name}, {len(cols)} features); registry of {len(registry)} models saved")


# ---------------------------------------------------------------------------
def charts(table: pd.DataFrame) -> None:
    ps.apply()
    order = ALGORITHMS
    for metric, fname, title, sub in [
        ("macro_f1", "candidate_macro_f1.png", "Candidate models - macro F1",
         "Leave-one-worker-out over S_001-S_004 + W_001 (pooled out-of-fold)"),
        ("critical_recall", "candidate_critical_recall.png", "Candidate models - Critical recall",
         "Share of true Critical seconds predicted Critical (pooled out-of-fold)"),
    ]:
        fig, ax = plt.subplots(figsize=(9, 4.6))
        series = {fs: [float(table[(table.model == a) & (table.feature_set == fs)][metric].iloc[0]) for a in order]
                  for fs in ("CORE", "EXTENDED")}
        ps.grouped_hbar(ax, order, series, ps.FEATURE_SET_COLOR, xlim=(0, 1.08))
        ax.set_title(title)
        ps.subtitle(ax, sub)
        ax.legend(loc="lower center", bbox_to_anchor=(0.5, -0.24), ncol=2)
        ps.save(fig, COMPARISON_OUTPUTS_DIR / fname)

    metrics = [("macro_f1", "Macro F1"), ("critical_recall", "Critical recall"), ("balanced_accuracy", "Balanced accuracy"),
               ("critical_to_safe_rate", "Critical->Safe rate (lower is better)")]
    fig, axes = plt.subplots(2, 2, figsize=(14, 9))
    for ax, (m, label) in zip(axes.ravel(), metrics):
        series = {fs: [float(table[(table.model == a) & (table.feature_set == fs)][m].iloc[0]) for a in order]
                  for fs in ("CORE", "EXTENDED")}
        hi = 1.0 if m != "critical_to_safe_rate" else max(0.05, max(max(v) for v in series.values()) * 1.4)
        ps.grouped_hbar(ax, order, series, ps.FEATURE_SET_COLOR, xlim=(0, hi * 1.12), fmt="{:.3f}")
        ax.set_title(label, fontsize=11.5, pad=10)
    handles, labels = axes[0, 0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="lower center", ncol=2, bbox_to_anchor=(0.5, -0.01))
    fig.suptitle("CORE vs EXTENDED feature set (leave-one-worker-out, development workers)",
                 x=0.01, ha="left", fontsize=13, fontweight="semibold", color=ps.INK)
    fig.tight_layout(rect=(0, 0.04, 1, 0.97))
    fig.savefig(COMPARISON_OUTPUTS_DIR / "core_vs_extended.png", dpi=160, bbox_inches="tight")
    plt.close(fig)


def main() -> None:
    import sys
    ensure_dirs()
    if "--charts-only" in sys.argv:  # redraw from saved results; never re-selects or re-freezes
        charts(pd.read_csv(COMPARISON_OUTPUTS_DIR / "candidate_lowo_results.csv"))
        return
    dev = load_development_data()
    assert set(dev[WORKER_COLUMN]) == set(DEV_WORKERS)
    results, table, folds = stage1_candidates(dev)
    charts(table)
    chosen, selection = stage2_select(table)
    params, tuning_table, tuning = stage3_tune(dev, chosen["model"], chosen["feature_set"], chosen)
    cfg = stage4_freeze(chosen["model"], chosen["feature_set"], params, selection, tuning, dev)
    stage5_production(dev, cfg, table, tuning_table)
    print("\nDone. Next: python src/evaluate.py")


if __name__ == "__main__":
    main()
