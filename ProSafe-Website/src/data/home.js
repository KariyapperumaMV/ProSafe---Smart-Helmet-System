/** Home section content, condensed from Chapters 1 and 2 of the thesis. */

export const hero = {
  eyebrow: 'Final-year research · SLIIT · R26-SE-042',
  headline: 'Intelligent Safety Monitoring for Construction Workers',
  intro:
    'ProSafe is an IoT-enabled smart helmet research system that combines environmental sensing, physiological monitoring and machine learning to support personalized, near-real-time construction worker safety assessment.',
  primaryCta: { label: 'Explore Research', href: '#literature-survey' },
  secondaryCta: { label: 'View Methodology', href: '#methodology' },
};

/** Verified figures from the thesis methodology chapter. */
export const keyFacts = [
  { value: '6', label: 'sensor channels', detail: 'Four environmental and two physiological measurements' },
  { value: '1 Hz', label: 'sampling rate', detail: 'One timestamped observation per second' },
  { value: '38', label: 'engineered features', detail: 'Personalized, temporal and exposure features' },
  { value: '46,404', label: 'ML-ready observations', detail: 'From two real workers and four synthetic profiles' },
];

export const overview = {
  title: 'Project overview',
  paragraphs: [
    'Construction workers face heat, solar ultraviolet radiation, noise and airborne hazards at the same time, and the conditions around them can change several times within a single shift. Inspections and supervision remain essential, but they are periodic and depend on human observation.',
    'ProSafe places sensing on the worker. An ESP32-based helmet measures the environment around the worker together with heart rate and skin temperature. A centralized backend and machine learning service interpret these readings relative to each worker’s own physiological baseline and recent exposure history, and report the result to safety officers and back to the helmet.',
  ],
};

export const challenge = {
  title: 'The construction safety problem',
  points: [
    'Construction is consistently among the sectors with the most fatal occupational injuries, and under-reporting means the true burden may be larger than official figures show.',
    'In Sri Lanka, stakeholders report a shortage of qualified safety officers and financial limitations, which makes it hard for a small safety team to observe every worker.',
    'Many wearable systems compare each reading with a fixed limit designed for an average worker, so sustained or combined exposure can go unnoticed while generic limits raise unnecessary alerts for others.',
  ],
  cites: [2, 4, 18],
};

export const approach = {
  title: 'How ProSafe addresses it',
  points: [
    'Measures environmental and physiological conditions together, at the worker’s position, about once per second.',
    'Interprets heart rate and skin temperature as deviations from each worker’s baseline instead of a single generic limit.',
    'Represents exposure over time with rolling statistics, trends, exposure durations and a cumulative noise dose.',
    'Uses an XGBoost classifier to combine the evidence, and reports UNCERTAIN instead of SAFE when the data cannot be trusted.',
  ],
};

export const features = [
  {
    icon: 'Thermometer',
    title: 'Environmental Monitoring',
    text: 'Ambient temperature, ultraviolet radiation, combustible gas and smoke response, and approximate sound level are measured on the outer surface of the helmet.',
  },
  {
    icon: 'HeartPulse',
    title: 'Physiological Monitoring',
    text: 'An optical sensor measures heart rate and a contact sensor measures skin temperature. An unreadable channel is sent as missing rather than replaced with an artificial value.',
  },
  {
    icon: 'UserRoundCheck',
    title: 'Personalized Risk Assessment',
    text: 'Each reading is compared with the worker’s own heart-rate and body-temperature baselines, producing absolute and percentage deviations rather than one limit for everyone.',
  },
  {
    icon: 'BrainCircuit',
    title: 'Machine Learning Classification',
    text: 'A Flask ML service engineers 38 features and an XGBoost model classifies each ready observation as SAFE, WARNING or CRITICAL, with a separate data-quality gate.',
  },
  {
    icon: 'BellRing',
    title: 'Real-Time Safety Alerts',
    text: 'Confirmed state changes create alerts and notifications, dashboards update live through Server-Sent Events, and the helmet LED shows the current status.',
  },
  {
    icon: 'Siren',
    title: 'Emergency Assistance',
    text: 'A manual button lets a worker request help directly, independent of the ML model. Only an administrator reset acknowledged by the helmet ends an emergency.',
  },
];

export const workflow = [
  {
    icon: 'HardHat',
    title: 'Sense',
    text: 'The helmet records one timestamped observation per second and buffers up to 120 samples.',
  },
  {
    icon: 'Wifi',
    title: 'Transmit',
    text: 'About every five seconds, the buffered batch is uploaded over Wi-Fi as JSON to the Node.js backend.',
  },
  {
    icon: 'Cpu',
    title: 'Analyse',
    text: 'The backend resolves the worker and baselines; the ML service engineers features and checks data quality.',
  },
  {
    icon: 'BrainCircuit',
    title: 'Classify',
    text: 'XGBoost classifies ready observations; the backend applies a confidence rule and majority-vote smoothing.',
  },
  {
    icon: 'MonitorSmartphone',
    title: 'Respond',
    text: 'Dashboards update live, alerts are raised, and the helmet LED changes on its next command poll.',
  },
];

export const sensors = [
  { icon: 'ThermometerSun', label: 'Ambient temperature', part: 'DHT11', kind: 'Environmental' },
  { icon: 'Sun', label: 'UV radiation', part: 'GUVA-S12SD', kind: 'Environmental' },
  { icon: 'Flame', label: 'Gas & smoke response', part: 'MQ-2', kind: 'Environmental' },
  { icon: 'Volume2', label: 'Sound level', part: 'INMP441', kind: 'Environmental' },
  { icon: 'HeartPulse', label: 'Heart rate', part: 'MAX30102', kind: 'Physiological' },
  { icon: 'Thermometer', label: 'Skin temperature', part: 'LM35', kind: 'Physiological' },
];

export const statusLegend = [
  { state: 'SAFE', led: 'Green', className: 'badge-safe', dot: 'bg-safe', meaning: 'No persistent concern' },
  { state: 'WARNING', led: 'Amber', className: 'badge-warning', dot: 'bg-warning', meaning: 'Elevated exposure or physiological deviation' },
  { state: 'CRITICAL', led: 'Red', className: 'badge-critical', dot: 'bg-danger', meaning: 'Sustained or combined conditions that call for intervention' },
  { state: 'UNCERTAIN', led: 'Blue', className: 'badge-uncertain', dot: 'bg-info', meaning: 'Data quality is insufficient; never shown as safe' },
];

export const prototypeNotice =
  'ProSafe is a university research prototype. It is not a certified personal protective device or a medical instrument, and its readings come from low-cost, uncalibrated sensors.';
