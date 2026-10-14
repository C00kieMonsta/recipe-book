import type { EventExtraCost, EventRevenueLine, PricingMode } from "./event";
import type { VatRate } from "./ledger";

export interface OfferLine {
  recipeId: string;
  // Portions of this recipe per guest: 0,25 steps in the UI, any positive number in storage.
  portionsPerGuest: number;
  course?: string;
  notes?: string;
}

export interface Offer {
  offerId: string;
  name: string;
  nameLower: string;
  prestationType?: string;
  vatRate?: VatRate;
  // The guest count the offer page costs and previews at.
  guestCountRef: number;
  lines: OfferLine[];
  extraCosts: EventExtraCost[];
  revenueLines: EventRevenueLine[];
  pricingMode: PricingMode;
  // Per guest HTVA; in total mode the service derives it from sellingTotal and guestCountRef.
  sellingPricePerGuest: number;
  sellingTotal?: number;
  notes?: string;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

// The settings-table item that holds the catalogue.
export interface OffersItem {
  settingsId: "offers";
  offers: Offer[];
  updatedAt: string;
}
