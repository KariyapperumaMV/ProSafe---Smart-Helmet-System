# Preprocessing parity report (with_external)

Workers: S_001, S_002, S_003, S_004, W_001, W_002

## A. Exact-parity replay (contiguous full-minute runs)

| category         |   features |   rows_compared |   rows_matching |   worst_max_abs_diff |   match_rate |
|:-----------------|-----------:|----------------:|----------------:|---------------------:|-------------:|
| deviation        |          4 |          157920 |          157920 |             0.000050 |     1.000000 |
| exposure counter |         12 |          421920 |          421627 |           404.000000 |     0.999306 |
| gas ratio        |          1 |           39392 |           39392 |             0.000049 |     1.000000 |
| noise dose       |          1 |           35160 |           35160 |             0.000094 |     1.000000 |
| raw sensor       |          6 |          236650 |          236650 |             0.000000 |     1.000000 |
| rolling          |          8 |          243618 |          243618 |             0.000050 |     1.000000 |
| trend            |          6 |          168834 |          168834 |             0.000050 |     1.000000 |

| feature                           | category         |   min_seconds_into_run |   rows_compared |   rows_matching |   match_rate |   max_abs_diff |   offline_nan_online_value |   online_nan_offline_value |
|:----------------------------------|:-----------------|-----------------------:|----------------:|----------------:|-------------:|---------------:|---------------------------:|---------------------------:|
| ambient_temperature               | raw sensor       |                      0 |           39464 |           39464 |     1.000000 |       0.000000 |                         16 |                          0 |
| uv_index                          | raw sensor       |                      0 |           39369 |           39369 |     1.000000 |       0.000000 |                         97 |                          0 |
| gas                               | raw sensor       |                      0 |           39392 |           39392 |     1.000000 |       0.000000 |                         79 |                          0 |
| noise                             | raw sensor       |                      0 |           39465 |           39465 |     1.000000 |       0.000000 |                         13 |                          0 |
| body_temperature                  | raw sensor       |                      0 |           39480 |           39480 |     1.000000 |       0.000000 |                          0 |                          0 |
| heart_rate                        | raw sensor       |                      0 |           39480 |           39480 |     1.000000 |       0.000000 |                          0 |                          0 |
| hr_deviation_bpm                  | deviation        |                      0 |           39480 |           39480 |     1.000000 |       0.000000 |                          0 |                          0 |
| hr_deviation_pct                  | deviation        |                      0 |           39480 |           39480 |     1.000000 |       0.000049 |                          0 |                          0 |
| body_temp_deviation_c             | deviation        |                      0 |           39480 |           39480 |     1.000000 |       0.000000 |                          0 |                          0 |
| body_temp_deviation_pct           | deviation        |                      0 |           39480 |           39480 |     1.000000 |       0.000050 |                          0 |                          0 |
| gas_ratio_to_baseline             | gas ratio        |                      0 |           39392 |           39392 |     1.000000 |       0.000049 |                         79 |                          0 |
| heart_rate_rolling_mean_30s       | rolling          |                     29 |           37392 |           37392 |     1.000000 |       0.000033 |                          0 |                          0 |
| heart_rate_rolling_mean_60s       | rolling          |                     59 |           35232 |           35232 |     1.000000 |       0.000050 |                          0 |                          0 |
| heart_rate_rolling_std_60s        | rolling          |                     59 |           35232 |           35232 |     1.000000 |       0.000050 |                          0 |                          0 |
| body_temp_rolling_mean_300s       | rolling          |                    299 |           21046 |           21046 |     1.000000 |       0.000050 |                          0 |                          0 |
| ambient_temp_rolling_mean_300s    | rolling          |                    299 |           21046 |           21046 |     1.000000 |       0.000050 |                          0 |                          0 |
| uv_rolling_mean_300s              | rolling          |                    299 |           21046 |           21046 |     1.000000 |       0.000050 |                          0 |                          0 |
| gas_rolling_mean_30s              | rolling          |                     29 |           37392 |           37392 |     1.000000 |       0.000048 |                          0 |                          0 |
| noise_rolling_mean_60s            | rolling          |                     59 |           35232 |           35232 |     1.000000 |       0.000049 |                          0 |                          0 |
| hr_trend_60s_bpm_per_min          | trend            |                     59 |           35232 |           35232 |     1.000000 |       0.000050 |                          0 |                          0 |
| body_temp_trend_300s_c_per_min    | trend            |                    299 |           21046 |           21046 |     1.000000 |       0.000050 |                          0 |                          0 |
| ambient_temp_trend_300s_c_per_min | trend            |                    299 |           21046 |           21046 |     1.000000 |       0.000050 |                          0 |                          0 |
| uv_trend_300s_per_min             | trend            |                    299 |           21046 |           21046 |     1.000000 |       0.000050 |                          0 |                          0 |
| gas_trend_60s_per_min             | trend            |                     59 |           35232 |           35232 |     1.000000 |       0.000050 |                          0 |                          0 |
| noise_trend_60s_db_per_min        | trend            |                     59 |           35232 |           35232 |     1.000000 |       0.000000 |                          0 |                          0 |
| noise_dose_pct                    | noise dose       |                     60 |           35160 |           35160 |     1.000000 |       0.000094 |                          0 |                          0 |
| temp_warning_exposure_sec         | exposure counter |                     60 |           35160 |           35159 |     0.999972 |      17.000000 |                          0 |                          0 |
| temp_critical_exposure_sec        | exposure counter |                     60 |           35160 |           35160 |     1.000000 |       0.000000 |                          0 |                          0 |
| uv_warning_exposure_sec           | exposure counter |                     60 |           35160 |           35017 |     0.995933 |     404.000000 |                          0 |                          0 |
| uv_critical_exposure_sec          | exposure counter |                     60 |           35160 |           35080 |     0.997725 |       3.000000 |                          0 |                          0 |
| gas_warning_exposure_sec          | exposure counter |                     60 |           35160 |           35160 |     1.000000 |       0.000000 |                          0 |                          0 |
| gas_critical_exposure_sec         | exposure counter |                     60 |           35160 |           35160 |     1.000000 |       0.000000 |                          0 |                          0 |
| noise_warning_exposure_sec        | exposure counter |                     60 |           35160 |           35160 |     1.000000 |       0.000000 |                          0 |                          0 |
| noise_critical_exposure_sec       | exposure counter |                     60 |           35160 |           35160 |     1.000000 |       0.000000 |                          0 |                          0 |
| hr_warning_exposure_sec           | exposure counter |                     60 |           35160 |           35160 |     1.000000 |       0.000000 |                          0 |                          0 |
| hr_critical_exposure_sec          | exposure counter |                     60 |           35160 |           35160 |     1.000000 |       0.000000 |                          0 |                          0 |
| body_temp_warning_exposure_sec    | exposure counter |                     60 |           35160 |           35091 |     0.998038 |       8.000000 |                          0 |                          0 |
| body_temp_critical_exposure_sec   | exposure counter |                     60 |           35160 |           35160 |     1.000000 |       0.000000 |                          0 |                          0 |

Runs / coverage per worker:

|       |   artifact_rejections |   runs |   rows_in_full_minutes |   rows_total |
|:------|----------------------:|-------:|-----------------------:|-------------:|
| S_001 |                     0 |     11 |                   3720 |         4559 |
| S_002 |                     0 |      7 |                   4140 |         4668 |
| S_003 |                     0 |      7 |                   4260 |         4706 |
| S_004 |                     0 |      9 |                   4020 |         4631 |
| W_001 |                     0 |     25 |                  12300 |        14015 |
| W_002 |                     0 |     28 |                  11940 |        13825 |

## B. End-to-end online replay (un-seeded, real gas calibration, gate active)

|                                                   |     S_001 |     S_002 |     S_003 |     S_004 |      W_001 |      W_002 |
|:--------------------------------------------------|----------:|----------:|----------:|----------:|-----------:|-----------:|
| rows                                              | 4559.0000 | 4668.0000 | 4706.0000 | 4631.0000 | 14015.0000 | 13825.0000 |
| online_READY                                      | 4215.0000 | 4363.0000 | 4458.0000 | 4341.0000 | 13645.0000 | 13308.0000 |
| online_UNCERTAIN                                  |  344.0000 |  305.0000 |  248.0000 |  290.0000 |   370.0000 |   517.0000 |
| uncertain_reason:SENSOR_WARMUP                    |  178.0000 |  180.0000 |  180.0000 |  180.0000 |   180.0000 |   180.0000 |
| uncertain_reason:MAJOR_TIMESTAMP_GAP              |  131.0000 |  114.0000 |   57.0000 |   95.0000 |   171.0000 |   285.0000 |
| uncertain_reason:PACKET_LOSS                      |   30.0000 |   10.0000 |   10.0000 |   10.0000 |     0.0000 |    20.0000 |
| uncertain_reason:SENSOR_UNAVAILABLE               |    5.0000 |    1.0000 |    1.0000 |    5.0000 |     0.0000 |    13.0000 |
| gas_ratio_to_baseline:share_within_1e-4           |    0.0000 |    0.0000 |    0.0000 |    0.0000 |     0.5055 |     0.5049 |
| gas_ratio_to_baseline:max_abs_diff                |    0.0211 |    0.0163 |    0.0388 |    0.2265 |     0.1863 |     0.1478 |
| temp_warning_exposure_sec:share_within_1e-4       |    0.9044 |    0.8632 |    0.0000 |    0.8717 |     0.4715 |     0.9984 |
| temp_warning_exposure_sec:max_abs_diff            |   33.0000 |   22.0000 |  213.0000 |    8.0000 |    16.0000 |    28.0000 |
| temp_critical_exposure_sec:share_within_1e-4      |    0.9601 |    1.0000 |    1.0000 |    1.0000 |     1.0000 |     1.0000 |
| temp_critical_exposure_sec:max_abs_diff           |    7.0000 |    0.0000 |    0.0000 |    0.0000 |     0.0000 |     0.0000 |
| uv_warning_exposure_sec:share_within_1e-4         |    0.8928 |    0.9796 |    0.9477 |    0.8556 |     0.9567 |     0.8442 |
| uv_warning_exposure_sec:max_abs_diff              |   60.0000 |   28.0000 |  227.0000 |   27.0000 |   192.0000 |  1814.0000 |
| uv_critical_exposure_sec:share_within_1e-4        |    0.9692 |    1.0000 |    0.9996 |    1.0000 |     0.9849 |     0.9745 |
| uv_critical_exposure_sec:max_abs_diff             |    4.0000 |    0.0000 |   53.0000 |    0.0000 |   311.0000 |    18.0000 |
| gas_warning_exposure_sec:share_within_1e-4        |    1.0000 |    0.9899 |    1.0000 |    0.9846 |     0.9997 |     0.9902 |
| gas_warning_exposure_sec:max_abs_diff             |    0.0000 |   82.0000 |    0.0000 |  170.0000 |    91.0000 |   101.0000 |
| gas_critical_exposure_sec:share_within_1e-4       |    1.0000 |    1.0000 |    1.0000 |    1.0000 |     0.9999 |     0.9990 |
| gas_critical_exposure_sec:max_abs_diff            |    0.0000 |    0.0000 |    0.0000 |    0.0000 |     7.0000 |     9.0000 |
| noise_warning_exposure_sec:share_within_1e-4      |    1.0000 |    1.0000 |    0.9980 |    1.0000 |     0.9987 |     0.9992 |
| noise_warning_exposure_sec:max_abs_diff           |    0.0000 |    0.0000 |   70.0000 |    0.0000 |    16.0000 |    12.0000 |
| noise_critical_exposure_sec:share_within_1e-4     |    1.0000 |    1.0000 |    0.9980 |    1.0000 |     0.9990 |     0.9997 |
| noise_critical_exposure_sec:max_abs_diff          |    0.0000 |    0.0000 |   70.0000 |    0.0000 |    16.0000 |    12.0000 |
| hr_warning_exposure_sec:share_within_1e-4         |    0.9217 |    1.0000 |    0.9838 |    1.0000 |     0.9716 |     0.8807 |
| hr_warning_exposure_sec:max_abs_diff              |   22.0000 |    0.0000 |   46.0000 |    0.0000 |    18.0000 |   892.0000 |
| hr_critical_exposure_sec:share_within_1e-4        |    1.0000 |    1.0000 |    0.9713 |    1.0000 |     0.9996 |     1.0000 |
| hr_critical_exposure_sec:max_abs_diff             |    0.0000 |    0.0000 |    6.0000 |    0.0000 |     5.0000 |     0.0000 |
| body_temp_warning_exposure_sec:share_within_1e-4  |    0.9841 |    1.0000 |    0.9973 |    1.0000 |     0.9999 |     1.0000 |
| body_temp_warning_exposure_sec:max_abs_diff       |    1.0000 |    0.0000 |    6.0000 |    0.0000 |     8.0000 |     0.0000 |
| body_temp_critical_exposure_sec:share_within_1e-4 |    1.0000 |    1.0000 |    1.0000 |    1.0000 |     1.0000 |     1.0000 |
| body_temp_critical_exposure_sec:max_abs_diff      |    0.0000 |    0.0000 |    0.0000 |    0.0000 |     0.0000 |     0.0000 |
| noise_dose_pct:share_within_1e-4                  |    0.0000 |    1.0000 |    0.0238 |    0.0000 |     0.3918 |     0.4485 |
| noise_dose_pct:max_abs_diff                       |    2.4953 |    0.0000 |    0.2345 |    0.0393 |     1.1747 |     0.0108 |
| uncertain_reason:INSUFFICIENT_HISTORY             |    0.0000 |    0.0000 |    0.0000 |    0.0000 |    19.0000 |    19.0000 |
