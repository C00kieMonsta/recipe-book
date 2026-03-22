import { z } from "zod";
import { UNITS_QTY } from "../entities/recipe";

const recipeIngredientSchema = z.object({
  ingredientId: z.string().min(1),
  qty: z.number().nonnegative(),
  unit: z.enum(UNITS_QTY),
  lossPct: z.number().min(0).max(100).default(0),
});

const recipePricingSchema = z.object({
  surPlace: z.object({ coef: z.number().positive(), tva: z.number().nonnegative() }),
  takeAway: z.object({ coef: z.number().positive(), tva: z.number().nonnegative() }),
  chosenPrice: z.object({ surPlace: z.number().nonnegative(), takeAway: z.number().nonnegative() }),
});

const recipePhotoSchema = z.object({
  key: z.string().min(1),
  label: z.string().default(""),
  url: z.string().optional(),
});

export const createRecipeRequestSchema = z.object({
  name: z.string().min(1).trim(),
  type: z.string().default("Buffet"),
  portions: z.number().int().positive().default(1),
  portionWeight: z.number().positive().default(150),
  description: z.string().trim().optional(),
  techniques: z.array(z.string()).default([]),
  ingredients: z.array(recipeIngredientSchema).default([]),
  photos: z.array(recipePhotoSchema).default([]),
  pricing: recipePricingSchema.default({
    surPlace: { coef: 4, tva: 12 },
    takeAway: { coef: 3, tva: 6 },
    chosenPrice: { surPlace: 0, takeAway: 0 },
  }),
});
export type CreateRecipeRequest = z.infer<typeof createRecipeRequestSchema>;

export const updateRecipeRequestSchema = createRecipeRequestSchema.partial();
export type UpdateRecipeRequest = z.infer<typeof updateRecipeRequestSchema>;

export const listRecipesQuerySchema = z.object({
  q: z.string().optional(),
  type: z.string().optional(),
});
export type ListRecipesQuery = z.infer<typeof listRecipesQuerySchema>;
