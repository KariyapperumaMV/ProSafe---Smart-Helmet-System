import { mlPipeline } from '../../data/methodology.js';

const laneStyle = {
  Helmet: 'badge-warning',
  Backend: 'badge-safe',
  'ML service': 'badge-info',
  'Backend → Web & Helmet': 'badge-safe',
};

function Step({ step, n }) {
  return (
    <li className="relative pl-12">
      <span
        className="absolute left-0 top-0 inline-flex h-8 w-8 items-center justify-center rounded-full border border-brand/40 bg-bg text-[0.8rem] font-extrabold text-brand"
        aria-hidden="true"
      >
        {n}
      </span>
      <div className="card-raised p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-[0.95rem] font-bold text-ink">{step.title}</h4>
          <span className={`badge ${laneStyle[step.where] ?? 'badge-neutral'}`}>{step.where}</span>
        </div>
        <p className="mt-1.5 text-[0.85rem] leading-relaxed text-muted">{step.text}</p>
      </div>
    </li>
  );
}

/**
 * Figure 2.5 and Section 2.9 combined: the ordered processing stages from the
 * helmet reading to feedback, with the data-quality gate as a branch.
 */
export function MlPipelineDiagram() {
  const gateIndex = mlPipeline.findIndex((s) => s.gate);
  const before = mlPipeline.slice(0, gateIndex);
  const gate = mlPipeline[gateIndex];
  const after = mlPipeline.slice(gateIndex + 1);

  return (
    <figure className="card p-5 sm:p-7" aria-labelledby="pipeline-caption">
      <ol className="relative space-y-4 before:absolute before:bottom-4 before:left-4 before:top-4 before:w-px before:bg-line/20">
        {before.map((step, i) => (
          <Step key={step.title} step={step} n={i + 1} />
        ))}

        <li className="relative pl-12">
          <span
            className="absolute left-0 top-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-warning text-[0.8rem] font-extrabold text-[#2a1a00]"
            aria-hidden="true"
          >
            {gateIndex + 1}
          </span>
          <div className="rounded-md border border-warning/40 bg-warning/[0.07] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-[0.95rem] font-bold text-ink">{gate.title}</h4>
              <span className="badge badge-info">{gate.where}</span>
            </div>
            <p className="mt-1.5 text-[0.85rem] leading-relaxed text-muted">{gate.text}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-sm border border-dashed border-uncertain/60 bg-uncertain/5 p-3">
                <p className="badge badge-uncertain">Not ready → UNCERTAIN</p>
                <p className="mt-2 text-[0.8rem] leading-relaxed text-muted">
                  The classifier is not called and no probabilities are produced. The reason is stored and shown; UNCERTAIN is never converted into SAFE and never votes in smoothing.
                </p>
              </div>
              <div className="rounded-sm border border-brand/35 bg-brand/5 p-3">
                <p className="badge badge-safe">Ready → classify</p>
                <p className="mt-2 text-[0.8rem] leading-relaxed text-muted">
                  The observation continues to the XGBoost classifier and the backend post-processing steps below.
                </p>
              </div>
            </div>
          </div>
        </li>

        {after.map((step, i) => (
          <Step key={step.title} step={step} n={gateIndex + 2 + i} />
        ))}
      </ol>
      <figcaption id="pipeline-caption" className="mt-6 border-t border-line/10 pt-4 text-[0.82rem] text-muted">
        Processing order from helmet reading to feedback (after thesis Figure 2.5 and Section 2.9). UNCERTAIN is a data-quality state, not a fourth ML class.
      </figcaption>
    </figure>
  );
}
