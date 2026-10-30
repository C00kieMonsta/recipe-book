import type { VatRate } from "./ledger";

export type InvoicingMode = "app" | "externe";

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
  phone?: string;
  email?: string;
  website?: string;
  // Hex; the band colour of the PDF. DEFAULT_BRAND_ACCENT when absent.
  accent?: string;
}

// The salmon of her sheets, sampled from the title band. Editable in Paramètres › Société.
export const DEFAULT_BRAND_ACCENT = "#E8847A";

export type PaymentMode = "nowjobs" | "cash" | "facture";
export const PAYMENT_MODES: PaymentMode[] = ["nowjobs", "cash", "facture"];
export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = { nowjobs: "Nowjobs", cash: "Cash", facture: "Facture" };

export interface Person {
  // Slug of the name at creation, never changes.
  personId: string;
  name: string;
  // 1 to 3 characters, defaults to the first two letters upper case.
  initials?: string;
  // false hides the person from pickers and filters, keeps old assignments readable.
  active: boolean;
  // € per hour HTVA, what she pays; absent means no rate (the event shows « tarif à préciser »).
  hourlyRate?: number;
  // € per km, three decimals allowed (0,345).
  kmRate?: number;
  paymentMode?: PaymentMode;
}

export interface AppSettings {
  stockAutoConsume?: boolean;
  settingsId: "global";
  // Served equal to courses and ignored on write; goes away once the merge script has run everywhere.
  recipeCategories: string[];
  suppliers: SettingsSupplier[];
  updatedAt: string;
  // The one category list: classes recipes and groups menus. Stored key unchanged.
  courses?: string[];
  // Absent reads as "app"; "externe" means invoices are issued in another tool and the app stops proposing them.
  invoicing?: InvoicingMode;
  prestationTypes?: PrestationTypeSetting[];
  fixedCharges?: FixedCharge[];
  objectives?: Record<string, YearObjective>;
  yearActuals?: Record<string, YearActuals>;
  monthCloses?: Record<string, MonthClose>;
  ledgerStartYm?: string;
  company?: CompanySettings;
  ignoredDuplicateGroups?: string[];
  people?: Person[];
  // S3 keys of the brand images (brand/logo.png, brand/banner.jpg). Written only by the brand endpoints; never in a PATCH body.
  brandLogoKey?: string;
  brandBannerKey?: string;
}

// Kept only for recipe CSV imports written by the old app.
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

// Her six values, in her order.
export const DEFAULT_COURSES = ["Apéritif", "Entrée", "Plat", "Walking dinner", "Buffet", "Dessert"];
// Lists stored by earlier installs; upgradeCourses maps both onto DEFAULT_COURSES.
export const LEGACY_DEFAULT_COURSES = ["Apéritif", "Entrée", "Plat", "Dessert", "Autre"];
export const LEGACY_DEFAULT_COURSES_V2 = ["Apéritif", "Entrée", "Plat", "Dessert", "Mignardises", "Autre"];
// Old « Format » values that are not categories; Buffet and Walking dinner map to themselves.
export const LEGACY_TYPE_TO_CATEGORY: Record<string, string> = { Lunch: "Plat", "Menu semaine": "Plat", Zakouskis: "Apéritif", Mignardises: "Dessert" };
// Old category values merged into her six; matched case-insensitively, singular or plural.
export const LEGACY_CATEGORY_ALIASES: Record<string, string> = { zakouskis: "Apéritif", mignardises: "Dessert" };

function aliasOf(value: string): string | undefined {
  const k = value.trim().toLowerCase();
  const key = k.endsWith("s") ? k : `${k}s`;
  return Object.prototype.hasOwnProperty.call(LEGACY_CATEGORY_ALIASES, key) ? LEGACY_CATEGORY_ALIASES[key] : undefined;
}

// "Mignardise" → "Dessert", "ZAKOUSKIS" → "Apéritif", anything else as is.
export function aliasCategory(value: string): string {
  return aliasOf(value) ?? value;
}

export function isLegacyCategory(value: string | undefined): boolean {
  return value !== undefined && aliasOf(value) !== undefined;
}

export const DEFAULT_PRESTATION_TYPES: PrestationTypeSetting[] = [
  { key: "menu_a_emporter", label: "Menu à emporter", defaultVatRate: 6 },
  { key: "buffet_a_emporter", label: "Buffet à emporter", defaultVatRate: 6 },
  { key: "buffet_avec_service", label: "Buffet avec service", defaultVatRate: 12 },
  { key: "atelier", label: "Atelier", defaultVatRate: 21 },
  { key: "brunch", label: "Brunch", defaultVatRate: 12 },
  { key: "walking_cocktail", label: "Walking / cocktail", defaultVatRate: 12 },
  { key: "chef_a_domicile", label: "Chef à domicile", defaultVatRate: 12 },
];
