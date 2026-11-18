import { analysisContextLabel, observedCards } from "../lib/analysisContext";
import { analysisContextOf, sectionSize, type MappingDocument } from "../lib/document";
import { groupsToMembership } from "../lib/handCondition";
import { useHandAnalysis } from "../lib/useHandAnalysis";
import { modelsAnalysisKey } from "../lib/modelsAnalysisKey";

interface Props {
  doc: MappingDocument;
  onDefineGoal: () => void;
  onTestHand: () => void;
}

const formatPercent = (value: number): string => `${(value * 100).toFixed(2)}%`;

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

/** Each Hand Goal's chance, with the exact hand count underneath so it can be checked. */
export function GoalOdds({ doc }: { doc: MappingDocument }) {
  const context = analysisContextOf(doc);
  const opening = doc.analysis.opening_hand_size;
  const sample = observedCards(context, opening);
  const deck = sectionSize(doc.main);
  const key = modelsAnalysisKey({
    main: doc.main,
    groups: doc.groups,
    hand_conditions: doc.hand_conditions,
    hand_condition_sets: doc.hand_condition_sets,
    sample,
    turn_order: context.turn_order,
    engine_access_set_id: doc.engine_access_set_id,
  });
  // Worked out in a Web Worker; the previous odds stay on screen, dimmed, while a new edit is counted.
  const { analysis, pending } = useHandAnalysis(
    key,
    deck === 0 || sample > deck
      ? null
      : {
          main: doc.main,
          sample,
          conditions: doc.hand_conditions,
          sets: doc.hand_condition_sets,
          groups: groupsToMembership(doc.groups),
          turnOrder: context.turn_order,
        },
  );

  const rows = (analysis?.sets ?? []).filter((set) => set.conditionIds.length > 0);
  const goals = doc.hand_condition_sets.filter((set) => set.condition_ids.length > 0);
  // Before the first count arrives the panel is already there, with every goal named and its
  // numbers still to come, so the panels below it do not jump when the odds fill in.
  const counting = !analysis && goals.length > 0 && deck > 0 && sample <= deck;
  if (!counting && (!analysis || rows.length === 0)) return null;
  return (
    <section className="panel goal-odds" aria-label="Hand Goal odds" aria-busy={pending || counting}>
      <header>
        <h2>Hand Goals</h2>
        <p className="note">{analysisContextLabel(context, opening)}</p>
      </header>
      <ul className="odds-list">
        {analysis
          ? rows.map((set) => (
              <li key={set.id} className="odds-row">
                <span className="odds-name">{set.name || "Untitled hand goal"}</span>
                <span className="odds-value">
                  <span className="odds-percent">{formatPercent(set.union)}</span>
                  <span className="odds-fraction">
                    {set.unionWeight.toLocaleString("en-US")} / {analysis.total.toLocaleString("en-US")}
                  </span>
                </span>
              </li>
            ))
          : goals.map((set) => (
              <li key={set.id} className="odds-row">
                <span className="odds-name">{set.name || "Untitled hand goal"}</span>
                <span className="odds-value">
                  <span className="odds-percent">&hellip;</span>
                  <span className="odds-fraction">&nbsp;</span>
                </span>
              </li>
            ))}
      </ul>
    </section>
  );
}
