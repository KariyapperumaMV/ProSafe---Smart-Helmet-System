import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allFiles, documents, presentations } from '../data/documents.js';
import { milestones } from '../data/milestones.js';
import { references } from '../data/references.js';
import { literature, researchGaps, comparisonStudies, researchProblem, objectives } from '../data/domain.js';
import { features, workflow, sensors, challenge } from '../data/home.js';
import { methodologyTabs, architecture } from '../data/methodology.js';
import { technologyGroups, integrations } from '../data/technologies.js';
import { experiment2, xgboostAcrossExperiments, keyFindings, limitations } from '../data/findings.js';
import { iconNames } from '../components/ui/icons.js';
import { hasBrandIcon } from '../components/ui/brandIcons.js';
import { formatBytes } from '../lib/format.js';

const publicDir = resolve(__dirname, '../../public');

describe('documents and presentations', () => {
  it('links every available item to a real file with an accurate size label', () => {
    for (const item of allFiles.filter((f) => f.status === 'available')) {
      expect(item.file, item.id).toMatch(/^\/(documents|presentations)\/[a-z0-9-]+\.pdf$/);
      const path = resolve(publicDir, `.${item.file}`);
      expect(existsSync(path), `${item.file} exists`).toBe(true);
      expect(item.size, `${item.id} size`).toBe(formatBytes(statSync(path).size));
      expect(readFileSync(path).subarray(0, 5).toString(), `${item.id} is a PDF`).toBe('%PDF-');
    }
  });

  it('never gives a link to an item that is not available', () => {
    for (const item of allFiles.filter((f) => f.status !== 'available')) {
      expect(item.file, item.id).toBeNull();
    }
  });

  it('covers every document type required by the website guidelines', () => {
    const categories = documents.map((d) => d.category);
    expect(categories).toEqual(expect.arrayContaining(['Project Charter', 'Proposal', 'Checklist', 'Thesis']));
    const titles = presentations.map((p) => p.title);
    expect(titles).toEqual(['Proposal Presentation', 'Progress Presentation 1', 'Progress Presentation 2', 'Final Presentation']);
  });

  it('uses unique ids', () => {
    const ids = allFiles.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('milestones', () => {
  it('includes every assessment required by the guidelines', () => {
    const titles = milestones.map((m) => m.title);
    expect(titles).toEqual(expect.arrayContaining(['Project Proposal', 'Progress Presentation 1', 'Progress Presentation 2', 'Final Assessment', 'Viva']));
  });

  it('only links to known documents', () => {
    const known = new Set(allFiles.map((f) => f.id));
    for (const m of milestones) for (const id of m.links) expect(known.has(id), `${m.id} -> ${id}`).toBe(true);
  });

  it('does not invent marks', () => {
    for (const m of milestones) expect(m.marks).toBeNull();
  });
});

describe('citations', () => {
  const known = new Set(references.map((r) => r.n));
  const used = [
    ...literature.introCites.flat(),
    ...literature.topics.flatMap((t) => t.cites),
    ...literature.evolution.flatMap((e) => e.cites),
    ...researchGaps.flatMap((g) => g.cites),
    ...comparisonStudies.map((s) => s.ref).filter(Boolean),
    ...researchProblem.contextCites,
    ...challenge.cites,
  ];

  it('only cites references that are listed', () => {
    for (const n of used) expect(known.has(n), `[${n}]`).toBe(true);
  });

  it('numbers references consecutively', () => {
    expect(references.map((r) => r.n)).toEqual(references.map((_, i) => i + 1));
  });
});

describe('content structure', () => {
  it('has five research gaps and five specific objectives', () => {
    expect(researchGaps).toHaveLength(5);
    expect(objectives.specific).toHaveLength(5);
  });

  it('describes six sensing channels and five architecture components', () => {
    expect(sensors).toHaveLength(6);
    expect(architecture.components.map((c) => c.id)).toEqual(['helmet', 'backend', 'ml', 'db', 'web']);
  });

  it('only uses icons that are registered', () => {
    const named = [
      ...features, ...workflow, ...sensors, ...literature.topics, ...objectives.specific, ...researchProblem.difficulties,
      ...methodologyTabs, ...keyFindings, ...limitations,
    ].map((x) => x.icon);
    for (const name of named) expect(iconNames, name).toContain(name);
    for (const group of technologyGroups) {
      expect(iconNames).toContain(group.lucide);
      for (const item of group.items) {
        const ok = hasBrandIcon(item.icon) || iconNames.includes(item.lucide) || Boolean(item.monogram);
        expect(ok, item.name).toBe(true);
      }
    }
    for (const item of integrations) expect(iconNames).toContain(item.lucide);
  });
});

describe('reported results match the experiment outputs', () => {
  const csvPath = resolve(__dirname, '../../../ProSafe-ML-V2/outputs/final_experiment_summary.csv');
  const available = existsSync(csvPath);

  it.skipIf(!available)('uses the values in final_experiment_summary.csv', () => {
    const [header, ...lines] = readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
    const cols = header.split(',');
    const rows = lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [cols[i], v])));
    const find = (exp, model) => rows.find((r) => r.experiment === exp && r.model === model);
    const round = (v) => Number(Number(v).toFixed(4));

    for (const r of experiment2) {
      const src = find('EXP2', r.model);
      expect(r.accuracy).toBe(round(src.accuracy));
      expect(r.balancedAccuracy).toBe(round(src.balanced_accuracy));
      expect(r.macroF1).toBe(round(src.macro_f1));
      expect(r.criticalRecall).toBe(round(src.critical_recall));
    }
    xgboostAcrossExperiments.forEach((r, i) => {
      const src = find(`EXP${i + 1}`, 'XGBoost');
      expect(r.accuracy).toBe(round(src.accuracy));
      expect(r.balancedAccuracy).toBe(round(src.balanced_accuracy));
      expect(r.macroF1).toBe(round(src.macro_f1));
      expect(r.criticalRecall).toBe(round(src.critical_recall));
      expect(r.criticalToSafe).toBe(Number(src.critical_to_safe_count));
    });
  });
});
