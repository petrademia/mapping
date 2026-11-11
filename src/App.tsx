import { useEffect, useMemo, useState } from "react";
import { useTheme } from "./lib/theme";
import { Icon, IconButton } from "./components/IconButton";
import { CardImpactPanel } from "./components/CardImpactPanel";
import { ClearButton } from "./components/ClearButton";
import { ClearMenu } from "./components/ClearMenu";
import { ComparePanel } from "./components/ComparePanel";
import { HandtrapPanel } from "./components/HandtrapPanel";
import { RankPanel } from "./components/RankPanel";
import { ConfigurationPanel } from "./components/ConfigurationPanel";
import { HandBatchPanel } from "./components/HandBatchPanel";
import { loadBanlist, type Banlist, type Format } from "./lib/banlist";
import { download, slug } from "./lib/download";
import { scorerForDoc } from "./lib/rankScore";
import { serializeYdk } from "./lib/ydk";
import { clearUserDefault, loadDefaultDeck, loadUserDefault, saveUserDefault } from "./lib/defaultDeck";
import type { TestedHand } from "./lib/handTest";
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
import { ModelsPanel, type ModelsView } from "./components/ModelsPanel";
import { GoalOdds, NextStep } from "./components/NextStep";
import { HandTestPanel } from "./components/HandTestPanel";
import { DeckEditor } from "./components/DeckEditor";
import { ImportExport } from "./components/ImportExport";
import { DeckProfile } from "./components/DeckProfile";
import { RoleSummary } from "./components/RoleSummary";
import { loadCatalog, type Catalog } from "./lib/catalog";
import {
  analysisContextOf,
  createDocument,
  sectionSize,
  setAnalysisContext,
  setDeckName,
  setOpeningHandSize,
  type MappingDocument,
} from "./lib/document";
import { observedCards, type AnalysisContext } from "./lib/analysisContext";
import { loadStored, saveStored } from "./lib/persistence";

type Workspace = "profile" | "models" | "hand-test" | "batch" | "rank" | "compare" | "handtraps";

const WORKSPACES: { key: Workspace; label: string }[] = [
  { key: "profile", label: "Profile" },
  { key: "models", label: "Models" },
  { key: "hand-test", label: "Hand Test" },
  { key: "batch", label: "Batch Test" },
  { key: "rank", label: "Rank" },
  { key: "handtraps", label: "Handtraps" },
  { key: "compare", label: "Compare" },
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
  const [hasUserDefault, setHasUserDefault] = useState(() => loadUserDefault() !== null);
  const [banlist, setBanlist] = useState<Banlist>({});
  const [format, setFormat] = useState<Format>(() => {
    try {
      const saved = localStorage.getItem("mapping.format");
      return saved === "tcg" || saved === "ae" || saved === "none" ? saved : "ocg";
    } catch {
      return "ocg";
    }
  });
  const changeFormat = (next: Format) => {
    setFormat(next);
    try {
      localStorage.setItem("mapping.format", next);
    } catch {
      /* the choice just will not persist */
    }
  };
  // Bumped by Clear everything so workspace panels drop their local state.
  const [resetKey, setResetKey] = useState(0);
  // The hand being tested; lives here so the Batch Test tab can open one in Hand Test.
  const [testedHand, setTestedHand] = useState<TestedHand | null>(null);
  // The shuffled deck order behind the drawn hand, kept so it survives tab switches.
  const [handOrder, setHandOrder] = useState<number[] | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>("profile");
  // Which Models view opens when the next-step button sends you there.
  const [modelsStart, setModelsStart] = useState<ModelsView>("groups");
  const [status, setStatus] = useState("");
  const [theme, setTheme] = useTheme();
  // Workspaces and exports read the active configuration; `doc` stays Pre-Side.
  const view = useMemo(
    () => applyConfiguration(doc, doc.active_configuration_id, extraIds),
    [doc, extraIds],
  );
  const activeConfig = findConfiguration(doc, doc.active_configuration_id);
  // A new turn order changes how many cards a hand holds, so a drawn hand no longer fits.
  const changeContext = (context: AnalysisContext) => {
    setDoc(setAnalysisContext(doc, context));
    setTestedHand(null);
    setHandOrder(null);
  };
  const changeView = (next: MappingDocument) =>
    setDoc(mergeAnalysisEdit(doc, next));

  const loadDefault = () => {
    void loadDefaultDeck().then((deck) => {
      if (!deck) {
        setStatus("Could not load default.ydk.");
        return;
      }
      setDoc(deck);
      setResetKey((key) => key + 1);
      setTestedHand(null);
      setStatus("Loaded the default deck from default.ydk.");
    });
  };

  const handSample = observedCards(analysisContextOf(view), view.analysis.opening_hand_size);
  const handTestView =
    workspace === "hand-test"
      ? {
          counts: testedHand?.card_counts ?? {},
          sample: handSample,
          order: testedHand ? handOrder : null,
          rankOf: (cardId: number) =>
            scorerForDoc(view, view.analysis.turn_order)?.positionOf(cardId) ?? null,
          onCount: (cardId: number, next: number) => {
            const counts = { ...(testedHand?.card_counts ?? {}) };
            if (next <= 0) delete counts[cardId];
            else counts[cardId] = next;
            setTestedHand(
              Object.keys(counts).length === 0
                ? null
                : { card_counts: counts, observed_cards: handSample },
            );
          },
        }
      : null;

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
    void loadBanlist().then(setBanlist);
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
          <div className="theme-switch" role="group" aria-label="Color theme">
            {(
              [
                ["system", "device", "Match the device"],
                ["light", "sun", "Light theme"],
                ["dark", "moon", "Dark theme"],
              ] as const
            ).map(([option, icon, label]) => (
              <IconButton
                key={option}
                icon={icon}
                label={label}
                aria-pressed={theme === option}
                className={theme === option ? "on" : ""}
                onClick={() => setTheme(option)}
              />
            ))}
          </div>
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
                setTestedHand(null);
                setStatus("Started an empty deck.");
              }}
            >
              <Icon name="file" />
              New deck
            </button>
            <ClearButton
              label="Default deck"
              confirmLabel="Replace"
              message="Replace the current deck and models with default.ydk?"
              onConfirm={loadDefault}
            />
            <ClearMenu doc={doc} onChange={setDoc} onStatus={setStatus} />
            <ClearButton
              label={hasUserDefault ? "Update default" : "Set as default"}
              confirmLabel="Save"
              message={
                hasUserDefault
                  ? "Replace your saved default with this deck?"
                  : "Make this deck, with its groups and Hand Goals, the one Default deck loads?"
              }
              onConfirm={() => {
                if (saveUserDefault(doc)) {
                  setHasUserDefault(true);
                  setStatus("Saved as your default deck.");
                } else {
                  setStatus("Could not save the default deck in this browser.");
                }
              }}
            />
            {hasUserDefault ? (
              <ClearButton
                label="Reset default"
                confirmLabel="Reset"
                message="Forget your saved default and use default.ydk again?"
                onConfirm={() => {
                  clearUserDefault();
                  setHasUserDefault(false);
                  setStatus("Default deck is default.ydk again.");
                }}
              />
            ) : null}
            <button
              type="button"
              className="primary"
              onClick={() => {
                download(
                  `${slug(doc.name)}.ydk`,
                  serializeYdk({ main: view.main, extra: view.extra, side: view.side }),
                );
                setStatus("Saved YDK");
              }}
            >
              <Icon name="download" />
              Save YDK
            </button>
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
        <DeckEditor
          doc={doc}
          catalog={catalog}
          extraIds={extraIds}
          banlist={banlist}
          format={format}
          onFormatChange={changeFormat}
          onChange={setDoc}
          onStatus={setStatus}
          handTest={handTestView}
        />
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

          {workspace === "profile" ? (
            <>
              <NextStep
                doc={view}
                onDefineGoal={() => {
                  setModelsStart("outcomes");
                  setWorkspace("models");
                }}
                onTestHand={() => setWorkspace("hand-test")}
              />
              <GoalOdds doc={view} />
            </>
          ) : null}

          <ConfigurationPanel doc={doc} catalog={catalog} extraIds={extraIds} onChange={setDoc} />

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
              initialView={modelsStart}
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
              hand={testedHand}
              onHandChange={setTestedHand}
              onOrderChange={setHandOrder}
              onContext={changeContext}
              onHandSize={(size) => {
                if (!Number.isInteger(size) || size < 0) return;
                setDoc(setOpeningHandSize(doc, size));
              }}
            />
          ) : null}

          {workspace === "batch" ? (
            <HandBatchPanel
              key={resetKey}
              onContext={changeContext}
              doc={view}
              catalog={catalog}
              onOpenInTester={(hand) => {
                setTestedHand(hand);
                setHandOrder(null);
                setWorkspace("hand-test");
                requestAnimationFrame(() =>
                  document.getElementById("hand-test-top")?.scrollIntoView({ block: "start" }),
                );
              }}
            />
          ) : null}

          {workspace === "handtraps" ? (
            <HandtrapPanel doc={view} catalog={catalog} onChange={changeView} />
          ) : null}

          {workspace === "compare" ? (
            <ComparePanel
              key={resetKey}
              doc={view}
              catalog={catalog}
              onUse={(deck) => {
                setDoc(deck);
                setResetKey((key) => key + 1);
                setTestedHand(null);
                setStatus("Replaced the deck with the compared deck.");
              }}
            />
          ) : null}

          {workspace === "rank" ? (
            <RankPanel doc={view} catalog={catalog} onChange={changeView} />
          ) : null}
        </aside>
      </div>
    </div>
    </CardImagesContext.Provider>
  );
}
