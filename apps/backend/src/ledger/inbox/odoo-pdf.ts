import { parseOdooNumber } from "@packages/types";
import type { ExtractedInvoicePages } from "./inbox.extract";

// PDF.js is ESM. Node 24 supports loading its legacy bundle from this CommonJS service.
type PdfTextItem = { str: string; transform: number[]; width: number };
export async function pdfTextPages(body: Buffer): Promise<string[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({ data: new Uint8Array(body), useSystemFonts: true, verbosity: 0 });
  try {
    const document = await loading.promise;
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const items = content.items.filter((item): item is typeof item & PdfTextItem => "str" in item && Boolean(item.str.trim()));
      items.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
      const lines: { y: number; items: PdfTextItem[] }[] = [];
      for (const item of items) {
        let line = lines.find(
          (candidate) => Math.abs(candidate.y - item.transform[5]) < 2);
        if (!line) { line = { y: item.transform[5], items: [] }; lines.push(line); }
        line.items.push(item);
      }
      pages.push(lines.sort((a, b) => b.y - a.y).map((line) => line.items.sort((a, b) => a.transform[4] - b.transform[4]).map((item) => item.str).join("    ")).join("\n"));
      page.cleanup();
    }
    return pages;
  } finally { await loading.destroy(); }
}

const cents = (value: string): number => Math.round(parseOdooNumber(value) * 100);
const printedAmount = (line: string): number | undefined => {
  const match = /(-?\d[\d.,\u00a0\u202f ]*[.,]\d{2})\s*€\s*$/.exec(line);
  return match ? cents(match[1]) : undefined;
};
function dateOf(value: string, english: boolean): string {
  const [a, b, year] = value.split("/").map(Number);
  const date = `${year}-${String(english ? a : b).padStart(2, "0")}-${String(english ? b : a).padStart(2, "0")}`;
  if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("Date de facture invalide");
  return date;
}

// Recognise the business's Odoo export before interpreting it. Other layouts go to document extraction.
export function parseOdooInvoicePages(pages: string[]): ExtractedInvoicePages[] | null {
  if (!pages.length || !/Table d['’]Amélie/.test(pages[0]) || !/BE\s*0766\s*607\s*232/.test(pages[0])) return null;
  const groups: { pageStart: number; pageEnd: number; number: string; english: boolean; text: string;
  }[] = [];
  pages.forEach((page, index) => {
    const heading = /^\s*(Facture|Invoice)\s+(\S+)\s*$/m.exec(page);
    if (heading) groups.push({ pageStart: index + 1, pageEnd: index + 1, number: heading[2], english: heading[1] === "Invoice", text: page });
    else {
      const previous = groups.at(-1);
      if (!previous) throw new Error("Première page sans numéro de facture");
      previous.pageEnd = index + 1; previous.text += `\n${page}`;
    }
  });
  if (new Set(groups.map((group) => group.number)).size !== groups.length) throw new Error("Numéros répétés dans le PDF. Vérifiez les documents.");
  return groups.map((group) => {
    for (let index = group.pageStart; index <= group.pageEnd; index++) {
      const footer = /Page\s+(\d+)\s*\/\s*(\d+)/.exec(pages[index - 1]);
      if (!footer || Number(footer[1]) !== index - group.pageStart + 1 || Number(footer[2]) !== group.pageEnd - group.pageStart + 1) throw new Error("Suite de pages incohérente dans le PDF Odoo");
    }
    const first = pages[group.pageStart - 1];
    const header = first.slice(0, first.search(/^\s*(?:Facture|Invoice)\s+\S+\s*$/m));
    const issuerVat = /BE\s*0766\s*607\s*232/.exec(header);
    if (!issuerVat) throw new Error("Émetteur de facture inattendu");
    const recipientLines = header.slice(issuerVat.index + issuerVat[0].length).split("\n").map((line) => line.trim()).filter(Boolean);
    let recipient = recipientLines[0];
    if (!recipient) throw new Error("Client de facture manquant");
    for (const line of recipientLines.slice(1)) {
      if (/\d|^(TVA|VAT|Belgique|Belgium|France|Rue|Avenue|Chaussée|Boulevard|Place|Chemin)\b/i.test(line)) break;
      recipient += `${recipient.endsWith("-") ? "" : " "}${line}`;
    }
    const section = first.slice(first.indexOf(group.english ? "Invoice Date" : "Date de facturation"));
    const dates = section.match(/\b\d{2}\/\d{2}\/\d{4}\b/g);
    if (!dates?.length) throw new Error("Date de facture manquante");
    const lines = group.text.split("\n");
    const totals = lines.filter((line) => /(?:^|\s)Total\s+(?=-?\d)/.test(line)).map(printedAmount).filter((value): value is number => value !== undefined);
    const untaxed = lines.filter((line) => /Montant hors taxes|Untaxed Amount/.test(line)).map(printedAmount).filter((value): value is number => value !== undefined);
    if (totals.length !== 1 || untaxed.length > 1) throw new Error("Totaux de facture ambigus");
    const vatLines = lines.flatMap((line) => {
      const match = /(?:TVA|VAT)\s+(\d+)%\s*(?:(?:sur|on)\s+([\d.,\u00a0\u202f ]+)\s*€)?/.exec(line);
      if (!match) return [];
      const amount = printedAmount(line);
      if (amount === undefined) throw new Error("Montant TVA manquant");
      return [{ rate: Number(match[1]), base: match[2] ? cents(match[2]) : undefined, amount }];
    });
    const vat = vatLines.reduce((sum, line) => sum + line.amount, 0);
    const base = untaxed[0] ?? totals[0] - vat;
    if (base + vat !== totals[0]) throw new Error("Les totaux HTVA, TVA et TVAC ne concordent pas");
    if (vatLines.length === 1 && vatLines[0].base === undefined) vatLines[0].base = base;
    if (vatLines.some((line) => line.base === undefined) || (vatLines.length && vatLines.reduce((sum, line) => sum + (line.base ?? 0), 0) !== base)) throw new Error("Ventilation TVA incomplète");
    const reversed = /Extourné le\s+(\d{2}\/\d{2}\/\d{4})/.exec(group.text);
    const due = lines.find((line) => /Montant dû|Amount Due/.test(line));
    const paid = reversed ? null : due ? printedAmount(due) === 0 : /Payé le|Paid on/.test(group.text) ? true : null;
    const payments = [
      ...group.text.matchAll(/(?:Payé le|Paid on)\s+(\d{2}\/\d{2}\/\d{4})/g),
    ];
    return { pageStart: group.pageStart, pageEnd: group.pageEnd, invoice: {
      issuerName: "Table d'Amélie", issuerVat: "BE0766607232", recipientName: recipient.slice(0, 120),
      recipientVat: /(?:TVA|VAT):\s*(\S+)/.exec(recipientLines.join("\n"))?.[1] ?? null,
      number: group.number, date: dateOf(dates[0], group.english), dueDate: dates[1] ? dateOf(dates[1], group.english) : null,
      currency: "EUR", totalTvac: totals[0] / 100, htva: base / 100, vatAmount: vat / 100,
      vatLines: vatLines.map((line) => ({ rate: line.rate, base: (line.base ?? 0) / 100, amount: line.amount / 100 })),
      kindGuess: "facture", paid, confidence: 1, documentStatus: reversed ? "reversed" : "active",
        paidAt:
          !reversed && paid === true && payments.length
            ? dateOf(payments.at(-1)![1], group.english)
            : null,
        remarks: reversed ? `Facture extournée le ${reversed[1]}` : paid === null ? "État du paiement non indiqué" : null,
    } };
  });
}
