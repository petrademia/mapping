import { useState } from "react";
import type { Catalog } from "../lib/catalog";
import {
  configurationLabel,
  DECK_LIST_ID,
  findConfiguration,
} from "../lib/configuration";
import type { MappingDocument } from "../lib/document";
import { CONFIGURATION_PANEL_ID } from "./ConfigurationPanel";
import { DeckGrid } from "./DeckGrid";
import { DeckSection } from "./DeckSection";
import { CardSearch } from "./CardSearch";
import type { ExtraDeckIds } from "../lib/sectionRouting";

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  extraIds: ExtraDeckIds;
  onChange: (doc: MappingDocument) => void;
  onStatus: (message: string) => void;
}

type View = "cards" | "list";
const VIEW_KEY = "mapping.deckView";

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards";
  } catch {
    return "cards";
  }
}

export function DeckEditor({ doc, catalog, extraIds, onChange, onStatus }: Props) {
  const active = findConfiguration(doc, doc.active_configuration_id);
  const [view, setView] = useState<View>(readView);

  function chooseView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* the choice just will not persist */
    }
  }

  return (
    <div className="deck-editor-layout">
    <CardSearch
      doc={doc}
      catalog={catalog}
      extraIds={extraIds}
      onChange={onChange}
      onStatus={onStatus}
    />
    <div className="deck-editor" id={DECK_LIST_ID}>
      <div className="view-toggle" role="group" aria-label="Deck view">
        {(["cards", "list"] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            className={view === entry ? "context-chip on" : "context-chip"}
            aria-pressed={view === entry}
            onClick={() => chooseView(entry)}
          >
            {entry === "cards" ? "Cards" : "List"}
          </button>
        ))}
      </div>
      {active ? (
        <p className="deck-editor-banner" role="note">
          This list is <strong>Pre-Side</strong>. Analysis is showing{" "}
          <strong>{configurationLabel(active)}</strong>; change its swaps in{" "}
          <button
            type="button"
            onClick={() => {
              const panel = document.getElementById(CONFIGURATION_PANEL_ID);
              panel?.scrollIntoView({ block: "start" });
              panel?.focus({ preventScroll: true });
            }}
          >
            Deck Configuration
          </button>
          .
        </p>
      ) : null}
      {doc.main.length + doc.extra.length + doc.side.length === 0 ? (
        <p className="deck-empty-state">
          No deck yet. Use <strong>Load file</strong> to open a .ydk or a saved
          mapping, paste a list under <strong>Paste a deck list</strong>, or
          search a card on the right.
        </p>
      ) : null}
      {view === "cards" ? (
        <DeckGrid doc={doc} catalog={catalog} onChange={onChange} />
      ) : (
        <>
          <DeckSection doc={doc} section="main" catalog={catalog} onChange={onChange} />
          <DeckSection doc={doc} section="extra" catalog={catalog} onChange={onChange} />
          <DeckSection doc={doc} section="side" catalog={catalog} onChange={onChange} />
        </>
      )}
    </div>
    </div>
  );
}
