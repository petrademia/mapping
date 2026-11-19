import { useId, useState } from "react";
import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import { sectionSize, type MappingDocument } from "../lib/document";
import { copiesIn, drawOddsRows } from "../lib/drawOdds";

const percent = (value: number): string => `${(value * 100).toFixed(2)}%`;

/**
 * How likely a card, or any card of a Group, is to show up: the exact chance of at least 1, 2 and
 * 3 copies among the opening hand and each card drawn after it. Pure card counting; it does not
 * know what the card does.
 */
export function DrawOdds({ doc, catalog }: { doc: MappingDocument; catalog: Catalog }) {
  const selectId = useId();
  const [choice, setChoice] = useState("");
  const deck = sectionSize(doc.main);
  if (deck === 0) return null;

  const options = [
    ...doc.groups.map((group) => ({
      value: `group:${group.id}`,
      label: `Group: ${group.name || "Untitled group"}`,
      ids: new Set(group.card_ids),
    })),
    ...doc.main.map((card) => ({
      value: `card:${card.card_id}`,
      label: displayName(card.card_id, card.name, catalog),
      ids: new Set([card.card_id]),
    })),
  ];
  const picked = options.find((option) => option.value === choice) ?? options[0];
  if (!picked) return null;
  const copies = copiesIn(doc.main, picked.ids);
  const rows = drawOddsRows(deck, copies, doc.analysis.opening_hand_size);

  return (
    <section className="panel draw-odds" aria-label="Chance to draw">
      <header>
        <h2>Chance to draw</h2>
        <p className="note">
          {copies} {copies === 1 ? "copy" : "copies"} in {deck} cards
        </p>
      </header>
      <label htmlFor={selectId}>
        Card or Group
        <select id={selectId} value={picked.value} onChange={(event) => setChoice(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <table className="compare-table" aria-label="Chance to draw by cards seen">
        <thead>
          <tr>
            <th scope="col">Cards seen</th>
            <th scope="col">At least 1</th>
            <th scope="col">At least 2</th>
            <th scope="col">At least 3</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.seen}>
              <th scope="row">
                {row.seen}
                {index === 0 ? " (opening hand)" : ` (+${index} draw${index === 1 ? "" : "s"})`}
              </th>
              {row.atLeast.map((chance, i) => (
                <td key={i} className="num">
                  {percent(chance)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
