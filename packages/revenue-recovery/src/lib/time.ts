const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Compact age for lists: "now", "5m", "3h", "2d", then a date. */
export const formatAgeShort = (iso: string, now: number = Date.now()): string => {
  const elapsed = now - new Date(iso).getTime();
  if (elapsed < MINUTE_MS) return "now";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h`;
  if (elapsed < 7 * DAY_MS) return `${Math.floor(elapsed / DAY_MS)}d`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

/** Message timestamps: just the time for today, otherwise day and time. */
export const formatMessageTime = (iso: string, now: Date = new Date()): string => {
  const date = new Date(iso);
  const time = date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return time;
  return `${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time}`;
};

/** "18 h" / "45 min" left in WhatsApp's 24-hour reply window. */
export const formatTimeLeft = (until: number, now: number = Date.now()): string => {
  const left = Math.max(until - now, 0);
  if (left >= HOUR_MS) return `${Math.floor(left / HOUR_MS)} h`;
  return `${Math.max(Math.floor(left / MINUTE_MS), 1)} min`;
};
