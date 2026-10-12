export const VAT_RATES = [0, 6, 12, 21] as const;
export type VatRate = (typeof VAT_RATES)[number];

export type SalesKind =
  | "facture"
  | "acompte"
  | "comptoir"
  | "bon_cadeau"
  | "note_de_credit"
  | "commission"
  | "autre";
export type PurchaseKind = "mp" | "personnel" | "autre";
export type PaymentMethod = "virement" | "cash" | "bancontact" | "payconiq" | "autre";
export type LedgerBook = "ventes" | "achats";

export interface LedgerShift {
  date: string;
  hours: number;
}

export interface LedgerEntry {
  entryId: string;
  book: LedgerBook;
  kind: SalesKind | PurchaseKind;
  date: string;
  // Written server-side from date.slice(0, 7).
  ym: string;
  number?: string;
  label: string;
  eventIds?: string[];
  clientId?: string;
  prestationType?: string;
  totalTvac: number;
  htva: number;
  vatRate: VatRate;
  vatAmount: number;
  refEntryId?: string;
  paid: boolean;
  paymentMethod?: PaymentMethod;
  paidAt?: string;
  description?: string;
  km?: number;
  personName?: string;
  hourlyRate?: number;
  shifts?: LedgerShift[];
  supplier?: string;
  imported?: boolean;
  locked?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerEntryKey {
  entryId: string;
}
