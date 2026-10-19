/**
 * Results from Chapter 3 and Appendices F and G of the V4 thesis.
 * Percentages are as printed in the thesis. Laboratory results describe
 * short controlled tests, not field performance.
 */

export const overviewMetrics = [
  { value: '8', label: 'ML configurations', detail: 'Training/evaluation set-ups, 32 results in total' },
  { value: '4', label: 'Algorithms compared', detail: 'RF, XGBoost, SVM, Logistic Regression' },
  { value: '38', label: 'Engineered features', detail: 'EXTENDED set used by the deployed model' },
  { value: '13/13', label: 'Functional checks passed', detail: 'Physical helmet, laboratory conditions' },
  { value: '0.69 s', label: 'Mean emergency alert', detail: 'Button press to backend alert, lab mean of 3 trials' },
];

/** Deployed model (Experiment 2 configuration) on the two evaluation workers. */
export const deployedComparison = {
  workers: [
    {
      id: 'W_002',
      experiment: 'Experiment 2',
      note: 'Examined during model selection',
      accuracy: 95.46,
      balancedAccuracy: 67.66,
      macroF1: 68.48,
      criticalRecall: 8.85,
      criticalDetected: 23,
      criticalTotal: 260,
      criticalPrecision: 20.54,
      missedAs: '237 predicted as WARNING, none as SAFE',
    },
    {
      id: 'W_003',
      experiment: 'Experiment 5',
      note: 'Evaluated after selection, no tuning on W_003',
      accuracy: 98.23,
      balancedAccuracy: 98.18,
      macroF1: 96.61,
      criticalRecall: 97.82,
      criticalDetected: 493,
      criticalTotal: 504,
      criticalPrecision: 88.51,
      missedAs: '11 predicted as WARNING, none as SAFE',
    },
  ],
  metrics: [
    { key: 'accuracy', label: 'Accuracy' },
    { key: 'balancedAccuracy', label: 'Balanced accuracy' },
    { key: 'macroF1', label: 'Macro F1-score' },
    { key: 'criticalRecall', label: 'CRITICAL recall', emphasis: true },
  ],
  takeaway:
    'Although the selected model achieved high overall accuracy on both evaluation workers, its ability to recognize CRITICAL-labelled observations varied substantially, highlighting the importance of cross-worker validation.',
  caveats: [
    'Labels come from the study’s rule-informed reference framework, so these results measure agreement with that framework, not clinical or injury-prevention accuracy.',
    'W_002 was examined during the deployment decision, so it is not an untouched test set. W_003 was held out and evaluated later without tuning the production model on it.',
    'CRITICAL observations were only 1.9% of W_002 and 3.6% of W_003, which is why accuracy alone is misleading.',
  ],
};

/** Table 3.2 (XGBoost) with training composition from Table 2.5. */
export const experiments = [
  { exp: 1, training: 'Synthetic (S_001–S_004)', rows: 18564, evaluation: 'W_001', acc: 73.82, bal: 61.87, f1: 58.51, crit: 14.09, best: '68.14 (LR)' },
  { exp: 2, training: 'Synthetic + W_001', rows: 32579, evaluation: 'W_002', acc: 95.46, bal: 67.66, f1: 68.48, crit: 8.85, best: '68.48 (XGB)', deployed: true },
  { exp: 3, training: 'W_001', rows: 14015, evaluation: 'W_002', acc: 89.27, bal: 60.63, f1: 60.04, crit: 0, best: '60.04 (XGB)' },
  { exp: 4, training: 'Synthetic (S_001–S_004)', rows: 18564, evaluation: 'W_003', acc: 67.63, bal: 48.3, f1: 44.87, crit: 0, best: '69.33 (LR)' },
  { exp: 5, training: 'Synthetic + W_001', rows: 32579, evaluation: 'W_003', acc: 98.23, bal: 98.18, f1: 96.61, crit: 97.82, best: '96.61 (XGB)', deployed: true },
  { exp: 6, training: 'W_001', rows: 14015, evaluation: 'W_003', acc: 88.84, bal: 69.35, f1: 73.95, crit: 26.59, best: '73.95 (XGB)' },
  { exp: 7, training: 'Synthetic (S_001–S_004)', rows: 18564, evaluation: 'W_002', acc: 52.47, bal: 34.06, f1: 24.45, crit: 0, best: '53.37 (LR)' },
  { exp: 8, training: 'W_001 + W_002', rows: 27840, evaluation: 'W_003', acc: 92.89, bal: 75.2, f1: 79.89, crit: 34.92, best: '79.89 (XGB)' },
];

/** Table G.1: macro F1 and CRITICAL recall of every algorithm (%, one decimal). */
export const allAlgorithms = [
  { exp: 1, rf: [54.0, 0.1], xgb: [58.5, 14.1], svm: [63.9, 97.6], lr: [68.1, 100.0] },
  { exp: 2, rf: [65.5, 8.8], xgb: [68.5, 8.8], svm: [42.5, 0.0], lr: [61.4, 0.0] },
  { exp: 3, rf: [59.8, 0.0], xgb: [60.0, 0.0], svm: [56.8, 0.0], lr: [56.2, 0.0] },
  { exp: 4, rf: [55.1, 0.0], xgb: [44.9, 0.0], svm: [55.5, 100.0], lr: [69.3, 94.8] },
  { exp: 5, rf: [88.1, 84.5], xgb: [96.6, 97.8], svm: [49.3, 0.0], lr: [61.8, 0.0] },
  { exp: 6, rf: [58.1, 0.0], xgb: [74.0, 26.6], svm: [57.7, 0.0], lr: [58.2, 0.0] },
  { exp: 7, rf: [48.2, 0.0], xgb: [24.4, 0.0], svm: [33.9, 100.0], lr: [53.4, 100.0] },
  { exp: 8, rf: [78.9, 33.5], xgb: [79.9, 34.9], svm: [58.1, 0.0], lr: [53.4, 4.6] },
];

export const experimentNotes = [
  'Experiments 1–3 formed the original study. Experiments 4–6 applied the same training set-ups to W_003 without tuning on it. Experiments 7 and 8 were run later and are comparative rather than independent tests.',
  'EXTENDED was selected on training-side validation in 29 of 32 cases (exceptions: SVM in Exp. 2 and 5, Logistic Regression in Exp. 8).',
  'SVM and Logistic Regression reached high CRITICAL recall only when trained on synthetic data, with CRITICAL precision of just 4.9–30.1%, i.e. mostly false alarms.',
  'Across all 32 results only three CRITICAL observations were predicted as SAFE (one by SVM in Exp. 2, two by XGBoost in Exp. 7).',
];

/** Table 3.1(a). */
export const sensorResults = [
  { part: 'DHT11', label: 'Ambient temperature', value: '0.35 °C', metric: 'MAE', detail: '1.18% vs reference thermometer', status: 'Close agreement' },
  { part: 'LM35', label: 'Skin temperature', value: '0.15 °C', metric: 'MAE', detail: '0.42% vs skin thermometer', status: 'Close agreement' },
  { part: 'MAX30102', label: 'Heart rate', value: '3.5 bpm', metric: 'MAE', detail: '3.60%; error rose after activity (2.56% → 4.63%)', status: 'Larger error after activity' },
];

export const indicativeSensors = [
  { part: 'GUVA-S12SD', text: 'UV index 5.6 vs meter 5.2 — indicative, not validated.' },
  { part: 'MQ-2', text: '2.20× clean-air baseline under controlled exposure — relative response, no ppm.' },
  { part: 'INMP441', text: '≈78.1 dB unweighted vs 76 dBA meter — trend indicator only.' },
];

/** Table 3.1(b). */
export const timingResults = [
  { test: 'Sensor observation interval', expected: '≈1 s', mean: '1.00 s', range: '0.99–1.01 s' },
  { test: 'Sensor batch transmission', expected: '≈5 s', mean: '5.06 s', range: '4.96–5.13 s' },
  { test: 'LED command polling', expected: '≈5 s', mean: '5.04 s', range: '4.94–5.12 s' },
  { test: 'Emergency reset polling', expected: '≈3 s', mean: '3.03 s', range: '2.97–3.08 s' },
  { test: 'Button press to local emergency LED', expected: 'Immediate', mean: '0.09 s', range: '0.08–0.10 s' },
  { test: 'Emergency activation to backend alert', expected: 'Network dependent', mean: '0.69 s', range: '0.58–0.81 s' },
  { test: 'Administrator reset to acknowledgement', expected: 'Within reset polling', mean: '2.22 s', range: '1.15–3.12 s' },
  { test: 'Backend status change to LED update', expected: 'Within command polling', mean: '3.36 s', range: '1.43–4.91 s' },
];

/** Table 3.3. */
export const testingResults = [
  { component: 'ML service', method: 'Python integration, streaming, parity and app tests', passed: 52, total: 52, note: 'Feature parity 99.98% on 6,554 replayed W_001 rows' },
  { component: 'Backend', method: 'Jest and Supertest, 20 suites', passed: 380, total: 380, note: 'Live ML suite not run' },
  { component: 'Frontend', method: 'Vitest and React Testing Library, 36 files', passed: 242, total: 242, note: '' },
  { component: 'Firmware', method: 'PlatformIO build and functional checks', result: 'Build successful', note: 'No separate automated firmware unit tests' },
  { component: 'Physical helmet', method: 'Laboratory verification (Appendix F)', passed: 13, total: 13, note: 'Functional checks recorded as PASS' },
  { component: 'System integration', method: 'API ingestion tests and raw-data replay', result: 'Passed', note: 'Used simulated helmet input' },
];

export const testingScope =
  'The automated tests (run on 10 October 2026) used simulated services, recorded data or simulated helmet input; they did not involve the assembled helmet. Device behaviour was checked separately through the 13 laboratory functional checks.';

/** Section 3.1.4 and Figure 3.2. */
export const userAcceptance = {
  participants: { admin: 3, worker: 3 },
  admin: {
    mean: 3.61,
    positive: 57.6,
    dimensions: [
      { label: 'Web app usability & dashboard', value: 3.83 },
      { label: 'Worker & helmet management', value: 3.67 },
      { label: 'Safety information', value: 3.53 },
      { label: 'Alerts & emergency management', value: 3.44 },
      { label: 'Overall usefulness & acceptance', value: 3.5 },
    ],
  },
  worker: {
    mean: 3.52,
    positive: 51.5,
    dimensions: [
      { label: 'Helmet comfort & wearability', value: 3.13 },
      { label: 'Safety indicators & emergency', value: 4.0 },
      { label: 'Worker web application', value: 3.38 },
      { label: 'Overall trust & acceptance', value: 3.56 },
    ],
  },
  positives: ['Emergency assistance function', 'Overview of all workers', 'Safety status indicators'],
  improvements: ['Helmet comfort and weight', 'Alert clarity (UNCERTAIN, CRITICAL vs emergency)', 'Dashboard update speed', 'Explanation of sensor readings'],
  qualification:
    'Six participants (three per role) at one site: a small descriptive evaluation, not a large-scale usability validation. The thesis states the findings remain subject to confirmation against the completed questionnaires.',
};

export const findings = [
  { icon: 'Layers', title: 'Integrated monitoring at prototype level', text: 'Helmet, backend, ML service and web app worked together in laboratory, automated and simulated end-to-end tests.' },
  { icon: 'UserRoundCheck', title: 'Personal and temporal features were preferred', text: 'The 38-feature EXTENDED set was selected in 29 of 32 results, partly reflecting the label design.' },
  { icon: 'Users', title: 'Data and worker differences mattered most', text: 'Training-data composition mattered more than the algorithm, and accuracy did not ensure CRITICAL detection.' },
  { icon: 'ShieldCheck', title: 'Hardware, software and emergency verified', text: 'Within the evaluated conditions, functional checks and automated tests passed and emergency alerts arrived in under a second.' },
];

export const limitations = [
  'Only three real workers, with synthetic data and rule-informed labels',
  'CRITICAL recall was inconsistent between evaluation workers (8.85% vs 97.82%)',
  'UV, gas and sound sensors need calibration against reference instruments',
  'Short laboratory hardware tests; comfort and longer field validation still needed',
  'Alert clarity, update speed and dependence on site Wi-Fi need improvement',
];

export const conclusion =
  'ProSafe shows that personalized, ML-based construction safety monitoring through an integrated smart helmet is technically feasible at prototype level. Testing with more workers, sites and operating conditions is needed before any practical deployment claims can be made.';
