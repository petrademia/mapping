import { useRef, useState, type KeyboardEvent } from "react";
import type { Catalog } from "../lib/catalog";
import { displayName } from "../lib/catalog";
import {
  addConfiguration,
  configurationDiff,
  configurationLabel,
  DECK_LIST_ID,
  duplicateConfiguration,
  EXTRA_DECK_LIMIT,
  extraDeckSize,
  extraDiff,
  extraPoolCards,
  extraQuantity,
  findConfiguration,
  mainQuantity,
  poolCards,
  removeConfiguration,
  renameConfiguration,
  setActiveConfiguration,
  setConfigurationExtraQuantity,
  setConfigurationMainQuantity,
  setConfigurationNotes,
} from "../lib/configuration";
import { sectionSize, type MappingDocument } from "../lib/document";
import type { ExtraDeckIds } from "../lib/sectionRouting";
import { CardFrame } from "./HandImages";
import { Icon } from "./IconButton";

export const CONFIGURATION_PANEL_ID = "deck-configuration";

interface Props {
  doc: MappingDocument;
  catalog: Catalog;
  /** Extra Deck monster ids, so Extra Deck cards side with Extra and not Main. */
  extraIds?: ExtraDeckIds;
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
const NO_EXTRA_IDS: ExtraDeckIds = new Set();

export function ConfigurationPanel({ doc, catalog, extraIds = NO_EXTRA_IDS, onChange }: Props) {
  const activeId = doc.active_configuration_id;
  const active = findConfiguration(doc, activeId);
  const preMain = sectionSize(doc.main);
  const pool = poolCards(doc, extraIds);
  const extraPool = extraPoolCards(doc, extraIds);
  const diff = active ? configurationDiff(doc, active.id) : [];
  const extraChanges = active ? extraDiff(doc, active.id, extraIds) : [];
  const changeCount = diff.length + extraChanges.length;
  const extraSize = active ? extraDeckSize(doc, active.id, extraIds) : sectionSize(doc.extra);
  const extraFull = extraSize >= EXTRA_DECK_LIMIT;
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

  // The swap grids start collapsed on narrow screens to keep the panel short.
  const [swapsOpen, setSwapsOpen] = useState(
    () => !window.matchMedia("(max-width: 960px)").matches,
  );

  // One tile per physical copy. Tiles keep a stable Pre-Side order so nothing
  // jumps under the pointer; a tint marks copies that differ from Pre-Side.
  interface SwapTile {
    key: string;
    cardId: number;
    name: string;
    /** Main and Not in Main swap Main cards; Extra and Extra in Side swap Extra Deck cards. */
    zone: "main" | "side" | "extra" | "extra-side";
    /** Brought in or sent out compared with Pre-Side. */
    changed: boolean;
    /** Copies in the zone being edited (Main or Extra) right now. */
    main: number;
    quantity: number;
  }
  const mainTiles: SwapTile[] = [];
  const sideTiles: SwapTile[] = [];
  const extraTiles: SwapTile[] = [];
  const extraSideTiles: SwapTile[] = [];
  if (active) {
    for (const card of pool) {
      const name = displayName(card.card_id, card.name, catalog);
      const main = mainQuantity(doc, active.id, card.card_id);
      const pre = doc.main.find((c) => c.card_id === card.card_id)?.quantity ?? 0;
      const out = Math.max(0, pre - main);
      for (let copy = 0; copy < main; copy += 1) {
        mainTiles.push({
          key: `m-${card.card_id}-${copy}`,
          cardId: card.card_id,
          name,
          zone: "main",
          changed: copy >= pre,
          main,
          quantity: card.quantity,
        });
      }
      for (let copy = 0; copy < card.quantity - main; copy += 1) {
        sideTiles.push({
          key: `s-${card.card_id}-${copy}`,
          cardId: card.card_id,
          name,
          zone: "side",
          changed: copy < out,
          main,
          quantity: card.quantity,
        });
      }
    }
  }
  if (active) {
    for (const card of extraPool) {
      const name = displayName(card.card_id, card.name, catalog);
      const inExtra = extraQuantity(doc, active.id, card.card_id);
      const pre = doc.extra.find((c) => c.card_id === card.card_id)?.quantity ?? 0;
      const out = Math.max(0, pre - inExtra);
      for (let copy = 0; copy < inExtra; copy += 1) {
        extraTiles.push({
          key: `e-${card.card_id}-${copy}`,
          cardId: card.card_id,
          name,
          zone: "extra",
          changed: copy >= pre,
          main: inExtra,
          quantity: card.quantity,
        });
      }
      for (let copy = 0; copy < card.quantity - inExtra; copy += 1) {
        extraSideTiles.push({
          key: `es-${card.card_id}-${copy}`,
          cardId: card.card_id,
          name,
          zone: "extra-side",
          changed: copy < out,
          main: inExtra,
          quantity: card.quantity,
        });
      }
    }
  }
  const sideOnlyCount = pool.filter(
    (card) => !doc.main.some((c) => c.card_id === card.card_id),
  ).length;

  function renderTile(tile: SwapTile) {
    const isExtra = tile.zone === "extra" || tile.zone === "extra-side";
    const leaving = tile.zone === "main" || tile.zone === "extra";
    const target = leaving ? "Side" : isExtra ? "Extra" : "Main";
    const blocked = tile.zone === "extra-side" && extraFull;
    const move = () => {
      if (blocked) return;
      const next = leaving ? tile.main - 1 : tile.main + 1;
      onChange(
        isExtra
          ? setConfigurationExtraQuantity(doc, active!.id, tile.cardId, next, extraIds)
          : setConfigurationMainQuantity(doc, active!.id, tile.cardId, next),
      );
    };
    return (
      <li key={tile.key}>
        <button
          type="button"
          className={tile.changed ? "swap-tile changed" : "swap-tile"}
          aria-label={`Move one ${tile.name} to ${target}`}
          aria-disabled={blocked}
          title={
            blocked
              ? `${tile.name}: the Extra Deck is full (${EXTRA_DECK_LIMIT}). Send a card out first.`
              : `${tile.name}: click to move to ${target}`
          }
          onClick={move}
        >
          <CardFrame cardId={tile.cardId} name={tile.name} />
        </button>
      </li>
    );
  }

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
            {extraPool.length > 0 ? (
              <span>
                {extraSize} / {EXTRA_DECK_LIMIT} extra
              </span>
            ) : null}
            <span>
              {changeCount === 0
                ? "same as Pre-Side"
                : delta === 0
                  ? `${changeCount} swapped, same size as Pre-Side`
                  : `${signed(delta)} ${Math.abs(delta) === 1 ? "card" : "cards"} vs Pre-Side`}
            </span>
            {mainSize !== preMain ? (
              <span className="configuration-warn">
                Main is {mainSize}, Pre-Side is {preMain}
              </span>
            ) : null}
          </p>
          {changeCount > 0 ? (
            <ul className="diff-chips" aria-label="Changes from Pre-Side">
              {diff.map((row) => (
                <li key={row.card_id} className={row.delta < 0 ? "out" : "in"}>
                  <b>{signed(row.delta)}</b>{" "}
                  {displayName(row.card_id, row.name, catalog)}
                </li>
              ))}
              {extraChanges.map((row) => (
                <li key={`extra-${row.card_id}`} className={row.delta < 0 ? "out" : "in"}>
                  <b>{signed(row.delta)}</b>{" "}
                  {displayName(row.card_id, row.name, catalog)} (Extra)
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
            {changeCount > 0 ? ` (${changeCount} changed)` : ""}
          </summary>
          <p className="note configuration-howto">
            Click a card in Main to send it to the Side, then click a Side card
            to bring it in. Extra Deck cards swap the same way between Extra
            and Side. Highlighted cards differ from Pre-Side.
          </p>
          {sideOnlyCount === 0 && extraSideTiles.length === 0 ? (
            <p className="note configuration-warn-note" role="note">
              Your Side Deck is empty, so there is nothing to bring in. Add
              cards to the Side Deck in the deck list, then swap them here.
            </p>
          ) : null}
          <h3 className="swap-heading">Main ({mainTiles.length})</h3>
          <ul className="swap-grid" aria-label="Main in this configuration">
            {mainTiles.map(renderTile)}
          </ul>
          <h3 className="swap-heading">Not in Main ({sideTiles.length})</h3>
          <ul className="swap-grid" aria-label="Not in Main in this configuration">
            {sideTiles.map(renderTile)}
          </ul>
          {extraPool.length > 0 ? (
            <>
              <h3 className="swap-heading">
                Extra ({extraSize} / {EXTRA_DECK_LIMIT})
              </h3>
              <ul className="swap-grid" aria-label="Extra in this configuration">
                {extraTiles.map(renderTile)}
              </ul>
              <h3 className="swap-heading">Extra Deck cards in Side ({extraSideTiles.length})</h3>
              <ul className="swap-grid" aria-label="Extra Deck cards in Side in this configuration">
                {extraSideTiles.map(renderTile)}
              </ul>
              {extraFull && extraSideTiles.length > 0 ? (
                <p className="note">The Extra Deck is full. Send a card out to bring another in.</p>
              ) : null}
            </>
          ) : null}
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
                  hasSwaps={active.overrides.length > 0 || (active.extra_overrides?.length ?? 0) > 0}
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
