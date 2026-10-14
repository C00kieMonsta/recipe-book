import type { ImportLedgerRow } from "../dto/ledger";
import { importLedgerRowSchema } from "../dto/ledger";
import type { VatRate } from "../entities/ledger";
import { VAT_RATES } from "../entities/ledger";
import { round2 } from "./money";

export type OdooField = "number" | "date" | "partner" | "untaxed" | "tax" | "total" | "status" | "paidAt";

// Lower-cased, accent-stripped header aliases, English and French Odoo exports.
export const ODOO_HEADERS: Record<OdooField, string[]> = {
  number: ["number", "numero", "invoice number", "reference", "name"],
  date: ["date", "invoice date", "invoice/bill date", "date de facturation", "date de facture", "date facture"],
  partner: ["partner", "customer", "partenaire", "client", "contact"],
  untaxed: ["untaxed amount", "tax excluded", "untaxed", "montant ht", "montant hors taxes", "hors taxes", "htva", "ht"],
  tax: ["tax", "taxes", "tax amount", "tva", "montant tva", "montant taxes"],
  total: ["total", "total amount", "tax included", "montant total", "montant tvac", "tvac", "ttc"],
  status: ["payment status", "payment state", "status", "etat du paiement", "statut de paiement", "statut", "etat"],
  paidAt: ["payment date", "paid at", "paid on", "date de paiement", "date de reglement", "date paiement"],
};

export const ODOO_REQUIRED_FIELDS: readonly OdooField[] = ["number", "date", "untaxed", "total"];

const ODOO_FIELDS = Object.keys(ODOO_HEADERS) as OdooField[];

function foldAscii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .trim();
}

// Normalised header text used to match ODOO_HEADERS.
export function odooHeaderKey(header: string): string {
  return foldAscii(header);
}

// Header to field, first match wins; undefined when a required field is missing (number, date, untaxed, total).
export function detectOdooColumns(headers: string[]): Partial<Record<OdooField, string>> | undefined {
  const columns: Partial<Record<OdooField, string>> = {};
  for (const field of ODOO_FIELDS) {
    const aliases = ODOO_HEADERS[field];
    const header = headers.find((h) => aliases.includes(odooHeaderKey(h)));
    if (header !== undefined) columns[field] = header;
  }
  if (ODOO_REQUIRED_FIELDS.some((f) => columns[f] === undefined)) return undefined;
  return columns;
}

// "1 234,56", "1,234.56", "1234.56", "-12,5", "€ 12,50" to number; NaN when unreadable.
export function parseOdooNumber(s: string): number {
  const raw = (s ?? "").replace(/[^\d,.\-]/g, "");
  if (!/\d/.test(raw)) return NaN;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = raw.indexOf(",") === lastComma ? raw.replace(",", ".") : raw.replace(/,/g, "");
  } else if (lastDot >= 0) {
    normalized = raw.indexOf(".") === lastDot ? raw : raw.replace(/\./g, "");
  } else {
    normalized = raw;
  }
  if (!/^-?\d*(\.\d*)?$/.test(normalized)) return NaN;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function validYmd(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

// "2026-10-14", "14/10/2026", "14-10-2026", "2026-10-14 10:22:00" to "2026-10-14"; null when unreadable.
export function parseOdooDate(s: string): string | null {
  const t = (s ?? "").trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(t);
  if (iso) return validYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:[ T].*)?$/.exec(t);
  if (dmy) return validYmd(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  return null;
}

// The VAT_RATES value matching tax / untaxed, else the next one above it so a mixed-rate invoice (15 %) lands on 21; 0 when untaxed is 0.
export function nearestVatRate(untaxed: number, tax: number): VatRate {
  if (!Number.isFinite(untaxed) || !Number.isFinite(tax) || untaxed === 0) return 0;
  const pct = (tax / untaxed) * 100;
  const exact = VAT_RATES.find((rate) => Math.abs(rate - pct) < 0.1);
  if (exact !== undefined) return exact;
  return VAT_RATES.find((rate) => rate > pct) ?? VAT_RATES[VAT_RATES.length - 1];
}

const PAID_STATUSES = new Set([
  "paid",
  "paye",
  "in payment",
  "en paiement",
  "partial",
  "partiel",
  "partially paid",
  "partiellement paye",
]);

// "paid", "payé", "in_payment", "en paiement", "partial", "partiel" are paid.
export function isPaidStatus(s: string | undefined): boolean {
  return s !== undefined && PAID_STATUSES.has(foldAscii(s));
}

function cell(row: Record<string, string>, column: string | undefined): string {
  if (column === undefined) return "";
  const v = row[column];
  return v === undefined || v === null ? "" : String(v).trim();
}

// Maps one CSV row to an ImportLedgerRow; the tax column only picks the rate, vatAmount is total minus untaxed so the identity holds.
export function mapOdooRow(
  row: Record<string, string>,
  columns: Partial<Record<OdooField, string>>,
): { ok: true; row: ImportLedgerRow } | { ok: false; reason: string } {
  const number = cell(row, columns.number);
  if (!number) return { ok: false, reason: "numéro manquant" };
  const date = parseOdooDate(cell(row, columns.date));
  if (!date) return { ok: false, reason: "date illisible" };
  const untaxed = parseOdooNumber(cell(row, columns.untaxed));
  if (Number.isNaN(untaxed)) return { ok: false, reason: "montant HT illisible" };
  const total = parseOdooNumber(cell(row, columns.total));
  if (Number.isNaN(total)) return { ok: false, reason: "total illisible" };
  const htva = round2(untaxed);
  const totalTvac = round2(total);
  const vatAmount = round2(totalTvac - htva);
  const taxRead = parseOdooNumber(cell(row, columns.tax));
  const tax = Number.isNaN(taxRead) ? vatAmount : taxRead;
  const partner = cell(row, columns.partner);
  const paidAt = parseOdooDate(cell(row, columns.paidAt));
  const candidate: Record<string, unknown> = {
    number: number.slice(0, 40),
    date,
    label: (partner || number).slice(0, 120),
    htva,
    vatRate: nearestVatRate(htva, tax),
    vatAmount,
    totalTvac,
    paid: isPaidStatus(cell(row, columns.status) || undefined),
  };
  if (paidAt) candidate.paidAt = paidAt;
  const parsed = importLedgerRowSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? "ligne invalide" };
  return { ok: true, row: parsed.data };
}
