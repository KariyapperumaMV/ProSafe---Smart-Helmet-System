import { ArrowDown, ArrowRight, BookOpen, CircleAlert, FlaskConical } from 'lucide-react';
import {
  approach, challenge, features, hero, keyFacts, overview, prototypeNotice, sensors, statusLegend, workflow,
} from '../../data/home.js';
import { site } from '../../data/site.js';
import { handleAnchorClick } from '../../lib/navigation.js';
import { Icon, IconTile } from '../../components/ui/Icon.jsx';
import { Reveal } from '../../components/ui/Reveal.jsx';
import { Cites } from '../../components/ui/Cite.jsx';

function HeroDevice() {
  return (
    <div className="card relative overflow-hidden p-5 shadow-glow sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <img src="/images/prosafe-logo.webp" alt="ProSafe Smart Helmet logo" width="640" height="282" className="h-12 w-auto" />
        <span className="badge badge-neutral">Research prototype</span>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)]">
        <figure className="overflow-hidden rounded-md bg-white">
          <img
            src="/images/helmet-left-view.webp"
            alt="Left side of the ProSafe prototype helmet showing the emergency button, the MQ-2 gas sensor and the LM35 body temperature sensor"
            width="310"
            height="302"
            className="mx-auto h-auto w-full max-w-[320px]"
          />
          <figcaption className="border-t border-black/5 bg-white px-3 py-2 text-center text-[0.74rem] font-medium text-slate-600">
            ProSafe prototype, left side view
          </figcaption>
        </figure>

        <div>
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-muted">Sensing channels</p>
          <ul className="mt-3 grid gap-2">
            {sensors.map((s) => (
              <li key={s.label} className="card-raised flex items-center gap-3 px-3 py-2">
                <Icon name={s.icon} className={`h-4 w-4 shrink-0 ${s.kind === 'Physiological' ? 'text-cyan' : 'text-brand'}`} />
                <span className="min-w-0 flex-1 truncate text-[0.84rem] font-medium text-ink">{s.label}</span>
                <span className="font-mono text-[0.72rem] text-muted">{s.part}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 border-t border-line/10 pt-4">
        <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-muted">Helmet LED status</p>
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {statusLegend.map((s) => (
            <li key={s.state} className="badge badge-neutral normal-case tracking-normal" title={s.meaning}>
              <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} aria-hidden="true" />
              <span className="font-bold uppercase tracking-[0.03em] text-ink">{s.state}</span>
              <span className="font-medium text-muted">{s.led}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <div className="relative overflow-hidden pt-[72px]">
      <div className="hero-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-40 top-10 h-96 w-96 rounded-full bg-brand/20 blur-[120px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-32 top-1/3 h-80 w-80 rounded-full bg-cyan/10 blur-[120px]" aria-hidden="true" />

      <div className="container-page relative grid items-center gap-12 pb-16 pt-12 sm:pt-16 lg:min-h-[calc(100vh-72px)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pb-20">
        <div>
          <p className="eyebrow">
            <span className="pulse-dot h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
            {hero.eyebrow}
          </p>
          <h1 id="home-title" className="mt-6 text-[2.35rem] font-extrabold leading-[1.08] sm:text-5xl lg:text-[3.6rem]">
            Intelligent Safety Monitoring for{' '}
            <span className="bg-gradient-to-r from-brand to-cyan bg-clip-text text-transparent">Construction Workers</span>
          </h1>
          <p className="mt-5 border-l-2 border-brand/60 pl-4 text-[1.05rem] font-semibold text-ink/90 sm:text-[1.15rem]">
            {site.researchTitle}
          </p>
          <p className="lead mt-5 max-w-2xl">{hero.intro}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a href={hero.primaryCta.href} onClick={(e) => handleAnchorClick(e, 'literature-survey')} className="btn btn-primary px-6 py-3">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              {hero.primaryCta.label}
            </a>
            <a href={hero.secondaryCta.href} onClick={(e) => handleAnchorClick(e, 'methodology')} className="btn btn-secondary px-6 py-3">
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              {hero.secondaryCta.label}
            </a>
          </div>

          <dl className="mt-10 grid max-w-xl grid-cols-2 gap-x-6 gap-y-4 text-[0.84rem] sm:grid-cols-3">
            <div>
              <dt className="text-muted">Researcher</dt>
              <dd className="font-semibold text-ink">Methya Kariyapperuma</dd>
            </div>
            <div>
              <dt className="text-muted">Project ID</dt>
              <dd className="font-semibold text-ink">{site.projectId}</dd>
            </div>
            <div>
              <dt className="text-muted">Institution</dt>
              <dd className="font-semibold text-ink">SLIIT, Sri Lanka</dd>
            </div>
          </dl>
        </div>

        <Reveal>
          <HeroDevice />
        </Reveal>
      </div>

      <div className="container-page relative hidden pb-8 lg:block">
        <a
          href="#overview"
          onClick={(e) => handleAnchorClick(e, 'overview')}
          className="mx-auto flex w-fit flex-col items-center gap-1 text-[0.78rem] text-muted hover:text-brand"
        >
          Scroll to explore
          <ArrowDown className="h-4 w-4 animate-bounce" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

function KeyFacts() {
  return (
    <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {keyFacts.map((fact, i) => (
        <Reveal as="li" key={fact.label} delay={i * 60} className="card px-5 py-5">
          <p className="text-[2rem] font-extrabold leading-none text-brand">{fact.value}</p>
          <p className="mt-2 text-[0.9rem] font-semibold text-ink">{fact.label}</p>
          <p className="mt-1 text-[0.8rem] leading-snug text-muted">{fact.detail}</p>
        </Reveal>
      ))}
    </ul>
  );
}

export function HomeSection() {
  return (
    <section id="home" aria-labelledby="home-title" className="outline-none">
      <Hero />

      <div id="overview" className="container-page pb-6 outline-none" tabIndex={-1}>
        <KeyFacts />

        <div className="mt-20">
          <Reveal>
            <p className="eyebrow mb-4">Overview</p>
            <h2 className="section-title">{overview.title}</h2>
            <div className="mt-5 grid gap-x-10 gap-y-4 lg:grid-cols-2">
              {overview.paragraphs.map((p) => (
                <p key={p.slice(0, 24)} className="body-text">{p}</p>
              ))}
            </div>
          </Reveal>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <Reveal className="card p-6">
              <IconTile name="TriangleAlert" tone="warning" />
              <h3 className="mt-4 text-lg font-bold">{challenge.title}</h3>
              <ul className="mt-3 space-y-3 text-[0.9rem] leading-relaxed text-muted">
                {challenge.points.map((p) => (
                  <li key={p.slice(0, 20)} className="flex gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[0.8rem] text-muted">Sources: <Cites ids={challenge.cites} /></p>
            </Reveal>
            <Reveal delay={80} className="card border-brand/25 p-6">
              <IconTile name="ShieldCheck" />
              <h3 className="mt-4 text-lg font-bold">{approach.title}</h3>
              <ul className="mt-3 space-y-3 text-[0.9rem] leading-relaxed text-muted">
                {approach.points.map((p) => (
                  <li key={p.slice(0, 20)} className="flex gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>

        <div className="mt-24">
          <Reveal className="max-w-3xl">
            <p className="eyebrow mb-4">Capabilities</p>
            <h2 className="section-title">Key system capabilities</h2>
            <p className="lead mt-4">
              Six capabilities work together across the helmet, the backend, the ML service and the web application.
            </p>
          </Reveal>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <Reveal as="li" key={f.title} delay={(i % 3) * 70} className="card card-hover p-6">
                <IconTile name={f.icon} tone={f.title.startsWith('Emergency') ? 'danger' : i % 2 ? 'cyan' : 'brand'} />
                <h3 className="mt-4 text-[1.08rem] font-bold">{f.title}</h3>
                <p className="mt-2 text-[0.9rem] leading-relaxed text-muted">{f.text}</p>
              </Reveal>
            ))}
          </ul>
        </div>

        <div className="mt-24">
          <Reveal className="max-w-3xl">
            <p className="eyebrow mb-4">How it works</p>
            <h2 className="section-title">From sensor reading to safety feedback</h2>
            <p className="lead mt-4">
              A simplified view of one cycle. The detailed pipeline, including the data-quality gate and post-processing rules, is described in the methodology.
            </p>
          </Reveal>

          <ol className="mt-10 grid gap-4 md:grid-cols-5">
            {workflow.map((step, i) => (
              <Reveal as="li" key={step.title} delay={i * 70} className="relative">
                <div className="card h-full p-5">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand text-[0.85rem] font-extrabold text-[#06210f]">
                      {i + 1}
                    </span>
                    <Icon name={step.icon} className="h-5 w-5 text-brand" />
                  </div>
                  <h3 className="mt-4 text-[1.02rem] font-bold">{step.title}</h3>
                  <p className="mt-1.5 text-[0.86rem] leading-relaxed text-muted">{step.text}</p>
                </div>
                {i < workflow.length - 1 && (
                  <ArrowRight
                    className="absolute -right-3.5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 text-brand/70 md:block"
                    aria-hidden="true"
                  />
                )}
              </Reveal>
            ))}
          </ol>

          <Reveal className="mt-8 flex flex-col gap-4 rounded-md border border-warning/25 bg-warning/[0.06] p-5 sm:flex-row sm:items-start">
            <CircleAlert className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-[0.9rem] leading-relaxed text-muted">
              <strong className="font-semibold text-ink">Research prototype. </strong>
              {prototypeNotice}
            </p>
          </Reveal>

          <Reveal className="card relative mt-12 overflow-hidden p-8 sm:p-10">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand/15 blur-3xl" aria-hidden="true" />
            <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div className="max-w-2xl">
                <h2 className="text-2xl font-bold sm:text-[1.7rem]">Explore the research domain</h2>
                <p className="mt-2 text-[0.95rem] text-muted">
                  Literature survey, research gap, problem, objectives, methodology, technologies and evaluation findings.
                </p>
              </div>
              <a href="#domain" onClick={(e) => handleAnchorClick(e, 'domain')} className="btn btn-primary px-6 py-3">
                Go to Domain
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
