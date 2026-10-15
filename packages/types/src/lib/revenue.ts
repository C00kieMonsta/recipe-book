import type { AppEvent, EventRevenueLine, RevenueLineKind } from "../entities/event";
import { REVENUE_LINE_DEFAULT_VAT, REVENUE_LINE_KINDS, REVENUE_LINE_KIND_LABELS } from "../entities/event";
import { sumMoney } from "./money";

// Lower case, accents stripped, trimmed.
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function isKind(value: string | undefined): value is RevenueLineKind {
  return value !== undefined && (REVENUE_LINE_KINDS as readonly string[]).includes(value);
}

// The stored kind, else from the accent-folded lower-cased label: starts with "service" → service; starts with "livraison" → livraison;
// contains "vaisselle" or starts with "location" → location_vaisselle; contains "boisson" → boissons; else autre.
export function revenueLineKindOf(line: Pick<EventRevenueLine, "label" | "kind">): RevenueLineKind {
  if (isKind(line.kind)) return line.kind;
  const label = fold(line.label ?? "");
  if (label.startsWith("service")) return "service";
  if (label.startsWith("livraison")) return "livraison";
  if (label.includes("vaisselle") || label.startsWith("location")) return "location_vaisselle";
  if (label.includes("boisson")) return "boissons";
  return "autre";
}

export function revenueByKind(e: Pick<AppEvent, "revenueLines">): Record<RevenueLineKind, number> {
  const amounts: Record<RevenueLineKind, number[]> = { service: [], livraison: [], location_vaisselle: [], boissons: [], autre: [] };
  for (const line of e.revenueLines ?? []) amounts[revenueLineKindOf(line)].push(line.amount || 0);
  return {
    service: sumMoney(amounts.service),
    livraison: sumMoney(amounts.livraison),
    location_vaisselle: sumMoney(amounts.location_vaisselle),
    boissons: sumMoney(amounts.boissons),
    autre: sumMoney(amounts.autre),
  };
}

export function newRevenueLine(kind: RevenueLineKind): EventRevenueLine {
  return { kind, label: REVENUE_LINE_KIND_LABELS[kind], amount: 0, vatRate: REVENUE_LINE_DEFAULT_VAT };
}

const KIND_LABELS_FOLDED = new Set(REVENUE_LINE_KINDS.map((k) => fold(REVENUE_LINE_KIND_LABELS[k])));

// Changes the kind; the label is replaced by the kind label when it is empty or equals any kind label, otherwise kept.
export function withRevenueKind(line: EventRevenueLine, kind: RevenueLineKind): EventRevenueLine {
  const current = fold(line.label ?? "");
  const label = current === "" || KIND_LABELS_FOLDED.has(current) ? REVENUE_LINE_KIND_LABELS[kind] : line.label;
  return { ...line, kind, label };
}

const eur0 = new Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// « Service 300 € · Livraison 150 € », kinds in REVENUE_LINE_KINDS order, zero kinds dropped.
export function revenueByKindLabel(e: Pick<AppEvent, "revenueLines">): string {
  const byKind = revenueByKind(e);
  return REVENUE_LINE_KINDS.filter((k) => byKind[k] !== 0)
    .map((k) => `${REVENUE_LINE_KIND_LABELS[k]} ${eur0.format(byKind[k])}`)
    .join(" · ");
}
