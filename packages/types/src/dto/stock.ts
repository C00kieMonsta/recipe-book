import { z } from "zod";
import { UNITS_QTY } from "../entities/recipe";

const stockLineSchema = z
  .object({
    ingredientId: z.string().min(1).max(80),
    quantity: z.number().finite().min(0).max(1e9),
    unit: z.enum(UNITS_QTY),
    minimum: z.number().finite().min(0).max(1e9).optional(),
  })
  .strict();
export const stockMovementRequestSchema = z
  .object({
    requestId: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9:_-]+$/),
    kind: z.enum(["count", "receipt", "waste", "adjustment"]),
    occurredAt: z.string().datetime(),
    note: z.string().trim().max(500).optional(),
    lines: z
      .array(
        stockLineSchema.extend({ direction: z.enum(["in", "out"]).optional() }),
      )
      .min(1)
      .max(40),
  })
  .strict();
export type StockMovementRequest = z.infer<typeof stockMovementRequestSchema>;
export const stockReceiptRequestSchema = z
  .object({
    entryId: z.string().min(1),
    occurredAt: z.string().datetime(),
    lines: z
      .array(stockLineSchema.extend({ lineId: z.string().min(1).max(80) }))
      .min(1)
      .max(40),
  })
  .strict();
export type StockReceiptRequest = z.infer<typeof stockReceiptRequestSchema>;
