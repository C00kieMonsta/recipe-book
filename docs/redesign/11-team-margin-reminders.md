# 11. Team cost, food margin, categories, tablet drag, reminders

Status: spec, from Dalia's fourth feedback (15/10). Depends on 02 (people, assignedTo), 05 (tasks, moved lines, the week box), 06 (shared planning header), 07 (revenue lines, one category list, Odoo mode) and 10 (nothing structural; the Journal is untouched). Three designs and two judges were read; where they disagreed the choice is stated in the section that applies it. Verified facts from the code are marked « verified ».

## 1. Goal and Dalia's nine points

| n | Dalia, verbatim | Decision |
|---|---|---|
| 1 | « équipe: ajouter un tarif horaire, tarif km, un mode de paiement (nowjobs, cash, facture) » | `Person` gains `hourlyRate`, `kmRate`, `paymentMode`. Edited inline in Paramètres › Équipe, same row as today. Rates are her costs, never billed to the client. |
| 2 | « dans l'évent: distinguer équipe en cuisine (et pouvoir lier une recette à une personne) et équipe sur l'évènement, avec possibilité de noter le nombre d'heures travaillées » | `assignedTo` keeps its meaning and is renamed « En cuisine » in the UI (it already is the default of every line and task, so a recipe is linked to a person through the per-line picker that exists). New `serviceTeam` = « Sur place ». New `staff[]` = hours and km per person, one entry per person. A « Heures et frais » section on the event shows the people of both teams with their hours, km and amount; the rates are frozen into the entries when the event is terminated. A new Comptabilité › Équipe tab lists what she owes per month, payment mode and person, with « Copier le tableau » for the Nowjobs portal. Her own hours stay in `hoursSpent`, renamed « Mes heures ». |
| 3 | « dans service livraison autre: ajouter un menu déroulant avec 5 options: service, livraison, location vaisselle, boissons, autre » | `EventRevenueLine.kind` with five values. « Ajouter ▾ » lists the five; each row gets a kind pill before its label. Stored lines keep their label and get a kind inferred from it at read time, written only when the row is edited. VAT stays 21 % by default for every kind. |
| 4 | « la marge doit être calculée uniquement sur la partie food (pas les services) » | Marge food = food revenue HTVA minus matières (recipe cost plus extra costs of kind `matiere`). One helper used by the event page, the editor, `quoteTotals` (Offres, Devis, documents) and `quoteGroups` (assistant). Services, staff cost and the other extra costs show on one caption line with a « Reste » figure, never inside the margin. The ledger-based `margeBrute` of the reports is accounting and stays. |
| 5 | « tout ce qui était en format "zakouskis" changer en catégorie "apéritif", "mignardises" en dessert » | A read-time alias (Zakouskis → Apéritif, Mignardises → Dessert) in `recipeCategoryOf`, `courseOf` and `upgradeCourses`, so the app is right the minute it is deployed. Then a one-time script through the API, dry run by default, rewrites recipes, event lines, offer lines, client templates and the courses list; a second run finds nothing. « Mignardises » leaves the served category list. |
| 6 | « pouvoir déplacer la préparation à un autre jour (en le glissant manuellement dans une autre colonne) : pas encore en ordre » | Two parts. (a) The stacked week and day (every width below the column layout) keep the long press and make the drop targets visible and the gesture robust: the seven-day strip stays sticky at every width, every head tints while a row is lifted, the caption and the ghost read « Déposer sur mar. 13 », rows at rest are `touch-pan-y`, the slop goes from 8 to 12 px, the hint is shown before the first lift, the lift is enabled on every screen (the hook already ignores the mouse). (b) An iPad in landscape (1024 to 1279 px wide) gets the seven columns, with the sidebar reduced to a menu button on the planning pages so a column is about 132 px wide. The laptop at 1280 px and up is unchanged. The cause on her iPad is not known (verified: the Playwright touch profiles match `(hover: none)` and a driver long press moves a line at 768 and 1024 on the seeded app), so the spec fixes discoverability and the drop targets rather than one gate. |
| 7 | « pas de rappel dans la semaine pour assigner une prépa à une personne » | The row depends on people existing (verified: `checklist.ts` item 5 is built only when `people.some(active)`), and she has none. New row « Aucune personne dans l'équipe … » with a link to Paramètres › Équipe. |
| 8 | « pas de rappel de liste de courses » | The rule is right but the box is out of sight: below 1280 px the week scrolls today into view on load (verified: `Week.tsx` line 299, QA P1) and the box sits above the fold; the count tag is also hidden below md. Fix: a « 📋 n » pill in the planning bar at every width that scrolls up and opens the box; the count tag at every width; lists without `eventIds` whose range covers the event count as covering, so the old lists never produce a false row. |
| 9 | « pas de rappel évent à facturer » | The money rows are gated on the ledger table and skipped in Odoo mode (verified: `checklist.ts` items 7 to 10); both apply to her install. New event marker `invoicedAt` (plus optional `invoiceRef`), set by « Marquer comme facturé » on the event page, on the reminder row and on Comptes › À terminer. « à terminer » and « à facturer » are built from events in every mode; the ledger adds its invoices as a second way of being invoiced when it exists. « impayées » stays ledger-only. |

Rules that apply to every point: every new field is optional; nothing stored today changes shape; every reader goes through a lib helper with a fallback; no new DynamoDB table; no new endpoint (the migration is a script on the existing PATCH routes); French copy with vouvoiement.

## 2. Vocabulary

| French (UI) | Meaning | Code |
|---|---|---|
| Équipe | The people in Paramètres | `settings.people`, `Person` |
| Tarif horaire, Tarif km | What she pays a person per hour and per km, HTVA | `Person.hourlyRate`, `Person.kmRate` |
| Paiement · Nowjobs, Cash, Facture | How a person is paid | `Person.paymentMode: PaymentMode` |
| En cuisine | The kitchen team of an event: the default people of its lines and tasks | `AppEvent.assignedTo` (unchanged), `kitchenPeopleOf` |
| Sur place | The people serving on the day | `AppEvent.serviceTeam` |
| Heures et frais | Hours and km per person on an event | `AppEvent.staff: EventStaffEntry[]` |
| Coût équipe | Σ hours × tarif horaire + km × tarif km | `staffCostOf` |
| tarif figé | The rate copied into the entry when the event was terminated | `EventStaffEntry.hourlyRate`, `kmRate` |
| tarif à préciser | Hours typed for a person without a rate | `StaffRate.missing` |
| Mes heures | Dalia's own hours on the event, unchanged field | `AppEvent.hoursSpent` |
| Comptabilité › Équipe | What she owes per month, per mode, per person | `/comptes/equipe`, `payroll()` |
| Nature (d'un supplément) · Service, Livraison, Location vaisselle, Boissons, Autre | The kind of a revenue line | `EventRevenueLine.kind: RevenueLineKind` |
| Marge food, Marge food % | Food revenue HTVA minus matières | `foodMargin` |
| Reste | Signé HTVA minus every cost including the team | `eventResult` |
| Catégorie | The one list of 07; Zakouskis and Mignardises are aliases of Apéritif and Dessert | `aliasCategory`, `LEGACY_CATEGORY_ALIASES` |
| Déposer sur mar. 13 | The drop state of a lifted row | `DayStrip`, `DragGhost` |
| n points | The count of the week box, in the title tag and in the bar pill | `checklistCount`, `PlanningBar.points` |
| Facturé le 15/10 | The event-level invoiced marker | `AppEvent.invoicedAt`, `invoiceRef` |
| Marquer comme facturé | Sets the marker to today | `PATCH /admin/events/:id { invoicedAt }` |

## 3. Data model

### 3.1 Person (`packages/types/src/entities/settings.ts`)

```ts
export type PaymentMode = "nowjobs" | "cash" | "facture";
export const PAYMENT_MODES: PaymentMode[] = ["nowjobs", "cash", "facture"];
export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = { nowjobs: "Nowjobs", cash: "Cash", facture: "Facture" };

export interface Person {
  personId: string;
  name: string;
  initials?: string;
  active: boolean;
  // € per hour HTVA, what she pays; absent means no rate (the event shows « tarif à préciser »).
  hourlyRate?: number;
  // € per km, three decimals allowed (0,345).
  kmRate?: number;
  paymentMode?: PaymentMode;
}
```

`packages/types/src/dto/settings.ts`, `personSchema` stays `.strict()`:

```ts
hourlyRate: moneyNonnegative.optional(),
kmRate: z.number().nonnegative().max(10).optional(),
paymentMode: z.enum(["nowjobs", "cash", "facture"]).optional(),
```

Same `PATCH /admin/settings { people }`; `SettingsService.update` writes the array as sent (verified, no change). A person saved before this spec has none of the three; nothing is written until she edits the row.

### 3.2 Event (`packages/types/src/entities/event.ts`)

```ts
export const REVENUE_LINE_KINDS = ["service", "livraison", "location_vaisselle", "boissons", "autre"] as const;
export type RevenueLineKind = (typeof REVENUE_LINE_KINDS)[number];
export const REVENUE_LINE_KIND_LABELS: Record<RevenueLineKind, string> = {
  service: "Service",
  livraison: "Livraison",
  location_vaisselle: "Location vaisselle",
  boissons: "Boissons",
  autre: "Autre",
};
// Every kind defaults to 21 %; she changes the VAT pill on the row when needed.
export const REVENUE_LINE_DEFAULT_VAT: VatRate = 21;

export interface EventRevenueLine {
  label: string;
  amount: number;
  vatRate: VatRate;
  // Absent on lines stored before this spec; revenueLineKindOf infers it from the label.
  kind?: RevenueLineKind;
}

// Hours and km of one person on the event, whatever the role; one entry per person.
export interface EventStaffEntry {
  personId: string;
  hours?: number;
  km?: number;
  // Copied from the person by completionFields when the event is terminated, so a later rate change leaves the figure.
  hourlyRate?: number;
  kmRate?: number;
}

export interface AppEvent {
  /* unchanged fields */
  // personIds, the default for its lines and tasks (« En cuisine »).
  assignedTo?: string[];
  // personIds serving on the day (« Sur place »); never inherited by lines or tasks.
  serviceTeam?: string[];
  // Absent reads as []; written by the Heures et frais section and by completionFields.
  staff?: EventStaffEntry[];
  // Dalia's own hours (« Mes heures »); unchanged, still read by Au réel and the objectives.
  hoursSpent?: number;
  // YYYY-MM-DD, set by « Marquer comme facturé »; absent when not invoiced or when the invoice lives in the ledger only.
  invoicedAt?: string;
  // Free text, « N° Odoo », 40 chars.
  invoiceRef?: string;
}
```

`packages/types/src/dto/events.ts`:

```ts
export const eventRevenueLineSchema = z
  .object({ label: z.string().trim().min(1).max(60), amount: moneyNonnegative, vatRate, kind: z.enum(REVENUE_LINE_KINDS).optional() })
  .strict();

export const eventStaffEntrySchema = z
  .object({
    personId: z.string().min(1).max(40),
    hours: z.number().nonnegative().max(200).optional(),
    km: z.number().nonnegative().max(5000).optional(),
    hourlyRate: moneyNonnegative.optional(),
    kmRate: z.number().nonnegative().max(10).optional(),
  })
  .strict();
// Refined on the array, not on the object, so .partial() on the fields schema keeps working.
export const eventStaffSchema = z
  .array(eventStaffEntrySchema)
  .max(30)
  .refine((v) => new Set(v.map((s) => s.personId)).size === v.length, "personId dupliqué");

// eventFieldsSchema gains:
serviceTeam: personIds.optional(),
staff: eventStaffSchema.optional(),

// updateEventRequestSchema .extend gains (not on create):
invoicedAt: isoDate.nullable().optional(),
invoiceRef: z.string().trim().max(40).nullable().optional(),
```

Offers reuse `eventRevenueLineSchema` (verified, `dto/offers.ts` line 24), so `Offer.revenueLines` accept `kind` with no further change. Client templates do not carry revenue lines.

### 3.3 Compatibility rules for production data

- A person without rates costs 0 and is listed with « tarif à préciser » wherever hours exist for them; the payroll counts them in `missingRate`.
- An event without `serviceTeam` reads `[]`; without `staff` reads `[]`; `assignedTo` is untouched, so every line and task keeps its inherited people, the Par personne view, `DayHeads.peopleByDay`, `AssignSheet` and the print are unchanged.
- An entry with `hourlyRate` or `kmRate` wins over the person's current rate (frozen). An entry without them uses the current rate.
- A revenue line without `kind` is classified by `revenueLineKindOf` from its label; the stored item is rewritten only when the row is edited, and then the inferred kind is written with it.
- `invoicedAt` absent means not marked. In app mode with the ledger, a ledger invoice entry whose `eventIds` contains the event also counts as invoiced (union). A marked event that later gets a ledger invoice is fine; a mark set by mistake is removed by « Annuler le marquage ».
- A recipe whose stored `category`, `defaultCourse` or `type` is Zakouskis or Mignardises (any case, singular or plural) reads Apéritif or Dessert through `recipeCategoryOf`; an event line, offer line or template line whose `course` is one of them reads the alias through `courseOf`. The stored values change only when the script runs.
- `settings.courses` stored as the legacy five, the legacy six or any list containing an alias key is served without the alias keys; the stored list changes on the next Paramètres save or when the script runs.
- Grocery lists without `eventIds` (the old Événements page) cover an event when their `range` contains the event date. Lists with `eventIds: []` cover nothing.

### 3.4 Settings (`packages/types/src/entities/settings.ts`)

```ts
export const LEGACY_TYPE_TO_CATEGORY: Record<string, string> = { Lunch: "Plat", "Menu semaine": "Plat", Zakouskis: "Apéritif", Mignardises: "Dessert" };
// Old category values merged into her six; matched case-insensitively, singular or plural.
export const LEGACY_CATEGORY_ALIASES: Record<string, string> = { zakouskis: "Apéritif", mignardises: "Dessert" };
export function aliasCategory(value: string): string;           // "Mignardise" → "Dessert", "ZAKOUSKIS" → "Apéritif", anything else as is
export function isLegacyCategory(value: string | undefined): boolean;
```

`LEGACY_DEFAULT_COURSES` and `LEGACY_DEFAULT_COURSES_V2` stay (they identify stored lists). The comment on them changes: both now upgrade to `DEFAULT_COURSES`. `DEFAULT_COURSES` is unchanged (six values).

## 4. Libs in `packages/types`

All exported through `src/lib/index.ts`. Money through `round2` and `sumMoney`.

### 4.1 `src/lib/staff.ts` (new)

```ts
export interface StaffRate { hourly: number; km: number; frozen: boolean; missing: boolean }
export interface StaffCostRow {
  personId: string;
  hours: number;           // 0 when absent
  km: number;
  amount: number;          // round2(hours × hourly + km × km)
  rate: StaffRate;         // missing = (hours > 0 || km > 0) && no hourly rate from the entry or the person
  cuisine: boolean;        // in assignedTo or on any line or task of the event
  service: boolean;        // in serviceTeam
}
export interface StaffCost { rows: StaffCostRow[]; hours: number; km: number; amount: number; missingRate: string[] }

// Ids in assignedTo plus every line.assignedTo and task.assignedTo, distinct, order of first appearance.
export function kitchenPeopleOf(e: Pick<AppEvent, "assignedTo" | "recipes" | "tasks">): string[];
// Union of kitchen, serviceTeam and staff personIds, in settings order then unknown ids (sortPersonIds).
export function staffPeopleOf(e: Pick<AppEvent, "assignedTo" | "serviceTeam" | "recipes" | "tasks" | "staff">, people: Person[]): string[];
export function staffEntryOf(e: Pick<AppEvent, "staff">, personId: string): EventStaffEntry | undefined;
// entry.hourlyRate ?? person.hourlyRate, same for km; frozen when the entry carries a rate.
export function staffRateOf(entry: EventStaffEntry | undefined, person: Person | undefined, hasWork: boolean): StaffRate;
// One row per person of staffPeopleOf, rows without hours and km included (amount 0) so the section can list the team.
export function staffCostOf(e: AppEvent, people: Person[]): StaffCost;
// Adds or patches the entry of personId; an entry left with neither hours nor km is dropped.
export function upsertStaffEntry(staff: EventStaffEntry[] | undefined, personId: string, patch: Pick<Partial<EventStaffEntry>, "hours" | "km">): EventStaffEntry[];
export function removeStaffEntry(staff: EventStaffEntry[] | undefined, personId: string): EventStaffEntry[];
// Copies the person's current rates onto every entry that has none; entries of unknown people are left as they are.
export function freezeStaffRates(staff: EventStaffEntry[] | undefined, people: Person[]): EventStaffEntry[];
// The one patch every « Terminer » sends: status, the cost snapshot and the frozen staff. staff is omitted when the event has none.
export function completionFields(
  e: AppEvent,
  people: Person[],
  recipeCostById: Map<string, number>,
  recipePortionsById: Map<string, number>,
): { status: "completed"; costSnapshot: CostSnapshotRequest; staff?: EventStaffEntry[] };
```

`completionFields` replaces the three places that build `{ status: "completed", costSnapshot }` today: `EventDetail.tsx` line 394, `AFacturer.tsx` `complete`, `Week.tsx` line 512 and `Day.tsx` line 618 `closeEvent`. « Reprendre le coût » (`retakeCost`) sends `{ costSnapshot, staff: freezeStaffRates(...) }` so both snapshots move together. Reopening an event leaves the frozen rates.

### 4.2 `src/lib/payroll.ts` (new)

```ts
export type PayrollMode = PaymentMode | "none";
export const PAYROLL_MODE_ORDER: PayrollMode[] = ["nowjobs", "cash", "facture", "none"];
export const PAYROLL_MODE_LABELS: Record<PayrollMode, string> = { nowjobs: "Nowjobs", cash: "Cash", facture: "Facture", none: "À préciser" };

export interface PayrollEventLine { eventId: string; label: string; date: string; hours: number; km: number; amount: number; missingRate: boolean }
export interface PayrollPerson { personId: string; name: string; mode: PayrollMode; hours: number; km: number; amount: number; missingRate: boolean; events: PayrollEventLine[] }
export interface PayrollGroup { mode: PayrollMode; label: string; hours: number; km: number; amount: number; people: PayrollPerson[] }
export interface Payroll { from: string; to: string; groups: PayrollGroup[]; hours: number; km: number; amount: number; missingRate: number }

// Events dated from..to inclusive, any status; entries with hours or km > 0 only; inactive people listed when they have work;
// person rows in settings order; groups in PAYROLL_MODE_ORDER, empty groups dropped; label = shortEventName(event, client).
export function payroll(events: AppEvent[], people: Person[], clientById: ClientLookup, from: string, to: string, mode?: PayrollMode): Payroll;
// Plain text for the clipboard: a line per group « Nowjobs », then one line per person « Kristoff\t18 h\t24 km\t280,56 € ».
export function payrollText(p: Payroll): string;
// CSV with ; and decimal comma: Mode;Personne;Événement;Date;Heures;Km;Montant, one line per event line, a total line per person.
export function payrollCsv(p: Payroll): string;
```

### 4.3 `src/lib/revenue.ts` (new)

```ts
// The stored kind, else from the accent-folded lower-cased label: starts with "service" → service; starts with "livraison" → livraison;
// contains "vaisselle" or starts with "location" → location_vaisselle; contains "boisson" → boissons; else autre.
export function revenueLineKindOf(line: Pick<EventRevenueLine, "label" | "kind">): RevenueLineKind;
export function revenueByKind(e: Pick<AppEvent, "revenueLines">): Record<RevenueLineKind, number>;
export function newRevenueLine(kind: RevenueLineKind): EventRevenueLine;   // { kind, label: REVENUE_LINE_KIND_LABELS[kind], amount: 0, vatRate: 21 }
// Changes the kind; the label is replaced by the kind label when it is empty or equals any kind label, otherwise kept.
export function withRevenueKind(line: EventRevenueLine, kind: RevenueLineKind): EventRevenueLine;
// « Service 300 € · Livraison 150 € », kinds in REVENUE_LINE_KINDS order, zero kinds dropped, fmtEur0.
export function revenueByKindLabel(e: Pick<AppEvent, "revenueLines">): string;
```

The Devis « Carte · … » lines start with « Carte », so they read `autre`; the Devis keeps its own `isCarteLine` test.

### 4.4 Food margin: `src/lib/costing.ts`, `src/lib/offers.ts`, `src/lib/quote.ts`

`costing.ts` gains:

```ts
// rawMaterial plus the extra costs of kind matiere.
export function foodCostOf(cost: Pick<EventCostBreakdown, "rawMaterial" | "extras">): number;
export interface FoodMargin { foodHtva: number; foodCost: number; margin: number; marginPct: number }
// marginPct = margin / foodHtva × 100, round2, 0 when foodHtva is 0.
export function foodMargin(foodHtva: number, foodCost: number): FoodMargin;
// signedHtva − costTotal − staffAmount.
export function eventResult(signedHtva: number, costTotal: number, staffAmount: number): number;
```

`offers.ts` `QuoteTotals` changes: `margin = foodHtva − foodCost` where `foodCost = rawMaterial + extrasByKind(input.extraCosts).matiere`; `marginPct` is a percent of `foodHtva` (comment updated); `marginPerGuest = margin / guests`; new `foodCost: number` and `resultHtva: number = totalHtva − costTotal`. `costTotal`, `costPerGuest`, `totalHtva`, `totalTvac`, `linesHtva` unchanged. `offerSummary` keeps its four fields (its `marginPct` is now the food one).

`quote.ts` `QuoteGroupsTotals` changes: `marginHtva = foodHtva − cost`, `marginPct = pct(marginHtva, foodHtva)`, new `resultHtva = htva − cost`. Group figures are already food-only. The assistant quote tool inherits this.

### 4.5 Categories: `src/lib/planning.ts`

- `recipeCategoryOf` returns `aliasCategory(...)` of today's result, applied to each of the three sources (`category`, `defaultCourse`, mapped `type`).
- `courseOf` returns `aliasCategory(line.course)` when the line has a course.
- `upgradeCourses(stored)`: `undefined` or `[]` → `DEFAULT_COURSES`; the legacy five or the legacy six → `DEFAULT_COURSES`; any other list → the list without alias keys (case-insensitive), or `DEFAULT_COURSES` when the filter empties it. The comment on the function changes accordingly.
- `categoryOptions` unchanged (it reads `recipeCategoryOf`, so an alias never appears as an extra tab).

### 4.6 Reminders and invoicing: `src/lib/checklist.ts`, `src/lib/reports.ts`, `src/lib/prefill.ts`

`reports.ts`:

```ts
// Ids covered by a facture or comptoir entry, plus events carrying invoicedAt.
export function invoicedEventIds(entries: LedgerEntry[], events: Pick<AppEvent, "eventId" | "invoicedAt">[] = []): Set<string>;
```

`auReel` and `aFacturer` pass their `events` to it, so a marked event leaves « à facturer » and the Au réel event rows once invoiced (same rule as a ledger invoice today).

`prefill.ts`: `eventBillingStatus(eventId, entries, event?)` returns `"facture"` when `event?.invoicedAt` is set and the ledger says nothing more (acompte_recu and paye from the ledger keep priority).

`checklist.ts`:

```ts
export type ChecklistItem =
  | /* unchanged kinds */
  | { kind: "no_people"; lineCount: number; taskCount: number; eventCount: number }
  | { kind: "to_invoice"; eventId: string; name: string; date: string; htva: number; action: InvoiceAction }
  | { kind: "to_invoice_many"; count: number; htva: number; action: InvoiceAction }
  | { kind: "to_invoice_month"; clientId: string; clientName: string; ym: string; eventIds: string[]; htva: number; action: InvoiceAction };
// "ledger": the invoice is created in the Journal (app mode with the ledger table); "mark": the row stamps invoicedAt.
export type InvoiceAction = "ledger" | "mark";
```

Rules, replacing items 5 and 7 to 10:

- Item 5: the loop over unassigned lines and tasks of the week runs whether or not people exist. With at least one active person: `unassigned` as today. With none: `no_people` with the same counts. Nothing when the counts are 0.
- Item 6: `covered` also includes events whose date (`YYYY-MM-DD`) falls inside `list.range` when `list.eventIds` is absent. `weekGroceryList` applies the same rule for the muted « Courses · liste du … » row.
- Items 7 to 10: `const action: InvoiceAction = invoicing === "externe" || !ledgerConfigured ? "mark" : "ledger"`; `const invoiced = invoicedEventIds(ledgerConfigured ? entries : [], events)`. `to_close` is built in every mode. `to_invoice` / `to_invoice_many` and `to_invoice_month` are built in every mode from completed events not in `invoiced`, carrying `action`. `unpaid` is built only when `ledgerConfigured && invoicing !== "externe"`. `not_configured` unchanged (muted, not counted).
- Order: client_week, no_menu, no_price, no_type, no_people or unassigned, groceries, to_close, to_invoice*, to_invoice_month, unpaid, empty_week, not_configured.

### 4.7 Test cases

`dto/settings.test.ts` (new, person): accepts the three fields; refuses `hourlyRate: -1`; refuses `hourlyRate: 18.123` (two decimals); accepts `kmRate: 0.345`; refuses `kmRate: 11`; refuses `paymentMode: "virement"`; a person without the fields still passes.

`dto/dto.test.ts` (events): `kind: "boissons"` accepted, `kind: "vin"` refused, a line without kind passes; `staff` with two entries of the same personId refused, 31 entries refused, an entry with `hours: 6, km: 12` passes, `hours: -1` refused; `serviceTeam: []` passes, 11 ids refused; update accepts `invoicedAt: "2026-10-15"` and `null`, refuses `"15/10/2026"`; create refuses `invoicedAt`; `invoiceRef` of 41 chars refused.

`lib/staff.test.ts`: `kitchenPeopleOf` unions event, line and task ids in order of first appearance without duplicates; `staffPeopleOf` puts settings order first and an unknown id last; `staffCostOf` with Kristoff 18 €/h and 0,30 €/km, 6 h and 12 km gives amount 111,60, hours 6, km 12; a person with hours and no rate gives amount 0, `rate.missing` true and appears in `missingRate`; a person in the team without hours gives a row with amount 0 and `missing` false; a frozen `hourlyRate: 20` on the entry wins over the person's 18; `upsertStaffEntry` creates, patches and drops an entry left empty; `freezeStaffRates` fills absent rates and leaves present ones; `completionFields` returns status completed, the snapshot of `buildCostSnapshot`, and omits `staff` when the event has none.

`lib/payroll.test.ts`: two people with modes nowjobs and cash over two events in October give two groups with the right subtotals; a person without mode lands in « À préciser »; an event dated outside from..to is excluded; the same person over two events sums hours and amount and lists two event lines; an inactive person with hours is listed; `mode` filter keeps one group; `payrollText` has one line per person with a tab-separated « 18 h », « 24 km », « 280,56 € »; `payrollCsv` has the header and a decimal comma.

`lib/revenue.test.ts`: « Service » → service, « Livraison Bruxelles » → livraison, « Location vaisselle » and « Location de nappes » → location_vaisselle, « Boissons soft » → boissons, « Pourboire » → autre, « Carte · Menu » → autre, « Sérvice » (accent) → service; a stored `kind: "autre"` wins over the label « Service »; `revenueByKind` sums two service lines; `withRevenueKind` replaces « Livraison » and keeps « Livraison Bruxelles »; `newRevenueLine("boissons")` is `{ kind, label: "Boissons", amount: 0, vatRate: 21 }`.

`lib/costing.test.ts`: `foodCostOf` adds matière extras only; `foodMargin(2000, 650)` gives margin 1350 and 67,5; `foodMargin(0, 10)` gives marginPct 0; `eventResult(1700, 770, 184)` gives 746.

`lib/offers.test.ts`: existing expectations at lines 116, 117, 155, 156 and 336 recomputed with the food rule (the builder prints the new values and checks them by hand once); new: a revenue line of 450 € leaves `margin` unchanged and moves `resultHtva` by 450; an extra cost of kind `location` lowers `resultHtva` and `costTotal` but not `margin`; one of kind `matiere` lowers both.

`lib/quote.test.ts`: lines 87, 88, 99, 100, 122, 123, 171 and 175 updated: with the 150 € extra at 21 % the totals keep `marginHtva: 2680, marginPct: 97.45` and gain `resultHtva: 2830`.

`lib/planning.test.ts`: `recipeCategoryOf({ type: "Zakouskis" })` is Apéritif; `({ defaultCourse: "Mignardises" })`, `({ category: "Mignardises" })`, `({ category: "mignardise" })` are Dessert; `({ type: "Buffet" })` stays Buffet; `courseOf({ course: "Mignardises" }, recipeInApéritif)` is Dessert; `upgradeCourses` of the legacy five and of the legacy six is `DEFAULT_COURSES` (lines 354 to 358 rewritten); a custom list `["Apéritif", "Mignardises", "Plat"]` becomes `["Apéritif", "Plat"]`; `["Mignardises"]` becomes `DEFAULT_COURSES`; the tests at lines 83 to 142 that bucket a Mignardises line « after Dessert when the list carries it » and « under Autre when the list lacks it » become « under Dessert » in both cases; `categoryOptions` with a recipe on Mignardises adds no extra value.

`lib/checklist.test.ts`: no people and two unassigned lines → `no_people { lineCount: 2, taskCount: 0, eventCount: 1 }` and it is counted; inactive people only → `no_people`; people present → `unassigned`, never `no_people`; no unassigned work → neither; a list without `eventIds` whose range covers the week covers its events; a list with `eventIds: []` and a range covers nothing; a list with eventIds covers only those ids; externe mode, ledger unconfigured, one completed event → `to_invoice` with action mark; the same event with `invoicedAt` → nothing; four such events → `to_invoice_many` with action mark; app mode with the ledger: a ledger invoice or `invoicedAt` both remove the row and action is ledger; `to_close` is built when `ledgerConfigured` is false; `unpaid` absent when the ledger is unconfigured or in externe mode; a monthly client in externe mode gives `to_invoice_month` with action mark.

`lib/reports.test.ts`: `invoicedEventIds(entries, events)` contains an event marked by `invoicedAt` and one covered by an entry; `aFacturer` drops a marked event from `toInvoice`; `auReel` drops its event row.

`lib/prefill.test.ts`: `eventBillingStatus` returns « facture » for a marked event without entries, and « paye » when a paid ledger invoice exists.

Expected count: about 60 new or changed cases in `packages/types` (495 today).

## 5. Backend (`apps/backend`)

### 5.1 `src/events/events.service.ts`

- `CLEARABLE_TEXT` gains `"invoiceRef"` so `""` is stored as a REMOVE. `invoicedAt: null` is a REMOVE through `ddb.update` already (verified, `shared/ddb.service.ts` line 79); no other change.
- `staff` and `serviceTeam` are stored as sent through `update` (`sanitizeFields` spreads them) and `create` (`withoutNull`). No normalisation: the client drops empty entries through `upsertStaffEntry`.
- `events.service.spec.ts`: « stores serviceTeam and staff as sent and serves [] when absent »; « update with invoicedAt sets it, null removes the attribute »; « update with invoiceRef "" removes it »; « a frozen hourlyRate on a staff entry survives a later update of another field ».

### 5.2 Settings and recipes

- `src/settings/settings.service.spec.ts` lines 216 to 256: the legacy five and the legacy six are served as the six `DEFAULT_COURSES` (no Mignardises), nothing written; a stored custom list with « Mignardises » is served without it.
- `src/recipes/recipes.service.spec.ts` line 101: a row `{ recipeId: "r6", name: "Mini quiches", type: "Zakouskis" }` reads category Apéritif and a row `{ recipeId: "r7", name: "Sablés", type: "Walking dinner", defaultCourse: "Mignardises" }` reads Dessert; `update` with `{ category: "Mignardises" }` stores Dessert in both `category` and `type` (the service mirrors through `recipeCategoryOf`, verified lines 75 to 79; it must pass the value through `aliasCategory` first).

### 5.3 Assistant (`src/assistant/assistant.tools.ts`)

- The `revenueLines` input item (line 303) gains `kind: oneOf(REVENUE_LINE_KINDS, "Nature : service, livraison, location_vaisselle, boissons, autre.")`, optional.
- `get_event` summary (line 815) adds `surPlace: personNames(event.serviceTeam)`, `staff: (event.staff ?? []).map(s => ({ person: personName, hours, km }))`, `invoicedAt: event.invoicedAt ?? null`, and `foodMargin: foodMargin(foodRevenue(event), foodCostOf(cost)).margin` next to `totalHtva`.
- The quote tool is unchanged in code; its `totals.marginPct` is now food-only and the system prompt sentence about the margin, if any, says « marge sur le food ».

### 5.4 Scripts

`scripts/migrate-categories-2026-10.mjs` (new; header, `call`, `must` and login copied from `scripts/merge-categories.mjs`; `API`, `SMOKE_EMAIL`, `SMOKE_PASSWORD`, `--apply`):

1. `GET /api/admin/recipes`. A recipe is pending when its raw `type`, `defaultCourse` or `category` matches `/^(zakouskis?|mignardises?)$/i` (the served `category` is already aliased after the deploy, so detection reads the raw fields). Target: Apéritif for zakouskis, Dessert for mignardises. Line: `Mini quiches · Zakouskis → Apéritif`. Write: `PATCH /api/admin/recipes/:id { category }`.
2. `GET /api/admin/events`. For each line whose raw `course` matches: `Mariage Dupont · 17/10 · ligne Sablés bretons · Mignardises → Dessert`. Write: `PATCH /api/admin/events/:id/lines/:lineId { course }` (verified: `patchEventLineSchema` accepts `course`; guarded per write). On 409 `LINES_CHANGED`: re-read the event once and retry; on a second 409 print `conflit, à relancer` and continue.
3. `GET /api/admin/offers`. For each offer with a matching line course: `Formule Apéro · 1 ligne · Mignardises → Dessert`. Write: `PATCH /api/admin/offers/:id { lines }` with every line and the mapped course (the offer editor writes the whole array the same way).
4. `GET /api/admin/clients` (a 503 prints `clients non configurés, étape ignorée`). For each template line with a matching course: `Hoona · modèle Mardi · 1 ligne · Mignardises → Dessert`. Write: `PATCH /api/admin/clients/:id { templates }` with every template as served (`templateId` included; `clientTemplateSchema` is strict, so the script copies only the keys of that schema: templateId, name, weekday, guestCount, sellingPricePerGuest, prestationType, vatRate, recipes with recipeId, portions, course, notes, extraCosts, notes, assignedTo).
5. `GET /api/admin/settings`. Prints `courses : …`. With `--apply`, `PATCH /api/admin/settings { courses }` with the served list (already without the aliases), which persists the removal; same pattern as `merge-categories.mjs`.
6. Summary: `12 recette(s), 3 ligne(s) d'événement, 1 formule(s), 0 modèle(s) client à mettre à jour`, then `dry run, nothing written (add --apply)` or the per-step `written` lines. A second `--apply` run prints `rien à faire` for every step.

`scripts/list-grocery-lists.mjs` (new, read-only): logs in, `GET /api/admin/grocery-lists`, prints one line per list `2026-10-12 · Courses du 13 au 19 oct. · 3 événement(s) · plage 2026-10-13 → 2026-10-19` (`sans événements` or `sans plage` when absent) and the counts of lists without `eventIds`. Used in the runbook to check her data before the release.

`scripts/smoke-local.mjs` line 98: `r.body.courses.length === 6` with the comment « the legacy five-item list is served as the six defaults ». `scripts/seed-local.mjs` keeps its Mignardises data (lines 278, 366, 519) so the local stack exercises the alias and gives the script work.

`README.md`: two rows in the scripts table and a runbook subsection (section 7 below).

## 6. Screens

Notion rules of 03 apply: properties for facts, pastel tags, `SelectPill` for a changeable tag, Sheets on touch, one primary per page, 44 px targets on `(hover: none)`.

### 6.1 Paramètres › Équipe (`apps/frontend/src/pages/admin/Settings.tsx`, section at line 891)

Caption under the title: « Les personnes de votre équipe, leur tarif et leur mode de paiement. Le tarif sert au coût équipe des événements et à Comptabilité › Équipe ; il n'est jamais facturé au client. Pour leur envoyer leur liste, ouvrez un jour, puis Par personne, puis Partager. »

Row, after the initials cell and before « Actif »:

- `OptNumValue` tarif horaire: `value={p.hourlyRate}`, `min={0}`, `step={0.5}`, `suffix="€/h"`, `placeholder="€/h"`, `ariaLabel="Tarif horaire"`, `className="w-24 text-right"`.
- `OptNumValue` tarif km: `value={p.kmRate}`, `min={0}`, `step={0.01}`, `suffix="€/km"`, `placeholder="€/km"`, `ariaLabel="Tarif km"`, `className="w-24 text-right"`.
- `SelectPill` paiement: `value={p.paymentMode ?? ""}`, `placeholder="Paiement"`, `colour="gray"`, `aria-label="Mode de paiement"`, `title="Mode de paiement"`, options `[{ value: "", label: "Aucun" }, { value: "nowjobs", label: "Nowjobs" }, { value: "cash", label: "Cash" }, { value: "facture", label: "Facture" }]`; `""` writes `undefined`.

`ROW` gets `flex-wrap md:flex-nowrap` so on phones the three controls wrap under the name. `handleSave` (line 484) maps `hourlyRate`, `kmRate`, `paymentMode` (undefined when blank; `round2` on the hourly rate, three decimals kept on km). No Sheet, no table: one tap per field at every width (the Dalia judge rejected the Sheet of design 3).

### 6.2 Paramètres › Catalogue (`Settings.tsx` line 741)

Under the categories list, one muted caption: « Zakouskis et Mignardises sont regroupés dans Apéritif et Dessert. » The list itself no longer shows « Mignardises » (served list). Adding « Mignardises » by hand is refused on save with the toast « Mignardises est regroupé dans Dessert ».

### 6.3 Event page (`apps/frontend/src/pages/admin/EventDetail.tsx`)

Property list (line 1113):

- `👩‍🍳` « En cuisine »: chips and `PersonPicker` on `assignedTo`, picker title « En cuisine », unchanged behaviour. Property `sub` (muted, pointer screens): « Par défaut pour chaque recette et tâche ; chaque ligne peut avoir sa personne. »
- `🛎` « Sur place »: chips and `PersonPicker` on `serviceTeam`, picker title « Sur place », `IconButton` aria-label « Modifier l'équipe sur place ». Empty: the `+` only.
- `⏱` « Mes heures »: the existing `hoursSpent` number property, renamed. Title attribute: « Vos propres heures sur l'événement ; les heures de l'équipe se notent dans Heures et frais. »

KPI row (line 1135), four tiles:

- « Coût matières », value `fmtEur(foodCost)`, sub unchanged (`costSub`).
- « Revenu food HTVA », value `fmtEur(foodHtva)`, sub `+ 450 € service, livraison, autres` when lines exist (`fmtEurShort`).
- « Marge food », value `fmtEur(margin)`, sub « négative » when < 0, else « hors service et équipe ».
- « Marge food % », value as today.

Captions under the tiles, in this order:

1. New, shown when `linesHtva > 0 || staff.amount > 0 || (cost.total − foodCost) > 0`: « Reste 746 € · signé 1 700 € HTVA · service, livraison, autres 450 € · équipe 184 € · autres coûts 120 € ». Parts at 0 are dropped. « autres coûts » = `cost.total − foodCost` (personnel, location, transport, autre). Reste = `eventResult(signedRevenue(event), cost.total, staff.amount)`.
2. The existing TVAC line, unchanged.

Sections, in order: Menu, Tâches, **Heures et frais** (new), Pièces jointes, Coûts supplémentaires, Service livraison autres, Facturation.

Section « Heures et frais »:

- `meta`: « 14 h · 184 € » (`staff.hours`, `staff.amount`; « 14 h » alone when the amount is 0 and no rate is missing; « 14 h · tarif à préciser » when `missingRate` is not empty).
- `action`: ghost « + Personne » opening a `PersonPicker` titled « Ajouter une personne » (adds a staff entry `{ personId }` for someone outside both teams; the entry is dropped again when no number is typed).
- Rows, one per `staffCostOf(event, people).rows`, `ROW` of the page: `PersonChip`, name (`personName`), gray `Tag` « cuisine » and/or « sur place » (derived, both when both), `EditableInlineNum` hours (`placeholder="h"`, `suffix=" h"`, `min 0`, step 0,5), `EditableInlineNum` km (`placeholder="km"`, `suffix=" km"`, `min 0`), then the amount: muted `fmtEur(row.amount)` with `title="Tarif figé à la clôture"` when `rate.frozen`, or a gray `Tag` « tarif à préciser » wrapped in a `Link` to `/settings#equipe` (state.from) when `rate.missing`, or nothing when no work. ⋯ (touch) or `×` (pointer, `.reveal`): « Retirer les heures » (removes the entry; the person stays in the team).
- Typing a number calls `save({ staff: upsertStaffEntry(event.staff, personId, { hours }) })`.
- Empty state (no row): « Personne dans l'équipe de cet événement. Choisissez qui est en cuisine et sur place dans les propriétés ci-dessus, puis notez ici les heures et les kilomètres de chacun. »
- Footer caption when `cost.extras.personnel > 0`: « + 120 € de personnel en coûts supplémentaires (forfaits, agence) ; les heures de l'équipe se notent ci-dessus. » This is the one rule for the double-count risk: both figures count in « Reste », both are visible side by side, and the « personnel » kind of « Coûts supplémentaires » is for lump sums only.
- `EditableInlineNum` gains an optional `placeholder` prop shown when `value` is `undefined` (`components/ui/editable.tsx` line 144); callers that pass a number are unchanged.

Section « Service, livraison, autres » (line 1226) uses the shared component of 6.5.

Statut property (line 1107):

- Tags: ledger tags as today; then, when `event.invoicedAt` is set and no ledger invoice tag is shown, `StatusTag status="invoiced" label={`Facturé le ${dayMonthLabel(event.invoicedAt)}`}` with `title={event.invoiceRef ? `N° ${event.invoiceRef}` : undefined}`.
- ⋯ menu (line 780), after « Reprendre le coût »: « Marquer comme facturé » (hidden when invoiced by either source) → `saveField({ invoicedAt: todayIso() }, "Marqué comme facturé")`; when marked: « Annuler le marquage facturé » → `saveField({ invoicedAt: null, invoiceRef: null }, "Marquage retiré")`. In app mode with the ledger the item reads « Marquer facturé sans écriture » so it is not mistaken for « Créer la facture ».

Section « Facturation » (line 1271), when `invoicing === "externe"` or `ledgerNotConfigured`:

- Not marked: the existing note or callout, then a default button « Marquer comme facturé » (size md, `w-full md:w-auto`), same action as the menu item.
- Marked: a `ListRow` « Facturé le 15/10 » with trailing `EditableInlineText` value `invoiceRef` placeholder « N° Odoo » (`saveField({ invoiceRef: v.trim() || null })`) and a link button « Annuler ».
- In app mode with the ledger the section is unchanged; the marker only shows as the Statut tag.

« Terminer l'événement » (`complete`, line 394) sends `completionFields(event, people, recipeCostById, recipePortionsById)`. « Reprendre le coût » sends `{ costSnapshot: snapshot(), staff: freezeStaffRates(event.staff, people) }` when the event has staff.

### 6.4 Event editor (`apps/frontend/src/pages/admin/EventEditor.tsx`)

- Line 540: the « Équipe » `FieldLabel` becomes « En cuisine »; a second block « Sur place » with the same `PERSON_TOGGLE` buttons on a `serviceTeam` state, sent on save. Hours are typed on the event page only.
- Tiles (lines 800 to 810): first row « Coût matières HTVA » (`foodCost`), « Revenu food HTVA », « Service, livraison, autres », « Revenu total HTVA »; second row « Marge food HTVA », « Marge food % », « Coût/convive HTVA » (`totalCost / guests`, label unchanged), « Marge food/convive ». Margin and % from `foodMargin(foodHtva, foodCostOf(breakdown))`.
- The revenue lines block (line 751) uses the shared component of 6.5 in `mode="draft"`.

### 6.5 Shared component `components/admin/RevenueLines.tsx` (new)

One component replaces the four copies (EventDetail line 1226, EventEditor line 751, OfferDetail line 382, Devis line 828). Props: `lines: EventRevenueLine[]`, `onChange(next)`, `readOnly?`, `max = 10`, `focusAmountOnAdd = true`, `title = "Service, livraison, autres"`, `meta` (the page passes `fmtEur(total) HTVA` plus `revenueByKindLabel` when lines exist: « 450 € HTVA · Service 300 € · Livraison 150 € »).

- `action`: a `Menu` « Ajouter ▾ » (`Button variant="ghost" size="sm" icon={<Plus />}`, `aria-haspopup="menu"`) with five `MenuItem`s « Service », « Livraison », « Location vaisselle », « Boissons », « Autre ». Choosing one appends `newRevenueLine(kind)` and focuses the amount cell (the `revenueRefs` trick that exists). Disabled at `max`.
- Row: `SelectPill` kind (`value={revenueLineKindOf(line)}`, five options with their labels, `colour="gray"`, `aria-label="Nature"`, `title="Nature"`, `onChange={(k) => update(i, withRevenueKind(line, k))}`), then `InlineLabel` label (placeholder = the kind label; the `datalist` and `REVENUE_LABELS` constants are deleted), then amount, then the VAT pill, then ⋯ « Retirer » on touch or `×` on pointer.
- Editing any cell of a stored line without kind writes the inferred kind with it (`{ ...line, kind: revenueLineKindOf(line), ...patch }`).
- Empty state: « Aucun supplément. Service, livraison, location de vaisselle, boissons ou autre, facturés en plus du prix food, TVA 21 % par défaut. »
- The Devis keeps its « Carte · » lines in the same list; their pill reads « Autre ».

### 6.6 Devis, Offres, documents

- `Devis.tsx` line 961: tiles « Marge food / conv. », « Marge food % », « Total HTVA », « Total TVAC »; a caption under the tiles « Marge sur le food uniquement, hors service, livraison et autres. »
- `OfferDetail.tsx` line 357: « Marge food / conv. », « Marge food % », same caption.
- `Offers.tsx`: sort item « Marge food % » (line 205) and column header « Marge food % » (line 454).
- `DocSectionBlock.tsx` line 181: « marge food 62 % ».
- `OfferDocumentDetail.tsx` line 480: no code change (reads `offerSummary.marginPct`, now food-only); listed because its figure changes.

### 6.7 Comptabilité › Équipe (`apps/frontend/src/pages/admin/comptes/Equipe.tsx`, new; route `equipe` in `App.tsx` under `/comptes`; tab `{ key: "equipe", to: "/comptes/equipe", label: "Équipe" }` added last in `ComptesLayout.tsx` `TABS`; intro « Ce que vous devez à chacun d'après les heures et kilomètres notés sur les événements, par mode de paiement. »)

Loads through `useReportInputs(year)` (verified: a 503 on the ledger or the clients table sets `notConfigured` and continues; the page ignores `notConfigured`). Needs `events`, `settings.people`, `clients`.

- Toolbar: `DateNav` by month (same as Au réel, default current month, « Aujourd'hui »), right group: `SelectPill` « Paiement » (options « Tous », « Nowjobs », « Cash », « Facture », « À préciser »), ⋯ with « Exporter en CSV » (downloads `equipe-2026-10.csv` from `payrollCsv`), and the default button « Copier le tableau » (`navigator.clipboard.writeText(payrollText(p))`, toast « Tableau copié »).
- Stat row: `MoneyTile`s « Total » (`fmtEur(p.amount)`), « Heures » (`14 h`), « Km » (`36 km`), « Personnes » (count); a red sub « 1 personne sans tarif » on « Total » when `missingRate > 0`.
- Body: one `Section` per group, title « Nowjobs » / « Cash » / « Facture » / « À préciser », meta « 420,00 € · 18 h ». Rows (`ListRow`): `PersonChip`, name, trailing « 18 h · 24 km · 280,56 € »; a gray `Tag` « tarif à préciser » linking to `/settings#equipe` when `missingRate`. Tapping a row expands its event lines (same `SectionToggle` pattern as the Journal month): « sam. 17 oct. · Mariage Dupont · 8 h · 24 km · 130,56 € », each linking to `/events/:id`.
- Caption under the stat row: « Événements du mois d'après leur date. Les tarifs figés à la clôture d'un événement priment sur les tarifs actuels ; les autres suivent Paramètres › Équipe. »
- Empty state: « Aucune heure notée en octobre. Sur un événement, section Heures et frais, notez les heures de chacun. »
- No primary button on the page (« Copier le tableau » is default).

### 6.8 Comptabilité › À facturer / À terminer (`comptes/AFacturer.tsx`)

- `complete` uses `completionFields` with `settings.people`.
- In externe mode or when `notConfigured`: a section « Événements terminés à facturer » after « Événements passés à terminer », rows from `aFacturer(...).toInvoice` (which now excludes marked events), each with a link button « Marquer facturé » (`api.events.update(id, { invoicedAt: today })`, toast « Marqué comme facturé », reload) and the event link. Empty: « Rien à facturer. » The monthly groups get « Marquer le mois facturé » (patches every event of the group, sequentially). The callout « Comptabilité non configurée » stays above when `notConfigured`.
- In app mode with the ledger: unchanged, plus marked events leave the list through the union.

### 6.9 Événements (`pages/admin/Events.tsx`)

- `FILTERS` gains `{ key: "a_facturer", label: "À facturer" }` after « Terminés », shown only when `settings.invoicing === "externe"` or `health.tables.ledger` is false (`fetchHealth` exists in `lib/api.ts`). Filter: `status === "completed"` and not in `invoicedEventIds(health.tables.ledger ? entries : [], events)` (the page loads `api.ledger.list()` when the table exists, so the tab agrees with the week box and Comptes › À terminer). `?filtre=a-facturer` in the URL selects it (the checklist many-row links there).
- Status column: `StatusTag completed` as today; for completed events in those modes a gray `Tag` « à facturer » after it, or `StatusTag invoiced` « Facturé » when in that set.

### 6.10 Recettes

No code change beyond the lib: the tabs come from `categoryOptions(courses, recipes)`, so a recipe on Mignardises sits under « Dessert » and no « Mignardises » tab exists. The recipe editor category select lists the served `courses`. Acceptance only.

### 6.11 Week and day on tablets and phones

**Screens.** `apps/frontend/tailwind.config.ts` `theme.extend.screens`:

```ts
cols: { raw: "(min-width: 1280px), ((min-width: 1024px) and (orientation: landscape))" },
rail: { raw: "(min-width: 1024px) and (max-width: 1279.98px) and (orientation: landscape)" },
```

`apps/frontend/src/lib/screens.ts` (new) exports `COLS_QUERY` and `RAIL_QUERY` with the same strings for `useMediaQuery`.

**Column layout on `cols`.** Every `xl:` class that selects the column layout becomes `cols:`: `Week.tsx` line 827 (`cols:grid`), line 927 (`cols:hidden`), `Day.tsx` (its column body and stacked body, grep `xl:`), `PlanningFrame.tsx` line 38 (`hidden cols:block`, `cols:sticky cols:top-0 cols:z-20`), `PlanningBar.tsx` line 75 (`cols:hidden`). The scroll-to-today effect (`Week.tsx` line 299) tests `useMediaQuery(COLS_QUERY)` instead of `window.innerWidth >= 1280`. `AdminLayout` padding (`xl:px-24`) stays.

**Sidebar on `rail`.** `AdminLayout.tsx`: `const rail = useMediaQuery(RAIL_QUERY) && /^\/(semaine|jour)\b/.test(location.pathname)`; passes `rail` to `AdminSidebar`. `AdminSidebar.tsx`: when `rail`, the in-flow `<aside>` is not rendered, the phone top bar is not rendered either, and a fixed `IconButton` (left-2 top-2, z-30, aria-label « Menu », icon `Menu`) opens the existing left `Sheet` drawer. The stored `recipe-book:sidebar-collapsed` preference is not touched. Arithmetic at 1024 landscape: 1024 − 2 × 24 padding − 6 × 8 gaps = 928 px, 132 px per column; with the sidebar in flow it would be 98 px, which is why the rail is not optional.

**Column rows on `rail`.** In the column `ItemRow` (`Week.tsx` line 1212 and the Day equivalent) the `AssignChips` wrapper gets `rail:hidden`; the people stay in the row `title` (« Sablés bretons · Kristoff ») and in ⋯ › Assigner. The event card keeps its chips.

**Lift on every screen.** `Week.tsx` line 361 and `Day.tsx` line 456: `enabled: true` (the hook accepts `touch` and `pen` pointers only, verified line 232, so a mouse never lifts). `canDrag` stays `!touch` for the HTML5 drag in columns. An iPad with a trackpad in the stacked list has « Déplacer au… » only; stated in the hint.

**Rows at rest.** Both row shapes get `touch-pan-y` (Tailwind) so iOS keeps vertical scrolling and never starts a horizontal pan during the hold. `use-long-press-drag.ts` default `slop` 8 → 12.

**Sticky strip and heads.** `PlanningBar.tsx` line 75 wrapper: `no-print sticky top-topbar z-20 -mx-4 bg-background px-4 py-1 md:top-0 md:mx-0 md:px-0 cols:hidden` (the `md:static` goes). The stacked day head (`Week.tsx` line 939): `sticky top-[96px] md:top-[52px] z-10` (the `md:static` goes); the builder measures the strip height at md (44 px cell + 8 px padding) and adjusts the 52. While `lift.dragging`, every head and strip cell already tints (`bg-selected`) and the target rings; unchanged.

**Caption and ghost.** `DayStrip.tsx` line 54: `{dropDay ? `Déposer sur ${shortDayLabel(dropDay)}` : "Déposez sur un jour"}`, the target in `text-primary font-medium`. `DragGhost.tsx` line 48: `→ mar. 13` becomes « Déposer sur mar. 13 »; the fallback becomes « Glissez vers un jour ». `DayHeads.tsx` cells on the column layout: the caption row of the targeted head reads « Déposer ici » in primary (a `dropDay === date` branch under the day name).

**Hint before the first lift.** `Week.tsx` and `Day.tsx`: `const [dragHint, setDragHint] = useState(() => touch && !readTour().touchDragHintSeen)`; the caption shows when `dragHint && rows > 0` (rows = `plan.linesTotal` on the week, `items.length` on the day). `DRAG_HINT` becomes: « Pour déplacer une préparation, maintenez-la un instant puis glissez-la sur un jour de la bande en haut. « Déplacer au… » reste dans le menu ⋯. » The × writes `touchDragHintSeen`; the first lift writes it too (unchanged `onStart`).

**Auto-scroll.** Unchanged (56 px and 24 px zones, verified in the hook).

**What she sees.** iPad landscape (1024 to 1194 px): the menu button top-left, the week title, the toolbar, the seven heads (sticky), the seven columns; holding a row 450 ms lifts it, every column tints, the finger moves to another column, the head under it reads « Déposer ici », release writes `prepDate`. iPad portrait (768 to 834 px) and phones: the stacked list; holding a row lifts it; the strip under the toolbar is always on screen and reads « Déposer sur mar. 13 » while the finger is on « M 13 »; the day heads also accept the drop. Laptop 1280 px and up: unchanged.

### 6.12 Reminders (`components/admin/WeekChecklist.tsx`, `PlanningBar.tsx`, `Week.tsx`, `Day.tsx`)

**Count at every width.** `WeekChecklist.tsx` line 139: the « n points » `Tag` drops `hidden md:inline-flex`.

**Pill in the bar.** `PlanningBar` prop `points?: { count: number; onOpen: () => void }`. Rendered in both right groups before the ⋯ when `count > 0`: `Button variant="subtle" size="sm"` with text `📋 {count}` and, from md, ` points`; `title="{count} points à régler cette semaine"`, `aria-label` the same. `onOpen` (Week and Day): `window.scrollTo({ top: 0, behavior: "smooth" })`, `setChecklistOpen(true)`, then focus the Callout title button and add a `ring-2 ring-primary` class for 1 200 ms. Hidden on first run. Both pages pass `{ count: checklistCount(checklist), onOpen }`.

**Rows, every kind, condition and action** (`ChecklistRow`):

| Kind | Condition | Sentence | Action |
|---|---|---|---|
| client_week | unchanged | unchanged | unchanged |
| no_menu, no_price, no_type | unchanged | unchanged | unchanged |
| no_people | no active person and ≥ 1 unassigned line or task in the week | « Aucune personne dans l'équipe : {5 préparations et 1 tâche} à répartir cette semaine » | `ActionLink` « Paramètres › Équipe » → `/settings#equipe` (short « Équipe » below md) |
| unassigned | ≥ 1 active person and unassigned work | unchanged | « Choisir qui fait quoi » (unchanged) |
| groceries | week events not covered (eventIds or legacy range) | unchanged | unchanged; muted « Courses · liste du … › Voir » when all covered |
| to_close | upcoming events dated before today, not invoiced, every mode | « 2 événements passés sont à terminer, puis à facturer » (the « , puis à facturer » now in every mode) | « Terminer » per event (`completionFields`) |
| to_invoice, action mark | completed, not invoiced, ≤ 3 rows | « Mariage Dupont est terminé · 1 250 € à facturer » | `Button` « Marquer facturé » (one tap: `onMarkInvoiced(eventId)` → `api.events.update(id, { invoicedAt: today })`, toast « Marqué comme facturé ») and `ActionLink` « Ouvrir » → `/events/:id#facturation` |
| to_invoice, action ledger | app mode with the ledger | unchanged | « Créer la facture » (unchanged) |
| to_invoice_many, mark | > 3 rows | « 5 événements terminés à facturer · 3 800 € » | « Voir » → `/events?filtre=a-facturer` |
| to_invoice_many, ledger | | unchanged | « Voir à facturer » → `/comptes/a-facturer` |
| to_invoice_month, mark | monthly client, past month | « Hoona : septembre à facturer · 4 événements · 2 100 € » | « Marquer le mois facturé » (`onMarkInvoiced` for each eventId) |
| to_invoice_month, ledger | | unchanged | « Facturer le mois » (unchanged) |
| unpaid | app mode with the ledger only | unchanged | unchanged |
| empty_week, not_configured | unchanged | unchanged | unchanged |

New prop `onMarkInvoiced: (eventIds: string[]) => Promise<void>` on `WeekChecklist`; the Day page runs it itself (no `toWeek` intent needed, it is one PATCH).

**What she should see on the iPad week** (portrait, below `cols`), on arrival after the deploy: the toolbar with « 📋 4 » next to ⋯ and +, the sticky strip, today's section (the page still scrolls to today). One tap on the pill: the page scrolls up and the box opens with, in her likely state (no people, no clients table, no ledger, Odoo mode): « Aucune personne dans l'équipe : 6 préparations à répartir cette semaine › Paramètres › Équipe », « Les courses ne sont pas encore créées (3 événements) › Créer la liste de courses », « 2 événements passés sont à terminer, puis à facturer › Terminer », « Mariage Dupont est terminé · 1 250 € à facturer › Marquer facturé · Ouvrir », then the muted « Clients et comptabilité non configurés › Paramètres ». In landscape (`cols`), the box sits under the bar above the heads row, open by default, and the pill is there too.

### 6.13 Print and assistant

- `lib/print.ts` and the printed week: kitchen assignments only, unchanged. The event PDF (`menu-pdf.ts`) prints revenue lines by VAT rate, unchanged.
- Assistant: 5.3. The `get_event` summary names the two teams (« people » stays the kitchen, « surPlace » added) so « qui sert samedi ? » can be answered.

## 7. Migration runbook for the owner

Run after the deploy that carries this spec. Every command is safe to re-run. `$API` is the API base URL.

1. Check what the categories script would do (nothing is written):

   ```bash
   API=$API SMOKE_EMAIL=<admin email> SMOKE_PASSWORD=<password> node scripts/migrate-categories-2026-10.mjs
   ```

   Read the lines. Recipes read `Mini quiches · Zakouskis → Apéritif`; event lines, offers and client templates have their own lines; the last line counts them.

2. Apply, then run the dry run again and check it prints `rien à faire` for every step:

   ```bash
   API=$API SMOKE_EMAIL=<admin email> SMOKE_PASSWORD=<password> node scripts/migrate-categories-2026-10.mjs --apply
   API=$API SMOKE_EMAIL=<admin email> SMOKE_PASSWORD=<password> node scripts/migrate-categories-2026-10.mjs
   ```

   Run it when Dalia is not editing an event; a line reports `conflit, à relancer` if she was, and a second `--apply` picks it up.

3. Check her grocery lists before telling her about the reminder:

   ```bash
   API=$API SMOKE_EMAIL=<admin email> SMOKE_PASSWORD=<password> node scripts/list-grocery-lists.mjs
   ```

   Lists `sans événements` and `sans plage` cover nothing, so the week box will say the courses are not created for those weeks; that is the row she asked for. Lists with a range and no events cover their range.

4. Nothing to run for points 1 to 4 and 6 to 9. Tell Dalia: add her team in Paramètres › Équipe with the rates and the payment mode; the first week after the deploy lists every completed event since the start under « à facturer », one tap per row marks them.

Local check before the release: the seeded app has Mignardises on « Sablés bretons », on one event line and on one offer line; run the dry run against `http://localhost:3101`, then `--apply`, then the dry run again.

## 8. Build plan

Phases are sequential. Groups inside a phase touch disjoint files and can be built in parallel; the phase's tests run once every group has landed. Baselines: 495 tests in `packages/types`, 284 in the backend.

**Phase 1, types and libs (`packages/types`)**

- G1 person and categories: `src/entities/settings.ts`, `src/dto/settings.ts`, `src/dto/settings.test.ts` (new), `src/lib/planning.ts`, `src/lib/planning.test.ts`.
- G2 event model, staff, payroll, revenue kinds: `src/entities/event.ts`, `src/dto/events.ts`, `src/dto/dto.test.ts`, `src/lib/staff.ts`, `src/lib/staff.test.ts`, `src/lib/payroll.ts`, `src/lib/payroll.test.ts`, `src/lib/revenue.ts`, `src/lib/revenue.test.ts`, `src/lib/index.ts`. G2 reads `Person.hourlyRate`, `kmRate`, `paymentMode` from G1; both land before the phase compiles.
- G3 food margin: `src/lib/costing.ts`, `src/lib/costing.test.ts`, `src/lib/offers.ts`, `src/lib/offers.test.ts`, `src/lib/quote.ts`, `src/lib/quote.test.ts`.
- G4 reminders and invoicing: `src/lib/checklist.ts`, `src/lib/checklist.test.ts`, `src/lib/reports.ts`, `src/lib/reports.test.ts`, `src/lib/prefill.ts`, `src/lib/prefill.test.ts`. G4 reads `AppEvent.invoicedAt` from G2.

**Phase 2, backend and scripts**

- G5 events: `apps/backend/src/events/events.service.ts`, `events.service.spec.ts`.
- G6 settings and recipes: `apps/backend/src/settings/settings.service.spec.ts`, `apps/backend/src/recipes/recipes.service.ts` (alias before the mirror), `recipes.service.spec.ts`.
- G7 assistant: `apps/backend/src/assistant/assistant.tools.ts` and its spec.
- G8 scripts and docs: `scripts/migrate-categories-2026-10.mjs`, `scripts/list-grocery-lists.mjs`, `scripts/smoke-local.mjs`, `README.md` (scripts table and runbook), `docs/redesign/REDESIGN.md` (open point 26 closed with « Dessert »).

**Phase 3, frontend shared**

- G9 planning chrome and drag: `apps/frontend/tailwind.config.ts`, `src/lib/screens.ts` (new), `src/components/admin/AdminLayout.tsx`, `src/components/admin/AdminSidebar.tsx`, `src/components/admin/PlanningBar.tsx`, `src/components/admin/PlanningFrame.tsx`, `src/components/admin/DayStrip.tsx`, `src/components/admin/DayHeads.tsx`, `src/components/admin/DragGhost.tsx`, `src/hooks/use-long-press-drag.ts`.
- G10 shared sections and rows: `src/components/admin/RevenueLines.tsx` (new), `src/components/admin/WeekChecklist.tsx`, `src/components/ui/editable.tsx` (placeholder on `EditableInlineNum`).

**Phase 4, pages**

- G11 `src/pages/admin/Settings.tsx`.
- G12 `src/pages/admin/EventDetail.tsx`, `src/pages/admin/EventEditor.tsx`.
- G13 `src/pages/admin/Week.tsx`, `src/pages/admin/Day.tsx`.
- G14 `src/pages/admin/Devis.tsx`, `src/pages/admin/OfferDetail.tsx`, `src/pages/admin/Offers.tsx`, `src/components/admin/DocSectionBlock.tsx`.
- G15 `src/pages/admin/comptes/Equipe.tsx` (new), `src/pages/admin/comptes/ComptesLayout.tsx`, `src/pages/admin/comptes/AFacturer.tsx`, `src/App.tsx`.
- G16 `src/pages/admin/Events.tsx`.

**Phase 5, acceptance and docs**

- G17 screenshots with `/tmp/pw/shot.mjs` (section 9), the migration dry run and apply on the seeded app, `docs/redesign/README.md` row (done with this spec), notes at the superseded lines of `02-planning-iteration.md` (section 4, « Équipe » split), `05-week-tasks-print.md` (Mignardises merged into Dessert), `06-week-day-transition.md` (`cols` screen replaces `xl` for the column layout), `07-offers-pricing-attachments.md` (margin is food-only, revenue line kinds), `10-invoice-inbox.md` (invoicedAt marker).

## 9. Acceptance checklist

Screenshots through `/tmp/pw/shot.mjs` on the seeded app (`APP=http://localhost:5173 API=http://localhost:3101`), widths `375`, `touch-768`, `touch-1024`, `1366`, `tourSeen: true` unless stated. Each line is a route or an action and what must be visible.

1. `/settings#equipe` at 375, touch-1024, 1366: every person row shows « €/h », « €/km » placeholders and the « Paiement » pill; at 375 they wrap under the name; typing 18 in « €/h » and saving round-trips (GET settings shows `hourlyRate: 18`).
2. `/settings#catalogue` at 1366: six categories, the caption « Zakouskis et Mignardises sont regroupés dans Apéritif et Dessert. », no « Mignardises ».
3. `/recipes` at 1366 and 375: « Sablés bretons » under the « Dessert » tab before the script runs; no « Mignardises » tab.
4. Event page (the seeded « Mariage Dupont ») at 375, touch-1024, 1366: properties « En cuisine », « Sur place », « Mes heures »; tiles « Coût matières », « Revenu food HTVA », « Marge food », « Marge food % »; the « Reste » caption; section « Heures et frais » with one row per person, « h » and « km » placeholders; typing 6 h for a person with a rate shows the amount, for a person without a rate shows « tarif à préciser » linking to Paramètres.
5. Event page, « Service, livraison, autres »: « Ajouter ▾ » lists the five kinds; choosing « Boissons » adds a row with the « Boissons » pill, label « Boissons », 21 %, amount focused; the section meta reads « … HTVA · Service … · Boissons … ».
6. Event page: « Terminer l'événement » then GET the event: `staff[].hourlyRate` is set for every entry with hours and the person has a rate; the tile figures do not move when the person's rate is changed in Paramètres afterwards.
7. Event page in the seeded Odoo mode: ⋯ « Marquer comme facturé » adds « Facturé le 15/10 » in Statut and the « N° Odoo » field in Facturation; « Annuler » removes both; GET shows `invoicedAt` present then absent.
8. `/devis`, `/offres/:id`, `/offres` at 1366: « Marge food % » labels and the caption; the Offres list sorts by the food margin.
9. `/comptes/equipe` at 375, touch-1024, 1366 for the seeded month: groups by mode, person rows with hours, km and amount, the « À préciser » group for a person without mode, « Copier le tableau » puts one line per person on the clipboard, ⋯ « Exporter en CSV » downloads a file with `;`.
10. `/comptes/a-facturer` in Odoo mode at 1366 and 375: section « Événements terminés à facturer » with « Marquer facturé » per row; the row disappears after the tap.
11. `/events?filtre=a-facturer` at 1366 and 375: the « À facturer » tab is selected and lists completed unmarked events with the gray « à facturer » tag.
12. `/semaine/2026-W42` at touch-768 (portrait iPad), `tourSeen: false`: the hint caption is visible above the box before any lift; action `{ longpress: "li:has-text('Sablés bretons')", hold: 600, to: "[data-drop-day='2026-10-16']" }` without release: the strip is sticky under the toolbar, every cell tinted, « V 16 » ringed, the caption reads « Déposer sur ven. 16 », the ghost reads « Déposer sur ven. 16 »; `{ release: true }` then GET the event: the line's `prepDate` is `2026-10-16` (restore it afterwards).
13. `/semaine/2026-W42` at touch-1024 (landscape): seven columns under the heads, no sidebar, the « Menu » button top-left opens the drawer; each column body is at least 128 px wide (measure with `getBoundingClientRect`); the same long press onto the « ven. 16 » column moves the line; the head reads « Déposer ici » while held.
14. `/semaine/2026-W42` at 1366: columns, sidebar in flow, the mouse drag of « Sablés bretons » onto Friday writes `prepDate` (unchanged behaviour); `/semaine/2026-W42` at 375: stacked list, unchanged.
15. `/semaine/2026-W42` at touch-768 and 375 on load: the toolbar shows « 📋 n »; tapping it scrolls to the top and the box is open with the « n points » tag visible in its title; the same at touch-1024 and 1366 (« 📋 n points »).
16. Week box with the seeded settings (people present): the « unassigned » row; after deactivating every person in Paramètres: « Aucune personne dans l'équipe : … › Paramètres › Équipe ».
17. Week box in Odoo mode with the ledger table absent (the empty stack at `:5174` / `:3102` after seeding one completed event): « … est terminé · … à facturer › Marquer facturé · Ouvrir » and « … à terminer, puis à facturer »; after « Marquer facturé » the row is gone.
18. Week box: a grocery list created with a range and no eventIds (POST through the API) covers the week's events: no groceries row, the muted « Courses · liste du … › Voir » row.
19. Migration script on the seeded stack: dry run lists « Sablés bretons · Mignardises → Dessert », one event line, one offer line; `--apply` writes them; a second dry run prints `rien à faire` everywhere; the event's line now stores `course: "Dessert"`.
20. `pnpm -r test`: `packages/types` and the backend green; `pnpm -r typecheck` and `pnpm -r lint` green; `node scripts/smoke-local.mjs` green against DynamoDB Local.

## 10. Open questions for Dalia, with the assumption taken

1. Which iPad, and does it have a keyboard with a trackpad? Assumed a 10 to 11 inch model used with the finger. Landscape width decides the columns (1024 to 1194 px); a 12.9 inch at 1366 px already has them.
2. Km: are they a person's travel (paid with the hours) or the van's (an event cost)? Assumed per person, on the « Heures et frais » row; the « transport » kind of « Coûts supplémentaires » stays for the van.
3. Should her own hours (« Mes heures ») stay separate, or should she be a person in Équipe with a rate so Comptabilité › Équipe shows her too? Assumed separate; she can add herself as a person with no payment mode if she wants her hours in the table.
4. Nowjobs bills the hours with its own markup: should the stored rate be what the person receives or what Nowjobs invoices? Assumed what she pays in the end (the Nowjobs invoice per hour), since the table is what she owes.
5. Boissons at 21 % by default, as asked, or 6 % for soft drinks without service? Assumed 21 %; the VAT pill on the row changes it.
6. Does the Équipe table follow the event date or the preparation days? Assumed the event date; the hours of a Friday preparation for a Saturday event count on the Saturday's month.
7. After « Marquer comme facturé », is a « payé » step wanted in Odoo mode, or is payment tracked in Odoo only? Assumed Odoo only; the marker has no « payé ».
8. Is the merge of « Mignardises » into « Dessert » also wanted on printed menus (the dessert and the mignardises lines print under one « Dessert » heading)? Assumed yes.
9. Do her old grocery lists carry events? The runbook step 3 answers it; if they carry neither events nor range, the week box says the courses are not created for those weeks, which is the reminder she asked for.
10. Should a person removed from both teams keep their hours on the event? Assumed yes (the row stays with no role tag) until « Retirer les heures ».

Rejected during synthesis: a separate on-site array without hours; a role per staff entry (rates do not differ by role, one figure per person is what she types); storing hours as ledger personnel entries (the table is not provisioned and she invoices in Odoo); a DynamoDB table for payroll; a migration endpoint (the PATCH routes exist and the script pattern has a dry run); a seventh category « Mignardises »; columns on portrait tablets (seven columns in 768 px are unreadable); a mouse hold on the stacked list (conflicts with a long tap); a next-week groceries row and a Day page caption (not asked; the Day page already renders the week box and gets the pill); service chips on the week cards (the week is the kitchen plan); the ledger stamping `invoicedAt` when an invoice is created (a second write to keep in sync; the union covers it); a popover for the mark (one tap from the row, one menu item on the page).
