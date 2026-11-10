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

function hasTags(doc: MappingDocument): boolean {
  return [...doc.main, ...doc.extra, ...doc.side].some(
    (card) =>
      card.taxonomy.roles.length > 0 ||
      card.taxonomy.opening_quality.going_first !== null ||
      card.taxonomy.opening_quality.going_second !== null,
  );
}

/** One place to clear any part of the workspace, each with its own confirm. */
export function ClearMenu({ doc, onChange, onStatus }: Props) {
  const emptyOutcomes =
    doc.hand_condition_sets.every((set) => set.condition_ids.length === 0) &&
    doc.hand_condition_sets.length <= 1;

  const items: {
    label: string;
    message: string;
    empty: boolean;
    run: () => MappingDocument;
    done: string;
  }[] = [
    {
      label: "Main Deck",
      message: `Remove all ${sectionSize(doc.main)} cards from the Main Deck?`,
      empty: doc.main.length === 0,
      run: () => clearSection(doc, "main"),
      done: "Cleared the Main Deck",
    },
    {
      label: "Extra Deck",
      message: `Remove all ${sectionSize(doc.extra)} cards from the Extra Deck?`,
      empty: doc.extra.length === 0,
      run: () => clearSection(doc, "extra"),
      done: "Cleared the Extra Deck",
    },
    {
      label: "Side Deck",
      message: `Remove all ${sectionSize(doc.side)} cards from the Side Deck?`,
      empty: doc.side.length === 0,
      run: () => clearSection(doc, "side"),
      done: "Cleared the Side Deck",
    },
    {
      label: "Tags",
      message: "Reset Roles and Opening Quality on every card? Cards stay.",
      empty: !hasTags(doc),
      run: () => clearTags(doc),
      done: "Cleared all tags",
    },
    {
      label: "Groups",
      message: `Remove all ${doc.groups.length} Groups? Their lines leave Hand Conditions too.`,
      empty: doc.groups.length === 0,
      run: () => clearGroups(doc),
      done: "Cleared all Groups",
    },
    {
      label: "Hand Conditions",
      message: `Remove all ${doc.hand_conditions.length} Hand Conditions? They leave every Modeled Outcome.`,
      empty: doc.hand_conditions.length === 0,
      run: () => clearHandConditions(doc),
      done: "Cleared all Hand Conditions",
    },
    {
      label: "Modeled Outcomes",
      message: "Empty every Modeled Outcome? Engine Access stays, empty.",
      empty: emptyOutcomes,
      run: () => clearModeledOutcomes(doc),
      done: "Cleared all Modeled Outcomes",
    },
    {
      label: "Post-Side lists",
      message: `Remove all ${doc.configurations.length} Post-Side lists?`,
      empty: doc.configurations.length === 0,
      run: () => clearConfigurations(doc),
      done: "Cleared all Post-Side lists",
    },
  ];

  return (
    <details className="clear-menu">
      <summary>Clear</summary>
      <ul>
        {items.map((item) => (
          <li key={item.label}>
            <ClearButton
              label={item.label}
              message={item.message}
              disabled={item.empty}
              onConfirm={() => {
                onChange(item.run());
                onStatus(item.done);
              }}
            />
          </li>
        ))}
      </ul>
    </details>
  );
}
