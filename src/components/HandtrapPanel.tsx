import { useEffect, useMemo, useState } from "react";
import { analysisContextLabel } from "../lib/analysisContext";
import type { Catalog } from "../lib/catalog";
import { analysisContextOf, type MappingDocument } from "../lib/document";
import {
  addHandtrap,
  addHandtrapPair,
  COMMON_HANDTRAPS,
  newHandtrap,
  pairLabel,
  removeHandtrap,
  removeHandtrapPair,
  setHandtrapHits,
  toggleHandtrapHit,
  updateHandtrap,
  type Handtrap,
} from "../lib/handtrap";
import { analyzeVersus, type GoalSurvival } from "../lib/handtrapVersus";
import { CardFrame } from "./HandImages";
import { HitPriorityEditor } from "./HitPriorityEditor";
import { DeckPicker } from "./ModelArt";

interface Props {
  /** The analyzed deck, with its Hand Goals and handtraps. */
  doc: MappingDocument;
  catalog: Catalog;
  onChange: (doc: MappingDocument) => void;
}

const percent = (value: number): string => `${(value * 100).toFixed(2)}%`;

function points(delta: number): string {
  const value = (delta * 100).toFixed(2);
  return delta > 0 ? `+${value} pts` : delta < 0 ? `${value.replace("-", "−")} pts` : "no change";
}

/** A name that is saved when you leave the field, so typing never fights the list. */
function NameField({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      value={draft}
      aria-label="Handtrap name"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft.trim() && draft !== value) onCommit(draft);
        else setDraft(value);
      }}
    />
  );
}

function HandtrapBlock({
  doc,
  catalog,
  handtrap,
  onChange,
}: {
  doc: MappingDocument;
  catalog: Catalog;
  handtrap: Handtrap;
  onChange: (doc: MappingDocument) => void;
}) {
  const hits = new Set(handtrap.hits);
  // Starts open until a card is picked, then stays however you leave it.
  const [pickerOpen, setPickerOpen] = useState(handtrap.hits.length === 0);
  const mainIds = doc.main.map((card) => card.card_id);
  const withRole = (...roles: string[]) =>
    doc.main
      .filter((card) => card.taxonomy.roles.some((role) => roles.includes(role)))
      .map((card) => card.card_id);
  return (
    <div className="access-block handtrap-block">
      <div className="access-block-head">
        {handtrap.card_id !== undefined ? (
          <span className="handtrap-art" aria-hidden="true">
            <CardFrame cardId={handtrap.card_id} name={handtrap.name} />
          </span>
        ) : null}
        <NameField value={handtrap.name} onCommit={(name) => onChange(updateHandtrap(doc, { ...handtrap, name }))} />
        <button type="button" className="ghost" onClick={() => onChange(removeHandtrap(doc, handtrap.id))}>
          Remove
        </button>
      </div>
      <details
        className="handtrap-picker"
        open={pickerOpen}
        onToggle={(event) => setPickerOpen(event.currentTarget.open)}
      >
        <summary>
          {hits.size === 0
            ? "Cards it can stop: none picked yet"
            : `Cards it can stop: ${hits.size} of your ${hits.size === 1 ? "card" : "cards"}`}
        </summary>
        <p className="note">Click a card of yours to add it to or remove it from what this handtrap can stop.</p>
        <div className="row-actions">
          <button type="button" onClick={() => onChange(setHandtrapHits(doc, handtrap.id, withRole("starter")))}>
            Starters
          </button>
          <button
            type="button"
            onClick={() => onChange(setHandtrapHits(doc, handtrap.id, withRole("starter", "extender")))}
          >
            Starters and extenders
          </button>
          <button type="button" onClick={() => onChange(setHandtrapHits(doc, handtrap.id, mainIds))}>
            Every card
          </button>
          <button type="button" className="ghost" onClick={() => onChange(setHandtrapHits(doc, handtrap.id, []))}>
            Clear
          </button>
        </div>
        <DeckPicker
          deck={doc.main}
          catalog={catalog}
          selected={hits}
          label={`Cards ${handtrap.name} can stop`}
          onToggle={(cardId) => onChange(toggleHandtrapHit(doc, handtrap.id, cardId))}
        />
      </details>
    </div>
  );
}

function Cell({ goal, baseline, total }: { goal: GoalSurvival; baseline?: GoalSurvival; total: bigint }) {
  const drop = baseline ? goal.probability - baseline.probability : 0;
  return (
    <td className="num">
      <span className="odds-percent">{percent(goal.probability)}</span>
      <span className="odds-fraction">
        {goal.weight.toLocaleString("en-US")} / {total.toLocaleString("en-US")}
      </span>
      {baseline ? (
        <span className={drop < 0 ? "delta loss" : "delta"}>{points(drop)}</span>
      ) : null}
    </td>
  );
}

/**
 * Handtrap versus: choose the handtraps the opponent may hold, the cards of
 * yours each can stop, and save pairs they might hold together. For every Hand
 * Goal it shows how often the goal still holds against each handtrap and pair,
 * assuming the opponent uses it on the card that hurts most.
 */
export function HandtrapPanel({ doc, catalog, onChange }: Props) {
  const context = analysisContextOf(doc);
  const [custom, setCustom] = useState("");
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");

  const outcome = useMemo(
    () => analyzeVersus(doc),
    // The analysis reads exactly these parts of the deck.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc.main, doc.groups, doc.hand_conditions, doc.hand_condition_sets, doc.handtraps, doc.handtrap_pairs, doc.analysis],
  );

  const missing = COMMON_HANDTRAPS.filter(
    (common) => !doc.handtraps.some((handtrap) => handtrap.card_id === common.card_id),
  );
  const [a, b] = [first || doc.handtraps[0]?.id || "", second || doc.handtraps[1]?.id || doc.handtraps[0]?.id || ""];

  return (
    <section className="panel handtrap-panel" id="handtraps-top">
      <header>
        <h2>Handtrap versus</h2>
        <p>{analysisContextLabel(context, doc.analysis.opening_hand_size)}</p>
      </header>
      <p className="note">
        Pick the handtraps your opponent may hold and the cards of yours each
        can stop. For every Hand Goal you see how often it still holds when
        the opponent uses the handtrap on the card that hurts most. Two
        handtraps in a pair stop two cards.
      </p>

      <h3 className="panel-subhead">How your Hand Goals hold up</h3>
      {"error" in outcome ? (
        <p className="empty">{outcome.error}</p>
      ) : doc.handtraps.length === 0 ? (
        <p className="empty">Add a handtrap to see how each Hand Goal holds up against it.</p>
      ) : (
        <div className="compare-results" aria-label="Handtrap results">
          <p className="note">
            First {outcome.sample} cards. Each number is the chance the goal still holds after the
            opponent uses the handtrap on the card that hurts most.
          </p>
          <table className="compare-table handtrap-table">
            <caption>Hand Goal odds against handtraps</caption>
            <thead>
              <tr>
                <th scope="col">Opponent holds</th>
                {outcome.baseline.map((goal) => (
                  <th key={goal.setId} scope="col">
                    {goal.name || "Untitled hand goal"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">No handtrap</th>
                {outcome.baseline.map((goal) => (
                  <Cell key={goal.setId} goal={goal} total={outcome.total} />
                ))}
              </tr>
              {outcome.scenarios.map(({ scenario, goals }) => (
                <tr key={scenario.id}>
                  <th scope="row">{scenario.label}</th>
                  {goals.map((goal, index) => (
                    <Cell key={goal.setId} goal={goal} baseline={outcome.baseline[index]} total={outcome.total} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {doc.handtraps.some((handtrap) => handtrap.hits.length === 0) ? (
            <p className="note">
              A handtrap with no cards picked can stop nothing, so it shows no change.
            </p>
          ) : null}
        </div>
      )}

      <h3 className="panel-subhead">Handtraps</h3>
      {missing.length > 0 ? (
        <ul className="handtrap-add" aria-label="Add a common handtrap">
          {missing.map((common) => (
            <li key={common.card_id}>
              <button
                type="button"
                className="pick-tile"
                title={`Add ${common.name}`}
                aria-label={`Add ${common.name}`}
                onClick={() => onChange(addHandtrap(doc, newHandtrap(common.name, common.card_id)))}
              >
                <CardFrame cardId={common.card_id} name={common.name} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="row-actions">
        <input
          value={custom}
          placeholder="Name another handtrap"
          aria-label="Name of a new handtrap"
          onChange={(event) => setCustom(event.target.value)}
        />
        <button
          type="button"
          disabled={custom.trim() === ""}
          onClick={() => {
            onChange(addHandtrap(doc, newHandtrap(custom)));
            setCustom("");
          }}
        >
          Add handtrap
        </button>
      </div>
      {doc.handtraps.length === 0 ? (
        <p className="empty">No handtraps yet. Click a card above to add it.</p>
      ) : (
        doc.handtraps.map((handtrap) => (
          <HandtrapBlock key={handtrap.id} doc={doc} catalog={catalog} handtrap={handtrap} onChange={onChange} />
        ))
      )}

      <HitPriorityEditor doc={doc} catalog={catalog} onChange={onChange} />

      <h3 className="panel-subhead">Pairs the opponent holds together</h3>
      {doc.handtraps.length === 0 ? (
        <p className="empty">Add a handtrap to make a pair.</p>
      ) : (
        <div className="row-actions">
          <select aria-label="First handtrap" value={a} onChange={(event) => setFirst(event.target.value)}>
            {doc.handtraps.map((handtrap) => (
              <option key={handtrap.id} value={handtrap.id}>
                {handtrap.name}
              </option>
            ))}
          </select>
          <span>and</span>
          <select aria-label="Second handtrap" value={b} onChange={(event) => setSecond(event.target.value)}>
            {doc.handtraps.map((handtrap) => (
              <option key={handtrap.id} value={handtrap.id}>
                {handtrap.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => onChange(addHandtrapPair(doc, a, b))}>
            Save pair
          </button>
        </div>
      )}
      {doc.handtrap_pairs.length > 0 ? (
        <ul className="handtrap-pairs" aria-label="Saved pairs">
          {doc.handtrap_pairs.map((pair) => (
            <li key={pair.id}>
              <span>{pairLabel(pair, doc.handtraps)}</span>
              <button type="button" className="ghost" onClick={() => onChange(removeHandtrapPair(doc, pair.id))}>
                Remove pair
              </button>
            </li>
          ))}
        </ul>
      ) : null}

    </section>
  );
}
