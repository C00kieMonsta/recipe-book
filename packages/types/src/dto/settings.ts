import { z } from "zod";

export const updateSettingsRequestSchema = z.object({
  recipeCategories: z.array(z.string().min(1).trim()).min(1),
});
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;
