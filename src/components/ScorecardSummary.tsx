import { useMemo } from "react";
import type { MappingDocument } from "../lib/document";
import { COMPONENT_LABELS, scorecard, unmeasured, weakest, type TurnScore } from "../lib/scorecard";
import { useScorecardSettings } from "../lib/scorecardWeights";

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

const HOW_TO_MEASURE = {
  opens: "",
  clean: "mark bricks as Undesirable",
  resilient: "add a handtrap in the Handtraps tab",
  interaction: "mark Interaction cards",
} as const;

function Tile({ title, turn }: { title: string; turn: TurnScore }) {
  const low = weakest(turn);
  return (
    <section className="summary-tile" aria-label={title}>
      <h3>
        {title} <span className="explorer-notation">{turn.sample} cards</span>
      </h3>
      <p className="outcome-primary" role="status">
        {turn.combined === null ? "-" : percent(turn.combined)}
      </p>
      {turn.interruptions.length > 1 ? (
        <p className="summary-weakest">
          After one interruption: <strong>{percent(turn.interruptions[1]!)}</strong>
        </p>
      ) : null}
      <p className="summary-weakest">
        {low ? (
          <>
            Weakest: <strong>{COMPONENT_LABELS[low.key]}</strong> {percent(low.value)}
          </>
        ) : (
          "Nothing measured"
        )}
      </p>
    </section>
  );
}

/**
 * The bird's-eye view: how good the deck's hands are going first and going
 * second, in one number each, with the weakest part to look at first. It is only
 * as complete as your models, so it says what is not measured yet.
 */
export function ScorecardSummary({ doc, onOpen }: { doc: MappingDocument; onOpen: () => void }) {
  const [settings] = useScorecardSettings();
  const result = useMemo(() => scorecard(doc, null, settings), [doc, settings]);
  // Without a deck or a Hand Goal the next-step card above already says what to do.
  if ("error" in result) return null;

  const missing = unmeasured(result.first).filter((key) => unmeasured(result.second).includes(key));

  return (
    <section className="panel summary" aria-label="Quality at a glance">
      <h2>Quality at a glance</h2>
      <p className="note">
        How reliably your hands reach {result.goalName ? `"${result.goalName}"` : "your Hand Goal"}, with
        the weights you set in the Scorecard. Compare it with another deck, not with a target.
      </p>
      <div className="summary-tiles">
        <Tile title="Going first" turn={result.first} />
        <Tile title="Going second" turn={result.second} />
      </div>
      {missing.length > 0 ? (
        <p className="note">
          Not measured yet:{" "}
          {missing
            .map((key) => `${COMPONENT_LABELS[key]}, to measure it ${HOW_TO_MEASURE[key]}`)
            .join("; ")}
          . The numbers above leave them out.
        </p>
      ) : null}
      <button type="button" onClick={onOpen}>
        Open the Scorecard
      </button>
    </section>
  );
}
