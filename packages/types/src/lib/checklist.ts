import type { Client } from "../entities/client";
import type { AppEvent } from "../entities/event";
import type { GroceryList } from "../entities/grocery-list";
import type { LedgerEntry } from "../entities/ledger";
import type { Person } from "../entities/settings";
import { weekdayOf, ymOf } from "./dates";
import { sumMoney } from "./money";
import { assigneesOf, prepDateOf, shortEventName, signedRevenue, tasksOf } from "./planning";
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
}

export type ChecklistItem =
  | { kind: "client_week"; clientId: string; clientName: string; missingDays: number; guestCount: number }
  | { kind: "no_menu"; eventId: string; name: string; date: string }
  | { kind: "no_price"; eventId: string; name: string; date: string }
  | { kind: "no_type"; eventId: string; name: string; date: string }
  | { kind: "unassigned"; lineCount: number; taskCount: number; eventCount: number }
  | { kind: "groceries"; uncoveredEventIds: string[]; partial: boolean; listId?: string }
  | { kind: "to_close"; events: { eventId: string; name: string; date: string }[] }
  | { kind: "to_invoice"; eventId: string; name: string; date: string; htva: number }
  | { kind: "to_invoice_many"; count: number; htva: number }
  | { kind: "to_invoice_month"; clientId: string; clientName: string; ym: string; eventIds: string[]; htva: number }
  | { kind: "unpaid"; count: number; totalTvac: number; oldestDate: string }
  | { kind: "empty_week" }
  | { kind: "not_configured"; clients: boolean; ledger: boolean };

export type ChecklistKind = ChecklistItem["kind"];

export const MAX_TO_INVOICE_ITEMS = 3;

const byDate = <T extends { date: string }>(a: T, b: T) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

// The last list in the array covering any of the given events, used for the "Courses · liste du …" row.
export function weekGroceryList<T extends Pick<GroceryList, "listId" | "eventIds">>(weekEventIds: string[], lists: T[]): T | undefined {
  const ids = new Set(weekEventIds);
  for (let i = lists.length - 1; i >= 0; i--) {
    if ((lists[i].eventIds ?? []).some((id) => ids.has(id))) return lists[i];
  }
  return undefined;
}

// Items the header counts: everything except the muted not_configured row.
export function checklistCount(items: ChecklistItem[]): number {
  return items.filter((i) => i.kind !== "not_configured").length;
}

export function weekChecklist(inputs: ChecklistInputs): ChecklistItem[] {
  const { weekDates, today, events, clients, clientsConfigured, groceryLists, entries, ledgerConfigured, people } = inputs;
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
  for (const e of weekEvents) if (e.sellingPricePerGuest <= 0) items.push({ kind: "no_price", eventId: e.eventId, name: nameOf(e), date: e.date });
  for (const e of weekEvents) if (!e.prestationType) items.push({ kind: "no_type", eventId: e.eventId, name: nameOf(e), date: e.date });

  // 5. Lines and tasks prepared this week with nobody assigned, over every event since a line can be moved in from another week.
  if (people.some((p) => p.active)) {
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
    if (lineCount + taskCount > 0) items.push({ kind: "unassigned", lineCount, taskCount, eventCount });
  }

  // 6. Grocery list coverage of the week.
  if (weekEvents.length > 0) {
    const covered = new Set<string>();
    for (const list of groceryLists) for (const id of list.eventIds ?? []) covered.add(id);
    const uncovered = weekEvents.filter((e) => !covered.has(e.eventId)).map((e) => e.eventId);
    if (uncovered.length > 0) {
      const partial = uncovered.length < weekEvents.length;
      const listId = partial ? weekGroceryList(weekEvents.map((e) => e.eventId), groceryLists)?.listId : undefined;
      items.push({ kind: "groceries", uncoveredEventIds: uncovered, partial, ...(listId && { listId }) });
    }
  }

  // 7 to 10. The money backlog, whatever the displayed week.
  if (ledgerConfigured) {
    const invoiced = invoicedEventIds(entries);
    const toClose = events
      .filter((e) => e.status === "upcoming" && e.date.slice(0, 10) < today && !invoiced.has(e.eventId))
      .sort(byDate)
      .map((e) => ({ eventId: e.eventId, name: nameOf(e), date: e.date }));
    if (toClose.length) items.push({ kind: "to_close", events: toClose });

    const uninvoiced = events.filter((e) => e.status === "completed" && !invoiced.has(e.eventId)).sort(byDate);
    const oneOff = uninvoiced.filter((e) => clientOf(e)?.invoicing !== "mensuelle");
    if (oneOff.length > MAX_TO_INVOICE_ITEMS) {
      items.push({ kind: "to_invoice_many", count: oneOff.length, htva: sumMoney(oneOff.map(signedRevenue)) });
    } else {
      for (const e of oneOff) items.push({ kind: "to_invoice", eventId: e.eventId, name: nameOf(e), date: e.date, htva: signedRevenue(e) });
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
    for (const group of months.values()) items.push({ kind: "to_invoice_month", ...group });

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
