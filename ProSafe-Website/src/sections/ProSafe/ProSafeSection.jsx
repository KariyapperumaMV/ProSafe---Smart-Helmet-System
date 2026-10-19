import { ChevronDown, Quote, Target } from 'lucide-react';
import {
  contribution, objectives, problemContext, problemContextCites, problems, prosafeIntro, researchGaps, researchQuestion,
} from '../../data/prosafe.js';
import { Section, SectionHeader, SubSection } from '../../components/ui/Section.jsx';
import { Reveal } from '../../components/ui/Reveal.jsx';
import { Cites } from '../../components/ui/Cite.jsx';
import { IconTile } from '../../components/ui/Icon.jsx';
import { HelmetShowcase } from '../../components/helmet/HelmetShowcase.jsx';
import { References } from './References.jsx';

export function ProSafeSection() {
  return (
    <Section id="prosafe" labelledBy="prosafe-title" tinted>
      <SectionHeader id="prosafe-title" eyebrow="02 · ProSafe" title="What ProSafe is and why it matters" lead={prosafeIntro} />

      <SubSection id="problem" eyebrow="The problem" title="Construction safety challenges">
        <ul className="grid gap-4 md:grid-cols-3">
          {problems.map((p, i) => (
            <Reveal as="li" key={p.title} delay={i * 60} className="card card-hover p-6">
              <IconTile name={p.icon} tone="warning" />
              <h4 className="mt-4 text-[1.05rem] font-bold">{p.title}</h4>
              <p className="mt-2 text-[0.88rem] leading-relaxed text-muted">
                {p.text} <Cites ids={p.cites} />
              </p>
            </Reveal>
          ))}
        </ul>
        <p className="mt-4 text-[0.86rem] text-muted">
          {problemContext} <Cites ids={problemContextCites} />
        </p>
      </SubSection>

      <SubSection id="research-gap" eyebrow="Research gap & contribution" title="Five gaps, one integrated framework">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {researchGaps.map((g, i) => (
            <Reveal as="li" key={g.title} delay={i * 50} className="card-raised relative flex flex-col p-4">
              <span className="text-[1.6rem] font-extrabold leading-none text-brand/40" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <h4 className="mt-2 text-[0.95rem] font-bold leading-snug text-ink">
                <span className="sr-only">Gap {i + 1}: </span>
                {g.title}
              </h4>
              <p className="mt-1.5 flex-1 text-[0.8rem] leading-relaxed text-muted">{g.text}</p>
              <p className="mt-2 text-[0.74rem]"><Cites ids={g.cites} /></p>
            </Reveal>
          ))}
        </ol>
        <Reveal className="mt-4 flex gap-4 rounded-md border border-brand/30 bg-brand/[0.06] p-5">
          <Target className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
          <p className="text-[0.92rem] leading-relaxed text-ink/90">{contribution}</p>
        </Reveal>
        <Reveal className="relative mt-4 overflow-hidden rounded-md border border-line/15 bg-surface/70 p-5 sm:p-6">
          <Quote className="absolute right-4 top-4 h-10 w-10 text-brand/15" aria-hidden="true" />
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-brand">Research question</p>
          <blockquote className="mt-2 max-w-4xl text-[0.98rem] font-medium leading-relaxed text-ink">{researchQuestion}</blockquote>
        </Reveal>
      </SubSection>

      <SubSection id="research-objectives" eyebrow="Objectives" title="Research objectives">
        <Reveal className="card border-brand/30 p-6 shadow-glow">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-brand">Main objective</p>
          <p className="mt-2 text-[1rem] font-medium leading-relaxed text-ink sm:text-[1.06rem]">{objectives.main}</p>
          <details className="group mt-5 border-t border-line/10 pt-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[0.9rem] font-semibold text-brand [&::-webkit-details-marker]:hidden">
              View the five specific objectives
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {objectives.specific.map((o, i) => (
                <li key={o.title} className="card-raised p-4">
                  <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-cyan">Objective {i + 1}</p>
                  <p className="mt-1 font-semibold text-ink">{o.title}</p>
                  <p className="mt-1.5 text-[0.8rem] leading-relaxed text-muted">{o.text}</p>
                </li>
              ))}
            </ol>
          </details>
        </Reveal>
        <div className="mt-4">
          <References />
        </div>
      </SubSection>

      <SubSection
        id="helmet"
        eyebrow="The hardware"
        title="Explore the smart helmet in 3D"
        lead="Rotate the helmet in any direction, zoom in and select a numbered component to see what it measures and how ProSafe uses it."
      >
        <HelmetShowcase />
      </SubSection>
    </Section>
  );
}
