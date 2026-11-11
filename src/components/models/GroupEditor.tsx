import type { Catalog } from "../../lib/catalog";
import type { Group } from "../../lib/handCondition";
import type { MappingDocument } from "../../lib/document";
import { DeckPicker } from "../ModelArt";
import { DeferredNameInput, EntityNotes } from "./shared";

export function GroupEditor({
  group,
  doc,
  catalog,
  onChange,
  onRemove,
}: {
  group: Group;
  doc: MappingDocument;
  catalog: Catalog;
  onChange: (group: Group) => void;
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
