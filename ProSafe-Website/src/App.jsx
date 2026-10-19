import { useEffect } from 'react';
import { Header } from './components/layout/Header.jsx';
import { Footer } from './components/layout/Footer.jsx';
import { BackToTop } from './components/layout/BackToTop.jsx';
import { HomeSection } from './sections/Home/HomeSection.jsx';
import { ProSafeSection } from './sections/ProSafe/ProSafeSection.jsx';
import { MethodologySection } from './sections/Methodology/MethodologySection.jsx';
import { ResultsSection } from './sections/Results/ResultsSection.jsx';
import { ResourcesSection } from './sections/Resources/ResourcesSection.jsx';
import { AboutContactSection } from './sections/About/AboutContactSection.jsx';
import { scrollToSection } from './lib/navigation.js';

/**
 * React renders the page after the browser first tries to jump to the URL
 * hash, so honour direct links (including Resources tabs and anchors from the
 * previous version of the site) once the page has rendered, and on later
 * hash changes.
 */
function useHashNavigation() {
  useEffect(() => {
    const go = (instant) => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id && !id.startsWith('ref-')) scrollToSection(id, { updateHash: false, instant });
    };
    go(true);
    const onHash = () => go(false);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
}

export default function App() {
  useHashNavigation();

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-sm focus:bg-brand focus:px-4 focus:py-2 focus:font-semibold focus:text-[#06210f]"
      >
        Skip to main content
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="outline-none">
        <HomeSection />
        <ProSafeSection />
        <MethodologySection />
        <ResultsSection />
        <ResourcesSection />
        <AboutContactSection />
      </main>
      <Footer />
      <BackToTop />
    </>
  );
}
