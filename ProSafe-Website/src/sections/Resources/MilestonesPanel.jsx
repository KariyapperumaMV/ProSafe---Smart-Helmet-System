import { useId, useMemo, useState } from 'react';
import { Award, CalendarDays, CircleCheck, CircleDashed, Clock, Eye, FileText, Hourglass } from 'lucide-react';
import { milestones, milestoneStatus } from '../../data/milestones.js';
import { allFiles, availability } from '../../data/documents.js';

const statusIcon = { completed: CircleCheck, 'in-progress': Hourglass, upcoming: CircleDashed };
const filesById = Object.fromEntries(allFiles.map((f) => [f.id, f]));
const TBC = 'To be confirmed';

function defaultMilestone() {
  const completed = milestones.filter((m) => m.status === 'completed');
  return (completed[completed.length - 1] ?? milestones[0]).id;
}

/** Compact milestone view: a dropdown (as the SLIIT guidelines ask), a timeline and a detail card. */
export function MilestonesPanel() {
  const [selectedId, setSelectedId] = useState(defaultMilestone);
  const m = useMemo(() => milestones.find((x) => x.id === selectedId) ?? milestones[0], [selectedId]);
  const selectId = useId();
  const status = milestoneStatus[m.status];
  const StatusIcon = statusIcon[m.status];
  const related = m.links.map((id) => filesById[id]).filter(Boolean);

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor={selectId} className="text-[0.88rem] font-semibold text-ink">Select an assessment</label>
        <div className="relative w-full sm:w-80">
          <select
            id={selectId}
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full appearance-none rounded-sm border border-line/30 bg-surface px-4 py-2.5 pr-10 text-[0.92rem] font-medium text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            {milestones.map((x) => (
              <option key={x.id} value={x.id}>{x.title} — {milestoneStatus[x.status].label}</option>
            ))}
          </select>
          <svg className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M2 4l5 5 5-5" />
          </svg>
        </div>
      </div>

      <ol className="mt-5 flex gap-1 overflow-x-auto pb-2" aria-label="Milestone timeline">
        {milestones.map((x) => {
          const Icon = statusIcon[x.status];
          const sel = x.id === selectedId;
          const tone = x.status === 'completed' ? 'text-brand' : x.status === 'in-progress' ? 'text-warning' : 'text-muted';
          return (
            <li key={x.id} className="min-w-[104px] flex-1">
              <button
                type="button"
                onClick={() => setSelectedId(x.id)}
                aria-current={sel ? 'step' : undefined}
                className={`flex w-full flex-col items-center gap-1 rounded-sm border px-2 py-2 text-center transition-colors ${sel ? 'border-brand/40 bg-brand/[0.08]' : 'border-transparent hover:bg-white/[0.04]'}`}
              >
                <Icon className={`h-5 w-5 ${tone}`} aria-hidden="true" />
                <span className="text-[0.76rem] font-semibold leading-tight text-ink">{x.shortTitle}</span>
                <span className="text-[0.68rem] text-muted">{x.date ?? 'TBC'}</span>
                <span className="sr-only">{milestoneStatus[x.status].label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <article className="card mt-3 grid gap-5 p-5 md:grid-cols-[1.2fr_1fr]" aria-labelledby={`ms-${m.id}`}>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 id={`ms-${m.id}`} className="text-[1.2rem] font-bold">{m.title}</h4>
            <span className={`badge ${status.className}`}><StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />{status.label}</span>
          </div>
          <p className="mt-2 text-[0.88rem] leading-relaxed text-muted">{m.description}</p>
          <p className="sr-only" aria-live="polite">Showing details for {m.title}</p>
        </div>
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-3">
            <div className="card-raised p-3">
              <dt className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-muted"><CalendarDays className="h-3.5 w-3.5 text-cyan" aria-hidden="true" />Date</dt>
              <dd className={`mt-1 text-[0.88rem] font-semibold ${m.date ? 'text-ink' : 'text-muted'}`}>{m.date ?? TBC}</dd>
              {m.dateNote && <dd className="mt-0.5 text-[0.7rem] text-muted">{m.dateNote}</dd>}
            </div>
            <div className="card-raised p-3">
              <dt className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-muted"><Award className="h-3.5 w-3.5 text-warning" aria-hidden="true" />Marks</dt>
              <dd className={`mt-1 text-[0.88rem] font-semibold ${m.marks ? 'text-ink' : 'text-muted'}`}>{m.marks ?? TBC}</dd>
              {m.marksNote && <dd className="mt-0.5 text-[0.7rem] text-muted">{m.marksNote}</dd>}
            </div>
          </dl>
          {related.length > 0 && (
            <ul className="space-y-1.5">
              {related.map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-2 rounded-sm bg-white/[0.04] px-3 py-2 text-[0.82rem]">
                  <span className="flex min-w-0 items-center gap-2 text-ink"><FileText className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" /><span className="truncate">{file.title}</span></span>
                  {file.status === 'available' && file.file ? (
                    <a href={file.file} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand hover:underline">
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />View<span className="sr-only"> {file.title} (opens in a new tab)</span>
                    </a>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 text-muted"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{availability[file.status].label}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>
    </div>
  );
}
