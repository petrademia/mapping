import type { Catalog } from "../../lib/catalog";
import type { Group } from "../../lib/handCondition";
import type { MappingDocument } from "../../lib/document";
import { DeckPicker } from "../ModelArt";
import { DeferredNameInput, EntityNotes } from "./shared";

export function GroupEditor({
  group,
  doc,
  catalog,
  normalSummon,
  onChange,
  onNormalSummon,
  onRemove,
}: {
  group: Group;
  doc: MappingDocument;
  catalog: Catalog;
  /** This is the Group of cards that each need the Normal Summon. */
  normalSummon: boolean;
  onChange: (group: Group) => void;
  /** Only one Group can be the Normal Summon Group; choosing this one replaces another. */
  onNormalSummon: (on: boolean) => void;
  onRemove: () => void;
}) {
  const members = new Set(group.card_ids);

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
      <label className="check-row">
        <input
          type="checkbox"
          checked={normalSummon}
          onChange={(event) => onNormalSummon(event.target.checked)}
        />
        <span>
          Uses the Normal Summon
          <small>
            Each card here needs your one Normal Summon a turn, so only one can be
            used. The handtrap analysis counts a second copy as no backup.
          </small>
        </span>
      </label>
      <p className="note">
        {members.size === 0
          ? "Click the cards that belong in this group."
          : `${members.size} ${members.size === 1 ? "card" : "cards"} in this group. Click a card to add or remove it.`}
      </p>
      <DeckPicker
        deck={doc.main}
        catalog={catalog}
        selected={members}
        label={`Cards in ${group.name || "group"}`}
        onToggle={(cardId) =>
          onChange({
            ...group,
            card_ids: members.has(cardId)
              ? group.card_ids.filter((id) => id !== cardId)
              : [...group.card_ids, cardId],
          })
        }
      />
    </div>
  );
}
