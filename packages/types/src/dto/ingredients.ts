import { z } from "zod";
import { UNITS_PRICE, SUPPLIERS } from "../entities/ingredient";

export const createIngredientRequestSchema = z.object({
  name: z.string().min(1).trim(),
  price: z.number().nonnegative(),
  unit: z.enum(UNITS_PRICE),
  supplier: z.string().trim().default(""),
  comment: z.string().trim().optional(),
});
export type CreateIngredientRequest = z.infer<typeof createIngredientRequestSchema>;

export const updateIngredientRequestSchema = createIngredientRequestSchema.partial();
export type UpdateIngredientRequest = z.infer<typeof updateIngredientRequestSchema>;

export const listIngredientsQuerySchema = z.object({
  q: z.string().optional(),
  supplier: z.string().optional(),
  sortBy: z.enum(["name", "price", "supplier"]).default("name"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type ListIngredientsQuery = z.infer<typeof listIngredientsQuerySchema>;

export const importIngredientRowSchema = z.object({
  nom: z.string().min(1).trim(),
  prix_htva: z.number().nonnegative(),
  unite: z.enum(UNITS_PRICE).default("€/kg"),
  fournisseur: z.string().trim().default(""),
  commentaire: z.string().trim().optional(),
});
export type ImportIngredientRow = z.infer<typeof importIngredientRowSchema>;
