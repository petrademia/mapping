import { useEffect, useState } from "react";
import type { CountOperator } from "../../lib/handExplorer";
import type { MappingDocument } from "../../lib/document";
import { openingQualityCoverage, type Role } from "../../lib/taxonomy";

export const OP_LABELS: Record<CountOperator, string> = {
  eq: "=",
  neq: "≠",
  gte: "≥",
  lte: "≤",
  gt: ">",
  lt: "<",
};

export const ROLE_LABELS: Record<Role, string> = {
  starter: "Starter",
  extender: "Extender",
  interaction: "Interaction",
  lasting: "Lasting disruption",
  lasting_second: "Lasting disruption, going second",
};

export function EntityNotes({
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

export function DeferredNameInput({
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

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatPercentOrDash(value: number | null): string {
  return value === null ? "—" : formatPercent(value);
}

export function coverageWarning(
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
