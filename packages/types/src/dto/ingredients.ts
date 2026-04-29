import { z } from "zod";
import { UNITS_PRICE } from "../entities/ingredient";

const priceUnitSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (["kg", "kilo", "kilogramme", "kilogram"].includes(normalized)) return "€/kg";
  if (["piece", "pièce", "piéce", "pcs", "pc"].includes(normalized)) return "€/pièce";
  if (["l", "litre", "liter"].includes(normalized)) return "€/l";
  if (normalized === "botte") return "€/botte";
  if (["€/piece", "€/pieces", "€/pièce", "€/pièces", "€/piéce", "€/piéces", "€/pcs", "€/pc"].includes(normalized)) return "€/pièce";
  if (["€/litre", "€/liter"].includes(normalized)) return "€/l";
  return value.trim();
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

export const importIngredientRowSchema = z.object({
  nom: z.string().min(1).trim(),
  prix_htva: z.number().nonnegative(),
  unite: z.enum(UNITS_PRICE).default("€/kg"),
  fournisseur: z.string().trim().default(""),
  commentaire: z.string().trim().optional(),
});
export type ImportIngredientRow = z.infer<typeof importIngredientRowSchema>;
