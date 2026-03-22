export const TABLE_NAMES = {
  INGREDIENTS: "ingredients",
  RECIPES: "recipes",
} as const;

export type TableName = (typeof TABLE_NAMES)[keyof typeof TABLE_NAMES];
