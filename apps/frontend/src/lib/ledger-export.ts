import * as XLSX from "xlsx";
import type { AppEvent, AppSettings, LedgerEntry, ReportInputs } from "@packages/types";
import { incomeStatement, isCaEntry, isCommissionEntry, ledgerVatAtRate, parseYmd, sumMoney, yearMonths } from "@packages/types";
import {
  MP_SOURCE_LABEL,
  SALES_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  entryYm,
  kindLabel,
  prestationLabel,
  salesTotals,
} from "@/lib/accounting";

// Row 2 of every month sheet, in the workbook's wording and order (Janvier A2:N2).
export const WORKBOOK_HEADER = [
  "NUMERO OPERATION",
  "DATE FACTURE/OPERATION",
  "INTITULE",
  "Total tvac",
  "RECETTE htva",
  "TVA 6%",
  "TVA 12%",
  "TVA 21%",
  "réglé",
  "mode paiement",
  "date encaissement",
  "Type",
  "Description",
  "KM",
] as const;

export const MONTH_SHEET_NAMES = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
] as const;

const MONTH_LOWER = MONTH_SHEET_NAMES.map((m) => m.toLowerCase());

export const HTVA_NOTE = "tvac/1,06 ou 1,12 ou 1,21";

type Cell = string | number | Date | null;

function excelDate(ymd?: string): Date | null {
  return ymd && ymd.length >= 10 ? parseYmd(ymd) : null;
}

function vatCell(entry: LedgerEntry, rate: 6 | 12 | 21): number | null {
  return ledgerVatAtRate(entry, rate) || null;
}

// One workbook line for a CA entry; credit notes keep their negative amounts.
export function caRow(entry: LedgerEntry, settings: Pick<AppSettings, "prestationTypes">): Cell[] {
  return [
    entry.number ?? null,
    excelDate(entry.date),
    entry.label,
    entry.totalTvac,
    entry.htva,
    vatCell(entry, 6),
    vatCell(entry, 12),
    vatCell(entry, 21),
    entry.paid ? "oui" : "non",
    entry.paymentMethod ? PAYMENT_METHOD_LABEL[entry.paymentMethod].toLowerCase() : null,
    excelDate(entry.paidAt),
    prestationLabel(settings, entry.prestationType) || null,
    entry.description ?? null,
    entry.km ?? null,
  ];
}

function totalRow(entries: LedgerEntry[], withKm: boolean): Cell[] {
  const sum = (pick: (e: LedgerEntry) => number | null) => sumMoney(entries.map(pick).filter((x): x is number => x !== null));
  return [
    null,
    null,
    "TOTAL",
    sum((e) => e.totalTvac),
    sum((e) => e.htva),
    sum((e) => ledgerVatAtRate(e, 6)),
    sum((e) => ledgerVatAtRate(e, 12)),
    sum((e) => ledgerVatAtRate(e, 21)),
    null,
    null,
    null,
    null,
    null,
    withKm ? entries.reduce((n, e) => n + (e.km ?? 0), 0) : null,
  ];
}

// "Total CA mm/yyyy" then one line per prestation type and "Sans type", written as values.
function typeBlock(entries: LedgerEntry[], settings: Pick<AppSettings, "prestationTypes">, title: string): Cell[][] {
  const totals = salesTotals(entries, settings);
  const rows: Cell[][] = [[null, null, title, null, totals.totalCa]];
  for (const t of totals.byType) rows.push([null, null, t.label, null, t.amount]);
  return rows;
}

const AMOUNT_COLS = new Set([3, 4, 5, 6, 7]);

// Number and date formats so Excel shows amounts with two decimals and real dates.
function applyFormats(ws: XLSX.WorkSheet, amountCols: Set<number>): void {
  const ref = ws["!ref"];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      if (!cell) continue;
      if (cell.t === "d") cell.z = "dd/mm/yyyy";
      else if (cell.t === "n" && amountCols.has(c)) cell.z = "#,##0.00";
    }
  }
}

function monthEntries(entries: LedgerEntry[], ym: string): LedgerEntry[] {
  return entries.filter((e) => entryYm(e) === ym).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

// Month sheet: title in row 1, header in row 2, CA lines, TOTAL, per-type totals.
export function monthSheetRows(ym: string, entries: LedgerEntry[], settings: Pick<AppSettings, "prestationTypes">): Cell[][] {
  const ca = monthEntries(entries, ym).filter(isCaEntry);
  const title = `${MONTH_SHEET_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
  return [
    [title],
    [...WORKBOOK_HEADER],
    ...ca.map((e) => caRow(e, settings)),
    totalRow(ca, false),
    ...typeBlock(ca, settings, `Total CA ${ym.slice(5, 7)}/${ym.slice(0, 4)}`),
  ];
}

function companyHeader(settings: AppSettings): Cell[][] {
  const c = settings.company;
  return [
    [c?.name ?? "", "Date de constitution", excelDate(c?.constitutedOn)],
    [c?.address ?? ""],
    [c?.vatNumber ? `TVA ${c.vatNumber}` : ""],
    [],
  ];
}

const YEAR_DATA_START = 7; // 1-based row of the first entry on the annual sheet
const YEAR_TOTAL_ROW = 140;

export interface YearSheetLayout {
  totalRow: number;
  thermomixRow: number;
  acomptesRow: number;
}

export function yearSheetLayout(caCount: number, typeRows: number): YearSheetLayout {
  const totalRow = Math.max(YEAR_TOTAL_ROW, YEAR_DATA_START + caCount);
  // Per-type totals sit under TOTAL, then two blank rows.
  const thermomixRow = totalRow + 1 + typeRows + 2;
  // 1 title row, 12 months, "pas de tva", "total thermomix", 2 blank rows.
  return { totalRow, thermomixRow, acomptesRow: thermomixRow + 17 };
}

function thermomixBlock(year: number, entries: LedgerEntry[]): Cell[][] {
  const rows: Cell[][] = [["THERMOMIX"]];
  let total = 0;
  for (const [i, ym] of yearMonths(year).entries()) {
    const amount = sumMoney(entries.filter((e) => isCommissionEntry(e) && entryYm(e) === ym).map((e) => e.totalTvac));
    total = sumMoney([total, amount]);
    rows.push([MONTH_LOWER[i], null, null, amount]);
  }
  rows.push([null, null, "pas de tva"]);
  rows.push([null, null, "total thermomix", total]);
  return rows;
}

function acomptesBlock(entries: LedgerEntry[], events: AppEvent[], clients: ReportInputs["clients"]): Cell[][] {
  const eventById = new Map(events.map((e) => [e.eventId, e]));
  const clientById = new Map((clients ?? []).map((c) => [c.clientId, c]));
  const rows: Cell[][] = [["ACOMPTES"], ["Client", "montant", "date paiement", "date évent"]];
  const deposits = entries.filter((e) => e.book === "ventes" && e.kind === "acompte").sort((a, b) => a.date.localeCompare(b.date));
  for (const e of deposits) {
    const eventDate = (e.eventIds ?? []).map((id) => eventById.get(id)?.date).filter((d): d is string => !!d).sort()[0];
    const client = e.clientId ? clientById.get(e.clientId)?.name : undefined;
    rows.push([client ?? e.label, e.totalTvac, excelDate(e.paidAt ?? e.date), excelDate(eventDate)]);
  }
  rows.push(["total", sumMoney(deposits.map((e) => e.totalTvac))]);
  return rows;
}

const PURCHASE_HEADER = ["Date", "Intitulé", "Type", "Fournisseur ou Personne", "Heures", "Taux", "HTVA", "TVA", "TVAC", "Réf."];

function purchaseRows(entries: LedgerEntry[]): Cell[][] {
  const purchases = entries.filter((e) => e.book === "achats").sort((a, b) => a.date.localeCompare(b.date));
  const rows: Cell[][] = [PURCHASE_HEADER];
  for (const e of purchases) {
    const hours = (e.shifts ?? []).reduce((n, s) => n + s.hours, 0);
    rows.push([
      excelDate(e.date),
      e.label,
      kindLabel(e),
      e.personName ?? e.supplier ?? null,
      e.kind === "personnel" ? hours : null,
      e.hourlyRate ?? null,
      e.htva,
      e.vatAmount,
      e.totalTvac,
      e.number ?? null,
    ]);
  }
  rows.push([
    null,
    "TOTAL",
    null,
    null,
    null,
    null,
    sumMoney(purchases.map((e) => e.htva)),
    sumMoney(purchases.map((e) => e.vatAmount)),
    sumMoney(purchases.map((e) => e.totalTvac)),
    null,
  ]);
  return rows;
}

const RESULT_HEADER = [
  "Mois",
  "CA HTVA",
  "Coûts MP",
  "Source MP",
  "Marge brute",
  "Autres produits",
  "Charges fixes",
  "Personnel extra",
  "Autres coûts",
  "Résultat avant impôts",
  "Marge %",
  "Impôts (estimation)",
  "Résultat net",
];

function resultRows(year: number, inputs: ReportInputs): Cell[][] {
  const st = incomeStatement(year, inputs);
  const rows: Cell[][] = [RESULT_HEADER];
  for (const [i, m] of st.months.entries()) {
    rows.push([
      MONTH_SHEET_NAMES[i],
      m.ca,
      m.mp.amount,
      MP_SOURCE_LABEL[m.mp.source],
      m.margeBrute,
      m.autresProduits,
      m.chargesFixes,
      m.personnelExtra,
      m.autresCouts,
      m.resultat,
      m.margePct ?? null,
      m.impots,
      m.resultatNet,
    ]);
  }
  const a = st.annual;
  rows.push([
    `Total ${year}`,
    a.ca,
    a.mp,
    null,
    a.margeBrute,
    a.autresProduits,
    a.chargesFixes,
    a.personnelExtra,
    a.autresCouts,
    a.resultat,
    a.margePct ?? null,
    a.impots,
    a.resultatNet,
  ]);
  rows.push([a.impotsSource === "reel" ? "Impôts : montant réel saisi" : "Impôts annuels : estimation sur le résultat cumulé"]);
  return rows;
}

export interface LedgerWorkbook {
  filename: string;
  workbook: XLSX.WorkBook;
  monthsWritten: string[];
}

// Builds the workbook without writing it, so the layout can be checked outside the browser.
export function buildLedgerWorkbook(year: number, inputs: ReportInputs): LedgerWorkbook {
  const { entries, settings, events, clients } = inputs;
  const yearEntries = entries.filter((e) => entryYm(e).startsWith(String(year)));
  const wb = XLSX.utils.book_new();
  const opts = { cellDates: true } as const;
  const monthsWritten: string[] = [];

  for (const [i, ym] of yearMonths(year).entries()) {
    if (!yearEntries.some((e) => entryYm(e) === ym)) continue;
    const ws = XLSX.utils.aoa_to_sheet(monthSheetRows(ym, yearEntries, settings), opts);
    applyFormats(ws, AMOUNT_COLS);
    ws["!cols"] = [{ wch: 16 }, { wch: 12 }, { wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 30 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws, MONTH_SHEET_NAMES[i]);
    monthsWritten.push(ym);
  }

  const ca = yearEntries.filter(isCaEntry).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const types = typeBlock(ca, settings, `Total CA ${year}`);
  const layout = yearSheetLayout(ca.length, types.length);
  const annual = XLSX.utils.aoa_to_sheet(companyHeader(settings), opts);
  XLSX.utils.sheet_add_aoa(annual, [[...WORKBOOK_HEADER]], { origin: "A5" });
  XLSX.utils.sheet_add_aoa(annual, [[HTVA_NOTE]], { origin: "E6" });
  if (ca.length) XLSX.utils.sheet_add_aoa(annual, ca.map((e) => caRow(e, settings)), { origin: `A${YEAR_DATA_START}`, ...opts });
  XLSX.utils.sheet_add_aoa(annual, [totalRow(ca, true)], { origin: `A${layout.totalRow}` });
  XLSX.utils.sheet_add_aoa(annual, types, { origin: `A${layout.totalRow + 1}` });
  XLSX.utils.sheet_add_aoa(annual, thermomixBlock(year, yearEntries), { origin: `A${layout.thermomixRow}` });
  XLSX.utils.sheet_add_aoa(annual, acomptesBlock(yearEntries, events, clients), { origin: `A${layout.acomptesRow}`, ...opts });
  applyFormats(annual, new Set([1, 3, 4, 5, 6, 7]));
  annual["!cols"] = [{ wch: 24 }, { wch: 18 }, { wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 30 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, annual, `recettes ${year}`);

  const achats = XLSX.utils.aoa_to_sheet(purchaseRows(yearEntries), opts);
  applyFormats(achats, new Set([5, 6, 7, 8]));
  achats["!cols"] = [{ wch: 12 }, { wch: 32 }, { wch: 10 }, { wch: 24 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, achats, "Achats");

  const resultats = XLSX.utils.aoa_to_sheet(resultRows(year, inputs));
  applyFormats(resultats, new Set([1, 2, 4, 5, 6, 7, 8, 9, 11, 12]));
  resultats["!cols"] = RESULT_HEADER.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, resultats, "Compte de résultats");

  return { filename: `Livre des recettes ${year}.xlsx`, workbook: wb, monthsWritten };
}

// Downloads "Livre des recettes <year>.xlsx"; writes nothing to the ledger.
export function exportLedgerXlsx(year: number, inputs: ReportInputs): LedgerWorkbook {
  const built = buildLedgerWorkbook(year, inputs);
  XLSX.writeFile(built.workbook, built.filename, { cellDates: true, compression: true });
  return built;
}

// ---- CSV ----

function csvNumber(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : n.toFixed(2).replace(".", ",");
}

function csvDate(ymd?: string): string {
  return ymd && ymd.length >= 10 ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : "";
}

function csvText(s: string | null | undefined): string {
  if (!s) return "";
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Month CSV with ";" separators and decimal commas, workbook columns plus Livre and Nature.
export function exportMonthCsv(ym: string, entries: LedgerEntry[], settings: Pick<AppSettings, "prestationTypes">): string {
  const rows = monthEntries(entries, ym);
  const lines: string[] = [["Livre", "Nature", ...WORKBOOK_HEADER].join(";")];
  for (const e of rows) {
    lines.push(
      [
        e.book,
        e.book === "ventes" ? SALES_KIND_LABEL[e.kind as keyof typeof SALES_KIND_LABEL] ?? e.kind : kindLabel(e),
        csvText(e.number),
        csvDate(e.date),
        csvText(e.label),
        csvNumber(e.totalTvac),
        csvNumber(e.htva),
        csvNumber(vatCell(e, 6)),
        csvNumber(vatCell(e, 12)),
        csvNumber(vatCell(e, 21)),
        e.paid ? "oui" : "non",
        e.paymentMethod ? PAYMENT_METHOD_LABEL[e.paymentMethod].toLowerCase() : "",
        csvDate(e.paidAt),
        csvText(prestationLabel(settings, e.prestationType)),
        csvText(e.description),
        e.km === undefined ? "" : String(e.km).replace(".", ","),
      ].join(";"),
    );
  }
  const sales = rows.filter((e) => e.book === "ventes");
  // TOTAL covers CA lines only, like the workbook sheet; commissions get their own line.
  const t = salesTotals(sales.filter(isCaEntry), settings);
  lines.push(["", "", "", "", "TOTAL", csvNumber(t.tvac), csvNumber(t.htva), csvNumber(t.vat6), csvNumber(t.vat12), csvNumber(t.vat21)].join(";"));
  lines.push(["", "", "", "", `Total CA ${ym.slice(5, 7)}/${ym.slice(0, 4)}`, "", csvNumber(t.totalCa)].join(";"));
  lines.push(["", "", "", "", "Commissions (hors CA)", "", csvNumber(salesTotals(sales, settings).commissions)].join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function downloadMonthCsv(ym: string, entries: LedgerEntry[], settings: Pick<AppSettings, "prestationTypes">): void {
  const blob = new Blob([exportMonthCsv(ym, entries, settings)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `journal-${ym}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
