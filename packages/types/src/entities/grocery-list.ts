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
}

export interface GroceryList {
  listId: string;
  title: string;
  items: GroceryListItem[];
  createdAt: string;
  updatedAt: string;
}
