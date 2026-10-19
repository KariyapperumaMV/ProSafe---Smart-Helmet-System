import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react';

function BrowserFrame({ title, children }) {
  return (
    <div className="overflow-hidden rounded-md border border-line/20 bg-[#0b1217]">
      <div className="flex items-center gap-3 border-b border-line/15 bg-raised/70 px-3 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        </span>
        <span className="min-w-0 flex-1 truncate rounded-sm bg-black/30 px-3 py-0.5 text-center text-[0.72rem] text-muted">
          ProSafe web application · {title}
        </span>
      </div>
      {children}
    </div>
  );
}

/**
 * One large screenshot at a time with thumbnails, previous/next controls,
 * arrow-key and swipe navigation, and a click-to-enlarge dialog.
 */
export function ScreenshotGallery({ items }) {
  const [index, setIndex] = useState(0);
  const dialogRef = useRef(null);
  const swipeStart = useRef(null);
  const item = items[index];
  const go = (delta) => setIndex((i) => (i + delta + items.length) % items.length);

  // Warm the cache for the next screenshot so switching feels instant.
  useEffect(() => {
    const next = new Image();
    next.src = items[(index + 1) % items.length].src;
  }, [index, items]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    }
  };

  const onPointerDown = (e) => {
    swipeStart.current = e.pointerType === 'mouse' ? null : e.clientX;
  };
  const onPointerUp = (e) => {
    if (swipeStart.current === null) return;
    const dx = e.clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  };

  const open = () => dialogRef.current?.showModal();
  const close = () => dialogRef.current?.close();

  return (
    <div
      className="card grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start"
      role="region"
      aria-roledescription="carousel"
      aria-label="ProSafe web application screenshots"
      onKeyDown={onKeyDown}
    >
      <BrowserFrame title={item.title}>
        <button
          type="button"
          onClick={open}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          className="group relative block w-full cursor-zoom-in touch-pan-y"
          aria-label={`Enlarge screenshot: ${item.title}`}
        >
          <img
            key={item.id}
            src={item.src}
            alt={item.alt}
            width={item.width}
            height={item.height}
            loading="lazy"
            decoding="async"
            className="block h-auto w-full"
          />
          <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-sm bg-black/60 px-2 py-1 text-[0.72rem] font-semibold text-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" /> Enlarge
          </span>
        </button>
      </BrowserFrame>

      <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 lg:flex-col lg:items-stretch">
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="font-semibold text-ink">
            {item.title} <span className="font-normal text-muted">· {index + 1} of {items.length}</span>
          </p>
          <p className="text-[0.84rem] text-muted">{item.caption}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => go(-1)} className="btn btn-secondary btn-sm px-2.5" aria-label="Previous screenshot">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => go(1)} className="btn btn-secondary btn-sm px-2.5" aria-label="Next screenshot">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <ul className="grid grid-cols-4 gap-2 lg:grid-cols-2" aria-label="Choose a screenshot">
        {items.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-pressed={i === index}
              aria-label={s.title}
              className={`block w-full overflow-hidden rounded-sm border transition-all ${
                i === index ? 'border-brand ring-1 ring-brand/50' : 'border-line/20 opacity-60 hover:opacity-100'
              }`}
            >
              <img src={s.src} alt="" width={s.width} height={s.height} loading="lazy" decoding="async" className="block aspect-[16/9] h-auto w-full object-cover object-top" />
            </button>
          </li>
        ))}
      </ul>
      </div>

      <dialog
        ref={dialogRef}
        aria-label={`${item.title} (enlarged)`}
        // Arrow keys inside the dialog bubble to the region's handler above.
        onClick={(e) => e.target === dialogRef.current && close()}
        className="m-auto max-h-[94vh] w-[min(1500px,96vw)] rounded-md border border-line/20 bg-bg p-0 text-ink backdrop:bg-black/80"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line/15 px-4 py-2.5">
          <p className="truncate text-[0.9rem] font-semibold">
            {item.title} <span className="font-normal text-muted">· {index + 1} of {items.length}</span>
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => go(-1)} className="btn btn-secondary btn-sm px-2.5" aria-label="Previous screenshot">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => go(1)} className="btn btn-secondary btn-sm px-2.5" aria-label="Next screenshot">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={close} className="btn btn-secondary btn-sm px-2.5" aria-label="Close enlarged screenshot">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="max-h-[calc(94vh-52px)] overflow-auto" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
          <img src={item.src} alt={item.alt} width={item.width} height={item.height} className="block h-auto w-full" />
        </div>
      </dialog>
    </div>
  );
}
