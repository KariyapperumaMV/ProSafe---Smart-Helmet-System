/**
 * Tailwind theme mapped onto the ProSafe design tokens.
 * The token values live in src/styles/index.css (copied from the ProSafe web
 * application's theme.css) so colours are defined in exactly one place.
 */
const token = (name) => `rgb(var(--ps-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        raised: token('raised'),
        line: token('line'),
        ink: token('text'),
        muted: token('text-muted'),
        faint: token('text-faint'),
        brand: token('green'),
        'brand-strong': token('green-strong'),
        cyan: token('cyan'),
        safe: token('green'),
        warning: token('warning'),
        critical: token('critical'),
        danger: token('danger'),
        uncertain: token('uncertain'),
        info: token('info'),
        chart: token('chart-highlight'),
        'chart-neutral': token('chart-neutral'),
      },
      fontFamily: {
        sans: ['"Segoe UI"', '"Inter Variable"', 'Inter', 'system-ui', 'Avenir', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"Cascadia Code"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        sm: '8px',
        md: '14px',
        lg: '20px',
      },
      boxShadow: {
        card: '0 8px 30px rgba(0, 0, 0, 0.35)',
        glow: '0 0 0 1px rgba(34, 197, 94, 0.25), 0 10px 40px rgba(34, 197, 94, 0.12)',
      },
      maxWidth: {
        content: '1200px',
        prose: '72ch',
      },
    },
  },
  plugins: [],
};
