import type { VatRate } from "./ledger";

export type PrepStatus = "todo" | "doing" | "done";

export interface EventRecipeLine {
  // Filled by EventsService on every read and write.
  lineId: string;
  recipeId: string;
  portions: number;
  course?: string;
  notes?: string;
  prepStatus?: PrepStatus;
  prepDate?: string;
}

export type ExtraCostKind = "matiere" | "personnel" | "location" | "transport" | "autre";

export interface EventExtraCost {
  label: string;
  amount: number;
  kind?: ExtraCostKind;
}

export interface EventCostSnapshotLine {
  lineId: string;
  recipeId: string;
  portions: number;
  unitCost: number;
}

export interface EventCostSnapshot {
  rawMaterial: number;
  extrasTotal: number;
  lines: EventCostSnapshotLine[];
  takenAt: string;
}

export type EventStatus = "upcoming" | "completed";

export interface AppEvent {
  eventId: string;
  name: string;
  nameLower: string;
  date: string;
  guestCount: number;
  recipes: EventRecipeLine[];
  extraCosts: EventExtraCost[];
  sellingPricePerGuest: number;
  notes?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  actualCost?: number | null;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
  clientId?: string;
  templateId?: string;
  prestationType?: string;
  vatRate?: VatRate;
  hoursSpent?: number;
  costSnapshot?: EventCostSnapshot;
}
