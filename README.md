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
- human Access Conditions (modeled opening-hand engine access)

YAPPING is expected to measure (not implemented here):

- starter / extender strength
- draw value
- recovery value
- interruption resilience
- going-first / going-second value
- marginal deck value
- route similarity
- choke-point redundancy

### Taxonomy vs Access Conditions vs YAPPING

| Layer | What it is |
| --- | --- |
| **Taxonomy** | Card-level human role hypothesis (`starter` / `extender` / `interaction`) |
| **Access Condition** | Hand-level human access hypothesis (ALL OF card/role/group requirements) |
| **YAPPING** | Strategic validation / game-tree outcomes |

Example: classifying `Nervedo` as `starter` can be misleading if Nervedo alone does not establish the line. Prefer an Access Condition such as:

```text
Nervedo Access
  ALL OF
    Nervedo >= 1
    Valid Nervedo S/T >= 1   (user-defined group; exclude Nervedo itself)
```

MAPPING then reports how often that hand condition occurs. It does **not** encode the Non-Finito → Citrinitas trajectory, Ash resilience, or whether two Access Conditions are strategically independent routes (they may converge on the same choke point).

**Modeled Engine Access** is the exact probability that at least one configured Access Condition is satisfied. Conditions that overlap are not double-counted. Do not label this combo success, playability, or win rate.

If a requirement needs “another” card, exclude the primary card from the group membership. v0 does not auto-enforce distinct physical copies across overlapping subjects.

### Analysis Context

Composition probabilities are evaluated under an **Analysis Context** (not taxonomy):

| Turn Order | Observation Point | Cards seen |
| --- | --- | --- |
| Going First | Opening Hand | opening hand size (default 5) |
| Going Second | Opening Hand | opening hand size (default 5) |
| Going Second | By First Turn | opening hand size + 1 (default 6) |

Turn order does **not** change the distribution of the initial five-card hand: `P(Q | GF opening 5) = P(Q | GS opening 5)`. The sixth card is the normal draw, not part of the opening hand.

Example (Fuwalos tagged `interaction`): MAPPING may report seeing Fuwalos in opening 5 vs among first 6 cards. It must **not** claim Fuwalos is “good going second” or recommend copy counts — that is YAPPING strategic value.

Do not add `going_first` / `going_second` to card taxonomy.

## Card metadata versus taxonomy

**Card metadata** (id, name) comes from **MyCard** [`ygopro-database`](https://github.com/mycard/ygopro-database) `locales/en-US/cards.cdb`. Ids are Konami/MyCard passwords.

Taxonomy lives on the deck card entry only.

## Opening chances are not combo success

The probability panel reports **composition probabilities** for the main deck under the selected Analysis Context: hypergeometric chances for role and undesirable opening-quality counts, with a configurable base opening-hand size (default 5).

That is the chance a random sample of the observed cards contains some number of cards you tagged. It is not win rate, combo quality, or interruption resilience.

Joint events such as `P(starter ≥ 1 AND extender ≥ 1)` are not shown as products of marginals. Roles overlap and draws are without replacement.

### Opening-hand explorer (two conditions)

The explorer lets you compare exactly two opening-hand conditions (card or role, with count operators). It reports exact combinatorial:

- `P(A)`, `P(B)`, `P(A ∩ B)`
- `P(B | A)`, `P(A | B)`

MAPPING distinguishes **occurrence** from **strategic value**:

| Question | Owner |
| --- | --- |
| `P(Q)` — how often does hand condition Q occur? | MAPPING |
| `E[U \| Q]` — expected utility / outcome given Q | YAPPING (future) |

Do not read explorer percentages as “good hand” or “bad hand”. Impossible predicates (e.g. `card ≥ 2` with one copy) yield `0%`; conditionals with a zero-probability antecedent show as undefined (`—`), not `0%`.

## v0 scope

- select Analysis Context (going first/second × opening hand / first cards seen)
- create/load a deck (MAPPING JSON, YDK, or pasted id/quantity lines)
- edit quantities and Taxonomy v0 annotations
- define Access Conditions and Groups; inspect modeled engine access
- inspect main/extra/side sizes, overlapping role density, and opening-quality counts
- inspect per-role and undesirable composition probabilities
- compare two opening-hand conditions with exact joint/conditional probabilities
- save locally (browser `localStorage` plus file download)
- export a YAPPING-readable archetype JSON

## Non-goals

Automatic role or opening-quality inference, card-effect parsing, route graphs, access targets, choke-point tagging, combo dependencies, AI classification, YAPPING search integration, RL/ML, automatic deck optimization, nested Boolean query builders, drag-and-drop, strategic hand scoring, OCGCore, accounts, cloud sync, and a replacement for existing deckbuilding sites.

## Stack

Client-only Vite + React + TypeScript. Vitest covers the taxonomy model, hypergeometric math, access conditions, and import/export. There is no application server.

## Schema

MAPPING owns a versioned document (`schema_version: 3`):

```json
{
  "schema_version": 3,
  "name": "power_patron_ars_magna_v0",
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
  "access_groups": [
    { "id": "valid-nervedo-st", "name": "Valid Nervedo S/T", "card_ids": [111, 222] }
  ],
  "access_conditions": [{
    "id": "nervedo-access",
    "name": "Nervedo Access",
    "requirements": [
      { "kind": "card", "card_id": 123, "op": "gte", "count": 1 },
      { "kind": "group", "group_id": "valid-nervedo-st", "op": "gte", "count": 1 }
    ]
  }],
  "analysis": {
    "opening_hand_size": 5,
    "turn_order": "going_first",
    "observation_point": "opening_hand"
  }
}
```

Unclassified opening quality is serialized as `"opening_quality": null`, never silently as `"neutral"`.

Schema v1/v2 documents are accepted on load and migrated to v3 (empty access groups/conditions when absent).

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

The first-run demo is **Power Patron Ars Magna** (`power_patron_ars_magna_v0`), with Access Conditions for Vidolium / Pendulum Treasure / Medius / Nervedo+S/T. Use **Load Elfnote** for the Elfnote Ars Magna demo (`elfnote_ars_magna_v0`), which highlights Regina multi-role tags and Rhapsodia as interaction + undesirable.
