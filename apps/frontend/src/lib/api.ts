import type {
  Ingredient,
  Recipe,
  AppSettings,
  AppEvent,
  EventRecipeLine,
  EventTask,
  GroceryList,
  Client,
  LedgerEntry,
  CreateClientRequest,
  UpdateClientRequest,
  InstantiateRequest,
  LinkEventsRequest,
  AddEventLineRequest,
  PatchEventLineRequest,
  PutEventLinesRequest,
  AddEventTaskRequest,
  PatchEventTaskRequest,
  CreateLedgerEntryRequest,
  PatchLedgerEntryRequest,
  LockMonthRequest,
  UnlockMonthRequest,
  MergeIngredientsRequest,
  DuplicateGroup,
  DuplicateMember,
  CostSnapshotRequest,
  Offer,
  CreateOfferRequest,
  UpdateOfferRequest,
  ImportLedgerRow,
  ImportIngredientsOptions,
  ProposedAction,
  ApplyResponse,
} from "@packages/types";

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
// The health route is also served under the api prefix so it goes through the same distribution path as the API.
const HEALTH_URL = `${API_BASE.replace(/\/$/, "")}/health`;
const TOKEN_KEY = "admin_token";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

// A device that chose "Rester connecté" keeps the token in localStorage; the tab-only token stays in sessionStorage.
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null, persist = false) {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (!token) return;
  (persist ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
}

// Sends the browser to the login page and keeps the current page so it reopens after signing in.
function handleUnauthorized() {
  setToken(null);
  const here = window.location.pathname + window.location.search;
  window.location.href = here.startsWith("/login") ? "/login" : `/login?next=${encodeURIComponent(here)}`;
}

async function parseResponse<T>(res: Response): Promise<T> {
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(apiErrorMessage(res.status, data), res.status, data);
  return data as T;
}

// The server's words for a failed call: a Nest message, a Zod issues array, or the status.
export function apiErrorMessage(status: number, body: unknown): string {
  const d = (body ?? {}) as { message?: unknown; error?: unknown };
  if (status === 413) return "Fichier trop volumineux";
  if (Array.isArray(d.message)) {
    return d.message.map((m) => (m && typeof m === "object" && "message" in m ? String((m as { message: unknown }).message) : String(m))).join(", ");
  }
  return (typeof d.message === "string" && d.message) || (typeof d.error === "string" && d.error) || `Request failed: ${status}`;
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts?.headers as Record<string, string>) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (res.status === 401) { handleUnauthorized(); throw new ApiError("Unauthorized", 401, null); }
  return parseResponse<T>(res);
}

async function uploadRequest<T>(path: string, file: File): Promise<T> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: form });
  if (res.status === 401) { handleUnauthorized(); throw new ApiError("Unauthorized", 401, null); }
  return parseResponse<T>(res);
}

const json = (method: "POST" | "PATCH" | "PUT", body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

// ── Simple TTL cache ────────────────────────────────────────────────────────
const DEFAULT_TTL = 30_000;
const SETTINGS_TTL = 30_000;

interface CacheEntry<T> { data: T; ts: number; promise?: Promise<T> }
const cache = new Map<string, CacheEntry<unknown>>();

function cached<T>(key: string, fetcher: () => Promise<T>, ttl = DEFAULT_TTL): () => Promise<T> {
  return async () => {
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    if (entry) {
      if (entry.promise) return entry.promise;
      if (Date.now() - entry.ts < ttl) return entry.data;
    }
    // Only the request that still owns the entry may store or clear it; invalidate() during the fetch leaves the key empty.
    let promise: Promise<T>;
    promise = fetcher().then((data) => {
      if (cache.get(key)?.promise === promise) cache.set(key, { data, ts: Date.now() });
      return data;
    }).catch((err) => {
      if (cache.get(key)?.promise === promise) cache.delete(key);
      throw err;
    });
    cache.set(key, { ...entry, promise, data: entry?.data as T, ts: entry?.ts ?? 0 });
    return promise;
  };
}

export function invalidate(...keys: string[]) {
  for (const k of keys) cache.delete(k);
}

function withInvalidate<T>(keys: string[], fn: () => Promise<T>): () => Promise<T>;
function withInvalidate<A, T>(keys: string[], fn: (a: A) => Promise<T>): (a: A) => Promise<T>;
function withInvalidate<A, B, T>(keys: string[], fn: (a: A, b: B) => Promise<T>): (a: A, b: B) => Promise<T>;
function withInvalidate<A, B, C, T>(keys: string[], fn: (a: A, b: B, c: C) => Promise<T>): (a: A, b: B, c: C) => Promise<T>;
function withInvalidate(keys: string[], fn: (...args: unknown[]) => Promise<unknown>) {
  return (...args: unknown[]) => fn(...args).then((result) => { invalidate(...keys); return result; });
}

// ── Response shapes ─────────────────────────────────────────────────────────
export type DuplicateMemberDetail = DuplicateMember & Pick<Ingredient, "price" | "supplier" | "updatedAt">;
export type DuplicateGroupDetail = Omit<DuplicateGroup, "members"> & { members: DuplicateMemberDetail[] };
export interface DuplicatesResponse { groups: DuplicateGroupDetail[] }

export type MergeResponse =
  | { ok: true; recipesUpdated: number; listsUpdated: number; removed: number; preexisting?: number }
  | { ok: false; recipesUpdated: number; listsUpdated: number; failures: unknown[]; preexisting?: number };

// Text fields the server clears when the update sends null or "".
type ClearableEventField = "contactName" | "contactPhone" | "contactEmail" | "deliveryAddress" | "deliveryTime" | "billingDetails";

// Lines and tasks sent on create or update may omit their id; the server fills it. Attachments only change through their own routes.
export type EventInput = Omit<Partial<AppEvent>, "recipes" | "tasks" | "costSnapshot" | "attachments" | ClearableEventField | "sellingTotal"> & {
  // The server stamps takenAt, so a client sends the request shape.
  costSnapshot?: CostSnapshotRequest;
  recipes?: (Omit<EventRecipeLine, "lineId"> & { lineId?: string })[];
  tasks?: (Omit<EventTask, "taskId"> & { taskId?: string })[];
  sellingTotal?: number | null;
} & { [K in ClearableEventField]?: string | null };

export interface ImportIngredientsResponse { created: number; updated: number; unmatched: string[]; notFound: string[] }
export interface ImportLedgerResponse { created: number; updated: number; skippedLocked: number; invalid: string[] }

export interface InstantiateResponse { created: AppEvent[]; skipped: string[] }
export interface LinkEventsResponse { linked: number }
export interface LockMonthResponse { locked: number }
export interface UnlockMonthResponse { unlocked: number }

export interface HealthResponse {
  status: string;
  tables: { clients: boolean; ledger: boolean };
  // True when the API has an OpenAI key source; the assistant cell and shortcut hide when false.
  assistant: boolean;
}

export interface CreateGroceryListRequest {
  title: string;
  items?: GroceryList["items"];
  eventIds?: string[];
  range?: { from: string; to: string };
}

const allRecipes = cached("recipes", () => request<Recipe[]>("/admin/recipes"));

function importQuery(options?: Partial<ImportIngredientsOptions>): string {
  const params = new URLSearchParams();
  if (options?.mode) params.set("mode", options.mode);
  if (options?.supplier?.trim()) params.set("supplier", options.supplier.trim());
  const q = params.toString();
  return q ? `?${q}` : "";
}

// ── API ─────────────────────────────────────────────────────────────────────
export const api = {
  health: {
    get: async (): Promise<HealthResponse> => parseResponse<HealthResponse>(await fetch(HEALTH_URL)),
  },
  ingredients: {
    list: cached("ingredients", () => request<Ingredient[]>("/admin/ingredients")),
    get: (id: string) => request<Ingredient>(`/admin/ingredients/${id}`),
    create: withInvalidate(["ingredients"], (data: Partial<Ingredient>) => request<Ingredient>("/admin/ingredients", json("POST", data))),
    update: withInvalidate(["ingredients"], (id: string, data: Partial<Ingredient>) => request<Ingredient>(`/admin/ingredients/${id}`, json("PATCH", data))),
    delete: withInvalidate(["ingredients", "recipes"], (id: string) => request<{ ok: boolean }>(`/admin/ingredients/${id}`, { method: "DELETE" })),
    import: withInvalidate(["ingredients"], (rows: unknown[], options?: Partial<ImportIngredientsOptions>) =>
      request<ImportIngredientsResponse>(`/admin/ingredients/import${importQuery(options)}`, json("POST", rows))),
    duplicates: () => request<DuplicatesResponse>("/admin/ingredients/duplicates"),
    merge: withInvalidate(["ingredients", "recipes"], (body: MergeIngredientsRequest) => request<MergeResponse>("/admin/ingredients/merge", json("POST", body))),
  },
  recipes: {
    // The whole list is cached; a category filter goes to the server uncached.
    list: (category?: string) => (category ? request<Recipe[]>(`/admin/recipes?category=${encodeURIComponent(category)}`) : allRecipes()),
    get: (id: string) => request<Recipe>(`/admin/recipes/${id}`),
    create: withInvalidate(["recipes"], (data: Partial<Recipe>) => request<Recipe>("/admin/recipes", json("POST", data))),
    update: withInvalidate(["recipes"], (id: string, data: Partial<Recipe>) => request<Recipe>(`/admin/recipes/${id}`, json("PATCH", data))),
    delete: withInvalidate(["recipes"], (id: string) => request<{ ok: boolean }>(`/admin/recipes/${id}`, { method: "DELETE" })),
    import: withInvalidate(["recipes"], (rows: unknown[]) => request<{ created: number; skipped: number; unmatchedIngredients: string[] }>("/admin/recipes/import", json("POST", rows))),
    uploadPhoto: (file: File) => uploadRequest<{ key: string; url: string }>("/admin/recipes/upload-photo", file),
  },
  settings: {
    get: cached("settings", () => request<AppSettings>("/admin/settings"), SETTINGS_TTL),
    update: withInvalidate(["settings"], (data: Partial<AppSettings>) => request<AppSettings>("/admin/settings", json("PATCH", data))),
  },
  events: {
    list: cached("events", () => request<AppEvent[]>("/admin/events")),
    get: (id: string) => request<AppEvent>(`/admin/events/${id}`),
    create: withInvalidate(["events"], (data: EventInput) => request<AppEvent>("/admin/events", json("POST", data))),
    update: withInvalidate(["events"], (id: string, data: EventInput) => request<AppEvent>(`/admin/events/${id}`, json("PATCH", data))),
    delete: withInvalidate(["events"], (id: string) => request<{ ok: boolean }>(`/admin/events/${id}`, { method: "DELETE" })),
    lines: {
      add: withInvalidate(["events"], (id: string, line: AddEventLineRequest) => request<AppEvent>(`/admin/events/${id}/lines`, json("POST", line))),
      patch: withInvalidate(["events"], (id: string, lineId: string, patch: PatchEventLineRequest) => request<AppEvent>(`/admin/events/${id}/lines/${lineId}`, json("PATCH", patch))),
      put: withInvalidate(["events"], (id: string, lines: PutEventLinesRequest["lines"]) => request<AppEvent>(`/admin/events/${id}/lines`, json("PUT", { lines }))),
      remove: withInvalidate(["events"], (id: string, lineId: string) => request<AppEvent>(`/admin/events/${id}/lines/${lineId}`, { method: "DELETE" })),
    },
    tasks: {
      add: withInvalidate(["events"], (id: string, task: AddEventTaskRequest) => request<AppEvent>(`/admin/events/${id}/tasks`, json("POST", task))),
      patch: withInvalidate(["events"], (id: string, taskId: string, patch: PatchEventTaskRequest) => request<AppEvent>(`/admin/events/${id}/tasks/${taskId}`, json("PATCH", patch))),
      remove: withInvalidate(["events"], (id: string, taskId: string) => request<AppEvent>(`/admin/events/${id}/tasks/${taskId}`, { method: "DELETE" })),
    },
    attachments: {
      add: withInvalidate(["events"], (id: string, file: File) => uploadRequest<AppEvent>(`/admin/events/${id}/attachments`, file)),
      rename: withInvalidate(["events"], (id: string, attachmentId: string, name: string) => request<AppEvent>(`/admin/events/${id}/attachments/${attachmentId}`, json("PATCH", { name }))),
      remove: withInvalidate(["events"], (id: string, attachmentId: string) => request<AppEvent>(`/admin/events/${id}/attachments/${attachmentId}`, { method: "DELETE" })),
      url: (id: string, attachmentId: string) => request<{ url: string }>(`/admin/events/${id}/attachments/${attachmentId}/url`),
    },
  },
  offers: {
    list: cached("offers", () => request<Offer[]>("/admin/offers")),
    create: withInvalidate(["offers"], (data: CreateOfferRequest) => request<Offer>("/admin/offers", json("POST", data))),
    update: withInvalidate(["offers"], (id: string, data: UpdateOfferRequest) => request<Offer>(`/admin/offers/${id}`, json("PATCH", data))),
    delete: withInvalidate(["offers"], (id: string) => request<{ ok: boolean }>(`/admin/offers/${id}`, { method: "DELETE" })),
  },
  groceryLists: {
    list: () => request<GroceryList[]>("/admin/grocery-lists"),
    get: (id: string) => request<GroceryList>(`/admin/grocery-lists/${id}`),
    create: (data: CreateGroceryListRequest) => request<GroceryList>("/admin/grocery-lists", json("POST", data)),
    update: (id: string, data: Partial<Pick<GroceryList, "title" | "items">>) => request<GroceryList>(`/admin/grocery-lists/${id}`, json("PATCH", data)),
    delete: (id: string) => request<{ ok: boolean }>(`/admin/grocery-lists/${id}`, { method: "DELETE" }),
  },
  clients: {
    list: cached("clients", () => request<Client[]>("/admin/clients")),
    get: (id: string) => request<Client>(`/admin/clients/${id}`),
    create: withInvalidate(["clients"], (data: CreateClientRequest) => request<Client>("/admin/clients", json("POST", data))),
    update: withInvalidate(["clients"], (id: string, data: UpdateClientRequest) => request<Client>(`/admin/clients/${id}`, json("PATCH", data))),
    delete: withInvalidate(["clients"], (id: string) => request<{ ok: boolean }>(`/admin/clients/${id}`, { method: "DELETE" })),
    instantiate: withInvalidate(["events", "clients"], (id: string, body: InstantiateRequest) => request<InstantiateResponse>(`/admin/clients/${id}/instantiate`, json("POST", body))),
    linkEvents: withInvalidate(["events", "clients"], (id: string, body: LinkEventsRequest) => request<LinkEventsResponse>(`/admin/clients/${id}/link-events`, json("POST", body))),
  },
  assistant: {
    // Proposals run through the regular services, so every list the page behind the sheet may show is refreshed.
    apply: withInvalidate(["events", "recipes", "ingredients"], (actions: ProposedAction[]) =>
      request<ApplyResponse>("/admin/assistant/apply", json("POST", { actions }))),
  },
  ledger: {
    list: (year?: number | string) => request<LedgerEntry[]>(`/admin/ledger${year !== undefined ? `?year=${year}` : ""}`),
    get: (id: string) => request<LedgerEntry>(`/admin/ledger/${id}`),
    create: withInvalidate(["events", "settings"], (body: CreateLedgerEntryRequest) => request<LedgerEntry>("/admin/ledger", json("POST", body))),
    replace: withInvalidate(["events", "settings"], (id: string, body: CreateLedgerEntryRequest) => request<LedgerEntry>(`/admin/ledger/${id}`, json("PUT", body))),
    patch: withInvalidate(["events", "settings"], (id: string, body: PatchLedgerEntryRequest) => request<LedgerEntry>(`/admin/ledger/${id}`, json("PATCH", body))),
    delete: withInvalidate(["events", "settings"], (id: string) => request<{ ok: boolean }>(`/admin/ledger/${id}`, { method: "DELETE" })),
    lock: withInvalidate(["events", "settings"], (body: LockMonthRequest) => request<LockMonthResponse>("/admin/ledger/lock", json("POST", body))),
    unlock: withInvalidate(["events", "settings"], (body: UnlockMonthRequest) => request<UnlockMonthResponse>("/admin/ledger/unlock", json("POST", body))),
    import: withInvalidate(["events", "settings"], (rows: ImportLedgerRow[]) => request<ImportLedgerResponse>("/admin/ledger/import", json("POST", { rows }))),
  },
};

export const fetchHealth = api.health.get;

// The server's own words for a failed call, for toasts that would otherwise hide the cause.
export function errorReason(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error && e.message ? e.message : "";
}
