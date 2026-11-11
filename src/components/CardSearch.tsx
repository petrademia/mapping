import { useState } from "react";
import {
  allowedCopies,
  copiesInDeck,
  limitLabel,
  type Banlist,
  type Format,
} from "../lib/banlist";
import { displayName, searchCatalog, type Catalog } from "../lib/catalog";
import { addCard, type DeckSection, type MappingDocument } from "../lib/document";
import { routeSection, type ExtraDeckIds } from "../lib/sectionRouting";
import { CardFrame } from "./HandImages";

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  extraIds: ExtraDeckIds;
  banlist: Banlist;
  format: Format;
  onFormatChange: (format: Format) => void;
  onChange: (doc: MappingDocument) => void;
  onStatus: (message: string) => void;
}

const RESULT_LIMIT = 24;

/** Alternate-art passcodes of one card share a name; show the card once. */
function dedupeByName<T extends { name: string }>(hits: readonly T[]): T[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.name)) return false;
    seen.add(hit.name);
    return true;
  });
}
const SECTIONS: { key: DeckSection; label: string }[] = [
  { key: "main", label: "Main" },
  { key: "extra", label: "Extra" },
  { key: "side", label: "Side" },
];
const FORMATS: { key: Format; label: string }[] = [
  { key: "ocg", label: "OCG list" },
  { key: "tcg", label: "TCG list" },
  { key: "ae", label: "AE list" },
  { key: "none", label: "No list" },
];

/**
 * Card search beside the deck. Main shows cards that belong in the Main Deck,
 * Extra shows Extra Deck monsters, and Side shows everything; a click adds one
 * copy to that section. A card never goes past 3 copies across Main, Extra and
 * Side, or past the limit of the chosen forbidden and limited list.
 */
export function CardSearch({
  doc,
  catalog,
  extraIds,
  banlist,
  format,
  onFormatChange,
  onChange,
  onStatus,
}: Props) {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<DeckSection>("main");

  const trimmed = query.trim();
  const belongs = (id: number) =>
    target === "side" || extraIds.size === 0 || extraIds.has(id) === (target === "extra");
  const hits =
    trimmed === ""
      ? []
      : dedupeByName(searchCatalog(catalog, trimmed, 200).filter((hit) => belongs(hit.card_id))).slice(
          0,
          RESULT_LIMIT,
        );
  // A passcode missing from the catalog can still be added by its number.
  const numeric = /^\d+$/.test(trimmed) && Number(trimmed) > 0 ? Number(trimmed) : null;
  const unknownId = numeric !== null && !catalog.has(numeric) ? numeric : null;

  function add(cardId: number): void {
    const label = displayName(cardId, catalog.get(cardId), catalog);
    const allowed = allowedCopies(banlist, format, cardId);
    if (copiesInDeck(doc, cardId) >= allowed) {
      onStatus(
        allowed === 0
          ? `${label} is forbidden on the ${format.toUpperCase()} list.`
          : `${label} is already at its limit of ${allowed} ${allowed === 1 ? "copy" : "copies"}.`,
      );
      return;
    }
    const section = routeSection(target, cardId, extraIds, (id) => catalog.has(id));
    onChange(
      addCard(doc, section, {
        card_id: cardId,
        quantity: 1,
        taxonomy: {
          roles: [],
          opening_quality: { going_first: null, going_second: null },
        },
        name: catalog.get(cardId),
      }),
    );
    onStatus(
      section === target
        ? `Added ${label}`
        : `Added ${label} to the ${section === "extra" ? "Extra" : "Main"} Deck`,
    );
  }

  function renderResult(cardId: number, name: string) {
    const allowed = allowedCopies(banlist, format, cardId);
    const have = copiesInDeck(doc, cardId);
    const full = have >= allowed;
    const label = limitLabel(allowed);
    return (
      <li key={cardId}>
        <button
          type="button"
          className={full ? "search-result full" : "search-result"}
          title={`${name} (${cardId})`}
          aria-label={`Add ${name}`}
          aria-disabled={full}
          onClick={() => add(cardId)}
        >
          <CardFrame cardId={cardId} />
          <span className="search-result-name">{name}</span>
          <span className="search-result-count">
            {have}/{allowed}
            {label ? ` · ${label}` : ""}
          </span>
        </button>
      </li>
    );
  }

  return (
    <section className="card-search-panel" aria-label="Card search">
      <h2>Add cards</h2>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search name or passcode"
        aria-label="Card name or passcode"
        autoComplete="off"
      />
      <div className="view-toggle" role="group" aria-label="Add to">
        {SECTIONS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={target === entry.key ? "context-chip on" : "context-chip"}
            aria-pressed={target === entry.key}
            onClick={() => setTarget(entry.key)}
          >
            {entry.label}
          </button>
        ))}
        <select
          aria-label="Forbidden and limited list"
          value={format}
          onChange={(event) => onFormatChange(event.target.value as Format)}
        >
          {FORMATS.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>
      {trimmed !== "" && hits.length === 0 && unknownId === null ? (
        <p className="empty">
          No {target === "main" ? "Main Deck" : target === "extra" ? "Extra Deck" : ""} card matches.
        </p>
      ) : null}
      <ul className="search-results">
        {hits.map((hit) => renderResult(hit.card_id, hit.name))}
        {unknownId !== null ? renderResult(unknownId, `Passcode ${unknownId}`) : null}
      </ul>
    </section>
  );
}
