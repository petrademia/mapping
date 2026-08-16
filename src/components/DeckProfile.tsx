import { useMemo } from "react";
import { analysisContextOf, engineAccessConditionIds, sectionSize } from "../lib/document";
import type { MappingDocument } from "../lib/document";
import {
  analysisContextLabel,
  normalizeAnalysisContext,
  observedCards,
  sampleSizeDescription,
} from "../lib/analysisContext";
import { groupsToMembership } from "../lib/handCondition";
import { computeDeckProfile } from "../lib/deckProfile";
import { ProbabilityError } from "../lib/probability";
import { openingQualityCoverage } from "../lib/taxonomy";

function formatChance(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatChanceOrDash(value: number | null): string {
  return value === null ? "—" : formatChance(value);
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
    conditions: doc.hand_conditions,
    accessConditionIds: engineAccessConditionIds(doc),
    groups: groupsToMembership(doc.groups),
  });
}

function comparisonProfile(doc: MappingDocument, turnOrder: "going_first" | "going_second") {
  // Keep sample size identical (opening hand) so GF/GS rows are comparable.
  return computeDeckProfile({
    deck: doc.main,
    handSize: doc.analysis.opening_hand_size,
    turnOrder,
    conditions: doc.hand_conditions,
    accessConditionIds: engineAccessConditionIds(doc),
    groups: groupsToMembership(doc.groups),
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
        going_first: comparisonProfile(doc, "going_first"),
        going_second: comparisonProfile(doc, "going_second"),
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

  const coverage = openingQualityCoverage(doc.main);
  const coveragePercent = (classified: number, total: number): string =>
    total === 0 ? "0%" : formatChance(classified / total);

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
        Exact opening-hand profile under{" "}
        {analysisContextLabel(context, opening)} —{" "}
        {sampleSizeDescription(context, opening)}. Modeled outcomes come from
        the configured Hand Conditions; raw composition statistics below are
        descriptive annotations, not strategic verdicts. Not combo success, win
        rate, or YAPPING utility.
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
            <h3>Modeled Outcomes</h3>
            <p className="explorer-notation">
              Union over the Hand Conditions selected as engine access;
              overlapping conditions are not double-counted.
            </p>
            <dl>
              <div>
                <dt>Engine Access</dt>
                <dd>{formatChance(profile.anyAccess)}</dd>
              </div>
              <div>
                <dt>Access + Interaction-tagged card</dt>
                <dd>{formatChance(profile.accessAndInteraction)}</dd>
              </div>
              <div>
                <dt>Access + No Undesirable</dt>
                <dd>{formatChance(profile.accessNoUndesirable)}</dd>
              </div>
            </dl>
          </article>

          <article>
            <h3>Access Multiplicity</h3>
            <p className="explorer-notation">
              How many of the selected access conditions a random hand
              satisfies. Not resilience: routes may converge after an
              interruption.
            </p>
            <dl>
              {profile.accessMultiplicity.atLeast.map((p, index) => (
                <div key={`multi-${index}`}>
                  <dt>At least {index + 1} access condition{index === 0 ? "" : "s"}</dt>
                  <dd>{formatChance(p)}</dd>
                </div>
              ))}
              {profile.accessMultiplicity.atLeast.length === 0 ? (
                <div>
                  <dt>At least 1 access condition</dt>
                  <dd>0%</dd>
                </div>
              ) : null}
            </dl>
          </article>

          <article>
            <h3>Conditional on Access</h3>
            <p className="explorer-notation">
              Among hands with modeled engine access, the percentage that also
              satisfy the stated raw annotation event.
            </p>
            <dl>
              <div>
                <dt>Interaction-tagged card</dt>
                <dd>
                  {formatChanceOrDash(profile.interactionGivenAccess)}
                </dd>
              </div>
              <div>
                <dt>No undesirable</dt>
                <dd>{formatChanceOrDash(profile.noUndesirableGivenAccess)}</dd>
              </div>
            </dl>
          </article>

          <details className="panel-details">
            <summary>Annotation &amp; composition analysis</summary>

            <article>
              <h3>Annotation Coverage</h3>
              <p className="explorer-notation">
                Opening Quality slots classified per turn order (physical
                copies). Unclassified is incomplete annotation, not a neutral
                verdict.
              </p>
              <dl>
                <div>
                  <dt>Going First slots classified</dt>
                  <dd>
                    {coverage.going_first.classified} /{" "}
                    {coverage.going_first.total} ·{" "}
                    {coveragePercent(
                      coverage.going_first.classified,
                      coverage.going_first.total,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Going Second slots classified</dt>
                  <dd>
                    {coverage.going_second.classified} /{" "}
                    {coverage.going_second.total} ·{" "}
                    {coveragePercent(
                      coverage.going_second.classified,
                      coverage.going_second.total,
                    )}
                  </dd>
                </div>
              </dl>
            </article>

            <article data-quality="unclassified">
              <h3>Opening Quality Composition</h3>
              <p className="explorer-notation">
                Raw annotation statistics using the currently selected{" "}
                {context.turn_order === "going_first" ? "going-first" : "going-second"}{" "}
                Opening Quality annotation.
              </p>
              <dl>
                <div>
                  <dt>Contains &gt;= 1 desirable-tagged card</dt>
                  <dd>{formatChance(profile.desirableGe1)}</dd>
                </div>
                <div>
                  <dt>Contains &gt;= 1 neutral-tagged card</dt>
                  <dd>{formatChance(profile.neutralGe1)}</dd>
                </div>
                <div>
                  <dt>Contains &gt;= 1 undesirable-tagged card</dt>
                  <dd>{formatChance(profile.undesirableGe1)}</dd>
                </div>
                <div>
                  <dt>Contains &gt;= 2 undesirable-tagged cards</dt>
                  <dd>{formatChance(profile.undesirableGe2)}</dd>
                </div>
                <div>
                  <dt>Contains &gt;= 1 unclassified card</dt>
                  <dd>{formatChance(profile.unclassifiedGe1)}</dd>
                </div>
              </dl>
            </article>

            <article data-quality="undesirable">
              <h3>Access Composition</h3>
              <dl>
                <div>
                  <dt>Access + no undesirable-tagged card</dt>
                  <dd>{formatChance(profile.accessNoUndesirable)}</dd>
                </div>
                <div>
                  <dt>Access + &gt;= 1 undesirable-tagged card</dt>
                  <dd>{formatChance(profile.accessUndesirableGe1)}</dd>
                </div>
              </dl>
            </article>

            <article data-role="interaction">
              <h3>Interaction-tagged cards</h3>
              <p className="explorer-notation">
                Raw taxonomy event. An interaction-tagged card is not
                automatically usable interaction in every context - model that
                with Hand Conditions instead.
              </p>
              <dl>
                <div>
                  <dt>Contains &gt;= 1 interaction-tagged card</dt>
                  <dd>{formatChance(profile.interactionGe1)}</dd>
                </div>
                <div>
                  <dt>Access + interaction-tagged card</dt>
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
          </details>
        </div>
      ) : null}
    </section>
  );
}
