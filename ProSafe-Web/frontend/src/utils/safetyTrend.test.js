import { describe, expect, test } from "vitest";
import {
  DEFAULT_GAP_MS,
  buildTrendData,
  historyEntries,
  labelForLevel,
  levelForState,
  mergeLivePoints,
  rangeStartMs,
} from "./safetyTrend";

const T0 = Date.UTC(2026, 9, 9, 4, 0, 0);
const at = (s) => new Date(T0 + s * 1000).toISOString();
const point = (s, state, extra = {}) => ({
  timestamp: at(s),
  state,
  confidence: state === "UNCERTAIN" ? null : 0.9,
  dataQuality: state === "UNCERTAIN" ? "UNCERTAIN" : "VALID",
  uncertainReason: state === "UNCERTAIN" ? "INSUFFICIENT_HISTORY" : null,
  ...extra,
});

// The sequence from the requirements, one sample per second.
const SEQUENCE = ["SAFE", "SAFE", "WARNING", "WARNING", "UNCERTAIN", "UNCERTAIN", "WARNING", "CRITICAL", "CRITICAL", "WARNING"];
const seqPoints = () => SEQUENCE.map((s, i) => point(i, s));

describe("status -> level mapping", () => {
  test("SAFE/WARNING/CRITICAL are 0/1/2 with categorical labels; UNCERTAIN has no level", () => {
    expect([levelForState("SAFE"), levelForState("WARNING"), levelForState("CRITICAL")]).toEqual([0, 1, 2]);
    expect([0, 1, 2].map(labelForLevel)).toEqual(["Safe", "Warning", "Critical"]);
    expect(levelForState("UNCERTAIN")).toBeNull();
    expect(levelForState("EMERGENCY")).toBeNull();
    expect(levelForState(null)).toBeNull();
  });
});

describe("mergeLivePoints", () => {
  test("groups consecutive equal states into segments (no per-second noise)", () => {
    const segs = mergeLivePoints([], seqPoints());
    expect(segs.map((s) => [s.state, s.pointCount])).toEqual([
      ["SAFE", 2], ["WARNING", 2], ["UNCERTAIN", 2], ["WARNING", 1], ["CRITICAL", 2], ["WARNING", 1],
    ]);
    expect(segs[2]).toMatchObject({ uncertainReason: "INSUFFICIENT_HISTORY", dataQuality: "UNCERTAIN", avgConfidence: null });
  });

  test("appending a live point extends the last segment or starts a new one", () => {
    const base = mergeLivePoints([], seqPoints());
    const extended = mergeLivePoints(base, [point(10, "WARNING")]);
    expect(extended).toHaveLength(base.length);
    expect(extended.at(-1)).toMatchObject({ state: "WARNING", pointCount: 2, to: at(10) });
    const next = mergeLivePoints(extended, [point(11, "CRITICAL")]);
    expect(next).toHaveLength(base.length + 1);
    expect(base.at(-1).pointCount).toBe(1); // inputs are never mutated
  });

  test("duplicate / already-loaded points are ignored (no duplicate records)", () => {
    const base = mergeLivePoints([], seqPoints());
    expect(mergeLivePoints(base, seqPoints())).toEqual(base);
    expect(mergeLivePoints(base, [point(9, "SAFE")])).toEqual(base);
  });

  test("a different UNCERTAIN reason starts a new period; a long data gap splits equal states", () => {
    const a = mergeLivePoints([], [point(0, "UNCERTAIN"), point(1, "UNCERTAIN", { uncertainReason: "PACKET_LOSS" })]);
    expect(a.map((s) => s.uncertainReason)).toEqual(["INSUFFICIENT_HISTORY", "PACKET_LOSS"]);
    const b = mergeLivePoints([], [point(0, "SAFE"), point(DEFAULT_GAP_MS / 1000 + 5, "SAFE")]);
    expect(b).toHaveLength(2);
  });

  test("running confidence average and IMPUTED data quality carry into the segment", () => {
    const segs = mergeLivePoints([], [point(0, "SAFE", { confidence: 0.8 }), point(1, "SAFE", { confidence: 1, dataQuality: "IMPUTED" })]);
    expect(segs[0].avgConfidence).toBeCloseTo(0.9);
    expect(segs[0].dataQuality).toBe("IMPUTED");
  });
});

describe("buildTrendData", () => {
  const { rows, bands } = buildTrendData(mergeLivePoints([], seqPoints()));

  test("step rows sit on the right levels and change level at segment boundaries", () => {
    const leveled = rows.filter((r) => r.level !== null);
    expect(leveled.map((r) => [r.t, r.level])).toEqual([
      [T0 + 0, 0], [T0 + 2000, 0],          // SAFE until the WARNING starts
      [T0 + 2000, 1], [T0 + 4000, 1],       // WARNING until UNCERTAIN
      [T0 + 6000, 1], [T0 + 7000, 1],       // WARNING again
      [T0 + 7000, 2], [T0 + 9000, 2],       // CRITICAL
      [T0 + 9000, 1], [T0 + 10000, 1],      // final WARNING (1 sample -> 1 s wide)
    ]);
    // Coloured overlay keys only exist inside their own state's periods.
    expect(rows.filter((r) => r.CRITICAL !== undefined).every((r) => r.level === 2)).toBe(true);
    expect(rows.every((r) => r.hover === 1)).toBe(true); // tooltip everywhere
  });

  test("UNCERTAIN has no level (the line breaks) and becomes one grey band", () => {
    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({ x1: T0 + 4000, x2: T0 + 6000 });
    expect(bands[0].seg).toMatchObject({ state: "UNCERTAIN", uncertainReason: "INSUFFICIENT_HISTORY" });
    const inside = rows.filter((r) => r.t > T0 + 4000 && r.t < T0 + 6000);
    expect(inside.every((r) => r.level === null)).toBe(true);
    const uncertainRows = rows.filter((r) => r.seg.state === "UNCERTAIN");
    expect(uncertainRows.every((r) => r.level === null && r.WARNING === undefined && r.SAFE === undefined)).toBe(true);
  });

  test("the line is never drawn from WARNING through UNCERTAIN into WARNING", () => {
    const i = rows.findIndex((r) => r.seg.state === "UNCERTAIN");
    expect(rows[i - 1]).toMatchObject({ level: 1, t: T0 + 4000 }); // WARNING ends where UNCERTAIN starts
    expect(rows[i].level).toBeNull();                               // ...followed by a null -> gap
  });

  test("tooltip data carries status, confidence, data quality and reason", () => {
    const critical = rows.find((r) => r.seg.state === "CRITICAL").seg;
    expect(critical).toMatchObject({ state: "CRITICAL", avgConfidence: 0.9, dataQuality: "VALID", from: at(7), to: at(8) });
  });

  test("a data gap breaks the line instead of drawing a state across it", () => {
    const segs = mergeLivePoints([], [point(0, "SAFE"), point(1, "SAFE"), point(DEFAULT_GAP_MS / 1000 + 100, "SAFE")]);
    const { rows: r } = buildTrendData(segs);
    const gapRow = r.find((x) => x.gap);
    expect(gapRow).toMatchObject({ t: T0 + 2000, level: null });
  });

  test("the time range clips older periods", () => {
    const segs = mergeLivePoints([], seqPoints());
    const { rows: r, bands: b } = buildTrendData(segs, { startMs: T0 + 8000 });
    expect(Math.min(...r.map((x) => x.t))).toBe(T0 + 8000);
    expect(b).toHaveLength(0);
    expect(historyEntries(segs, { startMs: T0 + 8000 }).map((s) => s.state)).toEqual(["WARNING", "CRITICAL"]);
  });
});

describe("rangeStartMs", () => {
  test("15 min / 1 hour back from now; Today = local midnight", () => {
    const now = new Date(2026, 9, 9, 14, 30, 0).getTime();
    expect(rangeStartMs("15m", now)).toBe(now - 15 * 60 * 1000);
    expect(rangeStartMs("1h", now)).toBe(now - 60 * 60 * 1000);
    expect(rangeStartMs("today", now)).toBe(new Date(2026, 9, 9, 0, 0, 0).getTime());
  });
});
