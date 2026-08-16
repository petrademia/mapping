import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import type { MappingCard } from "../lib/document";
import { QuantityEditor } from "./QuantityEditor";
import { RoleEditor } from "./RoleEditor";

interface Props {
  card: MappingCard;
  catalog: Catalog;
  vocabulary: string[];
  onQuantity: (quantity: number) => void;
  onRoles: (roles: string[]) => void;
  onAddVocabulary: (role: string) => void;
  onRemove: () => void;
}

export function CardRow({
  card,
  catalog,
  vocabulary,
  onQuantity,
  onRoles,
  onAddVocabulary,
  onRemove,
}: Props) {
  return (
    <tr>
      <td className="card-name">
        <strong>{displayName(card.card_id, card.name, catalog)}</strong>
        <span className="card-id">{card.card_id}</span>
      </td>
      <td>
        <QuantityEditor value={card.quantity} onChange={onQuantity} />
      </td>
      <td>
        <RoleEditor
          roles={card.roles}
          vocabulary={vocabulary}
          onChange={onRoles}
          onAddVocabulary={onAddVocabulary}
        />
      </td>
      <td>
        <button type="button" className="ghost" onClick={onRemove}>
          Remove
        </button>
      </td>
    </tr>
  );
}
