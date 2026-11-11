import { useState } from "react";
import { isOpeningHandObservation } from "../../lib/analysisContext";
import type { Catalog } from "../../lib/catalog";
import type { MappingDocument } from "../../lib/document";
import type { HandCondition, HandConditionSet } from "../../lib/handCondition";
import { pairKey, type HandEventAnalysis } from "../../lib/handExplorer";
import { sortCheckedFirst } from "../../lib/sortCheckedFirst";
import { CardStrip, conditionCards } from "../ModelArt";
import { ConditionEditor } from "./ConditionEditor";
import { coverageWarning, DeferredNameInput, EntityNotes, formatPercent, formatPercentOrDash } from "./shared";

export function HandGoalEditor({
  set,
  doc,
  catalog,
  summary,
  setSummary,
  context,
  opening,
  sample,
  deck,
  onSetChange,
  onToggleMember,
  onCreateCondition,
  onEditCondition,
  onRemoveCondition,
  onRemove,
}: {
  set: HandConditionSet;
  doc: MappingDocument;
  catalog: Catalog;
  summary: HandEventAnalysis | undefined;
  setSummary: import("../../lib/handExplorer").ConditionSetSummary | undefined;
  context: import("../../lib/analysisContext").AnalysisContext;
  opening: number;
  sample: number;
  deck: number;
  onSetChange: (set: HandConditionSet) => void;
  onToggleMember: (conditionId: string, member: boolean) => void;
  onCreateCondition: () => string;
  onEditCondition: (condition: HandCondition) => void;
  onRemoveCondition: (conditionId: string) => void;
  onRemove: () => void;
}) {
  const members = new Set(set.condition_ids);
  const [inlineConditionId, setInlineConditionId] = useState<string | null>(
    null,
  );
  const conditionName = (id: string): string => {
    const condition = doc.hand_conditions.find((item) => item.id === id);
    return condition?.name ?? "unknown";
  };
  const inlineCondition = inlineConditionId
    ? doc.hand_conditions.find((condition) => condition.id === inlineConditionId)
    : undefined;
  const n = setSummary?.conditionIds.length ?? 0;
  const warning = coverageWarning(context.turn_order, doc);

  return (
    <div className="access-block">
      <div className="access-block-head">
        <DeferredNameInput
          value={set.name}
          placeholder="Untitled hand goal"
          label="Hand Goal name"
          onCommit={(name) => onSetChange({ ...set, name })}
        />
        <button type="button" className="ghost" onClick={onRemove}>
          Delete goal
        </button>
      </div>
      <EntityNotes
        value={set.notes}
        label={`Notes for ${set.name || "hand goal"}`}
        onCommit={(notes) => onSetChange({ ...set, notes })}
      />
      <p className="access-allof">ANY OF</p>
      {doc.hand_conditions.length === 0 ? (
        <p className="empty">Add a Hand Condition first.</p>
      ) : (
        <ul className="engine-members">
          {sortCheckedFirst(doc.hand_conditions, (condition) =>
            members.has(condition.id),
          ).map((condition) => {
            const probability = summary?.conditions.find(
              (row) => row.id === condition.id,
            )?.probability;
            const member = members.has(condition.id);
            return (
              <li key={condition.id}>
                <label className="engine-member">
                  <input
                    type="checkbox"
                    checked={member}
                    onChange={(event) =>
                      onToggleMember(condition.id, event.target.checked)
                    }
                  />
                  <span className="explorer-title">{condition.name}</span>
                  <CardStrip
                    cardIds={conditionCards(condition, doc)}
                    deck={doc.main}
                    catalog={catalog}
                    max={6}
                  />
                  <span className="engine-member-prob">
                    {probability !== undefined
                      ? formatPercent(probability)
                      : "—"}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div className="row-actions">
        <button
          type="button"
          onClick={() => setInlineConditionId(onCreateCondition())}
        >
          + Create hand condition
        </button>
      </div>
      {inlineCondition ? (
        <ConditionEditor
          condition={inlineCondition}
          doc={doc}
          catalog={catalog}
          probability={summary?.conditions.find(
            (row) => row.id === inlineCondition.id,
          )?.probability}
          onChange={onEditCondition}
          onRemove={() => {
            onRemoveCondition(inlineCondition.id);
            setInlineConditionId(null);
          }}
        />
      ) : null}
      {setSummary && n > 0 ? (
        <>
          <p className="access-allof access-outcome-label">
            Modeled probability
          </p>
          <p className="outcome-primary">{formatPercent(setSummary.union)}</p>
          <p className="explorer-notation">
            {isOpeningHandObservation(context)
              ? `opening ${opening}`
              : `first ${sample} cards seen`}
            {" "}· P(any selected condition matches), overlapping conditions
            counted once
          </p>
          <details className="panel-details">
            <summary>Multiplicity details</summary>
            <dl className="explorer-results">
              <div className="explorer-row">
                <dt>
                  <span className="explorer-title">
                    No matching condition
                  </span>
                </dt>
                <dd>{formatPercent(setSummary.distribution.exact[0] ?? 0)}</dd>
              </div>
              {setSummary.distribution.exact
                .slice(1, setSummary.distribution.exact.length - 1)
                .map((p, index) => (
                  <div key={`exact-${set.id}-${index + 1}`} className="explorer-row">
                    <dt>
                      <span className="explorer-title">
                        Exactly {index + 1} matching{" "}
                        {index + 1 === 1 ? "condition" : "conditions"}
                      </span>
                    </dt>
                    <dd>{formatPercent(p)}</dd>
                  </div>
                ))}
              {setSummary.distribution.exact.length > 1 ? (
                <div className="explorer-row">
                  <dt>
                    <span className="explorer-title">
                      {setSummary.distribution.exact.length - 1}+ matching
                      conditions
                    </span>
                  </dt>
                  <dd>
                    {formatPercent(
                      setSummary.distribution.exact[
                        setSummary.distribution.exact.length - 1
                      ]!,
                    )}
                  </dd>
                </div>
              ) : null}
            </dl>
            {n >= 2 ? (
              <>
                <p className="access-allof access-relationships-label">
                  Relationships (both)
                </p>
                <dl className="explorer-results">
                  {setSummary.conditionIds.map((aId, i) =>
                    setSummary.conditionIds.slice(i + 1).map((bId) => {
                      const overlap = summary?.overlaps.get(pairKey(aId, bId));
                      if (!overlap) return null;
                      return (
                        <div
                          key={`pair-${set.id}-${aId}-${bId}`}
                          className="explorer-row"
                        >
                          <dt>
                            <span className="explorer-title">
                              {conditionName(aId)} ∩ {conditionName(bId)}
                            </span>
                          </dt>
                          <dd>{formatPercent(overlap.intersection)}</dd>
                        </div>
                      );
                    }),
                  )}
                </dl>
              </>
            ) : null}
          </details>
          {setSummary.openingQuality ? (
            <details className="panel-details">
              <summary>Opening Quality</summary>
              <p className="explorer-notation">
                Among hands satisfy this goal
                ({formatPercent(setSummary.union)}), by the{" "}
                {context.turn_order === "going_first"
                  ? "Going First"
                  : "Going Second"}{" "}
                Opening Quality annotation.
              </p>
              {setSummary.openingQuality.undesirable[0] === null ? (
                <p className="empty">
                  No hands currently satisfy this hand goal.
                </p>
              ) : (
                <dl className="explorer-results">
                  <div className="explorer-row">
                    <dt>
                      <span className="explorer-title">No undesirable</span>
                    </dt>
                    <dd>
                      {formatPercent(
                        setSummary.openingQuality.undesirable[0]!,
                      )}
                    </dd>
                  </div>
                  <div className="explorer-row">
                    <dt>
                      <span className="explorer-title">
                        Exactly 1 undesirable
                      </span>
                    </dt>
                    <dd>
                      {formatPercent(
                        setSummary.openingQuality.undesirable[1]!,
                      )}
                    </dd>
                  </div>
                  <div className="explorer-row">
                    <dt>
                      <span className="explorer-title">
                        2+ undesirable
                      </span>
                    </dt>
                    <dd>
                      {formatPercent(
                        setSummary.openingQuality.undesirable[2]!,
                      )}
                    </dd>
                  </div>
                  <div className="explorer-row">
                    <dt>
                      <span className="explorer-title">
                        Contains &gt;= 1 desirable
                      </span>
                    </dt>
                    <dd>
                      {formatPercentOrDash(
                        setSummary.openingQuality.desirableGe1,
                      )}
                    </dd>
                  </div>
                </dl>
              )}
              {warning ? <p className="empty">{warning}</p> : null}
            </details>
          ) : null}
        </>
      ) : (
        <p className="empty">
          {deck === 0
            ? "Add Main Deck cards to compute goal probabilities."
            : "Select at least one condition above as a member of this goal."}
        </p>
      )}
    </div>
  );
}
