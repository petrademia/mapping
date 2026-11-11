---
name: MAPPING
description: A Yu-Gi-Oh! deck workbench drawn as one cream binder page on a tan desk, with a charcoal spine rail and red tab ink.
colors:
  desk: "#d9cfbd"
  page: "#f6f0e2"
  sleeve: "#fffdf6"
  sunken: "#ece3cf"
  ink: "#25221d"
  muted: "#6b6253"
  rule: "#b8ab93"
  spine: "#2b2824"
  spine-ink: "#f3ecdc"
  tab-ink: "#b4472a"
  tab-ink-deep: "#8b3219"
  pass: "#3f6b32"
  fail: "#a8372a"
  role-starter: "#b8860b"
  role-extender: "#2f7f74"
  role-interaction: "#b4472a"
typography:
  display:
    fontFamily: "Young Serif, ui-serif, serif"
    fontSize: "2.1rem"
    fontWeight: 400
    letterSpacing: "-0.03em"
  heading:
    fontFamily: "Young Serif, ui-serif, serif"
    fontSize: "1.1rem"
    fontWeight: 400
  body:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.45
  data:
    fontFamily: "Red Hat Mono, ui-monospace, monospace"
    fontSize: "0.85rem"
    fontWeight: 400
rounded:
  control: "3px"
  tab: "6px"
spacing:
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
components:
  button:
    backgroundColor: "{colors.sleeve}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.4rem 0.85rem"
    height: "2.25rem"
  button-primary:
    backgroundColor: "{colors.tab-ink}"
    textColor: "{colors.sleeve}"
    rounded: "{rounded.control}"
  button-primary-hover:
    backgroundColor: "{colors.tab-ink-deep}"
  tab:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.muted}"
    rounded: "{rounded.tab}"
    padding: "0.55rem 0.95rem"
  tab-active:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink}"
  panel:
    backgroundColor: "{colors.sleeve}"
    textColor: "{colors.ink}"
    padding: "0.9rem 1rem"
---

# Design System: MAPPING

## Overview

Implementation: tokens live in `src/styles/tokens.css`, the only place a raw colour, size or duration is defined. `base.css` holds elements and the one control family, `shell.css` the page, rail and tabs, `cards.css` every card tile and grid, and `panels.css` the workspace panels. Components use tokens only.

MAPPING is where one person tunes their own Yu-Gi-Oh! deck, so the deck is the page. Everything sits on a single cream binder page resting on a tan desk. A charcoal spine rail across the top holds the deck name and its actions. Workspaces are binder tabs fused to the page. Structure is hairline only: one 1px warm-tan rule weight, no boxes inside boxes, so the card art stays the loudest thing on screen.

The refusals: no dark dashboard of floating panels, no navy and gold deck-site look, no kickers above headings, no gradient or glass, no hard offset shadows.

## Colors

Cream binder stock, charcoal rail, one red accent.

- **Page (#f6f0e2)** is the working surface; **Desk (#d9cfbd)** shows only at the edges on wide screens; **Sleeve (#fffdf6)** is panels, inputs and card pockets.
- **Ink (#25221d)** for text; **Muted (#6b6253)** for secondary text (5.3:1 on page, placeholders included).
- **Tab ink (#b4472a)** is the only accent: the one filled button per surface, the active tab's top edge, selection and hand highlights. Red text uses **Tab ink deep (#8b3219)** for 6.2:1.
- **Spine (#2b2824)** with **Spine ink (#f3ecdc)** carries the rail; buttons there are outlined in cream.
- Role colours (starter gold, extender teal, interaction red) appear only as small pips and bars on cards, never as fills.

## Typography

Young Serif for the wordmark and panel headings only. Public Sans for everything else. Red Hat Mono for numbers, counts and passcodes, never as decoration. Headings balance; paragraphs use pretty wrapping. Percentages are bold tabular figures with the exact hand count in small mono beneath.

## Layout

One centred binder page, max 1320px, with the spine rail full width of the page. Below the rail: deck column on the left (search bar, then Main, Extra and Side as card art) and a right column of workspace tabs and panels. Card grids are exactly **ten cards to a row** so a 40 or 60 card deck lands in whole rows; five per row under 640px. Under about 960px the columns stack.

## Elevation & Depth

Flat. The page has a hairline and one soft ambient shadow against the desk. Card art sits in a pale sleeve edge (a 2px cream halo). Popovers use a soft 24px blur. Nothing else casts a shadow.

## Shapes

Controls have a 3px radius, tabs 6px at the top corners only. Cards keep their native 177:254 ratio with a 3px radius.

## Components

- **Button**: outlined ink, one height (2.25rem) everywhere, including file pickers and menu triggers. One filled red **primary** per surface (Save YDK in the rail, Define a Hand Goal in the next-step panel). On the rail, buttons are outlined cream.
- **Tabs**: sunken tan with a tan rule; the active tab takes the page colour, loses its bottom rule and gains a 3px red top edge.
- **Panel**: sleeve white, 1px rule, Young Serif heading, no nested boxes.
- **Card tile**: sleeved art, name on hover only, role pips at the foot. Selecting a card lifts it and dims the rest to 55%. Dragging a tile dims it to 35% and marks the drop position with a red bar.
- **Hand tile**: in the hand a card is lifted with a 3px red box; the rest of the deck dims to 40%.
- **Next step**: a single panel with a red rule: a sentence and one filled button, "Define a Hand Goal" until a goal exists, then "Test a hand".
- **Hand Goal odds**: name on the left, bold percent on the right, exact "hands / total" in mono beneath.

## Do's and Don'ts

- Do keep one filled button per surface and make every other action an outlined button of the same size.
- Do let card art lead; labels go on hover, numbers go beside art.
- Do use the sleeve edge on every card image, and hairlines for structure.
- Don't add a kicker or eyebrow above a heading, section numbers, gradients, glass, or hard offset shadows.
- Don't use red as a fill for anything but the primary action and selection.
- Don't change the ten-per-row grid; shrink tiles instead.
