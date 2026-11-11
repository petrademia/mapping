import { useCallback, useEffect, useState } from "react";

/** "system" follows the device until the user picks one. */
export type ThemeChoice = "system" | "light" | "dark";

const KEY = "mapping.theme";

export function parseThemeChoice(value: string | null): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): "light" | "dark" {
  if (choice === "system") return systemDark ? "dark" : "light";
  return choice;
}

function readChoice(): ThemeChoice {
  try {
    return parseThemeChoice(localStorage.getItem(KEY));
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

/** The theme choice, applied to <html data-theme>, and saved in this browser. */
export function useTheme(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice);

  useEffect(() => {
    const apply = (): void => {
      document.documentElement.dataset.theme = resolveTheme(choice, systemPrefersDark());
    };
    apply();
    if (choice !== "system" || typeof matchMedia !== "function") return;
    const query = matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [choice]);

  const choose = useCallback((next: ThemeChoice) => {
    setChoice(next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // The choice still applies for this visit.
    }
  }, []);

  return [choice, choose];
}
