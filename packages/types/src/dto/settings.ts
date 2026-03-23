import { z } from "zod";

const settingsSupplierSchema = z.object({
  name: z.string().min(1).trim(),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

export const updateSettingsRequestSchema = z.object({
  recipeCategories: z.array(z.string().min(1).trim()).min(1).optional(),
  suppliers: z.array(settingsSupplierSchema).optional(),
});
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;
