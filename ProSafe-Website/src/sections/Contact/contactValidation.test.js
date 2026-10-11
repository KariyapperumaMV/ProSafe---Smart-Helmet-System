import { describe, expect, it } from 'vitest';
import { EMPTY, validate } from './contactValidation.js';
import { contact } from '../../data/site.js';

const valid = {
  ...EMPTY,
  name: 'A Visitor',
  email: 'visitor@example.com',
  subject: 'Question about the data-quality gate',
  message: 'Could you explain how UNCERTAIN observations are handled on the dashboard?',
};

describe('contact form validation', () => {
  it('accepts a complete message', () => {
    expect(validate(valid)).toEqual({});
  });

  it('requires name, email, subject and a meaningful message', () => {
    expect(Object.keys(validate(EMPTY)).sort()).toEqual(['email', 'message', 'name', 'subject']);
  });

  it('rejects malformed email addresses', () => {
    for (const email of ['plain', 'a@b', 'a@b.', '@example.com', 'a b@example.com']) {
      expect(validate({ ...valid, email }).email, email).toBeDefined();
    }
  });

  it('rejects the email template while its placeholders are unchanged', () => {
    const errors = validate({ ...valid, subject: contact.emailTemplate.subject, message: contact.emailTemplate.body });
    expect(errors.subject).toBeDefined();
    expect(errors.message).toBeDefined();
  });
});
