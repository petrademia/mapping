import { useMemo, useState } from "react";
import {
  groupsToMembership,
  newId,
  type Group,
  type HandCondition,
  type HandConditionSet,
} from "../lib/handCondition";
import {
  analysisContextLabel,
  isOpeningHandObservation,
  observedCards,
  sampleSizeDescription,
} from "../lib/analysisContext";
import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import {
  analysisContextOf,
  removeGroup,
  removeHandCondition,
  removeHandConditionSet,
  sectionSize,
  setConditionSetMember,
  upsertGroup,
  upsertHandCondition,
  upsertHandConditionSet,
  type MappingDocument,
} from "../lib/document";
import {
  analyzeHandConditions,
  COUNT_OPERATORS,
  pairKey,
  type ConditionRequirement,
  type CountOperator,
  type HandEventAnalysis,
} from "../lib/handExplorer";
import { ProbabilityError } from "../lib/probability";
import { ROLES, type Role } from "../lib/taxonomy";

const OP_LABELS: Record<CountOperator, string> = {
  eq: "=",
  neq: "≠",
  gte: "≥",
  lte: "≤",
  gt: ">",
  lt: "<",
};

const ROLE_LABELS: Record<Role, string> = {
  starter: "Starter",
  extender: "Extender",
  interaction: "Interaction",
};

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  onChange: (doc: MappingDocument) => void;
  onHandSize: (size: number) => void;
}

export function HandConditionsPanel({
  doc,
  catalog,
  onChange,
  onHandSize,
}: Props) {
  const [groupFilter, setGroupFilter] = useState("");
  const deck = sectionSize(doc.main);
  const opening = doc.analysis.opening_hand_size;
  const context = analysisContextOf(doc);
  const sample = observedCards(context, opening);

  const summary = useMemo(() => {
    if (deck === 0) return null;
    try {
      return analyzeHandConditions(
        doc.main,
        sample,
        doc.hand_conditions,
        doc.hand_condition_sets,
        groupsToMembership(doc.groups),
      );
    } catch (caught) {
      return {
        error:
          caught instanceof ProbabilityError
            ? caught.message
            : "Cannot compute hand condition probabilities.",
      };
    }
  }, [doc.main, doc.hand_conditions, doc.groups, doc.hand_condition_sets, deck, sample]);

  function addCondition(): void {
    const firstCard = doc.main[0]?.card_id;
    onChange(
      upsertHandCondition(doc, {
        id: newId("condition"),
        name: "New hand condition",
        requirements: firstCard
          ? [{ kind: "card", card_id: firstCard, op: "gte", count: 1 }]
          : [],
        excludes: [],
      }),
    );
  }

  function addGroup(): void {
    onChange(
      upsertGroup(doc, {
        id: newId("group"),
        name: "New group",
        card_ids: [],
      }),
    );
  }

  function addSet(): void {
    onChange(
      upsertHandConditionSet(doc, {
        id: newId("set"),
        name: "New condition set",
        condition_ids: [],
        aggregation: "any",
      }),
    );
  }

  return (
    <section className="panel">
      <header>
        <h2>Hand Conditions</h2>
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
        Human-defined hand hypotheses evaluated under{" "}
        {analysisContextLabel(context, opening)} —{" "}
        {sampleSizeDescription(context, opening)}. ALL OF Requires and NONE OF
        Excludes within a condition; OR across selected Engine Access
        conditions. Not combo routes, resilience, or YAPPING utility.
        {!isOpeningHandObservation(context)
          ? " Satisfaction among first cards seen does not imply the line was available during the opponent's first turn."
          : ""}{" "}
        An exclusion rejects a hand without judging it strategically
        (Citrinitas in hand is not "bad", the modeled line just requires its
        absence). If a combo needs "Nervedo + another S/T", exclude Nervedo from
        that group so one copy cannot satisfy both requirements.
      </p>

      <h3 className="panel-subhead">Groups</h3>
      <p className="note">
        Named Main Deck card sets for conditions. Deck-specific helpers — not
        taxonomy labels.
      </p>
      {doc.groups.length === 0 ? (
        <p className="empty">No groups yet.</p>
      ) : (
        doc.groups.map((group) => (
          <GroupEditor
            key={group.id}
            group={group}
            doc={doc}
            catalog={catalog}
            filter={groupFilter}
            onFilter={setGroupFilter}
            onChange={(next) => onChange(upsertGroup(doc, next))}
            onRemove={() => onChange(removeGroup(doc, group.id))}
          />
        ))
      )}
      <button type="button" onClick={addGroup}>
        + Add group
      </button>

      <h3 className="panel-subhead">Conditions</h3>
      {doc.hand_conditions.length === 0 ? (
        <p className="empty">No hand conditions yet.</p>
      ) : (
        doc.hand_conditions.map((condition) => {
          const probability =
            summary && !("error" in summary)
              ? summary.conditions.find((row) => row.id === condition.id)
                  ?.probability
              : undefined;
          return (
            <ConditionEditor
              key={condition.id}
              condition={condition}
              doc={doc}
              catalog={catalog}
              probability={probability}
              onChange={(next) => onChange(upsertHandCondition(doc, next))}
              onRemove={() => onChange(removeHandCondition(doc, condition.id))}
            />
          );
        })
      )}
      <button type="button" onClick={addCondition}>
        + Add Hand Condition
      </button>

      <h3 className="panel-subhead">Condition Sets</h3>
      <p className="note">
        A Condition Set groups Hand Conditions as alternative ways to satisfy a
        modeled outcome (ANY of the members). MAPPING derives overlap from exact
        evaluation, so it never sums or averages overlapping probabilities and
        never asks whether conditions are mutually exclusive.
      </p>
      {doc.hand_condition_sets.length === 0 ? (
        <p className="empty">No condition sets yet.</p>
      ) : (
        doc.hand_condition_sets.map((set) => {
          const setSummary =
            summary && !("error" in summary)
              ? summary.sets.find((row) => row.id === set.id)
              : undefined;
          return (
            <SetEditor
              key={set.id}
              set={set}
              doc={doc}
              summary={summary && !("error" in summary) ? summary : undefined}
              setSummary={setSummary}
              context={context}
              opening={opening}
              sample={sample}
              deck={deck}
              onSetChange={(next) => onChange(upsertHandConditionSet(doc, next))}
              onToggleMember={(conditionId, member) =>
                onChange(
                  setConditionSetMember(doc, set.id, conditionId, member),
                )
              }
              onRemove={() => onChange(removeHandConditionSet(doc, set.id))}
            />
          );
        })
      )}
      <button type="button" onClick={addSet}>
        + Add Condition Set
      </button>
    </section>
  );
}

function GroupEditor({
  group,
  doc,
  catalog,
  filter,
  onFilter,
  onChange,
  onRemove,
}: {
  group: Group;
  doc: MappingDocument;
  catalog: Catalog;
  filter: string;
  onFilter: (value: string) => void;
  onChange: (group: Group) => void;
  onRemove: () => void;
}) {
  const needle = filter.trim().toLowerCase();
  const members = new Set(group.card_ids);
  const cards = doc.main.filter((card) => {
    if (!needle) return true;
    const name = displayName(card.card_id, card.name, catalog).toLowerCase();
    return name.includes(needle) || String(card.card_id).includes(needle);
  });

  return (
    <div className="access-block">
      <div className="access-block-head">
        <input
          value={group.name}
          aria-label="Group name"
          onChange={(event) => onChange({ ...group, name: event.target.value })}
        />
        <button type="button" className="ghost" onClick={onRemove}>
          Delete group
        </button>
      </div>
      <input
        type="search"
        value={filter}
        placeholder="Filter main deck…"
        aria-label={`Filter cards for ${group.name}`}
        onChange={(event) => onFilter(event.target.value)}
      />
      <ul className="group-members">
        {cards.map((card) => {
          const checked = members.has(card.card_id);
          return (
            <li key={card.card_id}>
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const card_ids = checked
                      ? group.card_ids.filter((id) => id !== card.card_id)
                      : [...group.card_ids, card.card_id];
                    onChange({ ...group, card_ids });
                  }}
                />
                {displayName(card.card_id, card.name, catalog)} ×{card.quantity}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ConditionEditor({
  condition,
  doc,
  catalog,
  probability,
  onChange,
  onRemove,
}: {
  condition: HandCondition;
  doc: MappingDocument;
  catalog: Catalog;
  probability: number | undefined;
  onChange: (condition: HandCondition) => void;
  onRemove: () => void;
}) {
  function updateRequirement(index: number, next: ConditionRequirement): void {
    const requirements = condition.requirements.map((item, i) =>
      i === index ? next : item,
    );
    onChange({ ...condition, requirements });
  }

  function removeRequirement(index: number): void {
    onChange({
      ...condition,
      requirements: condition.requirements.filter((_, i) => i !== index),
    });
  }

  function addRequirement(): void {
    const firstCard = doc.main[0]?.card_id;
    const next: ConditionRequirement = firstCard
      ? { kind: "card", card_id: firstCard, op: "gte", count: 1 }
      : { kind: "role", role: "starter", op: "gte", count: 1 };
    onChange({
      ...condition,
      requirements: [...condition.requirements, next],
    });
  }

  function updateExclusion(index: number, next: ConditionRequirement): void {
    const excludes = condition.excludes.map((item, i) =>
      i === index ? next : item,
    );
    onChange({ ...condition, excludes });
  }

  function removeExclusion(index: number): void {
    onChange({
      ...condition,
      excludes: condition.excludes.filter((_, i) => i !== index),
    });
  }

  function addExclusion(): void {
    const firstCard = doc.main[0]?.card_id;
    const next: ConditionRequirement = firstCard
      ? { kind: "card", card_id: firstCard, op: "gte", count: 1 }
      : { kind: "role", role: "starter", op: "gte", count: 1 };
    onChange({
      ...condition,
      excludes: [...condition.excludes, next],
    });
  }

  return (
    <div className="access-block">
      <div className="access-block-head">
        <input
          value={condition.name}
          aria-label="Hand condition name"
          onChange={(event) =>
            onChange({ ...condition, name: event.target.value })
          }
        />
        <button type="button" className="ghost" onClick={onRemove}>
          Delete
        </button>
      </div>
      <p className="access-allof">Requires</p>
      {condition.requirements.length === 0 ? (
        <p className="empty">Add at least one requirement.</p>
      ) : (
        condition.requirements.map((requirement, index) => (
          <RequirementEditor
            key={`require-${condition.id}-${index}`}
            requirement={requirement}
            doc={doc}
            catalog={catalog}
            onChange={(next) => updateRequirement(index, next)}
            onRemove={() => removeRequirement(index)}
          />
        ))
      )}
      <div className="row-actions">
        <button type="button" onClick={addRequirement}>
          + Requirement
        </button>
      </div>
      <p className="access-allof access-excludes-label">Excludes</p>
      <p className="empty access-excludes-note">
        Each exclusion rejects a hand whose composition satisfies it. Not a
        "bad card" label.
      </p>
      {condition.excludes.length === 0 ? (
        <p className="empty">No exclusions.</p>
      ) : (
        condition.excludes.map((exclusion, index) => (
          <RequirementEditor
            key={`exclude-${condition.id}-${index}`}
            requirement={exclusion}
            doc={doc}
            catalog={catalog}
            onChange={(next) => updateExclusion(index, next)}
            onRemove={() => removeExclusion(index)}
          />
        ))
      )}
      <div className="row-actions">
        <button type="button" onClick={addExclusion}>
          + Exclusion
        </button>
        {probability !== undefined ? (
          <span className="access-prob">
            Probability: {formatPercent(probability)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RequirementEditor({
  requirement,
  doc,
  catalog,
  onChange,
  onRemove,
}: {
  requirement: ConditionRequirement;
  doc: MappingDocument;
  catalog: Catalog;
  onChange: (requirement: ConditionRequirement) => void;
  onRemove: () => void;
}) {
  return (
    <div className="condition-controls access-requirement">
      <label>
        Subject
        <select
          value={requirement.kind}
          onChange={(event) => {
            const kind = event.target.value as ConditionRequirement["kind"];
            if (kind === "card") {
              onChange({
                kind: "card",
                card_id: doc.main[0]?.card_id ?? 0,
                op: requirement.op,
                count: requirement.count,
              });
            } else if (kind === "role") {
              onChange({
                kind: "role",
                role: "starter",
                op: requirement.op,
                count: requirement.count,
              });
            } else {
              onChange({
                kind: "group",
                group_id: doc.groups[0]?.id ?? "",
                op: requirement.op,
                count: requirement.count,
              });
            }
          }}
        >
          <option value="card">Card</option>
          <option value="role">Role</option>
          <option value="group">Group</option>
        </select>
      </label>

      {requirement.kind === "card" ? (
        <label className="condition-card">
          Card
          <select
            value={requirement.card_id || ""}
            onChange={(event) =>
              onChange({
                ...requirement,
                card_id: Number(event.target.value),
              })
            }
          >
            <option value="">Select card</option>
            {doc.main.map((card) => (
              <option key={card.card_id} value={card.card_id}>
                {displayName(card.card_id, card.name, catalog)} ×{card.quantity}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {requirement.kind === "role" ? (
        <label>
          Role
          <select
            value={requirement.role}
            onChange={(event) =>
              onChange({
                ...requirement,
                role: event.target.value as Role,
              })
            }
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {requirement.kind === "group" ? (
        <label>
          Group
          <select
            value={requirement.group_id}
            onChange={(event) =>
              onChange({
                ...requirement,
                group_id: event.target.value,
              })
            }
          >
            <option value="">Select group</option>
            {doc.groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label>
        Op
        <select
          value={requirement.op}
          onChange={(event) =>
            onChange({
              ...requirement,
              op: event.target.value as CountOperator,
            })
          }
        >
          {COUNT_OPERATORS.map((op) => (
            <option key={op} value={op}>
              {OP_LABELS[op]}
            </option>
          ))}
        </select>
      </label>

      <label>
        Count
        <input
          type="number"
          min={0}
          value={requirement.count}
          onChange={(event) =>
            onChange({
              ...requirement,
              count: Number(event.target.value),
            })
          }
        />
      </label>

      <button type="button" className="ghost" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

function SetEditor({
  set,
  doc,
  summary,
  setSummary,
  context,
  opening,
  sample,
  deck,
  onSetChange,
  onToggleMember,
  onRemove,
}: {
  set: HandConditionSet;
  doc: MappingDocument;
  summary: HandEventAnalysis | undefined;
  setSummary: import("../lib/handExplorer").ConditionSetSummary | undefined;
  context: import("../lib/analysisContext").AnalysisContext;
  opening: number;
  sample: number;
  deck: number;
  onSetChange: (set: HandConditionSet) => void;
  onToggleMember: (conditionId: string, member: boolean) => void;
  onRemove: () => void;
}) {
  const members = new Set(set.condition_ids);
  const conditionName = (id: string): string => {
    const condition = doc.hand_conditions.find((item) => item.id === id);
    return condition?.name ?? "unknown";
  };

  return (
    <div className="access-block">
      <div className="access-block-head">
        <input
          value={set.name}
          aria-label="Condition set name"
          onChange={(event) => onSetChange({ ...set, name: event.target.value })}
        />
        <button type="button" className="ghost" onClick={onRemove}>
          Delete set
        </button>
      </div>
      {doc.hand_conditions.length === 0 ? (
        <p className="empty">Add a Hand Condition first.</p>
      ) : (
        <ul className="engine-members">
          {doc.hand_conditions.map((condition) => {
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
      {setSummary && setSummary.conditionIds.length > 0 ? (
        <>
          <dl className="explorer-results">
            <div className="explorer-row access-union">
              <dt>
                <span className="explorer-title">Any condition</span>
                <span className="explorer-notation">
                  {isOpeningHandObservation(context)
                    ? `opening ${opening}`
                    : `first ${sample} cards seen`}
                </span>
              </dt>
              <dd>{formatPercent(setSummary.union)}</dd>
            </div>
            {setSummary.distribution.atLeast.slice(1).map((p, index) => (
              <div key={`set-at-least-${set.id}-${index + 2}`} className="explorer-row">
                <dt>
                  <span className="explorer-title">
                    At least {index + 2} conditions
                  </span>
                </dt>
                <dd>{formatPercent(p)}</dd>
              </div>
            ))}
          </dl>
          <dl className="explorer-results access-exact">
            {setSummary.distribution.exact.map((p, count) => (
              <div key={`set-exact-${set.id}-${count}`} className="explorer-row">
                <dt>
                  <span className="explorer-title">
                    Exactly {count} {count === 1 ? "condition" : "conditions"}
                  </span>
                </dt>
                <dd>{formatPercent(p)}</dd>
              </div>
            ))}
          </dl>
          {setSummary.conditionIds.length >= 2 ? (
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
                      <div key={`pair-${set.id}-${aId}-${bId}`} className="explorer-row">
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
        </>
      ) : (
        <p className="empty">
          {deck === 0
            ? "Add main-deck cards to compute set probabilities."
            : "Select at least one condition above as a member of this set."}
        </p>
      )}
    </div>
  );
}
