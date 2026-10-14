import { ServiceUnavailableException } from "@nestjs/common";
import type OpenAI from "openai";
import type { AppEvent, AppSettings, AssistantStreamEvent, ChatMessage, ChatRequest, Ingredient, Recipe } from "@packages/types";
import { DEFAULT_COURSES, DEFAULT_PRESTATION_TYPES, DEFAULT_SUPPLIERS, quoteGroups, suggestedPricePerGuest } from "@packages/types";
import type { ClientsService } from "../clients/clients.service";
import type { ConfigService } from "../config/config.service";
import type { EventsService } from "../events/events.service";
import type { IngredientsService } from "../ingredients/ingredients.service";
import type { OffersService } from "../offers/offers.service";
import type { RecipesService } from "../recipes/recipes.service";
import type { SettingsService } from "../settings/settings.service";
import { OpenAiNotConfiguredError } from "../shared/openai.client";
import { FINAL_ROUND_NOTE } from "./assistant.prompt";
import {
  AssistantService,
  TOOL_ROUNDS_MAX,
  type ResponsesClient,
  type ResponsesCreateParams,
  type ResponsesStream,
} from "./assistant.service";
import { AssistantTools, TOOL_DATA_NOTE } from "./assistant.tools";

type StreamEvent = OpenAI.Responses.ResponseStreamEvent;
type InputItem = Record<string, unknown>;

// One scripted model round: what the fake stream yields for one responses.create call.
type Script = {
  text?: string;
  calls?: { name: string; args: Record<string, unknown> }[];
  reasoning?: boolean;
  refusal?: boolean;
  status?: "completed" | "incomplete";
  // Runs after the first text delta, before the terminal event.
  during?: () => void;
};

class FakeClient implements ResponsesClient {
  calls: ResponsesCreateParams[] = [];
  signals: (AbortSignal | undefined)[] = [];
  private seq = 0;
  private readonly scripts: Script[];

  constructor(scripts: Script[]) {
    this.scripts = [...scripts];
  }

  responses = {
    create: async (params: ResponsesCreateParams, options?: { signal?: AbortSignal }): Promise<ResponsesStream> => {
      // The service keeps mutating its input array after the call, so the snapshot copies it.
      this.calls.push({ ...params, input: [...(params.input as unknown[])] } as ResponsesCreateParams);
      this.signals.push(options?.signal);
      if (options?.signal?.aborted) throw abortError();
      const script = this.scripts.shift();
      if (!script) throw new Error("Aucun script de réponse restant");
      return this.events(script, ++this.seq);
    },
  };

  private async *events(script: Script, n: number): AsyncGenerator<StreamEvent> {
    const output: unknown[] = [];
    if (script.reasoning) output.push({ type: "reasoning", id: `rs_${n}`, summary: [] });
    if (script.text) {
      output.push({
        type: "message",
        id: `msg_${n}`,
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: script.text, annotations: [] }],
      });
    }
    if (script.refusal) {
      output.push({ type: "message", id: `msg_${n}`, role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "Non." }] });
    }
    (script.calls ?? []).forEach((c, i) => {
      output.push({ type: "function_call", id: `fc_${n}_${i}`, call_id: `call_${n}_${i}`, name: c.name, arguments: JSON.stringify(c.args) });
    });
    const status = script.status ?? "completed";
    const response = {
      id: `resp_${n}`,
      status,
      output,
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
      incomplete_details: status === "incomplete" ? { reason: "max_output_tokens" } : null,
    };

    if (script.text) {
      const half = Math.ceil(script.text.length / 2);
      yield { type: "response.output_text.delta", delta: script.text.slice(0, half) } as unknown as StreamEvent;
      script.during?.();
      yield { type: "response.output_text.delta", delta: script.text.slice(half) } as unknown as StreamEvent;
    } else {
      script.during?.();
    }
    yield { type: status === "incomplete" ? "response.incomplete" : "response.completed", response } as unknown as StreamEvent;
  }
}

function abortError(): Error {
  return Object.assign(new Error("Request was aborted."), { name: "APIUserAbortError" });
}

const NOW = "2026-10-01T00:00:00.000Z";

const ingredient = (ingredientId: string, name: string, price: number, unit: Ingredient["unit"]): Ingredient => ({
  ingredientId,
  name,
  nameLower: name.toLowerCase(),
  price,
  unit,
  supplier: "Barn",
  createdAt: NOW,
  updatedAt: NOW,
});

const recipe = (recipeId: string, name: string, portions: number, ingredients: Recipe["ingredients"]): Recipe => ({
  recipeId,
  name,
  nameLower: name.toLowerCase(),
  category: "Plat",
  type: "Plat",
  portions,
  portionWeight: 150,
  techniques: ["Mixer le tout."],
  ingredients,
  photos: [],
  pricing: { surPlace: { coef: 4, tva: 12 }, takeAway: { coef: 3, tva: 6 }, chosenPrice: { surPlace: 0, takeAway: 0 } },
  createdAt: NOW,
  updatedAt: NOW,
});

const INGREDIENTS: Ingredient[] = [
  ingredient("i1", "Pois chiches", 3, "€/kg"),
  ingredient("i2", "Tahini", 9.5, "€/kg"),
  ingredient("i3", "Citron", 0.5, "€/pièce"),
  ingredient("i4", "Riz arborio", 4, "€/kg"),
];

const RECIPES: Recipe[] = [
  recipe("r1", "Houmous", 10, [
    { ingredientId: "i1", qty: 400, unit: "g", lossPct: 0 },
    { ingredientId: "i2", qty: 60, unit: "g", lossPct: 0 },
    { ingredientId: "i3", qty: 1, unit: "pièce", lossPct: 0 },
  ]),
  recipe("r2", "Risotto aux champignons", 4, [{ ingredientId: "i4", qty: 320, unit: "g", lossPct: 0 }]),
  recipe("r3", "Mousse au chocolat", 8, []),
];

const EVENT: AppEvent = {
  eventId: "e1",
  name: "Mariage Dupont",
  nameLower: "mariage dupont",
  date: "2026-10-17",
  guestCount: 50,
  recipes: [{ lineId: "l1", recipeId: "r2", portions: 50 }],
  tasks: [],
  extraCosts: [],
  sellingPricePerGuest: 55,
  status: "upcoming",
  vatRate: 12,
  createdAt: NOW,
  updatedAt: NOW,
};

const SETTINGS: AppSettings = {
  settingsId: "global",
  recipeCategories: DEFAULT_COURSES,
  courses: DEFAULT_COURSES,
  suppliers: DEFAULT_SUPPLIERS,
  prestationTypes: DEFAULT_PRESTATION_TYPES,
  people: [],
  objectives: {},
  updatedAt: NOW,
};

function fakeTools(): AssistantTools {
  const recipes = { getAll: async () => RECIPES, get: async (id: string) => RECIPES.find((r) => r.recipeId === id) ?? null } as unknown as RecipesService;
  const ingredients = { getAll: async () => INGREDIENTS } as unknown as IngredientsService;
  const events = { getAll: async () => [EVENT], get: async (id: string) => (id === EVENT.eventId ? EVENT : null) } as unknown as EventsService;
  const clients = { get: async () => null } as unknown as ClientsService;
  const settings = { get: async () => SETTINGS } as unknown as SettingsService;
  const offers = { getAll: async () => [] } as unknown as OffersService;
  return new AssistantTools(recipes, ingredients, events, clients, settings, offers);
}

const config = (env: Record<string, string | undefined>): ConfigService =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

// A parameter name, not a key: isAssistantConfigured only checks that a source is named.
const CONFIGURED = config({ OPENAI_API_KEY_PARAMETER: "/test/OPENAI_API_KEY", OPENAI_MODEL: "test-model", AWS_REGION: "eu-west-1" });

const ask = (content: string, context?: ChatRequest["context"]): ChatRequest => ({ messages: [{ role: "user", content }], ...(context ? { context } : {}) });

async function collect(service: AssistantService, request: ChatRequest, signal?: AbortSignal): Promise<AssistantStreamEvent[]> {
  const out: AssistantStreamEvent[] = [];
  for await (const event of await service.stream(request, signal)) out.push(event);
  return out;
}

const inputOf = (params: ResponsesCreateParams): InputItem[] => params.input as unknown as InputItem[];
const parsedOutput = (item: InputItem): { data: Record<string, unknown>; note: string } => JSON.parse(item.output as string);

describe("AssistantService", () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("throws 503 ASSISTANT_DISABLED without a key source", async () => {
    const service = new AssistantService(config({ OPENAI_MODEL: "test-model" }), fakeTools(), async () => new FakeClient([]));
    const failure = await service.stream(ask("Bonjour")).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as ServiceUnavailableException).getResponse()).toEqual({ code: "ASSISTANT_DISABLED" });
  });

  it("throws 503 when the parameter is named but missing in SSM", async () => {
    const service = new AssistantService(CONFIGURED, fakeTools(), async () => {
      throw new OpenAiNotConfiguredError();
    });
    const failure = await service.stream(ask("Bonjour")).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as ServiceUnavailableException).getResponse()).toEqual({ code: "ASSISTANT_DISABLED" });
  });

  it("runs a search_recipes round trip and counts the tool call", async () => {
    const client = new FakeClient([
      { reasoning: true, calls: [{ name: "search_recipes", args: { query: "houmous", category: null, limit: null } }] },
      { text: "J'ai trouvé la recette Houmous." },
    ]);
    const service = new AssistantService(CONFIGURED, fakeTools(), async () => client);

    const events = await collect(service, ask("Cherche le houmous"));

    expect(events.map((e) => e.type)).toEqual(["tool", "tool", "text", "text", "done"]);
    expect(events[0]).toEqual({ type: "tool", name: "search_recipes", phase: "start", summary: "Recherche de recettes « houmous »" });
    expect(events[1]).toEqual({ type: "tool", name: "search_recipes", phase: "end", summary: "Recherche de recettes « houmous » : 1 résultat" });
    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("")).toBe("J'ai trouvé la recette Houmous.");
    expect(events[4]).toEqual({ type: "done", usage: { promptTokens: 200, completionTokens: 20, toolCalls: 1 } });

    expect(client.calls).toHaveLength(2);
    const first = client.calls[0];
    expect(first.model).toBe("test-model");
    expect(first.store).toBe(false);
    expect(first.stream).toBe(true);
    expect(first.max_output_tokens).toBe(8000);
    expect(first.instructions).toContain("Catalogue");
    expect(first.tools?.map((t) => (t as { name: string }).name)).toContain("search_recipes");

    const second = inputOf(client.calls[1]);
    const types = second.map((item) => item.type ?? item.role);
    expect(types).toEqual(["user", "reasoning", "function_call", "function_call_output"]);
    const output = second[3];
    expect(output.call_id).toBe("call_1_0");
    const parsed = parsedOutput(output);
    expect(parsed.note).toBe(TOOL_DATA_NOTE);
    const rows = parsed.data.recipes as { recipeId: string; name: string; incomplete: boolean }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipeId: "r1", name: "Houmous", incomplete: false, portions: 10 });
  });

  it("returns the Zod issues on a bad propose_update_event and streams one action on the retry", async () => {
    const client = new FakeClient([
      { calls: [{ name: "propose_update_event", args: { summary: "Mariage Dupont : -1 convive", eventId: "e1", guestCount: -1 } }] },
      { calls: [{ name: "propose_update_event", args: { summary: "Mariage Dupont : 65 convives", eventId: "e1", guestCount: 65 } }] },
      { text: "Proposition enregistrée, à vous de confirmer." },
    ]);
    const service = new AssistantService(CONFIGURED, fakeTools(), async () => client);

    const events = await collect(service, ask("Passe à 65 convives", { eventId: "e1" }));

    const actions = events.filter((e) => e.type === "action");
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      type: "action",
      action: { kind: "update_event", eventId: "e1", summary: "Mariage Dupont : 65 convives", payload: { guestCount: 65 } },
    });
    expect((actions[0] as { action: { id: string } }).action.id).toMatch(/^[a-z0-9]+-1$/);

    const firstResult = parsedOutput(inputOf(client.calls[1]).filter((i) => i.type === "function_call_output")[0]);
    expect(firstResult.data.error).toBe("payload.guestCount : doit être supérieur à 0");

    const secondResult = parsedOutput(inputOf(client.calls[2]).filter((i) => i.type === "function_call_output")[1]);
    expect(secondResult.data).toMatchObject({ proposed: true, message: "Proposition enregistrée, l'utilisateur doit la confirmer." });

    const summaries = events.filter((e) => e.type === "tool" && e.phase === "end").map((e) => (e as { summary?: string }).summary);
    expect(summaries).toEqual(["Proposition refusée", "Proposition : Mariage Dupont : 65 convives"]);

    const done = events[events.length - 1];
    expect(done).toEqual({ type: "done", usage: { promptTokens: 300, completionTokens: 30, toolCalls: 2 } });

    // The selection is a trailing developer item and the instructions name the event.
    const first = client.calls[0];
    expect(first.instructions).toContain("L'utilisateur regarde l'événement « Mariage Dupont » (eventId e1)");
    const trailing = inputOf(first)[inputOf(first).length - 1];
    expect(trailing).toEqual({ role: "developer", content: "Contexte de ce message : événement e1. Les questions sans précision portent sur cet enregistrement." });
  });

  it("returns the quote lib result through quote_price with names resolved", async () => {
    const client = new FakeClient([
      {
        calls: [
          {
            name: "quote_price",
            args: {
              groups: [
                { label: "Menu mariage", guests: 50, recipes: [{ name: "risotto", portionsPerGuest: null }], offerId: null, eventId: null, pricePerGuest: 55 },
                { label: "Sans gluten", guests: 1, recipes: [{ name: "mousse au chocolat", portionsPerGuest: null }], offerId: null, eventId: null, pricePerGuest: null },
              ],
              extras: [{ label: "Livraison", amount: 150, vatRate: 21 }],
              prestationType: null,
              foodVatRate: null,
            },
          },
        ],
      },
      { text: "Total TVAC 3 261,50 €." },
    ]);
    const service = new AssistantService(CONFIGURED, fakeTools(), async () => client);

    const events = await collect(service, ask("Prix final ?"));

    expect(events.filter((e) => e.type === "action")).toHaveLength(0);
    expect(events[0]).toEqual({ type: "tool", name: "quote_price", phase: "start", summary: "Estimation pour 51 convives" });
    expect(events[1]).toEqual({ type: "tool", name: "quote_price", phase: "end", summary: "Estimation pour 51 convives" });

    const result = parsedOutput(inputOf(client.calls[1]).filter((i) => i.type === "function_call_output")[0]).data;
    const expected = quoteGroups({
      groups: [
        { label: "Menu mariage", guests: 50, lines: [{ recipeId: "r2" }], pricePerGuest: 55 },
        { label: "Sans gluten", guests: 1, lines: [{ recipeId: "r3" }] },
      ],
      extras: [{ label: "Livraison", amount: 150, vatRate: 21 }],
      foodVatRate: 12,
      recipeById: new Map(RECIPES.map((r) => [r.recipeId, r])),
      ingredientById: new Map(INGREDIENTS.map((i) => [i.ingredientId, i])),
      suggest: (costPerGuest) => suggestedPricePerGuest(costPerGuest, undefined),
    });
    expect(result).toEqual({
      ...expected,
      foodVatRate: 12,
      matches: [
        { asked: "risotto", recipeId: "r2", name: "Risotto aux champignons" },
        { asked: "mousse au chocolat", recipeId: "r3", name: "Mousse au chocolat" },
      ],
      unresolved: [],
    });
    expect(expected.totals).toMatchObject({ guests: 51, foodHtva: 2750, extrasHtva: 150, htva: 2900, vatByRate: { "12": 330, "21": 31.5 }, tvac: 3261.5 });
    expect(expected.groups.map((g) => g.priceSource)).toEqual(["donné", "suggéré"]);
  });

  it("stops at the tool round budget and answers without tools in the final round", async () => {
    const toolRound: Script = { calls: [{ name: "get_catalogue_summary", args: {} }] };
    const client = new FakeClient([...Array.from({ length: TOOL_ROUNDS_MAX }, () => toolRound), { text: "Voici le bilan." }]);
    const service = new AssistantService(CONFIGURED, fakeTools(), async () => client);

    const events = await collect(service, ask("Lis tout"));

    expect(client.calls).toHaveLength(TOOL_ROUNDS_MAX + 1);
    for (const params of client.calls.slice(0, TOOL_ROUNDS_MAX)) expect(params.tools?.length).toBe(15);
    const final = client.calls[TOOL_ROUNDS_MAX];
    expect(final.tools).toEqual([]);
    const finalInput = inputOf(final);
    expect(finalInput[finalInput.length - 1]).toEqual({ role: "developer", content: FINAL_ROUND_NOTE });
    expect(finalInput.filter((i) => i.type === "function_call_output")).toHaveLength(TOOL_ROUNDS_MAX);

    expect(events.filter((e) => e.type === "tool" && e.phase === "start")).toHaveLength(TOOL_ROUNDS_MAX);
    expect(events[events.length - 1]).toEqual({
      type: "done",
      usage: { promptTokens: 100 * (TOOL_ROUNDS_MAX + 1), completionTokens: 10 * (TOOL_ROUNDS_MAX + 1), toolCalls: TOOL_ROUNDS_MAX },
    });
  });

  it("stops the loop when the client aborts during a round", async () => {
    const aborter = new AbortController();
    const client = new FakeClient([
      { text: "Je regarde.", calls: [{ name: "search_recipes", args: { query: "x" } }], during: () => aborter.abort() },
      { text: "Jamais envoyé." },
    ]);
    const tools = fakeTools();
    const runSpy = jest.spyOn(tools, "run");
    const service = new AssistantService(CONFIGURED, tools, async () => client);

    const events = await collect(service, ask("Cherche"), aborter.signal);

    expect(events.every((e) => e.type === "text")).toBe(true);
    expect(events.some((e) => e.type === "done" || e.type === "error")).toBe(false);
    expect(client.calls).toHaveLength(1);
    expect(client.signals[0]).toBe(aborter.signal);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it("reports nothing when the SDK throws after the client aborted", async () => {
    const aborter = new AbortController();
    const client = new FakeClient([
      {
        text: "Je regarde.",
        during: () => {
          aborter.abort();
          throw abortError();
        },
      },
    ]);
    const service = new AssistantService(CONFIGURED, fakeTools(), async () => client);

    const events = await collect(service, ask("Cherche"), aborter.signal);

    expect(events.map((e) => e.type)).toEqual(["text"]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("drops messages beyond the last 20 from the front", async () => {
    const messages: ChatMessage[] = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i}`,
    }));
    messages[24] = { role: "user", content: "message 24" };
    const client = new FakeClient([{ text: "D'accord." }]);
    const service = new AssistantService(CONFIGURED, fakeTools(), async () => client);

    await collect(service, { messages });

    const input = inputOf(client.calls[0]);
    expect(input).toHaveLength(20);
    expect(input[0]).toEqual({ role: "assistant", content: "message 5" });
    expect(input[19]).toEqual({ role: "user", content: "message 24" });
  });

  it("ends with an error event after streamed text when the model is cut off", async () => {
    const client = new FakeClient([{ text: "Début de réponse", status: "incomplete" }]);
    const service = new AssistantService(CONFIGURED, fakeTools(), async () => client);

    const events = await collect(service, ask("Raconte"));

    expect(events.map((e) => e.type)).toEqual(["text", "text", "error"]);
    expect(events[2]).toEqual({ type: "error", message: "La réponse a atteint la limite de longueur." });
  });

  it("reports a refusal without text as an error", async () => {
    const client = new FakeClient([{ refusal: true }]);
    const service = new AssistantService(CONFIGURED, fakeTools(), async () => client);

    const events = await collect(service, ask("Supprime tout"));

    expect(events).toEqual([{ type: "error", message: "Le modèle a refusé de répondre." }]);
  });
});
