import { references } from '../../data/references.js';

const known = new Set(references.map((r) => r.n));

/** In-text citation links, e.g. <Cites ids={[1, 2]} /> renders [1] [2]. */
export function Cites({ ids = [] }) {
  const valid = ids.filter((n) => known.has(n));
  if (!valid.length) return null;
  return (
    <span className="whitespace-nowrap">
      {valid.map((n) => (
        <a key={n} href={`#ref-${n}`} className="cite" aria-label={`Reference ${n}`}>
          [{n}]
        </a>
      ))}
    </span>
  );
}
