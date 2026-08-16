import type { MappingDocument } from "../lib/document";
import type { CardTaxonomy } from "../lib/taxonomy";

function tax(
  roles: CardTaxonomy["roles"] = [],
  opening_quality: CardTaxonomy["opening_quality"] = null,
): CardTaxonomy {
  return { roles, opening_quality };
}

/** Branded demo with Taxonomy v0 annotations (migrated from flat roles). */
export const brandedDemo: MappingDocument = {
  schema_version: 3,
  name: "branded_albaz_v1",
  analysis: {
    opening_hand_size: 5,
    turn_order: "going_first",
    observation_point: "opening_hand",
  },
  access_groups: [],
  access_conditions: [],
  main: [
    {
      card_id: 73819701,
      name: "Fallen of the White Dragon",
      quantity: 2,
      taxonomy: tax(["starter"]),
    },
    {
      card_id: 68468459,
      name: "Fallen of Albaz",
      quantity: 1,
      taxonomy: tax([], "undesirable"),
    },
    {
      card_id: 45883110,
      name: "Guiding Quem, the Virtuous",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 55273560,
      name: "Incredible Ecclesia, the Virtuous",
      quantity: 2,
      taxonomy: tax(["starter", "extender"]),
    },
    {
      card_id: 95515789,
      name: "Blazing Cartesia, the Virtuous",
      quantity: 2,
      taxonomy: tax(["extender"], "undesirable"),
    },
    {
      card_id: 19304410,
      name: "Tri-Brigade Springans Kitt",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 45484331,
      name: "Springans Kitt",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 60303688,
      name: "Dogmatika Ecclesia, the Virtuous",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 33854624,
      name: "Bystial Magnamhut",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 19096726,
      name: "Tri-Brigade Mercourier",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 82489470,
      name: "The Golden Swordsoul",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 84192580,
      name: "Mulcharmy Purulia",
      quantity: 3,
      taxonomy: tax(["starter"]),
    },
    {
      card_id: 42141493,
      name: "Mulcharmy Fuwalos",
      quantity: 2,
      taxonomy: tax(),
    },
    {
      card_id: 14558127,
      name: "Ash Blossom & Joyous Spring",
      quantity: 2,
      taxonomy: tax(["interaction"], "desirable"),
    },
    {
      card_id: 59438930,
      name: "Ghost Ogre & Snow Rabbit",
      quantity: 2,
      taxonomy: tax(["interaction"]),
    },
    {
      card_id: 23434538,
      name: 'Maxx "C"',
      quantity: 1,
      taxonomy: tax(["interaction"]),
    },
    {
      card_id: 94145021,
      name: "Droll & Lock Bird",
      quantity: 1,
      taxonomy: tax(["interaction"]),
    },
    {
      card_id: 1984618,
      name: "Nadir Servant",
      quantity: 3,
      taxonomy: tax(["starter"]),
    },
    {
      card_id: 30271097,
      name: "The Fallen & The Virtuous",
      quantity: 3,
      taxonomy: tax(["extender"]),
    },
    {
      card_id: 29948294,
      name: "Branded in High Spirits",
      quantity: 3,
      taxonomy: tax(),
    },
    {
      card_id: 44362883,
      name: "Branded Fusion",
      quantity: 1,
      taxonomy: tax(["starter"]),
    },
    {
      card_id: 82738008,
      name: "Branded in Red",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 17751597,
      name: "Branded Retribution",
      quantity: 1,
      taxonomy: tax([], "undesirable"),
    },
    {
      card_id: 75500286,
      name: "Gold Sarcophagus",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 25311006,
      name: "Triple Tactics Talent",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 10045474,
      name: "Infinite Impermanence",
      quantity: 3,
      taxonomy: tax(["interaction"]),
    },
    {
      card_id: 98829635,
      name: "Forbidden Crown",
      quantity: 2,
      taxonomy: tax(),
    },
    {
      card_id: 62962630,
      name: "Aluber the Jester of Despia",
      quantity: 3,
      taxonomy: tax(["starter"]),
    },
  ],
  extra: [
    {
      card_id: 76666602,
      name: "The Dragon that Devours the Dogma",
      quantity: 2,
      taxonomy: tax(),
    },
    {
      card_id: 44146295,
      name: "Mirrorjade the Iceblade Dragon",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 24915933,
      name: "Granguignol the Dusk Dragon",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 72272462,
      name: "Despian Quaeritis",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 72578374,
      name: "Khaos Starsource Dragon",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 70534340,
      name: "Lubellion the Searing Dragon",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 1906812,
      name: "Sprind the Irondash Dragon",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 51409648,
      name: "Rindbrumm the Striking Dragon",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 3410461,
      name: "Alba-Lenatus the Abyss Dragon",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 41373230,
      name: "Titaniklad the Ash Dragon",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 87746184,
      name: "Albion the Branded Dragon",
      quantity: 1,
      taxonomy: tax(),
    },
    {
      card_id: 78397661,
      name: "Ecclesia and the Dark Dragon",
      quantity: 2,
      taxonomy: tax(),
    },
    {
      card_id: 74405783,
      name: "The Three Champions of Swordsoul",
      quantity: 1,
      taxonomy: tax(),
    },
  ],
  side: [],
};
