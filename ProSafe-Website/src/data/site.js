/**
 * Site-wide facts. Every value here is taken from the thesis draft,
 * the Topic Assessment Form (TAF) or the proposal document.
 * Fields set to null are not yet verified and are rendered as
 * "To be confirmed" or hidden. Update them here when they become available.
 */

export const site = {
  name: 'ProSafe',
  tagline: 'Protect. Monitor. Prevent.',
  researchTitle: 'Machine Learning-Based Smart Helmet for Personalized Construction Monitoring',
  projectId: 'R26-SE-042',
  module: 'IT4010 Research Project',
  academicYear: '2026',
  researchGroup: 'SST – Software Systems & Technologies',
  specialization: 'Software Engineering',
  institution: 'Sri Lanka Institute of Information Technology (SLIIT)',
  institutionShort: 'SLIIT',
  department: 'Department of Information Technology',
  projectType: 'Individual final-year research project',
  repositoryUrl: 'https://github.com/KariyapperumaMV/ProSafe---Smart-Helmet-System',
};

/**
 * Top-level navigation. `children` become dropdown entries on desktop and
 * indented links on mobile. Resource children select a tab in the
 * Resources section (see `resourceTabs` below).
 */
export const navItems = [
  { id: 'home', label: 'Home' },
  {
    id: 'prosafe',
    label: 'ProSafe',
    children: [
      { id: 'problem', label: 'The Problem' },
      { id: 'research-gap', label: 'Research Gap' },
      { id: 'research-objectives', label: 'Objectives' },
      { id: 'helmet', label: '3D Smart Helmet' },
    ],
  },
  {
    id: 'methodology',
    label: 'Methodology',
    children: [
      { id: 'research-process', label: 'Research Process' },
      { id: 'architecture', label: 'System Architecture' },
      { id: 'platform', label: 'Web Application' },
      { id: 'ml-pipeline', label: 'ML Pipeline' },
      { id: 'technologies', label: 'Technologies' },
      { id: 'in-action', label: 'Videos' },
    ],
  },
  {
    id: 'results',
    label: 'Results',
    children: [
      { id: 'ml-results', label: 'ML Results' },
      { id: 'lab-results', label: 'Laboratory Tests' },
      { id: 'testing-results', label: 'Software Testing' },
      { id: 'user-results', label: 'User Acceptance' },
      { id: 'findings', label: 'Findings & Limitations' },
    ],
  },
  {
    id: 'resources',
    label: 'Resources',
    children: [
      { id: 'milestones', label: 'Milestones' },
      { id: 'documents', label: 'Documents' },
      { id: 'presentations', label: 'Presentations' },
    ],
  },
  { id: 'about', label: 'About & Contact' },
];

/** Ids that select a Resources tab rather than an element on the page. */
export const resourceTabs = ['milestones', 'documents', 'presentations'];

/**
 * Anchors used by the previous version of the site, mapped to their new
 * location so links that were already shared keep working.
 */
export const legacyAnchors = {
  domain: 'prosafe',
  'literature-survey': 'prosafe',
  'research-problem': 'problem',
  'methodology-process': 'research-process',
  'methodology-architecture': 'architecture',
  'methodology-hardware': 'helmet',
  'methodology-data': 'ml-pipeline',
  'methodology-ml': 'ml-pipeline',
  'methodology-realtime': 'ml-pipeline',
  'methodology-tabs': 'methodology',
  overview: 'home',
};

export const researcher = {
  name: 'Methya Vosadi Kariyapperuma',
  shortName: 'Kariyapperuma M. V.',
  initials: 'MK',
  studentId: 'IT21200892',
  role: 'Researcher',
  degree: 'BSc (Hons) in Information Technology',
  specialization: 'Software Engineering',
  department: 'Department of Information Technology',
  institution: 'Sri Lanka Institute of Information Technology (SLIIT)',
  // No authorised photograph has been supplied. Add a file to public/images
  // and set its path here (e.g. '/images/researcher.webp') to display it.
  photo: null,
  responsibilities: [
    'Smart helmet hardware and ESP32 firmware',
    'Dataset preparation, labelling framework and feature engineering',
    'Machine learning experiments and model deployment',
    'Node.js backend, MongoDB data model and React web application',
    'System integration, testing and documentation',
  ],
};

export const supervisors = [
  {
    role: 'Supervisor',
    name: 'Dr. Kalpani Manuthunga',
    affiliation: 'Sri Lanka Institute of Information Technology',
    initials: 'KM',
  },
  {
    role: 'Co-supervisor',
    name: 'Ms. Poojani Gunathilake',
    affiliation: 'Sri Lanka Institute of Information Technology',
    initials: 'PG',
  },
];

export const contact = {
  // No contact email has been confirmed for public use. When one is
  // confirmed, set it here and the mailto links will appear automatically.
  email: null,
  githubProfile: 'https://github.com/KariyapperumaMV',
  repository: site.repositoryUrl,
  linkedIn: null,
  location: 'Sri Lanka Institute of Information Technology, Sri Lanka',
  // Netlify Forms form name; must match the hidden form in index.html.
  formName: 'contact',
  emailTemplate: {
    subject: 'ProSafe research enquiry – [your topic]',
    body: [
      'Dear Methya,',
      '',
      'I am [your name], [your role] at [your organisation].',
      'I am writing about the ProSafe research project (R26-SE-042) regarding [topic].',
      '',
      '[Your question or message]',
      '',
      'Kind regards,',
      '[Your name]',
      '[Your contact details]',
    ].join('\n'),
  },
};
