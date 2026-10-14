import type { UnitQty } from "./recipe";

export const SUPPLIERS = [
  "Barn",
  "Vds",
  "Delhaize",
  "Terroirist",
  "Notenschop",
  "Diamant rouge",
] as const;

export type Supplier = (typeof SUPPLIERS)[number];

export const UNITS_PRICE = ["€/kg", "€/pièce", "€/l", "€/botte"] as const;
export type UnitPrice = (typeof UNITS_PRICE)[number];

// Maps the spellings the old app and CSV files use to the enum; an unknown unit is priced per piece, which is how the cost lib treats anything not per kg or per litre.
export function normalizePriceUnit(value: unknown): UnitPrice {
  if (typeof value !== "string") return "€/pièce";
  const n = value.trim().toLowerCase();
  if (["€/kg", "kg", "kilo", "kilogramme", "kilogram", "€/kilo", "€/kilogramme"].includes(n)) return "€/kg";
  if (["€/l", "l", "litre", "liter", "€/litre", "€/liter"].includes(n)) return "€/l";
  if (["€/botte", "botte"].includes(n)) return "€/botte";
  if (["€/pièce", "piece", "pièce", "piéce", "pcs", "pc", "€/piece", "€/pieces", "€/pièces", "€/piéce", "€/piéces", "€/pcs", "€/pc"].includes(n)) return "€/pièce";
  return "€/pièce";
}

// Accepts "4,20", "4.20", 4.2 or nothing; anything else becomes 0 so the cost libs never see NaN.
export function normalizePrice(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export interface Ingredient {
  ingredientId: string;
  name: string;
  nameLower: string;
  price: number;
  unit: UnitPrice;
  supplier: string;
  comment?: string;
  aliases?: string[];
  mergedFrom?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface IngredientKey {
  ingredientId: string;
}

export const PRICE_TO_QTY_UNIT: Record<UnitPrice, UnitQty> = {
  "€/kg": "g",
  "€/pièce": "pièce",
  "€/l": "ml",
  "€/botte": "botte",
};
