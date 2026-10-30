import { createLedgerEntrySchema } from "../dto/ledger";
import { ledgerVatAtRate, ledgerVatLabel } from "./ledger-vat";
import { mapExtractedInvoice } from "./invoice-inbox";

const entry = {
  book: "ventes" as const,
  kind: "facture" as const,
  date: "2026-10-19",
  label: "Client test",
  htva: 1490.5,
  vatAmount: 213.51,
  totalTvac: 1704.01,
  vatRate: 12 as const,
  vatLines: [
    { rate: 12 as const, base: 1105.5, amount: 132.66 },
    { rate: 21 as const, base: 385, amount: 80.85 },
  ],
};

describe("mixed invoice VAT", () => {
  it("keeps printed amounts in the correct VAT columns", () => {
    expect(createLedgerEntrySchema.safeParse(entry).success).toBe(true);
    expect(ledgerVatAtRate(entry, 6)).toBe(0);
    expect(ledgerVatAtRate(entry, 12)).toBe(132.66);
    expect(ledgerVatAtRate(entry, 21)).toBe(80.85);
    expect(ledgerVatLabel(entry)).toBe("12 % / 21 %");
  });
  it("rejects an inconsistent or repeated VAT breakdown", () => {
    expect(
      createLedgerEntrySchema.safeParse({
        ...entry,
        vatLines: [{ rate: 6, base: 1490.5, amount: 100 }],
      }).success,
    ).toBe(false);
    expect(
      createLedgerEntrySchema.safeParse({
        ...entry,
        vatLines: entry.vatLines.map((line) => ({ ...line, rate: 12 })),
      }).success,
    ).toBe(false);
  });
  it("keeps legacy entries readable", () => {
    expect(ledgerVatAtRate({ vatRate: 6, vatAmount: 6 }, 6)).toBe(6);
    expect(ledgerVatAtRate({ vatRate: 6, vatAmount: 6 }, 21)).toBe(0);
  });
  it("excludes reversed documents before any accounting entry is proposed", () => {
    const result = mapExtractedInvoice(
      {
        issuerName: "Table d'Amélie",
        issuerVat: "BE0766607232",
        recipientName: "Client",
        recipientVat: null,
        number: "INV-1",
        date: "2026-10-19",
        dueDate: null,
        currency: "EUR",
        htva: 100,
        vatAmount: 6,
        totalTvac: 106,
        vatLines: [{ rate: 6, base: 100, amount: 6 }],
        kindGuess: "facture",
        paid: null,
        confidence: 1,
        remarks: null,
        documentStatus: "reversed",
      },
      {
        companyVat: "BE0766607232",
        suppliers: [],
        existingNumbers: [],
        lockedMonths: [],
        today: "2026-10-30",
      },
    );
    expect(result.entry).toBeNull();
    expect(result.flags[0].code).toBe("reversed");
  });
});
