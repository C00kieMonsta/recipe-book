import type { CompanySettings, PrestationTypeSetting } from "../entities/settings";
import { DEFAULT_BRAND_ACCENT } from "../entities/settings";
import type { DocChoice, DocMinimum, DocRow, DocRowKind, DocSection, DocUnitKind, OfferDocument } from "../entities/offer-document";
import { DOC_UNIT_PRESETS } from "../entities/offer-document";
import type { EventRevenueLine } from "../entities/event";
import type { Offer, OfferLine } from "../entities/offer";
import type { VatRate } from "../entities/ledger";
import type { CreateOfferRequest, UpdateOfferRequest } from "../dto/offers";
import { fmtEur, round2 } from "./money";

// The flat layout model the PDF reads. The renderer never looks at the entity.
// Named DocPrintBlock because print.ts already exports a PrintBlock.
export type DocPrintBlock =
  | { kind: "band"; text: string }
  | { kind: "company"; lines: string[]; facts: [string, string][] }
  | { kind: "section"; title: string; intro?: string; price?: string; unit?: string; minimum?: string }
  | { kind: "row"; style: DocRowKind; text: string; price?: string; unit?: string; indent: 0 | 1 }
  | { kind: "services"; title: string; intro?: string; rows: { text: string; price?: string; unit?: string }[] }
  | { kind: "conditions"; text: string }
  | { kind: "vat"; rows: [string, string][] };

export const DEFAULT_SECTION_UNIT_LABEL = "par personne";
const DEFAULT_FOOD_VAT_RATE: VatRate = 12;
const DEFAULT_GUEST_COUNT = 20;

const qtyFormatter = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 2 });

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function text(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

function capitalize(s: string): string {
  return s.length ? s[0].toLocaleUpperCase("fr") + s.slice(1) : s;
}

// ["Nombre minimum de personnes", "20"] when only minGuests is set; ["Nombre de personnes", "entre 8 et 14"] with both; the override as value when set; undefined when nothing is set.
export function guestsFact(d: Pick<OfferDocument, "minGuests" | "maxGuests" | "guestsLabel">): [string, string] | undefined {
  const min = d.minGuests;
  const max = d.maxGuests;
  const label =
    min !== undefined && max === undefined
      ? "Nombre minimum de personnes"
      : min === undefined && max !== undefined
        ? "Nombre maximum de personnes"
        : "Nombre de personnes";
  const override = text(d.guestsLabel);
  if (override) return [label, override];
  if (min !== undefined && max !== undefined) return [label, `entre ${min} et ${max}`];
  if (min !== undefined) return [label, String(min)];
  if (max !== undefined) return [label, String(max)];
  return undefined;
}

const MINIMUM_UNITS: Record<DocMinimum["unit"], [string, string]> = {
  personnes: ["personne", "personnes"],
  pieces: ["pièce", "pièces"],
  unites: ["unité", "unités"],
};

// « minimum 20 pièces par sorte », « minimum 8 personnes », « minimum 12 unités »; the label override as is.
export function minimumLabelOf(m: DocMinimum): string {
  const override = text(m.label);
  if (override) return override;
  const [one, many] = MINIMUM_UNITS[m.unit];
  const unit = m.qty > 1 ? many : one;
  return `minimum ${qtyFormatter.format(m.qty)} ${unit}${m.perSort ? " par sorte" : ""}`;
}

// { 1, table } → « un choix pour la table »; { 4, table } → « sélection de 4 au choix »; { 2, convive } → « 2 au choix par convive »; the label override as is.
export function choiceLabelOf(c: DocChoice): string {
  const override = text(c.label);
  if (override) return override;
  if (c.scope === "convive") return c.count === 1 ? "un choix par convive" : `${c.count} au choix par convive`;
  return c.count === 1 ? "un choix pour la table" : `sélection de ${c.count} au choix`;
}

const UNIT_PRESETS_FOLDED = new Map<string, DocUnitKind>(
  Object.entries(DOC_UNIT_PRESETS).map(([label, kind]) => [fold(label), kind]),
);

// Preset lookup (case and accent insensitive), else fallback ?? "unite".
export function unitKindOf(unitLabel: string | undefined, fallback?: DocUnitKind): DocUnitKind {
  const key = unitLabel ? fold(unitLabel) : "";
  return (key && UNIT_PRESETS_FOLDED.get(key)) || fallback || "unite";
}

// « 2,25 € », « àpd 4,50 € », the priceNote when there is no price, undefined when neither.
export function priceLabelOf(row: Pick<DocRow, "price" | "fromPrice" | "priceNote">): string | undefined {
  if (row.price !== undefined) return row.fromPrice ? `àpd ${fmtEur(row.price)}` : fmtEur(row.price);
  return text(row.priceNote);
}

// « Offre buffets automne hiver 2026.pdf »: [\/:*?"<>|] stripped, spaces collapsed, trimmed.
export function documentFileName(d: Pick<OfferDocument, "title" | "year">): string {
  const base = `${d.title} ${d.year}`
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${base}.pdf`;
}

// The prestation's default rate, else 12.
export function foodVatRateOf(d: Pick<OfferDocument, "prestationType">, prestationTypes: PrestationTypeSetting[]): VatRate {
  if (!d.prestationType) return DEFAULT_FOOD_VAT_RATE;
  return prestationTypes.find((p) => p.key === d.prestationType)?.defaultVatRate ?? DEFAULT_FOOD_VAT_RATE;
}

function sectionUnitLabel(s: Pick<DocSection, "unitLabel">): string {
  return text(s.unitLabel) ?? DEFAULT_SECTION_UNIT_LABEL;
}

// The printed text of a row: tags in parentheses, « ex : » on examples, the choice after a sous-titre.
function rowText(row: DocRow): string {
  if (row.kind === "exemple") return `ex : ${row.text}`;
  if (row.kind === "sous_titre") return row.choice ? `${row.text} (${choiceLabelOf(row.choice)})` : row.text;
  const tags = (row.tags ?? []).map((t) => t.trim()).filter(Boolean);
  return tags.length ? `${row.text} (${tags.join(", ")})` : row.text;
}

function companyLines(company: CompanySettings | undefined): string[] {
  if (!company) return [];
  const raw = [
    company.name,
    ...company.address.split(/\r?\n/),
    company.vatNumber ? `TVA ${company.vatNumber}` : "",
    company.phone,
    company.email,
    company.website,
  ];
  return raw.map((l) => (l ?? "").trim()).filter(Boolean);
}

// The layout model, section 8. Money through fmtEur; tags appended « (chaud) »; examples prefixed « ex : »; a row unit printed only when it differs from the section unit; a choice appended to its sous_titre « Entrée (un choix pour la table) »; indent 1 for exemple rows and for rows under a sous_titre.
export function documentBlocks(d: OfferDocument, company: CompanySettings | undefined): DocPrintBlock[] {
  const blocks: DocPrintBlock[] = [];
  blocks.push({ kind: "band", text: `${d.title} ${d.year}`.trim().toLocaleUpperCase("fr") });

  const facts: [string, string][] = [];
  const prestation = text(d.prestationLabel);
  if (prestation) facts.push(["Type de prestation", prestation]);
  const guests = guestsFact(d);
  if (guests) facts.push(guests);
  const note = text(d.note);
  if (note) facts.push(["Note", note]);
  blocks.push({ kind: "company", lines: companyLines(company), facts });

  for (const s of d.sections) {
    // A price list with no unit of its own prints none on the band: every row carries its unit.
    const unit = s.price === undefined && !text(s.unitLabel) ? undefined : sectionUnitLabel(s);
    const section: DocPrintBlock = { kind: "section", title: s.title };
    if (unit) section.unit = unit;
    const intro = text(s.intro);
    if (intro) section.intro = intro;
    if (s.price !== undefined) section.price = fmtEur(s.price);
    if (s.minimum) section.minimum = minimumLabelOf(s.minimum);
    blocks.push(section);

    let underSubtitle = false;
    for (const row of s.rows) {
      if (row.kind === "sous_titre") underSubtitle = true;
      const indent: 0 | 1 = row.kind === "exemple" || (underSubtitle && row.kind !== "sous_titre") ? 1 : 0;
      const block: DocPrintBlock = { kind: "row", style: row.kind, text: rowText(row), indent };
      if (row.kind === "plat") {
        const price = priceLabelOf(row);
        if (price) block.price = price;
        const rowUnit = text(row.unitLabel);
        if (row.price !== undefined && rowUnit && rowUnit !== unit) block.unit = rowUnit;
      }
      blocks.push(block);
    }
  }

  if (d.services.shown) {
    const services: DocPrintBlock = {
      kind: "services",
      title: d.services.title,
      rows: d.services.rows.map((row) => {
        const out: { text: string; price?: string; unit?: string } = { text: rowText(row) };
        const price = priceLabelOf(row);
        if (price) out.price = price;
        const unit = text(row.unitLabel);
        if (row.price !== undefined && unit) out.unit = unit;
        return out;
      }),
    };
    const intro = text(d.services.intro);
    if (intro) services.intro = intro;
    blocks.push(services);
  }

  const conditions = text(d.conditions);
  if (conditions) blocks.push({ kind: "conditions", text: conditions });

  if (d.vatLines.length) blocks.push({ kind: "vat", rows: d.vatLines.map((l) => [l.label, `${l.rate} %`]) });

  return blocks;
}

function categoryFor(title: string, categories: string[] | undefined): string | undefined {
  if (!categories?.length) return undefined;
  const key = fold(title);
  return categories.find((c) => fold(c) === key);
}

// Rows with a recipe, portionsPerGuest 1, or round2(choice.count / n) inside a choice group. course from the nearest sous_titre when it matches a category, else absent.
export function sectionRecipeLines(s: DocSection, categories?: string[]): OfferLine[] {
  const out: OfferLine[] = [];
  let group: { choice?: DocChoice; course?: string; plats: number } = { plats: 0 };
  let index = 0;
  while (index < s.rows.length) {
    const row = s.rows[index];
    if (row.kind === "sous_titre") {
      let end = index + 1;
      while (end < s.rows.length && s.rows[end].kind !== "sous_titre") end++;
      const plats = s.rows.slice(index + 1, end).filter((r) => r.kind === "plat").length;
      group = { choice: row.choice, course: categoryFor(row.text, categories), plats };
      index++;
      continue;
    }
    if (row.kind === "plat" && row.recipeId) {
      const share = group.choice && group.plats > 0 ? round2(group.choice.count / group.plats) : 1;
      const line: OfferLine = { recipeId: row.recipeId, portionsPerGuest: share > 0 ? share : 1 };
      if (group.course) line.course = group.course;
      out.push(line);
    }
    index++;
  }
  return out;
}

function unlinkedPlats(s: DocSection): string[] {
  return s.rows.filter((r) => r.kind === "plat" && !r.recipeId).map((r) => r.text);
}

function notesOf(s: DocSection): string | undefined {
  const plats = unlinkedPlats(s);
  return plats.length ? `Plats sans recette : ${plats.join(" · ")}` : undefined;
}

// name default « <title> <year> › <section title> ». Keeps price, prestation, vatRate; unlinked plat rows listed in notes as « Plats sans recette : … ».
export function offerFromSection(
  d: OfferDocument,
  s: DocSection,
  prestationTypes: PrestationTypeSetting[],
  name?: string,
): CreateOfferRequest {
  const offer: CreateOfferRequest = {
    name: text(name) ?? `${d.title} ${d.year} › ${s.title}`,
    guestCountRef: d.minGuests ?? DEFAULT_GUEST_COUNT,
    lines: sectionRecipeLines(s),
    extraCosts: [],
    revenueLines: [],
    pricingMode: "par_convive",
    sellingPricePerGuest: s.price ?? 0,
    vatRate: foodVatRateOf(d, prestationTypes),
  };
  if (d.prestationType) offer.prestationType = d.prestationType;
  const notes = notesOf(s);
  if (notes) offer.notes = notes;
  return offer;
}

// The fields « Mettre à jour la formule » rewrites; null clears a prestation or notes the document no longer has.
export function offerSyncFromSection(
  d: OfferDocument,
  s: DocSection,
  prestationTypes: PrestationTypeSetting[],
): Pick<UpdateOfferRequest, "lines" | "sellingPricePerGuest" | "notes" | "vatRate" | "prestationType"> {
  return {
    lines: sectionRecipeLines(s),
    sellingPricePerGuest: s.price ?? 0,
    vatRate: foodVatRateOf(d, prestationTypes),
    prestationType: d.prestationType ?? null,
    notes: notesOf(s) ?? null,
  };
}

// A formula section from a 07 offer: title = name, price = sellingPricePerGuest, « par personne », one plat row per line (recipe name, recipeId), offerId set. ids() supplies row and section ids.
export function sectionFromOffer(offer: Offer, recipeNameById: Map<string, string>, ids: () => string): DocSection {
  return {
    sectionId: ids(),
    title: offer.name,
    price: offer.sellingPricePerGuest,
    unitLabel: DEFAULT_SECTION_UNIT_LABEL,
    unitKind: "convive",
    rows: (offer.lines ?? []).map((l) => ({
      rowId: ids(),
      kind: "plat",
      text: recipeNameById.get(l.recipeId) ?? "Recette inconnue",
      recipeId: l.recipeId,
    })),
    offerId: offer.offerId,
  };
}

// One revenue line per pick: label « Carte · Choux fourrés au saumon fumé × 60 », amount round2(qty × price), the given vatRate. Rows without a price are skipped.
export function revenueLinesFromRows(picks: { row: DocRow; qty: number }[], vatRate: VatRate): EventRevenueLine[] {
  const out: EventRevenueLine[] = [];
  for (const { row, qty } of picks) {
    if (row.price === undefined) continue;
    const n = Number.isFinite(qty) && qty > 0 ? qty : 0;
    out.push({ label: `Carte · ${row.text} × ${qtyFormatter.format(n)}`, amount: round2(n * row.price), vatRate });
  }
  return out;
}

function rowUnitKind(section: DocSection, row: DocRow): DocUnitKind {
  return row.unitKind ?? unitKindOf(row.unitLabel, section.unitKind ?? unitKindOf(section.unitLabel));
}

// « Minimum 20 pièces par sorte : Sablés au comté (12) », « Minimum 8 personnes : Plateau apéro (6) ». Empty when every pick meets the section's or the row's minimum.
export function rowMinimumWarnings(section: DocSection, picks: { row: DocRow; qty: number }[], guests: number): string[] {
  const m = section.minimum;
  if (!m) return [];
  const label = capitalize(minimumLabelOf(m));
  const out: string[] = [];
  for (const { row, qty } of picks) {
    // A per-guest row is bought for the guests; anything else by its quantity.
    const bought = rowUnitKind(section, row) === "convive" ? guests : qty;
    const n = Number.isFinite(bought) ? bought : 0;
    if (n < m.qty) out.push(`${label} : ${row.text} (${qtyFormatter.format(n)})`);
  }
  return out;
}

// Counts for the list columns and the assistant. Rows are the sections' rows; priced and linked count rows with a price or a recipe.
export function documentSummary(d: OfferDocument): { sections: number; rows: number; priced: number; linked: number } {
  let rows = 0;
  let priced = 0;
  let linked = 0;
  for (const s of d.sections) {
    for (const r of s.rows) {
      rows++;
      if (r.price !== undefined) priced++;
      if (r.recipeId) linked++;
    }
  }
  return { sections: d.sections.length, rows, priced, linked };
}

// The document and section whose offerId matches; undefined when none.
export function documentSectionFor(
  documents: OfferDocument[],
  offerId: string,
): { document: OfferDocument; section: DocSection } | undefined {
  if (!offerId) return undefined;
  for (const document of documents) {
    const section = document.sections.find((s) => s.offerId === offerId);
    if (section) return { document, section };
  }
  return undefined;
}

function parseHex(hex: string): [number, number, number] | undefined {
  const s = hex.trim().replace(/^#/, "");
  const full = /^[0-9a-fA-F]{3}$/.test(s) ? s.split("").map((c) => c + c).join("") : s;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return undefined;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

// Hex blended over white: mixWithWhite("#E8847A", 0.3) = "#F8DAD7". Used for the sub-header fill.
export function mixWithWhite(hex: string, share: number): string {
  const rgb = parseHex(hex) ?? (parseHex(DEFAULT_BRAND_ACCENT) as [number, number, number]);
  const k = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 1;
  const mixed = rgb.map((c) => Math.round(c * k + 255 * (1 - k)));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}
