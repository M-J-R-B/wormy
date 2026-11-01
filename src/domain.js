// Pure logbook logic moved from the claude.ai artifact. No DOM, no Firebase.
// Functions take the state S = {batches, events, settings, bin} explicitly.

export const DEF = { readings: 3, spread: 2, maxTemp: 30, stirDays: 7, checkinDays: 3 };

// ---------- dates ----------
export const dayKey = d => { d = new Date(d); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") };
export const today = (now = new Date()) => dayKey(now);
export const daysBetween = (a, b) => Math.round((new Date(dayKey(b) + "T00:00") - new Date(dayKey(a) + "T00:00")) / 864e5);
export const ago = (ts, now = new Date()) => { if (!ts) return "never"; const d = daysBetween(ts, now); if (d <= 0) return "today"; if (d === 1) return "yesterday"; return d + " days ago" };

// ---------- state helpers ----------
export const settingsOf = S => ({ ...DEF, ...(S.settings || {}) });
export const batches = S => Object.values(S.batches).sort((a, b) => (b.num || 0) - (a.num || 0));
export const events = S => Object.values(S.events).sort((a, b) => b.ts < a.ts ? -1 : 1);
export const active = S => batches(S).filter(b => b.status !== "used");
export const bName = b => b ? (b.nickname ? b.nickname + " (#" + b.num + ")" : "Batch #" + b.num) : "Unknown batch";
export const bShort = b => b ? (b.nickname || "Batch #" + b.num) : "?";

// readings for a batch: from check events, newest first
export function batchReadings(S, bid) {
  const out = [];
  for (const e of events(S)) {
    if (e.type !== "check" || !Array.isArray(e.batches)) continue;
    const r = e.batches.find(x => x.id === bid);
    if (r) out.push({ ts: e.ts, day: e.day || dayKey(e.ts), temp: r.temp, smell: r.smell, stirred: r.stirred, bin: e.binTemp });
  }
  return out;
}
export function lastStir(S, b) {
  let best = null;
  for (const e of events(S)) {
    if (e.type === "check" && Array.isArray(e.batches)) { const r = e.batches.find(x => x.id === b.id); if (r && r.stirred && (!best || e.ts > best)) best = e.ts }
    if (e.type === "scraps" && e.batchId === b.id && e.mixed && (!best || e.ts > best)) best = e.ts;
  }
  return best;
}
export function lastSmell(S, b) { const r = batchReadings(S, b.id).find(x => x.smell); return r ? r.smell : null }
export function binTempOnDay(S, day) {
  for (const e of events(S)) if (e.type === "check" && (e.day || dayKey(e.ts)) === day && e.binTemp != null) return e.binTemp;
  return null;
}

// Readiness: latest reading per day since resting started; count consecutive qualifying days from newest.
export function readiness(S, b) {
  const st = settingsOf(S);
  const since = b.restStartedAt ? dayKey(b.restStartedAt) : null;
  const perDay = new Map();
  for (const r of batchReadings(S, b.id)) { // newest first, so first seen per day = latest
    if (r.temp == null) continue;
    if (since && r.day < since) continue;
    if (!perDay.has(r.day)) perDay.set(r.day, { ...r, bin: r.bin != null ? r.bin : binTempOnDay(S, r.day) });
  }
  const days = [...perDay.values()].sort((a, b) => a.day < b.day ? 1 : -1);
  let count = 0, lo = Infinity, hi = -Infinity, reason = "";
  for (const r of days) {
    if (r.bin == null) { reason = reason || "Log the worm bin temp with each batch reading."; break }
    if (r.temp > st.maxTemp) { reason = reason || `Still warm: ${r.temp}°C (limit ${st.maxTemp}°C).`; break }
    if (Math.abs(r.temp - r.bin) > st.spread) { reason = reason || `${r.temp}°C vs bin ${r.bin}°C — not cooled to bin temp yet.`; break }
    if (r.smell === "sour" || r.smell === "ammonia") { reason = reason || "Smelled " + r.smell + " — add browns and stir."; break }
    const nlo = Math.min(lo, r.temp), nhi = Math.max(hi, r.temp);
    if (nhi - nlo > st.spread) { reason = reason || "Temps not steady yet."; break }
    lo = nlo; hi = nhi; count++;
    if (count >= st.readings) break;
  }
  const latest = days[0] || null;
  if (!days.length) reason = "No temp readings since it started resting.";
  return { count: Math.min(count, st.readings), need: st.readings, ready: count >= st.readings, latest, reason: count >= st.readings ? "" : reason };
}
