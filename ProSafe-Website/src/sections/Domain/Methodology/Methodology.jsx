import { useCallback, useEffect, useState } from 'react';
import { methodologyIntro, methodologyTabs } from '../../../data/methodology.js';
import { SubSection } from '../../../components/ui/Section.jsx';
import { Reveal } from '../../../components/ui/Reveal.jsx';
import { TabPanel, Tabs } from '../../../components/ui/Tabs.jsx';
import { ProcessPanel } from './ProcessPanel.jsx';
import { ArchitecturePanel } from './ArchitecturePanel.jsx';
import { HardwarePanel } from './HardwarePanel.jsx';
import { DataPanel } from './DataPanel.jsx';
import { MlPanel } from './MlPanel.jsx';
import { RealtimePanel } from './RealtimePanel.jsx';

const PREFIX = 'methodology';
const tabIds = methodologyTabs.map((t) => t.id);

/** Reads "#methodology-<tab>" so each tab can be linked to directly. */
function tabFromHash() {
  if (typeof window === 'undefined') return null;
  const match = window.location.hash.match(/^#methodology-([a-z]+)$/);
  return match && tabIds.includes(match[1]) ? match[1] : null;
}

export function Methodology() {
  const [active, setActive] = useState(() => tabFromHash() ?? tabIds[0]);

  useEffect(() => {
    const onHash = () => {
      const tab = tabFromHash();
      if (tab) {
        setActive(tab);
        setTimeout(() => document.getElementById('methodology-tabs')?.scrollIntoView({ block: 'start' }), 0);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const change = useCallback((id) => {
    setActive(id);
    window.history.replaceState(null, '', `#${PREFIX}-${id}`);
  }, []);

  return (
    <SubSection
      id="methodology"
      eyebrow="2.5 · Research Methodology"
      title="Methodology and system design"
      lead="How ProSafe was designed, built and evaluated: the research process, the architecture, the helmet, the data, the ML pipeline and the real-time monitoring loop."
    >
      <Reveal>
        <p className="body-text max-w-prose">{methodologyIntro}</p>
      </Reveal>

      <div id="methodology-tabs" className="mt-10">
        <Tabs tabs={methodologyTabs} active={active} onChange={change} idPrefix={PREFIX} label="Methodology topics" />
        <TabPanel id="process" idPrefix={PREFIX} active={active}><ProcessPanel /></TabPanel>
        <TabPanel id="architecture" idPrefix={PREFIX} active={active}><ArchitecturePanel /></TabPanel>
        <TabPanel id="hardware" idPrefix={PREFIX} active={active}><HardwarePanel /></TabPanel>
        <TabPanel id="data" idPrefix={PREFIX} active={active}><DataPanel /></TabPanel>
        <TabPanel id="ml" idPrefix={PREFIX} active={active}><MlPanel /></TabPanel>
        <TabPanel id="realtime" idPrefix={PREFIX} active={active}><RealtimePanel /></TabPanel>
      </div>
    </SubSection>
  );
}
