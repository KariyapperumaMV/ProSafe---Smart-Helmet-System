import { ArrowRight } from 'lucide-react';
import { literature } from '../../data/domain.js';
import { SubSection } from '../../components/ui/Section.jsx';
import { Reveal } from '../../components/ui/Reveal.jsx';
import { Cites } from '../../components/ui/Cite.jsx';
import { IconTile } from '../../components/ui/Icon.jsx';

export function LiteratureSurvey() {
  return (
    <SubSection
      id="literature-survey"
      eyebrow="2.1 · Literature Survey"
      title="Background literature"
      lead="What existing research says about construction safety, wearable sensing and machine learning, and where it leaves open questions."
    >
      <Reveal className="grid gap-6 lg:grid-cols-3">
        {literature.intro.map((p, i) => (
          <p key={p.slice(0, 20)} className="body-text">
            {p} <Cites ids={literature.introCites[i]} />
          </p>
        ))}
      </Reveal>

      <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {literature.topics.map((topic, i) => (
          <Reveal as="li" key={topic.title} delay={(i % 3) * 60} className="card card-hover flex flex-col p-6">
            <div className="flex items-start gap-3">
              <IconTile name={topic.icon} tone={i % 3 === 1 ? 'cyan' : 'brand'} size="sm" />
              <h4 className="pt-1.5 text-[1rem] font-bold leading-snug">{topic.title}</h4>
            </div>
            <p className="mt-3 flex-1 text-[0.88rem] leading-relaxed text-muted">{topic.text}</p>
            <p className="mt-4 text-[0.78rem] text-muted">
              <Cites ids={topic.cites} />
            </p>
          </Reveal>
        ))}
      </ul>

      <Reveal className="card mt-12 p-6 sm:p-8">
        <h4 className="text-[1.15rem] font-bold">How wearable safety monitoring has developed</h4>
        <p className="mt-1 text-[0.86rem] text-muted">
          Three overlapping stages, used in the thesis as an organizing framework rather than a formal classification.
        </p>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {literature.evolution.map((stage, i) => (
            <li key={stage.stage} className="relative">
              <div className="card-raised h-full p-5">
                <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-brand">Stage {i + 1}</p>
                <p className="mt-1 font-bold text-ink">{stage.stage}</p>
                <p className="mt-2 text-[0.86rem] leading-relaxed text-muted">
                  {stage.text} <Cites ids={stage.cites} />
                </p>
              </div>
              {i < literature.evolution.length - 1 && (
                <ArrowRight className="absolute -right-3.5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-brand/70 md:block" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
      </Reveal>

      <Reveal className="mt-8 rounded-md border-l-4 border-brand bg-brand/[0.06] p-6">
        <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-brand">Synthesis</p>
        <p className="mt-2 text-[0.98rem] leading-relaxed text-ink/90">{literature.synthesis}</p>
      </Reveal>
    </SubSection>
  );
}
