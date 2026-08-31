const {
  validatePeriodType,
  resolveDateParam,
  getPeriodBoundaries,
  enumerateBuckets,
} = require("../services/analyticsPeriodService");

const TZ = "Asia/Colombo";

function iso(d) {
  return d.toISOString();
}

describe("validatePeriodType", () => {
  test("accepts daily/weekly/monthly", () => {
    expect(validatePeriodType("daily")).toBe("daily");
    expect(validatePeriodType("weekly")).toBe("weekly");
    expect(validatePeriodType("monthly")).toBe("monthly");
  });
  test("rejects anything else", () => {
    expect(validatePeriodType("yearly")).toBeNull();
    expect(validatePeriodType("")).toBeNull();
    expect(validatePeriodType(undefined)).toBeNull();
  });
});

describe("resolveDateParam", () => {
  test("omitted date resolves to today in the configured timezone", () => {
    const res = resolveDateParam(undefined, TZ);
    expect(res.ok).toBe(true);
    expect(res.dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  test("a well-formed date passes through", () => {
    const res = resolveDateParam("2026-08-31", TZ);
    expect(res).toEqual({ ok: true, dateStr: "2026-08-31" });
  });
  test("a malformed date is rejected, not silently defaulted", () => {
    expect(resolveDateParam("31-08-2026", TZ).ok).toBe(false);
    expect(resolveDateParam("2026/08/31", TZ).ok).toBe(false);
    expect(resolveDateParam("not-a-date", TZ).ok).toBe(false);
  });
  test("an impossible calendar date is rejected", () => {
    expect(resolveDateParam("2026-02-30", TZ).ok).toBe(false); // Feb never has 30 days
    expect(resolveDateParam("2025-02-29", TZ).ok).toBe(false); // 2025 is not a leap year
    expect(resolveDateParam("2024-02-29", TZ).ok).toBe(true); // 2024 IS a leap year
  });
});

describe("getPeriodBoundaries — daily", () => {
  test("Colombo local midnight maps to 18:30 UTC the previous day (UTC+05:30)", () => {
    const { start, end } = getPeriodBoundaries("daily", "2026-08-31", TZ);
    expect(iso(start)).toBe("2026-08-30T18:30:00.000Z");
    expect(iso(end)).toBe("2026-08-31T18:30:00.000Z");
  });

  test("a UTC timestamp that falls on the adjacent UTC calendar day is grouped by Colombo local date", () => {
    // 2026-08-31T20:00:00Z is 2026-09-01T01:30 in Colombo — must belong to
    // the 09-01 daily period, not 08-31.
    const late = new Date("2026-08-31T20:00:00.000Z");
    const aug31 = getPeriodBoundaries("daily", "2026-08-31", TZ);
    const sep01 = getPeriodBoundaries("daily", "2026-09-01", TZ);
    expect(late.getTime() >= aug31.start.getTime() && late.getTime() < aug31.end.getTime()).toBe(false);
    expect(late.getTime() >= sep01.start.getTime() && late.getTime() < sep01.end.getTime()).toBe(true);

    // Conversely, 2026-08-31T02:00:00Z is 2026-08-31T07:30 in Colombo — must
    // belong to 08-31, not fall out of range.
    const early = new Date("2026-08-31T02:00:00.000Z");
    expect(early.getTime() >= aug31.start.getTime() && early.getTime() < aug31.end.getTime()).toBe(true);
  });

  test("previous period is the previous calendar day", () => {
    const { previous } = getPeriodBoundaries("daily", "2026-08-31", TZ);
    expect(previous.label).toBe("2026-08-30");
    expect(iso(previous.start)).toBe("2026-08-29T18:30:00.000Z");
    expect(iso(previous.end)).toBe("2026-08-30T18:30:00.000Z");
  });
});

describe("getPeriodBoundaries — weekly (Monday-Sunday)", () => {
  test("2026-08-31 is a Monday — the week is Aug 31 to Sep 6", () => {
    const { start, end, label, weekStart, weekEnd } = getPeriodBoundaries("weekly", "2026-08-31", TZ);
    expect(weekStart).toBe("2026-08-31");
    expect(weekEnd).toBe("2026-09-06");
    expect(label).toBe("2026-08-31 to 2026-09-06");
    expect(iso(start)).toBe("2026-08-30T18:30:00.000Z"); // Monday 00:00 Colombo
    expect(iso(end)).toBe("2026-09-06T18:30:00.000Z"); // following Monday 00:00 Colombo
  });

  test("a mid-week date (Thursday) resolves to the same Mon-Sun week as the Monday", () => {
    const thursday = getPeriodBoundaries("weekly", "2026-09-03", TZ); // Thu
    const monday = getPeriodBoundaries("weekly", "2026-08-31", TZ);
    expect(thursday.weekStart).toBe(monday.weekStart);
    expect(thursday.weekEnd).toBe(monday.weekEnd);
  });

  test("a Sunday resolves back to the Monday that started its week", () => {
    const sunday = getPeriodBoundaries("weekly", "2026-09-06", TZ);
    expect(sunday.weekStart).toBe("2026-08-31");
    expect(sunday.weekEnd).toBe("2026-09-06");
  });

  test("previous period is the preceding Monday-Sunday week", () => {
    const { previous } = getPeriodBoundaries("weekly", "2026-08-31", TZ);
    expect(previous.label).toBe("2026-08-24 to 2026-08-30");
  });

  test("Colombo local Sunday 23:59 stays inside the week even though its UTC instant is the next UTC day", () => {
    // 2026-09-06T23:00 Colombo = 2026-09-06T17:30Z, well within the week.
    // 2026-09-06T20:00 Colombo would be 2026-09-06T14:30Z — pick a point
    // right before local midnight rollover: 2026-09-07T05:00Z = 2026-09-07T10:30 Colombo (next week).
    const { start, end } = getPeriodBoundaries("weekly", "2026-08-31", TZ);
    const justBeforeMidnight = new Date("2026-09-06T18:00:00.000Z"); // 2026-09-06T23:30 Colombo
    const justAfterMidnight = new Date("2026-09-06T18:31:00.000Z"); // 2026-09-07T00:01 Colombo
    expect(justBeforeMidnight.getTime() >= start.getTime() && justBeforeMidnight.getTime() < end.getTime()).toBe(true);
    expect(justAfterMidnight.getTime() >= start.getTime() && justAfterMidnight.getTime() < end.getTime()).toBe(false);
  });
});

describe("getPeriodBoundaries — monthly", () => {
  test("August 2026 runs from Aug 1 to Sep 1 (exclusive)", () => {
    const { start, end, label } = getPeriodBoundaries("monthly", "2026-08-15", TZ);
    expect(label).toBe("2026-08");
    expect(iso(start)).toBe("2026-07-31T18:30:00.000Z"); // Aug 1 00:00 Colombo
    expect(iso(end)).toBe("2026-08-31T18:30:00.000Z"); // Sep 1 00:00 Colombo
  });

  test("the first day of the month resolves to that month, not the previous one", () => {
    const { label } = getPeriodBoundaries("monthly", "2026-08-01", TZ);
    expect(label).toBe("2026-08");
  });

  test("the last day of the month resolves to that month, not the next one", () => {
    const { label, end } = getPeriodBoundaries("monthly", "2026-08-31", TZ);
    expect(label).toBe("2026-08");
    // Confirm no spill into September: a packet at Sep 1 00:00:01 Colombo is excluded.
    const spillover = new Date("2026-08-31T18:30:01.000Z"); // Sep 1 00:00:01 Colombo
    expect(spillover.getTime() < end.getTime()).toBe(false);
  });

  test("February (non-leap year 2026) runs 28 days, no spill into March", () => {
    const { start, end } = getPeriodBoundaries("monthly", "2026-02-15", TZ);
    expect(iso(start)).toBe("2026-01-31T18:30:00.000Z");
    expect(iso(end)).toBe("2026-02-28T18:30:00.000Z"); // March 1 00:00 Colombo
  });

  test("February (leap year 2024) runs 29 days", () => {
    const { start, end } = getPeriodBoundaries("monthly", "2024-02-15", TZ);
    expect(iso(start)).toBe("2024-01-31T18:30:00.000Z");
    expect(iso(end)).toBe("2024-02-29T18:30:00.000Z"); // March 1 00:00 Colombo
  });

  test("previous period is the preceding calendar month, including a January -> December year rollover", () => {
    const { previous } = getPeriodBoundaries("monthly", "2026-01-15", TZ);
    expect(previous.label).toBe("2025-12");
  });
});

describe("enumerateBuckets", () => {
  test("daily -> 24 hour-of-day labels, zero-filled regardless of activity", () => {
    const { granularity, labels } = enumerateBuckets("daily", "2026-08-31", TZ);
    expect(granularity).toBe("hour");
    expect(labels).toHaveLength(24);
    expect(labels[0]).toBe("00:00");
    expect(labels[23]).toBe("23:00");
  });

  test("weekly -> 7 day labels, Monday first regardless of which day was selected", () => {
    const fromMonday = enumerateBuckets("weekly", "2026-08-31", TZ);
    const fromThursday = enumerateBuckets("weekly", "2026-09-03", TZ);
    expect(fromMonday.labels).toEqual([
      "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06",
    ]);
    expect(fromThursday.labels).toEqual(fromMonday.labels);
  });

  test("monthly -> one label per calendar day, correct count for 31/30/28/29-day months", () => {
    expect(enumerateBuckets("monthly", "2026-08-15", TZ).labels).toHaveLength(31);
    expect(enumerateBuckets("monthly", "2026-04-15", TZ).labels).toHaveLength(30);
    expect(enumerateBuckets("monthly", "2026-02-15", TZ).labels).toHaveLength(28); // 2026 not leap
    expect(enumerateBuckets("monthly", "2024-02-15", TZ).labels).toHaveLength(29); // 2024 leap
    const aug = enumerateBuckets("monthly", "2026-08-15", TZ);
    expect(aug.labels[0]).toBe("2026-08-01");
    expect(aug.labels[30]).toBe("2026-08-31");
  });
});
