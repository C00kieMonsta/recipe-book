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
    kind: z.enum(["facture", "acompte", "comptoir", "bon_cadeau", "note_de_credit", "commission", "autre"]),
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
