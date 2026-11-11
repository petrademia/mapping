import type { Handtrap } from "../lib/handtrap";
import { CardFrame } from "./HandImages";
import { Icon } from "./IconButton";

interface Props {
  /** The handtraps the opponent can draw: the list from the Handtraps tab. */
  pool: readonly Handtrap[];
  /** Ids of the handtraps in the opponent's hand. */
  held: readonly string[];
  /** How many handtraps Deal Opponent puts in the hand. */
  dealCount: number;
  onDealCount: (count: number) => void;
  onDeal: () => void;
  onClear: () => void;
  onToggle: (handtrapId: string) => void;
}

/**
 * The opponent's hand as card art. Deal Opponent draws a random few handtraps from
 * the pool, or click handtraps to set the hand by hand. The Hand Goal results use it.
 */
export function HandOpponent({ pool, held, dealCount, onDealCount, onDeal, onClear, onToggle }: Props) {
  return (
    <section className="hand-pane hand-opponent" aria-label="Opponent hand">
      <header>
        <p>Click to hold</p>
        <p className="hand-total" role="status">
          {held.length} {held.length === 1 ? "Handtrap" : "Handtraps"} in opponent hand
        </p>
      </header>
      <div className="row-actions hand-actions">
        <span className="draw-group">
          <button type="button" onClick={onDeal}>
            <Icon name="redo" />
            Deal Opponent
          </button>
          <input
            type="number"
            min={0}
            max={pool.length}
            value={dealCount}
            aria-label="Handtraps to deal"
            onChange={(event) => onDealCount(Math.max(0, Math.min(pool.length, Math.floor(Number(event.target.value) || 0))))}
          />
        </span>
        <button type="button" onClick={onClear} disabled={held.length === 0} aria-label="Clear opponent">
          <Icon name="x" />
          Clear
        </button>
      </div>
      <ul className="hand-deck-grid" aria-label="Handtraps">
        {pool.map((handtrap) => {
          const isHeld = held.includes(handtrap.id);
          return (
            <li key={handtrap.id}>
              <button
                type="button"
                className={isHeld ? "hand-tile in-hand" : "hand-tile out"}
                aria-pressed={isHeld}
                aria-label={`${handtrap.name}, ${isHeld ? "in the opponent hand. Click to remove it" : "click to give it to the opponent"}`}
                title={handtrap.name}
                onClick={() => onToggle(handtrap.id)}
              >
                <CardFrame cardId={handtrap.card_id ?? 0} name={handtrap.name} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
