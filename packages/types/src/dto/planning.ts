import { z } from "zod";
import { isoDate } from "./primitives";
const clock = z.string().regex(/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/);
export const scheduleOptionsSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    start: clock,
    end: clock,
    workers: z.number().int().min(1).max(30),
    ovens: z.number().int().min(0).max(20),
    stoves: z.number().int().min(0).max(20),
  })
  .strict()
  .refine(
    (v) =>
      v.to >= v.from &&
      Date.parse(v.to) - Date.parse(v.from) <= 31 * 86400000 &&
      v.start < v.end &&
      v.start !== "24:00",
    "Période de 31 jours et horaires valides requis.",
  );
export const applyScheduleSchema = z
  .object({
    options: scheduleOptionsSchema,
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
