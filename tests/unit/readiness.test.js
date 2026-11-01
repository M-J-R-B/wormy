import { describe, test, expect } from "vitest";
import { readiness, bName, bShort, lastStir, batches, events, active } from "../../src/domain.js";
import { T, state, check, resting } from "./helpers.js";

const r = (id, temp, smell) => ({ id, temp, smell: smell || null, stirred: false });

describe("names and lists", () => {
  test("bName uses nickname with number", () => {
    expect(bName({ num: 2, nickname: "Blue" })).toBe("Blue (#2)");
    expect(bName({ num: 2 })).toBe("Batch #2");
    expect(bName(null)).toBe("Unknown batch");
  });
  test("bShort", () => {
    expect(bShort({ num: 2, nickname: "Blue" })).toBe("Blue");
    expect(bShort({ num: 2 })).toBe("Batch #2");
  });
  test("batches newest number first, active excludes used, events newest first", () => {
    const S = state({
      batches: [{ id: "a", num: 1, status: "used" }, { id: "b", num: 2, status: "filling" }],
      events: [{ type: "note", ts: T(1) }, { type: "note", ts: T(3) }],
    });
    expect(batches(S).map(b => b.id)).toEqual(["b", "a"]);
    expect(active(S).map(b => b.id)).toEqual(["b"]);
    expect(events(S)[0].ts).toBe(T(3));
  });
  test("lastStir takes the newest stirred check or mixed scraps", () => {
    const b = resting();
    const S = state({ batches: [b], events: [
      check(2, 25, [{ id: "b1", temp: 26, stirred: true }]),
      { type: "scraps", ts: T(4), batchId: "b1", mixed: true },
      check(5, 25, [{ id: "b1", temp: 26, stirred: false }]),
    ] });
    expect(lastStir(S, b)).toBe(T(4));
  });
});

describe("readiness", () => {
  test("ready after 3 steady, safe days", () => {
    const S = state({ batches: [resting()], events: [check(2, 25, [r("b1", 26)]), check(3, 25, [r("b1", 26.5)]), check(4, 25, [r("b1", 26)])] });
    const res = readiness(S, S.batches.b1);
    expect(res).toMatchObject({ count: 3, need: 3, ready: true, reason: "" });
    expect(res.latest.temp).toBe(26);
  });
  test("not ready with only 2 days", () => {
    const S = state({ batches: [resting()], events: [check(3, 25, [r("b1", 26)]), check(4, 25, [r("b1", 26)])] });
    expect(readiness(S, S.batches.b1)).toMatchObject({ count: 2, ready: false });
  });
  test("newest day over the limit resets", () => {
    const S = state({ batches: [resting()], events: [check(2, 25, [r("b1", 26)]), check(3, 25, [r("b1", 26)]), check(4, 25, [r("b1", 31)])] });
    expect(readiness(S, S.batches.b1)).toMatchObject({ count: 0, ready: false, reason: "Still warm: 31°C (limit 30°C)." });
  });
  test("outside the spread of the bin temp", () => {
    const S = state({ batches: [resting()], events: [check(4, 25, [r("b1", 28)])] });
    expect(readiness(S, S.batches.b1).reason).toBe("28°C vs bin 25°C — not cooled to bin temp yet.");
  });
  test("sour smell stops the count", () => {
    const S = state({ batches: [resting()], events: [check(4, 25, [r("b1", 26, "sour")])] });
    expect(readiness(S, S.batches.b1).reason).toBe("Smelled sour — add browns and stir.");
  });
  test("temps that wander more than the spread are not steady", () => {
    const S = state({ batches: [resting()], events: [check(3, 24, [r("b1", 23.5)]), check(4, 25, [r("b1", 26)])] });
    expect(readiness(S, S.batches.b1)).toMatchObject({ count: 1, reason: "Temps not steady yet." });
  });
  test("ignores readings before resting started", () => {
    const S = state({ batches: [resting({ restStartedAt: T(3) })], events: [1, 2, 3, 4].map(d => check(d, 25, [r("b1", 26)])) });
    expect(readiness(S, S.batches.b1)).toMatchObject({ count: 2, ready: false });
  });
  test("uses the latest reading of each day", () => {
    const S = state({ batches: [resting()], events: [
      check(2, 25, [r("b1", 26)]), check(3, 25, [r("b1", 26)]),
      check(4, 25, [r("b1", 31)], { h: 9 }), check(4, 25, [r("b1", 26)], { h: 18 }),
    ] });
    expect(readiness(S, S.batches.b1).ready).toBe(true);
  });
  test("falls back to another check's bin temp on the same day", () => {
    const S = state({ batches: [resting()], events: [
      check(2, 25, [r("b1", 26)]), check(3, 25, [r("b1", 26)]),
      check(4, 25, [], { h: 9 }), check(4, null, [r("b1", 26)], { h: 18 }),
    ] });
    expect(readiness(S, S.batches.b1).ready).toBe(true);
  });
  test("asks for bin temp when there is none", () => {
    const S = state({ batches: [resting()], events: [check(4, null, [r("b1", 26)])] });
    expect(readiness(S, S.batches.b1).reason).toBe("Log the worm bin temp with each batch reading.");
  });
  test("no readings yet", () => {
    const S = state({ batches: [resting()] });
    expect(readiness(S, S.batches.b1)).toMatchObject({ count: 0, reason: "No temp readings since it started resting.", latest: null });
  });
  test("respects custom settings", () => {
    const S = state({ settings: { readings: 2 }, batches: [resting()], events: [check(3, 25, [r("b1", 26)]), check(4, 25, [r("b1", 26)])] });
    expect(readiness(S, S.batches.b1)).toMatchObject({ need: 2, ready: true });
  });
});
