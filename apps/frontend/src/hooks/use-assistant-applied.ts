import { useEffect, useRef } from "react";
import type { ProposedActionKind } from "@packages/types";

// The chat hook raises this after a batch of proposals lands, so the page behind the sheet re-reads its data.
export const ASSISTANT_APPLIED_EVENT = "recipe-book:assistant-applied";

export type AssistantAppliedDetail = { kinds: ProposedActionKind[] };

export function notifyAssistantApplied(kinds: ProposedActionKind[]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AssistantAppliedDetail>(ASSISTANT_APPLIED_EVENT, { detail: { kinds } }));
}

export function useAssistantApplied(handler: (detail: AssistantAppliedDetail) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const onApplied = (event: Event) => handlerRef.current((event as CustomEvent<AssistantAppliedDetail>).detail);
    window.addEventListener(ASSISTANT_APPLIED_EVENT, onApplied);
    return () => window.removeEventListener(ASSISTANT_APPLIED_EVENT, onApplied);
  }, []);
}
