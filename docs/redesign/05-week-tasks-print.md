# 05. Week tasks, moved preparations, client from the event, Mignardises, printed week

Status: ready to build. Builds on `03-notion-ui.md` (the ten rules), `02-planning-iteration.md` (planning flow) and `04-first-run-and-tour.md` (tour). Where this file and `02-planning-iteration.md` section 4.7 disagree, this file wins.

Inputs: Dalia's five remarks of 13 October 2026, three designs and three judge verdicts (caterer, engineer, product designer). The synthesis takes: the caterer-first copy for the week box and the move rules, the Notion design's `tasks[]` storage, drag pattern, inline composer and print route, the data-model design's pure `upgradeCourses`, `scaledIngredients` extraction and the "remove `prepDate` when it equals the event day" rule.

No new DynamoDB table. Everything lives in the existing `events`, `settings` and `clients` items.

Paths are absolute from the repo root `/Users/antoineboxho/Developer/Personal/02_projects/recipe-book/` unless they start with `docs/`.

---

## 1. Goal and Dalia's five points

| n | Dalia (verbatim) | What she gets |
|---|---|---|
| 1 | « pouvoir créer un client à partir de l'événement » | On the event page, the Client property menu ends with « + Nouveau client ». It opens a small dialog prefilled from the event's contact; « Créer et lier » creates the client and sets it on the event in one go. The event editor uses the same dialog instead of its inline grey box. |
| 2 | « dans un évént: les recettes doivent s'afficher par sortes (apéro entrée plat dessert mignardises) » | « Mignardises » joins the default menu categories between Dessert and Autre. An install still holding the old five-item list is upgraded when settings are read. The event editor groups its lines under category headings, like the event page already does. |
| 3 | « je comprends pas très bien la première section "semaine", comment utiliser l'encadré » | The box is renamed « Ce qui manque pour la semaine 42 », gets one sentence saying it fills itself and that the blue link fixes each point, rows become sentences with verb links, one column at every width, open by default on both widths. Tour step 2 says the same. |
| 4 | « pouvoir changer de jour les éléments dans la semaine et en ajouter, sans nécessairement devoir créer une recette » | A recipe line gets a « jour de préparation » (the existing `prepDate`); it shows in that day's column under « pour sam. 17 · Mariage Dupont » and keeps its event for cost, groceries and invoices. A « tâche » is a short label on a day for an event, stored in `event.tasks[]`, with the same status dot, people and move rules. Move by drag between columns on the laptop, by ⋯ › « Déplacer au… » everywhere. « + Tâche » at the foot of every column. Changing the event date shifts the prep days with it. |
| 5 | « pouvoir exporter ce planning pour l'imprimer » | ⋯ › « Imprimer la semaine… » opens `/semaine/:isoWeek/imprimer`, a printable page (one day per page, tick boxes, category, portions, initials, tasks, moved lines; options: per person, with ingredient quantities). « Imprimer » prints it; the browser's print dialog saves it as PDF. The day page keeps its own print. |

Effort: 1 S, 2 S, 3 S, 4 L, 5 M.

---

## 2. Vocabulary

French words used in every label, menu, toast and empty state. English names are for code.

| French (UI) | Meaning | Code |
|---|---|---|
| préparation | A recipe line to prepare on a day. New copy uses this word. Existing labels that say « ligne » (fiche pager « Ligne 1 / 6 », event page « 6 lignes », week stat line) stay as they are in this iteration. | `EventRecipeLine`, `PrepLine` |
| tâche | A job without a recipe, on a day, for an event: « cuire les sablés », « dégeler le poisson ». Never has portions, a category or a fiche. | `EventTask`, `PrepTask` |
| jour de préparation | The day a préparation or a tâche is done. For a line, absent means the event day. | `prepDate` on lines, `date` on tasks |
| le jour même | The event's own day, in the move list. | `prepDate` absent |
| déplacé, un autre jour | A line whose jour de préparation differs from the event day. | `isMoved(line, event)` |
| « pour sam. 17 · Mariage Dupont » | Header of a group of items prepared today for an event on another day. | `WeekDay.movedIn` |
| Déplacer au… | The one menu label that moves a line or a task to another day. Same label on the week, the day page, the fiche and the event page. | `MoveToDayMenu` |
| Catégories du menu, catégorie | The courses list in Paramètres and the per-line select. « Mignardises » is one of them. Superseded by `07-offers-pricing-attachments.md` (sections 2 and 3.1): one list « Catégories » classes recipes and groups menus, default Apéritif, Entrée, Plat, Walking dinner, Buffet, Dessert; installs that had Mignardises keep it as a seventh value. | `settings.courses`, `line.course`, `recipe.category` |
| Ce qui manque pour la semaine 42 | The week box. | `WeekChecklist` |
| Imprimer la semaine… | The ⋯ item on the week and the day that opens the print page. | `/semaine/:isoWeek/imprimer` |
| Équipe, personne | Unchanged. | `Person`, `assignedTo` |

Date labels used in new copy: `shortDayLabel(date)` = « jeu. 15 » (weekday short with dot, day number); `dayLabel(date)` = « Jeu 15 » stays for the existing places that use it; `longDayLabel(date)` = « Jeudi 15 octobre ».

---

## 3. Data model

### 3.1 Entities (`packages/types/src/entities/event.ts`)

```ts
export interface EventRecipeLine {
  lineId: string;
  recipeId: string;
  portions: number;
  course?: string;
  notes?: string;
  prepStatus?: PrepStatus;
  // YYYY-MM-DD, the day the line is prepared. Absent = the event day. Never stored equal to the event day.
  prepDate?: string;
  assignedTo?: string[];
}

export interface EventTask {
  // Filled by EventsService on every write.
  taskId: string;
  label: string;
  // YYYY-MM-DD, the day the task is done.
  date: string;
  prepStatus?: PrepStatus;
  notes?: string;
  // personIds; absent or [] inherits the event.
  assignedTo?: string[];
}

export interface AppEvent {
  // ...existing fields unchanged...
  recipes: EventRecipeLine[];
  // Absent on items written before this spec; the service returns [] in that case.
  tasks?: EventTask[];
}
```

`EventTask` has no `course` and no `portions`. A task always belongs to an event. `prepDate` keeps its name and its DTO; it only gains readers.

### 3.2 DTOs (`packages/types/src/dto/events.ts`)

```ts
export const eventTaskSchema = z
  .object({
    taskId: z.string().min(1).optional(),
    label: z.string().trim().min(1).max(120),
    date: isoDate,
    prepStatus: z.enum(["todo", "doing", "done"]).optional(),
    notes: z.string().trim().max(500).optional(),
    assignedTo: personIds.optional(),
  })
  .strict();
export type EventTaskRequest = z.infer<typeof eventTaskSchema>;

// createEventRequestSchema gains:
//   tasks: z.array(eventTaskSchema).default([]),
// updateEventRequestSchema stays createEventRequestSchema.partial(), so tasks is optional on update
// and undefined means "not sent".

export const addEventTaskSchema = eventTaskSchema.omit({ taskId: true }).strict();
export type AddEventTaskRequest = z.infer<typeof addEventTaskSchema>;

export const patchEventTaskSchema = eventTaskSchema.omit({ taskId: true }).partial().strict();
export type PatchEventTaskRequest = z.infer<typeof patchEventTaskSchema>;

// prepDate accepts null so a client can clear it ("le jour même").
export const patchEventLineSchema = eventRecipeLineSchema
  .omit({ lineId: true, recipeId: true })
  .extend({ prepDate: isoDate.nullable().optional() })
  .partial()
  .strict();
```

`packages/types/src/dto/clients.ts`: `templateLineSchema` is unchanged (it already omits `prepDate`). Templates do not carry tasks in this iteration.

`packages/types/src/entities/settings.ts` (this default list is superseded by 07 section 3.1: `DEFAULT_COURSES` is now her six values without Mignardises or Autre, and this list survives as `LEGACY_DEFAULT_COURSES_V2`):

```ts
export const DEFAULT_COURSES = ["Apéritif", "Entrée", "Plat", "Dessert", "Mignardises", "Autre"];
// The list stored by installs created before Mignardises existed.
export const LEGACY_DEFAULT_COURSES = ["Apéritif", "Entrée", "Plat", "Dessert", "Autre"];
```

### 3.3 Migration and compatibility rules

- No migration script. Old event items have no `tasks` attribute; `EventsService` returns `tasks: []` in memory and writes nothing. The existing `withLineIds` backfill of `lineId` keeps its conditional write; nothing else is written on read.
- `prepDate` is stored only when it differs from the event day. The service deletes the key inside the line (not through a top-level `REMOVE`, which cannot reach inside an array) on every write of `recipes`: `patchLine` with `prepDate: null`, `patchLine` with `prepDate` equal to the event day, `addLine`, `putLines`, `mergeLines`, `create`.
- When `update()` receives a `date` different from the stored one, every line with a `prepDate` and every task move by the same number of days (`shiftPrepDates`). Lines without `prepDate` are untouched.
- Settings: `courses` equal to `LEGACY_DEFAULT_COURSES` (same order, same spelling) is served as `DEFAULT_COURSES`. Nothing is written until the next save from Paramètres, which stores what the page shows. `SettingsService.update()` on a fresh install stores `withDefaults(...)` whole, so production almost surely holds the exact legacy list and the branch will fire there.
- Old frontend builds still open during a deploy: they ignore `tasks` (unknown field), still read `recipes[]` with the same shape, and their `calcEventCost`, `buildCostSnapshot`, `buildGroceryItems`, templates and `Dupliquer` behave as before. They show a moved line on its event day, which is the pre-spec behaviour.
- Costing, grocery lists, cost snapshot, prefill, templates and the client menu PDF read `recipes[]` only and never see tasks. This is the reason tasks are a separate array and not lines without `recipeId`.

---

## 4. Libs in `packages/types`

### 4.1 `src/lib/dates.ts`

```ts
// Whole days from a to b, negative when b is before a.
export function daysBetween(a: string, b: string): number;
// "jeu. 15"
export function shortDayLabel(date: string): string;
```

Tests in `dates.test.ts`: `daysBetween("2026-10-17", "2026-10-24")` is 7, reversed is -7, same day 0, across a month end; `shortDayLabel("2026-10-15")` is `"jeu. 15"`.

### 4.2 `src/lib/planning.ts`

New and changed signatures. Everything else in the file stays.

```ts
import { DEFAULT_COURSES, LEGACY_DEFAULT_COURSES } from "../entities/settings";

// undefined or [] → DEFAULT_COURSES; exactly the legacy list → DEFAULT_COURSES; anything else as is.
export function upgradeCourses(stored: string[] | undefined): string[];

// The day a line is prepared: its prepDate, else the event day.
export function prepDateOf(line: Pick<EventRecipeLine, "prepDate">, event: Pick<AppEvent, "date">): string;
export function isMoved(line: Pick<EventRecipeLine, "prepDate">, event: Pick<AppEvent, "date">): boolean;

// event.tasks ?? []
export function tasksOf(event: Pick<AppEvent, "tasks">): EventTask[];
// Tasks of the event dated `date`.
export function tasksOn(event: Pick<AppEvent, "tasks">, date: string): EventTask[];
// Lines prepared on the event day.
export function ownDayLines(event: Pick<AppEvent, "date" | "recipes">): EventRecipeLine[];
// Lines with a prepDate different from the event day.
export function movedOutLines(event: Pick<AppEvent, "date" | "recipes">): EventRecipeLine[];

// Every explicit prepDate and every task date shifted by daysBetween(event.date, newDate); lines without prepDate untouched.
export function shiftPrepDates(
  event: Pick<AppEvent, "date" | "recipes" | "tasks">,
  newDate: string,
): { recipes: EventRecipeLine[]; tasks: EventTask[] };

// assigneesOf already accepts any { assignedTo?: string[] }, so it serves tasks too. No new function.

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
  // The prep day (was the event day before this spec; no consumer read it).
  date: string;
  eventDate: string;
  moved: boolean;
  notes?: string;
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

// Signature unchanged. Selects by prepDateOf over every event:
// own-day lines first (course order, then array order), then moved-in lines grouped by event
// (events by date then name), each group in course order.
export function prepLinesForDate(events, recipeById, clientById, courses, date): PrepLine[];

// Tasks dated `date`: tasks of events dated that day first (events by date then name), then tasks of other events
// (by event date then name); array order inside an event.
export function prepTasksForDate(events: AppEvent[], clientById: ClientLookup, date: string): PrepTask[];

// prepLinesForDate then prepTasksForDate.
export function dayItems(events, recipeById, clientById, courses, date): DayItem[];

// Generic over anything that carries assignedTo; PersonGroup keeps its `lines` field name.
export interface PersonGroup<T = PrepLine> { personId: string | null; name: string; lines: T[] }
export function groupByPerson<T extends { assignedTo: string[] }>(items: T[], people: Person[]): PersonGroup<T>[];
export function filterByPerson<T extends { assignedTo: string[] }>(items: T[], personId: string): T[];

// groupByRecipe(lines: PrepLine[]) is unchanged; the type keeps tasks out.

export interface WeekMovedIn { event: AppEvent; lines: EventRecipeLine[]; tasks: EventTask[] }

export interface WeekDay {
  date: string;
  // Events dated that day, as before.
  events: AppEvent[];
  // Events not dated that day with at least one line or task prepared that day; event date then name order.
  movedIn: WeekMovedIn[];
  // By event date, unchanged.
  guests: number;
  signedRevenue: number;
  // Own-day lines of the day's events, moved-in lines and every task dated that day.
  linesDone: number;
  linesTotal: number;
}

// Takes every event, not only the week's: a line moved in from next week must render.
export function weekPlan(events: AppEvent[], weekStart: string, people: Person[] = []): WeekPlan;
```

`weekPlan` details: `peopleByDay[date]` = assignees of the day's events (`event.assignedTo`), of their own-day lines, of the moved-in lines and of the tasks dated that day, through `sortPersonIds`. `linesTotal` for a day = `ownDayLines(e).length` summed over `events` + moved-in lines + tasks dated that day; `linesDone` counts `prepStatus === "done"` over the same set. Plan totals sum the days.

`sortEventLines` and `groupByCourse` are unchanged (lines only).

Tests to add in `planning.test.ts`:

- `upgradeCourses`: undefined → `DEFAULT_COURSES`; `[]` → `DEFAULT_COURSES`; legacy list → `DEFAULT_COURSES`; `["Plat", "Dessert"]` → same reference content; a list already containing "Mignardises" → unchanged; legacy list in another order → unchanged.
- `courseIndex("Mignardises", DEFAULT_COURSES)` is 4 and `"Autre"` is 5; `sortEventLines` puts a Mignardises line after Dessert and before Autre.
- `prepDateOf` falls back to the event day; `isMoved` is false without `prepDate` and true with a different date.
- `shiftPrepDates`: event Sat 17 with a line `prepDate` Thu 15 and a task Fri 16, new date Sat 24 → line Thu 22, task Fri 23; a line without `prepDate` stays without; moving backwards works; same date returns equal arrays.
- `prepLinesForDate`: a line with `prepDate` Thu 15 of a Sat 17 event is returned for Thu 15 with `moved: true`, `date: "2026-10-15"`, `eventDate: "2026-10-17"`, and is not returned for Sat 17; own-day lines of a Thu event come before it; two moved-in events are grouped by event date.
- `prepTasksForDate`: a task dated Thu 15 is returned for Thu 15 with `kind: "task"`, `moved` true when its event is Sat 17, assignees inherited from the event when the task has none, `ownAssignment` false in that case.
- `dayItems`: lines then tasks.
- `groupByPerson` and `filterByPerson` with mixed `DayItem[]`.
- `groupByRecipe` on a day that also has tasks: tasks are not in the input type; one test that a `PrepLine[]` from a day with tasks groups the same as without.
- `weekPlan`: an event dated next week with a line `prepDate` inside this week appears in `days[i].movedIn` with that line and not in `days[i].events`; its assignee is in `peopleByDay` of that day; `linesTotal` of Sat 17 excludes the moved-out line and Thu 15 includes it; a task dated Thu 15 counts in Thu 15; `guests` of Thu 15 do not include next week's event.

### 4.3 `src/lib/checklist.ts`

```ts
| { kind: "unassigned"; lineCount: number; taskCount: number; eventCount: number }
```

Rule 5 becomes: when `people.some(p => p.active)`, iterate every event (not only week events). `lineCount` = lines with `prepDateOf(line, e)` in `weekDates` and `assigneesOf(line, e).length === 0`; `taskCount` = tasks with `date` in `weekDates` and no assignee; `eventCount` = distinct events with at least one of either. Item when `lineCount + taskCount > 0`.

Rule 2 `no_menu` stays `e.recipes.length === 0` (a task-only event still has no menu). Rules 6 to 12 unchanged. Grocery coverage stays per event: a line moved into this week from next week's event is not covered by this week's list; this is stated in the move menu caption (6.1) and not fixed here.

Tests in `checklist.test.ts`: a task without a person on a week event gives `unassigned` with `taskCount: 1, lineCount: 0, eventCount: 1`; a line moved into the week from an event dated the next Monday counts in `lineCount` and `eventCount`; a line of a week event moved to the previous week does not count; an event with a task and no line is still `no_menu`.

### 4.4 `src/lib/quantity.ts`

`scaledIngredients` moves here from `apps/frontend/src/pages/admin/Day.tsx` (line 101), unchanged in behaviour, so the day page and the print model share it.

```ts
export interface ScaledIngredient { name: string; qty: number; unit: string }
// Sums the scaled quantity of every ingredient over the lines, per ingredient and unit; unknown ingredient → "Ingrédient inconnu".
export function scaledIngredients(
  recipe: Pick<Recipe, "portions" | "ingredients">,
  lines: { portions: number }[],
  ingredientById: Map<string, Pick<Ingredient, "name">>,
): ScaledIngredient[];
```

Tests in `quantity.test.ts`: 125 g for 10 portions over lines of 60 and 20 → 1000 g; two units of the same ingredient give two entries; unknown ingredient keeps the fallback name; `recipe.portions` 0 is treated as 1.

### 4.5 `src/lib/print.ts` (new) and `src/lib/print.test.ts`

Pure page model for the printed week. The React page only renders it.

```ts
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
  // "Hoona · 30 convives · Menu à emporter · AM, KR" or "Pour samedi 17 · Mariage Dupont"
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

export function weekPrintPages(input: WeekPrintInput): PrintPage[];
```

Rules:

- Whole week (`byPerson` false). One section per day of `weekDates` that has at least one row. `onePagePerDay` true: one page per such section, every page titled with the week; false: one page with all sections. Week title: `Semaine ${n} · ${rangeLabel(d0, d6)} ${year}`. Page caption on the first page only: `${plural(events in week, "événement")} · ${plural(guests, "convive")}`.
- Blocks of a day: one per event dated that day (events by name), heading `${shortEventName} · ${plural(guestCount, "convive")}` + ` · ${prestation label}` when set + ` · ${initials of event.assignedTo joined ", "}` when any. Rows: own-day lines in `sortEventLines` order (course = `courseBucket`, portions, initials from `assigneesOf`, note, done), then tasks dated that day (`course: "Tâche"`, no portions). `movedOutNote` when `movedOutLines(event)` is not empty. Then one block per `movedIn` event (same order rule as `weekPlan`), heading `Pour ${longDayLabel(event.date).toLowerCase()} · ${shortEventName}` (« Pour samedi 17 octobre · Mariage Dupont »), `movedIn: true`, rows = its lines and tasks of that day.
- `withIngredients`: every recipe row gets `ingredients = scaledIngredients(recipe, [{ portions }], ingredientById)`; unknown recipe → label « Recette inconnue » and no ingredients.
- `byPerson` true: one page per active person in settings order, title `${name} · semaine ${n}`, sections = days with at least one row where `assigneesOf` includes the person, blocks keep the event headings, `with` = the other assignees' names. A last page « Sans personne » with the rows that have no assignee, only when non-empty. `personId` set: only that person's page (or an empty array when they have no row). `onePagePerDay` is ignored in this mode.
- Days, sections, pages with no row are dropped.

Tests in `print.test.ts`: two events on Mon and Tue give two pages in date order with `onePagePerDay` and one page with two sections without; rows in course order with the bucket name; a line moved to Thu prints under « Pour samedi 17 octobre · Mariage Dupont » on Thursday, not on Saturday, and the Saturday block carries `movedOutNote: "1 préparation prévue jeu. 15"`; a task prints with `course: "Tâche"` and `portions` undefined; done rows carry `done: true`; `byPerson` gives one page per active person in settings order, a line with two people on both pages with `with` set, « Sans personne » last and only when needed; `personId` gives one page; `withIngredients` scales 125 g for 10 portions to 750 g at 60 portions; an empty week gives `[]`.

`src/lib/index.ts` adds `export * from "./print";`.

### 4.6 Costing, grocery, prefill: no change

`calcLinesRawMaterial`, `buildCostSnapshot`, `prefillFromEvent`, `apps/frontend/src/lib/grocery.ts` and `scaleStepText` read `recipes[]` only. One regression test in `costing.test.ts`: an event with two lines and three tasks costs the same and snapshots the same lines as the event without tasks. Grocery lists stay per event date: « Courses du jour » on Thursday does not include Saturday's fish, and the week list covers the events dated in the week.

---

## 5. Backend

### 5.1 `apps/backend/src/events/events.controller.ts`

Three routes, same shape as the line routes:

```ts
@Post(":id/tasks")        addTask(id, body)            // addEventTaskSchema → events.addTask
@Patch(":id/tasks/:taskId") patchTask(id, taskId, body) // patchEventTaskSchema → events.patchTask
@Delete(":id/tasks/:taskId") removeTask(id, taskId)     // → events.removeTask
```

Every one returns the whole event. Validation errors are `BadRequestException(parsed.error.issues)` as today.

### 5.2 `apps/backend/src/events/events.service.ts`

```ts
type IncomingTask = Omit<EventTask, "taskId"> & { taskId?: string };

// Drops prepDate when it is null or equal to the event day; the attribute lives inside the array, so a top-level REMOVE cannot reach it.
function normalizeLines(lines: EventRecipeLine[], eventDate: string): EventRecipeLine[];
const fillTaskIds = (tasks: IncomingTask[]): EventTask[];

async addTask(eventId: string, task: AddEventTaskRequest): Promise<AppEvent>;
async patchTask(eventId: string, taskId: string, patch: PatchEventTaskRequest): Promise<AppEvent>;   // 404 "Task not found"
async removeTask(eventId: string, taskId: string): Promise<AppEvent>;                              // 404 "Task not found"

// Replaces writeLines; same updatedAt guard, same nextStamp.
private async writeFields(stored: AppEvent, fields: { recipes?: EventRecipeLine[]; tasks?: EventTask[] }): Promise<AppEvent>;
// Mirrors mergeLines: keeps stored fields the caller omitted, new ids for unknown taskIds, absent tasks dropped.
private mergeTasks(stored: EventTask[], incoming: IncomingTask[]): EventTask[];
// withLineIds keeps its conditional backfill of lineId; after it, tasks defaults to [] in memory, no write.
private async withLineIds(event: AppEvent): Promise<AppEvent>;
```

Rules:

- `create()`: `tasks: fillTaskIds(data.tasks)`, `recipes: normalizeLines(fillLineIds(data.recipes), data.date)`.
- `update()`: as today, plus `if (fields.tasks) updates.tasks = this.mergeTasks(stored.tasks ?? [], fields.tasks)`. Then, when `fields.date` is set and differs from `stored.date.slice(0, 10)`: `const shifted = shiftPrepDates({ date: stored.date, recipes: updates.recipes ?? stored.recipes, tasks: updates.tasks ?? stored.tasks ?? [] }, fields.date); updates.recipes = shifted.recipes; updates.tasks = shifted.tasks;`. Finally `if (updates.recipes) updates.recipes = normalizeLines(updates.recipes, fields.date ?? stored.date)`.
- `addLine`, `patchLine`, `putLines`: the computed array passes through `normalizeLines(recipes, stored.date)` before `writeFields`. In `patchLine`, `definedEntries(patch)` keeps `prepDate: null`, and `normalizeLines` deletes the key.
- `addTask`: `writeFields(stored, { tasks: [...tasksOf(stored), { ...task, taskId: randomUUID() }] })`.
- `patchTask`: find by `taskId`, merge `definedEntries(patch)`, write.
- `removeTask`: filter, write.
- `withFreshEvent` is reused by the three task methods; the 409 on a second conditional failure stays `{ code: "LINES_CHANGED" }` so the frontend's existing 409 handling applies.
- `delete()` removes the item, tasks with it. No cascade needed.

Tests in `events.service.spec.ts` (the `FakeDdb` there already handles `null` as delete at top level; the task tests look at the stored line object):

- `get` on an event without `tasks` returns `tasks: []` and makes no update call.
- `addTask` fills `taskId`, bumps `updatedAt`, uses the `#ua = :expected` guard.
- `patchTask` merges and keeps the other fields; unknown id → 404.
- `removeTask` removes; unknown id → 404.
- `patchLine` with `prepDate: null` leaves the stored line without a `prepDate` key.
- `patchLine` with `prepDate` equal to the event day leaves the stored line without `prepDate`.
- `patchLine` with `prepDate` two days before stores it.
- `update` with a new date shifts a line `prepDate` and a task date by the delta and leaves a line without `prepDate` alone.
- `update` with `tasks` merges by `taskId` and keeps a stored `prepStatus` the caller omitted.
- `create` with tasks fills `taskId`.
- `update` with `date` equal to the stored date does not touch `recipes` or `tasks`.

### 5.3 `apps/backend/src/settings/settings.service.ts`

`withDefaults`: `courses: upgradeCourses(stored.courses)`. Nothing else changes. Tests in `settings.service.spec.ts`: a stored list equal to `LEGACY_DEFAULT_COURSES` is served as `DEFAULT_COURSES` and the stored item is untouched; `["Plat"]` is served as is (the existing test already covers it); absent `courses` → `DEFAULT_COURSES` (existing test, now with six items).

### 5.4 `scripts/seed-local.mjs`

- `Gratin dauphinois` gets `defaultCourse: "Plat"`.
- A new recipe `Sablés bretons`, type « Walking dinner », `defaultCourse: "Mignardises"`, 10 portions, 15 g, ingredients beurre, farine, sucre, jaune d'œuf (whatever the seed already has), two techniques.
- Mariage Dupont gets one line of `Sablés bretons` with 60 portions and `prepDate` set to the Thursday before the wedding (2026-10-15), one line of `Poulet basquaise` kept as is, plus two tasks: `{ label: "Dégeler le poisson", date: "2026-10-15" }` and `{ label: "Cuire les sablés", date: "2026-10-16", assignedTo: ["kristoff"] }`.
- The settings item keeps the legacy five-item `courses` list on purpose, so the local stack exercises the read-time upgrade (acceptance 9.6).

### 5.5 Backend test count

75 today; the new cases add about 15 in `events.service.spec.ts` and 1 in `settings.service.spec.ts`.

---

## 6. Screens

Common rules (03-notion-ui.md): every Dialog is a Sheet on touch; every Menu is a Sheet on touch; row actions `.reveal` on pointer and always visible on touch; 44px controls on touch; one primary per page.

### 6.1 Shared frontend pieces

`apps/frontend/src/lib/api.ts`:

```ts
export type EventInput = Omit<Partial<AppEvent>, "recipes" | "tasks"> & {
  recipes?: (Omit<EventRecipeLine, "lineId"> & { lineId?: string })[];
  tasks?: (Omit<EventTask, "taskId"> & { taskId?: string })[];
};
// api.events.tasks
tasks: {
  add: withInvalidate(["events"], (id: string, task: AddEventTaskRequest) => request<AppEvent>(`/admin/events/${id}/tasks`, json("POST", task))),
  patch: withInvalidate(["events"], (id: string, taskId: string, patch: PatchEventTaskRequest) => request<AppEvent>(`/admin/events/${id}/tasks/${taskId}`, json("PATCH", patch))),
  remove: withInvalidate(["events"], (id: string, taskId: string) => request<AppEvent>(`/admin/events/${id}/tasks/${taskId}`, { method: "DELETE" })),
},
```

`apps/frontend/src/lib/use-planning-data.ts`:

```ts
export interface LinePatch { prepStatus?: PrepStatus; portions?: number; notes?: string; assignedTo?: string[]; prepDate?: string | null }
export type TaskPatch = PatchEventTaskRequest;
// added to PlanningData, each replaces the event in state with the response:
addTask: (eventId: string, task: AddEventTaskRequest) => Promise<AppEvent>;
patchTask: (eventId: string, taskId: string, patch: TaskPatch) => Promise<AppEvent>;
removeTask: (eventId: string, taskId: string) => Promise<AppEvent>;
```

`courses` in the hook stays `settings?.courses?.length ? settings.courses : DEFAULT_COURSES` (the API already upgrades).

`apps/frontend/src/components/ui/PropertyList.tsx`: the `relation` kind gains `createLabel?: string`. `RelationValue` renders the create row whenever `onCreateNew` is set, not only with a query: label `q ? "+ Créer « q »" : (createLabel ?? "+ Créer")`, `text-primary`, after a `MenuSeparator`, calling `onCreateNew(query.trim())`. « Aucun résultat » shows only when `onCreateNew` is not set.

`apps/frontend/src/components/admin/MoveToDayMenu.tsx` (new):

```ts
export interface MoveToDayMenuProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement>;
  align?: "left" | "right";
  // "Déplacer « Poulet basquaise »"
  title: string;
  eventDate: string;
  // Current prep day.
  current: string;
  // Days listed in ascending order: the displayed week on the week and day pages, the seven days ending on the event day elsewhere.
  days: string[];
  // date === eventDate means "le jour même"; the caller sends prepDate: null for a line.
  onPick: (date: string) => void;
}
// Shared with the fiche SelectPill: [{ value: eventDate, label: "Le jour même · sam. 17" }, ...days except eventDate as "jeu. 15", { value: "__autre__", label: "Autre date…" }]
export function moveDayOptions(eventDate: string, days: string[]): { value: string; label: string }[];
```

Rendering: `Menu` (Sheet on touch, `title` as the sheet title) with one `MenuRadio` per option of `moveDayOptions` except `__autre__`, the current day checked, then `MenuSeparator`, `MenuItem` « Autre date… » which opens a hidden `<input type="date">` through `showPicker()` (fallback `focus()`) and calls `onPick` on change, then a caption `text-caption text-muted-foreground px-3 pb-2` « Les courses restent celles de l'événement. ».

`apps/frontend/src/components/admin/TaskDialog.tsx` (new):

```ts
export interface TaskDialogValue { label: string; date: string; eventId: string; assignedTo: string[]; notes: string }
export interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  initial: TaskDialogValue;
  // Candidate events, label "Mariage Dupont · sam. 17"; empty hides the field (event page).
  events: { eventId: string; label: string }[];
  people: Person[];
  onSubmit: (value: TaskDialogValue) => Promise<void>;
  // Edit mode only; the dialog asks for confirmation itself.
  onDelete?: () => Promise<void>;
}
```

Copy: title « Nouvelle tâche » / « Modifier la tâche ». Fields in order, `.input-field` with `FieldLabel`: « Quoi » (text, autofocus, placeholder « Cuire les sablés »), « Quel jour » (date), « Pour quel événement » (select, hidden when `events` is empty), « Qui » (toggle chips, same `PERSON_TOGGLE` style as the editor's Équipe; caption « Sans choix, la tâche suit l'équipe de l'événement. »; hidden when `people` has no active person), « Note » (textarea, optional). Caption under the form: « Une tâche ne compte ni dans le coût ni dans les courses. » Footer: « Annuler » (default) and « Ajouter la tâche » (primary) or « Enregistrer » (primary); in edit mode a link-style « Supprimer » (danger) at the left of the footer opens a `Dialog size="sm"` « Supprimer la tâche « Cuire les sablés » ? » with « Annuler » / « Supprimer » (danger). Enter in the « Quoi » field submits. The primary is disabled while « Quoi » is empty.

`apps/frontend/src/components/admin/TaskComposer.tsx` (new, pointer screens only):

```ts
export interface TaskComposerProps {
  date: string;
  // Week events sorted by date then name; the composer hides when empty.
  events: AppEvent[];
  clientById: Map<string, Pick<Client, "name">>;
  // Default event per the rule below; the caller passes it so the week and the day page agree.
  defaultEventId: string;
  onAdd: (eventId: string, label: string) => Promise<void>;
  onClose: () => void;
}
```

A `shadow-card rounded-lg p-1` box replacing the « + Tâche » ghost row: row 1 a borderless input (`h-7 w-full bg-transparent text-sm outline-none`, placeholder « Nouvelle tâche, ex. dégeler le poisson », autofocus); row 2 a `SelectPill colour="gray"` of the events (`shortEventName · sam. 17`, `truncate`, `title` with the full label). Enter adds (`onAdd`), clears the input and keeps the composer open for the next task; Escape, or blur with an empty input, closes; an error toasts « Erreur lors de l'ajout de la tâche » and keeps the text. The composer does not offer people; the row's chips do that after creation.

Default event rule (`defaultTaskEventId(events, date)` in `apps/frontend/src/lib/tasks.ts`, new, 15 lines): the first event dated `date`; else the nearest event after `date` among `events`; else the nearest before; else `""` (the caller hides « + Tâche » and shows nothing). `events` is the displayed week's events on the week and the day page.

`apps/frontend/src/components/admin/NewClientDialog.tsx` (new):

```ts
export interface NewClientInitial { name?: string; kind?: ClientKind; contactName?: string; phone?: string; email?: string }
export interface NewClientDialogProps {
  open: boolean;
  onClose: () => void;
  initial: NewClientInitial;
  existing: Pick<Client, "clientId" | "name">[];
  onCreated: (client: Client) => void | Promise<void>;
  // Shown as "Le lier" when the name matches an existing client.
  onLinkExisting?: (clientId: string) => void | Promise<void>;
}
```

`Dialog size="sm"` (Sheet on touch), title « Nouveau client ». Fields: « Nom du client » (text, autofocus, prefilled `initial.name`), « Type » as two radio tags `Particulier` | `Entreprise` (`Tag` buttons with `aria-pressed`, default `particulier`), « Téléphone » (`tel`, prefilled `initial.phone`), « E-mail » (`email`, prefilled `initial.email`). No separate Contact field: the payload sends `contactName: initial.contactName` when it is non-empty and differs from the final name (case-insensitive), else omits it. Caption under the fields: « Le contact de l'événement est copié sur la fiche client. L'événement garde le sien. » Duplicate guard: when the trimmed name matches an existing client case-insensitively, a line appears above the footer « Un client « Dupont » existe déjà » with a link button « Le lier » (calls `onLinkExisting` and closes) and the primary reads « Créer quand même ». Footer: « Annuler » (default), « Créer et lier » (primary, disabled while the name is empty). Enter submits. Payload: `api.clients.create({ name, kind, contactName?, phone?, email?, templates: [], active: true })`, then `onCreated(client)`. Error toast « Erreur lors de la création du client ».

### 6.2 Week (`apps/frontend/src/pages/admin/Week.tsx`)

Data:

- `filteredEvents = selectedClient ? events.filter(e => e.clientId === selectedClient) : events` (no date filter). `plan = weekPlan(filteredEvents, monday, people)`. `weekTotals = weekPlan(events, monday)`. `weekEvents` (date-filtered) stays for the client filter list, the grocery creation and the checklist's `coveringList`.
- `weekEventsSorted` = `weekEvents` by date then name, passed to the composer and the dialog.

Column content, xl grid, in this order:

1. The day header as today (`dayMeta` now reads « 1 évén. · 30 conv. · 2/3 faites » with the new counts).
2. For each `day.events` event: the card, then (view « lines ») its own-day lines in `sortEventLines` order, then `tasksOn(ev, day.date)`. Card meta: `${guestCount} conv. · ${plural(total, "ligne")}` + `` · ${movedOut} un autre jour `` when `movedOutLines(ev).length > 0`, with `title` « Préparées le jeu. 15, ven. 16 ». When at least one moved-out line or task of this event falls outside `dates`, a caption row under the card (`h-7 text-caption text-muted-foreground px-1 truncate`): « 1 préparation le jeu. 8 » as a `Link` to `/jour/2026-10-08` (one row per distinct outside date).
3. For each `day.movedIn` group: a header row `h-7 text-caption text-muted-foreground px-1 truncate` with a `Link` to `/events/:id` reading « pour sam. 17 · Mariage Dupont » (`title` « Pour samedi 17 octobre · Mariage Dupont »), then its lines and tasks with the same row shapes. In view « events » only the header shows, suffixed « · 2 ».
4. Foot: ghost `Button` « + Nouvel événement » (as today) then ghost « + Tâche » (`Plus` icon). On pointer screens « + Tâche » turns into the `TaskComposer`; on touch it opens `TaskDialog` in create mode with `date = day.date`. Hidden when `defaultTaskEventId` is empty.

Row shapes (xl):

- Line row: `[grip] StatusDot · name (Link to the fiche, draggable={false}) · AssignChips · portions · ⋯`. Unchanged apart from the grip and the ⋯.
- Task row: `[grip] StatusDot · label (button, opens TaskDialog edit) · AssignChips · ⋯`. No portions. `title` = label. Done tasks `text-muted-foreground`.
- ⋯ is an `ActionMenu` `className="reveal"` (44px and visible on touch). Lines: « Déplacer au… », « Assigner », « Ouvrir la fiche ». Tasks: « Modifier… », « Déplacer au… », « Assigner », separator, « Supprimer » (danger, opens the confirm dialog of `TaskDialog`'s delete copy: « Supprimer la tâche « … » ? »). « Déplacer au… » opens `MoveToDayMenu` with `days = dates`, `eventDate = ev.date`, `current = prepDateOf(line, ev)` or `task.date`; `onPick(d)` → `patchLine(ev.eventId, line.lineId, { prepDate: d === ev.date ? null : d })` or `patchTask(ev.eventId, task.taskId, { date: d })`; toast on error « Erreur lors du déplacement ».
- Drag (pointer only, same pattern as `EventDetail.tsx` lines 297 to 330): a `.reveal` `GripVertical` handle before the dot with `draggable`, `onDragStart` sets `drag = { kind, eventId, id, eventDate }`, `onDragEnd` clears; every column body (`div.space-y-2`) is a drop target: `onDragOver` prevents default and sets `dropDay = day.date` (column gets `bg-selected rounded-lg`), `onDrop` calls the same patch as « Déplacer au… » with `d = day.date`. The dragged row is `opacity-40`. Dropping on the current day is a no-op.
- Person filter: `hasPersonLine(ev)` considers own-day lines and tasks of the day; moved-in groups show only matching items and hide when none match; `isOtherPerson` dims non-matching rows as today.

Stacked layout (below xl): same content order per day section; rows are `min-h-11`; the ⋯ `ActionMenu` sits at the row end, always visible; no drag; « + Tâche » ghost row after « + Nouvel événement », also on empty days (where today only the header `+` exists); it opens `TaskDialog`.

`AssignChips` on task rows: `value = assigneesOf(task, ev)`, `picked = task.assignedTo ?? []`, `allowInherit`, `onChange → patchTask(…, { assignedTo })`.

Other changes in `Week.tsx`:

- Remove `PrintMode`, `printMode`, `printTick`, the `useEffect` that calls `window.print()`, the `print` function, `WeekPrint`, `PersonPrint`, `initialsOf`, `PrintProps`, the `<div className="hidden print:block">` section and the `print:max-w-none` class. Keep `print:hidden` on the two layouts.
- ⋯ menu: « Afficher » section unchanged; « Créer les courses de la semaine »; `MenuItem icon={<Printer />} to={printUrl}` « Imprimer la semaine… » where `printUrl = /semaine/${safeWeek}/imprimer${search}` (carries `?personne=` and `?client=`); then the « Partager avec … » items. « Imprimer » and « Imprimer par personne » are removed.
- `WeekChecklist` receives `weekNo={weekNo}`.
- `AssignSheet` receives `days={plan.days}`, `onTask={(eventId, taskId, ids) => patchTask(…)}`.
- `TaskDialog` state: `taskDialog: { mode, eventId, taskId?, initial } | null`; submit → `addTask` or `patchTask`; delete → `removeTask`; toasts « Tâche ajoutée », « Tâche enregistrée », « Tâche supprimée », errors « Erreur lors de l'enregistrement de la tâche ».
- Stat line: unchanged copy; counts come from `weekTotals` so tasks and moved lines are included.

### 6.3 Day (`apps/frontend/src/pages/admin/Day.tsx`)

- `allLines = prepLinesForDate(...)` (now includes moved-in lines), `allTasks = prepTasksForDate(events, clientById, safeDate)`, `allItems: DayItem[] = [...allLines, ...allTasks]`. `lines`/`items` with the person filter through the generic `filterByPerson`.
- Meta: `${plural(dayEvents.length, "événement")} · ${plural(guests, "convive")} · ${plural(items.length, "préparation")} · ${done} faites`; with `?personne=`: `${plural(items.length, "préparation")} · ${done} faites`. Since 06 it sits under the body heading « Mardi 13 octobre » (`h2.text-h3`), not under the page title, which reads « Semaine 42 » on both planning pages.
- Group heading (06 section 4.2): `flex min-h-7 items-center gap-3`; `h3.text-h3` with the title and the gray « pour sam. 17 » tag, then the count « 6 lignes » as `span.shrink-0.text-sm.text-muted-foreground.tabular-nums` right next to the title, not at the far edge; « Partager » and `GroupAssign` take `ml-auto`. First group `mt-6`.
- `Group.lines` becomes `DayItem[]`. Modes:
  - « Événement »: one group per `dayEvents` event with its own-day lines and its tasks of the day (subtitle unchanged); then one group per other event with items today, title `shortEventName`, a gray `Tag` « pour sam. 17 » next to the title, subtitle `pour samedi 17 octobre · 60 convives · Buffet avec service`.
  - « Catégorie »: groups by `course` over `allLines`; a last group « Tâches » with `allTasks` when non-empty.
  - « Recette »: `groupByRecipe(allLines)` as today; a last group « Tâches ».
  - « Par personne »: `groupByPerson(allItems, people)`, lines then tasks inside each person.
- Rows: `LineRow` keeps its shape for lines; second line in « Événement » mode `[course, notes]`, elsewhere `[clientName ?? eventName, moved ? "pour sam. 17" : null, course, notes]`. New `TaskRow` (same `li` layout): status control / dot, label at `text-base`, second line « Tâche » in « Événement » mode or `${clientName ?? eventName} · tâche` elsewhere (+ notes), chips, no portions; the row click opens `TaskDialog` in edit mode. Both rows get a `.reveal` ⋯ at the end: lines « Déplacer au… », « Assigner »; tasks « Modifier… », « Déplacer au… », « Assigner », « Supprimer ». « Déplacer au… » passes `days = weekDates`.
- Ghost « + Tâche » after the groups (pointer: `TaskComposer` with `date = safeDate`, `events` = the week's events; touch: `TaskDialog`). ⋯ gains « Ajouter une tâche… » (`Plus` icon) that opens the dialog. Both hidden when the week has no event.
- Empty states (06 section 4.3): no centred `EmptyState`. After the heading and the meta line, the caption « Aucune préparation ce jour. » (`p mt-4 text-sm text-muted-foreground touch:text-base`), then the ghost « + Nouvel événement » (`Button ghost sm`, `Plus`, link to `newEventUrl`, `mt-1 justify-start text-muted-foreground`), then the ghost « + Tâche » when the week has events. Same words and same ghost rows as an empty week column, at the same left edge. With `?personne=`: « Aucune préparation pour Kristoff ce jour. » then a left-aligned `Button link sm` « Toutes les personnes » (`mt-1`).
- ⋯: « Courses du jour » unchanged (events dated that day), « Imprimer », « Imprimer par personne » unchanged, new `MenuItem icon={<Printer />} to={/semaine/${week}/imprimer${personne ? `?personne=${personne}` : ""}}` « Imprimer la semaine… » after them. The existing print CSS prints the new rows as they are.
- `scaledIngredients` and `ScaledIngredient` come from `@packages/types`; the local copy is deleted.
- `setStatus` and `assignLine` get task counterparts through `patchTask`. `finishEvents` and the `?done=` notice are unchanged (the notice looks up `lines`, recipes only).

### 6.4 Par personne and the share link

`/jour/:date?personne=` and `/jour/:date?mode=personne` inherit 6.3: a person sees their lines, moved-in lines and tasks of the day, in that order, with the same status taps. « Partager » copy and `share()` are unchanged. The `Service` section (events the person is on without an item) now also excludes events where the person has a task that day.

### 6.5 Fiche (`apps/frontend/src/pages/admin/PrepSheet.tsx`)

- `date` becomes `prepDateOf(line, event)` (was `event.date`); the back link, the crumb « Jeu 15 » and `dayLines` use it. `dayLines = prepLinesForDate(events, …, date)` already includes moved-in lines; tasks have no fiche and are never in the pager. Pager caption stays « Ligne n / m ».
- New property after « Événement »: `Property icon={Calendar} label="Jour de préparation" kind="custom"` holding a `SelectPill colour="gray"` with `moveDayOptions(event.date, sevenDaysEndingOn(event.date))`, value `prepDateOf(line, event)`, pill label « Le jour même · sam. 17 » or « jeu. 15 · pour sam. 17 » (the option label plus the suffix when moved); choosing « Autre date… » opens a hidden date input; `onChange(d)` → `patchLine(eventId, lineId, { prepDate: d === event.date ? null : d })`, then `navigate` to the same fiche so the pager rebuilds on the new day. Toast « Déplacée au jeu. 15 ».
- « Événement » property keeps « Mariage Dupont · Sam 17 » (the event day).
- ⋯ gains « Déplacer au… » (same `MoveToDayMenu`, `days` = the seven days ending on the event day).

### 6.6 Event page (`apps/frontend/src/pages/admin/EventDetail.tsx`)

Client:

- `clientsConfigured` state, set to `false` in the existing 503 catch of `api.clients.list()` (line 168). When false, the Client row is `Property kind="computed"` with value « Clients non configurés » linking to `/settings#apropos`; no create path.
- When true: `Property kind="relation" label="Client" … createLabel="+ Nouveau client" onCreateNew={(q) => setNewClient({ name: q })}`. `NewClientDialog` with `initial = { name: q || event.contactName, kind: "particulier", contactName: event.contactName, phone: event.contactPhone, email: event.contactEmail }`, `existing = clients`, `onCreated = async (c) => { setClients([...clients, c]); await saveField({ clientId: c.clientId }, "Client créé et lié"); }`, `onLinkExisting = (id) => saveField({ clientId: id }, "Client lié")`. The event's contact fields are not changed. Client defaults (price, prestation) are not applied here; they are an editor behaviour.

Menu lines:

- A moved line shows a gray `Tag` « jeu. 15 » after the portions (`title` « Préparée le jeudi 15 octobre »).
- ⋯ of a line gains « Déplacer au… » after « Note » (`MoveToDayMenu`, `days` = the seven days ending on the event day). Date change writes `prepDate` (`null` for the event day) through `api.events.lines.patch`.
- `patchLine`'s patch type gains `prepDate?: string | null`.

Tâches section, between « Menu » and « Coûts supplémentaires »:

- `Section title="Tâches" meta={plural(tasks.length, "tâche")}` with action ghost « + Tâche » (`Plus`). Rows (`ROW` class): `LineStatus` · label (button `text-sm`, opens `TaskDialog` edit) · gray `Tag` `shortDayLabel(task.date)` (`title` « Le jeudi 15 octobre ») · `PersonChips` (inherited when the task has none, click opens the `PersonPicker` with `allowInherit`) · `ActionMenu className="reveal"` « Modifier… », « Déplacer au… », « Assigner », separator « Supprimer » (danger).
- Empty: `<p className="text-sm text-muted-foreground">Aucune tâche. Une tâche est un travail sans recette : cuire les sablés, dégeler le poisson.</p>`.
- `TaskDialog` here has `events: []` (field hidden) and `initial.date = event.date`. Calls go through `api.events.tasks.*` and `runLines` (same 409 handling, toast « Le menu a changé ailleurs, il a été rechargé »).

Date change: `saveField({ date })` returns the updated event; `shifted = (event.recipes.filter(l => l.prepDate).length) + tasksOf(event).length`; toast « Date modifiée · 2 préparations déplacées avec l'événement » when `shifted > 0` (singular « 1 préparation déplacée »), else no toast (as today).

Dupliquer: `const shifted = shiftPrepDates(event, duplicateDate)`; payload `recipes = shifted.recipes.map(l => ({ recipeId, portions, course?, notes?, prepDate? }))`, `tasks = shifted.tasks.map(t => ({ label, date, notes? }))` (no status, no people, as lines today).

`exportMenuPdf`, `exportRecipesPdf`, `templateCopy`, « Ajuster les portions » are unchanged (lines only).

### 6.7 Event editor (`apps/frontend/src/pages/admin/EventEditor.tsx`)

Client: delete the inline grey box (`newClientOpen`, `newClientName`, `newClientKind`, `creatingClient`, `createClient`, lines 433 to 452). The `NEW_CLIENT` option and the « + Nouveau client » link open `NewClientDialog` with `initial = { name: "", kind: "particulier", contactName, phone: contactPhone, email: contactEmail }` from the form's contact fields, `existing = clients`, `onCreated = (c) => { setClients(sorted); setClientId(c.clientId); applyClientDefaults(c, prestationTypes); }`, `onLinkExisting = (id) => onClientChange(id)`. Hidden when the clients list came back 503 (`clients` empty and a `clientsConfigured` flag set in the catch).

Menu grouped by category:

- Build `costLines` as today (`lineId` = real id or `local-${i}`), keep `indexById = new Map(costLines.map((l, i) => [l.lineId, i]))`.
- `undefinedLines` = lines where `!rl.course && !recipeById.get(rl.recipeId)?.defaultCourse`; `grouped = groupByCourse(rest, courses, recipeById)`.
- Render each group with `<h3 className="text-base font-semibold">{course}</h3>` (same as `EventDetail.renderCourseBlock`) and the existing `li` per line under it (same « Catégorie » select and « Portions » input); then, when `undefinedLines` is non-empty, a last heading « Non définie » with those lines, the select of the newest one focused (`autoFocus` on the last added index). Changing the select moves the line to its group at once (state change re-groups). Empty groups are not rendered. Sub-total row unchanged under the whole list.
- The select options keep « Non définie » as the empty option when the line has no value.

### 6.8 Paramètres (`apps/frontend/src/pages/admin/Settings.tsx`)

- « Catégories du menu » section: first child `<p className="text-sm text-muted-foreground">Ordre des services sur les menus, la journée, les fiches et l'impression.</p>`. Editing unchanged. (Since 07 section 6.2 the section is « Catégories », merged with « Formats de recette », on the Catalogue tab.)
- Line 135 fallback already uses `DEFAULT_COURSES`; the import picks up the six-item list. No other change. The upgrade rule is server-side (5.3).

### 6.9 Week checklist box (`apps/frontend/src/components/admin/WeekChecklist.tsx`)

Props gain `weekNo: number`.

- Emoji « 📋 ». Title `<span className="inline-flex items-center gap-2">Ce qui manque pour la semaine {weekNo}<Tag colour="gray">{count} {count === 1 ? "point" : "points"}</Tag></span>`, collapsible, open by default on every width (`Week.tsx` keeps `useLocalStorage("recipe-book:checklist-open", true)`).
- Intro line, first child of the body, `text-sm text-muted-foreground mb-1`: « Calculée d'après vos événements, rien à remplir ici. Le lien bleu règle chaque point et la ligne disparaît. »
- List: `<ul>` single column at every width (drop `grid gap-x-8 xl:grid-cols-2` and the `xl:col-span-2` on `to_close` and `unpaid`). Rows keep `ROW`, the bullet and the right-aligned link.
- Row copy (text › link):
  - `client_week`: « Hoona : 5 jours sans événement cette semaine » › « Créer la semaine Hoona »
  - `no_menu`: « Brunch Pirson n'a pas encore de menu » › « Ajouter des recettes »
  - `no_price`: « Lunch étude Delen n'a pas de prix par convive » › « Fixer le prix »
  - `no_type`: « Fondation Thalia n'a pas de type de prestation » › `SelectPill` placeholder « Choisir »
  - `unassigned`: lines only « 5 préparations sans personne (2 événements) »; tasks only « 1 tâche sans personne (1 événement) »; both « 5 préparations et 1 tâche sans personne (2 événements) » › « Choisir qui fait quoi »
  - `groceries`: full « Les courses ne sont pas encore créées (10 événements) » › « Créer la liste de courses »; partial « 3 événements n'ont pas de liste de courses » › « Compléter la liste »
  - `to_close`: « 2 événements passés sont à terminer, puis à facturer » (singular « 1 événement passé est à terminer, puis à facturer »), sub-rows unchanged › « Terminer »
  - `to_invoice`: « Mariage Dupont est terminé · 3 300 € à facturer » › « Créer la facture »
  - `to_invoice_many`: « 5 événements terminés à facturer · 12 300 € » › « Voir à facturer »
  - `to_invoice_month`: unchanged › « Facturer le mois »
  - `unpaid`: « 1 facture n'est pas encore payée · 1 092 € · la plus ancienne du 26/09 » › « Voir les impayés » (phone « Voir »)
  - `empty_week`: « Rien de prévu cette semaine » › « + Nouvel événement »
  - covering list row and `not_configured` row unchanged.
- Success state: `Callout tone="success" emoji="✅" title="Semaine 42 prête, rien ne manque"`.
- First-run guide (`firstRun`) unchanged.

### 6.10 AssignSheet (`apps/frontend/src/components/admin/AssignSheet.tsx`)

Props gain `onTask: (eventId: string, taskId: string, assignedTo: string[]) => void`. Events listed = for each day, `day.events` then `day.movedIn.map(m => m.event)`, each event once (first appearance). For a week event: all its lines and its tasks dated in the week; for an outside event: only its moved-in lines and tasks. Task rows look like line rows with a gray `Tag` « tâche » after the label and toggles writing `onTask`. Counts: `unassigned` = lines + tasks without a person; title « 5 préparations sans personne » / « Toutes les préparations ont une personne »; the red tag per event « 2 préparations sans personne ».

### 6.11 Print view

Route `/semaine/:isoWeek/imprimer` in `apps/frontend/src/App.tsx` inside the `AdminLayout` route, element `WeekPrintPage` (`apps/frontend/src/pages/admin/WeekPrintPage.tsx`, new).

Query parameters: `personne` (person id; also accepted from the week's `?personne=`), `client` (ignored by the print, kept so the back link returns to the filtered week), `par=personne` (per-person pages), `ingredients=1`, `pages=jour|suite`. Resolution for `par`, `ingredients`, `pages`: URL param wins; else `localStorage["recipe-book:print-week"]` (`{ byPerson, withIngredients, onePagePerDay }`); else defaults `{ byPerson: false, withIngredients: false, onePagePerDay: true }`. Every change writes the URL (`replace`) and the storage. A `?personne=` without `par` sets `byPerson` true for that person only.

Page chrome (`no-print`): `useFullBleed(true)`, `useBackLink({ to: /semaine/${isoWeek}${client ? `?client=` : ""}, label: "Semaine 42" })`, `useTopTitle("Imprimer · Semaine 42")`. A toolbar row: ghost `Button` « ‹ Semaine 42 » (hidden on touch, the top bar has it), then at the right a ghost `Button` « Options » (`SlidersHorizontal` icon) opening a `Menu` with `MenuSection « Pages »` → `MenuRadio` « Une page par jour » / « À la suite »; `MenuCheck` « Avec les ingrédients de chaque recette »; `MenuSection « Par personne »` → `MenuRadio` « Toute l'équipe sur une feuille », « Une page par personne », then one radio per active person; and the page primary `Button variant="primary" size="lg"` « Imprimer » (touch label « Imprimer / Partager ») calling `window.print()`. On touch a caption under the toolbar: « L'impression propose aussi l'enregistrement en PDF. » Empty week: `EmptyState` « Rien à imprimer cette semaine. » with « ‹ Semaine 42 »; the primary is disabled.

Content: `pages = weekPrintPages(input)` from `usePlanningData()` (events, recipes, ingredients, settings, clients). Rendered in a `div.print-sheet.mx-auto.max-w-doc`:

- Each page: `<section className={i > 0 ? "print-break" : ""}>`, `<h1 className="text-h2">{page.title}</h1>`, caption `text-sm text-muted-foreground`.
- Each section: `<h2 className="text-h3 mt-6">{heading}</h2>`, caption `text-sm text-muted-foreground`.
- Each block: `<h3 className="mt-4 text-base font-semibold">{heading}</h3>` (moved-in blocks `text-muted-foreground`), `movedOutNote` as `text-sm text-muted-foreground`.
- Rows: `<ul className="mt-1 divide-y divide-border">` with `li.print-row.flex.items-start.gap-2.py-1`: a box `span.inline-block.h-3.w-3.shrink-0.rounded-[2px].border.border-divider.mt-1` (done rows get `bg-foreground` and the row `text-muted-foreground`), the label `flex-1 text-base` with the note under it in `text-sm text-muted-foreground` and `with` as « avec Amélie » in the same line; the course `w-24 text-sm text-muted-foreground`; portions `w-10 text-right tabular-nums` (empty for tasks); initials `w-16 text-sm text-muted-foreground text-right`. With ingredients: under the row, `ul.ml-5.grid.grid-cols-2.gap-x-6.text-sm` of « Poulet 8,4 kg » through `fmtQtyText`.
- Screen preview uses the same markup (no separate preview), so what she sees is what prints.

`apps/frontend/src/index.css`, inside `@media print`, add:

```css
h1, h2, h3 { break-after: avoid; }
.print-row { break-inside: avoid; }
.print-sheet { font-size: 11pt; }
```

`@page { margin: 12mm }` already exists. The day page and the fiche keep their print behaviour. The old `WeekPrint` and `PersonPrint` are gone (6.2).

`docs/redesign/02-planning-iteration.md` section 4.7: replace the third bullet with: « The week: ⋯ › Imprimer la semaine… opens `/semaine/:isoWeek/imprimer`, built from `weekPrintPages()` (05-week-tasks-print.md section 6.11); options Une page par jour, Avec les ingrédients, Par personne. »

---

## 7. Tour (`apps/frontend/src/components/admin/tour-steps.ts`, `docs/redesign/04-first-run-and-tour.md` section 3)

Anchors are unchanged (`week-checklist` still wraps the callout). Copy changes:

- Step 2: title « Ce qui manque pour la semaine », body « Cette case liste ce qui manque avant de lancer la semaine : personnes, courses, prix, factures. Elle se remplit toute seule ; le lien bleu à droite règle chaque point. » (175 characters). `firstRunBody`: « Tant que le carnet est vide, cette case liste les cinq étapes pour démarrer. Ensuite elle dit chaque semaine ce qui manque ; le lien bleu à droite règle chaque point. »
- Step 6 body: « … « Assigner » dans la liste À faire traite toute la semaine. » becomes « … « Choisir qui fait quoi » dans la case Ce qui manque traite toute la semaine. »; `fallbackBody` « … ou « Assigner » dans la liste À faire. » becomes « … ou « Choisir qui fait quoi » dans la case Ce qui manque. »; phone body « Pour attribuer, utilisez « Assigner » dans la liste À faire avant la semaine. » becomes « Pour attribuer, utilisez « Choisir qui fait quoi » dans la case Ce qui manque. ».
- Step 3 body unchanged (« Le + à côté crée un événement ce jour-là » still true).
- `docs/redesign/04-first-run-and-tour.md`: update rows 2 and 6 of the section 3 table with the copy above, and in section 10 rename the expected text of `tour-2-1366.png` and `tour-2-375.png` to the new title; re-capture both.

---

## 8. Build plan

Phases run in sequence. Inside a phase, groups touch disjoint files and can run in parallel. Run `pnpm -r test` and `pnpm -r build` (or the repo's equivalents) at the end of every phase.

### Phase 1. Types and DTOs

- Group A (one builder): `packages/types/src/entities/event.ts`, `packages/types/src/entities/settings.ts`, `packages/types/src/dto/events.ts`, `packages/types/src/dto/dto.test.ts`. Tasks: `EventTask`, `AppEvent.tasks?`, `LEGACY_DEFAULT_COURSES`, new `DEFAULT_COURSES`, task schemas, `prepDate` nullable in the line patch, DTO tests (task schema rejects an empty label and a bad date; line patch accepts `prepDate: null`; template line still rejects `prepDate`; create defaults `tasks` to `[]`).

### Phase 2. Core libs

- Group A: `packages/types/src/lib/dates.ts`, `packages/types/src/lib/dates.test.ts`, `packages/types/src/lib/planning.ts`, `packages/types/src/lib/planning.test.ts`. Tasks: 4.1 and 4.2 in full.
- Group B: `packages/types/src/lib/quantity.ts`, `packages/types/src/lib/quantity.test.ts` (4.4).

### Phase 3. Dependent libs

- Group A: `packages/types/src/lib/checklist.ts`, `packages/types/src/lib/checklist.test.ts` (4.3).
- Group B: `packages/types/src/lib/print.ts`, `packages/types/src/lib/print.test.ts`, `packages/types/src/lib/index.ts` (4.5).
- Group C: `packages/types/src/lib/costing.test.ts` (4.6).

### Phase 4. Backend

- Group A: `apps/backend/src/events/events.service.ts`, `apps/backend/src/events/events.controller.ts`, `apps/backend/src/events/events.service.spec.ts` (5.1, 5.2).
- Group B: `apps/backend/src/settings/settings.service.ts`, `apps/backend/src/settings/settings.service.spec.ts` (5.3).
- Group C: `scripts/seed-local.mjs` (5.4). Re-seed the local stack after this phase.

### Phase 5. Frontend shared pieces

- Group A: `apps/frontend/src/lib/api.ts`, `apps/frontend/src/lib/use-planning-data.ts`, `apps/frontend/src/lib/tasks.ts` (6.1).
- Group B: `apps/frontend/src/components/admin/MoveToDayMenu.tsx`, `apps/frontend/src/components/admin/TaskDialog.tsx`, `apps/frontend/src/components/admin/TaskComposer.tsx` (6.1).
- Group C: `apps/frontend/src/components/admin/NewClientDialog.tsx`, `apps/frontend/src/components/ui/PropertyList.tsx` (6.1).
- Group D: `apps/frontend/src/components/admin/WeekChecklist.tsx`, `apps/frontend/src/components/admin/AssignSheet.tsx` (6.9, 6.10).
- Group E: `apps/frontend/src/components/admin/tour-steps.ts`, `docs/redesign/04-first-run-and-tour.md` (7).

### Phase 6. Pages

- Group A: `apps/frontend/src/pages/admin/Week.tsx` (6.2, including the ⋯ item to the print route and the removal of the old print block).
- Group B: `apps/frontend/src/pages/admin/Day.tsx` (6.3, 6.4, including the ⋯ item).
- Group C: `apps/frontend/src/pages/admin/PrepSheet.tsx` (6.5).
- Group D: `apps/frontend/src/pages/admin/EventDetail.tsx` (6.6).
- Group E: `apps/frontend/src/pages/admin/EventEditor.tsx` (6.7).
- Group F: `apps/frontend/src/pages/admin/Settings.tsx` (6.8).

### Phase 7. Print

- Group A: `apps/frontend/src/pages/admin/WeekPrintPage.tsx`, `apps/frontend/src/App.tsx`, `apps/frontend/src/index.css`, `docs/redesign/02-planning-iteration.md` (6.11).

### Phase 8. Acceptance

- One builder runs section 9 with the screenshot driver and fixes what fails. Files: whatever the checks point at.

---

## 9. Acceptance checklist

Driver: `mkdir -p /tmp/shots/05 && cd /tmp/pw && OUT=/tmp/shots/05 node shot.mjs /tmp/shots/05/routes.json`. Seeded local stack (re-seeded after Phase 4). Widths 375 (touch) and 1366 unless stated. IDs: Mariage Dupont `f03ad103-ce1a-474f-b215-26adb76b75e4` (Sat 17), Hoona Tuesday `d86c822d-0b87-410b-8805-cd921130c477`.

Tests:

- [ ] `packages/types`: vitest passes, 214 plus the new cases (about 45).
- [ ] `apps/backend`: jest passes, 75 plus the new cases (about 16).
- [ ] `apps/frontend`: `tsc -b` passes; `pnpm --filter @apps/frontend lint:type-scale` passes.

Point 1, client:

- [ ] `event-client-menu-1366.png` (`/events/f03ad103…`, click the Client value chevron): the relation menu ends with « + Nouveau client » in blue; typing « Dup » changes it to « + Créer « Dup » ».
- [ ] `event-client-dialog-1366.png` (then click « + Nouveau client »): dialog « Nouveau client », Nom prefilled « Claire Dupont », Particulier selected, phone and e-mail prefilled, caption visible, « Créer et lier » enabled.
- [ ] `event-client-dialog-375.png`: same as a bottom Sheet, 44px fields, Nom focused.
- [ ] Behaviour: after « Créer et lier », the Client property shows the new client as a link to `/clients/:id`, toast « Client créé et lié », `/clients` lists it with the e-mail; the event's Contact row is unchanged.
- [ ] Behaviour: typing the name of an existing client shows « Un client « … » existe déjà · Le lier » and the primary reads « Créer quand même ».
- [ ] Behaviour (API stopped for clients, or `DDB` table name unset): the Client row reads « Clients non configurés » and has no menu.
- [ ] `editor-client-dialog-1366.png` (`/events/new`, click « + Nouveau client »): the same dialog, no grey inline box.

Point 2, categories:

- [ ] `GET http://localhost:3101/api/admin/settings` returns `courses` with six items including « Mignardises » although the seed stored five.
- [ ] `editor-menu-1366.png` (`/events/f03ad103…/edit`, scroll to Menu): headings « Apéritif », « Entrée », « Plat », « Dessert », « Mignardises » in that order, « Sablés bretons » under Mignardises, « Gratin dauphinois » under Plat, no « Non définie » group.
- [ ] `settings-courses-1366.png` (`/settings`): « Catégories du menu » lists six rows and the caption « Ordre des services sur les menus, la journée, les fiches et l'impression. ».
- [ ] `/jour/2026-10-17` « Par catégorie »: the Mignardises group comes after Dessert.

Point 3, week box:

- [ ] `week-1366.png` (`/semaine/2026-W42`, actions: click « Plus tard » on the first-visit callout): callout « 📋 Ce qui manque pour la semaine 42 · 3 points », intro line, three rows in one column with the verb links, the first day header « Lun 12 » above y=420.
- [ ] `week-375.png`: same callout open by default, rows wrap to two lines at most, links at the right.
- [ ] `week-ready-1366.png` (week W45 or any empty-of-gaps week): « ✅ Semaine 45 prête, rien ne manque ».
- [ ] `tour-2-1366.png` and `tour-2-375.png` (start the tour from Settings, ArrowRight once): title « Ce qui manque pour la semaine », the callout open.

Point 4, tasks and moved lines:

- [ ] `week-1366.png` (same capture as above): the Thu 15 column shows, after its own event, the group « pour sam. 17 · Mariage Dupont » with « Sablés bretons » and the task « Dégeler le poisson »; the Fri 16 column shows the task « Cuire les sablés » with the KR chip; the Mariage Dupont card reads « 60 conv. · 7 lignes · 2 un autre jour »; the Sat 17 column does not list Sablés bretons; each column ends with « + Nouvel événement » and « + Tâche ».
- [ ] `week-row-menu-1366.png` (hover the Sablés row, click its ⋯, click « Déplacer au… »): radio list « Le jour même · sam. 17 », « lun. 12 » … « dim. 18 » without sam. 17, « jeu. 15 » checked, « Autre date… », caption « Les courses restent celles de l'événement. ».
- [ ] Behaviour (1366): drag « Sablés bretons » from Thu 15 to Fri 16; the row moves, `GET /admin/events/f03ad103…` shows `prepDate: "2026-10-16"`; drag it to Sat 17; the line has no `prepDate`.
- [ ] `week-composer-1366.png` (click « + Tâche » in the Wed 14 column): the composer box with the placeholder and the pill « Hoona · mer. 14 »; typing « Commander le pain » and Enter adds the row under Hoona's lines and keeps the composer open.
- [ ] `week-task-375.png` (`/semaine/2026-W42`, scroll to Jeu 15): the moved-in group and the task rows with a visible ⋯ at the row end, « + Tâche » under the day.
- [ ] `week-task-dialog-375.png` (tap « + Tâche » on Jeu 15): Sheet « Nouvelle tâche », « Quoi » focused, « Quel jour » 15/10/2026, « Pour quel événement » « Hoona · jeu. 15 », « Qui » chips, caption.
- [ ] `day-1366.png` (`/jour/2026-10-15`): meta reads « 3 événements · 67 convives · n préparations · 0 faites » where n = the day's own lines + 1 (Sablés) + 1 (the task); after the day's events, a group « Mariage Dupont » with the tag « pour sam. 17 » and the subtitle starting « pour samedi 17 octobre »; « Dégeler le poisson » with the second line « Tâche »; « + Tâche » after the groups.
- [ ] `day-personne-375.png` (`/jour/2026-10-16?personne=kristoff`): « Cuire les sablés » listed with « Famille Dupont · tâche » as second line.
- [ ] `fiche-moved-1366.png` (the Sablés fiche `/events/f03ad103…/lines/<lineId>`): property « Jour de préparation » reads « jeu. 15 · pour sam. 17 », the crumb reads « Semaine 42 / Jeu 15 / Sablés bretons », the pager counts Thursday's lines.
- [ ] `event-tasks-1366.png` (`/events/f03ad103…`): the « Tâches » section with two rows, date tags « jeu. 15 » and « ven. 16 », the Sablés line with a gray « jeu. 15 » tag; `event-tasks-375.png` same stacked.
- [ ] Behaviour: change the event date to 2026-10-24 on the event page; toast « Date modifiée · 4 préparations déplacées avec l'événement »; the tasks read « jeu. 22 » and « ven. 23 »; change it back.
- [ ] Behaviour: ⋯ › Dupliquer to 2026-10-24: the copy has the Sablés line with `prepDate` 2026-10-22 and two tasks dated 22 and 23 with no `prepStatus`.
- [ ] `assign-sheet-1366.png` (week › « Choisir qui fait quoi »): Mariage Dupont lists its seven lines and two tasks (gray « tâche » tags), title « n préparations sans personne ».
- [ ] Checklist row on W42 reads « 5 préparations et 1 tâche sans personne (…) » (counts depend on the seed; the word « tâche » must appear).

Point 5, print:

- [ ] `week-menu-1366.png` (click the week ⋯): items « Afficher les lignes », « Afficher les événements », « Créer les courses de la semaine », « Imprimer la semaine… », « Partager avec … »; no « Imprimer » and no « Imprimer par personne ».
- [ ] `print-week-1366.png` (`/semaine/2026-W42/imprimer`, fullPage): toolbar with « ‹ Semaine 42 », Options, blue « Imprimer »; h1 « Semaine 42 · 12 au 18 octobre 2026 »; a section per day with rows (box, name, category, portions, initials); on Thursday the block « Pour samedi 17 octobre · Mariage Dupont » with Sablés bretons and « Dégeler le poisson » (category « Tâche », no portions); on Saturday « 2 préparations prévues mar. 13, jeu. 15 » under the Mariage Dupont heading.
- [ ] `print-week-ingredients-1366.png` (`/semaine/2026-W42/imprimer?ingredients=1`): two-column ingredient lists under each recipe row, quantities in kg or g through `fmtQtyText`.
- [ ] `print-week-person-1366.png` (`/semaine/2026-W42/imprimer?par=personne`): a page per active person (Amélie, Kristoff), then « Sans personne » if needed; a shared line shows « avec Amélie ».
- [ ] `print-week-375.png` (`/semaine/2026-W42/imprimer`): the same content, « Imprimer / Partager » 44px, the caption about PDF, no horizontal scroll.
- [ ] Behaviour (1366, Chrome print to PDF): one day per page, sidebar and toolbar absent, no row cut across a page break; with « À la suite » the days follow each other.
- [ ] `day-menu-1366.png` (`/jour/2026-10-13`, click ⋯): « Imprimer », « Imprimer par personne », « Imprimer la semaine… » present.

Regressions:

- [ ] `/events` table counts stay recipes only (« 7 lignes » for Mariage Dupont).
- [ ] `/events/f03ad103…` ⋯ › « Proposition de menu (PDF) » lists no task.
- [ ] Week › « Créer les courses de la semaine » produces the same items as before the change for W42.
- [ ] `grep -rn "data-tour" apps/frontend/src` still lists the eleven attributes of 04 section 4.6.
- [ ] No new dependency in any `package.json`.

---

## 10. Open questions for Dalia

1. Do you need tasks that belong to no event (« nettoyer la chambre froide ») ? Assumption: no; every task is for an event, and the composer proposes the nearest one.
2. When you change an event's date, should the preparations you moved earlier keep the same number of days before the event ? Assumption: yes; the fish stays two days before, and the page tells you how many moved.
3. Is « Mignardises » a service after Dessert that the client sees on the menu PDF, or only a kitchen category ? Assumption: a service after Dessert, shown on the menu.
4. For the printed week, do you want one day per page by default and the ingredient quantities off by default ? Assumption: yes to both; the options are remembered.
5. When you create a client from an event, are most of them private persons (Particulier) ? Assumption: yes; one tap switches to Entreprise.
6. Was the box you did not understand the « À faire avant la semaine » list, or the « Première visite ? » callout above it ? Assumption: the list; the callout disappears after « Faire la visite » or « Plus tard ».
7. On the phone, do you want a « Partager en PDF » button on the print page in addition to the system print sheet ? Assumption: not now; the system sheet offers PDF.
