interface Props {
  value: number;
  onChange: (quantity: number) => void;
}

export function QuantityEditor({ value, onChange }: Props) {
  return (
    <div className="qty">
      <button type="button" aria-label="Decrease quantity" onClick={() => onChange(Math.max(1, value - 1))}>
        −
      </button>
      <input
        type="number"
        min={1}
        max={99}
        value={value}
        aria-label="Quantity"
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isInteger(next) && next >= 1) onChange(next);
        }}
      />
      <button type="button" aria-label="Increase quantity" onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}
