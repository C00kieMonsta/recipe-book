import { z } from "zod";
import { moneyNonnegative, vatRate } from "./primitives";
import { eventExtraCostSchema, eventRevenueLineSchema, totalNeedsAmount } from "./events";

export const offerLineSchema = z
  .object({
    recipeId: z.string().min(1),
    portionsPerGuest: z.number().positive().max(50),
    course: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
export type OfferLineRequest = z.infer<typeof offerLineSchema>;

// The plain object; create and update derive from it so a refine never blocks .partial().
const offerFieldsSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    prestationType: z.string().min(1).optional(),
    vatRate: vatRate.optional(),
    guestCountRef: z.number().int().positive().max(2000).default(20),
    lines: z.array(offerLineSchema).max(60).default([]),
    extraCosts: z.array(eventExtraCostSchema).max(20).default([]),
    revenueLines: z.array(eventRevenueLineSchema).max(10).default([]),
    pricingMode: z.enum(["par_convive", "total"]).default("par_convive"),
    sellingPricePerGuest: moneyNonnegative.default(0),
    sellingTotal: moneyNonnegative.optional(),
    notes: z.string().trim().max(2000).optional(),
    archived: z.boolean().optional(),
  })
  .strict();

export const createOfferSchema = offerFieldsSchema.refine(totalNeedsAmount, "prix total requis");
export type CreateOfferRequest = z.infer<typeof createOfferSchema>;

// Nullable scalars are removed from the stored offer by the service.
export const updateOfferSchema = offerFieldsSchema
  .partial()
  .extend({
    prestationType: z.string().min(1).nullable().optional(),
    vatRate: vatRate.nullable().optional(),
    sellingTotal: moneyNonnegative.nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine(totalNeedsAmount, "prix total requis");
export type UpdateOfferRequest = z.infer<typeof updateOfferSchema>;
