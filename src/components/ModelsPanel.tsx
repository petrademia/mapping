import { useMemo, useState } from "react";
import { defaultCondition, groupsToMembership, newId } from "../lib/handCondition";
import { observedCards } from "../lib/analysisContext";
import type { Catalog } from "../lib/catalog";
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
import { analyzeHandConditions } from "../lib/handExplorer";
import { modelsAnalysisKey } from "../lib/modelsAnalysisKey";
import { ProbabilityError } from "../lib/probability";
import { ConditionEditor } from "./models/ConditionEditor";
import { GroupEditor } from "./models/GroupEditor";
import { HandGoalEditor } from "./models/HandGoalEditor";


interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  onChange: (doc: MappingDocument) => void;
  onHandSize: (size: number) => void;
  /** Which view opens first; Hand Goals by default. */
  initialView?: ModelsView;
}

export type ModelsView = "groups" | "conditions" | "outcomes";

const VIEWS: { key: ModelsView; label: string }[] = [
  { key: "outcomes", label: "Hand Goals" },
  { key: "conditions", label: "Hand Conditions" },
  { key: "groups", label: "Groups" },
];

export function ModelsPanel({
  doc,
  catalog,
  onChange,
  onHandSize,
  initialView = "outcomes",
}: Props) {
  const [view, setView] = useState<ModelsView>(initialView);
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
        name: "New hand goal",
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
        Start with a Hand Goal: the hands you want to open. Build it from Hand
        Conditions, and use Groups to name sets of cards like "Handtraps".
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
            A group names a set of Main Deck cards, like "Handtraps", so a Hand
            Condition can count them together.
          </p>
          {doc.groups.length === 0 ? (
            <p className="empty">No groups yet. Add one to count several cards as a single thing.</p>
          ) : (
            doc.groups.map((group) => (
              <GroupEditor
                key={group.id}
                group={group}
                doc={doc}
                catalog={catalog}
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
            A rule about what a hand holds. It matches when every Requires line
            holds and no Excludes line does. The name is only a label.
          </p>
          {doc.hand_conditions.length === 0 ? (
            <p className="empty">
              No Hand Conditions yet. Add one here, or create one from inside a Hand Goal.
            </p>
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
          <h3 className="panel-subhead">Hand Goals</h3>
          <p className="note">
            A Hand Goal is a hand you want. It matches when the hand matches any
            of its Hand Conditions.
          </p>
          {doc.hand_condition_sets.length === 0 ? (
            <p className="empty">
              No Hand Goals yet. Add one, then pick or create the Hand Conditions that make it.
            </p>
          ) : (
            doc.hand_condition_sets.map((set) => {
              const setSummary = analysis?.sets.find(
                (row) => row.id === set.id,
              );
              return (
                <HandGoalEditor
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
            + Add Hand Goal
          </button>
        </>
      ) : null}
    </section>
  );
}

