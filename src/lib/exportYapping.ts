import {
  expandCopies,
  SCHEMA_VERSION,
  sectionSize,
  type MappingDocument,
} from "./document";
import {
  openingQualityForTurn,
  uniqueRoles,
  type OpeningQualityValue,
  type Role,
} from "./taxonomy";

export interface YappingExport {
  name: string;
  main_deck: number[];
  extra_deck: number[];
  card_roles: Record<string, Role[]>;
  metadata: {
    source: "mapping";
    mapping_schema_version: typeof SCHEMA_VERSION;
    opening_hand_size: number;
    deck_size: number;
    extra_deck_size: number;
    side_deck_size: number;
    side_deck: number[];
    /** Role dimension only (Taxonomy v0). */
    roles: Role[];
    /** Contextual opening quality by card id; omitted entries are unclassified. */
    card_opening_quality: Record<
      "going_first" | "going_second",
      Record<string, Exclude<OpeningQualityValue, null>>
    >;
  };
}

function mergedRoles(doc: MappingDocument): Record<string, Role[]> {
  const roles = new Map<number, Role[]>();
  for (const section of [doc.main, doc.extra, doc.side] as const) {
    for (const card of section) {
      const current = roles.get(card.card_id) ?? [];
      roles.set(card.card_id, uniqueRoles([...current, ...card.taxonomy.roles]));
    }
  }
  const result: Record<string, Role[]> = {};
  for (const [cardId, cardRoles] of roles) {
    if (cardRoles.length === 0) continue;
    result[String(cardId)] = cardRoles;
  }
  return result;
}

type QualityById = Record<string, Exclude<OpeningQualityValue, null>>;

function mergedOpeningQualityForTurn(
  doc: MappingDocument,
  turnOrder: "going_first" | "going_second",
): QualityById {
  const qualities = new Map<number, Exclude<OpeningQualityValue, null>>();
  for (const section of [doc.main, doc.extra, doc.side] as const) {
    for (const card of section) {
      const quality = openingQualityForTurn(
        card.taxonomy.opening_quality,
        turnOrder,
      );
      if (quality === null) continue;
      if (!qualities.has(card.card_id)) {
        qualities.set(card.card_id, quality);
      }
    }
  }
  const result: QualityById = {};
  for (const [cardId, quality] of qualities) {
    result[String(cardId)] = quality;
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
      mapping_schema_version: SCHEMA_VERSION,
      opening_hand_size: doc.analysis.opening_hand_size,
      deck_size: sectionSize(doc.main),
      extra_deck_size: sectionSize(doc.extra),
      side_deck_size: sectionSize(doc.side),
      side_deck,
      roles: ["starter", "extender", "interaction"],
      card_opening_quality: {
        going_first: mergedOpeningQualityForTurn(doc, "going_first"),
        going_second: mergedOpeningQualityForTurn(doc, "going_second"),
      },
    },
  };
}

export function serializeYapping(doc: MappingDocument): string {
  return `${JSON.stringify(exportYapping(doc), null, 2)}\n`;
}
