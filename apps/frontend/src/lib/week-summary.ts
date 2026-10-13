import type { AppEvent, AppSettings, ChecklistItem, Client, GroceryList, LedgerEntry, Person, WeekPlan } from "@packages/types";
import { datesOfIsoWeek, monthSignedRevenue, objectifMensuel, parseIsoWeek, weekChecklist, weekGroceryList, weekPlan, ymOf } from "@packages/types";
import { fmtEur0 } from "@/lib/use-planning-data";

// What the day page asks the week page to run once it gets there.
export type ChecklistIntent =
  | { kind: "assign" }
  | { kind: "client_week"; clientId: string; guestCount: number }
  | { kind: "groceries"; eventIds: string[] };

export interface WeekLinkState {
  from?: string;
  openChecklist?: boolean;
  checklistIntent?: ChecklistIntent;
}

export interface WeekSummaryInput {
  isoWeek: string;
  today: string;
  events: AppEvent[];
  clients: Client[];
  clientsConfigured: boolean;
  groceryLists: GroceryList[];
  entries: LedgerEntry[];
  ledgerConfigured: boolean;
  people: Person[];
  settings: AppSettings | null;
}

export interface WeekSummary {
  weekNo: number;
  dates: string[];
  monday: string;
  // From the Thursday, which decides the ISO year and the month of the week.
  year: string;
  ym: string;
  started: boolean;
  // weekPlan(events, monday), no filter: the money line always describes the whole week.
  weekTotals: WeekPlan;
  monthLink: { to: string; text: string; short: string };
  checklist: ChecklistItem[];
  coveringList?: Pick<GroceryList, "listId" | "range">;
}

const num0 = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 0 });

// The week's meta line and checklist, shared by the week and the day page.
export function weekSummary(input: WeekSummaryInput): WeekSummary {
  const { isoWeek, today, events, clients, clientsConfigured, groceryLists, entries, ledgerConfigured, people, settings } = input;
  const dates = datesOfIsoWeek(isoWeek);
  const monday = dates[0];
  const thursday = dates[3];
  const ym = ymOf(thursday);
  const year = thursday.slice(0, 4);
  const weekNo = parseIsoWeek(isoWeek).week;
  const started = monday <= today;

  const weekEvents = events.filter((e) => e.date.slice(0, 10) >= dates[0] && e.date.slice(0, 10) <= dates[6]);
  const weekTotals = weekPlan(events, monday);
  const monthSigned = monthSignedRevenue(events, ym);
  const objective = objectifMensuel(settings?.objectives?.[year], ym);
  const checklist = weekChecklist({ weekDates: dates, today, events, clients, clientsConfigured, groceryLists, entries, ledgerConfigured, people });
  const coveringList = weekGroceryList(weekEvents.map((e) => e.eventId), groceryLists);
  const monthLink = objective !== undefined
    ? { to: `/comptes/apercu?year=${year}`, text: `Objectif du mois ${fmtEur0(monthSigned)} / ${fmtEur0(objective)}`, short: `Objectif ${num0.format(monthSigned)} / ${fmtEur0(objective)}` }
    : { to: `/comptes/previsionnel?year=${year}`, text: "Définir l'objectif du mois", short: "Définir l'objectif du mois" };

  return { weekNo, dates, monday, year, ym, started, weekTotals, monthLink, checklist, coveringList };
}
