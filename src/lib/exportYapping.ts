import {
  expandCopies,
  sectionSize,
  type MappingDocument,
} from "./document";
import { uniqueRoles } from "./roles";

export interface YappingExport {
  name: string;
  main_deck: number[];
  extra_deck: number[];
  card_roles: Record<string, string[]>;
  metadata: {
    source: "mapping";
    mapping_schema_version: 1;
    opening_hand_size: number;
    deck_size: number;
    extra_deck_size: number;
    side_deck_size: number;
    side_deck: number[];
    vocabulary: string[];
  };
}

function mergedRoles(doc: MappingDocument): Record<string, string[]> {
  const roles = new Map<number, string[]>();
  for (const section of [doc.main, doc.extra, doc.side] as const) {
    for (const card of section) {
      const current = roles.get(card.card_id) ?? [];
      roles.set(card.card_id, uniqueRoles([...current, ...card.roles]));
    }
  }
  const result: Record<string, string[]> = {};
  for (const [cardId, cardRoles] of roles) {
    if (cardRoles.length === 0) continue;
    result[String(cardId)] = cardRoles;
  }
  return result;
}

export function exportYapping(doc: MappingDocument): YappingExport {
  const main_deck = expandCopies(doc.main);
  const extra_deck = expandCopies(doc.extra);
  const side_deck = expandCopies(doc.side);
  return {
    name: doc.name.trim() || "untitled",
    main_deck,
    extra_deck,
    card_roles: mergedRoles(doc),
    metadata: {
      source: "mapping",
      mapping_schema_version: 1,
      opening_hand_size: doc.analysis.opening_hand_size,
      deck_size: sectionSize(doc.main),
      extra_deck_size: sectionSize(doc.extra),
      side_deck_size: sectionSize(doc.side),
      side_deck,
      vocabulary: doc.vocabulary,
    },
  };
}

export function serializeYapping(doc: MappingDocument): string {
  return `${JSON.stringify(exportYapping(doc), null, 2)}\n`;
}
