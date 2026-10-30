import type { VatRate } from "./ledger";

export type PricingMode = "par_convive" | "total";

export const REVENUE_LINE_KINDS = ["service", "livraison", "location_vaisselle", "boissons", "autre"] as const;
export type RevenueLineKind = (typeof REVENUE_LINE_KINDS)[number];
export const REVENUE_LINE_KIND_LABELS: Record<RevenueLineKind, string> = {
  service: "Service",
  livraison: "Livraison",
  location_vaisselle: "Location vaisselle",
  boissons: "Boissons",
  autre: "Autre",
};
// Every kind defaults to 21 %; she changes the VAT pill on the row when needed.
export const REVENUE_LINE_DEFAULT_VAT: VatRate = 21;

// A billed line on top of the food price (service, delivery, other): revenue HTVA at its own VAT rate.
export interface EventRevenueLine {
  label: string;
  amount: number;
  vatRate: VatRate;
  // Absent on lines stored before this spec; revenueLineKindOf infers it from the label.
  kind?: RevenueLineKind;
}

// Hours and km of one person on the event, whatever the role; one entry per person.
export interface EventStaffEntry {
  personId: string;
  // Optional clock times, HH:MM. endTime may be 24:00 for midnight.
  startTime?: string;
  endTime?: string;
  hours?: number;
  km?: number;
  // Optional manual km reimbursement, replacing km × kmRate.
  kmAmount?: number;
  // Optional final amount override for rounded or otherwise adjusted payment.
  actualAmount?: number;
  // Copied from the person by completionFields when the event is terminated, so a later rate change leaves the figure.
  hourlyRate?: number;
  kmRate?: number;
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
  // Links a generated preparation task back to its recipe line and definition.
  recipeLineId?: string;
  recipeId?: string;
  preparationId?: string;
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
  // Dalia's own hours (« Mes heures »); still read by Au réel and the objectives.
  hoursSpent?: number;
  costSnapshot?: EventCostSnapshot;
  // personIds, the default for its lines and tasks (« En cuisine »).
  assignedTo?: string[];
  // personIds serving on the day (« Sur place »); never inherited by lines or tasks.
  serviceTeam?: string[];
  // Absent reads as []; written by the Heures et frais section and by completionFields.
  staff?: EventStaffEntry[];
  // YYYY-MM-DD, set by « Marquer comme facturé »; absent when not invoiced or when the invoice lives in the ledger only.
  invoicedAt?: string;
  // Free text, « N° Odoo », 40 chars.
  invoiceRef?: string;
}
