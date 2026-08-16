export interface ParsedCopies {
  card_id: number;
  quantity: number;
}

export interface ParsedDeck {
  main: ParsedCopies[];
  extra: ParsedCopies[];
  side: ParsedCopies[];
}

type Section = keyof ParsedDeck;

function collapse(ids: number[]): ParsedCopies[] {
  const order: number[] = [];
  const counts = new Map<number, number>();
  for (const cardId of ids) {
    if (!counts.has(cardId)) order.push(cardId);
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  }
  return order.map((card_id) => ({
    card_id,
    quantity: counts.get(card_id) ?? 0,
  }));
}

function parseLine(line: string): { card_id: number; quantity: number } | null {
  const match = line.match(/^(\d+)\s*(?:x\s*)?(\d+)?\s*$/i);
  if (!match) return null;
  const card_id = Number(match[1]);
  const quantity = match[2] === undefined ? 1 : Number(match[2]);
  if (!Number.isInteger(card_id) || card_id <= 0) return null;
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  return { card_id, quantity };
}

export function parseDeckText(text: string): ParsedDeck {
  const buckets: Record<Section, number[]> = { main: [], extra: [], side: [] };
  let section: Section = "main";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    const lowered = line.toLowerCase();
    if (lowered === "#main") {
      section = "main";
      continue;
    }
    if (lowered === "#extra") {
      section = "extra";
      continue;
    }
    if (lowered === "!side" || lowered === "#side") {
      section = "side";
      continue;
    }
    if (line.startsWith("#")) continue;
    const parsed = parseLine(line);
    if (!parsed) {
      throw new Error(`unrecognized deck line: ${line}`);
    }
    for (let i = 0; i < parsed.quantity; i += 1) {
      buckets[section].push(parsed.card_id);
    }
  }
  return {
    main: collapse(buckets.main),
    extra: collapse(buckets.extra),
    side: collapse(buckets.side),
  };
}

export function parseYdk(text: string): ParsedDeck {
  return parseDeckText(text);
}

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
