import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import type { MappingCard } from "../lib/document";
import type { OpeningQualityValue, Role } from "../lib/taxonomy";
import { OpeningQualityEditor } from "./OpeningQualityEditor";
import { QuantityEditor } from "./QuantityEditor";
import { RoleEditor } from "./RoleEditor";

interface Props {
  card: MappingCard;
  catalog: Catalog;
  onQuantity: (quantity: number) => void;
  onRoles: (roles: Role[]) => void;
  onOpeningQuality: (
    turnOrder: "going_first" | "going_second",
    value: OpeningQualityValue,
  ) => void;
  onRemove: () => void;
}

export function CardRow({
  card,
  catalog,
  onQuantity,
  onRoles,
  onOpeningQuality,
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
      <td className="taxonomy-cell">
        <RoleEditor roles={card.taxonomy.roles} onChange={onRoles} />
        <OpeningQualityEditor
          value={card.taxonomy.opening_quality}
          onChange={onOpeningQuality}
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