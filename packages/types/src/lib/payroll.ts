import type { AppEvent } from "../entities/event";
import type { PaymentMode, Person } from "../entities/settings";
import { fmtEur, round2, sumMoney } from "./money";
import { shortEventName, sortPersonIds, type ClientLookup } from "./planning";
import { staffAmountOf, staffHoursOf, staffRateOf } from "./staff";

export type PayrollMode = PaymentMode | "none";
export const PAYROLL_MODE_ORDER: PayrollMode[] = ["nowjobs", "cash", "facture", "none"];
export const PAYROLL_MODE_LABELS: Record<PayrollMode, string> = { nowjobs: "Nowjobs", cash: "Cash", facture: "Facture", none: "À préciser" };

export interface PayrollEventLine {
  eventId: string;
  label: string;
  date: string;
  hours: number;
  km: number;
  amount: number;
  missingRate: boolean;
}

export interface PayrollPerson {
  personId: string;
  name: string;
  mode: PayrollMode;
  hours: number;
  km: number;
  amount: number;
  missingRate: boolean;
  events: PayrollEventLine[];
}

export interface PayrollGroup {
  mode: PayrollMode;
  label: string;
  hours: number;
  km: number;
  amount: number;
  people: PayrollPerson[];
}

export interface Payroll {
  from: string;
  to: string;
  groups: PayrollGroup[];
  hours: number;
  km: number;
  amount: number;
  // Number of people with hours or km and no rate.
  missingRate: number;
}

function sumHours(xs: number[]): number {
  return round2(xs.reduce((s, x) => s + x, 0));
}

// Events dated from..to inclusive, any status; entries with hours or km > 0 only; inactive people listed when they have work;
// person rows in settings order; groups in PAYROLL_MODE_ORDER, empty groups dropped; label = shortEventName(event, client).
export function payroll(
  events: AppEvent[],
  people: Person[],
  clientById: ClientLookup,
  from: string,
  to: string,
  mode?: PayrollMode,
): Payroll {
  const inRange = events
    .filter((e) => e.date.slice(0, 10) >= from && e.date.slice(0, 10) <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "fr"));
  const linesByPerson = new Map<string, PayrollEventLine[]>();
  for (const event of inRange) {
    for (const entry of event.staff ?? []) {
      const hours = staffHoursOf(entry);
      const km = entry.km ?? 0;
      if (hours <= 0 && km <= 0 && entry.actualAmount === undefined && entry.kmAmount === undefined) continue;
      const person = people.find((p) => p.personId === entry.personId);
      const rate = staffRateOf(entry, person, hours > 0 && entry.actualAmount === undefined);
      const line: PayrollEventLine = {
        eventId: event.eventId,
        label: shortEventName(event, event.clientId ? clientById.get(event.clientId) : undefined),
        date: event.date.slice(0, 10),
        hours,
        km,
        amount: entry.actualAmount ?? round2(hours * rate.hourly + (entry.kmAmount ?? km * rate.km)),
        missingRate: rate.missing,
      };
      const list = linesByPerson.get(entry.personId) ?? [];
      list.push(line);
      linesByPerson.set(entry.personId, list);
    }
  }
  const persons: PayrollPerson[] = sortPersonIds(linesByPerson.keys(), people).map((personId) => {
    const person = people.find((p) => p.personId === personId);
    const lines = linesByPerson.get(personId) ?? [];
    return {
      personId,
      name: person?.name ?? personId,
      mode: person?.paymentMode ?? "none",
      hours: sumHours(lines.map((l) => l.hours)),
      km: sumHours(lines.map((l) => l.km)),
      amount: sumMoney(lines.map((l) => l.amount)),
      missingRate: lines.some((l) => l.missingRate),
      events: lines,
    };
  });
  const groups: PayrollGroup[] = PAYROLL_MODE_ORDER.filter((m) => mode === undefined || m === mode)
    .map((m) => {
      const members = persons.filter((p) => p.mode === m);
      return {
        mode: m,
        label: PAYROLL_MODE_LABELS[m],
        hours: sumHours(members.map((p) => p.hours)),
        km: sumHours(members.map((p) => p.km)),
        amount: sumMoney(members.map((p) => p.amount)),
        people: members,
      };
    })
    .filter((g) => g.people.length > 0);
  const shown = groups.flatMap((g) => g.people);
  return {
    from,
    to,
    groups,
    hours: sumHours(shown.map((p) => p.hours)),
    km: sumHours(shown.map((p) => p.km)),
    amount: sumMoney(shown.map((p) => p.amount)),
    missingRate: shown.filter((p) => p.missingRate).length,
  };
}

const num = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 2 });

// Plain text for the clipboard: a line per group « Nowjobs », then one line per person « Kristoff\t18 h\t24 km\t280,56 € ».
export function payrollText(p: Payroll): string {
  const lines: string[] = [];
  for (const g of p.groups) {
    lines.push(g.label);
    for (const person of g.people) {
      lines.push([person.name, `${num.format(person.hours)} h`, `${num.format(person.km)} km`, fmtEur(person.amount)].join("\t"));
    }
  }
  return lines.join("\n");
}

function csvText(s: string): string {
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvNumber(n: number): string {
  return String(n).replace(".", ",");
}

function csvMoney(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

function csvDate(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
}

// CSV with ; and decimal comma: Mode;Personne;Événement;Date;Heures;Km;Montant, one line per event line, a total line per person.
export function payrollCsv(p: Payroll): string {
  const lines: string[] = ["Mode;Personne;Événement;Date;Heures;Km;Montant"];
  for (const g of p.groups) {
    for (const person of g.people) {
      for (const ev of person.events) {
        lines.push(
          [g.label, csvText(person.name), csvText(ev.label), csvDate(ev.date), csvNumber(ev.hours), csvNumber(ev.km), csvMoney(ev.amount)].join(";"),
        );
      }
      lines.push([g.label, csvText(person.name), "Total", "", csvNumber(person.hours), csvNumber(person.km), csvMoney(person.amount)].join(";"));
    }
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
