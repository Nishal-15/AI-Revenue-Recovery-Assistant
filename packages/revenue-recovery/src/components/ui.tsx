import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { CircleAlert, X } from "lucide-react";
import { TONE_CLASSES, type Tone } from "../domain/leaks";

const cx = (...classes: (string | false | null | undefined)[]): string => classes.filter(Boolean).join(" ");

export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <section className={cx("rounded-rr-card border border-rr-line bg-rr-surface shadow-rr-card", className)}>
    {children}
  </section>
);

export const CardHeader = ({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) => (
  <header className="flex items-start justify-between gap-4 px-5 pt-5">
    <div>
      <h2 className="text-[15px] font-semibold text-rr-ink">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[13px] text-rr-ink-faint">{subtitle}</p>}
    </div>
    {action}
  </header>
);

type ButtonVariant = "primary" | "ghost" | "outline";

const BUTTON_BASE =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3.5 text-[13px] font-medium whitespace-nowrap " +
  "transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100";

const BUTTON_VARIANTS = {
  primary: "bg-rr-primary text-white hover:bg-rr-primary-strong shadow-sm",
  ghost: "text-rr-ink-soft hover:bg-rr-primary-soft hover:text-rr-primary-strong",
  outline:
    "border border-rr-line-strong bg-rr-surface text-rr-ink-soft hover:border-rr-primary hover:bg-rr-primary-soft hover:text-rr-primary-strong",
} as const satisfies Record<ButtonVariant, string>;

export const Button = ({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) => (
  <button type={type} className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} {...props} />
);

export const ButtonLink = ({
  variant = "primary",
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant }) => (
  <a className={cx(BUTTON_BASE, "no-underline", BUTTON_VARIANTS[variant], className)} {...props} />
);

export const Pill = ({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) => {
  const toneClasses = TONE_CLASSES[tone];
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        toneClasses.soft,
        toneClasses.ink,
        tone === "neutral" && "border border-rr-line",
        className,
      )}
    >
      {children}
    </span>
  );
};

export type SegmentOption<Value extends string> = { value: Value; label: ReactNode };

/** A row of mutually exclusive toggle buttons (views, sort orders). */
export const SegmentedControl = <Value extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: readonly SegmentOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  className?: string;
}) => (
  <div role="group" aria-label={label} className={cx("inline-flex max-w-full rounded-xl bg-rr-bg p-1", className)}>
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(option.value)}
          className={cx(
            "inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium whitespace-nowrap",
            "transition-[background-color,color,box-shadow] duration-150",
            active ? "bg-rr-surface text-rr-ink shadow-rr-card" : "text-rr-ink-soft hover:text-rr-ink",
          )}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

export const ErrorBanner = ({ message, onDismiss }: { message: string; onDismiss?: () => void }) => (
  <div
    role="alert"
    className="flex items-center gap-3 rounded-xl border border-rr-missed/30 bg-rr-missed-soft px-4 py-2.5 text-sm text-rr-missed-ink"
  >
    <CircleAlert size={16} className="shrink-0" />
    <p className="min-w-0 flex-1">{message}</p>
    {onDismiss && (
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-rr-surface/60"
      >
        <X size={16} />
      </button>
    )}
  </div>
);

export const EmptyState = ({ icon, title, body }: { icon: ReactNode; title: string; body?: string }) => (
  <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
    <span className="grid size-12 place-items-center rounded-2xl bg-rr-recovered-soft text-rr-recovered">{icon}</span>
    <h3 className="text-base font-semibold">{title}</h3>
    {body && <p className="max-w-sm text-sm text-rr-ink-soft">{body}</p>}
  </div>
);

export const ListSkeleton = ({ rows = 5, label }: { rows?: number; label: string }) => (
  <div className="flex animate-pulse flex-col gap-4" aria-busy="true" aria-label={label}>
    <div className="h-28 rounded-rr-card bg-rr-line/60" />
    <div className="flex flex-col gap-px overflow-hidden rounded-rr-card border border-rr-line bg-rr-line">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-20 bg-rr-surface" />
      ))}
    </div>
  </div>
);

export { cx };
