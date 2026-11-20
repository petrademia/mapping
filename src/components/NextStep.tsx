import { useMemo } from "react";
import { observedCards } from "../lib/analysisContext";
import { sectionSize, type MappingDocument } from "../lib/document";
import { groupsToMembership } from "../lib/handCondition";
import { useHandAnalysis } from "../lib/useHandAnalysis";
import { modelsAnalysisKey } from "../lib/modelsAnalysisKey";
import { TURN_CONTEXTS } from "../lib/scorecard";
import { rolesForTurn } from "../lib/turnRoles";
import { useGoalSurvival } from "../lib/useGoalSurvival";

interface Props {
  doc: MappingDocument;
  onDefineGoal: () => void;
  onTestHand: () => void;
}


/** The one thing to do next, in a sentence with a single button. */
export function NextStep({ doc, onDefineGoal, onTestHand }: Props) {
  const cards = sectionSize(doc.main);
  const hasGoal = doc.hand_condition_sets.some((set) => set.condition_ids.length > 0);
  if (cards === 0) {
    return (
      <section className="panel next-step" aria-label="Next step">
        <h2>Add your deck</h2>
        <p>Search for a card above, load a .ydk file, or paste a deck list.</p>
      </section>
    );
  }
  return (
    <section className="panel next-step" aria-label="Next step">
      <h2>{hasGoal ? "Test a hand" : "Define a Hand Goal"}</h2>
      <p>
        {hasGoal
          ? "Draw a random hand and see whether it matches your goals."
          : "The opening hand you want. The odds appear as soon as you define one."}
      </p>
      <button type="button" className="primary" onClick={hasGoal ? onTestHand : onDefineGoal}>
        {hasGoal ? "Test a hand" : "Define a Hand Goal"}
      </button>
    </section>
  );
}

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

const ORDERS = [
  { key: "first", turnOrder: "going_first", title: "Going first" },
  { key: "second", turnOrder: "going_second", title: "Going second" },
] as const;

/**
 * The odds of every Hand Goal for one turn order, and how many interruptions each can take. The
 * deck reads as it does in that turn order, so a "going second only" tag counts going second only.
 */
function useTurnOrderOdds(doc: MappingDocument, order: (typeof ORDERS)[number]) {
  const sample = observedCards(TURN_CONTEXTS[order.key], doc.analysis.opening_hand_size);
  const deck = sectionSize(doc.main);
  const main = useMemo(() => rolesForTurn(doc.main, order.turnOrder), [doc.main, order.turnOrder]);
  const key = modelsAnalysisKey({
    main,
    groups: doc.groups,
    hand_conditions: doc.hand_conditions,
    hand_condition_sets: doc.hand_condition_sets,
    sample,
    turn_order: order.turnOrder,
    engine_access_set_id: doc.engine_access_set_id,
  });
  const usable = deck > 0 && sample <= deck;
  // Worked out in Web Workers; the previous odds stay on screen, dimmed, while a new edit is counted.
  const odds = useHandAnalysis(
    key,
    !usable
      ? null
      : {
          main,
          sample,
          conditions: doc.hand_conditions,
          sets: doc.hand_condition_sets,
          groups: groupsToMembership(doc.groups),
          turnOrder: order.turnOrder,
        },
  );
  const survival = useGoalSurvival(
    `${key}|${JSON.stringify(doc.choke_point_group_ids)}`,
    usable ? { doc, turnOrder: order.turnOrder } : null,
  );
  return { sample, usable, odds, survival };
}

/**
 * Each Hand Goal's chance, going first and going second side by side, with the exact hand count
 * underneath so it can be checked, and how often it still holds after 1 and after 2 interruptions.
 */
export function GoalOdds({ doc, onOpenScorecard }: { doc: MappingDocument; onOpenScorecard?: () => void }) {
  const first = useTurnOrderOdds(doc, ORDERS[0]);
  const second = useTurnOrderOdds(doc, ORDERS[1]);
  const turns = [first, second];

  const goals = doc.hand_condition_sets.filter((set) => set.condition_ids.length > 0);
  const anyAnalysis = turns.some((turn) => turn.odds.analysis !== undefined);
  // Before the first count arrives the panel is already there, with every goal named and its
  // numbers still to come, so the panels below it do not jump when the odds fill in.
  const counting = !anyAnalysis && goals.length > 0 && turns.some((turn) => turn.usable);
  if (goals.length === 0 || (!counting && !anyAnalysis)) return null;
  const pending = turns.some((turn) => turn.odds.pending || turn.survival.pending);

  return (
    <section className="panel goal-odds" aria-label="Hand Goal odds" aria-busy={pending || counting}>
      <header>
        <h2>Hand Goals</h2>
      </header>
      <p className="note">
        Exact chance of each goal. "After 1 stop" and "after 2" mean the opponent stops the card in your hand that
        hurts most.
      </p>
      <div className="goal-odds-scroll">
        <table className="goal-odds-table" aria-label="Hand Goal odds by turn order">
          <colgroup>
            <col className="goal-odds-name-col" />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Hand Goal</th>
              {ORDERS.map((order, index) => (
                <th key={order.key} scope="col">
                  {order.title} <span className="explorer-notation">{turns[index]!.sample} cards</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {goals.map((goal) => (
              <tr key={goal.id}>
                <th scope="row" className="odds-name">
                  {goal.name || "Untitled hand goal"}
                </th>
                {turns.map((turn, index) => {
                  const row = turn.odds.analysis?.sets.find((set) => set.id === goal.id);
                  const survival =
                    turn.survival.result && "survival" in turn.survival.result
                      ? turn.survival.result.survival[goal.id]
                      : undefined;
                  return (
                    <td key={ORDERS[index]!.key} className="odds-value">
                      <span className="odds-percent">{row ? percent(row.union) : "-"}</span>
                      <span className="odds-fraction">
                        {row && turn.odds.analysis
                          ? `${row.unionWeight.toLocaleString("en-US")} / ${turn.odds.analysis.total.toLocaleString("en-US")}`
                          : "\u00a0"}
                      </span>
                      <span className="goal-survival">
                        <span>
                          {survival && survival.afterOne !== null ? `after 1 stop ${percent(survival.afterOne)}` : "-"}
                        </span>
                        <span>
                          {survival && survival.afterTwo !== null ? `after 2 stops ${percent(survival.afterTwo)}` : "\u00a0"}
                        </span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onOpenScorecard ? (
        <button type="button" onClick={onOpenScorecard}>
          Open the Scorecard
        </button>
      ) : null}
    </section>
  );
}
