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
