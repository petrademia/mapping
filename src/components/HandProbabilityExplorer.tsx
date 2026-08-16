import { useMemo, useState } from "react";
import {
  analysisContextLabel,
  observedCards,
  sampleSizeDescription,
} from "../lib/analysisContext";
import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import {
  analysisContextOf,
  sectionSize,
  type MappingDocument,
} from "../lib/document";
import {
  compareHandConditions,
  COUNT_OPERATORS,
  type CountOperator,
  type HandCondition,
  type ProbabilityResult,
} from "../lib/handExplorer";
import { ProbabilityError } from "../lib/probability";
import { ROLES, type Role } from "../lib/taxonomy";

type SubjectKind = "card" | "role";

interface ConditionDraft {
  kind: SubjectKind;
  card_id: number | null;
  role: Role;
  op: CountOperator;
  count: number;
}

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

function defaultDraft(): ConditionDraft {
  return {
    kind: "role",
    card_id: null,
    role: "starter",
    op: "gte",
    count: 1,
  };
}

function toCondition(draft: ConditionDraft): HandCondition | null {
  if (!Number.isInteger(draft.count) || draft.count < 0) return null;
  if (draft.kind === "card") {
    if (draft.card_id === null) return null;
    return {
      kind: "card",
      card_id: draft.card_id,
      op: draft.op,
      count: draft.count,
    };
  }
  return {
    kind: "role",
    role: draft.role,
    op: draft.op,
    count: draft.count,
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function conditionLabel(
  draft: ConditionDraft,
  catalog: Catalog,
  doc: MappingDocument,
): string {
  const op = OP_LABELS[draft.op];
  if (draft.kind === "role") {
    return `${ROLE_LABELS[draft.role]} ${op} ${draft.count}`;
  }
  if (draft.card_id === null) return `Card ${op} ${draft.count}`;
  const row = doc.main.find((card) => card.card_id === draft.card_id);
  const name = displayName(draft.card_id, row?.name, catalog);
  return `${name} ${op} ${draft.count}`;
}

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  onHandSize: (size: number) => void;
}

export function HandProbabilityExplorer({ doc, catalog, onHandSize }: Props) {
  const [draftA, setDraftA] = useState<ConditionDraft>(() => ({
    ...defaultDraft(),
    role: "starter",
  }));
  const [draftB, setDraftB] = useState<ConditionDraft>(() => ({
    ...defaultDraft(),
    role: "extender",
  }));
  const [cardFilterA, setCardFilterA] = useState("");
  const [cardFilterB, setCardFilterB] = useState("");

  const deck = sectionSize(doc.main);
  const opening = doc.analysis.opening_hand_size;
  const context = analysisContextOf(doc);
  const sample = observedCards(context, opening);

  const result = useMemo(():
    | { ok: true; value: ProbabilityResult; labelA: string; labelB: string }
    | { ok: false; error: string }
    | null => {
    const conditionA = toCondition(draftA);
    const conditionB = toCondition(draftB);
    if (!conditionA || !conditionB) return null;
    if (deck === 0) {
      return { ok: false, error: "Add main-deck cards to compare opening hands." };
    }
    try {
      return {
        ok: true,
        value: compareHandConditions(doc.main, sample, {
          conditionA,
          conditionB,
        }),
        labelA: conditionLabel(draftA, catalog, doc),
        labelB: conditionLabel(draftB, catalog, doc),
      };
    } catch (caught) {
      return {
        ok: false,
        error:
          caught instanceof ProbabilityError
            ? caught.message
            : "Cannot compute these opening-hand probabilities.",
      };
    }
  }, [draftA, draftB, doc, catalog, deck, sample]);

  return (
    <section className="panel">
      <header>
        <h2>Opening-hand explorer</h2>
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
        Exact occurrence probabilities for two conditions under{" "}
        {analysisContextLabel(context, opening)} —{" "}
        {sampleSizeDescription(context, opening)}. Not strategic value, combo
        success, or resilience — those belong to YAPPING.
      </p>

      <ConditionEditor
        title="Condition A"
        draft={draftA}
        onChange={setDraftA}
        doc={doc}
        catalog={catalog}
        cardFilter={cardFilterA}
        onCardFilter={setCardFilterA}
      />
      <ConditionEditor
        title="Condition B"
        draft={draftB}
        onChange={setDraftB}
        doc={doc}
        catalog={catalog}
        cardFilter={cardFilterB}
        onCardFilter={setCardFilterB}
      />

      <h3 className="panel-subhead">Results</h3>
      {result === null ? (
        <p className="empty">Choose subjects for both conditions.</p>
      ) : !result.ok ? (
        <p className="error">{result.error}</p>
      ) : (
        <dl className="explorer-results">
          <ResultRow
            title={`Open ${result.labelA}`}
            notation="P(A)"
            value={result.value.pA}
          />
          <ResultRow
            title={`Open ${result.labelB}`}
            notation="P(B)"
            value={result.value.pB}
          />
          <ResultRow
            title="Open both"
            notation="P(A ∩ B)"
            value={result.value.pIntersection}
          />
          <ResultRow
            title={`${result.labelB} when ${result.labelA}`}
            notation="P(B | A)"
            value={result.value.pBGivenA}
            undefinedHint="Undefined because P(A) = 0"
          />
          <ResultRow
            title={`${result.labelA} when ${result.labelB}`}
            notation="P(A | B)"
            value={result.value.pAGivenB}
            undefinedHint="Undefined because P(B) = 0"
          />
        </dl>
      )}
    </section>
  );
}

function ResultRow({
  title,
  notation,
  value,
  undefinedHint,
}: {
  title: string;
  notation: string;
  value: number | null;
  undefinedHint?: string;
}) {
  const display =
    value === null ? (
      <span className="undefined" title={undefinedHint}>
        —
      </span>
    ) : (
      formatPercent(value)
    );
  return (
    <div className="explorer-row">
      <dt>
        <span className="explorer-title">{title}</span>
        <span className="explorer-notation">{notation}</span>
      </dt>
      <dd>{display}</dd>
    </div>
  );
}

function ConditionEditor({
  title,
  draft,
  onChange,
  doc,
  catalog,
  cardFilter,
  onCardFilter,
}: {
  title: string;
  draft: ConditionDraft;
  onChange: (draft: ConditionDraft) => void;
  doc: MappingDocument;
  catalog: Catalog;
  cardFilter: string;
  onCardFilter: (value: string) => void;
}) {
  const filter = cardFilter.trim().toLowerCase();
  const options = doc.main.filter((card) => {
    if (!filter) return true;
    const name = displayName(card.card_id, card.name, catalog).toLowerCase();
    return (
      name.includes(filter) || String(card.card_id).includes(filter)
    );
  });

  return (
    <div className="condition-block">
      <h3 className="panel-subhead">{title}</h3>
      <div className="condition-controls">
        <label>
          Subject
          <select
            value={draft.kind}
            onChange={(event) => {
              const kind = event.target.value as SubjectKind;
              onChange({
                ...draft,
                kind,
                card_id:
                  kind === "card"
                    ? (draft.card_id ?? doc.main[0]?.card_id ?? null)
                    : draft.card_id,
              });
            }}
          >
            <option value="card">Card</option>
            <option value="role">Role</option>
          </select>
        </label>

        {draft.kind === "card" ? (
          <label className="condition-card">
            Card
            <input
              type="search"
              value={cardFilter}
              placeholder="Filter main deck…"
              onChange={(event) => onCardFilter(event.target.value)}
              aria-label={`${title} card filter`}
            />
            <select
              value={draft.card_id ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                onChange({
                  ...draft,
                  card_id: value === "" ? null : Number(value),
                });
              }}
              aria-label={`${title} card`}
            >
              <option value="">Select card</option>
              {options.map((card) => (
                <option key={card.card_id} value={card.card_id}>
                  {displayName(card.card_id, card.name, catalog)} ×
                  {card.quantity}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Role
            <select
              value={draft.role}
              onChange={(event) =>
                onChange({ ...draft, role: event.target.value as Role })
              }
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Op
          <select
            value={draft.op}
            onChange={(event) =>
              onChange({
                ...draft,
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
            value={draft.count}
            onChange={(event) =>
              onChange({ ...draft, count: Number(event.target.value) })
            }
          />
        </label>
      </div>
    </div>
  );
}
