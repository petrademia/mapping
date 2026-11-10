import { useMemo, useState } from "react";
import type { Catalog } from "../lib/catalog";
import {
  inheritModels,
  mainDifferences,
  scoreDeck,
  type DeckScore,
  type DeckScoreResult,
} from "../lib/compareDecks";
import {
  documentFromParsed,
  parseMappingJson,
  type MappingDocument,
} from "../lib/document";
import { parseDeckText } from "../lib/ydk";
import { isRanked, rankFor } from "../lib/cardRank";
import { ClearButton } from "./ClearButton";
import { CardStrip } from "./ModelArt";

interface Props {
  /** The deck being edited, with its active configuration applied. */
  doc: MappingDocument;
  catalog: Catalog;
  /** Replace the edited deck with the compared one. */
  onUse: (deck: MappingDocument) => void;
}

const percent = (value: number): string => `${(value * 100).toFixed(2)}%`;

function points(delta: number): string {
  const value = (delta * 100).toFixed(2);
  return delta > 0 ? `+${value} pts` : delta < 0 ? `${value.replace("-", "−")} pts` : "same";
}

/** Reads a deck from a .ydk, a pasted list file, or a saved mapping. */
function parseDeckFile(text: string, filename: string): MappingDocument {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return parseMappingJson(trimmed);
  const name = filename.replace(/\.(ydk|txt|json)$/i, "") || "other deck";
  return documentFromParsed(name, parseDeckText(trimmed), new Map());
}

interface Row {
  label: string;
  a: string;
  b: string;
  detailA?: string;
  detailB?: string;
  /** B minus A, in the metric's own unit; sign decides who is ahead. */
  delta: number;
  text: string;
  /** True when a higher number is better. */
  higherIsBetter: boolean;
  /** No side is better (deck size): shown without gain or loss colour. */
  neutral?: boolean;
}

function DeltaCell({ row }: { row: Row }) {
  const better = row.delta === 0 || row.neutral ? 0 : row.higherIsBetter ? Math.sign(row.delta) : -Math.sign(row.delta);
  return (
    <td className={better > 0 ? "delta gain" : better < 0 ? "delta loss" : "delta"}>
      {row.text}
      <span className="visually-hidden">
        {better > 0 ? ", the compared deck is ahead" : better < 0 ? ", this deck is ahead" : ""}
      </span>
    </td>
  );
}

function CompareTable({ caption, rows }: { caption: string; rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <table className="compare-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Measure</th>
          <th scope="col">This deck</th>
          <th scope="col">Compared</th>
          <th scope="col">Change</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td className="num">
              {row.a}
              {row.detailA ? <span className="odds-fraction">{row.detailA}</span> : null}
            </td>
            <td className="num">
              {row.b}
              {row.detailB ? <span className="odds-fraction">{row.detailB}</span> : null}
            </td>
            <DeltaCell row={row} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function rowsFor(a: DeckScore, b: DeckScore) {
  const fraction = (weight: bigint, total: bigint) =>
    `${weight.toLocaleString("en-US")} / ${total.toLocaleString("en-US")}`;
  const goalRows: Row[] = a.goals.map((goal) => {
    const other = b.goals.find((item) => item.id === goal.id);
    const bp = other?.probability ?? 0;
    return {
      label: goal.name || "Untitled hand goal",
      a: percent(goal.probability),
      b: percent(bp),
      detailA: fraction(goal.weight, a.total),
      detailB: fraction(other?.weight ?? 0n, b.total),
      delta: bp - goal.probability,
      text: points(bp - goal.probability),
      higherIsBetter: true,
    };
  });
  const consistency: Row[] = [
    {
      label: "Matches a Hand Condition",
      a: percent(a.anyMatch),
      b: percent(b.anyMatch),
      delta: b.anyMatch - a.anyMatch,
      text: points(b.anyMatch - a.anyMatch),
      higherIsBetter: true,
    },
    {
      label: "Brick (matches none)",
      a: percent(a.brick),
      b: percent(b.brick),
      delta: b.brick - a.brick,
      text: points(b.brick - a.brick),
      higherIsBetter: false,
    },
    {
      label: "Matches two or more",
      a: percent(a.overlap),
      b: percent(b.overlap),
      delta: b.overlap - a.overlap,
      text: points(b.overlap - a.overlap),
      higherIsBetter: true,
    },
  ];
  const count = (label: string, x: number, y: number, higherIsBetter: boolean, neutral = false): Row => ({
    neutral,
    label,
    a: String(x),
    b: String(y),
    delta: y - x,
    text: y === x ? "same" : `${y - x > 0 ? "+" : "−"}${Math.abs(y - x)}`,
    higherIsBetter,
  });
  const mix: Row[] = [
    count("Starter copies", a.roles.starter, b.roles.starter, true),
    count("Extender copies", a.roles.extender, b.roles.extender, true),
    count("Interaction copies", a.roles.interaction, b.roles.interaction, true),
    count("Desirable copies", a.quality.desirable, b.quality.desirable, true),
    count("Undesirable copies", a.quality.undesirable, b.quality.undesirable, false),
    count("Main Deck size", a.mainSize, b.mainSize, false, true),
  ];
  const rank: Row[] =
    a.rankScore !== null && b.rankScore !== null
      ? [
          {
            label: "Average hand rank score",
            a: percent(a.rankScore),
            b: percent(b.rankScore),
            delta: b.rankScore - a.rankScore,
            text: points(b.rankScore - a.rankScore),
            higherIsBetter: true,
          },
        ]
      : [];
  return { goalRows, consistency, mix, rank };
}

/**
 * Two decks measured with one yardstick: this deck's Groups, Hand Conditions
 * and Hand Goals. Load another deck and see which one reaches your goals more
 * often, which bricks less, and which cards make the difference.
 */
export function ComparePanel({ doc, catalog, onUse }: Props) {
  const [other, setOther] = useState<MappingDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compared = useMemo(() => (other ? inheritModels(doc, other) : null), [doc, other]);
  // Both decks are judged by this deck's ranking for the compared turn order.
  const ranking = useMemo(() => {
    const turn = doc.analysis.turn_order;
    return isRanked(doc, turn) ? rankFor(doc, turn) : null;
  }, [doc]);
  const scores = useMemo<{ a: DeckScoreResult; b: DeckScoreResult | null }>(
    () => ({
      a: scoreDeck(doc, ranking),
      b: compared ? scoreDeck(compared, ranking) : null,
    }),
    [doc, compared, ranking],
  );
  const diff = useMemo(() => (compared ? mainDifferences(doc, compared) : []), [doc, compared]);
  const added = diff.filter((row) => row.delta > 0).map((row) => row.card_id);
  const dropped = diff.filter((row) => row.delta < 0).map((row) => row.card_id);
  const everyone = [...doc.main, ...(compared?.main ?? [])];

  const a = scores.a;
  const b = scores.b;
  const ready = b !== null && !("error" in a) && !("error" in b);
  const noGoals = !("error" in a) && a.goals.length === 0;

  return (
    <section className="panel compare-panel" id="compare-top">
      <header>
        <h2>Compare decks</h2>
      </header>
      <p className="note">
        Load another deck (a .ydk or a saved mapping). Both decks are measured
        with this deck's Groups, Hand Conditions and Hand Goals, and the other
        deck borrows this deck's roles for the cards they share.
      </p>
      <div className="row-actions">
        <label className="file-button">
          Load a deck to compare
          <input
            type="file"
            accept=".ydk,.txt,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void file.text().then((text) => {
                try {
                  setOther(parseDeckFile(text, file.name));
                  setError(null);
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "Could not read that deck.");
                }
              });
            }}
          />
        </label>
        {other ? (
          <>
            <button type="button" onClick={() => setOther(null)}>
              Stop comparing
            </button>
            <ClearButton
              label="Use compared deck"
              confirmLabel="Replace"
              message="Replace this deck with the compared deck? Your Groups and Hand Goals are kept."
              onConfirm={() => {
                if (compared) onUse(compared);
                setOther(null);
              }}
            />
          </>
        ) : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
      {!other ? <p className="empty">No deck loaded to compare.</p> : null}
      {noGoals && other ? (
        <p className="empty">
          This deck has no Hand Goal with conditions yet, so only the slot counts
          can be compared. Define a Hand Goal in Models to compare odds.
        </p>
      ) : null}
      {"error" in a ? <p className="error">{a.error}</p> : null}
      {b && "error" in b ? <p className="error">The compared deck: {b.error}</p> : null}

      {ready && b && !("error" in a) && !("error" in b) ? (
        <div className="compare-results" aria-label="Comparison">
          <p className="compare-names">
            <strong>{a.name || "This deck"}</strong> against <strong>{b.name || "Compared deck"}</strong>
            {" · "}first {a.sample} cards
          </p>
          {(() => {
            const rows = rowsFor(a, b);
            return (
              <>
                <CompareTable caption="Hand Goal odds" rows={rows.goalRows} />
                {rows.goalRows.length > 0 ? (
                  <CompareTable caption="Consistency" rows={rows.consistency} />
                ) : null}
                <CompareTable caption="Rank" rows={rows.rank} />
                {rows.rank.length === 0 ? (
                  <p className="note">
                    Rank your cards in the Rank tab to compare how good each deck's
                    average hand is by your own ranking.
                  </p>
                ) : null}
                <CompareTable caption="Slots" rows={rows.mix} />
              </>
            );
          })()}
          <h3 className="panel-subhead">Cards that differ</h3>
          {diff.length === 0 ? (
            <p className="empty">The two Main Decks hold the same cards.</p>
          ) : (
            <>
              <p className="note">The compared deck adds ({added.length})</p>
              <CardStrip cardIds={added} deck={everyone} catalog={catalog} max={20} label="Cards the compared deck adds" />
              <p className="note">and drops ({dropped.length})</p>
              <CardStrip cardIds={dropped} deck={everyone} catalog={catalog} max={20} label="Cards the compared deck drops" />
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
