import type { AppEvent, EventRecipeLine, EventTask } from "../entities/event";
import type { Person } from "../entities/settings";
import { buildCostSnapshot } from "./costing";
import {
  completionFields,
  freezeStaffRates,
  hoursBetween,
  normalizeStaffTime,
  kitchenPeopleOf,
  removeStaffEntry,
  staffCostOf,
  staffHoursOf,
  staffEntryOf,
  staffPeopleOf,
  staffRateOf,
  upsertStaffEntry,
} from "./staff";

let seq = 0;

function line(extra: Partial<EventRecipeLine> = {}): EventRecipeLine {
  return { lineId: `l${++seq}`, recipeId: "r", portions: 10, ...extra };
}

function task(extra: Partial<EventTask> = {}): EventTask {
  return { taskId: `t${++seq}`, label: "Cuire", date: "2026-10-16", ...extra };
}

function event(partial: Partial<AppEvent> = {}): AppEvent {
  return {
    eventId: "e1",
    name: "Mariage Dupont",
    nameLower: "mariage dupont",
    date: "2026-10-17",
    guestCount: 60,
    recipes: [line()],
    extraCosts: [],
    sellingPricePerGuest: 25,
    status: "upcoming",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

const people: Person[] = [
  { personId: "amelie", name: "Amélie", active: true, hourlyRate: 20, kmRate: 0.4, paymentMode: "nowjobs" },
  { personId: "kristoff", name: "Kristoff", active: true, hourlyRate: 18, kmRate: 0.3, paymentMode: "cash" },
  { personId: "noemie", name: "Noémie", active: true },
];

describe("kitchenPeopleOf", () => {
  it("unions event, line and task ids in order of first appearance without duplicates", () => {
    const e = event({
      assignedTo: ["kristoff"],
      recipes: [line({ assignedTo: ["amelie", "kristoff"] }), line()],
      tasks: [task({ assignedTo: ["noemie", "amelie"] })],
    });
    expect(kitchenPeopleOf(e)).toEqual(["kristoff", "amelie", "noemie"]);
    expect(kitchenPeopleOf(event())).toEqual([]);
    expect(kitchenPeopleOf({ recipes: [line({ assignedTo: ["noemie"] })] })).toEqual(["noemie"]);
  });
});

describe("staffPeopleOf and staffEntryOf", () => {
  it("puts settings order first and an unknown id last", () => {
    const e = event({
      assignedTo: ["kristoff"],
      serviceTeam: ["zed", "noemie"],
      staff: [{ personId: "amelie", hours: 2 }],
    });
    expect(staffPeopleOf(e, people)).toEqual(["amelie", "kristoff", "noemie", "zed"]);
    expect(staffEntryOf(e, "amelie")).toEqual({ personId: "amelie", hours: 2 });
    expect(staffEntryOf(e, "kristoff")).toBeUndefined();
    expect(staffPeopleOf(event(), people)).toEqual([]);
  });
});

describe("staffRateOf", () => {
  it("reads the entry rate first, then the person, and flags a missing hourly rate only with work", () => {
    expect(staffRateOf(undefined, people[1], true)).toEqual({ hourly: 18, km: 0.3, frozen: false, missing: false });
    expect(staffRateOf({ personId: "kristoff", hourlyRate: 20 }, people[1], true)).toEqual({ hourly: 20, km: 0.3, frozen: true, missing: false });
    expect(staffRateOf(undefined, people[2], true)).toEqual({ hourly: 0, km: 0, frozen: false, missing: true });
    expect(staffRateOf(undefined, people[2], false).missing).toBe(false);
    expect(staffRateOf(undefined, undefined, true)).toEqual({ hourly: 0, km: 0, frozen: false, missing: true });
  });
});

describe("hoursBetween", () => {
  it("computes same-day, 24:00 and overnight ranges, and rejects incomplete or malformed ranges", () => {
    expect(hoursBetween("18:00", "24:00")).toBe(6);
    expect(hoursBetween("18:15", "23:45")).toBe(5.5);
    expect(hoursBetween("18:00", undefined)).toBeUndefined();
    expect(hoursBetween("22:00", "02:00")).toBe(4);
    expect(hoursBetween("18h", "24h")).toBe(6);
    expect(hoursBetween("18h30", "02h15")).toBe(7.75);
    expect(hoursBetween("25:00", "26:00")).toBeUndefined();
    expect(hoursBetween("18:61", "24:00")).toBeUndefined();
  });

  it("uses the time range as the authoritative hour count", () => {
    expect(staffHoursOf({ personId: "kristoff", hours: 2, startTime: "18:00", endTime: "24:00" })).toBe(6);
    expect(staffHoursOf({ personId: "kristoff", hours: 2, startTime: "18:00" })).toBe(2);
  });

  it("normalizes colloquial hours to canonical HH:MM and distinguishes invalid from empty", () => {
    expect(normalizeStaffTime("18h")).toBe("18:00");
    expect(normalizeStaffTime("18h30")).toBe("18:30");
    expect(normalizeStaffTime("24h", true)).toBe("24:00");
    expect(normalizeStaffTime("24h")).toBeNull();
    expect(normalizeStaffTime("")).toBeUndefined();
    expect(normalizeStaffTime("18:70")).toBeNull();
  });
});

describe("staffCostOf", () => {
  it("Kristoff at 18 €/h and 0,30 €/km, 6 h and 12 km gives 111,60", () => {
    const e = event({ assignedTo: ["kristoff"], staff: [{ personId: "kristoff", hours: 6, km: 12 }] });
    const cost = staffCostOf(e, people);
    expect(cost.rows).toHaveLength(1);
    expect(cost.rows[0]).toEqual({
      personId: "kristoff",
      hours: 6,
      km: 12,
      amount: 111.6,
      rate: { hourly: 18, km: 0.3, frozen: false, missing: false },
      cuisine: true,
      service: false,
    });
    expect(cost.hours).toBe(6);
    expect(cost.km).toBe(12);
    expect(cost.amount).toBe(111.6);
    expect(cost.missingRate).toEqual([]);
  });
  it("a person with hours and no rate gives amount 0, rate.missing and a missingRate entry", () => {
    const e = event({ serviceTeam: ["noemie"], staff: [{ personId: "noemie", hours: 5 }] });
    const cost = staffCostOf(e, people);
    expect(cost.rows[0].amount).toBe(0);
    expect(cost.rows[0].rate.missing).toBe(true);
    expect(cost.rows[0].service).toBe(true);
    expect(cost.rows[0].cuisine).toBe(false);
    expect(cost.missingRate).toEqual(["noemie"]);
    expect(cost.hours).toBe(5);
  });
  it("a person in the team without hours gives a row with amount 0 and missing false", () => {
    const e = event({ assignedTo: ["noemie"], serviceTeam: ["noemie"] });
    const cost = staffCostOf(e, people);
    expect(cost.rows).toEqual([
      { personId: "noemie", hours: 0, km: 0, amount: 0, rate: { hourly: 0, km: 0, frozen: false, missing: false }, cuisine: true, service: true },
    ]);
    expect(cost.missingRate).toEqual([]);
  });
  it("a frozen hourlyRate of 20 on the entry wins over the person's 18", () => {
    const e = event({ staff: [{ personId: "kristoff", hours: 6, hourlyRate: 20 }] });
    const cost = staffCostOf(e, people);
    expect(cost.rows[0].amount).toBe(120);
    expect(cost.rows[0].rate).toEqual({ hourly: 20, km: 0.3, frozen: true, missing: false });
    expect(cost.rows[0].cuisine).toBe(false);
  });
  it("uses manual km reimbursement or the adjusted final payment when present", () => {
    const e = event({ staff: [
      { personId: "kristoff", hours: 6, km: 12, kmAmount: 8 },
      { personId: "amelie", hours: 2, actualAmount: 55 },
    ] });
    const cost = staffCostOf(e, people);
    expect(cost.rows.map((row) => row.amount)).toEqual([55, 116]);
    expect(cost.amount).toBe(171);
    expect(cost.missingRate).toEqual([]);
  });
  it("sums several people in settings order", () => {
    const e = event({
      assignedTo: ["kristoff"],
      serviceTeam: ["amelie"],
      staff: [
        { personId: "kristoff", hours: 6, km: 12 },
        { personId: "amelie", hours: 2.5, km: 10 },
      ],
    });
    const cost = staffCostOf(e, people);
    expect(cost.rows.map((r) => r.personId)).toEqual(["amelie", "kristoff"]);
    expect(cost.rows[0].amount).toBe(54);
    expect(cost.hours).toBe(8.5);
    expect(cost.km).toBe(22);
    expect(cost.amount).toBe(165.6);
  });
});

describe("upsertStaffEntry and removeStaffEntry", () => {
  it("creates, patches and drops an entry left empty", () => {
    const created = upsertStaffEntry(undefined, "kristoff", { hours: 6 });
    expect(created).toEqual([{ personId: "kristoff", hours: 6 }]);
    const patched = upsertStaffEntry(created, "kristoff", { km: 12 });
    expect(patched).toEqual([{ personId: "kristoff", hours: 6, km: 12 }]);
    const noHours = upsertStaffEntry(patched, "kristoff", { hours: undefined });
    expect(noHours).toEqual([{ personId: "kristoff", km: 12 }]);
    expect(upsertStaffEntry(noHours, "kristoff", { km: 0 })).toEqual([]);
    expect(upsertStaffEntry(undefined, "kristoff", { hours: 0 })).toEqual([]);
  });

  it("keeps a final payment override when km reimbursement changes and clears it only on explicit reset", () => {
    const original = [{ personId: "kristoff", hours: 6, km: 10, kmAmount: 8, actualAmount: 120 }];
    const changedHours = upsertStaffEntry(original, "kristoff", { hours: 7 });
    expect(changedHours[0]).toMatchObject({ hours: 7, actualAmount: 120 });
    const changedKmRateAmount = upsertStaffEntry(changedHours, "kristoff", { kmAmount: 10 });
    expect(changedKmRateAmount[0]).toMatchObject({ kmAmount: 10, actualAmount: 120 });
    const resetTotal = upsertStaffEntry(changedKmRateAmount, "kristoff", { hours: 6, actualAmount: undefined });
    expect(resetTotal[0]).toMatchObject({ kmAmount: 10 });
    expect(resetTotal[0].actualAmount).toBeUndefined();
    expect(staffCostOf(event({ staff: resetTotal }), people).rows[0].amount).toBe(118);
  });
  it("keeps the position of a patched entry and the frozen rate", () => {
    const staff = [
      { personId: "amelie", hours: 2 },
      { personId: "kristoff", hours: 6, hourlyRate: 20 },
      { personId: "noemie", km: 3 },
    ];
    expect(upsertStaffEntry(staff, "kristoff", { hours: 7 })).toEqual([
      { personId: "amelie", hours: 2 },
      { personId: "kristoff", hours: 7, hourlyRate: 20 },
      { personId: "noemie", km: 3 },
    ]);
    expect(upsertStaffEntry(staff, "zed", { hours: 1 })).toHaveLength(4);
    expect(staff).toHaveLength(3);
  });
  it("removeStaffEntry drops the person and tolerates an absent list", () => {
    expect(removeStaffEntry([{ personId: "amelie", hours: 2 }, { personId: "kristoff", hours: 6 }], "amelie")).toEqual([
      { personId: "kristoff", hours: 6 },
    ]);
    expect(removeStaffEntry(undefined, "amelie")).toEqual([]);
  });
});

describe("freezeStaffRates", () => {
  it("fills absent rates and leaves present ones", () => {
    const frozen = freezeStaffRates(
      [
        { personId: "kristoff", hours: 6 },
        { personId: "amelie", hours: 2, hourlyRate: 25 },
        { personId: "noemie", hours: 1 },
        { personId: "zed", km: 4 },
      ],
      people,
    );
    expect(frozen).toEqual([
      { personId: "kristoff", hours: 6, hourlyRate: 18, kmRate: 0.3 },
      { personId: "amelie", hours: 2, hourlyRate: 25, kmRate: 0.4 },
      { personId: "noemie", hours: 1 },
      { personId: "zed", km: 4 },
    ]);
    expect(freezeStaffRates(undefined, people)).toEqual([]);
  });
});

describe("completionFields", () => {
  const recipeCostById = new Map([["r", 50]]);
  const recipePortionsById = new Map([["r", 10]]);
  it("returns status completed and the snapshot of buildCostSnapshot, without staff when the event has none", () => {
    const e = event({ extraCosts: [{ label: "Vaisselle", amount: 30, kind: "location" }] });
    const fields = completionFields(e, people, recipeCostById, recipePortionsById);
    expect(fields.status).toBe("completed");
    expect(fields.costSnapshot).toEqual(buildCostSnapshot(e, recipeCostById, recipePortionsById));
    expect(fields.costSnapshot.rawMaterial).toBe(50);
    expect("staff" in fields).toBe(false);
    expect("staff" in completionFields(event({ staff: [] }), people, recipeCostById, recipePortionsById)).toBe(false);
  });
  it("freezes the staff rates when the event has entries", () => {
    const e = event({ staff: [{ personId: "kristoff", hours: 6 }] });
    const fields = completionFields(e, people, recipeCostById, recipePortionsById);
    expect(fields.staff).toEqual([{ personId: "kristoff", hours: 6, hourlyRate: 18, kmRate: 0.3 }]);
  });
});
