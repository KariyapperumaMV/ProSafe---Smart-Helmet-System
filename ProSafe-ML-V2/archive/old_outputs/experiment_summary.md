# ProSafe ML V2 - experiment summary

Frozen model: **Logistic Regression** on the **EXTENDED** feature set (38 features); frozen at 2026-10-08T05:08:08+00:00 before W_002 was evaluated.

Metrics cover Safe / Warning / Critical only. UNCERTAIN observations were removed upstream by the data-quality gate and are reported separately (data-quality coverage below), not in these confusion matrices.

## Headline metrics

| experiment | training data | test data | accuracy | balanced_accuracy | macro_f1 | weighted_f1 | critical_recall | critical_false_negative_rate | critical_to_safe_rate | n_train | n_test |
|---|---|---|---|---|---|---|---|---|---|---|---|
| EXP1 | S_001-S_004 (leave one synthetic worker out) | held-out synthetic worker (pooled out-of-fold) | 0.8385 | 0.7962 | 0.7544 | 0.8416 | 0.6916 | 0.3084 | 0.0000 | 13923 | 18564 |
| EXP2 | S_001-S_004 (all synthetic) | W_002 | 0.7140 | 0.7964 | 0.5532 | 0.7566 | 1.0000 | 0.0000 | 0.0000 | 18564 | 13825 |
| EXP3 | W_001 + S_001-S_004 | W_002 | 0.9092 | 0.6177 | 0.6148 | 0.9058 | 0.0000 | 1.0000 | 0.0000 | 32579 | 13825 |
| EXP4 | W_001 only | W_002 | 0.8735 | 0.5958 | 0.5880 | 0.8656 | 0.0000 | 1.0000 | 0.0000 | 14015 | 13825 |
| DEV-CV | 4 of 5 development workers | held-out development worker (pooled out-of-fold) | 0.7879 | 0.8503 | 0.7058 | 0.8091 | 0.9047 | 0.0953 | 0.0000 | 26063 | 32579 |
| DEV-TRANSFER | S_001-S_004 (all synthetic) | W_001 | 0.7046 | 0.8529 | 0.6807 | 0.7383 | 1.0000 | 0.0000 | 0.0000 | 18564 | 14015 |

## Per-class precision / recall / F1

| experiment | safe P | safe R | safe F1 | warning P | warning R | warning F1 | critical P | critical R | critical F1 |
|---|---|---|---|---|---|---|---|---|---|
| EXP1 | 0.7513 | 0.8636 | 0.8035 | 0.9133 | 0.8335 | 0.8716 | 0.5116 | 0.6916 | 0.5881 |
| EXP2 | 0.9030 | 0.9799 | 0.9399 | 0.9914 | 0.4092 | 0.5793 | 0.0755 | 1.0000 | 0.1405 |
| EXP3 | 0.9503 | 0.9296 | 0.9398 | 0.8867 | 0.9234 | 0.9047 | 0.0000 | 0.0000 | 0.0000 |
| EXP4 | 0.9613 | 0.8239 | 0.8873 | 0.8042 | 0.9634 | 0.8766 | 0.0000 | 0.0000 | 0.0000 |
| DEV-CV | 0.8034 | 0.9277 | 0.8611 | 0.9489 | 0.7186 | 0.8178 | 0.2894 | 0.9047 | 0.4385 |
| DEV-TRANSFER | 0.8425 | 1.0000 | 0.9145 | 1.0000 | 0.5587 | 0.7169 | 0.2585 | 1.0000 | 0.4108 |

## Comparisons

- **Synthetic-to-real transfer gap** (Exp 1 - Exp 2): macro F1 +0.2012, critical recall -0.3084.
- **Effect of adding real W_001 to synthetic** (Exp 3 - Exp 2): macro F1 +0.0616, balanced accuracy -0.1787, critical recall -1.0000.
- **Effect of adding synthetic to real W_001** (Exp 3 - Exp 4): macro F1 +0.0269, balanced accuracy +0.0219, critical recall +0.0000, Critical->Safe +0.0000.
- Production artifact vs fresh refit of the frozen config on W_002: 100.0000% identical predictions.

## Post-freeze transparency: every candidate in the Experiment-3 setting (NOT used for selection)

| model               | feature_set   | is_frozen_choice   | hyperparameters   |   accuracy |   balanced_accuracy |   macro_precision |   macro_recall |   macro_f1 |   weighted_f1 |   safe_precision |   safe_recall |   safe_f1 |   warning_precision |   warning_recall |   warning_f1 |   critical_precision |   critical_recall |   critical_f1 |   critical_false_negative_rate |   critical_to_safe_rate |
|:--------------------|:--------------|:-------------------|:------------------|-----------:|--------------------:|------------------:|---------------:|-----------:|--------------:|-----------------:|--------------:|----------:|--------------------:|-----------------:|-------------:|---------------------:|------------------:|--------------:|-------------------------------:|------------------------:|
| Logistic Regression | CORE          | False              | frozen (tuned)    |     0.7075 |              0.5259 |            0.5152 |         0.5259 |     0.5145 |        0.7149 |           0.8093 |        0.695  |    0.7478 |              0.6673 |           0.7442 |       0.7036 |               0.0691 |            0.1385 |        0.0922 |                         0.8615 |                       0 |
| Random Forest       | CORE          | False              | default           |     0.7535 |              0.514  |            0.5072 |         0.514  |     0.5071 |        0.7465 |           0.8241 |        0.7087 |    0.7621 |              0.6974 |           0.8332 |       0.7593 |               0      |            0      |        0      |                         1      |                       0 |
| XGBoost             | CORE          | False              | default           |     0.8224 |              0.5598 |            0.5498 |         0.5598 |     0.5534 |        0.815  |           0.8737 |        0.8081 |    0.8396 |              0.7757 |           0.8712 |       0.8207 |               0      |            0      |        0      |                         1      |                       0 |
| SVM                 | CORE          | False              | default           |     0.7989 |              0.5443 |            0.5356 |         0.5443 |     0.5378 |        0.7918 |           0.8603 |        0.7713 |    0.8134 |              0.7465 |           0.8616 |       0.7999 |               0      |            0      |        0      |                         1      |                       0 |
| Logistic Regression | EXTENDED      | True               | frozen (tuned)    |     0.9092 |              0.6177 |            0.6123 |         0.6177 |     0.6148 |        0.9058 |           0.9503 |        0.9296 |    0.9398 |              0.8867 |           0.9234 |       0.9047 |               0      |            0      |        0      |                         1      |                       0 |
| Random Forest       | EXTENDED      | False              | default           |     0.946  |              0.6432 |            0.6307 |         0.6432 |     0.6365 |        0.9373 |           0.9806 |        0.9505 |    0.9653 |              0.9117 |           0.9792 |       0.9442 |               0      |            0      |        0      |                         1      |                       0 |
| XGBoost             | EXTENDED      | False              | default           |     0.9374 |              0.6366 |            0.6246 |         0.6366 |     0.6305 |        0.9286 |           0.9523 |        0.9633 |    0.9578 |              0.9214 |           0.9465 |       0.9338 |               0      |            0      |        0      |                         1      |                       0 |
| SVM                 | EXTENDED      | False              | default           |     0.8919 |              0.6071 |            0.5961 |         0.6071 |     0.6003 |        0.8839 |           0.9448 |        0.8778 |    0.9101 |              0.8435 |           0.9434 |       0.8907 |               0      |            0      |        0      |                         1      |                       0 |

## Exp 3 confidence-threshold coverage (backend accepts max probability >= 0.70)

|   threshold |   accepted_share |   accuracy_when_accepted |   critical_rows_accepted_share |   critical_recall_among_accepted |
|------------:|-----------------:|-------------------------:|-------------------------------:|---------------------------------:|
|         0.5 |           0.9993 |                   0.9095 |                         1      |                                0 |
|         0.6 |           0.9313 |                   0.9365 |                         1      |                                0 |
|         0.7 |           0.8708 |                   0.9463 |                         1      |                                0 |
|         0.8 |           0.7845 |                   0.9557 |                         0.9962 |                                0 |
|         0.9 |           0.6338 |                   0.9625 |                         0.8962 |                                0 |

## Feature importance (production model)

|                                |   importance | kind                              |
|:-------------------------------|-------------:|:----------------------------------|
| temp_warning_exposure_sec      |       0.1035 | mean |coefficient| (standardized) |
| uv_warning_exposure_sec        |       0.09   | mean |coefficient| (standardized) |
| noise_dose_pct                 |       0.056  | mean |coefficient| (standardized) |
| hr_critical_exposure_sec       |       0.0484 | mean |coefficient| (standardized) |
| ambient_temp_rolling_mean_300s |       0.0465 | mean |coefficient| (standardized) |
| noise_critical_exposure_sec    |       0.0446 | mean |coefficient| (standardized) |
| uv_rolling_mean_300s           |       0.0439 | mean |coefficient| (standardized) |
| uv_index                       |       0.042  | mean |coefficient| (standardized) |
| body_temp_deviation_pct        |       0.0402 | mean |coefficient| (standardized) |
| body_temp_deviation_c          |       0.0392 | mean |coefficient| (standardized) |
| hr_warning_exposure_sec        |       0.0357 | mean |coefficient| (standardized) |
| heart_rate_rolling_mean_60s    |       0.0348 | mean |coefficient| (standardized) |
| heart_rate_rolling_mean_30s    |       0.0321 | mean |coefficient| (standardized) |
| uv_trend_300s_per_min          |       0.0315 | mean |coefficient| (standardized) |
| noise_rolling_mean_60s         |       0.03   | mean |coefficient| (standardized) |

Permutation importance on W_002 (macro-F1 drop, 3 repeats):

|                                   |   macro_f1_drop_mean |   macro_f1_drop_std |
|:----------------------------------|---------------------:|--------------------:|
| uv_warning_exposure_sec           |               0.1882 |              0.0031 |
| hr_warning_exposure_sec           |               0.0118 |              0.0005 |
| uv_critical_exposure_sec          |               0.0094 |              0.0003 |
| ambient_temp_rolling_mean_300s    |               0.0064 |              0.0007 |
| body_temp_trend_300s_c_per_min    |               0.0057 |              0.0004 |
| heart_rate_rolling_mean_30s       |               0.0039 |              0.0007 |
| ambient_temperature               |               0.0022 |              0.0008 |
| heart_rate                        |               0.0019 |              0.0001 |
| heart_rate_rolling_mean_60s       |               0.0018 |              0.0004 |
| noise_dose_pct                    |               0.0015 |              0.0007 |
| ambient_temp_trend_300s_c_per_min |               0.0003 |              0.0002 |
| gas_critical_exposure_sec         |               0.0002 |              0      |
| noise_warning_exposure_sec        |               0.0001 |              0      |
| noise_critical_exposure_sec       |               0      |              0.0001 |
| temp_critical_exposure_sec        |               0      |              0      |

## Data-quality coverage (INFERRED from the 1 Hz timeline; no audit file available)

| worker_id   |   expected_observations_1hz |   ml_ready_observations_valid_or_imputed |   uncertain_observations_inferred |   uncertain_pct |
|:------------|----------------------------:|-----------------------------------------:|----------------------------------:|----------------:|
| S_001       |                        5000 |                                     4559 |                               441 |            8.82 |
| S_002       |                        5000 |                                     4668 |                               332 |            6.64 |
| S_003       |                        5000 |                                     4706 |                               294 |            5.88 |
| S_004       |                        5000 |                                     4631 |                               369 |            7.38 |
| W_001       |                       14400 |                                    14015 |                               385 |            2.67 |
| W_002       |                       14397 |                                    13825 |                               572 |            3.97 |
