// Pure logbook logic moved from the claude.ai artifact. No DOM, no Firebase.
// Functions take the state S = {batches, events, settings, bin} explicitly.

export const DEF = { readings: 3, spread: 2, maxTemp: 30, stirDays: 7, checkinDays: 3 };

// ---------- dates ----------
export const dayKey = d => { d = new Date(d); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") };
export const today = (now = new Date()) => dayKey(now);
export const daysBetween = (a, b) => Math.round((new Date(dayKey(b) + "T00:00") - new Date(dayKey(a) + "T00:00")) / 864e5);
export const ago = (ts, now = new Date()) => { if (!ts) return "never"; const d = daysBetween(ts, now); if (d <= 0) return "today"; if (d === 1) return "yesterday"; return d + " days ago" };
