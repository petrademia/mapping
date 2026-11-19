import type { MappingDocument } from "../lib/document";
import { COMPONENT_LABELS, matchPush, rangeMean, unmeasured, weakest, type ComponentKey, type TurnScore } from "../lib/scorecard";
import { useScorecardState } from "../lib/useScorecard";
import { useScorecardSettings } from "../lib/scorecardWeights";
import type { ScorecardSettings } from "../lib/scorecard";

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

const HOW_TO_MEASURE = {
  opens: "",
  clean: "mark bricks as Undesirable",
  resilient: "add a handtrap in the Handtrap versus tab",
  interaction: "mark Interaction cards",
  lingering: "mark Lingering handtrap cards",
  breaking: "mark Board breaker cards",
} as const;

/** The Scorecard parts this turn order can measure, each its own exact percentage. */
function measuredParts(turn: TurnScore): { key: ComponentKey; value: number }[] {
  const parts: { key: ComponentKey; value: number }[] = [];
  for (const key of Object.keys(COMPONENT_LABELS) as ComponentKey[]) {
    const value = turn[key];
    if (value !== null) parts.push({ key, value });
  }
  return parts;
}

/** Extra measures, left out of the combined number and the weakest pick until you give them a weight. */
const EXTRA: readonly ComponentKey[] = ["lingering", "breaking"];

function Tile({ title, turn, weights }: { title: string; turn: TurnScore; weights: ScorecardSettings }) {
  const low = weakest(turn);
  const parts = measuredParts(turn);
  return (
    <section className="summary-tile" aria-label={title}>
      <h3>
        {title} <span className="explorer-notation">{turn.sample} cards</span>
      </h3>
      {parts.length === 0 ? (
        <p className="summary-weakest">Nothing measured</p>
      ) : (
        <ul className="summary-parts" aria-label={`${title}, each part`}>
          {parts.map(({ key, value }) => (
            <li key={key} data-weakest={low?.key === key ? "true" : undefined}>
              <span className="summary-part-label">{COMPONENT_LABELS[key]}</span>
              <span className="summary-part-bar" aria-hidden="true">
                <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
              </span>
              <span className="summary-part-value">{percent(value)}</span>
              {low?.key === key ? (
                <span className="summary-part-tag">weakest</span>
              ) : EXTRA.includes(key) && weights[key] === 0 ? (
                <span className="summary-part-tag summary-part-tag-quiet" title="Left out of the combined number until you weight it in the Scorecard">
                  not combined
                </span>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="summary-combined">
        Combined, with your weights{" "}
        <strong role="status">{turn.combined === null ? "-" : percent(turn.combined)}</strong>
      </p>
      {turn.interruptions.length > 1 ? (
        <p className="summary-weakest">
          After one interruption: <strong>{percent(turn.interruptions[1]!)}</strong>
          {turn.interruptionsPriority.length > 1 ? (
            <>
              {" "}
              ({percent(turn.interruptionsPriority[1]!)} if they follow your list)
            </>
          ) : null}
        </p>
      ) : null}
      {turn.interruptions.length > 2 ? (
        <p className="summary-weakest">
          With 1 to 2 handtraps: <strong>{percent(rangeMean(turn.interruptions, 1, 2)!)}</strong>
          {turn.interruptions.length > 3 ? (
            <>
              ; 1 to 3: <strong>{percent(rangeMean(turn.interruptions, 1, 3)!)}</strong>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The bird's-eye view: each measurable part of the deck's hands going first and going second as its
 * own exact percentage, the weakest marked, and the combined number smaller beneath. It is only as
 * complete as your models, so it says what is not measured yet.
 */
export function ScorecardSummary({ doc, onOpen }: { doc: MappingDocument; onOpen: () => void }) {
  const [settings] = useScorecardSettings();
  const { result, pending } = useScorecardState(doc, null, settings);
  if (result === null) {
    return (
      <section className="panel summary" aria-label="At a glance" aria-busy="true">
        <h2>At a glance</h2>
        <p className="note">Calculating how reliably your hands reach the Hand Goal. This can take a few seconds when you have many routes.</p>
      </section>
    );
  }
  // Without a deck or a Hand Goal the next-step card above already says what to do.
  if ("error" in result) return null;

  const missing = unmeasured(result.first).filter((key) => unmeasured(result.second).includes(key));
  const match = matchPush(result.first, result.second, settings);

  return (
    <section className="panel summary" aria-label="At a glance" aria-busy={pending}>
      <h2>At a glance</h2>
      <p className="note">
        How reliably your hands reach {result.goalName ? `"${result.goalName}"` : "your Hand Goal"}.
        Each part is exact; the combined number uses the weights you set in the Scorecard.
      </p>
      <div className="summary-tiles">
        <Tile title="Going first" turn={result.first} weights={settings} />
        <Tile title="Going second" turn={result.second} weights={settings} />
      </div>
      {match.value !== null ? (
        <p className="summary-match">
          Over a best-of-three, <strong>{percent(match.value)}</strong> of hands still reach the goal after the
          interruptions to expect, going first {percent(match.goingFirstShare)} of the time. Set the win rate and
          handtrap counts in the Scorecard.
        </p>
      ) : null}
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
