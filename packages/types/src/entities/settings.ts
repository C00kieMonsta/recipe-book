export interface AppSettings {
  settingsId: "global";
  recipeCategories: string[];
  updatedAt: string;
}

export const DEFAULT_RECIPE_CATEGORIES = [
  "Buffet",
  "Walking dinner",
  "Lunch",
  "Menu semaine",
];
