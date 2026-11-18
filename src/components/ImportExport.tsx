import { useState } from "react";
import type { Catalog } from "../lib/catalog";
import {
  addFromParsed,
  parseMappingJson,
  replaceDeck,
  type MappingDocument,
} from "../lib/document";
import { routeParsed, type ExtraDeckIds } from "../lib/sectionRouting";
import { parseDeckText } from "../lib/ydk";
import { Icon } from "./IconButton";

interface ImportProps {
  doc: MappingDocument;
  onChange: (doc: MappingDocument) => void;
  onStatus: (message: string) => void;
}

/** Reads a mapping or a deck list into the document; a deck list keeps the models. */
function importText({ doc, onChange, onStatus }: ImportProps, text: string, filename: string): void {
  try {
    const trimmed = text.trim();
    if (trimmed.startsWith("{")) {
      onChange(parseMappingJson(trimmed));
      onStatus(`Loaded MAPPING JSON (${filename})`);
      return;
    }
    // A deck list replaces the cards only; models stay.
    const fromPaste = filename === "paste";
    const name = fromPaste
      ? undefined
      : filename.replace(/\.(ydk|txt|json)$/i, "") || undefined;
    onChange(replaceDeck(doc, parseDeckText(trimmed), name));
    onStatus(
      fromPaste
        ? "Replaced the deck. Groups, Hand Conditions and the tags of cards still in the deck were kept."
        : `Loaded ${filename}. Groups, Hand Conditions and the tags of cards still in the deck were kept.`,
    );
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Import failed";
    onStatus(message);
  }
}

/** Opens a .ydk, a pasted-list file or a saved mapping from disk. */
export function LoadFileButton(props: ImportProps) {
  return (
    <label className="file-button">
      <Icon name="upload" />
      Load file
      <input
        type="file"
        accept=".json,.ydk,.txt"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void file.text().then((text) => importText(props, text, file.name));
        }}
      />
    </label>
  );
}

interface PasteProps extends ImportProps {
  /** Extra Deck monster ids, used to route added cards to the right section. */
  extraIds?: ExtraDeckIds;
  catalog: Catalog;
}

/** A collapsed box for pasting a deck list, to replace the deck or to add to it. */
export function PasteDeckList({ extraIds = new Set(), catalog, ...props }: PasteProps) {
  const { doc, onChange, onStatus } = props;
  const [paste, setPaste] = useState("");
  return (
    <details className="paste">
      <summary>Paste a deck list</summary>
      <textarea
        value={paste}
        onChange={(event) => setPaste(event.target.value)}
        placeholder={"62962630 3\n44362883 1\n#extra\n44146295 1"}
        aria-label="Deck list to paste"
      />
      <p className="note">
        Replace deck swaps the cards and keeps your Groups, Hand Conditions
        and Hand Goals, and the tags of every card that is still in the deck.
        Add to deck keeps everything and appends.
      </p>
      <button
        type="button"
        disabled={paste.trim() === ""}
        onClick={() => {
          importText(props, paste, "paste");
          setPaste("");
        }}
      >
        Replace deck
      </button>
      <button
        type="button"
        disabled={paste.trim() === ""}
        onClick={() => {
          try {
            const { sections, moved } = routeParsed(
              parseDeckText(paste, "main"),
              extraIds,
              (id) => catalog.has(id),
            );
            onChange(addFromParsed(doc, sections));
            setPaste("");
            onStatus(
              `Added the pasted cards (cards without a #section go to main)${
                moved > 0 ? `; moved ${moved} to the right section` : ""
              }`,
            );
          } catch (caught) {
            onStatus(
              caught instanceof Error ? caught.message : "Could not add the pasted cards",
            );
          }
        }}
      >
        Add to deck
      </button>
    </details>
  );
}
