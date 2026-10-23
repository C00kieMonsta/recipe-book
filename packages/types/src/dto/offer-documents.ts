import { z } from "zod";
import { moneyNonnegative, vatRate } from "./primitives";
import { DEFAULT_DOC_CONDITIONS, DEFAULT_DOC_SERVICES, DEFAULT_DOC_VAT_LINES } from "../entities/offer-document";

// Client-generated: crypto.randomUUID().slice(0, 8); the server checks uniqueness inside the document.
const docId = z.string().regex(/^[a-z0-9-]{1,40}$/);
const unitKind = z.enum(["convive", "piece", "unite"]);
const docSeason = z.enum(["printemps_ete", "automne_hiver", "toute_annee"]);

export const docChoiceSchema = z
  .object({
    count: z.number().int().min(1).max(20),
    scope: z.enum(["table", "convive"]),
    label: z.string().trim().max(80).optional(),
  })
  .strict();
export type DocChoiceRequest = z.infer<typeof docChoiceSchema>;

export const docRowSchema = z
  .object({
    rowId: docId,
    kind: z.enum(["plat", "exemple", "sous_titre", "note"]),
    text: z.string().trim().min(1).max(300),
    price: moneyNonnegative.optional(),
    fromPrice: z.boolean().optional(),
    priceNote: z.string().trim().max(80).optional(),
    unitLabel: z.string().trim().max(60).optional(),
    unitKind: unitKind.optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(4).optional(),
    choice: docChoiceSchema.optional(),
    recipeId: z.string().min(1).optional(),
  })
  .strict()
  .refine((r) => r.kind === "sous_titre" || r.choice === undefined, "choix réservé aux sous-titres");
export type DocRowRequest = z.infer<typeof docRowSchema>;

export const docMinimumSchema = z
  .object({
    qty: z.number().positive().max(10000),
    unit: z.enum(["personnes", "pieces", "unites"]),
    perSort: z.boolean().optional(),
    label: z.string().trim().max(80).optional(),
  })
  .strict();
export type DocMinimumRequest = z.infer<typeof docMinimumSchema>;

export const docSectionSchema = z
  .object({
    sectionId: docId,
    title: z.string().trim().min(1).max(120),
    intro: z.string().trim().max(300).optional(),
    price: moneyNonnegative.optional(),
    unitLabel: z.string().trim().max(60).optional(),
    unitKind: unitKind.optional(),
    minimum: docMinimumSchema.optional(),
    rows: z.array(docRowSchema).max(120),
    offerId: z.string().min(1).optional(),
  })
  .strict()
  // A priced row multiplies by its own kind or the section's.
  .refine(
    (s) => s.rows.every((r) => r.price === undefined || r.unitKind !== undefined || s.unitKind !== undefined),
    "unité requise avec un prix",
  );
export type DocSectionRequest = z.infer<typeof docSectionSchema>;

export const docServicesSchema = z
  .object({
    shown: z.boolean(),
    title: z.string().trim().min(1).max(60),
    intro: z.string().trim().max(300).optional(),
    rows: z.array(docRowSchema).max(12),
  })
  .strict();
export type DocServicesRequest = z.infer<typeof docServicesSchema>;

export const docVatLineSchema = z.object({ label: z.string().trim().min(1).max(60), rate: vatRate }).strict();
export type DocVatLineRequest = z.infer<typeof docVatLineSchema>;

export const MAX_DOC_ROWS = 300;

// The plain object; create and update derive from it so a refine never blocks .partial().
const documentFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    year: z.number().int().min(2020).max(2100),
    season: docSeason.optional(),
    prestationType: z.string().min(1).optional(),
    prestationLabel: z.string().trim().max(120).default("À emporter"),
    minGuests: z.number().int().positive().max(5000).optional(),
    maxGuests: z.number().int().positive().max(5000).optional(),
    guestsLabel: z.string().trim().max(120).optional(),
    note: z.string().trim().max(500).optional(),
    sections: z.array(docSectionSchema).max(40).default([]),
    services: docServicesSchema.default(DEFAULT_DOC_SERVICES),
    conditions: z.string().trim().max(2000).default(DEFAULT_DOC_CONDITIONS),
    vatLines: z.array(docVatLineSchema).max(12).default(DEFAULT_DOC_VAT_LINES),
    archived: z.boolean().optional(),
  })
  .strict();

type IdsAndSizeInput = {
  sections?: { sectionId: string; rows: { rowId: string }[] }[];
  services?: { rows: { rowId: string }[] };
};

// Section ids unique, row ids unique across the document and the services, at most 300 rows in the sections.
const idsAndSize = (d: IdsAndSizeInput) => {
  const sections = d.sections ?? [];
  const sectionIds = new Set<string>();
  const rowIds = new Set<string>();
  let rowCount = 0;
  for (const s of sections) {
    if (sectionIds.has(s.sectionId)) return false;
    sectionIds.add(s.sectionId);
    for (const r of s.rows) {
      if (rowIds.has(r.rowId)) return false;
      rowIds.add(r.rowId);
      rowCount += 1;
    }
  }
  if (rowCount > MAX_DOC_ROWS) return false;
  for (const r of d.services?.rows ?? []) {
    if (rowIds.has(r.rowId)) return false;
    rowIds.add(r.rowId);
  }
  return true;
};
const IDS_AND_SIZE_MESSAGE = "identifiants en double ou plus de 300 lignes";

export const createOfferDocumentSchema = documentFieldsSchema.refine(idsAndSize, IDS_AND_SIZE_MESSAGE);
export type CreateOfferDocumentRequest = z.infer<typeof createOfferDocumentSchema>;

// Nullable scalars are removed from the stored document by the service. updatedAt is the stamp the client loaded (409 when it moved).
export const updateOfferDocumentSchema = documentFieldsSchema
  .partial()
  .extend({
    prestationLabel: documentFieldsSchema.shape.prestationLabel.removeDefault().optional(),
    sections: documentFieldsSchema.shape.sections.removeDefault().optional(),
    services: documentFieldsSchema.shape.services.removeDefault().optional(),
    conditions: documentFieldsSchema.shape.conditions.removeDefault().optional(),
    vatLines: documentFieldsSchema.shape.vatLines.removeDefault().optional(),
    season: docSeason.nullable().optional(),
    prestationType: z.string().min(1).nullable().optional(),
    minGuests: z.number().int().positive().max(5000).nullable().optional(),
    maxGuests: z.number().int().positive().max(5000).nullable().optional(),
    guestsLabel: z.string().trim().max(120).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    updatedAt: z.string().optional(),
  })
  .strict()
  .refine(idsAndSize, IDS_AND_SIZE_MESSAGE);
export type UpdateOfferDocumentRequest = z.infer<typeof updateOfferDocumentSchema>;

export const duplicateOfferDocumentSchema = z
  .object({ year: z.number().int().min(2020).max(2100), archiveSource: z.boolean().default(false) })
  .strict();
export type DuplicateOfferDocumentRequest = z.infer<typeof duplicateOfferDocumentSchema>;

export type BrandKind = "logo" | "banner";
export const BRAND_KINDS: BrandKind[] = ["logo", "banner"];
export const BRAND_IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };
export const MAX_BRAND_IMAGE_BYTES = 5 * 1024 * 1024;
