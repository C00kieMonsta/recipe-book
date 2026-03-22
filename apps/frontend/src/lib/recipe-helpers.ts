import type { Recipe, RecipeIngredient, Ingredient } from "@packages/types";

export function calcIngredientLineCost(ri: RecipeIngredient, ing: Ingredient): number {
  let ppu = ing.price;
  if (ing.unit === "€/kg" || ing.unit === "€/l") ppu = ing.price / 1000;
  return ri.qty * (1 + (ri.lossPct || 0) / 100) * ppu;
}

export function calcRecipeCost(recipe: Recipe, ingredients: Ingredient[]): number {
  return recipe.ingredients.reduce((total, ri) => {
    const ing = ingredients.find((i) => i.ingredientId === ri.ingredientId);
    if (!ing) return total;
    return total + calcIngredientLineCost(ri, ing);
  }, 0);
}

export function fmt(n: number): string {
  return (n || 0).toFixed(2) + " €";
}

export const SUPPLIER_COLORS: Record<string, string> = {
  Barn: "#e07b4c",
  Vds: "#6b9e5e",
  Delhaize: "#5b8db8",
  Terroirist: "#c25d5d",
  Notenschop: "#d4a843",
  "Diamant rouge": "#c44058",
};

export function supplierColor(s: string): string {
  return SUPPLIER_COLORS[s] || "#999";
}
