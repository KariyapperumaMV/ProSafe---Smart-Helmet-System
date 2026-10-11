/** Heading block used at the top of each methodology tab panel. */
export function PanelHeading({ title, children }) {
  return (
    <div className="max-w-3xl">
      <h4 className="text-[1.3rem] font-bold sm:text-[1.45rem]">{title}</h4>
      {children && <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

export function MiniHeading({ children, className = '' }) {
  return <h5 className={`text-[0.76rem] font-bold uppercase tracking-[0.14em] text-muted ${className}`}>{children}</h5>;
}

export function BulletList({ items, tone = 'brand' }) {
  const dot = { brand: 'bg-brand', cyan: 'bg-cyan', warning: 'bg-warning', muted: 'bg-line/60' }[tone];
  return (
    <ul className="space-y-2.5 text-[0.88rem] leading-relaxed text-muted">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
