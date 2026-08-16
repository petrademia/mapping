import type { MappingDocument } from "../lib/document";
import {
  type CardTaxonomy,
  type ContextualOpeningQuality,
  type OpeningQualityValue,
} from "../lib/taxonomy";

type QualityArg = OpeningQualityValue | ContextualOpeningQuality;

/**
 * Accepts a legacy scalar quality (applied to both contexts) or a contextual
 * `{ going_first, going_second }` object.
 */
function tax(
  roles: CardTaxonomy["roles"] = [],
  opening_quality: QualityArg = null,
): CardTaxonomy {
  return {
    roles,
    opening_quality:
      typeof opening_quality === "object" && opening_quality !== null
        ? opening_quality
        : { going_first: opening_quality, going_second: opening_quality },
  };
}

/**
 * Elfnote / Ars Magna demo for Taxonomy examples (Regina multi-role,
 * Rhapsodia interaction + undesirable opening quality).
 * Compact research build inspired by 2026 community Elfnote Ars Magna lists.
 */
export const elfnoteArsMagnaDemo: MappingDocument = {
  schema_version: 4,
  name: "elfnote_ars_magna_v0",
  analysis: {
    opening_hand_size: 5,
    turn_order: "going_first",
    observation_point: "opening_hand",
  },
  access_groups: [],
  access_conditions: [
    {
      id: "regina-access",
      name: "Regina Access",
      requirements: [
        { kind: "card", card_id: 56651978, op: "gte", count: 1 },
      ],
    },
    {
      id: "lucina-access",
      name: "Lucina Access",
      requirements: [
        { kind: "card", card_id: 13597785, op: "gte", count: 1 },
      ],
    },
    {
      id: "vidolium-access",
      name: "Vidolium Access",
      requirements: [
        { kind: "card", card_id: 70488851, op: "gte", count: 1 },
      ],
    },
    {
      id: "medius-access",
      name: "Medius Access",
      requirements: [
        { kind: "card", card_id: 97556336, op: "gte", count: 1 },
      ],
    },
  ],
  main: [
    {
      card_id: 70488851,
      name: "Vidolium the Unstable Power Patron of Unity",
      quantity: 1,
      taxonomy: tax(["starter", "extender"], "desirable"),
    },
    {
      card_id: 10266279,
      name: "Junoldo the Shadespirit Power Patron",
      quantity: 1,
      taxonomy: tax(["extender"]),
    },
    {
      card_id: 36270527,
      name: "Ars Magna of Infinity and Finity",
      quantity: 3,
      taxonomy: tax(["starter"], "desirable"),
    },
    {
      card_id: 62368221,
      name: "Ars Magna of Purification and Corruption",
      quantity: 2,
      taxonomy: tax(["starter"], "desirable"),
    },
    {
      card_id: 99753860,
      name: "Ars Magna of Unification and Separation",
      quantity: 1,
      taxonomy: tax(["extender"]),
    },
    {
      card_id: 13597785,
      name: "Elfnote Lucina",
      quantity: 3,
      taxonomy: tax(["starter", "extender"], "desirable"),
    },
    {
      card_id: 59581480,
      name: "Elfnote Tinia",
      quantity: 2,
      taxonomy: tax(["extender"]),
    },
    {
      card_id: 85976588,
      name: "Elfnote Fortuna",
      quantity: 1,
      taxonomy: tax(["extender"]),
    },
    {
      card_id: 56651978,
      name: "Elfnote Regina",
      quantity: 3,
      taxonomy: tax(["starter", "extender", "interaction"], "desirable"),
    },
    {
      card_id: 12375297,
      name: "Elfnote Power Patron",
      quantity: 2,
      taxonomy: tax(["extender"]),
    },
    {
      card_id: 90875418,
      name: "Theorealize Medius",
      quantity: 1,
      taxonomy: tax(["starter", "extender"]),
    },
    {
      card_id: 97556336,
      name: "Medius the Pure",
      quantity: 2,
      taxonomy: tax(["starter"], "desirable"),
    },
    {
      card_id: 42141493,
      name: "Mulcharmy Fuwalos",
      quantity: 3,
      taxonomy: tax(["interaction"], "desirable"),
    },
    {
      card_id: 14558129,
      name: "Ash Blossom & Joyous Spring",
      quantity: 3,
      taxonomy: tax(["interaction"], "desirable"),
    },
    {
      card_id: 25661743,
      name: "Prohibited Power Patron Portal - Terminus",
      quantity: 2,
      taxonomy: tax(["starter"]),
    },
    {
      card_id: 37279096,
      name: 'Ars Magna - "Citrinitas"',
      quantity: 1,
      taxonomy: tax([], "desirable"),
    },
    {
      card_id: 36709484,
      name: "Theorealize Past Lull",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 24224832,
      name: "Called by the Grave",
      quantity: 1,
      taxonomy: tax(["interaction"]),
    },
    {
      card_id: 25311006,
      name: "Triple Tactics Talent",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 24299458,
      name: "Forbidden Droplet",
      quantity: 3,
      taxonomy: tax(["interaction"]),
    },
    {
      card_id: 98829635,
      name: "Forbidden Crown",
      quantity: 3,
      taxonomy: tax(["interaction"]),
    },
    {
      card_id: 64491754,
      name: "Elfnotes: Welcome Home",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 24092792,
      name: "Elfnotes: Rhapsodia of Madness",
      quantity: 1,
      taxonomy: tax(["interaction"], "undesirable"),
    },
  ],
  extra: [
    {
      card_id: 4063756,
      name: "Medicurius the Power Patron of Illusions",
      quantity: 2,
      taxonomy: tax(),
    },
    {
      card_id: 31822037,
      name: "Purification Power Patron",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 5914858,
      name: "Junora the Power Patron of Tuning",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 5559570,
      name: "Elfnote June Pride",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 42302563,
      name: "Elfnote Seraphim Strelitzia",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 27184601,
      name: "Artmage Diactorus",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 22850703,
      name: "Chaos Angel",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 50954680,
      name: "Crystal Wing Synchro Dragon",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 74586817,
      name: "PSY-Framelord Omega",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 33158448,
      name: "F.A. Dawn Dragster",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 90953320,
      name: "T.G. Hyper Librarian",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 96633955,
      name: "Swordsoul Supreme Sovereign - Chengying",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 29301451,
      name: "S:P Little Knight",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 65741789,
      name: "I:P Masquerena",
      quantity: 1,
      taxonomy: tax(),
    },
  ],
  side: [],
};
