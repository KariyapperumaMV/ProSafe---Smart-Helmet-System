import { Info } from 'lucide-react';
import { architecture } from '../../../data/methodology.js';
import { ArchitectureDiagram, DataFlowStrip } from '../../../components/diagrams/ArchitectureDiagram.jsx';
import { MiniHeading, PanelHeading } from './PanelHeading.jsx';

export function ArchitecturePanel() {
  return (
    <div className="space-y-10">
      <PanelHeading title="Overall system architecture">
        ProSafe consists of five primary components. The Node.js backend sits at the centre: it receives helmet data, calls the
        ML service, stores results in MongoDB, and serves the React web application and the helmet’s status commands.
      </PanelHeading>

      <div>
        <MiniHeading>Simplified data flow</MiniHeading>
        <div className="mt-4"><DataFlowStrip /></div>
      </div>

      <ArchitectureDiagram />

      <ul className="grid gap-4 md:grid-cols-3">
        {architecture.notes.map((note) => (
          <li key={note.slice(0, 24)} className="card-raised flex gap-3 p-5 text-[0.86rem] leading-relaxed text-muted">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan" aria-hidden="true" />
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
