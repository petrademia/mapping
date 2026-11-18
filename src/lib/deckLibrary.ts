import { parseMappingJson, type MappingDocument } from "./document";

/**
 * The decks kept in `public/decks/`, one `.mapping.json` each (cards with their Groups, Hand Goals and
 * tags). `public/decks/index.json` lists them so the page, which only reads served files, can offer
 * them in a menu; `npm run decks:index` rewrites it from the folder.
 */
export interface DeckEntry {
  /** File name inside public/decks/, such as "power-patron.mapping.json". */
  file: string;
  /** The deck's name, as saved in the file. */
  name: string;
}

export interface DeckIndex {
  /** The file the app opens first, when there is no saved draft and no default of your own. */
  default: string | null;
  decks: DeckEntry[];
}

export const DECKS_URL = "/decks";

/** Reads `index.json`; anything that is not a list of named files is left out. */
export function parseDeckIndex(text: string): DeckIndex {
  // A dev server answers unknown paths with index.html; that is not an index.
  if (!text.trimStart().startsWith("{")) return { default: null, decks: [] };
  try {
    const data = JSON.parse(text) as { default?: unknown; decks?: unknown };
    const decks: DeckEntry[] = [];
    const seen = new Set<string>();
    for (const item of Array.isArray(data.decks) ? data.decks : []) {
      if (item === null || typeof item !== "object") continue;
      const entry = item as { file?: unknown; name?: unknown };
      if (typeof entry.file !== "string" || typeof entry.name !== "string") continue;
      // A bare file name only, so the index cannot point outside the folder.
      if (!/^[A-Za-z0-9._-]+\.mapping\.json$/.test(entry.file) || seen.has(entry.file)) continue;
      seen.add(entry.file);
      decks.push({ file: entry.file, name: entry.name });
    }
    const wanted = typeof data.default === "string" ? data.default : null;
    return { default: wanted !== null && seen.has(wanted) ? wanted : null, decks };
  } catch {
    return { default: null, decks: [] };
  }
}

export async function loadDeckIndex(): Promise<DeckIndex> {
  try {
    const response = await fetch(`${DECKS_URL}/index.json`);
    if (!response.ok) return { default: null, decks: [] };
    return parseDeckIndex(await response.text());
  } catch {
    return { default: null, decks: [] };
  }
}

/** One deck from the folder, or null when it is missing or not a mapping with cards. */
export async function loadDeckFile(file: string): Promise<MappingDocument | null> {
  if (!/^[A-Za-z0-9._-]+\.mapping\.json$/.test(file)) return null;
  try {
    const response = await fetch(`${DECKS_URL}/${file}`);
    if (!response.ok) return null;
    const text = await response.text();
    if (!text.trimStart().startsWith("{")) return null;
    const doc = parseMappingJson(text);
    return doc.main.length + doc.extra.length + doc.side.length > 0 ? doc : null;
  } catch {
    return null;
  }
}
