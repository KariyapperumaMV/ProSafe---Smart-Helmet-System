/** Methodology content condensed from Chapter 2 of the thesis draft. */

export const methodologyIntro =
  'The research followed the Design Science Research (DSR) approach, in which knowledge is produced by designing an artefact that addresses an identified problem and then evaluating how well it performs (Hevner et al.; Peffers et al.). DSR suited ProSafe because the research problem required a working system that integrates sensing, personalization, temporal features, ML classification and data-quality handling, and whose behaviour could then be measured. The artefact was built through iterative software engineering, with each component tested before integration.';

export const methodologyTabs = [
  { id: 'process', label: 'Research Approach', icon: 'Route' },
  { id: 'architecture', label: 'System Architecture', icon: 'Network' },
  { id: 'hardware', label: 'Smart Helmet', icon: 'HardHat' },
  { id: 'data', label: 'Data & Features', icon: 'Database' },
  { id: 'ml', label: 'ML Pipeline', icon: 'BrainCircuit' },
  { id: 'realtime', label: 'Real-Time Monitoring', icon: 'Radio' },
];

/** Figure 2.1: the ten stages of the research process, grouped by DSR activity. */
export const dsrPhases = [
  {
    phase: 'Problem identification',
    stages: [
      { n: 1, title: 'Literature review and problem identification', text: 'Reviewed wearable sensing, threshold systems, ML in occupational safety, personalization, exposure and data quality to define the research gap.' },
      { n: 2, title: 'System requirements identification', text: 'Derived functional and non-functional requirements from the gap analysis and the needs of administrators and workers.' },
    ],
  },
  {
    phase: 'Design and development',
    stages: [
      { n: 3, title: 'System design', text: 'Defined a five-component architecture communicating over HTTP with JSON, with live browser updates through Server-Sent Events.' },
      { n: 4, title: 'Smart helmet hardware and firmware', text: 'Built the ESP32 helmet with six sensing channels, an RGB status LED and an emergency button; firmware written in C++ with PlatformIO.' },
      { n: 5, title: 'Dataset collection, generation and preparation', text: 'Recorded two real workers, generated four synthetic profiles, cleaned the data conservatively, labelled it and engineered personalized and temporal features.' },
      { n: 6, title: 'ML development and experimental evaluation', text: 'Compared four algorithms over three nested feature sets in three cross-worker experiments, then deployed the selected model.' },
      { n: 7, title: 'Backend and web application development', text: 'Implemented the Node.js/Express backend, MongoDB data model and the React web application for administrators and workers.' },
      { n: 8, title: 'System integration', text: 'Connected the helmet, backend, ML service, database and web application into a single near-real-time pipeline.' },
    ],
  },
  {
    phase: 'Evaluation',
    stages: [
      { n: 9, title: 'Testing and evaluation', text: 'Automated unit, service and integration tests; quantitative ML experiments; a user acceptance protocol prepared for real participants.' },
      { n: 10, title: 'Practical feasibility assessment', text: 'Assessed intended users, product value, cost structure and the requirements for wider deployment.' },
    ],
  },
  {
    phase: 'Communication',
    stages: [
      { n: null, title: 'Documentation and communication', text: 'Proposal, progress presentations, dissertation and this research website.' },
    ],
  },
];

export const requirements = {
  functional: [
    'Combine environmental and physiological sensing on the helmet',
    'Interpret physiology relative to each worker’s baseline',
    'Classify safety risk with an ML model',
    'Avoid presenting unreliable data as safe',
    'Worker and helmet management, alerts and notifications',
    'Helmet status indicator and manual emergency with a controlled reset',
    'Separate interfaces for administrators and workers',
    'Near-real-time monitoring during a shift',
  ],
  nonFunctional: [
    'Security for identity and health-related data',
    'Reliability when data, services or networks fail',
    'Acceptable response time',
    'Usability for users with different technical experience',
    'Maintainability through a modular structure',
    'Handling a continuous stream of one-second observations',
  ],
};

/** Figure 2.2: the five primary components and how they communicate. */
export const architecture = {
  components: [
    {
      id: 'helmet',
      icon: 'HardHat',
      name: 'ESP32 Smart Helmet',
      tech: 'C++ · Arduino framework · PlatformIO',
      duties: ['Reads six sensor channels at 1 Hz', 'Timestamps and buffers up to 120 samples', 'Uploads batches about every 5 s', 'Shows backend status on an RGB LED', 'Sends manual emergency messages'],
    },
    {
      id: 'backend',
      icon: 'Server',
      name: 'Node.js & Express Backend',
      tech: 'REST API · JWT · role-based access · SSE',
      duties: ['Validates batches and resolves the worker', 'Retrieves baselines and calls the ML service', 'Confidence rule and majority-vote smoothing', 'Alerts, notifications and helmet commands', 'Publishes live updates to browsers'],
    },
    {
      id: 'ml',
      icon: 'BrainCircuit',
      name: 'Python Flask ML Service',
      tech: 'pandas · scikit-learn · XGBoost',
      duties: ['Streaming preprocessing per worker session', 'Engineers the 38 EXTENDED features', 'Data-quality gate: READY or UNCERTAIN', 'XGBoost SAFE / WARNING / CRITICAL with class probabilities'],
    },
    {
      id: 'db',
      icon: 'Database',
      name: 'MongoDB Database',
      tech: 'Mongoose schemas',
      duties: ['Users, helmets and baselines', 'One document per one-second sample', 'Processing state, alerts and notifications', 'Helmet commands (LED state)'],
    },
    {
      id: 'web',
      icon: 'MonitorSmartphone',
      name: 'React Web Application',
      tech: 'React · Vite · React Router · Axios · Recharts',
      duties: ['Administrator dashboard and management', 'Worker dashboard and history', 'Live status, alerts and Safety Trend chart', 'Analytics and PDF reports'],
    },
  ],
  links: [
    { from: 'helmet', to: 'backend', label: 'HTTP + JSON: sample batches, emergency messages, command polling' },
    { from: 'backend', to: 'ml', label: 'HTTP + JSON: ordered readings with baselines → per-sample results' },
    { from: 'backend', to: 'db', label: 'Mongoose: samples, state, alerts, notifications, commands' },
    { from: 'backend', to: 'web', label: 'REST API (Axios + JWT) and an authenticated SSE stream' },
  ],
  external: 'The backend also obtains site weather for the dashboard from an external weather service (Open-Meteo).',
  flow: ['Smart Helmet', 'Backend', 'ML Processing', 'Risk Classification', 'Alerts · Dashboard · Helmet Feedback'],
  notes: [
    'The helmet never calculates risk itself. The XGBoost model runs only in the ML service; the helmet displays the status command it receives from the backend.',
    'Emergencies follow a separate path from ML risk classification. A button press creates an EMERGENCY alert directly, and it takes precedence over any predicted state.',
    'If the ML service is unreachable, times out or returns malformed data, every sample is stored as UNCERTAIN, so a service failure can never produce a SAFE status.',
  ],
};

/** Table 2.1: smart helmet hardware components. */
export const hardwareComponents = [
  { component: 'ESP32', measures: 'Microcontroller and Wi-Fi', notes: 'Built-in Wi-Fi, ADC, I2C and I2S interfaces; low cost and widely supported', group: 'core' },
  { component: 'DHT11', measures: 'Ambient temperature', notes: 'Single-wire digital sensor; humidity is read but not transmitted', group: 'environmental' },
  { component: 'GUVA-S12SD', measures: 'Ultraviolet radiation', notes: 'Analogue output converted to an approximate UV index', group: 'environmental' },
  { component: 'MQ-2', measures: 'Combustible gas and smoke response', notes: 'Analogue output in sensor units, not verified ppm', group: 'environmental' },
  { component: 'INMP441', measures: 'Approximate sound level', notes: 'I2S MEMS microphone; unweighted, uncalibrated level', group: 'environmental' },
  { component: 'MAX30102', measures: 'Heart rate', notes: 'I2C optical sensor that needs skin contact', group: 'physiological' },
  { component: 'LM35', measures: 'Skin temperature', notes: 'Analogue sensor; measures skin, not core body temperature', group: 'physiological' },
  { component: 'RGB LED', measures: 'Safety status indication', notes: 'PWM-driven; colour set by backend command', group: 'feedback' },
  { component: 'Push button', measures: 'Manual emergency activation', notes: 'Digital input with 50 ms debounce', group: 'feedback' },
  { component: 'Battery and supporting circuitry', measures: 'Portable operation', notes: 'Specification to be confirmed from hardware records', group: 'core' },
];

export const firmwareFacts = [
  { title: 'Reliable timestamps', text: 'At start-up the helmet connects to Wi-Fi and synchronizes its clock with network time servers; no observation is recorded before synchronization.' },
  { title: '50 ms main loop', text: 'Each pass checks the emergency button, detects heartbeats and filters the LM35 voltage with an exponential moving average.' },
  { title: 'One observation per second', text: 'Heart rate is the average of the last four beats and is reported missing when there is no skin contact. Sound level is estimated from 256 microphone samples.' },
  { title: 'Validity flags and nulls', text: 'Every channel carries a validity flag; an unreadable channel is sent as null, never as a substituted number.' },
  { title: 'Ring buffer and retries', text: 'Up to 120 samples (two minutes) are buffered and uploaded as a JSON batch about every five seconds. Samples are removed only after the backend confirms receipt.' },
  { title: 'Status polling', text: 'The helmet polls its command about every five seconds and shows blue at start-up or when no valid command has arrived for 30 seconds, so a lost connection is never shown as green.' },
];

export const ledStates = [
  { state: 'SAFE', colour: 'Green', dot: 'bg-safe' },
  { state: 'WARNING', colour: 'Amber', dot: 'bg-warning' },
  { state: 'CRITICAL', colour: 'Red', dot: 'bg-danger' },
  { state: 'UNCERTAIN', colour: 'Blue', dot: 'bg-info' },
  { state: 'EMERGENCY', colour: 'Red (latched)', dot: 'bg-danger' },
];

export const emergencySteps = [
  'The worker presses the debounced emergency button.',
  'The helmet latches the emergency, turns the LED red and sends an emergency message, retrying until delivered.',
  'The backend marks the emergency active, creates an EMERGENCY alert, notifies administrators and publishes a status update.',
  'An administrator requests a reset from the web application.',
  'The helmet detects the request by polling every three seconds, clears its local state and returns an acknowledgement.',
  'Only this acknowledgement resolves the emergency, so the dashboard never shows it resolved while the helmet is still in emergency.',
];

export const hardwareVerification =
  'The final firmware was verified by a successful PlatformIO build for the ESP32 target and by inspecting the code against the intended behaviour. This does not confirm correct operation on the physical helmet: no firmware unit or hardware tests and no calibration of the gas, sound or UV sensors against reference instruments have been recorded. These are treated as limitations, not completed validation.';

/**
 * Table 2.2: records at each dataset stage. Worker profiles and
 * physiological baselines from the thesis are intentionally not published
 * on the website.
 */
export const datasets = [
  { worker: 'W_001', type: 'Real', use: 'Training (Exp. 2) · test (Exp. 1)', raw: 14400, ready: 14015 },
  { worker: 'W_002', type: 'Real', use: 'Test worker (Exp. 2 and 3)', raw: 14400, ready: 13825 },
  { worker: 'S_001', type: 'Synthetic', use: 'Training only', raw: 5000, ready: 4559 },
  { worker: 'S_002', type: 'Synthetic', use: 'Training only', raw: 5000, ready: 4668 },
  { worker: 'S_003', type: 'Synthetic', use: 'Training only', raw: 5000, ready: 4706 },
  { worker: 'S_004', type: 'Synthetic', use: 'Training only', raw: 5000, ready: 4631 },
];
export const datasetTotals = { raw: 48800, ready: 46404, uncertain: 2396 };

export const dataCollection = [
  'Two real workers were each recorded for four hours under ordinary working conditions (9.00–11.00 a.m. and 1.00–3.00 p.m.) at about one observation per second. They were not deliberately exposed to dangerous conditions.',
  'Because severe hazards are rare in ordinary work, and exposing people to dangerous heat, gas or noise would be unsafe and unethical, four synthetic profiles covering high heat, high UV, gas, noise, combined hazards and recovery were added. Synthetic data was used only for training; all evaluation used real-worker data.',
  'Operational baselines are the median of valid heart-rate and body-temperature readings in the first 180 seconds of each recording. They are working-period references, not medically verified resting values.',
];

export const preprocessing = [
  'Validated columns and timestamps, ordered observations chronologically and checked for duplicates; a gap of more than 60 s starts a new session.',
  'Cleaned conservatively: high values were never removed for being high, only short spikes that returned within one to three seconds were treated as artefacts.',
  'Flagged frozen values, out-of-range readings, unreliable skin contact and unstable heart rate.',
  'Filled only short gaps with valid readings on both sides (≤5 s for temperatures, ≤2 s for other channels), never across sessions or unreliable segments.',
  'Froze all rules with a recorded checksum before W_002 was processed, reserving W_002 for cross-worker evaluation.',
];

/** Table 2.3: summary of the reference-labelling rules (proxy ground truth). */
export const labellingRules = [
  {
    label: 'CRITICAL',
    className: 'badge-critical',
    text: 'Overrides for sustained very high heart rate or sustained strong gas response; a critical-level hazard for 60 s with physiological evidence; two critical-level hazards together for 30 s; a heart-rate deviation ≥40% or body-temperature deviation ≥1.0 °C with supporting evidence; three evidence sources for 120 s without recovery; or a noise dose ≥100%.',
  },
  {
    label: 'WARNING',
    className: 'badge-warning',
    text: 'Two warning-level hazards together for 60 s; one critical-level hazard for 30 s without physiological evidence; one warning-level hazard for 300 s; a heart-rate deviation ≥20% for 60 s; a body-temperature deviation ≥0.5 °C for 300 s; a hazard with rising physiology; or a noise dose ≥50%.',
  },
  {
    label: 'SAFE',
    className: 'badge-safe',
    text: 'None of the above, including brief or moderate evidence with stable physiology.',
  },
];

export const labellingNote =
  'Labels are rule-informed, personalized reference labels used as proxy ground truth for model development. They are not medically confirmed diagnoses or verified injuries. CRITICAL rules are checked first, then WARNING; SAFE is assigned when neither applies.';

/** Table 2.4: feature groups in the EXTENDED feature set. */
export const featureGroups = [
  { group: 'Current sensor values', count: 6, example: 'heart_rate, body_temperature, uv_index', purpose: 'Present conditions after validation' },
  { group: 'Personalized deviations', count: 4, example: 'hr_deviation_bpm, hr_deviation_pct', purpose: 'Physiological change relative to the worker’s baseline' },
  { group: 'Gas normalization', count: 1, example: 'gas_ratio_to_baseline', purpose: 'Gas response relative to the session baseline' },
  { group: 'Rolling statistics', count: 8, example: 'heart_rate_rolling_mean_30s', purpose: 'Sustained level and variability over 30, 60 or 300 s' },
  { group: 'Temporal trends', count: 6, example: 'hr_trend_60s_bpm_per_min', purpose: 'Direction and rate of change per minute' },
  { group: 'Exposure durations', count: 12, example: 'temp_critical_exposure_sec', purpose: 'Consecutive seconds at or above warning or critical levels' },
  { group: 'Noise dose', count: 1, example: 'noise_dose_pct', purpose: 'Cumulative daily noise exposure' },
];

export const equations = [
  { label: 'Absolute deviation', formula: 'Δabs = x − b', note: 'x = current reading, b = worker baseline' },
  { label: 'Percentage deviation', formula: 'Δpct = ((x − b) / b) × 100', note: 'Applied to heart rate and body temperature' },
  { label: 'Resistant trend', formula: 'Trend = [median(recent ⅓) − median(oldest ⅓)] / (⅔ W) × 60', note: 'Per minute, over a window of W seconds; a single spike cannot dominate' },
  { label: 'Noise dose (NIOSH, 85 dB / 8 h, 3 dB exchange)', formula: 'T(L) = 480 / 2^((L − 85)/3),  D = Σ 100 × (1/60) / T(Lₜ)', note: 'Seconds at or above 80 dB; approximate, because sound is uncalibrated' },
];

export const featureNotes = [
  'All temporal features are causal: they use only current and earlier observations of the same session.',
  'Raw baselines are processing context, not predictors. With only two real workers, a constant baseline could act as a worker fingerprint, so baselines are excluded from model inputs.',
  'Threshold values remain in ProSafe as reference conditions for exposure features, not as the final decision rule.',
];

/** Figure 2.5 and Section 2.9: processing order from sensor to feedback. */
export const mlPipeline = [
  { where: 'Helmet', title: 'Sensor data acquisition', text: 'One timestamped observation per second with validity flags; invalid channels sent as null.' },
  { where: 'Backend', title: 'Batch validation and worker resolution', text: 'Validates the batch, identifies the worker from the helmet assignment, retrieves baselines and skips samples already stored after a retry.' },
  { where: 'ML service', title: 'Session handling', text: 'A long gap, a new workday or a helmet or baseline change starts a new session and resets temporal state.' },
  { where: 'ML service', title: 'Channel validation and missing data', text: 'Plausibility ranges, short last-value holds and artefact screening.' },
  { where: 'ML service', title: 'Worker-specific baseline deviations', text: 'Heart rate and body temperature compared with stored baselines in bpm, °C and percent.' },
  { where: 'ML service', title: 'Gas baseline and ratio', text: 'Session gas baseline from the median of the first 180 s (provisional after 20 samples).' },
  { where: 'ML service', title: 'Temporal exposure features', text: 'Rolling statistics and trends over 30, 60 and 300 s, 12 exposure counters and the noise dose.' },
  { where: 'ML service', title: 'Data-quality gate', text: 'READY or UNCERTAIN with reasons, e.g. sensor warm-up, missing baseline, timestamp gaps, lost contact or unstable heart rate.', gate: true },
  { where: 'ML service', title: 'XGBoost prediction', text: 'READY observations only: SAFE, WARNING or CRITICAL with three class probabilities. UNCERTAIN observations never reach the classifier.' },
  { where: 'Backend', title: 'Prediction post-processing', text: 'Highest probability below 0.70 → UNCERTAIN (low confidence). Accepted predictions are smoothed by a majority vote over the last five, ties towards the more severe state.' },
  { where: 'Backend', title: 'Risk state update', text: 'A confirmed change needs three of five votes (about three seconds) and is recorded as a transition.' },
  { where: 'Backend → Web & Helmet', title: 'Alerts and helmet feedback', text: 'Alerts and notifications, a live SSE update to the worker and administrators, and a new helmet command shown on the LED at the next poll.' },
];

export const algorithms = [
  { name: 'Random Forest', text: 'Ensemble of decision trees on random subsets of data and features; handles non-linear relationships and noisy inputs.' },
  { name: 'XGBoost', text: 'Regularized gradient-boosted trees; handles missing values natively and needs no feature scaling, useful when long-window features are missing early in a session.' },
  { name: 'Support Vector Machine', text: 'Maximum-margin boundaries with kernel functions; requires feature scaling and slows as datasets grow.' },
  { name: 'Logistic Regression', text: 'Interpretable linear baseline whose coefficients can be inspected.' },
];

export const featureSets = [
  { name: 'BASIC_PERSONALIZED', count: 11, text: 'Current values, personalized deviations and gas ratio' },
  { name: 'TEMPORAL_PERSONALIZED', count: 26, text: 'Adds rolling statistics, trends and the noise dose' },
  { name: 'EXTENDED', count: 38, text: 'Adds the 12 exposure-duration features (deployed)' },
];

/** Table 2.5: design of the three ML experiments. */
export const experiments = [
  { id: 1, name: 'Synthetic → W_001', train: 'S_001–S_004 (18,564 rows)', test: 'W_001 (14,015 rows)', validation: 'Leave-one-group-out over four synthetic workers' },
  { id: 2, name: 'Hybrid → W_002', train: 'S_001–S_004 and W_001 (32,579 rows)', test: 'W_002 (13,825 rows)', validation: 'Leave-one-group-out over five training workers' },
  { id: 3, name: 'W_001 → W_002', train: 'W_001 (14,015 rows)', test: 'W_002 (13,825 rows)', validation: 'Five contiguous chronological blocks with a 300-row purge on both sides' },
];

export const optimisation = [
  'Each algorithm received the same budget of 12 seeded hyperparameter configurations (seed 42) for each of the three feature sets: 36 candidates per algorithm per experiment.',
  'Class weighting was part of the search to address class imbalance; non-converged Logistic Regression candidates were discarded.',
  'Selection used training-side validation only: candidates within 0.01 of the best cross-validated accuracy, then the highest macro F1, with balanced accuracy, CRITICAL recall and the lowest CRITICAL-to-SAFE rate as tie-breakers.',
  'Metrics: accuracy, balanced accuracy, macro F1, class-wise precision, recall and F1, confusion matrices and the CRITICAL-to-SAFE count. CRITICAL recall received particular attention.',
];

export const deployment =
  'XGBoost with the EXTENDED feature set, trained on the Experiment 2 data, was promoted to production with its label encoder and frozen feature configuration. An automated test confirms that the promoted model reproduces the experiment predictions, and the Flask service refuses to serve predictions unless the loaded model is XGBoost with the 38 EXTENDED features.';

/** Section 2.9.1 and Figure 2.7: one helmet upload through the system. */
export const uploadSequence = [
  { actor: 'Helmet', text: 'POST a batch of timestamped samples' },
  { actor: 'Backend', text: 'Validate the batch structure' },
  { actor: 'Backend', text: 'Resolve the worker from the helmet and read baselines' },
  { actor: 'Backend', text: 'Load processing state and skip duplicate samples' },
  { actor: 'Backend', text: 'Send ordered readings and baselines to the ML service' },
  { actor: 'ML service', text: 'Update session state, engineer features and apply the gate' },
  { actor: 'ML service', text: 'Return a READY prediction or UNCERTAIN for each sample' },
  { actor: 'Backend', text: 'Apply the confidence rule, smoothing, transitions and data-quality checks' },
  { actor: 'Backend', text: 'Store one document per sample and save the processing state' },
  { actor: 'Backend', text: 'Create alerts, notifications and the helmet command' },
  { actor: 'Backend', text: 'Publish a live worker update over SSE' },
  { actor: 'Backend', text: 'Respond to the helmet with per-sample results' },
  { actor: 'Helmet', text: 'Poll for the current command about every five seconds' },
  { actor: 'Helmet', text: 'Update the LED colour' },
];

export const statusPrecedence = [
  { label: 'Active emergency', className: 'badge-danger' },
  { label: 'Confirmed WARNING / CRITICAL (marked data-uncertain if the latest data is unreliable)', className: 'badge-warning' },
  { label: 'UNCERTAIN', className: 'badge-uncertain' },
  { label: 'Confirmed state', className: 'badge-safe' },
];

export const alertTypes = [
  { type: 'TRANSITION', className: 'badge-warning', text: 'Raised when a worker’s confirmed safety state changes.' },
  { type: 'EMERGENCY', className: 'badge-danger', text: 'Raised when the helmet button is pressed; resolved only through the reset handshake.' },
  { type: 'DATA_QUALITY', className: 'badge-uncertain', text: 'Raised when a non-warm-up uncertainty reason persists for 30 s; at most one per episode and one per worker every ten minutes.' },
];

export const latency = [
  { label: 'Upload interval', value: '≈5 s' },
  { label: 'Smoothing (3 of 5 votes)', value: '≈3 s' },
  { label: 'Command polling', value: 'up to 5 s' },
];
export const latencyNote =
  'Together these add roughly 13 seconds before a sustained change appears on the helmet, in addition to the 10–300 s needed to fill the feature windows. This is an analytical estimate from the implemented intervals; end-to-end latency has not yet been measured on the physical helmet.';

export const webFeatures = {
  admin: [
    'Dashboard summarising all workers, recent alerts, helmet health and site weather',
    'User accounts, helmet registration and one-to-one helmet assignment',
    'Entry of each worker’s heart-rate and body-temperature baselines',
    'Worker detail page with live sensor values, current condition guidance, seven-day history and the Safety Trend chart',
    'Alert filtering and acknowledgement, emergency monitoring and reset',
    'Daily, weekly and monthly analytics with downloadable PDF reports',
  ],
  worker: [
    'Current safety status shown first, then the latest readings',
    'Assigned helmet, own alerts and sensor history',
    'Profile and notification preferences',
    'No access to baselines or other workers’ information',
  ],
  security: [
    'Passwords stored only as bcrypt hashes',
    'JSON Web Tokens expiring after eight hours',
    'Role-based middleware; queries scoped to the authenticated user on the server',
    'UNCERTAIN shown in grey with its reason so it is never mistaken for safe',
  ],
};
