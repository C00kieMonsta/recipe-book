import { useCallback, useEffect, useRef, useState } from "react";
import {
  ASSISTANT_APPLY_MAX,
  ASSISTANT_MESSAGE_MAX,
  ASSISTANT_MESSAGES_KEPT,
  type AssistantSelection,
  type ChatMessage,
  type ProposedAction,
} from "@packages/types";
import { api, errorReason } from "@/lib/api";
import { streamChat, type AssistantErrorCode } from "@/lib/assistant-client";
import { notifyAssistantApplied } from "@/hooks/use-assistant-applied";

// One conversation per browser tab, kept in sessionStorage so it survives a route change and a reload.

export const ASSISTANT_STORAGE_KEY = "recipe-book:assistant";
export const ASSISTANT_MESSAGES_STORED = 40;

export type AssistantChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  // Proposal cards, in the order received.
  actions?: ProposedAction[];
  // Tool names used by the turn, for a « lu : 2 outils » hint.
  tools?: string[];
  createdAt: number;
};

export type ProposalState =
  | { status: "pending" }
  | { status: "applying" }
  | { status: "applied"; recordId: string; href: string; summary: string }
  | { status: "failed"; error: string }
  | { status: "ignored" };

export type PendingTurn = {
  text: string;
  // The current tool's French one-liner, null between tools.
  tool: string | null;
  tools: string[];
  actions: ProposedAction[];
};

export type AssistantError = { message: string; code?: AssistantErrorCode };

export type AssistantChat = {
  messages: AssistantChatMessage[];
  pending: PendingTurn | null;
  error: AssistantError | null;
  // True after a 503 ASSISTANT_DISABLED, so the sheet shows the setup callout instead of the composer.
  disabled: boolean;
  // Keyed by proposalKey(messageId, action.id); action ids repeat across turns.
  proposals: Record<string, ProposalState>;
  // False when nothing was sent (empty, too long, or a turn in flight), so the caller keeps its draft.
  send: (text: string, context?: AssistantSelection) => boolean;
  abort: () => void;
  reset: () => void;
  // Applies the message's pending proposals, or only the given ids.
  apply: (messageId: string, actionIds?: string[]) => Promise<void>;
  ignore: (messageId: string, actionId: string) => void;
  proposalState: (messageId: string, actionId: string) => ProposalState;
};

export function proposalKey(messageId: string, actionId: string): string {
  return `${messageId}:${actionId}`;
}

const PENDING: ProposalState = { status: "pending" };

// French fallbacks when a tool event carries no summary.
const TOOL_LABELS: Record<string, string> = {
  search_recipes: "Recherche de recettes",
  get_recipe: "Lecture d'une recette",
  search_ingredients: "Recherche d'ingrédients",
  list_events: "Lecture des événements",
  get_event: "Lecture de l'événement",
  get_catalogue_summary: "Lecture du catalogue",
  quote_price: "Estimation du prix",
  propose_create_recipe: "Proposition d'une recette",
  propose_create_ingredient: "Proposition d'un ingrédient",
  propose_create_event: "Proposition d'un événement",
  propose_update_event: "Proposition de modification",
  propose_add_event_line: "Proposition d'une ligne",
  propose_update_event_line: "Proposition de modification d'une ligne",
  propose_remove_event_line: "Proposition de retrait d'une ligne",
  propose_add_task: "Proposition d'une tâche",
};

export function toolLabel(name: string, summary?: string): string {
  return summary?.trim() || TOOL_LABELS[name] || "Lecture des données";
}

type Stored = { messages: AssistantChatMessage[]; proposals: Record<string, ProposalState> };

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function useAssistantChat(): AssistantChat {
  const [stored] = useState<Stored>(readStored);
  const [messages, setMessages] = useState<AssistantChatMessage[]>(stored.messages);
  const [proposals, setProposals] = useState<Record<string, ProposalState>>(stored.proposals);
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [error, setError] = useState<AssistantError | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const liveRef = useRef(true);
  // Mirrors `pending` for the send guard, so two quick Enter presses do not start two turns.
  const busyRef = useRef(false);
  // Bumped by reset(), so a turn aborted by « Nouvelle conversation » does not append its partial answer to the new thread.
  const turnRef = useRef(0);

  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    writeStored(messages, proposals);
  }, [messages, proposals]);

  const send = useCallback((text: string, context?: AssistantSelection): boolean => {
    const trimmed = text.trim();
    if (!trimmed || busyRef.current) return false;
    if (trimmed.length > ASSISTANT_MESSAGE_MAX) {
      setError({ message: `Message trop long (${ASSISTANT_MESSAGE_MAX} caractères au maximum).` });
      return false;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError({ message: "Vous êtes hors ligne. Votre message est conservé, envoyez-le une fois reconnecté." });
      return false;
    }

    setError(null);
    busyRef.current = true;

    const userMessage: AssistantChatMessage = { id: nextId("u"), role: "user", content: trimmed, createdAt: Date.now() };
    const history = toWire([...messages, userMessage]);
    setMessages((prior) => [...prior, userMessage]);
    setPending({ text: "", tool: null, tools: [], actions: [] });

    const controller = new AbortController();
    abortRef.current = controller;
    const turn = turnRef.current;

    void (async () => {
      let answer = "";
      const tools: string[] = [];
      const actions: ProposedAction[] = [];
      let failed: AssistantError | null = null;
      try {
        for await (const event of streamChat({ messages: history, context: compactContext(context) }, controller.signal)) {
          if (!liveRef.current) return;
          switch (event.type) {
            case "text":
              answer += event.text;
              setPending((prior) => (prior ? { ...prior, text: answer } : prior));
              break;
            case "tool":
              if (event.phase === "start") {
                tools.push(event.name);
                const label = toolLabel(event.name, event.summary);
                setPending((prior) => (prior ? { ...prior, tool: label, tools: [...tools] } : prior));
              } else {
                setPending((prior) => (prior ? { ...prior, tool: null } : prior));
              }
              break;
            case "action":
              actions.push(event.action);
              setPending((prior) => (prior ? { ...prior, actions: [...actions] } : prior));
              break;
            case "error":
              failed = { message: event.message, code: event.code };
              break;
            case "done":
              break;
          }
        }
        if (!liveRef.current || turnRef.current !== turn) return;
        // Text plus an error means the turn broke partway; the partial answer is kept.
        if (answer || actions.length) {
          const id = nextId("a");
          setMessages((prior) => [
            ...prior,
            {
              id,
              role: "assistant",
              content: answer,
              actions: actions.length ? actions : undefined,
              tools: tools.length ? tools : undefined,
              createdAt: Date.now(),
            },
          ]);
          if (actions.length) {
            setProposals((prior) => {
              const next = { ...prior };
              for (const action of actions) next[proposalKey(id, action.id)] = PENDING;
              return next;
            });
          }
        }
        setError(failed);
      } catch {
        if (liveRef.current && !controller.signal.aborted) {
          setError({ message: "La connexion avec l'assistant a été interrompue.", code: "network" });
        }
      } finally {
        busyRef.current = false;
        if (abortRef.current === controller) abortRef.current = null;
        if (liveRef.current) setPending(null);
      }
    })();
    return true;
  }, [messages]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    turnRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;
    setMessages([]);
    setProposals({});
    setPending(null);
    setError(null);
    clearStored();
  }, []);

  const proposalState = useCallback(
    (messageId: string, actionId: string): ProposalState => proposals[proposalKey(messageId, actionId)] ?? PENDING,
    [proposals],
  );

  const ignore = useCallback((messageId: string, actionId: string) => {
    const key = proposalKey(messageId, actionId);
    setProposals((prior) => {
      const current = prior[key] ?? PENDING;
      if (current.status !== "pending" && current.status !== "failed") return prior;
      return { ...prior, [key]: { status: "ignored" } };
    });
  }, []);

  const apply = useCallback(async (messageId: string, actionIds?: string[]) => {
    const message = messages.find((m) => m.id === messageId);
    const wanted = (message?.actions ?? []).filter((action) => {
      if (actionIds && !actionIds.includes(action.id)) return false;
      const status = (proposals[proposalKey(messageId, action.id)] ?? PENDING).status;
      return status === "pending" || status === "failed";
    });
    if (!wanted.length) return;

    const keys = wanted.map((action) => proposalKey(messageId, action.id));
    setProposals((prior) => {
      const next = { ...prior };
      for (const key of keys) next[key] = { status: "applying" };
      return next;
    });

    // The server takes at most ASSISTANT_APPLY_MAX per call; order is kept across batches.
    for (let i = 0; i < wanted.length; i += ASSISTANT_APPLY_MAX) {
      const batch = wanted.slice(i, i + ASSISTANT_APPLY_MAX);
      let states: Record<string, ProposalState>;
      try {
        const { results } = await api.assistant.apply(batch);
        states = {};
        for (const action of batch) {
          const result = results.find((r) => r.id === action.id);
          states[proposalKey(messageId, action.id)] = !result
            ? { status: "failed", error: "Aucun résultat pour cette proposition." }
            : result.ok
              ? { status: "applied", recordId: result.recordId, href: result.href, summary: result.summary }
              : { status: "failed", error: result.error };
        }
      } catch (e) {
        const reason = errorReason(e) || "L'application a échoué.";
        states = Object.fromEntries(batch.map((action) => [proposalKey(messageId, action.id), { status: "failed", error: reason } as ProposalState]));
      }
      if (!liveRef.current) return;
      setProposals((prior) => ({ ...prior, ...states }));
      const applied = batch.filter((action) => states[proposalKey(messageId, action.id)]?.status === "applied").map((action) => action.kind);
      if (applied.length) notifyAssistantApplied(applied);
    }
  }, [messages, proposals]);

  return {
    messages,
    pending,
    error,
    disabled: error?.code === "disabled",
    proposals,
    send,
    abort,
    reset,
    apply,
    ignore,
    proposalState,
  };
}

// Only role and content go on the wire; long answers are cut so an old message never makes a later send fail validation.
function toWire(messages: AssistantChatMessage[]): ChatMessage[] {
  return messages
    .slice(-ASSISTANT_MESSAGES_KEPT)
    .filter((m) => m.role === "user" || m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, ASSISTANT_MESSAGE_MAX) }));
}

function compactContext(context?: AssistantSelection): AssistantSelection | undefined {
  if (!context) return undefined;
  const out: AssistantSelection = {};
  if (context.eventId) out.eventId = context.eventId;
  if (context.date) out.date = context.date;
  if (context.recipeId) out.recipeId = context.recipeId;
  if (context.clientId) out.clientId = context.clientId;
  if (context.path) out.path = context.path;
  return Object.keys(out).length ? out : undefined;
}

// Storage access is guarded: Safari private mode throws on read as well as write.
function readStored(): Stored {
  try {
    const raw = sessionStorage.getItem(ASSISTANT_STORAGE_KEY);
    if (!raw) return { messages: [], proposals: {} };
    const parsed = JSON.parse(raw) as Partial<Stored> | null;
    const messages = Array.isArray(parsed?.messages) ? parsed.messages.filter(isStoredMessage) : [];
    const proposals = parsed?.proposals && typeof parsed.proposals === "object" ? parsed.proposals : {};
    return { messages, proposals: pruneProposals(messages, proposals) };
  } catch {
    return { messages: [], proposals: {} };
  }
}

function isStoredMessage(value: unknown): value is AssistantChatMessage {
  const m = value as Partial<AssistantChatMessage> | null;
  return Boolean(m && typeof m.id === "string" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string");
}

function writeStored(messages: AssistantChatMessage[], proposals: Record<string, ProposalState>): void {
  try {
    if (!messages.length) {
      sessionStorage.removeItem(ASSISTANT_STORAGE_KEY);
      return;
    }
    const kept = messages.slice(-ASSISTANT_MESSAGES_STORED);
    // A card still applying when the tab reloads comes back as pending.
    const states = Object.fromEntries(
      Object.entries(pruneProposals(kept, proposals)).map(([key, state]) => [key, state.status === "applying" ? PENDING : state]),
    );
    sessionStorage.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify({ messages: kept, proposals: states } satisfies Stored));
  } catch {
    // The conversation still works for this page load.
  }
}

function pruneProposals(messages: AssistantChatMessage[], proposals: Record<string, ProposalState>): Record<string, ProposalState> {
  const ids = new Set(messages.map((m) => m.id));
  return Object.fromEntries(Object.entries(proposals).filter(([key]) => ids.has(key.slice(0, key.indexOf(":")))));
}

function clearStored(): void {
  try {
    sessionStorage.removeItem(ASSISTANT_STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}
