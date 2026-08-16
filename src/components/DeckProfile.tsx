import { useMemo } from "react";
import { analysisContextOf, sectionSize } from "../lib/document";
import type { MappingDocument } from "../lib/document";
import {
  analysisContextLabel,
  normalizeAnalysisContext,
  observedCards,
  sampleSizeDescription,
} from "../lib/analysisContext";
import { groupsToMembership } from "../lib/access";
import { computeDeckProfile } from "../lib/deckProfile";
import { ProbabilityError } from "../lib/probability";

function formatChance(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

interface Props {
  doc: MappingDocument;
  onHandSize: (size: number) => void;
}

function profileFor(doc: MappingDocument, turnOrder: "going_first" | "going_second") {
  const opening = doc.analysis.opening_hand_size;
  const context = normalizeAnalysisContext({
    ...analysisContextOf(doc),
    turn_order: turnOrder,
  });
  const sample = observedCards(context, opening);
  return computeDeckProfile({
    deck: doc.main,
    handSize: sample,
    turnOrder: context.turn_order,
    conditions: doc.access_conditions,
    groups: groupsToMembership(doc.access_groups),
  });
}

export function DeckProfile({ doc, onHandSize }: Props) {
  const deck = sectionSize(doc.main);
  const opening = doc.analysis.opening_hand_size;
  const context = analysisContextOf(doc);
  const sample = observedCards(context, opening);

  const profile = useMemo(() => {
    if (deck === 0) return null;
    try {
      return profileFor(doc, context.turn_order);
    } catch (caught) {
      return {
        error:
          caught instanceof ProbabilityError
            ? caught.message
            : "Cannot compute the deck profile for these sizes.",
      };
    }
  }, [doc, deck, context.turn_order, opening, sample]);

  const comparison = useMemo(() => {
    if (deck === 0) return null;
    try {
      return {
        going_first: profileFor(doc, "going_first"),
        going_second: profileFor(doc, "going_second"),
      };
    } catch {
      return null;
    }
  }, [doc, deck]);

  const hasAnnotations =
    deck > 0 &&
    doc.main.some(
      (card) =>
        card.taxonomy.roles.length > 0 ||
        card.taxonomy.opening_quality.going_first !== null ||
        card.taxonomy.opening_quality.going_second !== null,
    );

  return (
    <section className="panel">
      <header>
        <h2>Deck Profile</h2>
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
        Exact opening-hand deck profile under{" "}
        {analysisContextLabel(context, opening)} —{" "}
        {sampleSizeDescription(context, opening)}. Opening quality uses the{" "}
        {context.turn_order === "going_first" ? "going-first" : "going-second"}{" "}
        annotation. Not combo success, win rate, or YAPPING utility. A hand with
        an undesirable-tagged card is not necessarily a bad hand.
      </p>
      {deck === 0 ? (
        <p className="empty">Add main-deck cards to profile the deck.</p>
      ) : profile && "error" in profile ? (
        <p className="error">{profile.error}</p>
      ) : !hasAnnotations ? (
        <p className="empty">
          Assign roles or contextual opening quality on main-deck cards to
          profile the deck.
        </p>
      ) : profile ? (
        <div className="probs">
          <article>
            <h3>Modeled Engine Access</h3>
            <p className="hero">
              At least one access condition{" "}
              <strong>{formatChance(profile.anyAccess)}</strong>
            </p>
            <p className="explorer-notation">
              UNION over configured access conditions; overlapping conditions
              are not double-counted.
            </p>
          </article>

          <article data-quality="unclassified">
            <h3>Opening Composition</h3>
            <dl>
              <div>
                <dt>Hands with &gt;= 1 desirable card</dt>
                <dd>{formatChance(profile.desirableGe1)}</dd>
              </div>
              <div>
                <dt>Hands with &gt;= 1 neutral card</dt>
                <dd>{formatChance(profile.neutralGe1)}</dd>
              </div>
              <div>
                <dt>Hands with &gt;= 1 undesirable card</dt>
                <dd>{formatChance(profile.undesirableGe1)}</dd>
              </div>
              <div>
                <dt>Hands with &gt;= 2 undesirable cards</dt>
                <dd>{formatChance(profile.undesirableGe2)}</dd>
              </div>
              <div>
                <dt>Hands with &gt;= 1 unclassified card</dt>
                <dd>{formatChance(profile.unclassifiedGe1)}</dd>
              </div>
            </dl>
          </article>

          <article data-quality="undesirable">
            <h3>Access Composition</h3>
            <dl>
              <div>
                <dt>Access + no undesirable card</dt>
                <dd>{formatChance(profile.accessNoUndesirable)}</dd>
              </div>
              <div>
                <dt>Access + &gt;= 1 undesirable card</dt>
                <dd>{formatChance(profile.accessUndesirableGe1)}</dd>
              </div>
            </dl>
          </article>

          <article data-role="interaction">
            <h3>Interaction</h3>
            <dl>
              <div>
                <dt>Hands with &gt;= 1 interaction card</dt>
                <dd>{formatChance(profile.interactionGe1)}</dd>
              </div>
              <div>
                <dt>Access + &gt;= 1 interaction card</dt>
                <dd>{formatChance(profile.accessAndInteraction)}</dd>
              </div>
            </dl>
          </article>

          {comparison ? (
            <article>
              <h3>Context comparison</h3>
              <p className="explorer-notation">
                Turn order uses going-first vs going-second annotations on the
                same deck (both at opening hand sample size).
              </p>
              <dl>
                <div>
                  <dt>&gt;= 1 desirable (GF / GS)</dt>
                  <dd>
                    {formatChance(comparison.going_first.desirableGe1)} /{" "}
                    {formatChance(comparison.going_second.desirableGe1)}
                  </dd>
                </div>
                <div>
                  <dt>&gt;= 1 undesirable (GF / GS)</dt>
                  <dd>
                    {formatChance(comparison.going_first.undesirableGe1)} /{" "}
                    {formatChance(comparison.going_second.undesirableGe1)}
                  </dd>
                </div>
                <div>
                  <dt>&gt;= 2 undesirable (GF / GS)</dt>
                  <dd>
                    {formatChance(comparison.going_first.undesirableGe2)} /{" "}
                    {formatChance(comparison.going_second.undesirableGe2)}
                  </dd>
                </div>
              </dl>
            </article>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}