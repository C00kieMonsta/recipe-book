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

/** A separately schedulable component of a recipe, such as dough or mousse. */
export interface RecipePreparation {
  preparationId: string;
  name: string;
  daysBefore: number;
  description?: string;
}

export interface Recipe {
  recipeId: string;
  name: string;
  nameLower: string;
  // The one category; filled by RecipesService on every read, stored from the first write after spec 07.
  category?: string;
  // Legacy « Format », mirrored to category on write so old CSV exports and scripts keep a value.
  type: string;
  portions: number;
  portionWeight: number;
  // Legacy; read by recipeCategoryOf when category is absent, never written again.
  defaultCourse?: string;
  description?: string;
  techniques: string[];
  preparations?: RecipePreparation[];
  ingredients: RecipeIngredient[];
  photos: RecipePhoto[];
  pricing: RecipePricing;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeKey {
  recipeId: string;
}
