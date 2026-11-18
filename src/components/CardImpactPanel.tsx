import { useState } from "react";
import { analysisContextLabel, observedCards } from "../lib/analysisContext";
import type { CardImpact } from "../lib/cardImpact";
import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import { analysisContextOf, sectionSize, type MappingDocument } from "../lib/document";
import { groupsToMembership } from "../lib/handCondition";
import { modelsAnalysisKey } from "../lib/modelsAnalysisKey";
import { useCardImpact } from "../lib/useCardImpact";
import { CardThumb } from "./CardThumb";

const COLLAPSED_ROWS = 10;

function points(value: number): string {
  const rounded = Math.round(value * 1000) / 10;
  if (rounded === 0) return "0 pts";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)} pts`;
}

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
}

/**
 * Read-only ranking of Main Deck cards by how much holding them changes the
 * chance of a Hand Goal, for the selected Analysis Context. A statistic
 * about the model, not a score you assign.
 */
export function CardImpactPanel({ doc, catalog }: Props) {
  const usable = doc.hand_condition_sets.filter((set) => set.condition_ids.length > 0);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const selected =
    usable.find((set) => set.id === chosenId) ??
    usable.find((set) => set.id === doc.engine_access_set_id) ??
    usable[0] ??
    null;

  const context = analysisContextOf(doc);
  const sample = observedCards(context, doc.analysis.opening_hand_size);
  const deck = sectionSize(doc.main);

  // Worked out in a Web Worker, and only when something it depends on changes: a rename, a note
  // or the order of the cards does not start it again. The previous ranking stays, dimmed, while
  // a new one is counted.
  const key = `${selected?.id ?? ""}\n${modelsAnalysisKey({
    main: doc.main,
    groups: doc.groups,
    hand_conditions: doc.hand_conditions,
    hand_condition_sets: doc.hand_condition_sets,
    sample,
    turn_order: context.turn_order,
    engine_access_set_id: doc.engine_access_set_id,
  })}`;
  const { result, pending } = useCardImpact(
    key,
    !selected || deck === 0 || sample > deck
      ? null
      : {
          deck: doc.main,
          sample,
          conditions: doc.hand_conditions,
          set: selected,
          groups: groupsToMembership(doc.groups),
        },
  );
  const impact: CardImpact | null = result ?? null;

  const maxLift = impact
    ? Math.max(0.0001, ...impact.rows.map((row) => Math.abs(row.lift ?? 0)))
    : 1;
  const rows = impact ? (showAll ? impact.rows : impact.rows.slice(0, COLLAPSED_ROWS)) : [];

  return (
    <section className="panel card-impact-panel" aria-busy={pending}>
      <header>
        <h2>Card Impact</h2>
        <p>{analysisContextLabel(context, doc.analysis.opening_hand_size)}</p>
      </header>
      {selected === null ? (
        <p className="empty">
          Put Hand Conditions into a Hand Goal in Models to rank cards by
          impact.
        </p>
      ) : (
        <>
          <p className="note">
            How much holding a card changes the chance of the goal. Zero
            means the goal does not depend on it.
          </p>
          <label className="impact-select">
            Hand Goal
            <select
              value={selected.id}
              onChange={(event) => setChosenId(event.target.value)}
            >
              {usable.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.name}
                </option>
              ))}
            </select>
          </label>
          {impact === null ? (
            <p className="empty">Add enough Main Deck cards for this hand size.</p>
          ) : (
            <>
              <p className="impact-baseline">
                Chance of {impact.setName}:{" "}
                <strong>{(impact.baseline * 100).toFixed(1)}%</strong>
              </p>
              <ol className="impact-list">
                {rows.map((row) => (
                  <li key={row.card_id}>
                    <CardThumb
                      cardId={row.card_id}
                      name={displayName(row.card_id, row.name, catalog)}
                    />
                    <span className="impact-name">
                      {displayName(row.card_id, row.name, catalog)}
                      <span className="impact-sub">
                        {row.withCard === null
                          ? "never in hand"
                          : `${(row.withCard * 100).toFixed(1)}% with it in hand`}
                      </span>
                    </span>
                    <span className="impact-bar" aria-hidden="true">
                      <span
                        className={
                          (row.lift ?? 0) < 0 ? "impact-fill negative" : "impact-fill"
                        }
                        style={{ width: `${(Math.abs(row.lift ?? 0) / maxLift) * 100}%` }}
                      />
                    </span>
                    <span className="impact-value">
                      {row.lift === null ? "-" : points(row.lift)}
                    </span>
                  </li>
                ))}
              </ol>
              {impact.rows.length > COLLAPSED_ROWS ? (
                <button type="button" onClick={() => setShowAll((value) => !value)}>
                  {showAll ? "Show top 10" : `Show all ${impact.rows.length} cards`}
                </button>
              ) : null}
            </>
          )}
        </>
      )}
    </section>
  );
}
