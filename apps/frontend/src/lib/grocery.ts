import type { AppEvent, GroceryListItem, Ingredient, Recipe } from "@packages/types";
import { datesOfIsoWeek, isoWeekOf, longDayLabel, rangeLabel } from "@packages/types";

export type GroceryRange = { from: string; to: string };
export type GroceryDraftItem = Omit<GroceryListItem, "checked">;

export interface BuildGroceryOptions {
  from?: string;
  to?: string;
}

function inRange(date: string, opts?: BuildGroceryOptions): boolean {
  const d = date.slice(0, 10);
  if (opts?.from && d < opts.from) return false;
  if (opts?.to && d > opts.to) return false;
  return true;
}

export function selectEventsInRange(events: AppEvent[], opts?: BuildGroceryOptions): AppEvent[] {
  return events.filter((ev) => inRange(ev.date, opts));
}

// Aggregates scaled recipe quantities per ingredient and unit, sorted by supplier then name.
export function buildGroceryItems(
  events: AppEvent[],
  recipeById: Map<string, Recipe>,
  ingredientById: Map<string, Ingredient>,
  opts?: BuildGroceryOptions,
): GroceryDraftItem[] {
  const agg = new Map<string, GroceryDraftItem>();

  for (const ev of selectEventsInRange(events, opts)) {
    for (const rl of ev.recipes ?? []) {
      const recipe = recipeById.get(rl.recipeId);
      if (!recipe) continue;
      const scale = rl.portions / (recipe.portions || 1);
      for (const ri of recipe.ingredients) {
        const ing = ingredientById.get(ri.ingredientId);
        if (!ing) continue;
        const key = `${ri.ingredientId}:${ri.unit}`;
        const scaledQty = ri.qty * scale;
        const existing = agg.get(key);
        if (existing) {
          existing.totalQty += scaledQty;
        } else {
          agg.set(key, {
            ingredientId: ri.ingredientId,
            name: ing.name,
            totalQty: scaledQty,
            unit: ri.unit,
            supplier: ing.supplier,
            pricePerUnit: ing.price,
            priceUnit: ing.unit,
          });
        }
      }
    }
  }

  return Array.from(agg.values()).sort(
    (a, b) => a.supplier.localeCompare(b.supplier) || a.name.localeCompare(b.name),
  );
}

function isRange(x: GroceryRange | AppEvent[]): x is GroceryRange {
  return !Array.isArray(x);
}

// "Courses · semaine 42" for a full ISO week, "Courses · mardi 13 octobre" for one day, else the dates or event names.
export function groceryTitleFor(source: GroceryRange | AppEvent[]): string {
  if (isRange(source)) {
    const { from, to } = source;
    if (from === to) return `Courses · ${longDayLabel(from)}`;
    const week = isoWeekOf(from);
    const days = datesOfIsoWeek(week);
    if (from === days[0] && to === days[6]) return `Courses · semaine ${Number(week.slice(-2))}`;
    return `Courses · ${rangeLabel(from, to)}`;
  }
  if (source.length === 1) return `Courses · ${source[0].name}`;
  return `Courses · ${source.length} événements`;
}
