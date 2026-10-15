import { createLedgerEntrySchema } from "../dto/ledger";
import type { Client } from "../entities/client";
import type { AppEvent } from "../entities/event";
import type { LedgerEntry } from "../entities/ledger";
import type { AppSettings } from "../entities/settings";
import { depositsForEvents, eventBillingStatus, lastDayOfMonth, monthlyRevenueEntry, prefillForClientMonth, prefillFromEvent } from "./prefill";

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
      extraEntries: [],
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

  it("invoices the food at its rate and the billed lines in one extra entry per rate", () => {
    const ev = event({
      eventId: "dupont",
      name: "Mariage Dupont",
      date: "2026-10-17",
      clientId: "hoona",
      guestCount: 60,
      sellingPricePerGuest: 40,
      vatRate: 12,
      revenueLines: [
        { label: "Service", amount: 450, vatRate: 21 },
        { label: "Livraison", amount: 50, vatRate: 21 },
      ],
    });
    const p = prefillFromEvent(ev, hoona, [], settings, "facture");
    expect(p.revenuePrevu).toBe(2900);
    expect(p.entry).toMatchObject({ kind: "facture", label: "Hoona", htva: 2400, vatRate: 12, vatAmount: 288, totalTvac: 2688, eventIds: ["dupont"] });
    expect(p.extraEntries).toHaveLength(1);
    expect(p.extraEntries[0]).toEqual({
      book: "ventes",
      kind: "facture",
      date: "2026-10-17",
      label: "Hoona · service, livraison, autres",
      prestationType: "menu_a_emporter",
      clientId: "hoona",
      eventIds: ["dupont"],
      htva: 500,
      vatRate: 21,
      vatAmount: 105,
      totalTvac: 605,
      paid: false,
    });
    expect(createLedgerEntrySchema.safeParse(p.extraEntries[0]).success).toBe(true);
  });

  it("takes deposits off the food part only and gives a deposit no extra entries", () => {
    const ev = event({
      eventId: "dupont",
      date: "2026-10-17",
      guestCount: 60,
      sellingPricePerGuest: 40,
      vatRate: 12,
      revenueLines: [{ label: "Service", amount: 450, vatRate: 21 }],
    });
    const deposit = entry({ date: "2026-09-01", htva: 700, kind: "acompte", eventIds: ["dupont"], paid: true });
    const invoice = prefillFromEvent(ev, undefined, [deposit], settings, "facture");
    expect(invoice).toMatchObject({ revenuePrevu: 2850, acomptesRecus: 700 });
    expect(invoice.entry.htva).toBe(1700);
    expect(invoice.extraEntries.map((e) => e.htva)).toEqual([450]);
    const acompte = prefillFromEvent(ev, undefined, [], settings, "acompte");
    expect(acompte.entry).toMatchObject({ kind: "acompte", htva: 2400, paid: true });
    expect(acompte.extraEntries).toEqual([]);
  });

  it("uses the typed total in total mode and groups lines by rate in ascending order", () => {
    const ev = event({
      eventId: "brunch",
      date: "2026-10-17",
      guestCount: 3,
      sellingPricePerGuest: 333.33,
      pricingMode: "total",
      sellingTotal: 1000,
      revenueLines: [
        { label: "Service", amount: 100, vatRate: 21 },
        { label: "Boissons", amount: 60, vatRate: 6 },
        { label: "Livraison", amount: 25, vatRate: 21 },
      ],
    });
    const p = prefillFromEvent(ev, undefined, [], settings, "facture");
    expect(p.entry.htva).toBe(1000);
    expect(p.extraEntries.map((e) => [e.vatRate, e.htva])).toEqual([
      [6, 60],
      [21, 125],
    ]);
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

  it("leaves a marked event out of the month sweep", () => {
    const events = [
      event({ eventId: "s1", date: "2026-09-01", clientId: "hoona", guestCount: 30, sellingPricePerGuest: 14 }),
      event({ eventId: "s2", date: "2026-09-08", clientId: "hoona", guestCount: 30, sellingPricePerGuest: 14, invoicedAt: "2026-09-10" }),
    ];
    const r = prefillForClientMonth(hoona, events, [], settings, "2026-09");
    expect(r.events.map((e) => e.eventId)).toEqual(["s1"]);
    expect(r.entry.htva).toBe(420);
  });

  it("is empty when everything is invoiced", () => {
    const covered = entries.concat(entry({ date: "2026-10-31", htva: 1, kind: "comptoir", eventIds: ["sep-15", "oct-3", "oct-10"] }));
    const p = prefillForClientMonth(hoona, events, covered, settings, "2026-10");
    expect(p.events).toEqual([]);
    expect(p.entry).toMatchObject({ htva: 0, totalTvac: 0, eventIds: [] });
    expect(p.extraEntries).toEqual([]);
  });

  it("sums the billed lines across events per rate and keeps the food in the main entry", () => {
    const withLines = events.map((e) =>
      e.eventId === "oct-3"
        ? { ...e, revenueLines: [{ label: "Service", amount: 100, vatRate: 21 as const }, { label: "Boissons", amount: 30, vatRate: 6 as const }] }
        : e.eventId === "oct-10"
          ? { ...e, revenueLines: [{ label: "Livraison", amount: 40, vatRate: 21 as const }] }
          : e,
    );
    const p = prefillForClientMonth(hoona, withLines, entries, settings, "2026-10");
    expect(p).toMatchObject({ revenuePrevu: 1202.5, acomptesRecus: 100 });
    expect(p.entry).toMatchObject({ htva: 932.5, vatRate: 6, eventIds: ["sep-15", "oct-3", "oct-10"] });
    expect(p.byMonth.map((g) => g.revenue)).toEqual([360, 842.5]);
    expect(p.extraEntries.map((e) => [e.vatRate, e.htva, e.eventIds])).toEqual([
      [6, 30, ["oct-3"]],
      [21, 140, ["oct-3", "oct-10"]],
    ]);
    expect(p.extraEntries[0]).toMatchObject({
      kind: "facture",
      date: "2026-10-31",
      label: "Hoona · service, livraison, autres",
      prestationType: "menu_a_emporter",
      clientId: "hoona",
      paid: false,
    });
    for (const e of p.extraEntries) expect(createLedgerEntrySchema.safeParse(e).success).toBe(true);
  });
});

describe("monthlyRevenueEntry", () => {
  it("builds a paid ca_mensuel entry on the last day of the month", () => {
    const e = monthlyRevenueEntry("2026-10", 1200, 12);
    expect(e).toEqual({
      book: "ventes",
      kind: "ca_mensuel",
      date: "2026-10-31",
      label: "CA · Octobre 2026",
      htva: 1200,
      vatRate: 12,
      vatAmount: 144,
      totalTvac: 1344,
      paid: true,
    });
    expect(createLedgerEntrySchema.safeParse(e).success).toBe(true);
  });

  it("keeps a given label and handles February", () => {
    expect(monthlyRevenueEntry("2024-02", 100, 0, "Comptoir février")).toMatchObject({ date: "2024-02-29", label: "Comptoir février", vatAmount: 0, totalTvac: 100 });
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

  it("reads a marked event as facture unless the ledger says acompte_recu or paye", () => {
    const marked = { invoicedAt: "2026-10-15" };
    expect(eventBillingStatus("ev", [], marked)).toBe("facture");
    expect(eventBillingStatus("ev", [], { invoicedAt: undefined })).toBeUndefined();
    expect(eventBillingStatus("ev", [{ ...facture, paid: true }], marked)).toBe("paye");
    expect(eventBillingStatus("ev", [facture], marked)).toBe("facture");
    expect(eventBillingStatus("ev", [acompte], marked)).toBe("acompte_recu");
    expect(eventBillingStatus("ev", [{ ...facture, kind: "commission" }], marked)).toBe("facture");
    expect(eventBillingStatus("other", [facture], marked)).toBe("facture");
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
