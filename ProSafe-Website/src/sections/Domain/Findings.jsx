import { Info } from 'lucide-react';
import {
  evaluationStatus, experiment2, futureWork, keyFindings, limitations, metricDefinitions, resultsSourceNote,
  showExperimentResults, xgboostAcrossExperiments,
} from '../../data/findings.js';
import { SubSection } from '../../components/ui/Section.jsx';
import { Reveal } from '../../components/ui/Reveal.jsx';
import { IconTile } from '../../components/ui/Icon.jsx';
import { MetricBars } from '../../components/diagrams/MetricBars.jsx';
import { formatMetric } from '../../lib/format.js';

const toneBadge = { safe: 'badge-safe', warning: 'badge-warning', uncertain: 'badge-uncertain' };

function ExperimentTable() {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line/10 px-6 py-4">
        <h4 className="font-bold text-ink">XGBoost (EXTENDED) across the three experiments</h4>
        <p className="mt-1 text-[0.82rem] text-muted">Each model was applied once to its real test worker.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table min-w-[640px]">
          <caption className="sr-only">XGBoost results in Experiments 1 to 3</caption>
          <thead>
            <tr>
              <th scope="col">Experiment</th>
              {metricDefinitions.map((m) => (
                <th key={m.key} scope="col" className="text-right">{m.label}</th>
              ))}
              <th scope="col" className="text-right">CRITICAL → SAFE</th>
            </tr>
          </thead>
          <tbody>
            {xgboostAcrossExperiments.map((row) => (
              <tr key={row.experiment} className={row.deployed ? 'bg-chart/[0.08]' : ''}>
                <th scope="row" className="px-4 py-3 text-left">
                  <span className="block font-semibold text-ink">{row.experiment}</span>
                  <span className="block text-[0.78rem] font-normal text-muted">{row.name}</span>
                </th>
                {metricDefinitions.map((m) => (
                  <td key={m.key} className="text-right font-mono">{formatMetric(row[m.key], 4)}</td>
                ))}
                <td className="text-right font-mono">{row.criticalToSafe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Findings() {
  return (
    <SubSection
      id="findings"
      eyebrow="2.7 · Evaluation & Findings"
      title="Evaluation, findings and limitations"
      lead="What has been evaluated so far, what the experiments show, and what remains to be validated."
    >
      {showExperimentResults && (
        <>
          <Reveal className="flex gap-3 rounded-md border border-cyan/30 bg-cyan/[0.06] p-4 text-[0.86rem] leading-relaxed text-muted">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-cyan" aria-hidden="true" />
            <p>{resultsSourceNote}</p>
          </Reveal>

          <Reveal className="mt-8">
            <MetricBars
              rows={experiment2}
              metrics={metricDefinitions}
              caption="Experiment 2 (synthetic + W_001 → W_002): selected configuration of each algorithm evaluated on the unseen real worker W_002 (13,825 observations, of which 260 CRITICAL-labelled)."
            />
          </Reveal>

          <Reveal className="mt-6">
            <ExperimentTable />
          </Reveal>
        </>
      )}

      <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {keyFindings.map((f, i) => (
          <Reveal as="li" key={f.title} delay={(i % 3) * 60} className="card p-6">
            <IconTile name={f.icon} size="sm" tone={f.icon === 'TriangleAlert' ? 'warning' : i % 2 ? 'cyan' : 'brand'} />
            <h4 className="mt-4 font-bold leading-snug text-ink">{f.title}</h4>
            <p className="mt-2 text-[0.87rem] leading-relaxed text-muted">{f.text}</p>
          </Reveal>
        ))}
      </ul>

      <div className="mt-14">
        <h4 className="text-[1.25rem] font-bold">Evaluation status</h4>
        <p className="mt-1 text-[0.9rem] text-muted">Implemented functionality, software testing and planned evaluation are reported separately.</p>
        <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {evaluationStatus.map((e) => (
            <Reveal as="li" key={e.area} className="card-raised p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-ink">{e.area}</p>
                <span className={`badge ${toneBadge[e.tone]}`}>{e.status}</span>
              </div>
              <p className="mt-2 text-[0.84rem] leading-relaxed text-muted">{e.text}</p>
            </Reveal>
          ))}
        </ul>
      </div>

      <div className="mt-14 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h4 className="text-[1.25rem] font-bold">Limitations</h4>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {limitations.map((l) => (
              <Reveal as="li" key={l.title} className="card-raised flex gap-3 p-4">
                <IconTile name={l.icon} size="sm" tone="warning" />
                <div>
                  <p className="font-semibold text-ink">{l.title}</p>
                  <p className="mt-1 text-[0.83rem] leading-relaxed text-muted">{l.text}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
        <Reveal className="card h-fit p-6">
          <h4 className="text-[1.25rem] font-bold">Future work</h4>
          <p className="mt-1 text-[0.86rem] text-muted">Requirements before ProSafe could be regarded as a validated safety product.</p>
          <ol className="mt-5 space-y-3">
            {futureWork.map((item, i) => (
              <li key={item} className="flex gap-3 text-[0.87rem] leading-relaxed text-muted">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[0.74rem] font-bold text-brand">{i + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </SubSection>
  );
}
