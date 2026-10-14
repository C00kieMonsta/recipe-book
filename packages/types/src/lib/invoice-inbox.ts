import type { CreateLedgerEntryRequest, ExtractedInvoice, InboxFlag } from "../dto/ledger";
import { isoDate } from "../dto/primitives";
import type { LedgerBook, VatRate } from "../entities/ledger";
import { VAT_RATES } from "../entities/ledger";
import { nearestVatRate } from "./ledger-import";
import { round2 } from "./money";

export interface InboxMappingContext {
  // Paramètres › Société.
  companyVat: string | null;
  // settings.suppliers names.
  suppliers: string[];
  existingNumbers: { book: LedgerBook; number: string; entryId: string; locked: boolean }[];
  // ym values.
  lockedMonths: string[];
  today: string;
}

const LOW_CONFIDENCE = 0.7;
const VAT_TOLERANCE = 0.02;
const COMPANY_NAME_HINT = "table d'amelie";

// "BE 0766.607.232" -> "BE0766607232"; null when nothing is left.
export function normalizeVat(v: string | null): string | null {
  if (v === null) return null;
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length > 0 ? s : null;
}

function foldAscii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNumber(n: string): string {
  return n.toUpperCase().replace(/\s+/g, "");
}

function cleanText(s: string | null): string | null {
  if (s === null) return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

// Longest supplier whose folded name equals or is contained in the issuer name (or the reverse).
function matchSupplier(issuerName: string | null, suppliers: string[]): string | null {
  if (issuerName === null) return null;
  const issuer = foldAscii(issuerName);
  if (!issuer) return null;
  let best: string | null = null;
  let bestLen = 0;
  for (const supplier of suppliers) {
    const s = foldAscii(supplier);
    if (s.length < 2) continue;
    const hit = issuer === s || issuer.includes(s) || s.includes(issuer);
    if (hit && s.length > bestLen) {
      best = supplier;
      bestLen = s.length;
    }
  }
  return best;
}

// Rates read as 0.21 are percentages written as fractions.
function asPercent(rate: number): number {
  return rate > 0 && rate < 1 ? rate * 100 : rate;
}

// The VAT_RATES value for a percentage, else the next one above it (21 for anything higher).
function snapVatRate(pct: number): VatRate {
  const exact = VAT_RATES.find((rate) => Math.abs(rate - pct) < 0.1);
  if (exact !== undefined) return exact;
  return VAT_RATES.find((rate) => rate > pct) ?? VAT_RATES[VAT_RATES.length - 1];
}

function pickVatRate(x: ExtractedInvoice, htva: number, vatAmount: number): { vatRate: VatRate; rates: number[] } {
  const lines = x.vatLines.filter((l) => Number.isFinite(l.rate) && Number.isFinite(l.base) && l.base !== 0);
  const rates = [...new Set(lines.map((l) => asPercent(l.rate)))];
  if (lines.length === 0) return { vatRate: nearestVatRate(htva, vatAmount), rates };
  const dominant = lines.reduce((a, b) => (Math.abs(b.base) > Math.abs(a.base) ? b : a));
  return { vatRate: snapVatRate(asPercent(dominant.rate)), rates };
}

// Avoids -0, which would not equal 0 in comparisons by Object.is.
function negative(n: number): number {
  return n === 0 ? 0 : -Math.abs(n);
}

function isVentes(x: ExtractedInvoice, companyVat: string | null): boolean {
  const issuer = normalizeVat(x.issuerVat);
  const company = normalizeVat(companyVat);
  if (issuer !== null) return company !== null && issuer === company;
  return x.issuerName !== null && foldAscii(x.issuerName).includes(COMPANY_NAME_HINT);
}

export function mapExtractedInvoice(
  x: ExtractedInvoice,
  ctx: InboxMappingContext,
): { entry: CreateLedgerEntryRequest | null; flags: InboxFlag[] } {
  const flags: InboxFlag[] = [];
  const book: LedgerBook = isVentes(x, ctx.companyVat) ? "ventes" : "achats";

  const number = cleanText(x.number)?.slice(0, 40);
  if (number === undefined) flags.push({ code: "missing_number", message: "Numéro de facture illisible" });

  let date = cleanText(x.date);
  if (date === null || !isoDate.safeParse(date).success) {
    flags.push({ code: "missing_date", message: "Date illisible, date du jour utilisée" });
    date = ctx.today;
  }
  const ym = date.slice(0, 7);

  const currency = cleanText(x.currency);
  if (currency !== null && currency.toUpperCase() !== "EUR") {
    flags.push({ code: "currency", message: `Devise ${currency.toUpperCase()}, montants attendus en euros` });
  }

  if (x.confidence < LOW_CONFIDENCE) flags.push({ code: "low_confidence", message: "Lecture peu sûre" });

  if (number !== undefined) {
    const key = normalizeNumber(number);
    const existing = ctx.existingNumbers.find((e) => e.book === book && normalizeNumber(e.number) === key);
    if (existing) {
      flags.push({ code: "duplicate", message: `Déjà dans le journal (n° ${existing.number})`, entryId: existing.entryId });
      if (existing.locked) flags.push({ code: "locked_month", message: "Mois verrouillé" });
    }
  }
  if (ctx.lockedMonths.includes(ym) && !flags.some((f) => f.code === "locked_month")) {
    flags.push({ code: "locked_month", message: "Mois verrouillé" });
  }

  let totalTvac = x.totalTvac === null ? null : round2(x.totalTvac);
  let htva = x.htva === null ? null : round2(x.htva);
  let vatAmount = x.vatAmount === null ? null : round2(x.vatAmount);
  if (totalTvac === null && htva !== null && vatAmount !== null) totalTvac = round2(htva + vatAmount);
  else if (htva === null && totalTvac !== null && vatAmount !== null) htva = round2(totalTvac - vatAmount);
  else if (vatAmount === null && totalTvac !== null && htva !== null) vatAmount = round2(totalTvac - htva);
  if (totalTvac === null || htva === null || vatAmount === null) {
    flags.push({ code: "missing_amount", message: "Montant manquant (HTVA, TVA ou TVAC)" });
    return { entry: null, flags };
  }
  const drift = Math.abs(htva + vatAmount - totalTvac);
  if (drift > VAT_TOLERANCE) {
    flags.push({ code: "vat_fixed", message: `TVA recalculée (${vatAmount} lue, ${round2(totalTvac - htva)} retenue)` });
  }
  // A cent of drift still breaks the DTO identity, so the TVA is always the difference.
  if (drift > 0) vatAmount = round2(totalTvac - htva);

  const { vatRate, rates } = pickVatRate(x, htva, vatAmount);
  if (rates.length > 1) {
    flags.push({ code: "multi_rate", message: `${rates.length} taux lus, ${vatRate} % retenu` });
  }

  const common = { date, number, totalTvac, htva, vatRate, vatAmount };
  if (book === "ventes") {
    const kind = x.kindGuess === "autre" ? "facture" : x.kindGuess;
    const signed = kind === "note_de_credit" ? negative : Math.abs;
    const entry: CreateLedgerEntryRequest = {
      ...common,
      book: "ventes",
      kind,
      label: cleanText(x.recipientName) ?? (number === undefined ? "Facture" : `Facture ${number}`),
      totalTvac: signed(totalTvac),
      htva: signed(htva),
      vatAmount: signed(vatAmount),
      paid: x.paid ?? false,
    };
    return { entry, flags };
  }

  const issuerName = cleanText(x.issuerName);
  const supplier = matchSupplier(issuerName, ctx.suppliers);
  if (supplier === null) flags.push({ code: "unknown_supplier", message: "Fournisseur inconnu des paramètres" });
  const entry: CreateLedgerEntryRequest = {
    ...common,
    book: "achats",
    kind: supplier === null ? "autre" : "mp",
    label: issuerName ?? (number === undefined ? "Achat" : `Achat ${number}`),
    totalTvac: Math.abs(totalTvac),
    htva: Math.abs(htva),
    vatAmount: Math.abs(vatAmount),
    supplier: supplier ?? issuerName ?? undefined,
  };
  return { entry, flags };
}
