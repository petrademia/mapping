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

interface Props {
  context: AnalysisContext;
  openingHandSize: number;
  onChange: (context: AnalysisContext) => void;
}

/** The three analysis contexts as a radio group, for any panel that needs to choose one. */
export function ContextChips({
  context,
  openingHandSize,
  onChange,
}: Props) {
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
}: Props) {
  const sample = observedCards(context, openingHandSize);

  return (
    <section className="panel analysis-context-panel">
      <header>
        <h2>Analysis Context</h2>
        <p>{sample} cards seen</p>
      </header>
      <p className="note">
        Turn order and observation point for composition probabilities. Opening
        hand is always {openingHandSize} cards; going second by first turn also
        counts the normal draw ({openingHandSize + 1} cards seen). This is not a
        card taxonomy label.
      </p>
      <ContextChips context={context} openingHandSize={openingHandSize} onChange={onChange} />
      <p className="note context-sample">
        Evaluating against {sampleSizeDescription(context, openingHandSize)}.
      </p>
    </section>
  );
}
