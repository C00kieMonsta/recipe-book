import type { Ingredient, Recipe, AppSettings, AppEvent } from "@packages/types";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const TOKEN_KEY = "admin_token";

function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

function handleUnauthorized() {
  sessionStorage.removeItem(TOKEN_KEY);
  window.location.href = "/login";
}

async function parseResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    const msg = Array.isArray(data.message) ? data.message.join(", ") : (data.message || data.error || `Request failed: ${res.status}`);
    throw new Error(msg);
  }
  return data;
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts?.headers as Record<string, string>) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (res.status === 401) { handleUnauthorized(); throw new Error("Unauthorized"); }
  return parseResponse<T>(res);
}

async function uploadRequest<T>(path: string, file: File): Promise<T> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: form });
  if (res.status === 401) { handleUnauthorized(); throw new Error("Unauthorized"); }
  return parseResponse<T>(res);
}

// ── Simple TTL cache ────────────────────────────────────────────────────────
const DEFAULT_TTL = 30_000; // 30 seconds
const SETTINGS_TTL = 120_000; // settings change rarely

interface CacheEntry<T> { data: T; ts: number; promise?: Promise<T> }
const cache = new Map<string, CacheEntry<unknown>>();

function cached<T>(key: string, fetcher: () => Promise<T>, ttl = DEFAULT_TTL): () => Promise<T> {
  return async () => {
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    if (entry) {
      if (entry.promise) return entry.promise;
      if (Date.now() - entry.ts < ttl) return entry.data;
    }
    const promise = fetcher().then((data) => {
      cache.set(key, { data, ts: Date.now() });
      return data;
    }).catch((err) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, { ...entry, promise, data: entry?.data as T, ts: entry?.ts ?? 0 });
    return promise;
  };
}

function invalidate(...keys: string[]) {
  for (const k of keys) cache.delete(k);
}

function withInvalidate<T>(keys: string[], fn: () => Promise<T>): () => Promise<T>;
function withInvalidate<A, T>(keys: string[], fn: (a: A) => Promise<T>): (a: A) => Promise<T>;
function withInvalidate<A, B, T>(keys: string[], fn: (a: A, b: B) => Promise<T>): (a: A, b: B) => Promise<T>;
function withInvalidate(keys: string[], fn: (...args: unknown[]) => Promise<unknown>) {
  return (...args: unknown[]) => fn(...args).then((result) => { invalidate(...keys); return result; });
}

// ── API ─────────────────────────────────────────────────────────────────────
export const api = {
  ingredients: {
    list: cached("ingredients", () => request<Ingredient[]>("/admin/ingredients")),
    get: (id: string) => request<Ingredient>(`/admin/ingredients/${id}`),
    create: withInvalidate(["ingredients"], (data: Partial<Ingredient>) => request<Ingredient>("/admin/ingredients", { method: "POST", body: JSON.stringify(data) })),
    update: withInvalidate(["ingredients"], (id: string, data: Partial<Ingredient>) => request<Ingredient>(`/admin/ingredients/${id}`, { method: "PATCH", body: JSON.stringify(data) })),
    delete: withInvalidate(["ingredients"], (id: string) => request<{ ok: boolean }>(`/admin/ingredients/${id}`, { method: "DELETE" })),
    import: withInvalidate(["ingredients"], (rows: unknown[]) => request<{ created: number; updated: number }>("/admin/ingredients/import", { method: "POST", body: JSON.stringify(rows) })),
    deduplicate: withInvalidate(["ingredients"], () => request<{ removed: number }>("/admin/ingredients/deduplicate", { method: "POST" })),
  },
  recipes: {
    list: cached("recipes", () => request<Recipe[]>("/admin/recipes")),
    get: (id: string) => request<Recipe>(`/admin/recipes/${id}`),
    create: withInvalidate(["recipes"], (data: Partial<Recipe>) => request<Recipe>("/admin/recipes", { method: "POST", body: JSON.stringify(data) })),
    update: withInvalidate(["recipes"], (id: string, data: Partial<Recipe>) => request<Recipe>(`/admin/recipes/${id}`, { method: "PATCH", body: JSON.stringify(data) })),
    delete: withInvalidate(["recipes"], (id: string) => request<{ ok: boolean }>(`/admin/recipes/${id}`, { method: "DELETE" })),
    import: withInvalidate(["recipes"], (rows: unknown[]) => request<{ created: number; skipped: number; unmatchedIngredients: string[] }>("/admin/recipes/import", { method: "POST", body: JSON.stringify(rows) })),
    uploadPhoto: (file: File) => uploadRequest<{ key: string; url: string }>("/admin/recipes/upload-photo", file),
  },
  settings: {
    get: cached("settings", () => request<AppSettings>("/admin/settings"), SETTINGS_TTL),
    update: withInvalidate(["settings"], (data: Partial<AppSettings>) => request<AppSettings>("/admin/settings", { method: "PATCH", body: JSON.stringify(data) })),
  },
  events: {
    list: cached("events", () => request<AppEvent[]>("/admin/events")),
    get: (id: string) => request<AppEvent>(`/admin/events/${id}`),
    create: withInvalidate(["events"], (data: Partial<AppEvent>) => request<AppEvent>("/admin/events", { method: "POST", body: JSON.stringify(data) })),
    update: withInvalidate(["events"], (id: string, data: Partial<AppEvent>) => request<AppEvent>(`/admin/events/${id}`, { method: "PATCH", body: JSON.stringify(data) })),
    delete: withInvalidate(["events"], (id: string) => request<{ ok: boolean }>(`/admin/events/${id}`, { method: "DELETE" })),
  },
};
