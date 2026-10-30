import type { AppEvent, GroceryListItem, Ingredient, Recipe } from "@packages/types";
import { addDays, datesOfIsoWeek, isoWeekOf, longDayLabel, rangeLabel } from "@packages/types";

export type GroceryRange = { from: string; to: string };
export type GroceryDraftItem = Omit<GroceryListItem, "checked">;

// Common chilled, produce, meat, fish and dairy terms. This is a starting point only.
// The list keeps a per-item selector so uncommon products can be corrected and saved.
export function defaultGroceryStorage(name: string): "fresh" | "dry" | "unclassified" {
  const value = foldAccents(name);
  if (/\b(lait|creme|cream|beurre|fromage|chevre|yaourt|yogourt|oeuf|oeufs|viande|boeuf|veau|porc|poulet|volaille|canard|agneau|poisson|saumon|thon frais|crevette|moule|coquille|legume|fruit|salade|tomate|courgette|aubergine|poivron|concombre|carotte|oignon|echalote|ail|pomme de terre|herbe|persil|coriandre|basilic|menthe|champignon|fraise|framboise|pomme|poire|citron|orange|avocat|epinard|chou|poireau|celeri|radis|endive|asperge|fenouil)\b/.test(value)) return "fresh";
  if (/\b(farine|sucre|sel|poivre|huile|vinaigre|riz|pate|pates|semoule|lentille|pois chiche|haricot sec|conserve|chocolat|cafe|the|amande|noisette|noix|levure|biscuit|chapelure|miel|sirop|vanille|epice|epices|cacao|poudre|bouillon|farine|fecule|mais|semoule)\b/.test(value)) return "dry";
  return "unclassified";
}

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

export const UPCOMING_DAYS = 120;

// The window of the « À venir » preset: today to today + 120 days.
export function upcomingRange(today: string): GroceryRange {
  return { from: today, to: addDays(today, UPCOMING_DAYS) };
}

export function sortEventsByDateThenName(events: AppEvent[]): AppEvent[] {
  return [...events].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "fr"));
}

export function foldAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// True when the query, accents folded, appears in the event name or the client name.
export function eventMatchesSearch(ev: AppEvent, clientName: string | undefined, query: string): boolean {
  const q = foldAccents(query);
  if (!q) return true;
  return foldAccents(ev.name).includes(q) || (clientName !== undefined && foldAccents(clientName).includes(q));
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
            storage: defaultGroceryStorage(ing.name),
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
