import { createContext, useContext } from "react";

/** Ids that have a local image at /cards/<id>.jpg (see scripts/fetch-card-images.py). */
export type CardImageIds = ReadonlySet<number>;

export const CardImagesContext = createContext<CardImageIds>(new Set());

export function useCardImageIds(): CardImageIds {
  return useContext(CardImagesContext);
}

export function cardImageUrl(cardId: number): string {
  return `/cards/${cardId}.jpg`;
}

export async function loadCardImageIds(): Promise<CardImageIds> {
  try {
    const response = await fetch("/cards/index.json");
    if (!response.ok) return new Set();
    const data: unknown = await response.json();
    if (!Array.isArray(data)) return new Set();
    return new Set(data.filter((id): id is number => Number.isInteger(id)));
  } catch {
    return new Set();
  }
}
