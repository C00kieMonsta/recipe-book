import type { Client } from "../entities/client";
import type { AppEvent } from "../entities/event";
import type { Person } from "../entities/settings";
import { PAYROLL_MODE_LABELS, PAYROLL_MODE_ORDER, payroll, payrollCsv, payrollText } from "./payroll";
import type { ClientLookup } from "./planning";

function event(partial: Partial<AppEvent> & Pick<AppEvent, "eventId" | "date">): AppEvent {
  return {
    name: partial.eventId,
    nameLower: partial.eventId,
    guestCount: 10,
    recipes: [],
    extraCosts: [],
    sellingPricePerGuest: 20,
    status: "upcoming",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

const people: Person[] = [
  { personId: "amelie", name: "Amélie", active: true, hourlyRate: 20, paymentMode: "cash" },
  { personId: "kristoff", name: "Kristoff", active: true, hourlyRate: 15.12, kmRate: 0.35, paymentMode: "nowjobs" },
  { personId: "noemie", name: "Noémie", active: true, hourlyRate: 15 },
  { personId: "lea", name: "Léa", active: false, hourlyRate: 10, paymentMode: "cash" },
  { personId: "sam", name: "Sam", active: true, paymentMode: "nowjobs" },
];

const clientById: ClientLookup = new Map<string, Pick<Client, "name">>([["hoona", { name: "Hoona" }]]);

const mariage = event({
  eventId: "e1",
  name: "Mariage Dupont",
  date: "2026-10-17",
  status: "completed",
  staff: [
    { personId: "kristoff", hours: 8, km: 24 },
    { personId: "amelie", hours: 4 },
  ],
});
const hoona = event({
  eventId: "e2",
  name: "Hoona · mardi 20 oct.",
  date: "2026-10-20",
  clientId: "hoona",
  staff: [{ personId: "kristoff", hours: 10 }],
});
const november = event({ eventId: "e3", date: "2026-11-02", staff: [{ personId: "kristoff", hours: 5 }] });

const FROM = "2026-10-01";
const TO = "2026-10-31";

function normalize(s: string): string {
  return s.replace(/[  ]/g, " ");
}

describe("payroll", () => {
  it("two people with modes nowjobs and cash over two events in October give two groups with the right subtotals", () => {
    const p = payroll([mariage, hoona], people, clientById, FROM, TO);
    expect(p.groups.map((g) => g.mode)).toEqual(["nowjobs", "cash"]);
    expect(p.groups[0]).toMatchObject({ label: "Nowjobs", hours: 18, km: 24, amount: 280.56 });
    expect(p.groups[1]).toMatchObject({ label: "Cash", hours: 4, km: 0, amount: 80 });
    expect(p).toMatchObject({ from: FROM, to: TO, hours: 22, km: 24, amount: 360.56, missingRate: 0 });
  });
  it("a person without mode lands in « À préciser »", () => {
    const e = event({ eventId: "e4", date: "2026-10-05", staff: [{ personId: "noemie", hours: 2 }] });
    const p = payroll([e], people, clientById, FROM, TO);
    expect(p.groups).toHaveLength(1);
    expect(p.groups[0]).toMatchObject({ mode: "none", label: "À préciser", amount: 30 });
    expect(p.groups[0].people[0]).toMatchObject({ personId: "noemie", name: "Noémie", mode: "none" });
  });
  it("an event dated outside from..to is excluded, whatever its status", () => {
    const p = payroll([mariage, hoona, november], people, clientById, FROM, TO);
    expect(p.groups[0].people[0].events.map((e) => e.eventId)).toEqual(["e1", "e2"]);
    expect(p.hours).toBe(22);
    const nov = payroll([mariage, hoona, november], people, clientById, "2026-11-01", "2026-11-30");
    expect(nov.groups[0].people[0].events.map((e) => e.eventId)).toEqual(["e3"]);
  });
  it("the same person over two events sums hours and amount and lists two event lines", () => {
    const p = payroll([hoona, mariage], people, clientById, FROM, TO);
    const kristoff = p.groups[0].people[0];
    expect(kristoff).toMatchObject({ personId: "kristoff", hours: 18, km: 24, amount: 280.56, missingRate: false });
    expect(kristoff.events).toEqual([
      { eventId: "e1", label: "Mariage Dupont", date: "2026-10-17", hours: 8, km: 24, amount: 129.36, missingRate: false },
      { eventId: "e2", label: "Hoona", date: "2026-10-20", hours: 10, km: 0, amount: 151.2, missingRate: false },
    ]);
  });
  it("an inactive person with hours is listed, in settings order", () => {
    const e = event({
      eventId: "e5",
      date: "2026-10-10",
      staff: [
        { personId: "lea", hours: 1 },
        { personId: "amelie", hours: 1 },
      ],
    });
    const p = payroll([e], people, clientById, FROM, TO);
    expect(p.groups[0].mode).toBe("cash");
    expect(p.groups[0].people.map((x) => x.personId)).toEqual(["amelie", "lea"]);
    expect(p.groups[0].amount).toBe(30);
  });
  it("entries without hours or km are skipped and a frozen rate wins", () => {
    const e = event({
      eventId: "e6",
      date: "2026-10-10",
      staff: [
        { personId: "amelie", hourlyRate: 30 },
        { personId: "kristoff", hours: 2, hourlyRate: 20 },
      ],
    });
    const p = payroll([e], people, clientById, FROM, TO);
    expect(p.groups).toHaveLength(1);
    expect(p.groups[0].people[0]).toMatchObject({ personId: "kristoff", amount: 40 });
  });
  it("a person with work and no rate counts in missingRate", () => {
    const e = event({ eventId: "e7", date: "2026-10-10", staff: [{ personId: "sam", hours: 3 }] });
    const p = payroll([e, mariage], people, clientById, FROM, TO);
    expect(p.missingRate).toBe(1);
    const sam = p.groups[0].people.find((x) => x.personId === "sam");
    expect(sam).toMatchObject({ amount: 0, missingRate: true });
    expect(sam?.events[0].missingRate).toBe(true);
  });
  it("the mode filter keeps one group", () => {
    const p = payroll([mariage, hoona], people, clientById, FROM, TO, "cash");
    expect(p.groups.map((g) => g.mode)).toEqual(["cash"]);
    expect(p).toMatchObject({ hours: 4, amount: 80 });
    expect(payroll([mariage], people, clientById, FROM, TO, "facture").groups).toEqual([]);
  });
  it("an empty month gives no group and zero totals", () => {
    expect(payroll([], people, clientById, FROM, TO)).toEqual({ from: FROM, to: TO, groups: [], hours: 0, km: 0, amount: 0, missingRate: 0 });
  });
  it("mode order and labels", () => {
    expect(PAYROLL_MODE_ORDER).toEqual(["nowjobs", "cash", "facture", "none"]);
    expect(PAYROLL_MODE_LABELS.none).toBe("À préciser");
  });
});

describe("payrollText", () => {
  it("has a group line then one tab-separated line per person", () => {
    const text = normalize(payrollText(payroll([mariage, hoona], people, clientById, FROM, TO)));
    expect(text.split("\n")).toEqual(["Nowjobs", "Kristoff\t18 h\t24 km\t280,56 €", "Cash", "Amélie\t4 h\t0 km\t80,00 €"]);
    expect(payrollText(payroll([], people, clientById, FROM, TO))).toBe("");
  });
  it("prints half hours with a decimal comma", () => {
    const e = event({ eventId: "e8", date: "2026-10-10", staff: [{ personId: "amelie", hours: 2.5 }] });
    expect(normalize(payrollText(payroll([e], people, clientById, FROM, TO)))).toContain("Amélie\t2,5 h\t0 km\t50,00 €");
  });
});

describe("payrollCsv", () => {
  it("has the header, one line per event line, a total per person and a decimal comma", () => {
    const csv = payrollCsv(payroll([mariage, hoona], people, clientById, FROM, TO));
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("Mode;Personne;Événement;Date;Heures;Km;Montant");
    expect(lines[1]).toBe("Nowjobs;Kristoff;Mariage Dupont;17/10/2026;8;24;129,36");
    expect(lines[2]).toBe("Nowjobs;Kristoff;Hoona;20/10/2026;10;0;151,20");
    expect(lines[3]).toBe("Nowjobs;Kristoff;Total;;18;24;280,56");
    expect(lines[4]).toBe("Cash;Amélie;Mariage Dupont;17/10/2026;4;0;80,00");
    expect(lines[5]).toBe("Cash;Amélie;Total;;4;0;80,00");
    expect(lines[6]).toBe("");
    expect(csv.startsWith("﻿")).toBe(true);
  });
  it("quotes a label carrying a semicolon", () => {
    const e = event({ eventId: "e9", name: "Dîner; salle A", date: "2026-10-10", staff: [{ personId: "amelie", hours: 1.5 }] });
    const csv = payrollCsv(payroll([e], people, clientById, FROM, TO));
    expect(csv).toContain('Cash;Amélie;"Dîner; salle A";10/10/2026;1,5;0;30,00');
  });
});
