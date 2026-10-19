import { Component, Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Info, LoaderCircle, Minus, MousePointerClick, Pause, Play, Plus, RotateCcw } from 'lucide-react';
import { helmetComponents, helmetModelNote, inactiveComponents } from '../../data/helmet.js';
import { statusLegend } from '../../data/home.js';
import { prefersReducedMotion } from '../../lib/navigation.js';
import { Figure } from '../ui/Figure.jsx';

const Helmet3DViewer = lazy(() => import('./Helmet3DViewer.jsx'));

const groupBadge = {
  Core: 'badge-neutral',
  Environmental: 'badge-safe',
  Physiological: 'badge-info',
  Feedback: 'badge-warning',
};

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

class ViewerBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function PhotoFallback({ reason }) {
  return (
    <div className="flex h-full flex-col justify-center gap-4 p-4">
      <p className="flex items-start gap-2 text-[0.86rem] text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan" aria-hidden="true" />
        {reason} Showing the prototype photographs instead; the component list remains fully usable.
      </p>
      <div className="rounded-md bg-white p-2">
        <img src="/images/helmet-prototype-views.webp" alt="The ProSafe prototype from the front, left, right and top" width="1230" height="395" className="h-auto w-full" />
      </div>
    </div>
  );
}

function ComponentInfo({ component }) {
  if (!component) {
    return (
      <div className="card-raised p-5">
        <p className="font-semibold text-ink">Select a component</p>
        <p className="mt-1.5 text-[0.86rem] leading-relaxed text-muted">
          Choose a numbered marker on the model or a component in the list to see what it measures and its role in ProSafe.
        </p>
        <p className="mt-3 text-[0.8rem] leading-relaxed text-muted">{inactiveComponents[0].note}</p>
      </div>
    );
  }
  return (
    <div className="card-raised border-brand/30 p-5" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[0.72rem] font-extrabold text-[#06210f]">
          {String(component.n).padStart(2, '0')}
        </span>
        <h4 className="font-bold text-ink">
          {component.part} <span className="font-normal text-muted">|</span> {component.name}
        </h4>
        <span className={`badge ${groupBadge[component.group]}`}>{component.group}</span>
      </div>
      <dl className="mt-3 space-y-2.5 text-[0.86rem] leading-relaxed">
        <div>
          <dt className="text-[0.72rem] font-bold uppercase tracking-[0.12em] text-muted">What it does</dt>
          <dd className="text-ink/90">{component.measures}</dd>
        </div>
        <div>
          <dt className="text-[0.72rem] font-bold uppercase tracking-[0.12em] text-muted">Role in ProSafe</dt>
          <dd className="text-ink/90">{component.role}</dd>
        </div>
      </dl>
      {component.approximate && (
        <p className="mt-3 text-[0.78rem] italic text-muted">Not visible in the prototype photographs; its position on the model is illustrative.</p>
      )}
    </div>
  );
}

/**
 * Interactive 3D helmet with an accessible component list. The WebGL viewer
 * is loaded only when the section approaches the viewport.
 */
export function HelmetShowcase() {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [inView, setInView] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [contextLost, setContextLost] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [ledState, setLedState] = useState('SAFE');
  const [autoRotate, setAutoRotate] = useState(() => !prefersReducedMotion());
  const [zoomEnabled, setZoomEnabled] = useState(false);
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    setWebgl(hasWebGL());
    setCoarse(window.matchMedia?.('(pointer: coarse)').matches ?? false);
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      setInView(true);
      return undefined;
    }
    const loader = new IntersectionObserver(([e]) => e.isIntersecting && setShouldLoad(true), { rootMargin: '400px 0px' });
    const visibility = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.05 });
    loader.observe(el);
    visibility.observe(el);
    return () => {
      loader.disconnect();
      visibility.disconnect();
    };
  }, []);

  const selected = helmetComponents.find((c) => c.id === selectedId) ?? null;
  const select = (id) => {
    setSelectedId(id);
    setAutoRotate(false);
  };
  const reset = () => {
    setSelectedId(null);
    viewerRef.current?.reset();
  };

  const canRender = webgl && !contextLost;
  const scrollZoom = coarse || zoomEnabled;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
      <div className="card relative overflow-hidden">
        <div
          ref={containerRef}
          className="relative h-[380px] bg-[radial-gradient(ellipse_at_50%_40%,rgba(34,197,94,0.12),transparent_65%)] sm:h-[460px] lg:h-[520px]"
          onPointerDown={() => setZoomEnabled(true)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setZoomEnabled(false)}
        >
          {canRender ? (
            shouldLoad ? (
              <ViewerBoundary fallback={<PhotoFallback reason="The 3D viewer could not start in this browser." />}>
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center gap-2 text-[0.9rem] text-muted" role="status">
                      <LoaderCircle className="h-5 w-5 animate-spin text-brand" aria-hidden="true" /> Loading 3D helmet…
                    </div>
                  }
                >
                  <Helmet3DViewer
                    ref={viewerRef}
                    components={helmetComponents}
                    inactive={inactiveComponents}
                    selectedId={selectedId}
                    onSelect={select}
                    ledState={ledState}
                    autoRotate={autoRotate}
                    onUserInteract={() => setAutoRotate(false)}
                    zoomEnabled={scrollZoom}
                    inView={inView}
                    onContextLost={() => setContextLost(true)}
                  />
                </Suspense>
              </ViewerBoundary>
            ) : (
              <div className="flex h-full items-center justify-center text-[0.9rem] text-muted">3D helmet loads when you reach this section.</div>
            )
          ) : (
            <PhotoFallback reason={contextLost ? 'The graphics context was lost.' : 'WebGL is not available in this browser.'} />
          )}

          {canRender && (
            <>
              <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1 text-[0.72rem] text-muted">
                <span className="badge badge-neutral normal-case tracking-normal">Conceptual 3D reconstruction</span>
              </div>
              <div className="absolute right-3 top-3 flex gap-1.5">
                <button type="button" onClick={() => viewerRef.current?.zoom(0.8)} className="btn btn-secondary btn-sm px-2" aria-label="Zoom in">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => viewerRef.current?.zoom(1.25)} className="btn btn-secondary btn-sm px-2" aria-label="Zoom out">
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setAutoRotate((v) => !v)}
                  className="btn btn-secondary btn-sm px-2"
                  aria-label={autoRotate ? 'Stop auto-rotation' : 'Start auto-rotation'}
                  aria-pressed={autoRotate}
                >
                  {autoRotate ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                </button>
                <button type="button" onClick={reset} className="btn btn-secondary btn-sm">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset view
                </button>
              </div>
              <p className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center gap-2 text-[0.74rem] text-muted">
                <MousePointerClick className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                {coarse
                  ? 'Drag to rotate in any direction · pinch to zoom · tap a number for details'
                  : `Drag to rotate (left/right and up/down) · ${scrollZoom ? 'scroll to zoom' : 'click the model to enable scroll zoom'} · click a number`}
              </p>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line/10 px-4 py-3">
          <span className="text-[0.74rem] font-bold uppercase tracking-[0.12em] text-muted">Preview LED</span>
          {statusLegend.map((s) => (
            <button
              key={s.state}
              type="button"
              onClick={() => setLedState(s.state)}
              aria-pressed={ledState === s.state}
              className={`badge normal-case tracking-normal ${ledState === s.state ? 'badge-neutral ring-1 ring-brand/60' : 'badge-neutral opacity-70 hover:opacity-100'}`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} aria-hidden="true" />
              {s.state}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" aria-label="Helmet components">
          {helmetComponents.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => select(c.id)}
                aria-pressed={selectedId === c.id}
                className={`flex w-full items-center gap-2.5 rounded-sm border px-2.5 py-2 text-left text-[0.84rem] transition-colors ${
                  selectedId === c.id ? 'border-brand/50 bg-brand/10 text-ink' : 'border-line/15 bg-raised/60 text-muted hover:border-line/30 hover:text-ink'
                }`}
              >
                <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.68rem] font-extrabold ${selectedId === c.id ? 'bg-brand text-[#06210f]' : 'bg-white/10 text-brand'}`}>
                  {String(c.n).padStart(2, '0')}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="block font-mono text-[0.7rem] text-muted">{c.part}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        <ComponentInfo component={selected} />
        <details className="card-raised group p-4 text-[0.82rem] text-muted">
          <summary className="cursor-pointer font-semibold text-ink">About this model and the real prototype</summary>
          <p className="mt-2 leading-relaxed">{helmetModelNote}</p>
          <div className="mt-3">
            <Figure
              src="/images/helmet-prototype-views.webp"
              alt="The ProSafe prototype helmet from the front, left, right and top, with labelled sensors"
              width={1230}
              height={395}
              paper
              caption="Real prototype photographs (thesis Figure 2.4)."
            />
          </div>
        </details>
      </div>
    </div>
  );
}
