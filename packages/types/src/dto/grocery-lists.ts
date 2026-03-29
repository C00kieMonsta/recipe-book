import { z } from "zod";

const groceryListItemSchema = z.object({
  ingredientId: z.string().min(1),
  name: z.string().min(1),
  totalQty: z.number().nonnegative(),
  unit: z.string().min(1),
  supplier: z.string().min(1),
  pricePerUnit: z.number().nonnegative(),
  priceUnit: z.string().min(1),
  checked: z.boolean().default(false),
  haveQty: z.number().nonnegative().optional(),
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
