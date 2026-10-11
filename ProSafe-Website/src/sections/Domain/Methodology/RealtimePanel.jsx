import { Timer } from 'lucide-react';
import { alertTypes, latency, latencyNote, statusPrecedence, uploadSequence, webFeatures } from '../../../data/methodology.js';
import { Figure } from '../../../components/ui/Figure.jsx';
import { BulletList, MiniHeading, PanelHeading } from './PanelHeading.jsx';

const actorStyle = {
  Helmet: 'badge-warning',
  Backend: 'badge-safe',
  'ML service': 'badge-info',
};

export function RealtimePanel() {
  return (
    <div className="space-y-10">
      <PanelHeading title="Real-time monitoring, alerts and the web application">
        Every upload passes through the same ordered pipeline. Uploads for the same worker are processed one at a time, because
        smoothing and session state depend on the order of observations.
      </PanelHeading>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="card p-6">
          <MiniHeading>Sequence of one helmet upload (thesis Figure 2.7)</MiniHeading>
          <ol className="mt-4 space-y-2">
            {uploadSequence.map((step, i) => (
              <li key={`${i}-${step.text}`} className="grid grid-cols-[28px_96px_1fr] items-start gap-2 text-[0.85rem]">
                <span className="pt-0.5 text-right font-mono text-[0.76rem] text-muted">{i + 1}</span>
                <span className={`badge justify-center ${actorStyle[step.actor]}`}>{step.actor}</span>
                <span className="leading-relaxed text-muted">{step.text}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[0.8rem] text-muted">
            Browsers load data through the REST API when a page opens and after a reconnection; live updates arrive over SSE.
          </p>
        </div>

        <div className="space-y-5">
          <div className="card p-6">
            <MiniHeading>Status shown on the dashboard and LED</MiniHeading>
            <p className="mt-2 text-[0.84rem] text-muted">One precedence rule decides the displayed status:</p>
            <ol className="mt-3 space-y-2">
              {statusPrecedence.map((s, i) => (
                <li key={s.label} className="flex items-start gap-3 text-[0.85rem] text-muted">
                  <span className="w-5 shrink-0 pt-1 text-right font-mono text-[0.76rem]">{i + 1}.</span>
                  <span className={`badge ${s.className} whitespace-normal normal-case tracking-normal`}>{s.label}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="card p-6">
            <MiniHeading>Alert types</MiniHeading>
            <ul className="mt-3 space-y-3">
              {alertTypes.map((a) => (
                <li key={a.type}>
                  <span className={`badge ${a.className}`}>{a.type}</span>
                  <p className="mt-1.5 text-[0.84rem] leading-relaxed text-muted">{a.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-3">
          <Timer className="h-5 w-5 text-cyan" aria-hidden="true" />
          <MiniHeading>Near real time, not instant</MiniHeading>
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {latency.map((l) => (
            <li key={l.label} className="card-raised p-4">
              <p className="text-[1.4rem] font-extrabold text-ink">{l.value}</p>
              <p className="text-[0.82rem] text-muted">{l.label}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[0.86rem] leading-relaxed text-muted">{latencyNote}</p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="card p-6">
          <MiniHeading>Administrator features</MiniHeading>
          <div className="mt-4"><BulletList items={webFeatures.admin} /></div>
        </div>
        <div className="card p-6">
          <MiniHeading>Worker features</MiniHeading>
          <div className="mt-4"><BulletList items={webFeatures.worker} tone="cyan" /></div>
        </div>
        <div className="card p-6">
          <MiniHeading>Security and clarity</MiniHeading>
          <div className="mt-4"><BulletList items={webFeatures.security} tone="warning" /></div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Figure
          src="/images/dashboard-admin.webp"
          alt="ProSafe administrator dashboard with a clock and site weather card, counts of total workers, helmets online, alerts today and safe workers, a worker status donut chart, helmet health counts and a list of recent transition alerts."
          width={1918}
          height={1039}
          caption="Administrator dashboard of the implemented web application. Worker names are blurred."
        />
        <Figure
          src="/images/dashboard-worker.webp"
          alt="ProSafe worker dashboard showing the current safety status badge, the assigned helmet and its status, the latest sensor summary for heart rate, body temperature, ambient temperature, noise, gas and UV, and the worker's recent alerts."
          width={1911}
          height={1071}
          caption="Worker dashboard of the implemented web application. Worker names are blurred."
        />
      </div>
    </div>
  );
}
