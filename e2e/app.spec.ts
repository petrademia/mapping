import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Every test gets a fresh browser context, so there is no saved draft and the
// app loads public/default.ydk as a real first run does. Expected counts come
// from that file, so replacing the default deck does not break these tests.
function defaultDeckCounts(): { main: number; extra: number; side: number; sideToMain: number } {
  const counts = { main: 0, extra: 0, side: 0, sideToMain: 0 };
  // Extra Deck monsters can sit in the Side Deck but cannot be swapped into Main.
  const extraIds = new Set<number>(JSON.parse(readFileSync("public/extra-deck.json", "utf8")));
  let section: "main" | "extra" | "side" = "main";
  for (const raw of readFileSync("public/default.ydk", "utf8").split(/\r?\n/)) {
    const line = raw.trim().toLowerCase();
    if (line === "#main") section = "main";
    else if (line === "#extra") section = "extra";
    else if (line === "!side" || line === "#side") section = "side";
    else if (/^\d+$/.test(line)) {
      counts[section] += 1;
      if (section === "side" && !extraIds.has(Number(line))) counts.sideToMain += 1;
    }
  }
  return counts;
}
const DEFAULT = defaultDeckCounts();

async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("status").filter({ hasText: "Loaded the default deck" })).toBeVisible();
}

const STEP_OF: Record<string, string> = {
  Models: "Define",
  Handtraps: "Define",
  Rank: "Define",
  "Hand Test": "Test",
  "Batch Test": "Test",
  Profile: "Analyze",
  Scorecard: "Analyze",
  Compare: "Analyze",
};

/** Opens a workspace: first its step (Define, Test, Analyze), then its tab. */
async function openWorkspace(page: Page, name: string): Promise<void> {
  await page.getByRole("navigation", { name: "Step" }).getByRole("button", { name: STEP_OF[name]!, exact: true }).click();
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name, exact: true }).click();
}
const nav = (page: Page, name: string) => ({ click: () => openWorkspace(page, name) });

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

  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await nav(page, "Hand Test").click();
  });

  test("New Hand deals the opening hand beside the deck, which greys out what was drawn", async ({ page }) => {
    await page.getByRole("button", { name: "New Hand" }).click();
    const deck = page.getByRole("region", { name: "Deck" });
    const hand = page.getByRole("region", { name: "Hand" });
    await expect(hand.locator(".hand-tile.in-hand")).toHaveCount(5);
    await expect(deck.locator(".hand-tile")).toHaveCount(DEFAULT.main);
    await expect(deck.locator(".hand-tile.drawn")).toHaveCount(5);
    await expect(page.locator(".hand-total")).toContainText("5 Cards in hand");
    await expect(page.locator(".hand-remaining")).toContainText(`${DEFAULT.main - 5} / ${DEFAULT.main} Remaining`);
    // The deck list above is no longer where the hand shows.
    await expect(page.locator(".deck-grid-section .hand-tile")).toHaveCount(0);
  });

  test("Draw takes the chosen number of cards from the top of the deck", async ({ page }) => {
    await page.getByRole("button", { name: "New Hand" }).click();
    await page.getByLabel("Cards to draw").fill("3");
    await page.getByRole("button", { name: "Draw", exact: true }).click();
    await expect(page.locator(".hand-total")).toContainText("8 Cards in hand");
    await expect(page.getByRole("region", { name: "Deck" }).locator(".hand-tile.drawn")).toHaveCount(8);
    // A hand that is not the opening size still gets its results.
    await expect(page.getByText("This hand has 8 cards; the opening hand is 5.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tested Hand" })).toBeVisible();
  });

  test("Draw from an empty table starts from a fresh shuffle", async ({ page }) => {
    await page.getByRole("button", { name: "Draw", exact: true }).click();
    await expect(page.locator(".hand-total")).toContainText("1 Card in hand");
  });

  test("Shuffle mixes the deck again and keeps the hand", async ({ page }) => {
    await page.getByRole("button", { name: "New Hand" }).click();
    const ids = () =>
      page
        .getByRole("region", { name: "Hand" })
        .locator(".hand-tile")
        .evaluateAll((els) => els.map((el) => el.getAttribute("title")).sort());
    const before = await ids();
    await page.getByRole("button", { name: "Shuffle" }).click();
    expect(await ids()).toEqual(before);
    await expect(page.locator(".hand-total")).toContainText("5 Cards in hand");
  });

  test("a ten-card opening hand responds right away", async ({ page }) => {
    // Regression: the exact odds were enumerated hand by hand and took tens of seconds.
    const started = Date.now();
    await page.getByLabel("Opening hand").fill("10");
    await page.getByRole("button", { name: "New Hand" }).click();
    await expect(page.locator(".hand-tile.in-hand")).toHaveCount(10);
    expect(Date.now() - started).toBeLessThan(4000);
  });

  test("clicking a card in the deck draws it and clicking it in the hand returns it", async ({ page }) => {
    await page.getByRole("region", { name: "Deck" }).locator(".hand-tile").first().click();
    await expect(page.locator(".hand-total")).toContainText("1 Card in hand");
    await page.getByRole("region", { name: "Hand" }).locator(".hand-tile.in-hand").first().click();
    await expect(page.locator(".hand-total")).toContainText("0 Cards in hand");
    await expect(page.getByRole("heading", { name: "Tested Hand" })).toHaveCount(0);
  });

  test("Clear hand removes the tested hand", async ({ page }) => {
    await page.getByRole("button", { name: "New Hand" }).click();
    await expect(page.getByRole("heading", { name: "Tested Hand" })).toBeVisible();
    await page.getByRole("button", { name: "Clear hand", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tested Hand" })).toHaveCount(0);
    await expect(page.locator(".hand-tile.in-hand")).toHaveCount(0);
    await expect(page.locator(".hand-tile.drawn")).toHaveCount(0);
  });

  test("the deck tiles do not overlap", async ({ page }) => {
    const tiles = page.getByRole("region", { name: "Deck" }).locator(".hand-deck-grid li");
    await expect(tiles.first()).toBeVisible();
    const a = (await tiles.nth(0).boundingBox())!;
    const b = (await tiles.nth(1).boundingBox())!;
    expect(a.width).toBeLessThanOrEqual(110);
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.width - 1);
  });

  test.describe("Batch Test tab", () => {
    test.beforeEach(async ({ page }) => {
      await nav(page, "Batch Test").click();
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

    test("Open in Hand Test puts that hand beside the deck", async ({ page }) => {
      await page.getByRole("button", { name: "Generate hands" }).click();
      await page.getByRole("button", { name: "Open in Hand Test" }).first().click();
      await expect(page.getByRole("button", { name: "New Hand" })).toBeVisible();
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

  test("the quantity box is wide enough to show two digits", async ({ page }) => {
    await openApp(page);
    const main = section(page, "Main Deck");
    await main.locator(".deck-tile").first().click();
    const box = main.getByRole("group", { name: /^Edit / }).getByRole("spinbutton", { name: "Quantity" });
    // The inner text area, after padding and the browser's own spin buttons, must fit "99".
    expect(await box.evaluate((el: HTMLInputElement) => el.clientWidth)).toBeGreaterThanOrEqual(32);
    await box.fill("99");
    await expect(box).toHaveValue("99");
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

test.describe("Binder Pages shell", () => {
  test("the deck sits ten cards to a row", async ({ page }) => {
    await openApp(page);
    await page.waitForLoadState("networkidle");
    const tiles = page.locator(".deck-grid-section").first().locator(".deck-tile");
    const ys = await tiles.evaluateAll((els) => els.slice(0, 20).map((el) => Math.round(el.getBoundingClientRect().y)));
    const firstRow = ys.filter((y) => y === ys[0]).length;
    expect(firstRow).toBe(10);
    // The second row starts at the eleventh card.
    expect(ys[10]).toBeGreaterThan(ys[0]!);
    expect(ys.slice(10).filter((y) => y === ys[10]).length).toBe(10);
  });

  test("the next step sends you to Hand Goals", async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole("heading", { name: "Define a Hand Goal" })).toBeVisible();
    await page.getByRole("button", { name: "Define a Hand Goal" }).click();
    await expect(page.getByRole("heading", { name: "Hand Goals" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Add Hand Goal" })).toBeVisible();
  });

  test("a Hand Goal shows its odds with the exact hand count", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "Define a Hand Goal" }).click();
    await page.getByRole("button", { name: "+ Add Hand Goal" }).click();
    await page.getByRole("button", { name: "+ Create hand condition" }).last().click();
    await page.locator('.engine-member input[type="checkbox"]').last().check();
    await nav(page, "Profile").click();
    const odds = page.getByRole("region", { name: "Hand Goal odds" });
    await expect(odds).toBeVisible();
    await expect(odds.locator(".odds-fraction").first()).toContainText(/\d[\d,]* \/ [\d,]+/);
    // With a goal defined the prompt moves on to testing a hand.
    await expect(page.getByRole("heading", { name: "Test a hand" })).toBeVisible();
  });
});

test.describe("Compare decks", () => {
  // The default deck with its first three Main Deck cards removed.
  function trimmedDefaultYdk(): string {
    const lines = readFileSync("public/default.ydk", "utf8").split(/\r?\n/);
    const mainAt = lines.findIndex((line) => line.trim() === "#main");
    let removed = 0;
    return lines
      .filter((line, index) => {
        if (index > mainAt && removed < 3 && /^\d+$/.test(line.trim())) {
          removed += 1;
          return false;
        }
        return true;
      })
      .join("\n");
  }

  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await nav(page, "Compare").click();
  });

  test("starts empty and says what to do", async ({ page }) => {
    await expect(page.getByText("No deck loaded to compare.")).toBeVisible();
  });

  test("loads a second deck and compares slots and the cards that differ", async ({ page }) => {
    await page.locator('.compare-panel input[type="file"]').setInputFiles({
      name: "slim.ydk",
      mimeType: "text/plain",
      buffer: Buffer.from(trimmedDefaultYdk()),
    });
    const results = page.getByLabel("Comparison");
    await expect(results).toBeVisible();
    await expect(results.getByRole("table", { name: "Slots" })).toBeVisible();
    await expect(results.getByRole("row", { name: /Main Deck size/ })).toContainText(`${DEFAULT.main}`);
    await expect(results.getByRole("row", { name: /Main Deck size/ })).toContainText(`${DEFAULT.main - 3}`);
    await expect(results.getByRole("list", { name: "Cards the compared deck drops" }).locator("li").first()).toBeVisible();
  });

  test("compares Hand Goal odds with the exact hand count", async ({ page }) => {
    // Define a goal that reads a card both decks hold.
    await nav(page, "Models").click();
    await page.getByRole("navigation", { name: "Models" }).getByRole("button", { name: "Hand Goals" }).click();
    await page.getByRole("button", { name: "+ Add Hand Goal" }).click();
    await page.getByRole("button", { name: "+ Create hand condition" }).last().click();
    await page.locator('.engine-member input[type="checkbox"]').last().check();
    await nav(page, "Compare").click();
    await page.locator('.compare-panel input[type="file"]').setInputFiles({
      name: "slim.ydk",
      mimeType: "text/plain",
      buffer: Buffer.from(trimmedDefaultYdk()),
    });
    const table = page.getByRole("table", { name: "Hand Goal odds" });
    await expect(table).toBeVisible();
    await expect(table.locator(".odds-fraction").first()).toContainText(/\d[\d,]* \/ [\d,]+/);
    await expect(page.getByRole("table", { name: "Consistency" }).getByRole("row", { name: /Brick/ })).toBeVisible();
  });

  test("Use compared deck replaces the deck", async ({ page }) => {
    await page.locator('.compare-panel input[type="file"]').setInputFiles({
      name: "slim.ydk",
      mimeType: "text/plain",
      buffer: Buffer.from(trimmedDefaultYdk()),
    });
    await page.getByRole("button", { name: "Use compared deck" }).click();
    await page.getByRole("button", { name: "Replace", exact: true }).click();
    await expect(page.locator(".counts")).toContainText(`${DEFAULT.main - 3} main`);
  });
});

test("an Extra Deck card can be sided between Extra and Side in a Post-Side list", async ({ page }) => {
  await openApp(page);
  // One Extra Deck monster in Extra and a second copy waiting in Side.
  await page.getByText("Paste a deck list").click();
  await page.getByLabel("Deck list to paste").fill("#main\n70488851\n70488851\n#extra\n90917401\n!side\n24224830\n90917401");
  await page.getByRole("button", { name: "Replace deck" }).click();
  await expect(page.locator(".counts")).toContainText("1 extra");
  await expect(page.locator(".counts")).toContainText("2 side");

  await page.getByRole("button", { name: "Post-Side", exact: true }).click();
  const inExtra = page.getByRole("list", { name: "Extra in this configuration" });
  const sideExtras = page.getByRole("list", { name: "Extra Deck cards in Side in this configuration" });
  await expect(page.getByRole("heading", { name: "Extra (1 / 15)" })).toBeVisible();
  await expect(inExtra.locator("li")).toHaveCount(1);
  await expect(sideExtras.locator("li")).toHaveCount(1);

  // Bring the Side copy in: two in Extra, none left in Side.
  await sideExtras.getByRole("button").first().click();
  await expect(page.getByRole("heading", { name: "Extra (2 / 15)" })).toBeVisible();
  await expect(page.locator(".counts")).toContainText("2 extra");
  await expect(page.locator(".counts")).toContainText("1 side");
  await expect(page.locator(".diff-chips")).toContainText("(Extra)");

  // Send both out: the Extra Deck is empty and the exported lists follow.
  await inExtra.getByRole("button").first().click();
  await page.getByRole("list", { name: "Extra in this configuration" }).getByRole("button").first().click();
  await expect(page.locator(".counts")).toContainText("0 extra");

  // The Pre-Side list is untouched.
  await page.getByRole("radio", { name: "Pre-Side" }).click();
  await expect(page.locator(".counts")).toContainText("1 extra");
});

test("Card Rank follows the cards in the analyzed Post-Side list", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Post-Side", exact: true }).click();
  // Send the first Main card out and bring the last Side card in.
  await page.locator('button[aria-label^="Move one"][aria-label$="to Side"]').first().click();
  const comingIn = page.locator('button[aria-label^="Move one"][aria-label$="to Main"]').last();
  const label = (await comingIn.getAttribute("aria-label"))!;
  const name = label.replace(/^Move one /, "").replace(/ to Main$/, "");
  await comingIn.click();

  await nav(page, "Rank").click();
  const going = page.getByRole("region", { name: "Going First ranking" });
  // The card that was sided in can be ranked now.
  // By title text, not a CSS selector: card names can contain quotation marks.
  await expect(going.locator(".rank-tile").and(page.getByTitle(name, { exact: true })).first()).toBeVisible();
});

test.describe("Rank scores hands", () => {

  async function rankFirstCardTop(page: Page): Promise<void> {
    await nav(page, "Rank").click();
    const tiles = page.getByRole("region", { name: "Going First ranking" }).locator(".rank-tile");
    await tiles.nth(3).click();
    await tiles.nth(0).click();
  }

  test("Hand Test asks for a ranking until there is one", async ({ page }) => {
    await openApp(page);
    await nav(page, "Hand Test").click();
    await page.getByRole("button", { name: "New Hand" }).click();
    await expect(page.getByText("Define a Hand Goal or rank your cards to score hands")).toBeVisible();
  });

  test("a ranked deck scores the hand and badges each card with its rank", async ({ page }) => {
    await openApp(page);
    await rankFirstCardTop(page);
    await nav(page, "Hand Test").click();
    await page.getByRole("button", { name: "New Hand" }).click();
    await expect(page.locator(".hand-facts li").first()).toContainText(/\d+%\s*a random hand averages \d+%/);
    await expect(page.locator(".hand-tile.in-hand .rank-badge")).toHaveCount(5);
  });

  test("with a Hand Goal but no ranking, hands are scored by Card Impact order", async ({ page }) => {
    await openApp(page);
    await nav(page, "Models").click();
    await page.getByRole("navigation", { name: "Models" }).getByRole("button", { name: "Hand Goals" }).click();
    await page.getByRole("button", { name: "+ Add Hand Goal" }).click();
    await page.getByRole("button", { name: "+ Create hand condition" }).last().click();
    await page.locator('.engine-member input[type="checkbox"]').last().check();
    await nav(page, "Batch Test").click();
    await page.getByRole("button", { name: "Generate hands" }).click();
    await expect(page.getByText(/Scored by Card Impact order until you rank your cards/)).toBeVisible();
    await expect(page.locator(".hand-rank-score")).toHaveCount(10);
  });

  test("Batch Test shows each hand's score and the exact average", async ({ page }) => {
    await openApp(page);
    await rankFirstCardTop(page);
    await nav(page, "Batch Test").click();
    await page.getByRole("button", { name: "Generate hands" }).click();
    await expect(page.getByText(/Average rank score .* the exact average is/)).toBeVisible();
    await expect(page.locator(".hand-rank-score")).toHaveCount(10);
  });

  test("Compare judges both decks by this deck's ranking", async ({ page }) => {
    await openApp(page);
    await rankFirstCardTop(page);
    await nav(page, "Compare").click();
    const lines = readFileSync("public/default.ydk", "utf8").split(/\r?\n/);
    await page.locator('.compare-panel input[type="file"]').setInputFiles({
      name: "same.ydk",
      mimeType: "text/plain",
      buffer: Buffer.from(lines.join("\n")),
    });
    const table = page.getByRole("table", { name: "Rank" });
    await expect(table).toBeVisible();
    await expect(table.getByRole("row", { name: /Average hand rank score/ })).toContainText("same");
  });
});

test.describe("Choosing the turn order where you test", () => {

  test("Hand Test draws six cards going second on the first turn", async ({ page }) => {
    await openApp(page);
    await nav(page, "Hand Test").click();
    await page.getByRole("button", { name: "New Hand" }).click();
    await expect(page.locator(".hand-tile.in-hand")).toHaveCount(5);
    await page.getByRole("radio", { name: /Going Second . First 6/ }).click();
    // The old hand no longer fits, so it is cleared; a new draw takes six cards.
    await expect(page.locator(".hand-tile.in-hand")).toHaveCount(0);
    await page.getByRole("button", { name: "New Hand" }).click();
    await expect(page.locator(".hand-tile.in-hand")).toHaveCount(6);
  });

  test("Batch Test follows the turn order chosen on its own tab", async ({ page }) => {
    await openApp(page);
    await nav(page, "Batch Test").click();
    await expect(page.getByRole("radio", { name: /Going First/ })).toBeChecked();
    await page.getByRole("radio", { name: /Going Second . Opening 5/ }).click();
    await expect(page.getByRole("radio", { name: /Going Second . Opening 5/ })).toBeChecked();
    // The choice is shared: Hand Test shows the same one.
    await nav(page, "Hand Test").click();
    await expect(page.getByRole("radio", { name: /Going Second . Opening 5/ })).toBeChecked();
  });
});

test.describe("Light and dark theme", () => {
  test("the icon switch changes the theme and keeps it after a reload", async ({ page }) => {
    await openApp(page);
    const html = page.locator("html");
    await page.getByRole("button", { name: "Dark theme" }).click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Light theme" }).click();
    await expect(html).toHaveAttribute("data-theme", "light");
  });
});

test.describe("Handtrap versus", () => {

  async function withGoal(page: Page): Promise<void> {
    await nav(page, "Models").click();
    await page.getByRole("navigation", { name: "Models" }).getByRole("button", { name: "Hand Goals" }).click();
    await page.getByRole("button", { name: "+ Add Hand Goal" }).click();
    await page.getByRole("button", { name: "+ Create hand condition" }).last().click();
    await page.locator('.engine-member input[type="checkbox"]').last().check();
    await nav(page, "Handtraps").click();
  }

  test("asks for a Hand Goal before showing any odds", async ({ page }) => {
    await openApp(page);
    await nav(page, "Handtraps").click();
    await page.getByRole("button", { name: "Add Effect Veiler" }).click();
    await expect(page.getByText("Define a Hand Goal with at least one Hand Condition first.")).toBeVisible();
  });

  test("adds handtraps from card art and shows how a Hand Goal holds up", async ({ page }) => {
    await openApp(page);
    await withGoal(page);
    await page.getByRole("button", { name: "Add Effect Veiler" }).click();
    // The tile is gone once added, and a block asks which cards it can stop.
    await expect(page.getByRole("button", { name: "Add Effect Veiler" })).toHaveCount(0);
    await expect(page.getByText("Cards it can stop: none picked yet")).toBeVisible();
    // With nothing picked it can stop nothing.
    const table = page.getByRole("table", { name: "Hand Goal odds against handtraps" });
    await expect(table.getByRole("row", { name: /Effect Veiler/ })).toContainText("no change");

    await page.getByRole("button", { name: "Every card" }).click();
    const veiler = table.getByRole("row", { name: /Effect Veiler/ });
    await expect(veiler).toContainText("pts");
    await expect(veiler).not.toContainText("no change");
    await expect(veiler.locator(".odds-fraction")).toContainText(/\d[\d,]* \/ [\d,]+/);
    // The no-handtrap row is the ceiling.
    const base = await table.getByRole("row", { name: /No handtrap/ }).locator(".odds-percent").innerText();
    const hit = await veiler.locator(".odds-percent").innerText();
    expect(parseFloat(hit)).toBeLessThan(parseFloat(base));
  });

  test("saves a pair and compares it with each handtrap alone", async ({ page }) => {
    await openApp(page);
    await withGoal(page);
    await page.getByRole("button", { name: "Add Effect Veiler" }).click();
    await page.getByRole("button", { name: "Add Ash Blossom & Joyous Spring" }).click();
    for (const every of await page.getByRole("button", { name: "Every card" }).all()) await every.click();
    await page.getByLabel("First handtrap").selectOption({ label: "Effect Veiler" });
    await page.getByLabel("Second handtrap").selectOption({ label: "Ash Blossom & Joyous Spring" });
    await page.getByRole("button", { name: "Save pair" }).click();
    await expect(page.getByRole("list", { name: "Saved pairs" })).toContainText("Effect Veiler + Ash Blossom & Joyous Spring");
    const table = page.getByRole("table", { name: "Hand Goal odds against handtraps" });
    const pct = async (label: string) =>
      parseFloat(
        await table
          .locator("tr", { has: page.getByRole("rowheader", { name: label, exact: true }) })
          .locator(".odds-percent")
          .innerText(),
      );
    const single = await pct("Effect Veiler");
    const pair = await pct("Effect Veiler + Ash Blossom & Joyous Spring");
    // Two handtraps are never better for you than one.
    expect(pair).toBeLessThanOrEqual(single);

    // Removing a handtrap removes the pairs that used it.
    await page.getByRole("button", { name: "Remove" }).first().click();
    await expect(page.getByRole("list", { name: "Saved pairs" })).toHaveCount(0);
  });

  test("Hand Test lets the opponent hold a handtrap from the Handtraps tab", async ({ page }) => {
    await openApp(page);
    await nav(page, "Hand Test").click();
    // Nothing to choose until a handtrap exists.
    await expect(page.getByRole("region", { name: "Opponent hand" })).toHaveCount(0);
    await withGoal(page);
    await page.getByRole("button", { name: "Add Effect Veiler" }).click();
    await page.getByRole("button", { name: "Every card" }).click();
    await nav(page, "Hand Test").click();
    const opponent = page.getByRole("region", { name: "Opponent hand" });
    await expect(opponent.getByText("0 Handtraps in opponent hand")).toBeVisible();
    await page.getByRole("button", { name: "New Hand" }).click();
    await expect(page.getByRole("list", { name: "Cards in hand" }).locator(".hand-tile")).toHaveCount(5);
    // Deal Opponent puts a random handtrap in the opponent hand.
    await opponent.getByRole("button", { name: "Deal Opponent" }).click();
    await expect(opponent.getByText("1 Handtrap in opponent hand")).toBeVisible();
    // Clicking the handtrap takes it back out, and clicking again gives it back.
    await opponent.getByRole("button", { name: /Effect Veiler, in the opponent hand/ }).click();
    await expect(opponent.getByText("0 Handtraps in opponent hand")).toBeVisible();
    await opponent.getByRole("button", { name: /Effect Veiler, click to give/ }).click();
    await expect(opponent.getByText("1 Handtrap in opponent hand")).toBeVisible();
    await opponent.getByRole("button", { name: "Clear opponent" }).click();
    await expect(opponent.getByText("0 Handtraps in opponent hand")).toBeVisible();
  });

  test("a card the opponent's handtrap would negate is marked in my hand", async ({ page }) => {
    await openApp(page);
    await withGoal(page);
    await page.getByRole("button", { name: "Add Effect Veiler" }).click();
    await page.getByRole("button", { name: "Every card" }).click();
    await nav(page, "Hand Test").click();
    const opponent = page.getByRole("region", { name: "Opponent hand" });
    await opponent.getByRole("button", { name: /Effect Veiler, click to give/ }).click();
    // Deal hands until one satisfies the goal; Effect Veiler can stop any card, so it breaks it.
    const marked = page.getByRole("list", { name: "Cards in hand" }).locator(".hand-tile.negated");
    for (let tries = 0; tries < 60 && (await marked.count()) === 0; tries += 1) {
      await page.getByRole("button", { name: "New Hand" }).click();
    }
    await expect(marked.first()).toBeVisible();
    await expect(marked.first()).toHaveAccessibleName(/negated by the opponent/);
    await opponent.getByRole("button", { name: "Clear opponent" }).click();
    await expect(marked).toHaveCount(0);
  });

  test("the scorecard measures going first and going second, and follows the weights", async ({ page }) => {
    await openApp(page);
    await nav(page, "Scorecard").click();
    await expect(page.getByText("Define a Hand Goal with at least one Hand Condition first.")).toBeVisible();

    await withGoal(page);
    await nav(page, "Scorecard").click();
    const card = page.locator(".scorecard");
    const first = card.getByRole("region", { name: "Going first" });
    const second = card.getByRole("region", { name: "Going second" });
    await expect(first.getByText("5 cards")).toBeVisible();
    await expect(second.getByText("6 cards")).toBeVisible();

    const read = (turn: typeof first, label: string) =>
      turn.locator(".scorecard-rows > div").filter({ hasText: label }).locator("strong");
    const value = (text: string) => Number.parseFloat(text);
    await expect(read(first, "Opens")).toHaveText(/^\d+\.\d{2}%$/);
    await expect(read(second, "Opens")).toHaveText(/^\d+\.\d{2}%$/);
    // Six cards reach the goal at least as often as five.
    expect(value(await read(second, "Opens").innerText())).toBeGreaterThanOrEqual(
      value(await read(first, "Opens").innerText()),
    );

    // Nothing else can be measured yet, and the card says why.
    await expect(card.getByText("Add a handtrap in the Handtraps tab to measure resilience.")).toBeVisible();
    await expect(card.getByText(/No card has the Interaction role/)).toBeVisible();
    await expect(card.getByText(/No card is marked Undesirable for going first/)).toBeVisible();
    await expect(first.locator(".scorecard-combined .outcome-primary")).toHaveText(
      await read(first, "Opens").innerText(),
    );

    await nav(page, "Handtraps").click();
    await page.getByRole("button", { name: "Add Effect Veiler" }).click();
    await page.getByRole("button", { name: "Every card" }).click();
    await nav(page, "Scorecard").click();
    await expect(read(first, "Resilient")).toHaveText(/^\d+\.\d{2}%$/);
    expect(value(await read(first, "Resilient").innerText())).toBeLessThan(
      value(await read(first, "Opens").innerText()),
    );

    // Each turn's combined number is the mean of what was measured; overall is the mean of the two turns.
    const combined = async (turn: typeof first) =>
      value(await turn.locator(".scorecard-combined .outcome-primary").innerText());
    const meanFirst =
      (value(await read(first, "Opens").innerText()) + value(await read(first, "Resilient").innerText())) / 2;
    expect(Math.abs((await combined(first)) - meanFirst)).toBeLessThan(0.011);
    const overall = value(
      await card.getByRole("status", { name: "Overall" }).locator(".outcome-primary").innerText(),
    );
    expect(Math.abs(overall - ((await combined(first)) + (await combined(second))) / 2)).toBeLessThan(0.011);

    // A zero weight drops that number; the weights are remembered.
    await card.getByRole("spinbutton", { name: "Resilient" }).fill("0");
    await expect(first.locator(".scorecard-combined .outcome-primary")).toHaveText(
      await read(first, "Opens").innerText(),
    );
    await page.reload();
    await nav(page, "Scorecard").click();
    await expect(page.locator(".scorecard").getByRole("spinbutton", { name: "Resilient" })).toHaveValue("0");
  });

  test("the landing view summarises going first and going second, and says what is missing", async ({ page }) => {
    await openApp(page);
    await withGoal(page);
    await nav(page, "Profile").click();
    const summary = page.getByRole("region", { name: "Quality at a glance" });
    const first = summary.getByRole("region", { name: "Going first" });
    const second = summary.getByRole("region", { name: "Going second" });
    await expect(first.getByRole("status")).toHaveText(/^\d+\.\d%$/);
    await expect(second.getByRole("status")).toHaveText(/^\d+\.\d%$/);
    await expect(first.getByText(/^Weakest:/)).toBeVisible();
    // Nothing else is modelled yet, so it says how to measure the rest.
    await expect(summary.getByText(/Not measured yet: .*Resilient, to measure it add a handtrap/)).toBeVisible();

    // Adding a handtrap makes Resilient measured, so it drops off the missing list.
    await nav(page, "Handtraps").click();
    await page.getByRole("button", { name: "Add Effect Veiler" }).click();
    await page.getByRole("button", { name: "Every card" }).click();
    await nav(page, "Profile").click();
    await expect(summary.getByText(/Resilient, to measure it/)).toHaveCount(0);

    await summary.getByRole("button", { name: "Open the Scorecard" }).click();
    await expect(page.locator(".scorecard")).toBeVisible();
  });

  test("handtraps are saved with the deck", async ({ page }) => {
    await openApp(page);
    await withGoal(page);
    await page.getByRole("button", { name: "Add Dominus Purge" }).click();
    await page.reload();
    await nav(page, "Handtraps").click();
    await expect(page.getByLabel("Handtrap name").first()).toHaveValue("Dominus Purge");
  });
});

test.describe("Models are card art", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await nav(page, "Models").click();
  });
  const view = (page: Page, name: string) =>
    page.getByRole("navigation", { name: "Models" }).getByRole("button", { name });

  test("only one Group can use the Normal Summon, and the choice is remembered", async ({ page }) => {
    await view(page, "Groups").click();
    await page.getByRole("button", { name: "+ Add group" }).click();
    await page.getByRole("button", { name: "+ Add group" }).click();
    const boxes = page.getByRole("checkbox", { name: /Uses the Normal Summon/ });
    await expect(boxes).toHaveCount(2);
    await boxes.nth(0).check();
    await expect(boxes.nth(0)).toBeChecked();
    // Choosing the other Group takes it over: there is only one Normal Summon a turn.
    await boxes.nth(1).check();
    await expect(boxes.nth(1)).toBeChecked();
    await expect(boxes.nth(0)).not.toBeChecked();

    await page.reload();
    await nav(page, "Models").click();
    await view(page, "Groups").click();
    await expect(boxes.nth(1)).toBeChecked();
    await expect(boxes.nth(0)).not.toBeChecked();
    await boxes.nth(1).uncheck();
    await expect(boxes.nth(1)).not.toBeChecked();
  });

  test("a Group is built by clicking cards in the Main Deck", async ({ page }) => {
    await view(page, "Groups").click();
    await page.getByRole("button", { name: "+ Add group" }).click();
    const grid = page.locator(".pick-grid").first();
    await expect(grid.locator(".pick-tile")).toHaveCount(await grid.locator(".pick-tile").count());
    await expect(page.getByText("Click the cards that belong in this group.")).toBeVisible();
    await grid.locator(".pick-tile").nth(1).click();
    await expect(page.getByText("1 card in this group")).toBeVisible();
    await expect(grid.locator(".pick-tile.on")).toHaveCount(1);
    await grid.locator(".pick-tile.on").click();
    await expect(page.getByText("Click the cards that belong in this group.")).toBeVisible();
  });

  test("a Hand Condition picks its card from the deck art", async ({ page }) => {
    await view(page, "Hand Conditions").click();
    await page.getByRole("button", { name: "+ Add Hand Condition" }).click();
    await page.getByRole("button", { name: "+ Requirement" }).click();
    const chosen = page.getByRole("button", { name: /^Card: .*Change$/ }).last();
    const before = await chosen.getAttribute("aria-label");
    await chosen.click();
    await page.getByRole("list", { name: "Choose a card" }).locator(".pick-tile").nth(3).click();
    await expect(page.getByRole("button", { name: /^Card: .*Change$/ }).last()).not.toHaveAttribute(
      "aria-label",
      before!,
    );
    await expect(page.getByRole("list", { name: "Choose a card" })).toHaveCount(0);
    // The condition shows the cards it reads as art.
    await expect(page.locator(".access-block .card-strip").first()).toBeVisible();
  });

  test("a Group requirement shows the cards it counts", async ({ page }) => {
    await view(page, "Groups").click();
    await page.getByRole("button", { name: "+ Add group" }).click();
    await page.locator(".pick-grid").first().locator(".pick-tile").nth(0).click();
    await view(page, "Hand Conditions").click();
    await page.getByRole("button", { name: "+ Add Hand Condition" }).click();
    await page.getByRole("button", { name: "+ Requirement" }).click();
    await page.getByLabel("Subject").last().selectOption("group");
    await page.locator("select").filter({ has: page.locator("option", { hasText: "Select group" }) }).selectOption({ index: 1 });
    await expect(page.getByRole("list", { name: "Cards this counts" }).locator("li")).toHaveCount(1);
  });
});

test.describe("Sorting the deck sections", () => {
  const main = (page: Page) =>
    page.locator(".deck-section").filter({ has: page.getByRole("heading", { name: "Main Deck" }) });
  const titles = (page: Page) => main(page).locator(".deck-tile").evaluateAll((els) => els.map((el) => el.getAttribute("title")));

  test("sorting by name orders the section and leaves the deck alone", async ({ page }) => {
    await openApp(page);
    const built = await titles(page);
    await page.getByLabel("Sort Main Deck").selectOption("name");
    // The list re-renders after the change event, so wait for the new order.
    await expect
      .poll(() => titles(page))
      .toEqual([...built].sort((a, b) => a!.localeCompare(b!, undefined, { sensitivity: "base" })));
    await expect(page.locator(".counts")).toContainText(`${DEFAULT.main} main`);
    // As built brings the original order back; the sort was only a view.
    await page.getByLabel("Sort Main Deck").selectOption("built");
    await expect.poll(() => titles(page)).toEqual(built);
  });

  test("the choice is remembered after a reload", async ({ page }) => {
    await openApp(page);
    await page.getByLabel("Sort Main Deck").selectOption("name");
    await page.reload();
    await expect(page.getByLabel("Sort Main Deck")).toHaveValue("name");
  });

  test("Card Rank sorting waits for a ranking, then follows it", async ({ page }) => {
    await openApp(page);
    await expect(page.getByLabel("Sort Main Deck").locator("option", { hasText: "Card Rank" })).toBeDisabled();
    await nav(page, "Rank").click();
    const tiles = page.getByRole("region", { name: "Going First ranking" }).locator(".rank-tile");
    await tiles.nth(3).click();
    await tiles.nth(0).click();
    const top = await page.getByRole("region", { name: "Going First ranking" }).locator(".rank-tile").first().getAttribute("title");
    await page.getByLabel("Sort Main Deck").selectOption("rank");
    await expect.poll(async () => (await titles(page))[0]).toBe(top);
  });

  test("a sorted section does not accept reordering drops", async ({ page }) => {
    await openApp(page);
    await page.getByLabel("Sort Extra Deck").selectOption("name");
    const extra = page.locator(".deck-section").filter({ has: page.getByRole("heading", { name: "Extra Deck" }) });
    const before = await extra.locator(".deck-tile").evaluateAll((els) => els.map((el) => el.getAttribute("title")));
    await extra.locator(".deck-tile").last().dragTo(extra.locator(".deck-tile").first());
    const after = await extra.locator(".deck-tile").evaluateAll((els) => els.map((el) => el.getAttribute("title")));
    expect(after).toEqual(before);
  });
});

test("the minus on the last copy removes the card", async ({ page }) => {
  await openApp(page);
  const section = page.locator(".deck-section").filter({ has: page.getByRole("heading", { name: "Main Deck" }) });
  await section.locator(".deck-tile").first().click();
  const editor = section.getByRole("group", { name: /^Edit / });
  const quantity = editor.getByRole("spinbutton", { name: "Quantity" });
  // Take the first card down to one copy, whatever the default deck holds.
  const copies = Number(await quantity.inputValue());
  for (let copy = copies; copy > 1; copy -= 1) {
    await editor.getByRole("button", { name: "Decrease quantity" }).click();
  }
  await expect(quantity).toHaveValue("1");
  await editor.getByRole("button", { name: "Remove card" }).click();
  await expect(page.locator(".counts")).toContainText(`${DEFAULT.main - copies} main`);
  await expect(section.getByRole("group", { name: /^Edit / })).toHaveCount(0);
});

test.describe("Dragging cards in the deck", () => {
  const section = (page: Page, title: string) =>
    page.locator(".deck-section").filter({ has: page.getByRole("heading", { name: title }) });

  // Extra and Side sit next to each other, so both stay on screen for the drag.
  test("dragging an Extra card onto the Side Deck moves one copy", async ({ page }) => {
    await openApp(page);
    // Let images and the catalog finish loading so nothing shifts under the drag.
    await page.waitForLoadState("networkidle");
    await section(page, "Extra Deck").locator(".deck-tile").first().dragTo(section(page, "Side Deck"));
    await expect(page.locator(".counts")).toContainText(`${DEFAULT.extra - 1} extra`);
    await expect(page.locator(".counts")).toContainText(`${DEFAULT.side + 1} side`);
  });

  test("a Main card cannot be dragged into Extra", async ({ page }) => {
    await openApp(page);
    // Let images and the catalog finish loading so nothing shifts under the drag.
    await page.waitForLoadState("networkidle");
    await section(page, "Side Deck").locator(".deck-tile").first().scrollIntoViewIfNeeded();
    const extra = section(page, "Extra Deck");
    const main = section(page, "Main Deck").locator(".deck-tile").last();
    await main.dragTo(extra);
    await expect(page.locator(".counts")).toContainText(`${DEFAULT.main} main`);
    await expect(page.locator(".counts")).toContainText(`${DEFAULT.extra} extra`);
  });

  test("dropping a card before another reorders the section", async ({ page }) => {
    await openApp(page);
    // Let images and the catalog finish loading so nothing shifts under the drag.
    await page.waitForLoadState("networkidle");
    const tiles = section(page, "Extra Deck").locator(".deck-tile");
    const lastTitle = await tiles.last().getAttribute("title");
    await tiles.last().dragTo(tiles.first());
    await expect(section(page, "Extra Deck").locator(".deck-tile").first()).toHaveAttribute("title", lastTitle!);
    await expect(page.locator(".counts")).toContainText(`${DEFAULT.extra} extra`);
  });
});

test("Set as default makes the current deck what Default deck loads", async ({ page }) => {
  await openApp(page);
  await page.waitForLoadState("networkidle");
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
    await nav(page, "Rank").click();
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
    await nav(page, "Rank").click();
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
    await expect(page.getByRole("list", { name: "Not in Main in this configuration", exact: true }).locator("li")).toHaveCount(DEFAULT.sideToMain);

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
