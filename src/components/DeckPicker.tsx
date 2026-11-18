import type { DeckEntry } from "../lib/deckLibrary";

interface Props {
  /** The decks kept in public/decks/. */
  decks: readonly DeckEntry[];
  /** The name of the deck that is open now, so its entry can say so. */
  currentName: string;
  onOpen: (deck: DeckEntry) => void;
}

/**
 * A menu of the decks in the decks folder. Picking one opens it at once; the page offers an Undo
 * that puts back the deck you had, with any edits you had not saved.
 */
export function DeckPicker({ decks, currentName, onOpen }: Props) {
  if (decks.length === 0) return null;
  return (
    <div className="deck-picker">
      <label>
        Open a deck
        <select
          aria-label="Open a deck"
          value=""
          onChange={(event) => {
            const deck = decks.find((entry) => entry.file === event.target.value);
            if (deck) onOpen(deck);
          }}
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
    </div>
  );
}
