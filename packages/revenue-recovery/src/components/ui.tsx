import type { ButtonHTMLAttributes, ReactNode } from "react";

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

type ButtonVariant = "primary" | "ghost";

const BUTTON_VARIANTS = {
  primary: "bg-rr-primary text-white hover:bg-rr-primary-strong shadow-sm",
  ghost: "text-rr-ink-soft hover:bg-rr-primary-soft hover:text-rr-primary-strong",
} as const satisfies Record<ButtonVariant, string>;

export const Button = ({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) => (
  <button
    className={cx(
      "inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13px] font-medium",
      "transition-[background-color,color,transform] duration-150 active:scale-[0.97] disabled:opacity-50",
      BUTTON_VARIANTS[variant],
      className,
    )}
    {...props}
  />
);

export { cx };
