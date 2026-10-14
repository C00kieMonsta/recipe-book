import { createLedgerEntrySchema, extractedInvoiceSchema, inboxConfirmSchema, patchLedgerEntrySchema } from "../dto/ledger";
import type { ExtractedInvoice } from "../dto/ledger";
import type { InboxMappingContext } from "./invoice-inbox";
import { mapExtractedInvoice, normalizeVat } from "./invoice-inbox";

const COMPANY_VAT = "BE0766607232";

const ctx = (over: Partial<InboxMappingContext> = {}): InboxMappingContext => ({
  companyVat: COMPANY_VAT,
  suppliers: ["Vds", "Barn", "Delhaize"],
  existingNumbers: [],
  lockedMonths: [],
  today: "2026-10-14",
  ...over,
});

const read = (over: Partial<ExtractedInvoice> = {}): ExtractedInvoice => ({
  issuerName: "Vds Food",
  issuerVat: "BE0123456789",
  recipientName: "Table d'Amélie SRL",
  recipientVat: COMPANY_VAT,
  number: "VDS-2026-001",
  date: "2026-10-02",
  dueDate: null,
  currency: "EUR",
  totalTvac: 121,
  htva: 100,
  vatAmount: 21,
  vatLines: [{ rate: 21, base: 100, amount: 21 }],
  kindGuess: "facture",
  paid: null,
  confidence: 0.95,
  remarks: null,
  ...over,
});

const codes = (flags: { code: string }[]) => flags.map((f) => f.code);

describe("normalizeVat", () => {
  it("strips spaces, dots and case", () => {
    expect(normalizeVat("BE 0766.607.232")).toBe(COMPANY_VAT);
    expect(normalizeVat("be0766607232")).toBe(COMPANY_VAT);
    expect(normalizeVat("BE-0766 607 232")).toBe(COMPANY_VAT);
  });
  it("is null for null or empty input", () => {
    expect(normalizeVat(null)).toBeNull();
    expect(normalizeVat("  ")).toBeNull();
    expect(normalizeVat(".-")).toBeNull();
  });
});

describe("mapExtractedInvoice: book", () => {
  it("is ventes when the issuer VAT equals the company's, with spaces and dots", () => {
    const x = read({
      issuerName: "TABLE D'AMELIE SRL",
      issuerVat: "BE 0766.607.232",
      recipientName: "Mme Dupont",
      recipientVat: null,
      number: "INV/2026/0042",
      paid: true,
    });
    const { entry, flags } = mapExtractedInvoice(x, ctx());
    expect(flags).toEqual([]);
    expect(entry).toEqual({
      book: "ventes",
      kind: "facture",
      date: "2026-10-02",
      number: "INV/2026/0042",
      label: "Mme Dupont",
      totalTvac: 121,
      htva: 100,
      vatRate: 21,
      vatAmount: 21,
      paid: true,
    });
    expect(createLedgerEntrySchema.safeParse(entry).success).toBe(true);
  });
  it("is ventes by issuer name when the VAT is missing", () => {
    const x = read({ issuerName: "La Table d'Amélie", issuerVat: null, recipientName: null, number: "INV/7" });
    const { entry } = mapExtractedInvoice(x, ctx());
    expect(entry?.book).toBe("ventes");
    expect(entry?.label).toBe("Facture INV/7");
    expect((entry as { paid: boolean }).paid).toBe(false);
  });
  it("is achats when the issuer is someone else, even when the recipient VAT is the company's", () => {
    const { entry } = mapExtractedInvoice(read(), ctx());
    expect(entry?.book).toBe("achats");
  });
  it("is achats when the issuer VAT is foreign and the name mentions the company", () => {
    const x = read({ issuerName: "Table d'Amélie fan club", issuerVat: "FR12345678901" });
    expect(mapExtractedInvoice(x, ctx()).entry?.book).toBe("achats");
  });
  it("is achats when the company VAT is unknown and the issuer VAT is present", () => {
    expect(mapExtractedInvoice(read(), ctx({ companyVat: null })).entry?.book).toBe("achats");
  });
});

describe("mapExtractedInvoice: achats", () => {
  it("maps a known supplier to mp, case and accents folded", () => {
    const x = read({ issuerName: "VDS FOOD SA" });
    const { entry, flags } = mapExtractedInvoice(x, ctx());
    expect(flags).toEqual([]);
    expect(entry).toEqual({
      book: "achats",
      kind: "mp",
      date: "2026-10-02",
      number: "VDS-2026-001",
      label: "VDS FOOD SA",
      totalTvac: 121,
      htva: 100,
      vatRate: 21,
      vatAmount: 21,
      supplier: "Vds",
    });
    expect(createLedgerEntrySchema.safeParse(entry).success).toBe(true);
    const accents = read({ issuerName: "délhaize le lion" });
    expect(mapExtractedInvoice(accents, ctx()).entry).toMatchObject({ kind: "mp", supplier: "Delhaize" });
  });
  it("maps an unknown supplier to autre with the flag and keeps the issuer name", () => {
    const x = read({ issuerName: "Boucherie Dubois" });
    const { entry, flags } = mapExtractedInvoice(x, ctx());
    expect(codes(flags)).toEqual(["unknown_supplier"]);
    expect(entry).toMatchObject({ book: "achats", kind: "autre", label: "Boucherie Dubois", supplier: "Boucherie Dubois" });
  });
  it("labels « Achat <number> » when the issuer name is missing", () => {
    const x = read({ issuerName: null, number: "A-1" });
    const { entry } = mapExtractedInvoice(x, ctx());
    expect(entry).toMatchObject({ kind: "autre", label: "Achat A-1" });
    expect((entry as { supplier?: string }).supplier).toBeUndefined();
  });
});

describe("mapExtractedInvoice: amounts", () => {
  it("recomputes the TVA and flags vat_fixed when the three amounts disagree", () => {
    const x = read({ issuerName: "Vds", totalTvac: 121, htva: 100, vatAmount: 12 });
    const { entry, flags } = mapExtractedInvoice(x, ctx());
    expect(codes(flags)).toEqual(["vat_fixed"]);
    expect(entry).toMatchObject({ totalTvac: 121, htva: 100, vatAmount: 21, vatRate: 21 });
    expect(createLedgerEntrySchema.safeParse(entry).success).toBe(true);
  });
  it("absorbs a cent of drift without a flag", () => {
    const x = read({ issuerName: "Vds", totalTvac: 121.02, htva: 100, vatAmount: 21, vatLines: [] });
    const { entry, flags } = mapExtractedInvoice(x, ctx());
    expect(flags).toEqual([]);
    expect(entry).toMatchObject({ totalTvac: 121.02, htva: 100, vatAmount: 21.02 });
    expect(createLedgerEntrySchema.safeParse(entry).success).toBe(true);
  });
  it("derives a missing TVAC from HTVA and TVA", () => {
    const x = read({ issuerName: "Vds", totalTvac: null, htva: 50.5, vatAmount: 3.03, vatLines: [] });
    const { entry, flags } = mapExtractedInvoice(x, ctx());
    expect(flags).toEqual([]);
    expect(entry).toMatchObject({ totalTvac: 53.53, htva: 50.5, vatAmount: 3.03, vatRate: 6 });
  });
  it("derives a missing HTVA or TVA", () => {
    const noHtva = read({ issuerName: "Vds", totalTvac: 121, htva: null, vatAmount: 21, vatLines: [] });
    expect(mapExtractedInvoice(noHtva, ctx()).entry).toMatchObject({ htva: 100, vatRate: 21 });
    const noVat = read({ issuerName: "Vds", totalTvac: 106, htva: 100, vatAmount: null, vatLines: [] });
    expect(mapExtractedInvoice(noVat, ctx()).entry).toMatchObject({ vatAmount: 6, vatRate: 6 });
  });
  it("flags missing_amount and returns no entry when two amounts are missing", () => {
    const x = read({ issuerName: "Vds", totalTvac: 121, htva: null, vatAmount: null });
    const { entry, flags } = mapExtractedInvoice(x, ctx());
    expect(entry).toBeNull();
    expect(codes(flags)).toEqual(["missing_amount"]);
  });
  it("rounds the amounts to two decimals", () => {
    const x = read({ issuerName: "Vds", totalTvac: 121.004, htva: 100.001, vatAmount: 21.003, vatLines: [] });
    expect(mapExtractedInvoice(x, ctx()).entry).toMatchObject({ totalTvac: 121, htva: 100, vatAmount: 21 });
  });
});

describe("mapExtractedInvoice: ventes kinds", () => {
  const sale = (over: Partial<ExtractedInvoice>) =>
    read({ issuerName: "Table d'Amélie SRL", issuerVat: COMPANY_VAT, recipientName: "Client", number: "NC-3", ...over });
  it("gives a credit note negative amounts and keeps its number", () => {
    const x = sale({ kindGuess: "note_de_credit", totalTvac: 121, htva: 100, vatAmount: 21 });
    const { entry, flags } = mapExtractedInvoice(x, ctx());
    expect(flags).toEqual([]);
    expect(entry).toMatchObject({ kind: "note_de_credit", number: "NC-3", totalTvac: -121, htva: -100, vatAmount: -21 });
    expect(createLedgerEntrySchema.safeParse(entry).success).toBe(true);
    const alreadyNegative = sale({ kindGuess: "note_de_credit", totalTvac: -121, htva: -100, vatAmount: -21 });
    expect(mapExtractedInvoice(alreadyNegative, ctx()).entry).toMatchObject({ totalTvac: -121, htva: -100, vatAmount: -21 });
  });
  it("keeps acompte and falls back to facture for autre", () => {
    expect(mapExtractedInvoice(sale({ kindGuess: "acompte" }), ctx()).entry?.kind).toBe("acompte");
    expect(mapExtractedInvoice(sale({ kindGuess: "autre" }), ctx()).entry?.kind).toBe("facture");
  });
});

describe("mapExtractedInvoice: VAT rate", () => {
  it("keeps the dominant rate and flags multi_rate when two rates are read", () => {
    const x = read({
      issuerName: "Vds",
      totalTvac: 115.5,
      htva: 100,
      vatAmount: 15.5,
      vatLines: [
        { rate: 21, base: 50, amount: 10.5 },
        { rate: 6, base: 50, amount: 3 },
        { rate: 12, base: 20, amount: 2.4 },
      ],
    });
    const fixed = read({ ...x, totalTvac: 115.9, vatAmount: 15.9, htva: 100 });
    const { entry, flags } = mapExtractedInvoice(fixed, ctx());
    expect(codes(flags)).toEqual(["multi_rate"]);
    expect(flags[0].message).toContain("3 taux");
    expect(entry).toMatchObject({ vatRate: 21, vatAmount: 15.9 });
    const dominant6 = read({ ...fixed, vatLines: [{ rate: 21, base: 20, amount: 4.2 }, { rate: 6, base: 80, amount: 4.8 }] });
    expect(mapExtractedInvoice(dominant6, ctx()).entry?.vatRate).toBe(6);
  });
  it("reads fractional rates as percentages", () => {
    const x = read({ issuerName: "Vds", vatLines: [{ rate: 0.21, base: 100, amount: 21 }] });
    const { entry, flags } = mapExtractedInvoice(x, ctx());
    expect(flags).toEqual([]);
    expect(entry?.vatRate).toBe(21);
  });
  it("falls back to nearestVatRate without vatLines", () => {
    const x = read({ issuerName: "Vds", totalTvac: 112, htva: 100, vatAmount: 12, vatLines: [] });
    expect(mapExtractedInvoice(x, ctx()).entry?.vatRate).toBe(12);
    const zero = read({ issuerName: "Vds", totalTvac: 100, htva: 100, vatAmount: 0, vatLines: [] });
    expect(mapExtractedInvoice(zero, ctx()).entry?.vatRate).toBe(0);
  });
});

describe("mapExtractedInvoice: flags", () => {
  it("flags low_confidence under 0.7", () => {
    expect(codes(mapExtractedInvoice(read({ issuerName: "Vds", confidence: 0.69 }), ctx()).flags)).toEqual(["low_confidence"]);
    expect(mapExtractedInvoice(read({ issuerName: "Vds", confidence: 0.7 }), ctx()).flags).toEqual([]);
  });
  it("flags duplicate with the entryId in the same book only", () => {
    const existing = [{ book: "achats" as const, number: "vds-2026-001", entryId: "e1", locked: false }];
    const { entry, flags } = mapExtractedInvoice(read({ issuerName: "Vds" }), ctx({ existingNumbers: existing }));
    expect(flags).toEqual([{ code: "duplicate", message: "Déjà dans le journal (n° vds-2026-001)", entryId: "e1" }]);
    expect(entry?.number).toBe("VDS-2026-001");
    const otherBook = [{ book: "ventes" as const, number: "VDS-2026-001", entryId: "e2", locked: false }];
    expect(mapExtractedInvoice(read({ issuerName: "Vds" }), ctx({ existingNumbers: otherBook })).flags).toEqual([]);
  });
  it("flags locked_month from a locked duplicate or a locked ym", () => {
    const locked = [{ book: "achats" as const, number: "VDS-2026-001", entryId: "e1", locked: true }];
    expect(codes(mapExtractedInvoice(read({ issuerName: "Vds" }), ctx({ existingNumbers: locked })).flags)).toEqual([
      "duplicate",
      "locked_month",
    ]);
    const byMonth = mapExtractedInvoice(read({ issuerName: "Vds" }), ctx({ lockedMonths: ["2026-10"] }));
    expect(byMonth.flags).toEqual([{ code: "locked_month", message: "Mois verrouillé" }]);
    expect(byMonth.entry).not.toBeNull();
    const both = mapExtractedInvoice(read({ issuerName: "Vds" }), ctx({ existingNumbers: locked, lockedMonths: ["2026-10"] }));
    expect(codes(both.flags)).toEqual(["duplicate", "locked_month"]);
  });
  it("uses today and flags missing_date when the date is missing or invalid", () => {
    const missing = mapExtractedInvoice(read({ issuerName: "Vds", date: null }), ctx());
    expect(codes(missing.flags)).toEqual(["missing_date"]);
    expect(missing.entry?.date).toBe("2026-10-14");
    const invalid = mapExtractedInvoice(read({ issuerName: "Vds", date: "02/10/2026" }), ctx());
    expect(codes(invalid.flags)).toEqual(["missing_date"]);
    expect(invalid.entry?.date).toBe("2026-10-14");
    const impossible = mapExtractedInvoice(read({ issuerName: "Vds", date: "2026-02-30" }), ctx());
    expect(codes(impossible.flags)).toEqual(["missing_date"]);
    const lockedToday = mapExtractedInvoice(read({ issuerName: "Vds", date: null }), ctx({ lockedMonths: ["2026-10"] }));
    expect(codes(lockedToday.flags)).toEqual(["missing_date", "locked_month"]);
  });
  it("flags missing_number and leaves number undefined", () => {
    const { entry, flags } = mapExtractedInvoice(read({ issuerName: "Vds", number: "  " }), ctx());
    expect(codes(flags)).toEqual(["missing_number"]);
    expect(entry?.number).toBeUndefined();
    expect(createLedgerEntrySchema.safeParse(entry).success).toBe(true);
  });
  it("flags a currency other than EUR", () => {
    expect(codes(mapExtractedInvoice(read({ issuerName: "Vds", currency: "usd" }), ctx()).flags)).toEqual(["currency"]);
    expect(mapExtractedInvoice(read({ issuerName: "Vds", currency: null }), ctx()).flags).toEqual([]);
  });
  it("keeps every non-amount flag when the entry is null", () => {
    const x = read({ issuerName: "Vds", number: null, date: null, confidence: 0.2, totalTvac: null, htva: null });
    expect(codes(mapExtractedInvoice(x, ctx()).flags)).toEqual(["missing_number", "missing_date", "low_confidence", "missing_amount"]);
  });
});

describe("inbox DTOs", () => {
  it("extractedInvoiceSchema is strict and bounded", () => {
    expect(extractedInvoiceSchema.safeParse(read()).success).toBe(true);
    expect(extractedInvoiceSchema.safeParse({ ...read(), extra: 1 }).success).toBe(false);
    expect(extractedInvoiceSchema.safeParse({ ...read(), confidence: 1.2 }).success).toBe(false);
    expect(extractedInvoiceSchema.safeParse({ ...read(), kindGuess: "ticket" }).success).toBe(false);
    expect(extractedInvoiceSchema.safeParse({ ...read(), issuerVat: undefined }).success).toBe(false);
  });
  it("inboxConfirmSchema validates entries and defaults replace", () => {
    const entry = mapExtractedInvoice(read({ issuerName: "Vds" }), ctx()).entry;
    const parsed = inboxConfirmSchema.safeParse({ items: [{ inboxId: "i1", entry }] });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.items[0].replace).toBe(false);
    expect(inboxConfirmSchema.safeParse({ items: [] }).success).toBe(false);
    expect(inboxConfirmSchema.safeParse({ items: [{ inboxId: "", entry }] }).success).toBe(false);
    expect(inboxConfirmSchema.safeParse({ items: [{ inboxId: "i1", entry: { ...entry, vatAmount: 5 } }] }).success).toBe(false);
  });
  it("create and patch schemas refuse attachment and source", () => {
    const entry = mapExtractedInvoice(read({ issuerName: "Vds" }), ctx()).entry;
    expect(createLedgerEntrySchema.safeParse({ ...entry, source: "depot" }).success).toBe(false);
    expect(
      createLedgerEntrySchema.safeParse({
        ...entry,
        attachment: { key: "k", name: "f.pdf", contentType: "application/pdf", size: 1, uploadedAt: "2026-10-14" },
      }).success,
    ).toBe(false);
    expect(patchLedgerEntrySchema.safeParse({ source: "depot" }).success).toBe(false);
    expect(patchLedgerEntrySchema.safeParse({ attachment: null }).success).toBe(false);
  });
});
