import { z } from "zod";

const groceryListItemSchema = z.object({
  ingredientId: z.string().min(1),
  name: z.string().min(1),
  totalQty: z.number().nonnegative(),
  unit: z.string().min(1),
  supplier: z.preprocess((v) => (v == null || v === "" ? "Autre" : v), z.string()),
  pricePerUnit: z.preprocess((v) => (v == null ? 0 : v), z.number().nonnegative()),
  priceUnit: z.preprocess((v) => (v == null || v === "" ? "€/kg" : v), z.string()),
  checked: z.boolean().default(false),
  haveQty: z.preprocess((v) => (v === null ? undefined : v), z.number().nonnegative().optional()),
});

export const createGroceryListSchema = z.object({
  title: z.string().min(1).trim(),
  items: z.array(groceryListItemSchema).default([]),
});
export type CreateGroceryListRequest = z.infer<typeof createGroceryListSchema>;

export const updateGroceryListSchema = z.object({
  title: z.string().min(1).trim().optional(),
  items: z.array(groceryListItemSchema).optional(),
});
export type UpdateGroceryListRequest = z.infer<typeof updateGroceryListSchema>;
