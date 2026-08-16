# MAPPING

MAPPING is a local, human-in-the-loop deck semantics editor. Given a Yu-Gi-Oh! deck list, you assign **Taxonomy v0** annotations to cards, inspect role and opening-quality density plus theoretical opening-hand composition probabilities, and export configuration that [YAPPING](https://github.com/petrademia/yapping) can load.

It is not a combo solver, replay parser, or full deckbuilding website.

```text
MAPPING                 YAPPING                 RAPPING
deck + semantics        search + measurement    replay trajectories
        |                      ^                         |
        +---- config --------->+<---- trajectories ------+
```

Later, YAPPING solver outcomes can flow back into this UI. That display path is out of scope for v0.

## Taxonomy v0

Two independent dimensions on each **deck card** (not on a global card definition):

```text
TAXONOMY
Role                    Opening Quality
├── starter             ├── desirable
├── extender            ├── neutral
└── interaction         └── undesirable
                        (null = unclassified)
```

| Dimension | Cardinality | Values |
| --- | --- | --- |
| **Role** | multi-select | `starter`, `extender`, `interaction` |
| **Opening Quality** | single-select | `desirable`, `neutral`, `undesirable`, or `null` |

- `null` means the user has not evaluated opening quality.
- `neutral` means the user evaluated it and considers it neither desirable nor undesirable.
- Do not flatten these into one tag list. They have different meanings and constraints.
- Annotations are **human deckbuilding hypotheses** for a specific deck/configuration: `Role(card, deck)`, not objective card properties.
- MAPPING does not encode combo routes, access targets, choke points, or card-effect semantics.

Removed from the built-in taxonomy (do not use as Role values): `recovery`, `brick`, `engine_requirement`. Legacy `brick` migrates to Opening Quality `undesirable`. `recovery` and `engine_requirement` are dropped on schema migration without remapping.

### Role definitions (hypotheses)

- **starter** — meaningful initial engine access from an opening hand in this deck.
- **extender** — meaningful additional engine capability when some access already exists. May coexist with starter.
- **interaction** — meaningful ability to interact with the opponent from the relevant opening-hand context. Subtypes (hand trap, board breaker, etc.) are out of v0.

### Opening quality definitions (hypotheses)

- **desirable** — naturally opening the card is generally desirable in this deck.
- **neutral** — explicitly evaluated as neither meaningfully desirable nor undesirable.
- **undesirable** — naturally opening the card is generally undesirable (replaces manual `brick`).

A card may hold zero, one, or several roles. Three copies tagged starter + extender contribute +3 to each role's slot count. Role-density totals can exceed deck size. Opening-quality slots are mutually exclusive per card entry and should sum to main-deck size when including unclassified.

## MAPPING vs YAPPING

MAPPING provides:

- deck composition and quantities
- human taxonomy hypotheses (Role + Opening Quality)

YAPPING is expected to measure (not implemented here):

- starter / extender strength
- draw value
- recovery value
- interruption resilience
- going-first / going-second value
- marginal deck value
- route similarity
- choke-point redundancy

## Card metadata versus taxonomy

**Card metadata** (id, name) comes from **MyCard** [`ygopro-database`](https://github.com/mycard/ygopro-database) `locales/en-US/cards.cdb`. Ids are Konami/MyCard passwords.

Taxonomy lives on the deck card entry only.

## Opening chances are not combo success

The probability panel reports **composition probabilities** for the main deck: hypergeometric chances for role and undesirable opening-quality counts, with a configurable opening-hand size (default 5).

That is the chance a random opening contains some number of cards you tagged. It is not win rate, combo quality, or interruption resilience.

Joint events such as `P(starter ≥ 1 AND extender ≥ 1)` are not shown as products of marginals. Roles overlap and draws are without replacement.

## v0 scope

- create/load a deck (MAPPING JSON, YDK, or pasted id/quantity lines)
- edit quantities and Taxonomy v0 annotations
- inspect main/extra/side sizes, overlapping role density, and opening-quality counts
- inspect per-role and undesirable composition probabilities
- save locally (browser `localStorage` plus file download)
- export a YAPPING-readable archetype JSON

## Non-goals

Automatic role or opening-quality inference, card-effect parsing, route annotation, access targets, combo dependencies, choke-point modeling, AI classification, YAPPING search integration, RL/ML, automatic deck optimization, OCGCore, accounts, cloud sync, and a replacement for existing deckbuilding sites.

## Stack

Client-only Vite + React + TypeScript. Vitest covers the taxonomy model, hypergeometric math, and import/export. There is no application server.

## Schema

MAPPING owns a versioned document (`schema_version: 2`):

```json
{
  "schema_version": 2,
  "name": "branded_albaz_v1",
  "main": [{
    "card_id": 62962630,
    "quantity": 3,
    "taxonomy": {
      "roles": ["starter", "extender"],
      "opening_quality": "desirable"
    }
  }],
  "extra": [],
  "side": [],
  "analysis": { "opening_hand_size": 5 }
}
```

Unclassified opening quality is serialized as `"opening_quality": null`, never silently as `"neutral"`.

Schema v1 documents (flat `roles` array + optional `vocabulary`) are accepted on load and migrated: `brick` → `undesirable`; `recovery` / `engine_requirement` dropped; schema bumped to 2.

YAPPING currently loads `configs/archetypes/*.json` with:

- `name`
- `main_deck` / `extra_deck`: repeated card ids, one entry per copy
- `card_roles`: `{ "<id>": ["starter", "extender"] }` (Role dimension only)
- `metadata.card_opening_quality`: explicit opening-quality map (unclassified omitted)
- optional interruption specs, fixtures, predicates, weights, and objectives that MAPPING does not author

**Export for YAPPING** is a deterministic conversion (`exportYapping()`). Round-trip the `.mapping.json` file if you need lossless main/extra/side plus taxonomy. Feed the `.yapping.json` file to `yapping.load_archetype`.

## Develop

```bash
cd mapping
npm install
npm run dev
```

Dev server: http://localhost:51173 (pinned in `vite.config.ts`; see `~/Projects/PORTS.md`).

```bash
npm test
npm run typecheck
npm run build
npm run extract-catalog
```

The first-run demo is the Branded list from YAPPING `configs/archetypes/branded.json`, with Taxonomy v0 annotations (legacy flat roles migrated).
