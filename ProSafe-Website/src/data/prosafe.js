/**
 * ProSafe section: problem, research gap, contribution and objectives.
 * Source: V4 thesis Chapter 1 (Sections 1.1–1.4). Citation numbers follow
 * the V4 reference list (src/data/references.js).
 */

export const prosafeIntro =
  'Construction workers face several hazards at once, and the same conditions affect each person differently. ProSafe asks whether a smart helmet can combine environmental and physiological sensing with worker-specific baselines and machine learning to recognise developing risk earlier.';

export const problems = [
  {
    icon: 'Sun',
    title: 'Changing environmental hazards',
    text: 'Heat, UV radiation, noise and airborne gases change during a shift and rarely occur alone, so their combined load can exceed any single reading.',
    cites: [14, 15, 16],
  },
  {
    icon: 'Users',
    title: 'Individual physiological differences',
    text: 'Resting heart rate can differ by about 70 bpm between people, so one fixed limit can over-warn one worker and miss strain in another.',
    cites: [37, 18],
  },
  {
    icon: 'Timer',
    title: 'Limited continuous, personal monitoring',
    text: 'Inspections are periodic, and many wearables compare isolated readings with fixed thresholds, missing sustained or developing exposure.',
    cites: [5, 18],
  },
];

export const problemContext =
  'This matters on Sri Lankan sites, where a shortage of qualified safety officers makes it hard for a small team to observe every worker.';
export const problemContextCites = [4];

export const researchGaps = [
  { title: 'Integrated assessment', text: 'Studies address environmental hazards or one physiological state, rarely both in a learned model.', cites: [29, 30, 31] },
  { title: 'Worker-specific monitoring', text: 'Helmet-based systems usually ignore personal physiological baselines.', cites: [29, 31] },
  { title: 'Temporal and cumulative exposure', text: 'Sustained exposure and trends are seldom used as classification inputs.', cites: [15, 16] },
  { title: 'Data-quality handling', text: 'Few systems explain how unreliable readings are kept from appearing normal.', cites: [41, 42] },
  { title: 'Generalization across workers', text: 'Small samples and record-wise validation can overstate performance and hide missed critical cases.', cites: [35, 36] },
];

export const contribution =
  'ProSafe’s contribution is the integration of these elements (sensing, personal baselines, temporal features, ML classification, data-quality checks and near-real-time alerts) into one working framework, and its open experimental evaluation. None of the components is new on its own, and not every gap is fully resolved.';

export const researchQuestion =
  'How can a smart helmet-based safety monitoring framework integrate environmental and physiological sensor data, worker-specific baselines, and temporal exposure patterns to classify construction worker safety risk in near real time, while accounting for unreliable sensor data and supporting timely safety alerts?';

export const objectives = {
  main: 'To design, develop and experimentally evaluate a personalized, ML-based smart helmet framework that integrates environmental and physiological measurements with worker-specific baselines and temporal exposure features for near-real-time construction worker safety monitoring and risk classification.',
  specific: [
    { title: 'Review', text: 'Critically review wearable sensing and intelligent safety monitoring to identify requirements for personalized, integrated risk assessment.' },
    { title: 'Smart helmet', text: 'Design and implement an IoT smart helmet that collects environmental and physiological measurements and transmits timestamped data.' },
    { title: 'ML pipeline', text: 'Develop an ML pipeline using worker-specific baselines, temporal features and data-quality validation to classify Safe, Warning or Critical.' },
    { title: 'Backend & web app', text: 'Develop a backend and web application that processes classifications, displays conditions, generates alerts and updates the helmet.' },
    { title: 'Evaluation', text: 'Evaluate classification performance, Critical-event detection, data handling, response time and cross-worker performance.' },
  ],
};
