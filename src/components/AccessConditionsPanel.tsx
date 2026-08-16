import { useMemo, useState } from "react";
import {
  groupsToMembership,
  newAccessId,
  type AccessCondition,
  type AccessGroup,
} from "../lib/access";
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
  removeAccessCondition,
  removeAccessGroup,
  sectionSize,
  upsertAccessCondition,
  upsertAccessGroup,
  type MappingDocument,
} from "../lib/document";
import {
  COUNT_OPERATORS,
  summarizeAccessConditions,
  type CountOperator,
  type HandCondition,
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

export function AccessConditionsPanel({
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
      return summarizeAccessConditions(
        doc.main,
        sample,
        doc.access_conditions,
        groupsToMembership(doc.access_groups),
      );
    } catch (caught) {
      return {
        error:
          caught instanceof ProbabilityError
            ? caught.message
            : "Cannot compute access probabilities.",
      };
    }
  }, [doc.main, doc.access_conditions, doc.access_groups, deck, sample]);

  function addCondition(): void {
    const firstCard = doc.main[0]?.card_id;
    onChange(
      upsertAccessCondition(doc, {
        id: newAccessId("access"),
        name: "New access",
        requirements: firstCard
          ? [{ kind: "card", card_id: firstCard, op: "gte", count: 1 }]
          : [],
      }),
    );
  }

  function addGroup(): void {
    onChange(
      upsertAccessGroup(doc, {
        id: newAccessId("group"),
        name: "New group",
        card_ids: [],
      }),
    );
  }

  return (
    <section className="panel">
      <header>
        <h2>Access Conditions</h2>
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
        Human-defined access hypotheses evaluated under{" "}
        {analysisContextLabel(context, opening)} —{" "}
        {sampleSizeDescription(context, opening)}. ALL OF within a condition; OR
        across conditions for modeled access. Not combo routes, resilience, or
        YAPPING utility.
        {!isOpeningHandObservation(context)
          ? " Satisfaction among first cards seen does not imply the line was available during the opponent's first turn."
          : ""}{" "}
        If a combo needs “Nervedo + another S/T”, exclude Nervedo from that
        group so one copy cannot satisfy both requirements.
      </p>

      <h3 className="panel-subhead">Groups</h3>
      <p className="note">
        Named Main Deck card sets for requirements. Deck-specific helpers — not
        taxonomy labels.
      </p>
      {doc.access_groups.length === 0 ? (
        <p className="empty">No groups yet.</p>
      ) : (
        doc.access_groups.map((group) => (
          <GroupEditor
            key={group.id}
            group={group}
            doc={doc}
            catalog={catalog}
            filter={groupFilter}
            onFilter={setGroupFilter}
            onChange={(next) => onChange(upsertAccessGroup(doc, next))}
            onRemove={() => onChange(removeAccessGroup(doc, group.id))}
          />
        ))
      )}
      <button type="button" onClick={addGroup}>
        + Add group
      </button>

      <h3 className="panel-subhead">Conditions</h3>
      {doc.access_conditions.length === 0 ? (
        <p className="empty">No access conditions yet.</p>
      ) : (
        doc.access_conditions.map((condition) => {
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
              onChange={(next) => onChange(upsertAccessCondition(doc, next))}
              onRemove={() => onChange(removeAccessCondition(doc, condition.id))}
            />
          );
        })
      )}
      <button type="button" onClick={addCondition}>
        + Add Access Condition
      </button>

      <h3 className="panel-subhead">Modeled Engine Access</h3>
      {deck === 0 ? (
        <p className="empty">Add main-deck cards to compute access rates.</p>
      ) : summary && "error" in summary ? (
        <p className="error">{summary.error}</p>
      ) : summary ? (
        <dl className="explorer-results">
          {summary.conditions.map((row) => (
            <div key={row.id} className="explorer-row">
              <dt>
                <span className="explorer-title">{row.name}</span>
              </dt>
              <dd>{formatPercent(row.probability)}</dd>
            </div>
          ))}
          <div className="explorer-row access-union">
            <dt>
              <span className="explorer-title">
                At least one access condition
              </span>
              <span className="explorer-notation">
                Modeled Engine Access ·{" "}
                {isOpeningHandObservation(context)
                  ? `opening ${opening}`
                  : `first ${sample} cards seen`}
              </span>
            </dt>
            <dd>{formatPercent(summary.anyAccess)}</dd>
          </div>
        </dl>
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
  group: AccessGroup;
  doc: MappingDocument;
  catalog: Catalog;
  filter: string;
  onFilter: (value: string) => void;
  onChange: (group: AccessGroup) => void;
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
  condition: AccessCondition;
  doc: MappingDocument;
  catalog: Catalog;
  probability: number | undefined;
  onChange: (condition: AccessCondition) => void;
  onRemove: () => void;
}) {
  function updateRequirement(index: number, next: HandCondition): void {
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
    const next: HandCondition = firstCard
      ? { kind: "card", card_id: firstCard, op: "gte", count: 1 }
      : { kind: "role", role: "starter", op: "gte", count: 1 };
    onChange({
      ...condition,
      requirements: [...condition.requirements, next],
    });
  }

  return (
    <div className="access-block">
      <div className="access-block-head">
        <input
          value={condition.name}
          aria-label="Access condition name"
          onChange={(event) =>
            onChange({ ...condition, name: event.target.value })
          }
        />
        <button type="button" className="ghost" onClick={onRemove}>
          Delete
        </button>
      </div>
      <p className="access-allof">ALL OF</p>
      {condition.requirements.length === 0 ? (
        <p className="empty">Add at least one requirement.</p>
      ) : (
        condition.requirements.map((requirement, index) => (
          <RequirementEditor
            key={`${condition.id}-${index}`}
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
  requirement: HandCondition;
  doc: MappingDocument;
  catalog: Catalog;
  onChange: (requirement: HandCondition) => void;
  onRemove: () => void;
}) {
  return (
    <div className="condition-controls access-requirement">
      <label>
        Subject
        <select
          value={requirement.kind}
          onChange={(event) => {
            const kind = event.target.value as HandCondition["kind"];
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
                group_id: doc.access_groups[0]?.id ?? "",
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
            {doc.access_groups.map((group) => (
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
