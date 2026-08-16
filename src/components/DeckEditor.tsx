import type { Catalog } from "../lib/catalog";
import type { MappingDocument } from "../lib/document";
import { DeckSection } from "./DeckSection";

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  onChange: (doc: MappingDocument) => void;
}

export function DeckEditor({ doc, catalog, onChange }: Props) {
  return (
    <div className="deck-editor">
      <DeckSection doc={doc} section="main" catalog={catalog} onChange={onChange} />
      <DeckSection doc={doc} section="extra" catalog={catalog} onChange={onChange} />
      <DeckSection doc={doc} section="side" catalog={catalog} onChange={onChange} />
    </div>
  );
}
