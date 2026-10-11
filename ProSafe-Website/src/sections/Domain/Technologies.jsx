import { integrations, technologyGroups } from '../../data/technologies.js';
import { SubSection } from '../../components/ui/Section.jsx';
import { Reveal } from '../../components/ui/Reveal.jsx';
import { Icon, IconTile } from '../../components/ui/Icon.jsx';
import { BrandIcon } from '../../components/ui/BrandIcon.jsx';
import { hasBrandIcon } from '../../components/ui/brandIcons.js';

function TechMark({ item }) {
  if (hasBrandIcon(item.icon)) return <BrandIcon name={item.icon} className="h-5 w-5" />;
  if (item.lucide) return <Icon name={item.lucide} className="h-5 w-5 text-brand" />;
  return <span className="font-mono text-[0.72rem] font-bold text-brand">{item.monogram}</span>;
}

export function Technologies() {
  return (
    <SubSection
      id="technologies"
      eyebrow="2.6 · Technologies Used"
      title="Technologies used"
      lead="Every technology listed here is used in the ProSafe source code or documented in the thesis."
    >
      <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {technologyGroups.map((group, i) => (
          <Reveal as="li" key={group.title} delay={(i % 3) * 60} className="card p-6">
            <div className="flex items-center gap-3">
              <IconTile name={group.lucide} size="sm" tone={i % 2 ? 'cyan' : 'brand'} />
              <div>
                <h4 className="font-bold text-ink">{group.title}</h4>
                <p className="text-[0.8rem] text-muted">{group.description}</p>
              </div>
            </div>
            <ul className="mt-5 grid gap-2">
              {group.items.map((item) => (
                <li key={item.name} className="card-raised flex items-center gap-3 px-3 py-2.5">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-white/[0.06] text-ink ring-1 ring-inset ring-line/15">
                    <TechMark item={item} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.88rem] font-semibold text-ink">{item.name}</span>
                    <span className="block text-[0.76rem] leading-snug text-muted">{item.note}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </ul>

      <Reveal className="mt-6 flex flex-wrap items-center gap-3 text-[0.84rem] text-muted">
        <span className="font-semibold text-ink">Integrations:</span>
        {integrations.map((item) => (
          <span key={item.name} className="badge badge-neutral normal-case tracking-normal">
            <Icon name={item.lucide} className="h-3.5 w-3.5" />
            <span className="font-semibold text-ink">{item.name}</span> · {item.note}
          </span>
        ))}
      </Reveal>
    </SubSection>
  );
}
