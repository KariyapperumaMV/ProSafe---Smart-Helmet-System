import {
  dataCollection, datasetTotals, datasets, equations, featureGroups, featureNotes, labellingNote, labellingRules, preprocessing,
} from '../../../data/methodology.js';
import { BulletList, MiniHeading, PanelHeading } from './PanelHeading.jsx';

const n = (v) => v.toLocaleString('en-US');

export function DataPanel() {
  return (
    <div className="space-y-10">
      <PanelHeading title="Datasets, labelling and feature engineering">
        Each observation combines environmental and physiological measurements at about one-second intervals, because temporal
        features depend on closely spaced, ordered readings.
      </PanelHeading>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <div className="card overflow-hidden">
          <div className="border-b border-line/10 px-6 py-4">
            <MiniHeading>Records at each dataset stage (thesis Table 2.2)</MiniHeading>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[480px]">
              <thead>
                <tr>
                  <th scope="col">Worker</th>
                  <th scope="col">Source</th>
                  <th scope="col">Role</th>
                  <th scope="col" className="text-right">Raw</th>
                  <th scope="col" className="text-right">ML-ready</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <tr key={d.worker}>
                    <td className="cell-strong font-mono">{d.worker}</td>
                    <td><span className={`badge ${d.type === 'Real' ? 'badge-safe' : 'badge-neutral'}`}>{d.type}</span></td>
                    <td>{d.use}</td>
                    <td className="text-right font-mono">{n(d.raw)}</td>
                    <td className="text-right font-mono">{n(d.ready)}</td>
                  </tr>
                ))}
                <tr className="bg-white/[0.03]">
                  <td className="cell-strong" colSpan={3}>Total</td>
                  <td className="cell-strong text-right font-mono">{n(datasetTotals.raw)}</td>
                  <td className="cell-strong text-right font-mono">{n(datasetTotals.ready)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="border-t border-line/10 px-6 py-3 text-[0.8rem] text-muted">
            {n(datasetTotals.uncertain)} rows were classified as UNCERTAIN, mainly because of baseline calibration, unreliable readings or contact problems. Audit files keep every raw row.
          </p>
        </div>

        <div className="card p-6">
          <MiniHeading>Data sources</MiniHeading>
          <div className="mt-4 space-y-3 text-[0.88rem] leading-relaxed text-muted">
            {dataCollection.map((p) => <p key={p.slice(0, 20)}>{p}</p>)}
          </div>
        </div>
      </div>

      <div className="card p-6">
        <MiniHeading>Offline preprocessing</MiniHeading>
        <div className="mt-4"><BulletList items={preprocessing} /></div>
      </div>

      <div>
        <MiniHeading>Reference-labelling framework (thesis Table 2.3)</MiniHeading>
        <ul className="mt-4 grid gap-4 lg:grid-cols-3">
          {labellingRules.map((rule) => (
            <li key={rule.label} className="card-raised p-5">
              <span className={`badge ${rule.className}`}>{rule.label}</span>
              <p className="mt-3 text-[0.85rem] leading-relaxed text-muted">{rule.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[0.84rem] leading-relaxed text-muted">{labellingNote}</p>
      </div>

      <div>
        <MiniHeading>Personalized and temporal calculations</MiniHeading>
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {equations.map((eq) => (
            <li key={eq.label} className="card-raised min-w-0 p-5">
              <p className="text-[0.82rem] font-semibold text-ink">{eq.label}</p>
              <p className="mt-2 overflow-x-auto whitespace-nowrap rounded-sm bg-black/30 px-3 py-2 font-mono text-[0.85rem] text-cyan">{eq.formula}</p>
              <p className="mt-2 text-[0.8rem] text-muted">{eq.note}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="card overflow-hidden">
          <div className="border-b border-line/10 px-6 py-4">
            <MiniHeading>EXTENDED feature set: 38 features (thesis Table 2.4)</MiniHeading>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[560px]">
              <thead>
                <tr>
                  <th scope="col">Feature group</th>
                  <th scope="col" className="text-right">Count</th>
                  <th scope="col">Example</th>
                  <th scope="col">Purpose</th>
                </tr>
              </thead>
              <tbody>
                {featureGroups.map((f) => (
                  <tr key={f.group}>
                    <td className="cell-strong">{f.group}</td>
                    <td className="text-right font-mono">{f.count}</td>
                    <td className="font-mono text-[0.78rem]">{f.example}</td>
                    <td>{f.purpose}</td>
                  </tr>
                ))}
                <tr className="bg-white/[0.03]">
                  <td className="cell-strong">Total</td>
                  <td className="cell-strong text-right font-mono">38</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="card p-6">
          <MiniHeading>Design decisions</MiniHeading>
          <div className="mt-4"><BulletList items={featureNotes} tone="cyan" /></div>
        </div>
      </div>
    </div>
  );
}
