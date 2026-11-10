import { useState } from "react";
import type { Catalog } from "../lib/catalog";
import { displayName, searchCatalog } from "../lib/catalog";
import {
  addCard,
  addFromParsed,
  parseMappingJson,
  replaceDeck,
  serializeMapping,
  type DeckSection,
  type MappingDocument,
} from "../lib/document";
import { serializeYapping } from "../lib/exportYapping";
import {
  routeParsed,
  routeSection,
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
  const [addSection, setAddSection] = useState<DeckSection>("main");
  const [addQuery, setAddQuery] = useState("");
  const [addCardId, setAddCardId] = useState<number | null>(null);
  const [addQty, setAddQty] = useState("1");

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

  const hits =
    addQuery.trim() === ""
      ? []
      : searchCatalog(catalog, addQuery, 10);

  function resolveAddCardId(): number | null {
    if (addCardId !== null) return addCardId;
    const numeric = Number(addQuery);
    if (/^\d+$/.test(addQuery) && Number.isInteger(numeric) && numeric > 0) {
      return numeric;
    }
    return null;
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
      <form
        className="add-card"
        onSubmit={(event) => {
          event.preventDefault();
          const cardId = resolveAddCardId();
          const quantity = Number(addQty);
          if (cardId === null) {
            onStatus("Pick a catalog hit or enter a numeric card ID");
            return;
          }
          if (!Number.isInteger(quantity) || quantity < 1) {
            onStatus("Quantity must be a positive integer");
            return;
          }
          // Extra Deck monsters belong in Extra even if Main is selected.
          const section = routeSection(addSection, cardId, extraIds, (id) =>
            catalog.has(id),
          );
          onChange(
            addCard(doc, section, {
              card_id: cardId,
              quantity,
              taxonomy: {
                roles: [],
                opening_quality: { going_first: null, going_second: null },
              },
              name: catalog.get(cardId),
            }),
          );
          setAddQuery("");
          setAddCardId(null);
          const label = displayName(cardId, catalog.get(cardId), catalog);
          onStatus(
            section === addSection
              ? `Added ${label}`
              : `Added ${label} to the ${section === "extra" ? "Extra" : "Main"} Deck`,
          );
        }}
      >
        <select
          value={addSection}
          onChange={(event) => setAddSection(event.target.value as DeckSection)}
          aria-label="Deck section"
        >
          <option value="main">Main</option>
          <option value="extra">Extra</option>
          <option value="side">Side</option>
        </select>
        <span className="card-search">
          <input
            type="search"
            value={addQuery}
            onChange={(event) => {
              const value = event.target.value;
              setAddQuery(value);
              if (/^\d+$/.test(value) && Number(value) > 0) {
                setAddCardId(Number(value));
              } else {
                setAddCardId(null);
              }
            }}
            placeholder="Search name or passcode"
            aria-label="Card name or passcode"
            autoComplete="off"
          />
          {hits.length > 0 && (
            <ul className="catalog-hits">
              {hits.map((hit) => (
                <li key={hit.card_id}>
                  <button
                    type="button"
                    onClick={() => {
                      setAddQuery(hit.name);
                      setAddCardId(hit.card_id);
                    }}
                  >
                    <span className="catalog-hit-name">{hit.name}</span>
                    <span className="catalog-hit-id">{hit.card_id}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </span>
        <input
          value={addQty}
          onChange={(event) => setAddQty(event.target.value)}
          inputMode="numeric"
          aria-label="Quantity"
        />
        <button type="submit">Add card</button>
      </form>
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
                parseDeckText(paste, addSection),
                extraIds,
                (id) => catalog.has(id),
              );
              onChange(addFromParsed(doc, sections));
              setPaste("");
              onStatus(
                `Added the pasted cards (cards without a #section go to ${addSection})${
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
