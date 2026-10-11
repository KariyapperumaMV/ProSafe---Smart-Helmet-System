import { useId, useMemo, useState } from 'react';
import { Award, CalendarDays, CircleCheck, CircleDashed, Clock, Eye, FileText, Hourglass } from 'lucide-react';
import { milestones, milestoneStatus } from '../../data/milestones.js';
import { allFiles, availability } from '../../data/documents.js';
import { Section, SectionHeader } from '../../components/ui/Section.jsx';
import { Reveal } from '../../components/ui/Reveal.jsx';

const statusIcon = { completed: CircleCheck, 'in-progress': Hourglass, upcoming: CircleDashed };
const filesById = Object.fromEntries(allFiles.map((f) => [f.id, f]));
const TBC = 'To be confirmed';

function defaultMilestone() {
  const completed = milestones.filter((m) => m.status === 'completed');
  return (completed[completed.length - 1] ?? milestones[0]).id;
}

function MilestoneDetail({ milestone }) {
  const status = milestoneStatus[milestone.status];
  const StatusIcon = statusIcon[milestone.status];
  const related = milestone.links.map((id) => filesById[id]).filter(Boolean);

  return (
    <article className="card h-full p-6 sm:p-8" aria-labelledby={`milestone-${milestone.id}-title`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-brand">{milestone.shortTitle}</p>
          <h3 id={`milestone-${milestone.id}-title`} className="mt-1 text-[1.6rem] font-bold">{milestone.title}</h3>
        </div>
        <span className={`badge ${status.className}`}>
          <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {status.label}
        </span>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="card-raised p-4">
          <dt className="flex items-center gap-2 text-[0.78rem] font-semibold uppercase tracking-wider text-muted">
            <CalendarDays className="h-4 w-4 text-cyan" aria-hidden="true" /> Date
          </dt>
          <dd className={`mt-1.5 font-semibold ${milestone.date ? 'text-ink' : 'text-muted'}`}>{milestone.date ?? TBC}</dd>
          {milestone.dateNote && <dd className="mt-1 text-[0.78rem] text-muted">{milestone.dateNote}</dd>}
        </div>
        <div className="card-raised p-4">
          <dt className="flex items-center gap-2 text-[0.78rem] font-semibold uppercase tracking-wider text-muted">
            <Award className="h-4 w-4 text-warning" aria-hidden="true" /> Marks allocated
          </dt>
          <dd className={`mt-1.5 font-semibold ${milestone.marks ? 'text-ink' : 'text-muted'}`}>{milestone.marks ?? TBC}</dd>
        </div>
      </dl>

      <p className="body-text mt-6">{milestone.description}</p>

      {milestone.deliverables.length > 0 && (
        <div className="mt-6">
          <h4 className="text-[0.76rem] font-bold uppercase tracking-[0.14em] text-muted">Deliverables</h4>
          <ul className="mt-3 flex flex-wrap gap-2">
            {milestone.deliverables.map((d) => (
              <li key={d} className="badge badge-neutral normal-case tracking-normal">{d}</li>
            ))}
          </ul>
        </div>
      )}

      {related.length > 0 && (
        <div className="mt-6 border-t border-line/10 pt-5">
          <h4 className="text-[0.76rem] font-bold uppercase tracking-[0.14em] text-muted">Related files</h4>
          <ul className="mt-3 space-y-2">
            {related.map((file) => (
              <li key={file.id} className="card-raised flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="flex min-w-0 items-center gap-2.5 text-[0.9rem] font-medium text-ink">
                  <FileText className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  {file.title}
                </span>
                {file.status === 'available' && file.file ? (
                  <a href={file.file} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                    <Eye className="h-4 w-4" aria-hidden="true" /> View PDF
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : (
                  <span className={`badge ${availability[file.status].className}`}>
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    {availability[file.status].label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

export function MilestonesSection() {
  const [selectedId, setSelectedId] = useState(defaultMilestone);
  const selected = useMemo(() => milestones.find((m) => m.id === selectedId) ?? milestones[0], [selectedId]);
  const selectId = useId();

  return (
    <Section id="milestones" labelledBy="milestones-title">
      <SectionHeader
        id="milestones-title"
        eyebrow="03 · Milestones"
        title="Assessment milestones"
        lead="Choose an assessment to see its details, date, marks allocation, status and related files. Details that are not yet confirmed are marked clearly."
      />

      <Reveal className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor={selectId} className="text-[0.9rem] font-semibold text-ink">
          Select an assessment
        </label>
        <div className="relative w-full sm:w-80">
          <select
            id={selectId}
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full appearance-none rounded-sm border border-line/30 bg-surface px-4 py-3 pr-10 text-[0.95rem] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} — {milestoneStatus[m.status].label}
              </option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M2 4l5 5 5-5" />
          </svg>
        </div>
      </Reveal>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <Reveal as="nav" aria-label="Milestone timeline" className="order-2 lg:order-1">
          <ol className="relative space-y-2 before:absolute before:bottom-5 before:left-[19px] before:top-5 before:w-px before:bg-line/20">
            {milestones.map((m) => {
              const Icon = statusIcon[m.status];
              const isSelected = m.id === selectedId;
              const tone = m.status === 'completed' ? 'text-brand border-brand/50 bg-brand/15' : m.status === 'in-progress' ? 'text-warning border-warning/50 bg-warning/15' : 'text-muted border-line/30 bg-surface';
              return (
                <li key={m.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setSelectedId(m.id)}
                    aria-current={isSelected ? 'step' : undefined}
                    className={`flex w-full items-center gap-4 rounded-md border px-2 py-2.5 text-left transition-colors ${
                      isSelected ? 'border-brand/40 bg-brand/[0.07]' : 'border-transparent hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className={`relative z-[1] inline-flex h-6 w-6 shrink-0 translate-x-[5px] items-center justify-center rounded-full border ${tone}`}>
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 pl-1">
                      <span className={`block font-semibold ${isSelected ? 'text-ink' : 'text-ink/85'}`}>{m.title}</span>
                      <span className="block text-[0.8rem] text-muted">{m.date ?? TBC}</span>
                    </span>
                    <span className="sr-only">{milestoneStatus[m.status].label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Reveal>

        <Reveal className="order-1 lg:order-2">
          <p className="sr-only" aria-live="polite">Showing details for {selected.title}</p>
          <MilestoneDetail milestone={selected} />
        </Reveal>
      </div>
    </Section>
  );
}
