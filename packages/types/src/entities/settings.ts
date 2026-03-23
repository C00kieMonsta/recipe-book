export interface SettingsSupplier {
  name: string;
  address?: string;
  phone?: string;
}

export interface AppSettings {
  settingsId: "global";
  recipeCategories: string[];
  suppliers: SettingsSupplier[];
  updatedAt: string;
}

export const DEFAULT_RECIPE_CATEGORIES = [
  "Buffet",
  "Walking dinner",
  "Lunch",
  "Menu semaine",
];

export const DEFAULT_SUPPLIERS: SettingsSupplier[] = [
  { name: "Barn" },
  { name: "Vds" },
  { name: "Delhaize" },
  { name: "Terroirist" },
  { name: "Notenschop" },
  { name: "Diamant rouge" },
];
