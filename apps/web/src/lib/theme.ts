import { useEffect, useState } from "react";

export type ThemeChoice = "dark" | "light" | "system";

const STORAGE_KEY = "rr-theme";
const META_COLORS = { dark: "#0f2c31", light: "#e7efeb" } as const;

const systemTheme = (): "dark" | "light" =>
  window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";

const readChoice = (): ThemeChoice => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "dark";
  } catch {
    return "dark";
  }
};

const apply = (choice: ThemeChoice) => {
  const theme = choice === "system" ? systemTheme() : choice;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", META_COLORS[theme]);
};

/** The person's own choice, remembered on this device. Dark is the brand default. */
export const useTheme = (): [ThemeChoice, (choice: ThemeChoice) => void] => {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice);

  useEffect(() => {
    apply(choice);
    if (choice !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => apply("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [choice]);

  const update = (next: ThemeChoice) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private windows can block storage; the choice still applies for this visit.
    }
    setChoice(next);
  };

  return [choice, update];
};
