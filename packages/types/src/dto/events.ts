import { z } from "zod";

const eventRecipeLineSchema = z.object({
  recipeId: z.string().min(1),
  portions: z.number().int().positive(),
});

const eventExtraCostSchema = z.object({
  label: z.string().min(1).trim(),
  amount: z.number().nonnegative(),
});

export const createEventRequestSchema = z.object({
  name: z.string().min(1).trim(),
  date: z.string().min(1),
  guestCount: z.number().int().positive(),
  recipes: z.array(eventRecipeLineSchema).default([]),
  extraCosts: z.array(eventExtraCostSchema).default([]),
  sellingPricePerGuest: z.number().nonnegative().default(0),
  notes: z.string().trim().optional(),
  status: z.enum(["upcoming", "completed"]).default("upcoming"),
});
export type CreateEventRequest = z.infer<typeof createEventRequestSchema>;

export const updateEventRequestSchema = createEventRequestSchema.partial();
export type UpdateEventRequest = z.infer<typeof updateEventRequestSchema>;
