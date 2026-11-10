import { useRef, useState, type KeyboardEvent } from "react";
import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import {
  addConfiguration,
  configurationDiff,
  configurationLabel,
  DECK_LIST_ID,
  duplicateConfiguration,
  findConfiguration,
  mainQuantity,
  poolCards,
  removeConfiguration,
  renameConfiguration,
  setActiveConfiguration,
  setConfigurationMainQuantity,
  setConfigurationNotes,
} from "../lib/configuration";
import { sectionSize, type MappingDocument } from "../lib/document";
import { Icon } from "./IconButton";

export const CONFIGURATION_PANEL_ID = "deck-configuration";

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  onChange: (doc: MappingDocument) => void;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

interface DeleteControlProps {
  name: string;
  hasSwaps: boolean;
  onDelete: () => void;
}

/** Inline two-step delete; never a browser dialog, and cancellable. */
function DeleteControl({ name, hasSwaps, onDelete }: DeleteControlProps) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => (hasSwaps ? setConfirming(true) : onDelete())}
      >
        Delete
      </button>
    );
  }
  return (
    <span className="delete-confirm" role="group" aria-label={`Delete ${name}?`}>
      <span>Delete {name}? Its swaps are lost.</span>
      <button type="button" className="danger" onClick={onDelete}>
        Delete
      </button>
      <button type="button" autoFocus onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </span>
  );
}

/**
 * Pick the deck configuration the workspaces analyze and edit post-side
 * swaps. Edits here only change which copies are in Main; annotations stay on
 * the cards and are edited in the deck list (which is Pre-Side).
 */
export function ConfigurationPanel({ doc, catalog, onChange }: Props) {
  const activeId = doc.active_configuration_id;
  const active = findConfiguration(doc, activeId);
  const preMain = sectionSize(doc.main);
  const pool = poolCards(doc);
  const diff = active ? configurationDiff(doc, active.id) : [];
  const mainSize = active
    ? pool.reduce((sum, c) => sum + mainQuantity(doc, active.id, c.card_id), 0)
    : preMain;
  const sideSize = active
    ? pool.reduce((sum, c) => sum + c.quantity, 0) - mainSize
    : sectionSize(doc.side);
  const delta = mainSize - preMain;
  const chipsRef = useRef<HTMLDivElement>(null);

  // Move focus to the selected chip once React has rendered the change, so
  // keyboard users never land on <body> after adding or deleting.
  const focusSelectedChip = () =>
    requestAnimationFrame(() =>
      chipsRef.current
        ?.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="true"]')
        ?.focus(),
    );

  const onChipKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const radios = [
      ...(chipsRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []),
    ];
    const current = radios.findIndex((radio) => radio === document.activeElement);
    if (current === -1) return;
    const last = radios.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (current + 1) % radios.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (current - 1 + radios.length) % radios.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (next === -1) return;
    event.preventDefault();
    radios[next]?.click();
    radios[next]?.focus();
  };

  const [onlyChanged, setOnlyChanged] = useState(false);
  // The swap table starts collapsed on narrow screens to keep the panel short.
  const [swapsOpen, setSwapsOpen] = useState(
    () => !window.matchMedia("(max-width: 960px)").matches,
  );

  // Stable Pre-Side order: rows never move under the pointer. Changes are
  // shown by the tint, the badge and the diff chips; "changed only" is opt-in.
  const allRows = active
    ? pool.map((card) => {
        const main = mainQuantity(doc, active.id, card.card_id);
        const pre = doc.main.find((c) => c.card_id === card.card_id)?.quantity ?? 0;
        return { card, main, pre, changed: main !== pre };
      })
    : [];
  const rows = onlyChanged ? allRows.filter((row) => row.changed) : allRows;

  return (
    <section
      className="panel configuration-panel"
      id={CONFIGURATION_PANEL_ID}
      tabIndex={-1}
      aria-label="Deck Configuration"
    >
      <header>
        <h2>Deck Configuration</h2>
        {active ? null : (
          <p>
            {mainSize} main / {sideSize} side
          </p>
        )}
        <button
          type="button"
          className="back-to-list"
          onClick={() => {
            const list = document.getElementById(DECK_LIST_ID);
            list?.scrollIntoView({ block: "start" });
          }}
        >
          Back to deck list
        </button>
      </header>
      <div className="configuration-chips">
        <div
          ref={chipsRef}
          className="context-presets"
          role="radiogroup"
          aria-label="Deck configuration"
          onKeyDown={onChipKeys}
        >
          <button
            type="button"
            role="radio"
            aria-checked={activeId === null}
            tabIndex={activeId === null ? 0 : -1}
            className={activeId === null ? "chip on context-chip" : "chip context-chip"}
            onClick={() => onChange(setActiveConfiguration(doc, null))}
          >
            Pre-Side
          </button>
          {doc.configurations.map((config) => (
            <button
              key={config.id}
              type="button"
              role="radio"
              aria-checked={activeId === config.id}
              tabIndex={activeId === config.id ? 0 : -1}
              title={configurationLabel(config)}
              className={activeId === config.id ? "chip on context-chip" : "chip context-chip"}
              onClick={() => onChange(setActiveConfiguration(doc, config.id))}
            >
              {configurationLabel(config)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="chip context-chip add-configuration"
          onClick={() => {
            onChange(addConfiguration(doc));
            focusSelectedChip();
          }}
        >
          <Icon name="plus" /> Post-Side
        </button>
      </div>
      <p className="note configuration-hint">
        Profile, Models and Hand Test analyze the selected list. Annotations are
        edited in the deck list and shared by every configuration.
      </p>

      {active ? (
        <div className="configuration-editor">
          <p className="configuration-summary" role="status">
            <strong>
              {mainSize} main / {sideSize} not in Main
            </strong>
            <span>
              {diff.length === 0
                ? "same as Pre-Side"
                : delta === 0
                  ? `${diff.length} swapped, same size as Pre-Side`
                  : `${signed(delta)} ${Math.abs(delta) === 1 ? "card" : "cards"} vs Pre-Side`}
            </span>
            {mainSize !== preMain ? (
              <span className="configuration-warn">
                Main is {mainSize}, Pre-Side is {preMain}
              </span>
            ) : null}
          </p>
          {diff.length > 0 ? (
            <ul className="diff-chips" aria-label="Changes from Pre-Side">
              {diff.map((row) => (
                <li key={row.card_id} className={row.delta < 0 ? "out" : "in"}>
                  <b>{signed(row.delta)}</b>{" "}
                  {displayName(row.card_id, row.name, catalog)}
                </li>
              ))}
            </ul>
          ) : null}

          <details
            className="configuration-swaps"
            open={swapsOpen}
            onToggle={(event) => setSwapsOpen(event.currentTarget.open)}
          >
          <summary>
            Swap cards
            {diff.length > 0 ? ` (${diff.length} changed)` : ""}
          </summary>
          <label className="configuration-filter">
            <input
              type="checkbox"
              checked={onlyChanged}
              onChange={(event) => setOnlyChanged(event.target.checked)}
            />
            Changed cards only
          </label>
          {rows.length === 0 ? (
            <p className="note">No changes yet. Use − to move a copy out of Main.</p>
          ) : null}
          <div className="configuration-table-wrap">
            <table className="configuration-table">
              <thead>
                <tr>
                  <th>Card</th>
                  <th title="Copies in Main under Pre-Side">Pre</th>
                  <th>Main</th>
                  <th title="Copies not in Main (Side pool)">Not in Main</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ card, main, pre, changed }) => {
                  const name = displayName(card.card_id, card.name, catalog);
                  const set = (value: number) =>
                    onChange(setConfigurationMainQuantity(doc, active.id, card.card_id, value));
                  return (
                    <tr key={card.card_id} className={changed ? "changed" : undefined}>
                      <td className="config-card">
                        <strong>{name}</strong>
                      </td>
                      <td>{pre}</td>
                      <td>
                        <div className="qty">
                          <button
                            type="button"
                            aria-label={`Move one ${name} to Side`}
                            aria-disabled={main <= 0}
                            onClick={() => main > 0 && set(main - 1)}
                          >
                            <Icon name="minus" />
                          </button>
                          <span className="qty-value">{main}</span>
                          <button
                            type="button"
                            aria-label={`Move one ${name} to Main`}
                            aria-disabled={main >= card.quantity}
                            onClick={() => main < card.quantity && set(main + 1)}
                          >
                            <Icon name="plus" />
                          </button>
                          {changed ? (
                            <span className="change-badge" title="Changed from Pre-Side">
                              <span className="visually-hidden">changed from Pre-Side by </span>
                              {signed(main - pre)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>{card.quantity - main}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </details>

          <details className="configuration-details">
            <summary>Name, notes and actions</summary>
            <div className="configuration-head">
              <label>
                Name
                <input
                  value={active.name}
                  onChange={(event) =>
                    onChange(renameConfiguration(doc, active.id, event.target.value))
                  }
                />
              </label>
              <div className="row-actions">
                <button type="button" onClick={() => onChange(duplicateConfiguration(doc, active.id))}>
                  Duplicate
                </button>
                <DeleteControl
                  key={active.id}
                  name={configurationLabel(active)}
                  hasSwaps={active.overrides.length > 0}
                  onDelete={() => {
                    onChange(removeConfiguration(doc, active.id));
                    focusSelectedChip();
                  }}
                />
              </div>
            </div>
            <label className="configuration-notes">
              Notes
              <textarea
                rows={2}
                placeholder="Matchup or plan this configuration is for"
                value={active.notes ?? ""}
                onChange={(event) =>
                  onChange(setConfigurationNotes(doc, active.id, event.target.value))
                }
              />
            </label>
          </details>
        </div>
      ) : null}
    </section>
  );
}
