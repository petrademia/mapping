import type { Catalog } from "../../lib/catalog";
import type { Group } from "../../lib/handCondition";
import type { MappingDocument } from "../../lib/document";
import { DeckPicker } from "../ModelArt";
import { DeferredNameInput, EntityNotes } from "./shared";

export function GroupEditor({
  group,
  doc,
  catalog,
  chokePoint,
  onChange,
  onChokePoint,
  onRemove,
}: {
  group: Group;
  doc: MappingDocument;
  catalog: Catalog;
  /** The cards of this Group share one bottleneck, so only one of them can complete a turn. */
  chokePoint: boolean;
  onChange: (group: Group) => void;
  onChokePoint: (on: boolean) => void;
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
          checked={chokePoint}
          onChange={(event) => onChokePoint(event.target.checked)}
        />
        <span>
          Only one of these can complete a turn
          <small>
            A shared bottleneck, such as your one Normal Summon, or a once-per-turn
            effect every route runs through. If it is stopped, a second card from this
            Group is no backup. You can mark more than one Group.
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
