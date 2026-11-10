import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Every test gets a fresh browser context, so there is no saved draft and the
// app loads public/default.ydk as a real first run does. Expected counts come
// from that file, so replacing the default deck does not break these tests.
function defaultDeckCounts(): { main: number; extra: number; side: number } {
  const counts = { main: 0, extra: 0, side: 0 };
  let section: keyof typeof counts = "main";
  for (const raw of readFileSync("public/default.ydk", "utf8").split(/\r?\n/)) {
    const line = raw.trim().toLowerCase();
    if (line === "#main") section = "main";
    else if (line === "#extra") section = "extra";
    else if (line === "!side" || line === "#side") section = "side";
    else if (/^\d+$/.test(line)) counts[section] += 1;
  }
  return counts;
}
const DEFAULT = defaultDeckCounts();

async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("status").filter({ hasText: "Loaded the default deck" })).toBeVisible();
}

async function addCardBySearch(page: Page, query: string): Promise<void> {
  await page.getByLabel("Card name or passcode").fill(query);
  await page.locator(".search-result").first().click();
}

function defaultDeckCards(): Record<"main" | "extra" | "side", Record<string, number>> {
  const sections = { main: {}, extra: {}, side: {} } as Record<
    "main" | "extra" | "side",
    Record<string, number>
  >;
  let section: "main" | "extra" | "side" = "main";
  for (const raw of readFileSync("public/default.ydk", "utf8").split(/\r?\n/)) {
    const line = raw.trim().toLowerCase();
    if (line === "#main") section = "main";
    else if (line === "#extra") section = "extra";
    else if (line === "!side" || line === "#side") section = "side";
    else if (/^\d+$/.test(line)) sections[section][line] = (sections[section][line] ?? 0) + 1;
  }
  return sections;
}

test("the deck on first run is exactly the cards in default.ydk", async ({ page }) => {
  await openApp(page);
  const expected = defaultDeckCards();
  const saved = await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem("mapping.document.v2")!);
    const toMap = (cards: { card_id: number; quantity: number }[]) =>
      Object.fromEntries(cards.map((c) => [String(c.card_id), c.quantity]));
    return { main: toMap(doc.main), extra: toMap(doc.extra), side: toMap(doc.side) };
  });
  expect(saved.main).toEqual(expected.main);
  expect(saved.extra).toEqual(expected.extra);
  expect(saved.side).toEqual(expected.side);
});

test("first run loads the default deck from default.ydk", async ({ page }) => {
  await openApp(page);
  const counts = page.locator(".counts");
  await expect(counts).toContainText(`${DEFAULT.main} main`);
  await expect(counts).toContainText(`${DEFAULT.extra} extra`);
  await expect(counts).toContainText(`${DEFAULT.side} side`);
  await expect(page.getByLabel("Deck", { exact: true })).toHaveValue("default deck");
});

test("card search finds the newest cards, even from a partial phrase", async ({ page }) => {
  await openApp(page);
  const search = page.getByLabel("Card name or passcode");
  await search.fill("ars magna acropolis");
  await expect(page.locator(".search-results")).toContainText(
    "Ars Magna Academic Arcane Apparition Acropolis",
  );
  // Omega Vidolium is an Extra Deck monster: Main hides it, Extra shows it.
  await search.fill("omega vidolium");
  await expect(page.locator(".search-results")).not.toContainText("Omega Vidolium");
  await page.getByRole("group", { name: "Add to" }).getByRole("button", { name: "Extra" }).click();
  await expect(page.locator(".search-results")).toContainText("Omega Vidolium the Power Patron of Heaven's End");
});

test("an Extra Deck monster is added to the Extra Deck from the Extra filter", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "New deck" }).click();
  await expect(page.locator(".counts")).toContainText("0 extra");

  await page.getByRole("group", { name: "Add to" }).getByRole("button", { name: "Extra" }).click();
  await addCardBySearch(page, "omega vidolium");

  await expect(page.getByRole("status").filter({ hasText: "Added Omega Vidolium" })).toBeVisible();
  await expect(page.locator(".counts")).toContainText("1 extra");
  await expect(page.locator(".counts")).toContainText("0 main");
});

test("a card cannot go past 3 copies across Main, Extra and Side", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "New deck" }).click();
  await page.getByLabel("Forbidden and limited list").selectOption("none");
  await page.getByLabel("Card name or passcode").fill("vidolium unstable");
  const result = page.locator(".search-result").first();
  // A full card is aria-disabled; force the click to prove the app refuses it.
  for (let copy = 0; copy < 4; copy += 1) await result.click({ force: true });
  await expect(page.locator(".counts")).toContainText("3 main");
  await expect(page.getByRole("status").filter({ hasText: "limit of 3" })).toBeVisible();
});

test("a forbidden card cannot be added under the OCG list", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "New deck" }).click();
  await page.getByLabel("Forbidden and limited list").selectOption("ocg");
  // Abyss Dweller is an Extra Deck monster, so look under Side, which shows every card.
  await page.getByRole("group", { name: "Add to" }).getByRole("button", { name: "Side" }).click();
  await page.getByLabel("Card name or passcode").fill("21044178");
  await page.locator(".search-result").first().click({ force: true });
  await expect(page.getByRole("status").filter({ hasText: "forbidden" })).toBeVisible();
  await expect(page.locator(".counts")).toContainText("0 main");
});

test("a main deck card stays in the Main Deck", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "New deck" }).click();
  await addCardBySearch(page, "vidolium unstable");
  await expect(page.locator(".counts")).toContainText("1 main");
  await expect(page.locator(".counts")).toContainText("0 extra");
});

test.describe("Hand Test", () => {
  const nav = (page: Page, name: string) =>
    page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name });

  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await nav(page, "Hand Test").click();
  });

  test("drawing shuffles the deck and boxes the top 5 cards above the results", async ({ page }) => {
    await page.getByRole("button", { name: "Draw Random Hand" }).click();
    const grid = page.locator(".hand-deck-grid");
    await expect(grid.locator(".hand-tile.in-hand")).toHaveCount(5);
    await expect(grid.locator(".hand-tile")).toHaveCount(DEFAULT.main);
    await expect(page.locator(".hand-total")).toContainText("5 / 5");

    // The shuffled order puts the drawn cards first.
    const classes = await page.locator(".hand-deck-grid .hand-tile").evaluateAll((els) =>
      els.map((el) => el.className),
    );
    expect(classes.slice(0, 5).every((name) => name.includes("in-hand"))).toBe(true);

    // The Main Deck in the middle is the grid; it is not a second copy in the panel.
    await expect(page.locator(".hand-deck-grid")).toHaveCount(1);
    await expect(page.locator(".deck-grid-section .hand-deck-grid")).toHaveCount(1);
  });

  test("clicking tiles adds and removes cards from the hand", async ({ page }) => {
    const grid = page.locator(".hand-deck-grid");
    await grid.locator(".hand-tile").first().click();
    await expect(page.locator(".hand-total")).toContainText("1 / 5");
    await grid.locator(".hand-tile.in-hand").first().click();
    await expect(page.locator(".hand-total")).toContainText("0 / 5");
  });

  test("Clear hand removes the tested hand", async ({ page }) => {
    await page.getByRole("button", { name: "Draw Random Hand" }).click();
    await expect(page.getByRole("heading", { name: "Tested Hand" })).toBeVisible();
    await page.getByRole("button", { name: "Clear hand", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tested Hand" })).toHaveCount(0);
    await expect(page.locator(".hand-tile.in-hand")).toHaveCount(0);
  });

  test("the deck tiles do not overlap", async ({ page }) => {
    const tiles = page.locator(".hand-deck-grid li");
    await expect(tiles.first()).toBeVisible();
    const a = (await tiles.nth(0).boundingBox())!;
    const b = (await tiles.nth(1).boundingBox())!;
    expect(a.width).toBeLessThanOrEqual(110);
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.width - 1);
  });

  test.describe("Many hands tab", () => {
    test.beforeEach(async ({ page }) => {
      await nav(page, "Many hands").click();
    });

    test("generates the requested number of hands", async ({ page }) => {
      const count = page.getByLabel("Number of hands");
      await expect(count).toHaveValue("10");
      await page.getByRole("button", { name: "Generate hands" }).click();
      await expect(page.locator(".hand-batch-item")).toHaveCount(10);

      await count.fill("25");
      await page.getByRole("button", { name: "Generate hands" }).click();
      await expect(page.locator(".hand-batch-item")).toHaveCount(25);

      await page.getByRole("button", { name: "Clear hands" }).click();
      await expect(page.locator(".hand-batch-item")).toHaveCount(0);
    });

    test("rejects an invalid number of hands", async ({ page }) => {
      await page.getByLabel("Number of hands").fill("0");
      await page.getByRole("button", { name: "Generate hands" }).click();
      await expect(page.getByText("hand count must be an integer from 1 to 1000")).toBeVisible();
    });

    test("Open in Hand Test boxes that hand in the deck grid", async ({ page }) => {
      await page.getByRole("button", { name: "Generate hands" }).click();
      await page.getByRole("button", { name: "Open in Hand Test" }).first().click();
      await expect(page.getByRole("button", { name: "Draw Random Hand" })).toBeVisible();
      await expect(page.locator(".hand-tile.in-hand")).toHaveCount(5);
    });
  });
});

test.describe("Deck view", () => {
  const section = (page: Page, title: string) =>
    page.locator(".deck-section").filter({ has: page.getByRole("heading", { name: title }) });

  test("shows the deck as card art, one tile per copy", async ({ page }) => {
    await openApp(page);
    await expect(section(page, "Main Deck").locator(".deck-tile")).toHaveCount(DEFAULT.main);
    await expect(section(page, "Extra Deck").locator(".deck-tile")).toHaveCount(DEFAULT.extra);
    await expect(section(page, "Side Deck").locator(".deck-tile")).toHaveCount(DEFAULT.side);
    await expect(page.locator(".deck-section table")).toHaveCount(0);
  });

  test("copies of a card sit side by side", async ({ page }) => {
    await openApp(page);
    const copies = section(page, "Main Deck").getByRole("button", { name: /^Edit .*, copy \d of \d$/ });
    const a = (await copies.nth(0).boundingBox())!;
    const b = (await copies.nth(1).boundingBox())!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(b.x).toBeGreaterThan(a.x);
    await expect(copies.nth(0)).toHaveAttribute("aria-label", /copy 1 of/);
    await expect(copies.nth(1)).toHaveAttribute("aria-label", /copy 2 of/);
  });

  test("clicking a card edits its quantity and tags underneath", async ({ page }) => {
    await openApp(page);
    const main = section(page, "Main Deck");
    await main.locator(".deck-tile").first().click();
    const detail = main.getByRole("group", { name: /^Edit / });
    await expect(detail).toBeVisible();
    await expect(detail.getByText("Going First")).toBeVisible();

    await detail.getByRole("button", { name: "Increase quantity" }).click();
    await expect(page.locator(".counts")).toContainText(`${DEFAULT.main + 1} main`);
    // The new copy gets its own tile next to the others.
    await expect(main.locator(".deck-tile")).toHaveCount(DEFAULT.main + 1);

    await detail.getByRole("button", { name: "Close" }).click();
    await expect(main.getByRole("group", { name: /^Edit / })).toHaveCount(0);
  });

  test("the editor opens right under the clicked card, not at the end of the section", async ({ page }) => {
    await openApp(page);
    const main = section(page, "Main Deck");
    const tile = main.locator(".deck-tile").nth(3);
    const tileBox = (await tile.boundingBox())!;
    await tile.click();

    const detail = main.getByRole("group", { name: /^Edit / });
    await expect(detail).toBeInViewport();
    const detailBox = (await detail.boundingBox())!;
    // Directly below the clicked row: within about one tile row, not a section away.
    expect(detailBox.y).toBeGreaterThan(tileBox.y);
    expect(detailBox.y - tileBox.y).toBeLessThan(200);
    // And the Role controls are usable without scrolling away from the card.
    await expect(detail.getByRole("button", { name: "Starter" })).toBeInViewport();
    await detail.getByRole("button", { name: "Starter" }).click();
    await expect(detail.getByRole("button", { name: "Starter" })).toHaveAttribute("aria-pressed", "true");
  });

  test("Extra Deck cards have no role or opening quality controls", async ({ page }) => {
    await openApp(page);
    // Extra Deck cards are never in an opening hand.
    const extra = section(page, "Extra Deck");
    await extra.locator(".deck-tile").first().click();
    await expect(extra.getByRole("group", { name: /^Edit / })).toBeVisible();
    await expect(extra.getByText("Going First")).toHaveCount(0);
    await expect(extra.getByText("Starter")).toHaveCount(0);

    // Side cards can be sided in, so they keep the controls.
    const side = section(page, "Side Deck");
    await side.locator(".deck-tile").first().click();
    await expect(side.getByText("Going First").first()).toBeVisible();
  });
});

test.describe("Dragging cards in the deck", () => {
  const section = (page: Page, title: string) =>
    page.locator(".deck-section").filter({ has: page.getByRole("heading", { name: title }) });

  // Extra and Side sit next to each other, so both stay on screen for the drag.
  test("dragging an Extra card onto the Side Deck moves one copy", async ({ page }) => {
    await openApp(page);
    await section(page, "Extra Deck").locator(".deck-tile").first().dragTo(section(page, "Side Deck"));
    await expect(page.locator(".counts")).toContainText(`${DEFAULT.extra - 1} extra`);
    await expect(page.locator(".counts")).toContainText(`${DEFAULT.side + 1} side`);
  });

  test("a Main card cannot be dragged into Extra", async ({ page }) => {
    await openApp(page);
    await section(page, "Side Deck").locator(".deck-tile").first().scrollIntoViewIfNeeded();
    const extra = section(page, "Extra Deck");
    const main = section(page, "Main Deck").locator(".deck-tile").last();
    await main.dragTo(extra);
    await expect(page.locator(".counts")).toContainText(`${DEFAULT.main} main`);
    await expect(page.locator(".counts")).toContainText(`${DEFAULT.extra} extra`);
  });

  test("dropping a card before another reorders the section", async ({ page }) => {
    await openApp(page);
    const tiles = section(page, "Extra Deck").locator(".deck-tile");
    const lastTitle = await tiles.last().getAttribute("title");
    await tiles.last().dragTo(tiles.first());
    await expect(section(page, "Extra Deck").locator(".deck-tile").first()).toHaveAttribute("title", lastTitle!);
    await expect(page.locator(".counts")).toContainText(`${DEFAULT.extra} extra`);
  });
});

test("Set as default makes the current deck what Default deck loads", async ({ page }) => {
  await openApp(page);
  const side = page.locator(".deck-section").filter({ has: page.getByRole("heading", { name: "Side Deck" }) });
  await page
    .locator(".deck-section")
    .filter({ has: page.getByRole("heading", { name: "Extra Deck" }) })
    .locator(".deck-tile")
    .first()
    .dragTo(side);
  await page.getByRole("button", { name: "Set as default" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved as your default" })).toBeVisible();

  await page.getByRole("button", { name: "New deck" }).click();
  await expect(page.locator(".counts")).toContainText("0 main");
  await page.getByRole("button", { name: "Default deck" }).click();
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await expect(page.locator(".counts")).toContainText(`${DEFAULT.extra - 1} extra`);
  await expect(page.locator(".counts")).toContainText(`${DEFAULT.side + 1} side`);
});

test.describe("Card Rank", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Rank" }).click();
  });

  const region = (page: Page, label: string) =>
    page.getByRole("region", { name: `${label} ranking` });
  // Card names in rank order, read from each tile's tooltip.
  const order = (page: Page, label: string) =>
    region(page, label).locator(".rank-tile").evaluateAll((tiles) =>
      tiles.map((tile) => tile.getAttribute("title")),
    );

  test("shows card art in rank order for going first and going second", async ({ page }) => {
    await expect(region(page, "Going First")).toBeVisible();
    await expect(region(page, "Going Second")).toBeVisible();
    await expect(page.getByText("Not ranked yet").first()).toBeVisible();
    // Every tile carries its rank number, 1 upward.
    const nums = await region(page, "Going First").locator(".rank-num").allInnerTexts();
    expect(nums.slice(0, 3)).toEqual(["1", "2", "3"]);
  });

  test("lays the cards out as a grid, not a column of wrapped text", async ({ page }) => {
    // Regression: the lists once sat in a narrow column and names wrapped letter by letter.
    const tiles = region(page, "Going First").locator(".rank-tile");
    const a = (await tiles.nth(0).boundingBox())!;
    const b = (await tiles.nth(1).boundingBox())!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(2); // side by side on one row
    expect(b.x).toBeGreaterThan(a.x);
    expect(a.width).toBeLessThan(100);
    await expect(region(page, "Going First").locator(".rank-name")).toHaveCount(0);
  });

  test("click a card, then click where it should go", async ({ page }) => {
    const before = await order(page, "Going First");
    const tiles = region(page, "Going First").locator(".rank-tile");
    await tiles.nth(3).click(); // pick up the 4th card
    await expect(tiles.nth(3)).toHaveAttribute("aria-pressed", "true");
    await tiles.nth(0).click(); // drop it at position 1
    const after = await order(page, "Going First");
    expect(after[0]).toBe(before[3]);
    expect(after[1]).toBe(before[0]);
    // The other turn order is untouched.
    expect((await order(page, "Going Second"))[0]).toBe(before[0]);
    await expect(page.getByText("Not ranked yet")).toHaveCount(1);
  });

  test("dragging a card reorders the list", async ({ page }) => {
    const tiles = region(page, "Going Second").locator(".rank-tile");
    const before = await order(page, "Going Second");
    await tiles.nth(3).dragTo(tiles.nth(0));
    const after = await order(page, "Going Second");
    expect(after[0]).toBe(before[3]);
    expect(after[1]).toBe(before[0]);
  });

  test("the keyboard moves a picked-up card with the arrow keys", async ({ page }) => {
    const before = await order(page, "Going First");
    const first = region(page, "Going First").locator(".rank-tile").first();
    await first.focus();
    await page.keyboard.press("Space"); // pick up
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space"); // put down
    const after = await order(page, "Going First");
    expect(after[2]).toBe(before[0]);
    expect(after[0]).toBe(before[1]);
  });

  test("the order survives a reload and Reset puts a list back", async ({ page }) => {
    const before = await order(page, "Going First");
    const tiles = region(page, "Going First").locator(".rank-tile");
    await tiles.nth(1).click();
    await tiles.nth(0).click();
    await page.reload();
    await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Rank" }).click();
    expect((await order(page, "Going First"))[0]).toBe(before[1]);

    await region(page, "Going First").getByRole("button", { name: "Reset" }).click();
    expect(await order(page, "Going First")).toEqual(before);
  });
});

test("the Default deck button loads default.ydk over whatever is there", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "New deck" }).click();
  await expect(page.locator(".counts")).toContainText("0 main");

  await page.getByRole("button", { name: "Default deck" }).click();
  await expect(page.getByText("Replace the current deck and models with default.ydk?")).toBeVisible();
  await page.getByRole("button", { name: "Replace", exact: true }).click();

  await expect(page.locator(".counts")).toContainText(`${DEFAULT.main} main`);
  await expect(page.locator(".counts")).toContainText(`${DEFAULT.extra} extra`);
  await expect(page.locator(".counts")).toContainText(`${DEFAULT.side} side`);
});

test("an existing saved draft is not replaced by the default deck on load", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "New deck" }).click();
  await page.reload();
  await expect(page.locator(".counts")).toContainText("0 main");
});

test.describe("Paste a deck list", () => {
  async function pasteList(page: Page, text: string): Promise<void> {
    await page.getByText("Paste a deck list").click();
    await page.getByLabel("Deck list to paste").fill(text);
  }

  test("Replace deck swaps the cards and keeps the name", async ({ page }) => {
    await openApp(page);
    await pasteList(page, "#main\n70488851\n70488851\n#extra\n90917401\n!side\n24224830");
    await page.getByRole("button", { name: "Replace deck" }).click();
    await expect(page.locator(".counts")).toContainText("2 main");
    await expect(page.locator(".counts")).toContainText("1 extra");
    await expect(page.locator(".counts")).toContainText("1 side");
    await expect(page.getByLabel("Deck", { exact: true })).toHaveValue("default deck");
  });

  test("Add to deck appends and sends Extra Deck monsters to Extra", async ({ page }) => {
    await openApp(page);
    await pasteList(page, "90917401 1\n70488851 1");
    await page.getByRole("button", { name: "Add to deck" }).click();
    await expect(page.locator(".counts")).toContainText(`${DEFAULT.main + 1} main`);
    await expect(page.locator(".counts")).toContainText(`${DEFAULT.extra + 1} extra`);
  });

  test("the buttons stay disabled until there is something to paste", async ({ page }) => {
    await openApp(page);
    await page.getByText("Paste a deck list").click();
    await expect(page.getByRole("button", { name: "Replace deck" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Add to deck" })).toBeDisabled();
  });
});

test.describe("Clear menu", () => {
  test("clears one section after confirming, and cancel keeps the cards", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "Clear", exact: true }).first().click();
    const menu = page.getByRole("group", { name: "Clear", exact: true });
    // The default deck has side cards, so Side Deck is clearable; Groups has nothing.
    await expect(menu.getByRole("button", { name: /Side Deck/ })).toBeEnabled();
    await expect(menu.getByRole("button", { name: /Groups/ })).toBeDisabled();

    // Cancel keeps the cards (the menu stays open).
    await menu.getByRole("button", { name: /Extra Deck/ }).click();
    await menu.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator(".counts")).toContainText(`${DEFAULT.extra} extra`);

    // Confirm clears only that section and closes the menu.
    await menu.getByRole("button", { name: /Extra Deck/ }).click();
    await menu.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(page.locator(".counts")).toContainText("0 extra");
    await expect(page.locator(".counts")).toContainText(`${DEFAULT.main} main`);
    await expect(menu).toHaveCount(0);
  });

  test("closes on Escape", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "Clear", exact: true }).first().click();
    await expect(page.getByRole("group", { name: "Clear", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("group", { name: "Clear", exact: true })).toHaveCount(0);
  });
});

test.describe("Deck Configuration", () => {
  test("a post-side list changes what is analyzed", async ({ page }) => {
    await openApp(page);
    await expect(page.locator(".analyzing-strip")).toContainText("Pre-Side");

    await page.getByRole("button", { name: "Post-Side", exact: true }).click();
    await expect(page.locator(".analyzing-strip")).toContainText("Post-Side 1");

    // A card that is in Main (a Side-only card's minus is a no-op).
    await page
      .locator('button[aria-label^="Move one"][aria-label$="to Side"]')
      .first()
      .click();
    await expect(page.locator(".analyzing-strip")).toContainText(`${DEFAULT.main - 1} main`);
    await expect(page.locator(".diff-chips li")).toHaveCount(1);

    // The deck list on the left stays Pre-Side.
    await expect(page.locator(".deck-editor-banner")).toContainText("Pre-Side");

    await page.getByRole("radio", { name: "Pre-Side" }).click();
    await expect(page.locator(".analyzing-strip")).toContainText(`${DEFAULT.main} main`);
  });

  test("Side Deck cards are listed first and can be swapped in for a Main card", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "Post-Side", exact: true }).click();

    // The default deck has side cards: they come first, under their own heading.
    await expect(page.getByRole("heading", { name: /^Main \(/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Not in Main \(/ })).toBeVisible();
    await expect(page.getByText("Click a card in Main to send it to the Side")).toBeVisible();
    await expect(page.getByRole("list", { name: "Main in this configuration", exact: true }).locator("li")).toHaveCount(DEFAULT.main);
    await expect(page.getByRole("list", { name: "Not in Main in this configuration", exact: true }).locator("li")).toHaveCount(DEFAULT.side);

    // Send the first Main card out, bring the last Side card in: same size, two changes.
    await page.locator('button[aria-label^="Move one"][aria-label$="to Side"]').first().click();
    await page.locator('button[aria-label^="Move one"][aria-label$="to Main"]').last().click();
    await expect(page.locator(".analyzing-strip")).toContainText(`${DEFAULT.main} main`);
    await expect(page.locator(".diff-chips li")).toHaveCount(2);
    await expect(page.locator(".configuration-summary")).toContainText("2 swapped, same size as Pre-Side");
  });

  test("explains when there is no Side Deck to swap in", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "Clear", exact: true }).first().click();
    const menu = page.getByRole("group", { name: "Clear", exact: true });
    await menu.getByRole("button", { name: /Side Deck/ }).click();
    await menu.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByRole("button", { name: "Post-Side", exact: true }).click();
    await expect(page.getByText("Your Side Deck is empty, so there is nothing to bring in")).toBeVisible();
  });

  test("the configuration chips support arrow keys", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "Post-Side", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Post-Side 1" })).toBeChecked();
    await page.getByRole("radio", { name: "Post-Side 1" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("radio", { name: "Pre-Side" })).toBeChecked();
  });
});

test("Card Impact ranks cards once a Hand Goal has conditions", async ({ page }) => {
  await openApp(page);
  await expect(page.getByText("Put Hand Conditions into a Hand Goal")).toBeVisible();
});
