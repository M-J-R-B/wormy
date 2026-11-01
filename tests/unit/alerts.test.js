import { describe, test, expect } from "vitest";
import { alerts } from "../../src/domain.js";
import { T, state, check, resting } from "./helpers.js";

const now = new Date(2026, 10, 5, 12);
const titles = (S, at = now) => alerts(S, at).map(a => a.t);
const filling = (over = {}) => ({ id: "f1", num: 2, status: "filling", createdAt: T(4), ...over });

describe("alerts", () => {
  test("empty logbook asks for a first check only", () => {
    expect(titles(state())).toEqual(["No bin check yet"]);
  });
  test("hot bin", () => {
    const a = alerts(state({ events: [check(5, 32)] }), now);
    expect(a[0]).toMatchObject({ k: "bad", t: "Worm bin is hot: 32°C" });
  });
  test("escaping, wet, dry, sluggish come from the latest check", () => {
    expect(titles(state({ events: [check(5, 25, [], { activity: "escaping", moisture: "wet" })] }))).toEqual(["Worms trying to escape", "Bin is wet"]);
    expect(titles(state({ events: [check(5, 25, [], { activity: "sluggish", moisture: "dry" })] }))).toEqual(["Bin is dry", "Worms are sluggish"]);
  });
  test("overdue check-in", () => {
    expect(titles(state({ events: [check(1, 25)] }))).toContain("No check-in for 4 days");
    expect(titles(state({ events: [check(3, 25)] }))).not.toContain("No check-in for 2 days");
  });
  test("stir reminder after stirDays, cleared by mixed scraps", () => {
    const b = filling({ createdAt: T(1) });
    const later = new Date(2026, 10, 9, 12);
    expect(titles(state({ batches: [b], events: [check(9, 25)] }), later)).toContain("Stir Batch #2");
    const stirred = state({ batches: [b], events: [check(9, 25), { type: "scraps", ts: T(6), batchId: "f1", mixed: true }] });
    expect(titles(stirred, later)).not.toContain("Stir Batch #2");
  });
  test("sour smell on a filling or resting batch", () => {
    const S = state({ batches: [filling()], events: [check(5, 25, [{ id: "f1", temp: 30, smell: "ammonia" }])] });
    expect(titles(S)).toContain("Batch #2 smelled ammonia");
  });
  test("resting batch that looks ready", () => {
    const S = state({ batches: [resting(), filling()], events: [2, 3, 4].map(d => check(d, 25, [{ id: "b1", temp: 26 }])) });
    const a = alerts(S, now).find(x => x.t === "Batch #1 looks ready");
    expect(a).toMatchObject({ k: "good", act: "ready:b1" });
  });
  test("resting batch without today's temp", () => {
    const S = state({ batches: [resting(), filling()], events: [check(4, 25, [{ id: "b1", temp: 26 }])] });
    expect(titles(S)).toContain("Log today's temp for Batch #1");
  });
  test("no filling batch", () => {
    const S = state({ batches: [resting()], events: [check(5, 25, [{ id: "b1", temp: 26 }])] });
    expect(titles(S)).toContain("No batch is filling");
  });
  test("nothing resting for the next feeding", () => {
    const S = state({ batches: [{ id: "x", num: 1, status: "feeding" }, filling()], events: [check(5, 25)] });
    expect(titles(S)).toContain("Nothing resting for next feeding");
  });
});
