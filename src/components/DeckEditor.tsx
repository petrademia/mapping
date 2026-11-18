import type { Catalog } from "../lib/catalog";
import {
  configurationLabel,
  DECK_LIST_ID,
  findConfiguration,
} from "../lib/configuration";
import { setBreakingGoal, setLabelGoal, type MappingDocument } from "../lib/document";
import { CONFIGURATION_PANEL_ID } from "./ConfigurationPanel";
import { DeckGrid } from "./DeckGrid";
import { CardSearch } from "./CardSearch";
import { PasteDeckList } from "./ImportExport";
import type { ExtraDeckIds } from "../lib/sectionRouting";
import { deckViolations, limitLabel, type Banlist, type Format } from "../lib/banlist";
import { displayName } from "../lib/catalog";

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

export function DeckEditor({ doc, catalog, extraIds, banlist, format, onFormatChange, onChange, onStatus }: Props) {
  const active = findConfiguration(doc, doc.active_configuration_id);
  const violations = deckViolations(doc, banlist, format);
  const goals = doc.hand_condition_sets.filter((set) => set.condition_ids.length > 0);
  const nameOf = (id: string | null | undefined, none: string): string => {
    if (!id) return none;
    const set = goals.find((entry) => entry.id === id);
    return set ? set.name || "Untitled hand goal" : none;
  };
  const labelName = nameOf(doc.label_goal_id, "Every Hand Goal");
  const breakingName = `Breaks: ${nameOf(doc.breaking_goal_id, "tagged cards only")}`;
  return (
    <div className="deck-editor-layout">
    <CardSearch
      doc={doc}
      catalog={catalog}
      extraIds={extraIds}
      banlist={banlist}
      format={format}
      onFormatChange={onFormatChange}
      onChange={onChange}
      onStatus={onStatus}
    />
    <PasteDeckList doc={doc} catalog={catalog} extraIds={extraIds} onChange={onChange} onStatus={onStatus} />
    <div className="deck-editor" id={DECK_LIST_ID}>
      {violations.length > 0 ? (
        <p className="deck-editor-banner deck-violations" role="alert">
          This deck breaks the {format.toUpperCase()} list:{" "}
          {violations
            .map((v) => {
              const name = displayName(v.card_id, doc.main.concat(doc.extra, doc.side).find((c) => c.card_id === v.card_id)?.name, catalog);
              return v.allowed === 0
                ? `${name} is forbidden`
                : `${name} has ${v.copies} copies, ${limitLabel(v.allowed) || "max 3"} allows ${v.allowed}`;
            })
            .join("; ")}
          .
        </p>
      ) : null}
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
      {goals.length > 0 ? (
        <details className="deck-labels">
          <summary>
            <strong>Card labels</strong>
            <span>
              {labelName} <i aria-hidden="true">/</i> {breakingName}
            </span>
          </summary>
          <label className="deck-label-goal">
            <span>
              Card dots come from
              <small>
                Starter, Extender and Brick are worked out from the Hand Goal you pick: one card starts it,
                needed with another card, or in no route.
              </small>
            </span>
            <select
              aria-label="Read card labels from"
              value={doc.label_goal_id ?? ""}
              onChange={(event) => onChange(setLabelGoal(doc, event.target.value || null))}
            >
              <option value="">Every Hand Goal</option>
              {goals.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name || "Untitled hand goal"}
                </option>
              ))}
            </select>
          </label>
          <label className="deck-label-goal">
            <span>
              Board-breaking combos
              <small>
                A Hand Goal for breaks that need two cards, such as Jupredo and a partner. A single card is
                tagged Board breaker instead.
              </small>
            </span>
            <select
              aria-label="Hand Goal for breaking boards"
              value={doc.breaking_goal_id ?? ""}
              onChange={(event) => onChange(setBreakingGoal(doc, event.target.value || null))}
            >
              <option value="">None, only cards tagged Board breaker</option>
              {goals.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name || "Untitled hand goal"}
                </option>
              ))}
            </select>
          </label>
        </details>
      ) : null}
      <DeckGrid
        doc={doc}
        catalog={catalog}
        onChange={onChange}
        extraIds={extraIds}
        banlist={banlist}
        format={format}
      />
    </div>
    </div>
  );
}
