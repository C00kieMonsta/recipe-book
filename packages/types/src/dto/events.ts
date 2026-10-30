import { z } from "zod";
import { REVENUE_LINE_KINDS } from "../entities/event";
import { isoDate, moneyNonnegative, personIds, vatRate } from "./primitives";

export const eventRecipeLineSchema = z
  .object({
    lineId: z.string().min(1).optional(),
    recipeId: z.string().min(1),
    portions: z.number().int().positive(),
    course: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(500).optional(),
    prepStatus: z.enum(["todo", "doing", "done"]).optional(),
    prepDate: isoDate.optional(),
    assignedTo: personIds.optional(),
  })
  .strict();

export const eventTaskSchema = z
  .object({
    taskId: z.string().min(1).optional(),
    label: z.string().trim().min(1).max(120),
    date: isoDate,
    prepStatus: z.enum(["todo", "doing", "done"]).optional(),
    notes: z.string().trim().max(500).optional(),
    assignedTo: personIds.optional(),
    recipeLineId: z.string().min(1).optional(),
    recipeId: z.string().min(1).optional(),
    preparationId: z.string().min(1).optional(),
  })
  .strict();
export type EventTaskRequest = z.infer<typeof eventTaskSchema>;

export const eventExtraCostSchema = z
  .object({
    label: z.string().min(1).trim(),
    amount: z.number().nonnegative(),
    kind: z.enum(["matiere", "personnel", "location", "transport", "autre"]).optional(),
  })
  .strict();

// takenAt is stamped by the server.
export const costSnapshotSchema = z
  .object({
    rawMaterial: moneyNonnegative,
    // Ignored on write, the server stamps the snapshot itself.
    takenAt: z.string().optional(),
    extrasTotal: moneyNonnegative,
    lines: z.array(
      z
        .object({
          lineId: z.string().min(1),
          recipeId: z.string().min(1),
          portions: z.number().int().positive(),
          unitCost: z.number().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();
export type CostSnapshotRequest = z.infer<typeof costSnapshotSchema>;

export const eventRevenueLineSchema = z
  .object({ label: z.string().trim().min(1).max(60), amount: moneyNonnegative, vatRate, kind: z.enum(REVENUE_LINE_KINDS).optional() })
  .strict();
export type EventRevenueLineRequest = z.infer<typeof eventRevenueLineSchema>;

export const eventStaffEntrySchema = z
  .object({
    personId: z.string().min(1).max(40),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    endTime: z.string().regex(/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/).optional(),
    hours: z.number().nonnegative().max(200).optional(),
    km: z.number().nonnegative().max(5000).optional(),
    kmAmount: moneyNonnegative.optional(),
    actualAmount: moneyNonnegative.optional(),
    hourlyRate: moneyNonnegative.optional(),
    kmRate: z.number().nonnegative().max(10).optional(),
  })
  .strict();
export type EventStaffEntryRequest = z.infer<typeof eventStaffEntrySchema>;
// Refined on the array, not on the object, so .partial() on the fields schema keeps working.
export const eventStaffSchema = z
  .array(eventStaffEntrySchema)
  .max(30)
  .refine((v) => new Set(v.map((s) => s.personId)).size === v.length, "personId dupliqué");

const deliveryTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "heure HH:MM");

// The plain object; create and update derive from it so a refine never blocks .partial().
const eventFieldsSchema = z.object({
  name: z.string().min(1).trim(),
  date: isoDate,
  guestCount: z.number().int().positive(),
  recipes: z.array(eventRecipeLineSchema).default([]),
  tasks: z.array(eventTaskSchema).default([]),
  extraCosts: z.array(eventExtraCostSchema).default([]),
  sellingPricePerGuest: z.number().nonnegative().default(0),
  notes: z.string().trim().optional(),
  contactName: z.string().trim().optional(),
  contactPhone: z.string().trim().optional(),
  contactEmail: z.string().trim().optional(),
  actualCost: z.number().nonnegative().nullish(),
  status: z.enum(["upcoming", "completed"]).default("upcoming"),
  clientId: z.string().min(1).nullish(),
  templateId: z.string().min(1).nullish(),
  prestationType: z.string().min(1).nullish(),
  vatRate: vatRate.nullish(),
  hoursSpent: z.number().nonnegative().optional(),
  costSnapshot: costSnapshotSchema.optional(),
  assignedTo: personIds.optional(),
  serviceTeam: personIds.optional(),
  staff: eventStaffSchema.optional(),
  pricingMode: z.enum(["par_convive", "total"]).optional(),
  sellingTotal: moneyNonnegative.optional(),
  revenueLines: z.array(eventRevenueLineSchema).max(10).default([]),
  deliveryAddress: z.string().trim().max(200).optional(),
  deliveryTime: deliveryTime.optional(),
  billingDetails: z.string().trim().max(500).optional(),
  offerId: z.string().min(1).nullish(),
});

// Shared with the offer schemas: total mode needs the amount it is priced at.
export const totalNeedsAmount = (v: { pricingMode?: string; sellingTotal?: number | null }) =>
  v.pricingMode !== "total" || typeof v.sellingTotal === "number";

export const createEventRequestSchema = eventFieldsSchema.refine(totalNeedsAmount, "prix total requis");
export type CreateEventRequest = z.infer<typeof createEventRequestSchema>;

// Scalars the editor can clear accept null, stored as a REMOVE; tasks and revenueLines stay undefined when not sent.
export const updateEventRequestSchema = eventFieldsSchema
  .partial()
  .extend({
    recipes: eventFieldsSchema.shape.recipes.removeDefault().optional(),
    tasks: eventFieldsSchema.shape.tasks.removeDefault().optional(),
    extraCosts: eventFieldsSchema.shape.extraCosts.removeDefault().optional(),
    sellingPricePerGuest: eventFieldsSchema.shape.sellingPricePerGuest.removeDefault().optional(),
    status: eventFieldsSchema.shape.status.removeDefault().optional(),
    contactName: z.string().trim().nullable().optional(),
    contactPhone: z.string().trim().nullable().optional(),
    contactEmail: z.string().trim().nullable().optional(),
    deliveryAddress: z.string().trim().max(200).nullable().optional(),
    deliveryTime: z.union([deliveryTime, z.literal("")]).nullable().optional(),
    billingDetails: z.string().trim().max(500).nullable().optional(),
    sellingTotal: moneyNonnegative.nullable().optional(),
    revenueLines: z.array(eventRevenueLineSchema).max(10).optional(),
    // The invoiced marker is set and cleared on an existing event only; null is a REMOVE.
    invoicedAt: isoDate.nullable().optional(),
    invoiceRef: z.string().trim().max(40).nullable().optional(),
  })
  .refine(totalNeedsAmount, "prix total requis");
export type UpdateEventRequest = z.infer<typeof updateEventRequestSchema>;

export const renameAttachmentSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();
export type RenameAttachmentRequest = z.infer<typeof renameAttachmentSchema>;

export const putEventLinesSchema = z
  .object({
    lines: z
      .array(
        z.object({ lineId: z.string().min(1), course: z.string().trim().max(40).optional() }).strict(),
      )
      .min(1),
  })
  .strict()
  .refine((v) => new Set(v.lines.map((l) => l.lineId)).size === v.lines.length, "lineId dupliqué");
export type PutEventLinesRequest = z.infer<typeof putEventLinesSchema>;

export const addEventLineSchema = eventRecipeLineSchema.omit({ lineId: true }).strict();
export type AddEventLineRequest = z.infer<typeof addEventLineSchema>;

// prepDate accepts null so a client can clear it ("le jour même").
export const patchEventLineSchema = eventRecipeLineSchema
  .omit({ lineId: true, recipeId: true })
  .extend({ prepDate: isoDate.nullable().optional() })
  .partial()
  .strict();
export type PatchEventLineRequest = z.infer<typeof patchEventLineSchema>;

export const addEventTaskSchema = eventTaskSchema.omit({ taskId: true }).strict();
export type AddEventTaskRequest = z.infer<typeof addEventTaskSchema>;

export const patchEventTaskSchema = eventTaskSchema.omit({ taskId: true }).partial().strict();
export type PatchEventTaskRequest = z.infer<typeof patchEventTaskSchema>;
