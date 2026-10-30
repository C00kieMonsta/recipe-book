import type { UnitQty } from "./recipe";

export type StockMovementKind =
  | "count"
  | "receipt"
  | "waste"
  | "adjustment"
  | "production";
export interface StockBalance {
  stockId: string;
  kind: "balance";
  ingredientId: string;
  quantity: number;
  unit: UnitQty;
  verified: boolean;
  lastCountAt?: string;
  minimum?: number;
  updatedAt: string;
  asOf?: string;
}
export interface StockMovement {
  stockId: string;
  kind: "movement";
  ingredientId: string;
  movementKind: StockMovementKind;
  quantity: number;
  delta: number;
  unit: UnitQty;
  occurredAt: string;
  createdAt: string;
  note?: string;
  sourceId?: string;
  entryId?: string;
  lineId?: string;
  eventId?: string;
  includedInCount?: boolean;
}
export interface StockOverview {
  balances: StockBalance[];
  movements: StockMovement[];
  autoConsume: boolean;
  receivedLines: string[];
}
