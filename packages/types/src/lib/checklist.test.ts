import type { Client } from "../entities/client";
import type { AppEvent, EventRecipeLine } from "../entities/event";
import type { LedgerEntry } from "../entities/ledger";
import type { Person } from "../entities/settings";
import { checklistCount, weekChecklist, weekGroceryList, type ChecklistInputs } from "./checklist";

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
    const noPeople = weekChecklist(inputs({ events }));
    expect(kinds(noPeople)).not.toContain("unassigned");
    const inactiveOnly = weekChecklist(inputs({ events, people: [{ personId: "x", name: "X", active: false }] }));
    expect(kinds(inactiveOnly)).not.toContain("unassigned");
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
    expect(items.find((i) => i.kind === "to_invoice")).toEqual({ kind: "to_invoice", eventId: "b", name: "b", date: "2026-10-01", htva: 1000 });

    const four = [...three, event({ eventId: "d", date: "2026-10-04", ...base })];
    const many = weekChecklist(inputs({ events: four }));
    expect(kinds(many)).not.toContain("to_invoice");
    expect(many.find((i) => i.kind === "to_invoice_many")).toEqual({ kind: "to_invoice_many", count: 4, htva: 4000 });
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

  it("skips the money items when the ledger is not configured", () => {
    const events = [event({ eventId: "old", date: "2026-10-10" }), event({ eventId: "done", date: "2026-10-01", status: "completed" })];
    const entries = [entry({ date: "2026-09-20" })];
    const items = weekChecklist(inputs({ events, entries, ledgerConfigured: false }));
    expect(kinds(items)).toEqual(["empty_week", "not_configured"]);
    expect(items[1]).toEqual({ kind: "not_configured", clients: false, ledger: true });
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
    expect(kinds(items)).toEqual(["client_week", "no_menu", "no_price", "no_type", "groceries", "not_configured"]);
    const full = weekChecklist(inputs({ clients: [hoona, mensuel], events, entries, people }));
    expect(kinds(full)).toEqual(["client_week", "no_menu", "no_price", "no_type", "groceries", "to_close", "to_invoice", "to_invoice_month", "unpaid"]);
    expect(checklistCount(full)).toBe(9);
  });
});
