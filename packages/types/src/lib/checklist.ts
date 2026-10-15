import type { Client } from "../entities/client";
import type { AppEvent } from "../entities/event";
import type { GroceryList } from "../entities/grocery-list";
import type { LedgerEntry } from "../entities/ledger";
import type { InvoicingMode, Person } from "../entities/settings";
import { weekdayOf, ymOf } from "./dates";
import { sumMoney } from "./money";
import { assigneesOf, foodRevenue, prepDateOf, shortEventName, signedRevenue, tasksOf } from "./planning";
import { invoicedEventIds, isInvoiceEntry } from "./reports";

export interface ChecklistInputs {
  // The seven days of the displayed week.
  weekDates: string[];
  today: string;
  events: AppEvent[];
  clients: Client[];
  clientsConfigured: boolean;
  groceryLists: Pick<GroceryList, "listId" | "eventIds" | "range">[];
  entries: LedgerEntry[];
  ledgerConfigured: boolean;
  people: Person[];
  // Absent reads as "app".
  invoicing?: InvoicingMode;
}

export type ChecklistItem =
  | { kind: "client_week"; clientId: string; clientName: string; missingDays: number; guestCount: number }
  | { kind: "no_menu"; eventId: string; name: string; date: string }
  | { kind: "no_price"; eventId: string; name: string; date: string }
  | { kind: "no_type"; eventId: string; name: string; date: string }
  | { kind: "unassigned"; lineCount: number; taskCount: number; eventCount: number }
  | { kind: "no_people"; lineCount: number; taskCount: number; eventCount: number }
  | { kind: "groceries"; uncoveredEventIds: string[]; partial: boolean; listId?: string }
  | { kind: "to_close"; events: { eventId: string; name: string; date: string }[] }
  | { kind: "to_invoice"; eventId: string; name: string; date: string; htva: number; action: InvoiceAction }
  | { kind: "to_invoice_many"; count: number; htva: number; action: InvoiceAction }
  | { kind: "to_invoice_month"; clientId: string; clientName: string; ym: string; eventIds: string[]; htva: number; action: InvoiceAction }
  | { kind: "unpaid"; count: number; totalTvac: number; oldestDate: string }
  | { kind: "empty_week" }
  | { kind: "not_configured"; clients: boolean; ledger: boolean };

export type ChecklistKind = ChecklistItem["kind"];

// "ledger": the invoice is created in the Journal (app mode with the ledger table); "mark": the row stamps invoicedAt.
export type InvoiceAction = "ledger" | "mark";

export const MAX_TO_INVOICE_ITEMS = 3;

const byDate = <T extends { date: string }>(a: T, b: T) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

type EventRef = string | Pick<AppEvent, "eventId" | "date">;

// A list with eventIds covers those ids only; a legacy list without them covers the dates of its range.
export function groceryListCovers(list: Pick<GroceryList, "eventIds" | "range">, event: EventRef): boolean {
  if (typeof event === "string") return (list.eventIds ?? []).includes(event);
  if (list.eventIds) return list.eventIds.includes(event.eventId);
  if (!list.range) return false;
  const date = event.date.slice(0, 10);
  return list.range.from <= date && date <= list.range.to;
}

// The last list in the array covering any of the given events, used for the "Courses · liste du …" row.
export function weekGroceryList<T extends Pick<GroceryList, "listId" | "eventIds" | "range">>(weekEvents: EventRef[], lists: T[]): T | undefined {
  for (let i = lists.length - 1; i >= 0; i--) {
    if (weekEvents.some((e) => groceryListCovers(lists[i], e))) return lists[i];
  }
  return undefined;
}

// Items the header counts: everything except the muted not_configured row.
export function checklistCount(items: ChecklistItem[]): number {
  return items.filter((i) => i.kind !== "not_configured").length;
}

export function weekChecklist(inputs: ChecklistInputs): ChecklistItem[] {
  const { weekDates, today, events, clients, clientsConfigured, groceryLists, entries, ledgerConfigured, people, invoicing } = inputs;
  const items: ChecklistItem[] = [];
  const week = new Set(weekDates);
  const weekEvents = events.filter((e) => week.has(e.date.slice(0, 10))).sort(byDate);
  const clientById = new Map(clients.map((c) => [c.clientId, c]));
  const clientOf = (e: AppEvent) => (e.clientId ? clientById.get(e.clientId) : undefined);
  const nameOf = (e: AppEvent) => shortEventName(e, clientOf(e));

  // 1. Recurring clients with a weekday template that has no event this week.
  let clientWeekItems = 0;
  if (clientsConfigured) {
    for (const client of clients) {
      if (client.active === false || !client.templates?.length) continue;
      const missing = client.templates.filter(
        (t) => !weekEvents.some((e) => e.clientId === client.clientId && (e.templateId === t.templateId || weekdayOf(e.date) === t.weekday)),
      );
      if (!missing.length) continue;
      clientWeekItems++;
      items.push({
        kind: "client_week",
        clientId: client.clientId,
        clientName: client.name,
        missingDays: new Set(missing.map((t) => t.weekday)).size,
        guestCount: missing[0].guestCount,
      });
    }
  }

  // 2 to 4. Week events missing a menu, a price or a type.
  for (const e of weekEvents) if (e.recipes.length === 0) items.push({ kind: "no_menu", eventId: e.eventId, name: nameOf(e), date: e.date });
  for (const e of weekEvents) if (foodRevenue(e) <= 0) items.push({ kind: "no_price", eventId: e.eventId, name: nameOf(e), date: e.date });
  for (const e of weekEvents) if (!e.prestationType) items.push({ kind: "no_type", eventId: e.eventId, name: nameOf(e), date: e.date });

  // 5. Lines and tasks prepared this week with nobody assigned, over every event since a line can be moved in from another week.
  {
    let lineCount = 0;
    let taskCount = 0;
    let eventCount = 0;
    for (const e of events) {
      const lines = e.recipes.filter((l) => week.has(prepDateOf(l, e)) && assigneesOf(l, e).length === 0).length;
      const tasks = tasksOf(e).filter((t) => week.has(t.date) && assigneesOf(t, e).length === 0).length;
      if (lines + tasks > 0) {
        lineCount += lines;
        taskCount += tasks;
        eventCount++;
      }
    }
    if (lineCount + taskCount > 0) {
      const kind = people.some((p) => p.active) ? "unassigned" : "no_people";
      items.push({ kind, lineCount, taskCount, eventCount });
    }
  }

  // 6. Grocery list coverage of the week.
  if (weekEvents.length > 0) {
    const uncovered = weekEvents.filter((e) => !groceryLists.some((list) => groceryListCovers(list, e))).map((e) => e.eventId);
    if (uncovered.length > 0) {
      const partial = uncovered.length < weekEvents.length;
      const listId = partial ? weekGroceryList(weekEvents, groceryLists)?.listId : undefined;
      items.push({ kind: "groceries", uncoveredEventIds: uncovered, partial, ...(listId && { listId }) });
    }
  }

  // 7 to 10. The money backlog, whatever the displayed week. The ledger adds its invoices when it exists; invoicedAt counts in every mode.
  const action: InvoiceAction = invoicing === "externe" || !ledgerConfigured ? "mark" : "ledger";
  const invoiced = invoicedEventIds(ledgerConfigured ? entries : [], events);
  const toClose = events
    .filter((e) => e.status === "upcoming" && e.date.slice(0, 10) < today && !invoiced.has(e.eventId))
    .sort(byDate)
    .map((e) => ({ eventId: e.eventId, name: nameOf(e), date: e.date }));
  if (toClose.length) items.push({ kind: "to_close", events: toClose });

  const uninvoiced = events.filter((e) => e.status === "completed" && !invoiced.has(e.eventId)).sort(byDate);
  const oneOff = uninvoiced.filter((e) => clientOf(e)?.invoicing !== "mensuelle");
  if (oneOff.length > MAX_TO_INVOICE_ITEMS) {
    items.push({ kind: "to_invoice_many", count: oneOff.length, htva: sumMoney(oneOff.map(signedRevenue)), action });
  } else {
    for (const e of oneOff) items.push({ kind: "to_invoice", eventId: e.eventId, name: nameOf(e), date: e.date, htva: signedRevenue(e), action });
  }

  const currentYm = ymOf(today);
  const months = new Map<string, { clientId: string; clientName: string; ym: string; eventIds: string[]; htva: number }>();
  for (const e of uninvoiced) {
    const client = clientOf(e);
    if (!client || client.invoicing !== "mensuelle") continue;
    const ym = ymOf(e.date);
    if (ym >= currentYm) continue;
    const key = `${client.clientId}|${ym}`;
    const group = months.get(key) ?? { clientId: client.clientId, clientName: client.name, ym, eventIds: [], htva: 0 };
    group.eventIds.push(e.eventId);
    group.htva = sumMoney([group.htva, signedRevenue(e)]);
    months.set(key, group);
  }
  for (const group of months.values()) items.push({ kind: "to_invoice_month", ...group, action });

  // Unpaid invoices live in the ledger only; in Odoo mode they are chased there.
  if (ledgerConfigured && invoicing !== "externe") {
    const unpaid = entries.filter((e) => isInvoiceEntry(e) && !e.paid).sort(byDate);
    if (unpaid.length) {
      items.push({ kind: "unpaid", count: unpaid.length, totalTvac: sumMoney(unpaid.map((e) => e.totalTvac)), oldestDate: unpaid[0].date });
    }
  }

  // 11. Nothing planned and nothing to create.
  if (weekEvents.length === 0 && clientWeekItems === 0) items.push({ kind: "empty_week" });

  // 12. Muted last row, not counted.
  if (!clientsConfigured || !ledgerConfigured) items.push({ kind: "not_configured", clients: !clientsConfigured, ledger: !ledgerConfigured });

  return items;
}
