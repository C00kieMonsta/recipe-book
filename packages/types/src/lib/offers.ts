import type { CreateEventRequest } from "../dto/events";
import type { CreateOfferRequest } from "../dto/offers";
import type { AppEvent, EventExtraCost, EventRevenueLine, PricingMode } from "../entities/event";
import type { VatRate } from "../entities/ledger";
import type { Offer, OfferLine } from "../entities/offer";
import { calcLinesRawMaterial, extrasByKind, sumExtraCosts } from "./costing";
import { round2, sumMoney } from "./money";
import {
  foodRevenue,
  incompleteCount,
  pricePerGuestOf,
  revenueLinesTotal,
  revenueTvac,
  type PricedEvent,
  type RecipeLookup,
} from "./planning";

export interface QuoteInput {
  lines: OfferLine[];
  guests: number;
  extraCosts: EventExtraCost[];
  revenueLines: EventRevenueLine[];
  pricingMode: PricingMode;
  sellingPricePerGuest: number;
  sellingTotal?: number;
  vatRate?: VatRate;
}

export interface QuoteTotals {
  // recipeId to portions at this guest count.
  portionsByRecipe: Map<string, number>;
  rawMaterial: number;
  extrasCost: number;
  costTotal: number;
  costPerGuest: number;
  foodHtva: number;
  linesHtva: number;
  totalHtva: number;
  totalTvac: number;
  pricePerGuest: number;
  // rawMaterial plus the extra costs of kind matiere.
  foodCost: number;
  // foodHtva minus foodCost: the food margin, untouched by revenue lines and non-food extras.
  margin: number;
  // Percent of foodHtva, 0 when foodHtva is 0.
  marginPct: number;
  marginPerGuest: number;
  // totalHtva minus costTotal.
  resultHtva: number;
  // Lines whose recipe is known and has no ingredient.
  incompleteRecipes: number;
}

export interface QuoteLine {
  recipeId: string;
  portions: number;
  course?: string;
  notes?: string;
}

const DEFAULT_RAW_MATERIAL_PCT = 0.3;

function guestsOrOne(guests: number): number {
  return Number.isFinite(guests) && guests > 0 ? guests : 1;
}

// portions = max(1, ceil(portionsPerGuest × guests)); guests of 0 or less give 1 per line.
export function linesForGuests(lines: OfferLine[], guests: number): QuoteLine[] {
  const g = Number.isFinite(guests) && guests > 0 ? guests : 0;
  return lines.map((l) => {
    const portions = g > 0 ? Math.max(1, Math.ceil(l.portionsPerGuest * g - 1e-9)) : 1;
    const out: QuoteLine = { recipeId: l.recipeId, portions };
    if (l.course !== undefined) out.course = l.course;
    if (l.notes !== undefined) out.notes = l.notes;
    return out;
  });
}

export function quoteTotals(
  input: QuoteInput,
  recipeCostById: Map<string, number>,
  recipePortionsById: Map<string, number>,
  recipeById?: RecipeLookup,
): QuoteTotals {
  const guests = Number.isFinite(input.guests) && input.guests > 0 ? input.guests : 0;
  const lines = linesForGuests(input.lines, input.guests);
  const portionsByRecipe = new Map<string, number>();
  for (const l of lines) portionsByRecipe.set(l.recipeId, (portionsByRecipe.get(l.recipeId) ?? 0) + l.portions);

  const recipes = lines.map((l, i) => ({ lineId: `q-${i}`, recipeId: l.recipeId, portions: l.portions }));
  const rawMaterial = round2(calcLinesRawMaterial({ recipes }, recipeCostById, recipePortionsById));
  const extrasCost = round2(sumExtraCosts(input.extraCosts));
  const costTotal = sumMoney([rawMaterial, extrasCost]);
  const foodCost = sumMoney([rawMaterial, extrasByKind(input.extraCosts).matiere]);
  const costPerGuest = guests > 0 ? round2(costTotal / guests) : 0;

  const priced: PricedEvent & { vatRate?: VatRate } = {
    guestCount: guests,
    pricingMode: input.pricingMode,
    sellingPricePerGuest: input.sellingPricePerGuest,
    sellingTotal: input.sellingTotal,
    revenueLines: input.revenueLines,
    vatRate: input.vatRate,
  };
  const foodHtva = foodRevenue(priced);
  const linesHtva = revenueLinesTotal(priced);
  const totalHtva = sumMoney([foodHtva, linesHtva]);
  const totalTvac = revenueTvac(priced);
  const pricePerGuest = pricePerGuestOf(priced);
  const margin = sumMoney([foodHtva, -foodCost]);
  const marginPct = foodHtva === 0 ? 0 : round2((margin / foodHtva) * 100);
  const marginPerGuest = guests > 0 ? round2(margin / guests) : 0;
  const resultHtva = sumMoney([totalHtva, -costTotal]);
  const incompleteRecipes = recipeById ? incompleteCount(lines, recipeById) : 0;

  return {
    portionsByRecipe,
    rawMaterial,
    extrasCost,
    costTotal,
    costPerGuest,
    foodHtva,
    linesHtva,
    totalHtva,
    totalTvac,
    pricePerGuest,
    foodCost,
    margin,
    marginPct,
    marginPerGuest,
    resultHtva,
    incompleteRecipes,
  };
}

// round2(costPerGuest / pct); a pct outside (0, 1] or absent reads as 0.30.
export function suggestedPricePerGuest(costPerGuest: number, rawMaterialPct?: number): number {
  const pct =
    typeof rawMaterialPct === "number" && Number.isFinite(rawMaterialPct) && rawMaterialPct > 0 && rawMaterialPct <= 1
      ? rawMaterialPct
      : DEFAULT_RAW_MATERIAL_PCT;
  const cost = Number.isFinite(costPerGuest) ? costPerGuest : 0;
  return round2(cost / pct);
}

export function offerFromEvent(event: AppEvent, name: string): CreateOfferRequest {
  const guests = guestsOrOne(event.guestCount);
  const lines: OfferLine[] = (event.recipes ?? []).map((l) => {
    // The DTO refuses 0, so a tiny share keeps one cent of a portion.
    const line: OfferLine = { recipeId: l.recipeId, portionsPerGuest: Math.max(0.01, round2(l.portions / guests)) };
    if (l.course !== undefined) line.course = l.course;
    if (l.notes !== undefined) line.notes = l.notes;
    return line;
  });
  const pricingMode: PricingMode = event.pricingMode ?? "par_convive";
  const offer: CreateOfferRequest = {
    name,
    guestCountRef: guests,
    lines,
    extraCosts: event.extraCosts ?? [],
    revenueLines: event.revenueLines ?? [],
    pricingMode,
    sellingPricePerGuest: event.sellingPricePerGuest ?? 0,
  };
  if (pricingMode === "total") offer.sellingTotal = event.sellingTotal ?? 0;
  if (event.prestationType) offer.prestationType = event.prestationType;
  if (event.vatRate !== undefined) offer.vatRate = event.vatRate;
  if (event.notes !== undefined) offer.notes = event.notes;
  return offer;
}

export function eventFromOffer(
  offer: Offer,
  args: { name: string; date: string; guests: number; clientId?: string; notes?: string },
): CreateEventRequest {
  const guests = args.guests;
  const pricingMode: PricingMode = offer.pricingMode ?? "par_convive";
  const sellingPricePerGuest =
    pricingMode === "total"
      ? round2((offer.sellingTotal ?? 0) / guestsOrOne(guests))
      : (offer.sellingPricePerGuest ?? 0);
  const body: CreateEventRequest = {
    name: args.name,
    date: args.date,
    guestCount: guests,
    recipes: linesForGuests(offer.lines ?? [], guests),
    tasks: [],
    extraCosts: offer.extraCosts ?? [],
    revenueLines: offer.revenueLines ?? [],
    pricingMode,
    sellingPricePerGuest,
    status: "upcoming",
    offerId: offer.offerId,
  };
  if (pricingMode === "total") body.sellingTotal = offer.sellingTotal ?? 0;
  if (offer.prestationType) body.prestationType = offer.prestationType;
  if (offer.vatRate !== undefined) body.vatRate = offer.vatRate;
  if (args.clientId) body.clientId = args.clientId;
  const notes = args.notes ?? offer.notes;
  if (notes !== undefined) body.notes = notes;
  return body;
}

// Same recipeId adds portionsPerGuest and keeps the current course; new recipes are appended in order.
export function mergeOfferLines(current: OfferLine[], incoming: OfferLine[]): OfferLine[] {
  const out: OfferLine[] = current.map((l) => ({ ...l }));
  const byRecipe = new Map<string, OfferLine>();
  for (const l of out) if (!byRecipe.has(l.recipeId)) byRecipe.set(l.recipeId, l);
  for (const l of incoming) {
    const existing = byRecipe.get(l.recipeId);
    if (existing) {
      existing.portionsPerGuest = round2(existing.portionsPerGuest + l.portionsPerGuest);
    } else {
      const copy = { ...l };
      out.push(copy);
      byRecipe.set(l.recipeId, copy);
    }
  }
  return out;
}

// quoteTotals at guestCountRef, for the list columns.
export function offerSummary(
  offer: Offer,
  recipeCostById: Map<string, number>,
  recipePortionsById: Map<string, number>,
  recipeById?: RecipeLookup,
): Pick<QuoteTotals, "costPerGuest" | "pricePerGuest" | "marginPct" | "incompleteRecipes"> {
  const t = quoteTotals(
    {
      lines: offer.lines ?? [],
      guests: offer.guestCountRef,
      extraCosts: offer.extraCosts ?? [],
      revenueLines: offer.revenueLines ?? [],
      pricingMode: offer.pricingMode ?? "par_convive",
      sellingPricePerGuest: offer.sellingPricePerGuest,
      sellingTotal: offer.sellingTotal,
      vatRate: offer.vatRate,
    },
    recipeCostById,
    recipePortionsById,
    recipeById,
  );
  return {
    costPerGuest: t.costPerGuest,
    pricePerGuest: t.pricePerGuest,
    marginPct: t.marginPct,
    incompleteRecipes: t.incompleteRecipes,
  };
}
