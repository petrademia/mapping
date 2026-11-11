import type { MappingDocument } from "./document";
import { parseMappingJson } from "./document";

const KEY = "mapping.document.v2";
// Drafts saved before v2 are discarded so the default deck loads instead.
const LEGACY_KEYS = ["mapping.document.v1"];
try {
  for (const key of LEGACY_KEYS) localStorage.removeItem(key);
} catch {
  // storage unavailable
}

export function loadStored(): MappingDocument | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return parseMappingJson(raw);
  } catch {
    return null;
  }
}

export function saveStored(doc: MappingDocument): void {
  localStorage.setItem(
    KEY,
    JSON.stringify({ ...doc, name: doc.name.trim() || "untitled" }),
  );
}

export function clearStored(): void {
  localStorage.removeItem(KEY);
}
