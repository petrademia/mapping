import type { MappingDocument } from "./document";
import { parseMappingJson } from "./document";

const KEY = "mapping.document.v1";

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
