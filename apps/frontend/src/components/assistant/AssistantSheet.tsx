import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import Sheet, { clampWidth } from "@/components/ui/Sheet";
import { useAssistantChat } from "@/hooks/use-assistant-chat";
import { useMediaQuery } from "@/hooks/use-media-query";
import { onAssistantCompose, onAssistantToggle } from "@/lib/assistant-compose";
import { clearAssistantSelection, toAssistantContext, useAssistantSelection } from "@/lib/assistant-context";
import ChatPanel, { type ChatPanelHandle } from "./ChatPanel";

// The assistant as one right-hand sheet, mounted once in the admin layout so it exists on every page and keeps its thread across routes.
// Opened by the sidebar cell, ⌘⇧L / Ctrl+Shift+L, the assistant:toggle and assistant:compose window events, and ?assistant=open.

export const ASSISTANT_SHEET_PREFS_KEY = "recipe-book:assistant-sheet";
export const ASSISTANT_SHEET_WIDTH_MIN = 420;
export const ASSISTANT_SHEET_WIDTH_MAX = 720;
export const ASSISTANT_SHEET_WIDTH_DEFAULT = 480;
// Below this the sheet is a modal panel over the page; floating and docking need the room.
export const ASSISTANT_DOCK_QUERY = "(min-width: 1100px)";
const OPEN_PARAM = "assistant";
// The sheet never takes more than this share of a wide viewport.
const WIDTH_MAX_VIEWPORT = 0.6;

export type AssistantSheetPrefs = { width: number; docked: boolean };

const DEFAULT_PREFS: AssistantSheetPrefs = { width: ASSISTANT_SHEET_WIDTH_DEFAULT, docked: false };

// Open state as a module store so the sidebar cell reads aria-pressed without a context.
let openState = false;
const openListeners = new Set<() => void>();

function setAssistantOpen(next: boolean): void {
  if (next === openState) return;
  openState = next;
  openListeners.forEach((listener) => listener());
}

function subscribeOpen(listener: () => void) {
  openListeners.add(listener);
  return () => {
    openListeners.delete(listener);
  };
}

export function isAssistantOpen(): boolean {
  return openState;
}

export function useAssistantOpen(): boolean {
  return useSyncExternalStore(subscribeOpen, isAssistantOpen, () => false);
}

export interface AssistantSheetProps {
  // False renders nothing and ignores the shortcuts (health.assistant false, the cook page); the thread is kept.
  enabled?: boolean;
}

export default function AssistantSheet({ enabled = true }: AssistantSheetProps) {
  const open = useAssistantOpen();
  const location = useLocation();
  const [draft, setDraft] = useState("");
  const [prefs, setPrefs] = useState<AssistantSheetPrefs>(readPrefs);
  const [composeTick, setComposeTick] = useState(0);
  const wide = useMediaQuery(ASSISTANT_DOCK_QUERY);
  const viewportWidth = useViewportWidth();
  const chat = useAssistantChat();
  const selection = useAssistantSelection();
  const panelRef = useRef<ChatPanelHandle>(null);
  const reset = chat.reset;

  useEffect(() => {
    writePrefs(prefs);
  }, [prefs]);

  // ?assistant=open in any URL lands with the sheet open.
  useEffect(() => {
    if (enabled && new URLSearchParams(location.search).get(OPEN_PARAM) === "open") setAssistantOpen(true);
  }, [enabled, location.search]);

  useEffect(() => {
    if (!enabled) return;
    return onAssistantToggle((next) => setAssistantOpen(next ?? !openState));
  }, [enabled]);

  // Text handed over by a page lands in the composer; a half-written draft is kept above it.
  useEffect(() => {
    if (!enabled) return;
    return onAssistantCompose((text) => {
      setDraft((prior) => (prior.trim() ? `${prior.trimEnd()}\n${text}` : text));
      setAssistantOpen(true);
      setComposeTick((n) => n + 1);
    });
  }, [enabled]);

  // The Sheet focuses the composer on open; this pass places the caret after a compose or a kept draft.
  useEffect(() => {
    if (!enabled || !open) return;
    const id = requestAnimationFrame(() => panelRef.current?.focusComposer());
    return () => cancelAnimationFrame(id);
  }, [enabled, open, composeTick]);

  // ⌘⇧L / Ctrl+Shift+L toggles anywhere; ⌘⇧O / Ctrl+Shift+O starts a new conversation while open. Escape inside the sheet is the Sheet's.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "l") {
        event.preventDefault();
        setAssistantOpen(!openState);
      } else if (key === "o" && openState) {
        event.preventDefault();
        reset();
        panelRef.current?.focusComposer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, reset]);

  if (!enabled) return null;

  const docked = wide && prefs.docked;
  const maxWidth = Math.max(ASSISTANT_SHEET_WIDTH_MIN, Math.min(ASSISTANT_SHEET_WIDTH_MAX, Math.round(viewportWidth * WIDTH_MAX_VIEWPORT)));
  const width = clampWidth(prefs.width, ASSISTANT_SHEET_WIDTH_MIN, maxWidth);
  const close = () => setAssistantOpen(false);

  const submit = (text: string) => {
    if (chat.send(text, toAssistantContext(selection, location.pathname))) setDraft("");
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      side="right"
      mode={wide ? (docked ? "docked" : "floating") : undefined}
      width={wide ? width : undefined}
      resizable={wide ? { min: ASSISTANT_SHEET_WIDTH_MIN, max: maxWidth, onResize: (next) => setPrefs((prior) => ({ ...prior, width: next })) } : undefined}
      aria-label="Assistant"
    >
      <ChatPanel
        ref={panelRef}
        chat={chat}
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={submit}
        selection={selection}
        onDropSelection={clearAssistantSelection}
        docked={docked}
        onToggleDock={wide ? () => setPrefs((prior) => ({ ...prior, docked: !prior.docked })) : undefined}
        onClose={close}
      />
    </Sheet>
  );
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? ASSISTANT_SHEET_WIDTH_MAX * 2 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

// Storage access is guarded: Safari private mode throws on read as well as write.
function readPrefs(): AssistantSheetPrefs {
  try {
    const raw = localStorage.getItem(ASSISTANT_SHEET_PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<AssistantSheetPrefs> | null;
    return {
      width: clampWidth(typeof parsed?.width === "number" ? parsed.width : ASSISTANT_SHEET_WIDTH_DEFAULT, ASSISTANT_SHEET_WIDTH_MIN, ASSISTANT_SHEET_WIDTH_MAX),
      docked: parsed?.docked === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(prefs: AssistantSheetPrefs): void {
  try {
    localStorage.setItem(ASSISTANT_SHEET_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // A sheet that cannot remember its width still works for this page load.
  }
}
