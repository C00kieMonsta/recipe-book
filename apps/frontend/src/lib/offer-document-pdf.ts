import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { CellDef, CellHookData, FontStyle, RowInput } from "jspdf-autotable";
import type { DocPrintBlock } from "@packages/types";
import { DEFAULT_BRAND_ACCENT, mixWithWhite } from "@packages/types";
import type { PdfImage } from "@/lib/pdf-images";

export interface OfferDocumentPdfInput {
  blocks: DocPrintBlock[];
  // Hex band colour; DEFAULT_BRAND_ACCENT when not a valid hex.
  accent: string;
  logo?: PdfImage;
  // Already cover-cropped to 4:1 by loadImageForPdf({ cropRatio: 4 }).
  banner?: PdfImage;
  // Company line printed centred at the bottom of every page; empty skips it.
  footer: string;
  fileName: string;
}

type SectionBlock = Extract<DocPrintBlock, { kind: "section" }>;
type RowBlock = Extract<DocPrintBlock, { kind: "row" }>;
type ServicesBlock = Extract<DocPrintBlock, { kind: "services" }>;

// A second text under a cell's content in another face: the intro under a title, the unit under a price.
interface CellExtra {
  lines: string[];
  fontSize: number;
  fontStyle: FontStyle;
  color: string;
  halign: "left" | "right";
  height: number;
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = 180;
const RIGHT_X = PAGE_W - MARGIN;
const BOTTOM_Y = PAGE_H - MARGIN;
const FOOTER_Y = 290;
const TOP_Y = 15;
const COL_TEXT_W = 140;
const COL_PRICE_W = 40;
const PAD = 2;
const PAD_V = 1.4;
const INDENT = 4;
const EXAMPLE_PAD = 6;
const HEADS_H = 7;
const SECTION_MIN_LEFT = 32;
const TAIL_MIN_LEFT = 40;
const LINE_FACTOR = 1.15;
const EXTRA_GAP = 0.5;

const FONT = "helvetica";
const TEXT = "#37352f";
const MUTED = "#787774";
const RULE = "#d3d2cf";

const MONEY_RE = /^(àpd )?\d[\d\s  .,]*\s?€$/;

// The standard PDF fonts have no narrow no-break space, so the fr-BE thousands separator becomes a plain space.
function pdfText(s: string): string {
  return s.replace(/[  ]/g, " ");
}

function isMoney(label: string | undefined): boolean {
  return label !== undefined && MONEY_RE.test(label);
}

function validAccent(accent: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(accent.trim()) ? accent.trim() : DEFAULT_BRAND_ACCENT;
}

// Builds the A4 brochure from the layout blocks; callers save(fileName) or output("bloburl").
export function exportOfferDocumentPdf(input: OfferDocumentPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.setLineHeightFactor(LINE_FACTOR);
  doc.setProperties({ title: input.fileName.replace(/\.pdf$/i, "") });
  const k = doc.internal.scaleFactor;
  const mm = (pt: number) => pt / k;
  const accent = validAccent(input.accent);
  const subFill = mixWithWhite(accent, 0.3);
  const headsOn = new Set<number>();
  let cursor = 0;

  const setFont = (style: FontStyle, size: number, color = TEXT) => {
    doc.setFont(FONT, style);
    doc.setFontSize(size);
    doc.setTextColor(color);
  };
  const wrap = (text: string, width: number, size: number, style: FontStyle): string[] => {
    setFont(style, size);
    return doc.splitTextToSize(pdfText(text), width) as string[];
  };
  const extraOf = (text: string, width: number, size: number, style: FontStyle, color: string, halign: "left" | "right"): CellExtra => {
    const lines = wrap(text, width, size, style);
    return { lines, fontSize: size, fontStyle: style, color, halign, height: lines.length * mm(size) * LINE_FACTOR + EXTRA_GAP };
  };
  const padding = (left: number, extra?: CellExtra) => ({ top: PAD_V, bottom: PAD_V + (extra?.height ?? 0), left, right: PAD });

  // The column heads under a rule; the same on every page.
  const drawHeads = (y: number): number => {
    doc.setDrawColor(RULE);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, RIGHT_X, y);
    setFont("bold", 9);
    doc.text("Description", MARGIN, y + 4);
    doc.text("Coût unitaire/pers (htva)", RIGHT_X, y + 4, { align: "right" });
    doc.line(MARGIN, y + 5, RIGHT_X, y + 5);
    return y + HEADS_H;
  };
  const pageTop = (): number => {
    const n = doc.getCurrentPageInfo().pageNumber;
    if (headsOn.has(n)) return TOP_Y + HEADS_H;
    headsOn.add(n);
    return drawHeads(TOP_Y);
  };
  const newPage = () => {
    doc.addPage();
    cursor = pageTop();
  };
  const leftOnPage = () => BOTTOM_Y - cursor;

  // Page 1 header: logo or company name, banner, band, company block and facts, column heads.
  const band = input.blocks.find((b): b is Extract<DocPrintBlock, { kind: "band" }> => b.kind === "band");
  const company = input.blocks.find((b): b is Extract<DocPrintBlock, { kind: "company" }> => b.kind === "company");
  if (input.logo) {
    const ratio = Math.min(40 / input.logo.width, 18 / input.logo.height);
    doc.addImage(input.logo.dataUrl, input.logo.format, MARGIN, 12, input.logo.width * ratio, input.logo.height * ratio, undefined, "FAST");
  } else if (company?.lines[0]) {
    setFont("bold", 14);
    doc.text(pdfText(company.lines[0]), MARGIN, 12 + mm(14) * 0.85);
  }
  cursor = 33;
  if (input.banner) {
    doc.addImage(input.banner.dataUrl, input.banner.format, MARGIN, cursor, CONTENT_W, 45, undefined, "FAST");
    cursor += 45 + 3;
  }
  if (band) {
    doc.setFillColor(accent);
    doc.rect(MARGIN, cursor, CONTENT_W, 12, "F");
    let size = 16;
    setFont("bold", size);
    const text = pdfText(band.text);
    while (size > 10 && doc.getTextWidth(text) > CONTENT_W - 8) setFont("bold", --size);
    doc.text(text, PAGE_W / 2, cursor + 6, { align: "center", baseline: "middle" });
    cursor += 12 + 4;
  }
  if (company) {
    const pitch = 4;
    let leftY = cursor;
    company.lines.forEach((line, i) => {
      setFont(i === 0 ? "bold" : "normal", 9);
      doc.text(pdfText(line), MARGIN, leftY + mm(9) * 0.85);
      leftY += pitch;
    });
    const factX = MARGIN + 95;
    const factW = 85;
    let rightY = cursor;
    for (const [label, value] of company.facts) {
      const baseline = () => rightY + mm(9) * 0.85;
      setFont("bold", 9);
      const labelText = pdfText(`${label} : `);
      const labelW = doc.getTextWidth(labelText);
      doc.text(labelText, factX, baseline());
      setFont("normal", 9);
      let lines: string[];
      if (labelW > factW - 15) {
        rightY += pitch;
        lines = doc.splitTextToSize(pdfText(value), factW) as string[];
        lines.forEach((l) => { doc.text(l, factX, baseline()); rightY += pitch; });
      } else {
        const first = doc.splitTextToSize(pdfText(value), factW - labelW) as string[];
        doc.text(first[0] ?? "", factX + labelW, baseline());
        rightY += pitch;
        const rest = first.slice(1).join(" ");
        lines = rest ? (doc.splitTextToSize(rest, factW) as string[]) : [];
        lines.forEach((l) => { doc.text(l, factX, baseline()); rightY += pitch; });
      }
    }
    cursor = Math.max(leftY, rightY) + 5;
  }
  headsOn.add(doc.getCurrentPageInfo().pageNumber);
  cursor = drawHeads(cursor);

  // One table; the extras are drawn under their cell's content after autotable placed it.
  const table = (body: RowInput[], extras: Map<string, CellExtra>, opts?: { tableWidth?: number; marginLeft?: number; head?: RowInput[]; hairlines?: boolean; whole?: boolean }) => {
    autoTable(doc, {
      theme: "plain",
      startY: cursor,
      // The services and VAT tables start on a new page rather than break.
      pageBreak: opts?.whole ? "avoid" : "auto",
      margin: { top: TOP_Y + HEADS_H, bottom: MARGIN, left: opts?.marginLeft ?? MARGIN, right: MARGIN },
      tableWidth: opts?.tableWidth,
      columnStyles: opts?.tableWidth
        ? { 0: { cellWidth: opts.tableWidth - 20 }, 1: { cellWidth: 20, halign: "right" } }
        : { 0: { cellWidth: COL_TEXT_W }, 1: { cellWidth: COL_PRICE_W, halign: "right" } },
      rowPageBreak: "avoid",
      showHead: opts?.head ? "firstPage" : false,
      head: opts?.head,
      body,
      styles: { font: FONT, fontSize: 10, textColor: TEXT, cellPadding: { top: PAD_V, bottom: PAD_V, left: PAD, right: PAD }, overflow: "linebreak", valign: "top" },
      didDrawCell: (data: CellHookData) => {
        if (data.section !== "body") return;
        if (opts?.hairlines && data.row.index > 0) {
          doc.setDrawColor(RULE);
          doc.setLineWidth(0.2);
          doc.line(data.cell.x, data.cell.y, data.cell.x + data.cell.width, data.cell.y);
        }
        const extra = extras.get(`${data.row.index}:${data.column.index}`);
        if (!extra) return;
        const cell = data.cell;
        const main = cell.text.length * mm(cell.styles.fontSize) * LINE_FACTOR;
        const g = mm(extra.fontSize);
        let y = cell.y + cell.padding("top") + main + EXTRA_GAP + g * (2 - LINE_FACTOR);
        setFont(extra.fontStyle, extra.fontSize, extra.color);
        const x = extra.halign === "right" ? cell.x + cell.width - cell.padding("right") : cell.x + cell.padding("left");
        for (const line of extra.lines) {
          doc.text(line, x, y, { align: extra.halign });
          y += g * LINE_FACTOR;
        }
      },
      didDrawPage: () => { pageTop(); },
    });
    const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    pageTop();
    cursor = (last?.finalY ?? cursor) + 3;
  };

  // The price cell of a plat or services row: money with the unit under it, a note in small italics, or nothing.
  const priceCell = (price: string | undefined, unit: string | undefined, extras: Map<string, CellExtra>, rowIndex: number): CellDef => {
    if (!price) return { content: "" };
    if (!isMoney(price)) {
      return { content: pdfText(price), styles: { halign: "right", fontStyle: "italic", fontSize: 8, textColor: MUTED } };
    }
    const extra = unit ? extraOf(unit, COL_PRICE_W - 2 * PAD, 8, "normal", MUTED, "right") : undefined;
    if (extra) extras.set(`${rowIndex}:1`, extra);
    return { content: pdfText(price), styles: { halign: "right", cellPadding: padding(PAD, extra) } };
  };

  const sectionTable = (section: SectionBlock, rows: RowBlock[]) => {
    if (leftOnPage() < SECTION_MIN_LEFT) newPage();
    const body: RowInput[] = [];
    const extras = new Map<string, CellExtra>();
    const title = section.minimum ? `${section.title} · ${section.minimum}` : section.title;
    const intro = section.intro ? extraOf(section.intro, COL_TEXT_W - 2 * PAD, 9, "italic", TEXT, "left") : undefined;
    if (intro) extras.set("0:0", intro);
    const titleCell: CellDef = {
      content: pdfText(title),
      styles: { fillColor: accent, fontStyle: "bold", fontSize: 11, textColor: TEXT, minCellHeight: 8, cellPadding: padding(PAD, intro) },
    };
    let priceCellDef: CellDef;
    if (section.price) {
      const unit = section.unit ? extraOf(section.unit, COL_PRICE_W - 2 * PAD, 8, "normal", TEXT, "right") : undefined;
      if (unit) extras.set("0:1", unit);
      priceCellDef = { content: pdfText(section.price), styles: { fillColor: accent, fontStyle: "bold", fontSize: 11, textColor: TEXT, halign: "right", minCellHeight: 8, cellPadding: padding(PAD, unit) } };
    } else {
      priceCellDef = { content: pdfText(section.unit ?? ""), styles: { fillColor: accent, fontStyle: "normal", fontSize: 8, textColor: TEXT, halign: "right", minCellHeight: 8 } };
    }
    body.push([titleCell, priceCellDef]);
    for (const row of rows) {
      const index = body.length;
      if (row.style === "sous_titre") {
        body.push([{ content: pdfText(row.text), colSpan: 2, styles: { fillColor: subFill, fontStyle: "bold", fontSize: 10, minCellHeight: 6.5 } }]);
      } else if (row.style === "exemple") {
        body.push([{ content: pdfText(row.text), colSpan: 2, styles: { fontStyle: "italic", fontSize: 9, textColor: MUTED, cellPadding: { top: PAD_V, bottom: PAD_V, left: EXAMPLE_PAD, right: PAD } } }]);
      } else if (row.style === "note") {
        body.push([{ content: pdfText(row.text), colSpan: 2, styles: { fontStyle: "bolditalic", fontSize: 10 } }]);
      } else {
        const left = row.indent ? PAD + INDENT : PAD;
        body.push([
          { content: pdfText(row.text), styles: { cellPadding: { top: PAD_V, bottom: PAD_V, left, right: PAD } } },
          priceCell(row.price, row.unit, extras, index),
        ]);
      }
    }
    table(body, extras);
  };

  const servicesTable = (services: ServicesBlock) => {
    if (leftOnPage() < TAIL_MIN_LEFT) newPage();
    const body: RowInput[] = [];
    const extras = new Map<string, CellExtra>();
    const intro = services.intro ? extraOf(services.intro, COL_TEXT_W - 2 * PAD, 9, "italic", TEXT, "left") : undefined;
    if (intro) extras.set("0:0", intro);
    body.push([
      { content: pdfText(services.title), styles: { fillColor: subFill, fontStyle: "bold", fontSize: 10, cellPadding: padding(PAD, intro) } },
      { content: "", styles: { fillColor: subFill } },
    ]);
    for (const row of services.rows) {
      const index = body.length;
      body.push([{ content: pdfText(row.text) }, priceCell(row.price, row.unit, extras, index)]);
    }
    table(body, extras, { whole: true });
  };

  const conditions = (text: string) => {
    cursor += 3;
    if (leftOnPage() < TAIL_MIN_LEFT) newPage();
    const g = mm(9);
    const lines = wrap(text, 170, 9, "italic");
    setFont("italic", 9, MUTED);
    let y = cursor + g * 0.85;
    for (const line of lines) {
      doc.text(line, PAGE_W / 2, y, { align: "center" });
      y += g * LINE_FACTOR;
    }
    cursor = y - g * 0.85;
  };

  const vatTable = (rows: [string, string][]) => {
    cursor += 4;
    const body: RowInput[] = rows.map(([label, rate]) => [{ content: pdfText(label), styles: { fontSize: 9 } }, { content: pdfText(rate), styles: { fontSize: 9, halign: "right" } }]);
    const head: RowInput[] = [[{ content: "TVA", colSpan: 2, styles: { fillColor: accent, fontStyle: "bold", fontSize: 9, textColor: TEXT, cellPadding: { top: PAD_V, bottom: PAD_V, left: PAD, right: PAD } } }]];
    table(body, new Map(), { tableWidth: 70, marginLeft: 70, head, hairlines: true, whole: true });
  };

  // Body: each section with its rows, then the services, the conditions and the VAT table.
  let current: { section: SectionBlock; rows: RowBlock[] } | undefined;
  const flush = () => {
    if (current) sectionTable(current.section, current.rows);
    current = undefined;
  };
  for (const block of input.blocks) {
    if (block.kind === "section") {
      flush();
      current = { section: block, rows: [] };
    } else if (block.kind === "row") {
      if (current) current.rows.push(block);
    } else if (block.kind === "services") {
      flush();
      servicesTable(block);
    } else if (block.kind === "conditions") {
      flush();
      conditions(block.text);
    } else if (block.kind === "vat") {
      flush();
      if (block.rows.length) vatTable(block.rows);
    }
  }
  flush();

  // Footer on every page, once the page count is known.
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    setFont("normal", 8, MUTED);
    if (input.footer.trim()) doc.text(pdfText(input.footer.trim()), PAGE_W / 2, FOOTER_Y, { align: "center" });
    doc.text(`page ${p} / ${total}`, RIGHT_X, FOOTER_Y, { align: "right" });
  }
  return doc;
}
