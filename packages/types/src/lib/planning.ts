import type { Client } from "../entities/client";
import type { AppEvent, EventRecipeLine, PrepStatus } from "../entities/event";
import type { Recipe } from "../entities/recipe";
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
}

// weekStart is the Monday as YYYY-MM-DD; the plan covers seven days from it.
export function weekPlan(events: AppEvent[], weekStart: string): WeekPlan {
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const dayEvents = events.filter((e) => e.date.slice(0, 10) === date);
    let linesDone = 0;
    let linesTotal = 0;
    for (const e of dayEvents) {
      linesTotal += e.recipes.length;
      linesDone += e.recipes.filter((l) => l.prepStatus === "done").length;
    }
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
  };
}

export function monthSignedRevenue(events: AppEvent[], ym: string): number {
  return sumMoney(events.filter((e) => ymOf(e.date) === ym).map(signedRevenue));
}
