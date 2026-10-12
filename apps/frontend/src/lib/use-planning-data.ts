import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppEvent, AppSettings, Client, GroceryList, Ingredient, LedgerEntry, Person, PrepStatus, Recipe } from "@packages/types";
import { DEFAULT_COURSES } from "@packages/types";
import { api, ApiError, type EventInput } from "@/lib/api";

export interface LinePatch {
  prepStatus?: PrepStatus;
  portions?: number;
  notes?: string;
  assignedTo?: string[];
}

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
}

export interface PlanningDataOptions {
  withLists?: boolean;
}

const is503 = (e: unknown) => e instanceof ApiError && e.status === 503;

// Loads events, recipes, ingredients, settings and clients; the ledger only when a year is given.
export function usePlanningData(ledgerYear?: string | number, options: PlanningDataOptions = {}): PlanningData {
  const withLists = options.withLists === true;
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsConfigured, setClientsConfigured] = useState(true);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [ledgerConfigured, setLedgerConfigured] = useState(true);
  const [groceryLists, setGroceryLists] = useState<GroceryList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.events.list(),
      api.recipes.list(),
      api.ingredients.list(),
      api.settings.get(),
      api.clients.list().then(
        (cl) => { setClientsConfigured(true); return cl; },
        (e: unknown) => { if (is503(e)) { setClientsConfigured(false); return [] as Client[]; } throw e; },
      ),
      ledgerYear === undefined
        ? Promise.resolve([] as LedgerEntry[])
        : api.ledger.list(String(ledgerYear)).then(
            (en) => { setLedgerConfigured(true); return en; },
            (e: unknown) => { if (is503(e)) { setLedgerConfigured(false); return [] as LedgerEntry[]; } throw e; },
          ),
      withLists ? api.groceryLists.list().catch(() => [] as GroceryList[]) : Promise.resolve([] as GroceryList[]),
    ])
      .then(([ev, re, ing, se, cl, en, gl]) => {
        if (cancelled) return;
        setEvents(ev); setRecipes(re); setIngredients(ing); setSettings(se); setClients(cl); setEntries(en); setGroceryLists(gl);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Erreur de chargement"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ledgerYear, withLists, tick]);

  const replaceEvent = useCallback((event: AppEvent) => {
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

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r])), [recipes]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.clientId, c])), [clients]);
  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.ingredientId, i])), [ingredients]);
  const courses = useMemo(() => (settings?.courses?.length ? settings.courses : DEFAULT_COURSES), [settings]);
  const people = useMemo(() => settings?.people ?? [], [settings]);

  return {
    events, recipes, ingredients, settings, clients, clientsConfigured, entries, ledgerConfigured, groceryLists, people,
    recipeById, clientById, ingredientById, courses,
    loading, error, reload, replaceEvent, patchEvent, patchLine,
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
