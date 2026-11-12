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
