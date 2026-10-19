import { ArrowDown, ChartColumn, Compass } from 'lucide-react';
import { hero, highlights, workerVisual } from '../../data/home.js';
import { site } from '../../data/site.js';
import { handleAnchorClick } from '../../lib/navigation.js';
import { Icon } from '../../components/ui/Icon.jsx';
import { Reveal } from '../../components/ui/Reveal.jsx';

/**
 * Worker wearing the ProSafe helmet. Shows how the helmet is meant to be used
 * on site; sensor details live in the 3D helmet section instead.
 */
function WorkerVisual() {
  const v = workerVisual;
  return (
    <figure className="card grid overflow-hidden shadow-glow md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:items-stretch">
      <div className="bg-[#071017]">
        <img src={v.src} alt={v.alt} width={v.width} height={v.height} className="block aspect-[4/3] h-auto w-full object-contain" />
      </div>
      <div className="flex flex-col justify-center border-t border-line/10 p-5 sm:p-6 md:border-l md:border-t-0 lg:p-8">
        <h2 className="text-[1.2rem] font-bold leading-snug text-ink sm:text-[1.35rem] lg:text-[1.6rem]">{v.heading}</h2>
        <p className="mt-2 text-[0.9rem] leading-relaxed text-muted lg:mt-3 lg:text-[0.98rem]">{v.text}</p>
        <figcaption className="mt-4 flex items-start gap-2 text-[0.74rem] text-muted lg:mt-5">
          <span className={`badge ${v.kind === 'photo' ? 'badge-safe' : 'badge-neutral'} shrink-0`}>
            {v.kind === 'photo' ? 'Photograph' : 'Illustration'}
          </span>
          <span className="pt-0.5">{v.caption[v.kind]}</span>
        </figcaption>
      </div>
    </figure>
  );
}

export function HomeSection() {
  return (
    <section id="home" aria-labelledby="home-title" className="relative overflow-hidden outline-none">
      <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-40 top-10 h-96 w-96 rounded-full bg-brand/20 blur-[120px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-32 top-1/3 h-80 w-80 rounded-full bg-cyan/10 blur-[120px]" aria-hidden="true" />

      <div className="container-page relative grid gap-10 pb-12 pt-[104px] sm:pt-[120px] lg:gap-12">
        <div className="max-w-4xl">
          <p className="eyebrow">
            <span className="pulse-dot h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
            {hero.eyebrow}
          </p>
          <h1 id="home-title" className="mt-6 text-[2.3rem] font-extrabold leading-[1.08] sm:text-5xl lg:text-[3.4rem]">
            Smarter Protection Through{' '}
            <span className="bg-gradient-to-r from-brand to-cyan bg-clip-text text-transparent">Personalized Safety Monitoring</span>
          </h1>
          <p className="mt-5 border-l-2 border-brand/60 pl-4 text-[1.02rem] font-semibold text-ink/90 sm:text-[1.1rem]">
            {site.researchTitle}
          </p>
          <p className="lead mt-5 max-w-2xl">{hero.intro}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a href={hero.primaryCta.href} onClick={(e) => handleAnchorClick(e, 'prosafe')} className="btn btn-primary px-6 py-3">
              <Compass className="h-4 w-4" aria-hidden="true" />
              {hero.primaryCta.label}
            </a>
            <a href={hero.secondaryCta.href} onClick={(e) => handleAnchorClick(e, 'results')} className="btn btn-secondary px-6 py-3">
              <ChartColumn className="h-4 w-4" aria-hidden="true" />
              {hero.secondaryCta.label}
            </a>
          </div>
        </div>

        <Reveal>
          <WorkerVisual />
        </Reveal>
      </div>

      <div className="container-page relative pb-16">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map((h, i) => (
            <Reveal as="li" key={h.title} delay={i * 60} className="card card-hover flex flex-col p-5">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-sm bg-brand/10 text-brand ring-1 ring-inset ring-brand/25">
                  <Icon name={h.icon} className="h-5 w-5" />
                </span>
                <span className="text-[1.6rem] font-extrabold leading-none text-brand">{h.value}</span>
              </div>
              <h2 className="mt-4 text-[1rem] font-bold">{h.title}</h2>
              <p className="mt-1.5 text-[0.84rem] leading-relaxed text-muted">{h.text}</p>
            </Reveal>
          ))}
        </ul>
        <a
          href="#prosafe"
          onClick={(e) => handleAnchorClick(e, 'prosafe')}
          className="mx-auto mt-10 flex w-fit flex-col items-center gap-1 text-[0.78rem] text-muted hover:text-brand"
        >
          Why ProSafe?
          <ArrowDown className="h-4 w-4 motion-safe:animate-bounce" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
