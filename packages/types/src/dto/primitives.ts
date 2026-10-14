import { z } from "zod";

export const Email = z.string().email();
export type Email = z.infer<typeof Email>;

// The shape alone lets 2026-02-30 through, so the date must round-trip through UTC.
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "date invalide");
export const yearMonth = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .refine((s) => Number(s.slice(5, 7)) >= 1 && Number(s.slice(5, 7)) <= 12, "mois invalide");
// Negatives are allowed so a note_de_credit can carry negative amounts.
const twoDecimals = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
export const money = z.number().refine(twoDecimals, "2 décimales max");
// A refined schema has no .nonnegative(), so the nonnegative variant is built here.
export const moneyNonnegative = z.number().nonnegative().refine(twoDecimals, "2 décimales max");
export const vatRate = z.union([z.literal(0), z.literal(6), z.literal(12), z.literal(21)]);
export const personIds = z.array(z.string().min(1).max(40)).max(10);
