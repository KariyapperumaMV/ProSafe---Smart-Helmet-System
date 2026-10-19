import { useEffect, useRef, useState } from 'react';
import { FileText, Flag, Info, Presentation } from 'lucide-react';
import { documentNote, documents, presentations } from '../../data/documents.js';
import { milestones } from '../../data/milestones.js';
import { resourceTabs } from '../../data/site.js';
import { RESOURCE_EVENT } from '../../lib/navigation.js';
import { Section, SectionHeader } from '../../components/ui/Section.jsx';
import { FileCard } from '../../components/ui/FileCard.jsx';
import { MilestonesPanel } from './MilestonesPanel.jsx';

const available = (list) => list.filter((d) => d.status === 'available').length;

const TABS = [
  { id: 'milestones', label: 'Milestones', Icon: Flag, summary: `${milestones.length} assessments` },
  { id: 'documents', label: 'Documents', Icon: FileText, summary: `${available(documents)} of ${documents.length} available` },
  { id: 'presentations', label: 'Presentations', Icon: Presentation, summary: `${available(presentations)} of ${presentations.length} available` },
];

function tabFromHash() {
  const id = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
  return resourceTabs.includes(id) ? id : null;
}

/** Milestones, documents and presentations behind accessible tabs. */
export function ResourcesSection() {
  const [active, setActive] = useState(() => tabFromHash() ?? 'milestones');
  const tabRefs = useRef([]);

  useEffect(() => {
    const onEvent = (e) => setActive(e.detail);
    window.addEventListener(RESOURCE_EVENT, onEvent);
    return () => window.removeEventListener(RESOURCE_EVENT, onEvent);
  }, []);

  const choose = (id) => {
    setActive(id);
    window.history.replaceState(null, '', `#${id}`);
  };

  const onKeyDown = (e, i) => {
    const map = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    const next = (map[e.key] + TABS.length) % TABS.length;
    tabRefs.current[next]?.focus();
    choose(TABS[next].id);
  };

  return (
    <Section id="resources" labelledBy="resources-title">
      <SectionHeader
        id="resources-title"
        eyebrow="05 · Resources"
        title="Academic resources"
        lead="Assessment milestones, research documents and presentation slides. Choose a category to see its details."
      />

      <div role="tablist" aria-label="Resource categories" className="mt-8 grid gap-3 sm:grid-cols-3">
        {TABS.map(({ id, label, Icon, summary }, i) => {
          const selected = id === active;
          return (
            <button
              key={id}
              ref={(el) => (tabRefs.current[i] = el)}
              role="tab"
              type="button"
              id={`resources-tab-${id}`}
              aria-selected={selected}
              aria-controls={`resources-panel-${id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`card flex items-center gap-4 p-4 text-left transition-colors ${selected ? 'border-brand/50 bg-brand/[0.08] shadow-glow' : 'hover:border-line/30'}`}
            >
              <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${selected ? 'bg-brand text-[#06210f] ring-brand' : 'bg-white/5 text-brand ring-line/20'}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-bold text-ink">{label}</span>
                <span className="block text-[0.8rem] text-muted">{summary}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`resources-panel-${active}`} aria-labelledby={`resources-tab-${active}`} tabIndex={0} className="mt-6 outline-none">
        {active === 'milestones' && <MilestonesPanel />}
        {active === 'documents' && (
          <>
            <p className="mb-4 flex gap-2.5 rounded-md border border-cyan/30 bg-cyan/[0.06] p-3.5 text-[0.82rem] leading-relaxed text-muted">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan" aria-hidden="true" />
              {documentNote}
            </p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {documents.map((d) => <FileCard key={d.id} item={d} />)}
            </ul>
          </>
        )}
        {active === 'presentations' && (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {presentations.map((p) => <FileCard key={p.id} item={p} kind="presentation" />)}
          </ul>
        )}
      </div>
    </Section>
  );
}
