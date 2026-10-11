import { brands, lowContrast } from './brandIcons.js';

/**
 * Technology logo from simple-icons. Dark brand colours are rendered in the
 * primary text colour so every mark stays legible on the dark theme.
 */
export function BrandIcon({ name, className = 'h-5 w-5', title }) {
  const icon = brands[name];
  if (!icon) return null;
  const fill = lowContrast.has(name) ? 'currentColor' : `#${icon.hex}`;
  return (
    <svg
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      aria-label={title}
      viewBox="0 0 24 24"
      className={className}
      fill={fill}
      focusable="false"
    >
      <path d={icon.path} />
    </svg>
  );
}
