import { useEffect, useState } from 'react';

/**
 * Returns the id of the last section whose top has passed the reading line
 * (a fraction of the viewport height). At the very bottom of the page the
 * last section wins, so a short final section can still become active.
 */
export function useActiveSection(ids, readingLine = 0.3) {
  const [active, setActive] = useState(ids[0] ?? null);
  const key = ids.join('|');

  useEffect(() => {
    const list = key.split('|');
    const compute = () => {
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) {
        setActive(list[list.length - 1]);
        return;
      }
      const line = window.innerHeight * readingLine;
      let current = list[0];
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(current);
    };
    compute();
    window.addEventListener('scroll', compute, { passive: true });
    window.addEventListener('resize', compute);
    return () => {
      window.removeEventListener('scroll', compute);
      window.removeEventListener('resize', compute);
    };
  }, [key, readingLine]);

  return active;
}

export function useScrolled(offset = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > offset);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [offset]);
  return scrolled;
}
