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

export const api = {
  ingredients: {
    list: () => request<Ingredient[]>("/admin/ingredients"),
    get: (id: string) => request<Ingredient>(`/admin/ingredients/${id}`),
    create: (data: Partial<Ingredient>) => request<Ingredient>("/admin/ingredients", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Ingredient>) => request<Ingredient>(`/admin/ingredients/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<{ ok: boolean }>(`/admin/ingredients/${id}`, { method: "DELETE" }),
    import: (rows: unknown[]) => request<{ created: number; updated: number }>("/admin/ingredients/import", { method: "POST", body: JSON.stringify(rows) }),
    deduplicate: () => request<{ removed: number }>("/admin/ingredients/deduplicate", { method: "POST" }),
  },
  recipes: {
    list: () => request<Recipe[]>("/admin/recipes"),
    get: (id: string) => request<Recipe>(`/admin/recipes/${id}`),
    create: (data: Partial<Recipe>) => request<Recipe>("/admin/recipes", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Recipe>) => request<Recipe>(`/admin/recipes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<{ ok: boolean }>(`/admin/recipes/${id}`, { method: "DELETE" }),
    import: (rows: unknown[]) => request<{ created: number; skipped: number; unmatchedIngredients: string[] }>("/admin/recipes/import", { method: "POST", body: JSON.stringify(rows) }),
    uploadPhoto: (file: File) => uploadRequest<{ key: string; url: string }>("/admin/recipes/upload-photo", file),
  },
  settings: {
    get: () => request<AppSettings>("/admin/settings"),
    update: (data: Partial<AppSettings>) => request<AppSettings>("/admin/settings", { method: "PATCH", body: JSON.stringify(data) }),
  },
  events: {
    list: () => request<AppEvent[]>("/admin/events"),
    get: (id: string) => request<AppEvent>(`/admin/events/${id}`),
    create: (data: Partial<AppEvent>) => request<AppEvent>("/admin/events", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<AppEvent>) => request<AppEvent>(`/admin/events/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<{ ok: boolean }>(`/admin/events/${id}`, { method: "DELETE" }),
  },
};
