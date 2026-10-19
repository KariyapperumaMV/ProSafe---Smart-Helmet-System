import { useState } from 'react';
import { architecture } from '../../data/methodology.js';
import { Icon } from '../../components/ui/Icon.jsx';

const byId = Object.fromEntries(architecture.components.map((c) => [c.id, c]));
const linkFor = (a, b) => architecture.links.find((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a));

const accent = {
  helmet: 'text-warning ring-warning/30 bg-warning/10',
  backend: 'text-brand ring-brand/30 bg-brand/10',
  ml: 'text-cyan ring-cyan/30 bg-cyan/10',
  db: 'text-muted ring-line/30 bg-white/5',
  web: 'text-[#93c5fd] ring-info/35 bg-info/10',
};

function Node({ id, selected, onSelect }) {
  const c = byId[id];
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      className={`card-raised flex h-full w-full items-center gap-3 p-3.5 text-left transition-all ${
        selected ? 'border-brand/60 shadow-glow' : 'hover:border-line/35'
      }`}
    >
      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm ring-1 ring-inset ${accent[id]}`}>
        <Icon name={c.icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-bold leading-tight text-ink">{c.name}</span>
        <span className="block text-[0.72rem] text-muted">{c.tech}</span>
      </span>
    </button>
  );
}

/** Dashed two-way connector with flowing dots (motion disabled for reduced-motion users). */
function Flow({ a, b, vertical = false }) {
  const link = linkFor(a, b);
  return (
    <div className={`flex items-center justify-center ${vertical ? 'flex-row gap-3 py-1.5 pl-6' : 'h-full flex-col px-1'}`}>
      <span
        className={`flow-line relative block overflow-hidden rounded-full ${vertical ? 'h-8 w-[3px] flow-vertical' : 'h-[3px] w-full'}`}
        aria-hidden="true"
      />
      <span className={`text-[0.7rem] leading-snug text-muted ${vertical ? '' : 'mt-2 text-center'}`}>{link.label}</span>
    </div>
  );
}

/** Interactive version of thesis Figure 2.2. The backend is the hub. */
export function Architecture() {
  const [selected, setSelected] = useState('backend');
  const c = byId[selected];

  return (
    <div className="card p-5 sm:p-6">
      <div className="hidden grid-cols-[1fr_120px_1.1fr_120px_1fr] grid-rows-[auto_auto] items-center gap-y-5 lg:grid">
        <div className="col-start-1 row-start-1"><Node id="helmet" selected={selected === 'helmet'} onSelect={setSelected} /></div>
        <div className="col-start-2 row-start-1"><Flow a="helmet" b="backend" /></div>
        <div className="col-start-3 row-span-2 row-start-1"><Node id="backend" selected={selected === 'backend'} onSelect={setSelected} /></div>
        <div className="col-start-4 row-start-1"><Flow a="backend" b="ml" /></div>
        <div className="col-start-5 row-start-1"><Node id="ml" selected={selected === 'ml'} onSelect={setSelected} /></div>
        <div className="col-start-1 row-start-2"><Node id="db" selected={selected === 'db'} onSelect={setSelected} /></div>
        <div className="col-start-2 row-start-2"><Flow a="db" b="backend" /></div>
        <div className="col-start-4 row-start-2"><Flow a="backend" b="web" /></div>
        <div className="col-start-5 row-start-2"><Node id="web" selected={selected === 'web'} onSelect={setSelected} /></div>
      </div>

      <div className="lg:hidden">
        <Node id="helmet" selected={selected === 'helmet'} onSelect={setSelected} />
        <Flow a="helmet" b="backend" vertical />
        <Node id="backend" selected={selected === 'backend'} onSelect={setSelected} />
        <Flow a="backend" b="ml" vertical />
        <Node id="ml" selected={selected === 'ml'} onSelect={setSelected} />
        <Flow a="backend" b="db" vertical />
        <Node id="db" selected={selected === 'db'} onSelect={setSelected} />
        <Flow a="backend" b="web" vertical />
        <Node id="web" selected={selected === 'web'} onSelect={setSelected} />
      </div>

      <div className="mt-5 grid gap-4 rounded-md border border-line/15 bg-surface/70 p-4 md:grid-cols-[1fr_1.2fr]" aria-live="polite">
        <div>
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-brand">Selected component</p>
          <p className="mt-1 font-semibold text-ink">{c.name}</p>
          <p className="mt-1 text-[0.88rem] leading-relaxed text-muted">{c.summary}</p>
        </div>
        <ul className="grid gap-1.5 text-[0.84rem] text-muted sm:grid-cols-2">
          {c.duties.map((d) => (
            <li key={d} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              {d}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-[0.76rem] text-muted">
        All components communicate over HTTP with JSON. The web application never calls the ML service directly; the backend obtains classifications and relays results.
      </p>
    </div>
  );
}
