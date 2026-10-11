import { useRef } from 'react';
import { Icon } from './Icon.jsx';

/**
 * Accessible tab list (WAI-ARIA tabs pattern with automatic activation).
 * Arrow keys, Home and End move between tabs.
 */
export function Tabs({ tabs, active, onChange, idPrefix, label }) {
  const refs = useRef([]);

  const focusTab = (index) => {
    const next = (index + tabs.length) % tabs.length;
    refs.current[next]?.focus();
    onChange(tabs[next].id);
  };

  const onKeyDown = (event, index) => {
    const keys = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: tabs.length - 1 };
    if (event.key in keys) {
      event.preventDefault();
      focusTab(keys[event.key]);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className="flex flex-wrap gap-1.5 rounded-md border border-line/15 bg-surface/60 p-1.5"
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => (refs.current[index] = el)}
            role="tab"
            type="button"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={`flex grow items-center justify-center gap-2 rounded-sm px-3.5 py-2.5 text-[0.88rem] font-semibold transition-colors sm:grow-0 ${
              selected
                ? 'bg-brand/15 text-brand ring-1 ring-inset ring-brand/30'
                : 'text-muted hover:bg-white/5 hover:text-ink'
            }`}
          >
            {tab.icon && <Icon name={tab.icon} className="h-4 w-4" />}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, idPrefix, active, children }) {
  if (id !== active) return null;
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      tabIndex={0}
      className="mt-8 outline-none"
    >
      {children}
    </div>
  );
}
