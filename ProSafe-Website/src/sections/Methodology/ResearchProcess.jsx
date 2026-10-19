import { useState } from 'react';
import { processSteps } from '../../data/methodology.js';

/** Interactive timeline of the research process (thesis Figure 2.1, grouped). */
export function ResearchProcess() {
  const [active, setActive] = useState(processSteps[0].id);
  const step = processSteps.find((s) => s.id === active);
  const index = processSteps.indexOf(step);
  const stageLabel = step.stages.length > 1 ? `Thesis stages ${step.stages[0]}–${step.stages.at(-1)}` : `Thesis stage ${step.stages[0]}`;

  return (
    <div className="card p-5 sm:p-6">
      <ol className="relative grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8" aria-label="Research process stages">
        <span className="absolute left-[6%] right-[6%] top-[19px] hidden h-px bg-line/25 lg:block" aria-hidden="true" />
        {processSteps.map((s, i) => {
          const selected = s.id === active;
          const done = i < index;
          return (
            <li key={s.id} className="relative">
              <button
                type="button"
                onClick={() => setActive(s.id)}
                aria-pressed={selected}
                className={`flex w-full flex-col items-center gap-2 rounded-sm px-1 py-1.5 text-center transition-colors ${selected ? 'text-ink' : 'text-muted hover:text-ink'}`}
              >
                <span
                  className={`relative z-[1] inline-flex h-10 w-10 items-center justify-center rounded-full border text-[0.85rem] font-extrabold transition-colors ${
                    selected ? 'border-brand bg-brand text-[#06210f] shadow-glow' : done ? 'border-brand/50 bg-brand/15 text-brand' : 'border-line/30 bg-bg text-muted'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="text-[0.78rem] font-semibold leading-tight">{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-5 rounded-md border border-line/15 bg-surface/70 p-4" aria-live="polite">
        <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-brand">
          Step {index + 1} · {stageLabel}
        </p>
        <p className="mt-1 font-semibold text-ink">{step.title}</p>
        <p className="mt-1 text-[0.88rem] leading-relaxed text-muted">{step.text}</p>
      </div>
      <p className="mt-3 text-[0.76rem] text-muted">The thesis describes eleven stages; closely related stages are grouped here without changing their order.</p>
    </div>
  );
}
