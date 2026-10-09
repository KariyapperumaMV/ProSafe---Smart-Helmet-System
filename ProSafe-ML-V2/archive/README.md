# Archive

Earlier development material, moved here (not deleted) when the project was simplified. Nothing in the active
code imports from this folder.

| Folder | Contents |
|---|---|
| `old_outputs/` | first-version report (`FINAL_ML_V2_REPORT.md`), leave-one-worker-out selection results (`comparison/`), first frozen-model experiments (`experiments/`, `experiment_summary.*`), EDA and dataset validation (`eda/`), preprocessing parity reports and end-to-end replays, the original `run_experiments` console log, the critical-failure figure |
| `old_model_candidates/` | JSON copies of the previous candidate's metadata, and `logistic_regression_candidate_2026-10-08/`: the previous V2 candidate pickles (`best_model.pkl`, `best_model_meta.pkl`, `scaler.pkl`, `label_encoder.pkl`, `all_models_meta.pkl`, per-algorithm pickles, `frozen_config.json`), moved here by `src/promote_model.py` on 2026-10-09 when the XGBoost EXTENDED Experiment-2 model was promoted to production. |
| `source_history/` | scripts no longer imported by anything: `eda.py`, `train_models.py` (LOWO selection + freeze), `evaluate.py` (first frozen-model experiments), `critical_failure_analysis.py` (generator of `outputs/critical_failure_analysis.md`). To run one, copy it back to `src/`; output paths point at the pre-cleanup layout. |
