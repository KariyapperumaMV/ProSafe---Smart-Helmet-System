import { useId, useState } from 'react';
import { ChartBar, Table2 } from 'lucide-react';
import { formatMetric } from '../../lib/format.js';

/**
 * Small-multiple horizontal bar chart: one panel per metric, one bar per
 * model, all on the same 0–1 scale. The highlighted row (the deployed model)
 * uses the validated highlight colour; others use the neutral. Every bar is
 * direct-labelled with its value and named on the axis, so identity never
 * depends on colour, and a table view carries the same data.
 */
export function MetricBars({ rows, metrics, rowKey = 'model', caption }) {
  const [view, setView] = useState('chart');
  const [hover, setHover] = useState(null);
  const captionId = useId();

  return (
    <figure className="card p-5 sm:p-6" aria-labelledby={captionId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-4 text-[0.8rem] text-muted" aria-label="Legend">
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-4 rounded-[3px] bg-chart" aria-hidden="true" /> Deployed model (XGBoost)
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-4 rounded-[3px] bg-chart-neutral" aria-hidden="true" /> Other algorithms
          </li>
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
              className={`inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[0.78rem] font-semibold ${
                view === id ? 'bg-white/10 text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'chart' ? (
        <div className="mt-5 grid gap-x-8 gap-y-7 md:grid-cols-2" aria-hidden="false">
          {metrics.map((metric) => (
            <div key={metric.key}>
              <p className="text-[0.88rem] font-semibold text-ink">{metric.label}</p>
              <p className="text-[0.74rem] text-muted">{metric.help}</p>
              <ul className="mt-3 space-y-2.5">
                {rows.map((row) => {
                  const value = row[metric.key];
                  const isHover = hover === `${metric.key}-${row[rowKey]}`;
                  return (
                    <li
                      key={row[rowKey]}
                      className="grid grid-cols-[112px_1fr_44px] items-center gap-3"
                      onMouseEnter={() => setHover(`${metric.key}-${row[rowKey]}`)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <span className={`truncate text-[0.78rem] ${row.deployed ? 'font-semibold text-ink' : 'text-muted'}`}>{row[rowKey]}</span>
                      <span className="relative block h-5">
                        {/* recessive gridlines at 0.5 and 1.0 */}
                        <span className="absolute inset-y-0 left-1/2 w-px bg-line/10" aria-hidden="true" />
                        <span className="absolute inset-y-0 right-0 w-px bg-line/10" aria-hidden="true" />
                        <span
                          className={`absolute left-0 top-1/2 h-2.5 -translate-y-1/2 rounded-r-[4px] transition-[filter] ${row.deployed ? 'bg-chart' : 'bg-chart-neutral'} ${isHover ? 'brightness-125' : ''}`}
                          style={{ width: `${Math.max(value * 100, 0.6)}%` }}
                          aria-hidden="true"
                        />
                        {isHover && (
                          <span
                            role="tooltip"
                            className="absolute -top-8 left-0 z-10 whitespace-nowrap rounded-sm border border-line/25 bg-raised px-2.5 py-1 text-[0.74rem] text-ink shadow-card"
                          >
                            {row[rowKey]} · {metric.label}: {formatMetric(value, 4)}
                            {row.featureSet ? ` · ${row.featureSet}` : ''}
                          </span>
                        )}
                      </span>
                      <span className={`text-right font-mono text-[0.76rem] ${row.deployed ? 'text-ink' : 'text-muted'}`}>
                        {formatMetric(value)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="ml-[124px] mr-[56px] mt-1.5 flex justify-between text-[0.66rem] text-muted" aria-hidden="true">
                <span>0</span>
                <span>0.5</span>
                <span>1.0</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="data-table min-w-[560px]">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                <th scope="col">Model</th>
                {rows[0]?.featureSet && <th scope="col">Feature set</th>}
                {metrics.map((m) => (
                  <th key={m.key} scope="col" className="text-right">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row[rowKey]} className={row.deployed ? 'bg-chart/[0.08]' : ''}>
                  <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">
                    {row[rowKey]}
                    {row.deployed && <span className="badge badge-safe ml-2">Deployed</span>}
                  </th>
                  {row.featureSet && <td>{row.featureSet}</td>}
                  {metrics.map((m) => (
                    <td key={m.key} className="text-right font-mono">{formatMetric(row[m.key], 4)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <figcaption id={captionId} className="mt-5 border-t border-line/10 pt-4 text-[0.8rem] text-muted">
        {caption}
      </figcaption>
    </figure>
  );
}
