import { useEffect, useState } from "react";
import { analysisContextLabel } from "../lib/analysisContext";
import { allowedCopies, copiesInDeck, type Banlist, type Format } from "../lib/banlist";
import { displayName, searchCatalog, type Catalog } from "../lib/catalog";
import { applyTuning, MAX_ADDITIONS, type TuningRequest, type TuningResult } from "../lib/deckTuning";
import { analysisContextOf, sectionSize, type MappingDocument } from "../lib/document";
import { scenariosFor } from "../lib/handtrapVersus";
import type { ExtraDeckIds } from "../lib/sectionRouting";

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  extraIds: ExtraDeckIds;
  banlist: Banlist;
  format: Format;
  onPreview: (deck: MappingDocument) => void;
}

const percent = (value: number) => `${(value * 100).toFixed(2)}%`;

function OddsCell({ value, baseline }: { value: number; baseline: number }) {
  const points = Number(((value - baseline) * 100).toFixed(2));
  return (
    <td className="num">
      {percent(value)}
      <span className={`odds-fraction delta ${points > 0 ? "gain" : points < 0 ? "loss" : ""}`}>
        {points > 0 ? "+" : ""}{points.toFixed(2)} pts
      </span>
    </td>
  );
}

export function DeckTuningPanel({ doc, catalog, extraIds, banlist, format, onPreview }: Props) {
  const [goalId, setGoalId] = useState("");
  const [cut, setCut] = useState("");
  const [query, setQuery] = useState("");
  const [additions, setAdditions] = useState<number[]>([]);
  const [scenarioIds, setScenarioIds] = useState<string[]>([]);
  const [request, setRequest] = useState<TuningRequest | null>(null);
  const [result, setResult] = useState<TuningResult | null>(null);
  const current = request?.doc === doc && request.banlist === banlist && request.format === format
    ? request
    : null;

  useEffect(() => {
    if (!current) return;
    try {
      const worker = new Worker(new URL("../lib/deckTuning.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }: MessageEvent<TuningResult>) => {
        setResult(data);
        worker.terminate();
      };
      worker.onerror = () => {
        setResult({ error: "Deck Tuning could not finish. Try a smaller shortlist." });
        worker.terminate();
      };
      worker.postMessage(current);
      return () => worker.terminate();
    } catch {
      setResult({ error: "Deck Tuning could not start in this browser." });
    }
  }, [current]);

  const goals = doc.hand_condition_sets.filter((goal) =>
    goal.condition_ids.some((id) => doc.hand_conditions.some((condition) => condition.id === id)),
  );
  const goal = goals.find((entry) => entry.id === goalId) ?? goals[0];
  const scenarios = scenariosFor(doc);
  const selected = scenarios.filter((scenario) => scenarioIds.includes(scenario.id));
  const name = (id: number) => displayName(id, doc.main.find((card) => card.card_id === id)?.name, catalog);
  const canAdd = (id: number) =>
    !extraIds.has(id) && copiesInDeck(doc, id) < allowedCopies(banlist, format, id);
  const hits = query.trim()
    ? searchCatalog(catalog, query.trim(), 100).filter((hit) => canAdd(hit.card_id)).slice(0, 8)
    : doc.main.filter((card) => canAdd(card.card_id)).slice(0, 8);
  const shortlist = additions.filter(canAdd);
  const shortlistFull = shortlist.length >= MAX_ADDITIONS;
  const cuts = doc.main.some((card) => String(card.card_id) === cut)
    ? [Number(cut)]
    : doc.main.map((card) => card.card_id);

  function clearRun() {
    setRequest(null);
    setResult(null);
  }

  return (
    <section className="panel">
      <header>
        <h2>Deck Tuning</h2>
        <p>{analysisContextLabel(analysisContextOf(doc), doc.analysis.opening_hand_size)}</p>
      </header>
      {!goal ? <p className="empty">Create a Hand Goal with at least one Hand Condition to start tuning.</p> : (
        <>
          <div className="tuning-controls">
            <label>
              Hand Goal
              <select value={goal.id} onChange={(event) => { setGoalId(event.target.value); clearRun(); }}>
                {goals.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </label>
            <label>
              Cut candidates
              <select value={cuts.length === 1 && cut ? cut : ""} onChange={(event) => { setCut(event.target.value); clearRun(); }}>
                <option value="">Any Main Deck card</option>
                {doc.main.map((card) => <option key={card.card_id} value={card.card_id}>{name(card.card_id)}</option>)}
              </select>
            </label>
          </div>
          <fieldset className="tuning-options">
            <legend>Addition shortlist</legend>
            <p className="note">Each addition puts a new copy in Main. Shortlisted cards also enter the swap search. Up to {MAX_ADDITIONS} cards.</p>
            <label className="tuning-search">
              Search Main Deck cards
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <div className="context-presets">
              {(shortlistFull ? [] : hits.filter((hit) => !shortlist.includes(hit.card_id))).map((hit) => (
                <button key={hit.card_id} type="button" onClick={() => {
                  setAdditions([...shortlist, hit.card_id]);
                  clearRun();
                }}>+ {name(hit.card_id)}</button>
              ))}
            </div>
            <div className="context-presets" aria-label="Shortlisted cards" role="group">
              {shortlist.map((id) => (
                <button key={id} type="button" aria-label={`Remove ${name(id)} from shortlist`} onClick={() => {
                  setAdditions(shortlist.filter((entry) => entry !== id));
                  clearRun();
                }}>{name(id)} ×</button>
              ))}
            </div>
          </fieldset>
          {scenarios.length > 0 ? (
            <fieldset className="tuning-options">
              <legend>Handtrap scenarios</legend>
              {scenarios.map((scenario) => (
                <label key={scenario.id}>
                  <input type="checkbox" checked={scenarioIds.includes(scenario.id)} onChange={(event) => {
                    setScenarioIds(event.target.checked
                      ? [...scenarioIds, scenario.id]
                      : scenarioIds.filter((id) => id !== scenario.id));
                    clearRun();
                  }} />
                  {scenario.label}
                </label>
              ))}
            </fieldset>
          ) : null}
          <p className="note">
            {selected.length > 0
              ? "Ranked by the lowest survival rate across selected scenarios, then by uninterrupted odds."
              : "Ranked by uninterrupted odds. Select or add handtrap scenarios to test survival."}
          </p>
          {current && !result ? (
            <button type="button" onClick={clearRun}>Cancel tuning</button>
          ) : (
            <button type="button" onClick={() => {
              setResult(null);
              setRequest({ doc, goalId: goal.id, scenarios: selected, cuts, additions: shortlist, banlist, format });
            }}>Run tuning</button>
          )}
          <p role="status">
            {current && !result ? "Evaluating deck changes…" : current && result && !("error" in result)
              ? `${result.candidates.length} legal changes evaluated.`
              : null}
          </p>
          {current && result && "error" in result ? <p role="alert">{result.error}</p> : null}
          {current && result && !("error" in result) ? (
            <div className="tuning-results">
              <table className="compare-table">
                <caption>Deck tuning results</caption>
                <thead><tr>
                  <th scope="col">Change</th><th scope="col">Main</th><th scope="col">Uninterrupted</th>
                  {current.scenarios.map((scenario) => <th key={scenario.id} scope="col">{scenario.label}</th>)}
                  <th scope="col">Compare</th>
                </tr></thead>
                <tbody>
                  <tr>
                    <th scope="row">Current deck</th>
                    <td>{sectionSize(doc.main)}</td>
                    <td>{percent(result.baseline.uninterrupted)}</td>
                    {result.baseline.survival.map((value, index) => <td key={current.scenarios[index]?.id}>{percent(value)}</td>)}
                    <td />
                  </tr>
                  {result.candidates.map(({ change, size, odds }) => {
                    const label = [
                      "cut" in change ? `Cut ${name(change.cut)}` : "",
                      "add" in change ? `Add ${name(change.add)}` : "",
                    ].filter(Boolean).join(" / ");
                    return (
                      <tr key={JSON.stringify(change)}>
                        <th scope="row">{label}</th><td>{size}</td>
                        <OddsCell value={odds.uninterrupted} baseline={result.baseline.uninterrupted} />
                        {odds.survival.map((value, index) => (
                          <OddsCell key={current.scenarios[index]?.id} value={value} baseline={result.baseline.survival[index] ?? 0} />
                        ))}
                        <td><button type="button" aria-label={`Preview ${label}`} onClick={() => {
                          onPreview({ ...applyTuning(doc, change), name: label });
                        }}>Preview</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {result.candidates.length === 0 ? (
                <p className="empty">No candidates meet the 40–60 Main Deck size and format limits without adding further violations.</p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
