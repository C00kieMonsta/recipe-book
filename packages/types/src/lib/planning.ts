import type { Client } from "../entities/client";
import type { AppEvent, EventRecipeLine, EventTask, PrepStatus } from "../entities/event";
import type { VatRate } from "../entities/ledger";
import type { Recipe } from "../entities/recipe";
import type { Person } from "../entities/settings";
import {
  DEFAULT_COURSES,
  LEGACY_DEFAULT_COURSES,
  LEGACY_DEFAULT_COURSES_V2,
  LEGACY_TYPE_TO_CATEGORY,
} from "../entities/settings";
import { addDays, daysBetween, ymOf } from "./dates";
import { round2, sumMoney } from "./money";

export const FALLBACK_COURSE = "Autre";

export type RecipeLookup = Map<
  string,
  Pick<Recipe, "name"> & Partial<Pick<Recipe, "category" | "defaultCourse" | "type" | "ingredients" | "portions">>
>;
export type ClientLookup = Map<string, Pick<Client, "name">>;

export type PricedEvent = Pick<AppEvent, "sellingPricePerGuest" | "guestCount"> &
  Partial<Pick<AppEvent, "pricingMode" | "sellingTotal" | "revenueLines">>;

function finite(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

// Food revenue HTVA: the typed total in total mode, else price × guests. A missing or non-finite value counts as 0.
export function foodRevenue(e: PricedEvent): number {
  if (e.pricingMode === "total") return round2(finite(e.sellingTotal));
  return round2(finite(e.sellingPricePerGuest) * finite(e.guestCount));
}

export function revenueLinesTotal(e: Pick<AppEvent, "revenueLines">): number {
  return sumMoney((e.revenueLines ?? []).map((l) => finite(l.amount)));
}

// The "Signé" figure everywhere: food plus the billed lines.
export function signedRevenue(e: PricedEvent): number {
  return sumMoney([foodRevenue(e), revenueLinesTotal(e)]);
}

// Food revenue per guest, 0 when guestCount is 0.
export function pricePerGuestOf(e: PricedEvent): number {
  const guests = finite(e.guestCount);
  if (guests <= 0) return 0;
  if (e.pricingMode === "total") return round2(foodRevenue(e) / guests);
  return round2(finite(e.sellingPricePerGuest));
}

export interface VatBucket {
  rate: VatRate;
  htva: number;
  tva: number;
  tvac: number;
}

// Food at the event rate (0 when absent), each billed line at its own rate; buckets merged by rate, ascending, empty buckets dropped.
export function vatBreakdown(e: PricedEvent & Pick<AppEvent, "vatRate">): VatBucket[] {
  const byRate = new Map<VatRate, number>();
  const add = (rate: VatRate, htva: number) => byRate.set(rate, sumMoney([byRate.get(rate) ?? 0, htva]));
  add(e.vatRate ?? 0, foodRevenue(e));
  for (const l of e.revenueLines ?? []) add(l.vatRate, finite(l.amount));
  return [...byRate.entries()]
    .filter(([, htva]) => htva !== 0)
    .sort((a, b) => a[0] - b[0])
    .map(([rate, htva]) => {
      const tva = round2((htva * rate) / 100);
      return { rate, htva, tva, tvac: sumMoney([htva, tva]) };
    });
}

export function revenueTvac(e: PricedEvent & Pick<AppEvent, "vatRate">): number {
  return sumMoney(vatBreakdown(e).map((b) => b.tvac));
}

// category, else defaultCourse unless it is "Autre", else the legacy type mapped, else the type itself, else "Autre".
export function recipeCategoryOf(r: Partial<Pick<Recipe, "category" | "defaultCourse" | "type">>): string {
  if (r.category) return r.category;
  if (r.defaultCourse && r.defaultCourse !== FALLBACK_COURSE) return r.defaultCourse;
  if (r.type) return LEGACY_TYPE_TO_CATEGORY[r.type] ?? r.type;
  return FALLBACK_COURSE;
}

// Raw course of a line: its own value, then the recipe category, then "Autre".
export function courseOf(
  line: Pick<EventRecipeLine, "course">,
  recipe?: Partial<Pick<Recipe, "category" | "defaultCourse" | "type">>,
): string {
  return line.course ?? (recipe ? recipeCategoryOf(recipe) : FALLBACK_COURSE);
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}

// undefined or [] gives DEFAULT_COURSES; the legacy five or the legacy six give DEFAULT_COURSES plus "Mignardises"; anything else as is.
export function upgradeCourses(stored: string[] | undefined): string[] {
  if (!stored?.length) return DEFAULT_COURSES;
  if (sameList(stored, LEGACY_DEFAULT_COURSES) || sameList(stored, LEGACY_DEFAULT_COURSES_V2)) {
    return [...DEFAULT_COURSES, "Mignardises"];
  }
  return stored;
}

// Categories to offer in a select or as tabs: the settings list, then every value used by the recipes that is not in it, alphabetical.
export function categoryOptions(courses: string[], recipes: Pick<Recipe, "category" | "defaultCourse" | "type">[]): string[] {
  const extra = new Set<string>();
  for (const r of recipes) {
    const c = recipeCategoryOf(r);
    if (!courses.includes(c)) extra.add(c);
  }
  return [...courses, ...[...extra].sort((a, b) => a.localeCompare(b, "fr"))];
}

export function isIncompleteRecipe(r: Pick<Recipe, "ingredients">): boolean {
  return !r.ingredients?.length;
}

// Lines whose recipe exists and has no ingredient.
export function incompleteCount(lines: Pick<EventRecipeLine, "recipeId">[], recipeById: RecipeLookup): number {
  let n = 0;
  for (const line of lines) {
    const recipe = recipeById.get(line.recipeId);
    if (recipe && isIncompleteRecipe({ ingredients: recipe.ingredients ?? [] })) n++;
  }
  return n;
}

// "Dupont SA\nRue des Lilas 4, 1050 Ixelles\nBE 0123.456.789"; empty parts dropped.
export function billingFromClient(c: Pick<Client, "name" | "address" | "vatNumber">): string {
  return [c.name, c.address, c.vatNumber]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join("\n");
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

// Effective assignees of a line or a task: its own list when set, else the event's.
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

// The day a line is prepared: its prepDate, else the event day.
export function prepDateOf(line: Pick<EventRecipeLine, "prepDate">, event: Pick<AppEvent, "date">): string {
  return line.prepDate ?? event.date.slice(0, 10);
}

export function isMoved(line: Pick<EventRecipeLine, "prepDate">, event: Pick<AppEvent, "date">): boolean {
  return prepDateOf(line, event) !== event.date.slice(0, 10);
}

export function tasksOf(event: Pick<AppEvent, "tasks">): EventTask[] {
  return event.tasks ?? [];
}

// Tasks of the event dated `date`.
export function tasksOn(event: Pick<AppEvent, "tasks">, date: string): EventTask[] {
  return tasksOf(event).filter((t) => t.date === date);
}

// Lines prepared on the event day.
export function ownDayLines(event: Pick<AppEvent, "date" | "recipes">): EventRecipeLine[] {
  return event.recipes.filter((l) => !isMoved(l, event));
}

// Lines with a prepDate different from the event day.
export function movedOutLines(event: Pick<AppEvent, "date" | "recipes">): EventRecipeLine[] {
  return event.recipes.filter((l) => isMoved(l, event));
}

// Every explicit prepDate and every task date move with the event; lines without prepDate are untouched.
export function shiftPrepDates(
  event: Pick<AppEvent, "date" | "recipes" | "tasks">,
  newDate: string,
): { recipes: EventRecipeLine[]; tasks: EventTask[] } {
  const delta = daysBetween(event.date.slice(0, 10), newDate.slice(0, 10));
  return {
    recipes: event.recipes.map((l) => (l.prepDate ? { ...l, prepDate: addDays(l.prepDate, delta) } : l)),
    tasks: tasksOf(event).map((t) => ({ ...t, date: addDays(t.date, delta) })),
  };
}

export interface PrepLine {
  kind: "recipe";
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
  // The prep day, which is the event day unless the line was moved.
  date: string;
  eventDate: string;
  moved: boolean;
  notes?: string;
  // Effective assignees, and whether the line set them itself.
  assignedTo: string[];
  ownAssignment: boolean;
}

export interface PrepTask {
  kind: "task";
  eventId: string;
  eventName: string;
  clientName?: string;
  prestationType?: string;
  taskId: string;
  label: string;
  prepStatus: PrepStatus;
  date: string;
  eventDate: string;
  moved: boolean;
  notes?: string;
  assignedTo: string[];
  ownAssignment: boolean;
}

export type DayItem = PrepLine | PrepTask;

function clientNameOf(event: Pick<AppEvent, "clientId" | "contactName">, clientById: ClientLookup): string | undefined {
  return (event.clientId && clientById.get(event.clientId)?.name) || event.contactName || undefined;
}

function byDateThenName(a: Pick<AppEvent, "date" | "name">, b: Pick<AppEvent, "date" | "name">): number {
  const da = a.date.slice(0, 10);
  const db = b.date.slice(0, 10);
  if (da !== db) return da < db ? -1 : 1;
  return a.name.localeCompare(b.name, "fr");
}

function toPrepLine(
  event: AppEvent,
  line: EventRecipeLine,
  recipeById: RecipeLookup,
  clientById: ClientLookup,
  courses: string[],
  date: string,
): PrepLine {
  const recipe = recipeById.get(line.recipeId);
  const eventDate = event.date.slice(0, 10);
  return {
    kind: "recipe",
    eventId: event.eventId,
    eventName: event.name,
    clientName: clientNameOf(event, clientById),
    prestationType: event.prestationType,
    lineId: line.lineId,
    recipeId: line.recipeId,
    recipeName: recipe?.name ?? line.recipeId,
    portions: line.portions,
    course: courseBucket(courseOf(line, recipe), courses),
    prepStatus: line.prepStatus ?? "todo",
    date,
    eventDate,
    moved: date !== eventDate,
    notes: line.notes,
    assignedTo: assigneesOf(line, event),
    ownAssignment: !!line.assignedTo?.length,
  };
}

function toPrepTask(event: AppEvent, task: EventTask, clientById: ClientLookup): PrepTask {
  const eventDate = event.date.slice(0, 10);
  return {
    kind: "task",
    eventId: event.eventId,
    eventName: event.name,
    clientName: clientNameOf(event, clientById),
    prestationType: event.prestationType,
    taskId: task.taskId,
    label: task.label,
    prepStatus: task.prepStatus ?? "todo",
    date: task.date,
    eventDate,
    moved: task.date !== eventDate,
    notes: task.notes,
    assignedTo: assigneesOf(task, event),
    ownAssignment: !!task.assignedTo?.length,
  };
}

// Lines prepared on `date` over every event: own-day lines first (course order, then array order),
// then moved-in lines grouped by event (events by date then name), each group in course order.
export function prepLinesForDate(
  events: AppEvent[],
  recipeById: RecipeLookup,
  clientById: ClientLookup,
  courses: string[],
  date: string,
): PrepLine[] {
  const own: { line: PrepLine; key: number; order: number }[] = [];
  const movedIn: { event: AppEvent; lines: EventRecipeLine[] }[] = [];
  let order = 0;
  for (const event of events) {
    const lines = event.recipes.filter((l) => prepDateOf(l, event) === date);
    if (lines.length === 0) continue;
    if (event.date.slice(0, 10) !== date) {
      movedIn.push({ event, lines });
      continue;
    }
    for (const line of sortEventLines(lines, courses, recipeById)) {
      const prep = toPrepLine(event, line, recipeById, clientById, courses, date);
      own.push({ line: prep, key: courseIndex(prep.course, courses), order: order++ });
    }
  }
  own.sort((a, b) => a.key - b.key || a.order - b.order);
  movedIn.sort((a, b) => byDateThenName(a.event, b.event));
  return [
    ...own.map((x) => x.line),
    ...movedIn.flatMap(({ event, lines }) =>
      sortEventLines(lines, courses, recipeById).map((line) => toPrepLine(event, line, recipeById, clientById, courses, date)),
    ),
  ];
}

// Tasks dated `date`: tasks of events dated that day first, then tasks of other events, events by date then name,
// array order inside an event.
export function prepTasksForDate(events: AppEvent[], clientById: ClientLookup, date: string): PrepTask[] {
  const withTasks = events.filter((e) => tasksOn(e, date).length > 0).sort(byDateThenName);
  const own = withTasks.filter((e) => e.date.slice(0, 10) === date);
  const others = withTasks.filter((e) => e.date.slice(0, 10) !== date);
  return [...own, ...others].flatMap((event) => tasksOn(event, date).map((task) => toPrepTask(event, task, clientById)));
}

// prepLinesForDate then prepTasksForDate.
export function dayItems(
  events: AppEvent[],
  recipeById: RecipeLookup,
  clientById: ClientLookup,
  courses: string[],
  date: string,
): DayItem[] {
  return [...prepLinesForDate(events, recipeById, clientById, courses, date), ...prepTasksForDate(events, clientById, date)];
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

export interface PersonGroup<T = PrepLine> {
  personId: string | null;
  name: string;
  lines: T[];
}

export const SANS_PERSONNE = "Sans personne";

// Active people in settings order, then ids seen on items but not active, then "Sans personne"; empty groups are dropped.
export function groupByPerson<T extends { assignedTo: string[] }>(items: T[], people: Person[]): PersonGroup<T>[] {
  const order: string[] = people.filter((p) => p.active).map((p) => p.personId);
  for (const item of items) for (const id of item.assignedTo) if (!order.includes(id)) order.push(id);
  const groups: PersonGroup<T>[] = order
    .map((personId) => ({ personId, name: personName(people, personId), lines: filterByPerson(items, personId) }))
    .filter((g) => g.lines.length > 0);
  const nobody = items.filter((l) => l.assignedTo.length === 0);
  if (nobody.length) groups.push({ personId: null, name: SANS_PERSONNE, lines: nobody });
  return groups;
}

export function filterByPerson<T extends { assignedTo: string[] }>(items: T[], personId: string): T[] {
  return items.filter((l) => l.assignedTo.includes(personId));
}

// Distinct ids in settings order, unknown ids after in order of appearance.
export function sortPersonIds(ids: Iterable<string>, people: Person[]): string[] {
  const set = new Set(ids);
  const known = people.map((p) => p.personId).filter((id) => set.has(id));
  const rest = [...set].filter((id) => !known.includes(id));
  return [...known, ...rest];
}

export interface WeekMovedIn {
  event: AppEvent;
  lines: EventRecipeLine[];
  tasks: EventTask[];
}

export interface WeekDay {
  date: string;
  // Events dated that day.
  events: AppEvent[];
  // Events not dated that day with at least one line or task prepared that day, by event date then name.
  movedIn: WeekMovedIn[];
  // By event date.
  guests: number;
  signedRevenue: number;
  // Own-day lines of the day's events, moved-in lines and every task dated that day.
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
// Takes every event, not only the week's: a line moved in from next week must render.
export function weekPlan(events: AppEvent[], weekStart: string, people: Person[] = []): WeekPlan {
  const days: WeekDay[] = [];
  const peopleByDay: Record<string, string[]> = {};
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const dayEvents: AppEvent[] = [];
    const movedIn: WeekMovedIn[] = [];
    for (const e of events) {
      if (e.date.slice(0, 10) === date) {
        dayEvents.push(e);
        continue;
      }
      const lines = e.recipes.filter((l) => prepDateOf(l, e) === date);
      const tasks = tasksOn(e, date);
      if (lines.length || tasks.length) movedIn.push({ event: e, lines, tasks });
    }
    movedIn.sort((a, b) => byDateThenName(a.event, b.event));
    // Everything prepared that day, each with the event it inherits assignees from.
    const items: { item: Pick<EventRecipeLine, "prepStatus" | "assignedTo">; event: AppEvent }[] = [];
    const ids: string[] = [];
    for (const e of dayEvents) {
      ids.push(...(e.assignedTo ?? []));
      for (const l of ownDayLines(e)) items.push({ item: l, event: e });
      for (const t of tasksOn(e, date)) items.push({ item: t, event: e });
    }
    for (const m of movedIn) {
      for (const l of m.lines) items.push({ item: l, event: m.event });
      for (const t of m.tasks) items.push({ item: t, event: m.event });
    }
    for (const { item, event } of items) ids.push(...assigneesOf(item, event));
    peopleByDay[date] = sortPersonIds(ids, people);
    days.push({
      date,
      events: dayEvents,
      movedIn,
      guests: dayEvents.reduce((n, e) => n + e.guestCount, 0),
      signedRevenue: sumMoney(dayEvents.map(signedRevenue)),
      linesDone: items.filter((x) => x.item.prepStatus === "done").length,
      linesTotal: items.length,
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
