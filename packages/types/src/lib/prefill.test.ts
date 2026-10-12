import { createLedgerEntrySchema } from "../dto/ledger";
import type { Client } from "../entities/client";
import type { AppEvent } from "../entities/event";
import type { LedgerEntry } from "../entities/ledger";
import type { AppSettings } from "../entities/settings";
import { depositsForEvents, eventBillingStatus, lastDayOfMonth, prefillForClientMonth, prefillFromEvent } from "./prefill";

let seq = 0;

function entry(partial: Partial<LedgerEntry> & Pick<LedgerEntry, "date" | "htva">): LedgerEntry {
  const rate = partial.vatRate ?? 6;
  const vatAmount = Math.round(partial.htva * rate) / 100;
  return {
    entryId: `e${++seq}`,
    book: "ventes",
    kind: "facture",
    ym: partial.date.slice(0, 7),
    label: `entry ${seq}`,
    totalTvac: Math.round((partial.htva + vatAmount) * 100) / 100,
    vatRate: rate,
    vatAmount,
    paid: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function event(partial: Partial<AppEvent> & Pick<AppEvent, "eventId" | "date">): AppEvent {
  return {
    name: partial.eventId,
    nameLower: partial.eventId,
    guestCount: 10,
    recipes: [],
    extraCosts: [],
    sellingPricePerGuest: 20,
    status: "upcoming",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

const settings: Pick<AppSettings, "prestationTypes"> = {};

const hoona: Client = {
  clientId: "hoona",
  name: "Hoona",
  nameLower: "hoona",
  defaultPrestationType: "menu_a_emporter",
  defaultVatRate: 6,
  invoicing: "mensuelle",
  templates: [],
  active: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("prefillFromEvent", () => {
  const frahan = event({
    eventId: "frahan",
    name: "Mariage de Frahan",
    date: "2026-10-18",
    guestCount: 50,
    sellingPricePerGuest: 29.75,
    prestationType: "walking_cocktail",
  });
  const deposit = entry({ date: "2026-09-01", htva: 750, kind: "acompte", eventIds: ["frahan"], paid: true });
  const otherDeposit = entry({ date: "2026-09-01", htva: 999, kind: "acompte", eventIds: ["someone-else"], paid: true });

  it("prefills the balance after deposits with the prestation type VAT", () => {
    const p = prefillFromEvent(frahan, undefined, [deposit, otherDeposit], settings, "facture");
    expect(p).toEqual({
      revenuePrevu: 1487.5,
      acomptesRecus: 750,
      entry: {
        book: "ventes",
        kind: "facture",
        date: "2026-10-18",
        label: "Mariage de Frahan",
        prestationType: "walking_cocktail",
        clientId: undefined,
        eventIds: ["frahan"],
        htva: 737.5,
        vatRate: 12,
        vatAmount: 88.5,
        totalTvac: 826,
        paid: false,
      },
    });
    expect(createLedgerEntrySchema.safeParse(p.entry).success).toBe(true);
  });

  it("uses the client name and id, the event VAT rate, and marks a deposit as paid", () => {
    const ev = { ...frahan, clientId: "hoona", vatRate: 21 as const };
    const p = prefillFromEvent(ev, hoona, [], settings, "acompte");
    expect(p.entry).toMatchObject({ kind: "acompte", label: "Hoona", clientId: "hoona", vatRate: 21, htva: 1487.5, vatAmount: 312.38, totalTvac: 1799.88, paid: true });
    expect(createLedgerEntrySchema.safeParse(p.entry).success).toBe(true);
  });

  it("falls back to the client default type and to 0 % when nothing carries a rate", () => {
    const noType = event({ eventId: "x", date: "2026-10-01", clientId: "hoona" });
    expect(prefillFromEvent(noType, hoona, [], settings, "facture").entry).toMatchObject({ prestationType: "menu_a_emporter", vatRate: 6 });
    const custom: Pick<AppSettings, "prestationTypes"> = { prestationTypes: [{ key: "menu_a_emporter", label: "Menu", defaultVatRate: 12 }] };
    expect(prefillFromEvent(noType, hoona, [], custom, "facture").entry.vatRate).toBe(12);
    expect(prefillFromEvent(event({ eventId: "y", date: "2026-10-01" }), undefined, [], settings, "facture").entry).toMatchObject({ vatRate: 0, vatAmount: 0, totalTvac: 200 });
  });
});

describe("prefillForClientMonth", () => {
  const events = [
    event({ eventId: "sep-1", date: "2026-09-01", clientId: "hoona", guestCount: 30, sellingPricePerGuest: 12 }),
    event({ eventId: "sep-15", date: "2026-09-15", clientId: "hoona", guestCount: 30, sellingPricePerGuest: 12 }),
    event({ eventId: "oct-10", date: "2026-10-10", clientId: "hoona", guestCount: 25, sellingPricePerGuest: 12.5 }),
    event({ eventId: "oct-3", date: "2026-10-03", clientId: "hoona", guestCount: 30, sellingPricePerGuest: 12 }),
    event({ eventId: "nov-2", date: "2026-11-02", clientId: "hoona", guestCount: 30, sellingPricePerGuest: 12 }),
    event({ eventId: "other", date: "2026-10-05", clientId: "someone", guestCount: 30, sellingPricePerGuest: 12 }),
  ];
  const entries = [
    entry({ date: "2026-09-30", htva: 360, eventIds: ["sep-1"], number: "2026-009" }),
    entry({ date: "2026-10-04", htva: 100, kind: "acompte", eventIds: ["oct-3"], paid: true }),
  ];

  it("sweeps every uninvoiced event up to the end of the month, grouped by month, minus deposits", () => {
    const p = prefillForClientMonth(hoona, events, entries, settings, "2026-10");
    expect(p.events.map((e) => e.eventId)).toEqual(["sep-15", "oct-3", "oct-10"]);
    expect(p.byMonth.map((g) => [g.ym, g.events.map((e) => e.eventId), g.revenue])).toEqual([
      ["2026-09", ["sep-15"], 360],
      ["2026-10", ["oct-3", "oct-10"], 672.5],
    ]);
    expect(p).toMatchObject({ revenuePrevu: 1032.5, acomptesRecus: 100 });
    expect(p.entry).toEqual({
      book: "ventes",
      kind: "facture",
      date: "2026-10-31",
      label: "Hoona",
      prestationType: "menu_a_emporter",
      clientId: "hoona",
      eventIds: ["sep-15", "oct-3", "oct-10"],
      htva: 932.5,
      vatRate: 6,
      vatAmount: 55.95,
      totalTvac: 988.45,
      paid: false,
    });
    expect(createLedgerEntrySchema.safeParse(p.entry).success).toBe(true);
  });

  it("is empty when everything is invoiced", () => {
    const covered = entries.concat(entry({ date: "2026-10-31", htva: 1, kind: "comptoir", eventIds: ["sep-15", "oct-3", "oct-10"] }));
    const p = prefillForClientMonth(hoona, events, covered, settings, "2026-10");
    expect(p.events).toEqual([]);
    expect(p.entry).toMatchObject({ htva: 0, totalTvac: 0, eventIds: [] });
  });
});

describe("billing helpers", () => {
  const facture = entry({ date: "2026-10-01", htva: 100, eventIds: ["ev"] });
  const acompte = entry({ date: "2026-09-01", htva: 50, kind: "acompte", eventIds: ["ev"], paid: true });

  it("derives the three event states", () => {
    expect(eventBillingStatus("ev", [])).toBeUndefined();
    expect(eventBillingStatus("ev", [acompte])).toBe("acompte_recu");
    expect(eventBillingStatus("ev", [acompte, facture])).toBe("facture");
    expect(eventBillingStatus("ev", [acompte, { ...facture, paid: true }])).toBe("paye");
    expect(eventBillingStatus("ev", [{ ...acompte, paid: false }, { ...facture, paid: true }])).toBe("facture");
    expect(eventBillingStatus("ev", [{ ...facture, kind: "comptoir", paid: true }])).toBe("paye");
    expect(eventBillingStatus("ev", [{ ...facture, kind: "commission" }])).toBeUndefined();
  });

  it("sums deposits over several events once each", () => {
    const shared = entry({ date: "2026-09-02", htva: 20, kind: "acompte", eventIds: ["ev", "ev2"], paid: true });
    expect(depositsForEvents(["ev", "ev2"], [acompte, shared, facture])).toBe(70);
    expect(depositsForEvents(["none"], [acompte, shared])).toBe(0);
  });

  it("finds the last day of a month", () => {
    expect(lastDayOfMonth("2024-02")).toBe("2024-02-29");
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28");
    expect(lastDayOfMonth("2026-12")).toBe("2026-12-31");
  });
});
