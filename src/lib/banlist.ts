import type { MappingDocument } from "./document";

export type Format = "ocg" | "tcg" | "ae" | "none";

export interface BanlistFormat {
  name: string;
  /** passcode -> copies allowed (0 forbidden, 1 limited, 2 semi-limited). */
  limits: Readonly<Record<string, number>>;
}

export type Banlist = Partial<Record<"ocg" | "tcg" | "ae", BanlistFormat>>;

export const MAX_COPIES = 3;

export async function loadBanlist(): Promise<Banlist> {
  try {
    const response = await fetch("/banlist.json");
    if (!response.ok) return {};
    const data = (await response.json()) as Banlist;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/** Copies of a card the format allows in a deck, Main plus Extra plus Side. */
export function allowedCopies(banlist: Banlist, format: Format, cardId: number): number {
  if (format === "none") return MAX_COPIES;
  const limit = banlist[format]?.limits[String(cardId)];
  return limit === undefined ? MAX_COPIES : Math.min(MAX_COPIES, limit);
}

/** Every copy of the card across Main, Extra and Side. */
export function copiesInDeck(doc: MappingDocument, cardId: number): number {
  let total = 0;
  for (const section of [doc.main, doc.extra, doc.side]) {
    for (const card of section) if (card.card_id === cardId) total += card.quantity;
  }
  return total;
}

export interface Violation {
  card_id: number;
  copies: number;
  allowed: number;
}

/** Cards that exceed their allowed copies (3 by default, less if limited or forbidden). */
export function deckViolations(
  doc: MappingDocument,
  banlist: Banlist,
  format: Format,
): Violation[] {
  const totals = new Map<number, number>();
  for (const section of [doc.main, doc.extra, doc.side]) {
    for (const card of section) {
      totals.set(card.card_id, (totals.get(card.card_id) ?? 0) + card.quantity);
    }
  }
  const out: Violation[] = [];
  for (const [card_id, copies] of totals) {
    const allowed = allowedCopies(banlist, format, card_id);
    if (copies > allowed) out.push({ card_id, copies, allowed });
  }
  return out;
}

export function limitLabel(allowed: number): string {
  return allowed === 0 ? "Forbidden" : allowed === 1 ? "Limited" : allowed === 2 ? "Semi-limited" : "";
}
