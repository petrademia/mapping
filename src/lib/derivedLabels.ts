import type { MappingCard, MappingDocument } from "./document";
import { groupsToMembership } from "./handCondition";
import { ROLES, type Role } from "./taxonomy";

/**
 * Starter, Extender and Brick, read from the Hand Conditions you wrote instead of
 * tagged by hand. Only conditions that belong to a Hand Goal count, because those
 * are the routes in your model.
 *
 * - **Starter**: a card that satisfies a condition on its own (one requirement,
 *   needing one card). Any card of a Group requirement counts.
 * - **Extender**: a card a condition needs together with another card (two or
 *   more requirements, or one copy and more). A card can be both.
 * - **Brick**: a card in none of your routes that is not an Interaction or Lasting card.
 *   Going first or second it is dead for the Hand Goals. Opening Quality you set
 *   by hand always wins.
 *
 * Role requirements and exclusions are ignored here, which also keeps this from
 * depending on its own result.
 */
export interface DerivedLabels {
  starter: boolean;
  extender: boolean;
  brick: boolean;
}

/** How many copies a requirement needs, or null when it only asks for fewer or none. */
function needed(op: string, count: number): number | null {
  if (op === "gte") return count >= 1 ? count : null;
  if (op === "gt") return count + 1;
  if (op === "eq") return count >= 1 ? count : null;
  return null;
}

export function deriveLabels(doc: MappingDocument): Map<number, DerivedLabels> {
  const conditionById = new Map(doc.hand_conditions.map((condition) => [condition.id, condition]));
  const used = new Set<string>();
  for (const set of doc.hand_condition_sets) {
    for (const id of set.condition_ids) if (conditionById.has(id)) used.add(id);
  }
  const labels = new Map<number, DerivedLabels>();
  if (used.size === 0) return labels;

  const groups = groupsToMembership(doc.groups);
  const flags = new Map<number, { starter: boolean; extender: boolean }>();
  const flag = (cardId: number) => {
    let entry = flags.get(cardId);
    if (!entry) {
      entry = { starter: false, extender: false };
      flags.set(cardId, entry);
    }
    return entry;
  };

  for (const id of used) {
    const condition = conditionById.get(id)!;
    const positives: { cards: number[]; need: number }[] = [];
    for (const requirement of condition.requirements) {
      const need = needed(requirement.op, requirement.count);
      if (need === null) continue;
      if (requirement.kind === "card") positives.push({ cards: [requirement.card_id], need });
      else if (requirement.kind === "group") positives.push({ cards: [...(groups.get(requirement.group_id) ?? [])], need });
    }
    if (positives.length === 0) continue;
    const alone = positives.length === 1 && positives[0]!.need === 1;
    for (const positive of positives) {
      for (const cardId of positive.cards) {
        if (alone) flag(cardId).starter = true;
        else flag(cardId).extender = true;
      }
    }
  }

  for (const card of [...doc.main, ...doc.side, ...doc.extra]) {
    const entry = flags.get(card.card_id);
    labels.set(card.card_id, {
      starter: entry?.starter ?? false,
      extender: entry?.extender ?? false,
      brick: false,
    });
  }
  for (const card of doc.main) {
    const label = labels.get(card.card_id)!;
    const disrupts = card.taxonomy.roles.some((role) => role === "interaction" || role === "lasting" || role === "lasting_second");
    label.brick = !label.starter && !label.extender && !disrupts;
  }
  return labels;
}

/**
 * The document the workspaces analyse: the same cards, with Starter and Extender
 * taken from your Hand Conditions, Interaction kept as you tagged it, and
 * Undesirable filled in for bricks wherever you have not set Opening Quality.
 * Nothing is saved from this: it is only the view. Until a Hand Goal exists
 * there is nothing to derive from, and the tags saved in the file apply as before.
 */
export function withDerivedLabels(doc: MappingDocument): MappingDocument {
  const labels = deriveLabels(doc);
  if (labels.size === 0) return doc;
  const apply = (card: MappingCard): MappingCard => {
    const label = labels.get(card.card_id);
    if (!label) return card;
    const roles: Role[] = ROLES.filter(
      (role) =>
        ((role === "interaction" || role === "lasting" || role === "lasting_second") &&
          card.taxonomy.roles.includes(role)) ||
        (role === "starter" && label.starter) ||
        (role === "extender" && label.extender),
    );
    const quality = card.taxonomy.opening_quality;
    return {
      ...card,
      taxonomy: {
        ...card.taxonomy,
        roles,
        opening_quality: label.brick
          ? {
              going_first: quality.going_first ?? "undesirable",
              going_second: quality.going_second ?? "undesirable",
            }
          : quality,
      },
    };
  };
  return {
    ...doc,
    main: doc.main.map(apply),
    extra: doc.extra.map(apply),
    side: doc.side.map(apply),
  };
}
