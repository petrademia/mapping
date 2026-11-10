import { documentFromParsed, type MappingDocument } from "./document";
import { parseDeckText } from "./ydk";

/** Build a document from .ydk text. No card names are stored, so names always follow the catalog. */
export function deckFromYdkText(text: string, name = "default deck"): MappingDocument {
  return documentFromParsed(name, parseDeckText(text), new Map());
}

/**
 * The first-run deck: /default.ydk, served from `public/`. Replace that file to
 * change what a new browser starts with. Returns null when it is missing or
 * unreadable, so the app falls back to an empty deck.
 */
export async function loadDefaultDeck(): Promise<MappingDocument | null> {
  try {
    const response = await fetch("/default.ydk");
    if (!response.ok) return null;
    const text = await response.text();
    // A dev server answers unknown paths with index.html; that is not a deck.
    if (text.trimStart().startsWith("<")) return null;
    const doc = deckFromYdkText(text);
    return doc.main.length + doc.extra.length + doc.side.length > 0 ? doc : null;
  } catch {
    return null;
  }
}
