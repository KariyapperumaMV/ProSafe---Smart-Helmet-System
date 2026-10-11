import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { references, referencesNote } from '../../data/references.js';
import { prefersReducedMotion } from '../../lib/navigation.js';

/**
 * Collapsible reference list. Opening a citation link (#ref-n) expands the
 * list automatically so the target is visible.
 */
export function References() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const reveal = (initial) => {
      const match = window.location.hash.match(/^#ref-(\d+)$/);
      if (!match) return;
      setOpen(true);
      // Wait for the list to render open before scrolling to the entry.
      setTimeout(() => {
        const el = document.getElementById(`ref-${match[1]}`);
        el?.scrollIntoView({ block: 'center', behavior: initial || prefersReducedMotion() ? 'instant' : 'smooth' });
        el?.classList.add('ring-1', 'ring-cyan/60');
        setTimeout(() => el?.classList.remove('ring-1', 'ring-cyan/60'), 2200);
      }, 50);
    };
    const onHashChange = () => reveal(false);
    reveal(true);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <div id="references" className="mt-16 outline-none" tabIndex={-1}>
      <details
        open={open}
        onToggle={(e) => setOpen(e.currentTarget.open)}
        className="card group overflow-hidden"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-[1.1rem] font-bold text-ink">References</span>
            <span className="block text-[0.84rem] text-muted">{references.length} selected sources cited on this page</span>
          </span>
          <ChevronDown className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-line/10 px-6 py-5">
          <ol className="space-y-2.5">
            {references.map((r) => (
              <li key={r.n} id={`ref-${r.n}`} className="flex gap-3 rounded-sm p-1.5 text-[0.84rem] leading-relaxed text-muted transition-shadow">
                <span className="w-8 shrink-0 font-mono text-cyan">[{r.n}]</span>
                <span>{r.text}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-[0.8rem] text-muted">{referencesNote}</p>
        </div>
      </details>
    </div>
  );
}
