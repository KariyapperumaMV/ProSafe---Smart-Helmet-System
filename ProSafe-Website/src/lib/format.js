/** Formats a byte count with decimal (SI) units, e.g. 1200982 -> "1.2 MB". */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} B`;
}

/** Formats a 0–1 metric as a fixed-precision string, e.g. 0.9546 -> "0.955". */
export function formatMetric(value, digits = 3) {
  return Number(value).toFixed(digits);
}

export function encodeForm(data) {
  return Object.keys(data)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(data[key] ?? '')}`)
    .join('&');
}
