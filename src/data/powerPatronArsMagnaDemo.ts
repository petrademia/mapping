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
 * Power Patron / Ars Magna demo for Taxonomy + Access Conditions examples
 * (Vidolium, Pendulum Treasure, Medius, Nervedo + valid S/T).
 * List is a compact research build inspired by 2026 community lists, not a
 * claimed optimal tournament deck.
 */
export const powerPatronArsMagnaDemo: MappingDocument = {
  schema_version: 4,
  name: "power_patron_ars_magna_v0",
  analysis: {
    opening_hand_size: 5,
    turn_order: "going_first",
    observation_point: "opening_hand",
  },
  access_groups: [
    {
      id: "valid-nervedo-st",
      name: "Valid Nervedo S/T",
      // Exclude Nervedo itself so "Nervedo + another S/T" cannot be one copy.
      card_ids: [
        25661743, // Prohibited Power Patron Portal - Terminus
        37279096, // Ars Magna - "Citrinitas"
        90728287, // Ars Magna - "Philosophirum"
        51669847, // Plundered Power Patron Plane - Vidolia
        36709484, // Theorealize Past Lull
        24224832, // Called by the Grave
        25311006, // Triple Tactics Talent
      ],
    },
  ],
  access_conditions: [
    {
      id: "vidolium-access",
      name: "Vidolium Access",
      requirements: [
        { kind: "card", card_id: 70488851, op: "gte", count: 1 },
      ],
    },
    {
      id: "pendulum-treasure-access",
      name: "Pendulum Treasure Access",
      requirements: [
        { kind: "card", card_id: 26237713, op: "gte", count: 1 },
      ],
    },
    {
      id: "medius-access",
      name: "Medius Access",
      requirements: [
        { kind: "card", card_id: 97556336, op: "gte", count: 1 },
      ],
    },
    {
      id: "nervedo-access",
      name: "Nervedo + valid S/T",
      requirements: [
        { kind: "card", card_id: 17473466, op: "gte", count: 1 },
        { kind: "group", group_id: "valid-nervedo-st", op: "gte", count: 1 },
      ],
    },
  ],
  main: [
    {
      card_id: 70488851,
      name: "Vidolium the Unstable Power Patron of Unity",
      quantity: 3,
      taxonomy: tax(["starter", "extender"], "desirable"),
    },
    {
      card_id: 10266279,
      name: "Junoldo the Shadespirit Power Patron",
      quantity: 1,
      taxonomy: tax(["extender"]),
    },
    {
      card_id: 17473466,
      name: "Nervedo the Shadebeast Power Patron",
      quantity: 1,
      taxonomy: tax([], "neutral"),
    },
    {
      card_id: 43871165,
      name: "Jupredo the Shademachine Power Patron",
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
      quantity: 3,
      taxonomy: tax(["starter"], "desirable"),
    },
    {
      card_id: 99753860,
      name: "Ars Magna of Unification and Separation",
      quantity: 2,
      taxonomy: tax(["extender"]),
    },
    {
      card_id: 90875418,
      name: "Theorealize Medius",
      quantity: 3,
      taxonomy: tax(["starter", "extender"]),
    },
    {
      card_id: 97556336,
      name: "Medius the Pure",
      quantity: 3,
      taxonomy: tax(["starter"], "desirable"),
    },
    {
      card_id: 77157846,
      name: "Shade the Obscure",
      quantity: 1,
      taxonomy: tax(["starter"]),
    },
    {
      card_id: 42141493,
      name: "Mulcharmy Fuwalos",
      quantity: 3,
      taxonomy: tax(["interaction"], {
        going_first: "neutral",
        going_second: "desirable",
      }),
    },
    {
      card_id: 14558129,
      name: "Ash Blossom & Joyous Spring",
      quantity: 3,
      taxonomy: tax(["interaction"], "desirable"),
    },
    {
      card_id: 59438932,
      name: "Ghost Ogre & Snow Rabbit",
      quantity: 1,
      taxonomy: tax(["interaction"]),
    },
    {
      card_id: 94145022,
      name: "Droll & Lock Bird",
      quantity: 1,
      taxonomy: tax(["interaction"]),
    },
    {
      card_id: 25661743,
      name: "Prohibited Power Patron Portal - Terminus",
      quantity: 3,
      taxonomy: tax(["starter"]),
    },
    {
      card_id: 26237713,
      name: "Pendulum Treasure",
      quantity: 1,
      taxonomy: tax(["starter"], "desirable"),
    },
    {
      card_id: 37279096,
      name: 'Ars Magna - "Citrinitas"',
      quantity: 2,
      taxonomy: tax([], "desirable"),
    },
    {
      card_id: 90728287,
      name: 'Ars Magna - "Philosophirum"',
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 51669847,
      name: "Plundered Power Patron Plane - Vidolia",
      quantity: 1,
      taxonomy: tax(["starter"]),
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
      card_id: 53589300,
      name: "Nerva the Power Patron of Creation",
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
      card_id: 68231287,
      name: "Jupiter the Power Patron of Destruction",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 74631897,
      name: "Artmage Non-Finito",
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
    {
      card_id: 93039340,
      name: "Super Starslayer TY-PHON - Sky Crisis",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 92812851,
      name: "Exceed the Pendulum",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 22125101,
      name: "Beyond the Pendulum",
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
      card_id: 74586817,
      name: "PSY-Framelord Omega",
      quantity: 1,
      taxonomy: tax(),
    },
  ],
  side: [],
};
