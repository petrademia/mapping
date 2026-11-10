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
  await page.locator(".catalog-hits button").first().click();
  await page.getByRole("button", { name: "Add card" }).click();
}

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
  await expect(page.locator(".catalog-hits")).toContainText(
    "Ars Magna Academic Arcane Apparition Acropolis",
  );
  await search.fill("omega vidolium");
  await expect(page.locator(".catalog-hits")).toContainText("Omega Vidolium the Power Patron of Heaven's End");
});

test("an Extra Deck monster added with Main selected goes to the Extra Deck", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "New deck" }).click();
  await expect(page.locator(".counts")).toContainText("0 extra");

  await expect(page.getByLabel("Deck section")).toHaveValue("main");
  await addCardBySearch(page, "omega vidolium");

  await expect(page.getByRole("status").filter({ hasText: "to the Extra Deck" })).toBeVisible();
  await expect(page.locator(".counts")).toContainText("1 extra");
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
    await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Hand Test" }).click();
  });

  test("drawing a random hand shows it right under the buttons", async ({ page }) => {
    await page.getByRole("button", { name: "Draw Random Hand" }).click();

    const tested = page.getByRole("heading", { name: "Tested Hand" });
    await expect(tested).toBeVisible();
    await expect(page.getByLabel("Cards in hand").first().locator("li")).toHaveCount(5);

    // Regression: the result used to sit below the long card picker, so a draw
    // looked like it did nothing. It must come before Generate Hands and the picker.
    const testedY = (await tested.boundingBox())!.y;
    const generateY = (await page.getByRole("heading", { name: "Generate Hands" }).boundingBox())!.y;
    const pickerY = (await page.getByRole("heading", { name: "Select Manually" }).boundingBox())!.y;
    expect(testedY).toBeLessThan(generateY);
    expect(generateY).toBeLessThan(pickerY);
  });

  test("Clear hand removes the tested hand", async ({ page }) => {
    await page.getByRole("button", { name: "Draw Random Hand" }).click();
    await expect(page.getByRole("heading", { name: "Tested Hand" })).toBeVisible();
    await page.getByRole("button", { name: "Clear hand", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tested Hand" })).toHaveCount(0);
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

  test("the manual picker tiles do not overlap", async ({ page }) => {
    // Regression: an image's natural size once set the column width, so tiles
    // piled on top of each other.
    const tiles = page.locator(".hand-picker-grid li");
    await expect(tiles.first()).toBeVisible();
    const a = (await tiles.nth(0).boundingBox())!;
    const b = (await tiles.nth(1).boundingBox())!;
    expect(a.width).toBeLessThanOrEqual(100);
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.width - 1);
    // The images themselves must stay inside their tile (they once rendered at
    // natural size and covered the neighbours).
    const image = page.locator(".hand-picker-grid .hand-image-frame img").first();
    if (await image.count()) {
      const box = (await image.boundingBox())!;
      expect(box.width).toBeLessThanOrEqual(a.width + 1);
    }
  });

  test("the manual picker builds a hand from card images", async ({ page }) => {
    const first = page.locator(".hand-picker-grid .pick-tile").first();
    await first.click();
    await expect(page.locator(".hand-total")).toContainText("1 / 5");
    // Scoped to the picker: deck cards have their own Remove buttons.
    await page.locator(".hand-picker-grid").getByRole("button", { name: /^Remove / }).first().click();
    await expect(page.locator(".hand-total")).toContainText("0 / 5");
  });
});

test.describe("Card Rank", () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Rank" }).click();
  });

  const names = (page: Page, label: string) =>
    page.getByRole("region", { name: `${label} ranking` }).locator(".rank-name");

  test("shows a list for going first and one for going second", async ({ page }) => {
    await expect(page.getByRole("region", { name: "Going First ranking" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Going Second ranking" })).toBeVisible();
    await expect(page.getByText("Not ranked yet").first()).toBeVisible();
  });

  test("move buttons reorder one list and leave the other alone", async ({ page }) => {
    const first = names(page, "Going First");
    const second = names(page, "Going Second");
    const before = await first.allInnerTexts();
    expect(before.length).toBeGreaterThan(2);

    await page
      .getByRole("region", { name: "Going First ranking" })
      .getByRole("button", { name: /^Move .* down in Going First$/ })
      .first()
      .click();

    const after = await first.allInnerTexts();
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
    expect((await second.allInnerTexts())[0]).toBe(before[0]);
    await expect(page.getByText("Not ranked yet")).toHaveCount(1);
  });

  test("dragging a card reorders the list", async ({ page }) => {
    const list = page.getByRole("region", { name: "Going Second ranking" });
    const before = await names(page, "Going Second").allInnerTexts();
    await list.locator("li").nth(3).dragTo(list.locator("li").nth(0));
    const after = await names(page, "Going Second").allInnerTexts();
    expect(after[0]).toBe(before[3]);
    expect(after[1]).toBe(before[0]);
  });

  test("the order survives a reload and Reset puts a list back", async ({ page }) => {
    const first = names(page, "Going First");
    const before = await first.allInnerTexts();
    await page
      .getByRole("region", { name: "Going First ranking" })
      .getByRole("button", { name: /^Move .* down in Going First$/ })
      .first()
      .click();
    await page.reload();
    await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Rank" }).click();
    expect((await first.allInnerTexts())[0]).toBe(before[1]);

    await page.getByRole("region", { name: "Going First ranking" }).getByRole("button", { name: "Reset" }).click();
    expect(await first.allInnerTexts()).toEqual(before);
  });
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

    await page.getByRole("button", { name: /^Move one .* to Side$/ }).first().click();
    await expect(page.locator(".analyzing-strip")).toContainText(`${DEFAULT.main - 1} main`);
    await expect(page.locator(".diff-chips li")).toHaveCount(1);

    // The deck list on the left stays Pre-Side.
    await expect(page.locator(".deck-editor-banner")).toContainText("Pre-Side");

    await page.getByRole("radio", { name: "Pre-Side" }).click();
    await expect(page.locator(".analyzing-strip")).toContainText(`${DEFAULT.main} main`);
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
