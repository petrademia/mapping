import type { Catalog } from "../lib/catalog";
import {
  configurationLabel,
  DECK_LIST_ID,
  findConfiguration,
} from "../lib/configuration";
import type { MappingDocument } from "../lib/document";
import { CONFIGURATION_PANEL_ID } from "./ConfigurationPanel";
import { DeckGrid, type HandTestView } from "./DeckGrid";
import { CardSearch } from "./CardSearch";
import type { ExtraDeckIds } from "../lib/sectionRouting";

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  extraIds: ExtraDeckIds;
  onChange: (doc: MappingDocument) => void;
  onStatus: (message: string) => void;
  /** Set while Hand Test is open: the Main Deck shows the shuffled hand. */
  handTest?: HandTestView | null;
}

export function DeckEditor({ doc, catalog, extraIds, onChange, onStatus, handTest }: Props) {
  const active = findConfiguration(doc, doc.active_configuration_id);
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
      <DeckGrid doc={doc} catalog={catalog} onChange={onChange} handTest={handTest} />
    </div>
    </div>
  );
}
