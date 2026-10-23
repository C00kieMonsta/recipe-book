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
  category: z.string().trim().min(1).max(40).optional(),
  // Keeps its default so old importers pass; the service mirrors category into it.
  type: z.string().default("Buffet"),
  portions: z.number().int().positive().default(1),
  portionWeight: z.number().nonnegative().default(150),
  defaultCourse: z.string().trim().optional(),
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

// Zod 4 applies defaults inside optional fields. PATCH must keep omitted fields absent.
export const updateRecipeRequestSchema = createRecipeRequestSchema.partial().extend({
  type: createRecipeRequestSchema.shape.type.removeDefault().optional(),
  portions: createRecipeRequestSchema.shape.portions.removeDefault().optional(),
  portionWeight: createRecipeRequestSchema.shape.portionWeight.removeDefault().optional(),
  techniques: createRecipeRequestSchema.shape.techniques.removeDefault().optional(),
  ingredients: createRecipeRequestSchema.shape.ingredients.removeDefault().optional(),
  photos: createRecipeRequestSchema.shape.photos.removeDefault().optional(),
  pricing: createRecipeRequestSchema.shape.pricing.removeDefault().optional(),
});
export type UpdateRecipeRequest = z.infer<typeof updateRecipeRequestSchema>;

export const importRecipeIngredientSchema = z
  .object({
    name: z.string().min(1),
    qty: z.number().nonnegative(),
    unit: z.enum(UNITS_QTY).optional(),
  })
  .strip();
export type ImportRecipeIngredient = z.infer<typeof importRecipeIngredientSchema>;

export const listRecipesQuerySchema = z.object({
  q: z.string().optional(),
  type: z.string().optional(),
  category: z.string().optional(),
});
export type ListRecipesQuery = z.infer<typeof listRecipesQuerySchema>;
