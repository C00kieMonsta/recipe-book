import type { LedgerEntry, VatRate } from "../entities/ledger";
import { round2 } from "./money";

export function ledgerVatAtRate(entry: Pick<LedgerEntry, "vatRate" | "vatAmount" | "vatLines">, rate: VatRate): number {
  return entry.vatLines
    ? round2(entry.vatLines.filter(line => line.rate === rate).reduce((sum, line) => sum + line.amount, 0))
    : entry.vatRate === rate ? entry.vatAmount : 0;
}

export function ledgerVatLabel(entry: Pick<LedgerEntry, "vatRate" | "vatLines">): string {
  return entry.vatLines?.length
    ? entry.vatLines.map(line => `${line.rate} %`).join(" / ")
    : `${entry.vatRate} %`;
}
