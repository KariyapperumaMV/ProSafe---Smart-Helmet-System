import { Info } from 'lucide-react';
import { documentNote, documents } from '../../data/documents.js';
import { Section, SectionHeader } from '../../components/ui/Section.jsx';
import { Reveal } from '../../components/ui/Reveal.jsx';
import { FileCard } from '../../components/ui/FileCard.jsx';

export function DocumentsSection() {
  const availableCount = documents.filter((d) => d.status === 'available').length;
  return (
    <Section id="documents" labelledBy="documents-title" tinted>
      <SectionHeader
        id="documents-title"
        eyebrow="04 · Documents"
        title="Research documents"
        lead={`Documents produced during the project, and those still to come. ${availableCount} of ${documents.length} are available to view or download as PDF.`}
      />

      <Reveal className="mt-8 flex gap-3 rounded-md border border-cyan/30 bg-cyan/[0.06] p-4 text-[0.86rem] leading-relaxed text-muted">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-cyan" aria-hidden="true" />
        <p>{documentNote}</p>
      </Reveal>

      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {documents.map((doc, i) => (
          <FileCard key={doc.id} item={doc} delay={(i % 3) * 60} />
        ))}
      </ul>
    </Section>
  );
}
