import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import { navItems } from '../../data/site.js';
import { handleAnchorClick } from '../../lib/navigation.js';
import { useActiveSection, useScrolled } from '../../hooks/useActiveSection.js';

const topLevelIds = navItems.map((item) => item.id);
const childIds = navItems.flatMap((item) => (item.children ?? []).map((c) => c.id));

function NavDropdown({ item, active, activeChild }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const linkRefs = useRef([]);
  const focusFirstOnOpen = useRef(false);
  const menuId = `${item.id}-menu`;
  const links = [{ id: item.id, label: `${item.label} overview` }, ...item.children];

  useEffect(() => {
    if (!open) return undefined;
    // Keyboard opening moves focus into the menu once it is rendered.
    if (focusFirstOnOpen.current) {
      focusFirstOnOpen.current = false;
      linkRefs.current[0]?.focus();
    }
    const onPointer = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const onButtonKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (open) linkRefs.current[0]?.focus();
      else {
        focusFirstOnOpen.current = true;
        setOpen(true);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const onMenuKeyDown = (e) => {
    const index = linkRefs.current.indexOf(document.activeElement);
    const total = links.length;
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      linkRefs.current[(index + 1) % total]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      linkRefs.current[(index - 1 + total) % total]?.focus();
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(e) => {
        if (e.relatedTarget && !wrapperRef.current?.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onButtonKeyDown}
        className={`relative flex items-center gap-1 rounded-sm px-3 py-2 text-[0.9rem] font-semibold transition-colors ${
          active ? 'text-brand' : 'text-muted hover:text-ink'
        }`}
      >
        {item.label}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        {active && <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-brand" aria-hidden="true" />}
      </button>
      <div id={menuId} hidden={!open} onKeyDown={onMenuKeyDown} className="absolute left-1/2 top-full z-50 w-60 -translate-x-1/2 pt-2">
        <ul className="card overflow-hidden p-1.5 shadow-card">
          {links.map((link, index) => {
            const isActive = link.id === activeChild;
            return (
              <li key={link.id}>
                <a
                  ref={(el) => (linkRefs.current[index] = el)}
                  href={`#${link.id}`}
                  aria-current={isActive ? 'location' : undefined}
                  onClick={(e) => handleAnchorClick(e, link.id, () => setOpen(false))}
                  className={`block rounded-sm px-3 py-2 text-[0.88rem] transition-colors ${
                    isActive ? 'bg-brand/10 font-semibold text-brand' : 'text-muted hover:bg-white/5 hover:text-ink'
                  } ${index === 0 ? 'border-b border-line/10 font-semibold' : ''}`}
                >
                  {link.label}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function Header() {
  const active = useActiveSection(topLevelIds);
  const activeChild = useActiveSection(childIds);
  const scrolled = useScrolled();
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth >= 1024) setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector('a')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  // Release the scroll lock synchronously so the following scroll is not cancelled.
  const closeMobile = () => {
    document.body.style.overflow = '';
    setMobileOpen(false);
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 h-[72px] transition-colors duration-300 ${
        scrolled || mobileOpen ? 'border-b border-line/15 bg-bg/85 backdrop-blur-xl' : 'bg-transparent'
      }`}
    >
      <div className="container-page flex h-full items-center justify-between gap-4">
        <a
          href="#home"
          onClick={(e) => handleAnchorClick(e, 'home', closeMobile)}
          className="flex shrink-0 items-center"
          aria-label="ProSafe research website, back to top"
        >
          <img src="/images/prosafe-logo.webp" alt="" width="640" height="282" className="h-11 w-auto" />
        </a>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-0.5">
            {navItems.map((item) => (
              <li key={item.id}>
                {item.children ? (
                  <NavDropdown item={item} active={active === item.id} activeChild={active === item.id ? activeChild : null} />
                ) : (
                  <a
                    href={`#${item.id}`}
                    aria-current={active === item.id ? 'location' : undefined}
                    onClick={(e) => handleAnchorClick(e, item.id)}
                    className={`relative block rounded-sm px-3 py-2 text-[0.9rem] font-semibold transition-colors ${
                      active === item.id ? 'text-brand' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {item.label}
                    {active === item.id && <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-brand" aria-hidden="true" />}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <button
          ref={toggleRef}
          type="button"
          className="btn btn-secondary btn-sm lg:hidden"
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          <span>{mobileOpen ? 'Close' : 'Menu'}</span>
        </button>
      </div>

      <div
        id="mobile-menu"
        ref={panelRef}
        hidden={!mobileOpen}
        className="h-[calc(100dvh-72px)] overflow-y-auto border-t border-line/10 bg-bg/95 backdrop-blur-xl lg:hidden"
      >
        <nav aria-label="Mobile" className="container-page py-4">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={active === item.id ? 'location' : undefined}
                  onClick={(e) => handleAnchorClick(e, item.id, closeMobile)}
                  className={`block rounded-sm px-3 py-3 text-base font-semibold ${
                    active === item.id ? 'bg-brand/10 text-brand' : 'text-ink hover:bg-white/5'
                  }`}
                >
                  {item.label}
                </a>
                {item.children && (
                  <ul className="mb-2 ml-3 grid grid-cols-2 gap-x-2 border-l border-line/15 pl-3">
                    {item.children.map((child) => (
                      <li key={child.id}>
                        <a
                          href={`#${child.id}`}
                          onClick={(e) => handleAnchorClick(e, child.id, closeMobile)}
                          className="block rounded-sm px-3 py-2 text-[0.9rem] text-muted hover:bg-white/5 hover:text-ink"
                        >
                          {child.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
