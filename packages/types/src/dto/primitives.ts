import { z } from "zod";

export const Email = z.string().email();
export type Email = z.infer<typeof Email>;

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const yearMonth = z.string().regex(/^\d{4}-\d{2}$/);
// Negatives are allowed so a note_de_credit can carry negative amounts.
const twoDecimals = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
export const money = z.number().refine(twoDecimals, "2 décimales max");
// A refined schema has no .nonnegative(), so the nonnegative variant is built here.
export const moneyNonnegative = z.number().nonnegative().refine(twoDecimals, "2 décimales max");
export const vatRate = z.union([z.literal(0), z.literal(6), z.literal(12), z.literal(21)]);
export const personIds = z.array(z.string().min(1).max(40)).max(10);
