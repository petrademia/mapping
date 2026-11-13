import { useState } from "react";
import { BRICK_CURVE_MAX, DEFAULT_SETTINGS, MAX_DISRUPTION_POINTS, type ScorecardSettings } from "./scorecard";

const KEY = "mapping.scorecard.settings";

/** Reads stored settings; anything missing or invalid falls back to the default. */
export function parseSettings(raw: string | null): ScorecardSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof ScorecardSettings, unknown>>;
    const read = (key: keyof ScorecardSettings, max: number): number => {
      const n = value[key];
      return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max ? n : DEFAULT_SETTINGS[key];
    };
    const atLeast1 = (key: "lingeringWorth" | "disruptionNeeded"): number => {
      const n = value[key];
      return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_DISRUPTION_POINTS ? n : DEFAULT_SETTINGS[key];
    };
    return {
      opens: read("opens", 10),
      clean: read("clean", 10),
      resilient: read("resilient", 10),
      interaction: read("interaction", 10),
      lingering: read("lingering", 10),
      first: read("first", 10),
      second: read("second", 10),
      brickTolerance: read("brickTolerance", BRICK_CURVE_MAX),
      lingeringWorth: atLeast1("lingeringWorth"),
      disruptionNeeded: atLeast1("disruptionNeeded"),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** The scorecard settings, kept in this browser so every panel scores the same way. */
export function useScorecardSettings(): [ScorecardSettings, (next: ScorecardSettings) => void] {
  const [settings, setSettings] = useState<ScorecardSettings>(() => {
    try {
      return parseSettings(localStorage.getItem(KEY));
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const change = (next: ScorecardSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* the choice just will not persist */
    }
  };
  return [settings, change];
}
