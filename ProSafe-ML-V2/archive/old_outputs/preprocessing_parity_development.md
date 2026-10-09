# Preprocessing parity report (development)

Workers: S_001, S_002, S_003, S_004, W_001

## A. Exact-parity replay (contiguous full-minute runs)

| category         |   features |   rows_compared |   rows_matching |   worst_max_abs_diff |   match_rate |
|:-----------------|-----------:|----------------:|----------------:|---------------------:|-------------:|
| deviation        |          4 |          111600 |          111600 |             0.000049 |     1.000000 |
| exposure counter |         12 |          298800 |          298730 |            17.000000 |     0.999766 |
| gas ratio        |          1 |           27829 |           27829 |             0.000049 |     1.000000 |
| noise dose       |          1 |           24900 |           24900 |             0.000094 |     1.000000 |
| raw sensor       |          6 |          167257 |          167257 |             0.000000 |     1.000000 |
| rolling          |          8 |          173740 |          173740 |             0.000050 |     1.000000 |
| trend            |          6 |          120840 |          120840 |             0.000050 |     1.000000 |

| feature                           | category         |   min_seconds_into_run |   rows_compared |   rows_matching |   match_rate |   max_abs_diff |   offline_nan_online_value |   online_nan_offline_value |
|:----------------------------------|:-----------------|-----------------------:|----------------:|----------------:|-------------:|---------------:|---------------------------:|---------------------------:|
| ambient_temperature               | raw sensor       |                      0 |           27900 |           27900 |     1.000000 |       0.000000 |                          0 |                          0 |
| uv_index                          | raw sensor       |                      0 |           27835 |           27835 |     1.000000 |       0.000000 |                         64 |                          0 |
| gas                               | raw sensor       |                      0 |           27829 |           27829 |     1.000000 |       0.000000 |                         62 |                          0 |
| noise                             | raw sensor       |                      0 |           27893 |           27893 |     1.000000 |       0.000000 |                          5 |                          0 |
| body_temperature                  | raw sensor       |                      0 |           27900 |           27900 |     1.000000 |       0.000000 |                          0 |                          0 |
| heart_rate                        | raw sensor       |                      0 |           27900 |           27900 |     1.000000 |       0.000000 |                          0 |                          0 |
| hr_deviation_bpm                  | deviation        |                      0 |           27900 |           27900 |     1.000000 |       0.000000 |                          0 |                          0 |
| hr_deviation_pct                  | deviation        |                      0 |           27900 |           27900 |     1.000000 |       0.000049 |                          0 |                          0 |
| body_temp_deviation_c             | deviation        |                      0 |           27900 |           27900 |     1.000000 |       0.000000 |                          0 |                          0 |
| body_temp_deviation_pct           | deviation        |                      0 |           27900 |           27900 |     1.000000 |       0.000049 |                          0 |                          0 |
| gas_ratio_to_baseline             | gas ratio        |                      0 |           27829 |           27829 |     1.000000 |       0.000049 |                         62 |                          0 |
| heart_rate_rolling_mean_30s       | rolling          |                     29 |           26450 |           26450 |     1.000000 |       0.000033 |                          0 |                          0 |
| heart_rate_rolling_mean_60s       | rolling          |                     59 |           24950 |           24950 |     1.000000 |       0.000050 |                          0 |                          0 |
| heart_rate_rolling_std_60s        | rolling          |                     59 |           24950 |           24950 |     1.000000 |       0.000050 |                          0 |                          0 |
| body_temp_rolling_mean_300s       | rolling          |                    299 |           15330 |           15330 |     1.000000 |       0.000050 |                          0 |                          0 |
| ambient_temp_rolling_mean_300s    | rolling          |                    299 |           15330 |           15330 |     1.000000 |       0.000050 |                          0 |                          0 |
| uv_rolling_mean_300s              | rolling          |                    299 |           15330 |           15330 |     1.000000 |       0.000050 |                          0 |                          0 |
| gas_rolling_mean_30s              | rolling          |                     29 |           26450 |           26450 |     1.000000 |       0.000048 |                          0 |                          0 |
| noise_rolling_mean_60s            | rolling          |                     59 |           24950 |           24950 |     1.000000 |       0.000049 |                          0 |                          0 |
| hr_trend_60s_bpm_per_min          | trend            |                     59 |           24950 |           24950 |     1.000000 |       0.000050 |                          0 |                          0 |
| body_temp_trend_300s_c_per_min    | trend            |                    299 |           15330 |           15330 |     1.000000 |       0.000050 |                          0 |                          0 |
| ambient_temp_trend_300s_c_per_min | trend            |                    299 |           15330 |           15330 |     1.000000 |       0.000050 |                          0 |                          0 |
| uv_trend_300s_per_min             | trend            |                    299 |           15330 |           15330 |     1.000000 |       0.000050 |                          0 |                          0 |
| gas_trend_60s_per_min             | trend            |                     59 |           24950 |           24950 |     1.000000 |       0.000050 |                          0 |                          0 |
| noise_trend_60s_db_per_min        | trend            |                     59 |           24950 |           24950 |     1.000000 |       0.000000 |                          0 |                          0 |
| noise_dose_pct                    | noise dose       |                     60 |           24900 |           24900 |     1.000000 |       0.000094 |                          0 |                          0 |
| temp_warning_exposure_sec         | exposure counter |                     60 |           24900 |           24899 |     0.999960 |      17.000000 |                          0 |                          0 |
| temp_critical_exposure_sec        | exposure counter |                     60 |           24900 |           24900 |     1.000000 |       0.000000 |                          0 |                          0 |
| uv_warning_exposure_sec           | exposure counter |                     60 |           24900 |           24900 |     1.000000 |       0.000000 |                          0 |                          0 |
| uv_critical_exposure_sec          | exposure counter |                     60 |           24900 |           24900 |     1.000000 |       0.000000 |                          0 |                          0 |
| gas_warning_exposure_sec          | exposure counter |                     60 |           24900 |           24900 |     1.000000 |       0.000000 |                          0 |                          0 |
| gas_critical_exposure_sec         | exposure counter |                     60 |           24900 |           24900 |     1.000000 |       0.000000 |                          0 |                          0 |
| noise_warning_exposure_sec        | exposure counter |                     60 |           24900 |           24900 |     1.000000 |       0.000000 |                          0 |                          0 |
| noise_critical_exposure_sec       | exposure counter |                     60 |           24900 |           24900 |     1.000000 |       0.000000 |                          0 |                          0 |
| hr_warning_exposure_sec           | exposure counter |                     60 |           24900 |           24900 |     1.000000 |       0.000000 |                          0 |                          0 |
| hr_critical_exposure_sec          | exposure counter |                     60 |           24900 |           24900 |     1.000000 |       0.000000 |                          0 |                          0 |
| body_temp_warning_exposure_sec    | exposure counter |                     60 |           24900 |           24831 |     0.997229 |       8.000000 |                          0 |                          0 |
| body_temp_critical_exposure_sec   | exposure counter |                     60 |           24900 |           24900 |     1.000000 |       0.000000 |                          0 |                          0 |

Runs / coverage per worker:

|       |   artifact_rejections |   runs |   rows_in_full_minutes |   rows_total |
|:------|----------------------:|-------:|-----------------------:|-------------:|
| S_001 |                     0 |     11 |                   3720 |         4559 |
| S_002 |                     0 |      7 |                   4140 |         4668 |
| S_003 |                     0 |      7 |                   4260 |         4706 |
| S_004 |                     0 |      9 |                   4020 |         4631 |
| W_001 |                     0 |     25 |                  12300 |        14015 |

## B. End-to-end online replay (un-seeded, real gas calibration, gate active)

|                                                   |     S_001 |     S_002 |     S_003 |     S_004 |      W_001 |
|:--------------------------------------------------|----------:|----------:|----------:|----------:|-----------:|
| rows                                              | 4559.0000 | 4668.0000 | 4706.0000 | 4631.0000 | 14015.0000 |
| online_READY                                      | 4215.0000 | 4363.0000 | 4458.0000 | 4341.0000 | 13645.0000 |
| online_UNCERTAIN                                  |  344.0000 |  305.0000 |  248.0000 |  290.0000 |   370.0000 |
| uncertain_reason:SENSOR_WARMUP                    |  178.0000 |  180.0000 |  180.0000 |  180.0000 |   180.0000 |
| uncertain_reason:MAJOR_TIMESTAMP_GAP              |  131.0000 |  114.0000 |   57.0000 |   95.0000 |   171.0000 |
| uncertain_reason:PACKET_LOSS                      |   30.0000 |   10.0000 |   10.0000 |   10.0000 |     0.0000 |
| uncertain_reason:SENSOR_UNAVAILABLE               |    5.0000 |    1.0000 |    1.0000 |    5.0000 |     0.0000 |
| gas_ratio_to_baseline:share_within_1e-4           |    0.0000 |    0.0000 |    0.0000 |    0.0000 |     0.5055 |
| gas_ratio_to_baseline:max_abs_diff                |    0.0211 |    0.0163 |    0.0388 |    0.2265 |     0.1863 |
| temp_warning_exposure_sec:share_within_1e-4       |    0.9044 |    0.8632 |    0.0000 |    0.8717 |     0.4715 |
| temp_warning_exposure_sec:max_abs_diff            |   33.0000 |   22.0000 |  213.0000 |    8.0000 |    16.0000 |
| temp_critical_exposure_sec:share_within_1e-4      |    0.9601 |    1.0000 |    1.0000 |    1.0000 |     1.0000 |
| temp_critical_exposure_sec:max_abs_diff           |    7.0000 |    0.0000 |    0.0000 |    0.0000 |     0.0000 |
| uv_warning_exposure_sec:share_within_1e-4         |    0.8928 |    0.9796 |    0.9477 |    0.8556 |     0.9567 |
| uv_warning_exposure_sec:max_abs_diff              |   60.0000 |   28.0000 |  227.0000 |   27.0000 |   192.0000 |
| uv_critical_exposure_sec:share_within_1e-4        |    0.9692 |    1.0000 |    0.9996 |    1.0000 |     0.9849 |
| uv_critical_exposure_sec:max_abs_diff             |    4.0000 |    0.0000 |   53.0000 |    0.0000 |   311.0000 |
| gas_warning_exposure_sec:share_within_1e-4        |    1.0000 |    0.9899 |    1.0000 |    0.9846 |     0.9997 |
| gas_warning_exposure_sec:max_abs_diff             |    0.0000 |   82.0000 |    0.0000 |  170.0000 |    91.0000 |
| gas_critical_exposure_sec:share_within_1e-4       |    1.0000 |    1.0000 |    1.0000 |    1.0000 |     0.9999 |
| gas_critical_exposure_sec:max_abs_diff            |    0.0000 |    0.0000 |    0.0000 |    0.0000 |     7.0000 |
| noise_warning_exposure_sec:share_within_1e-4      |    1.0000 |    1.0000 |    0.9980 |    1.0000 |     0.9987 |
| noise_warning_exposure_sec:max_abs_diff           |    0.0000 |    0.0000 |   70.0000 |    0.0000 |    16.0000 |
| noise_critical_exposure_sec:share_within_1e-4     |    1.0000 |    1.0000 |    0.9980 |    1.0000 |     0.9990 |
| noise_critical_exposure_sec:max_abs_diff          |    0.0000 |    0.0000 |   70.0000 |    0.0000 |    16.0000 |
| hr_warning_exposure_sec:share_within_1e-4         |    0.9217 |    1.0000 |    0.9838 |    1.0000 |     0.9716 |
| hr_warning_exposure_sec:max_abs_diff              |   22.0000 |    0.0000 |   46.0000 |    0.0000 |    18.0000 |
| hr_critical_exposure_sec:share_within_1e-4        |    1.0000 |    1.0000 |    0.9713 |    1.0000 |     0.9996 |
| hr_critical_exposure_sec:max_abs_diff             |    0.0000 |    0.0000 |    6.0000 |    0.0000 |     5.0000 |
| body_temp_warning_exposure_sec:share_within_1e-4  |    0.9841 |    1.0000 |    0.9973 |    1.0000 |     0.9999 |
| body_temp_warning_exposure_sec:max_abs_diff       |    1.0000 |    0.0000 |    6.0000 |    0.0000 |     8.0000 |
| body_temp_critical_exposure_sec:share_within_1e-4 |    1.0000 |    1.0000 |    1.0000 |    1.0000 |     1.0000 |
| body_temp_critical_exposure_sec:max_abs_diff      |    0.0000 |    0.0000 |    0.0000 |    0.0000 |     0.0000 |
| noise_dose_pct:share_within_1e-4                  |    0.0000 |    1.0000 |    0.0238 |    0.0000 |     0.3918 |
| noise_dose_pct:max_abs_diff                       |    2.4953 |    0.0000 |    0.2345 |    0.0393 |     1.1747 |
| uncertain_reason:INSUFFICIENT_HISTORY             |    0.0000 |    0.0000 |    0.0000 |    0.0000 |    19.0000 |
