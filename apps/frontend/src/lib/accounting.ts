import type {
  AppSettings,
  LedgerBook,
  LedgerEntry,
  MpSource,
  PaymentMethod,
  PurchaseKind,
  SalesKind,
  VatRate,
} from "@packages/types";
import {
  DEFAULT_PRESTATION_TYPES,
  SANS_TYPE,
  isCaEntry,
  isCommissionEntry,
  parseYmd,
  personnelEntryAmount,
  ledgerVatAtRate,
  sumMoney,
} from "@packages/types";
import { ApiError } from "@/lib/api";

const monthYear = new Intl.DateTimeFormat("fr-BE", { month: "long", year: "numeric", timeZone: "UTC" });

// "octobre 2026", lower case, from a YYYY-MM or YYYY-MM-DD string.
export function monthLabel(ym: string): string {
  return monthYear.format(parseYmd(`${ym.slice(0, 7)}-01`));
}

export interface YmOption {
  ym: string;
  label: string;
}

export function ymOptions(year: number | string): YmOption[] {
  return Array.from({ length: 12 }, (_, i) => {
    const ym = `${year}-${i + 1 < 10 ? "0" : ""}${i + 1}`;
    return { ym, label: monthLabel(ym) };
  });
}

export interface MonthGroup {
  ym: string;
  entries: LedgerEntry[];
}

// Groups by ym, newest month first, entries by date then creation order.
export function groupEntriesByMonth(entries: LedgerEntry[]): MonthGroup[] {
  const byYm = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    const ym = e.ym || e.date.slice(0, 7);
    const list = byYm.get(ym);
    if (list) list.push(e);
    else byYm.set(ym, [e]);
  }
  return Array.from(byYm.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([ym, list]) => ({
      ym,
      entries: [...list].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)),
    }));
}

export type VatColumn = Exclude<VatRate, 0>;

// Which of the 6, 12 and 21 columns carries the entry's vatAmount; null for the 0% rate.
export function vatColumn(entry: Pick<LedgerEntry, "vatRate">): VatColumn | null {
  return entry.vatRate === 6 || entry.vatRate === 12 || entry.vatRate === 21 ? entry.vatRate : null;
}

// ---- Labels ----

export const SALES_KIND_LABEL: Record<SalesKind, string> = {
  facture: "Facture",
  acompte: "Acompte",
  comptoir: "Comptoir",
  bon_cadeau: "Bon cadeau",
  note_de_credit: "Note de crédit",
  commission: "Commission",
  ca_mensuel: "CA mensuel",
  autre: "Autre",
};

export const PURCHASE_KIND_LABEL: Record<PurchaseKind, string> = {
  mp: "MP",
  personnel: "Personnel",
  autre: "Autre",
};

export function kindLabel(entry: Pick<LedgerEntry, "book" | "kind">): string {
  return entry.book === "achats"
    ? PURCHASE_KIND_LABEL[entry.kind as PurchaseKind] ?? entry.kind
    : SALES_KIND_LABEL[entry.kind as SalesKind] ?? entry.kind;
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  virement: "Virement",
  cash: "Cash",
  bancontact: "Bancontact",
  payconiq: "Payconiq",
  autre: "Autre",
};

export const MP_SOURCE_LABEL: Record<MpSource, string> = {
  calcule: "calculé",
  achats: "achats",
  saisi: "saisi",
};

export function prestationLabel(settings: Pick<AppSettings, "prestationTypes"> | null | undefined, key?: string): string {
  if (!key) return "";
  const types = settings?.prestationTypes ?? DEFAULT_PRESTATION_TYPES;
  return types.find((t) => t.key === key)?.label ?? key;
}

// "13/10/2026" from YYYY-MM-DD; empty when absent.
export function fmtDateFr(ymd?: string): string {
  if (!ymd || ymd.length < 10) return "";
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
}

// "10/2026" from YYYY-MM.
export function mmYyyy(ym: string): string {
  return `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;
}

export function entryYm(entry: Pick<LedgerEntry, "ym" | "date">): string {
  return entry.ym || entry.date.slice(0, 7);
}

// ---- Journal filters ----

export type JournalFilter =
  | "tous"
  | "non_regles"
  | "evenements"
  | "comptoir"
  | "acomptes"
  | "commissions"
  | "notes_de_credit"
  | "mp"
  | "personnel"
  | "autre";

export const SALES_FILTERS: { key: JournalFilter; label: string }[] = [
  { key: "tous", label: "Tous" },
  { key: "non_regles", label: "Non réglés" },
  { key: "evenements", label: "Événements" },
  { key: "comptoir", label: "Comptoir" },
  { key: "acomptes", label: "Acomptes" },
  { key: "commissions", label: "Commissions" },
  { key: "notes_de_credit", label: "Notes de crédit" },
];

export const PURCHASE_FILTERS: { key: JournalFilter; label: string }[] = [
  { key: "tous", label: "Tous" },
  { key: "non_regles", label: "Non réglés" },
  { key: "mp", label: "MP" },
  { key: "personnel", label: "Personnel" },
  { key: "autre", label: "Autre" },
];

export function applyJournalFilter(entries: LedgerEntry[], filter: JournalFilter): LedgerEntry[] {
  switch (filter) {
    case "tous":
      return entries;
    case "non_regles":
      return entries.filter((e) => !e.paid);
    case "evenements":
      return entries.filter((e) => (e.eventIds?.length ?? 0) > 0);
    case "comptoir":
      return entries.filter((e) => e.kind === "comptoir");
    case "acomptes":
      return entries.filter((e) => e.kind === "acompte");
    case "commissions":
      return entries.filter((e) => e.kind === "commission");
    case "notes_de_credit":
      return entries.filter((e) => e.kind === "note_de_credit");
    case "mp":
    case "personnel":
    case "autre":
      return entries.filter((e) => e.kind === filter);
  }
}

// Month entries of one book, by date then creation order.
export function entriesOfMonth(entries: LedgerEntry[], ym: string, book?: LedgerBook): LedgerEntry[] {
  return entries
    .filter((e) => entryYm(e) === ym && (book === undefined || e.book === book))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

// ---- Totals ----

export interface TypeTotal {
  key?: string;
  label: string;
  amount: number;
}

export interface SalesTotals {
  tvac: number;
  htva: number;
  vat6: number;
  vat12: number;
  vat21: number;
  totalCa: number;
  byType: TypeTotal[];
  commissions: number;
}

function vatOf(entries: LedgerEntry[], rate: VatColumn): number {
  return sumMoney(entries.map((e) => ledgerVatAtRate(e, rate)));
}

// Footer figures of the Ventes book: sums, CA, per-type CA with a "Sans type" row, commissions apart.
export function salesTotals(entries: LedgerEntry[], settings: Pick<AppSettings, "prestationTypes"> | null | undefined): SalesTotals {
  const sales = entries.filter((e) => e.book === "ventes");
  const ca = sales.filter(isCaEntry);
  const types = settings?.prestationTypes ?? DEFAULT_PRESTATION_TYPES;
  const known = new Set(types.map((t) => t.key));
  const byType: TypeTotal[] = types.map((t) => ({
    key: t.key,
    label: t.label,
    amount: sumMoney(ca.filter((e) => e.prestationType === t.key).map((e) => e.htva)),
  }));
  byType.push({
    label: SANS_TYPE,
    amount: sumMoney(ca.filter((e) => !e.prestationType || !known.has(e.prestationType)).map((e) => e.htva)),
  });
  return {
    tvac: sumMoney(sales.map((e) => e.totalTvac)),
    htva: sumMoney(sales.map((e) => e.htva)),
    vat6: vatOf(sales, 6),
    vat12: vatOf(sales, 12),
    vat21: vatOf(sales, 21),
    totalCa: sumMoney(ca.map((e) => e.htva)),
    byType,
    commissions: sumMoney(sales.filter(isCommissionEntry).map((e) => e.htva)),
  };
}

export interface PurchaseTotals {
  htva: number;
  vat: number;
  tvac: number;
  hours: number;
}

export function purchaseTotals(entries: LedgerEntry[]): PurchaseTotals {
  const purchases = entries.filter((e) => e.book === "achats");
  return {
    htva: sumMoney(purchases.map((e) => e.htva)),
    vat: sumMoney(purchases.map((e) => e.vatAmount)),
    tvac: sumMoney(purchases.map((e) => e.totalTvac)),
    hours: purchases.reduce((n, e) => n + entryHours(e), 0),
  };
}

export function entryHours(entry: Pick<LedgerEntry, "shifts">): number {
  return (entry.shifts ?? []).reduce((n, s) => n + s.hours, 0);
}

// Count and Σ TVAC of unpaid sales entries.
export function aEncaisser(entries: LedgerEntry[]): { count: number; total: number } {
  const unpaid = entries.filter((e) => e.book === "ventes" && !e.paid);
  return { count: unpaid.length, total: sumMoney(unpaid.map((e) => e.totalTvac)) };
}

export interface PersonSummary {
  personName: string;
  dates: string[];
  hours: number;
  hourlyRate?: number;
  amount: number;
  entries: LedgerEntry[];
}

// Résumé facture per person over personnel entries: shift dates, Σ heures, taux, montant.
export function personSummaries(entries: LedgerEntry[]): PersonSummary[] {
  const byPerson = new Map<string, PersonSummary>();
  for (const e of entries) {
    if (e.book !== "achats" || e.kind !== "personnel") continue;
    const name = e.personName?.trim() || e.label;
    const s = byPerson.get(name) ?? { personName: name, dates: [], hours: 0, hourlyRate: e.hourlyRate, amount: 0, entries: [] };
    s.dates.push(...(e.shifts ?? []).map((sh) => sh.date));
    s.hours += entryHours(e);
    s.hourlyRate = s.hourlyRate ?? e.hourlyRate;
    s.amount = sumMoney([s.amount, personnelEntryAmount(e)]);
    s.entries.push(e);
    byPerson.set(name, s);
  }
  return Array.from(byPerson.values()).map((s) => ({ ...s, dates: [...new Set(s.dates)].sort() }));
}

// ---- API error text ----

interface ZodIssueLike {
  path?: (string | number)[];
  message?: string;
}

// Plain text for a ledger ApiError: Zod issues on 400, "Mois verrouillé" on 409, the message otherwise.
export function ledgerErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return err instanceof Error ? err.message : "Erreur";
  if (err.status === 409) return "Mois verrouillé";
  if (err.status === 503) return "Comptabilité non configurée : la table ta-ledger n'existe pas encore";
  if (err.status === 400) {
    const body = err.body as { message?: unknown } | null;
    const issues = Array.isArray(body?.message) ? (body!.message as ZodIssueLike[]) : [];
    const lines = issues.map((i) => {
      const path = (i.path ?? []).join(".");
      return path ? `${path} : ${i.message ?? "invalide"}` : i.message ?? "invalide";
    });
    if (lines.length) return lines.join(" · ");
  }
  return err.message;
}
