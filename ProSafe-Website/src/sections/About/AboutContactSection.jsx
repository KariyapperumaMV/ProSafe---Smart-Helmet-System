import { useRef, useState } from 'react';
import { Building2, Check, ChevronDown, ClipboardPaste, Copy, GraduationCap, IdCard, Mail } from 'lucide-react';
import { contact, researcher, site, supervisors } from '../../data/site.js';
import { Section, SectionHeader } from '../../components/ui/Section.jsx';
import { Reveal } from '../../components/ui/Reveal.jsx';
import { BrandIcon } from '../../components/ui/BrandIcon.jsx';
import { ContactForm } from '../Contact/ContactForm.jsx';

function Avatar({ initials, photo, name, size = 'lg' }) {
  const sizes = { lg: 'h-20 w-20 text-[1.6rem]', md: 'h-11 w-11 text-[0.95rem]' };
  if (photo) return <img src={photo} alt={`Photograph of ${name}`} className={`${sizes[size]} rounded-full object-cover ring-2 ring-brand/40`} />;
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full border border-brand/40 bg-brand/10 font-extrabold text-brand ${sizes[size]}`} aria-hidden="true">
      {initials}
    </span>
  );
}

function EmailTemplate({ onUse }) {
  const [copied, setCopied] = useState(false);
  const text = `Subject: ${contact.emailTemplate.subject}\n\n${contact.emailTemplate.body}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  const mailto = contact.email
    ? `mailto:${contact.email}?subject=${encodeURIComponent(contact.emailTemplate.subject)}&body=${encodeURIComponent(contact.emailTemplate.body)}`
    : null;

  return (
    <details className="group card-raised overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[0.88rem] font-semibold text-ink [&::-webkit-details-marker]:hidden">
        Email template for enquiries
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-line/10 p-4">
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-sm border border-line/15 bg-black/30 p-3 font-sans text-[0.8rem] leading-relaxed text-muted">{text}</pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => onUse(contact.emailTemplate.subject, contact.emailTemplate.body)} className="btn btn-secondary btn-sm">
            <ClipboardPaste className="h-4 w-4" aria-hidden="true" /> Use in the form
          </button>
          <button type="button" onClick={copy} className="btn btn-secondary btn-sm">
            {copied ? <Check className="h-4 w-4 text-brand" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy template'}
          </button>
          {mailto && (
            <a href={mailto} className="btn btn-secondary btn-sm"><Mail className="h-4 w-4" aria-hidden="true" /> Open in email app</a>
          )}
        </div>
        <p className="sr-only" aria-live="polite">{copied ? 'Template copied to clipboard' : ''}</p>
      </div>
    </details>
  );
}

export function AboutContactSection() {
  const formRef = useRef(null);

  return (
    <Section id="about" labelledBy="about-title" tinted>
      <SectionHeader
        id="about-title"
        eyebrow="06 · About & Contact"
        title="About the research"
        lead="ProSafe is an individual final-year research project at SLIIT, carried out under academic supervision."
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-4">
          <Reveal as="article" className="card p-6" aria-labelledby="researcher-name">
            <div className="flex items-center gap-4">
              <Avatar initials={researcher.initials} photo={researcher.photo} name={researcher.name} />
              <div className="min-w-0">
                <span className="badge badge-safe">Researcher</span>
                <h3 id="researcher-name" className="mt-2 text-[1.35rem] font-bold leading-tight">{researcher.name}</h3>
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-[0.88rem] text-muted">
              <li className="flex items-center gap-2.5"><IdCard className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />Student ID <span className="font-semibold text-ink">{researcher.studentId}</span></li>
              <li className="flex items-start gap-2.5"><GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />{researcher.degree}, specializing in {researcher.specialization}</li>
              <li className="flex items-start gap-2.5"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />{researcher.department}, {researcher.institution}</li>
            </ul>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line/10 pt-4 text-[0.82rem]">
              <div><dt className="text-muted">Project ID</dt><dd className="font-semibold text-ink">{site.projectId}</dd></div>
              <div><dt className="text-muted">Module</dt><dd className="font-semibold text-ink">{site.module}</dd></div>
              <div><dt className="text-muted">Research group</dt><dd className="font-semibold text-ink">{site.researchGroup}</dd></div>
              <div><dt className="text-muted">Project type</dt><dd className="font-semibold text-ink">Individual research</dd></div>
            </dl>
          </Reveal>

          <Reveal className="card p-5">
            <h3 className="text-[0.76rem] font-bold uppercase tracking-[0.14em] text-muted">Supervision</h3>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {supervisors.map((s) => (
                <li key={s.name} className="flex items-center gap-3">
                  <Avatar initials={s.initials} name={s.name} size="md" />
                  <div className="min-w-0">
                    <p className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-cyan">{s.role}</p>
                    <p className="font-semibold text-ink">{s.name}</p>
                    <p className="text-[0.76rem] text-muted">{s.affiliation}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal className="card-raised flex flex-wrap gap-2 p-4">
            {contact.email ? (
              <a href={`mailto:${contact.email}`} className="btn btn-secondary btn-sm"><Mail className="h-4 w-4" aria-hidden="true" /> {contact.email}</a>
            ) : (
              <span className="inline-flex items-center gap-2 text-[0.84rem] text-muted"><Mail className="h-4 w-4 text-brand" aria-hidden="true" /> Public email to be added. Please use the form.</span>
            )}
            <a href={contact.repository} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
              <BrandIcon name="siGithub" className="h-4 w-4" /> Source repository<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </Reveal>
        </div>

        <div id="contact" className="flex flex-col gap-4 outline-none" tabIndex={-1}>
          <Reveal>
            <ContactForm ref={formRef} />
          </Reveal>
          <EmailTemplate onUse={(subject, body) => formRef.current?.applyTemplate(subject, body)} />
        </div>
      </div>
    </Section>
  );
}
