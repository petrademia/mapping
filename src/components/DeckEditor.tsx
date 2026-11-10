import type { Catalog } from "../lib/catalog";
import {
  configurationLabel,
  DECK_LIST_ID,
  findConfiguration,
} from "../lib/configuration";
import type { MappingDocument } from "../lib/document";
import { CONFIGURATION_PANEL_ID } from "./ConfigurationPanel";
import { DeckSection } from "./DeckSection";

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  onChange: (doc: MappingDocument) => void;
}

export function DeckEditor({ doc, catalog, onChange }: Props) {
  const active = findConfiguration(doc, doc.active_configuration_id);
  return (
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
      <DeckSection doc={doc} section="main" catalog={catalog} onChange={onChange} />
      <DeckSection doc={doc} section="extra" catalog={catalog} onChange={onChange} />
      <DeckSection doc={doc} section="side" catalog={catalog} onChange={onChange} />
    </div>
  );
}
