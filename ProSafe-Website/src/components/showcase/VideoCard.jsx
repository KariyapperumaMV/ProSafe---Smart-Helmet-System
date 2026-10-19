import { useState } from 'react';
import { CircleAlert, Clock, Film, LoaderCircle, Play } from 'lucide-react';

/**
 * Lazy video card. Nothing is downloaded until the visitor presses Play:
 * MP4 sources then load a native <video> with controls (fullscreen
 * included); YouTube sources load a privacy-enhanced (youtube-nocookie)
 * embed. Items without a source show a "to be added" state.
 */
export function VideoCard({ video }) {
  const [state, setState] = useState('idle'); // idle | loading | playing | error
  const hasSource = Boolean(video.src || video.youtubeId);
  const titleId = `video-${video.id}-title`;
  const descId = `video-${video.id}-desc`;

  return (
    <article className="card flex flex-col overflow-hidden" aria-labelledby={titleId} aria-describedby={descId}>
      <div className="relative aspect-video bg-black">
        {!hasSource && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.12),transparent_70%)] text-center">
            <Film className="h-9 w-9 text-muted" aria-hidden="true" />
            <p className="text-[0.86rem] font-semibold text-ink">Video to be added</p>
          </div>
        )}

        {hasSource && state === 'idle' && (
          <button
            type="button"
            onClick={() => setState('loading')}
            className="group absolute inset-0 block w-full"
            aria-label={`Play video: ${video.title}${video.duration ? ` (${video.duration})` : ''}`}
          >
            {video.poster && <img src={video.poster} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
            <span className="absolute inset-0 bg-black/30 transition-colors group-hover:bg-black/15" aria-hidden="true" />
            <span className="absolute left-1/2 top-1/2 inline-flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-[#06210f] shadow-glow transition-transform group-hover:scale-110" aria-hidden="true">
              <Play className="ml-1 h-7 w-7" fill="currentColor" />
            </span>
            {video.duration && (
              <span className="absolute bottom-2 right-2 rounded-sm bg-black/70 px-1.5 py-0.5 font-mono text-[0.72rem] text-ink">{video.duration}</span>
            )}
          </button>
        )}

        {hasSource && state !== 'idle' && state !== 'error' && video.src && (
          <video
            className="absolute inset-0 h-full w-full"
            src={video.src}
            poster={video.poster ?? undefined}
            controls
            autoPlay
            playsInline
            preload="metadata"
            aria-label={video.title}
            onPlaying={() => setState('playing')}
            onWaiting={() => setState((s) => (s === 'playing' ? 'loading' : s))}
            onCanPlay={() => setState((s) => (s === 'loading' ? 'playing' : s))}
            onError={() => setState('error')}
          >
            Your browser cannot play this video. <a href={video.src}>Download the video</a> instead.
          </video>
        )}

        {hasSource && state !== 'idle' && video.youtubeId && !video.src && (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&rel=0`}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setState('playing')}
          />
        )}

        {state === 'loading' && (
          <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-sm bg-black/70 px-2 py-1 text-[0.74rem] text-ink" role="status">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loading video…
          </span>
        )}

        {state === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center" role="alert">
            <CircleAlert className="h-8 w-8 text-danger" aria-hidden="true" />
            <p className="text-[0.86rem] text-ink">The video could not be loaded.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setState('loading')} className="btn btn-secondary btn-sm">Try again</button>
              {video.src && <a href={video.src} className="btn btn-secondary btn-sm">Open video file</a>}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h4 id={titleId} className="font-bold leading-snug text-ink">{video.title}</h4>
        <p id={descId} className="mt-1.5 text-[0.86rem] leading-relaxed text-muted">{video.description}</p>
        {video.note && <p className="mt-2 text-[0.76rem] italic leading-relaxed text-muted">{video.note}</p>}
        <p className="mt-auto flex items-center gap-1.5 pt-3 text-[0.74rem] text-muted">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {hasSource ? [video.duration, video.size].filter(Boolean).join(' · ') || 'Video' : 'Not yet available'}
        </p>
      </div>
    </article>
  );
}
