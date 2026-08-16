import { useEffect, useState } from "react";
import { elfnoteArsMagnaDemo } from "./data/elfnoteArsMagnaDemo";
import { powerPatronArsMagnaDemo } from "./data/powerPatronArsMagnaDemo";
import { AnalysisContextSelector } from "./components/AnalysisContextSelector";
import { ModelsPanel } from "./components/ModelsPanel";
import { HandTestPanel } from "./components/HandTestPanel";
import { DeckEditor } from "./components/DeckEditor";
import { ImportExport } from "./components/ImportExport";
import { DeckProfile } from "./components/DeckProfile";
import { RoleSummary } from "./components/RoleSummary";
import { loadCatalog, type Catalog } from "./lib/catalog";
import {
  createDocument,
  sectionSize,
  setAnalysisContext,
  setDeckName,
  setOpeningHandSize,
  type MappingDocument,
} from "./lib/document";
import { loadStored, saveStored } from "./lib/persistence";

type Workspace = "profile" | "models" | "hand-test";

const WORKSPACES: { key: Workspace; label: string }[] = [
  { key: "profile", label: "Profile" },
  { key: "models", label: "Models" },
  { key: "hand-test", label: "Hand Test" },
];

export function App() {
  const [doc, setDoc] = useState<MappingDocument>(
    () => loadStored() ?? powerPatronArsMagnaDemo,
  );
  const [catalog, setCatalog] = useState<Catalog>(new Map());
  const [workspace, setWorkspace] = useState<Workspace>("profile");
  const [status, setStatus] = useState(
    "Local draft. Taxonomy annotations are deck-specific hypotheses.",
  );

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
            Annotate Role and Opening Quality hypotheses per deck card, inspect
            composition, then export configuration for YAPPING.
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
                setDoc(powerPatronArsMagnaDemo);
                setStatus("Loaded Power Patron Ars Magna demo.");
              }}
            >
              Load Power Patron
            </button>
            <button
              type="button"
              onClick={() => {
                setDoc(elfnoteArsMagnaDemo);
                setStatus("Loaded Elfnote Ars Magna demo.");
              }}
            >
              Load Elfnote
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
          <nav className="context-presets workspace-nav" aria-label="Workspace">
            {WORKSPACES.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={`context-chip${
                  workspace === entry.key ? " on" : ""
                }`}
                onClick={() => setWorkspace(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          {workspace === "profile" ? (
            <>
              <AnalysisContextSelector
                context={{
                  turn_order: doc.analysis.turn_order,
                  observation_point: doc.analysis.observation_point,
                }}
                openingHandSize={doc.analysis.opening_hand_size}
                onChange={(context) => setDoc(setAnalysisContext(doc, context))}
              />
              <DeckProfile
                doc={doc}
                onHandSize={(size) => {
                  if (!Number.isInteger(size) || size < 0) return;
                  setDoc(setOpeningHandSize(doc, size));
                }}
              />
              <RoleSummary doc={doc} />
            </>
          ) : null}

          {workspace === "models" ? (
            <ModelsPanel
              doc={doc}
              catalog={catalog}
              onChange={setDoc}
              onHandSize={(size) => {
                if (!Number.isInteger(size) || size < 0) return;
                setDoc(setOpeningHandSize(doc, size));
              }}
            />
          ) : null}

          {workspace === "hand-test" ? (
            <HandTestPanel
              doc={doc}
              catalog={catalog}
              onHandSize={(size) => {
                if (!Number.isInteger(size) || size < 0) return;
                setDoc(setOpeningHandSize(doc, size));
              }}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
