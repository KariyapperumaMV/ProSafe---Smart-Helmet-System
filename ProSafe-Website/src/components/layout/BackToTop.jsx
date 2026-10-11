import { ArrowUp } from 'lucide-react';
import { useScrolled } from '../../hooks/useActiveSection.js';
import { scrollToSection } from '../../lib/navigation.js';

export function BackToTop() {
  const visible = useScrolled(700);
  return (
    <button
      type="button"
      onClick={() => scrollToSection('home')}
      aria-label="Back to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={`fixed bottom-5 right-5 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-line/25 bg-raised/90 text-ink shadow-card backdrop-blur transition-all duration-300 hover:border-brand/50 hover:text-brand ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      }`}
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
