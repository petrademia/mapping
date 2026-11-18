import type { Catalog } from "../lib/catalog";
import {
  configurationLabel,
  DECK_LIST_ID,
  findConfiguration,
} from "../lib/configuration";
import { setLabelGoal, type MappingDocument } from "../lib/document";
import { CONFIGURATION_PANEL_ID } from "./ConfigurationPanel";
import { DeckGrid } from "./DeckGrid";
import { CardSearch } from "./CardSearch";
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
      {doc.hand_condition_sets.some((set) => set.condition_ids.length > 0) ? (
        <label className="deck-label-goal">
          Starter, Extender and Brick are read from
          <select
            aria-label="Read card labels from"
            value={doc.label_goal_id ?? ""}
            onChange={(event) => onChange(setLabelGoal(doc, event.target.value || null))}
          >
            <option value="">Every Hand Goal</option>
            {doc.hand_condition_sets
              .filter((set) => set.condition_ids.length > 0)
              .map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name || "Untitled hand goal"}
                </option>
              ))}
          </select>
        </label>
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
