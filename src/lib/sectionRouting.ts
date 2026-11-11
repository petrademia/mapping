import type { DeckSection } from "./document";

/** Ids of Extra Deck monsters (Fusion, Synchro, Xyz, Link), from /extra-deck.json. */
export type ExtraDeckIds = ReadonlySet<number>;

export async function loadExtraDeckIds(): Promise<ExtraDeckIds> {
  try {
    const response = await fetch("/extra-deck.json");
    if (!response.ok) return new Set();
    const data: unknown = await response.json();
    if (!Array.isArray(data)) return new Set();
    return new Set(data.filter((id): id is number => Number.isInteger(id)));
  } catch {
    return new Set();
  }
}

/**
 * Pick the deck section a newly added card belongs in. Extra Deck monsters go
 * to Extra when Main was requested, and a catalog card that is not an Extra
 * Deck monster goes to Main when Extra was requested. Side is never rerouted
 * (both kinds can sit there), and an unknown card keeps the requested section.
 * With no Extra Deck data loaded nothing is rerouted.
 */
export function routeSection(
  requested: DeckSection,
  cardId: number,
  extraIds: ExtraDeckIds,
  isKnown: (cardId: number) => boolean,
): DeckSection {
  if (extraIds.size === 0 || requested === "side") return requested;
  if (requested === "main" && extraIds.has(cardId)) return "extra";
  if (requested === "extra" && !extraIds.has(cardId) && isKnown(cardId)) {
    return "main";
  }
  return requested;
}

interface ParsedLine {
  card_id: number;
  quantity: number;
}

export interface ParsedSections {
  main: ParsedLine[];
  extra: ParsedLine[];
  side: ParsedLine[];
}

/** Move Extra Deck monsters that landed in Main (and the reverse) to the right section. */
export function routeParsed(
  parsed: ParsedSections,
  extraIds: ExtraDeckIds,
  isKnown: (cardId: number) => boolean,
): { sections: ParsedSections; moved: number } {
  const sections: ParsedSections = { main: [], extra: [], side: [...parsed.side] };
  let moved = 0;
  for (const requested of ["main", "extra"] as const) {
    for (const line of parsed[requested]) {
      const target = routeSection(requested, line.card_id, extraIds, isKnown);
      if (target !== requested) moved += 1;
      sections[target].push(line);
    }
  }
  return { sections, moved };
}
