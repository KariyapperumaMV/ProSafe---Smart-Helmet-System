import { PackageCheck } from 'lucide-react';
import { algorithms, deployment, experiments, featureSets, optimisation } from '../../../data/methodology.js';
import { MlPipelineDiagram } from '../../../components/diagrams/MlPipelineDiagram.jsx';
import { BulletList, MiniHeading, PanelHeading } from './PanelHeading.jsx';

export function MlPanel() {
  return (
    <div className="space-y-10">
      <PanelHeading title="Machine learning workflow">
        Safety assessment is formulated as supervised multiclass classification on engineered tabular features. Sequence models
        were not used because real-worker data was limited and engineered features keep the inputs interpretable.
      </PanelHeading>

      <MlPipelineDiagram />

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <MiniHeading>Candidate algorithms</MiniHeading>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {algorithms.map((a) => (
              <li key={a.name} className={`card-raised p-4 ${a.name === 'XGBoost' ? 'border-brand/40' : ''}`}>
                <p className="font-semibold text-ink">
                  {a.name}
                  {a.name === 'XGBoost' && <span className="badge badge-safe ml-2">Deployed</span>}
                </p>
                <p className="mt-1.5 text-[0.83rem] leading-relaxed text-muted">{a.text}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <MiniHeading>Nested feature sets</MiniHeading>
          <ul className="mt-4 space-y-3">
            {featureSets.map((f) => (
              <li key={f.name} className="card-raised flex items-center gap-4 p-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-cyan/10 font-mono text-lg font-bold text-cyan">
                  {f.count}
                </span>
                <div className="min-w-0">
                  <p className="break-words font-mono text-[0.82rem] font-semibold text-ink">{f.name}</p>
                  <p className="text-[0.83rem] text-muted">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-line/10 px-6 py-4">
          <MiniHeading>Experimental design (thesis Table 2.5)</MiniHeading>
          <p className="mt-1 text-[0.82rem] text-muted">Synthetic data was used only for training; every test set is a real worker that was not used for training in that experiment.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[640px]">
            <thead>
              <tr>
                <th scope="col">Experiment</th>
                <th scope="col">Training data</th>
                <th scope="col">Test data</th>
                <th scope="col">Training-side validation</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((e) => (
                <tr key={e.id} className={e.id === 2 ? 'bg-brand/[0.06]' : ''}>
                  <td className="cell-strong">{e.id}. {e.name}</td>
                  <td>{e.train}</td>
                  <td>{e.test}</td>
                  <td>{e.validation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="card p-6">
          <MiniHeading>Optimization, selection and metrics</MiniHeading>
          <div className="mt-4"><BulletList items={optimisation} /></div>
        </div>
        <div className="card flex gap-4 border-brand/30 p-6">
          <PackageCheck className="h-6 w-6 shrink-0 text-brand" aria-hidden="true" />
          <div>
            <MiniHeading>Deployed model</MiniHeading>
            <p className="mt-3 text-[0.88rem] leading-relaxed text-muted">{deployment}</p>
            <a href="#findings" className="mt-4 inline-block text-[0.86rem] font-semibold text-brand hover:underline">
              See the evaluation results →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
