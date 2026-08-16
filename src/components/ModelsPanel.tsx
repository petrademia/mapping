import { useEffect, useMemo, useState } from "react";
import {
  isPresenceRequirement,
  type DistinctMatchConstraint,
} from "../lib/distinctMatch";
import {
  defaultCondition,
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
import { modelsAnalysisKey } from "../lib/modelsAnalysisKey";
import { ProbabilityError } from "../lib/probability";
import { sortCheckedFirst } from "../lib/sortCheckedFirst";
import { openingQualityCoverage, ROLES, type Role } from "../lib/taxonomy";

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

function EntityNotes({
  value,
  label,
  onCommit,
}: {
  value: string | undefined;
  label: string;
  onCommit: (notes: string) => void;
}) {
  const committed = value ?? "";
  const [draft, setDraft] = useState(committed);
  useEffect(() => {
    setDraft(committed);
  }, [committed]);
  return (
    <textarea
      className="entity-notes"
      value={draft}
      placeholder="Optional notes…"
      aria-label={label}
      rows={2}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== committed) onCommit(draft);
      }}
    />
  );
}

function DeferredNameInput({
  value,
  placeholder,
  label,
  onCommit,
}: {
  value: string;
  placeholder: string;
  label: string;
  onCommit: (name: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <input
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
    />
  );
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatPercentOrDash(value: number | null): string {
  return value === null ? "—" : formatPercent(value);
}

function coverageWarning(
  turnOrder: "going_first" | "going_second",
  doc: MappingDocument,
): string | null {
  const coverage = openingQualityCoverage(doc.main);
  const cov =
    turnOrder === "going_first" ? coverage.going_first : coverage.going_second;
  if (cov.total === 0 || cov.classified >= cov.total) return null;
  const fraction = cov.classified / cov.total;
  return `Only ${formatPercent(fraction)} of deck slots have Opening Quality classified for ${
    turnOrder === "going_first" ? "Going First" : "Going Second"
  }; interpret this distribution with incomplete coverage.`;
}

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  onChange: (doc: MappingDocument) => void;
  onHandSize: (size: number) => void;
}

type ModelsView = "groups" | "conditions" | "outcomes";

const VIEWS: { key: ModelsView; label: string }[] = [
  { key: "groups", label: "Groups" },
  { key: "conditions", label: "Hand Conditions" },
  { key: "outcomes", label: "Modeled Outcomes" },
];

export function ModelsPanel({
  doc,
  catalog,
  onChange,
  onHandSize,
}: Props) {
  const [view, setView] = useState<ModelsView>("groups");
  const [groupFilter, setGroupFilter] = useState("");
  const deck = sectionSize(doc.main);
  const opening = doc.analysis.opening_hand_size;
  const context = analysisContextOf(doc);
  const sample = observedCards(context, opening);

  const analysisKey = modelsAnalysisKey({
    main: doc.main,
    groups: doc.groups,
    hand_conditions: doc.hand_conditions,
    hand_condition_sets: doc.hand_condition_sets,
    sample,
    turn_order: context.turn_order,
    engine_access_set_id: doc.engine_access_set_id,
  });

  const summary = useMemo(() => {
    if (deck === 0) return null;
    try {
      return analyzeHandConditions(
        doc.main,
        sample,
        doc.hand_conditions,
        doc.hand_condition_sets,
        groupsToMembership(doc.groups),
        context.turn_order,
      );
    } catch (caught) {
      return {
        error:
          caught instanceof ProbabilityError
            ? caught.message
            : "Cannot compute hand condition probabilities.",
      };
    }
    // analysisKey ignores name/notes; structural edits still recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional fingerprint
  }, [analysisKey, deck]);

  function addCondition(): void {
    const firstCard = doc.main[0]?.card_id;
    onChange(
      upsertHandCondition(doc, {
        id: newId("condition"),
        name: "New hand condition",
        requirements: firstCard
          ? [defaultCondition("card", { card_id: firstCard })]
          : [],
        excludes: [],
        distinct_constraints: [],
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

  function addOutcome(): void {
    onChange(
      upsertHandConditionSet(doc, {
        id: newId("outcome"),
        name: "New modeled outcome",
        condition_ids: [],
        aggregation: "any",
      }),
    );
  }

  /** Create a Hand Condition and return its id (for inline outcome authoring). */
  function createConditionForOutcome(): string {
    const id = newId("condition");
    const firstCard = doc.main[0]?.card_id;
    onChange(
      upsertHandCondition(doc, {
        id,
        name: "New hand condition",
        requirements: firstCard
          ? [defaultCondition("card", { card_id: firstCard })]
          : [],
        excludes: [],
        distinct_constraints: [],
      }),
    );
    return id;
  }

  const analysis =
    summary && !("error" in summary) ? summary : undefined;
  const probabilityOf = (conditionId: string): number | undefined =>
    analysis?.conditions.find((row) => row.id === conditionId)?.probability;

  return (
    <section className="panel">
      <header>
        <h2>Models</h2>
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
        Define Groups, then reusable Hand Conditions, then combine conditions
        into Modeled Outcomes. Everything is evaluated under{" "}
        {analysisContextLabel(context, opening)} —{" "}
        {sampleSizeDescription(context, opening)}. Not combo routes,
        resilience, or YAPPING utility.
      </p>

      <nav className="context-presets models-nav" aria-label="Models">
        {VIEWS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={`context-chip${view === entry.key ? " on" : ""}`}
            onClick={() => setView(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {view === "groups" ? (
        <>
          <h3 className="panel-subhead">Groups</h3>
          <p className="note">
            Named Main Deck card sets for predicates: "which cards are
            interchangeable for this pattern?" Deck-specific helpers - not
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
        </>
      ) : null}

      {view === "conditions" ? (
        <>
          <h3 className="panel-subhead">Hand Conditions</h3>
          <p className="note">
            Define card patterns that make an opening hand satisfy something you
            care about. MAPPING evaluates each pattern across all possible
            opening hands to calculate its exact probability. A condition's
            name can document a strategic assertion (for example "through 1
            Ash") while the Requires/Excludes predicate is the actual Boolean
            rule.
          </p>
          {doc.hand_conditions.length === 0 ? (
            <p className="empty">No hand conditions yet.</p>
          ) : (
            doc.hand_conditions.map((condition) => (
              <ConditionEditor
                key={condition.id}
                condition={condition}
                doc={doc}
                catalog={catalog}
                probability={probabilityOf(condition.id)}
                onChange={(next) => onChange(upsertHandCondition(doc, next))}
                onRemove={() => onChange(removeHandCondition(doc, condition.id))}
              />
            ))
          )}
          <button type="button" onClick={addCondition}>
            + Add Hand Condition
          </button>
        </>
      ) : null}

      {view === "outcomes" ? (
        <>
          <h3 className="panel-subhead">Modeled Outcomes</h3>
          <p className="note">
            Combine Hand Conditions into outcomes you care about. An outcome is
            satisfied when ANY selected Hand Condition matches the opening
            hand. Overlapping matching conditions are counted once.
          </p>
          {doc.hand_condition_sets.length === 0 ? (
            <p className="empty">No modeled outcomes yet.</p>
          ) : (
            doc.hand_condition_sets.map((set) => {
              const setSummary = analysis?.sets.find(
                (row) => row.id === set.id,
              );
              return (
                <ModeledOutcomeEditor
                  key={set.id}
                  set={set}
                  doc={doc}
                  catalog={catalog}
                  summary={analysis}
                  setSummary={setSummary}
                  context={context}
                  opening={opening}
                  sample={sample}
                  deck={deck}
                  onSetChange={(next) =>
                    onChange(upsertHandConditionSet(doc, next))
                  }
                  onToggleMember={(conditionId, member) =>
                    onChange(
                      setConditionSetMember(doc, set.id, conditionId, member),
                    )
                  }
                  onCreateCondition={createConditionForOutcome}
                  onEditCondition={(next) =>
                    onChange(upsertHandCondition(doc, next))
                  }
                  onRemoveCondition={(conditionId) =>
                    onChange(removeHandCondition(doc, conditionId))
                  }
                  onRemove={() =>
                    onChange(removeHandConditionSet(doc, set.id))
                  }
                />
              );
            })
          )}
          <button type="button" onClick={addOutcome}>
            + Add Modeled Outcome
          </button>
        </>
      ) : null}
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
  const cards = sortCheckedFirst(
    doc.main.filter((card) => {
      if (!needle) return true;
      const name = displayName(card.card_id, card.name, catalog).toLowerCase();
      return name.includes(needle) || String(card.card_id).includes(needle);
    }),
    (card) => members.has(card.card_id),
  );

  return (
    <div className="access-block">
      <div className="access-block-head">
        <DeferredNameInput
          value={group.name}
          placeholder="Untitled group"
          label="Group name"
          onCommit={(name) => onChange({ ...group, name })}
        />
        <button type="button" className="ghost" onClick={onRemove}>
          Delete group
        </button>
      </div>
      <EntityNotes
        value={group.notes}
        label={`Notes for ${group.name || "group"}`}
        onCommit={(notes) => onChange({ ...group, notes })}
      />
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
    const next = firstCard
      ? defaultCondition("card", { card_id: firstCard })
      : defaultCondition("role", { role: "starter" });
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
    const next = firstCard
      ? defaultCondition("card", { card_id: firstCard })
      : defaultCondition("role", { role: "starter" });
    onChange({
      ...condition,
      excludes: [...condition.excludes, next],
    });
  }

  function addDistinctConstraint(): void {
    const eligible = condition.requirements.filter(
      (requirement) => requirement.id && isPresenceRequirement(requirement),
    );
    if (eligible.length < 2) return;
    const constraint: DistinctMatchConstraint = {
      id: newId("distinct"),
      requirement_ids: [eligible[0]!.id!, eligible[1]!.id!],
      distinct_by: "card_name",
    };
    onChange({
      ...condition,
      distinct_constraints: [
        ...(condition.distinct_constraints ?? []),
        constraint,
      ],
    });
  }

  function updateDistinctConstraint(
    index: number,
    next: DistinctMatchConstraint,
  ): void {
    const distinct_constraints = (condition.distinct_constraints ?? []).map(
      (item, i) => (i === index ? next : item),
    );
    onChange({ ...condition, distinct_constraints });
  }

  function removeDistinctConstraint(index: number): void {
    onChange({
      ...condition,
      distinct_constraints: (condition.distinct_constraints ?? []).filter(
        (_, i) => i !== index,
      ),
    });
  }

  const presenceRequirements = condition.requirements.filter(
    (requirement) => requirement.id && isPresenceRequirement(requirement),
  );
  const canAddDistinct = presenceRequirements.length >= 2;

  return (
    <div className="access-block">
      <div className="access-block-head">
        <DeferredNameInput
          value={condition.name}
          placeholder="Untitled hand condition"
          label="Hand condition name"
          onCommit={(name) => onChange({ ...condition, name })}
        />
        <button type="button" className="ghost" onClick={onRemove}>
          Delete
        </button>
      </div>
      <EntityNotes
        value={condition.notes}
        label={`Notes for ${condition.name || "hand condition"}`}
        onCommit={(notes) => onChange({ ...condition, notes })}
      />
      <p className="access-allof">Requires</p>
      {condition.requirements.length === 0 ? (
        <p className="empty">Add at least one requirement.</p>
      ) : (
        condition.requirements.map((requirement, index) => (
          <RequirementEditor
            key={requirement.id ?? `require-${condition.id}-${index}`}
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
            key={exclusion.id ?? `exclude-${condition.id}-${index}`}
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
      </div>
      <p className="access-allof">Distinct matches</p>
      <p className="empty access-excludes-note">
        Selected ≥ 1 requirements must be satisfied by different card names.
        Count predicates (≥ 2, = 2, …) are unchanged and cannot join a
        distinct constraint.
      </p>
      {(condition.distinct_constraints ?? []).length === 0 ? (
        <p className="empty">No distinct-card constraints.</p>
      ) : (
        (condition.distinct_constraints ?? []).map((constraint, index) => (
          <DistinctConstraintEditor
            key={constraint.id}
            constraint={constraint}
            requirements={condition.requirements}
            doc={doc}
            catalog={catalog}
            onChange={(next) => updateDistinctConstraint(index, next)}
            onRemove={() => removeDistinctConstraint(index)}
          />
        ))
      )}
      <div className="row-actions">
        <button
          type="button"
          onClick={addDistinctConstraint}
          disabled={!canAddDistinct}
          title={
            canAddDistinct
              ? undefined
              : "Need at least two Requires rows of the form ≥ 1"
          }
        >
          + Distinct constraint
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

function requirementLabel(
  requirement: ConditionRequirement,
  doc: MappingDocument,
  catalog: Catalog,
): string {
  const subject =
    requirement.kind === "card"
      ? displayName(requirement.card_id, undefined, catalog)
      : requirement.kind === "role"
        ? ROLE_LABELS[requirement.role]
        : doc.groups.find((group) => group.id === requirement.group_id)?.name ??
          requirement.group_id;
  const op = OP_LABELS[requirement.op];
  return `${subject} ${op} ${requirement.count}`;
}

function DistinctConstraintEditor({
  constraint,
  requirements,
  doc,
  catalog,
  onChange,
  onRemove,
}: {
  constraint: DistinctMatchConstraint;
  requirements: readonly ConditionRequirement[];
  doc: MappingDocument;
  catalog: Catalog;
  onChange: (constraint: DistinctMatchConstraint) => void;
  onRemove: () => void;
}) {
  const eligible = requirements.filter(
    (requirement) => requirement.id && isPresenceRequirement(requirement),
  );
  const selected = new Set(constraint.requirement_ids);
  const missing = constraint.requirement_ids.filter(
    (id) => !requirements.some((requirement) => requirement.id === id),
  );
  const unsupported = constraint.requirement_ids.filter((id) => {
    const requirement = requirements.find((item) => item.id === id);
    return requirement !== undefined && !isPresenceRequirement(requirement);
  });

  function toggle(requirementId: string): void {
    const next = selected.has(requirementId)
      ? constraint.requirement_ids.filter((id) => id !== requirementId)
      : [...constraint.requirement_ids, requirementId];
    onChange({ ...constraint, requirement_ids: next });
  }

  return (
    <div className="distinct-constraint">
      <p className="access-excludes-note">
        These requirements must be satisfied by different card names:
      </p>
      {eligible.length === 0 ? (
        <p className="empty">No ≥ 1 requirements available.</p>
      ) : (
        <ul className="distinct-requirement-list">
          {eligible.map((requirement) => (
            <li key={requirement.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(requirement.id!)}
                  onChange={() => toggle(requirement.id!)}
                />{" "}
                {requirementLabel(requirement, doc, catalog)}
              </label>
            </li>
          ))}
        </ul>
      )}
      {selected.size < 2 ? (
        <p className="hand-fail">Select at least two requirements.</p>
      ) : null}
      {missing.length > 0 ? (
        <p className="hand-fail">
          References removed requirements; save repairs this constraint.
        </p>
      ) : null}
      {unsupported.length > 0 ? (
        <p className="hand-fail">
          Only ≥ 1 requirements can participate in distinct matching.
        </p>
      ) : null}
      <p className="explorer-notation">Distinct by: card name</p>
      <div className="row-actions">
        <button type="button" className="ghost" onClick={onRemove}>
          Remove constraint
        </button>
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
            const id = requirement.id;
            if (kind === "card") {
              onChange({
                ...(id ? { id } : {}),
                kind: "card",
                card_id: doc.main[0]?.card_id ?? 0,
                op: requirement.op,
                count: requirement.count,
              });
            } else if (kind === "role") {
              onChange({
                ...(id ? { id } : {}),
                kind: "role",
                role: "starter",
                op: requirement.op,
                count: requirement.count,
              });
            } else {
              onChange({
                ...(id ? { id } : {}),
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

function ModeledOutcomeEditor({
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
  setSummary: import("../lib/handExplorer").ConditionSetSummary | undefined;
  context: import("../lib/analysisContext").AnalysisContext;
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
          placeholder="Untitled modeled outcome"
          label="Modeled outcome name"
          onCommit={(name) => onSetChange({ ...set, name })}
        />
        <button type="button" className="ghost" onClick={onRemove}>
          Delete outcome
        </button>
      </div>
      <EntityNotes
        value={set.notes}
        label={`Notes for ${set.name || "modeled outcome"}`}
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
                Among hands satisfying this outcome
                ({formatPercent(setSummary.union)}), by the{" "}
                {context.turn_order === "going_first"
                  ? "Going First"
                  : "Going Second"}{" "}
                Opening Quality annotation.
              </p>
              {setSummary.openingQuality.undesirable[0] === null ? (
                <p className="empty">
                  No hands currently satisfy this modeled outcome.
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
            ? "Add main-deck cards to compute outcome probabilities."
            : "Select at least one condition above as a member of this outcome."}
        </p>
      )}
    </div>
  );
}
