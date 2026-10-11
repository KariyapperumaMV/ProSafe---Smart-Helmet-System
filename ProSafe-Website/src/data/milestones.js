/**
 * Assessment milestones.
 *
 * Verified dates:
 *  - Proposal report: dated March 2026 on its cover page.
 *  - Progress Presentation 1: 12/05/2026 in the slide footer.
 *  - Progress Presentation 2: 01/09/2026 in the slide footer.
 *  - Dissertation: cover page of the draft is dated October 2026.
 * Marks were not available in any supplied material. Set `marks` (e.g. '6%')
 * and `date` when they are confirmed; null renders as "To be confirmed".
 *
 * status: 'completed' | 'in-progress' | 'upcoming'
 * links: ids from src/data/documents.js
 */
export const milestones = [
  {
    id: 'taf',
    title: 'Topic Assessment',
    shortTitle: 'TAF',
    date: null,
    dateNote: 'Submission date to be confirmed',
    marks: null,
    status: 'completed',
    description:
      'Topic Assessment Form (TAF) defining the research topic, problem, existing work, proposed solution, objectives and novelty, and naming the supervisor and co-supervisor.',
    deliverables: ['Topic Assessment Form'],
    links: ['taf'],
  },
  {
    id: 'proposal',
    title: 'Project Proposal',
    shortTitle: 'Proposal',
    date: 'March 2026',
    dateNote: 'Proposal report date; presentation date to be confirmed',
    marks: null,
    status: 'completed',
    description:
      'Proposal report and presentation covering the research problem, literature, objectives, methodology, requirements, budget, work breakdown structure and Gantt chart.',
    deliverables: ['Proposal report', 'Proposal presentation'],
    links: ['proposal-report', 'proposal-presentation'],
  },
  {
    id: 'pp1',
    title: 'Progress Presentation 1',
    shortTitle: 'PP1',
    date: '12 May 2026',
    marks: null,
    status: 'completed',
    description:
      'First progress review covering the helmet hardware design and sensor selection, the baseline comparison approach, an early ML model and the web application prototype, together with Checklist 1 (Git repository).',
    deliverables: ['Presentation slides', 'Checklist 1 – Git repository'],
    links: ['pp1', 'checklist-1'],
  },
  {
    id: 'pp2',
    title: 'Progress Presentation 2',
    shortTitle: 'PP2',
    date: '1 September 2026',
    marks: null,
    status: 'completed',
    description:
      'Second progress review with a demonstration of the helmet, ML models, web application and automated testing, together with the technologies, limitations and commercialization plan.',
    deliverables: ['Presentation slides'],
    links: ['pp2'],
  },
  {
    id: 'dissertation',
    title: 'Final Dissertation',
    shortTitle: 'Thesis',
    date: null,
    dateNote: 'Draft dated October 2026; submission date to be confirmed',
    marks: null,
    status: 'in-progress',
    description:
      'Final thesis presenting the literature, methodology, implementation, evaluation, results and conclusions of the research. Chapters 1 and 2 are drafted; results and conclusions are in preparation.',
    deliverables: ['Final dissertation'],
    links: ['thesis'],
  },
  {
    id: 'website',
    title: 'Research Website',
    shortTitle: 'Website',
    date: null,
    marks: null,
    status: 'in-progress',
    description:
      'This public research website presenting the domain, milestones, documents, presentations and researcher details, following the SLIIT website guidelines.',
    deliverables: ['Research website'],
    links: [],
  },
  {
    id: 'final',
    title: 'Final Assessment',
    shortTitle: 'Final',
    date: null,
    marks: null,
    status: 'upcoming',
    description:
      'Final presentation and demonstration of the completed system and research outcomes.',
    deliverables: ['Final presentation'],
    links: ['final-presentation'],
  },
  {
    id: 'viva',
    title: 'Viva',
    shortTitle: 'Viva',
    date: null,
    marks: null,
    status: 'upcoming',
    description:
      'Individual oral examination assessing the researcher’s understanding of, and contribution to, the project.',
    deliverables: [],
    links: [],
  },
];

export const milestoneStatus = {
  completed: { label: 'Completed', className: 'badge-safe' },
  'in-progress': { label: 'In progress', className: 'badge-warning' },
  upcoming: { label: 'Upcoming', className: 'badge-neutral' },
};
