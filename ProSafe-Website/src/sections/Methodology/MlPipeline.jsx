import { useId, useState } from 'react';
import { ArrowRight, CircleAlert, CircleCheck } from 'lucide-react';
import {
  algorithms, baselineExample, datasets, emergencyNote, featureSets, latencyNote, pipelineStages, preparationSteps,
  responseSteps, selectionRule, temporalFeatures, uncertainReasons,
} from '../../data/methodology.js';
import { sensors } from '../../data/home.js';
import { Icon } from '../../components/ui/Icon.jsx';

const n = (v) => v.toLocaleString('en-US');

function Bullets({ items }) {
  return (
    <ul className="space-y-2 text-[0.86rem] leading-relaxed text-muted">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
          {t}
        </li>
      ))}
    </ul>
  );
}

function CollectionStage() {
  const realTotal = datasets.real.reduce((a, w) => a + w.raw, 0);
  const synthTotal = datasets.synthetic.reduce((a, w) => a + w.raw, 0);
  const pct = (realTotal / (realTotal + synthTotal)) * 100;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <div>
        <p className="text-[0.88rem] leading-relaxed text-muted">Each observation holds six measurements at about one-second intervals.</p>
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {sensors.map((s) => (
            <li key={s.label} className="flex items-center gap-2 rounded-sm bg-white/[0.04] px-2.5 py-1.5 text-[0.8rem] text-ink">
              <Icon name={s.icon} className={`h-4 w-4 ${s.kind === 'Physiological' ? 'text-cyan' : 'text-brand'}`} />
              {s.label}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-[0.88rem] leading-relaxed text-muted">
          <span className="font-semibold text-ink">3 real workers</span> (4 h each, ordinary work, not deliberately exposed to danger) and{' '}
          <span className="font-semibold text-ink">4 synthetic profiles</span> covering heat, UV, gas, noise and combined hazards. Synthetic data was used only for training.
        </p>
        <div className="mt-4 flex h-8 overflow-hidden rounded-sm text-[0.72rem] font-semibold" role="img" aria-label={`Raw records: ${n(realTotal)} real, ${n(synthTotal)} synthetic`}>
          <span className="flex items-center justify-center bg-brand/80 text-[#06210f]" style={{ width: `${pct}%` }}>Real · {n(realTotal)}</span>
          <span className="flex items-center justify-center bg-white/15 text-ink" style={{ width: `${100 - pct}%` }}>Synthetic · {n(synthTotal)}</span>
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5 text-[0.72rem]">
          {datasets.real.map((w) => <li key={w.id} className="badge badge-safe">{w.id}</li>)}
          {datasets.synthetic.map((w) => <li key={w.id} className="badge badge-neutral">{w.id}</li>)}
        </ul>
        <p className="mt-3 text-[0.8rem] text-muted">
          {n(datasets.totals.raw)} raw records → {n(datasets.totals.ready)} ML-ready observations ({n(datasets.totals.uncertain)} kept as UNCERTAIN in the audit data).
        </p>
      </div>
    </div>
  );
}

function PersonalizationStage() {
  const id = useId();
  const [reading, setReading] = useState(baselineExample.reading);
  const { baseline } = baselineExample;
  const abs = reading - baseline;
  const pct = (abs / baseline) * 100;
  const pos = (v) => ((v - baselineExample.min) / (baselineExample.max - baselineExample.min)) * 100;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <p className="text-[0.88rem] leading-relaxed text-muted">
        Heart rate and skin temperature are compared with each worker’s own baseline (the median of the first 180 s, or entered by an administrator). The model sees the absolute and percentage deviation, never the raw baseline, so a reading is judged relative to that person.
      </p>
      <div className="card-raised p-4">
        <label htmlFor={id} className="flex items-center justify-between text-[0.84rem] font-semibold text-ink">
          Current heart rate <span className="font-mono text-brand">{reading} bpm</span>
        </label>
        <input
          id={id}
          type="range"
          min={baselineExample.min}
          max={baselineExample.max}
          value={reading}
          onChange={(e) => setReading(Number(e.target.value))}
          className="mt-3 w-full accent-[#22c55e]"
        />
        <div className="relative mt-2 h-6" aria-hidden="true">
          <span className="absolute top-0 h-6 w-0.5 bg-cyan" style={{ left: `${pos(baseline)}%` }} />
          <span className="absolute -translate-x-1/2 text-[0.68rem] text-cyan" style={{ left: `${pos(baseline)}%`, top: '24px' }}>baseline {baseline}</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-sm bg-white/[0.04] p-2.5">
            <p className="font-mono text-[1.1rem] font-bold text-ink">{abs > 0 ? '+' : ''}{abs} bpm</p>
            <p className="text-[0.72rem] text-muted">Δabs = x − b</p>
          </div>
          <div className="rounded-sm bg-white/[0.04] p-2.5">
            <p className="font-mono text-[1.1rem] font-bold text-ink">{pct > 0 ? '+' : ''}{pct.toFixed(1)}%</p>
            <p className="text-[0.72rem] text-muted">Δpct = (x − b) / b × 100</p>
          </div>
        </div>
        <p className="mt-3 text-[0.74rem] text-muted">Illustrative calculator using the thesis example (100 bpm against an 80 bpm baseline gives +20 bpm, +25%).</p>
      </div>
    </div>
  );
}

function FeatureStage() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <p className="text-[0.88rem] leading-relaxed text-muted">
        Three nested feature configurations were tested to see how much each type of information helps. The deployed model uses the most complete, <span className="font-semibold text-ink">EXTENDED (38 features)</span>, which was chosen on training-side validation in 29 of 32 results.
      </p>
      <div className="relative rounded-md border-2 border-brand/50 p-3 pt-7">
        <span className="absolute left-3 top-2 font-mono text-[0.72rem] font-bold text-brand">EXTENDED · 38</span>
        <div className="rounded-md border border-cyan/50 p-3 pt-7">
          <div className="relative">
            <span className="absolute -top-5 left-0 font-mono text-[0.72rem] font-bold text-cyan">TEMPORAL_PERSONALIZED · 26</span>
          </div>
          <div className="relative mt-1 rounded-md border border-line/40 p-3 pt-6">
            <span className="absolute left-3 top-1.5 font-mono text-[0.72rem] font-bold text-muted">BASIC_PERSONALIZED · 11</span>
            <p className="text-[0.76rem] text-muted">{featureSets[0].adds}</p>
          </div>
          <p className="mt-2 text-[0.76rem] text-muted">{featureSets[1].adds}</p>
        </div>
        <p className="mt-2 text-[0.76rem] text-muted">{featureSets[2].adds}</p>
      </div>
    </div>
  );
}

function QualityStage() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <div>
        <p className="text-[0.88rem] leading-relaxed text-muted">
          A streaming data-quality gate checks every observation <em>before</em> inference. Only READY observations are classified. UNCERTAIN is a data-quality state, not a fourth class, and is never turned into SAFE.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.8rem]">
          <span className="badge badge-neutral normal-case tracking-normal">Observation</span>
          <ArrowRight className="h-4 w-4 text-muted" aria-hidden="true" />
          <span className="badge badge-safe"><CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />READY → classify</span>
          <span className="text-muted">or</span>
          <span className="badge badge-uncertain"><CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />UNCERTAIN + reason</span>
        </div>
      </div>
      <div className="rounded-md border border-dashed border-uncertain/50 bg-uncertain/5 p-4">
        <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-uncertain">Reported as UNCERTAIN when…</p>
        <div className="mt-2"><Bullets items={uncertainReasons} /></div>
      </div>
    </div>
  );
}

function ClassificationStage() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <div>
        <p className="text-[0.88rem] leading-relaxed text-muted">Supervised multiclass classification of each READY observation into SAFE, WARNING or CRITICAL. Four algorithms were compared in eight training/evaluation configurations.</p>
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {algorithms.map((a) => (
            <li key={a} className={`rounded-sm px-3 py-2 text-[0.82rem] font-semibold ${a === 'XGBoost' ? 'bg-brand/15 text-brand ring-1 ring-brand/40' : 'bg-white/[0.04] text-ink'}`}>
              {a}{a === 'XGBoost' && <span className="block text-[0.7rem] font-normal text-brand/80">Deployed · EXTENDED · Exp. 2</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="card-raised p-4 text-[0.84rem] leading-relaxed text-muted">
        <p>{selectionRule}</p>
        <p className="mt-2">The evaluation worker was always excluded from training and hyperparameter selection. The deployed XGBoost model returns the predicted class and three class probabilities to the backend.</p>
      </div>
    </div>
  );
}

function ResponseStage() {
  return (
    <div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {responseSteps.map((s, i) => (
          <li key={s.title} className="card-raised p-4">
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-brand">Step {i + 1}</p>
            <p className="mt-1 font-semibold text-ink">{s.title}</p>
            <p className="mt-1 text-[0.8rem] leading-relaxed text-muted">{s.text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <p className="flex gap-2.5 rounded-sm border border-danger/35 bg-danger/[0.07] p-3 text-[0.82rem] leading-relaxed text-muted">
          <span className="badge badge-danger h-fit">Emergency</span>
          {emergencyNote}
        </p>
        <p className="rounded-sm border border-line/15 bg-white/[0.03] p-3 text-[0.82rem] leading-relaxed text-muted">{latencyNote}</p>
      </div>
    </div>
  );
}

const stageContent = {
  collection: <CollectionStage />,
  preparation: (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <p className="text-[0.88rem] leading-relaxed text-muted">Raw sensor data passes through validation, conservative cleaning and labelling before it reaches the model. Every step keeps an audit trail.</p>
      <Bullets items={preparationSteps} />
    </div>
  ),
  personalization: <PersonalizationStage />,
  temporal: (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <p className="text-[0.88rem] leading-relaxed text-muted">Harm depends on duration as well as intensity. Temporal features use only current and earlier readings of the same session, so they can be computed live.</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {temporalFeatures.map((f) => (
          <li key={f.title} className="card-raised p-3.5">
            <p className="font-semibold text-ink">{f.title}</p>
            <p className="mt-1 text-[0.8rem] text-muted">{f.text}</p>
          </li>
        ))}
      </ul>
    </div>
  ),
  features: <FeatureStage />,
  quality: <QualityStage />,
  classification: <ClassificationStage />,
  response: <ResponseStage />,
};

/** Eight-stage ML methodology (V4 Sections 2.4–2.6 and 2.9) as a stepper. */
export function MlPipeline() {
  const [active, setActive] = useState(pipelineStages[0].id);
  const index = pipelineStages.findIndex((s) => s.id === active);

  return (
    <div className="card overflow-hidden">
      <ol className="grid grid-cols-2 gap-px bg-line/10 sm:grid-cols-4 lg:grid-cols-8" aria-label="ML pipeline stages">
        {pipelineStages.map((s, i) => {
          const selected = s.id === active;
          return (
            <li key={s.id} className="bg-surface">
              <button
                type="button"
                onClick={() => setActive(s.id)}
                aria-pressed={selected}
                className={`flex h-full w-full flex-col items-start gap-1.5 p-3 text-left transition-colors ${
                  selected ? 'bg-brand/10 text-ink shadow-[inset_0_-2px_0_rgb(var(--ps-green))]' : 'text-muted hover:bg-white/[0.04] hover:text-ink'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`font-mono text-[0.72rem] font-bold ${selected ? 'text-brand' : ''}`}>{String(i + 1).padStart(2, '0')}</span>
                  <Icon name={s.icon} className={`h-4 w-4 ${selected ? 'text-brand' : ''}`} />
                </span>
                <span className="text-[0.8rem] font-semibold leading-tight">{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="p-5 sm:p-6" aria-live="polite">
        <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-brand">Stage {index + 1} of {pipelineStages.length}</p>
        <h4 className="mt-1 text-[1.15rem] font-bold">{pipelineStages[index].title}</h4>
        <div className="mt-4">{stageContent[active]}</div>
        <div className="mt-5 flex justify-between gap-3">
          <button type="button" className="btn btn-secondary btn-sm" disabled={index === 0} onClick={() => setActive(pipelineStages[index - 1].id)}>
            Previous
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={index === pipelineStages.length - 1} onClick={() => setActive(pipelineStages[index + 1].id)}>
            Next stage
          </button>
        </div>
      </div>
    </div>
  );
}
