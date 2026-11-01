import { describe, test, expect } from "vitest";
import { alerts, readiness } from "../../src/domain.js";
import { T, state, check, resting } from "./helpers.js";

const now = new Date(2026, 10, 5, 12);
const titles = (S, at = now) => alerts(S, at).map(a => a.t);
const filling = (over = {}) => ({ id: "f1", num: 2, status: "filling", createdAt: T(4), ...over });
const r = (id, temp, smell) => ({ id, temp, smell: smell || null, stirred: false });

describe("alert boundaries", () => {
  test("check exactly checkinDays (3) ago alerts", () => {
    expect(titles(state({ events: [check(2, 25)] }))).toContain("No check-in for 3 days");
  });
  test("stir reminder at exactly 7 days with no stirs, not at 6", () => {
    const at7 = state({ batches: [filling({ createdAt: new Date(2026, 9, 29, 9).toISOString() })], events: [check(5, 25)] });
    const a = alerts(at7, now).find(x => x.t === "Stir Batch #2");
    expect(a).toBeDefined();
    expect(a.d).toBe("Last stirred never. Stirring keeps it aerobic.");
    const at6 = state({ batches: [filling({ createdAt: new Date(2026, 9, 30, 9).toISOString() })], events: [check(5, 25)] });
    expect(titles(at6)).not.toContain("Stir Batch #2");
  });
  test("bin temp exactly at the limit is not hot", () => {
    expect(titles(state({ events: [check(5, 30)] })).some(t => t.startsWith("Worm bin is hot"))).toBe(false);
  });
});

describe("readiness boundaries", () => {
  const one = { readings: 1 };
  test("temp exactly 30 with bin 29 counts", () => {
    const S = state({ settings: one, batches: [resting()], events: [check(4, 29, [r("b1", 30)])] });
    expect(readiness(S, S.batches.b1)).toMatchObject({ count: 1, ready: true, reason: "" });
  });
  test("temp exactly bin + spread counts", () => {
    const S = state({ settings: one, batches: [resting()], events: [check(4, 25, [r("b1", 27)])] });
    expect(readiness(S, S.batches.b1)).toMatchObject({ count: 1, ready: true });
  });
  test("ammonia smell stops the count", () => {
    const S = state({ batches: [resting()], events: [check(4, 25, [r("b1", 26, "ammonia")])] });
    expect(readiness(S, S.batches.b1).reason).toBe("Smelled ammonia — add browns and stir.");
  });
});
