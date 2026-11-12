type Cell = string | number | null;

const escapeCell = (value: Cell): string => {
  const text = value === null ? "" : String(value);
  // Leading =, +, -, @ make spreadsheets run the cell as a formula; prefix them so they stay text.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const toCsv = (header: string[], rows: Cell[][]): string =>
  [header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");

/** Saves text as a file in the browser. The BOM keeps ₹ and names intact when Excel opens it. */
export const downloadCsv = (filename: string, csv: string): void => {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
