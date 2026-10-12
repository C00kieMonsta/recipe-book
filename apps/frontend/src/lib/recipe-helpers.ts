import type { Ingredient, Recipe } from "@packages/types";
import { calcRecipeCost as calcRecipeCostByMap } from "@packages/types";

export { calcIngredientLineCost, calcEventCost, scaleQty } from "@packages/types";

// Accepts the array the existing pages pass as well as the Map the shared helper expects.
export function calcRecipeCost(recipe: Recipe, ingredients: Ingredient[] | Map<string, Ingredient>): number {
  const byId = Array.isArray(ingredients) ? new Map(ingredients.map((i) => [i.ingredientId, i])) : ingredients;
  return calcRecipeCostByMap(recipe, byId);
}

export function fmt(n: number): string {
  return (n || 0).toFixed(2) + " €";
}

// Eight tints that keep dark text readable; the dot and border uses take the string as is.
export const SUPPLIER_PALETTE = [
  "hsl(18 70% 48%)",
  "hsl(105 35% 40%)",
  "hsl(210 45% 48%)",
  "hsl(0 50% 50%)",
  "hsl(42 70% 42%)",
  "hsl(340 55% 48%)",
  "hsl(265 40% 52%)",
  "hsl(175 45% 36%)",
] as const;

// FNV-1a with a seed chosen so the six default suppliers land on six different colours.
function hashName(name: string): number {
  let h = 2;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0;
  return h;
}

export function supplierColor(name: string): string {
  if (!name) return "hsl(20 10% 60%)";
  return SUPPLIER_PALETTE[hashName(name.trim().toLowerCase()) % SUPPLIER_PALETTE.length];
}
