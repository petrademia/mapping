# MAPPING

MAPPING is a local, human-in-the-loop deck semantics editor. Given a Yu-Gi-Oh! deck list, you assign **analytical roles** to cards, inspect role density and theoretical opening-hand composition probabilities, and export configuration that [YAPPING](https://github.com/petrademia/yapping) can load.

It is not a combo solver, replay parser, or full deckbuilding website.

```text
MAPPING                 YAPPING                 RAPPING
deck + semantics        search + measurement    replay trajectories
        |                      ^                         |
        +---- config --------->+<---- trajectories ------+
```

Later, YAPPING solver outcomes can flow back into this UI. That display path is out of scope for v0.

## Card metadata versus analytical roles

**Card metadata** comes from the OCGCore/YGOPro card database (`cards.cdb`): id, name, monster/spell/trap, level, and so on.

**Analytical roles** are labels you attach in a specific deck or configuration: `starter`, `extender`, `interaction`, `recovery`, `brick`, `engine_requirement`, or any other string. They are not card types.

A card may carry several roles at once. Three copies of a card that is both `starter` and `extender` add three slots to each role. Role-density totals can exceed deck size on purpose. MAPPING does not force a single bucket per card.

Roles are contextual: `role(card, deck)`, not `role(card)`. The same card can be an extender here and a brick in another deck. v0 does not guess roles with a model.

## Opening chances are not combo success

The probability panel reports **composition probabilities** for the main deck: hypergeometric `P(X = k)` and `P(X ≥ 1)` for each role independently, with a configurable opening-hand size (default 5).

That is the chance a random opening contains some number of cards that you tagged with that role. It is not `E[utility | starter ≥ 1]`, combo quality, or interruption resilience. Those require YAPPING solver outcomes.

Joint events such as `P(starter ≥ 1 AND extender ≥ 1)` are not shown in v0. Roles overlap and draws are without replacement, so those events are not independent products.

## v0 scope

- create/load a deck (MAPPING JSON, YDK, or pasted id/quantity lines)
- edit quantities and multi-label roles
- inspect main/extra/side sizes and overlapping role density
- inspect per-role composition probabilities
- save locally (browser `localStorage` plus file download)
- export a YAPPING-readable archetype JSON

## Non-goals

OCGCore, combo search, minimax, MCTS, RL, policy/value models, replay parsing, automatic role inference, automatic ratio optimization, accounts, cloud sync, tournament or marketplace features, collection management, and a replacement for existing deckbuilding sites.

## Stack

Client-only Vite + React + TypeScript. Vitest covers the role model, hypergeometric math, and import/export. There is no application server.

Why this stack: fast local `npm run dev`, strict types, tests without a browser, and persistence that is just files plus `localStorage`. A backend is not required for v0.

Card names are a generated lookup in `public/catalog.json`, extracted from the sibling YAPPING `assets/cards.cdb` (the same SQLite texts table YAPPING uses). Regenerate with `npm run extract-catalog` when that database changes. Unknown ids still work; they display as `#<id>`.

## Schema

MAPPING owns a versioned document:

```json
{
  "schema_version": 1,
  "name": "branded_albaz_v1",
  "vocabulary": ["starter", "extender", "interaction", "recovery", "brick", "engine_requirement"],
  "main": [{ "card_id": 62962630, "quantity": 3, "roles": ["starter", "extender"] }],
  "extra": [],
  "side": [],
  "analysis": { "opening_hand_size": 5 }
}
```

YAPPING currently loads `configs/archetypes/*.json` with:

- `name`
- `main_deck` / `extra_deck`: repeated card ids, one entry per copy
- `card_roles`: `{ "<id>": ["starter", "extender"] }`
- optional interruption specs, fixtures, predicates, weights, and objectives that MAPPING does not author

**Export for YAPPING** is a deterministic conversion (`exportYapping()`), not a second role model. It expands quantities into repeated ids, unions roles by card id, and stores opening-hand size plus side-deck copies under `metadata`. It does not emit combo fixtures or interruption policies.

Round-trip the `.mapping.json` file if you need lossless main/extra/side plus per-section roles. Feed the `.yapping.json` file to `yapping.load_archetype`.

## Develop

```bash
cd mapping
npm install
npm run dev
```

```bash
npm test
npm run typecheck
npm run build
```

The first-run demo is the realistic Branded list from YAPPING `configs/archetypes/branded.json`, including that file's existing role annotations.
