/** Home section content (source: V4 thesis abstract and Chapter 2). */

export const hero = {
  eyebrow: 'Final-year research · SLIIT · R26-SE-042',
  headline: 'Smarter Protection Through Personalized Safety Monitoring',
  intro:
    'ProSafe is an IoT-enabled smart helmet that combines environmental sensing, physiological monitoring and machine learning to assess construction workers’ safety conditions in near real time.',
  primaryCta: { label: 'Explore ProSafe', href: '#prosafe' },
  secondaryCta: { label: 'View Research Results', href: '#results' },
};

/**
 * Worker visual in the hero. No photograph of a worker wearing the
 * prototype exists, so a labelled conceptual illustration is used. To use a
 * real photograph, add it to public/images and set `src` and `kind: 'photo'`.
 */
export const workerVisual = {
  kind: 'illustration',
  src: '/images/prosafe-worker-concept.svg',
  width: 960,
  height: 720,
  alt: 'Illustration of a construction worker in a high-visibility vest wearing a white smart helmet with a green status LED, a red emergency button and sensor modules, in front of a building under construction and a tower crane.',
  heading: 'Designed for Safer Construction Environments',
  text: 'ProSafe combines wearable environmental and physiological monitoring with intelligent risk assessment to support construction workers and site safety personnel.',
  caption: {
    illustration: 'Conceptual illustration modelled on the ProSafe prototype; not a photograph of a field deployment.',
    photo: 'Photograph of the ProSafe prototype being worn.',
  },
};

export const highlights = [
  {
    icon: 'Activity',
    value: '6',
    title: 'Monitored measurements',
    text: 'Ambient temperature, UV, gas response and sound level, plus heart rate and skin temperature, about once per second.',
  },
  {
    icon: 'UserRoundCheck',
    value: '2',
    title: 'Personal baselines',
    text: 'Heart rate and skin temperature are read as deviations from each worker’s own baseline.',
  },
  {
    icon: 'BrainCircuit',
    value: '38',
    title: 'Features for ML risk classification',
    text: 'An XGBoost model classifies each reliable observation as SAFE, WARNING or CRITICAL.',
  },
  {
    icon: 'Siren',
    value: '0.69 s',
    title: 'Live monitoring and emergency help',
    text: 'Dashboards and the helmet LED update in near real time. In laboratory tests an emergency press reached the backend in 0.69 s on average.',
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

/** Helmet LED colours set by the backend (V4 Section 2.3.4). */
export const statusLegend = [
  { state: 'SAFE', led: 'Green', dot: 'bg-safe', meaning: 'No persistent concern' },
  { state: 'WARNING', led: 'Amber', dot: 'bg-warning', meaning: 'Elevated exposure or physiological deviation' },
  { state: 'CRITICAL', led: 'Red', dot: 'bg-danger', meaning: 'Sustained or combined conditions that call for intervention' },
  { state: 'UNCERTAIN', led: 'Blue', dot: 'bg-info', meaning: 'Data quality is insufficient; never shown as safe' },
];

export const prototypeNotice =
  'ProSafe is a university research prototype. It is not a certified safety device or medical instrument, has not been shown to prevent injuries, and its classifications reflect agreement with a rule-based labelling framework.';
