import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allFiles, documents, presentations } from '../data/documents.js';
import { milestones } from '../data/milestones.js';
import { references } from '../data/references.js';
import { problems, problemContextCites, researchGaps, objectives } from '../data/prosafe.js';
import { highlights, sensors } from '../data/home.js';
import { architecture, methodologyCites, pipelineStages, processSteps, datasets } from '../data/methodology.js';
import { technologyGroups } from '../data/technologies.js';
import { allAlgorithms, deployedComparison, experiments, findings, testingResults } from '../data/results.js';
import { helmetComponents } from '../data/helmet.js';
import { iconNames } from '../components/ui/icons.js';
import { hasBrandIcon } from '../components/ui/brandIcons.js';
import { formatBytes } from '../lib/format.js';

const publicDir = resolve(__dirname, '../../public');

describe('documents and presentations', () => {
  it('links every available item to a real PDF with an accurate size label', () => {
    for (const item of allFiles.filter((f) => f.status === 'available')) {
      const path = resolve(publicDir, `.${item.file}`);
      expect(existsSync(path), `${item.file} exists`).toBe(true);
      expect(item.size, `${item.id} size`).toBe(formatBytes(statSync(path).size));
      expect(readFileSync(path).subarray(0, 5).toString(), `${item.id} is a PDF`).toBe('%PDF-');
    }
  });

  it('never links an item that is not available', () => {
    for (const item of allFiles.filter((f) => f.status !== 'available')) expect(item.file, item.id).toBeNull();
  });

  it('covers the document and presentation types in the guidelines', () => {
    expect(documents.map((d) => d.category)).toEqual(expect.arrayContaining(['Project Charter', 'Proposal', 'Checklist', 'Thesis']));
    expect(presentations.map((p) => p.title)).toEqual(['Proposal Presentation', 'Progress Presentation 1', 'Progress Presentation 2', 'Final Presentation']);
  });
});

describe('milestones', () => {
  it('includes every assessment required by the guidelines', () => {
    expect(milestones.map((m) => m.title)).toEqual(expect.arrayContaining(['Project Proposal', 'Progress Presentation 1', 'Progress Presentation 2', 'Final Assessment', 'Viva']));
  });

  it('only links to known documents', () => {
    const known = new Set(allFiles.map((f) => f.id));
    for (const m of milestones) for (const id of m.links) expect(known.has(id), `${m.id} -> ${id}`).toBe(true);
  });

  it('only shows the verified mark (Final Report, 19%)', () => {
    const withMarks = milestones.filter((m) => m.marks);
    expect(withMarks.map((m) => [m.id, m.marks])).toEqual([['dissertation', '19%']]);
  });
});

describe('content integrity', () => {
  it('only cites references that are listed', () => {
    const known = new Set(references.map((r) => r.n));
    const used = [...problems.flatMap((p) => p.cites), ...problemContextCites, ...researchGaps.flatMap((g) => g.cites), ...methodologyCites];
    for (const n of used) expect(known.has(n), `[${n}]`).toBe(true);
  });

  it('keeps the V4 structure: five gaps, five objectives, eight process steps covering eleven stages', () => {
    expect(researchGaps).toHaveLength(5);
    expect(objectives.specific).toHaveLength(5);
    expect(processSteps.flatMap((s) => s.stages)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(pipelineStages).toHaveLength(8);
    expect(architecture.components.map((c) => c.id)).toEqual(['helmet', 'backend', 'ml', 'db', 'web']);
  });

  it('describes three real workers and four synthetic profiles (V4 Table 2.3)', () => {
    expect(datasets.real.map((w) => w.id)).toEqual(['W_001', 'W_002', 'W_003']);
    expect(datasets.synthetic).toHaveLength(4);
    const raw = [...datasets.real, ...datasets.synthetic].reduce((a, w) => a + w.raw, 0);
    const ready = [...datasets.real, ...datasets.synthetic].reduce((a, w) => a + w.ready, 0);
    expect([raw, ready]).toEqual([datasets.totals.raw, datasets.totals.ready]);
    expect(raw - ready).toBe(datasets.totals.uncertain);
  });

  it('shows all nine verified hardware components with the required caveats', () => {
    expect(helmetComponents.map((c) => c.part)).toEqual(['ESP32', 'DHT11', 'GUVA-S12SD', 'MQ-2', 'INMP441', 'LM35', 'MAX30102', 'RGB LED', 'Push button']);
    const text = (part) => helmetComponents.find((c) => c.part === part).measures;
    expect(text('LM35')).toMatch(/not measure core body temperature/);
    expect(text('MQ-2')).toMatch(/not verified ppm/);
    expect(text('INMP441')).toMatch(/unweighted/);
    expect(text('GUVA-S12SD')).toMatch(/estimate/);
  });

  it('only uses registered icons', () => {
    const named = [...highlights, ...sensors, ...problems, ...pipelineStages, ...findings, ...architecture.components].map((x) => x.icon);
    for (const name of named) expect(iconNames, name).toContain(name);
    for (const group of technologyGroups) {
      for (const item of group.items) expect(hasBrandIcon(item.icon) || iconNames.includes(item.lucide) || Boolean(item.monogram), item.name).toBe(true);
    }
  });
});

describe('results', () => {
  it('reports the deployed configuration consistently (Experiments 2 and 5)', () => {
    const [w2, w3] = deployedComparison.workers;
    const e2 = experiments.find((e) => e.exp === 2);
    const e5 = experiments.find((e) => e.exp === 5);
    expect([w2.accuracy, w2.balancedAccuracy, w2.macroF1, w2.criticalRecall]).toEqual([e2.acc, e2.bal, e2.f1, e2.crit]);
    expect([w3.accuracy, w3.balancedAccuracy, w3.macroF1, w3.criticalRecall]).toEqual([e5.acc, e5.bal, e5.f1, e5.crit]);
    expect(Number(((w2.criticalDetected / w2.criticalTotal) * 100).toFixed(2))).toBe(w2.criticalRecall);
    expect(Number(((w3.criticalDetected / w3.criticalTotal) * 100).toFixed(2))).toBe(w3.criticalRecall);
  });

  it('keeps Table G.1 consistent with Table 3.2 for XGBoost', () => {
    for (const e of experiments) {
      const g = allAlgorithms.find((r) => r.exp === e.exp).xgb;
      expect(Math.abs(g[0] - e.f1), `exp ${e.exp} F1`).toBeLessThanOrEqual(0.06);
      expect(Math.abs(g[1] - e.crit), `exp ${e.exp} recall`).toBeLessThanOrEqual(0.06);
    }
  });

  it('reports test counts as passed/total', () => {
    for (const t of testingResults.filter((r) => r.total)) expect(t.passed).toBe(t.total);
  });

  // Cross-check XGBoost results against the experiment outputs in the ML service.
  const out = resolve(__dirname, '../../../ProSafe-ML-V2/outputs');
  const sources = [
    { exp: 1, file: 'final_experiment_summary.csv', key: 'EXP1' },
    { exp: 2, file: 'final_experiment_summary.csv', key: 'EXP2' },
    { exp: 3, file: 'final_experiment_summary.csv', key: 'EXP3' },
    { exp: 4, file: 'experiment_v2/w003_summary.csv', key: 'EXP1' },
    { exp: 5, file: 'experiment_v2/w003_summary.csv', key: 'EXP2' },
    { exp: 6, file: 'experiment_v2/w003_summary.csv', key: 'EXP3' },
    { exp: 7, file: 'experiment_v3/w002_summary.csv', key: 'EXP1' },
    { exp: 8, file: 'experiment_v4/w003_summary.csv', key: 'V4' },
  ];
  const available = sources.every((s) => existsSync(resolve(out, s.file)));

  it.skipIf(!available)('matches the XGBoost rows of the ML experiment outputs', () => {
    for (const s of sources) {
      const [header, ...lines] = readFileSync(resolve(out, s.file), 'utf8').trim().split(/\r?\n/);
      const cols = header.split(',');
      const row = lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v]))).find((r) => r.experiment === s.key && r.model === 'XGBoost');
      const e = experiments.find((x) => x.exp === s.exp);
      const pct = (v) => Number((Number(v) * 100).toFixed(2));
      expect([e.acc, e.bal, e.f1, e.crit], `experiment ${s.exp}`).toEqual([pct(row.accuracy), pct(row.balanced_accuracy), pct(row.macro_f1), pct(row.critical_recall)]);
    }
  });
});
