import type { AppEvent, EventRecipeLine, EventTask } from "../entities/event";
import type { Ingredient } from "../entities/ingredient";
import type { Recipe } from "../entities/recipe";
import type { Person, PrestationTypeSetting } from "../entities/settings";
import { isoWeekOf, longDayLabel, parseIsoWeek, rangeLabel, shortDayLabel } from "./dates";
import {
  assigneesOf,
  courseBucket,
  courseOf,
  movedOutLines,
  ownDayLines,
  personInitials,
  personName,
  prepDateOf,
  SANS_PERSONNE,
  shortEventName,
  sortEventLines,
  tasksOn,
  type ClientLookup,
} from "./planning";
import { scaledIngredients, type ScaledIngredient } from "./quantity";

export interface PrintRow {
  kind: "recipe" | "task";
  done: boolean;
  label: string;
  // "Tâche" for tasks, the course bucket for lines.
  course: string;
  portions?: number;
  initials: string[];
  // Per-person pages: names of the other assignees.
  with?: string[];
  note?: string;
  ingredients?: ScaledIngredient[];
}

export interface PrintBlock {
  // "Hoona · 30 convives · Menu à emporter · AM, KR" or "Pour samedi 17 octobre · Mariage Dupont"
  heading: string;
  movedIn: boolean;
  // "1 préparation prévue jeu. 15" / "2 préparations prévues jeu. 15, ven. 16"
  movedOutNote?: string;
  rows: PrintRow[];
}

export interface PrintSection {
  // "Lundi 12 octobre"
  heading: string;
  // "1 événement · 30 convives · 1 préparation"
  caption?: string;
  blocks: PrintBlock[];
}

export interface PrintPage {
  // "Semaine 42 · 12 au 18 octobre 2026" or "Kristoff · semaine 42"
  title: string;
  caption?: string;
  sections: PrintSection[];
}

export interface WeekPrintInput {
  events: AppEvent[];
  weekDates: string[];
  courses: string[];
  recipeById: Map<string, Recipe>;
  clientById: ClientLookup;
  people: Person[];
  prestationTypes: PrestationTypeSetting[];
  ingredientById: Map<string, Pick<Ingredient, "name">>;
  byPerson: boolean;
  personId?: string;
  withIngredients: boolean;
  onePagePerDay: boolean;
}

export const UNKNOWN_RECIPE = "Recette inconnue";
export const TASK_COURSE = "Tâche";

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

// Rows keep their assignees until the per-person split is done.
type Row = PrintRow & { assignedTo: string[] };
type Block = Omit<PrintBlock, "rows"> & { rows: Row[] };
interface Day {
  date: string;
  events: AppEvent[];
  blocks: Block[];
}

function byDateThenName(a: Pick<AppEvent, "date" | "name">, b: Pick<AppEvent, "date" | "name">): number {
  const da = a.date.slice(0, 10);
  const db = b.date.slice(0, 10);
  if (da !== db) return da < db ? -1 : 1;
  return a.name.localeCompare(b.name, "fr");
}

function initialsOf(ids: string[], people: Person[]): string[] {
  return ids.map((id) => {
    const p = people.find((x) => x.personId === id);
    return personInitials(p ?? { name: id });
  });
}

function prestationLabel(types: PrestationTypeSetting[], key: string | undefined): string | undefined {
  if (!key) return undefined;
  return types.find((t) => t.key === key)?.label ?? key;
}

function eventHeading(event: AppEvent, input: WeekPrintInput): string {
  const parts = [shortEventName(event, event.clientId ? input.clientById.get(event.clientId) : undefined), plural(event.guestCount, "convive")];
  const prestation = prestationLabel(input.prestationTypes, event.prestationType);
  if (prestation) parts.push(prestation);
  const initials = initialsOf(event.assignedTo ?? [], input.people);
  if (initials.length) parts.push(initials.join(", "));
  return parts.join(" · ");
}

function movedOutNoteOf(event: AppEvent): string | undefined {
  const moved = movedOutLines(event);
  if (moved.length === 0) return undefined;
  const dates = [...new Set(moved.map((l) => prepDateOf(l, event)))].sort();
  return `${plural(moved.length, "préparation prévue", "préparations prévues")} ${dates.map(shortDayLabel).join(", ")}`;
}

function recipeRow(event: AppEvent, line: EventRecipeLine, input: WeekPrintInput): Row {
  const recipe = input.recipeById.get(line.recipeId);
  const assignedTo = assigneesOf(line, event);
  const row: Row = {
    kind: "recipe",
    done: line.prepStatus === "done",
    label: recipe?.name ?? UNKNOWN_RECIPE,
    course: courseBucket(courseOf(line, recipe), input.courses),
    portions: line.portions,
    initials: initialsOf(assignedTo, input.people),
    note: line.notes,
    assignedTo,
  };
  if (input.withIngredients && recipe) {
    row.ingredients = scaledIngredients(recipe, [{ portions: line.portions }], input.ingredientById);
  }
  return row;
}

function taskRow(event: AppEvent, task: EventTask, input: WeekPrintInput): Row {
  const assignedTo = assigneesOf(task, event);
  return {
    kind: "task",
    done: task.prepStatus === "done",
    label: task.label,
    course: TASK_COURSE,
    initials: initialsOf(assignedTo, input.people),
    note: task.notes,
    assignedTo,
  };
}

function blockRows(event: AppEvent, lines: EventRecipeLine[], tasks: EventTask[], input: WeekPrintInput): Row[] {
  return [
    ...sortEventLines(lines, input.courses, input.recipeById).map((l) => recipeRow(event, l, input)),
    ...tasks.map((t) => taskRow(event, t, input)),
  ];
}

function buildDay(date: string, input: WeekPrintInput): Day {
  const own = input.events.filter((e) => e.date.slice(0, 10) === date).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const blocks: Block[] = own.map((event) => ({
    heading: eventHeading(event, input),
    movedIn: false,
    movedOutNote: movedOutNoteOf(event),
    rows: blockRows(event, ownDayLines(event), tasksOn(event, date), input),
  }));
  const movedIn: { event: AppEvent; lines: EventRecipeLine[]; tasks: EventTask[] }[] = [];
  for (const event of input.events) {
    if (event.date.slice(0, 10) === date) continue;
    const lines = event.recipes.filter((l) => prepDateOf(l, event) === date);
    const tasks = tasksOn(event, date);
    if (lines.length || tasks.length) movedIn.push({ event, lines, tasks });
  }
  movedIn.sort((a, b) => byDateThenName(a.event, b.event));
  for (const { event, lines, tasks } of movedIn) {
    const client = event.clientId ? input.clientById.get(event.clientId) : undefined;
    blocks.push({
      heading: `Pour ${longDayLabel(event.date).toLowerCase()} · ${shortEventName(event, client)}`,
      movedIn: true,
      rows: blockRows(event, lines, tasks, input),
    });
  }
  return { date, events: own, blocks };
}

function rowCount(blocks: Block[]): number {
  return blocks.reduce((n, b) => n + b.rows.length, 0);
}

function toPrintRow({ assignedTo: _assignedTo, ...row }: Row): PrintRow {
  return row;
}

function toBlock(block: Block): PrintBlock {
  const out: PrintBlock = { heading: block.heading, movedIn: block.movedIn, rows: block.rows.map(toPrintRow) };
  if (block.movedOutNote) out.movedOutNote = block.movedOutNote;
  return out;
}

function sectionCaption(day: Day, blocks: Block[]): string {
  const parts: string[] = [];
  if (day.events.length) {
    parts.push(plural(day.events.length, "événement"));
    parts.push(plural(day.events.reduce((n, e) => n + e.guestCount, 0), "convive"));
  }
  const rows = blocks.flatMap((b) => b.rows);
  parts.push(plural(rows.filter((r) => r.kind === "recipe").length, "préparation"));
  const tasks = rows.filter((r) => r.kind === "task").length;
  if (tasks) parts.push(plural(tasks, "tâche"));
  return parts.join(" · ");
}

function toSection(day: Day, blocks: Block[]): PrintSection {
  return { heading: longDayLabel(day.date), caption: sectionCaption(day, blocks), blocks: blocks.map(toBlock) };
}

function weekNumber(weekDates: string[]): number {
  return parseIsoWeek(isoWeekOf(weekDates[0])).week;
}

function weekTitle(weekDates: string[]): string {
  const first = weekDates[0];
  const last = weekDates[weekDates.length - 1];
  const range = rangeLabel(first, last);
  const year = last.slice(0, 4);
  // rangeLabel already carries both years when the week straddles a year end.
  const suffix = range.endsWith(year) ? "" : ` ${year}`;
  return `Semaine ${weekNumber(weekDates)} · ${range}${suffix}`;
}

function weekCaption(input: WeekPrintInput): string {
  const set = new Set(input.weekDates);
  const events = input.events.filter((e) => set.has(e.date.slice(0, 10)));
  const guests = events.reduce((n, e) => n + e.guestCount, 0);
  return `${plural(events.length, "événement")} · ${plural(guests, "convive")}`;
}

function wholeWeekPages(days: Day[], input: WeekPrintInput): PrintPage[] {
  const sections = days.filter((d) => rowCount(d.blocks) > 0).map((d) => toSection(d, d.blocks));
  if (sections.length === 0) return [];
  const title = weekTitle(input.weekDates);
  const caption = weekCaption(input);
  if (!input.onePagePerDay) return [{ title, caption, sections }];
  return sections.map((section, i) => (i === 0 ? { title, caption, sections: [section] } : { title, sections: [section] }));
}

// Blocks of the day keeping only the rows that match, with `with` filled from the other assignees.
function personBlocks(day: Day, keep: (row: Row) => boolean, people: Person[], self: string | null): Block[] {
  const blocks: Block[] = [];
  for (const block of day.blocks) {
    const rows = block.rows.filter(keep).map((row) => {
      const others = row.assignedTo.filter((id) => id !== self);
      return others.length ? { ...row, with: others.map((id) => personName(people, id)) } : row;
    });
    if (rows.length) blocks.push({ ...block, rows });
  }
  return blocks;
}

function personPage(days: Day[], title: string, keep: (row: Row) => boolean, people: Person[], self: string | null): PrintPage | undefined {
  const sections: PrintSection[] = [];
  for (const day of days) {
    const blocks = personBlocks(day, keep, people, self);
    if (blocks.length) sections.push(toSection(day, blocks));
  }
  return sections.length ? { title, sections } : undefined;
}

function perPersonPages(days: Day[], input: WeekPrintInput): PrintPage[] {
  const n = weekNumber(input.weekDates);
  const pages: PrintPage[] = [];
  const candidates = input.personId
    ? [input.people.find((p) => p.personId === input.personId) ?? { personId: input.personId, name: input.personId, active: true }]
    : input.people.filter((p) => p.active);
  if (!input.personId) {
    // Rows assigned to an inactive or deleted person get their own page, as groupByPerson does on the Day page.
    const listed = new Set(candidates.map((p) => p.personId));
    for (const row of days.flatMap((d) => d.blocks.flatMap((b) => b.rows))) {
      for (const id of row.assignedTo) {
        if (listed.has(id)) continue;
        listed.add(id);
        candidates.push({ personId: id, name: personName(input.people, id), active: false });
      }
    }
  }
  for (const person of candidates) {
    const page = personPage(days, `${person.name} · semaine ${n}`, (r) => r.assignedTo.includes(person.personId), input.people, person.personId);
    if (page) pages.push(page);
  }
  if (input.personId) return pages;
  const nobody = personPage(days, `${SANS_PERSONNE} · semaine ${n}`, (r) => r.assignedTo.length === 0, input.people, null);
  if (nobody) pages.push(nobody);
  return pages;
}

// Pure page model for the printed week; the React page only renders it.
export function weekPrintPages(input: WeekPrintInput): PrintPage[] {
  if (input.weekDates.length === 0) return [];
  const days = input.weekDates.map((date) => buildDay(date, input));
  return input.byPerson ? perPersonPages(days, input) : wholeWeekPages(days, input);
}
