import { useMemo, useState } from "react";
import {
  analysisContextLabel,
  observedCards,
  sampleSizeDescription,
} from "../lib/analysisContext";
import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import {
  analysisContextOf,
  sectionSize,
  type MappingDocument,
} from "../lib/document";
import { groupsToMembership } from "../lib/handCondition";
import {
  analyzeHandConditions,
  type PredicateEvaluation,
} from "../lib/handExplorer";
import {
  drawRandomHand,
  evaluateHandTest,
  exactHandProbability,
  handOpeningQualityCounts,
  validateManualHand,
  type TestedHand,
} from "../lib/handTest";
import { ROLES } from "../lib/taxonomy";

const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  starter: "Starter",
  extender: "Extender",
  interaction: "Interaction",
};

const QUALITY_LABELS: { key: "desirable" | "neutral" | "undesirable" | "unclassified"; label: string }[] = [
  { key: "desirable", label: "Desirable" },
  { key: "neutral", label: "Neutral" },
  { key: "undesirable", label: "Undesirable" },
  { key: "unclassified", label: "Unclassified" },
];

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  onHandSize: (size: number) => void;
}

export function HandTestPanel({ doc, catalog, onHandSize }: Props) {
  const [hand, setHand] = useState<TestedHand | null>(null);
  const [filter, setFilter] = useState("");

  const deck = sectionSize(doc.main);
  const opening = doc.analysis.opening_hand_size;
  const context = analysisContextOf(doc);
  const sample = observedCards(context, opening);
  const groups = groupsToMembership(doc.groups);

  const analysis = useMemo(() => {
    if (deck === 0) return null;
    try {
      return analyzeHandConditions(
        doc.main,
        sample,
        doc.hand_conditions,
        doc.hand_condition_sets,
        groups,
      );
    } catch {
      return null;
    }
  }, [doc.main, doc.hand_conditions, doc.hand_condition_sets, groups, deck, sample]);

  const result = useMemo(() => {
    if (!hand) return null;
    return evaluateHandTest(
      doc.main,
      hand.card_counts,
      doc.hand_conditions,
      doc.hand_condition_sets,
      groups,
    );
  }, [doc.main, doc.hand_conditions, doc.hand_condition_sets, groups, hand]);

  const issues = useMemo(() => {
    if (!hand) return [];
    return validateManualHand(doc.main, hand.card_counts, sample);
  }, [doc.main, hand, sample]);

  const totalSelected = useMemo(() => {
    if (!hand) return 0;
    return Object.values(hand.card_counts).reduce((sum, count) => sum + count, 0);
  }, [hand]);

  function drawRandom(): void {
    setHand(drawRandomHand(doc.main, sample));
  }

  function setCount(cardId: number, next: number): void {
    setHand((current) => {
      const counts = { ...(current?.card_counts ?? {}) };
      if (next <= 0) {
        delete counts[cardId];
      } else {
        counts[cardId] = next;
      }
      return { card_counts: counts, observed_cards: sample };
    });
  }

  const needle = filter.trim().toLowerCase();
  const filteredCards = doc.main.filter((card) => {
    if (!needle) return true;
    const name = displayName(card.card_id, card.name, catalog).toLowerCase();
    return name.includes(needle) || String(card.card_id).includes(needle);
  });

  const roleCounts = useMemo(() => {
    if (!hand) return { starter: 0, extender: 0, interaction: 0 };
    const counts = { starter: 0, extender: 0, interaction: 0 };
    for (const card of doc.main) {
      const copies = hand.card_counts[card.card_id] ?? 0;
      if (copies === 0) continue;
      for (const role of card.taxonomy.roles) {
        counts[role] += copies;
      }
    }
    return counts;
  }, [doc.main, hand]);

  const exactProbability = useMemo(() => {
    if (!hand) return null;
    return exactHandProbability(doc.main, hand.card_counts, hand.observed_cards);
  }, [doc.main, hand]);

  const qualityCounts = useMemo(() => {
    if (!hand) return null;
    return handOpeningQualityCounts(
      doc.main,
      hand.card_counts,
      context.turn_order,
    );
  }, [doc.main, hand, context.turn_order]);

  return (
    <section className="panel">
      <header>
        <h2>Hand Test</h2>
        <label>
          Opening hand
          <input
            type="number"
            min={0}
            max={Math.max(deck, 0)}
            value={opening}
            onChange={(event) => onHandSize(Number(event.target.value))}
          />
        </label>
      </header>
      <p className="note">
        Evaluate one exact hand against the modeled Hand Conditions and
        Condition Sets under {analysisContextLabel(context, opening)} —{" "}
        {sampleSizeDescription(context, opening)}. A PASS means the
        human-authored model matches the hand, not that the line is verified to
        play through interruptions. Not a simulator; YAPPING owns strategy.
      </p>

      <div className="row-actions">
        <button type="button" onClick={drawRandom} disabled={deck === 0}>
          Draw Random Hand
        </button>
        <button type="button" onClick={drawRandom} disabled={!hand}>
          Draw Again
        </button>
      </div>

      <h3 className="panel-subhead">Select Manually</h3>
      <input
        type="search"
        value={filter}
        placeholder="Filter main deck…"
        aria-label="Filter cards for manual selection"
        onChange={(event) => setFilter(event.target.value)}
      />
      {doc.main.length === 0 ? (
        <p className="empty">Add main-deck cards first.</p>
      ) : (
        <ul className="hand-picker">
          {filteredCards.map((card) => {
            const count = hand?.card_counts[card.card_id] ?? 0;
            const canAdd =
              count < card.quantity && totalSelected < sample;
            return (
              <li key={card.card_id} className="hand-picker-row">
                <span className="explorer-title">
                  {displayName(card.card_id, card.name, catalog)} ×{card.quantity}
                </span>
                <span className="hand-stepper">
                  <button
                    type="button"
                    onClick={() => setCount(card.card_id, count - 1)}
                    disabled={count === 0}
                  >
                    −
                  </button>
                  <span className="hand-stepper-count">{count}</span>
                  <button
                    type="button"
                    onClick={() => setCount(card.card_id, count + 1)}
                    disabled={!canAdd}
                  >
                    +
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="empty hand-total">
        {totalSelected} / {sample} cards selected
      </p>

      {issues.some((issue) => issue.kind === "over_copy_limit" || issue.kind === "not_in_main") ? (
        <p className="error">
          The tested hand contains cards that are no longer in the Main Deck at
          that copy count. Adjust the selection.
        </p>
      ) : null}
      {hand && totalSelected !== sample ? (
        <p className="empty">
          Complete the hand to {sample} cards to evaluate.
        </p>
      ) : null}

      {hand && result && totalSelected === sample && issues.length === 0 ? (
        <>
          <h3 className="panel-subhead">Tested Hand</h3>
          <ul className="hand-cards">
            {doc.main.map((card) => {
              const count = hand.card_counts[card.card_id] ?? 0;
              if (count === 0) return null;
              return (
                <li key={card.card_id} className="hand-card">
                  <span className="explorer-title">
                    {displayName(card.card_id, card.name, catalog)} ×{count}
                  </span>
                  {card.taxonomy.roles.length > 0 ? (
                    <span className="explorer-notation">
                      {card.taxonomy.roles.map((role) => ROLE_LABELS[role]).join(", ")}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="explorer-notation">
            Exact composition probability:{" "}
            {exactProbability !== null ? formatPercent(exactProbability) : "—"}
          </p>
          <p className="explorer-notation">
            Role counts (raw taxonomy, one card can count in several):{" "}
            {ROLES.map(
              (role) => `${ROLE_LABELS[role]} ${roleCounts[role]}`,
            ).join(" · ")}
          </p>
          {qualityCounts ? (
            <p className="explorer-notation">
              Opening Quality ({context.turn_order === "going_first" ? "Going First" : "Going Second"}):{" "}
              {QUALITY_LABELS.map(
                (entry) =>
                  `${entry.label} ${qualityCounts[entry.key]}${
                    qualityCounts.contributors[entry.key].length > 0
                      ? ` (${qualityCounts.contributors[entry.key]
                          .map((id) => displayName(id, undefined, catalog))
                          .join(", ")})`
                      : ""
                  }`,
              ).join(" · ")}
            </p>
          ) : null}

          <h3 className="panel-subhead">Condition Sets</h3>
          {result.sets.length === 0 ? (
            <p className="empty">No condition sets defined.</p>
          ) : (
            <dl className="explorer-results">
              {result.sets.map((set) => (
                <div key={set.setId} className="explorer-row">
                  <dt>
                    <span
                      className={
                        set.passed ? "hand-pass-title" : "hand-fail-title"
                      }
                    >
                      {set.passed ? "✓" : "✗"} {set.name}
                    </span>
                    <span className="explorer-notation">
                      {set.passed
                        ? "Modeled condition satisfied"
                        : "Modeled condition not satisfied"}{" "}
                      · {set.satisfiedCount} / {set.memberCount} member{" "}
                      {set.memberCount === 1 ? "condition" : "conditions"}{" "}
                      satisfied
                    </span>
                  </dt>
                  <dd>{formatPercent(
                    analysis?.sets.find((row) => row.id === set.setId)?.union ?? 0,
                  )}</dd>
                </div>
              ))}
            </dl>
          )}

          <h3 className="panel-subhead">Hand Conditions</h3>
          {result.conditions.length === 0 ? (
            <p className="empty">No hand conditions defined.</p>
          ) : (
            result.conditions.map((evaluation) => {
              const population = analysis?.conditions.find(
                (row) => row.id === evaluation.conditionId,
              )?.probability;
              return (
                <div key={evaluation.conditionId} className="access-block">
                  <div className="access-block-head">
                    <span
                      className={
                        evaluation.passed ? "hand-pass-title" : "hand-fail-title"
                      }
                    >
                      {evaluation.passed ? "✓" : "✗"} {evaluation.name}
                    </span>
                    {population !== undefined ? (
                      <span className="explorer-notation">
                        Deck probability {formatPercent(population)}
                      </span>
                    ) : null}
                  </div>
                  {evaluation.requirements.length > 0 ? (
                    <p className="access-allof">Requires</p>
                  ) : null}
                  {evaluation.requirements.map((requirement, index) => (
                    <PredicateRow
                      key={`require-${evaluation.conditionId}-${index}`}
                      evaluation={requirement}
                      catalog={catalog}
                      doc={doc}
                    />
                  ))}
                  {evaluation.excludes.length > 0 ? (
                    <p className="access-allof access-excludes-label">Excludes</p>
                  ) : null}
                  {evaluation.excludes.map((exclusion, index) => (
                    <PredicateRow
                      key={`exclude-${evaluation.conditionId}-${index}`}
                      evaluation={exclusion}
                      catalog={catalog}
                      doc={doc}
                      exclusion
                    />
                  ))}
                </div>
              );
            })
          )}
        </>
      ) : null}
    </section>
  );
}

function PredicateRow({
  evaluation,
  catalog,
  doc,
  exclusion = false,
}: {
  evaluation: PredicateEvaluation;
  catalog: Catalog;
  doc: MappingDocument;
  exclusion?: boolean;
}) {
  const predicate = evaluation.predicate;
  const subject =
    predicate.kind === "card"
      ? displayName(predicate.card_id, undefined, catalog)
      : predicate.kind === "role"
        ? ROLE_LABELS[predicate.role]
        : doc.groups.find((group) => group.id === predicate.group_id)?.name ??
          predicate.group_id;
  const contributorNames = evaluation.contributors.map((cardId) =>
    displayName(cardId, undefined, catalog),
  );
  const opLabel =
    predicate.op === "eq"
      ? "="
      : predicate.op === "neq"
        ? "≠"
        : predicate.op === "gte"
          ? "≥"
          : predicate.op === "lte"
            ? "≤"
            : predicate.op === "gt"
              ? ">"
              : "<";
  const text = `${subject} ${opLabel} ${predicate.count}`;

  return (
    <div
      className={
        exclusion && evaluation.passed
          ? "predicate-row predicate-exclusion"
          : "predicate-row"
      }
    >
      <span className={evaluation.passed ? "hand-pass" : "hand-fail"}>
        {evaluation.passed ? "✓" : "✗"} {text}
      </span>
      <span className="explorer-notation">actual: {evaluation.actualCount}</span>
      {contributorNames.length > 0 ? (
        <span className="explorer-notation">
          contributing: {contributorNames.join(", ")}
        </span>
      ) : null}
      {exclusion && evaluation.passed ? (
        <span className="explorer-notation hand-exclusion-reason">
          Exclusion matched → condition fails
        </span>
      ) : null}
    </div>
  );
}
