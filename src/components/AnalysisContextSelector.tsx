import {
  analysisContextFromPreset,
  analysisContextLabel,
  analysisContextPreset,
  observedCards,
  sampleSizeDescription,
  type AnalysisContext,
  type AnalysisContextPreset,
} from "../lib/analysisContext";

const PRESETS: AnalysisContextPreset[] = [
  "going_first_opening",
  "going_second_opening",
  "going_second_first_turn",
];

interface ChipsProps {
  context: AnalysisContext;
  openingHandSize: number;
  onChange: (context: AnalysisContext) => void;
}

interface Props extends ChipsProps {
  /** How many cards the Main Deck holds: the opening hand cannot be bigger. */
  deckSize: number;
  onHandSize: (size: number) => void;
}

/** The three analysis contexts as a radio group, for any panel that needs to choose one. */
export function ContextChips({
  context,
  openingHandSize,
  onChange,
}: ChipsProps) {
  const selected = analysisContextPreset(context);
  return (
    <div className="context-presets" role="radiogroup" aria-label="Analysis context">
      {PRESETS.map((preset) => {
        const next = analysisContextFromPreset(preset);
        const active = selected === preset;
        return (
          <button
            key={preset}
            type="button"
            role="radio"
            aria-checked={active}
            className={active ? "chip on context-chip" : "chip context-chip"}
            onClick={() => onChange(next)}
          >
            {analysisContextLabel(next, openingHandSize)}
          </button>
        );
      })}
    </div>
  );
}

export function AnalysisContextSelector({
  context,
  openingHandSize,
  onChange,
  deckSize,
  onHandSize,
}: Props) {
  const sample = observedCards(context, openingHandSize);

  return (
    <section className="panel analysis-context-panel">
      <header>
        <h2>Analysis Context</h2>
        <p>{sample} cards seen</p>
      </header>
      <p className="note">
        Which cards are counted. Going second, first turn, includes the normal draw
        ({openingHandSize + 1} cards seen); going first sees {openingHandSize}.
      </p>
      <ContextChips context={context} openingHandSize={openingHandSize} onChange={onChange} />
      <p className="note context-sample">
        Evaluating against {sampleSizeDescription(context, openingHandSize)}.
      </p>
      <label className="opening-hand-field">
        Opening hand
        <input
          type="number"
          min={0}
          max={Math.max(deckSize, 0)}
          value={openingHandSize}
          onChange={(event) => onHandSize(Number(event.target.value))}
        />
      </label>
    </section>
  );
}
