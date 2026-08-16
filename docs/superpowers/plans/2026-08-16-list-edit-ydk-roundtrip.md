# List Edit + YDK Round-Trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users name-search or paste-add a couple of cards in MAPPING and download a standard `.ydk` of the current list without becoming a deckbuilder.

**Architecture:** Keep list I/O in `src/lib/ydk.ts` (parse + serialize) and catalog lookup in `src/lib/catalog.ts` (name search). `addCard` / document helpers stay the single mutation path. `ImportExport.tsx` wires Save YDK, typeahead add, and append paste; full-deck replace stays on Load file / Import paste.

**Tech Stack:** React 19, TypeScript, Vitest, existing Vite app (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-08-16-list-edit-ydk-roundtrip-design.md`

## Global Constraints

- Not a deckbuilder: no card images, banlist UI, catalog browse grid, or swap-row UI.
- YDK contains list only (no taxonomy / access / analysis).
- YDK header must be `#created by mapping`; sections `#main`, `#extra`, `!side`; empty sections still emit headers.
- New cards get empty taxonomy; existing cards keep taxonomy when quantity merges.
- Access groups / conditions are not auto-rewritten on add/remove.
- Prefer TDD; run `npm test` after each task; commit after each task.

## File structure

| File | Responsibility |
| --- | --- |
| `src/lib/ydk.ts` | `parseDeckText` / `parseYdk`; add `serializeYdk`; optional `defaultSection` on parse for paste-add |
| `src/lib/catalog.ts` | Catalog load/display; add `searchCatalog` |
| `src/lib/document.ts` | `addFromParsed` (append ParsedDeck via `addCard`) |
| `src/lib/importExport.test.ts` | YDK serialize round-trip + paste-add tests (extend) |
| `src/lib/catalog.test.ts` | New: searchCatalog tests |
| `src/components/ImportExport.tsx` | Save YDK, typeahead add, Add lines vs Import paste |
| `src/index.css` | Typeahead / add-card layout tweaks |
| `README.md` | Mention Save YDK + name search add |

---

### Task 1: `serializeYdk`

**Files:**
- Modify: `src/lib/ydk.ts`
- Modify: `src/lib/importExport.test.ts`
- Test: `src/lib/importExport.test.ts`

**Interfaces:**
- Consumes: `ParsedDeck` (`main` / `extra` / `side` of `{ card_id, quantity }[]`)
- Produces: `serializeYdk(deck: ParsedDeck): string`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/importExport.test.ts`:

```ts
import { parseYdk, serializeYdk } from "./ydk";

it("serializes YDK with expanded copies and empty section headers", () => {
  const text = serializeYdk({
    main: [
      { card_id: 70488851, quantity: 3 },
      { card_id: 26237713, quantity: 1 },
    ],
    extra: [{ card_id: 4063756, quantity: 2 }],
    side: [],
  });
  expect(text).toBe(`#created by mapping
#main
70488851
70488851
70488851
26237713
#extra
4063756
4063756
!side
`);
  expect(parseYdk(text)).toEqual({
    main: [
      { card_id: 70488851, quantity: 3 },
      { card_id: 26237713, quantity: 1 },
    ],
    extra: [{ card_id: 4063756, quantity: 2 }],
    side: [],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/importExport.test.ts`

Expected: FAIL (e.g. `serializeYdk` is not exported / not a function)

- [ ] **Step 3: Write minimal implementation**

In `src/lib/ydk.ts`, append:

```ts
function expandSection(cards: readonly ParsedCopies[]): string[] {
  const lines: string[] = [];
  for (const card of cards) {
    for (let i = 0; i < card.quantity; i += 1) {
      lines.push(String(card.card_id));
    }
  }
  return lines;
}

export function serializeYdk(deck: ParsedDeck): string {
  const lines = [
    "#created by mapping",
    "#main",
    ...expandSection(deck.main),
    "#extra",
    ...expandSection(deck.extra),
    "!side",
    ...expandSection(deck.side),
    "",
  ];
  return lines.join("\n");
}
```

Keep `serializeYdk` on `ParsedDeck` (not `MappingDocument`) so `ydk.ts` stays free of document imports. Callers map `doc.main` / `extra` / `side` (already `ParsedCopies`-shaped fields) or pass `{ main: doc.main, extra: doc.extra, side: doc.side }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/importExport.test.ts`

Expected: PASS (including existing YDK parse test)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ydk.ts src/lib/importExport.test.ts
git commit -m "$(cat <<'EOF'
feat: serialize mapping lists to YDK

Round-trip passcodes with standard section headers so edited lists
can leave MAPPING as .ydk again.
EOF
)"
```

---

### Task 2: `searchCatalog`

**Files:**
- Modify: `src/lib/catalog.ts`
- Create: `src/lib/catalog.test.ts`
- Test: `src/lib/catalog.test.ts`

**Interfaces:**
- Consumes: `Catalog` (`ReadonlyMap<number, string>`)
- Produces:
  - `searchCatalog(catalog: Catalog, query: string, limit?: number): Array<{ card_id: number; name: string }>`
  - Default `limit` = `10`
  - Case-insensitive substring on name; if `query` trims to a positive integer, include that id when present in catalog (and/or always allow numeric resolution in UI even if absent)
  - Stable order: shorter name first, then localeCompare name, then card_id

- [ ] **Step 1: Write the failing test**

Create `src/lib/catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { searchCatalog } from "./catalog";

describe("searchCatalog", () => {
  const catalog = new Map<number, string>([
    [1, "Ash Blossom & Joyous Spring"],
    [2, "Ashened for Continuity"],
    [3, "Nibiru, the Primal Being"],
    [70488851, "Power Patron of Ars Magna - Vidolium"],
  ]);

  it("matches substring case-insensitively and respects limit", () => {
    expect(searchCatalog(catalog, "ash", 2)).toEqual([
      { card_id: 2, name: "Ashened for Continuity" },
      { card_id: 1, name: "Ash Blossom & Joyous Spring" },
    ]);
  });

  it("returns empty for blank query", () => {
    expect(searchCatalog(catalog, "   ")).toEqual([]);
  });

  it("resolves a raw passcode query when present", () => {
    expect(searchCatalog(catalog, "70488851")).toEqual([
      { card_id: 70488851, name: "Power Patron of Ars Magna - Vidolium" },
    ]);
  });
});
```

(Adjust expected order in the first test to match the sorting rule you implement; keep the rule documented in the function JSDoc.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/catalog.test.ts`

Expected: FAIL (`searchCatalog` not found)

- [ ] **Step 3: Write minimal implementation**

In `src/lib/catalog.ts`:

```ts
export interface CatalogHit {
  card_id: number;
  name: string;
}

export function searchCatalog(
  catalog: Catalog,
  query: string,
  limit = 10,
): CatalogHit[] {
  const trimmed = query.trim();
  if (!trimmed || !Number.isInteger(limit) || limit < 1) return [];

  const asId = Number(trimmed);
  if (/^\d+$/.test(trimmed) && Number.isInteger(asId) && asId > 0) {
    const name = catalog.get(asId);
    if (name !== undefined) return [{ card_id: asId, name }];
    return [];
  }

  const needle = trimmed.toLowerCase();
  const hits: CatalogHit[] = [];
  for (const [card_id, name] of catalog) {
    if (name.toLowerCase().includes(needle)) hits.push({ card_id, name });
  }
  hits.sort((a, b) => {
    const len = a.name.length - b.name.length;
    if (len !== 0) return len;
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return a.card_id - b.card_id;
  });
  return hits.slice(0, limit);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/catalog.test.ts`

Expected: PASS (fix expected order in Step 1 if sort differs)

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog.ts src/lib/catalog.test.ts
git commit -m "$(cat <<'EOF'
feat: search catalog by name or passcode

Support typeahead add without leaving MAPPING for card ids.
EOF
)"
```

---

### Task 3: Paste-add append helpers

**Files:**
- Modify: `src/lib/ydk.ts` (`parseDeckText` default section)
- Modify: `src/lib/document.ts` (`addFromParsed`)
- Modify: `src/lib/importExport.test.ts`
- Test: `src/lib/importExport.test.ts`

**Interfaces:**
- Consumes: `parseDeckText(text, defaultSection?)`, `addCard`, `EMPTY_TAXONOMY` / empty taxonomy via normalize
- Produces:
  - `parseDeckText(text: string, defaultSection: Section = "main"): ParsedDeck` — initial section is `defaultSection` until a header switches it
  - `addFromParsed(doc: MappingDocument, parsed: ParsedDeck): MappingDocument` — for each section, for each card, `addCard` with empty taxonomy (merge qty preserves existing taxonomy via existing `addCard`)

- [ ] **Step 1: Write the failing tests**

```ts
import { addFromParsed, createDocument, setCardRoles } from "./document";
import { parseDeckText } from "./ydk";

it("parseDeckText uses defaultSection when headers are absent", () => {
  expect(parseDeckText("7 2\n8", "extra")).toEqual({
    main: [],
    extra: [
      { card_id: 7, quantity: 2 },
      { card_id: 8, quantity: 1 },
    ],
    side: [],
  });
});

it("addFromParsed appends without wiping taxonomy", () => {
  let doc = createDocument("t");
  doc = setCardRoles(doc, "main", 1, ["starter"]);
  // setCardRoles on missing card adds qty 1 — ensure card 1 exists with starter
  doc = addFromParsed(doc, {
    main: [{ card_id: 1, quantity: 2 }],
    extra: [{ card_id: 9, quantity: 1 }],
    side: [],
  });
  expect(doc.main).toEqual([
    {
      card_id: 1,
      quantity: 3,
      taxonomy: { roles: ["starter"], opening_quality: null },
    },
  ]);
  expect(doc.extra).toEqual([
    {
      card_id: 9,
      quantity: 1,
      taxonomy: { roles: [], opening_quality: null },
    },
  ]);
});
```

If `setCardRoles` on a missing id already inserts qty 1, the merge to quantity 3 is correct (`1 + 2`). Adjust the setup if your `setCardRoles` path differs — match actual `document.ts` behavior.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/importExport.test.ts`

Expected: FAIL on `defaultSection` and/or `addFromParsed`

- [ ] **Step 3: Write minimal implementation**

`src/lib/ydk.ts` — change signature:

```ts
export function parseDeckText(
  text: string,
  defaultSection: Section = "main",
): ParsedDeck {
  const buckets: Record<Section, number[]> = { main: [], extra: [], side: [] };
  let section: Section = defaultSection;
  // ... rest unchanged
}

export function parseYdk(text: string): ParsedDeck {
  return parseDeckText(text);
}
```

`src/lib/document.ts`:

```ts
export function addFromParsed(
  doc: MappingDocument,
  parsed: {
    main: readonly { card_id: number; quantity: number }[];
    extra: readonly { card_id: number; quantity: number }[];
    side: readonly { card_id: number; quantity: number }[];
  },
): MappingDocument {
  let next = doc;
  for (const section of ["main", "extra", "side"] as const) {
    for (const card of parsed[section]) {
      next = addCard(next, section, {
        card_id: card.card_id,
        quantity: card.quantity,
        taxonomy: { ...EMPTY_TAXONOMY },
      });
    }
  }
  return next;
}
```

Use a structural type (not `import type { ParsedDeck } from "./ydk"`) so `document.ts` does not depend on `ydk.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ydk.ts src/lib/document.ts src/lib/importExport.test.ts
git commit -m "$(cat <<'EOF'
feat: append parsed deck lines without replace

Support paste-add into a section while preserving taxonomy on merges.
EOF
)"
```

---

### Task 4: Wire `ImportExport` UI

**Files:**
- Modify: `src/components/ImportExport.tsx`
- Modify: `src/index.css`
- Modify: `README.md` (first-run / import blurb only)

**Interfaces:**
- Consumes: `serializeYdk`, `searchCatalog`, `addFromParsed`, `parseDeckText`, existing `addCard` / full import
- Produces: toolbar UX per spec (no new exported modules required)

- [ ] **Step 1: Add Save YDK button**

Next to Save mapping:

```tsx
<button
  type="button"
  onClick={() => {
    const text = serializeYdk({
      main: doc.main,
      extra: doc.extra,
      side: doc.side,
    });
    download(`${slug(doc.name)}.ydk`, text);
    onStatus("Saved YDK");
  }}
>
  Save YDK
</button>
```

Update `download` to accept any text (already does); use `type: "text/plain"` or keep JSON blob type — either is fine for download.

- [ ] **Step 2: Replace Card ID input with typeahead add**

State:

```tsx
const [addQuery, setAddQuery] = useState("");
const [addCardId, setAddCardId] = useState<number | null>(null);
```

UI sketch:

- Keep section `<select>` and qty input.
- Replace id input with:
  - `input type="search"` bound to `addQuery`
  - on change: set query; if `/^\d+$/` and positive int, set `addCardId` to that number; else clear selection until a hit is chosen
  - dropdown/listbox of `searchCatalog(catalog, addQuery)` (max 10); click sets `addCardId` + fills query with the card name
- Submit: resolve `cardId = addCardId ?? (numeric query)`; same validation as today; `addCard(...)`; clear query + selection; status with `displayName`

Use a simple absolute-positioned `<ul class="catalog-hits">` under the search field (no new dependency). Keyboard: optional Enter uses current `addCardId` or sole hit; Escape closes hits. Minimum viable: mouse/touch select + numeric submit.

- [ ] **Step 3: Split paste into Import paste vs Add lines**

Inside `<details className="paste">`:

- Summary: `Paste deck or add lines`
- Textarea unchanged
- Two buttons:
  - **Import paste** — existing `importText(paste, "paste")` (replace)
  - **Add lines** —

```tsx
try {
  const parsed = parseDeckText(paste, addSection);
  onChange(addFromParsed(doc, parsed));
  setPaste("");
  onStatus(`Added lines to deck (default section: ${addSection})`);
} catch (caught) {
  onStatus(caught instanceof Error ? caught.message : "Add lines failed");
}
```

- [ ] **Step 4: CSS**

In `src/index.css`, extend `.add-card` so the search field is wider (~16rem), hits list is compact:

```css
.add-card {
  position: relative;
}
.add-card .card-search {
  width: 16rem;
}
.catalog-hits {
  position: absolute;
  z-index: 5;
  /* match existing panel surface tokens; list max-height ~12rem; overflow auto */
}
```

Follow existing color/spacing variables in the file; do not invent a new theme.

- [ ] **Step 5: README**

In the “what you can do” / first-run bullets, note:

- Add cards by catalog name search or passcode; paste-add appends without replacing
- Save YDK exports the current list for Omega / external tools

- [ ] **Step 6: Verify**

Run: `npm test && npm run typecheck && npm run build`

Expected: all green

Manual smoke (dev server): Load Power Patron → search-add one card → qty tweak → Save YDK → open file and confirm passcodes → Add lines with `id qty` into side → confirm taxonomy on untouched cards.

- [ ] **Step 7: Commit**

```bash
git add src/components/ImportExport.tsx src/index.css README.md
git commit -m "$(cat <<'EOF'
feat: name search add and Save YDK in toolbar

Close the leave-to-edit loop for small list tweaks with append paste.
EOF
)"
```

---

## Spec coverage checklist

| Spec item | Task |
| --- | --- |
| `serializeYdk` + Save YDK | 1, 4 |
| Name search typeahead + raw id | 2, 4 |
| Paste-add append vs full import | 3, 4 |
| Empty section headers in YDK | 1 |
| Taxonomy preserved on qty merge | 3 (via `addCard`) |
| No access auto-rewrite / no swap UI | Global Constraints (explicit non-work) |
| Tests listed in spec | 1–3 |

## Placeholder / consistency self-review

- No TBD steps; signatures use `ParsedDeck` / `Catalog` / `addFromParsed` consistently.
- `serializeYdk` takes `ParsedDeck`, not `MappingDocument`, to avoid coupling.
- `parseDeckText` second arg is `defaultSection`, used by Add lines with toolbar `addSection`.
