import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppEvent, AppSettings, Client, Ingredient, InvoicingMode, LedgerEntry, Recipe, ReportInputs } from "@packages/types";
import { calcRecipeCost } from "@packages/types";
import { api, ApiError } from "@/lib/api";

export interface ReportData {
  inputs: ReportInputs | null;
  entries: LedgerEntry[];
  events: AppEvent[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  settings: AppSettings | null;
  // "app" until the settings load or when unset; the comptes pages and the event page read this one value.
  invoicing: InvoicingMode;
  clients: Client[];
  loading: boolean;
  /** True when the ledger table is not provisioned yet (API answered 503). */
  notConfigured: boolean;
  error: string | null;
  reload: () => void;
}

/** Loads everything the Comptabilité pages and the event billing section need for one year; ledger entries cover N, N-1 and N-2. */
export function useReportInputs(year: string | number): ReportData {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const y = Number(year);
    // Prior-year figures and the invoice prefill read N-1 and N-2 from the same array.
    const ledgerYear = (yr: number) =>
      api.ledger.list(String(yr)).catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 503) { setNotConfigured(true); return [] as LedgerEntry[]; }
        throw e;
      });
    Promise.all([
      Promise.all([y, y - 1, y - 2].map(ledgerYear)).then((lists) => lists.flat()),
      api.events.list(),
      api.recipes.list(),
      api.ingredients.list(),
      api.settings.get(),
      api.clients.list().catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 503) return [] as Client[];
        throw e;
      }),
    ])
      .then(([en, ev, re, ing, se, cl]) => {
        if (cancelled) return;
        setEntries(en); setEvents(ev); setRecipes(re); setIngredients(ing); setSettings(se); setClients(cl);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Erreur de chargement"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, tick]);

  const inputs = useMemo<ReportInputs | null>(() => {
    if (!settings) return null;
    const ingredientById = new Map(ingredients.map((i) => [i.ingredientId, i]));
    const recipeCostById = new Map(recipes.map((r) => [r.recipeId, calcRecipeCost(r, ingredientById)]));
    const recipePortionsById = new Map(recipes.map((r) => [r.recipeId, r.portions || 1]));
    return { entries, events, recipeCostById, recipePortionsById, settings, clients };
  }, [entries, events, recipes, ingredients, settings, clients]);

  const invoicing: InvoicingMode = settings?.invoicing ?? "app";

  return { inputs, entries, events, recipes, ingredients, settings, invoicing, clients, loading, notConfigured, error, reload };
}
