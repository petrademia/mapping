import { useState } from "react";
import type { Catalog } from "../lib/catalog";
import {
  addFromParsed,
  parseMappingJson,
  replaceDeck,
  serializeMapping,
  type MappingDocument,
} from "../lib/document";
import { serializeYapping } from "../lib/exportYapping";
import {
  routeParsed,
  type ExtraDeckIds,
} from "../lib/sectionRouting";
import { parseDeckText, serializeYdk } from "../lib/ydk";

function download(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slug(name: string): string {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return cleaned.replace(/^_+|_+$/g, "") || "deck";
}

interface Props {
  doc: MappingDocument;
  /** Active configuration view used for YDK and YAPPING export. Defaults to doc. */
  exportDoc?: MappingDocument;
  /** Extra Deck monster ids, used to route added cards to the right section. */
  extraIds?: ExtraDeckIds;
  catalog: Catalog;
  onChange: (doc: MappingDocument) => void;
  onStatus: (message: string) => void;
}

export function ImportExport({
  doc,
  exportDoc = doc,
  catalog,
  extraIds = new Set(),
  onChange,
  onStatus,
}: Props) {
  const [paste, setPaste] = useState("");

  function importText(text: string, filename: string): void {
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
          ? "Replaced the deck. Groups and Hand Conditions were kept."
          : `Loaded ${filename}. Groups and Hand Conditions were kept.`,
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Import failed";
      onStatus(message);
    }
  }

  return (
    <div className="toolbar-actions">
      <label className="file-button">
        Load file
        <input
          type="file"
          accept=".json,.ydk,.txt"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void file.text().then((text) => importText(text, file.name));
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => download(`${slug(doc.name)}.mapping.json`, serializeMapping(doc))}
      >
        Save mapping
      </button>
      <button
        type="button"
        className="primary"
        onClick={() => {
          download(`${slug(doc.name)}.ydk`, serializeYdk({
            main: exportDoc.main,
            extra: exportDoc.extra,
            side: exportDoc.side,
          }));
          onStatus("Saved YDK");
        }}
      >
        Save YDK
      </button>
      <button
        type="button"
        className="primary"
        onClick={() => {
          download(`${slug(doc.name)}.yapping.json`, serializeYapping(exportDoc));
          onStatus("Exported YAPPING archetype JSON");
        }}
      >
        Export for YAPPING
      </button>
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
          and Hand Goals. Add to deck keeps everything and appends.
        </p>
        <button
          type="button"
          disabled={paste.trim() === ""}
          onClick={() => {
            importText(paste, "paste");
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
    </div>
  );
}
