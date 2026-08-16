import type { OpeningQualityValue } from "../lib/taxonomy";

const OPTIONS: { value: OpeningQualityValue; label: string }[] = [
  { value: null, label: "Unclassified" },
  { value: "desirable", label: "Desirable" },
  { value: "neutral", label: "Neutral" },
  { value: "undesirable", label: "Undesirable" },
];

interface Props {
  value: OpeningQualityValue;
  onChange: (value: OpeningQualityValue) => void;
}

export function OpeningQualityEditor({ value, onChange }: Props) {
  return (
    <div className="taxonomy-block">
      <span className="taxonomy-label">Opening quality</span>
      <div
        className="opening-quality"
        role="radiogroup"
        aria-label="Opening quality"
      >
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          const qualityKey =
            option.value === null ? "unclassified" : option.value;
          return (
            <button
              key={qualityKey}
              type="button"
              className={selected ? "chip on" : "chip"}
              data-quality={qualityKey}
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
