import { SAVE_DECK_MAPPING_PATH } from "./saveMapping";

export type SaveResult =
  | { saved: true; path: string }
  | { saved: false; reason: string | null };

/**
 * Asks the dev server to overwrite the file in public/decks/ that holds a deck with the same
 * name as this one. It does nothing when no file has that name. Outside the dev server (a
 * built or hosted copy) there is nothing to ask, so the caller downloads the file.
 */
export async function saveOverDeckMapping(text: string): Promise<SaveResult> {
  if (!import.meta.env.DEV) return { saved: false, reason: null };
  try {
    const response = await fetch(SAVE_DECK_MAPPING_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: text,
    });
    const body: unknown = await response.json().catch(() => null);
    const record = (body ?? {}) as { saved?: unknown; path?: unknown; reason?: unknown };
    if (response.ok && record.saved === true && typeof record.path === "string") {
      return { saved: true, path: record.path };
    }
    return { saved: false, reason: typeof record.reason === "string" ? record.reason : null };
  } catch {
    return { saved: false, reason: null };
  }
}
