const { timezone: defaultTimezone } = require("../config/appConfig");

const PERIOD_TYPES = ["daily", "weekly", "monthly"];
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Computes the given IANA timezone's UTC offset (in minutes) at a specific
// instant, by formatting that instant's wall-clock time in the target zone
// and diffing it against the same instant read as UTC. Correct for any zone
// at any instant except right at a DST transition edge (off by at most the
// DST delta there) — irrelevant here since Asia/Colombo has no DST
// (appConfig documents it as a fixed UTC+05:30 offset), but written
// generically rather than hardcoding +330 so it stays correct if the
// configured timezone ever changes.
function timezoneOffsetMinutes(timeZone, instant) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUTC - instant.getTime()) / 60000);
}

// Returns the UTC Date instant corresponding to 00:00:00.000 local wall-clock
// time on the given {year,month,day} (month 1-indexed) in `timeZone`.
function localMidnightInstant({ year, month, day }, timeZone) {
  const naiveGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const offsetMin = timezoneOffsetMinutes(timeZone, naiveGuess);
  return new Date(naiveGuess.getTime() - offsetMin * 60000);
}

// Parses "YYYY-MM-DD" into calendar parts, rejecting anything that isn't a
// real calendar date (e.g. 2026-02-30) by round-tripping through Date.UTC
// and checking nothing rolled over.
function parseDateStr(dateStr) {
  const m = DATE_RE.exec(dateStr || "");
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

function formatDateStr({ year, month, day }) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Pure calendar-field arithmetic (never treated as a real instant) — safe to
// add/subtract days using a UTC-anchored scratch Date purely as a calendar
// calculator.
function addDays(parts, n) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  d.setUTCDate(d.getUTCDate() + n);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function addMonths(parts, n) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + n);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: 1 };
}

// 0=Sunday..6=Saturday for the given plain calendar date — this is a pure
// calendar fact, independent of timezone, so it's safe to compute via a
// UTC-anchored scratch Date.
function dayOfWeek(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function daysSinceMonday(parts) {
  const dow = dayOfWeek(parts); // Sun=0..Sat=6
  return (dow + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
}

function todayDateStr(timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

// The ordered list of trend-chart bucket labels for a period, plus whether
// buckets are hour-of-day or calendar-day — so analyticsService can
// zero-fill every bucket (a chart must never silently drop a
// no-activity hour/day) without re-deriving calendar math itself.
function enumerateBuckets(periodType, dateStr, timeZone = defaultTimezone) {
  const refParts = parseDateStr(dateStr);
  if (!refParts) throw new Error(`enumerateBuckets: invalid dateStr "${dateStr}"`);

  if (periodType === "daily") {
    return { granularity: "hour", labels: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`) };
  }

  if (periodType === "weekly") {
    const mondayParts = addDays(refParts, -daysSinceMonday(refParts));
    const labels = [];
    let cur = mondayParts;
    for (let i = 0; i < 7; i++) {
      labels.push(formatDateStr(cur));
      cur = addDays(cur, 1);
    }
    return { granularity: "day", labels };
  }

  // monthly
  const firstOfMonth = { year: refParts.year, month: refParts.month, day: 1 };
  const nextMonthFirst = addMonths(firstOfMonth, 1);
  const daysInMonth = Math.round(
    (localMidnightInstant(nextMonthFirst, timeZone).getTime() - localMidnightInstant(firstOfMonth, timeZone).getTime()) /
      86400000
  );
  const labels = [];
  let cur = firstOfMonth;
  for (let i = 0; i < daysInMonth; i++) {
    labels.push(formatDateStr(cur));
    cur = addDays(cur, 1);
  }
  return { granularity: "day", labels };
}

// Validates a `period` query param. Returns the canonical string or null.
function validatePeriodType(period) {
  return PERIOD_TYPES.includes(period) ? period : null;
}

// Validates a `date` query param already normalized to "YYYY-MM-DD" (or
// undefined/omitted, which resolves to "today" in the configured timezone —
// per spec, only an explicitly-supplied malformed date is a 400, an omitted
// one silently defaults). Returns { ok, dateStr, error }.
function resolveDateParam(rawDate, timeZone = defaultTimezone) {
  if (rawDate === undefined || rawDate === null || rawDate === "") {
    return { ok: true, dateStr: todayDateStr(timeZone) };
  }
  const parsed = parseDateStr(rawDate);
  if (!parsed) {
    return { ok: false, error: `Invalid date "${rawDate}" — expected YYYY-MM-DD` };
  }
  return { ok: true, dateStr: formatDateStr(parsed) };
}

// Core: given a validated period type + "YYYY-MM-DD" reference date, returns
// { start, end, label, previous: { start, end, label } } as UTC Date
// instants ready for Mongo $gte/$lt range queries. `end` is always exclusive
// (start of the next period), so filters are always `{$gte:start,$lt:end}`.
function getPeriodBoundaries(periodType, dateStr, timeZone = defaultTimezone) {
  const refParts = parseDateStr(dateStr);
  if (!refParts) throw new Error(`getPeriodBoundaries: invalid dateStr "${dateStr}"`);

  if (periodType === "daily") {
    const start = localMidnightInstant(refParts, timeZone);
    const nextDayParts = addDays(refParts, 1);
    const end = localMidnightInstant(nextDayParts, timeZone);
    const prevParts = addDays(refParts, -1);
    return {
      start, end, label: formatDateStr(refParts),
      previous: buildRange("daily", prevParts, timeZone),
    };
  }

  if (periodType === "weekly") {
    const mondayParts = addDays(refParts, -daysSinceMonday(refParts));
    const start = localMidnightInstant(mondayParts, timeZone);
    const nextMondayParts = addDays(mondayParts, 7);
    const end = localMidnightInstant(nextMondayParts, timeZone);
    const sundayParts = addDays(mondayParts, 6);
    const prevMondayParts = addDays(mondayParts, -7);
    return {
      start, end,
      label: `${formatDateStr(mondayParts)} to ${formatDateStr(sundayParts)}`,
      weekStart: formatDateStr(mondayParts), weekEnd: formatDateStr(sundayParts),
      previous: buildRange("weekly", prevMondayParts, timeZone),
    };
  }

  // monthly
  const firstOfMonth = { year: refParts.year, month: refParts.month, day: 1 };
  const start = localMidnightInstant(firstOfMonth, timeZone);
  const nextMonthParts = addMonths(firstOfMonth, 1);
  const end = localMidnightInstant(nextMonthParts, timeZone);
  const prevMonthParts = addMonths(firstOfMonth, -1);
  return {
    start, end,
    label: `${refParts.year}-${String(refParts.month).padStart(2, "0")}`,
    previous: buildRange("monthly", prevMonthParts, timeZone),
  };
}

// Builds just the {start,end,label} for a previous-period reference date,
// without recursing into its own `previous` (comparison is always exactly
// one period back, never chained).
function buildRange(periodType, refParts, timeZone) {
  if (periodType === "daily") {
    const start = localMidnightInstant(refParts, timeZone);
    const end = localMidnightInstant(addDays(refParts, 1), timeZone);
    return { start, end, label: formatDateStr(refParts) };
  }
  if (periodType === "weekly") {
    // refParts here is already the Monday of the previous week.
    const start = localMidnightInstant(refParts, timeZone);
    const end = localMidnightInstant(addDays(refParts, 7), timeZone);
    const sundayParts = addDays(refParts, 6);
    return { start, end, label: `${formatDateStr(refParts)} to ${formatDateStr(sundayParts)}` };
  }
  // monthly — refParts is already the 1st of the previous month.
  const start = localMidnightInstant(refParts, timeZone);
  const end = localMidnightInstant(addMonths(refParts, 1), timeZone);
  return { start, end, label: `${refParts.year}-${String(refParts.month).padStart(2, "0")}` };
}

module.exports = {
  PERIOD_TYPES,
  validatePeriodType,
  resolveDateParam,
  getPeriodBoundaries,
  enumerateBuckets,
  todayDateStr,
};
