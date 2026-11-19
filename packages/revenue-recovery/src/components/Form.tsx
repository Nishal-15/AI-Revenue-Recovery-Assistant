import { useId, type ReactNode } from "react";
import { cx } from "./ui";

export const INPUT =
  "h-11 w-full rounded-xl border border-rr-line-strong bg-white px-3.5 text-rr-ink outline-none transition-colors focus:border-rr-primary";

export const TEXTAREA =
  "min-h-24 w-full rounded-xl border border-rr-line-strong bg-white px-3.5 py-2.5 text-rr-ink outline-none transition-colors focus:border-rr-primary";

type FieldProps = {
  label: string;
  hint?: string;
  optional?: boolean;
  className?: string;
  children: (id: string) => ReactNode;
};

export const Field = ({ label, hint, optional, className, children }: FieldProps) => {
  const id = useId();
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="font-medium">
        {label} {optional && <span className="font-normal text-rr-ink-faint">(optional)</span>}
      </label>
      {children(id)}
      {hint && <p className="text-sm text-rr-ink-faint">{hint}</p>}
    </div>
  );
};

/** A tick box with a sentence, used for consent and "also add…" choices. */
export const CheckRow = ({
  checked,
  onChange,
  title,
  detail,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  detail?: string;
}) => (
  <label
    className={cx(
      "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
      checked ? "border-rr-primary bg-rr-primary-soft/50" : "border-rr-line-strong hover:bg-rr-bg",
    )}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="mt-1 size-4 shrink-0 accent-[var(--color-rr-primary)]"
    />
    <span>
      <span className="block font-medium">{title}</span>
      {detail && <span className="block text-sm text-rr-ink-soft">{detail}</span>}
    </span>
  </label>
);

/** Value for <input type="datetime-local">, in the browser's own time zone. */
export const toLocalInputValue = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** Tomorrow at 10:00, a sensible default for a new appointment or call back. */
export const tomorrowAt = (hour: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);
  return date;
};

export const addMonths = (months: number, from: Date = new Date()): string => {
  const date = new Date(from);
  date.setMonth(date.getMonth() + months);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
