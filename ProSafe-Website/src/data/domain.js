/**
 * Domain content condensed from Chapter 1 of the thesis draft.
 * Citation numbers refer to src/data/references.js and were matched to the
 * bibliography by author name.
 */

export const literature = {
  intro: [
    'Construction makes a major contribution to infrastructure and economic growth, yet it remains one of the most hazardous sectors for the people who work in it. Workers operate at height, near heavy machinery and outdoors, so the conditions they face can change several times within one shift.',
    'Safety has traditionally been managed through inspections, audits, Job Safety Analysis, checklists, supervision and incident investigation. These practices remain essential, but they are periodic and depend on the attention of the people applying them. Research has therefore moved towards proactive safety management, including behaviour-based safety, computer vision, BIM-based checking and sensor-based monitoring. Most of these approaches describe the site or observable behaviour; they reveal less about how an individual worker is responding to the conditions around them.',
    'Wearable sensor devices address this by measuring conditions on, or close to, the worker. Combined with machine learning, they offer a way to interpret several measurements together rather than leaving every reading to a fixed rule or to a supervisor.',
  ],
  introCites: [[1, 2], [5, 6, 7, 8, 9, 10], [11, 12, 13]],
  topics: [
    {
      icon: 'HardHat',
      title: 'Occupational safety in construction',
      text: 'The temporary and changing nature of projects makes risk hard to control. Falls and struck-by events dominate fatal injuries, while health harms such as heat strain and hearing loss develop slowly and are rarely recorded as accidents.',
      cites: [1, 2],
    },
    {
      icon: 'MapPin',
      title: 'Construction safety in Sri Lanka',
      text: 'Management commitment is the most influential safety factor, and current challenges include poor safety attitudes, outdated legislation, a shortage of qualified safety officers and limited budgets. Outdoor work in a hot, humid climate adds heat stress.',
      cites: [3, 4, 14],
    },
    {
      icon: 'ClipboardCheck',
      title: 'Traditional safety monitoring',
      text: 'Inspections, audits and checklists establish safe methods, but hazard identification is frequently incomplete and periodic methods can miss conditions that develop between inspections.',
      cites: [5, 6, 7, 8, 9, 10],
    },
    {
      icon: 'Gauge',
      title: 'Threshold-based wearables',
      text: 'Many systems alert when one reading crosses a fixed limit. Rules are transparent and easy to verify, but a single limit ignores individual tolerance, judges each sensor alone and cannot separate a brief spike from sustained exposure.',
      cites: [18, 24, 29],
    },
    {
      icon: 'Radio',
      title: 'IoT-based wearable systems',
      text: 'Body-worn devices move with the worker and record continuously, so data reflects what that individual experiences. IoT connectivity enables remote supervision, but systems that only display readings leave interpretation to busy supervisors.',
      cites: [11, 12, 13, 19],
    },
    {
      icon: 'ShieldCheck',
      title: 'Existing smart helmets',
      text: 'Helmets are already mandatory equipment, sit close to environmental hazards and can give visual or haptic feedback. Examples include a ten-sensor connected helmet and an IoT helmet for heat and fall risk; helmet fit, however, affects physiological sensor contact.',
      cites: [27, 28, 30],
    },
    {
      icon: 'BrainCircuit',
      title: 'Machine learning in occupational safety',
      text: 'ML has classified stress, fatigue, heat strain and environmental risk from wearable data, often with high accuracy. Most studies address one type of strain, use proxy labels and evaluate on small groups, so class-wise metrics and unseen-worker testing matter.',
      cites: [22, 23, 30, 31],
    },
    {
      icon: 'HeartPulse',
      title: 'Physiological monitoring',
      text: 'Heart rate reflects both workload and the effort of losing heat; skin temperature alone is a weak indicator of heat strain but is more informative together with heart rate. A wearable reading indicates possible strain, not a diagnosis.',
      cites: [17, 18, 20, 21],
    },
    {
      icon: 'Sun',
      title: 'Environmental hazard monitoring',
      text: 'Heat, solar UV, noise and airborne gases rarely occur alone. A worker doing heavy tasks in sunlight experiences several loads at once, so the combined burden can exceed what any single measurement suggests.',
      cites: [11, 14, 15, 16],
    },
    {
      icon: 'UserRoundCheck',
      title: 'Worker-specific baselines',
      text: 'Resting heart rate can differ by about 70 bpm between individuals while staying stable within a person (Quer et al.). Expressing readings as deviations from a personal baseline, and individualized models, can improve interpretation.',
      cites: [17, 21, 29, 31],
    },
    {
      icon: 'Timer',
      title: 'Temporal exposure',
      text: 'Harm depends on duration as well as intensity. Rolling averages, trends, exposure durations and cumulative doses help distinguish a developing or prolonged condition from a momentary change.',
      cites: [15, 16, 18],
    },
    {
      icon: 'Activity',
      title: 'Data quality and reliability',
      text: 'Optical heart-rate error rises during activity, and poor contact, missing readings and transmission gaps produce plausible but wrong values. Withholding a decision when evidence is insufficient (Chow) is safer than reporting it as normal.',
      cites: [20],
    },
  ],
  evolution: [
    {
      stage: 'Single-parameter devices',
      text: 'Measure one variable such as heart rate. Simple, but one value cannot show whether a change comes from workload, heat or measurement error.',
      cites: [20],
    },
    {
      stage: 'Multi-parameter systems',
      text: 'Combine several sensors for a broader picture, although interpretation is often left to fixed rules or to supervisors.',
      cites: [28, 29],
    },
    {
      stage: 'AI and ML-based systems',
      text: 'Classify conditions from multiple inputs; some studies have begun to examine individualized models.',
      cites: [21, 30, 31],
    },
  ],
  synthesis:
    'These strands have mostly been studied separately. Comparatively few studies combine environmental and physiological measurements, worker-specific deviations, temporal exposure features, ML classification and explicit data-quality handling in one near-real-time system, and evaluate it on data from workers not used for training.',
};

/** Table 1.1 of the thesis: comparison of selected studies. */
export const comparisonStudies = [
  { study: 'Hwang et al., 2016', ref: 20, approach: 'Wristband PPG heart rate compared with an ECG reference on seven field workers', limitation: 'Single physiological parameter; accuracy fell during heavy work because of motion artefacts' },
  { study: 'Jebelli et al., 2019', ref: 23, approach: 'Wearable biosensor signals from ten field workers; supervised learning of stress levels', limitation: 'One dimension of worker state (stress); environmental conditions not used as inputs' },
  { study: 'Shakerian et al., 2021', ref: 31, approach: 'Wristband physiological signals from 18 participants under three environmental conditions', limitation: 'Heat strain only; predetermined conditions and a small group leave field generalization open' },
  { study: 'Umer et al., 2020', ref: 21, approach: 'Cardiorespiratory and thermoregulatory measures from ten participants; ML models of exertion', limitation: 'Controlled manual-handling tasks; environmental hazards not modelled' },
  { study: 'Pancardo et al., 2015', ref: 29, approach: 'Heart rate, movement, air temperature and humidity with personal resting and maximum heart rate, ISO 7243 tables', limitation: 'Final decision relied on standard limit tables, not validated against physiological outcomes' },
  { study: 'Aliyev et al., 2020', ref: 28, approach: 'Ten-sensor smart helmet with visual and haptic feedback, smartphone app and central server', limitation: 'ML-based risk classification and worker-specific interpretation not described' },
  { study: 'Campero-Jurado et al., 2020', ref: 30, approach: 'Helmet workplace sensors and a deep CNN; 92.05% cross-validated accuracy on 11,755 samples', limitation: 'Scenario-based evaluation; performance for unseen workers in ordinary site conditions not established' },
  { study: 'ProSafe (this research)', ref: null, approach: 'Helmet measuring six channels about once per second; 38 engineered features, XGBoost classifier and a separate data-quality gate', limitation: 'Few real workers, weak recognition of Critical-labelled observations and uncalibrated sensors; advantages over earlier work are not yet proven', highlight: true },
];

export const researchGaps = [
  {
    title: 'Limited integration of environmental and physiological monitoring',
    text: 'Most studies focus on environmental conditions or on one physiological state such as stress, exertion or heat strain. Where both are combined, the combination is usually made through standard limit tables rather than a learned model that considers several hazards at once.',
    cites: [21, 23, 29, 30, 31],
    response: 'Six environmental and physiological channels feed one classifier.',
  },
  {
    title: 'Insufficient use of worker-specific physiological baselines',
    text: 'Physiological responses vary considerably between people, and individualized models can outperform pooled ones, yet smart helmet studies generally interpret readings without personal baselines. How baseline-relative deviations behave alongside environmental and temporal features remains underexplored.',
    cites: [21, 28, 30],
    response: 'Four baseline-relative deviation features per observation.',
  },
  {
    title: 'Limited consideration of temporal and cumulative exposure',
    text: 'Exposure duration and cumulative exposure are known to matter, but many wearable classification studies describe conditions within short windows and do not represent sustained exposure, trends or a daily noise dose as explicit inputs.',
    cites: [15, 16],
    response: 'Rolling statistics, trends, 12 exposure counters and a NIOSH-style noise dose.',
  },
  {
    title: 'Insufficient handling of unreliable sensor data',
    text: 'Wearable measurements suffer from motion artefacts, poor contact and missing values. Withholding a decision is an established principle, but reviewed safety classifiers rarely describe a mechanism that prevents unreliable data from being reported as a normal condition.',
    cites: [20],
    response: 'A streaming data-quality gate reports UNCERTAIN instead of SAFE.',
  },
  {
    title: 'Real-world evaluation and generalization across workers',
    text: 'Small participant groups, controlled tasks and record-wise validation can overstate performance, and overall accuracy can hide weak recognition of rare critical conditions. Evaluation on unseen workers with class-wise metrics is needed for a realistic picture.',
    cites: [21, 23, 31],
    response: 'Cross-worker experiments with class-wise metrics; still limited to two real workers.',
  },
];

export const gapResponse =
  'The contribution of ProSafe is the design, integration and experimental evaluation of one smart helmet framework that combines these elements: environmental and physiological sensing, worker-specific deviations, temporal and cumulative exposure features, ML-based risk classification, explicit data-quality handling and near-real-time alerting. None of the components is claimed to be new in isolation. The contribution lies in their integration within one working system and in an honest evaluation of how it performs, including its limitations.';

export const researchProblem = {
  context: [
    'Construction sites change continuously as work progresses, the weather varies and workers move between tasks. Inspections and supervision provide essential control, but they are periodic and depend on human observation. Sensor-based alarms provide continuous measurement, yet they typically compare isolated readings with fixed limits designed for an average worker. A worker who is gradually becoming strained, or who has been exposed to moderate heat, UV or noise for a long period, may not be recognized until the condition becomes obvious, which matters on Sri Lankan sites where qualified safety officers are scarce.',
  ],
  contextCites: [4, 5, 6, 18],
  difficulties: [
    { icon: 'Users', title: 'Individual differences', text: 'The same heart rate or skin temperature can mean different things for different workers.' },
    { icon: 'Layers', title: 'Simultaneous hazards', text: 'Several hazards act together, and their combined effect is missed when each sensor is judged alone.' },
    { icon: 'Timer', title: 'Time dependence', text: 'Sustained and cumulative exposure can matter as much as momentary levels.' },
    { icon: 'WifiOff', title: 'Unreliable data', text: 'Motion artefacts, poor contact and missing data can produce confident but misleading assessments.' },
  ],
  consequences:
    'If these difficulties are not addressed, developing hazards may be recognized late, generic limits may raise unnecessary warnings for some workers while missing abnormal responses in others, and alerts that change frequently or cannot be explained may eventually be ignored. Models judged only on overall accuracy may appear reliable while failing to detect rare critical conditions.',
  statement:
    'The research problem is the absence of a validated, integrated approach that combines environmental and physiological measurements, worker-specific baselines, temporal exposure patterns and explicit data-quality handling to classify construction worker safety risk in near real time.',
  question:
    'How can a smart helmet-based safety monitoring framework integrate environmental and physiological sensor data, worker-specific baselines, and temporal exposure patterns to classify construction worker safety risk in near real time, while accounting for unreliable sensor data and supporting timely safety alerts?',
};

export const objectives = {
  main: 'To design, develop and experimentally evaluate a personalized, ML-based smart helmet framework that integrates environmental and physiological measurements with worker-specific baselines and temporal exposure features for near-real-time construction worker safety monitoring and risk classification.',
  specific: [
    {
      icon: 'BookOpen',
      title: 'Review',
      text: 'To critically review wearable sensing and intelligent construction safety monitoring approaches and identify the requirements for personalized, integrated risk assessment.',
    },
    {
      icon: 'HardHat',
      title: 'Smart helmet',
      text: 'To design and implement an IoT-enabled smart helmet that collects environmental and physiological measurements and transmits timestamped data for centralized monitoring.',
    },
    {
      icon: 'BrainCircuit',
      title: 'ML pipeline',
      text: 'To develop an ML pipeline that uses worker-specific baselines, temporal features and data-quality validation to classify worker conditions as Safe, Warning or Critical.',
    },
    {
      icon: 'MonitorSmartphone',
      title: 'Backend and web application',
      text: 'To develop a backend and web application that processes classifications, displays worker conditions, generates alerts and communicates safety status to the helmet.',
    },
    {
      icon: 'FlaskConical',
      title: 'Evaluation',
      text: 'To evaluate the ML and system components for classification performance, Critical-event detection, data-handling reliability, response time and cross-worker performance.',
    },
  ],
};
