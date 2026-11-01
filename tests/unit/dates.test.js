import { describe, test, expect } from "vitest";
import { dayKey, today, daysBetween, ago } from "../../src/domain.js";

describe("dayKey", () => {
  test("formats local date as YYYY-MM-DD", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
  test("accepts ISO strings", () => {
    expect(dayKey(new Date(2026, 10, 1, 9).toISOString())).toBe("2026-11-01");
  });
});

describe("today", () => {
  test("uses the given now", () => {
    expect(today(new Date(2026, 10, 3, 8))).toBe("2026-11-03");
  });
});

describe("daysBetween", () => {
  test("counts calendar days, not 24h blocks", () => {
    expect(daysBetween(new Date(2026, 10, 1, 23, 30), new Date(2026, 10, 2, 0, 10))).toBe(1);
  });
  test("same day is 0", () => {
    expect(daysBetween(new Date(2026, 10, 2, 1), new Date(2026, 10, 2, 22))).toBe(0);
  });
  test("handles the DST change on 2026-11-01", () => {
    expect(daysBetween(new Date(2026, 9, 31, 12), new Date(2026, 10, 2, 12))).toBe(2);
  });
});

describe("ago", () => {
  const now = new Date(2026, 10, 5, 12);
  test("never when missing", () => expect(ago(null, now)).toBe("never"));
  test("today", () => expect(ago(new Date(2026, 10, 5, 1).toISOString(), now)).toBe("today"));
  test("yesterday", () => expect(ago(new Date(2026, 10, 4, 23).toISOString(), now)).toBe("yesterday"));
  test("N days ago", () => expect(ago(new Date(2026, 10, 2, 9).toISOString(), now)).toBe("3 days ago"));
});
