import { z } from "zod";
import { UNITS_QTY } from "../entities/recipe";
import { addEventLineSchema, addEventTaskSchema, createEventRequestSchema, patchEventLineSchema, updateEventRequestSchema } from "./events";
import { createIngredientRequestSchema } from "./ingredients";
import { isoDate } from "./primitives";
import { createRecipeRequestSchema } from "./recipes";

export const ASSISTANT_MESSAGE_MAX = 4000;
export const ASSISTANT_MESSAGES_KEPT = 20;
export const ASSISTANT_APPLY_MAX = 10;

const id = z.string().min(1).max(40);
const summary = z.string().min(1).max(200);
const eventId = z.string().min(1);
const lineId = z.string().min(1);

// Ingredients are named, not ids; apply resolves them like the CSV import.
export const proposedRecipeIngredientSchema = z.object({
  name: z.string().trim().min(1),
  qty: z.number().nonnegative(),
  unit: z.enum(UNITS_QTY),
  lossPct: z.number().min(0).max(100).default(0),
});
export type ProposedRecipeIngredient = z.infer<typeof proposedRecipeIngredientSchema>;

export const proposedRecipePayloadSchema = createRecipeRequestSchema.extend({
  ingredients: z.array(proposedRecipeIngredientSchema),
});
export type ProposedRecipePayload = z.infer<typeof proposedRecipePayloadSchema>;

export const PROPOSED_ACTION_KINDS = [
  "create_recipe",
  "create_ingredient",
  "create_event",
  "update_event",
  "add_event_line",
  "update_event_line",
  "remove_event_line",
  "add_task",
] as const;
export const proposedActionKindSchema = z.enum(PROPOSED_ACTION_KINDS);
export type ProposedActionKind = z.infer<typeof proposedActionKindSchema>;

export const proposedActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create_recipe"), id, summary, payload: proposedRecipePayloadSchema }),
  z.object({ kind: z.literal("create_ingredient"), id, summary, payload: createIngredientRequestSchema }),
  z.object({ kind: z.literal("create_event"), id, summary, payload: createEventRequestSchema }),
  z.object({ kind: z.literal("update_event"), id, summary, eventId, payload: updateEventRequestSchema }),
  z.object({ kind: z.literal("add_event_line"), id, summary, eventId, payload: addEventLineSchema }),
  z.object({ kind: z.literal("update_event_line"), id, summary, eventId, lineId, payload: patchEventLineSchema }),
  z.object({ kind: z.literal("remove_event_line"), id, summary, eventId, lineId }),
  z.object({ kind: z.literal("add_task"), id, summary, eventId, payload: addEventTaskSchema }),
]);
export type ProposedAction = z.infer<typeof proposedActionSchema>;

export const assistantSelectionSchema = z
  .object({
    eventId: z.string().min(1).max(80).optional(),
    date: isoDate.optional(),
    recipeId: z.string().min(1).max(80).optional(),
    clientId: z.string().min(1).max(80).optional(),
    path: z.string().max(200).optional(),
  })
  .strict();
export type AssistantSelection = z.infer<typeof assistantSelectionSchema>;

export const chatMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(ASSISTANT_MESSAGE_MAX),
  })
  .strict();
export type ChatMessage = z.infer<typeof chatMessageSchema>;

// The service keeps the last ASSISTANT_MESSAGES_KEPT messages, so longer threads are accepted here.
export const chatRequestSchema = z
  .object({
    messages: z.array(chatMessageSchema).min(1),
    context: assistantSelectionSchema.optional(),
  })
  .strict()
  .refine((v) => {
    const last = v.messages[v.messages.length - 1];
    return last.role === "user" && last.content.trim().length > 0;
  }, "le dernier message doit être une question de l'utilisateur");
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const applyRequestSchema = z
  .object({ actions: z.array(proposedActionSchema).min(1).max(ASSISTANT_APPLY_MAX) })
  .strict();
export type ApplyRequest = z.infer<typeof applyRequestSchema>;

export const applyResultSchema = z.discriminatedUnion("ok", [
  z.object({
    id,
    ok: z.literal(true),
    kind: proposedActionKindSchema,
    recordId: z.string().min(1),
    href: z.string().min(1),
    summary: z.string(),
  }),
  z.object({ id, ok: z.literal(false), kind: proposedActionKindSchema, error: z.string() }),
]);
export type ApplyResult = z.infer<typeof applyResultSchema>;

export const applyResponseSchema = z.object({ results: z.array(applyResultSchema) });
export type ApplyResponse = z.infer<typeof applyResponseSchema>;

export const assistantUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
});
export type AssistantUsage = z.infer<typeof assistantUsageSchema>;

// One JSON object per NDJSON line; "error" is terminal and may follow streamed text.
export const assistantStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("tool"),
    name: z.string(),
    phase: z.enum(["start", "end"]),
    summary: z.string().optional(),
  }),
  z.object({ type: z.literal("action"), action: proposedActionSchema }),
  z.object({ type: z.literal("done"), usage: assistantUsageSchema }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type AssistantStreamEvent = z.infer<typeof assistantStreamEventSchema>;
