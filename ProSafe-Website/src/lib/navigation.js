import { legacyAnchors, resourceTabs } from '../data/site.js';

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Event used to open a Resources tab (Milestones, Documents, Presentations). */
export const RESOURCE_EVENT = 'prosafe:resource-tab';

/**
 * Resolves a hash id to the element that should be scrolled to. Handles
 * Resources tabs and anchors from the previous version of the site.
 */
export function resolveTarget(rawId) {
  const id = legacyAnchors[rawId] ?? rawId;
  if (resourceTabs.includes(id)) return { element: document.getElementById('resources'), resourceTab: id };
  return { element: document.getElementById(id), resourceTab: null };
}

/**
 * Scrolls to an in-page target, updates the URL hash and moves keyboard
 * focus to it so keyboard and screen-reader users land there too.
 */
export function scrollToSection(id, { updateHash = true, instant = false } = {}) {
  const { element, resourceTab } = resolveTarget(id);
  if (!element) return false;
  if (resourceTab) window.dispatchEvent(new CustomEvent(RESOURCE_EVENT, { detail: resourceTab }));
  element.scrollIntoView({ behavior: instant || prefersReducedMotion() ? 'instant' : 'smooth', block: 'start' });
  if (updateHash && window.location.hash !== `#${id}`) window.history.pushState(null, '', `#${id}`);
  if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1');
  element.focus({ preventScroll: true });
  return true;
}

/**
 * Click handler for <a href="#id"> links. `onBefore` runs first (e.g. closing
 * a menu and releasing its scroll lock) so the smooth scroll is not cancelled.
 */
export function handleAnchorClick(event, id, onBefore) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  onBefore?.();
  if (scrollToSection(id)) event.preventDefault();
}
