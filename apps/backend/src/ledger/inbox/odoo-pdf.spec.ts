import { parseOdooInvoicePages } from "./odoo-pdf";

export function invoicePage(
  index: number,
  status = "",
  english = false,
): string {
  return `Table d'Amélie\nDrogenberg 55 A\nBE 0766 607 232\nClient ${index}\n${english ? "Invoice" : "Facture"} TEST-${index}\n${english ? "Invoice Date   Due Date" : "Date de facturation   Date d'échéance"}\n${english ? "10/19/2026   10/19/2026" : "19/10/2026   19/10/2026"}\nMontant hors taxes  300,00 €\nTVA 6% sur 100,00 €  6,00 €\nTVA 21% sur 200,00 €  42,00 €\nTotal  348,00 €\n${status}\nPage 1 / 1`;
}

describe("Odoo grouped invoices", () => {
  it("reads 80 invoices without an AI limit or merging their VAT amounts", () => {
    const parsed = parseOdooInvoicePages(
      Array.from({ length: 80 }, (_, index) =>
        invoicePage(index, index < 6 ? "Extourné le 19/10/2026" : ""),
      ),
    )!;
    expect(parsed).toHaveLength(80);
    expect(
      parsed.filter((row) => row.invoice.documentStatus === "reversed"),
    ).toHaveLength(6);
    expect(parsed[79]).toMatchObject({
      pageStart: 80,
      pageEnd: 80,
      invoice: {
        number: "TEST-79",
        htva: 300,
        vatAmount: 48,
        totalTvac: 348,
        paid: null,
      },
    });
    expect(parsed[79].invoice.vatLines).toEqual([
      { rate: 6, base: 100, amount: 6 },
      { rate: 21, base: 200, amount: 42 },
    ]);
  });
  it("groups multi-page invoices and reads English date notation", () => {
    const first = invoicePage(1, "", true).replace(
      /Montant hors taxes[\s\S]*/,
      "Page 1 / 2",
    );
    const second =
      "Montant hors taxes 300,00 €\nTVA 6% sur 100,00 € 6,00 €\nTVA 21% sur 200,00 € 42,00 €\nTotal 348,00 €\nPage 2 / 2";
    expect(parseOdooInvoicePages([first, second])?.[0]).toMatchObject({
      pageStart: 1,
      pageEnd: 2,
      invoice: { date: "2026-10-19", totalTvac: 348 },
    });
  });
  it("refuses missing pages, duplicated numbers and mismatched totals", () => {
    expect(() =>
      parseOdooInvoicePages([
        invoicePage(1).replace("Page 1 / 1", "Page 1 / 2"),
      ]),
    ).toThrow("Suite de pages");
    expect(() =>
      parseOdooInvoicePages([invoicePage(1), invoicePage(1)]),
    ).toThrow("Numéros répétés");
    expect(() =>
      parseOdooInvoicePages([invoicePage(1).replace("348,00", "349,00")]),
    ).toThrow("totaux");
    expect(parseOdooInvoicePages(["A scanned page"])).toBeNull();
  });
});
