export type Catalog = ReadonlyMap<number, string>;

export async function loadCatalog(): Promise<Catalog> {
  const response = await fetch("/catalog.json");
  if (!response.ok) return new Map();
  const data = (await response.json()) as Record<string, string>;
  return new Map(
    Object.entries(data).map(([id, name]) => [Number(id), name]),
  );
}

export function displayName(
  cardId: number,
  storedName: string | undefined,
  catalog: Catalog,
): string {
  return storedName?.trim() || catalog.get(cardId) || `#${cardId}`;
}

export interface CatalogHit {
  card_id: number;
  name: string;
}

/**
 * Search catalog by case-insensitive name substring or raw passcode.
 * A pure-numeric query resolves to the matching passcode only when the id is
 * present. Results sort by shorter name first, then localeCompare name, then
 * card_id, capped at `limit` (default 10).
 */
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
