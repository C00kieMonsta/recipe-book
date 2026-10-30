export interface GroceryListItem {
  ingredientId: string;
  name: string;
  totalQty: number;
  unit: string;
  supplier: string;
  pricePerUnit: number;
  priceUnit: string;
  checked: boolean;
  haveQty?: number;
  /** Missing values on older lists remain unclassified until the user chooses a rayon. */
  storage?: "fresh" | "dry" | "unclassified";
}

export interface GroceryList {
  listId: string;
  title: string;
  items: GroceryListItem[];
  eventIds?: string[];
  range?: { from: string; to: string };
  createdAt: string;
  updatedAt: string;
}
