import type { AppEvent } from "../entities/event";
import type { LedgerEntry } from "../entities/ledger";
import type { AppSettings, FixedCharge } from "../entities/settings";
import type { Client } from "../entities/client";
import {
  aFacturer,
  apercu,
  auReel,
  auReelYear,
  breakeven,
  caOfMonth,
  caOfPeriod,
  chargesForMonth,
  COMPARISON_PERIODS,
  incomeStatement,
  invoicedEventIds,
  isCaEntry,
  isInvoiceEntry,
  isoc,
  ledgerCaOfMonth,
  mix,
  objectifMensuel,
  personnelShareOfMonth,
  previsionnel,
  rawMaterialOfMonth,
  type ReportInputs,
} from "./reports";

let seq = 0;

function entry(partial: Partial<LedgerEntry> & Pick<LedgerEntry, "date" | "htva">): LedgerEntry {
  const rate = partial.vatRate ?? 6;
  const vatAmount = partial.vatAmount ?? Math.round(partial.htva * rate) / 100;
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
    status: "completed",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function settings(partial: Partial<AppSettings> = {}): AppSettings {
  return { settingsId: "global", recipeCategories: [], suppliers: [], updatedAt: "2026-01-01T00:00:00Z", ...partial };
}

function inputs(partial: Partial<ReportInputs> = {}): ReportInputs {
  return {
    entries: [],
    events: [],
    recipeCostById: new Map([["quiche", 20]]),
    recipePortionsById: new Map([["quiche", 10]]),
    settings: settings(),
    ...partial,
  };
}

const charge = (p: Partial<FixedCharge> & Pick<FixedCharge, "chargeId" | "monthlyAmount">): FixedCharge => ({
  label: p.chargeId,
  category: "autre",
  ...p,
});

describe("CA definition", () => {
  const entries = [
    entry({ date: "2026-10-03", htva: 1000 }),
    entry({ date: "2026-10-20", htva: 50, kind: "commission", vatRate: 0 }),
    entry({ date: "2026-10-21", htva: 30, book: "achats", kind: "mp" }),
    entry({ date: "2026-11-01", htva: 999 }),
  ];

  it("counts CA kinds only", () => {
    expect(isCaEntry({ book: "ventes", kind: "facture" })).toBe(true);
    expect(isCaEntry({ book: "ventes", kind: "note_de_credit" })).toBe(true);
    expect(isCaEntry({ book: "ventes", kind: "commission" })).toBe(false);
    expect(isCaEntry({ book: "achats", kind: "mp" })).toBe(false);
  });

  it("ca_mensuel is CA, never an invoice", () => {
    expect(isCaEntry({ book: "ventes", kind: "ca_mensuel" })).toBe(true);
    expect(isInvoiceEntry({ book: "ventes", kind: "ca_mensuel" })).toBe(false);
    const monthly = entry({ date: "2026-10-31", htva: 1200, kind: "ca_mensuel", label: "CA · Octobre 2026", paid: true, eventIds: ["ev"] });
    expect(ledgerCaOfMonth([monthly], "2026-10")).toBe(1200);
    expect(caOfMonth(inputs({ entries: [monthly] }), "2026-10")).toEqual({ amount: 1200, source: "ledger" });
    expect(invoicedEventIds([monthly]).size).toBe(0);
    expect(aFacturer({ events: [], entries: [{ ...monthly, paid: false }], clients: [] }, "2026-11-15").unpaid).toEqual([]);
  });

  it("a month with one facture and one commission yields CA = facture only", () => {
    expect(ledgerCaOfMonth(entries, "2026-10")).toBe(1000);
    const row = incomeStatement(2026, inputs({ entries })).months[9];
    expect(row.ca).toBe(1000);
    expect(row.autresProduits).toBe(50);
    expect(apercu(2026, inputs({ entries })).rows[9].caN.amount).toBe(1000);
    expect(auReel("2026-10", inputs({ entries })).totalSigne).toBe(1000);
    expect(mix(2026, inputs({ entries })).totals.caN).toBe(1999);
  });
});

describe("objectifMensuel", () => {
  const objective = { annualRevenue: 160000, monthsActive: 10, monthlyOverrides: { "2026-03": 5000, "07": 0 } };
  it("divides by active months", () => {
    expect(objectifMensuel(objective, "2026-01")).toBe(16000);
  });
  it("honours overrides keyed by ym or by month", () => {
    expect(objectifMensuel(objective, "2026-03")).toBe(5000);
    expect(objectifMensuel(objective, "2026-07")).toBe(0);
  });
  it("is undefined without an objective", () => {
    expect(objectifMensuel(undefined, "2026-01")).toBeUndefined();
  });
});

describe("chargesForMonth", () => {
  const charges = [
    charge({ chargeId: "salaire", category: "salaire", monthlyAmount: 1500, monthlyAmountSolo: 0 }),
    charge({ chargeId: "ucm", category: "social", monthlyAmount: 300.5 }),
    charge({ chargeId: "pret", category: "remboursement", monthlyAmount: 600 }),
    charge({ chargeId: "pret-in", category: "remboursement", monthlyAmount: 10, inResult: true }),
    charge({ chargeId: "old", monthlyAmount: 1000, to: "2026-09" }),
    charge({ chargeId: "new", monthlyAmount: 100, from: "2026-10" }),
    charge({ chargeId: "window", monthlyAmount: 7, from: "2026-11", to: "2026-11" }),
  ];
  it("applies the from/to rule", () => {
    expect(chargesForMonth(charges, "2026-09", "avec", "caisse")).toBe(3410.5);
    expect(chargesForMonth(charges, "2026-10", "avec", "caisse")).toBe(2510.5);
    expect(chargesForMonth(charges, "2026-11", "avec", "caisse")).toBe(2517.5);
  });
  it("drops remboursement from the result unless inResult is set", () => {
    expect(chargesForMonth(charges, "2026-10", "avec", "resultat")).toBe(1910.5);
  });
  it("uses the solo amount in the seule scenario and falls back to the normal amount", () => {
    expect(chargesForMonth(charges, "2026-10", "seule", "caisse")).toBe(1010.5);
  });
  it("handles an empty list", () => {
    expect(chargesForMonth(undefined, "2026-10", "avec", "caisse")).toBe(0);
  });
});

describe("rawMaterialOfMonth", () => {
  const events = [
    event({
      eventId: "done",
      date: "2026-10-10",
      recipes: [{ lineId: "l1", recipeId: "quiche", portions: 30 }],
      extraCosts: [
        { label: "fromage", amount: 5, kind: "matiere" },
        { label: "extra", amount: 50, kind: "personnel" },
      ],
    }),
    event({ eventId: "actual", date: "2026-10-12", actualCost: 40.1, recipes: [{ lineId: "l2", recipeId: "quiche", portions: 100 }] }),
    event({ eventId: "later", date: "2026-10-28", status: "upcoming", recipes: [{ lineId: "l3", recipeId: "quiche", portions: 10 }] }),
    event({ eventId: "other-month", date: "2026-11-02", recipes: [{ lineId: "l4", recipeId: "quiche", portions: 1000 }] }),
  ];
  const entries = [
    entry({ date: "2026-10-05", htva: 100, book: "achats", kind: "mp" }),
    entry({ date: "2026-10-06", htva: 23.5, book: "achats", kind: "mp" }),
    entry({ date: "2026-10-07", htva: 70, book: "achats", kind: "autre" }),
    entry({ date: "2026-11-07", htva: 500, book: "achats", kind: "mp" }),
  ];
  const base = { entries, events, recipeCostById: new Map([["quiche", 20]]), recipePortionsById: new Map([["quiche", 10]]) };

  it("defaults to calculé over completed events, matiere extras once, with achats partiels and upcoming", () => {
    expect(rawMaterialOfMonth("2026-10", base)).toEqual({
      amount: 105.1,
      source: "calcule",
      calcule: 105.1,
      achats: 123.5,
      saisi: undefined,
      achatsPartiels: 123.5,
      upcoming: 20,
      nonTermines: 1,
    });
  });
  it("reads purchases when the source is achats", () => {
    const r = rawMaterialOfMonth("2026-10", { ...base, monthClose: { mpSource: "achats" } });
    expect(r).toMatchObject({ amount: 123.5, source: "achats", achatsPartiels: undefined });
  });
  it("reads the typed amount when the source is saisi", () => {
    const r = rawMaterialOfMonth("2026-10", { ...base, monthClose: { mpSource: "saisi", rawMaterial: 999.99 } });
    expect(r).toMatchObject({ amount: 999.99, source: "saisi", saisi: 999.99 });
  });
  it("omits upcoming and nonTermines when every event is completed", () => {
    const r = rawMaterialOfMonth("2026-11", base);
    expect(r).toMatchObject({ amount: 2000, achats: 500, upcoming: undefined, nonTermines: undefined });
  });
});

describe("isoc", () => {
  it("uses 25 % by default and never goes below zero", () => {
    expect(isoc(1000)).toBe(250);
    expect(isoc(-1000)).toBe(0);
    expect(isoc(1000, { corporateTaxRate: 0.2 })).toBe(200);
  });
  it("applies the two-tier SME rule", () => {
    expect(isoc(150000, { smeReducedRate: true })).toBe(32500);
    expect(isoc(50000, { smeReducedRate: true })).toBe(10000);
  });
});

describe("personnelShareOfMonth", () => {
  const spanning = entry({
    date: "2026-11-05",
    htva: 900,
    book: "achats",
    kind: "personnel",
    hourlyRate: 30,
    shifts: [
      { date: "2026-10-30", hours: 4 },
      { date: "2026-11-02", hours: 8 },
    ],
  });
  it("splits an invoice pro rata to the shift months", () => {
    expect(personnelShareOfMonth(spanning, "2026-10")).toBe(300);
    expect(personnelShareOfMonth(spanning, "2026-11")).toBe(600);
    expect(personnelShareOfMonth(spanning, "2026-12")).toBe(0);
  });
  it("falls back to hours × rate when htva is 0 and to the entry month without shifts", () => {
    expect(personnelShareOfMonth({ ...spanning, htva: 0 }, "2026-11")).toBe(240);
    const plain = entry({ date: "2026-10-09", htva: 100, book: "achats", kind: "personnel" });
    expect(personnelShareOfMonth(plain, "2026-10")).toBe(100);
    expect(personnelShareOfMonth(plain, "2026-11")).toBe(0);
  });
});

describe("incomeStatement", () => {
  const fixedCharges = [
    charge({ chargeId: "ucm", category: "social", monthlyAmount: 300, from: "2026-10", to: "2026-11" }),
    charge({ chargeId: "pret", category: "remboursement", monthlyAmount: 600 }),
  ];
  const entries = [
    entry({ date: "2026-10-03", htva: 1000 }),
    entry({ date: "2026-10-20", htva: 50, kind: "commission", vatRate: 0 }),
    entry({ date: "2026-10-21", htva: 20, book: "achats", kind: "autre" }),
    entry({ date: "2026-10-09", htva: 100, book: "achats", kind: "personnel" }),
    entry({
      date: "2026-11-05",
      htva: 900,
      book: "achats",
      kind: "personnel",
      shifts: [
        { date: "2026-10-30", hours: 4 },
        { date: "2026-11-02", hours: 8 },
      ],
    }),
  ];
  const events = [
    event({
      eventId: "done",
      date: "2026-10-10",
      recipes: [{ lineId: "l1", recipeId: "quiche", portions: 30 }],
      extraCosts: [
        { label: "fromage", amount: 5, kind: "matiere" },
        { label: "extra", amount: 50, kind: "personnel" },
        { label: "salle", amount: 10, kind: "location" },
        { label: "camion", amount: 5, kind: "transport" },
        { label: "divers", amount: 7 },
      ],
    }),
    event({ eventId: "later", date: "2026-10-28", status: "upcoming", extraCosts: [{ label: "x", amount: 1000, kind: "personnel" }] }),
  ];

  it("computes each column of October and November", () => {
    const st = incomeStatement(2026, inputs({ entries, events, settings: settings({ fixedCharges }) }));
    const oct = st.months[9];
    expect(oct).toMatchObject({
      ym: "2026-10",
      ca: 1000,
      margeBrute: 935,
      autresProduits: 50,
      chargesFixes: 300,
      personnelExtra: 450,
      autresCouts: 42,
      resultat: 193,
      impots: 48.25,
      resultatNet: 144.75,
    });
    expect(oct.mp).toMatchObject({ amount: 65, source: "calcule" });
    expect(oct.margePct).toBeCloseTo(0.193);
    const nov = st.months[10];
    expect(nov).toMatchObject({ ca: 0, chargesFixes: 300, personnelExtra: 600, resultat: -900, impots: 0, resultatNet: -900, margePct: undefined });
    expect(st.months[11]).toMatchObject({ chargesFixes: 0, resultat: 0, impots: 0 });
  });

  it("taxes the annual row on the cumulated result, not the sum of the column", () => {
    const st = incomeStatement(2026, inputs({ entries, events, settings: settings({ fixedCharges }) }));
    expect(st.annual.resultat).toBe(-707);
    expect(st.annual.impots).toBe(0);
    expect(st.annual.impotsSource).toBe("estimation");

    const profitable = incomeStatement(2026, inputs({ entries: [entry({ date: "2026-10-03", htva: 1000 })], settings: settings({ fixedCharges }) }));
    expect(profitable.months[9]).toMatchObject({ resultat: 700, impots: 175 });
    expect(profitable.months[10]).toMatchObject({ resultat: -300, impots: 0 });
    expect(profitable.annual).toMatchObject({ resultat: 400, impots: 100, resultatNet: 300 });
    expect(profitable.ratios.chargesFixesSurCa).toBeCloseTo(0.6);
    expect(profitable.ratios.mpSurCa).toBe(0);
  });

  it("replaces the annual estimate with the typed corporate tax", () => {
    const st = incomeStatement(
      2026,
      inputs({
        entries: [entry({ date: "2026-10-03", htva: 1000 })],
        settings: settings({ fixedCharges, objectives: { "2026": { annualRevenue: 160000, monthsActive: 10, corporateTaxActual: 42 } } }),
      }),
    );
    expect(st.annual).toMatchObject({ impots: 42, impotsSource: "reel", resultatNet: 358 });
  });

  it("builds the simulation row from the objective in the chosen scenario", () => {
    const objective = { annualRevenue: 160000, monthsActive: 10, rawMaterialPct: 0.38, extrasBudget: 18000 };
    const charges = [charge({ chargeId: "salaire", category: "salaire", monthlyAmount: 4500, monthlyAmountSolo: 3000 })];
    const st = incomeStatement(2026, inputs({ settings: settings({ fixedCharges: charges, objectives: { "2026": objective } }) }), "seule");
    expect(st.simulation).toMatchObject({ scenario: "seule", ca: 160000, mp: 60800, chargesFixes: 36000, personnelExtra: 18000, resultat: 45200, impots: 11300, resultatNet: 33900 });
    expect(incomeStatement(2026, inputs()).simulation).toBeUndefined();
  });
});

describe("apercu", () => {
  const settingsWithHistory = settings({
    ledgerStartYm: "2026-12",
    objectives: { "2026": { annualRevenue: 160000, monthsActive: 10 } },
    yearActuals: {
      "2025": { monthly: { "01": 1000, "2025-02": 2000 }, note: "classeur 2025", byPeriod: [{ from: "01-01", to: "04-30", amount: 17474 }] },
      "2026": { monthly: { "11": 700 }, byPeriod: [{ from: "2026-04-30", to: "2026-06-30", amount: 20381 }] },
    },
  });
  const entries = [
    entry({ date: "2025-01-15", htva: 5555 }),
    entry({ date: "2026-11-15", htva: 500 }),
    entry({ date: "2026-12-02", htva: 300 }),
    entry({ date: "2026-12-03", htva: 25, kind: "commission", vatRate: 0 }),
  ];

  it("reads typed months before ledgerStartYm and the ledger from it", () => {
    const a = apercu(2026, inputs({ entries, settings: settingsWithHistory }));
    expect(a.rows[0].caN1).toEqual({ amount: 1000, source: "saisi", note: "classeur 2025" });
    expect(a.rows[1].caN1.amount).toBe(2000);
    expect(a.rows[2].caN1.amount).toBeUndefined();
    expect(a.rows[2].delta).toBeUndefined();
    expect(a.rows[10].caN).toEqual({ amount: 700, source: "saisi", note: undefined });
    expect(a.rows[11].caN).toEqual({ amount: 300, source: "ledger" });
    expect(a.rows[0]).toMatchObject({ objectif: 16000, atteint: false });
    expect(a.totals).toMatchObject({ caN: 1000, caN1: 3000, objectif: 160000, atteint: false });
    expect(a.totals.delta).toBeCloseTo(-2 / 3);
    expect(a.autresProduits).toEqual({ n: 25, n1: undefined });
  });

  it("incomeStatement reads typed CA before ledgerStartYm", () => {
    const st = incomeStatement(
      2026,
      inputs({
        recipeCostById: new Map(),
        recipePortionsById: new Map(),
        settings: settings({
          ledgerStartYm: "2026-04",
          yearActuals: { "2026": { monthly: { "01": 5000 } } },
          fixedCharges: [charge({ chargeId: "c", label: "loyer", category: "frais", monthlyAmount: 1000 })],
        }),
      }),
    );
    expect(st.months[0].ca).toBe(5000);
    expect(st.months[0].caSource).toBe("saisi");
    expect(st.months[0].resultat).toBe(4000);
    expect(st.months[3].caSource).toBe("ledger");
    expect(st.annual.ca).toBe(5000);
  });

  it("computes delta and reads the ledger everywhere when no start is set", () => {
    const a = apercu(2026, inputs({ entries: [entry({ date: "2025-03-01", htva: 100 }), entry({ date: "2026-03-01", htva: 150 })] }));
    expect(a.rows[2]).toMatchObject({ caN1: { amount: 100, source: "ledger" }, caN: { amount: 150, source: "ledger" }, delta: 0.5, objectif: undefined, atteint: undefined });
    expect(a.totals.objectif).toBeUndefined();
  });

  it("takes Prévision from Au réel", () => {
    const events = [event({ eventId: "signed", date: "2026-12-20", guestCount: 50, sellingPricePerGuest: 45 })];
    const a = apercu(2026, inputs({ entries, events, settings: settingsWithHistory }));
    expect(a.rows[11].prevision).toBe(2550);
    expect(a.totals.prevision).toBe(3050);
  });

  it("compares periods from the ledger only when every month is a ledger month", () => {
    const typed = apercu(2026, inputs({ entries, settings: settingsWithHistory }));
    expect(typed.periodComparison[0].byYear).toEqual([
      { year: 2024 },
      { year: 2025, amount: 17474, source: "saisi", note: "classeur 2025" },
      { year: 2026 },
    ]);
    expect(typed.periodComparison[1].byYear[2]).toEqual({ year: 2026, amount: 20381, source: "saisi", note: undefined });

    const ledgerEntries = [
      entry({ date: "2026-01-15", htva: 100 }),
      entry({ date: "2026-04-30", htva: 50 }),
      entry({ date: "2026-05-01", htva: 25 }),
      entry({ date: "2026-07-01", htva: 1000 }),
    ];
    expect(caOfPeriod(inputs({ entries: ledgerEntries }), 2026, { from: "01-01", to: "04-30" })).toEqual({ amount: 150, source: "ledger" });
    expect(caOfPeriod(inputs({ entries: ledgerEntries }), 2026, { from: "04-30", to: "06-30" })).toEqual({ amount: 75, source: "ledger" });
    const partial = inputs({ entries: ledgerEntries, settings: settings({ ledgerStartYm: "2026-02" }) });
    expect(caOfPeriod(partial, 2026, { from: "01-01", to: "04-30" })).toEqual({});
    expect(caOfPeriod(partial, 2026, { from: "04-30", to: "06-30" })).toEqual({ amount: 75, source: "ledger" });
  });

  it("caOfPeriod counts 30 April once", () => {
    const one = inputs({ entries: [entry({ date: "2026-04-30", htva: 100 })] });
    expect(COMPARISON_PERIODS.map((p) => caOfPeriod(one, 2026, p).amount)).toEqual([100, 0]);
    const typed = inputs({ settings: settings({ ledgerStartYm: "2026-12", yearActuals: { "2026": { byPeriod: [{ from: "04-30", to: "06-30", amount: 20381 }] } } }) });
    expect(caOfPeriod(typed, 2026, COMPARISON_PERIODS[1]).amount).toBe(20381);
  });
});

describe("mix", () => {
  const entries = [
    entry({ date: "2026-02-01", htva: 1000, prestationType: "menu_a_emporter" }),
    entry({ date: "2026-03-01", htva: 500, prestationType: "walking_cocktail" }),
    entry({ date: "2026-03-02", htva: 200, kind: "comptoir" }),
    entry({ date: "2026-03-03", htva: 100, prestationType: "disparu" }),
    entry({ date: "2026-03-04", htva: 50, kind: "commission", vatRate: 0 }),
    entry({ date: "2025-03-04", htva: 80, prestationType: "atelier" }),
  ];
  const events = [
    event({ eventId: "w1", date: "2026-05-01", prestationType: "walking_cocktail", sellingPricePerGuest: 40 }),
    event({ eventId: "w2", date: "2026-06-01", prestationType: "walking_cocktail", sellingPricePerGuest: 60 }),
    event({ eventId: "w0", date: "2024-06-01", prestationType: "walking_cocktail", sellingPricePerGuest: 1000 }),
    event({ eventId: "b0", date: "2024-06-01", prestationType: "brunch", sellingPricePerGuest: 30 }),
  ];
  const s = settings({
    ledgerStartYm: "2026-01",
    yearActuals: { "2025": { byPrestation: { menu_a_emporter: 90703.19 } } },
    objectives: {
      "2026": {
        annualRevenue: 160000,
        monthsActive: 10,
        byPrestation: [
          { type: "menu_a_emporter", amount: 100000, eventsNeeded: 40 },
          { type: "walking_cocktail", amount: 95000, guestsPerEvent: 50 },
          { type: "brunch", amount: 5000, guestsPerEvent: 20 },
          { type: "atelier", amount: 3000 },
        ],
      },
    },
  });

  it("buckets CA by type with Sans type for missing or unknown types, commissions excluded", () => {
    const m = mix(2026, inputs({ entries, events, settings: s }));
    const byLabel = Object.fromEntries(m.rows.map((r) => [r.label, r]));
    expect(byLabel["Menu à emporter"]).toMatchObject({ type: "menu_a_emporter", caN: 1000, caN1: 90703.19, caN1Source: "saisi", objectif: 100000, nbNecessaires: 40 });
    expect(byLabel["Walking / cocktail"]).toMatchObject({ caN: 500, caN1: undefined, objectif: 95000, averagePricePerGuest: 50, nbNecessaires: 38 });
    expect(byLabel["Brunch"]).toMatchObject({ caN: 0, averagePricePerGuest: 30, nbNecessaires: 5000 / (20 * 30) });
    expect(byLabel["Atelier"]).toMatchObject({ caN: 0, objectif: 3000, nbNecessaires: undefined });
    expect(byLabel["Sans type"]).toMatchObject({ type: undefined, caN: 300, objectif: undefined });
    expect(m.totals).toEqual({ caN1: 90703.19, caN: 1800, objectif: 203000 });
    expect(byLabel["Menu à emporter"].shareN).toBeCloseTo(1000 / 1800);
    expect(byLabel["Menu à emporter"].shareN1).toBe(1);
    expect(byLabel["Walking / cocktail"].shareObjectif).toBeCloseTo(95000 / 203000);
    expect(m.rows[m.rows.length - 1].label).toBe("Sans type");
  });

  it("counts a ca_mensuel entry in its type bucket", () => {
    const monthly = entry({ date: "2026-10-31", htva: 1200, kind: "ca_mensuel", prestationType: "brunch", paid: true });
    const m = mix(2026, inputs({ entries: [...entries, monthly], settings: s }));
    expect(m.rows.find((r) => r.type === "brunch")?.caN).toBe(1200);
    expect(m.totals.caN).toBe(3000);
  });

  it("averagePricePerGuest of a total-mode event uses the derived per-guest value", () => {
    const total = event({ eventId: "t", date: "2026-04-01", prestationType: "brunch", pricingMode: "total", sellingTotal: 900, guestCount: 30, sellingPricePerGuest: 0 });
    const m = mix(2026, inputs({ events: [total], settings: s }));
    expect(m.rows.find((r) => r.type === "brunch")).toMatchObject({ averagePricePerGuest: 30, nbNecessaires: 5000 / (20 * 30) });
  });

  it("reads N−1 from the ledger when the whole prior year is a ledger year", () => {
    const m = mix(2026, inputs({ entries, settings: settings({ ledgerStartYm: "2025-01" }) }));
    expect(m.rows.find((r) => r.type === "atelier")).toMatchObject({ caN1: 80, caN1Source: "ledger" });
    expect(m.rows.find((r) => r.type === "brunch")).toMatchObject({ caN1: 0, caN1Source: "ledger" });
  });
});

describe("previsionnel", () => {
  it("reproduces the workbook breakeven: 50 630,24 + 0 + 5 500", () => {
    expect(breakeven({ chargesAnnuellesCaisse: 50630.24, treasurySavingPerMonth: 0, investmentsTotal: 5500, monthsActive: 10, rawMaterialPct: 0.35 })).toEqual({
      seuilAnnuel: 56130.24,
      seuilMensuel: 4677.52,
      seuilParMoisActif: 5613.02,
      seuilAjusteMatieres: 86354.22,
    });
    expect(breakeven({ chargesAnnuellesCaisse: 90327.24, investmentsTotal: 5500 }).seuilAnnuel).toBe(95827.24);
    expect(breakeven({ chargesAnnuellesCaisse: 1200, treasurySavingPerMonth: 100 })).toMatchObject({ seuilAnnuel: 2400, seuilMensuel: 200, seuilParMoisActif: undefined, seuilAjusteMatieres: 2400 });
  });

  const fixedCharges = [
    charge({ chargeId: "salaire", category: "salaire", monthlyAmount: 4000, monthlyAmountSolo: 3000 }),
    charge({ chargeId: "pret", category: "remboursement", monthlyAmount: 600 }),
    charge({ chargeId: "dead", monthlyAmount: 999, to: "2025-12" }),
  ];
  const objective = {
    annualRevenue: 160000,
    monthsActive: 10,
    rawMaterialPct: 0.38,
    extrasBudget: 18000,
    treasuryMonths: 3,
    investments: [
      { label: "four", amount: 5000 },
      { label: "frigo", amount: 500 },
    ],
  };
  const s = settings({ fixedCharges, objectives: { "2026": objective } });

  it("computes every figure with the formulas of the plan", () => {
    const p = previsionnel(2026, inputs({ settings: s }));
    expect(p.charges.map((c) => c.chargeId)).toEqual(["salaire", "pret"]);
    expect(p.charges[1]).toMatchObject({ inResult: false, annuel: 7200 });
    expect(p.totals).toEqual({
      mensuelCaisse: { avec: 4600, seule: 3600 },
      mensuelResultat: { avec: 4000, seule: 3000 },
      horsResultat: { avec: 600, seule: 600 },
      annuelCaisse: { avec: 55200, seule: 43200 },
      annuelResultat: { avec: 48000, seule: 36000 },
    });
    expect(p).toMatchObject({
      scenario: "avec",
      chargesAnnuellesCaisse: 55200,
      chargesMensuellesCaisse: 4600,
      chargesAnnuellesResultat: 48000,
      investmentsTotal: 5500,
      treasurySavingPerMonth: 0,
      seuilAnnuel: 60700,
      seuilMensuel: 5058.33,
      seuilParMoisActif: 6070,
      seuilAjusteMatieres: 97903.23,
      besoinTresorerie: 13800,
      resultatPrevu: 33200,
      isocPrevu: 8300,
      objectifMoinsSeuil: 99300,
    });
    expect(p.margeNetteApresIsoc).toBeCloseTo(24900 / 160000);
  });

  it("follows the seule scenario", () => {
    const p = previsionnel(2026, inputs({ settings: s }), "seule");
    expect(p).toMatchObject({ chargesAnnuellesCaisse: 43200, seuilAnnuel: 48700, seuilMensuel: 4058.33, resultatPrevu: 45200, isocPrevu: 11300 });
    expect(p.charges[0].annuel).toBe(36000);
  });

  it("leaves objective figures undefined without an objective", () => {
    const p = previsionnel(2026, inputs({ settings: settings({ fixedCharges }) }));
    expect(p).toMatchObject({ seuilAnnuel: 55200, seuilMensuel: 4600, besoinTresorerie: 13800, seuilParMoisActif: undefined, resultatPrevu: undefined, isocPrevu: undefined, objectifMoinsSeuil: undefined });
  });
});

describe("auReel", () => {
  const s = settings({
    objectives: { "2026": { annualRevenue: 160000, monthsActive: 10, hoursAvailablePerMonth: 208, hoursAvailableOverrides: { "2026-09": 0 } } },
  });
  const frahan = event({ eventId: "frahan", date: "2026-10-18", name: "Mariage de Frahan", contactName: "Doriane de Frahan", guestCount: 50, sellingPricePerGuest: 29.75, hoursSpent: 12, notes: "jardin", prestationType: "walking_cocktail" });
  const hoona = event({ eventId: "hoona-1", date: "2026-10-06", clientId: "hoona", guestCount: 30, sellingPricePerGuest: 12, hoursSpent: 3 });
  const nextMonth = event({ eventId: "nov", date: "2026-11-02", guestCount: 1, sellingPricePerGuest: 5000 });
  const deposit = entry({ date: "2026-10-05", htva: 750, kind: "acompte", label: "De Frahan acompte", eventIds: ["frahan"], paid: true });
  const commission = entry({ date: "2026-10-20", htva: 50, kind: "commission", vatRate: 0 });
  const clients = [{ clientId: "hoona", name: "Hoona" }] as ReportInputs["clients"];

  it("counts a deposit and its event both, as the workbook does", () => {
    const r = auReel("2026-10", inputs({ entries: [deposit, commission], events: [frahan, hoona, nextMonth], settings: s, clients }));
    expect(r.rows.map((row) => [row.tag, row.label, row.htva, row.hours])).toEqual([
      ["facture", "De Frahan acompte", 750, undefined],
      ["signe", "Hoona", 360, 3],
      ["signe", "Doriane de Frahan", 1487.5, 12],
    ]);
    expect(r).toMatchObject({ totalSigne: 2597.5, totalHeures: 15, jeVise: 16000, tempsDisponible: 208, resteASigner: 13402.5, heuresRestantes: 193 });
  });

  it("replaces the event row by the invoice once a facture covers it and keeps the hours", () => {
    const invoice = entry({ date: "2026-11-01", htva: 737.5, label: "Doriane de Frahan", number: "2026-014", eventIds: ["frahan"] });
    const oct = auReel("2026-10", inputs({ entries: [deposit, invoice], events: [frahan], settings: s }));
    expect(oct.rows.map((row) => row.label)).toEqual(["De Frahan acompte"]);
    expect(oct.totalHeures).toBe(0);
    const nov = auReel("2026-11", inputs({ entries: [deposit, invoice], events: [frahan], settings: s }));
    expect(nov.rows).toEqual([
      expect.objectContaining({ kind: "entry", tag: "facture", entryKind: "facture", htva: 737.5, eventIds: ["frahan"], hours: 12 }),
    ]);
  });

  it("externe drops the event rows once the month has a ca_mensuel entry; app mode keeps both", () => {
    const monthly = entry({ date: "2026-10-31", htva: 1200, kind: "ca_mensuel", label: "CA · Octobre 2026", paid: true });
    const externe = settings({ ...s, invoicing: "externe" });
    const r = auReel("2026-10", inputs({ entries: [monthly, commission], events: [frahan, hoona], settings: externe, clients }));
    expect(r.rows.map((row) => [row.kind, row.label, row.htva])).toEqual([["entry", "CA · Octobre 2026", 1200]]);
    expect(r.totalSigne).toBe(1200);
    const app = auReel("2026-10", inputs({ entries: [monthly, commission], events: [frahan, hoona], settings: s, clients }));
    expect(app.rows.map((row) => row.tag)).toEqual(["signe", "signe", "facture"]);
    expect(app.totalSigne).toBe(3047.5);
  });

  it("externe keeps the event rows as a forecast while the month has no CA entry", () => {
    const externe = settings({ ...s, invoicing: "externe" });
    const r = auReel("2026-10", inputs({ entries: [commission], events: [frahan, hoona], settings: externe, clients }));
    expect(r.rows.map((row) => [row.tag, row.htva])).toEqual([["signe", 360], ["signe", 1487.5]]);
    expect(r.totalSigne).toBe(1847.5);
  });

  it("uses the month override for hours available", () => {
    const r = auReel("2026-09", inputs({ settings: s }));
    expect(r).toMatchObject({ totalSigne: 0, tempsDisponible: 0, heuresRestantes: 0, resteASigner: 16000 });
    expect(auReel("2026-09", inputs())).toMatchObject({ jeVise: undefined, tempsDisponible: undefined, resteASigner: undefined, heuresRestantes: undefined });
  });

  it("sums the year and the gap to the annual objective", () => {
    const y = auReelYear(2026, inputs({ entries: [deposit], events: [frahan, hoona, nextMonth], settings: s, clients }));
    expect(y.months).toHaveLength(12);
    expect(y).toMatchObject({ totalSigne: 7597.5, totalHeures: 15, annualRevenue: 160000, ecart: 152402.5 });
    expect(auReelYear(2026, inputs()).ecart).toBeUndefined();
  });
});

describe("aFacturer", () => {
  const today = "2026-10-18";
  const client = (partial: Partial<Client> & Pick<Client, "clientId" | "name">): Client => ({
    nameLower: partial.name.toLowerCase(),
    templates: [],
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  });
  const hoona = client({ clientId: "hoona", name: "Hoona", invoicing: "mensuelle" });
  const dupont = client({ clientId: "dupont", name: "Dupont", invoicing: "par_evenement" });

  it("puts a completed event of a monthly client in one monthly row and never in the event list", () => {
    const events = [
      event({ eventId: "s1", date: "2026-09-01", clientId: "hoona", guestCount: 30, sellingPricePerGuest: 14 }),
      event({ eventId: "s2", date: "2026-09-08", clientId: "hoona", guestCount: 30, sellingPricePerGuest: 14 }),
      event({ eventId: "o1", date: "2026-10-06", clientId: "hoona", guestCount: 30, sellingPricePerGuest: 14 }),
    ];
    const r = aFacturer({ events, entries: [], clients: [hoona] }, today);
    expect(r.toInvoice).toEqual([]);
    expect(r.toInvoiceMonthly).toEqual([{ clientId: "hoona", clientName: "Hoona", ym: "2026-09", eventIds: ["s1", "s2"], htva: 840 }]);
    expect(r.totals.toInvoiceHtva).toBe(840);
  });

  it("keeps an event with only an acompte in toInvoice with acomptesHtva filled", () => {
    const events = [event({ eventId: "m", date: "2026-10-17", name: "Mariage Dupont", clientId: "dupont", guestCount: 60, sellingPricePerGuest: 55, prestationType: "chef_a_domicile" })];
    const entries = [entry({ date: "2026-09-01", kind: "acompte", htva: 446, eventIds: ["m"] })];
    const r = aFacturer({ events, entries, clients: [dupont] }, today);
    expect(r.toInvoice).toEqual([
      { eventId: "m", label: "Mariage Dupont", date: "2026-10-17", htva: 3300, acomptesHtva: 446, prestationType: "chef_a_domicile" },
    ]);
    expect(r.totals.toInvoiceHtva).toBe(3300);
  });

  it("drops an event listed in a facture entry's eventIds", () => {
    const events = [
      event({ eventId: "billed", date: "2026-10-01", guestCount: 10, sellingPricePerGuest: 100 }),
      event({ eventId: "open", date: "2026-10-02", guestCount: 10, sellingPricePerGuest: 100 }),
    ];
    const entries = [entry({ date: "2026-10-05", kind: "facture", htva: 1000, eventIds: ["billed"] })];
    const r = aFacturer({ events, entries, clients: [] }, today);
    expect(r.toInvoice.map((e) => e.eventId)).toEqual(["open"]);
  });

  it("leaves an upcoming past event with a facture entry out of toClose", () => {
    const events = [
      event({ eventId: "billed", date: "2026-10-01", status: "upcoming" }),
      event({ eventId: "stale", date: "2026-10-02", status: "upcoming" }),
      event({ eventId: "future", date: "2026-10-30", status: "upcoming" }),
    ];
    const entries = [entry({ date: "2026-10-05", kind: "facture", htva: 200, eventIds: ["billed"] })];
    const r = aFacturer({ events, entries, clients: [] }, today);
    expect(r.toClose.map((e) => e.eventId)).toEqual(["stale"]);
  });

  it("lists unpaid invoices oldest first with their age and sums TVAC", () => {
    const entries = [
      entry({ date: "2026-09-30", htva: 843, totalTvac: 893.5, kind: "comptoir" }),
      entry({ date: "2026-09-26", htva: 1000, totalTvac: 1092 }),
      entry({ date: "2026-09-01", htva: 1, paid: true }),
      entry({ date: "2026-09-02", htva: 1, kind: "acompte" }),
    ];
    const r = aFacturer({ events: [], entries, clients: [] }, today);
    expect(r.unpaid.map((e) => [e.date, e.daysOutstanding])).toEqual([["2026-09-26", 22], ["2026-09-30", 18]]);
    expect(r.totals.unpaidTvac).toBe(1985.5);
  });
});
