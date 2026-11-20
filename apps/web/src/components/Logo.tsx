import { BRAND, LOGO_INCLUDES_NAME, LOGO_URL } from "../lib/brand";

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

/**
 * The brand in the header. Until your own logo is added (VITE_LOGO_URL), the built-in mark is the placeholder.
 * Your file sits in the same 36px-high slot, so square icons and wide wordmarks both fit without moving anything.
 */
export const Logo = () => (
  <span className="flex items-center gap-2.5">
    {LOGO_URL ? (
      <img src={LOGO_URL} alt={LOGO_INCLUDES_NAME ? BRAND : ""} className="h-9 w-auto max-w-44 object-contain" />
    ) : (
      <LogoMark />
    )}
    {!(LOGO_URL && LOGO_INCLUDES_NAME) && <span className="text-lg font-semibold tracking-tight">{BRAND}</span>}
  </span>
);
