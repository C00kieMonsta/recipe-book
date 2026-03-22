export const RECIPE_TYPES = [
  "Buffet",
  "Walking dinner",
  "Lunch",
  "Menu semaine",
] as const;

export type RecipeType = (typeof RECIPE_TYPES)[number];

export const UNITS_QTY = ["g", "pièce", "ml", "botte"] as const;
export type UnitQty = (typeof UNITS_QTY)[number];

export interface RecipeIngredient {
  ingredientId: string;
  qty: number;
  unit: UnitQty;
  lossPct: number;
}

export interface RecipePricing {
  surPlace: { coef: number; tva: number };
  takeAway: { coef: number; tva: number };
  chosenPrice: { surPlace: number; takeAway: number };
}

export interface RecipePhoto {
  key: string;
  label: string;
  url?: string;
}

export interface Recipe {
  recipeId: string;
  name: string;
  nameLower: string;
  type: string;
  portions: number;
  portionWeight: number;
  description?: string;
  techniques: string[];
  ingredients: RecipeIngredient[];
  photos: RecipePhoto[];
  pricing: RecipePricing;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeKey {
  recipeId: string;
}
