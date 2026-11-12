const currencyFormatters = new Map<string, Intl.NumberFormat>();

export const formatMoney = (value: number, currency: string): string => {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });
    currencyFormatters.set(currency, formatter);
  }
  return formatter.format(value);
};

export const formatPercent = (ratio: number): string => `${Math.round(ratio * 100)}%`;

export const formatChange = (current: number, previous: number): string | null => {
  if (previous <= 0) return null;
  const change = (current - previous) / previous;
  const sign = change >= 0 ? "+" : "−";
  return `${sign}${Math.abs(Math.round(change * 100))}%`;
};

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export const formatDue = (iso: string | null, now: Date = new Date()): string => {
  if (!iso) return "No due date";
  const hours = Math.round((new Date(iso).getTime() - now.getTime()) / 3_600_000);
  if (Math.abs(hours) < 24) return relativeFormatter.format(hours, "hour");
  return relativeFormatter.format(Math.round(hours / 24), "day");
};

const DAY_MS = 86_400_000;

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Whole calendar days from `from` to `to` in local time (negative when `to` is earlier). */
export const calendarDaysBetween = (from: Date, to: Date): number =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);

/** Local calendar date as YYYY-MM-DD (what Postgres `date` columns hold). */
export const toDateKey = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

/** Parses a YYYY-MM-DD date as local midnight (Date.parse would read it as UTC). */
export const parseDateKey = (dateKey: string): Date => {
  const [year = 1970, month = 1, day = 1] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export const formatDayHeading = (date: Date, now: Date = new Date()): string => {
  const offset = calendarDaysBetween(now, date);
  const dayAndMonth = date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (offset === 0) return `Today · ${dayAndMonth}`;
  if (offset === 1) return `Tomorrow · ${dayAndMonth}`;
  return date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
};

export const formatOverdue = (days: number): string => {
  if (days <= 0) return "Due today";
  if (days < 14) return `Overdue by ${days} ${days === 1 ? "day" : "days"}`;
  if (days < 60) return `Overdue by ${Math.round(days / 7)} weeks`;
  return `Overdue by ${Math.round(days / 30)} months`;
};

export const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;
