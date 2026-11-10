import { useEffect, useRef, useState } from "react";
import {
  clearConfigurations,
  clearGroups,
  clearHandConditions,
  clearModeledOutcomes,
  clearSection,
  clearTags,
  sectionSize,
  type MappingDocument,
} from "../lib/document";
import { ClearButton } from "./ClearButton";

interface Props {
  doc: MappingDocument;
  onChange: (doc: MappingDocument) => void;
  onStatus: (message: string) => void;
}

function isTagged(card: MappingDocument["main"][number]): boolean {
  return (
    card.taxonomy.roles.length > 0 ||
    card.taxonomy.opening_quality.going_first !== null ||
    card.taxonomy.opening_quality.going_second !== null
  );
}

/** Cards with at least one tag. */
function tagCount(doc: MappingDocument): number {
  return [...doc.main, ...doc.extra, ...doc.side].filter(isTagged).length;
}

/** Conditions placed in outcomes plus user-made outcomes. */
function outcomeCount(doc: MappingDocument): number {
  const members = doc.hand_condition_sets.reduce(
    (sum, set) => sum + set.condition_ids.length,
    0,
  );
  return members + Math.max(doc.hand_condition_sets.length - 1, 0);
}

/** One place to clear any part of the workspace, each with its own confirm. */
export function ClearMenu({ doc, onChange, onStatus }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Behave like a menu: close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: {
    label: string;
    /** Shown beside the label so it is clear what there is to clear. */
    count: number;
    message: string;
    run: () => MappingDocument;
    done: string;
  }[] = [
    {
      label: "Main Deck",
      count: sectionSize(doc.main),
      message: `Remove all ${sectionSize(doc.main)} cards from the Main Deck?`,
      run: () => clearSection(doc, "main"),
      done: "Cleared the Main Deck",
    },
    {
      label: "Extra Deck",
      count: sectionSize(doc.extra),
      message: `Remove all ${sectionSize(doc.extra)} cards from the Extra Deck?`,
      run: () => clearSection(doc, "extra"),
      done: "Cleared the Extra Deck",
    },
    {
      label: "Side Deck",
      count: sectionSize(doc.side),
      message: `Remove all ${sectionSize(doc.side)} cards from the Side Deck?`,
      run: () => clearSection(doc, "side"),
      done: "Cleared the Side Deck",
    },
    {
      label: "Tags",
      count: tagCount(doc),
      message: "Reset Roles and Opening Quality on every card? Cards stay.",
      run: () => clearTags(doc),
      done: "Cleared all tags",
    },
    {
      label: "Groups",
      count: doc.groups.length,
      message: `Remove all ${doc.groups.length} Groups? Their lines leave Hand Conditions too.`,
      run: () => clearGroups(doc),
      done: "Cleared all Groups",
    },
    {
      label: "Hand Conditions",
      count: doc.hand_conditions.length,
      message: `Remove all ${doc.hand_conditions.length} Hand Conditions? They leave every Modeled Outcome.`,
      run: () => clearHandConditions(doc),
      done: "Cleared all Hand Conditions",
    },
    {
      label: "Modeled Outcomes",
      count: outcomeCount(doc),
      message: "Empty every Modeled Outcome? Engine Access stays, empty.",
      run: () => clearModeledOutcomes(doc),
      done: "Cleared all Modeled Outcomes",
    },
    {
      label: "Post-Side lists",
      count: doc.configurations.length,
      message: `Remove all ${doc.configurations.length} Post-Side lists?`,
      run: () => clearConfigurations(doc),
      done: "Cleared all Post-Side lists",
    },
  ];

  const anything = items.some((item) => item.count > 0);

  return (
    <div className="clear-menu" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Clear
      </button>
      {open ? (
        <div className="clear-popover" role="group" aria-label="Clear">
          {anything ? null : <p className="empty">Nothing to clear yet.</p>}
          <ul>
            {items.map((item) => (
              <li key={item.label}>
                <ClearButton
                  label={item.label}
                  detail={item.count}
                  message={item.message}
                  disabled={item.count === 0}
                  onConfirm={() => {
                    onChange(item.run());
                    onStatus(item.done);
                    setOpen(false);
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
