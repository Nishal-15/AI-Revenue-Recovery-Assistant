import { cx } from "./ui";

export const Switch = ({
  checked,
  onToggle,
  disabled,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onToggle}
    disabled={disabled}
    className={cx(
      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150 disabled:opacity-60",
      checked ? "bg-rr-primary" : "bg-rr-line-strong",
    )}
  >
    <span
      className={cx(
        "inline-block size-5 rounded-full bg-white shadow transition-transform duration-150",
        checked ? "translate-x-5.5" : "translate-x-0.5",
      )}
    />
  </button>
);
