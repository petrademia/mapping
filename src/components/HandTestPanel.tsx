import { useMemo, useState } from "react";
import { handVersus, scenariosFor } from "../lib/handtrapVersus";
import { analysisContextLabel, observedCards } from "../lib/analysisContext";
import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import { ContextChips } from "./AnalysisContextSelector";
import { Icon, PassMark } from "./IconButton";
import { CardFrame } from "./HandImages";
import { HandBoard } from "./HandBoard";
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
  /** The shuffled order of every copy in the deck, when one has been dealt. */
  order: readonly number[] | null;
  /** Choose going first or second (and the observation point) without leaving the tab. */
  onContext: (context: import("../lib/analysisContext").AnalysisContext) => void;
}

export function HandTestPanel({ doc, catalog, onHandSize, hand, order, onHandChange, onOrderChange: setOrder, onContext }: Props) {
  const setHand = onHandChange;
  const [opponent, setOpponent] = useState("");
  const [drawCount, setDrawCount] = useState(1);

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
    // Any hand size is fine here; only cards the deck cannot supply are a problem.
    return validateManualHand(doc.main, hand.card_counts, sample).filter(
      (issue) => issue.kind !== "wrong_size",
    );
  }, [doc.main, hand, sample]);

  const totalSelected = useMemo(() => {
    if (!hand) return 0;
    return Object.values(hand.card_counts).reduce((sum, count) => sum + count, 0);
  }, [hand]);

  // The shuffled order, while it is still the same deck; the built order otherwise.
  const deckOrder = useMemo(() => {
    const built = doc.main.flatMap((card) => Array<number>(card.quantity).fill(card.card_id));
    const key = (ids: readonly number[]): string => [...ids].sort((x, y) => x - y).join();
    return order && order.length === built.length && key(order) === key(built) ? order : built;
  }, [doc.main, order]);

  // New Hand shuffles the whole deck and deals the opening hand.
  function newHand(): void {
    const shuffled = shuffleDeck(doc.main);
    setOrder(shuffled);
    setHand(handFromOrder(shuffled, Math.min(sample, shuffled.length)));
  }

  // Draw takes the next cards off the top of the deck into the hand.
  function draw(count: number): void {
    const base = order && deckOrder === order ? order : shuffleDeck(doc.main);
    if (base !== order) setOrder([...base]);
    const counts = { ...(hand?.card_counts ?? {}) };
    const seen = new Map<number, number>();
    let left = count;
    for (const cardId of base) {
      if (left <= 0) break;
      const copy = seen.get(cardId) ?? 0;
      seen.set(cardId, copy + 1);
      if (copy >= (counts[cardId] ?? 0)) {
        counts[cardId] = (counts[cardId] ?? 0) + 1;
        left -= 1;
      }
    }
    setHand({ card_counts: counts, observed_cards: totalSelected + (count - left) });
  }

  // Shuffle mixes the deck again; the cards already in the hand stay in it.
  function reshuffle(): void {
    setOrder(shuffleDeck(doc.main));
  }

  function setCount(cardId: number, next: number): void {
    const counts = { ...(hand?.card_counts ?? {}) };
    if (next <= 0) delete counts[cardId];
    else counts[cardId] = next;
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    setHand(total === 0 ? null : { card_counts: counts, observed_cards: total });
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

      <div className="row-actions hand-actions">
        <button type="button" onClick={newHand} disabled={deck === 0}>
          <Icon name="redo" />
          New Hand
        </button>
        <span className="draw-group">
          <button type="button" onClick={() => draw(Math.max(1, drawCount))} disabled={deck === 0 || totalSelected >= deck}>
            <Icon name="plus" />
            Draw
          </button>
          <input
            type="number"
            min={1}
            max={Math.max(deck, 1)}
            value={drawCount}
            aria-label="Cards to draw"
            onChange={(event) => setDrawCount(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
          />
        </span>
        <button type="button" onClick={reshuffle} disabled={deck === 0}>
          <Icon name="shuffle" />
          Shuffle
        </button>
        <button type="button" onClick={() => {
            setOrder(null);
            setHand(null);
          }}
          disabled={!hand}
        >
          <Icon name="x" />
          Clear hand
        </button>
      </div>

      {doc.main.length === 0 ? (
        <p className="empty">Add Main Deck cards first.</p>
      ) : (
        <HandBoard
          deck={doc.main}
          counts={hand?.card_counts ?? {}}
          catalog={catalog}
          order={deckOrder}
          rankOf={(cardId) => rankScorer?.positionOf(cardId) ?? null}
          onCount={setCount}
        />
      )}

      {issues.some((issue) => issue.kind === "over_copy_limit" || issue.kind === "not_in_main") ? (
        <p className="error">
          The tested hand contains cards that are no longer in the Main Deck at
          that copy count. Adjust the selection.
        </p>
      ) : null}
      {hand && totalSelected !== sample ? (
        <p className="note">
          This hand has {totalSelected} cards; the opening hand is {sample}. The
          Hand Goal odds below are for the opening hand.
        </p>
      ) : null}

      {hand && result && issues.length === 0 ? (
        <>
          <h3 className="panel-subhead" id="tested-hand">Tested Hand</h3>
          <ul className="hand-facts">
            <li>
              <span>Rank score</span>
              <strong>{rankScorer ? `${(rankScorer.score(hand.card_counts) * 100).toFixed(0)}%` : "-"}</strong>
              <small>
                {rankScorer
                  ? `a random hand averages ${(rankScorer.expected(totalSelected) * 100).toFixed(0)}%${
                      ranked?.source === "impact" ? ", by Card Impact order" : ""
                    }`
                  : "Define a Hand Goal or rank your cards to score hands"}
              </small>
            </li>
            <li>
              <span>This exact hand</span>
              <strong>{exactProbability !== null ? formatPercent(exactProbability) : "-"}</strong>
              <small>chance of drawing exactly these cards</small>
            </li>
            <li>
              <span>Roles</span>
              <strong className="role-counts">
                {ROLES.map((role) => (
                  <span key={role} style={{ "--c": `var(--${role})` } as React.CSSProperties}>
                    {ROLE_LABELS[role]} {roleCounts[role]}
                  </span>
                ))}
              </strong>
              <small>one card can count in several</small>
            </li>
            {qualityCounts ? (
              <li>
                <span>Opening Quality, {context.turn_order === "going_first" ? "Going First" : "Going Second"}</span>
                <strong className="role-counts">
                  {QUALITY_LABELS.map((entry) => (
                    <span key={entry.key} style={{ "--c": `var(--${entry.key})` } as React.CSSProperties}>
                      {entry.label} {qualityCounts[entry.key]}
                    </span>
                  ))}
                </strong>
              </li>
            ) : null}
          </ul>

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
                      versus.get(set.setId)!.survives ? (
                        <span className="explorer-notation">Still holds against {scenario.label}</span>
                      ) : (
                        <span className="versus-broken">
                          <span className="explorer-notation">Broken by {scenario.label}, negating</span>
                          <MiniCards ids={versus.get(set.setId)!.negated} catalog={catalog} label="Negated cards" />
                        </span>
                      )
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

/** A row of small card art; names show on hover and are read out. */
function MiniCards({ ids, catalog, label }: { ids: readonly number[]; catalog: Catalog; label: string }) {
  return (
    <ul className="mini-cards" aria-label={label}>
      {ids.map((id, index) => {
        const name = displayName(id, undefined, catalog);
        return (
          <li key={`${id}-${index}`} title={name}>
            <CardFrame cardId={id} name={name} />
            <span className="visually-hidden">{name}</span>
          </li>
        );
      })}
    </ul>
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
      {evaluation.contributors.length > 0 ? (
        <MiniCards ids={evaluation.contributors} catalog={catalog} label="Contributing cards" />
      ) : null}
      {exclusion && evaluation.passed ? (
        <span className="explorer-notation hand-exclusion-reason">
          Exclusion matched → condition fails
        </span>
      ) : null}
    </div>
  );
}
