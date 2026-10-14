import type { AssistantStreamEvent, ChatRequest } from "@packages/types";
import { API_BASE, apiErrorMessage, getToken } from "./api";

// The streaming half of the assistant client. The JSON helper in api.ts waits for the whole body; a chat turn must render bytes as they arrive.

// A turn that reads several tools before answering takes a while.
export const ASSISTANT_TURN_TIMEOUT_MS = 180_000;

export const ASSISTANT_DISABLED_MESSAGE =
  "L'assistant n'est pas configuré. Créez le paramètre SSM OPENAI_API_KEY (voir le readme).";

export type AssistantErrorCode = "disabled" | "unauthorized" | "timeout" | "network" | "http" | "server";

export type AssistantErrorEvent = { type: "error"; message: string; code: AssistantErrorCode };

// What the generator yields: the wire events, with every error carrying a code so the sheet can tell a 503 from a dropped connection.
export type AssistantClientEvent = Exclude<AssistantStreamEvent, { type: "error" }> | AssistantErrorEvent;

export async function* streamChat(request: ChatRequest, signal?: AbortSignal): AsyncGenerator<AssistantClientEvent> {
  const token = getToken();
  if (!token) {
    yield { type: "error", code: "unauthorized", message: "Votre session a expiré. Rechargez la page et reconnectez-vous." };
    return;
  }

  // The caller's abort and the timeout cancel the same fetch, body read included.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, ASSISTANT_TURN_TIMEOUT_MS);
  const forward = () => controller.abort();
  if (signal?.aborted) forward();
  else signal?.addEventListener("abort", forward, { once: true });

  try {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/admin/assistant/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch {
      if (signal?.aborted) return;
      yield timedOut
        ? { type: "error", code: "timeout", message: "L'assistant a mis trop de temps à répondre." }
        : { type: "error", code: "network", message: "Impossible de joindre l'assistant." };
      return;
    }

    if (!response.ok || !response.body) {
      yield await httpError(response);
      return;
    }

    try {
      yield* readNdjson(response.body, signal);
    } catch {
      if (signal?.aborted) return;
      yield timedOut
        ? { type: "error", code: "timeout", message: "L'assistant a mis trop de temps à répondre." }
        : { type: "error", code: "network", message: "La connexion avec l'assistant a été interrompue." };
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
  }
}

async function httpError(response: Response): Promise<AssistantErrorEvent> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const code = (body as { code?: unknown } | null)?.code;
  if (response.status === 503 && code === "ASSISTANT_DISABLED") {
    return { type: "error", code: "disabled", message: ASSISTANT_DISABLED_MESSAGE };
  }
  if (response.status === 401) {
    return { type: "error", code: "unauthorized", message: "Votre session a expiré. Rechargez la page et reconnectez-vous." };
  }
  return { type: "error", code: "http", message: apiErrorMessage(response.status, body) };
}

// A chunk boundary can fall anywhere, so the decoder streams and the tail after the last newline waits for the next chunk.
async function* readNdjson(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<AssistantClientEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) return;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const event = parseEvent(line);
        if (event) yield event;
      }
    }
    buffer += decoder.decode();
    const last = parseEvent(buffer);
    if (last) yield last;
  } finally {
    reader.releaseLock();
  }
}

// A malformed line is dropped rather than thrown: the rest of the turn is usually still readable.
function parseEvent(line: string): AssistantClientEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isEvent(parsed)) return null;
    if (parsed.type === "error") return { type: "error", code: "server", message: parsed.message };
    return parsed;
  } catch {
    return null;
  }
}

function isEvent(value: unknown): value is AssistantStreamEvent {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}
