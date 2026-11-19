import { cx } from "./ui";

const PALETTE = [
  "bg-rr-primary-soft text-rr-primary-strong",
  "bg-rr-missed-soft text-rr-missed-ink",
  "bg-rr-info-soft text-rr-info-ink",
  "bg-rr-risk-soft text-rr-risk-ink",
  "bg-rr-recovered-soft text-rr-recovered-ink",
] as const;

const initials = (name: string): string =>
  name
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

/** Initials in a coloured circle; the colour is stable per name so a patient is easy to spot again. */
export const Avatar = ({ name, size = "md" }: { name: string; size?: "md" | "lg" }) => {
  const hash = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (
    <span
      aria-hidden
      className={cx(
        "grid shrink-0 place-items-center rounded-full font-bold",
        size === "lg" ? "size-14 text-lg" : "size-11 text-sm",
        PALETTE[hash % PALETTE.length],
      )}
    >
      {initials(name)}
    </span>
  );
};
