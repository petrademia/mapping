import type { MappingDocument } from "../lib/document";
import type { TurnScore } from "../lib/scorecard";
import { useScorecardState } from "../lib/useScorecard";
import { useScorecardSettings } from "../lib/scorecardWeights";

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

/**
 * One turn order: the short list of hands worth having, each its exact chance. A line that cannot be
 * measured yet shows a dash and what to tag, not a made-up zero.
 */
function Tile({ title, turn }: { title: string; turn: TurnScore }) {
  return (
    <section className="summary-tile" aria-label={title}>
      <h3>
        {title} <span className="explorer-notation">{turn.sample} cards</span>
      </h3>
      <ul className="summary-parts" aria-label={`${title}, hands worth having`}>
        {turn.plays.map((row) => (
          <li key={row.key} data-missing={row.probability === null ? "true" : undefined}>
            <span className="summary-part-head">
              <span className="summary-part-label">{row.label}</span>
              {row.probability === null && row.missing ? (
                <span className="summary-part-tag summary-part-tag-quiet">{row.missing}</span>
              ) : null}
            </span>
            <span className="summary-part-value">{row.probability === null ? "-" : percent(row.probability)}</span>
            <span className="summary-part-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(1, row.probability ?? 0)) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The bird's-eye view: a short list of hands worth having, going first and going second, each its
 * exact chance. The rest of the numbers are in the Scorecard.
 */
export function ScorecardSummary({ doc, onOpen }: { doc: MappingDocument; onOpen: () => void }) {
  const [settings] = useScorecardSettings();
  const { result, pending } = useScorecardState(doc, null, settings);
  if (result === null) {
    return (
      <section className="panel summary" aria-label="At a glance" aria-busy="true">
        <h2>At a glance</h2>
        <p className="note">Calculating. This can take a few seconds when you have many routes.</p>
      </section>
    );
  }
  // Without a deck or a Hand Goal the next-step card above already says what to do.
  if ("error" in result) return null;

  return (
    <section className="panel summary" aria-label="At a glance" aria-busy={pending} aria-live="polite">
      <h2>At a glance</h2>
      <p className="note">
        Exact chance of each hand{result.goalName ? `, with "${result.goalName}" as the Hand Goal` : ""}. A play
        through an interruption means the opponent stops the card that hurts most.
      </p>
      <div className="summary-tiles">
        <Tile title="Going first" turn={result.first} />
        <Tile title="Going second" turn={result.second} />
      </div>
      <button type="button" onClick={onOpen}>
        Open the Scorecard
      </button>
    </section>
  );
}
