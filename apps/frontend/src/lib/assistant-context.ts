import { useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import type { AssistantSelection } from "@packages/types";

// What the page is showing, sent with every assistant message. A module store because the sheet lives in the layout, not in the page tree.
// The selection is tagged with the pathname it was published for and reads as empty once the path has changed, so an event id never leaks onto the next page.

export type AssistantPageSelection = Pick<AssistantSelection, "eventId" | "date" | "recipeId" | "clientId"> & {
  // Shown in the header chip (« Mariage Dupont · sam. 17 »); never sent to the server.
  label?: string;
};

const EMPTY: AssistantPageSelection = {};

let selection: AssistantPageSelection = EMPTY;
let selectionPath: string | null = null;
const listeners = new Set<() => void>();

function currentPath(): string | null {
  return typeof window === "undefined" ? null : window.location.pathname;
}

function compact(input: AssistantPageSelection): AssistantPageSelection {
  const out: AssistantPageSelection = {};
  if (input.eventId) out.eventId = input.eventId;
  if (input.date) out.date = input.date;
  if (input.recipeId) out.recipeId = input.recipeId;
  if (input.clientId) out.clientId = input.clientId;
  if (input.label) out.label = input.label;
  return out;
}

function same(a: AssistantPageSelection, b: AssistantPageSelection): boolean {
  return a.eventId === b.eventId && a.date === b.date && a.recipeId === b.recipeId && a.clientId === b.clientId && a.label === b.label;
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function publishAssistantSelection(input: AssistantPageSelection): void {
  const next = compact(input);
  const path = currentPath();
  if (path === selectionPath && same(selection, next)) return;
  selection = next;
  selectionPath = path;
  notify();
}

// For the chip's ×: the page keeps showing its record, the next message goes without it.
export function clearAssistantSelection(): void {
  if (selection === EMPTY) return;
  selection = EMPTY;
  notify();
}

export function readAssistantSelection(pathname: string | null = currentPath()): AssistantPageSelection {
  return selectionPath === pathname ? selection : EMPTY;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function hasAssistantSelection(value: AssistantPageSelection): boolean {
  return Boolean(value.eventId || value.date || value.recipeId || value.clientId);
}

// The router location is read so a navigation re-reads the snapshot; the store itself does not watch the URL.
export function useAssistantSelection(): AssistantPageSelection {
  const { pathname } = useLocation();
  const read = () => readAssistantSelection(pathname);
  return useSyncExternalStore(subscribe, read, read);
}

// The strict wire shape: ids plus the path, no label. Undefined when the page shows nothing.
export function toAssistantContext(value: AssistantPageSelection, pathname: string | null = currentPath()): AssistantSelection | undefined {
  if (!hasAssistantSelection(value)) return undefined;
  const out: AssistantSelection = {};
  if (value.eventId) out.eventId = value.eventId;
  if (value.date) out.date = value.date;
  if (value.recipeId) out.recipeId = value.recipeId;
  if (value.clientId) out.clientId = value.clientId;
  if (pathname) out.path = pathname.slice(0, 200);
  return out;
}
