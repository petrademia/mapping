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

/** Okapi BM25 parameters (standard defaults). */
const BM25_K1 = 1.2;
const BM25_B = 0.75;

/** Lowercase words; apostrophes are dropped so "Heaven's" is one word. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);
}

interface Bm25Index {
  ids: number[];
  names: string[];
  lengths: number[];
  averageLength: number;
  /** Sorted unique terms, for prefix expansion by binary search. */
  vocabulary: string[];
  /** term -> (doc index -> term frequency) */
  postings: Map<string, Map<number, number>>;
}

const indexCache = new WeakMap<Catalog, Bm25Index>();

function buildIndex(catalog: Catalog): Bm25Index {
  const ids: number[] = [];
  const names: string[] = [];
  const lengths: number[] = [];
  const postings = new Map<string, Map<number, number>>();
  let totalLength = 0;
  for (const [cardId, name] of catalog) {
    const doc = ids.length;
    const tokens = tokenize(name);
    ids.push(cardId);
    names.push(name);
    lengths.push(tokens.length);
    totalLength += tokens.length;
    for (const token of tokens) {
      let docs = postings.get(token);
      if (!docs) {
        docs = new Map();
        postings.set(token, docs);
      }
      docs.set(doc, (docs.get(doc) ?? 0) + 1);
    }
  }
  return {
    ids,
    names,
    lengths,
    averageLength: ids.length > 0 ? totalLength / ids.length : 0,
    vocabulary: [...postings.keys()].sort(),
    postings,
  };
}

function getIndex(catalog: Catalog): Bm25Index {
  let index = indexCache.get(catalog);
  if (!index) {
    index = buildIndex(catalog);
    indexCache.set(catalog, index);
  }
  return index;
}

/** Terms that start with `prefix` (so partial typing like "vido" matches). */
function expandPrefix(vocabulary: string[], prefix: string): string[] {
  let low = 0;
  let high = vocabulary.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (vocabulary[mid]! < prefix) low = mid + 1;
    else high = mid;
  }
  const terms: string[] = [];
  for (let i = low; i < vocabulary.length && vocabulary[i]!.startsWith(prefix); i += 1) {
    terms.push(vocabulary[i]!);
  }
  return terms;
}

/**
 * Per-document term frequency for one query word: the word matches any index
 * term it is a prefix of, and their frequencies add up.
 */
function termFrequencies(index: Bm25Index, word: string): Map<number, number> {
  const frequencies = new Map<number, number>();
  for (const term of expandPrefix(index.vocabulary, word)) {
    for (const [doc, tf] of index.postings.get(term) ?? []) {
      frequencies.set(doc, (frequencies.get(doc) ?? 0) + tf);
    }
  }
  return frequencies;
}

function bm25Search(catalog: Catalog, words: string[]): { doc: number; score: number }[] {
  const index = getIndex(catalog);
  const total = index.ids.length;
  const perWord = words.map((word) => termFrequencies(index, word));
  // Every word must match (typeahead semantics); rank the survivors by BM25.
  const [first, ...rest] = perWord;
  if (!first) return [];
  const scores: { doc: number; score: number }[] = [];
  for (const doc of first.keys()) {
    if (!rest.every((frequencies) => frequencies.has(doc))) continue;
    const lengthNorm =
      1 - BM25_B + (BM25_B * index.lengths[doc]!) / (index.averageLength || 1);
    let score = 0;
    for (const frequencies of perWord) {
      const df = frequencies.size;
      const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
      const tf = frequencies.get(doc)!;
      score += (idf * tf * (BM25_K1 + 1)) / (tf + BM25_K1 * lengthNorm);
    }
    scores.push({ doc, score });
  }
  return scores;
}

/**
 * Search the catalog by raw passcode or by name. A pure-numeric query resolves
 * to the matching passcode only when the id is present.
 *
 * Name search ranks with Okapi BM25 over name words: every query word must
 * match (as a word prefix, any order), rarer words weigh more, and shorter
 * names win ties on term frequency. If no word-prefix match exists it falls
 * back to a plain substring match so mid-word queries still find cards.
 * Ties break by shorter name, then name, then card_id; capped at `limit`.
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

  const words = tokenize(trimmed);
  if (words.length === 0) return [];

  const index = getIndex(catalog);
  let ranked = bm25Search(catalog, words);
  if (ranked.length === 0) {
    const needles = trimmed.toLowerCase().split(/\s+/);
    ranked = [];
    index.names.forEach((name, doc) => {
      const haystack = name.toLowerCase();
      if (needles.every((needle) => haystack.includes(needle))) {
        ranked.push({ doc, score: 0 });
      }
    });
  }

  ranked.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    const nameA = index.names[a.doc]!;
    const nameB = index.names[b.doc]!;
    const len = nameA.length - nameB.length;
    if (len !== 0) return len;
    const byName = nameA.localeCompare(nameB);
    if (byName !== 0) return byName;
    return index.ids[a.doc]! - index.ids[b.doc]!;
  });
  return ranked.slice(0, limit).map(({ doc }) => ({
    card_id: index.ids[doc]!,
    name: index.names[doc]!,
  }));
}
