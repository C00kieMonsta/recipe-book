import type { Client } from "../entities/client";
import type { AppEvent } from "../entities/event";
import type { LedgerEntry, SalesKind } from "../entities/ledger";
import type { AppSettings, FixedCharge, MonthClose, MpSource, YearObjective } from "../entities/settings";
import { DEFAULT_PRESTATION_TYPES } from "../entities/settings";
import { calcEventCost } from "./costing";
import { daysBetween, ymOf } from "./dates";
import { round2, sumMoney } from "./money";
import { shortEventName, signedRevenue } from "./planning";

// Everything the Comptabilité pages need; every figure is derived from this at render time.
export interface ReportInputs {
  entries: LedgerEntry[];
  events: AppEvent[];
  recipeCostById: Map<string, number>;
  recipePortionsById: Map<string, number>;
  settings: AppSettings;
  clients?: Client[];
}

export type Scenario = "avec" | "seule";
export type CaSource = "ledger" | "saisi";

export const SANS_TYPE = "Sans type";
export const DEFAULT_CORPORATE_TAX_RATE = 0.25;
export const DEFAULT_TREASURY_MONTHS = 3;

export const CA_KINDS: SalesKind[] = ["facture", "acompte", "comptoir", "bon_cadeau", "note_de_credit", "autre"];

// The one definition of CA: sales entries of a CA kind. Commissions are "Autres produits".
export function isCaEntry(entry: Pick<LedgerEntry, "book" | "kind">): boolean {
  return entry.book === "ventes" && (CA_KINDS as string[]).includes(entry.kind);
}

export function isCommissionEntry(entry: Pick<LedgerEntry, "book" | "kind">): boolean {
  return entry.book === "ventes" && entry.kind === "commission";
}

export function yearMonths(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

// Per-month records may be keyed by "YYYY-MM" or by "MM"; both are accepted.
function monthKeyed<T>(rec: Record<string, T> | undefined, ym: string): T | undefined {
  return rec?.[ym] ?? rec?.[ym.slice(5, 7)];
}

function objectiveOf(settings: AppSettings, year: number): YearObjective | undefined {
  return settings.objectives?.[String(year)];
}

function yearOf(ym: string): number {
  return Number(ym.slice(0, 4));
}

export function objectifMensuel(objective: YearObjective | undefined, ym: string): number | undefined {
  if (!objective) return undefined;
  const override = monthKeyed(objective.monthlyOverrides, ym);
  if (override !== undefined) return override;
  if (!objective.monthsActive) return undefined;
  return round2(objective.annualRevenue / objective.monthsActive);
}

export function chargeInResult(charge: Pick<FixedCharge, "inResult" | "category">): boolean {
  return charge.inResult ?? charge.category !== "remboursement";
}

export function chargeActiveIn(charge: Pick<FixedCharge, "from" | "to">, ym: string): boolean {
  return (charge.from === undefined || charge.from <= ym) && (charge.to === undefined || ym <= charge.to);
}

// Solo amount falls back to the normal amount when the charge has no solo value.
export function chargeAmount(charge: Pick<FixedCharge, "monthlyAmount" | "monthlyAmountSolo">, scenario: Scenario): number {
  return scenario === "seule" ? (charge.monthlyAmountSolo ?? charge.monthlyAmount) : charge.monthlyAmount;
}

export function chargesForMonth(
  fixedCharges: FixedCharge[] | undefined,
  ym: string,
  scenario: Scenario,
  which: "caisse" | "resultat",
): number {
  return sumMoney(
    (fixedCharges ?? [])
      .filter((c) => chargeActiveIn(c, ym) && (which === "caisse" || chargeInResult(c)))
      .map((c) => chargeAmount(c, scenario)),
  );
}

function entriesOfMonth(entries: LedgerEntry[], ym: string): LedgerEntry[] {
  return entries.filter((e) => ymOf(e.date) === ym);
}

function eventsOfMonth(events: AppEvent[], ym: string): AppEvent[] {
  return events.filter((e) => ymOf(e.date) === ym);
}

// Σ CA HTVA of the ledger for one month; credit notes are negative lines and reduce it.
export function ledgerCaOfMonth(entries: LedgerEntry[], ym: string): number {
  return sumMoney(entriesOfMonth(entries, ym).filter(isCaEntry).map((e) => e.htva));
}

export function commissionsOfMonth(entries: LedgerEntry[], ym: string): number {
  return sumMoney(entriesOfMonth(entries, ym).filter(isCommissionEntry).map((e) => e.htva));
}

export interface RawMaterialInputs {
  monthClose?: MonthClose;
  entries: LedgerEntry[];
  events: AppEvent[];
  recipeCostById: Map<string, number>;
  recipePortionsById: Map<string, number>;
}

export interface RawMaterialOfMonth {
  amount: number;
  source: MpSource;
  // The three candidate figures, so the lock dialog can show them side by side.
  calcule: number;
  achats: number;
  saisi?: number;
  achatsPartiels?: number;
  upcoming?: number;
  nonTermines?: number;
}

function matiereCost(event: AppEvent, inputs: Pick<RawMaterialInputs, "recipeCostById" | "recipePortionsById">): number {
  const cost = calcEventCost(event, inputs.recipeCostById, inputs.recipePortionsById);
  return round2(cost.rawMaterial + cost.extras.matiere);
}

export function rawMaterialOfMonth(ym: string, inputs: RawMaterialInputs): RawMaterialOfMonth {
  const source = inputs.monthClose?.mpSource ?? "calcule";
  const monthEvents = eventsOfMonth(inputs.events, ym);
  const completed = monthEvents.filter((e) => e.status === "completed");
  const notCompleted = monthEvents.filter((e) => e.status !== "completed");
  const calcule = sumMoney(completed.map((e) => matiereCost(e, inputs)));
  const achats = sumMoney(
    entriesOfMonth(inputs.entries, ym)
      .filter((e) => e.book === "achats" && e.kind === "mp")
      .map((e) => e.htva),
  );
  const saisi = inputs.monthClose?.rawMaterial;
  const amount = source === "saisi" ? (saisi ?? 0) : source === "achats" ? achats : calcule;
  return {
    amount,
    source,
    calcule,
    achats,
    saisi,
    achatsPartiels: source === "calcule" && achats > 0 ? achats : undefined,
    upcoming: notCompleted.length ? sumMoney(notCompleted.map((e) => matiereCost(e, inputs))) : undefined,
    nonTermines: notCompleted.length || undefined,
  };
}

// Belgian corporate tax: 25 % flat, or the SME reduced rate of 20 % on the first 100 000 €.
export function isoc(result: number, objective?: Pick<YearObjective, "smeReducedRate" | "corporateTaxRate">): number {
  const r = Math.max(0, result);
  if (objective?.smeReducedRate) return round2(Math.min(r, 100_000) * 0.2 + Math.max(0, r - 100_000) * 0.25);
  return round2(r * (objective?.corporateTaxRate ?? DEFAULT_CORPORATE_TAX_RATE));
}

// A personnel entry is worth its htva, or hours × rate when htva was left at 0.
export function personnelEntryAmount(entry: LedgerEntry): number {
  if (entry.htva) return entry.htva;
  const hours = (entry.shifts ?? []).reduce((n, s) => n + s.hours, 0);
  return round2(hours * (entry.hourlyRate ?? 0));
}

// Share of a personnel entry falling in a month, pro rata to shift hours; no shifts means the entry's own month.
export function personnelShareOfMonth(entry: LedgerEntry, ym: string): number {
  const total = personnelEntryAmount(entry);
  const shifts = entry.shifts ?? [];
  if (shifts.length === 0) return ymOf(entry.date) === ym ? total : 0;
  const hoursTotal = shifts.reduce((n, s) => n + s.hours, 0);
  if (hoursTotal === 0) return ymOf(entry.date) === ym ? total : 0;
  const hoursInMonth = shifts.filter((s) => ymOf(s.date) === ym).reduce((n, s) => n + s.hours, 0);
  return round2((total * hoursInMonth) / hoursTotal);
}

export interface IncomeRow {
  ym: string;
  ca: number;
  caSource: CaSource;
  caNote?: string;
  mp: RawMaterialOfMonth;
  margeBrute: number;
  autresProduits: number;
  chargesFixes: number;
  personnelExtra: number;
  autresCouts: number;
  resultat: number;
  margePct?: number;
  impots: number;
  resultatNet: number;
}

export interface IncomeAnnual {
  ca: number;
  mp: number;
  margeBrute: number;
  autresProduits: number;
  chargesFixes: number;
  personnelExtra: number;
  autresCouts: number;
  resultat: number;
  margePct?: number;
  // Tax on the cumulated result, not the sum of the monthly column.
  impots: number;
  impotsSource: "estimation" | "reel";
  resultatNet: number;
}

export interface IncomeSimulation {
  scenario: Scenario;
  ca: number;
  mp: number;
  margeBrute: number;
  chargesFixes: number;
  personnelExtra: number;
  resultat: number;
  margePct?: number;
  impots: number;
  resultatNet: number;
}

export interface IncomeStatement {
  year: number;
  months: IncomeRow[];
  annual: IncomeAnnual;
  ratios: { mpSurCa?: number; margeBruteSurCa?: number; chargesFixesSurCa?: number };
  simulation?: IncomeSimulation;
}

function ratio(part: number, whole: number): number | undefined {
  return whole > 0 ? part / whole : undefined;
}

export function incomeStatement(year: number, inputs: ReportInputs, scenario: Scenario = "avec"): IncomeStatement {
  const { entries, events, settings } = inputs;
  const objective = objectiveOf(settings, year);
  const personnelEntries = entries.filter((e) => e.book === "achats" && e.kind === "personnel");

  const months = yearMonths(year).map((ym): IncomeRow => {
    const monthEntries = entriesOfMonth(entries, ym);
    const completed = eventsOfMonth(events, ym).filter((e) => e.status === "completed");
    const extras = completed.map((e) => calcEventCost(e, inputs.recipeCostById, inputs.recipePortionsById).extras);
    const caFig = caOfMonth(inputs, ym);
    const ca = caFig.amount ?? 0;
    const mp = rawMaterialOfMonth(ym, { ...inputs, monthClose: settings.monthCloses?.[ym] });
    const autresProduits = commissionsOfMonth(entries, ym);
    const chargesFixes = chargesForMonth(settings.fixedCharges, ym, "avec", "resultat");
    const personnelExtra = sumMoney([
      ...personnelEntries.map((e) => personnelShareOfMonth(e, ym)),
      ...extras.map((x) => x.personnel),
    ]);
    const autresCouts = sumMoney([
      ...monthEntries.filter((e) => e.book === "achats" && e.kind === "autre").map((e) => e.htva),
      ...extras.map((x) => sumMoney([x.location, x.transport, x.autre])),
    ]);
    const resultat = sumMoney([ca, -mp.amount, autresProduits, -chargesFixes, -personnelExtra, -autresCouts]);
    const impots = isoc(resultat, objective);
    return {
      ym,
      ca,
      caSource: caFig.source,
      caNote: caFig.note,
      mp,
      margeBrute: sumMoney([ca, -mp.amount]),
      autresProduits,
      chargesFixes,
      personnelExtra,
      autresCouts,
      resultat,
      margePct: ratio(resultat, ca),
      impots,
      resultatNet: sumMoney([resultat, -impots]),
    };
  });

  const sum = (pick: (r: IncomeRow) => number) => sumMoney(months.map(pick));
  const ca = sum((r) => r.ca);
  const mp = sum((r) => r.mp.amount);
  const margeBrute = sum((r) => r.margeBrute);
  const chargesFixes = sum((r) => r.chargesFixes);
  const resultat = sum((r) => r.resultat);
  const impotsSource = objective?.corporateTaxActual !== undefined ? "reel" : "estimation";
  const impots = impotsSource === "reel" ? (objective?.corporateTaxActual as number) : isoc(resultat, objective);
  const annual: IncomeAnnual = {
    ca,
    mp,
    margeBrute,
    autresProduits: sum((r) => r.autresProduits),
    chargesFixes,
    personnelExtra: sum((r) => r.personnelExtra),
    autresCouts: sum((r) => r.autresCouts),
    resultat,
    margePct: ratio(resultat, ca),
    impots,
    impotsSource,
    resultatNet: sumMoney([resultat, -impots]),
  };

  let simulation: IncomeSimulation | undefined;
  if (objective) {
    const simCa = objective.annualRevenue;
    const simMp = round2(simCa * (objective.rawMaterialPct ?? 0));
    const simCharges = sumMoney(yearMonths(year).map((ym) => chargesForMonth(settings.fixedCharges, ym, scenario, "resultat")));
    const simPersonnel = objective.extrasBudget ?? 0;
    const simResultat = sumMoney([simCa, -simMp, -simCharges, -simPersonnel]);
    const simImpots = isoc(simResultat, objective);
    simulation = {
      scenario,
      ca: simCa,
      mp: simMp,
      margeBrute: sumMoney([simCa, -simMp]),
      chargesFixes: simCharges,
      personnelExtra: simPersonnel,
      resultat: simResultat,
      margePct: ratio(simResultat, simCa),
      impots: simImpots,
      resultatNet: sumMoney([simResultat, -simImpots]),
    };
  }

  return {
    year,
    months,
    annual,
    ratios: { mpSurCa: ratio(mp, ca), margeBruteSurCa: ratio(margeBrute, ca), chargesFixesSurCa: ratio(chargesFixes, ca) },
    simulation,
  };
}

// A month reads the ledger from settings.ledgerStartYm onwards; with no start set, every month reads the ledger.
export function isLedgerMonth(settings: Pick<AppSettings, "ledgerStartYm">, ym: string): boolean {
  return settings.ledgerStartYm === undefined || ym >= settings.ledgerStartYm;
}

export interface CaFigure {
  amount?: number;
  source: CaSource;
  note?: string;
}

// CA of a month: ledger when the month is a ledger month, else the typed prior-year value (undefined when not typed).
export function caOfMonth(inputs: Pick<ReportInputs, "entries" | "settings">, ym: string): CaFigure {
  if (isLedgerMonth(inputs.settings, ym)) return { amount: ledgerCaOfMonth(inputs.entries, ym), source: "ledger" };
  const actuals = inputs.settings.yearActuals?.[ym.slice(0, 4)];
  return { amount: monthKeyed(actuals?.monthly, ym), source: "saisi", note: actuals?.note };
}

export interface ApercuRow {
  ym: string;
  caN1: CaFigure;
  caN: CaFigure;
  delta?: number;
  objectif?: number;
  prevision: number;
  atteint?: boolean;
}

export interface PeriodComparison {
  from: string;
  to: string;
  byYear: { year: number; amount?: number; source?: CaSource; note?: string }[];
}

export interface Apercu {
  year: number;
  rows: ApercuRow[];
  totals: { caN1?: number; caN: number; delta?: number; objectif?: number; prevision: number; atteint?: boolean };
  autresProduits: { n: number; n1?: number };
  periodComparison: PeriodComparison[];
}

export const COMPARISON_PERIODS: { from: string; to: string }[] = [
  { from: "01-01", to: "04-30" },
  { from: "05-01", to: "06-30" },
];

// The workbook labels the second period from 30 April, so a typed byPeriod may start on either day, with or without the year.
function matchesFrom(typedFrom: string, mmdd: string, year: number): boolean {
  const accepted = mmdd === "05-01" ? ["05-01", "04-30"] : [mmdd];
  return accepted.some((a) => typedFrom === a || typedFrom === `${year}-${a}`);
}

function sumDefined(xs: (number | undefined)[]): number | undefined {
  const defined = xs.filter((x): x is number => x !== undefined);
  return defined.length ? sumMoney(defined) : undefined;
}

function delta(n: number | undefined, n1: number | undefined): number | undefined {
  return n !== undefined && n1 !== undefined && n1 !== 0 ? (n - n1) / n1 : undefined;
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let ym = from; ym <= to; ) {
    out.push(ym);
    const y = yearOf(ym);
    const m = Number(ym.slice(5, 7));
    ym = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return out;
}

// Period CA: ledger when every month of the period is a ledger month, else the typed byPeriod value, else undefined.
export function caOfPeriod(
  inputs: Pick<ReportInputs, "entries" | "settings">,
  year: number,
  period: { from: string; to: string },
): { amount?: number; source?: CaSource; note?: string } {
  const from = `${year}-${period.from}`;
  const to = `${year}-${period.to}`;
  if (monthsBetween(ymOf(from), ymOf(to)).every((ym) => isLedgerMonth(inputs.settings, ym))) {
    const amount = sumMoney(inputs.entries.filter((e) => isCaEntry(e) && e.date >= from && e.date <= to).map((e) => e.htva));
    return { amount, source: "ledger" };
  }
  const actuals = inputs.settings.yearActuals?.[String(year)];
  const typed = actuals?.byPeriod?.find(
    (p) => matchesFrom(p.from, period.from, year) && (p.to === period.to || p.to === to),
  );
  return typed ? { amount: typed.amount, source: "saisi", note: actuals?.note } : {};
}

export function apercu(year: number, inputs: ReportInputs): Apercu {
  const { settings } = inputs;
  const objective = objectiveOf(settings, year);
  const rows = yearMonths(year).map((ym): ApercuRow => {
    const caN = caOfMonth(inputs, ym);
    const caN1 = caOfMonth(inputs, `${year - 1}${ym.slice(4)}`);
    const objectif = objectifMensuel(objective, ym);
    const amount = caN.amount ?? 0;
    return {
      ym,
      caN1,
      caN,
      delta: delta(amount, caN1.amount),
      objectif,
      prevision: auReel(ym, inputs).totalSigne,
      atteint: objectif !== undefined ? amount >= objectif : undefined,
    };
  });
  const caN = sumMoney(rows.map((r) => r.caN.amount ?? 0));
  const caN1 = sumDefined(rows.map((r) => r.caN1.amount));
  // The objective total is the annual objective, not the sum of the monthly column (annual ÷ monthsActive × 12).
  const objectif = objective?.annualRevenue;
  const commissionsOfYear = (y: number): number | undefined => {
    const ledgerMonths = yearMonths(y).filter((ym) => isLedgerMonth(settings, ym));
    return ledgerMonths.length ? sumMoney(ledgerMonths.map((ym) => commissionsOfMonth(inputs.entries, ym))) : undefined;
  };
  return {
    year,
    rows,
    totals: {
      caN1,
      caN,
      delta: delta(caN, caN1),
      objectif,
      prevision: sumMoney(rows.map((r) => r.prevision)),
      atteint: objectif !== undefined ? caN >= objectif : undefined,
    },
    autresProduits: { n: commissionsOfYear(year) ?? 0, n1: commissionsOfYear(year - 1) },
    periodComparison: COMPARISON_PERIODS.map((period) => ({
      ...period,
      byYear: [year - 2, year - 1, year].map((y) => ({ year: y, ...caOfPeriod(inputs, y, period) })),
    })),
  };
}

export interface MixRow {
  // undefined is the "Sans type" bucket.
  type?: string;
  label: string;
  caN1?: number;
  caN1Source?: CaSource;
  shareN1?: number;
  caN: number;
  shareN?: number;
  objectif?: number;
  shareObjectif?: number;
  nbNecessaires?: number;
  averagePricePerGuest?: number;
}

export interface Mix {
  year: number;
  rows: MixRow[];
  totals: { caN1?: number; caN: number; objectif?: number };
}

function average(xs: number[]): number | undefined {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
}

export function mix(year: number, inputs: ReportInputs): Mix {
  const { entries, events, settings } = inputs;
  const objective = objectiveOf(settings, year);
  const types = settings.prestationTypes ?? DEFAULT_PRESTATION_TYPES;
  const buckets: { type?: string; label: string }[] = [...types.map((t) => ({ type: t.key, label: t.label })), { type: undefined, label: SANS_TYPE }];
  const known = new Set(types.map((t) => t.key));
  // A type that is no longer in settings counts as "Sans type".
  const bucketOf = (type: string | undefined): string | undefined => (type !== undefined && known.has(type) ? type : undefined);

  const caByType = (y: number, type: string | undefined): number =>
    sumMoney(
      entries
        .filter((e) => isCaEntry(e) && yearOf(ymOf(e.date)) === y && bucketOf(e.prestationType) === type)
        .map((e) => e.htva),
    );
  const ledgerYearN1 = yearMonths(year - 1).every((ym) => isLedgerMonth(settings, ym));
  const typedN1 = settings.yearActuals?.[String(year - 1)]?.byPrestation;

  const rows = buckets.map((bucket): MixRow => {
    const caN = caByType(year, bucket.type);
    let caN1: number | undefined;
    let caN1Source: CaSource | undefined;
    if (typedN1 && bucket.type !== undefined && typedN1[bucket.type] !== undefined) {
      caN1 = typedN1[bucket.type];
      caN1Source = "saisi";
    } else if (ledgerYearN1) {
      caN1 = caByType(year - 1, bucket.type);
      caN1Source = "ledger";
    }
    const target = bucket.type !== undefined ? objective?.byPrestation?.find((b) => b.type === bucket.type) : undefined;
    const typed = events.filter((e) => e.prestationType === bucket.type && bucket.type !== undefined);
    const ofYear = typed.filter((e) => yearOf(ymOf(e.date)) === year);
    const averagePricePerGuest = average((ofYear.length ? ofYear : typed).map((e) => e.sellingPricePerGuest));
    let nbNecessaires: number | undefined = target?.eventsNeeded;
    if (nbNecessaires === undefined && target && target.guestsPerEvent && averagePricePerGuest) {
      nbNecessaires = target.amount / (target.guestsPerEvent * averagePricePerGuest);
    }
    return { ...bucket, caN1, caN1Source, caN, objectif: target?.amount, nbNecessaires, averagePricePerGuest };
  });

  const totals = {
    caN1: sumDefined(rows.map((r) => r.caN1)),
    caN: sumMoney(rows.map((r) => r.caN)),
    objectif: sumDefined(rows.map((r) => r.objectif)),
  };
  for (const row of rows) {
    row.shareN = ratio(row.caN, totals.caN);
    row.shareN1 = row.caN1 !== undefined && totals.caN1 ? ratio(row.caN1, totals.caN1) : undefined;
    row.shareObjectif = row.objectif !== undefined && totals.objectif ? ratio(row.objectif, totals.objectif) : undefined;
  }
  return { year, rows, totals };
}

export interface ChargeRow {
  chargeId: string;
  label: string;
  category: FixedCharge["category"];
  monthlyAmount: number;
  monthlyAmountSolo?: number;
  inResult: boolean;
  from?: string;
  to?: string;
  note?: string;
  // Sum over the months of the year the charge is active, in the chosen scenario.
  annuel: number;
}

export interface Previsionnel {
  year: number;
  scenario: Scenario;
  objective?: YearObjective;
  charges: ChargeRow[];
  totals: {
    mensuelCaisse: { avec: number; seule: number };
    mensuelResultat: { avec: number; seule: number };
    horsResultat: { avec: number; seule: number };
    annuelCaisse: { avec: number; seule: number };
    annuelResultat: { avec: number; seule: number };
  };
  chargesAnnuellesCaisse: number;
  chargesMensuellesCaisse: number;
  chargesAnnuellesResultat: number;
  investments: { label: string; amount: number }[];
  investmentsTotal: number;
  treasurySavingPerMonth: number;
  seuilAnnuel: number;
  seuilMensuel: number;
  seuilParMoisActif?: number;
  seuilAjusteMatieres: number;
  besoinTresorerie: number;
  resultatPrevu?: number;
  isocPrevu?: number;
  margeNetteApresIsoc?: number;
  objectifMoinsSeuil?: number;
}

// The workbook's breakeven arithmetic (C42 + C47×12 + C48), separated so it can be checked against its figures.
export function breakeven(args: {
  chargesAnnuellesCaisse: number;
  treasurySavingPerMonth?: number;
  investmentsTotal?: number;
  monthsActive?: number;
  rawMaterialPct?: number;
}): { seuilAnnuel: number; seuilMensuel: number; seuilParMoisActif?: number; seuilAjusteMatieres: number } {
  const saving = args.treasurySavingPerMonth ?? 0;
  const investments = args.investmentsTotal ?? 0;
  const seuilAnnuel = round2(args.chargesAnnuellesCaisse + 12 * saving + investments);
  const seuilMensuel = round2(args.chargesAnnuellesCaisse / 12 + saving + investments / 12);
  const pct = args.rawMaterialPct ?? 0;
  return {
    seuilAnnuel,
    seuilMensuel,
    seuilParMoisActif: args.monthsActive ? round2(seuilAnnuel / args.monthsActive) : undefined,
    seuilAjusteMatieres: pct < 1 ? round2(seuilAnnuel / (1 - pct)) : seuilAnnuel,
  };
}

export function previsionnel(year: number, inputs: ReportInputs, scenario: Scenario = "avec"): Previsionnel {
  const { settings } = inputs;
  const objective = objectiveOf(settings, year);
  const months = yearMonths(year);
  const active = (settings.fixedCharges ?? []).filter((c) => months.some((ym) => chargeActiveIn(c, ym)));

  const charges = active.map((c): ChargeRow => ({
    chargeId: c.chargeId,
    label: c.label,
    category: c.category,
    monthlyAmount: c.monthlyAmount,
    monthlyAmountSolo: c.monthlyAmountSolo,
    inResult: chargeInResult(c),
    from: c.from,
    to: c.to,
    note: c.note,
    annuel: sumMoney(months.filter((ym) => chargeActiveIn(c, ym)).map(() => chargeAmount(c, scenario))),
  }));

  const annual = (s: Scenario, which: "caisse" | "resultat") =>
    sumMoney(months.map((ym) => chargesForMonth(active, ym, s, which)));
  const monthly = (s: Scenario, pick: (c: FixedCharge) => boolean) => sumMoney(active.filter(pick).map((c) => chargeAmount(c, s)));
  const totals: Previsionnel["totals"] = {
    mensuelCaisse: { avec: monthly("avec", () => true), seule: monthly("seule", () => true) },
    mensuelResultat: { avec: monthly("avec", chargeInResult), seule: monthly("seule", chargeInResult) },
    horsResultat: { avec: monthly("avec", (c) => !chargeInResult(c)), seule: monthly("seule", (c) => !chargeInResult(c)) },
    annuelCaisse: { avec: annual("avec", "caisse"), seule: annual("seule", "caisse") },
    annuelResultat: { avec: annual("avec", "resultat"), seule: annual("seule", "resultat") },
  };

  const chargesAnnuellesCaisse = totals.annuelCaisse[scenario];
  const chargesAnnuellesResultat = totals.annuelResultat[scenario];
  const investments = objective?.investments ?? [];
  const investmentsTotal = sumMoney(investments.map((i) => i.amount));
  const treasurySavingPerMonth = objective?.treasurySavingPerMonth ?? 0;
  const seuils = breakeven({
    chargesAnnuellesCaisse,
    treasurySavingPerMonth,
    investmentsTotal,
    monthsActive: objective?.monthsActive,
    rawMaterialPct: objective?.rawMaterialPct,
  });
  const chargesMensuellesCaisse = round2(chargesAnnuellesCaisse / 12);
  const besoinTresorerie = round2((chargesAnnuellesCaisse / 12) * (objective?.treasuryMonths ?? DEFAULT_TREASURY_MONTHS));

  let resultatPrevu: number | undefined;
  let isocPrevu: number | undefined;
  let margeNetteApresIsoc: number | undefined;
  let objectifMoinsSeuil: number | undefined;
  if (objective) {
    resultatPrevu = round2(
      objective.annualRevenue * (1 - (objective.rawMaterialPct ?? 0)) - chargesAnnuellesResultat - (objective.extrasBudget ?? 0),
    );
    isocPrevu = isoc(resultatPrevu, objective);
    margeNetteApresIsoc = ratio(sumMoney([resultatPrevu, -isocPrevu]), objective.annualRevenue);
    objectifMoinsSeuil = round2(objective.annualRevenue - seuils.seuilAnnuel);
  }

  return {
    year,
    scenario,
    objective,
    charges,
    totals,
    chargesAnnuellesCaisse,
    chargesMensuellesCaisse,
    chargesAnnuellesResultat,
    investments,
    investmentsTotal,
    treasurySavingPerMonth,
    ...seuils,
    besoinTresorerie,
    resultatPrevu,
    isocPrevu,
    margeNetteApresIsoc,
    objectifMoinsSeuil,
  };
}

export type AuReelRow =
  | {
      kind: "entry";
      tag: "facture";
      entryId: string;
      entryKind: SalesKind;
      date: string;
      label: string;
      prestationType?: string;
      htva: number;
      eventIds: string[];
      // Hours of the invoiced events, carried by facture and comptoir rows only so a deposit row never doubles them.
      hours?: number;
    }
  | {
      kind: "event";
      tag: "signe";
      eventId: string;
      date: string;
      label: string;
      prestationType?: string;
      htva: number;
      hours?: number;
      notes?: string;
      status: AppEvent["status"];
    };

export interface AuReel {
  ym: string;
  rows: AuReelRow[];
  totalSigne: number;
  totalHeures: number;
  jeVise?: number;
  tempsDisponible?: number;
  resteASigner?: number;
  heuresRestantes?: number;
}

const INVOICING_KINDS: SalesKind[] = ["facture", "comptoir"];

export function isInvoiceEntry(entry: Pick<LedgerEntry, "book" | "kind">): boolean {
  return entry.book === "ventes" && (INVOICING_KINDS as string[]).includes(entry.kind);
}

// Ids of events covered by a facture or comptoir entry, whatever the entry's month.
export function invoicedEventIds(entries: LedgerEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const e of entries) if (isInvoiceEntry(e)) for (const id of e.eventIds ?? []) ids.add(id);
  return ids;
}

export function clientLabel(event: AppEvent, clients?: Pick<Client, "clientId" | "name">[]): string {
  const client = event.clientId ? clients?.find((c) => c.clientId === event.clientId) : undefined;
  return client?.name ?? event.contactName ?? event.name;
}

export function hoursAvailable(objective: YearObjective | undefined, ym: string): number | undefined {
  return monthKeyed(objective?.hoursAvailableOverrides, ym) ?? objective?.hoursAvailablePerMonth;
}

export function auReel(ym: string, inputs: ReportInputs): AuReel {
  const { entries, events, settings, clients } = inputs;
  const objective = objectiveOf(settings, yearOf(ym));
  const eventById = new Map(events.map((e) => [e.eventId, e]));
  const invoiced = invoicedEventIds(entries);

  const entryRows: AuReelRow[] = entriesOfMonth(entries, ym)
    .filter(isCaEntry)
    .map((e) => {
      const linked = (e.eventIds ?? []).map((id) => eventById.get(id)?.hoursSpent).filter((h): h is number => h !== undefined);
      return {
        kind: "entry",
        tag: "facture",
        entryId: e.entryId,
        entryKind: e.kind as SalesKind,
        date: e.date,
        label: e.label,
        prestationType: e.prestationType,
        htva: e.htva,
        eventIds: e.eventIds ?? [],
        hours: isInvoiceEntry(e) && linked.length ? linked.reduce((a, b) => a + b, 0) : undefined,
      };
    });
  const eventRows: AuReelRow[] = eventsOfMonth(events, ym)
    .filter((e) => !invoiced.has(e.eventId))
    .map((e) => ({
      kind: "event",
      tag: "signe",
      eventId: e.eventId,
      date: e.date,
      label: clientLabel(e, clients),
      prestationType: e.prestationType,
      htva: signedRevenue(e),
      hours: e.hoursSpent,
      notes: e.notes,
      status: e.status,
    }));
  const rows = [...entryRows, ...eventRows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const totalSigne = sumMoney(rows.map((r) => r.htva));
  const totalHeures = rows.reduce((n, r) => n + (r.hours ?? 0), 0);
  const jeVise = objectifMensuel(objective, ym);
  const tempsDisponible = hoursAvailable(objective, ym);
  return {
    ym,
    rows,
    totalSigne,
    totalHeures,
    jeVise,
    tempsDisponible,
    resteASigner: jeVise !== undefined ? round2(jeVise - totalSigne) : undefined,
    heuresRestantes: tempsDisponible !== undefined ? tempsDisponible - totalHeures : undefined,
  };
}

export interface AuReelYear {
  year: number;
  months: AuReel[];
  totalSigne: number;
  totalHeures: number;
  annualRevenue?: number;
  ecart?: number;
}

export function auReelYear(year: number, inputs: ReportInputs): AuReelYear {
  const months = yearMonths(year).map((ym) => auReel(ym, inputs));
  const totalSigne = sumMoney(months.map((m) => m.totalSigne));
  const annualRevenue = objectiveOf(inputs.settings, year)?.annualRevenue;
  return {
    year,
    months,
    totalSigne,
    totalHeures: months.reduce((n, m) => n + m.totalHeures, 0),
    annualRevenue,
    ecart: annualRevenue !== undefined ? round2(annualRevenue - totalSigne) : undefined,
  };
}

export interface AFacturerEvent {
  eventId: string;
  label: string;
  date: string;
  htva: number;
  acomptesHtva: number;
  prestationType?: string;
}

export interface AFacturerMonth {
  clientId: string;
  clientName: string;
  ym: string;
  eventIds: string[];
  htva: number;
}

export interface AFacturer {
  // Upcoming events dated before today and not yet invoiced.
  toClose: AppEvent[];
  // Completed, uninvoiced events of one-off clients, oldest first.
  toInvoice: AFacturerEvent[];
  // Completed, uninvoiced events of monthly clients grouped by month, past months only.
  toInvoiceMonthly: AFacturerMonth[];
  // Invoice entries not yet paid, oldest first.
  unpaid: (LedgerEntry & { daysOutstanding: number })[];
  totals: { toInvoiceHtva: number; unpaidTvac: number };
}

const byDate = <T extends { date: string }>(a: T, b: T) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export function aFacturer(inputs: Pick<ReportInputs, "events" | "entries" | "clients">, today: string): AFacturer {
  const { events, entries, clients = [] } = inputs;
  const invoiced = invoicedEventIds(entries);
  const clientById = new Map(clients.map((c) => [c.clientId, c]));
  const clientOf = (e: AppEvent) => (e.clientId ? clientById.get(e.clientId) : undefined);

  const toClose = events
    .filter((e) => e.status === "upcoming" && e.date.slice(0, 10) < today && !invoiced.has(e.eventId))
    .sort(byDate);

  const uninvoiced = events.filter((e) => e.status === "completed" && !invoiced.has(e.eventId)).sort(byDate);

  const acomptesByEvent = new Map<string, number>();
  for (const entry of entries) {
    if (entry.book !== "ventes" || entry.kind !== "acompte") continue;
    for (const id of entry.eventIds ?? []) acomptesByEvent.set(id, sumMoney([acomptesByEvent.get(id) ?? 0, entry.htva]));
  }

  const toInvoice: AFacturerEvent[] = uninvoiced
    .filter((e) => clientOf(e)?.invoicing !== "mensuelle")
    .map((e) => ({
      eventId: e.eventId,
      label: shortEventName(e, clientOf(e)),
      date: e.date,
      htva: signedRevenue(e),
      acomptesHtva: acomptesByEvent.get(e.eventId) ?? 0,
      ...(e.prestationType && { prestationType: e.prestationType }),
    }));

  const currentYm = ymOf(today);
  const months = new Map<string, AFacturerMonth>();
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
  const toInvoiceMonthly = [...months.values()].sort((a, b) => (a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : a.clientName.localeCompare(b.clientName)));

  const unpaid = entries
    .filter((e) => isInvoiceEntry(e) && !e.paid)
    .sort(byDate)
    .map((e) => ({ ...e, daysOutstanding: Math.max(0, daysBetween(e.date, today)) }));

  return {
    toClose,
    toInvoice,
    toInvoiceMonthly,
    unpaid,
    totals: {
      toInvoiceHtva: sumMoney([...toInvoice.map((e) => e.htva), ...toInvoiceMonthly.map((m) => m.htva)]),
      unpaidTvac: sumMoney(unpaid.map((e) => e.totalTvac)),
    },
  };
}
