import type { AppEvent, EventExtraCost, ExtraCostKind } from "../entities/event";
import type { Ingredient } from "../entities/ingredient";
import type { Recipe, RecipeIngredient } from "../entities/recipe";

// Ingredients priced per kg or per litre are stored in g and ml, hence the per-1000 rule.
export function calcIngredientLineCost(ri: RecipeIngredient, ing: Ingredient): number {
  let ppu = ing.price;
  if (ing.unit === "€/kg" || ing.unit === "€/l") ppu = ing.price / 1000;
  return ri.qty * (1 + (ri.lossPct || 0) / 100) * ppu;
}

export function calcRecipeCost(recipe: Recipe, ingredientById: Map<string, Ingredient>): number {
  return recipe.ingredients.reduce((total, ri) => {
    const ing = ingredientById.get(ri.ingredientId);
    if (!ing) return total;
    return total + calcIngredientLineCost(ri, ing);
  }, 0);
}

export function scaleQtyNumber(qty: number, ratio: number): number {
  return qty * ratio;
}

// Whole numbers print as integers, everything else with one decimal.
export function scaleQty(qty: number, ratio: number): string {
  const scaled = scaleQtyNumber(qty, ratio);
  return scaled % 1 === 0 ? String(scaled) : scaled.toFixed(1);
}

export type EventExtras = Record<ExtraCostKind, number>;

export interface EventCostBreakdown {
  rawMaterial: number;
  extras: EventExtras;
  total: number;
}

export function sumExtraCosts(extraCosts: EventExtraCost[] | undefined): number {
  return (extraCosts ?? []).reduce((sum, c) => sum + (c.amount || 0), 0);
}

export function extrasByKind(extraCosts: EventExtraCost[] | undefined): EventExtras {
  const extras: EventExtras = { matiere: 0, personnel: 0, location: 0, transport: 0, autre: 0 };
  for (const c of extraCosts ?? []) {
    const kind: ExtraCostKind = c.kind && isKnownKind(extras, c.kind) ? c.kind : "autre";
    extras[kind] += c.amount || 0;
  }
  return extras;
}

function isKnownKind(extras: EventExtras, kind: string): kind is ExtraCostKind {
  return Object.prototype.hasOwnProperty.call(extras, kind);
}

export function calcLinesRawMaterial(
  ev: Pick<AppEvent, "recipes">,
  recipeCostById: Map<string, number>,
  recipePortionsById: Map<string, number>,
): number {
  return (ev.recipes ?? []).reduce((sum, line) => {
    const totalCost = recipeCostById.get(line.recipeId) || 0;
    const portions = recipePortionsById.get(line.recipeId) || 1;
    return sum + (totalCost / portions) * line.portions;
  }, 0);
}

// Raw material is the actual cost when typed, else the snapshot, else the live recipe costs.
export function rawMaterialOf(
  ev: Pick<AppEvent, "recipes" | "actualCost" | "costSnapshot">,
  recipeCostById: Map<string, number>,
  recipePortionsById: Map<string, number>,
): number {
  return ev.actualCost ?? ev.costSnapshot?.rawMaterial ?? calcLinesRawMaterial(ev, recipeCostById, recipePortionsById);
}

export function calcEventCost(
  ev: Pick<AppEvent, "recipes" | "actualCost" | "costSnapshot" | "extraCosts">,
  recipeCostById: Map<string, number>,
  recipePortionsById: Map<string, number>,
): EventCostBreakdown {
  const rawMaterial = rawMaterialOf(ev, recipeCostById, recipePortionsById);
  const extras = extrasByKind(ev.extraCosts);
  const total = rawMaterial + sumExtraCosts(ev.extraCosts);
  return { rawMaterial, extras, total };
}
