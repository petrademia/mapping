import { expect, test } from "@playwright/test";
import { createDocument, serializeMapping, setQuantity, upsertHandCondition, upsertHandConditionSet } from "../src/lib/document";

test("tunes the active deck and previews a one-copy swap without editing the original", async ({ page }) => {
  const starter = 1;
  let doc = setQuantity(createDocument("Tuning test deck"), "main", starter, 2);
  for (let id = 2; id <= 14; id += 1) doc = setQuantity(doc, "main", id, 3);
  doc = upsertHandCondition(doc, {
    id: "access", name: "Access", requirements: [{ kind: "card", card_id: starter, op: "gte", count: 1 }],
    excludes: [], distinct_constraints: [],
  });
  doc = upsertHandConditionSet(doc, {
    id: "goal", name: "Starter access", condition_ids: ["access"], aggregation: "any",
  });
  doc = { ...doc, handtraps: [{ id: "ash", name: "Ash Blossom", hits: [starter] }] };

  await page.addInitScript((draft) => {
    localStorage.setItem("mapping.document.v2", draft);
    localStorage.setItem("mapping.format", "none");
  }, serializeMapping(doc));
  await page.goto("/");
  await page.getByRole("navigation", { name: "Step" }).getByRole("button", { name: "Analyze", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Workspace" });
  await nav.getByRole("button", { name: "Deck Tuning" }).click();
  await page.getByLabel("Cut candidates").selectOption("2");
  await page.getByRole("button", { name: "+ #1", exact: true }).click();
  await page.getByRole("checkbox", { name: "Ash Blossom" }).check();
  await page.getByRole("button", { name: "Run tuning" }).click();

  const results = page.getByRole("table", { name: "Deck tuning results" });
  await expect(results.getByRole("columnheader", { name: "Ash Blossom" })).toBeVisible();
  await expect(results.getByRole("rowheader")).toHaveText([
    "Current deck", "Cut #2 / Add #1", "Add #1", "Cut #2",
  ]);
  await expect(results.getByRole("row").nth(2)).toContainText("+");

  await results.getByRole("button", { name: "Preview Cut #2 / Add #1" }).click();
  await expect(page.getByRole("button", { name: "Use compared deck" })).toBeVisible();
  await expect(page.getByText("Cut #2 / Add #1", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "41 main" })).toBeVisible();
  const storedMain = await page.evaluate(() => {
    const draft = localStorage.getItem("mapping.document.v2");
    return draft ? JSON.parse(draft).main : [];
  });
  expect(storedMain).toEqual(doc.main);
});
