/**
 * Saving over a deck file, as the dev server does it. The rule is kept here, with no file
 * access, so it can be tested: a deck replaces the file in `public/decks/` that holds a deck
 * of the same name, and nothing else. A deck with a name no file has is never allowed to
 * overwrite one; the app downloads that one instead.
 */
/** Where the dev server accepts a mapping to save over the deck file with the same name. */
export const SAVE_DECK_MAPPING_PATH = "/__save-deck-mapping";

/**
 * Which file `incoming` replaces: the one whose deck has the same name. `files` are the
 * mapping files in the decks folder. Two files with the same name are never guessed between.
 */
export function chooseDeckFile(
  files: readonly { file: string; text: string }[],
  incoming: string,
): { file: string } | { reason: string } {
  const next = mappingName(incoming);
  if (next === null) return { reason: "That is not a MAPPING file." };
  const same = files.filter((entry) => mappingName(entry.text) === next);
  if (same.length === 0) {
    return { reason: `No deck in public/decks is named "${next}", so nothing was overwritten.` };
  }
  if (same.length > 1) {
    return { reason: `More than one file in public/decks is named "${next}", so nothing was overwritten.` };
  }
  return { file: same[0]!.file };
}

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
