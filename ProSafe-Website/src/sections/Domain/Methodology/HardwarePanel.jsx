import { CircleAlert } from 'lucide-react';
import { emergencySteps, firmwareFacts, hardwareComponents, hardwareVerification, ledStates } from '../../../data/methodology.js';
import { Figure } from '../../../components/ui/Figure.jsx';
import { MiniHeading, PanelHeading } from './PanelHeading.jsx';

const groupBadge = {
  environmental: { label: 'Environmental', className: 'badge-safe' },
  physiological: { label: 'Physiological', className: 'badge-info' },
  feedback: { label: 'Feedback', className: 'badge-warning' },
  core: { label: 'Core', className: 'badge-neutral' },
};

export function HardwarePanel() {
  return (
    <div className="space-y-10">
      <PanelHeading title="Smart helmet hardware and firmware">
        Low-cost, widely available modules compatible with the ESP32 were mounted on a standard safety helmet. Physiological
        sensors touch the wearer, while environmental sensors sit on the outer surface where they are exposed to air, light and sound.
      </PanelHeading>

      <Figure
        src="/images/helmet-prototype-views.webp"
        alt="The ProSafe prototype helmet from four sides. Front view: LED light. Left side: emergency button, MQ-2 gas sensor and LM35 body temperature sensor. Right side: INMP441 MEMS microphone, DHT11 temperature sensor and MAX30102 heart rate sensor. Top view: GUVA-S12SD UV sensor and a GPS module."
        width={1230}
        height={395}
        paper
        caption="The actual ProSafe prototype from the front, left, right and top (thesis Figure 2.4). The GPS module on top belongs to an earlier design; GPS reading is disabled in the current firmware and no location is transmitted."
      />

      <div className="card overflow-hidden">
        <div className="border-b border-line/10 px-6 py-4">
          <MiniHeading>Hardware components (thesis Table 2.1)</MiniHeading>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[620px]">
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col">Function</th>
                <th scope="col">Interface and notes</th>
              </tr>
            </thead>
            <tbody>
              {hardwareComponents.map((c) => (
                <tr key={c.component}>
                  <td className="cell-strong">
                    <span className="block">{c.component}</span>
                    <span className={`badge mt-1.5 ${groupBadge[c.group].className}`}>{groupBadge[c.group].label}</span>
                  </td>
                  <td>{c.measures}</td>
                  <td>{c.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line/10 px-6 py-3 text-[0.8rem] text-muted">
          These are development modules suited to research prototyping. Their readings are not medical-grade or industrially
          certified, and several need calibration before they can be compared with occupational limits.
        </p>
      </div>

      <div>
        <MiniHeading>Firmware behaviour</MiniHeading>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {firmwareFacts.map((f) => (
            <li key={f.title} className="card-raised p-5">
              <p className="font-semibold text-ink">{f.title}</p>
              <p className="mt-1.5 text-[0.85rem] leading-relaxed text-muted">{f.text}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="card p-6">
          <MiniHeading>LED status indication</MiniHeading>
          <p className="mt-2 text-[0.85rem] text-muted">The helmet only displays the state supplied by the backend; it never calculates risk itself.</p>
          <ul className="mt-4 space-y-2.5">
            {ledStates.map((s) => (
              <li key={s.state} className="flex items-center gap-3 text-[0.9rem]">
                <span className={`h-3.5 w-3.5 rounded-full ${s.dot} shadow-[0_0_10px_currentColor]`} aria-hidden="true" />
                <span className="w-28 font-semibold text-ink">{s.state}</span>
                <span className="text-muted">{s.colour}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[0.8rem] text-muted">CRITICAL and EMERGENCY currently share the same red indication.</p>
        </div>

        <div className="card p-6">
          <MiniHeading>Emergency workflow and controlled reset</MiniHeading>
          <ol className="mt-4 space-y-3">
            {emergencySteps.map((step, i) => (
              <li key={step} className="flex gap-3 text-[0.87rem] leading-relaxed text-muted">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger/15 text-[0.75rem] font-bold text-danger">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <Figure
        src="/images/wiring-diagram.webp"
        alt="Wiring schematic connecting the ESP32-DevKitC to the MAX30102, LM35, DHT11, MQ-2, INMP441, GUVA-S12SD, RGB LED, emergency button, GPS module and the battery, charging and voltage regulation modules."
        width={1255}
        height={889}
        paper
        caption="ProSafe wiring diagram (thesis Figure 2.3)."
      />

      <div className="flex gap-3 rounded-md border border-warning/30 bg-warning/[0.06] p-5">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-[0.88rem] leading-relaxed text-muted">
          <span className="font-semibold text-ink">Verification status. </span>
          {hardwareVerification}
        </p>
      </div>
    </div>
  );
}
