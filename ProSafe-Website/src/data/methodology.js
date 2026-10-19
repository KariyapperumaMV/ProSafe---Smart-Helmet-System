/** Methodology content condensed from Chapter 2 of the V4 thesis. */

export const methodologyIntro =
  'ProSafe followed Design Science Research: build an artefact that addresses the research problem, then measure how well it performs. Development was iterative, each component was tested before integration, and models were always evaluated on a worker who was not used for training.';
export const methodologyCites = [44, 45];

/**
 * Figure 2.1 (eleven stages) grouped into eight steps for readability. The
 * order of the underlying stages is unchanged.
 */
export const processSteps = [
  { id: 'problem', title: 'Problem identification', stages: [1], text: 'A literature review established the research problem, gap and objectives.' },
  { id: 'requirements', title: 'Requirements', stages: [2], text: 'Functional and non-functional requirements came from the gap analysis and the needs of administrators and workers.' },
  { id: 'design', title: 'System design', stages: [3], text: 'A five-component architecture communicating over HTTP with JSON, with live browser updates through Server-Sent Events.' },
  { id: 'hardware', title: 'Hardware development', stages: [4, 5], text: 'The ESP32 helmet and firmware were built, then verified in the laboratory before any data was collected.' },
  { id: 'data', title: 'Data preparation', stages: [6], text: 'Three real workers were recorded and four synthetic profiles generated, then cleaned, labelled and turned into features.' },
  { id: 'ml', title: 'ML development', stages: [7], text: 'Four algorithms were compared in eight training and evaluation configurations, and XGBoost was selected.' },
  { id: 'integration', title: 'Integration', stages: [8, 9], text: 'The backend and web application were developed and connected to the helmet and ML service in one pipeline.' },
  { id: 'evaluation', title: 'Testing & evaluation', stages: [10, 11], text: 'Laboratory, automated, integration and user acceptance evaluation, followed by a commercial feasibility assessment.' },
];

/** Figure 2.2: five components. The backend is the only client of the ML service. */
export const architecture = {
  components: [
    {
      id: 'helmet',
      icon: 'HardHat',
      name: 'ESP32 Smart Helmet',
      tech: 'C++ · Arduino · PlatformIO',
      summary: 'Collects and transmits sensor observations and shows the status it receives.',
      duties: ['Reads six channels once per second', 'Buffers up to 120 samples and uploads about every 5 s', 'Polls its LED command about every 5 s', 'Sends manual emergency messages'],
    },
    {
      id: 'backend',
      icon: 'Server',
      name: 'Node.js & Express Backend',
      tech: 'REST · JWT · SSE',
      summary: 'Coordinates the pipeline: stores data, calls the ML service, raises alerts and updates the helmet.',
      duties: ['Validates batches and identifies the worker', 'Retrieves baselines and calls the ML service', 'Applies confidence and smoothing rules', 'Creates alerts, notifications and LED commands'],
    },
    {
      id: 'ml',
      icon: 'BrainCircuit',
      name: 'Python Flask ML Service',
      tech: 'pandas · scikit-learn · XGBoost',
      summary: 'Preprocesses readings, engineers features, checks data quality and runs XGBoost inference.',
      duties: ['Streaming preprocessing per worker session', 'Builds the 38 EXTENDED features', 'Data-quality gate: READY or UNCERTAIN', 'Returns a class and three probabilities'],
    },
    {
      id: 'db',
      icon: 'Database',
      name: 'MongoDB',
      tech: 'Mongoose schemas',
      summary: 'Stores users, helmets, one document per observation, alerts and helmet commands.',
      duties: ['About 3,600 documents per worker per hour', 'Raw readings kept unchanged for auditing', 'Indexed by worker and timestamp'],
    },
    {
      id: 'web',
      icon: 'MonitorSmartphone',
      name: 'React Web Application',
      tech: 'React · Vite · Recharts',
      summary: 'Lets administrators and workers monitor safety status, alerts and history.',
      duties: ['Administrator dashboard and management', 'Worker dashboard with own status first', 'Live updates over an authenticated SSE stream', 'Never calls the ML service directly'],
    },
  ],
  links: [
    { from: 'helmet', to: 'backend', label: 'Sensor batches · emergency · command polling' },
    { from: 'backend', to: 'ml', label: 'Readings + baselines → class and probabilities' },
    { from: 'backend', to: 'db', label: 'Samples, state, alerts, commands' },
    { from: 'backend', to: 'web', label: 'REST API and live SSE updates' },
  ],
};

/** The eight stages of the ML methodology (Sections 2.4, 2.5, 2.6 and 2.9). */
export const pipelineStages = [
  { id: 'collection', title: 'Data collection', icon: 'Radio' },
  { id: 'preparation', title: 'Data preparation', icon: 'ListChecks' },
  { id: 'personalization', title: 'Personalization', icon: 'UserRoundCheck' },
  { id: 'temporal', title: 'Temporal features', icon: 'Timer' },
  { id: 'features', title: 'Feature engineering', icon: 'Layers' },
  { id: 'quality', title: 'Data-quality gate', icon: 'ShieldCheck' },
  { id: 'classification', title: 'ML classification', icon: 'BrainCircuit' },
  { id: 'response', title: 'Safety response', icon: 'BellRing' },
];

/** Table 2.3. Real-worker profiles and baselines are not published here. */
export const datasets = {
  real: [
    { id: 'W_001', raw: 14400, ready: 14015 },
    { id: 'W_002', raw: 14400, ready: 13825 },
    { id: 'W_003', raw: 14400, ready: 14036 },
  ],
  synthetic: [
    { id: 'S_001', raw: 5000, ready: 4559 },
    { id: 'S_002', raw: 5000, ready: 4668 },
    { id: 'S_003', raw: 5000, ready: 4706 },
    { id: 'S_004', raw: 5000, ready: 4631 },
  ],
  totals: { raw: 63200, ready: 60440, uncertain: 2760 },
};

export const preparationSteps = [
  'Validated columns and timestamps, ordered readings and checked for duplicates (none found).',
  'Conservative cleaning: only short spikes, frozen values and contact problems were flagged; high values were never removed for being high.',
  'Gaps over 60 s start a new session; only short gaps were interpolated, never across sessions.',
  'An expanded audit dataset (117 columns) keeps every row; the ML-ready dataset (41 columns) keeps labelled rows only.',
  'Labels come from a rule-informed reference framework (proxy ground truth), frozen with a checksum before W_002 was processed.',
];

export const baselineExample = { baseline: 80, reading: 100, min: 60, max: 150 };

export const temporalFeatures = [
  { title: 'Rolling statistics', text: 'Mean and variability over 30, 60 or 300 s windows.' },
  { title: 'Trends', text: 'Rate of change per minute, robust to single spikes.' },
  { title: 'Exposure durations', text: 'Consecutive seconds above warning or critical reference levels.' },
  { title: 'Noise dose', text: 'Approximate daily dose (NIOSH: 85 dB over 8 h, 3 dB exchange).' },
];

/** Figure 2.6: nested feature configurations. */
export const featureSets = [
  { name: 'BASIC_PERSONALIZED', count: 11, adds: '6 current values · 4 personalized deviations · gas ratio' },
  { name: 'TEMPORAL_PERSONALIZED', count: 26, adds: '+ 8 rolling statistics · 6 trends · noise dose' },
  { name: 'EXTENDED', count: 38, adds: '+ 12 exposure-duration counters', deployed: true },
];

export const uncertainReasons = [
  'Sensor warm-up or too little history for the feature windows',
  'Missing readings or unreliable skin contact',
  'Unstable heart rate',
  'No baseline available for the worker',
  'Timestamp gaps or packet loss',
  'ML service unavailable or low confidence (below 0.70)',
];

export const algorithms = ['Random Forest', 'XGBoost', 'Support Vector Machine', 'Logistic Regression'];

export const selectionRule =
  'Each algorithm had the same search budget (12 configurations × 3 feature sets). Candidates were compared on training-side validation only: within 0.01 of the best accuracy, the highest macro F1 won, then balanced accuracy, CRITICAL recall and fewest CRITICAL-to-SAFE errors as tie-breakers.';

export const responseSteps = [
  { title: 'Confidence rule', text: 'A prediction below 0.70 probability is stored but reported as UNCERTAIN.' },
  { title: 'Smoothing', text: 'A majority vote over the last five predictions; a state change needs three of five votes.' },
  { title: 'Alerts & dashboards', text: 'Confirmed changes create alerts; dashboards update live over SSE.' },
  { title: 'Helmet feedback', text: 'The backend sets the LED command, which the helmet picks up on its next poll.' },
];

export const emergencyNote =
  'EMERGENCY is not an ML class. The helmet button triggers a separate workflow that takes precedence over any predicted state and ends only after an administrator reset is acknowledged by the helmet.';

export const latencyNote =
  'Near real time, not instant: beyond the 10–300 s needed to fill feature windows, uploads, smoothing and polling can add roughly 13 s before a sustained change reaches the LED.';
