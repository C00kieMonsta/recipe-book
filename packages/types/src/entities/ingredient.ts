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

export interface Ingredient {
  ingredientId: string;
  name: string;
  nameLower: string;
  price: number;
  unit: UnitPrice;
  supplier: string;
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IngredientKey {
  ingredientId: string;
}
