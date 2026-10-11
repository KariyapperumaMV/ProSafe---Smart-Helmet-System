import { useRef, useState } from 'react';
import { Building2, Check, ClipboardPaste, Copy, Mail, UserRound } from 'lucide-react';
import { contact, researcher, site } from '../../data/site.js';
import { Section, SectionHeader } from '../../components/ui/Section.jsx';
import { Reveal } from '../../components/ui/Reveal.jsx';
import { BrandIcon } from '../../components/ui/BrandIcon.jsx';
import { ContactForm } from './ContactForm.jsx';

function InfoRow({ icon: IconComponent, brand, label, children }) {
  return (
    <li className="card-raised flex gap-4 p-4">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-brand/10 text-brand ring-1 ring-inset ring-brand/25">
        {brand ? <BrandIcon name={brand} className="h-5 w-5" /> : <IconComponent className="h-5 w-5" aria-hidden="true" />}
      </span>
      <div className="min-w-0">
        <p className="text-[0.74rem] font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
        <div className="mt-0.5 break-words text-[0.92rem] text-ink">{children}</div>
      </div>
    </li>
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
    <div className="card p-6">
      <h3 className="text-[1.05rem] font-bold">Email template for enquiries</h3>
      <p className="mt-1 text-[0.84rem] text-muted">A suggested structure. Replace the bracketed parts with your own details.</p>
      <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-sm border border-line/15 bg-black/30 p-4 font-sans text-[0.82rem] leading-relaxed text-muted">
        {text}
      </pre>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onUse(contact.emailTemplate.subject, contact.emailTemplate.body)} className="btn btn-secondary btn-sm">
          <ClipboardPaste className="h-4 w-4" aria-hidden="true" /> Use in the form
        </button>
        <button type="button" onClick={copy} className="btn btn-secondary btn-sm">
          {copied ? <Check className="h-4 w-4 text-brand" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy template'}
        </button>
        {mailto && (
          <a href={mailto} className="btn btn-secondary btn-sm">
            <Mail className="h-4 w-4" aria-hidden="true" /> Open in email app
          </a>
        )}
      </div>
      <p className="sr-only" aria-live="polite">{copied ? 'Template copied to clipboard' : ''}</p>
    </div>
  );
}

export function ContactSection() {
  const formRef = useRef(null);

  return (
    <Section id="contact" labelledBy="contact-title">
      <SectionHeader
        id="contact-title"
        eyebrow="07 · Contact Us"
        title="Get in touch"
        lead="Questions about the research, the prototype or the evaluation are welcome. Use the form below to reach the researcher."
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="flex flex-col gap-6">
          <Reveal as="ul" className="space-y-3">
            <InfoRow icon={UserRound} label="Researcher">
              <span className="font-semibold">{researcher.name}</span>
              <span className="block text-[0.84rem] text-muted">{researcher.studentId} · {site.projectId}</span>
            </InfoRow>
            <InfoRow icon={Building2} label="Institution">
              {researcher.department}
              <span className="block text-[0.84rem] text-muted">{contact.location}</span>
            </InfoRow>
            <InfoRow icon={Mail} label="Email">
              {contact.email ? (
                <a href={`mailto:${contact.email}`} className="font-semibold text-brand hover:underline">{contact.email}</a>
              ) : (
                <span className="text-muted">A public contact email will be added soon. Please use the contact form.</span>
              )}
            </InfoRow>
            <InfoRow brand="siGithub" label="Source code">
              <a href={contact.repository} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
                ProSafe repository on GitHub
              </a>
              <span className="sr-only"> (opens in a new tab)</span>
            </InfoRow>
          </Reveal>
          <Reveal>
            <EmailTemplate onUse={(subject, body) => formRef.current?.applyTemplate(subject, body)} />
          </Reveal>
        </div>

        <Reveal>
          <ContactForm ref={formRef} />
        </Reveal>
      </div>
    </Section>
  );
}
