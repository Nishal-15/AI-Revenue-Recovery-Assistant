import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeChoice } from "../lib/theme";

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Same as device", icon: Monitor },
];

/** Three small buttons: light, dark, or follow the device. */
export const ThemeToggle = ({ className = "" }: { className?: string }) => {
  const [choice, setChoice] = useTheme();
  return (
    <div role="group" aria-label="Colour theme" className={`inline-flex rounded-full border border-rr-canvas-line bg-rr-glass p-1 ${className}`}>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={choice === value}
          aria-label={label}
          title={label}
          onClick={() => setChoice(value)}
          className={`grid size-8 place-items-center rounded-full transition-colors ${
            choice === value ? "bg-rr-surface text-rr-ink shadow-rr-card" : "text-rr-on-canvas-soft hover:text-rr-on-canvas"
          }`}
        >
          <Icon size={15} aria-hidden />
        </button>
      ))}
    </div>
  );
};

/** For light menus (white background): same control, ink colours. */
export const ThemeToggleRow = () => {
  const [choice, setChoice] = useTheme();
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span>Theme</span>
      <div role="group" aria-label="Colour theme" className="inline-flex rounded-full bg-rr-bg p-1">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={choice === value}
            aria-label={label}
            title={label}
            onClick={() => setChoice(value)}
            className={`grid size-7 place-items-center rounded-full transition-colors ${
              choice === value ? "bg-rr-surface text-rr-ink shadow-rr-card" : "text-rr-ink-soft hover:text-rr-ink"
            }`}
          >
            <Icon size={14} aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
};
