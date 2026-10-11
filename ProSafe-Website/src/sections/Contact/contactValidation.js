/** Client-side validation for the contact form. */

export const EMPTY = { name: '', email: '', affiliation: '', subject: '', message: '' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MESSAGE_MAX = 2000;
// Matches the unfilled placeholders of the email template, e.g. "[your name]".
const PLACEHOLDER_RE = /\[(your|topic)[^\]]*\]/i;

export function validate(values) {
  const errors = {};
  if (!values.name.trim()) errors.name = 'Please enter your name.';
  if (!values.email.trim()) errors.email = 'Please enter your email address.';
  else if (!EMAIL_RE.test(values.email.trim())) errors.email = 'Please enter a valid email address, e.g. name@example.com.';
  if (!values.subject.trim()) errors.subject = 'Please enter a subject.';
  else if (PLACEHOLDER_RE.test(values.subject)) errors.subject = 'Please replace the bracketed placeholder in the subject.';
  if (values.message.trim().length < 20) errors.message = 'Please write a message of at least 20 characters.';
  else if (values.message.length > MESSAGE_MAX) errors.message = `Please keep your message under ${MESSAGE_MAX} characters.`;
  else if (PLACEHOLDER_RE.test(values.message)) errors.message = 'Please replace the bracketed placeholders, such as [your name], with your own details.';
  return errors;
}
