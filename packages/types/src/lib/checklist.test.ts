import type { Client } from "../entities/client";
import type { AppEvent, EventRecipeLine } from "../entities/event";
import type { LedgerEntry } from "../entities/ledger";
import type { Person } from "../entities/settings";
import { checklistCount, groceryListCovers, weekChecklist, weekGroceryList, type ChecklistInputs } from "./checklist";

const WEEK = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
const TODAY = "2026-10-18";

let seq = 0;

function line(extra: Partial<EventRecipeLine> = {}): EventRecipeLine {
  return { lineId: `l${++seq}`, recipeId: "r", portions: 10, ...extra };
}

function event(partial: Partial<AppEvent> & Pick<AppEvent, "eventId" | "date">): AppEvent {
  return {
    name: partial.eventId,
    nameLower: partial.eventId,
    guestCount: 10,
    recipes: [line()],
    extraCosts: [],
    sellingPricePerGuest: 20,
    status: "upcoming",
    prestationType: "brunch",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function client(partial: Partial<Client> & Pick<Client, "clientId" | "name">): Client {
  return {
    nameLower: partial.name.toLowerCase(),
    templates: [],
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function entry(partial: Partial<LedgerEntry> & Pick<LedgerEntry, "date">): LedgerEntry {
  return {
    entryId: `e${++seq}`,
    book: "ventes",
    kind: "facture",
    ym: partial.date.slice(0, 7),
    label: "x",
    totalTvac: 106,
    htva: 100,
    vatRate: 6,
    vatAmount: 6,
    paid: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

const people: Person[] = [
  { personId: "amelie", name: "Amélie", active: true },
  { personId: "kristoff", name: "Kristoff", active: true },
];

function inputs(partial: Partial<ChecklistInputs> = {}): ChecklistInputs {
  return {
    weekDates: WEEK,
    today: TODAY,
    events: [],
    clients: [],
    clientsConfigured: true,
    groceryLists: [],
    entries: [],
    ledgerConfigured: true,
    people: [],
    ...partial,
  };
}

const kinds = (items: ReturnType<typeof weekChecklist>) => items.map((i) => i.kind);

describe("weekChecklist", () => {
  it("is empty_week only, and counts it, for a week with nothing", () => {
    const items = weekChecklist(inputs());
    expect(items).toEqual([{ kind: "empty_week" }]);
    expect(checklistCount(items)).toBe(1);
  });

  it("client_week lists missing weekdays with the first template's guests", () => {
    const hoona = client({
      clientId: "hoona",
      name: "Hoona",
      templates: [
        { templateId: "t2", name: "Mardi", weekday: 2, guestCount: 30, sellingPricePerGuest: 12, recipes: [], extraCosts: [] },
        { templateId: "t4", name: "Jeudi", weekday: 4, guestCount: 20, sellingPricePerGuest: 12, recipes: [], extraCosts: [] },
      ],
    });
    const inactive = client({ clientId: "old", name: "Old", active: false, templates: hoona.templates });
    const covered = event({ eventId: "h-mardi", date: "2026-10-20", clientId: "hoona", templateId: "t2" });
    const items = weekChecklist(inputs({ clients: [hoona, inactive], events: [covered] }));
    expect(items[0]).toEqual({ kind: "client_week", clientId: "hoona", clientName: "Hoona", missingDays: 1, guestCount: 20 });
    expect(kinds(items)).not.toContain("empty_week");
    expect(items.filter((i) => i.kind === "client_week")).toHaveLength(1);
  });

  it("client_week is skipped when clients are not configured, and not_configured is last and not counted", () => {
    const hoona = client({
      clientId: "hoona",
      name: "Hoona",
      templates: [{ templateId: "t2", name: "Mardi", weekday: 2, guestCount: 30, sellingPricePerGuest: 12, recipes: [], extraCosts: [] }],
    });
    const items = weekChecklist(inputs({ clients: [hoona], clientsConfigured: false }));
    expect(items).toEqual([{ kind: "empty_week" }, { kind: "not_configured", clients: true, ledger: false }]);
    expect(checklistCount(items)).toBe(1);
  });

  it("no_menu, no_price and no_type use the short name and come in kind order", () => {
    const hoona = client({ clientId: "hoona", name: "Hoona" });
    const events = [
      event({ eventId: "c", date: "2026-10-22", prestationType: undefined, name: "Fondation Thalia" }),
      event({ eventId: "a", date: "2026-10-20", recipes: [], clientId: "hoona", templateId: "t2", name: "Hoona · mardi 20 oct." }),
      event({ eventId: "b", date: "2026-10-21", sellingPricePerGuest: 0, name: "Lunch étude Delen" }),
    ];
    const items = weekChecklist(inputs({ clients: [hoona], events }));
    expect(items.slice(0, 3)).toEqual([
      { kind: "no_menu", eventId: "a", name: "Hoona", date: "2026-10-20" },
      { kind: "no_price", eventId: "b", name: "Lunch étude Delen", date: "2026-10-21" },
      { kind: "no_type", eventId: "c", name: "Fondation Thalia", date: "2026-10-22" },
    ]);
  });

  it("unassigned counts lines without an effective person, only once people exist", () => {
    const events = [
      event({ eventId: "a", date: "2026-10-20", assignedTo: ["amelie"], recipes: [line(), line({ assignedTo: ["kristoff"] })] }),
      event({ eventId: "b", date: "2026-10-21", recipes: [line(), line(), line({ assignedTo: ["amelie"] })] }),
      event({ eventId: "c", date: "2026-10-22", recipes: [line()] }),
    ];
    const withPeople = weekChecklist(inputs({ events, people }));
    expect(withPeople.find((i) => i.kind === "unassigned")).toEqual({ kind: "unassigned", lineCount: 3, taskCount: 0, eventCount: 2 });
    expect(kinds(withPeople)).not.toContain("no_people");
    const noPeople = weekChecklist(inputs({ events }));
    expect(kinds(noPeople)).not.toContain("unassigned");
    expect(noPeople.find((i) => i.kind === "no_people")).toEqual({ kind: "no_people", lineCount: 3, taskCount: 0, eventCount: 2 });
    const inactiveOnly = weekChecklist(inputs({ events, people: [{ personId: "x", name: "X", active: false }] }));
    expect(kinds(inactiveOnly)).not.toContain("unassigned");
    expect(kinds(inactiveOnly)).toContain("no_people");
  });

  it("no_people carries the counts of the week's unassigned work and is counted", () => {
    const events = [event({ eventId: "a", date: "2026-10-20", recipes: [line(), line()] })];
    const items = weekChecklist(inputs({ events }));
    expect(items.find((i) => i.kind === "no_people")).toEqual({ kind: "no_people", lineCount: 2, taskCount: 0, eventCount: 1 });
    expect(kinds(items)).toEqual(["no_people", "groceries"]);
    expect(checklistCount(items)).toBe(2);
  });

  it("neither no_people nor unassigned when every line has a person", () => {
    const events = [event({ eventId: "a", date: "2026-10-20", assignedTo: ["amelie"], recipes: [line(), line()] })];
    expect(kinds(weekChecklist(inputs({ events })))).toEqual(["groceries"]);
    expect(kinds(weekChecklist(inputs({ events, people })))).toEqual(["groceries"]);
  });

  it("unassigned counts a task without a person on a week event", () => {
    const events = [event({ eventId: "a", date: "2026-10-20", recipes: [line({ assignedTo: ["amelie"] })], tasks: [{ taskId: "t1", label: "Cuire les sablés", date: "2026-10-20" }] })];
    const items = weekChecklist(inputs({ events, people }));
    expect(items.find((i) => i.kind === "unassigned")).toEqual({ kind: "unassigned", lineCount: 0, taskCount: 1, eventCount: 1 });
  });

  it("unassigned counts a line moved into the week from an event dated the next Monday", () => {
    const nextWeek = event({
      eventId: "next",
      date: "2026-10-26",
      assignedTo: ["amelie"],
      recipes: [line({ prepDate: "2026-10-22", assignedTo: [] }), line()],
    });
    const other = event({ eventId: "far", date: "2026-10-27", recipes: [line({ prepDate: "2026-10-23" })] });
    const items = weekChecklist(inputs({ events: [nextWeek, other], people }));
    expect(items.find((i) => i.kind === "unassigned")).toEqual({ kind: "unassigned", lineCount: 1, taskCount: 0, eventCount: 1 });
    expect(kinds(items)).toContain("empty_week");
  });

  it("unassigned ignores a line of a week event moved to the previous week", () => {
    const events = [
      event({ eventId: "a", date: "2026-10-20", recipes: [line({ prepDate: "2026-10-16" })] }),
      event({ eventId: "b", date: "2026-10-21", recipes: [line({ prepDate: "2026-10-17" }), line()] }),
    ];
    const items = weekChecklist(inputs({ events, people }));
    expect(items.find((i) => i.kind === "unassigned")).toEqual({ kind: "unassigned", lineCount: 1, taskCount: 0, eventCount: 1 });
    const none = weekChecklist(inputs({ events: [events[0]], people }));
    expect(kinds(none)).not.toContain("unassigned");
  });

  it("no_menu still fires for an event with a task and no line", () => {
    const events = [event({ eventId: "a", date: "2026-10-20", recipes: [], tasks: [{ taskId: "t1", label: "Dégeler le poisson", date: "2026-10-20" }] })];
    const items = weekChecklist(inputs({ events }));
    expect(items.find((i) => i.kind === "no_menu")).toEqual({ kind: "no_menu", eventId: "a", name: "a", date: "2026-10-20" });
  });

  it("groceries reports uncovered events, partial when some are covered, and nothing when all are", () => {
    const events = [event({ eventId: "a", date: "2026-10-20" }), event({ eventId: "b", date: "2026-10-21" })];
    const none = weekChecklist(inputs({ events }));
    expect(none.find((i) => i.kind === "groceries")).toEqual({ kind: "groceries", uncoveredEventIds: ["a", "b"], partial: false });

    const lists = [{ listId: "L1", eventIds: ["zz"] }, { listId: "L2", eventIds: ["a"] }];
    const some = weekChecklist(inputs({ events, groceryLists: lists }));
    expect(some.find((i) => i.kind === "groceries")).toEqual({ kind: "groceries", uncoveredEventIds: ["b"], partial: true, listId: "L2" });

    const all = weekChecklist(inputs({ events, groceryLists: [{ listId: "L3", eventIds: ["a", "b"] }] }));
    expect(kinds(all)).not.toContain("groceries");
    expect(weekGroceryList(["a", "b"], [{ listId: "L3", eventIds: ["a", "b"] }, { listId: "L4", eventIds: ["b"] }])?.listId).toBe("L4");
  });

  it("a legacy list without eventIds covers the events inside its range", () => {
    const events = [event({ eventId: "a", date: "2026-10-20" }), event({ eventId: "b", date: "2026-10-24" })];
    const legacy = { listId: "old", range: { from: "2026-10-19", to: "2026-10-25" } };
    const items = weekChecklist(inputs({ events, groceryLists: [legacy] }));
    expect(kinds(items)).not.toContain("groceries");
    expect(weekGroceryList(events, [legacy])?.listId).toBe("old");
    expect(weekGroceryList(["a", "b"], [legacy])).toBeUndefined();

    const short = { listId: "short", range: { from: "2026-10-19", to: "2026-10-21" } };
    const partial = weekChecklist(inputs({ events, groceryLists: [short] }));
    expect(partial.find((i) => i.kind === "groceries")).toEqual({ kind: "groceries", uncoveredEventIds: ["b"], partial: true, listId: "short" });
    expect(groceryListCovers(short, events[0])).toBe(true);
    expect(groceryListCovers(short, events[1])).toBe(false);
    expect(groceryListCovers({ range: short.range }, { eventId: "x", date: "2026-10-21T18:00" })).toBe(true);
  });

  it("a list with eventIds: [] and a range covers nothing; a list with eventIds covers those ids only", () => {
    const events = [event({ eventId: "a", date: "2026-10-20" }), event({ eventId: "b", date: "2026-10-24" })];
    const empty = { listId: "empty", eventIds: [], range: { from: "2026-10-19", to: "2026-10-25" } };
    expect(weekChecklist(inputs({ events, groceryLists: [empty] })).find((i) => i.kind === "groceries")).toEqual({ kind: "groceries", uncoveredEventIds: ["a", "b"], partial: false });
    expect(weekGroceryList(events, [empty])).toBeUndefined();

    const ids = { listId: "ids", eventIds: ["a"], range: { from: "2026-10-19", to: "2026-10-25" } };
    expect(weekChecklist(inputs({ events, groceryLists: [ids] })).find((i) => i.kind === "groceries")).toEqual({ kind: "groceries", uncoveredEventIds: ["b"], partial: true, listId: "ids" });
    expect(groceryListCovers(ids, events[1])).toBe(false);
  });

  it("to_close lists past upcoming events not invoiced, whatever the week", () => {
    const events = [
      event({ eventId: "old", date: "2026-10-10", name: "Mariage Dupont" }),
      event({ eventId: "older", date: "2026-09-30" }),
      event({ eventId: "billed", date: "2026-10-11" }),
      event({ eventId: "today", date: TODAY }),
      event({ eventId: "done", date: "2026-10-01", status: "completed" }),
    ];
    const entries = [entry({ date: "2026-10-12", eventIds: ["billed"], paid: true })];
    const items = weekChecklist(inputs({ events, entries }));
    expect(items.find((i) => i.kind === "to_close")).toEqual({
      kind: "to_close",
      events: [
        { eventId: "older", name: "older", date: "2026-09-30" },
        { eventId: "old", name: "Mariage Dupont", date: "2026-10-10" },
      ],
    });
  });

  it("to_invoice lists up to three completed one-off events, then collapses to to_invoice_many", () => {
    const base = { status: "completed" as const, guestCount: 10, sellingPricePerGuest: 100 };
    const three = [
      event({ eventId: "a", date: "2026-10-03", ...base }),
      event({ eventId: "b", date: "2026-10-01", ...base }),
      event({ eventId: "c", date: "2026-10-02", ...base }),
    ];
    const items = weekChecklist(inputs({ events: three }));
    expect(items.filter((i) => i.kind === "to_invoice").map((i) => i.kind === "to_invoice" && i.eventId)).toEqual(["b", "c", "a"]);
    expect(items.find((i) => i.kind === "to_invoice")).toEqual({ kind: "to_invoice", eventId: "b", name: "b", date: "2026-10-01", htva: 1000, action: "ledger" });

    const four = [...three, event({ eventId: "d", date: "2026-10-04", ...base })];
    const many = weekChecklist(inputs({ events: four }));
    expect(kinds(many)).not.toContain("to_invoice");
    expect(many.find((i) => i.kind === "to_invoice_many")).toEqual({ kind: "to_invoice_many", count: 4, htva: 4000, action: "ledger" });
  });

  it("to_invoice_month groups monthly clients by past month and never lists them as events", () => {
    const hoona = client({ clientId: "hoona", name: "Hoona", invoicing: "mensuelle" });
    const base = { status: "completed" as const, clientId: "hoona", guestCount: 30, sellingPricePerGuest: 14 };
    const events = [
      event({ eventId: "s1", date: "2026-09-01", ...base }),
      event({ eventId: "s2", date: "2026-09-08", ...base }),
      event({ eventId: "o1", date: "2026-10-06", ...base }),
      event({ eventId: "s0", date: "2026-09-15", ...base }),
    ];
    const entries = [entry({ date: "2026-09-30", eventIds: ["s0"] })];
    const items = weekChecklist(inputs({ events, clients: [hoona], entries }));
    expect(kinds(items)).not.toContain("to_invoice");
    expect(items.find((i) => i.kind === "to_invoice_month")).toEqual({
      kind: "to_invoice_month",
      clientId: "hoona",
      clientName: "Hoona",
      ym: "2026-09",
      eventIds: ["s1", "s2"],
      htva: 840,
      action: "ledger",
    });
    expect(items.filter((i) => i.kind === "to_invoice_month")).toHaveLength(1);
  });

  it("unpaid sums invoice entries not paid and keeps the oldest date", () => {
    const entries = [
      entry({ date: "2026-09-20", totalTvac: 893.5 }),
      entry({ date: "2026-09-12", totalTvac: 348.5 }),
      entry({ date: "2026-09-01", totalTvac: 50, paid: true }),
      entry({ date: "2026-09-02", kind: "acompte", totalTvac: 999 }),
    ];
    const items = weekChecklist(inputs({ entries }));
    expect(items.find((i) => i.kind === "unpaid")).toEqual({ kind: "unpaid", count: 2, totalTvac: 1242, oldestDate: "2026-09-12" });
  });

  it("without the ledger, to_close and to_invoice are built with action mark, the ledger entries are ignored and unpaid is absent", () => {
    const events = [event({ eventId: "old", date: "2026-10-10" }), event({ eventId: "done", date: "2026-10-01", status: "completed" })];
    const entries = [entry({ date: "2026-09-20", eventIds: ["done"] })];
    const items = weekChecklist(inputs({ events, entries, ledgerConfigured: false }));
    expect(kinds(items)).toEqual(["to_close", "to_invoice", "empty_week", "not_configured"]);
    expect(items[0]).toEqual({ kind: "to_close", events: [{ eventId: "old", name: "old", date: "2026-10-10" }] });
    expect(items[1]).toEqual({ kind: "to_invoice", eventId: "done", name: "done", date: "2026-10-01", htva: 200, action: "mark" });
    expect(items[3]).toEqual({ kind: "not_configured", clients: false, ledger: true });
  });

  it("externe without the ledger: one completed event is to_invoice with action mark, marked it disappears, four collapse to to_invoice_many", () => {
    const base = { status: "completed" as const, guestCount: 10, sellingPricePerGuest: 100 };
    const mode = { ledgerConfigured: false, invoicing: "externe" as const };
    const one = weekChecklist(inputs({ ...mode, events: [event({ eventId: "a", date: "2026-10-03", name: "Mariage Dupont", ...base })] }));
    expect(one.find((i) => i.kind === "to_invoice")).toEqual({ kind: "to_invoice", eventId: "a", name: "Mariage Dupont", date: "2026-10-03", htva: 1000, action: "mark" });

    const marked = weekChecklist(inputs({ ...mode, events: [event({ eventId: "a", date: "2026-10-03", invoicedAt: "2026-10-15", ...base })] }));
    expect(kinds(marked)).toEqual(["empty_week", "not_configured"]);

    const four = ["a", "b", "c", "d"].map((id, i) => event({ eventId: id, date: `2026-10-0${i + 1}`, ...base }));
    const many = weekChecklist(inputs({ ...mode, events: four }));
    expect(kinds(many)).not.toContain("to_invoice");
    expect(many.find((i) => i.kind === "to_invoice_many")).toEqual({ kind: "to_invoice_many", count: 4, htva: 4000, action: "mark" });
  });

  it("app mode with the ledger: a ledger invoice or invoicedAt both remove the row and the action is ledger", () => {
    const base = { status: "completed" as const, guestCount: 10, sellingPricePerGuest: 100 };
    const events = [
      event({ eventId: "ledger", date: "2026-10-01", ...base }),
      event({ eventId: "marked", date: "2026-10-02", invoicedAt: "2026-10-15", ...base }),
      event({ eventId: "open", date: "2026-10-03", ...base }),
    ];
    const entries = [entry({ date: "2026-10-05", eventIds: ["ledger"], paid: true })];
    const items = weekChecklist(inputs({ events, entries, invoicing: "app" }));
    expect(items.filter((i) => i.kind === "to_invoice")).toEqual([{ kind: "to_invoice", eventId: "open", name: "open", date: "2026-10-03", htva: 1000, action: "ledger" }]);
  });

  it("a marked upcoming past event leaves to_close in every mode", () => {
    const events = [event({ eventId: "past", date: "2026-10-10", invoicedAt: "2026-10-12" }), event({ eventId: "stale", date: "2026-10-11" })];
    for (const partial of [{}, { ledgerConfigured: false }, { invoicing: "externe" as const }]) {
      const items = weekChecklist(inputs({ events, ...partial }));
      expect(items.find((i) => i.kind === "to_close")).toEqual({ kind: "to_close", events: [{ eventId: "stale", name: "stale", date: "2026-10-11" }] });
    }
  });

  it("no_price fires on the food revenue, so a total-mode event at 0 is flagged and one priced by total is not", () => {
    const events = [
      event({ eventId: "zero", date: "2026-10-20", pricingMode: "total", sellingTotal: 0, sellingPricePerGuest: 0 }),
      event({ eventId: "priced", date: "2026-10-21", pricingMode: "total", sellingTotal: 500, sellingPricePerGuest: 0 }),
    ];
    const items = weekChecklist(inputs({ events }));
    expect(items.filter((i) => i.kind === "no_price")).toEqual([{ kind: "no_price", eventId: "zero", name: "zero", date: "2026-10-20" }]);
  });

  it("externe keeps to_close and the invoice rows with action mark and drops unpaid; app mode keeps everything with action ledger", () => {
    const mensuel = client({ clientId: "m", name: "Mensuel", invoicing: "mensuelle" });
    const events = [
      event({ eventId: "past", date: "2026-10-10", name: "Mariage Dupont" }),
      event({ eventId: "done", date: "2026-10-09", status: "completed" }),
      event({ eventId: "mon", date: "2026-09-09", status: "completed", clientId: "m" }),
    ];
    const entries = [entry({ date: "2026-09-20" })];
    const externe = weekChecklist(inputs({ clients: [mensuel], events, entries, invoicing: "externe" }));
    expect(kinds(externe)).toEqual(["to_close", "to_invoice", "to_invoice_month", "empty_week"]);
    expect(externe[0]).toEqual({ kind: "to_close", events: [{ eventId: "past", name: "Mariage Dupont", date: "2026-10-10" }] });
    expect(externe[1]).toEqual({ kind: "to_invoice", eventId: "done", name: "done", date: "2026-10-09", htva: 200, action: "mark" });
    expect(externe[2]).toEqual({ kind: "to_invoice_month", clientId: "m", clientName: "Mensuel", ym: "2026-09", eventIds: ["mon"], htva: 200, action: "mark" });
    const app = weekChecklist(inputs({ clients: [mensuel], events, entries, invoicing: "app" }));
    expect(kinds(app)).toEqual(["to_close", "to_invoice", "to_invoice_month", "unpaid", "empty_week"]);
    expect(app.map((i) => ("action" in i ? i.action : undefined))).toEqual([undefined, "ledger", "ledger", undefined, undefined]);
    expect(kinds(weekChecklist(inputs({ clients: [mensuel], events, entries })))).toEqual(kinds(app));
    expect(kinds(weekChecklist(inputs({ clients: [mensuel], events, entries, ledgerConfigured: false })))).toEqual(["to_close", "to_invoice", "to_invoice_month", "empty_week", "not_configured"]);
  });

  it("a marked ledger-mode completed event still counts the ledger entries it is linked to as unpaid", () => {
    const events = [event({ eventId: "done", date: "2026-10-09", status: "completed", invoicedAt: "2026-10-10" })];
    const entries = [entry({ date: "2026-10-10", eventIds: ["done"] })];
    const items = weekChecklist(inputs({ events, entries }));
    expect(kinds(items)).toEqual(["unpaid", "empty_week"]);
  });

  it("keeps the documented order across kinds", () => {
    const hoona = client({
      clientId: "hoona",
      name: "Hoona",
      templates: [{ templateId: "t5", name: "Vendredi", weekday: 5, guestCount: 30, sellingPricePerGuest: 12, recipes: [], extraCosts: [] }],
    });
    const mensuel = client({ clientId: "m", name: "Mensuel", invoicing: "mensuelle" });
    const events = [
      event({ eventId: "w", date: "2026-10-20", recipes: [], sellingPricePerGuest: 0, prestationType: undefined }),
      event({ eventId: "past", date: "2026-10-10" }),
      event({ eventId: "done", date: "2026-10-09", status: "completed" }),
      event({ eventId: "mon", date: "2026-09-09", status: "completed", clientId: "m" }),
    ];
    const entries = [entry({ date: "2026-09-20" })];
    const items = weekChecklist(inputs({ clients: [hoona, mensuel], events, entries, people, clientsConfigured: true, ledgerConfigured: false }));
    expect(kinds(items)).toEqual(["client_week", "no_menu", "no_price", "no_type", "groceries", "to_close", "to_invoice", "to_invoice_month", "not_configured"]);
    const full = weekChecklist(inputs({ clients: [hoona, mensuel], events, entries, people }));
    expect(kinds(full)).toEqual(["client_week", "no_menu", "no_price", "no_type", "groceries", "to_close", "to_invoice", "to_invoice_month", "unpaid"]);
    expect(checklistCount(full)).toBe(9);
    const noPeople = weekChecklist(inputs({ clients: [hoona, mensuel], events: [...events, event({ eventId: "u", date: "2026-10-21" })], entries }));
    expect(kinds(noPeople)).toEqual(["client_week", "no_menu", "no_price", "no_type", "no_people", "groceries", "to_close", "to_invoice", "to_invoice_month", "unpaid"]);
  });
});
