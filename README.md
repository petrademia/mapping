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
Role                    Opening Quality (per turn order)
├── starter             ├── desirable
├── extender            ├── neutral
└── interaction         └── undesirable
                        (null = unclassified)
```

| Dimension | Cardinality | Values |
| --- | --- | --- |
| **Role** | multi-select | `starter`, `extender`, `interaction` |
| **Opening Quality** | per context | `desirable`, `neutral`, `undesirable`, or `null`, for each of Going First and Going Second |

- Opening Quality is evaluated **separately for Going First and Going Second**
  (`opening_quality: { going_first, going_second }`, both `null` by default =
  unclassified).
- `null` means the user has not evaluated opening quality in that context.
- `neutral` means the user evaluated it and considers it neither desirable nor
  undesirable in that context.
- `unclassified` (`null`, shown as **Not set** in the UI) is **not** the same as `neutral`: neutral is an
  intentional judgment.
- Do not flatten these into one tag list. They have different meanings and constraints.
- Annotations are **human deckbuilding hypotheses** for a specific deck/configuration: `Role(card, deck)`, not objective card properties.
- MAPPING does not encode combo routes, access targets, choke points, or card-effect semantics.

Removed from the built-in taxonomy (do not use as Role values): `recovery`, `brick`, `engine_requirement`. Legacy `brick` migrates to Opening Quality `undesirable`. `recovery` and `engine_requirement` are dropped on schema migration without remapping.

Three questions are deliberately distinct:

1. Do I want to **draw** this card?  (Opening Quality)
2. Do I want this card **in the deck**?  (deck inclusion)
3. Do I want to **side** this card out?  (siding decision)

Opening Quality answers only question #1. A card can be undesirable to draw
while still being necessary in the deck (e.g. required for the engine, or for
combo ceiling). An `undesirable` card is **not** automatically a siding
candidate, and a `desirable` one is **not** mandatory inclusion. MAPPING never
infers a single "Deck Quality %", and does not assign numeric weights to
`desirable` / `neutral` / `undesirable`.

### Opening Quality (contextual)

```json
"opening_quality": {
  "going_first": "undesirable",
  "going_second": "desirable"
}
```

- Opening quality is selected by the **currently selected Analysis Context**
  (turn order). `going_second` Opening 5 and `going_second` First 6 both use
  the `going_second` annotation; only the sample size differs.
- Legacy v3 documents with a single scalar `opening_quality` migrate that value
  to **both** contexts on load (preserves the previous judgment until changed).

Example: Mulcharmy Fuwalos tagged

```text
Role:              interaction
Opening Quality:   Going First:  neutral
                   Going Second: desirable
```

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
- human Hand Conditions (Requires / Excludes / optional distinct matches) and a derived Modeled Engine Access set

YAPPING is expected to measure (not implemented here):

- starter / extender strength
- draw value
- recovery value
- interruption resilience
- going-first / going-second value
- marginal deck value
- route similarity
- choke-point redundancy

### Taxonomy vs Hand Conditions vs YAPPING

| Layer | What it is |
| --- | --- |
| **Taxonomy** | Card-level human role hypothesis (`starter` / `extender` / `interaction`) |
| **Hand Condition** | Hand-level user-defined Boolean predicate (ALL OF Requires AND NONE OF Excludes over Card / Role / Group predicates) |
| **Group** | Named deck-specific set of Main Deck cards |
| **Hand Goal** | User-facing interpretation formed from one or more Hand Conditions (ANY / union semantics); backed by the internal `HandConditionSet` (called Modeled Outcome in earlier versions; saved files still use `hand_condition_sets`). It is a match on the opening hand, not a board state |
| **YAPPING** | Strategic validation / game-tree outcomes |

Access Conditions generalized into Hand Conditions: a condition is no longer
"access"-specific. Users define the hand properties that matter to them
(e.g. `Medius Access`, `Nervedo Access`, `Maxx C Answer`, `Has Interaction`).
MAPPING only computes how often each property occurs; it never invents a
universal Yu-Gi-Oh! hand taxonomy.

Example: classifying `Nervedo` as `starter` can be misleading if Nervedo alone does not establish the line. Prefer a Hand Condition such as:

```text
Nervedo Access
  Requires
    Nervedo >= 1
    Valid Nervedo S/T >= 1   (user-defined group; exclude Nervedo itself)
  Excludes
    Citrinitas >= 1
```

A Hand Condition has three parts:

- **Requires** - ALL OF these predicates must hold in the hand.
- **Excludes** - NONE OF these predicates may hold; a hand whose composition
  satisfies any exclusion is rejected.
- **Distinct matches** (optional) - selected Requires of the form `≥ 1` must be
  satisfiable by different card names (injective assignment). Count predicates
  (`≥ 2`, `= 2`, …) keep counting physical copies and cannot join a distinct
  constraint in v0.

Both sides use the same condition primitive (Card / Role / Group subjects with
the same operators). `Excludes Citrinitas >= 1` reads as `NOT(Citrinitas >= 1)`
(Power Patron / during the sequence we model, a Nervedo + valid S/T hand that
also contains Citrinitas does not give the modeled line). Exclusion is a
human-modeled hand-composition constraint, not a claim that Citrinitas is
"bad" or that the hand cannot legally combo - YAPPING owns strategic judgment.

MAPPING then reports how often that hand condition occurs. It does **not** encode the Non-Finito → Citrinitas trajectory, Ash resilience, or whether two Hand Conditions are strategically independent routes (they may converge on the same choke point).

### Hand Goals and exact event analysis

A **Hand Goal** combines Hand Conditions into a goal the user cares
about. It is satisfied when ANY selected Hand Condition matches the opening
hand (`ANY of` the members, OR / union semantics). Example:

```text
Normal Engine Access
  ANY OF
    Medius Access
    Vidolium Access
    Nervedo Access
```

For each outcome MAPPING reports, exactly, the union probability
`P(C1 ∪ C2 ∪ ...)`, and (behind a "Multiplicity details" disclosure) the
multiplicity distribution (`P(N >= 1)`, `P(N >= 2)`, ... and `P(N = k)`
buckets) plus the pairwise intersections `P(A ∩ B)` of its members. The user
never declares conditions mutually exclusive: overlap is derived from exact
hand evaluation, and probabilities are never summed or averaged.

### Opening Quality among matching hands

Each Hand Goal also exposes (behind an "Opening Quality" disclosure) the
conditional Opening Quality distribution of the hands that satisfy it, under
the current Analysis Context's turn order. With `U(H)` = number of
Undesirable-classified physical cards drawn:

- `P(U = 0 | S)` - No undesirable;
- `P(U = 1 | S)` - Exactly 1 undesirable;
- `P(U >= 2 | S)` - 2+ undesirable;
- `P(D >= 1 | S)` - Contains >= 1 desirable.

The three Undesirable buckets partition the matching-hand sample space
(`P(U = 0 | S) + P(U = 1 | S) + P(U >= 2 | S) = 100%`). When `P(S) = 0` the
values render as "—". These are exact conditionals
`P(quality ∩ S) / P(S)` from the same hand enumeration, never card-slot
approximations. Opening Quality describes the matching hands; it never changes
which hands belong to the outcome, and it is not a hand score. A lightweight
warning appears when a large portion of deck slots is unclassified.

A Hand Condition is a reusable Boolean pattern; its **name** may document a
strategic assertion (for example `Medius + Vidolium — Through 1 Ash`) while
its **predicate** is the actual rule. Renaming a condition never changes its
probability. MAPPING does not simulate or verify Ash - it only evaluates the
user's patterns.

Treating each condition as an event, MAPPING also exposes:

- `P(A)`, `P(B)`, `P(A ∩ B)`, `P(A ∪ B)` for any two conditions;
- `P(A | B) = P(A ∩ B) / P(B)` when `P(B) > 0`, otherwise undefined;
- multiplicity buckets `P(N = k)` that are mutually exclusive and jointly
  exhaustive (`Σ P(N = k) = 1`).

**Modeled Engine Access** is just the hand goal with the fixed id
`modeled-engine-access` (backed by an internal `HandConditionSet` - a normal
set, not a separate mechanism). The Deck Profile reads that set. More than one
satisfied condition is a combinatorial property of the user's definitions, not
evidence of two independent combo routes. Do not label this combo success,
playability, or win rate.

If overlapping groups share cards (for example Medius is both starter and
extender), raw `≥ 1` predicates can both pass on one card name. Use a
**distinct match** on those Requires so Medius + Medius fails while
Medius + Vidolium can pass. Distinct matching is by card name (card id), not
by physical copy. v0 does not auto-infer Excludes from Opening Quality or Role
taxonomy, and does not generalize membership in an outcome from a condition's
name.

### Hand Test

Probability analysis asks *how often* a condition occurs; **Hand Test** asks
whether one *exact* hand satisfies it. It evaluates the user's existing model
(Hand Conditions + Hand Goals) against a single concrete hand and explains
why each predicate passed or failed.

- **Deck and hand side by side**: the Main Deck is shown as card art next to
  the hand. *New Hand* shuffles the deck and deals the opening hand (sampled
  uniformly over physical cards, so multi-copy cards are weighted correctly,
  sized by the Analysis Context: opening 5 / opening 5 / first 6 cards seen).
  *Draw* takes the number of cards you choose off the top, *Shuffle* mixes the
  deck again and keeps the hand, and clicking a card moves it between the deck
  (where it greys out) and the hand. A hand of any size gets results.
- **Opponent hand**: a pane of the handtraps from the Handtraps tab. Click
  handtraps to hold them, or Deal Opponent to draw a random few (set how many
  beside the button). Each Hand Goal that holds then shows whether it survives
  those handtraps, and the cards they would negate are greyed under a red
  cross in your hand.
- **Hand quality**: the tested hand run through the Scorecard's checks (meets
  the Hand Goal, holds at most N bricks, survives the worst opponent hand,
  holds an Interaction card), with the same weights. The rating is the weighted
  share of those checks it passes, shown next to the deck average. Averaged
  over every possible hand of that size it equals the deck's combined number
  (the tests check this exactly), so a hand above the average is above what the
  deck gives you. A check the deck cannot measure is left out, the same as in
  the Scorecard. It rates the hand by your models, not by how it plays.
- **Condition trace**: every requirement, exclusion, and distinct-card
  constraint shows PASS/FAIL. Requirements and exclusions include actual count
  and contributing cards; distinct constraints show eligible names and, when
  successful, the assignment. An exclusion that matches is flagged and explains
  why the condition fails.
- **Hand Goals**: each goal shows PASS/FAIL and how many of its member
  conditions the hand satisfies (`N_S(H) = Σ 1[C_i(H)]`), the single-hand
  counterpart of the multiplicity distribution. Satisfying multiple conditions
  is not evidence of independent routes.
- **Probability link**: each condition shows its population probability, and
  the tested hand shows its exact composition probability
  (`product_i C(n_i, h_i) / C(deck_size, observed)`), a property of the exact
  card-name/count composition, not a strategic hand quality.
- **Modeled, not verified**: a PASS means the human-authored model matches the
  hand. Hand Test never simulates play, Ash, or legal continuations; YAPPING
  remains responsible for strategic validation.

### Workspaces

The right rail has three steps, each with its own workspaces, so modeling
editors never compete with analysis results for vertical space:

- **Define** - describe the deck. **Models** (Hand Goals, Hand Conditions,
  Groups), **Handtraps** and **Rank**.
- **Test** - try hands. **Hand Test** evaluates one exact hand against the
  model, with the opponent's handtraps; **Batch Test** deals many.
- **Analyze** - read the results. **Profile** (Analysis Context, Deck Profile,
  Card Impact, roles), **Scorecard** and **Compare**.

The **Scorecard** measures one Hand Goal going first (the five-card opening
hand) and going second (six cards, after the first draw), in terms of how the
Main Deck's slots are spent. All numbers are exact over every possible hand:

- **Opens** - hands that meet the Hand Goal.
- **Clean** - hands that meet it holding at most N bricks, where a brick is a
  card whose Opening Quality for that turn order is Undesirable. The table
  under it shows 0 to 3 bricks, so you can see how many bricks the deck can
  carry before the goal suffers.
- **Resilient** - hands that still meet it after the opponent's handtraps, worst
  case over the handtraps and pairs in the Handtraps tab.
- **Interaction** - hands with at least one card marked with the Interaction role.
- **Interruption curve** - hands that still meet the Hand Goal after 0, 1, 2 and 3
  interruptions, where each interruption stops any one card in hand and the
  opponent picks the one that hurts most. It needs no handtrap defined. A hand
  with one route ends its turn on the first interruption; two independent
  routes (for example two starters that do not need each other) take one, not
  two. The Scorecard also shows the share of hands that meet the goal with only
  one route. A second copy of a card counts as a backup here, so it overstates
  a card that needs the Normal Summon.
- The Profile view opens with **Quality at a glance**: one combined number for
  going first and one for going second, the weakest measured number in each,
  and what is not measured yet and how to measure it. It is a summary of the
  Scorecard, so it is only as complete as your models.
- A slot mix per turn order (desirable, neutral, bricks, not set), and a
  combined number per turn order and overall. The combined numbers are weighted
  means; the weights are yours (kept in this browser), and a number that cannot
  be measured, or has weight 0, is left out. They measure how reliably you reach
  your plan, not how often you win.

The app opens on Profile, whose next-step card points to Define. Returning to a
step puts you back on the workspace you last used in it.

### Deck Profile

The **Deck Profile** panel is a compact strategic summary that separates
**hand goals** from raw annotation diagnostics. It never reports a
single aggregate "Deck Quality" score:

| Layer | What it shows |
| --- | --- |
| **Hand Goals** | Engine Access (P(any selected engine-access condition)), Access + Interaction-tagged, Access + No Undesirable |
| **Access Multiplicity** | P(N ≥ 1), P(N ≥ 2), P(N ≥ 3) over the selected access conditions (not "resilience") |
| **Conditional on Access** | P(Interaction-tagged \| Access), P(No Undesirable \| Access) |
| **Annotation & composition analysis** (collapsed) | Opening Quality composition, Access composition, interaction-tagged cards, context comparison, and **Annotation Coverage** (x / N deck slots classified per turn order) |

Every percentage has an explicit mathematical interpretation (exact
opening-hand hypergeometric / composition enumeration). Do **not** read
"hands with ≥ 1 undesirable" as "bad hands": an undesirable-tagged card in a
hand can still produce a strong line. Do **not** read "≥ 1 interaction-tagged
card" as "usable interaction": that is a raw taxonomy event, and usable
interaction should be modeled with Hand Conditions instead. The user is never
asked whether conditions are mutually exclusive; overlap is derived from exact
evaluation.

Raw taxonomy and Opening Quality annotation statistics live in
**Taxonomy / Annotation Analysis** (role slots + opening-quality slots) and
never compete visually with hand goals.

### Deck Configuration

**Deck Configuration** represents actual deck-list changes such as siding. The
deck list you edit is **Pre-Side**. A post-side list is a *different
configuration* (which copies are in Main), not a card annotation. Siding
changes deck composition, not the semantic meaning of `undesirable`. Preserved
attributes: `undesirable to draw != undesirable to include != should side out`.

- A post-side configuration only stores overrides ("N copies of this card in
  Main", and for Extra Deck cards "N copies in Extra"). Cards without an
  override follow Pre-Side.
- Main cards move between Main and Side: the pool (`main + side`) per card is
  fixed. Extra Deck monsters move between Extra and Side the same way
  (`extra + side`), and the Extra Deck never passes 15 cards. Siding the Extra
  Deck does not change any odds, but the exported `.ydk` and YAPPING JSON
  follow the Post-Side list.
- Annotations stay on the card by `card_id`; they are edited in the deck list
  and shared by every configuration.
- The selected configuration drives Profile, Models, Hand Test, the header
  counts, Save YDK, and Export for YAPPING. Save mapping stores Pre-Side plus
  all configurations.

### Handtrap versus

The **Handtraps** tab asks how your Hand Goals hold up when the opponent holds
handtraps. You add handtraps (the usual ones come as card art: Effect Veiler,
Infinite Impermanence, Ash Blossom & Joyous Spring, Dominus Purge, Dominus
Impulse, Fydraulis Harmonia, Ghost Belle & Haunted Mansion, or any you name)
and pick, per handtrap, the cards of yours it can stop. You can also save
**pairs** the opponent holds together.

- A handtrap negates one copy of a card in your hand that it can stop. The
  opponent always chooses the copy that hurts the goal most, or does nothing
  when that is better for them, so every number is the worst case.
- A pair applies two negations, one per handtrap, each on its own copy.
- **One Normal Summon a turn.** In Models, Groups, mark one Group as "Uses the
  Normal Summon" and list the cards that each need it (for example Medius the
  Pure and The Great Gallant Bandit). You can use only one of them a turn, so a
  second copy is no backup for the one that was stopped, and a goal that needs
  two of them at once cannot be met. You choose which one to use, then the
  opponent answers, and a goal survives when some choice survives every answer.
  Without a marked Group, copies back each other up as before.
- Results are exact over every possible hand (same method as Hand Goals): for
  each goal, the chance it holds and survives, with the exact hand count and
  the drop in points against no handtrap.
- A handtrap with no cards picked can stop nothing and shows no change.
- Handtraps and pairs are saved with the deck (`handtraps`,
  `handtrap_pairs`, schema 10).

### Analysis Context

Composition probabilities are evaluated under an **Analysis Context** (not taxonomy):

| Turn Order | Observation Point | Cards seen |
| --- | --- | --- |
| Going First | Opening Hand | opening hand size (default 5) |
| Going Second | Opening Hand | opening hand size (default 5) |
| Going Second | By First Turn | opening hand size + 1 (default 6) |

Turn order does **not** change the distribution of the initial five-card hand: `P(Q | GF opening 5) = P(Q | GS opening 5)`. The sixth card is the normal draw, not part of the opening hand.

Opening Quality selection depends on **turn order** (not merely hand size): both
Going Second — Opening 5 and Going Second — First 6 Cards Seen use the
`going_second` annotation; the sample size differs, the annotation does not.

Example (Fuwalos tagged `interaction`, GF neutral / GS desirable): MAPPING may
report different opening-composition profiles under GF vs GS because the
annotation differs, and may report differing sample sizes across observation
points. It must **not** claim Fuwalos is “good going second” or recommend copy
counts — that is YAPPING strategic value.

Do not add `going_first` / `going_second` / `side_out` / `sideable` to card taxonomy.

## Card metadata versus taxonomy

**Card metadata** (id, name) comes from **MyCard** [`ygopro-database`](https://github.com/mycard/ygopro-database) `locales/en-US/cards.cdb`. Ids are Konami/MyCard passwords (`66247039`), not EDOPro pre-release placeholders (`100457102`). MAPPING's name pin may be ahead of YAPPING's solver `cards.cdb`, so Find card can name a card Fluoro cannot play yet.

Taxonomy lives on the deck card entry only.

## Opening chances are not combo success

The Deck Profile panel reports **composition probabilities** for the selected
configuration's main deck under the selected Analysis Context: exact chances
for contextual opening-quality composition (desirable / neutral / undesirable /
unclassified), modeled engine access, access composition, and interaction, with
a configurable base opening-hand size (default 5).

That is the chance a random sample of the observed cards contains some number
of cards you annotated in a particular way. It is not win rate, combo quality,
or interruption resilience. It is not a deck-quality score.

Joint events such as `P(starter ≥ 1 AND extender ≥ 1)` are not shown as products of marginals. Roles overlap and draws are without replacement.

MAPPING distinguishes **occurrence** from **strategic value**:

| Question | Owner |
| --- | --- |
| `P(Q)` — how often does hand condition Q occur? | MAPPING (Models / Profile) |
| `E[U \| Q]` — expected utility / outcome given Q | YAPPING (future) |

## v0 scope

- select Analysis Context (going first/second × opening hand / first cards seen)
- create/load a deck (MAPPING JSON, YDK, or pasted id/quantity lines)
- edit quantities, Roles, and contextual (Going First / Going Second) Opening Quality on Main and Side cards (Extra Deck cards are never in an opening hand, so they have no taxonomy controls)
- add cards by catalog name search or passcode; Extra Deck monsters (Fusion, Synchro, Xyz, Link, from `public/extra-deck.json`) are routed to the Extra Deck when Main is selected, Side is never rerouted; paste-add appends without replacing
- define Hand Conditions (Requires / Excludes / optional distinct-card matches), Groups, and Hand Goals (ANY of members) in a dedicated Models workspace, with optional notes for intent; inspect per-goal union, pairwise overlap, and multiplicity distribution
- test one exact hand (random or manual) against all Hand Conditions and Hand Goals, with per-predicate traces and population probabilities
- inspect main/extra/side sizes, role density, and per-context opening-quality counts
- inspect the Deck Profile: hand goals (engine access), access multiplicity, conditionals on access, plus collapsed annotation/composition diagnostics and annotation coverage
- inspect raw taxonomy density and per-context opening-quality counts separately from hand goals
- save locally (browser `localStorage` plus file download)
- Save YDK exports the current list for Omega / external tools
- export a YAPPING-readable archetype JSON

## Non-goals

Automatic role or opening-quality inference, automatic exclusion inference, card-effect parsing, route graphs, access targets, choke-point tagging, combo dependencies, AI classification, YAPPING search integration, RL/ML, automatic deck optimization, nested Boolean query builders, drag-and-drop, strategic hand scoring, OCGCore, accounts, cloud sync, a replacement for existing deckbuilding sites, a single "Deck Quality %" score, arbitrary quality weights, automatic siding recommendations, and match-up-aware siding.

## Stack

Client-only Vite + React + TypeScript. Vitest covers the taxonomy model, hypergeometric math, hand conditions, and import/export. There is no application server.

## Schema

MAPPING owns a versioned document (`schema_version: 8`):

```json
{
  "schema_version": 8,
  "name": "power_patron_ars_magna_v0",
  "main": [{
    "card_id": 62962630,
    "quantity": 3,
    "taxonomy": {
      "roles": ["starter", "extender"],
      "opening_quality": {
        "going_first": "desirable",
        "going_second": null
      }
    }
  }],
  "extra": [],
  "side": [],
  "groups": [
    {
      "id": "valid-nervedo-st",
      "name": "Valid Nervedo S/T",
      "notes": "Searchable S/T targets; exclude Nervedo itself",
      "card_ids": [111, 222]
    }
  ],
  "hand_conditions": [{
    "id": "nervedo-access",
    "name": "Nervedo Access",
    "notes": "Nervedo plus a valid S/T, without brick Nervedo alone",
    "requirements": [
      { "id": "req-nervedo", "kind": "card", "card_id": 123, "op": "gte", "count": 1 },
      { "id": "req-st", "kind": "group", "group_id": "valid-nervedo-st", "op": "gte", "count": 1 }
    ],
    "excludes": [
      { "id": "ex-citrinitas", "kind": "card", "card_id": 456, "op": "gte", "count": 1 }
    ],
    "distinct_constraints": []
  }],
  "hand_condition_sets": [{
    "id": "modeled-engine-access",
    "name": "Modeled Engine Access",
    "notes": "Union of engine-access lines for Profile",
    "condition_ids": ["nervedo-access"],
    "aggregation": "any"
  }],
  "engine_access_set_id": "modeled-engine-access",
  "analysis": {
    "opening_hand_size": 5,
    "turn_order": "going_first",
    "observation_point": "opening_hand"
  },
  "configurations": [{
    "id": "side-1",
    "name": "Post-Side 1",
    "notes": "Going second vs. backrow",
    "overrides": [{ "card_id": 62962630, "main_quantity": 1 }]
  }],
  "active_configuration_id": "side-1"
}
```

`configurations` holds post-side overrides (Main copies per card, within the
Pre-Side `main + side` pool); `active_configuration_id: null` selects Pre-Side.
Schema v7 documents load with no configurations.

Unclassified opening quality in either context is serialized as `null`, never silently as `"neutral"`. An absent `going_first` / `going_second` key defaults to `null`.

Schema v1-v5 documents are accepted on load and migrated to v6:
legacy v1 flat `roles` migrate via the v0 mapping (with `brick` → `undesirable`),
a legacy v3 scalar `opening_quality` is copied to **both** contexts (the
previous judgment is preserved until explicitly changed), a v4 Access
Condition without an `excludes` key gains `excludes: []` (Requires-only
behavior is preserved), and a v5 document's `access_conditions` /
`access_groups` rename to `hand_conditions` / `groups` with all former
conditions kept as members of a derived **Modeled Engine Access** set.
Empty groups/conditions/sets are defaulted when absent.

YAPPING currently loads `configs/archetypes/*.json` with:

- `name`
- `main_deck` / `extra_deck`: repeated card ids, one entry per copy
- `card_roles`: `{ "<id>": ["starter", "extender"] }` (Role dimension only)
- `metadata.card_opening_quality`: contextual map
  `{ going_first: { "<id>": "desirable" }, going_second: { ... } }`
  (unclassified omitted in each context)
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
`npm run extract-catalog` downloads MAPPING's pinned MyCard commit (recorded in `scripts/extract-catalog.py`, currently `ad0a51f`) into `.cache/`, verifies its SHA256, and writes `public/catalog.json`. That pin can be newer than `yapping/tools/fetch_cards_db.sh`. Provenance is `public/catalog.meta.json`. Unknown ids still display as `#<id>`.

To pick up new sets, run `npm run extract-catalog -- --latest`. It resolves the newest upstream commit that touched the en-US `cards.cdb`, rewrites the pin and hash in the script, and regenerates the catalog. Review the diff and commit it.

MyCard's English data can lag behind new sets (its newest en-US commit was 22 Sep 2026 when this was checked). Add `--with-ygoprodeck` to also name cards the MyCard cdb does not have yet, using YGOPRODeck's API. It only adds ids and names that are absent from MyCard, and `catalog.meta.json` records how many. That step reads a live API, so it is not reproducible from the pin alone.

**Card images** are optional and local. `npm run fetch-images -- --demo [deck.ydk ...]` downloads small images for the card ids found in the files you name into `public/cards/` and writes `public/cards/index.json`. The image host (YGOPRODeck) asks users to download each image once rather than hotlink it, so the script is throttled, skips existing files, and stops on HTTP 403/429. `public/cards/` is gitignored; cards without an image show an empty placeholder box.

On first run (no saved draft in the browser) the app loads `public/default.ydk`; replace that file to change the starting deck. After that your draft is saved in the browser, and New deck or the Clear menu start from empty. The **Power Patron Ars Magna** (`power_patron_ars_magna_v0`) and **Elfnote Ars Magna** (`elfnote_ars_magna_v0`) demos live in `src/data/` as test fixtures and for `npm run fetch-images -- --demo`; they are no longer loaded by the UI. Power Patron has Hand Conditions for Vidolium / Pendulum Treasure / Medius / Nervedo+S/T (each selected as Modeled Engine Access) and a contextual Fuwalos annotation (Going First: neutral, Going Second: desirable). Elfnote highlights Regina multi-role tags and Rhapsodia as interaction + undesirable.
