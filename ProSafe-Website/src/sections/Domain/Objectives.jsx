import { Target } from 'lucide-react';
import { objectives } from '../../data/domain.js';
import { SubSection } from '../../components/ui/Section.jsx';
import { Reveal } from '../../components/ui/Reveal.jsx';
import { IconTile } from '../../components/ui/Icon.jsx';

export function Objectives() {
  return (
    <SubSection
      id="research-objectives"
      eyebrow="2.4 · Research Objectives"
      title="Research objectives"
      lead="One main objective, delivered through five specific objectives that map onto the components of the system."
    >
      <Reveal className="card flex flex-col gap-5 border-brand/30 p-7 shadow-glow sm:flex-row sm:p-8">
        <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-brand text-[#06210f]">
          <Target className="h-7 w-7" aria-hidden="true" />
        </span>
        <div>
          <h4 className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand">Main objective</h4>
          <p className="mt-2 text-[1.06rem] font-medium leading-relaxed text-ink sm:text-[1.15rem]">{objectives.main}</p>
        </div>
      </Reveal>

      <h4 className="mt-12 text-[0.78rem] font-bold uppercase tracking-[0.14em] text-muted">Specific objectives</h4>
      <ol className="relative mt-5 space-y-4 before:absolute before:bottom-6 before:left-[27px] before:top-6 before:w-px before:bg-line/20 lg:grid lg:grid-cols-5 lg:gap-4 lg:space-y-0 lg:before:hidden">
        {objectives.specific.map((o, i) => (
          <Reveal as="li" key={o.title} delay={i * 60} className="relative flex gap-4 lg:flex-col">
            <div className="relative z-[1]">
              <IconTile name={o.icon} size="lg" tone={i % 2 ? 'cyan' : 'brand'} />
            </div>
            <div className="card flex-1 p-5">
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-brand">Objective {i + 1}</p>
              <p className="mt-1 font-bold text-ink">{o.title}</p>
              <p className="mt-2 text-[0.85rem] leading-relaxed text-muted">{o.text}</p>
            </div>
          </Reveal>
        ))}
      </ol>
    </SubSection>
  );
}
