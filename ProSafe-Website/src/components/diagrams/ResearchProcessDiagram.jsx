import { dsrPhases } from '../../data/methodology.js';

const phaseTone = ['text-warning', 'text-brand', 'text-cyan', 'text-muted'];

/**
 * Figure 2.1 of the thesis redrawn: the ten research stages grouped into
 * Design Science Research activities.
 */
export function ResearchProcessDiagram() {
  return (
    <figure className="card p-5 sm:p-7" aria-labelledby="process-caption">
      <ol className="space-y-6">
        {dsrPhases.map((phase, p) => (
          <li key={phase.phase} className="grid gap-4 lg:grid-cols-[190px_1fr]">
            <div className="flex items-center gap-3 lg:flex-col lg:items-start lg:pt-3">
              <span className={`text-[0.7rem] font-bold uppercase tracking-[0.16em] ${phaseTone[p]}`}>DSR activity {p + 1}</span>
              <span className="text-[1rem] font-bold text-ink">{phase.phase}</span>
            </div>
            <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {phase.stages.map((stage) => (
                <li key={stage.title} className="card-raised flex gap-3 p-4">
                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.82rem] font-extrabold ${
                      stage.n ? 'bg-brand text-[#06210f]' : 'border border-dashed border-line/40 text-muted'
                    }`}
                    aria-hidden="true"
                  >
                    {stage.n ?? '•'}
                  </span>
                  <div>
                    <p className="text-[0.92rem] font-semibold leading-snug text-ink">
                      {stage.n && <span className="sr-only">Stage {stage.n}: </span>}
                      {stage.title}
                    </p>
                    <p className="mt-1 text-[0.82rem] leading-relaxed text-muted">{stage.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
      <figcaption id="process-caption" className="mt-6 border-t border-line/10 pt-4 text-[0.82rem] text-muted">
        Research process followed in developing and evaluating ProSafe (after thesis Figure 2.1), grouped by Design Science Research activity.
      </figcaption>
    </figure>
  );
}
