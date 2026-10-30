import { useSyncExternalStore } from "react";
import type { CreateLedgerEntryRequest, ExtractedInvoice, InboxFlag, InboxFlagCode, LedgerBook, PurchaseKind, SalesKind } from "@packages/types";
import { mapExtractedInvoice, nearestVatRate, round2 } from "@packages/types";
import { ApiError, api, errorReason } from "@/lib/api";
import { todayIso } from "@/lib/dates";

// Files are expanded into one row per invoice after reading a grouped PDF.
// The queue lives in memory only: a reload clears it and the uploads already in S3 stay orphaned until a nightly cleanup (out of scope).

export type InboxItemState = "queued" | "uploading" | "extracting" | "review" | "ready" | "duplicate" | "locked" | "error" | "added" | "excluded";

export interface InboxItem {
  id: string;
  file: File;
  name: string;
  size: number;
  contentType: string;
  pageStart?: number;
  pageEnd?: number;
  state: InboxItemState;
  // Set once the upload has answered.
  inboxId?: string;
  entry: CreateLedgerEntryRequest | null;
  flags: InboxFlag[];
  extracted?: ExtractedInvoice;
  error?: string;
  // « Remplacer » on a duplicate: confirm overwrites the existing entry.
  replace: boolean;
  // Confirm in flight.
  busy: boolean;
  // Set once the entry is in the Journal.
  entryId?: string;
  ym?: string;
}

export interface InboxQueueState {
  items: InboxItem[];
  // True once the API answered 503 ASSISTANT_DISABLED.
  disabled: boolean;
}

export interface InboxConfirmSummary {
  added: number;
  duplicates: number;
  locked: number;
  errors: number;
}

export type InboxField = "book" | "kind" | "date" | "number" | "label" | "htva" | "vatAmount" | "totalTvac" | "paid" | "supplier";
export type InboxFieldValue = string | number | boolean;

export const MAX_INBOX_BYTES = 20 * 1024 * 1024;
export const DISABLED_MESSAGE = "Lecture automatique non configurée (clé OPENAI)";
const TOO_LARGE = "Fichier trop volumineux (20 Mo par fichier)";
const UNSUPPORTED = "Format non pris en charge (PDF ou photo)";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const EMPTY: InboxQueueState = { items: [], disabled: false };
let state: InboxQueueState = EMPTY;
const listeners = new Set<() => void>();
let running = false;

function emit(next: InboxQueueState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getInboxQueue(): InboxQueueState {
  return state;
}

export function useInboxQueue(): InboxQueueState {
  return useSyncExternalStore(subscribe, getInboxQueue, getInboxQueue);
}

function find(id: string): InboxItem | undefined {
  return state.items.find((item) => item.id === id);
}

function update(id: string, change: Partial<InboxItem> | ((item: InboxItem) => InboxItem)) {
  if (!find(id)) return;
  emit({ ...state, items: state.items.map((item) => (item.id === id ? (typeof change === "function" ? change(item) : { ...item, ...change }) : item)) });
}

const isPdf = (type: string) => type === "application/pdf";
const isImage = (type: string) => type.startsWith("image/");

function localProblem(file: File): string | null {
  if (file.size > MAX_INBOX_BYTES) return TOO_LARGE;
  if (!isPdf(file.type) && !isImage(file.type)) return UNSUPPORTED;
  return null;
}

export function isAssistantDisabled(e: unknown): boolean {
  return e instanceof ApiError && e.status === 503 && (e.body as { code?: string } | null)?.code === "ASSISTANT_DISABLED";
}

export function inboxErrorMessage(e: unknown): string {
  if (isAssistantDisabled(e)) return DISABLED_MESSAGE;
  if (e instanceof ApiError && e.status === 413) return TOO_LARGE;
  return errorReason(e) || "Erreur";
}

// Adds the files and starts the sequential upload and read.
export function enqueueInboxFiles(files: Iterable<File>): void {
  const items: InboxItem[] = [];
  for (const file of files) {
    const problem = localProblem(file);
    items.push({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      contentType: file.type,
      state: problem ? "error" : "queued",
      error: problem ?? undefined,
      entry: null,
      flags: [],
      replace: false,
      busy: false,
    });
  }
  if (items.length === 0) return;
  emit({ ...state, items: [...state.items, ...items] });
  void runInboxQueue();
}

// One file at a time: upload, then extract, so the rows update in order.
export async function runInboxQueue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const next = state.items.find((item) => item.state === "queued");
      if (!next) break;
      await processItem(next.id);
    }
  } finally {
    running = false;
  }
}

async function processItem(id: string): Promise<void> {
  const item = find(id);
  if (!item) return;
  try {
    let inboxId = item.inboxId;
    if (!inboxId) {
      update(id, { state: "uploading", error: undefined });
      const uploaded = await api.ledger.inbox.upload(item.file);
      inboxId = uploaded.inboxId;
      // Ignored while uploading: the object is dropped rather than orphaned.
      if (!find(id)) { void api.ledger.inbox.remove(inboxId).catch(() => {}); return; }
      update(id, { inboxId, name: uploaded.name });
    }
    update(id, { state: "extracting", error: undefined });
    const { invoices } = await api.ledger.inbox.extractBatch(inboxId);
    if (!find(id)) {
      await Promise.allSettled(invoices.map((proposal) => api.ledger.inbox.remove(proposal.inboxId)));
      return;
    }
    const expanded: InboxItem[] = [];
    for (const proposal of invoices) {
      const entry = proposal.flags.some(flag => flag.code === "reversed") ? null : proposal.entry ?? (await draftEntry(proposal.extracted));
      expanded.push({
        ...item,
        id: crypto.randomUUID(),
        inboxId: proposal.inboxId,
        name: proposal.name,
        size: proposal.size,
        pageStart: proposal.pageStart,
        pageEnd: proposal.pageEnd,
        entry,
        flags: proposal.flags,
        extracted: proposal.extracted,
        replace: false,
        error: undefined,
        state: deriveState({ entry, flags: proposal.flags, replace: false }),
      });
    }
    // The original row may have been ignored while an unread amount was being drafted.
    if (!find(id)) {
      await Promise.allSettled(invoices.map((proposal) => api.ledger.inbox.remove(proposal.inboxId)));
      return;
    }
    emit({ ...state, items: state.items.flatMap((current) => current.id === id ? expanded : [current]) });
    // Keep the source available for retry until the complete response has reached the queue.
    if (!invoices.some((proposal) => proposal.inboxId === inboxId)) {
      void api.ledger.inbox.remove(inboxId).catch(() => undefined);
    }
  } catch (e) {
    if (isAssistantDisabled(e)) emit({ ...state, disabled: true });
    update(id, { state: "error", error: inboxErrorMessage(e) });
  }
}

// An entry with zeros for the unread amounts, so a row the server could not complete stays editable.
async function draftEntry(extracted: ExtractedInvoice): Promise<CreateLedgerEntryRequest | null> {
  const settings = await api.settings.get().catch(() => null);
  const { entry } = mapExtractedInvoice(
    { ...extracted, totalTvac: extracted.totalTvac ?? 0, htva: extracted.htva ?? 0, vatAmount: extracted.vatAmount ?? 0 },
    {
      companyVat: settings?.company?.vatNumber ?? null,
      suppliers: settings?.suppliers.map((s) => s.name) ?? [],
      existingNumbers: [],
      lockedMonths: [],
      today: todayIso(),
    },
  );
  return entry;
}

// A file refused before any upload (size, format) is not worth retrying.
export function canRetryInboxItem(item: InboxItem): boolean {
  return item.state === "error" && !item.busy && localProblem(item.file) === null;
}

export function retryInboxItem(id: string): void {
  const item = find(id);
  if (!item || !canRetryInboxItem(item)) return;
  update(id, { state: "queued", error: undefined });
  void runInboxQueue();
}

// Drops the row and the upload behind it.
export async function ignoreInboxItem(id: string): Promise<void> {
  const item = find(id);
  if (!item) return;
  emit({ ...state, items: state.items.filter((i) => i.id !== id) });
  if (item.inboxId && !item.entryId) await api.ledger.inbox.remove(item.inboxId).catch(() => {});
}

export function clearInboxQueue(): void {
  emit(EMPTY);
}

export function setInboxReplace(id: string, replace: boolean): void {
  update(id, (item) => ({ ...item, replace, state: deriveState({ ...item, replace }) }));
}

// Identity, sign and required fields as the server checks them; null when the entry can be sent.
export function entryProblem(entry: CreateLedgerEntryRequest | null): string | null {
  if (!entry) return "Montants illisibles, complétez-les.";
  if (!entry.label.trim()) return "L'intitulé est requis.";
  if (!DATE_RE.test(entry.date)) return "La date est requise.";
  const gap = identityGap(entry);
  if (gap >= 0.011) return `HTVA + TVA diffère de TVAC de ${gap.toFixed(2).replace(".", ",")} €.`;
  const credit = entry.book === "ventes" && entry.kind === "note_de_credit";
  if (credit && !entry.number) return "Le numéro est requis pour une note de crédit.";
  const negative = entry.totalTvac < 0 || entry.htva < 0 || entry.vatAmount < 0;
  if (credit ? entry.totalTvac > 0 || entry.htva > 0 || entry.vatAmount > 0 : negative) return "Montants négatifs réservés aux notes de crédit.";
  return null;
}

export function identityGap(entry: Pick<CreateLedgerEntryRequest, "htva" | "vatAmount" | "totalTvac">): number {
  return round2(Math.abs(entry.htva + entry.vatAmount - entry.totalTvac));
}

export function deriveState(item: Pick<InboxItem, "entry" | "flags" | "replace">): InboxItemState {
  if (item.flags.some(flag => flag.code === "reversed" || flag.code === "duplicate_file")) return "excluded";
  if (item.flags.some((f) => f.code === "locked_month")) return "locked";
  if (!item.replace && item.flags.some((f) => f.code === "duplicate")) return "duplicate";
  if (entryProblem(item.entry)) return "review";
  return item.flags.some((f) => f.code !== "duplicate" && !(f.code === "multi_rate" && item.entry?.vatLines?.length)) ? "review" : "ready";
}

const AMOUNT_FLAGS: InboxFlagCode[] = ["vat_fixed", "missing_amount", "multi_rate", "currency"];
// Editing a field clears the doubts about it; any edit clears the low confidence.
const CLEARS: Record<InboxField, InboxFlagCode[]> = {
  book: ["unknown_supplier", "duplicate"],
  kind: ["unknown_supplier"],
  date: ["missing_date", "locked_month"],
  number: ["missing_number", "duplicate"],
  label: [],
  htva: AMOUNT_FLAGS,
  vatAmount: AMOUNT_FLAGS,
  totalTvac: AMOUNT_FLAGS,
  paid: [],
  supplier: ["unknown_supplier"],
};

function signed(entry: CreateLedgerEntryRequest): CreateLedgerEntryRequest {
  const credit = entry.book === "ventes" && entry.kind === "note_de_credit";
  const fix = (n: number) => (n === 0 ? 0 : credit ? -Math.abs(n) : Math.abs(n));
  return { ...entry, totalTvac: fix(entry.totalTvac), htva: fix(entry.htva), vatAmount: fix(entry.vatAmount), ...(entry.vatLines ? { vatLines: entry.vatLines.map(line => ({ ...line, base: fix(line.base), amount: fix(line.amount) })) } : {}) };
}

const text = (v: InboxFieldValue) => String(v);
const optional = (v: InboxFieldValue) => (String(v).trim() ? String(v) : undefined);
const amount = (v: InboxFieldValue) => (typeof v === "number" && Number.isFinite(v) ? round2(v) : 0);

export function applyInboxEdit(entry: CreateLedgerEntryRequest, field: InboxField, value: InboxFieldValue): CreateLedgerEntryRequest {
  const common = {
    date: entry.date,
    label: entry.label,
    number: entry.number,
    description: entry.description,
    totalTvac: entry.totalTvac,
    htva: entry.htva,
    vatRate: entry.vatRate,
    vatAmount: entry.vatAmount,
    ...(entry.vatLines ? { vatLines: entry.vatLines } : {}),
  };
  switch (field) {
    case "book": {
      const book = value as LedgerBook;
      if (book === entry.book) return entry;
      return signed(book === "ventes" ? { ...common, book: "ventes", kind: "facture", paid: false } : { ...common, book: "achats", kind: "mp" });
    }
    case "kind":
      if (entry.book === "ventes") {
        const kind = value as SalesKind;
        return signed({ ...entry, kind, paid: kind === "acompte" ? true : entry.paid });
      }
      return signed({ ...entry, kind: value as PurchaseKind });
    case "date":
      return { ...entry, date: text(value) };
    case "number":
      return { ...entry, number: optional(value) };
    case "label":
      return { ...entry, label: text(value) };
    case "htva":
      return signed({ ...entry, vatLines: undefined, htva: amount(value), vatRate: nearestVatRate(Math.abs(amount(value)), Math.abs(entry.vatAmount)) });
    case "vatAmount":
      return signed({ ...entry, vatLines: undefined, vatAmount: amount(value), vatRate: nearestVatRate(Math.abs(entry.htva), Math.abs(amount(value))) });
    case "totalTvac":
      return signed({ ...entry, vatLines: undefined, totalTvac: amount(value) });
    case "paid":
      return entry.book === "ventes" ? { ...entry, paid: Boolean(value) } : entry;
    case "supplier":
      return entry.book === "achats" ? { ...entry, supplier: optional(value) } : entry;
  }
}

export function editInboxItem(id: string, field: InboxField, value: InboxFieldValue): void {
  update(id, (item) => {
    if (!item.entry || item.state === "added" || item.busy) return item;
    const entry = applyInboxEdit(item.entry, field, value);
    const cleared = new Set<InboxFlagCode>([...CLEARS[field], "low_confidence"]);
    const flags = item.flags.filter((f) => !cleared.has(f.code));
    const replace = field === "number" || field === "book" ? false : item.replace;
    return { ...item, entry, flags, replace, error: undefined, state: deriveState({ entry, flags, replace }) };
  });
}

const DUPLICATE_PREFIX = "Déjà dans le journal";
const LOCKED_MONTH = "Mois verrouillé";

function applyFailure(item: InboxItem, error: string): InboxItem {
  const others = item.flags.filter((f) => f.code !== "duplicate" && f.code !== "locked_month");
  if (error.startsWith(DUPLICATE_PREFIX)) {
    const flags = [...others, { code: "duplicate" as const, message: error }];
    return { ...item, busy: false, replace: false, flags, state: "duplicate" };
  }
  if (error === LOCKED_MONTH) {
    const flags = [...others, { code: "locked_month" as const, message: error }];
    return { ...item, busy: false, flags, state: "locked" };
  }
  return { ...item, busy: false, state: "error", error };
}

// Sends the rows to the Journal; each row shows its own result, the summary feeds the toast.
export async function confirmInboxItems(ids: string[]): Promise<InboxConfirmSummary> {
  const summary: InboxConfirmSummary = { added: 0, duplicates: 0, locked: 0, errors: 0 };
  const wanted = new Set(ids);
  const picked = state.items.filter((i) => wanted.has(i.id) && i.inboxId && i.entry && !i.busy && i.state !== "added" && !entryProblem(i.entry));
  if (picked.length === 0) return summary;
  if (picked.length > 50) {
    for (let offset = 0; offset < picked.length; offset += 50) {
      const part = await confirmInboxItems(picked.slice(offset, offset + 50).map((item) => item.id));
      for (const key of Object.keys(summary) as (keyof InboxConfirmSummary)[]) summary[key] += part[key];
    }
    return summary;
  }
  const pickedIds = new Set(picked.map((i) => i.id));
  emit({ ...state, items: state.items.map((i) => (pickedIds.has(i.id) ? { ...i, busy: true, error: undefined } : i)) });
  const payload = picked.map((i) => ({ inboxId: i.inboxId as string, entry: i.entry as CreateLedgerEntryRequest, replace: i.replace }));
  let results: { inboxId: string; ok: boolean; entryId?: string; error?: string }[];
  try {
    results = (await api.ledger.inbox.confirm(payload)).results;
  } catch (e) {
    if (isAssistantDisabled(e)) emit({ ...state, disabled: true });
    const message = inboxErrorMessage(e);
    // A transport failure keeps the edited rows resendable; only the message changes.
    emit({ ...state, items: state.items.map((i) => (pickedIds.has(i.id) ? { ...i, busy: false, error: message, state: deriveState(i) } : i)) });
    summary.errors = picked.length;
    return summary;
  }
  const byInbox = new Map(results.map((r) => [r.inboxId, r]));
  emit({
    ...state,
    items: state.items.map((item) => {
      if (!pickedIds.has(item.id)) return item;
      const result = item.inboxId ? byInbox.get(item.inboxId) : undefined;
      if (!result) { summary.errors += 1; return { ...item, busy: false, state: "error", error: "Aucune réponse pour ce fichier" }; }
      if (result.ok && result.entryId) {
        summary.added += 1;
        return { ...item, busy: false, state: "added", entryId: result.entryId, ym: item.entry?.date.slice(0, 7), flags: [], error: undefined };
      }
      const failed = applyFailure(item, result.error ?? "Erreur");
      if (failed.state === "duplicate") summary.duplicates += 1;
      else if (failed.state === "locked") summary.locked += 1;
      else summary.errors += 1;
      return failed;
    }),
  });
  return summary;
}
