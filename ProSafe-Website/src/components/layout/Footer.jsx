import { navItems, researcher, site, contact } from '../../data/site.js';
import { prototypeNotice } from '../../data/home.js';
import { handleAnchorClick } from '../../lib/navigation.js';
import { BrandIcon } from '../ui/BrandIcon.jsx';

export function Footer() {
  const year = new Date().getFullYear();
  const domain = navItems.find((item) => item.children);

  return (
    <footer className="relative border-t border-line/10 bg-surface/60">
      <div className="container-page grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <img src="/images/prosafe-logo.webp" alt="ProSafe smart helmet logo" width="640" height="282" loading="lazy" className="h-16 w-auto" />
          <p className="mt-4 max-w-sm text-[0.9rem] leading-relaxed text-muted">
            {site.researchTitle}. An individual final-year research project at the {site.institution}.
          </p>
          <p className="mt-4 text-[0.82rem] text-muted">
            Project ID <span className="font-semibold text-ink">{site.projectId}</span> · {site.module}
          </p>
        </div>

        <nav aria-label="Footer">
          <h2 className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-ink">Website</h2>
          <ul className="mt-4 space-y-2 text-[0.9rem]">
            {navItems.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} onClick={(e) => handleAnchorClick(e, item.id)} className="text-muted hover:text-brand">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-ink">Research</h2>
          <ul className="mt-4 space-y-2 text-[0.9rem]">
            {domain.children.map((child) => (
              <li key={child.id}>
                <a href={`#${child.id}`} onClick={(e) => handleAnchorClick(e, child.id)} className="text-muted hover:text-brand">
                  {child.label}
                </a>
              </li>
            ))}
            <li>
              <a href="#references" onClick={(e) => handleAnchorClick(e, 'references')} className="text-muted hover:text-brand">
                References
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-ink">Researcher</h2>
          <p className="mt-4 text-[0.9rem] font-semibold text-ink">{researcher.name}</p>
          <p className="text-[0.86rem] text-muted">{researcher.studentId}</p>
          <p className="mt-2 text-[0.86rem] text-muted">{researcher.department}, {site.institutionShort}</p>
          <a
            href={contact.repository}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-[0.88rem] font-semibold text-muted hover:text-brand"
          >
            <BrandIcon name="siGithub" className="h-4 w-4" />
            Source repository<span className="sr-only"> on GitHub (opens in a new tab)</span>
          </a>
        </div>
      </div>

      <div className="border-t border-line/10">
        <div className="container-page flex flex-col gap-3 py-6 text-[0.8rem] text-muted md:flex-row md:items-center md:justify-between">
          <p>© {year} {researcher.name}. Prepared for academic assessment at {site.institutionShort}.</p>
          <p className="max-w-xl md:text-right">{prototypeNotice}</p>
        </div>
      </div>
    </footer>
  );
}
