import { Icon } from "./IconButton";

interface Props {
  value: number;
  /** Called with 0 when the minus is pressed on the last copy: the card should go. */
  onChange: (quantity: number) => void;
  /** The most copies the deck may hold of this card; typing more goes to this, and plus stops here. */
  max?: number;
}

export function QuantityEditor({ value, onChange, max = 99 }: Props) {
  const atLimit = value >= max;
  return (
    <div className="qty">
      <button
        type="button"
        aria-label={value <= 1 ? "Remove card" : "Decrease quantity"}
        title={value <= 1 ? "Remove card" : "Decrease quantity"}
        onClick={() => onChange(value - 1)}
      >
        <Icon name="minus" />
      </button>
      <input
        type="number"
        min={1}
        max={max}
        value={value}
        aria-label="Quantity"
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isInteger(next) && next >= 1) onChange(Math.min(next, max));
        }}
      />
      <button
        type="button"
        aria-label="Increase quantity"
        title={atLimit ? `At the limit of ${max} ${max === 1 ? "copy" : "copies"} for this card` : "Increase quantity"}
        disabled={atLimit}
        onClick={() => onChange(value + 1)}
      >
        <Icon name="plus" />
      </button>
    </div>
  );
}
