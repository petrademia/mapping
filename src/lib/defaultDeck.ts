import {
  documentFromParsed,
  parseMappingJson,
  serializeMapping,
  type MappingDocument,
} from "./document";
import { parseDeckText } from "./ydk";

/** Build a document from .ydk text. No card names are stored, so names always follow the catalog. */
export function deckFromYdkText(text: string, name = "default deck"): MappingDocument {
  return documentFromParsed(name, parseDeckText(text), new Map());
}

const USER_DEFAULT_KEY = "mapping.userDefault.v1";

/** Remember this deck, with its groups and Hand Goals, as the one Default deck loads. */
export function saveUserDefault(doc: MappingDocument): boolean {
  try {
    localStorage.setItem(USER_DEFAULT_KEY, serializeMapping({ ...doc, name: doc.name.trim() || "default deck" }));
    return true;
  } catch {
    return false;
  }
}

export function loadUserDefault(): MappingDocument | null {
  try {
    const raw = localStorage.getItem(USER_DEFAULT_KEY);
    return raw ? parseMappingJson(raw) : null;
  } catch {
    return null;
  }
}

/** Forget the saved default so Default deck falls back to /default.ydk. */
export function clearUserDefault(): void {
  try {
    localStorage.removeItem(USER_DEFAULT_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * The default deck: the one you set with Set as default, else /default.ydk, served from `public/`. Replace that file to
 * change what a new browser starts with. Returns null when it is missing or
 * unreadable, so the app falls back to an empty deck.
 */
export async function loadDefaultDeck(): Promise<MappingDocument | null> {
  const saved = loadUserDefault();
  if (saved) return saved;
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
