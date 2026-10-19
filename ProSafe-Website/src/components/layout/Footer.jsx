import { navItems, researcher, site, contact } from '../../data/site.js';
import { prototypeNotice } from '../../data/home.js';
import { handleAnchorClick } from '../../lib/navigation.js';
import { BrandIcon } from '../ui/BrandIcon.jsx';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-line/10 bg-surface/60">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.3fr_2fr]">
        <div>
          <img src="/images/prosafe-logo.webp" alt="ProSafe smart helmet logo" width="640" height="282" loading="lazy" className="h-14 w-auto" />
          <p className="mt-4 max-w-sm text-[0.88rem] leading-relaxed text-muted">
            {site.researchTitle}. Individual final-year research, {site.institutionShort} · {site.projectId}.
          </p>
          <a
            href={contact.repository}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-[0.86rem] font-semibold text-muted hover:text-brand"
          >
            <BrandIcon name="siGithub" className="h-4 w-4" />
            Source repository<span className="sr-only"> on GitHub (opens in a new tab)</span>
          </a>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          {navItems
            .filter((item) => item.children)
            .map((item) => (
              <div key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={(e) => handleAnchorClick(e, item.id)}
                  className="text-[0.76rem] font-bold uppercase tracking-[0.14em] text-ink hover:text-brand"
                >
                  {item.label}
                </a>
                <ul className="mt-3 space-y-1.5 text-[0.86rem]">
                  {item.children.map((child) => (
                    <li key={child.id}>
                      <a href={`#${child.id}`} onClick={(e) => handleAnchorClick(e, child.id)} className="text-muted hover:text-brand">
                        {child.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          <div>
            <a href="#about" onClick={(e) => handleAnchorClick(e, 'about')} className="text-[0.76rem] font-bold uppercase tracking-[0.14em] text-ink hover:text-brand">
              About & Contact
            </a>
            <p className="mt-3 text-[0.86rem] text-muted">{researcher.name}</p>
            <p className="text-[0.86rem] text-muted">{researcher.studentId}</p>
          </div>
        </nav>
      </div>

      <div className="border-t border-line/10">
        <div className="container-page flex flex-col gap-3 py-5 text-[0.78rem] text-muted md:flex-row md:items-center md:justify-between">
          <p>© {year} {researcher.name}. Prepared for academic assessment at {site.institutionShort}.</p>
          <p className="max-w-xl md:text-right">{prototypeNotice}</p>
        </div>
      </div>
    </footer>
  );
}
