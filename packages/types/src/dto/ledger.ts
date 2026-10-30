import { z } from "zod";
import { isoDate, money, moneyNonnegative, vatRate, yearMonth } from "./primitives";

const paymentMethodSchema = z.enum(["virement", "cash", "bancontact", "payconiq", "autre"]);

const vatIdentity = (e: { htva: number; totalTvac: number; vatAmount: number }) =>
  Math.abs(e.htva + e.vatAmount - e.totalTvac) < 0.011;

const base = {
  date: isoDate,
  label: z.string().min(1).trim(),
  description: z.string().trim().optional(),
  eventIds: z.array(z.string()).optional(),
  clientId: z.string().optional(),
  number: z.string().trim().optional(),
  totalTvac: money,
  htva: money,
  vatRate,
  vatAmount: money,
};

export const salesEntrySchema = z
  .object({
    ...base,
    book: z.literal("ventes"),
    kind: z.enum(["facture", "acompte", "comptoir", "bon_cadeau", "note_de_credit", "commission", "ca_mensuel", "autre"]),
    prestationType: z.string().optional(),
    refEntryId: z.string().optional(),
    paid: z.boolean().default(false),
    paymentMethod: paymentMethodSchema.optional(),
    paidAt: isoDate.optional(),
    km: z.number().nonnegative().optional(),
  })
  .strict();

export const purchaseEntrySchema = z
  .object({
    ...base,
    book: z.literal("achats"),
    kind: z.enum(["mp", "personnel", "autre"]),
    supplier: z.string().optional(),
    personName: z.string().optional(),
    hourlyRate: moneyNonnegative.optional(),
    shifts: z.array(z.object({ date: isoDate, hours: z.number().positive() }).strict()).optional(),
  })
  .strict();

const signRule = (e: { kind: string; totalTvac: number; htva: number; vatAmount: number; number?: string }) =>
  e.kind === "note_de_credit"
    ? e.totalTvac <= 0 && e.htva <= 0 && e.vatAmount <= 0 && !!e.number
    : e.totalTvac >= 0 && e.htva >= 0 && e.vatAmount >= 0;

export const createLedgerEntrySchema = z
  .discriminatedUnion("book", [salesEntrySchema, purchaseEntrySchema])
  .refine(vatIdentity, "HTVA + TVA doit égaler TVAC")
  .refine(signRule, "montants négatifs réservés aux notes de crédit");
export type CreateLedgerEntryRequest = z.infer<typeof createLedgerEntrySchema>;

export const patchLedgerEntrySchema = z
  .object({
    paid: z.boolean(),
    paymentMethod: paymentMethodSchema.nullable(),
    paidAt: isoDate.nullable(),
    description: z.string().trim(),
  })
  .partial()
  .strict();
export type PatchLedgerEntryRequest = z.infer<typeof patchLedgerEntrySchema>;

export const lockMonthSchema = z
  .object({
    ym: yearMonth,
    mpSource: z.enum(["calcule", "achats", "saisi"]).optional(),
    rawMaterial: moneyNonnegative.optional(),
    note: z.string().trim().optional(),
  })
  .strict()
  .refine((v) => v.mpSource !== "saisi" || v.rawMaterial !== undefined, "montant requis pour la source saisie");
export type LockMonthRequest = z.infer<typeof lockMonthSchema>;

export const unlockMonthSchema = z.object({ ym: yearMonth, reason: z.string().trim().min(1) }).strict();
export type UnlockMonthRequest = z.infer<typeof unlockMonthSchema>;

// One invoice from an external export (Odoo); a credit note keeps negative amounts.
export const importLedgerRowSchema = z
  .object({
    number: z.string().trim().min(1).max(40),
    date: isoDate,
    label: z.string().trim().min(1).max(120),
    htva: money,
    vatRate,
    vatAmount: money,
    totalTvac: money,
    paid: z.boolean().default(false),
    paidAt: isoDate.optional(),
    prestationType: z.string().optional(),
  })
  .strict()
  .refine(vatIdentity, "HTVA + TVA doit égaler TVAC");
export type ImportLedgerRow = z.infer<typeof importLedgerRowSchema>;

export const importLedgerSchema = z.object({ rows: z.array(importLedgerRowSchema).min(1).max(2000) }).strict();
export type ImportLedgerRequest = z.infer<typeof importLedgerSchema>;
// Alias kept so both names resolve.
export const importLedgerRequestSchema = importLedgerSchema;

// What the document model reads from one invoice file; null when a field is unreadable.
export const extractedInvoiceSchema = z
  .object({
    issuerName: z.string().max(120).nullable(),
    issuerVat: z.string().max(20).nullable(),
    recipientName: z.string().max(120).nullable(),
    recipientVat: z.string().max(20).nullable(),
    number: z.string().max(40).nullable(),
    // YYYY-MM-DD when the model is sure, else null.
    date: z.string().nullable(),
    dueDate: z.string().nullable(),
    currency: z.string().max(3).nullable(),
    totalTvac: z.number().nullable(),
    htva: z.number().nullable(),
    vatAmount: z.number().nullable(),
    vatLines: z.array(z.object({ rate: z.number(), base: z.number(), amount: z.number() })),
    kindGuess: z.enum(["facture", "note_de_credit", "acompte", "autre"]),
    paid: z.boolean().nullable(),
    confidence: z.number().min(0).max(1),
    remarks: z.string().max(300).nullable(),
  })
  .strict();
export type ExtractedInvoice = z.infer<typeof extractedInvoiceSchema>;

export const inboxConfirmSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            inboxId: z.string().min(1),
            entry: createLedgerEntrySchema,
            replace: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();
export type InboxConfirmRequest = z.infer<typeof inboxConfirmSchema>;

export interface InboxUpload {
  inboxId: string;
  name: string;
  contentType: string;
  size: number;
}

export type InboxFlagCode =
  | "vat_fixed"
  | "low_confidence"
  | "missing_number"
  | "missing_date"
  | "missing_amount"
  | "duplicate"
  | "locked_month"
  | "multi_rate"
  | "unknown_supplier"
  | "currency";

export interface InboxFlag {
  code: InboxFlagCode;
  message: string;
  // Set on duplicate: the entry « Remplacer » would overwrite.
  entryId?: string;
}

export interface InboxProposal {
  inboxId: string;
  entry: CreateLedgerEntryRequest | null;
  flags: InboxFlag[];
  extracted: ExtractedInvoice;
}

export interface InboxBatchProposal {
  // Each invoice has its own uploaded document and can be confirmed independently.
  invoices: (InboxProposal & { name: string; size: number; pageStart?: number; pageEnd?: number })[];
}

export type InboxConfirmResult =
  | { inboxId: string; ok: true; entryId: string }
  | { inboxId: string; ok: false; error: string };
