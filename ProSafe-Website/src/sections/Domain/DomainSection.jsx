import { navItems } from '../../data/site.js';
import { handleAnchorClick } from '../../lib/navigation.js';
import { Section, SectionHeader } from '../../components/ui/Section.jsx';
import { Reveal } from '../../components/ui/Reveal.jsx';
import { LiteratureSurvey } from './LiteratureSurvey.jsx';
import { ResearchGap } from './ResearchGap.jsx';
import { ResearchProblem } from './ResearchProblem.jsx';
import { Objectives } from './Objectives.jsx';
import { Methodology } from './Methodology/Methodology.jsx';
import { Technologies } from './Technologies.jsx';
import { Findings } from './Findings.jsx';
import { References } from './References.jsx';

const subsections = navItems.find((item) => item.id === 'domain').children;

export function DomainSection() {
  return (
    <Section id="domain" labelledBy="domain-title" tinted>
      <SectionHeader
        id="domain-title"
        eyebrow="02 · Domain"
        title="Research domain"
        lead="The literature behind ProSafe, the gap it targets, the research problem and objectives, and how the system was designed, built and evaluated."
      />

      <Reveal as="nav" aria-label="Domain contents" className="mt-8">
        <ol className="flex flex-wrap gap-2">
          {subsections.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                onClick={(e) => handleAnchorClick(e, s.id)}
                className="inline-flex items-center gap-2 rounded-full border border-line/20 bg-surface/70 px-3.5 py-1.5 text-[0.84rem] font-medium text-muted transition-colors hover:border-brand/40 hover:text-brand"
              >
                <span className="font-mono text-[0.72rem] text-brand/80">{String(i + 1).padStart(2, '0')}</span>
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </Reveal>

      <LiteratureSurvey />
      <ResearchGap />
      <ResearchProblem />
      <Objectives />
      <Methodology />
      <Technologies />
      <Findings />
      <References />
    </Section>
  );
}
