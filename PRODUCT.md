# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single Yu-Gi-Oh! player tuning their own deck, usually alone at a desk. They build or paste a list, judge which cards matter, define the hands they want to open, and test hands before an event. They export the result to YAPPING. (Confirmed with the user; the user is the primary user.)

## Product Purpose

MAPPING turns a player's own judgments about a deck into measurable opening-hand questions. It gives exact probabilities for hands the player defines, and a fast visual way to draw and compare hands as card images. Success is that a player can state what a good hand is, see how often they open it, and trust the number.

## Positioning

Two halves of equal weight: exact odds for hands the player defines, and visual hand testing in the style of a simulator's hand draw. It does not play the game out and is not a simulator; YAPPING owns search and strategy.

## Operating Context

- Input: a `.ydk` list (the starting deck is `public/default.ydk`), pasted lists, or saved MAPPING JSON.
- Card data: MyCard cards.cdb as the pinned catalog, YGOPRODeck as an opt-in supplement for newer cards and current official names; local card images fetched once by script.
- Output: saved mapping JSON, a `.ydk`, and a YAPPING archetype JSON.
- Used before events and when a new set or banlist changes the deck.

## Capabilities and Constraints

- Vocabulary that must stay: **Group** (a named set of cards), **Hand Condition** (a rule about the opening hand: Requires and Excludes), **Hand Goal** (a match on the opening hand through any of its Hand Conditions; stored as a condition set). A Hand Goal is not a board state.
- Taxonomy: Role (starter, extender, interaction) and Opening Quality per turn order (desirable, neutral, undesirable, Not set). Extra Deck cards are never drawn, so they have no taxonomy controls. Annotations are the player's hypotheses for one deck.
- Analysis: exact hypergeometric probabilities over opening hands for a chosen analysis context; Card Impact; generated and manual test hands; Card Rank (a manual preference order per turn order, no weights).
- Deck configurations: Pre-Side plus Post-Side lists built from the Main/Side pool.
- Local only: no server, accounts or cloud sync. Drafts save in the browser.
- Explicit non-goals: combo routes, strategic hand scoring, a single deck quality percentage, arbitrary quality weights, automatic siding.
- Undecided: how "versus N handtraps" should work. The user will supply the list of handtraps and what each one stops before anything is built.

## Brand Commitments

The name MAPPING and its place in the analysis family (MAPPING, YAPPING, RAPPING). No other brand assets exist.

## Evidence on Hand

- Real deck lists from the user (`public/default.ydk`).
- A saved mapping with Groups and a Hand Condition (the user's Power Patron deck).
- A local card catalog and thumbnails fetched from public card databases. No testimonials, usage data or other users exist; do not invent any.

## Product Principles

- The player's judgment is the input; the product measures it and never replaces it with a hidden score.
- Show cards, not just names: a player recognizes a card by its art.
- Exact where the math is exact; say plainly where a number is a model and not a prediction of play.
- Never lose the player's work: confirm destructive actions, autosave locally, and keep saved files loadable.
- Plain words for the three model layers, and the same word everywhere.

## Accessibility & Inclusion

Keyboard operation for every action that has a pointer path (for example reordering ranks has move buttons as well as dragging), visible focus, and contrast of at least 4.5:1 for text. Phone layouts are not required but must not break.
