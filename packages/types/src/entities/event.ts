import type { VatRate } from "./ledger";

export type PricingMode = "par_convive" | "total";

// A billed line on top of the food price (service, delivery, other): revenue HTVA at its own VAT rate.
export interface EventRevenueLine {
  label: string;
  amount: number;
  vatRate: VatRate;
}

export interface EventAttachment {
  attachmentId: string;
  // event-files/{eventId}/{attachmentId}{ext}
  key: string;
  name: string;
  contentType: string;
  size: number;
  addedAt: string;
}

export type PrepStatus = "todo" | "doing" | "done";

export interface EventRecipeLine {
  // Filled by EventsService on every read and write.
  lineId: string;
  recipeId: string;
  portions: number;
  course?: string;
  notes?: string;
  prepStatus?: PrepStatus;
  // YYYY-MM-DD, the day the line is prepared. Absent = the event day. Never stored equal to the event day.
  prepDate?: string;
  // personIds; absent or [] inherits the event.
  assignedTo?: string[];
}

export interface EventTask {
  // Filled by EventsService on every write.
  taskId: string;
  label: string;
  // YYYY-MM-DD, the day the task is done.
  date: string;
  prepStatus?: PrepStatus;
  notes?: string;
  // personIds; absent or [] inherits the event.
  assignedTo?: string[];
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
  // Absent on items written before this spec; the service returns [] in that case.
  tasks?: EventTask[];
  extraCosts: EventExtraCost[];
  // Absent reads as "par_convive".
  pricingMode?: PricingMode;
  // Food price HTVA for the whole event, stored only in total mode.
  sellingTotal?: number;
  // In total mode the service derives this as round2(sellingTotal / guestCount) on every write; readers that multiply by guestCount must call foodRevenue instead.
  sellingPricePerGuest: number;
  revenueLines?: EventRevenueLine[];
  deliveryAddress?: string;
  // HH:MM, 24 h.
  deliveryTime?: string;
  // Free text: name, address, VAT number, one per line.
  billingDetails?: string;
  // Server-owned; never accepted from a create or update body.
  attachments?: EventAttachment[];
  // The offer the event was created from, like templateId.
  offerId?: string;
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
  // personIds, the default for its lines.
  assignedTo?: string[];
}
