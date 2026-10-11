/**
 * Research documents and presentation slides.
 *
 * Available files live in public/documents and public/presentations.
 * To publish a new file later:
 *   1. copy the PDF into the matching public folder,
 *   2. set `file` to its public path and `status` to 'available',
 *   3. update `size` (the test suite checks it against the real file).
 * Items without a file are shown as "Not yet available" with no link.
 */

export const documentNote =
  'Earlier documents record the project as it developed. The Topic Assessment Form and proposal describe an initial design with two ML models and a risk-fusion layer, and the progress presentations report an earlier model evaluated on a random 80/20 split. The final implementation uses a single XGBoost classifier with a separate data-quality gate, evaluated on unseen workers, as described in the thesis.';

export const documents = [
  {
    id: 'taf',
    title: 'Topic Assessment Form (TAF)',
    category: 'Project Charter',
    description: 'Charter-stage form defining the research topic, problem, existing research, proposed solution, objectives and novelty.',
    date: null,
    status: 'available',
    file: '/documents/prosafe-topic-assessment-form.pdf',
    size: '1.0 MB',
    pages: 13,
  },
  {
    id: 'proposal-report',
    title: 'Project Proposal Report',
    category: 'Proposal',
    description: 'Research problem, literature survey, objectives, methodology, requirements, budget, work breakdown structure and Gantt chart.',
    date: 'March 2026',
    status: 'available',
    file: '/documents/prosafe-project-proposal.pdf',
    size: '1.2 MB',
    pages: 36,
  },
  {
    id: 'checklist-1',
    title: 'Checklist 1 – Git Repository',
    category: 'Checklist',
    description: 'Checklist submission recording the project details, supervisor and the project Git repository.',
    date: null,
    status: 'available',
    file: '/documents/prosafe-checklist-1-git-repository.pdf',
    size: '88 KB',
    pages: 1,
  },
  {
    id: 'checklists-further',
    title: 'Further Checklist Documents',
    category: 'Checklist',
    description: 'Additional checklist submissions will be added here when they are released.',
    date: null,
    status: 'pending',
    file: null,
  },
  {
    id: 'progress-reports',
    title: 'Progress / Status Reports',
    category: 'Progress Report',
    description: 'Progress and status documents for the assessment stages will be added here when they are released.',
    date: null,
    status: 'pending',
    file: null,
  },
  {
    id: 'thesis',
    title: 'Final Dissertation',
    category: 'Thesis',
    description: 'Machine Learning-Based Smart Helmet for Personalized Construction Monitoring: the complete thesis, including results and conclusions.',
    date: null,
    status: 'in-preparation',
    file: null,
  },
];

export const presentations = [
  {
    id: 'proposal-presentation',
    title: 'Proposal Presentation',
    description: 'Research problem, existing solutions, proposed solution, novelty, objectives, investment, work breakdown and Gantt chart.',
    date: null,
    status: 'available',
    file: '/presentations/prosafe-proposal-presentation.pdf',
    size: '1.8 MB',
    slides: 15,
    note: 'PDF export of the original slides; an embedded video is not included.',
  },
  {
    id: 'pp1',
    title: 'Progress Presentation 1',
    description: 'Problem and impact, novelty and user personas, solution architecture, helmet design and sensors, baseline comparison, an early ML model and the web application prototype.',
    date: '12 May 2026',
    status: 'available',
    file: '/presentations/prosafe-progress-presentation-1.pdf',
    size: '2.0 MB',
    slides: 17,
  },
  {
    id: 'pp2',
    title: 'Progress Presentation 2',
    description: 'Existing solutions, architecture, technologies, ethics, limitations and commercialization, with a demonstration of the helmet, ML models, web application and automated testing.',
    date: '1 September 2026',
    status: 'available',
    file: '/presentations/prosafe-progress-presentation-2.pdf',
    size: '2.2 MB',
    slides: 22,
  },
  {
    id: 'final-presentation',
    title: 'Final Presentation',
    description: 'Final presentation of the completed research, evaluation results and conclusions.',
    date: null,
    status: 'pending',
    file: null,
  },
];

export const availability = {
  available: { label: 'Available', className: 'badge-safe' },
  pending: { label: 'Not yet available', className: 'badge-neutral' },
  'in-preparation': { label: 'In preparation', className: 'badge-warning' },
};

export const allFiles = [...documents, ...presentations];
