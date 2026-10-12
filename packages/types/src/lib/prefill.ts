import type { CreateLedgerEntryRequest } from "../dto/ledger";
import type { Client } from "../entities/client";
import type { AppEvent } from "../entities/event";
import type { LedgerEntry, VatRate } from "../entities/ledger";
import type { AppSettings } from "../entities/settings";
import { DEFAULT_PRESTATION_TYPES } from "../entities/settings";
import { ymOf } from "./dates";
import { round2, sumMoney } from "./money";
import { signedRevenue } from "./planning";
import { invoicedEventIds, isInvoiceEntry } from "./reports";

export type SalesEntryPrefill = Extract<CreateLedgerEntryRequest, { book: "ventes" }>;
export type PrefillKind = "facture" | "acompte";

export type EventBillingStatus = "facture" | "acompte_recu" | "paye";

export function entriesForEvent(eventId: string, entries: LedgerEntry[]): LedgerEntry[] {
  return entries.filter((e) => e.book === "ventes" && (e.eventIds ?? []).includes(eventId));
}

// Σ htva of acompte entries covering any of the given events.
export function depositsForEvents(eventIds: string[], entries: LedgerEntry[]): number {
  const wanted = new Set(eventIds);
  return sumMoney(
    entries
      .filter((e) => e.book === "ventes" && e.kind === "acompte" && (e.eventIds ?? []).some((id) => wanted.has(id)))
      .map((e) => e.htva),
  );
}

// Facturé when a facture or comptoir entry includes the event; Payé when every entry including it is paid.
export function eventBillingStatus(eventId: string, entries: LedgerEntry[]): EventBillingStatus | undefined {
  const linked = entriesForEvent(eventId, entries);
  if (linked.length === 0) return undefined;
  if (!linked.some(isInvoiceEntry)) return linked.some((e) => e.kind === "acompte") ? "acompte_recu" : undefined;
  return linked.every((e) => e.paid) ? "paye" : "facture";
}

export function defaultVatRate(prestationType: string | undefined, settings: Pick<AppSettings, "prestationTypes">): VatRate | undefined {
  const types = settings.prestationTypes ?? DEFAULT_PRESTATION_TYPES;
  return types.find((t) => t.key === prestationType)?.defaultVatRate;
}

function salesEntry(args: {
  kind: PrefillKind;
  date: string;
  label: string;
  prestationType?: string;
  clientId?: string;
  eventIds: string[];
  htva: number;
  vatRate: VatRate;
}): SalesEntryPrefill {
  const vatAmount = round2((args.htva * args.vatRate) / 100);
  return {
    book: "ventes",
    kind: args.kind,
    date: args.date,
    label: args.label,
    prestationType: args.prestationType,
    clientId: args.clientId,
    eventIds: args.eventIds,
    htva: args.htva,
    vatRate: args.vatRate,
    vatAmount,
    totalTvac: sumMoney([args.htva, vatAmount]),
    paid: args.kind === "acompte",
  };
}

export interface EventPrefill {
  entry: SalesEntryPrefill;
  revenuePrevu: number;
  acomptesRecus: number;
}

// Falls back to 0 % when neither the event nor its prestation type carries a VAT rate, so the gap is visible on the form.
export function prefillFromEvent(
  event: AppEvent,
  client: Client | undefined,
  entries: LedgerEntry[],
  settings: Pick<AppSettings, "prestationTypes">,
  kind: PrefillKind,
): EventPrefill {
  const revenuePrevu = signedRevenue(event);
  const acomptesRecus = depositsForEvents([event.eventId], entries);
  const prestationType = event.prestationType ?? client?.defaultPrestationType;
  return {
    entry: salesEntry({
      kind,
      date: event.date,
      label: client?.name ?? event.name,
      prestationType,
      clientId: event.clientId ?? client?.clientId,
      eventIds: [event.eventId],
      htva: round2(revenuePrevu - acomptesRecus),
      vatRate: event.vatRate ?? defaultVatRate(prestationType, settings) ?? 0,
    }),
    revenuePrevu,
    acomptesRecus,
  };
}

export interface ClientMonthPrefill {
  entry: SalesEntryPrefill;
  events: AppEvent[];
  byMonth: { ym: string; events: AppEvent[]; revenue: number }[];
  revenuePrevu: number;
  acomptesRecus: number;
}

export function lastDayOfMonth(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

// Every uninvoiced event of the client dated on or before the end of ym, grouped by month, as one invoice.
export function prefillForClientMonth(
  client: Client,
  events: AppEvent[],
  entries: LedgerEntry[],
  settings: Pick<AppSettings, "prestationTypes">,
  ym: string,
): ClientMonthPrefill {
  const invoiced = invoicedEventIds(entries);
  const selected = events
    .filter((e) => e.clientId === client.clientId && ymOf(e.date) <= ym && !invoiced.has(e.eventId))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const byMonth: ClientMonthPrefill["byMonth"] = [];
  for (const e of selected) {
    const month = ymOf(e.date);
    const group = byMonth.find((g) => g.ym === month);
    if (group) {
      group.events.push(e);
      group.revenue = sumMoney([group.revenue, signedRevenue(e)]);
    } else byMonth.push({ ym: month, events: [e], revenue: signedRevenue(e) });
  }

  const revenuePrevu = sumMoney(selected.map(signedRevenue));
  const acomptesRecus = depositsForEvents(
    selected.map((e) => e.eventId),
    entries,
  );
  const prestationType = client.defaultPrestationType ?? selected.find((e) => e.prestationType)?.prestationType;
  return {
    entry: salesEntry({
      kind: "facture",
      date: lastDayOfMonth(ym),
      label: client.name,
      prestationType,
      clientId: client.clientId,
      eventIds: selected.map((e) => e.eventId),
      htva: round2(revenuePrevu - acomptesRecus),
      vatRate: client.defaultVatRate ?? selected.find((e) => e.vatRate !== undefined)?.vatRate ?? defaultVatRate(prestationType, settings) ?? 0,
    }),
    events: selected,
    byMonth,
    revenuePrevu,
    acomptesRecus,
  };
}
