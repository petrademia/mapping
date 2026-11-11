import { useMemo, useState } from "react";
import { handVersus, scenariosFor } from "../lib/handtrapVersus";
import { analysisContextLabel, observedCards } from "../lib/analysisContext";
import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import { ContextChips } from "./AnalysisContextSelector";
import { PassMark } from "./IconButton";
import { scorerWithSource } from "../lib/rankScore";
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
import type { DistinctMatchEvaluation } from "../lib/distinctMatch";
import {
  handFromOrder,
  shuffleDeck,
  evaluateHandTest,
  exactHandProbability,
  handOpeningQualityCounts,
  validateManualHand,
  type TestedHand,
} from "../lib/handTest";
import { modelsAnalysisKey } from "../lib/modelsAnalysisKey";
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
  { key: "unclassified", label: "Not set" },
];

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  onHandSize: (size: number) => void;
  /** The tested hand lives in the app so the Batch Test tab can open hands here. */
  hand: TestedHand | null;
  onHandChange: (hand: TestedHand | null) => void;
  /** The shuffled order behind the drawn hand lives in the app. */
  onOrderChange: (order: number[] | null) => void;
  /** Choose going first or second (and the observation point) without leaving the tab. */
  onContext: (context: import("../lib/analysisContext").AnalysisContext) => void;
}

export function HandTestPanel({ doc, catalog, onHandSize, hand, onHandChange, onOrderChange: setOrder, onContext }: Props) {
  const setHand = onHandChange;
  const [opponent, setOpponent] = useState("");

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

  const result = useMemo(() => {
    if (!hand) return null;
    return evaluateHandTest(
      doc.main,
      hand.card_counts,
      doc.hand_conditions,
      doc.hand_condition_sets,
      groupsToMembership(doc.groups),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- structural fingerprint
  }, [analysisKey, hand]);

  // The opponent's handtraps, from the Handtraps tab: one handtrap or a saved pair.
  const scenarios = useMemo(() => scenariosFor(doc), [doc.handtraps, doc.handtrap_pairs]);
  const scenario = scenarios.find((entry) => entry.id === opponent) ?? null;
  const versus = useMemo(() => {
    if (!hand || !scenario) return null;
    return new Map(handVersus(doc, hand.card_counts, scenario.handtrapIds).map((goal) => [goal.setId, goal]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the doc parts the result reads
  }, [hand, scenario, doc.main, doc.groups, doc.hand_conditions, doc.hand_condition_sets, doc.handtraps]);

  const issues = useMemo(() => {
    if (!hand) return [];
    return validateManualHand(doc.main, hand.card_counts, sample);
  }, [doc.main, hand, sample]);

  const totalSelected = useMemo(() => {
    if (!hand) return 0;
    return Object.values(hand.card_counts).reduce((sum, count) => sum + count, 0);
  }, [hand]);

  // Drawing shuffles the whole deck on screen and boxes the top cards.
  function drawRandom(): void {
    const shuffled = shuffleDeck(doc.main);
    setOrder(shuffled);
    setHand(handFromOrder(shuffled, Math.min(sample, shuffled.length)));
  }

  // A goal with no conditions can match nothing, so it is left out of the results.
  const emptyGoals = useMemo(
    () => new Set(doc.hand_condition_sets.filter((set) => set.condition_ids.length === 0).map((set) => set.id)),
    [doc.hand_condition_sets],
  );
  const ranked = useMemo(
    () => scorerWithSource(doc, context.turn_order),
    [doc, context.turn_order],
  );
  const rankScorer = ranked?.scorer ?? null;

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
    <section className="panel" id="hand-test-top">
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
        Check hands against your Hand Conditions and Hand Goals. Hands are
        drawn for {analysisContextLabel(context, opening)}. A check mark means
        your model matches the hand; it does not test that the line plays out.
      </p>

      <ContextChips context={context} openingHandSize={opening} onChange={onContext} />

      {scenarios.length > 0 ? (
        <label>
          Opponent holds
          <select value={scenario?.id ?? ""} onChange={(event) => setOpponent(event.target.value)}>
            <option value="">Nothing</option>
            {scenarios.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="row-actions">
        <button type="button" onClick={drawRandom} disabled={deck === 0}>
          Draw Random Hand
        </button>
        <button type="button" onClick={drawRandom} disabled={!hand}>
          Draw Again
        </button>
        <button type="button" onClick={() => {
            setOrder(null);
            setHand(null);
          }}
          disabled={!hand}
        >
          Clear hand
        </button>
      </div>

      {doc.main.length === 0 ? (
        <p className="empty">Add Main Deck cards first.</p>
      ) : (
        <p className="note">
          Your Main Deck on the left is shuffled and the hand is boxed. Click a
          card there to add it to the hand or take it out.
        </p>
      )}

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
          <h3 className="panel-subhead" id="tested-hand">Tested Hand</h3>
          <p className="explorer-notation">
            {rankScorer
              ? `Rank score: ${(rankScorer.score(hand.card_counts) * 100).toFixed(0)}% (a random hand averages ${(rankScorer.expected(sample) * 100).toFixed(0)}%)`
              : "Define a Hand Goal or rank your cards in the Rank tab to score hands."}
            {ranked?.source === "impact" ? " Using Card Impact order until you rank your cards." : ""}
          </p>
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

          <h3 className="panel-subhead">Hand Goals</h3>
          {result.sets.filter((set) => emptyGoals.has(set.setId) === false).length === 0 ? (
            <p className="empty">No Hand Goals yet. Create them in Models.</p>
          ) : (
            <dl className="explorer-results">
              {result.sets.filter((set) => emptyGoals.has(set.setId) === false).map((set) => (
                <div key={set.setId} className="explorer-row">
                  <dt>
                    <span
                      className={
                        set.passed ? "hand-pass-title" : "hand-fail-title"
                      }
                    >
                      <PassMark passed={set.passed} /> {set.name}
                    </span>
                    <span className="explorer-notation">
                      {set.passed ? "Matched" : "Not matched"} ·{" "}
                      {set.satisfiedCount} of {set.memberCount} Hand{" "}
                      {set.memberCount === 1 ? "Condition" : "Conditions"}
                    </span>
                    {scenario && set.passed && versus?.get(set.setId) ? (
                      <span className="explorer-notation">
                        {versus.get(set.setId)!.survives
                          ? `Still holds against ${scenario.label}`
                          : `Broken by ${scenario.label}: ${versus
                              .get(set.setId)!
                              .negated.map((id) => displayName(id, undefined, catalog))
                              .join(" and ")} negated`}
                      </span>
                    ) : null}
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
            <p className="empty">No Hand Conditions defined.</p>
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
                      <PassMark passed={evaluation.passed} /> {evaluation.name}
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
                  {evaluation.distinct_constraints.length > 0 ? (
                    <p className="access-allof">Distinct-card requirement</p>
                  ) : null}
                  {evaluation.distinct_constraints.map((constraint) => (
                    <DistinctRow
                      key={constraint.constraintId}
                      evaluation={constraint}
                      catalog={catalog}
                      doc={doc}
                      requirements={evaluation.requirements}
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

function DistinctRow({
  evaluation,
  catalog,
  doc,
  requirements,
}: {
  evaluation: DistinctMatchEvaluation;
  catalog: Catalog;
  doc: MappingDocument;
  requirements: readonly PredicateEvaluation[];
}) {
  function labelFor(requirementId: string): string {
    const requirement = requirements.find(
      (row) => row.predicate.id === requirementId,
    )?.predicate;
    if (!requirement) return requirementId;
    const subject =
      requirement.kind === "card"
        ? displayName(requirement.card_id, undefined, catalog)
        : requirement.kind === "role"
          ? ROLE_LABELS[requirement.role]
          : doc.groups.find((group) => group.id === requirement.group_id)?.name ??
            requirement.group_id;
    return subject;
  }

  return (
    <div className="predicate-row">
      <span className={evaluation.passed ? "hand-pass" : "hand-fail"}>
        <PassMark passed={evaluation.passed} />{" "}
        {evaluation.requirement_ids.map(labelFor).join(" and ")} require
        different card names
      </span>
      {Object.keys(evaluation.eligible).length > 0 ? (
        <span className="explorer-notation">
          available matches:{" "}
          {evaluation.requirement_ids
            .map((id) => {
              const names = (evaluation.eligible[id] ?? []).map((cardId) =>
                displayName(cardId, undefined, catalog),
              );
              return `${labelFor(id)}: ${names.length > 0 ? names.join(", ") : "—"}`;
            })
            .join("; ")}
        </span>
      ) : null}
      {evaluation.assignment ? (
        <span className="explorer-notation">
          assignment:{" "}
          {Object.entries(evaluation.assignment)
            .map(
              ([requirementId, cardId]) =>
                `${labelFor(requirementId)} → ${displayName(cardId, undefined, catalog)}`,
            )
            .join("; ")}
        </span>
      ) : evaluation.detail ? (
        <span className="explorer-notation">{evaluation.detail}</span>
      ) : null}
    </div>
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
        <PassMark passed={evaluation.passed} /> {text}
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
