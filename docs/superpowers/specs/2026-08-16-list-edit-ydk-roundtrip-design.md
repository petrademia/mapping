# Thin list edit + YDK round-trip

**Date:** 2026-08-16  
**Status:** Approved for implementation  
**Scope:** Fix “leave MAPPING to change 2 cards” without becoming a deckbuilder.

## Problem

MAPPING already supports per-row quantity and remove, but:

1. Adding a card requires a raw passcode in the toolbar.
2. YDK is import-only; list edits cannot be written back to a `.ydk` for Omega / external tools.

Users leave to edit the list, then re-import, which breaks the annotation loop.

## Goal

Stay in MAPPING for small list tweaks **and** export a standard `.ydk` of the current main/extra/side lists.

## Non-goals

- Full deckbuilder (catalog browse grid, images, banlist, format rules)
- Per-row “Replace with…” swap UI (defer until thin path is insufficient)
- Auto-rewriting Access Conditions / groups when cards are removed
- Omega-specific YDK metadata beyond a simple `#created by mapping` header

## Design

### 1. YDK export

Add `serializeYdk(doc: MappingDocument): string` in `src/lib/ydk.ts` (next to existing parse helpers).

Format:

```text
#created by mapping
#main
<passcode repeated once per copy>
#extra
...
!side
...
```

Rules:

- Expand each card’s `quantity` into that many passcode lines (standard YDK).
- Preserve section order and within-section card order from the document.
- Empty sections still emit their header (keeps parsers predictable).
- No taxonomy / access / analysis fields in the YDK (list only).

UI: **Save YDK** button in `ImportExport`, downloads `{slug(doc.name)}.ydk`.

### 2. Name search add

Replace the Card-ID-only input with a catalog typeahead:

- Query: case-insensitive substring match on catalog names.
- Results: show display name + passcode; limit to a small top-N (e.g. 8–12).
- Selecting a hit sets the add target to that `card_id`.
- The same field still accepts a raw positive integer passcode (no search pick required).
- Keep existing section select, quantity, and `addCard` behavior:
  - Existing id in section → increase quantity; taxonomy unchanged.
  - New id → append with empty taxonomy (`roles: []`, `opening_quality: null`).

### 3. Paste-add (append, not replace)

Clarify paste UX into two paths:

| Action | Behavior |
| --- | --- |
| **Load file** / full **Import paste** of YDK or mapping JSON | Replace document (existing behavior for full deck / JSON) |
| **Add lines** (new / relabeled control) | Parse `id` / `id qty` lines and `addCard` each into the **currently selected section** |

Notes:

- Section headers (`#main`, `#extra`, `!side`) in an Add-lines paste are optional; if present, they may switch the target section for subsequent lines. If absent, use the toolbar section select.
- Do not wipe taxonomy on cards already in the deck; only merge quantities / append new rows.
- Full-deck paste that includes `#main` / `#extra` / `!side` and is intended as a replace stays on Load file / the existing full Import paste path. Label Add-lines so it is not confused with replace.

### 4. Unchanged

- Per-row quantity and remove in `DeckSection` / `CardRow`
- Save mapping JSON, Export for YAPPING
- Access groups / conditions are not auto-updated on remove/add
- Analysis context persistence

## Testing

- `serializeYdk` round-trips with `parseYdk` for main/extra/side quantities and order.
- Add via numeric id and via catalog name selection both call `addCard` correctly.
- Paste-add appends without clearing existing cards or wiping taxonomy.
- Existing import/export and demo tests remain green.

## Success criteria

A user can: search-add or paste-add 1–2 cards, adjust qty/remove in-list, download `.ydk`, and continue in Omega without re-entering the list by hand.
