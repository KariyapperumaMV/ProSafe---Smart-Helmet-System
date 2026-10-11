import { requirements } from '../../../data/methodology.js';
import { ResearchProcessDiagram } from '../../../components/diagrams/ResearchProcessDiagram.jsx';
import { BulletList, MiniHeading, PanelHeading } from './PanelHeading.jsx';

export function ProcessPanel() {
  return (
    <div className="space-y-10">
      <PanelHeading title="Design Science Research process">
        Ten stages took the work from the literature to a working, evaluated artefact. The ML component was evaluated
        quantitatively by training on one group of workers and testing on a different worker; software behaviour was examined
        through automated unit, service and integration tests; and role-specific questionnaires were prepared to assess
        usability and acceptance.
      </PanelHeading>

      <ResearchProcessDiagram />

      <div className="grid gap-5 md:grid-cols-2">
        <div className="card p-6">
          <MiniHeading>Functional requirements</MiniHeading>
          <div className="mt-4"><BulletList items={requirements.functional} /></div>
        </div>
        <div className="card p-6">
          <MiniHeading>Non-functional requirements</MiniHeading>
          <div className="mt-4"><BulletList items={requirements.nonFunctional} tone="cyan" /></div>
        </div>
      </div>
    </div>
  );
}
