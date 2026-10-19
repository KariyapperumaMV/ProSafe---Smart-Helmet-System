import { conclusion, findings, limitations, overviewMetrics } from '../../data/results.js';
import { Section, SectionHeader, SubSection } from '../../components/ui/Section.jsx';
import { Reveal } from '../../components/ui/Reveal.jsx';
import { IconTile } from '../../components/ui/Icon.jsx';
import { DeployedComparison } from './DeployedComparison.jsx';
import { ExperimentDetails, LabResults, TestingResults, UserAcceptance } from './ResultDetails.jsx';

export function ResultsSection() {
  return (
    <Section id="results" labelledBy="results-title" tinted>
      <SectionHeader
        id="results-title"
        eyebrow="04 · Results"
        title="What the evaluation showed"
        lead="Results from the experiments, laboratory tests, automated testing and a small user evaluation, including where the approach fell short."
      />

      <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {overviewMetrics.map((m, i) => (
          <Reveal as="li" key={m.label} delay={i * 50} className="card p-4">
            <p className="text-[1.8rem] font-extrabold leading-none text-brand">{m.value}</p>
            <p className="mt-2 text-[0.86rem] font-semibold text-ink">{m.label}</p>
            <p className="mt-1 text-[0.74rem] leading-snug text-muted">{m.detail}</p>
          </Reveal>
        ))}
      </ul>

      <SubSection
        id="ml-results"
        eyebrow="Machine learning results"
        title="High accuracy, inconsistent CRITICAL detection"
        lead="Four algorithms were compared in eight configurations. The deployed XGBoost configuration was evaluated on two workers it was not trained on."
      >
        <Reveal>
          <DeployedComparison />
        </Reveal>
        <div className="mt-4">
          <ExperimentDetails />
        </div>
      </SubSection>

      <SubSection
        id="lab-results"
        eyebrow="Hardware & laboratory results"
        title="Laboratory verification of the helmet"
        lead="Short controlled tests against reference devices. UV, gas and sound channels are indicative, relative or uncalibrated, not industrial or medical-grade measurements."
      >
        <LabResults />
      </SubSection>

      <SubSection id="testing-results" eyebrow="Software & integration testing" title="Automated and integration tests">
        <TestingResults />
      </SubSection>

      <SubSection id="user-results" eyebrow="User acceptance" title="Early user feedback">
        <UserAcceptance />
      </SubSection>

      <SubSection id="findings" eyebrow="Findings & limitations" title="What this research shows">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {findings.map((f, i) => (
            <Reveal as="li" key={f.title} delay={i * 50} className="card p-5">
              <IconTile name={f.icon} size="sm" tone={i === 2 ? 'warning' : 'brand'} />
              <h4 className="mt-3 font-bold leading-snug text-ink">{f.title}</h4>
              <p className="mt-1.5 text-[0.84rem] leading-relaxed text-muted">{f.text}</p>
            </Reveal>
          ))}
        </ul>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Reveal className="card-raised p-5">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-warning">Limitations & future work</p>
            <ul className="mt-3 space-y-2 text-[0.86rem] text-muted">
              {limitations.map((l) => (
                <li key={l} className="flex gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
                  {l}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="flex flex-col justify-center rounded-md border border-brand/30 bg-brand/[0.06] p-5">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-brand">Conclusion</p>
            <p className="mt-2 text-[0.98rem] leading-relaxed text-ink">{conclusion}</p>
          </Reveal>
        </div>
      </SubSection>
    </Section>
  );
}
