import { Inject, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import type OpenAI from "openai";
import type { ApplyResult, AssistantStreamEvent, AssistantUsage, ChatRequest, ProposedAction } from "@packages/types";
import { ASSISTANT_MESSAGES_KEPT, ASSISTANT_MESSAGE_MAX, isoWeekOf, longDayLabel, todayYmd } from "@packages/types";
import { ConfigService, DEFAULT_OPENAI_MODEL } from "../config/config.service";
import { OpenAiNotConfiguredError, getOpenAiClient, invalidateOpenAiClient, isAssistantConfigured } from "../shared/openai.client";
import { FINAL_ROUND_NOTE, buildInstructions, formatCatalogue, formatTurnContext } from "./assistant.prompt";
import { AssistantTools, createTurnState } from "./assistant.tools";

export const TOOL_ROUNDS_MAX = 8;
export const MAX_OUTPUT_TOKENS = 8000;
// Injection token of the client factory; absent in the app, given by the tests.
export const ASSISTANT_CLIENT = "ASSISTANT_CLIENT";

export const ASSISTANT_DISABLED = { code: "ASSISTANT_DISABLED" };

export type ResponsesStream = AsyncIterable<OpenAI.Responses.ResponseStreamEvent>;
export type ResponsesCreateParams = OpenAI.Responses.ResponseCreateParamsStreaming;
export type ResponsesClient = {
  responses: { create(params: ResponsesCreateParams, options?: { signal?: AbortSignal }): Promise<ResponsesStream> };
};
export type ClientFactory = () => Promise<ResponsesClient>;

const REFUSED = "Le modèle a refusé de répondre.";
const TOO_LONG = "La réponse a atteint la limite de longueur.";
const KEY_REJECTED = "La clé OpenAI a été refusée. Vérifiez le paramètre SSM OPENAI_API_KEY.";
const EXHAUSTED = `L'assistant a utilisé ses ${TOOL_ROUNDS_MAX} étapes d'outils sans pouvoir conclure. Demandez-lui de continuer.`;

async function sdkClient(config: ConfigService): Promise<ResponsesClient> {
  const client = await getOpenAiClient(config);
  return { responses: { create: (params, options) => client.responses.create(params, options) } };
}

// Arguments arrive as a JSON string the model wrote token by token; malformed JSON becomes an empty object the tool can reject.
export function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const statusOf = (err: unknown): number | undefined => (err as { status?: number } | null)?.status;

function publicMessage(err: unknown): string {
  if (statusOf(err) === 401) return KEY_REJECTED;
  return err instanceof Error && err.message ? err.message : "Erreur inconnue";
}

@Injectable()
export class AssistantService {
  private readonly clientFactory: ClientFactory;

  constructor(
    private config: ConfigService,
    private tools: AssistantTools,
    @Optional() @Inject(ASSISTANT_CLIENT) clientFactory?: ClientFactory,
  ) {
    this.clientFactory = clientFactory ?? (() => sdkClient(config));
  }

  assertConfigured(): void {
    if (!isAssistantConfigured(this.config)) throw new ServiceUnavailableException(ASSISTANT_DISABLED);
  }

  apply(actions: ProposedAction[]): Promise<ApplyResult[]> {
    return this.tools.apply(actions);
  }

  // Resolves the client first so a missing key is still an HTTP 503, then returns the event generator.
  async stream(request: ChatRequest, signal?: AbortSignal): Promise<AsyncGenerator<AssistantStreamEvent>> {
    this.assertConfigured();
    let client: ResponsesClient;
    try {
      client = await this.clientFactory();
    } catch (err) {
      if (err instanceof OpenAiNotConfiguredError) throw new ServiceUnavailableException(ASSISTANT_DISABLED);
      throw err;
    }
    return this.run(client, request, signal);
  }

  // Every failure after the first yield must be an error event: the headers are already gone.
  private async *run(client: ResponsesClient, request: ChatRequest, signal?: AbortSignal): AsyncGenerator<AssistantStreamEvent> {
    const startedAt = Date.now();
    const model = this.config.get("OPENAI_MODEL") ?? DEFAULT_OPENAI_MODEL;
    const toolTrace: string[] = [];
    const usage: AssistantUsage = { promptTokens: 0, completionTokens: 0, toolCalls: 0 };
    let rounds = 0;
    let answer = "";

    try {
      const now = new Date();
      const today = todayYmd(now);
      const catalogue = await this.tools.catalogueSummary(now);
      const context = request.context ? await this.tools.contextSummary(request.context) : undefined;
      const instructions = buildInstructions({
        today: `${longDayLabel(today)} ${today.slice(0, 4)} (${today})`,
        isoWeek: isoWeekOf(today),
        catalogue: formatCatalogue(catalogue),
        context,
      });

      const input: OpenAI.Responses.ResponseInput = request.messages
        .slice(-ASSISTANT_MESSAGES_KEPT)
        .map((m) => ({ role: m.role, content: m.content.slice(0, ASSISTANT_MESSAGE_MAX) }));
      const trailing = formatTurnContext(request.context);
      if (trailing) input.push({ role: "developer", content: trailing });

      const definitions = this.tools.definitions();
      const turn = createTurnState();
      let exhausted = false;

      for (let round = 0; round <= TOOL_ROUNDS_MAX; round++) {
        if (signal?.aborted) return;
        const finalRound = round === TOOL_ROUNDS_MAX;
        if (finalRound) input.push({ role: "developer", content: FINAL_ROUND_NOTE });
        rounds++;
        const answerBefore = answer;

        const stream = await client.responses.create(
          {
            model,
            instructions,
            tools: finalRound ? [] : definitions,
            input,
            stream: true,
            // The thread lives in the browser tab; nothing is kept on OpenAI's side.
            store: false,
            max_output_tokens: MAX_OUTPUT_TOKENS,
          },
          signal ? { signal } : undefined,
        );

        let completed: OpenAI.Responses.Response | undefined;
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            answer += event.delta;
            yield { type: "text", text: event.delta };
          } else if (event.type === "response.completed" || event.type === "response.incomplete") {
            completed = event.response;
          } else if (event.type === "response.failed") {
            throw new Error(event.response.error?.message ?? "La réponse du modèle a échoué.");
          } else if (event.type === "error") {
            throw new Error(event.message || "Le flux du modèle a échoué.");
          }
        }
        if (signal?.aborted) return;
        if (!completed) throw new Error("La réponse du modèle s'est interrompue avant la fin.");

        usage.promptTokens += completed.usage?.input_tokens ?? 0;
        usage.completionTokens += completed.usage?.output_tokens ?? 0;

        if (completed.status === "incomplete") {
          const reason = completed.incomplete_details?.reason;
          yield { type: "error", message: reason === "max_output_tokens" || !reason ? TOO_LONG : `Le modèle s'est arrêté avant la fin (${reason}).` };
          return;
        }

        const refused = completed.output.some((item) => item.type === "message" && item.content.some((part) => part.type === "refusal"));
        if (refused && answer === answerBefore) {
          yield { type: "error", message: REFUSED };
          return;
        }

        // Reasoning items go back in so the model keeps its thread between rounds.
        for (const item of completed.output) {
          if (item.type === "message" || item.type === "function_call" || item.type === "reasoning") input.push(item);
          else console.warn(JSON.stringify({ action: "assistant:unexpected_output_item", itemType: item.type }));
        }

        const calls = completed.output.filter((item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call");
        if (calls.length === 0 || finalRound) break;
        exhausted = round === TOOL_ROUNDS_MAX - 1;

        for (const call of calls) {
          if (signal?.aborted) return;
          const args = parseToolArguments(call.arguments);
          toolTrace.push(call.name);
          usage.toolCalls++;
          yield { type: "tool", name: call.name, phase: "start", summary: this.tools.describe(call.name, args) };
          const result = await this.tools.run(call.name, args, turn);
          yield { type: "tool", name: call.name, phase: "end", summary: result.summary };
          if (result.action) yield { type: "action", action: result.action };
          input.push({ type: "function_call_output", call_id: call.call_id, output: result.content });
        }
      }

      if (signal?.aborted) return;
      if (exhausted && !answer) {
        yield { type: "error", message: EXHAUSTED };
        return;
      }

      console.log(JSON.stringify({ action: "assistant:turn", model, rounds, tools: toolTrace, usage, durationMs: Date.now() - startedAt }));
      yield { type: "done", usage };
    } catch (err) {
      // The SDK throws on abort; the client is gone, so nothing to report.
      if (signal?.aborted) return;
      if (statusOf(err) === 401) invalidateOpenAiClient();
      const reason = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ action: "assistant:turn_failed", model, rounds, tools: toolTrace, error: reason, durationMs: Date.now() - startedAt }));
      yield { type: "error", message: publicMessage(err) };
    }
  }
}
