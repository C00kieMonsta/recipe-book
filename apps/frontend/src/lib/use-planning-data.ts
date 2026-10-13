import { useCallback, useEffect, useMemo, useState } from "react";
import type { AddEventTaskRequest, AppEvent, AppSettings, Client, GroceryList, Ingredient, LedgerEntry, PatchEventTaskRequest, Person, PrepStatus, Recipe, WeekDay } from "@packages/types";
import { DEFAULT_COURSES } from "@packages/types";
import { api, ApiError, type EventInput } from "@/lib/api";

export interface LinePatch {
  prepStatus?: PrepStatus;
  portions?: number;
  notes?: string;
  assignedTo?: string[];
  // null clears the prep day back to the event day.
  prepDate?: string | null;
}

export type TaskPatch = PatchEventTaskRequest;

export interface PlanningData {
  events: AppEvent[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  settings: AppSettings | null;
  clients: Client[];
  // False when the clients table is missing (503), the same rule as ledgerConfigured.
  clientsConfigured: boolean;
  entries: LedgerEntry[];
  ledgerConfigured: boolean;
  // Loaded only with { withLists: true }; empty on failure.
  groceryLists: GroceryList[];
  people: Person[];
  recipeById: Map<string, Recipe>;
  clientById: Map<string, Client>;
  ingredientById: Map<string, Ingredient>;
  courses: string[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  replaceEvent: (event: AppEvent) => void;
  patchEvent: (eventId: string, patch: EventInput) => Promise<AppEvent>;
  patchLine: (eventId: string, lineId: string, patch: LinePatch) => Promise<AppEvent>;
  addTask: (eventId: string, task: AddEventTaskRequest) => Promise<AppEvent>;
  patchTask: (eventId: string, taskId: string, patch: TaskPatch) => Promise<AppEvent>;
  removeTask: (eventId: string, taskId: string) => Promise<AppEvent>;
}

export interface PlanningDataOptions {
  withLists?: boolean;
}

const is503 = (e: unknown) => e instanceof ApiError && e.status === 503;

interface Snapshot {
  key: string;
  events: AppEvent[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  settings: AppSettings | null;
  clients: Client[];
  clientsConfigured: boolean;
  entries: LedgerEntry[];
  ledgerConfigured: boolean;
  groceryLists: GroceryList[];
}

// The last fetch, kept across mounts so the next planning page renders with content instead of « Chargement… ».
let last: Snapshot | null = null;

const snapshotKey = (ledgerYear: string | number | undefined, withLists: boolean) => `${ledgerYear}|${withLists}`;

// Loads events, recipes, ingredients, settings and clients; the ledger only when a year is given.
export function usePlanningData(ledgerYear?: string | number, options: PlanningDataOptions = {}): PlanningData {
  const withLists = options.withLists === true;
  const key = snapshotKey(ledgerYear, withLists);
  const cached = last?.key === key ? last : null;
  const [events, setEvents] = useState<AppEvent[]>(() => cached?.events ?? []);
  const [recipes, setRecipes] = useState<Recipe[]>(() => cached?.recipes ?? []);
  const [ingredients, setIngredients] = useState<Ingredient[]>(() => cached?.ingredients ?? []);
  const [settings, setSettings] = useState<AppSettings | null>(() => cached?.settings ?? null);
  const [clients, setClients] = useState<Client[]>(() => cached?.clients ?? []);
  const [clientsConfigured, setClientsConfigured] = useState(cached?.clientsConfigured ?? true);
  const [entries, setEntries] = useState<LedgerEntry[]>(() => cached?.entries ?? []);
  const [ledgerConfigured, setLedgerConfigured] = useState(cached?.ledgerConfigured ?? true);
  const [groceryLists, setGroceryLists] = useState<GroceryList[]>(() => cached?.groceryLists ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    let clientsOk = true;
    let ledgerOk = true;
    // A refetch over a snapshot keeps the content on screen.
    if (last?.key !== key) setLoading(true);
    setError(null);
    Promise.all([
      api.events.list(),
      api.recipes.list(),
      api.ingredients.list(),
      api.settings.get(),
      api.clients.list().then(
        (cl) => { setClientsConfigured(true); return cl; },
        (e: unknown) => { if (is503(e)) { clientsOk = false; setClientsConfigured(false); return [] as Client[]; } throw e; },
      ),
      ledgerYear === undefined
        ? Promise.resolve([] as LedgerEntry[])
        : api.ledger.list(String(ledgerYear)).then(
            (en) => { setLedgerConfigured(true); return en; },
            (e: unknown) => { if (is503(e)) { ledgerOk = false; setLedgerConfigured(false); return [] as LedgerEntry[]; } throw e; },
          ),
      withLists ? api.groceryLists.list().catch(() => [] as GroceryList[]) : Promise.resolve([] as GroceryList[]),
    ])
      .then(([ev, re, ing, se, cl, en, gl]) => {
        if (cancelled) return;
        last = { key, events: ev, recipes: re, ingredients: ing, settings: se, clients: cl, clientsConfigured: clientsOk, entries: en, ledgerConfigured: ledgerOk, groceryLists: gl };
        setEvents(ev); setRecipes(re); setIngredients(ing); setSettings(se); setClients(cl); setEntries(en); setGroceryLists(gl);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Erreur de chargement"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [key, ledgerYear, withLists, tick]);

  const replaceEvent = useCallback((event: AppEvent) => {
    if (last) last = { ...last, events: last.events.map((e) => (e.eventId === event.eventId ? event : e)) };
    setEvents((prev) => prev.map((e) => (e.eventId === event.eventId ? event : e)));
  }, []);

  const patchEvent = useCallback(async (eventId: string, patch: EventInput) => {
    const updated = await api.events.update(eventId, patch);
    replaceEvent(updated);
    return updated;
  }, [replaceEvent]);

  const patchLine = useCallback(async (eventId: string, lineId: string, patch: LinePatch) => {
    const updated = await api.events.lines.patch(eventId, lineId, patch);
    replaceEvent(updated);
    return updated;
  }, [replaceEvent]);

  const addTask = useCallback(async (eventId: string, task: AddEventTaskRequest) => {
    const updated = await api.events.tasks.add(eventId, task);
    replaceEvent(updated);
    return updated;
  }, [replaceEvent]);

  const patchTask = useCallback(async (eventId: string, taskId: string, patch: TaskPatch) => {
    const updated = await api.events.tasks.patch(eventId, taskId, patch);
    replaceEvent(updated);
    return updated;
  }, [replaceEvent]);

  const removeTask = useCallback(async (eventId: string, taskId: string) => {
    const updated = await api.events.tasks.remove(eventId, taskId);
    replaceEvent(updated);
    return updated;
  }, [replaceEvent]);

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r])), [recipes]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.clientId, c])), [clients]);
  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.ingredientId, i])), [ingredients]);
  const courses = useMemo(() => (settings?.courses?.length ? settings.courses : DEFAULT_COURSES), [settings]);
  const people = useMemo(() => settings?.people ?? [], [settings]);

  return {
    events, recipes, ingredients, settings, clients, clientsConfigured, entries, ledgerConfigured, groceryLists, people,
    recipeById, clientById, ingredientById, courses,
    loading, error, reload, replaceEvent, patchEvent, patchLine, addTask, patchTask, removeTask,
  };
}

export function prestationLabel(settings: AppSettings | null, key?: string): string | undefined {
  if (!key) return undefined;
  return settings?.prestationTypes?.find((p) => p.key === key)?.label ?? key;
}

const eur0 = new Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// "1 240 €"
export function fmtEur0(n: number): string {
  return eur0.format(n || 0);
}

export const NEXT_STATUS: Record<PrepStatus, PrepStatus> = { todo: "doing", doing: "done", done: "todo" };

export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

// « aucun événement » | « 1 évén. · 9 conv. » | « 1 évén. · 9 conv. · 0/1 faites »
export function dayHeaderMeta(d: WeekDay, started: boolean): string {
  if (d.events.length === 0) return "aucun événement";
  const base = `${d.events.length} évén. · ${d.guests} conv.`;
  return started && d.linesTotal > 0 ? `${base} · ${d.linesDone}/${d.linesTotal} faites` : base;
}

// « 1 événement · 9 convives · 0 lignes faites sur 1 »
export function dayHeaderTitle(d: WeekDay, started: boolean): string {
  return `${plural(d.events.length, "événement")} · ${plural(d.guests, "convive")}${started && d.linesTotal ? ` · ${d.linesDone} ${d.linesDone === 1 ? "ligne faite" : "lignes faites"} sur ${d.linesTotal}` : ""}`;
}
