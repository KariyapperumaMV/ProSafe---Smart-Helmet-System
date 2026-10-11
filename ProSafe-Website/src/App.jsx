import { useEffect } from 'react';
import { Header } from './components/layout/Header.jsx';
import { Footer } from './components/layout/Footer.jsx';
import { BackToTop } from './components/layout/BackToTop.jsx';
import { HomeSection } from './sections/Home/HomeSection.jsx';
import { DomainSection } from './sections/Domain/DomainSection.jsx';
import { MilestonesSection } from './sections/Milestones/MilestonesSection.jsx';
import { DocumentsSection } from './sections/Documents/DocumentsSection.jsx';
import { PresentationsSection } from './sections/Presentations/PresentationsSection.jsx';
import { AboutSection } from './sections/About/AboutSection.jsx';
import { ContactSection } from './sections/Contact/ContactSection.jsx';

/**
 * Elements rendered by React do not exist when the browser first tries to
 * jump to the URL hash, so honour direct links such as /#documents once the
 * page has rendered.
 */
function useInitialHashScroll() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const target =
      document.getElementById(id) ?? (id.startsWith('methodology-') ? document.getElementById('methodology-tabs') : null);
    // Jump straight to the target on first load rather than animating from the top.
    if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, []);
}

export default function App() {
  useInitialHashScroll();

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
        <DomainSection />
        <MilestonesSection />
        <DocumentsSection />
        <PresentationsSection />
        <AboutSection />
        <ContactSection />
      </main>
      <Footer />
      <BackToTop />
    </>
  );
}
