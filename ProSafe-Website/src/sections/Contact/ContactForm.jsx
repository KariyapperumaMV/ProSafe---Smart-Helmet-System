import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, LoaderCircle, Send } from 'lucide-react';
import { contact } from '../../data/site.js';
import { encodeForm } from '../../lib/format.js';
import { EMPTY, MESSAGE_MAX, validate } from './contactValidation.js';

function Field({ id, label, error, optional, children, hint }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.84rem] font-semibold text-ink">
        {label} {optional ? <span className="font-normal text-muted">(optional)</span> : <span className="text-brand" aria-hidden="true">*</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-[0.76rem] text-muted">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-[0.78rem] font-medium text-danger">
          <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" /> {error}
        </p>
      )}
    </div>
  );
}

const inputClass = (error) =>
  `w-full rounded-sm border bg-white/[0.04] px-3.5 py-2.5 text-[0.92rem] text-ink placeholder:text-faint transition-shadow focus:outline-none focus:ring-2 ${
    error ? 'border-danger/70 focus:ring-danger/30' : 'border-line/30 focus:border-brand focus:ring-brand/30'
  }`;

/**
 * Contact form submitted to Netlify Forms. A submission is only reported as
 * sent when the server accepts it; any other outcome shows an error.
 */
export const ContactForm = forwardRef(function ContactForm(_props, ref) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState(false);
  const [state, setState] = useState('idle'); // idle | sending | success | error
  const [botField, setBotField] = useState('');
  const formRef = useRef(null);

  useImperativeHandle(ref, () => ({
    applyTemplate(subject, message) {
      setValues((v) => ({ ...v, subject, message }));
      setState('idle');
      formRef.current?.querySelector('#contact-name')?.focus();
    },
  }));

  const update = (field) => (e) => {
    const next = { ...values, [field]: e.target.value };
    setValues(next);
    if (touched) setErrors(validate(next));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setTouched(true);
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) {
      const first = Object.keys(found)[0];
      formRef.current?.querySelector(`#contact-${first}`)?.focus();
      return;
    }

    if (import.meta.env.DEV) {
      // The Vite dev server cannot process Netlify Forms submissions.
      setState('error');
      return;
    }

    setState('sending');
    try {
      const response = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodeForm({ 'form-name': contact.formName, 'bot-field': botField, ...values }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setState('success');
      setValues(EMPTY);
      setTouched(false);
    } catch {
      setState('error');
    }
  };

  if (state === 'success') {
    return (
      <div className="card flex flex-col items-start gap-4 p-8" role="status">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-brand">
          <CircleCheck className="h-6 w-6" aria-hidden="true" />
        </span>
        <h3 className="text-[1.3rem] font-bold">Thank you, your message has been submitted.</h3>
        <p className="text-[0.92rem] text-muted">Any reply will be sent to the email address you provided.</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setState('idle')}>
          Send another message
        </button>
      </div>
    );
  }

  const describedBy = (field, hint) => (errors[field] ? `contact-${field}-error` : hint ? `contact-${field}-hint` : undefined);

  return (
    <form
      ref={formRef}
      name={contact.formName}
      method="POST"
      data-netlify="true"
      onSubmit={onSubmit}
      noValidate
      className="card p-6 sm:p-8"
      aria-labelledby="contact-form-title"
    >
      <input type="hidden" name="form-name" value={contact.formName} />
      <p className="hidden">
        <label>
          Leave this field empty: <input name="bot-field" value={botField} onChange={(e) => setBotField(e.target.value)} tabIndex={-1} autoComplete="off" />
        </label>
      </p>

      <h3 id="contact-form-title" className="text-[1.25rem] font-bold">Send a message</h3>
      <p className="mt-1 text-[0.86rem] text-muted">Fields marked <span className="text-brand">*</span> are required.</p>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field id="contact-name" label="Name" error={errors.name}>
          <input id="contact-name" name="name" type="text" autoComplete="name" value={values.name} onChange={update('name')}
            aria-invalid={Boolean(errors.name)} aria-describedby={describedBy('name')} aria-required="true" className={inputClass(errors.name)} />
        </Field>
        <Field id="contact-email" label="Email" error={errors.email}>
          <input id="contact-email" name="email" type="email" autoComplete="email" value={values.email} onChange={update('email')}
            aria-invalid={Boolean(errors.email)} aria-describedby={describedBy('email')} aria-required="true" className={inputClass(errors.email)} />
        </Field>
        <Field id="contact-affiliation" label="Organisation or role" optional>
          <input id="contact-affiliation" name="affiliation" type="text" autoComplete="organization" value={values.affiliation} onChange={update('affiliation')}
            className={inputClass(false)} />
        </Field>
        <Field id="contact-subject" label="Subject" error={errors.subject}>
          <input id="contact-subject" name="subject" type="text" value={values.subject} onChange={update('subject')}
            aria-invalid={Boolean(errors.subject)} aria-describedby={describedBy('subject')} aria-required="true" className={inputClass(errors.subject)} />
        </Field>
        <div className="sm:col-span-2">
          <Field id="contact-message" label="Message" error={errors.message} hint={`${values.message.length} / ${MESSAGE_MAX} characters`}>
            <textarea id="contact-message" name="message" rows={6} value={values.message} onChange={update('message')} maxLength={MESSAGE_MAX + 200}
              aria-invalid={Boolean(errors.message)} aria-describedby={describedBy('message', true)} aria-required="true" className={`${inputClass(errors.message)} resize-y`} />
          </Field>
        </div>
      </div>

      {state === 'error' && (
        <div role="alert" className="mt-6 flex gap-3 rounded-sm border border-danger/40 bg-danger/[0.08] p-4 text-[0.86rem] leading-relaxed text-ink/90">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
          <p>
            {import.meta.env.DEV
              ? 'Messages can only be sent from the deployed Netlify website. This local development server does not process form submissions, so nothing was sent.'
              : 'Your message could not be sent. Please check your connection and try again later.'}
            {contact.email && (
              <> You can also email <a className="font-semibold text-brand underline" href={`mailto:${contact.email}`}>{contact.email}</a>.</>
            )}
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-primary px-6 py-3" disabled={state === 'sending'}>
          {state === 'sending' ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          {state === 'sending' ? 'Sending…' : 'Send message'}
        </button>
        <p className="text-[0.78rem] text-muted">Your details are used only to reply to your enquiry.</p>
      </div>
    </form>
  );
});
