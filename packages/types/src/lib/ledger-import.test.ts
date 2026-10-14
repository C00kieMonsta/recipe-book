import {
  ODOO_HEADERS,
  ODOO_REQUIRED_FIELDS,
  detectOdooColumns,
  isPaidStatus,
  mapOdooRow,
  nearestVatRate,
  odooHeaderKey,
  parseOdooDate,
  parseOdooNumber,
} from "./ledger-import";

const FR = ["Numéro", "Date de facturation", "Partenaire", "Montant HT", "Taxes", "Total", "État du paiement"];
const EN = ["Number", "Invoice/Bill Date", "Partner", "Untaxed Amount", "Tax", "Total", "Payment Status"];

describe("ODOO_HEADERS", () => {
  it("holds lower-cased, accent-stripped aliases", () => {
    for (const aliases of Object.values(ODOO_HEADERS)) {
      for (const a of aliases) expect(a).toBe(odooHeaderKey(a));
    }
    expect(ODOO_REQUIRED_FIELDS).toEqual(["number", "date", "untaxed", "total"]);
  });
});

describe("detectOdooColumns", () => {
  it("detects the French export", () => {
    expect(detectOdooColumns(FR)).toEqual({
      number: "Numéro",
      date: "Date de facturation",
      partner: "Partenaire",
      untaxed: "Montant HT",
      tax: "Taxes",
      total: "Total",
      status: "État du paiement",
    });
  });
  it("detects the English export", () => {
    expect(detectOdooColumns(EN)).toEqual({
      number: "Number",
      date: "Invoice/Bill Date",
      partner: "Partner",
      untaxed: "Untaxed Amount",
      tax: "Tax",
      total: "Total",
      status: "Payment Status",
    });
  });
  it("takes the first matching header and ignores case and spacing", () => {
    const cols = detectOdooColumns(["  NUMERO ", "Date", "Hors taxes", "Montant HT", "Total", "Statut"]);
    expect(cols?.untaxed).toBe("Hors taxes");
    expect(cols?.number).toBe("  NUMERO ");
    expect(cols?.status).toBe("Statut");
    expect(cols?.partner).toBeUndefined();
  });
  it("is undefined when a required column is missing", () => {
    expect(detectOdooColumns(["Date", "Partenaire", "Montant HT", "Total"])).toBeUndefined();
    expect(detectOdooColumns(["Numéro", "Date", "Partenaire", "Total"])).toBeUndefined();
    expect(detectOdooColumns([])).toBeUndefined();
  });
});

describe("parseOdooNumber", () => {
  it("reads comma and dot decimals", () => {
    expect(parseOdooNumber("1 234,56")).toBe(1234.56);
    expect(parseOdooNumber("1,234.56")).toBe(1234.56);
    expect(parseOdooNumber("1234.56")).toBe(1234.56);
    expect(parseOdooNumber("-12,5")).toBe(-12.5);
    expect(parseOdooNumber("€ 12,50")).toBe(12.5);
    expect(parseOdooNumber("1.234,56 €")).toBe(1234.56);
    expect(parseOdooNumber("1 234")).toBe(1234);
    expect(parseOdooNumber("0")).toBe(0);
  });
  it("is NaN when unreadable", () => {
    expect(parseOdooNumber("")).toBeNaN();
    expect(parseOdooNumber("abc")).toBeNaN();
    expect(parseOdooNumber("1-2")).toBeNaN();
  });
});

describe("parseOdooDate", () => {
  it("reads ISO, dd/mm/yyyy, dd-mm-yyyy and a timestamp", () => {
    expect(parseOdooDate("2026-10-14")).toBe("2026-10-14");
    expect(parseOdooDate("14/10/2026")).toBe("2026-10-14");
    expect(parseOdooDate("14-10-2026")).toBe("2026-10-14");
    expect(parseOdooDate("2026-10-14 10:22:00")).toBe("2026-10-14");
    expect(parseOdooDate("1/2/2026")).toBe("2026-02-01");
  });
  it("is null when unreadable or impossible", () => {
    expect(parseOdooDate("")).toBeNull();
    expect(parseOdooDate("hier")).toBeNull();
    expect(parseOdooDate("2026-02-30")).toBeNull();
    expect(parseOdooDate("31/04/2026")).toBeNull();
  });
});

describe("nearestVatRate", () => {
  it("picks the matching rate, tolerant of rounding", () => {
    expect(nearestVatRate(100, 21)).toBe(21);
    expect(nearestVatRate(100, 12)).toBe(12);
    expect(nearestVatRate(100, 6)).toBe(6);
    expect(nearestVatRate(100, 0)).toBe(0);
    expect(nearestVatRate(33.33, 4)).toBe(12);
    expect(nearestVatRate(-100, -21)).toBe(21);
  });
  it("rounds a mixed-rate invoice up to the next rate", () => {
    expect(nearestVatRate(100, 15)).toBe(21);
    expect(nearestVatRate(100, 9)).toBe(12);
    expect(nearestVatRate(100, 2)).toBe(6);
    expect(nearestVatRate(100, 30)).toBe(21);
  });
  it("is 0 when untaxed is 0", () => {
    expect(nearestVatRate(0, 0)).toBe(0);
    expect(nearestVatRate(0, 5)).toBe(0);
  });
});

describe("isPaidStatus", () => {
  it("recognises paid, in payment and partial in both languages", () => {
    expect(isPaidStatus("Payé")).toBe(true);
    expect(isPaidStatus("paid")).toBe(true);
    expect(isPaidStatus("in_payment")).toBe(true);
    expect(isPaidStatus("En paiement")).toBe(true);
    expect(isPaidStatus("partial")).toBe(true);
    expect(isPaidStatus("Partiel")).toBe(true);
  });
  it("is false for unpaid, reversed and absent", () => {
    expect(isPaidStatus("not_paid")).toBe(false);
    expect(isPaidStatus("Non payé")).toBe(false);
    expect(isPaidStatus("reversed")).toBe(false);
    expect(isPaidStatus("")).toBe(false);
    expect(isPaidStatus(undefined)).toBe(false);
  });
});

describe("mapOdooRow", () => {
  const columns = detectOdooColumns(FR)!;
  const base = {
    Numéro: "INV/2026/0042",
    "Date de facturation": "14/10/2026",
    Partenaire: "Dupont SA",
    "Montant HT": "1 000,00",
    Taxes: "120,00",
    Total: "1 120,00",
    "État du paiement": "Payé",
  };

  it("maps a plain invoice", () => {
    const out = mapOdooRow(base, columns);
    expect(out).toEqual({
      ok: true,
      row: {
        number: "INV/2026/0042",
        date: "2026-10-14",
        label: "Dupont SA",
        htva: 1000,
        vatRate: 12,
        vatAmount: 120,
        totalTvac: 1120,
        paid: true,
      },
    });
  });
  it("refuses a row without a number", () => {
    expect(mapOdooRow({ ...base, Numéro: "  " }, columns)).toEqual({ ok: false, reason: "numéro manquant" });
  });
  it("refuses an unreadable date or amount", () => {
    expect(mapOdooRow({ ...base, "Date de facturation": "hier" }, columns)).toEqual({ ok: false, reason: "date illisible" });
    expect(mapOdooRow({ ...base, "Montant HT": "" }, columns)).toEqual({ ok: false, reason: "montant HT illisible" });
    expect(mapOdooRow({ ...base, Total: "n/a" }, columns)).toEqual({ ok: false, reason: "total illisible" });
  });
  it("maps a mixed-rate invoice to the nearest rate with the exact tax", () => {
    const out = mapOdooRow({ ...base, "Montant HT": "100", Taxes: "15", Total: "115" }, columns);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.row.vatRate).toBe(21);
    expect(out.row.vatAmount).toBe(15);
    expect(out.row.totalTvac).toBe(115);
  });
  it("derives the tax from total minus untaxed when the column is missing", () => {
    const noTax = detectOdooColumns(["Numéro", "Date", "Partenaire", "Montant HT", "Total"])!;
    const out = mapOdooRow(
      { Numéro: "INV/1", Date: "2026-10-01", Partenaire: "Pirson", "Montant HT": "200", Total: "242" },
      noTax,
    );
    expect(out).toEqual({
      ok: true,
      row: { number: "INV/1", date: "2026-10-01", label: "Pirson", htva: 200, vatRate: 21, vatAmount: 42, totalTvac: 242, paid: false },
    });
  });
  it("keeps the sign of a credit note", () => {
    const out = mapOdooRow(
      { ...base, Numéro: "RINV/2026/0003", "Montant HT": "-100,00", Taxes: "-21,00", Total: "-121,00", "État du paiement": "not_paid" },
      columns,
    );
    expect(out).toEqual({
      ok: true,
      row: {
        number: "RINV/2026/0003",
        date: "2026-10-14",
        label: "Dupont SA",
        htva: -100,
        vatRate: 21,
        vatAmount: -21,
        totalTvac: -121,
        paid: false,
      },
    });
  });
  it("falls back to the number as label and reads the payment date", () => {
    const cols = detectOdooColumns([...FR, "Date de paiement"])!;
    const out = mapOdooRow({ ...base, Partenaire: "", "Date de paiement": "2026-10-20" }, cols);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.row.label).toBe("INV/2026/0042");
    expect(out.row.paidAt).toBe("2026-10-20");
  });
});
