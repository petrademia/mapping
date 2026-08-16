import {
  openingAtLeastProbability,
  openingCountDistribution,
  ProbabilityError,
} from "../lib/probability";
import { sectionSize } from "../lib/document";
import type { MappingDocument } from "../lib/document";
import {
  copiesForOpeningQuality,
  copiesForRole,
  ROLES,
  type Role,
} from "../lib/taxonomy";

function formatChance(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

interface Props {
  doc: MappingDocument;
  onHandSize: (size: number) => void;
}

function RoleProbArticle({
  role,
  deck,
  hand,
  copies,
}: {
  role: Role;
  deck: number;
  hand: number;
  copies: number;
}) {
  const atLeastOne = openingAtLeastProbability(deck, copies, hand, 1);
  const dist = openingCountDistribution(deck, copies, hand);
  return (
    <article data-role={role}>
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
}

export function ProbabilityPanel({ doc, onHandSize }: Props) {
  const deck = sectionSize(doc.main);
  const hand = doc.analysis.opening_hand_size;
  const roleCopies = Object.fromEntries(
    ROLES.map((role) => [role, copiesForRole(doc.main, role)]),
  ) as Record<Role, number>;
  const undesirable = copiesForOpeningQuality(doc.main, "undesirable");
  const hasAnyRole = ROLES.some((role) => roleCopies[role] > 0);
  const hasUndesirable = undesirable > 0;

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
        Theoretical hypergeometric chances for a random {hand}-card main-deck
        opening. Not combo success, win rate, or solver utility. Role labels
        overlap, so joint events are not products of the marginals shown here.
      </p>
      {deck === 0 ? (
        <p className="empty">Add main-deck cards to preview composition probabilities.</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : !hasAnyRole && !hasUndesirable ? (
        <p className="empty">
          Assign roles or opening quality on main-deck cards to preview
          composition.
        </p>
      ) : (
        <div className="probs">
          {ROLES.filter((role) => roleCopies[role] > 0).map((role) => (
            <RoleProbArticle
              key={role}
              role={role}
              deck={deck}
              hand={hand}
              copies={roleCopies[role]}
            />
          ))}
          {hasUndesirable ? (
            <article data-quality="undesirable">
              <h3>undesirable</h3>
              <p className="hero">
                P(undesirable ≥ 1){" "}
                <strong>
                  {formatChance(
                    openingAtLeastProbability(deck, undesirable, hand, 1),
                  )}
                </strong>
              </p>
              <dl>
                <div>
                  <dt>undesirable = 0</dt>
                  <dd>
                    {formatChance(
                      openingCountDistribution(deck, undesirable, hand).exact[0] ??
                        0,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>undesirable = 1</dt>
                  <dd>
                    {formatChance(
                      openingCountDistribution(deck, undesirable, hand).exact[1] ??
                        0,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>undesirable ≥ 2</dt>
                  <dd>
                    {formatChance(
                      openingAtLeastProbability(deck, undesirable, hand, 2),
                    )}
                  </dd>
                </div>
              </dl>
            </article>
          ) : null}
        </div>
      )}
    </section>
  );
}
