import { useEffect, useState } from "react";
import { brandedDemo } from "./data/brandedDemo";
import { DeckEditor } from "./components/DeckEditor";
import { ImportExport } from "./components/ImportExport";
import { ProbabilityPanel } from "./components/ProbabilityPanel";
import { RoleSummary } from "./components/RoleSummary";
import { loadCatalog, type Catalog } from "./lib/catalog";
import {
  createDocument,
  sectionSize,
  setDeckName,
  setOpeningHandSize,
  type MappingDocument,
} from "./lib/document";
import { loadStored, saveStored } from "./lib/persistence";

export function App() {
  const [doc, setDoc] = useState<MappingDocument>(
    () => loadStored() ?? brandedDemo,
  );
  const [catalog, setCatalog] = useState<Catalog>(new Map());
  const [status, setStatus] = useState("Local draft. Roles are deck-specific.");

  useEffect(() => {
    saveStored(doc);
  }, [doc]);

  useEffect(() => {
    void loadCatalog().then(setCatalog);
  }, []);

  return (
    <div className="app">
      <header className="masthead">
        <div className="brand">
          <p className="eyebrow">Yu-Gi-Oh! analysis family</p>
          <h1>MAPPING</h1>
          <p className="tag">
            Cards map to functional roles, then to deck composition, then to
            YAPPING configuration.
          </p>
        </div>
        <div className="deck-meta">
          <label>
            Deck
            <input
              value={doc.name}
              onChange={(event) => setDoc(setDeckName(doc, event.target.value))}
            />
          </label>
          <p className="counts">
            <span>{sectionSize(doc.main)} main</span>
            <span>{sectionSize(doc.extra)} extra</span>
            <span>{sectionSize(doc.side)} side</span>
          </p>
          <div className="row-actions">
            <button
              type="button"
              onClick={() => {
                setDoc(createDocument("untitled"));
                setStatus("Started an empty deck.");
              }}
            >
              New deck
            </button>
            <button
              type="button"
              onClick={() => {
                setDoc(brandedDemo);
                setStatus("Loaded Branded demo from the YAPPING archetype.");
              }}
            >
              Load Branded demo
            </button>
          </div>
        </div>
      </header>
      <ImportExport
        doc={doc}
        catalog={catalog}
        onChange={setDoc}
        onStatus={setStatus}
      />
      <p className="status" role="status">
        {status}
      </p>
      <div className="workspace">
        <DeckEditor doc={doc} catalog={catalog} onChange={setDoc} />
        <aside>
          <RoleSummary doc={doc} />
          <ProbabilityPanel
            doc={doc}
            onHandSize={(size) => {
              if (!Number.isInteger(size) || size < 0) return;
              setDoc(setOpeningHandSize(doc, size));
            }}
          />
        </aside>
      </div>
    </div>
  );
}
