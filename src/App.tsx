import { useEffect, useMemo, useState } from "react";
import { CardImpactPanel } from "./components/CardImpactPanel";
import { ClearMenu } from "./components/ClearMenu";
import { ConfigurationPanel } from "./components/ConfigurationPanel";
import { loadDefaultDeck } from "./lib/defaultDeck";
import { loadExtraDeckIds, type ExtraDeckIds } from "./lib/sectionRouting";
import {
  CardImagesContext,
  loadCardImageIds,
  type CardImageIds,
} from "./lib/cardImages";
import {
  applyConfiguration,
  configurationLabel,
  findConfiguration,
  mergeAnalysisEdit,
} from "./lib/configuration";
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

const WORKSPACE_ID = "workspace";

function formatDelta(value: number): string {
  if (value === 0) return "±0";
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

export function App() {
  // First run only: with no saved draft the deck comes from /default.ydk.
  const [hadDraft] = useState(() => loadStored() !== null);
  const [doc, setDoc] = useState<MappingDocument>(
    () => loadStored() ?? createDocument("untitled"),
  );
  const [catalog, setCatalog] = useState<Catalog>(new Map());
  const [imageIds, setImageIds] = useState<CardImageIds>(new Set());
  const [extraIds, setExtraIds] = useState<ExtraDeckIds>(new Set());
  // Bumped by Clear everything so workspace panels drop their local state.
  const [resetKey, setResetKey] = useState(0);
  const [workspace, setWorkspace] = useState<Workspace>("profile");
  const [status, setStatus] = useState(
    "Local draft. Taxonomy annotations are deck-specific hypotheses.",
  );
  // Workspaces and exports read the active configuration; `doc` stays Pre-Side.
  const view = useMemo(() => applyConfiguration(doc), [doc]);
  const activeConfig = findConfiguration(doc, doc.active_configuration_id);
  const changeView = (next: MappingDocument) =>
    setDoc(mergeAnalysisEdit(doc, next));

  useEffect(() => {
    saveStored(doc);
  }, [doc]);

  useEffect(() => {
    if (hadDraft) return;
    let cancelled = false;
    void loadDefaultDeck().then((deck) => {
      if (!deck || cancelled) return;
      // Never replace cards the user already added while this loaded.
      setDoc((current) =>
        current.main.length + current.extra.length + current.side.length === 0
          ? deck
          : current,
      );
      setStatus("Loaded the default deck from default.ydk.");
    });
    return () => {
      cancelled = true;
    };
  }, [hadDraft]);

  useEffect(() => {
    void loadCatalog().then(setCatalog);
    void loadCardImageIds().then(setImageIds);
    void loadExtraDeckIds().then(setExtraIds);
  }, []);

  return (
    <CardImagesContext.Provider value={imageIds}>
    <div className="app">
      <header className="masthead">
        <div className="brand">
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
            <span>{sectionSize(view.main)} main</span>
            <span>{sectionSize(view.extra)} extra</span>
            <span>{sectionSize(view.side)} side</span>
            {activeConfig ? <span>{configurationLabel(activeConfig)}</span> : null}
          </p>
          <div className="row-actions">
            <button
              type="button"
              onClick={() => {
                setDoc(createDocument("untitled"));
                setResetKey((key) => key + 1);
                setStatus("Started an empty deck.");
              }}
            >
              New deck
            </button>
            <ClearMenu doc={doc} onChange={setDoc} onStatus={setStatus} />
          </div>
        </div>
      </header>
      <ImportExport
        doc={doc}
        exportDoc={view}
        catalog={catalog}
        extraIds={extraIds}
        onChange={setDoc}
        onStatus={setStatus}
      />
      <p className="status" role="status">
        {status}
      </p>
      <div className="jump-bar">
        <span>
          Analyzing{" "}
          <strong>{activeConfig ? configurationLabel(activeConfig) : "Pre-Side"}</strong>
        </span>
        <button
          type="button"
          onClick={() =>
            document
              .getElementById(WORKSPACE_ID)
              ?.scrollIntoView({ block: "start" })
          }
        >
          Go to analysis
        </button>
      </div>
      <div className="workspace">
        <DeckEditor doc={doc} catalog={catalog} onChange={setDoc} />
        <aside id={WORKSPACE_ID}>
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

          <p
            className={activeConfig ? "analyzing-strip sided" : "analyzing-strip"}
            role="status"
          >
            Analyzing <strong>{activeConfig ? configurationLabel(activeConfig) : "Pre-Side"}</strong>
            {" · "}
            {sectionSize(view.main)} main
            {activeConfig
              ? ` · ${formatDelta(sectionSize(view.main) - sectionSize(doc.main))} vs Pre-Side`
              : null}
          </p>

          <ConfigurationPanel doc={doc} catalog={catalog} onChange={setDoc} />

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
                doc={view}
                onHandSize={(size) => {
                  if (!Number.isInteger(size) || size < 0) return;
                  setDoc(setOpeningHandSize(doc, size));
                }}
              />
              <CardImpactPanel doc={view} catalog={catalog} />
              <RoleSummary doc={view} />
            </>
          ) : null}

          {workspace === "models" ? (
            <ModelsPanel
              key={resetKey}
              doc={view}
              catalog={catalog}
              onChange={changeView}
              onHandSize={(size) => {
                if (!Number.isInteger(size) || size < 0) return;
                setDoc(setOpeningHandSize(doc, size));
              }}
            />
          ) : null}

          {workspace === "hand-test" ? (
            <HandTestPanel
              key={resetKey}
              doc={view}
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
    </CardImagesContext.Provider>
  );
}
