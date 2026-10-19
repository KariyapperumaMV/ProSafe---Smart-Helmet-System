import { technologyGroups } from '../../data/technologies.js';
import { Icon } from '../../components/ui/Icon.jsx';
import { BrandIcon } from '../../components/ui/BrandIcon.jsx';
import { hasBrandIcon } from '../../components/ui/brandIcons.js';

function Mark({ item }) {
  if (hasBrandIcon(item.icon)) return <BrandIcon name={item.icon} className="h-4 w-4" />;
  if (item.lucide) return <Icon name={item.lucide} className="h-4 w-4 text-brand" />;
  return <span className="font-mono text-[0.62rem] font-bold text-brand">{item.monogram}</span>;
}

/** Compact grid of verified technologies, grouped by layer. */
export function TechStack() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {technologyGroups.map((group) => (
        <div key={group.title} className="card-raised p-4">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-muted">{group.title}</p>
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {group.items.map((item) => (
              <li
                key={item.name}
                title={item.note}
                className="inline-flex items-center gap-1.5 rounded-full border border-line/15 bg-white/[0.04] px-2.5 py-1 text-[0.78rem] font-medium text-ink"
              >
                <Mark item={item} />
                {item.name}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
