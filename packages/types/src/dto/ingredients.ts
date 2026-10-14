import { z } from "zod";
import { UNITS_PRICE, normalizePriceUnit } from "../entities/ingredient";

const KNOWN_UNIT_SPELLINGS = new Set(["kg", "kilo", "kilogramme", "kilogram", "€/kilo", "€/kilogramme", "piece", "pièce", "piéce", "pcs", "pc", "€/piece", "€/pieces", "€/pièce", "€/pièces", "€/piéce", "€/piéces", "€/pcs", "€/pc", "l", "litre", "liter", "€/litre", "€/liter", "botte"]);
const priceUnitSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return KNOWN_UNIT_SPELLINGS.has(trimmed.toLowerCase()) ? normalizePriceUnit(trimmed) : trimmed;
}, z.enum(UNITS_PRICE));

const priceSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") return 0;
  return typeof value === "string" ? Number(value.replace(",", ".")) : value;
}, z.number().nonnegative());

export const createIngredientRequestSchema = z.object({
  name: z.string().min(1).trim(),
  price: priceSchema,
  unit: priceUnitSchema,
  supplier: z.preprocess((v) => (v === null || v === undefined ? "" : v), z.string()).transform((s) => s.trim()),
  comment: z.preprocess((v) => (v === null ? undefined : v), z.string().trim().optional()),
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

// Import rows come from a CSV, so the unit goes through the same aliases as the form.
export const importIngredientRowSchema = z.object({
  nom: z.string().min(1).trim(),
  prix_htva: priceSchema,
  unite: priceUnitSchema.default("€/kg"),
  fournisseur: z.string().trim().default(""),
  commentaire: z.string().trim().optional(),
});
export type ImportIngredientRow = z.infer<typeof importIngredientRowSchema>;

export const mergeIngredientsSchema = z
  .object({ survivorId: z.string().min(1), mergedIds: z.array(z.string().min(1)).min(1) })
  .strict()
  .refine((v) => !v.mergedIds.includes(v.survivorId), "survivor cannot be merged");
export type MergeIngredientsRequest = z.infer<typeof mergeIngredientsSchema>;
