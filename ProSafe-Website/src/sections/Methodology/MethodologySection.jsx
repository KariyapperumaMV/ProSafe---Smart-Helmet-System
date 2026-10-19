import { methodologyCites, methodologyIntro } from '../../data/methodology.js';
import { Section, SectionHeader, SubSection } from '../../components/ui/Section.jsx';
import { Reveal } from '../../components/ui/Reveal.jsx';
import { Cites } from '../../components/ui/Cite.jsx';
import { ResearchProcess } from './ResearchProcess.jsx';
import { Architecture } from './Architecture.jsx';
import { MlPipeline } from './MlPipeline.jsx';
import { TechStack } from './TechStack.jsx';
import { platformIntro, screenshots, videos } from '../../data/showcase.js';
import { ScreenshotGallery } from '../../components/showcase/ScreenshotGallery.jsx';
import { VideoCard } from '../../components/showcase/VideoCard.jsx';

export function MethodologySection() {
  return (
    <Section id="methodology" labelledBy="methodology-title">
      <SectionHeader id="methodology-title" eyebrow="03 · Methodology" title="How ProSafe was built and evaluated" />
      <Reveal className="mt-4 max-w-3xl">
        <p className="lead">
          {methodologyIntro} <Cites ids={methodologyCites} />
        </p>
      </Reveal>

      <SubSection id="research-process" eyebrow="Research process" title="Design Science Research in eight steps">
        <ResearchProcess />
      </SubSection>

      <SubSection
        id="architecture"
        eyebrow="System architecture"
        title="Five components, one pipeline"
        lead="Select a component to see its role. Arrows show how data moves between the helmet, backend, ML service, database and web application."
      >
        <Architecture />
      </SubSection>

      <SubSection id="platform" eyebrow="Web application" title="ProSafe Monitoring Platform" lead={platformIntro}>
        <Reveal>
          <ScreenshotGallery items={screenshots} />
        </Reveal>
      </SubSection>

      <SubSection
        id="ml-pipeline"
        eyebrow="Machine learning methodology"
        title="From raw readings to a safety response"
        lead="Eight stages turn one-second sensor readings into a personalized, quality-checked risk classification and feedback."
      >
        <MlPipeline />
      </SubSection>

      <SubSection id="technologies" eyebrow="Technology stack" title="Technologies used">
        <TechStack />
      </SubSection>

      <SubSection id="in-action" eyebrow="Videos" title="ProSafe in Action">
        <div className="grid gap-5 md:grid-cols-2">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      </SubSection>
    </Section>
  );
}
