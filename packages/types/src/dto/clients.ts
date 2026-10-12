import { z } from "zod";
import { isoDate, moneyNonnegative, vatRate } from "./primitives";
import { eventExtraCostSchema, eventRecipeLineSchema } from "./events";

export const templateLineSchema = eventRecipeLineSchema
  .omit({ lineId: true, prepStatus: true, prepDate: true })
  .strict();
export type TemplateLineRequest = z.infer<typeof templateLineSchema>;

export const clientTemplateSchema = z
  .object({
    templateId: z.string().min(1).optional(),
    name: z.string().min(1).trim(),
    weekday: z.number().int().min(1).max(7),
    guestCount: z.number().int().positive(),
    sellingPricePerGuest: moneyNonnegative,
    prestationType: z.string().optional(),
    vatRate: vatRate.optional(),
    recipes: z.array(templateLineSchema).default([]),
    extraCosts: z.array(eventExtraCostSchema).default([]),
    notes: z.string().optional(),
  })
  .strict();
export type ClientTemplateRequest = z.infer<typeof clientTemplateSchema>;

export const createClientSchema = z
  .object({
    name: z.string().min(1).trim(),
    kind: z.enum(["entreprise", "particulier"]).optional(),
    contactName: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    email: z.string().trim().optional(),
    address: z.string().trim().optional(),
    vatNumber: z.string().trim().optional(),
    defaultPrestationType: z.string().optional(),
    defaultVatRate: vatRate.optional(),
    defaultPricePerGuest: moneyNonnegative.optional(),
    defaultGuestCount: z.number().int().positive().optional(),
    invoicing: z.enum(["par_evenement", "mensuelle"]).optional(),
    templates: z.array(clientTemplateSchema).default([]),
    notes: z.string().optional(),
    active: z.boolean().default(true),
  })
  .strict();
export type CreateClientRequest = z.infer<typeof createClientSchema>;

// Scalar fields accept null on update so the client can be cleared (stored as a REMOVE).
export const updateClientSchema = createClientSchema
  .partial()
  .extend({
    kind: createClientSchema.shape.kind.nullable(),
    contactName: createClientSchema.shape.contactName.nullable(),
    phone: createClientSchema.shape.phone.nullable(),
    email: createClientSchema.shape.email.nullable(),
    address: createClientSchema.shape.address.nullable(),
    vatNumber: createClientSchema.shape.vatNumber.nullable(),
    defaultPrestationType: createClientSchema.shape.defaultPrestationType.nullable(),
    defaultVatRate: createClientSchema.shape.defaultVatRate.nullable(),
    defaultPricePerGuest: createClientSchema.shape.defaultPricePerGuest.nullable(),
    defaultGuestCount: createClientSchema.shape.defaultGuestCount.nullable(),
    invoicing: createClientSchema.shape.invoicing.nullable(),
    notes: createClientSchema.shape.notes.nullable(),
  })
  .strict();
export type UpdateClientRequest = z.infer<typeof updateClientSchema>;

export const instantiateSchema = z
  .object({ dates: z.array(isoDate).min(1).max(31), guestCount: z.number().int().positive().optional() })
  .strict();
export type InstantiateRequest = z.infer<typeof instantiateSchema>;

export const linkEventsSchema = z
  .object({ contactEmail: z.string().trim().optional(), contactName: z.string().trim().optional() })
  .strict();
export type LinkEventsRequest = z.infer<typeof linkEventsSchema>;
