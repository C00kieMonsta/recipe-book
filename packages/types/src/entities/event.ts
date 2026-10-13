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
  // personIds, the default for its lines.
  assignedTo?: string[];
}
