export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Scrolls to an in-page section, updates the URL hash and moves keyboard
 * focus to the target so screen-reader and keyboard users land on it too.
 */
export function scrollToSection(id, { updateHash = true } = {}) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  if (updateHash && window.location.hash !== `#${id}`) {
    window.history.pushState(null, '', `#${id}`);
  }
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  return true;
}

/**
 * Click handler for <a href="#id"> links that keeps native behaviour as a
 * fallback. `onBefore` runs first (e.g. closing the mobile menu and
 * releasing its scroll lock) so the smooth scroll is not cancelled.
 */
export function handleAnchorClick(event, id, onBefore) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!document.getElementById(id)) return;
  event.preventDefault();
  onBefore?.();
  scrollToSection(id);
}
