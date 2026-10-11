import { describe, expect, it } from 'vitest';
import { encodeForm, formatBytes, formatMetric } from './format.js';

describe('format helpers', () => {
  it('formats file sizes with SI units', () => {
    expect(formatBytes(87884)).toBe('88 KB');
    expect(formatBytes(1200982)).toBe('1.2 MB');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats metrics to a fixed precision', () => {
    expect(formatMetric(0.9546)).toBe('0.955');
    expect(formatMetric(0, 4)).toBe('0.0000');
  });

  it('url-encodes form data for Netlify', () => {
    expect(encodeForm({ 'form-name': 'contact', message: 'a&b c' })).toBe('form-name=contact&message=a%26b%20c');
  });
});
