import type { CostSnapshotRequest } from "../dto/events";
import type { AppEvent, EventStaffEntry } from "../entities/event";
import type { Person } from "../entities/settings";
import { buildCostSnapshot } from "./costing";
import { round2, sumMoney } from "./money";
import { sortPersonIds } from "./planning";

export interface StaffRate {
  hourly: number;
  km: number;
  // True when the entry carries its own rate (copied at « Terminer »).
  frozen: boolean;
  // True when hours or km exist and no hourly rate comes from the entry or the person.
  missing: boolean;
}

export interface StaffCostRow {
  personId: string;
  // 0 when absent.
  hours: number;
  km: number;
  // round2(hours × hourly + km × km).
  amount: number;
  rate: StaffRate;
  // In assignedTo or on any line or task of the event.
  cuisine: boolean;
  // In serviceTeam.
  service: boolean;
}

export interface StaffCost {
  rows: StaffCostRow[];
  hours: number;
  km: number;
  amount: number;
  missingRate: string[];
}

function pushDistinct(out: string[], ids: string[] | undefined): void {
  for (const id of ids ?? []) if (!out.includes(id)) out.push(id);
}

// Ids in assignedTo plus every line.assignedTo and task.assignedTo, distinct, order of first appearance.
export function kitchenPeopleOf(e: Pick<AppEvent, "assignedTo" | "recipes" | "tasks">): string[] {
  const out: string[] = [];
  pushDistinct(out, e.assignedTo);
  for (const line of e.recipes ?? []) pushDistinct(out, line.assignedTo);
  for (const task of e.tasks ?? []) pushDistinct(out, task.assignedTo);
  return out;
}

// Union of kitchen, serviceTeam and staff personIds, in settings order then unknown ids.
export function staffPeopleOf(
  e: Pick<AppEvent, "assignedTo" | "serviceTeam" | "recipes" | "tasks" | "staff">,
  people: Person[],
): string[] {
  const ids = [...kitchenPeopleOf(e), ...(e.serviceTeam ?? []), ...(e.staff ?? []).map((s) => s.personId)];
  return sortPersonIds(ids, people);
}

export function staffEntryOf(e: Pick<AppEvent, "staff">, personId: string): EventStaffEntry | undefined {
  return (e.staff ?? []).find((s) => s.personId === personId);
}

// entry.hourlyRate ?? person.hourlyRate, same for km; frozen when the entry carries a rate.
export function staffRateOf(entry: EventStaffEntry | undefined, person: Person | undefined, hasWork: boolean): StaffRate {
  const hourly = entry?.hourlyRate ?? person?.hourlyRate;
  const km = entry?.kmRate ?? person?.kmRate;
  return {
    hourly: hourly ?? 0,
    km: km ?? 0,
    frozen: entry?.hourlyRate !== undefined || entry?.kmRate !== undefined,
    missing: hasWork && hourly === undefined,
  };
}

function hasWorkOf(entry: Pick<EventStaffEntry, "hours" | "km"> | undefined): boolean {
  return (entry?.hours ?? 0) > 0 || (entry?.km ?? 0) > 0;
}

export function staffAmountOf(hours: number, km: number, rate: Pick<StaffRate, "hourly" | "km">): number {
  return round2(hours * rate.hourly + km * rate.km);
}

// One row per person of staffPeopleOf, rows without hours and km included (amount 0) so the section can list the team.
export function staffCostOf(e: AppEvent, people: Person[]): StaffCost {
  const kitchen = kitchenPeopleOf(e);
  const service = e.serviceTeam ?? [];
  const rows: StaffCostRow[] = staffPeopleOf(e, people).map((personId) => {
    const entry = staffEntryOf(e, personId);
    const person = people.find((p) => p.personId === personId);
    const hours = entry?.hours ?? 0;
    const km = entry?.km ?? 0;
    const rate = staffRateOf(entry, person, hasWorkOf(entry));
    return {
      personId,
      hours,
      km,
      amount: staffAmountOf(hours, km, rate),
      rate,
      cuisine: kitchen.includes(personId),
      service: service.includes(personId),
    };
  });
  return {
    rows,
    hours: round2(rows.reduce((s, r) => s + r.hours, 0)),
    km: round2(rows.reduce((s, r) => s + r.km, 0)),
    amount: sumMoney(rows.map((r) => r.amount)),
    missingRate: rows.filter((r) => r.rate.missing).map((r) => r.personId),
  };
}

function withoutUndefined(entry: EventStaffEntry): EventStaffEntry {
  const out: EventStaffEntry = { personId: entry.personId };
  if (entry.hours !== undefined) out.hours = entry.hours;
  if (entry.km !== undefined) out.km = entry.km;
  if (entry.hourlyRate !== undefined) out.hourlyRate = entry.hourlyRate;
  if (entry.kmRate !== undefined) out.kmRate = entry.kmRate;
  return out;
}

// Adds or patches the entry of personId; an entry left with neither hours nor km is dropped.
export function upsertStaffEntry(
  staff: EventStaffEntry[] | undefined,
  personId: string,
  patch: Pick<Partial<EventStaffEntry>, "hours" | "km">,
): EventStaffEntry[] {
  const list = staff ?? [];
  const current = list.find((s) => s.personId === personId);
  const next = withoutUndefined({ ...current, personId, ...patch });
  const rest = list.filter((s) => s.personId !== personId);
  if (!hasWorkOf(next)) return rest;
  const at = list.findIndex((s) => s.personId === personId);
  if (at < 0) return [...rest, next];
  return [...rest.slice(0, at), next, ...rest.slice(at)];
}

export function removeStaffEntry(staff: EventStaffEntry[] | undefined, personId: string): EventStaffEntry[] {
  return (staff ?? []).filter((s) => s.personId !== personId);
}

// Copies the person's current rates onto every entry that has none; entries of unknown people are left as they are.
export function freezeStaffRates(staff: EventStaffEntry[] | undefined, people: Person[]): EventStaffEntry[] {
  return (staff ?? []).map((entry) => {
    const person = people.find((p) => p.personId === entry.personId);
    if (!person) return entry;
    const next = { ...entry };
    if (next.hourlyRate === undefined && person.hourlyRate !== undefined) next.hourlyRate = person.hourlyRate;
    if (next.kmRate === undefined && person.kmRate !== undefined) next.kmRate = person.kmRate;
    return next;
  });
}

// The one patch every « Terminer » sends: status, the cost snapshot and the frozen staff. staff is omitted when the event has none.
export function completionFields(
  e: AppEvent,
  people: Person[],
  recipeCostById: Map<string, number>,
  recipePortionsById: Map<string, number>,
): { status: "completed"; costSnapshot: CostSnapshotRequest; staff?: EventStaffEntry[] } {
  const out: { status: "completed"; costSnapshot: CostSnapshotRequest; staff?: EventStaffEntry[] } = {
    status: "completed",
    costSnapshot: buildCostSnapshot(e, recipeCostById, recipePortionsById),
  };
  if (e.staff?.length) out.staff = freezeStaffRates(e.staff, people);
  return out;
}
