export interface EventRecipeLine {
  recipeId: string;
  portions: number;
}

export interface EventExtraCost {
  label: string;
  amount: number;
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
  actualCost?: number;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}
