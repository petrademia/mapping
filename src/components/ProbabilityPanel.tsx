import {
  openingAtLeastProbability,
  openingCountDistribution,
  ProbabilityError,
} from "../lib/probability";
import { sectionSize } from "../lib/document";
import type { MappingDocument } from "../lib/document";
import { roleDensity } from "../lib/roles";

function formatChance(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

interface Props {
  doc: MappingDocument;
  onHandSize: (size: number) => void;
}

export function ProbabilityPanel({ doc, onHandSize }: Props) {
  const deck = sectionSize(doc.main);
  const hand = doc.analysis.opening_hand_size;
  const density = roleDensity(doc.main);
  const roles = Object.keys(density).sort();

  let error: string | null = null;
  try {
    if (deck > 0) openingCountDistribution(deck, 0, hand);
  } catch (caught) {
    error =
      caught instanceof ProbabilityError
        ? caught.message
        : "Cannot compute composition probabilities for these sizes.";
  }

  return (
    <section className="panel">
      <header>
        <h2>Composition probabilities</h2>
        <label>
          Opening hand
          <input
            type="number"
            min={0}
            max={Math.max(deck, 0)}
            value={hand}
            onChange={(event) => onHandSize(Number(event.target.value))}
          />
        </label>
      </header>
      <p className="note">
        These are theoretical hypergeometric chances of seeing a role in a random
        {` ${hand}-card`} main-deck opening. They are not combo success, interruption
        resilience, or solver utility.
      </p>
      {deck === 0 ? (
        <p className="empty">Add main-deck cards to preview composition probabilities.</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : roles.length === 0 ? (
        <p className="empty">Assign roles on main-deck cards to preview composition.</p>
      ) : (
        <div className="probs">
          {roles.map((role) => {
            const copies = density[role] ?? 0;
            const atLeastOne = openingAtLeastProbability(deck, copies, hand, 1);
            const dist = openingCountDistribution(deck, copies, hand);
            return (
              <article key={role} data-role={role}>
                <h3>{role}</h3>
                <p className="hero">
                  P({role} ≥ 1) <strong>{formatChance(atLeastOne)}</strong>
                </p>
                <dl>
                  <div>
                    <dt>{role} = 0</dt>
                    <dd>{formatChance(dist.exact[0] ?? 0)}</dd>
                  </div>
                  <div>
                    <dt>{role} = 1</dt>
                    <dd>{formatChance(dist.exact[1] ?? 0)}</dd>
                  </div>
                  <div>
                    <dt>{role} = 2</dt>
                    <dd>{formatChance(dist.exact[2] ?? 0)}</dd>
                  </div>
                  <div>
                    <dt>{role} ≥ 3</dt>
                    <dd>{formatChance(dist.atLeast3)}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
