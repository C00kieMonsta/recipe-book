import type { EventExtraCost } from "./event";
import type { VatRate } from "./ledger";

export interface TemplateLine {
  recipeId: string;
  portions: number;
  course?: string;
  notes?: string;
}

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ClientTemplate {
  templateId: string;
  name: string;
  weekday: Weekday;
  guestCount: number;
  sellingPricePerGuest: number;
  prestationType?: string;
  vatRate?: VatRate;
  recipes: TemplateLine[];
  extraCosts: EventExtraCost[];
  notes?: string;
  // Copied onto the event by instantiate.
  assignedTo?: string[];
}

export type ClientKind = "entreprise" | "particulier";
export type ClientInvoicing = "par_evenement" | "mensuelle";

export interface Client {
  clientId: string;
  name: string;
  nameLower: string;
  kind?: ClientKind;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  vatNumber?: string;
  defaultPrestationType?: string;
  defaultVatRate?: VatRate;
  defaultPricePerGuest?: number;
  defaultGuestCount?: number;
  invoicing?: ClientInvoicing;
  templates: ClientTemplate[];
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientKey {
  clientId: string;
}
