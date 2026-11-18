// Rewrites public/decks/index.json from the .mapping.json files in that folder.
// Run it after adding, renaming or deleting a deck: npm run decks:index
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "public/decks";
const indexPath = join(dir, "index.json");

let previous = { default: null };
try {
  previous = JSON.parse(readFileSync(indexPath, "utf8"));
} catch {
  /* no index yet */
}

const decks = readdirSync(dir)
  .filter((file) => file.endsWith(".mapping.json"))
  .sort()
  .map((file) => {
    const data = JSON.parse(readFileSync(join(dir, file), "utf8"));
    return { file, name: String(data.name ?? file).trim() };
  });

// Keep the default if its file is still there; else the first deck.
const kept = decks.some((deck) => deck.file === previous.default) ? previous.default : (decks[0]?.file ?? null);

writeFileSync(indexPath, `${JSON.stringify({ default: kept, decks }, null, 2)}\n`);
console.log(`Wrote ${indexPath}: ${decks.length} deck${decks.length === 1 ? "" : "s"}, default ${kept}`);
