import { CircleDot } from 'lucide-react';
import { iconRegistry } from './icons.js';

export function Icon({ name, className = 'h-5 w-5', ...rest }) {
  const Component = iconRegistry[name] ?? CircleDot;
  return <Component className={className} aria-hidden="true" focusable="false" {...rest} />;
}

/** Rounded icon tile used on feature and content cards. */
export function IconTile({ name, tone = 'brand', size = 'md' }) {
  const tones = {
    brand: 'bg-brand/10 text-brand ring-brand/25',
    cyan: 'bg-cyan/10 text-cyan ring-cyan/25',
    warning: 'bg-warning/10 text-warning ring-warning/25',
    critical: 'bg-critical/10 text-critical ring-critical/25',
    danger: 'bg-danger/10 text-danger ring-danger/25',
    neutral: 'bg-white/5 text-muted ring-line/20',
  };
  const sizes = { sm: 'h-9 w-9 rounded-sm', md: 'h-11 w-11 rounded-md', lg: 'h-14 w-14 rounded-md' };
  const iconSizes = { sm: 'h-[18px] w-[18px]', md: 'h-5 w-5', lg: 'h-7 w-7' };
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ring-1 ring-inset ${tones[tone]} ${sizes[size]}`}>
      <Icon name={name} className={iconSizes[size]} />
    </span>
  );
}
