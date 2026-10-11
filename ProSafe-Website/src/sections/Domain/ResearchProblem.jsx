import { Quote } from 'lucide-react';
import { researchProblem } from '../../data/domain.js';
import { SubSection } from '../../components/ui/Section.jsx';
import { Reveal } from '../../components/ui/Reveal.jsx';
import { Cites } from '../../components/ui/Cite.jsx';
import { IconTile } from '../../components/ui/Icon.jsx';

export function ResearchProblem() {
  return (
    <SubSection
      id="research-problem"
      eyebrow="2.3 · Research Problem"
      title="Why fixed thresholds are not enough"
      lead="Conventional supervision is periodic, and fixed-threshold wearables judge isolated readings against limits designed for an average worker."
    >
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <Reveal>
          {researchProblem.context.map((p) => (
            <p key={p.slice(0, 20)} className="body-text">
              {p} <Cites ids={researchProblem.contextCites} />
            </p>
          ))}
          <p className="body-text mt-4">{researchProblem.consequences}</p>
          <p className="mt-6 rounded-md border border-line/15 bg-surface/60 p-5 text-[0.95rem] leading-relaxed text-ink/90">
            <span className="font-semibold text-brand">Problem statement. </span>
            {researchProblem.statement}
          </p>
        </Reveal>

        <Reveal delay={80}>
          <h4 className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-muted">Why reliable classification is difficult</h4>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {researchProblem.difficulties.map((d) => (
              <li key={d.title} className="card-raised p-4">
                <IconTile name={d.icon} tone="warning" size="sm" />
                <p className="mt-3 font-semibold text-ink">{d.title}</p>
                <p className="mt-1 text-[0.84rem] leading-relaxed text-muted">{d.text}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>

      <Reveal className="relative mt-12 overflow-hidden rounded-lg border border-brand/30 bg-gradient-to-br from-brand/[0.12] via-surface/80 to-cyan/[0.08] p-7 sm:p-10">
        <Quote className="absolute right-6 top-6 h-16 w-16 text-brand/15" aria-hidden="true" />
        <p className="eyebrow">Primary research question</p>
        <blockquote className="relative mt-5 text-[1.15rem] font-semibold leading-relaxed text-ink sm:text-[1.35rem]">
          {researchProblem.question}
        </blockquote>
      </Reveal>
    </SubSection>
  );
}
