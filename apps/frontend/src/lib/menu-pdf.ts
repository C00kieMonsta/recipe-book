import { jsPDF } from "jspdf";
import type { AppEvent, PricedEvent } from "@packages/types";
import { fmtEur, foodRevenue, pricePerGuestOf, revenueTvac, signedRevenue } from "@packages/types";
import { plural } from "@/lib/use-planning-data";

export interface MenuPdfGroup {
  course: string;
  recipes: string[];
}

export interface MenuPdfInput {
  title: string;
  // "Samedi 17 octobre 2026", under the title when set.
  dateLine?: string;
  guestCount: number;
  // From pricingLines; the guest count alone when empty.
  priceLines: string[];
  groups: MenuPdfGroup[];
  // "Famille Dupont · 0470 00 00 00"
  contact?: string;
  // "Livraison le samedi 17 octobre à 11h30, Rue des Lilas 4"
  delivery?: string;
  company?: string;
  fileName: string;
}

// The standard PDF fonts have no narrow no-break space, so the fr-BE thousands separator becomes a plain space.
function pdfText(s: string): string {
  return s.replace(/[  ]/g, " ");
}

function vatSuffix(rate: number | undefined): string {
  return rate === undefined ? "" : ` (TVA ${rate} %)`;
}

// The price lines of the menu proposal: guests and food price, one line per billed line, then the totals when there is more than the food.
export function pricingLines(e: PricedEvent & Pick<AppEvent, "vatRate">, prestationLabel?: string): string[] {
  const first = [plural(e.guestCount, "convive")];
  if (e.pricingMode === "total") first.push(`Prix food ${fmtEur(foodRevenue(e))} HTVA${vatSuffix(e.vatRate)}`);
  else first.push(`Prix food ${fmtEur(pricePerGuestOf(e))} HTVA / convive${vatSuffix(e.vatRate)}`);
  if (prestationLabel) first.push(prestationLabel);
  const lines = [first.join(" · ")];
  const revenueLines = e.revenueLines ?? [];
  for (const l of revenueLines) lines.push(`${l.label} · ${fmtEur(l.amount)} HTVA${vatSuffix(l.vatRate)}`);
  if (revenueLines.length > 0 || e.pricingMode === "total") {
    lines.push(`Total HTVA ${fmtEur(signedRevenue(e))} · Total TVAC ${fmtEur(revenueTvac(e))}`);
  }
  return lines;
}

// One A4 page or more: title, date, price lines, the menu by category, then delivery, contact and the company name.
export function exportMenuPdf(input: MenuPdfInput): void {
  const doc = new jsPDF();
  const m = 15;
  let y = m + 7;
  const text = (s: string, x: number) => doc.text(pdfText(s), x, y);
  const ensure = (limit: number) => { if (y > limit) { doc.addPage(); y = m; } };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  text(input.title, m);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  if (input.dateLine) {
    text(input.dateLine, m);
    y += 6;
  }
  const priceLines = input.priceLines.length ? input.priceLines : [plural(input.guestCount, "convive")];
  for (const line of priceLines) {
    text(line, m);
    y += 6;
  }
  y += 6;

  for (const group of input.groups) {
    ensure(260);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    text(group.course, m);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    for (const name of group.recipes) {
      ensure(275);
      text(name, m + 4);
      y += 6;
    }
    y += 4;
  }

  doc.setFontSize(11);
  if (input.delivery) {
    ensure(270);
    y += 4;
    text(input.delivery, m);
    y += 6;
  }
  if (input.contact) {
    ensure(270);
    y += 4;
    text(`Contact : ${input.contact}`, m);
    y += 6;
  }
  if (input.company) {
    ensure(270);
    text(input.company, m);
    y += 4;
  }
  doc.save(input.fileName);
}
