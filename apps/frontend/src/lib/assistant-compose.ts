// Window events reach the assistant sheet from any page, menu or shortcut without a shared React context.

const COMPOSE_EVENT = "assistant:compose";
const TOGGLE_EVENT = "assistant:toggle";

export type AssistantToggleDetail = { open?: boolean };

// Puts text in the composer without sending it, and opens the sheet.
export function composeInAssistant(text: string): void {
  window.dispatchEvent(new CustomEvent<string>(COMPOSE_EVENT, { detail: text }));
}

export function onAssistantCompose(handler: (text: string) => void): () => void {
  const listener = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail === "string") handler(event.detail);
  };
  window.addEventListener(COMPOSE_EVENT, listener);
  return () => window.removeEventListener(COMPOSE_EVENT, listener);
}

// Opens or closes the sheet. With `open` given, forces that state instead of flipping.
export function toggleAssistant(open?: boolean): void {
  window.dispatchEvent(new CustomEvent<AssistantToggleDetail>(TOGGLE_EVENT, { detail: { open } }));
}

export function openAssistant(): void {
  toggleAssistant(true);
}

export function closeAssistant(): void {
  toggleAssistant(false);
}

export function onAssistantToggle(handler: (open?: boolean) => void): () => void {
  const listener = (event: Event) => {
    const detail = event instanceof CustomEvent ? (event.detail as AssistantToggleDetail | null) : null;
    handler(typeof detail?.open === "boolean" ? detail.open : undefined);
  };
  window.addEventListener(TOGGLE_EVENT, listener);
  return () => window.removeEventListener(TOGGLE_EVENT, listener);
}
