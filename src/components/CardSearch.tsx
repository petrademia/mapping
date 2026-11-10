import { useState } from "react";
import { displayName, searchCatalog, type Catalog } from "../lib/catalog";
import { addCard, type DeckSection, type MappingDocument } from "../lib/document";
import { routeSection, type ExtraDeckIds } from "../lib/sectionRouting";
import { CardFrame } from "./HandImages";

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  extraIds: ExtraDeckIds;
  onChange: (doc: MappingDocument) => void;
  onStatus: (message: string) => void;
}

const RESULT_LIMIT = 24;
const SECTIONS: { key: DeckSection; label: string }[] = [
  { key: "main", label: "Main" },
  { key: "extra", label: "Extra" },
  { key: "side", label: "Side" },
];

/**
 * Card search beside the deck: type a name or passcode, click a card to add one
 * copy to the chosen section. Extra Deck monsters always land in the Extra Deck.
 */
export function CardSearch({ doc, catalog, extraIds, onChange, onStatus }: Props) {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<DeckSection>("main");

  const trimmed = query.trim();
  const hits = trimmed === "" ? [] : searchCatalog(catalog, trimmed, RESULT_LIMIT);
  // A passcode missing from the catalog can still be added by its number.
  const numeric = /^\d+$/.test(trimmed) && Number(trimmed) > 0 ? Number(trimmed) : null;
  const unknownId = numeric !== null && !catalog.has(numeric) ? numeric : null;

  function add(cardId: number): void {
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
    const label = displayName(cardId, catalog.get(cardId), catalog);
    onStatus(
      section === target
        ? `Added ${label}`
        : `Added ${label} to the ${section === "extra" ? "Extra" : "Main"} Deck`,
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
      </div>
      {trimmed !== "" && hits.length === 0 && unknownId === null ? (
        <p className="empty">No card matches.</p>
      ) : null}
      <ul className="search-results">
        {hits.map((hit) => (
          <li key={hit.card_id}>
            <button
              type="button"
              className="search-result"
              title={`${hit.name} (${hit.card_id})`}
              aria-label={`Add ${hit.name}`}
              onClick={() => add(hit.card_id)}
            >
              <CardFrame cardId={hit.card_id} />
              <span className="search-result-name">{hit.name}</span>
            </button>
          </li>
        ))}
        {unknownId !== null ? (
          <li>
            <button
              type="button"
              className="search-result"
              aria-label={`Add passcode ${unknownId}`}
              onClick={() => add(unknownId)}
            >
              <CardFrame cardId={unknownId} />
              <span className="search-result-name">Passcode {unknownId}</span>
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
