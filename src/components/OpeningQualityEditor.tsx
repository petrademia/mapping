import type {
  ContextualOpeningQuality,
  OpeningQualityValue,
} from "../lib/taxonomy";

const OPTIONS: { value: OpeningQualityValue; label: string }[] = [
  { value: null, label: "Unclassified" },
  { value: "desirable", label: "Desirable" },
  { value: "neutral", label: "Neutral" },
  { value: "undesirable", label: "Undesirable" },
];

const CONTEXTS: {
  key: keyof ContextualOpeningQuality;
  label: string;
}[] = [
  { key: "going_first", label: "Going First" },
  { key: "going_second", label: "Going Second" },
];

interface Props {
  value: ContextualOpeningQuality;
  onChange: (
    turnOrder: "going_first" | "going_second",
    value: OpeningQualityValue,
  ) => void;
}

export function OpeningQualityEditor({ value, onChange }: Props) {
  return (
    <div className="taxonomy-block">
      <span className="taxonomy-label">Opening quality</span>
      <div className="opening-quality-contexts">
        {CONTEXTS.map((context) => {
          const current = value[context.key];
          return (
            <label key={context.key} className="quality-context">
              <span>{context.label}</span>
              <select
                value={current === null ? "" : current}
                aria-label={`Opening quality ${context.label}`}
                onChange={(event) => {
                  const raw = event.target.value;
                  const next =
                    raw === "" ? null : (raw as OpeningQualityValue);
                  onChange(context.key, next);
                }}
              >
                {OPTIONS.map((option) => (
                  <option
                    key={option.label}
                    value={option.value === null ? "" : option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}