// Safety Trend chart logic, kept free of any chart-library code so it can be
// tested directly.
//
// Input: timeline SEGMENTS as returned by GET /api/users/:id/safety-predictions
// (consecutive equal states already grouped server-side):
//   { state, from, to, pointCount, avgConfidence, dataQuality, uncertainReason }
// Live per-sample points (WORKER_UPDATE event `points`) are merged into the
// same structure by mergeLivePoints().
//
// SAFE/WARNING/CRITICAL are ordered safety levels 0/1/2. UNCERTAIN is NOT a
// level: it gets no y value (the risk line breaks) and is drawn as a grey
// band instead, so it can never look "safer than Safe" or join two levels.

export const STATE_LEVEL = { SAFE: 0, WARNING: 1, CRITICAL: 2 };
export const LEVEL_LABELS = ["Safe", "Warning", "Critical"];
export const RISK_KEYS = ["SAFE", "WARNING", "CRITICAL"];
// Same rule as the backend (userSensorService.TIMELINE_GAP_SECONDS): longer
// than this without data -> the line is broken, never drawn across the gap.
export const DEFAULT_GAP_MS = 600 * 1000;
// A segment holding a single 1 Hz sample still needs a visible width.
const MIN_SEGMENT_MS = 1000;

export const TREND_RANGES = [
  { key: "15m", label: "Last 15 min", ms: 15 * 60 * 1000 },
  { key: "1h", label: "Last 1 hour", ms: 60 * 60 * 1000 },
  { key: "today", label: "Today", ms: null },
];

export function levelForState(state) {
  return Object.prototype.hasOwnProperty.call(STATE_LEVEL, state) ? STATE_LEVEL[state] : null;
}

export function labelForLevel(level) {
  return LEVEL_LABELS[level] ?? "";
}

const ms = (t) => (typeof t === "number" ? t : new Date(t).getTime());

export function rangeStartMs(rangeKey, nowMs = Date.now()) {
  const range = TREND_RANGES.find((r) => r.key === rangeKey) || TREND_RANGES[1];
  if (range.ms) return nowMs - range.ms;
  const midnight = new Date(nowMs);
  midnight.setHours(0, 0, 0, 0);
  return midnight.getTime();
}

// Append live per-sample points to segments, in time order. Points at or
// before the last known sample are dropped (already in the REST history, or
// a duplicate event), so merging the same event twice changes nothing.
export function mergeLivePoints(segments, points, gapMs = DEFAULT_GAP_MS) {
  if (!points || !points.length) return segments;
  const out = segments.slice();
  let last = out.length ? { ...out[out.length - 1] } : null;
  if (last) out[out.length - 1] = last;
  const sorted = [...points].sort((a, b) => ms(a.timestamp) - ms(b.timestamp));

  for (const p of sorted) {
    if (!p.state) continue;
    const t = ms(p.timestamp);
    if (last && t <= ms(last.to)) continue;
    const reason = p.state === "UNCERTAIN" ? p.uncertainReason ?? null : null;
    const continues =
      last && last.state === p.state && t - ms(last.to) <= gapMs && (p.state !== "UNCERTAIN" || last.uncertainReason === reason);

    if (continues) {
      if (p.confidence != null) {
        const n = last.confidenceCount ?? (last.avgConfidence != null ? last.pointCount : 0);
        last.avgConfidence = ((last.avgConfidence ?? 0) * n + p.confidence) / (n + 1);
        last.confidenceCount = n + 1;
      }
      last.to = new Date(t).toISOString();
      last.pointCount += 1;
      if (p.dataQuality === "IMPUTED" && last.dataQuality === "VALID") last.dataQuality = "IMPUTED";
    } else {
      last = {
        state: p.state,
        from: new Date(t).toISOString(),
        to: new Date(t).toISOString(),
        pointCount: 1,
        avgConfidence: p.confidence ?? null,
        confidenceCount: p.confidence != null ? 1 : 0,
        dataQuality: p.state === "UNCERTAIN" ? "UNCERTAIN" : p.dataQuality ?? null,
        uncertainReason: reason,
      };
      out.push(last);
    }
  }
  return out;
}

// Segments overlapping [startMs, ...), each with its drawn end: up to the next
// segment when contiguous, otherwise its last sample + MIN_SEGMENT_MS.
export function visibleSegments(segments, { startMs = -Infinity, gapMs = DEFAULT_GAP_MS } = {}) {
  const out = [];
  segments.forEach((seg, i) => {
    const from = ms(seg.from);
    const to = ms(seg.to);
    const next = segments[i + 1];
    const contiguous = next && ms(next.from) - to <= gapMs;
    const end = contiguous ? Math.max(ms(next.from), to) : to + MIN_SEGMENT_MS;
    if (end < startMs) return;
    out.push({ ...seg, start: Math.max(from, startMs), end, contiguousWithNext: Boolean(contiguous) });
  });
  return out;
}

// -> { rows, bands } for a step-line chart:
//   rows : sorted by t. `level` = 0/1/2 or null (break); one key per risk
//          state (SAFE/WARNING/CRITICAL) holding the level only inside that
//          state's segments (coloured overlay); `seg` = the segment for the
//          tooltip; `hover` is constant so a tooltip exists everywhere.
//   bands: UNCERTAIN periods { x1, x2, seg } drawn as grey hatched regions.
export function buildTrendData(segments, { startMs = -Infinity, gapMs = DEFAULT_GAP_MS } = {}) {
  const rows = [];
  const bands = [];
  for (const seg of visibleSegments(segments, { startMs, gapMs })) {
    const level = levelForState(seg.state);
    const info = {
      state: seg.state,
      from: seg.from,
      to: seg.to,
      avgConfidence: seg.avgConfidence ?? null,
      dataQuality: seg.dataQuality ?? null,
      uncertainReason: seg.uncertainReason ?? null,
      pointCount: seg.pointCount,
    };
    if (level === null) {
      bands.push({ x1: seg.start, x2: seg.end, seg: info });
      rows.push({ t: seg.start, level: null, hover: 1, seg: info });
      rows.push({ t: seg.end, level: null, hover: 1, seg: info });
    } else {
      rows.push({ t: seg.start, level, [seg.state]: level, hover: 1, seg: info });
      rows.push({ t: seg.end, level, [seg.state]: level, hover: 1, seg: info });
    }
    // Missing data after this segment: break every line here.
    if (!seg.contiguousWithNext) rows.push({ t: seg.end, level: null, hover: 1, seg: info, gap: true });
  }
  return { rows, bands };
}

// Grouped periods for the compact history list (newest first).
export function historyEntries(segments, { startMs = -Infinity, gapMs = DEFAULT_GAP_MS, limit = 30 } = {}) {
  return visibleSegments(segments, { startMs, gapMs }).reverse().slice(0, limit);
}
