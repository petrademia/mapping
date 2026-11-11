import { useMemo, useState } from "react";
import type { MappingDocument } from "../lib/document";
import {
  BRICK_CURVE_MAX,
  scorableGoals,
  scorecard,
  type ScorecardSettings,
  type TurnScore,
} from "../lib/scorecard";
import { useScorecardSettings } from "../lib/scorecardWeights";

const percent = (value: number): string => `${(value * 100).toFixed(2)}%`;

interface Props {
  doc: MappingDocument;
}

type WeightKey = "opens" | "clean" | "resilient" | "interaction" | "first" | "second";

const NUMBER_WEIGHTS: { key: WeightKey; label: string }[] = [
  { key: "opens", label: "Opens" },
  { key: "clean", label: "Clean" },
  { key: "resilient", label: "Resilient" },
  { key: "interaction", label: "Interaction" },
];

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <span className="meter" role="img" aria-label={`${label}: ${percent(value)}`}>
      <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </span>
  );
}

function Row({
  label,
  value,
  note,
  missing,
}: {
  label: string;
  value: number | null;
  note: string;
  missing: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {value === null ? (
          <>
            <strong>-</strong>
            <small>{missing}</small>
          </>
        ) : (
          <>
            <strong>{percent(value)}</strong>
            <Meter value={value} label={label} />
            <small>{note}</small>
          </>
        )}
      </dd>
    </div>
  );
}

function Turn({ title, turn, tolerance }: { title: string; turn: TurnScore; tolerance: number }) {
  const { slots } = turn;
  return (
    <section className="scorecard-turn" aria-label={title}>
      <h3 className="panel-subhead">
        {title} <span className="explorer-notation">{turn.sample} cards</span>
      </h3>
      <p className="scorecard-combined" role="status">
        <span className="outcome-primary">{turn.combined === null ? "-" : percent(turn.combined)}</span>
        <span className="explorer-notation">combined</span>
      </p>
      <dl className="scorecard-rows">
        <Row label="Opens" value={turn.opens} note="hands that meet the Hand Goal" missing="" />
        <Row
          label="Clean"
          value={turn.clean}
          note={`meet it holding at most ${tolerance} ${tolerance === 1 ? "brick" : "bricks"}`}
          missing="no brick is marked"
        />
        <Row
          label="Resilient"
          value={turn.resilient}
          note={`still meet it after the worst opponent hand, ${turn.worstScenario ?? ""}`}
          missing="no handtrap defined"
        />
        <Row
          label="Interaction"
          value={turn.interaction}
          note="hands with at least one Interaction card"
          missing="no card has the role"
        />
      </dl>
      <p className="scorecard-slots">
        <span style={{ "--c": "var(--desirable)" } as React.CSSProperties}>{slots.desirable} desirable</span>
        <span style={{ "--c": "var(--neutral)" } as React.CSSProperties}>{slots.neutral} neutral</span>
        <span style={{ "--c": "var(--undesirable)" } as React.CSSProperties}>{slots.undesirable} bricks</span>
        <span style={{ "--c": "var(--unclassified)" } as React.CSSProperties}>{slots.unset} not set</span>
      </p>
    </section>
  );
}

/**
 * One Hand Goal, measured going first and going second, in terms of how the
 * Main Deck's slots are spent. The combined numbers are weighted averages, so
 * they move with the weights; the individual numbers do not.
 */
export function ScorecardPanel({ doc }: Props) {
  const [goalId, setGoalId] = useState<string | null>(null);
  const [settings, setSettings] = useScorecardSettings();
  const goals = useMemo(() => scorableGoals(doc), [doc]);
  const result = useMemo(() => scorecard(doc, goalId, settings), [doc, goalId, settings]);
  const set = (patch: Partial<ScorecardSettings>) => setSettings({ ...settings, ...patch });
  const whole = (value: string, max: number): number =>
    Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));

  return (
    <section className="panel scorecard" id="scorecard-top">
      <header>
        <h2>Scorecard</h2>
      </header>
      <p className="note">
        How reliably your Main Deck reaches one Hand Goal going first and going
        second, and how many bricks it can carry. The individual numbers are
        exact facts about the deck. The combined numbers are weighted averages,
        so they depend on the weights you choose.
      </p>

      {"error" in result ? (
        <p className="empty">{result.error}</p>
      ) : (
        <>
          {goals.length > 1 ? (
            <label>
              Hand Goal
              <select value={result.goalId} onChange={(event) => setGoalId(event.target.value)}>
                {goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.name || "Untitled hand goal"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <p className="scorecard-overall" role="status" aria-label="Overall">
            <span className="outcome-primary">{result.overall === null ? "-" : percent(result.overall)}</span>
            <span className="explorer-notation">
              overall for {result.goalName || "this Hand Goal"}, both turn orders
            </span>
          </p>

          <div className="scorecard-turns">
            <Turn title="Going first" turn={result.first} tolerance={result.brickTolerance} />
            <Turn title="Going second" turn={result.second} tolerance={result.brickTolerance} />
          </div>

          {[...new Set([...result.first.notes, ...result.second.notes])].map((note) => (
            <p key={note} className="note">
              {note}
            </p>
          ))}

          {result.first.brickCurve.length > 0 ? (
            <>
              <h3 className="panel-subhead">How many bricks can it carry?</h3>
              <p className="note">
                Hands that meet the Hand Goal while holding at most this many
                bricks. Where it stays close to Opens, the deck can take more
                bricks, which is room for cards that are strong but dead in some hands.
              </p>
              <table className="compare-table scorecard-curve">
                <thead>
                  <tr>
                    <th scope="col">At most</th>
                    {Array.from({ length: BRICK_CURVE_MAX + 1 }, (_, k) => (
                      <th key={k} scope="col">
                        {k}
                      </th>
                    ))}
                    <th scope="col">Opens</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Going first", result.first],
                    ["Going second", result.second],
                  ].map(([label, turn]) => (
                    <tr key={label as string}>
                      <th scope="row">{label as string}</th>
                      {(turn as TurnScore).brickCurve.map((value, k) => (
                        <td key={k} className={k === result.brickTolerance ? "num on" : "num"}>
                          {percent(value)}
                        </td>
                      ))}
                      <td className="num">{percent((turn as TurnScore).opens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          {result.first.interruptions.length > 0 ? (
            <>
              <h3 className="panel-subhead">How many interruptions can it take?</h3>
              <p className="note">
                Hands that still meet the Hand Goal after this many interruptions. Each
                interruption stops any one card in your hand, and the opponent picks the
                card that hurts most, so no handtrap needs to be defined. A hand with one
                route ends its turn on the first interruption. Two independent routes,
                such as two starters that do not need each other, take one.
              </p>
              <table className="compare-table scorecard-curve" aria-label="Interruption curve">
                <thead>
                  <tr>
                    <th scope="col">After</th>
                    {result.first.interruptions.map((_, k) => (
                      <th key={k} scope="col">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Going first", result.first.interruptions],
                    ["Going second", result.second.interruptions],
                    ...(result.first.interruptionsPriority.length > 0
                      ? [
                          ["Going first, if they follow your list", result.first.interruptionsPriority],
                          ["Going second, if they follow your list", result.second.interruptionsPriority],
                        ]
                      : []),
                  ].map(([label, values]) => (
                    <tr key={label as string}>
                      <th scope="row">{label as string}</th>
                      {(values as number[]).map((value, k) => (
                        <td key={k} className="num">
                          {percent(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.first.interruptionsPriority.length > 0 ? (
                <p className="note">
                  The last two rows assume the opponent uses each handtrap on the first card or Group
                  of your priority list (set in the Handtraps tab) that it can stop and you hold,
                  whether or not that breaks your plan. The first two rows assume they always stop
                  the card that hurts most, so the true figure is somewhere between.
                </p>
              ) : null}
              {result.second.interruptions.length > 1 ? (
                <p className="note">
                  Meet the goal with only one route, so one interruption ends the turn:{" "}
                  <strong>{percent(result.first.interruptions[0]! - result.first.interruptions[1]!)}</strong>{" "}
                  going first,{" "}
                  <strong>{percent(result.second.interruptions[0]! - result.second.interruptions[1]!)}</strong>{" "}
                  going second. A second copy of a card counts as a backup here, and so does
                  another route, unless you marked their Group as a choke point in Models.
                </p>
              ) : null}
            </>
          ) : null}

          {result.first.scenarios.length > 1 ? (
            <details className="panel-details">
              <summary>Resilience by opponent hand</summary>
              <dl className="explorer-results">
                {result.first.scenarios.map((scenario, index) => (
                  <div key={scenario.label} className="explorer-row">
                    <dt>
                      <span className="explorer-title">{scenario.label}</span>
                    </dt>
                    <dd>
                      {percent(scenario.probability)} first · {percent(result.second.scenarios[index]?.probability ?? 0)} second
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          ) : null}

          <h3 className="panel-subhead">Settings</h3>
          <div className="scorecard-weights">
            <label>
              Bricks allowed
              <select
                value={result.brickTolerance}
                onChange={(event) => set({ brickTolerance: whole(event.target.value, BRICK_CURVE_MAX) })}
              >
                {Array.from({ length: BRICK_CURVE_MAX + 1 }, (_, k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="note">
            Weights: how much each number counts toward the combined one. A number
            that cannot be measured, or has weight 0, is left out.
          </p>
          <div className="scorecard-weights">
            {NUMBER_WEIGHTS.map((field) => (
              <label key={field.key}>
                {field.label}
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={1}
                  value={settings[field.key]}
                  onChange={(event) => set({ [field.key]: whole(event.target.value, 10) })}
                />
              </label>
            ))}
          </div>
          <div className="scorecard-weights">
            <label>
              Going first counts
              <input
                type="number"
                min={0}
                max={10}
                step={1}
                value={settings.first}
                onChange={(event) => set({ first: whole(event.target.value, 10) })}
              />
            </label>
            <label>
              Going second counts
              <input
                type="number"
                min={0}
                max={10}
                step={1}
                value={settings.second}
                onChange={(event) => set({ second: whole(event.target.value, 10) })}
              />
            </label>
          </div>

          <details className="panel-details">
            <summary>What these numbers assume</summary>
            <ul className="scorecard-assumptions">
              <li>Every number is exact over all possible hands, not a simulation.</li>
              <li>
                Going first is the five-card opening hand. Going second is the hand
                after the first draw, six cards.
              </li>
              <li>
                A brick is a card whose Opening Quality for that turn order is Undesirable. A
                card can be a brick going first and a good card going second.
              </li>
              <li>
                Resilient is a worst case: the opponent holds the handtraps you defined
                and always stops the card that hurts you most. It does not say how
                likely they are to hold them.
              </li>
              <li>
                Resilient only removes cards from your hand. It does not model a handtrap
                that stops a later step of your combo, or a card that stops handtraps. It
                counts a shared bottleneck, such as the one Normal Summon or a once-per-turn
                effect, only for the Groups you marked "Only one of these can complete a turn"
                in Models; otherwise a second copy or a second route is treated as a backup.
              </li>
              <li>
                Interaction counts cards you marked with the Interaction role, whether or
                not they are in your Hand Goal.
              </li>
              <li>These measure how reliably you reach your plan, not how often you win.</li>
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
