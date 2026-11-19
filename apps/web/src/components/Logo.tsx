import { BRAND } from "../lib/brand";

/** A loop that comes back on itself: a patient returning. */
export const LogoMark = ({ className = "size-9" }: { className?: string }) => (
  <svg viewBox="0 0 36 36" className={className} aria-hidden>
    <circle cx="18" cy="18" r="18" fill="var(--color-rr-surface)" />
    <path
      d="M25.5 13.5a8.5 8.5 0 1 0 1 7"
      fill="none"
      stroke="var(--color-rr-primary)"
      strokeWidth="3"
      strokeLinecap="round"
    />
    <path d="M26.6 8.8v5.6h-5.6" fill="none" stroke="var(--color-rr-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="18" cy="18" r="2.6" fill="var(--color-rr-missed)" />
  </svg>
);

export const Logo = () => (
  <span className="flex items-center gap-2.5">
    <LogoMark />
    <span className="text-lg font-semibold tracking-tight">{BRAND}</span>
  </span>
);
