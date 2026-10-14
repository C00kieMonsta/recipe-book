export const VAT_RATES = [0, 6, 12, 21] as const;
export type VatRate = (typeof VAT_RATES)[number];

export type SalesKind =
  | "facture"
  | "acompte"
  | "comptoir"
  | "bon_cadeau"
  | "note_de_credit"
  | "commission"
  // Typed monthly revenue when invoices are issued elsewhere: counts as CA, never as an invoice, never unpaid.
  | "ca_mensuel"
  | "autre";
export type PurchaseKind = "mp" | "personnel" | "autre";
export type PaymentMethod = "virement" | "cash" | "bancontact" | "payconiq" | "autre";
export type LedgerBook = "ventes" | "achats";

export interface LedgerShift {
  date: string;
  hours: number;
}

// The invoice file behind an entry, stored in the private bucket; written by the server only.
export interface LedgerAttachment {
  key: string;
  name: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

export type LedgerEntrySource = "saisie" | "import_csv" | "depot";

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
  attachment?: LedgerAttachment;
  // Absent means a hand entry (saisie).
  source?: LedgerEntrySource;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerEntryKey {
  entryId: string;
}
