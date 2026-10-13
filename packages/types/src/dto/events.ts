import { z } from "zod";
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

export const createEventRequestSchema = z.object({
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
});
export type CreateEventRequest = z.infer<typeof createEventRequestSchema>;

// tasks is optional here and undefined means "not sent".
export const updateEventRequestSchema = createEventRequestSchema.partial();
export type UpdateEventRequest = z.infer<typeof updateEventRequestSchema>;

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
