import { presentations } from '../../data/documents.js';
import { Section, SectionHeader } from '../../components/ui/Section.jsx';
import { FileCard } from '../../components/ui/FileCard.jsx';

export function PresentationsSection() {
  return (
    <Section id="presentations" labelledBy="presentations-title">
      <SectionHeader
        id="presentations-title"
        eyebrow="05 · Presentations"
        title="Presentation slides"
        lead="Slides from past assessments as PDF, with a place reserved for the final presentation."
      />
      <ul className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {presentations.map((p, i) => (
          <FileCard key={p.id} item={p} kind="presentation" delay={(i % 4) * 60} />
        ))}
      </ul>
    </Section>
  );
}
