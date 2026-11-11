import { useState } from "react";
import { isPresenceRequirement, type DistinctMatchConstraint } from "../../lib/distinctMatch";
import { defaultCondition, newId, type HandCondition } from "../../lib/handCondition";
import type { Catalog } from "../../lib/catalog";
import { displayName } from "../../lib/catalog";
import type { MappingDocument } from "../../lib/document";
import { COUNT_OPERATORS, type ConditionRequirement, type CountOperator } from "../../lib/handExplorer";
import { CardStrip, conditionCards, DeckPicker, requirementCards } from "../ModelArt";
import { ROLES, type Role } from "../../lib/taxonomy";
import { DeferredNameInput, EntityNotes, formatPercent, OP_LABELS, ROLE_LABELS } from "./shared";

export function ConditionEditor({
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
      <CardStrip
        cardIds={conditionCards(condition, doc)}
        deck={doc.main}
        catalog={catalog}
        max={10}
        label={`Cards ${condition.name || "this condition"} reads`}
      />
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
  const [picking, setPicking] = useState(false);
  const counted = requirementCards(requirement, doc);
  return (
    <div className="requirement-block">
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
        <span className="condition-card">
          Card
          <button
            type="button"
            className="requirement-card"
            aria-expanded={picking}
            aria-label={
              requirement.card_id
                ? `Card: ${displayName(requirement.card_id, doc.main.find((c) => c.card_id === requirement.card_id)?.name, catalog)}. Change`
                : "Choose a card"
            }
            onClick={() => setPicking((open) => !open)}
          >
            {requirement.card_id ? (
              <CardStrip cardIds={[requirement.card_id]} deck={doc.main} catalog={catalog} />
            ) : (
              <span className="requirement-choose">Choose a card</span>
            )}
          </button>
        </span>
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
      {requirement.kind === "card" && picking ? (
        <DeckPicker
          deck={doc.main}
          catalog={catalog}
          selected={new Set(requirement.card_id ? [requirement.card_id] : [])}
          label="Choose a card"
          onToggle={(cardId) => {
            onChange({ ...requirement, card_id: cardId });
            setPicking(false);
          }}
        />
      ) : null}
      {requirement.kind !== "card" ? (
        <CardStrip
          cardIds={counted}
          deck={doc.main}
          catalog={catalog}
          max={14}
          label="Cards this counts"
        />
      ) : null}
    </div>
  );
}
