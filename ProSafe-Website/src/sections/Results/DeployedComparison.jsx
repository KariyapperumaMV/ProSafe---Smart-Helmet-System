import { useState } from 'react';
import { ChartBar, Table2, TriangleAlert } from 'lucide-react';
import { deployedComparison } from '../../data/results.js';

const SERIES = [
  { className: 'bg-series-a', label: 'W_002' },
  { className: 'bg-series-b', label: 'W_003' },
];

function Bar({ value, series, worker, metric, big = false }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="grid grid-cols-[52px_1fr_60px] items-center gap-2"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="font-mono text-[0.72rem] text-muted">{worker.id}</span>
      <span className={`relative block ${big ? 'h-6' : 'h-4'}`}>
        <span className="absolute inset-y-0 left-1/2 w-px bg-line/10" aria-hidden="true" />
        <span className="absolute inset-y-0 right-0 w-px bg-line/10" aria-hidden="true" />
        <span
          className={`absolute left-0 top-1/2 -translate-y-1/2 rounded-r-[4px] ${big ? 'h-5' : 'h-3'} ${series.className} ${hover ? 'brightness-125' : ''}`}
          style={{ width: `${Math.max(value, 0.6)}%` }}
          aria-hidden="true"
        />
        {hover && (
          <span role="tooltip" className="absolute -top-8 left-0 z-10 whitespace-nowrap rounded-sm border border-line/25 bg-raised px-2.5 py-1 text-[0.74rem] text-ink shadow-card">
            {worker.id} ({worker.experiment}) · {metric}: {value.toFixed(2)}%
          </span>
        )}
      </span>
      <span className={`text-right font-mono ${big ? 'text-[0.95rem] font-bold text-ink' : 'text-[0.78rem] text-ink'}`}>{value.toFixed(2)}%</span>
    </div>
  );
}

/** The central ML result: the deployed configuration on W_002 and W_003. */
export function DeployedComparison() {
  const [view, setView] = useState('chart');
  const { workers, metrics, takeaway, caveats } = deployedComparison;
  const regular = metrics.filter((m) => !m.emphasis);
  const critical = metrics.find((m) => m.emphasis);

  return (
    <figure className="card p-5 sm:p-6" aria-labelledby="deployed-caption">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-brand">Deployed model</p>
          <p className="mt-0.5 font-bold text-ink">XGBoost · EXTENDED (38 features) · trained on synthetic + W_001</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ul className="flex gap-4 text-[0.8rem] text-muted" aria-label="Legend">
            {SERIES.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2">
                <span className={`h-2.5 w-4 rounded-[3px] ${s.className}`} aria-hidden="true" />
                {s.label} <span className="text-[0.72rem]">({workers[i].experiment})</span>
              </li>
            ))}
          </ul>
          <div className="flex rounded-sm border border-line/20 p-0.5" role="group" aria-label="Choose view">
            {[
              { id: 'chart', label: 'Chart', Icon: ChartBar },
              { id: 'table', label: 'Table', Icon: Table2 },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                onClick={() => setView(id)}
                className={`inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[0.78rem] font-semibold ${view === id ? 'bg-white/10 text-ink' : 'text-muted hover:text-ink'}`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'chart' ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-5">
            {regular.map((m) => (
              <div key={m.key}>
                <p className="mb-1.5 text-[0.86rem] font-semibold text-ink">{m.label}</p>
                <div className="space-y-1.5">
                  {workers.map((w, i) => (
                    <Bar key={w.id} value={w[m.key]} series={SERIES[i]} worker={w} metric={m.label} />
                  ))}
                </div>
              </div>
            ))}
            <div className="ml-[60px] mr-[68px] flex justify-between text-[0.66rem] text-muted" aria-hidden="true">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>

          <div className="rounded-md border border-critical/40 bg-critical/[0.06] p-4 sm:p-5">
            <p className="flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-[0.14em] text-critical">
              <TriangleAlert className="h-4 w-4" aria-hidden="true" />
              {critical.label}: the safety-critical measure
            </p>
            <div className="mt-4 space-y-3">
              {workers.map((w, i) => (
                <Bar key={w.id} value={w.criticalRecall} series={SERIES[i]} worker={w} metric={critical.label} big />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {workers.map((w) => (
                <div key={w.id} className="rounded-sm bg-black/25 p-3">
                  <p className="font-mono text-[1.25rem] font-extrabold text-ink">
                    {w.criticalDetected}<span className="text-[0.9rem] font-semibold text-muted"> / {w.criticalTotal}</span>
                  </p>
                  <p className="text-[0.74rem] text-muted">CRITICAL observations recognized on {w.id}</p>
                  <p className="mt-1 text-[0.72rem] text-muted">{w.missedAs}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="data-table min-w-[520px]">
            <caption className="sr-only">Deployed XGBoost model on W_002 and W_003</caption>
            <thead>
              <tr>
                <th scope="col">Metric</th>
                {workers.map((w) => <th key={w.id} scope="col" className="text-right">{w.id} ({w.experiment})</th>)}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.key}>
                  <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">{m.label}</th>
                  {workers.map((w) => <td key={w.id} className="text-right font-mono">{w[m.key].toFixed(2)}%</td>)}
                </tr>
              ))}
              <tr>
                <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">CRITICAL precision</th>
                {workers.map((w) => <td key={w.id} className="text-right font-mono">{w.criticalPrecision.toFixed(2)}%</td>)}
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">CRITICAL recognized</th>
                {workers.map((w) => <td key={w.id} className="text-right font-mono">{w.criticalDetected} / {w.criticalTotal}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <figcaption id="deployed-caption" className="mt-6 border-t border-line/10 pt-4">
        <p className="text-[0.95rem] font-medium leading-relaxed text-ink">{takeaway}</p>
        <ul className="mt-3 space-y-1.5 text-[0.8rem] leading-relaxed text-muted">
          {caveats.map((c) => (
            <li key={c} className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-line/70" aria-hidden="true" />
              {c}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
