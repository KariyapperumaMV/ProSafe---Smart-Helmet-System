import { CornerDownRight } from 'lucide-react';
import { comparisonStudies, gapResponse, researchGaps } from '../../data/domain.js';
import { SubSection } from '../../components/ui/Section.jsx';
import { Reveal } from '../../components/ui/Reveal.jsx';
import { Cites } from '../../components/ui/Cite.jsx';

function ComparisonTable() {
  return (
    <Reveal className="card mt-12 overflow-hidden">
      <div className="border-b border-line/10 px-6 py-5">
        <h4 className="text-[1.1rem] font-bold">Comparison of selected wearable safety monitoring studies</h4>
        <p className="mt-1 text-[0.84rem] text-muted">Condensed from thesis Table 1.1.</p>
      </div>

      {/* Table on larger screens */}
      <div className="hidden md:block">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col" className="w-[22%]">Study</th>
              <th scope="col">Monitoring and analysis approach</th>
              <th scope="col">Limitation relevant to ProSafe</th>
            </tr>
          </thead>
          <tbody>
            {comparisonStudies.map((s) => (
              <tr key={s.study} className={s.highlight ? 'bg-brand/[0.07]' : ''}>
                <td className="cell-strong">
                  {s.study} {s.ref && <Cites ids={[s.ref]} />}
                </td>
                <td>{s.approach}</td>
                <td>{s.limitation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stacked cards on small screens */}
      <ul className="divide-y divide-line/10 md:hidden">
        {comparisonStudies.map((s) => (
          <li key={s.study} className={`px-5 py-4 ${s.highlight ? 'bg-brand/[0.07]' : ''}`}>
            <p className="font-semibold text-ink">
              {s.study} {s.ref && <Cites ids={[s.ref]} />}
            </p>
            <p className="mt-1.5 text-[0.84rem] text-muted"><span className="font-semibold text-ink/80">Approach: </span>{s.approach}</p>
            <p className="mt-1 text-[0.84rem] text-muted"><span className="font-semibold text-ink/80">Limitation: </span>{s.limitation}</p>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

export function ResearchGap() {
  return (
    <SubSection
      id="research-gap"
      eyebrow="2.2 · Research Gap"
      title="Five related research gaps"
      lead="Each component of ProSafe has been explored before. The open question is how they behave when combined in one practical, near-real-time framework."
    >
      <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {researchGaps.map((gap, i) => (
          <Reveal as="li" key={gap.title} delay={(i % 3) * 60} className="card card-hover flex flex-col p-6">
            <span className="text-[2.2rem] font-extrabold leading-none text-brand/30" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h4 className="mt-3 text-[1.02rem] font-bold leading-snug">
              <span className="sr-only">Gap {i + 1}: </span>
              {gap.title}
            </h4>
            <p className="mt-2 flex-1 text-[0.88rem] leading-relaxed text-muted">
              {gap.text} <Cites ids={gap.cites} />
            </p>
            <p className="mt-4 flex gap-2 border-t border-line/10 pt-4 text-[0.84rem] text-ink/90">
              <CornerDownRight className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <span><span className="font-semibold text-brand">ProSafe: </span>{gap.response}</span>
            </p>
          </Reveal>
        ))}
        <Reveal as="li" delay={120} className="card flex flex-col justify-center border-brand/25 bg-brand/[0.05] p-6">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-brand">Intended contribution</p>
          <p className="mt-3 text-[0.9rem] leading-relaxed text-ink/90">{gapResponse}</p>
        </Reveal>
      </ol>

      <ComparisonTable />
    </SubSection>
  );
}
