import { dayKey } from "../../src/domain.js";

// ISO timestamp for November <d>, 2026 at <h>:00 local time.
export const T = (d, h = 9) => new Date(2026, 10, d, h).toISOString();

export function state({ batches = [], events = [], settings = {} } = {}) {
  const S = { batches: {}, events: {}, settings, bin: { name: "Worm bin" } };
  batches.forEach(b => { S.batches[b.id] = b });
  events.forEach((e, i) => { const id = e.id || "e" + i; S.events[id] = { ...e, id, day: e.day || dayKey(e.ts) } });
  return S;
}

// A daily check on November <d>. rows: [{id, temp, smell, stirred}]
export const check = (d, binTemp, rows = [], extra = {}) => ({ type: "check", ts: T(d, extra.h || 9), binTemp, batches: rows, ...extra });

export const resting = (over = {}) => ({ id: "b1", num: 1, status: "resting", createdAt: T(1), restStartedAt: T(1), ...over });
