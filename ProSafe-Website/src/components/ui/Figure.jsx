import { Maximize2 } from 'lucide-react';

/**
 * Captioned image. `paper` places light-background figures (diagrams,
 * product photos) on a white panel so they read correctly on the dark theme.
 */
export function Figure({ src, alt, caption, width, height, paper = false, className = '', priority = false }) {
  return (
    <figure className={`card overflow-hidden ${className}`}>
      <div className={paper ? 'bg-white p-3 sm:p-5' : 'bg-black/20'}>
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className="mx-auto h-auto w-full"
        />
      </div>
      {caption && (
        <figcaption className="flex flex-wrap items-start justify-between gap-3 border-t border-line/10 px-5 py-3.5 text-[0.84rem] text-muted">
          <span>{caption}</span>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-brand hover:underline"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            Full size<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </figcaption>
      )}
    </figure>
  );
}
