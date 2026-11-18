import { useState } from "react";
import type { DeckEntry } from "../lib/deckLibrary";

interface Props {
  /** The decks kept in public/decks/. */
  decks: readonly DeckEntry[];
  /** The name of the deck that is open now, so its entry can say so. */
  currentName: string;
  onOpen: (deck: DeckEntry) => void;
}

/**
 * A menu of the decks in the decks folder. Picking one asks first, inline, because opening a deck
 * replaces the current cards and models (focus starts on Cancel).
 */
export function DeckPicker({ decks, currentName, onOpen }: Props) {
  const [pending, setPending] = useState<DeckEntry | null>(null);
  if (decks.length === 0) return null;
  return (
    <div className="deck-picker">
      <label>
        Open a deck
        <select
          aria-label="Open a deck"
          value=""
          onChange={(event) => setPending(decks.find((deck) => deck.file === event.target.value) ?? null)}
        >
          <option value="">Choose a deck</option>
          {decks.map((deck) => (
            <option key={deck.file} value={deck.file}>
              {deck.name}
              {deck.name.trim() === currentName.trim() ? " (open now)" : ""}
            </option>
          ))}
        </select>
      </label>
      {pending ? (
        <span className="deck-picker-confirm" role="alert">
          Replace the current deck and models with "{pending.name}"?{" "}
          <button
            type="button"
            onClick={() => {
              onOpen(pending);
              setPending(null);
            }}
          >
            Replace
          </button>{" "}
          <button type="button" autoFocus onClick={() => setPending(null)}>
            Cancel
          </button>
        </span>
      ) : null}
    </div>
  );
}
