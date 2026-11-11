import { useEffect, useMemo, useState } from "react";
import { analysisContextLabel, observedCards } from "../lib/analysisContext";
import type { Catalog } from "../lib/catalog";
import { analysisContextOf, sectionSize, type MappingDocument } from "../lib/document";
import { groupsToMembership } from "../lib/handCondition";
import { analyzeHandConditions } from "../lib/handExplorer";
import {
  generateHandBatch,
  MAX_BATCH_HANDS,
  summarizeBatch,
  type BatchHand,
} from "../lib/handBatch";
import type { TestedHand } from "../lib/handTest";
import { modelsAnalysisKey } from "../lib/modelsAnalysisKey";
import { HandImages } from "./HandImages";
import { ContextChips } from "./AnalysisContextSelector";
import { PassMark } from "./IconButton";
import { scorerWithSource } from "../lib/rankScore";

const LIST_LIMIT = 100;

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  /** Load a generated hand into the single-hand tester and switch to it. */
  onOpenInTester: (hand: TestedHand) => void;
  /** Choose going first or second (and the observation point) without leaving the tab. */
  onContext: (context: import("../lib/analysisContext").AnalysisContext) => void;
}

/**
 * Many random hands at once, on their own tab: how many hands each Hand Goal
 * matches next to its exact probability, and a card-art row per hand. One hand
 * at a time lives on the Hand Test tab, where the whole Main Deck is shown.
 */
export function HandBatchPanel({ doc, catalog, onOpenInTester, onContext }: Props) {
  const [count, setCount] = useState("10");
  const [batch, setBatch] = useState<BatchHand[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Sort the list by rank score to check the score against your own sense of good hands.
  const [sortBy, setSortBy] = useState<"generated" | "high" | "low">("generated");

  const deck = sectionSize(doc.main);
  const opening = doc.analysis.opening_hand_size;
  const context = analysisContextOf(doc);
  const sample = observedCards(context, opening);
  const analysisKey = modelsAnalysisKey({
    main: doc.main,
    groups: doc.groups,
    hand_conditions: doc.hand_conditions,
    hand_condition_sets: doc.hand_condition_sets,
    sample,
    turn_order: context.turn_order,
    engine_access_set_id: doc.engine_access_set_id,
  });

  const analysis = useMemo(() => {
    if (deck === 0) return null;
    try {
      return analyzeHandConditions(
        doc.main,
        sample,
        doc.hand_conditions,
        doc.hand_condition_sets,
        groupsToMembership(doc.groups),
        context.turn_order,
      );
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- structural fingerprint
  }, [analysisKey, deck]);

  // A batch describes one deck and model; drop it when either changes.
  useEffect(() => {
    setBatch(null);
    setError(null);
  }, [analysisKey, deck]);

  function generate(): void {
    try {
      setBatch(
        generateHandBatch(
          doc.main,
          sample,
          Number(count),
          doc.hand_conditions,
          doc.hand_condition_sets,
          groupsToMembership(doc.groups),
        ),
      );
      setError(null);
    } catch (caught) {
      setBatch(null);
      setError(caught instanceof Error ? caught.message : "Could not generate hands");
    }
  }

  // A goal with no conditions can match nothing, so it is left out of the results.
  const withConditions = useMemo(
    () => new Set(doc.hand_condition_sets.filter((set) => set.condition_ids.length > 0).map((set) => set.id)),
    [doc.hand_condition_sets],
  );
  const summary = useMemo(() => (batch ? summarizeBatch(batch) : null), [batch]);
  const ranked = useMemo(
    () => scorerWithSource(doc, context.turn_order),
    [doc, context.turn_order],
  );
  const scorer = ranked?.scorer ?? null;
  const averageRank = useMemo(() => {
    if (!batch || !scorer || batch.length === 0) return null;
    const total = batch.reduce((sum, entry) => sum + scorer.score(entry.hand.card_counts), 0);
    return total / batch.length;
  }, [batch, scorer]);

  const shown = useMemo(() => {
    if (!batch) return [];
    if (!scorer || sortBy === "generated") return batch;
    const scored = batch.map((entry) => ({ entry, value: scorer.score(entry.hand.card_counts) }));
    scored.sort((a, b) => (sortBy === "high" ? b.value - a.value : a.value - b.value) || a.entry.index - b.entry.index);
    return scored.map((item) => item.entry);
  }, [batch, scorer, sortBy]);

  return (
    <section className="panel">
      <header>
        <h2>Batch Test</h2>
        <p>{analysisContextLabel(context, opening)}</p>
      </header>
      <p className="note">
        Draw several random hands at once and see how many match each Hand
        Goal. The exact probability is shown for comparison; a small batch will
        not match it exactly. Open any hand in Hand Test to look at it closely.
      </p>
      <ContextChips context={context} openingHandSize={opening} onChange={onContext} />
      <div className="row-actions hand-batch-controls">
        <label>
          Number of hands
          <input
            type="number"
            min={1}
            max={MAX_BATCH_HANDS}
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
        </label>
        {[10, 50, 100].map((preset) => (
          <button key={preset} type="button" onClick={() => setCount(String(preset))}>
            {preset}
          </button>
        ))}
        <button type="button" className="primary" onClick={generate} disabled={deck === 0}>
          Generate hands
        </button>
        <button
          type="button"
          onClick={() => {
            setBatch(null);
            setError(null);
          }}
          disabled={!batch && !error}
        >
          Clear hands
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {deck === 0 ? <p className="empty">Add Main Deck cards first.</p> : null}
      {batch && summary ? (
        <>
          <dl className="explorer-results" aria-label="Batch results">
            {summary.sets.filter((set) => withConditions.has(set.id)).length === 0 ? (
              <p className="empty">Define a Hand Goal to see pass rates.</p>
            ) : (
              summary.sets.filter((set) => withConditions.has(set.id)).map((set) => (
                <div key={set.id} className="explorer-row">
                  <dt>
                    {set.name}
                    <span className="explorer-notation">
                      {set.passed} of {summary.count} hands · exact{" "}
                      {formatPercent(analysis?.sets.find((row) => row.id === set.id)?.union ?? 0)}
                    </span>
                  </dt>
                  <dd>{formatPercent(set.rate)}</dd>
                </div>
              ))
            )}
          </dl>
          {scorer ? (
            <p className="explorer-notation">
              Average rank score {averageRank !== null ? `${(averageRank * 100).toFixed(1)}%` : "-"} over{" "}
              {batch.length} hands; the exact average is {(scorer.expected(sample) * 100).toFixed(1)}%.
              {ranked?.source === "impact" ? " Scored by Card Impact order until you rank your cards." : ""}
            </p>
          ) : (
            <p className="explorer-notation">Define a Hand Goal or rank your cards in the Rank tab to score these hands.</p>
          )}
          {scorer ? (
            <label className="hand-batch-sort">
              Order
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}>
                <option value="generated">As generated</option>
                <option value="high">Highest rank score first</option>
                <option value="low">Lowest rank score first</option>
              </select>
            </label>
          ) : null}
          <ol className="hand-batch-list">
            {shown.slice(0, LIST_LIMIT).map((entry) => (
              <li key={entry.index} className="hand-batch-item">
                <div className="hand-batch-head">
                  <strong>Hand {entry.index}</strong>
                  {scorer ? (
                    <span className="hand-rank-score">
                      Rank {(scorer.score(entry.hand.card_counts) * 100).toFixed(0)}%
                    </span>
                  ) : null}
                  <span className="hand-batch-sets">
                    {entry.result.sets.filter((set) => withConditions.has(set.setId)).map((set) => (
                      <span
                        key={set.setId}
                        className={set.passed ? "hand-pass-title" : "hand-fail-title"}
                      >
                        <PassMark passed={set.passed} /> {set.name}
                      </span>
                    ))}
                  </span>
                  <button type="button" onClick={() => onOpenInTester(entry.hand)}>
                    Open in Hand Test
                  </button>
                </div>
                <HandImages
                  deck={doc.main}
                  counts={entry.hand.card_counts}
                  catalog={catalog}
                  size="sm"
                />
              </li>
            ))}
          </ol>
          {batch.length > LIST_LIMIT ? (
            <p className="empty">
              Showing the first {LIST_LIMIT} of {batch.length} hands; the pass
              rates above count all of them.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
