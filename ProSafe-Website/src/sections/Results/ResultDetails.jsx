import { useState } from 'react';
import { ChevronDown, CircleCheck, FlaskConical, Timer } from 'lucide-react';
import {
  allAlgorithms, experimentNotes, experiments, indicativeSensors, sensorResults, testingResults, testingScope, timingResults, userAcceptance,
} from '../../data/results.js';

const n = (v) => v.toLocaleString('en-US');
const pct = (v) => v.toFixed(2);

function Disclosure({ title, children }) {
  return (
    <details className="group card-raised overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[0.9rem] font-semibold text-brand [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-line/10 p-4">{children}</div>
    </details>
  );
}

/** Table 3.2 / 2.5 and Table G.1, hidden until requested. */
export function ExperimentDetails() {
  const [view, setView] = useState('xgb');
  return (
    <Disclosure title="View experiment details (8 configurations)">
      <div className="mb-3 flex rounded-sm border border-line/20 p-0.5 sm:w-fit" role="group" aria-label="Choose table">
        {[
          { id: 'xgb', label: 'XGBoost per configuration' },
          { id: 'all', label: 'All four algorithms' },
        ].map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={view === o.id}
            onClick={() => setView(o.id)}
            className={`flex-1 rounded-[6px] px-3 py-1 text-[0.78rem] font-semibold ${view === o.id ? 'bg-white/10 text-ink' : 'text-muted hover:text-ink'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        {view === 'xgb' ? (
          <table className="data-table min-w-[760px]">
            <caption className="sr-only">XGBoost results and best macro F1-score per configuration (%), thesis Table 3.2</caption>
            <thead>
              <tr>
                <th scope="col">Exp.</th>
                <th scope="col">Training data (rows)</th>
                <th scope="col">Evaluation</th>
                <th scope="col" className="text-right">Acc.</th>
                <th scope="col" className="text-right">Bal. acc.</th>
                <th scope="col" className="text-right">Macro F1</th>
                <th scope="col" className="text-right">CRIT. recall</th>
                <th scope="col" className="text-right">Best macro F1</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((e) => (
                <tr key={e.exp} className={e.deployed ? 'bg-brand/[0.07]' : ''}>
                  <td className="cell-strong">{e.exp}{e.deployed && <span className="badge badge-safe ml-2">Deployed config.</span>}</td>
                  <td>{e.training} <span className="text-[0.76rem]">({n(e.rows)})</span></td>
                  <td className="font-mono">{e.evaluation}</td>
                  <td className="text-right font-mono">{pct(e.acc)}</td>
                  <td className="text-right font-mono">{pct(e.bal)}</td>
                  <td className="text-right font-mono">{pct(e.f1)}</td>
                  <td className="text-right font-mono text-ink">{pct(e.crit)}</td>
                  <td className="text-right font-mono">{e.best}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="data-table min-w-[680px]">
            <caption className="sr-only">Macro F1 and CRITICAL recall of every algorithm (%), thesis Table G.1</caption>
            <thead>
              <tr>
                <th scope="col" rowSpan={2}>Exp.</th>
                {['Random Forest', 'XGBoost', 'SVM', 'Logistic Reg.'].map((m) => (
                  <th key={m} scope="colgroup" colSpan={2} className="text-center">{m}</th>
                ))}
              </tr>
              <tr>
                {['rf', 'xgb', 'svm', 'lr'].flatMap((k) => [
                  <th key={`${k}f`} scope="col" className="text-right">F1</th>,
                  <th key={`${k}r`} scope="col" className="text-right">CRIT. R</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {allAlgorithms.map((row) => (
                <tr key={row.exp}>
                  <td className="cell-strong">{row.exp}</td>
                  {['rf', 'xgb', 'svm', 'lr'].flatMap((k) => [
                    <td key={`${k}f`} className="text-right font-mono">{row[k][0].toFixed(1)}</td>,
                    <td key={`${k}r`} className="text-right font-mono">{row[k][1].toFixed(1)}</td>,
                  ])}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ul className="mt-4 space-y-1.5 text-[0.8rem] leading-relaxed text-muted">
        {experimentNotes.map((t) => (
          <li key={t} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-line/70" aria-hidden="true" />
            {t}
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}

export function LabResults() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
      <div>
        <ul className="grid gap-3 sm:grid-cols-3">
          {sensorResults.map((s) => (
            <li key={s.part} className="card p-4">
              <p className="font-mono text-[0.72rem] text-muted">{s.part}</p>
              <p className="mt-1 text-[1.5rem] font-extrabold leading-none text-brand">{s.value}</p>
              <p className="mt-1 text-[0.8rem] font-semibold text-ink">{s.label} {s.metric}</p>
              <p className="mt-1 text-[0.74rem] leading-snug text-muted">{s.detail}</p>
            </li>
          ))}
        </ul>
        <ul className="mt-3 space-y-1.5">
          {indicativeSensors.map((s) => (
            <li key={s.part} className="flex gap-2 text-[0.8rem] text-muted">
              <span className="badge badge-uncertain shrink-0">{s.part}</span>
              <span className="pt-0.5">{s.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <div className="card flex items-center gap-4 p-4">
          <CircleCheck className="h-8 w-8 shrink-0 text-brand" aria-hidden="true" />
          <div>
            <p className="text-[1.5rem] font-extrabold leading-none text-ink">13 / 13</p>
            <p className="mt-1 text-[0.8rem] text-muted">Functional checks recorded as PASS: start-up, Wi-Fi, data delivery, four LED states, emergency, reset and recovery after a network drop.</p>
          </div>
        </div>
        <div className="card flex items-center gap-4 p-4">
          <Timer className="h-8 w-8 shrink-0 text-cyan" aria-hidden="true" />
          <div>
            <p className="text-[1.5rem] font-extrabold leading-none text-ink">0.69 s</p>
            <p className="mt-1 text-[0.8rem] text-muted">Mean emergency press to backend alert (0.58–0.81 s), independent of the ML service.</p>
          </div>
        </div>
      </div>
      <div className="lg:col-span-2">
        <Disclosure title="View timing results (thesis Table 3.1(b))">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[560px]">
              <thead>
                <tr>
                  <th scope="col">Test</th>
                  <th scope="col">Expected</th>
                  <th scope="col" className="text-right">Measured mean</th>
                  <th scope="col" className="text-right">Range</th>
                </tr>
              </thead>
              <tbody>
                {timingResults.map((t) => (
                  <tr key={t.test}>
                    <td className="cell-strong">{t.test}</td>
                    <td>{t.expected}</td>
                    <td className="text-right font-mono">{t.mean}</td>
                    <td className="text-right font-mono">{t.range}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[0.78rem] text-muted">Three trials per test under laboratory conditions; these are not guaranteed field timings. LED updates depend on the 5 s polling cycle.</p>
        </Disclosure>
      </div>
    </div>
  );
}

export function TestingResults() {
  return (
    <div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {testingResults.map((t) => (
          <li key={t.component} className="card-raised p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-ink">{t.component}</p>
              <span className="badge badge-safe">{t.total ? `${t.passed}/${t.total}` : t.result}</span>
            </div>
            {t.total && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${(t.passed / t.total) * 100}%` }} />
              </div>
            )}
            <p className="mt-2 text-[0.78rem] text-muted">{t.method}</p>
            {t.note && <p className="mt-1 text-[0.76rem] italic text-muted">{t.note}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-3 flex gap-2 text-[0.8rem] leading-relaxed text-muted">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-cyan" aria-hidden="true" />
        {testingScope}
      </p>
    </div>
  );
}

function RatingPanel({ title, data }) {
  return (
    <div className="card-raised p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold text-ink">{title}</p>
        <p className="text-[0.78rem] text-muted">
          mean <span className="font-mono font-bold text-ink">{data.mean.toFixed(2)}</span> / 5 · {data.positive}% positive
        </p>
      </div>
      <ul className="mt-3 space-y-2">
        {data.dimensions.map((d) => (
          <li key={d.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_36px] items-center gap-2 text-[0.76rem]">
            <span className="truncate text-muted" title={d.label}>{d.label}</span>
            <span className="relative block h-3 rounded-sm bg-white/[0.06]" title={`${d.label}: ${d.value.toFixed(2)}`}>
              <span className="absolute inset-y-0 left-1/2 w-px bg-line/20" aria-hidden="true" />
              <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-chart" style={{ width: `${((d.value - 1) / 4) * 100}%` }} aria-hidden="true" />
            </span>
            <span className="text-right font-mono text-ink">{d.value.toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-right text-[0.66rem] text-muted">Scale 1 (strongly disagree) to 5 (strongly agree); midline = 3 (neutral)</p>
    </div>
  );
}

export function UserAcceptance() {
  const ua = userAcceptance;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <div className="grid gap-3">
        <RatingPanel title={`Administrators (${ua.participants.admin})`} data={ua.admin} />
        <RatingPanel title={`Construction workers (${ua.participants.worker})`} data={ua.worker} />
      </div>
      <div className="flex flex-col gap-3">
        <div className="card-raised p-4">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-brand">Valued most</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {ua.positives.map((p) => <li key={p} className="badge badge-safe normal-case tracking-normal">{p}</li>)}
          </ul>
          <p className="mt-4 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-warning">Needs improvement</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {ua.improvements.map((p) => <li key={p} className="badge badge-warning normal-case tracking-normal">{p}</li>)}
          </ul>
        </div>
        <p className="rounded-sm border border-warning/30 bg-warning/[0.06] p-3 text-[0.8rem] leading-relaxed text-muted">{ua.qualification}</p>
      </div>
    </div>
  );
}
