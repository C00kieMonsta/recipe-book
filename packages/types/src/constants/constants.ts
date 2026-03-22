export const TABLE_NAMES = {
  INGREDIENTS: "ingredients",
  RECIPES: "recipes",
  SETTINGS: "settings",
  EVENTS: "events",
} as const;

export type TableName = (typeof TABLE_NAMES)[keyof typeof TABLE_NAMES];
