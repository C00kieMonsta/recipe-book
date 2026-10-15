import { z } from "zod";
import { isoDate, moneyNonnegative, vatRate, yearMonth } from "./primitives";

const settingsSupplierSchema = z.object({
  name: z.string().min(1).trim(),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});

export const prestationTypeSettingSchema = z
  .object({
    key: z.string().min(1).trim(),
    label: z.string().min(1).trim(),
    defaultVatRate: vatRate,
  })
  .strict();

export const fixedChargeSchema = z
  .object({
    chargeId: z.string().min(1),
    label: z.string().min(1).trim(),
    category: z.enum(["social", "salaire", "assurance", "abonnement", "frais", "remboursement", "autre"]),
    monthlyAmount: moneyNonnegative,
    monthlyAmountSolo: moneyNonnegative.optional(),
    inResult: z.boolean().optional(),
    from: yearMonth.optional(),
    to: yearMonth.optional(),
    note: z.string().trim().optional(),
  })
  .strict();

export const yearObjectiveSchema = z
  .object({
    annualRevenue: moneyNonnegative,
    monthsActive: z.number().int().min(1).max(12),
    monthlyOverrides: z.record(yearMonth, moneyNonnegative).optional(),
    byPrestation: z
      .array(
        z
          .object({
            type: z.string().min(1),
            amount: moneyNonnegative,
            eventsNeeded: z.number().int().nonnegative().optional(),
            guestsPerEvent: z.number().positive().optional(),
          })
          .strict(),
      )
      .optional(),
    hoursAvailablePerMonth: z.number().nonnegative().optional(),
    hoursAvailableOverrides: z.record(yearMonth, z.number().nonnegative()).optional(),
    rawMaterialPct: z.number().min(0).max(1).optional(),
    corporateTaxRate: z.number().min(0).max(1).optional(),
    smeReducedRate: z.boolean().optional(),
    corporateTaxActual: moneyNonnegative.optional(),
    extrasBudget: moneyNonnegative.optional(),
    treasuryMonths: z.number().nonnegative().optional(),
    treasurySavingPerMonth: moneyNonnegative.optional(),
    investments: z.array(z.object({ label: z.string().min(1).trim(), amount: moneyNonnegative }).strict()).optional(),
  })
  .strict();

const yearKey = z.string().regex(/^\d{4}$/);
const monthKey = z.string().regex(/^(0[1-9]|1[0-2])$/);
const monthDay = z.string().regex(/^\d{2}-\d{2}$/);

export const yearActualsSchema = z
  .object({
    monthly: z.record(monthKey, moneyNonnegative).optional(),
    byPrestation: z.record(z.string().min(1), moneyNonnegative).optional(),
    byPeriod: z.array(z.object({ from: monthDay, to: monthDay, amount: moneyNonnegative }).strict()).optional(),
    note: z.string().trim().optional(),
  })
  .strict();

export const monthCloseSchema = z
  .object({
    mpSource: z.enum(["calcule", "achats", "saisi"]),
    rawMaterial: moneyNonnegative.optional(),
    lockedAt: z.string().optional(),
    unlockedAt: z.string().optional(),
    note: z.string().trim().optional(),
  })
  .strict();

export const companySettingsSchema = z
  .object({
    name: z.string().trim(),
    vatNumber: z.string().trim(),
    address: z.string().trim(),
    constitutedOn: isoDate.optional(),
    phone: z.string().trim().max(40).optional(),
    email: z.string().trim().max(80).optional(),
    website: z.string().trim().max(80).optional(),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, "couleur hex").optional(),
  })
  .strict();

export const personSchema = z
  .object({
    personId: z.string().regex(/^[a-z0-9-]{1,40}$/),
    name: z.string().min(1).max(60).trim(),
    initials: z.string().trim().min(1).max(3).optional(),
    active: z.boolean(),
    hourlyRate: moneyNonnegative.optional(),
    kmRate: z.number().nonnegative().max(10).optional(),
    paymentMode: z.enum(["nowjobs", "cash", "facture"]).optional(),
  })
  .strict();
export type PersonRequest = z.infer<typeof personSchema>;

export const updateSettingsRequestSchema = z.object({
  recipeCategories: z.array(z.string().min(1).trim()).min(1).optional(),
  suppliers: z.array(settingsSupplierSchema).optional(),
  courses: z.array(z.string().min(1).trim()).min(1).optional(),
  prestationTypes: z.array(prestationTypeSettingSchema).optional(),
  fixedCharges: z.array(fixedChargeSchema).optional(),
  objectives: z.record(yearKey, yearObjectiveSchema).optional(),
  yearActuals: z.record(yearKey, yearActualsSchema).optional(),
  monthCloses: z.record(yearMonth, monthCloseSchema).optional(),
  ledgerStartYm: yearMonth.optional(),
  company: companySettingsSchema.optional(),
  ignoredDuplicateGroups: z.array(z.string()).optional(),
  people: z.array(personSchema).max(30).optional(),
  invoicing: z.enum(["app", "externe"]).optional(),
  // The updatedAt the client loaded; when sent, the save is refused with 409 if the document moved since.
  updatedAt: z.string().optional(),
});
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;
