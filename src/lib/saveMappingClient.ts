import { SAVE_DEFAULT_MAPPING_PATH } from "./saveMapping";

export type SaveResult =
  | { saved: true; path: string }
  | { saved: false; reason: string | null };

/**
 * Asks the dev server to overwrite public/default.mapping.json with `text`. It only
 * does so when the deck has the same name as the one in the file. Outside the dev server
 * (a built or hosted copy) there is nothing to ask, so the caller downloads the file.
 */
export async function saveOverDefaultMapping(text: string): Promise<SaveResult> {
  if (!import.meta.env.DEV) return { saved: false, reason: null };
  try {
    const response = await fetch(SAVE_DEFAULT_MAPPING_PATH, {
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
