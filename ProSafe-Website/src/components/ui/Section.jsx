import { Reveal } from './Reveal.jsx';

/** Top-level page section with consistent spacing and an optional tinted band. */
export function Section({ id, children, className = '', tinted = false, labelledBy }) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`relative -scroll-mt-12 py-16 outline-none sm:py-20 ${tinted ? 'bg-surface/40' : ''} ${className}`}
    >
      {tinted && <div className="divider absolute inset-x-0 top-0" aria-hidden="true" />}
      <div className="container-page">{children}</div>
    </section>
  );
}

/** Eyebrow + heading + lead paragraph used at the top of each section. */
export function SectionHeader({ id, eyebrow, title, lead, align = 'left', level = 2, className = '' }) {
  const Heading = `h${level}`;
  const centered = align === 'center';
  return (
    <Reveal className={`${centered ? 'mx-auto text-center' : ''} max-w-3xl ${className}`}>
      {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
      <Heading id={id} className={level === 2 ? 'section-title' : 'subsection-title'}>
        {title}
      </Heading>
      {lead && <p className={`lead mt-4 ${centered ? 'mx-auto' : ''}`}>{lead}</p>}
    </Reveal>
  );
}

/** Subsection within the Domain section, addressable from the navigation. */
export function SubSection({ id, eyebrow, title, lead, children, className = '' }) {
  return (
    <div id={id} className={`mt-16 outline-none ${className}`} tabIndex={-1}>
      <SectionHeader id={`${id}-title`} eyebrow={eyebrow} title={title} lead={lead} level={3} />
      <div className="mt-8">{children}</div>
    </div>
  );
}
