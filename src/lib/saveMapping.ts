/**
 * Saving over the default mapping file, as the dev server does it. The rule is kept
 * here, with no file access, so it can be tested: the file is replaced only when
 * the deck being saved has the same name as the deck already in it. A deck with another
 * name is never allowed to overwrite it; the app downloads that one instead.
 */
/** Where the dev server accepts a mapping to save over public/default.mapping.json. */
export const SAVE_DEFAULT_MAPPING_PATH = "/__save-default-mapping";

export type SaveDecision = { ok: true } | { ok: false; reason: string };

/** The deck name inside a mapping file's text, or null when it is not a mapping. */
export function mappingName(text: string): string | null {
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (typeof record.name !== "string" || !Array.isArray(record.main)) return null;
    return record.name.trim();
  } catch {
    return null;
  }
}

/**
 * Whether `incoming` may replace the file that currently holds `existing` (null when there
 * is no such file).
 */
export function decideSave(existing: string | null, incoming: string): SaveDecision {
  const next = mappingName(incoming);
  if (next === null) return { ok: false, reason: "That is not a MAPPING file." };
  if (existing === null) return { ok: false, reason: "There is no default mapping file to replace." };
  const current = mappingName(existing);
  if (current === null) return { ok: false, reason: "The default mapping file is not readable, so it was left alone." };
  if (current !== next) {
    return {
      ok: false,
      reason: `The default mapping is named "${current}" and this deck is named "${next}", so it was not overwritten.`,
    };
  }
  return { ok: true };
}
