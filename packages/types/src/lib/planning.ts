import type { Client } from "../entities/client";
import type { AppEvent, EventRecipeLine, PrepStatus } from "../entities/event";
import type { Recipe } from "../entities/recipe";
import type { Person } from "../entities/settings";
import { addDays, ymOf } from "./dates";
import { round2, sumMoney } from "./money";

export const FALLBACK_COURSE = "Autre";

export type RecipeLookup = Map<string, Pick<Recipe, "name" | "defaultCourse"> & Partial<Recipe>>;
export type ClientLookup = Map<string, Pick<Client, "name">>;

// Revenue HTVA of an event as sold, the "Signé" figure everywhere.
export function signedRevenue(event: Pick<AppEvent, "sellingPricePerGuest" | "guestCount">): number {
  return round2(event.sellingPricePerGuest * event.guestCount);
}

// Raw course of a line: its own value, then the recipe default, then "Autre".
export function courseOf(line: Pick<EventRecipeLine, "course">, recipe?: { defaultCourse?: string }): string {
  return line.course ?? recipe?.defaultCourse ?? FALLBACK_COURSE;
}

// Position of a course in the settings list; unknown values sort with "Autre", or last when "Autre" is absent.
export function courseIndex(course: string | undefined, courses: string[]): number {
  const i = courses.indexOf(course ?? FALLBACK_COURSE);
  if (i >= 0) return i;
  const autre = courses.indexOf(FALLBACK_COURSE);
  return autre >= 0 ? autre : courses.length;
}

// Label of the bucket a line is shown under: the course when it is in the list, else "Autre".
export function courseBucket(course: string | undefined, courses: string[]): string {
  return course !== undefined && courses.includes(course) ? course : FALLBACK_COURSE;
}

export function sortEventLines<T extends EventRecipeLine>(
  lines: T[],
  courses: string[],
  recipeById: RecipeLookup,
): T[] {
  return lines
    .map((line, index) => ({ line, index, key: courseIndex(courseOf(line, recipeById.get(line.recipeId)), courses) }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map((x) => x.line);
}

export function groupByCourse<T extends EventRecipeLine>(
  lines: T[],
  courses: string[],
  recipeById: RecipeLookup,
): { course: string; lines: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const line of sortEventLines(lines, courses, recipeById)) {
    const bucket = courseBucket(courseOf(line, recipeById.get(line.recipeId)), courses);
    const list = groups.get(bucket);
    if (list) list.push(line);
    else groups.set(bucket, [line]);
  }
  return [...groups.entries()].map(([course, list]) => ({ course, lines: list }));
}

export const WEEKDAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;

export function isWeekdayLabel(name: string): boolean {
  const n = name.trim().toLowerCase();
  return (WEEKDAY_LABELS as readonly string[]).some((l) => l.toLowerCase() === n);
}

// Effective assignees of a line: its own list when set, else the event's.
export function assigneesOf(line: Pick<EventRecipeLine, "assignedTo">, event: Pick<AppEvent, "assignedTo">): string[] {
  return line.assignedTo?.length ? line.assignedTo : event.assignedTo ?? [];
}

export function personName(people: Person[], personId: string): string {
  return people.find((p) => p.personId === personId)?.name ?? personId;
}

export function personInitials(p: Pick<Person, "name" | "initials">): string {
  const given = p.initials?.trim();
  if (given) return given.slice(0, 3);
  return p.name.trim().slice(0, 2).toUpperCase();
}

// Lowercase, accents stripped, non-alphanumerics to "-", "-2" and up on collision.
export function slugifyPersonId(name: string, taken: string[]): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "personne";
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base.slice(0, 40 - String(n).length - 1)}-${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

const GENERATED_SUFFIX = /^[\p{L}]+ \d{1,2} [\p{L}]+\.?$/u;

// The client name alone when the event came from a template or carries the generated "Client · mardi 13 oct." name.
export function shortEventName(ev: Pick<AppEvent, "name" | "templateId">, client?: Pick<Client, "name">): string {
  if (!client) return ev.name;
  if (ev.templateId) return client.name;
  const prefix = `${client.name} · `;
  if (ev.name.startsWith(prefix) && GENERATED_SUFFIX.test(ev.name.slice(prefix.length))) return client.name;
  return ev.name;
}

export interface PrepLine {
  eventId: string;
  eventName: string;
  clientName?: string;
  prestationType?: string;
  lineId: string;
  recipeId: string;
  recipeName: string;
  portions: number;
  course: string;
  prepStatus: PrepStatus;
  date: string;
  notes?: string;
  // Effective assignees, and whether the line set them itself.
  assignedTo: string[];
  ownAssignment: boolean;
}

export function prepLinesForDate(
  events: AppEvent[],
  recipeById: RecipeLookup,
  clientById: ClientLookup,
  courses: string[],
  date: string,
): PrepLine[] {
  const out: { line: PrepLine; key: number; order: number }[] = [];
  let order = 0;
  for (const event of events) {
    if (event.date.slice(0, 10) !== date) continue;
    const clientName = (event.clientId && clientById.get(event.clientId)?.name) || event.contactName || undefined;
    for (const line of sortEventLines(event.recipes, courses, recipeById)) {
      const recipe = recipeById.get(line.recipeId);
      const course = courseBucket(courseOf(line, recipe), courses);
      out.push({
        key: courseIndex(course, courses),
        order: order++,
        line: {
          eventId: event.eventId,
          eventName: event.name,
          clientName,
          prestationType: event.prestationType,
          lineId: line.lineId,
          recipeId: line.recipeId,
          recipeName: recipe?.name ?? line.recipeId,
          portions: line.portions,
          course,
          prepStatus: line.prepStatus ?? "todo",
          date: event.date,
          notes: line.notes,
          assignedTo: assigneesOf(line, event),
          ownAssignment: !!line.assignedTo?.length,
        },
      });
    }
  }
  return out.sort((a, b) => a.key - b.key || a.order - b.order).map((x) => x.line);
}

export interface RecipeGroup {
  recipeId: string;
  recipeName: string;
  total: number;
  parts: { label: string; portions: number }[];
}

export function groupByRecipe(lines: PrepLine[]): RecipeGroup[] {
  const groups = new Map<string, RecipeGroup>();
  for (const line of lines) {
    const label = line.clientName ?? line.eventName;
    const group = groups.get(line.recipeId);
    if (group) {
      group.total += line.portions;
      group.parts.push({ label, portions: line.portions });
    } else {
      groups.set(line.recipeId, {
        recipeId: line.recipeId,
        recipeName: line.recipeName,
        total: line.portions,
        parts: [{ label, portions: line.portions }],
      });
    }
  }
  return [...groups.values()];
}

export interface PersonGroup {
  personId: string | null;
  name: string;
  lines: PrepLine[];
}

export const SANS_PERSONNE = "Sans personne";

// Active people in settings order, then ids seen on lines but not active, then "Sans personne"; empty groups are dropped.
export function groupByPerson(lines: PrepLine[], people: Person[]): PersonGroup[] {
  const order: string[] = people.filter((p) => p.active).map((p) => p.personId);
  for (const line of lines) for (const id of line.assignedTo) if (!order.includes(id)) order.push(id);
  const groups: PersonGroup[] = order
    .map((personId) => ({ personId, name: personName(people, personId), lines: filterByPerson(lines, personId) }))
    .filter((g) => g.lines.length > 0);
  const nobody = lines.filter((l) => l.assignedTo.length === 0);
  if (nobody.length) groups.push({ personId: null, name: SANS_PERSONNE, lines: nobody });
  return groups;
}

export function filterByPerson(lines: PrepLine[], personId: string): PrepLine[] {
  return lines.filter((l) => l.assignedTo.includes(personId));
}

// Distinct ids in settings order, unknown ids after in order of appearance.
export function sortPersonIds(ids: Iterable<string>, people: Person[]): string[] {
  const set = new Set(ids);
  const known = people.map((p) => p.personId).filter((id) => set.has(id));
  const rest = [...set].filter((id) => !known.includes(id));
  return [...known, ...rest];
}

export interface WeekDay {
  date: string;
  events: AppEvent[];
  guests: number;
  signedRevenue: number;
  linesDone: number;
  linesTotal: number;
}

export interface WeekPlan {
  weekStart: string;
  days: WeekDay[];
  guests: number;
  signedRevenue: number;
  linesDone: number;
  linesTotal: number;
  // Distinct effective assignees per date, settings order.
  peopleByDay: Record<string, string[]>;
}

// weekStart is the Monday as YYYY-MM-DD; the plan covers seven days from it.
export function weekPlan(events: AppEvent[], weekStart: string, people: Person[] = []): WeekPlan {
  const days: WeekDay[] = [];
  const peopleByDay: Record<string, string[]> = {};
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const dayEvents = events.filter((e) => e.date.slice(0, 10) === date);
    let linesDone = 0;
    let linesTotal = 0;
    const ids: string[] = [];
    for (const e of dayEvents) {
      linesTotal += e.recipes.length;
      linesDone += e.recipes.filter((l) => l.prepStatus === "done").length;
      ids.push(...(e.assignedTo ?? []));
      for (const l of e.recipes) ids.push(...assigneesOf(l, e));
    }
    peopleByDay[date] = sortPersonIds(ids, people);
    days.push({
      date,
      events: dayEvents,
      guests: dayEvents.reduce((n, e) => n + e.guestCount, 0),
      signedRevenue: sumMoney(dayEvents.map(signedRevenue)),
      linesDone,
      linesTotal,
    });
  }
  return {
    weekStart,
    days,
    guests: days.reduce((n, d) => n + d.guests, 0),
    signedRevenue: sumMoney(days.map((d) => d.signedRevenue)),
    linesDone: days.reduce((n, d) => n + d.linesDone, 0),
    linesTotal: days.reduce((n, d) => n + d.linesTotal, 0),
    peopleByDay,
  };
}

export function monthSignedRevenue(events: AppEvent[], ym: string): number {
  return sumMoney(events.filter((e) => ymOf(e.date) === ym).map(signedRevenue));
}
