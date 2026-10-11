import { ArrowDown, CloudSun } from 'lucide-react';
import { architecture } from '../../data/methodology.js';
import { Icon } from '../ui/Icon.jsx';

const byId = Object.fromEntries(architecture.components.map((c) => [c.id, c]));
const linkFor = (a, b) => architecture.links.find((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a));

const accent = {
  helmet: 'text-warning ring-warning/30 bg-warning/10',
  backend: 'text-brand ring-brand/30 bg-brand/10',
  ml: 'text-cyan ring-cyan/30 bg-cyan/10',
  db: 'text-muted ring-line/30 bg-white/5',
  web: 'text-[#93c5fd] ring-info/35 bg-info/10',
};

function ComponentCard({ id, emphasis = false }) {
  const c = byId[id];
  return (
    <div className={`card-raised h-full p-4 ${emphasis ? 'border-brand/40 shadow-glow' : ''}`}>
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm ring-1 ring-inset ${accent[id]}`}>
          <Icon name={c.icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-bold leading-tight text-ink">{c.name}</p>
          <p className="mt-0.5 text-[0.74rem] text-muted">{c.tech}</p>
        </div>
      </div>
      <ul className="mt-3 space-y-1 text-[0.8rem] leading-snug text-muted">
        {c.duties.map((d) => (
          <li key={d} className="flex gap-2">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-line/60" aria-hidden="true" />
            {d}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal two-way connector with a protocol label. */
function HConnector({ a, b }) {
  const link = linkFor(a, b);
  return (
    <div className="flex h-full flex-col items-center justify-center px-1" aria-hidden="true">
      <svg viewBox="0 0 100 12" preserveAspectRatio="none" className="h-3 w-full text-brand/70">
        <line x1="6" y1="6" x2="94" y2="6" stroke="currentColor" strokeWidth="1.6" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        <path d="M0 6 L8 1 L8 11 Z M100 6 L92 1 L92 11 Z" fill="currentColor" />
      </svg>
      <p className="mt-2 text-center text-[0.7rem] leading-snug text-muted">{link.label}</p>
    </div>
  );
}

function VConnector({ a, b }) {
  const link = linkFor(a, b);
  return (
    <div className="flex items-center gap-3 py-2 pl-5" aria-hidden="true">
      <ArrowDown className="h-4 w-4 shrink-0 text-brand/70" />
      <p className="text-[0.74rem] leading-snug text-muted">{link.label}</p>
    </div>
  );
}

/**
 * Thesis Figure 2.2 redrawn as a responsive diagram: the backend is the hub
 * between the helmet, the ML service, the database and the web application.
 */
export function ArchitectureDiagram() {
  return (
    <figure className="card p-5 sm:p-7" aria-labelledby="architecture-caption">
      {/* Desktop: hub-and-spoke grid */}
      <div className="hidden grid-cols-[1fr_150px_1.1fr_150px_1fr] grid-rows-[auto_auto] gap-y-6 lg:grid">
        <div className="col-start-1 row-start-1"><ComponentCard id="helmet" /></div>
        <div className="col-start-2 row-start-1"><HConnector a="helmet" b="backend" /></div>
        <div className="col-start-3 row-span-2 row-start-1 flex flex-col">
          <ComponentCard id="backend" emphasis />
          <div className="mt-3 flex items-center gap-2 rounded-sm border border-dashed border-line/30 px-3 py-2 text-[0.76rem] text-muted">
            <CloudSun className="h-4 w-4 shrink-0 text-cyan" aria-hidden="true" />
            External weather service (Open-Meteo) for the dashboard
          </div>
        </div>
        <div className="col-start-4 row-start-1"><HConnector a="backend" b="ml" /></div>
        <div className="col-start-5 row-start-1"><ComponentCard id="ml" /></div>
        <div className="col-start-1 row-start-2"><ComponentCard id="db" /></div>
        <div className="col-start-2 row-start-2"><HConnector a="db" b="backend" /></div>
        <div className="col-start-4 row-start-2"><HConnector a="backend" b="web" /></div>
        <div className="col-start-5 row-start-2"><ComponentCard id="web" /></div>
      </div>

      {/* Mobile and tablet: stacked */}
      <div className="lg:hidden">
        <ComponentCard id="helmet" />
        <VConnector a="helmet" b="backend" />
        <ComponentCard id="backend" emphasis />
        <VConnector a="backend" b="ml" />
        <ComponentCard id="ml" />
        <VConnector a="backend" b="db" />
        <ComponentCard id="db" />
        <VConnector a="backend" b="web" />
        <ComponentCard id="web" />
        <p className="mt-3 flex items-center gap-2 text-[0.76rem] text-muted">
          <CloudSun className="h-4 w-4 shrink-0 text-cyan" aria-hidden="true" />
          The backend also reads site weather from Open-Meteo.
        </p>
      </div>

      <figcaption id="architecture-caption" className="mt-6 border-t border-line/10 pt-4 text-[0.82rem] text-muted">
        Overall ProSafe system architecture (after thesis Figure 2.2). All component communication uses HTTP with JSON; browsers also receive live updates through Server-Sent Events.
      </figcaption>
    </figure>
  );
}

/** Simplified end-to-end data flow used above the architecture diagram. */
export function DataFlowStrip() {
  return (
    <ol className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:gap-0" aria-label="Simplified data flow">
      {architecture.flow.map((step, i) => (
        <li key={step} className="flex flex-col items-center md:flex-1 md:flex-row">
          <span
            className={`w-full rounded-sm border px-3 py-2.5 text-center text-[0.84rem] font-semibold ${
              i === architecture.flow.length - 1
                ? 'border-brand/40 bg-brand/10 text-brand'
                : 'border-line/20 bg-raised/70 text-ink'
            }`}
          >
            {step}
          </span>
          {i < architecture.flow.length - 1 && (
            <span className="py-1 text-brand md:px-1.5 md:py-0" aria-hidden="true">
              <ArrowDown className="h-4 w-4 md:-rotate-90" />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
