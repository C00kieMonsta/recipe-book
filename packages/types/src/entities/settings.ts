import type { VatRate } from "./ledger";

export interface SettingsSupplier {
  name: string;
  address?: string;
  phone?: string;
}

export interface PrestationTypeSetting {
  key: string;
  label: string;
  defaultVatRate: VatRate;
}

export type FixedChargeCategory =
  | "social"
  | "salaire"
  | "assurance"
  | "abonnement"
  | "frais"
  | "remboursement"
  | "autre";

export interface FixedCharge {
  chargeId: string;
  label: string;
  category: FixedChargeCategory;
  monthlyAmount: number;
  monthlyAmountSolo?: number;
  inResult?: boolean;
  from?: string;
  to?: string;
  note?: string;
}

export interface YearObjectiveByPrestation {
  type: string;
  amount: number;
  eventsNeeded?: number;
  guestsPerEvent?: number;
}

export interface YearObjective {
  annualRevenue: number;
  monthsActive: number;
  monthlyOverrides?: Record<string, number>;
  byPrestation?: YearObjectiveByPrestation[];
  hoursAvailablePerMonth?: number;
  hoursAvailableOverrides?: Record<string, number>;
  rawMaterialPct?: number;
  corporateTaxRate?: number;
  smeReducedRate?: boolean;
  corporateTaxActual?: number;
  extrasBudget?: number;
  treasuryMonths?: number;
  treasurySavingPerMonth?: number;
  investments?: { label: string; amount: number }[];
}

export interface YearActuals {
  monthly?: Record<string, number>;
  byPrestation?: Record<string, number>;
  byPeriod?: { from: string; to: string; amount: number }[];
  note?: string;
}

export type MpSource = "calcule" | "achats" | "saisi";

export interface MonthClose {
  mpSource: MpSource;
  rawMaterial?: number;
  lockedAt?: string;
  unlockedAt?: string;
  note?: string;
}

export interface CompanySettings {
  name: string;
  vatNumber: string;
  address: string;
  constitutedOn?: string;
}

export interface Person {
  // Slug of the name at creation, never changes.
  personId: string;
  name: string;
  // 1 to 3 characters, defaults to the first two letters upper case.
  initials?: string;
  // false hides the person from pickers and filters, keeps old assignments readable.
  active: boolean;
}

export interface AppSettings {
  settingsId: "global";
  recipeCategories: string[];
  suppliers: SettingsSupplier[];
  updatedAt: string;
  courses?: string[];
  prestationTypes?: PrestationTypeSetting[];
  fixedCharges?: FixedCharge[];
  objectives?: Record<string, YearObjective>;
  yearActuals?: Record<string, YearActuals>;
  monthCloses?: Record<string, MonthClose>;
  ledgerStartYm?: string;
  company?: CompanySettings;
  ignoredDuplicateGroups?: string[];
  people?: Person[];
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

export const DEFAULT_COURSES = ["Apéritif", "Entrée", "Plat", "Dessert", "Autre"];

export const DEFAULT_PRESTATION_TYPES: PrestationTypeSetting[] = [
  { key: "menu_a_emporter", label: "Menu à emporter", defaultVatRate: 6 },
  { key: "buffet_a_emporter", label: "Buffet à emporter", defaultVatRate: 6 },
  { key: "buffet_avec_service", label: "Buffet avec service", defaultVatRate: 12 },
  { key: "atelier", label: "Atelier", defaultVatRate: 21 },
  { key: "brunch", label: "Brunch", defaultVatRate: 12 },
  { key: "walking_cocktail", label: "Walking / cocktail", defaultVatRate: 12 },
  { key: "chef_a_domicile", label: "Chef à domicile", defaultVatRate: 12 },
];
