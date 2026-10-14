import type { Ingredient } from "../entities/ingredient";
import type { Recipe } from "../entities/recipe";
import { calcRecipeCost } from "./costing";
import { fmtEur, round2, sumMoney } from "./money";

export interface QuoteGroupLineInput {
  recipeId: string;
  portionsPerGuest?: number;
}

export interface QuoteGroupInput {
  label: string;
  guests: number;
  lines: QuoteGroupLineInput[];
  // HTVA; absent means suggest() decides.
  pricePerGuest?: number;
}

export interface QuoteExtraInput {
  label: string;
  // HTVA.
  amount: number;
  vatRate: number;
}

// Named QuoteGroupsInput because lib/offers.ts already exports QuoteInput.
export interface QuoteGroupsInput {
  groups: QuoteGroupInput[];
  extras?: QuoteExtraInput[];
  foodVatRate: number;
  recipeById: Map<string, Recipe>;
  ingredientById: Map<string, Ingredient>;
  suggest: (costPerGuest: number) => number;
}

export type QuotePriceSource = "donné" | "suggéré";

export interface QuoteGroupLineResult {
  recipeId: string;
  name: string;
  portions: number;
  cost: number;
  missing?: true;
}

export interface QuoteGroupResult {
  label: string;
  guests: number;
  costPerGuest: number;
  cost: number;
  pricePerGuest: number;
  priceSource: QuotePriceSource;
  revenueHtva: number;
  marginHtva: number;
  marginPct: number;
  lines: QuoteGroupLineResult[];
}

export interface QuoteExtraResult {
  label: string;
  amount: number;
  vatRate: number;
  vat: number;
}

export interface QuoteGroupsTotals {
  guests: number;
  cost: number;
  foodHtva: number;
  extrasHtva: number;
  htva: number;
  vatByRate: Record<string, number>;
  tvac: number;
  marginHtva: number;
  marginPct: number;
}

export interface QuoteResult {
  groups: QuoteGroupResult[];
  extras: QuoteExtraResult[];
  totals: QuoteGroupsTotals;
  notes: string[];
}

export const DEFAULT_FOOD_VAT_RATE = 12;

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : round2((part / whole) * 100);
}

function quoteGroup(group: QuoteGroupInput, input: QuoteGroupsInput, notes: string[]): QuoteGroupResult {
  const guests = group.guests;
  if (!Number.isFinite(guests) || guests <= 0) {
    throw new Error(`Le nombre de convives du groupe « ${group.label} » doit être supérieur à zéro.`);
  }
  const lines: QuoteGroupLineResult[] = group.lines.map((line) => {
    const perGuest = line.portionsPerGuest ?? 1;
    const portions = round2(guests * (Number.isFinite(perGuest) && perGuest > 0 ? perGuest : 1));
    const recipe = input.recipeById.get(line.recipeId);
    if (!recipe) {
      notes.push(`Recette inconnue : « ${line.recipeId} », comptée à 0,00 €.`);
      return { recipeId: line.recipeId, name: line.recipeId, portions, cost: 0, missing: true };
    }
    const perPortion = calcRecipeCost(recipe, input.ingredientById) / (recipe.portions || 1);
    return { recipeId: recipe.recipeId, name: recipe.name, portions, cost: round2(perPortion * portions) };
  });
  const cost = sumMoney(lines.map((l) => l.cost));
  const costPerGuest = round2(cost / guests);
  const given = typeof group.pricePerGuest === "number" && Number.isFinite(group.pricePerGuest);
  const pricePerGuest = given ? round2(group.pricePerGuest as number) : round2(input.suggest(costPerGuest));
  if (!given) {
    notes.push(`Prix suggéré pour « ${group.label} » : ${fmtEur(pricePerGuest)} HTVA par convive.`);
  }
  const revenueHtva = round2(pricePerGuest * guests);
  const marginHtva = sumMoney([revenueHtva, -cost]);
  return {
    label: group.label,
    guests,
    costPerGuest,
    cost,
    pricePerGuest,
    priceSource: given ? "donné" : "suggéré",
    revenueHtva,
    marginHtva,
    marginPct: pct(marginHtva, revenueHtva),
    lines,
  };
}

// Food VAT applies to the summed food revenue, extras carry their own rate.
export function quoteGroups(input: QuoteGroupsInput): QuoteResult {
  const notes: string[] = [];
  const groups = input.groups.map((g) => quoteGroup(g, input, notes));
  const foodVatRate = Number.isFinite(input.foodVatRate) ? input.foodVatRate : DEFAULT_FOOD_VAT_RATE;
  const extras: QuoteExtraResult[] = (input.extras ?? []).map((e) => {
    const amount = round2(Number.isFinite(e.amount) ? e.amount : 0);
    const vatRate = Number.isFinite(e.vatRate) ? e.vatRate : 0;
    return { label: e.label, amount, vatRate, vat: round2((amount * vatRate) / 100) };
  });

  const guests = groups.reduce((s, g) => s + g.guests, 0);
  const cost = sumMoney(groups.map((g) => g.cost));
  const foodHtva = sumMoney(groups.map((g) => g.revenueHtva));
  const extrasHtva = sumMoney(extras.map((e) => e.amount));
  const htva = sumMoney([foodHtva, extrasHtva]);

  const vatByRate: Record<string, number> = {};
  const addVat = (rate: number, vat: number) => {
    const key = String(rate);
    vatByRate[key] = sumMoney([vatByRate[key] ?? 0, vat]);
  };
  addVat(foodVatRate, round2((foodHtva * foodVatRate) / 100));
  for (const e of extras) addVat(e.vatRate, e.vat);

  const vatTotal = sumMoney(Object.values(vatByRate));
  const tvac = sumMoney([htva, vatTotal]);
  const marginHtva = sumMoney([htva, -cost]);

  return {
    groups,
    extras,
    totals: { guests, cost, foodHtva, extrasHtva, htva, vatByRate, tvac, marginHtva, marginPct: pct(marginHtva, htva) },
    notes,
  };
}
