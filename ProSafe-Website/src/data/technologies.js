/**
 * Technologies verified against the ProSafe source tree
 * (platformio.ini, ProSafe-ML-V2/requirements.txt, backend and frontend
 * package.json) and the thesis. `icon` is a simple-icons export name;
 * entries without one use a lucide icon (`lucide`) or a monogram.
 */
export const technologyGroups = [
  {
    title: 'Hardware & Embedded',
    description: 'Wearable sensing, firmware and on-helmet feedback.',
    lucide: 'Cpu',
    items: [
      { name: 'ESP32', note: 'Microcontroller with built-in Wi-Fi', icon: 'siEspressif' },
      { name: 'C++ (Arduino framework)', note: 'Helmet firmware', icon: 'siArduino' },
      { name: 'PlatformIO', note: 'Firmware build and dependency management', icon: 'siPlatformio' },
      { name: 'Sensor modules', note: 'DHT11, GUVA-S12SD, MQ-2, INMP441, MAX30102, LM35', lucide: 'Activity' },
      { name: 'Feedback components', note: 'RGB status LED and emergency push button', lucide: 'Lightbulb' },
      { name: 'ArduinoJson', note: 'JSON batch serialisation on the helmet', icon: 'siJson' },
    ],
  },
  {
    title: 'Machine Learning',
    description: 'Feature engineering, experiments and model serving.',
    lucide: 'BrainCircuit',
    items: [
      { name: 'Python', note: 'ML pipeline and experiments', icon: 'siPython' },
      { name: 'pandas', note: 'Preprocessing and feature engineering', icon: 'siPandas' },
      { name: 'NumPy', note: 'Numerical computation', icon: 'siNumpy' },
      { name: 'scikit-learn', note: 'Random Forest, SVM, Logistic Regression and evaluation', icon: 'siScikitlearn' },
      { name: 'XGBoost', note: 'Deployed gradient-boosted classifier', monogram: 'XG' },
      { name: 'joblib', note: 'Model artefact serialisation', monogram: 'jl' },
    ],
  },
  {
    title: 'Backend & ML Service',
    description: 'APIs, processing pipeline and live updates.',
    lucide: 'Server',
    items: [
      { name: 'Node.js', note: 'Backend runtime', icon: 'siNodedotjs' },
      { name: 'Express', note: 'Layered REST API', icon: 'siExpress' },
      { name: 'Flask', note: 'Python ML inference service', icon: 'siFlask' },
      { name: 'JSON Web Tokens', note: 'Authentication with role-based access', icon: 'siJsonwebtokens' },
      { name: 'bcrypt', note: 'Password hashing', lucide: 'KeyRound' },
      { name: 'Server-Sent Events', note: 'Authenticated live stream to browsers', lucide: 'Radio' },
    ],
  },
  {
    title: 'Database',
    description: 'Storage for users, samples, alerts and commands.',
    lucide: 'Database',
    items: [
      { name: 'MongoDB', note: 'Document database', icon: 'siMongodb' },
      { name: 'Mongoose', note: 'Schemas and validation', icon: 'siMongoose' },
    ],
  },
  {
    title: 'Web Application',
    description: 'Dashboards for administrators and workers.',
    lucide: 'MonitorSmartphone',
    items: [
      { name: 'React', note: 'Single-page application', icon: 'siReact' },
      { name: 'Vite', note: 'Build tooling', icon: 'siVite' },
      { name: 'React Router', note: 'Role-based routes', icon: 'siReactrouter' },
      { name: 'Axios', note: 'API requests', icon: 'siAxios' },
      { name: 'Recharts', note: 'Safety Trend and analytics charts', lucide: 'ChartLine' },
      { name: 'JavaScript', note: 'Frontend and backend language', icon: 'siJavascript' },
    ],
  },
  {
    title: 'Development & Testing',
    description: 'Version control and automated tests.',
    lucide: 'TestTubes',
    items: [
      { name: 'Git & GitHub', note: 'Version control and repository', icon: 'siGithub' },
      { name: 'Python unittest', note: 'ML service tests', icon: 'siPython' },
      { name: 'Jest & Supertest', note: 'Backend tests', icon: 'siJest' },
      { name: 'MongoDB Memory Server', note: 'In-memory database for backend tests', icon: 'siMongodb' },
      { name: 'Vitest', note: 'Frontend test runner', icon: 'siVitest' },
      { name: 'React Testing Library', note: 'Component tests', icon: 'siTestinglibrary' },
    ],
  },
];

export const integrations = [
  { name: 'Open-Meteo', note: 'Site weather shown on the dashboard', lucide: 'CloudSun' },
  { name: 'PDFKit', note: 'Downloadable analytics reports', lucide: 'FileText' },
];
