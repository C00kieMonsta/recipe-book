import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppEvent, AppSettings, Client, Ingredient, LedgerEntry, PrepStatus, Recipe } from "@packages/types";
import { DEFAULT_COURSES } from "@packages/types";
import { api, ApiError } from "@/lib/api";

export interface PlanningData {
  events: AppEvent[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  settings: AppSettings | null;
  clients: Client[];
  entries: LedgerEntry[];
  ledgerConfigured: boolean;
  recipeById: Map<string, Recipe>;
  clientById: Map<string, Client>;
  ingredientById: Map<string, Ingredient>;
  courses: string[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  replaceEvent: (event: AppEvent) => void;
  patchLine: (eventId: string, lineId: string, patch: { prepStatus?: PrepStatus; portions?: number; notes?: string }) => Promise<AppEvent>;
}

const is503 = (e: unknown) => e instanceof ApiError && e.status === 503;

// Loads events, recipes, ingredients, settings and clients; the ledger only when a year is given.
export function usePlanningData(ledgerYear?: string | number): PlanningData {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [ledgerConfigured, setLedgerConfigured] = useState(true);
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
      api.clients.list().catch((e: unknown) => { if (is503(e)) return [] as Client[]; throw e; }),
      ledgerYear === undefined
        ? Promise.resolve([] as LedgerEntry[])
        : api.ledger.list(String(ledgerYear)).catch((e: unknown) => {
            if (is503(e)) { setLedgerConfigured(false); return [] as LedgerEntry[]; }
            throw e;
          }),
    ])
      .then(([ev, re, ing, se, cl, en]) => {
        if (cancelled) return;
        setEvents(ev); setRecipes(re); setIngredients(ing); setSettings(se); setClients(cl); setEntries(en);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Erreur de chargement"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ledgerYear, tick]);

  const replaceEvent = useCallback((event: AppEvent) => {
    setEvents((prev) => prev.map((e) => (e.eventId === event.eventId ? event : e)));
  }, []);

  const patchLine = useCallback(async (eventId: string, lineId: string, patch: { prepStatus?: PrepStatus; portions?: number; notes?: string }) => {
    const updated = await api.events.lines.patch(eventId, lineId, patch);
    replaceEvent(updated);
    return updated;
  }, [replaceEvent]);

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r])), [recipes]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.clientId, c])), [clients]);
  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.ingredientId, i])), [ingredients]);
  const courses = useMemo(() => (settings?.courses?.length ? settings.courses : DEFAULT_COURSES), [settings]);

  return {
    events, recipes, ingredients, settings, clients, entries, ledgerConfigured,
    recipeById, clientById, ingredientById, courses,
    loading, error, reload, replaceEvent, patchLine,
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
