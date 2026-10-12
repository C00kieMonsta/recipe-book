# Proposal 4: Five slices on the current stack: read, plan, repeat, account, polish

Angle: Pragmatic roadmap for a solo developer who keeps shipping on React, Tailwind, NestJS and DynamoDB. Every item ranked by value to Dalia divided by effort, cut into five shippable slices of one to two weeks, with files, schema changes, migrations and what she notices after each deploy.

## Vision

The app becomes Dalia's kitchen week and her ledger, in that order. The home screen answers "what do I cook this week, for whom, and how much is it worth", every recipe line on a day opens a large-type cook screen at the event's portions, and the month closes in the app instead of the workbook. The costing maths that Notion lacks stays untouched; it moves to a shared module so the backend can freeze it when an event completes.

The angle is deliberately unambitious on technology. No framework switch, no component library, no GSI, no server-side reporting. Three new DynamoDB tables over five slices (clients in slice 3, ledger in slice 4, nothing else), every new field optional on read, one idempotent script per derived field. Each slice is something Dalia sees on her phone the day it ships: readable recipes and a working duplicate merge first, because that is the loudest complaint and the cheapest fix; then the week view, because it replaces the 30-page PDF; then Hoona; then the journal and income statement; then the rest.

What this proposal refuses to build is as important as what it builds. Invoices stay in Falco, the app records the ledger line. Quotes become a one-day "Proposition de menu" PDF generated from an event. CRM is a client entity with notes. Odoo is never. Staff scheduling is a purchase line with hours and a rate. AI is one optional feature behind an optional key. At 200 €/month Enobase costs 2 400 €/year; five slices of focused work on data the app already holds cost less and keep the margin maths.

## Navigation

## Home

`/` renders **Semaine** (the current ISO week). The finance dashboard is deleted in slice 4; until then it moves to `/finances` and is reachable from the sidebar as "Finances (ancien)".

## Sidebar order (laptop) and labels

1. **Semaine** `/` (slice 2; before slice 2 the home stays Dashboard)
2. **Événements** `/events`
3. **Clients** `/clients` (slice 3)
4. **Recettes** `/recipes`
5. **Ingrédients** `/ingredients` (sub-page "Doublons" at `/ingredients/doublons`, slice 1)
6. **Courses** `/grocery-list`
7. **Comptes** `/comptes` (slice 4; tabs Journal, Aperçu, Résultats, Prévisionnel, Au réel)
8. **Paramètres** `/settings`

Sidebar becomes light (`--sidebar-background: 30 20% 93%`) in slice 1 with the token pass; items at `text-base`, active item with a primary tint and a 3px left bar. The version string moves to Paramètres.

## Phone

Slice 5 adds a bottom tab bar (`apps/frontend/src/components/admin/MobileTabBar.tsx`) with four items: Semaine, Événements, Recettes, Courses. "Plus" opens the drawer with the rest. The top bar shows a breadcrumb and page title instead of the logo.

## Removed or merged

- "Tableau de bord" removed (slice 4). Its KPI strip survives as four tiles at the top of Semaine; its chart moves to Comptes / Aperçu.
- "Planning semaine" modal in `Events.tsx` removed (slice 2), replaced by the Semaine page.
- "Dédoublonner" destructive action in `Ingredients.tsx` removed (slice 1), replaced by the Doublons page.
- "Listes de courses" renamed "Courses".
- Breadcrumb line above every detail title from slice 1 (`PageHeader` component): "Recettes / Tarte au citron", "Semaine du 13 oct / Hoona · mardi".

## Screens

### Semaine (/ and /semaine/:isoWeek (e.g. /semaine/2026-W42))

Home. What is cooked this week, for whom, and what the week is worth. Replaces the WeekPlannerModal and the aggregated PDF.

**Layout**

**Laptop:** header row with `‹ Semaine du 13 au 19 octobre ›`, an `Aujourd'hui` button and a money strip of four tiles (Signé cette semaine = Σ price × guests; from slice 4 also CA du mois facturé, À encaisser, Objectif du mois progress bar). Below, seven day columns in a `grid grid-cols-7 gap-4`. Each column: day name at `text-lg font-semibold`, date, then one card per event (`ListRow`): event or client name at `text-base font-medium`, second line `30 convives · Menu à emporter` (prestation tag from slice 4), third line the recipe lines in course order at `text-sm` (`Mini quiches × 30`). Day footer: Σ convives, Σ € signé. Empty day shows a dashed `+ Événement` button.

**Phone:** days stacked vertically, today expanded first, other days collapsed to their header with a count. Each event card is tappable in full (44px minimum). Money strip collapses to two tiles (Signé, Objectif).

From slice 3: a banner `Hoona n'a pas encore d'événements la semaine prochaine · Créer la semaine` when a client with weekday templates has no event in the following week.

**Interactions**

Prev/next week (keyboard ← →), `Aujourd'hui`, tap a day header to open `/jour/:date`, tap an event card to open `/events/:id`, tap a recipe line to open the cook screen at that line's portions (`/recipes/:id/cook?portions=30&event=<id>&line=<lineId>`), `+ Événement` on a day opens `/events/new?date=YYYY-MM-DD`. Filter chip row: Tous / per client (slice 3). `PDF semaine` button kept for the first months, generated from the same grouped structure (per day, per event, per course), 11pt body.

### Jour (fiche de préparation) (/jour/:date (YYYY-MM-DD))

The clickable prep sheet. Every recipe line to prepare on that date, grouped by course then event, with portions and a done toggle.

**Layout**

**Both:** one 720px column. Title `Mardi 14 octobre` at `font-serif text-3xl`, sub-line `3 événements · 85 convives · 1 240 € signé`. A switch `Par événement | Par recette`. In `Par événement` mode: one block per event (name, client, convives), inside it rows grouped by course heading (`Apéritif`, `Entrée`, …) each row `Mini quiches` at `text-lg`, `× 30` bold, and from slice 5 a 44px `Fait` check. In `Par recette` mode: one row per recipe with the summed portions and the breakdown underneath (`Mini quiches 80 = Hoona 30 + Mariage 50`).

**Phone:** same column, rows 56px, sticky header with the date and the mode switch.

**Interactions**

Tap a row to open cook mode at that line's portions. Tap `Fait` to PATCH `prepStatus` on the line (slice 5). Prev/next day arrows. `Liste de courses du jour` builds a grocery list from this day's events (reuses `generateGroceryList`). Lines placed on `line.prepDate ?? event.date` (slice 5).

### Recette (lecture) (/recipes/:id (read mode) and /recipes/:id?mode=edit (today's page, unchanged))

Read a recipe comfortably on a phone or laptop. Costing and editing are one click away but not on the reading surface.

**Layout**

**Both:** `max-w-[720px]` column. Breadcrumb `Recettes / Tarte au citron`. First photo full width `aspect-[3/2] rounded-xl` if any. Title `h1 font-serif text-3xl sm:text-4xl`. Meta line with a category `Tag`, `10 portions`, `150 g/pers`. A portions stepper (44px buttons, `text-xl` value) that scales quantities with `scaleQty` moved to `recipe-helpers.ts`. Section `Ingrédients`: rows 48px, name `text-lg`, quantity `text-lg font-semibold` with unit muted, no cost column, no supplier dot. Section `Étapes`: `ol space-y-6`, 32px number badge, step text `text-lg leading-relaxed text-foreground` left aligned. A `<details>` block `Coût et prix` containing today's six-column table and `PricingSimulation` unchanged (allowed to scroll horizontally on phone).

**Phone:** sticky bottom bar with `Cuisiner` (primary) and `Modifier`. **Laptop:** the same two buttons in the header right.

**Interactions**

`Cuisiner` opens `/recipes/:id/cook?portions=<stepper>`. `Modifier` switches to `?mode=edit`, which renders the existing RecipeDetail JSX (inline editors) with a `Terminé` button back to read mode. No inline editing in read mode. `Exporter PDF`, `Dupliquer`, `Supprimer` stay in the `ActionMenu`.

### Cuisiner (mode recette) (/recipes/:id/cook?portions=30&event=<eventId>&line=<lineId>)

Follow a recipe in the kitchen at the event's portions, wet hands, glanceable.

**Layout**

**Phone:** header with `Quitter`, recipe name, and when `event` is given a line `pour Hoona · 30 portions`; portions stepper 44px. Body: current step left aligned `text-2xl font-serif leading-relaxed`, previous step above at `text-base text-muted-foreground` for context. A bottom sheet `Ingrédients` (toggle button 56px) that slides over the step with the scaled list. Footer: `Précédent` and `Suivant` 56px tall, counter `4 / 9` between them; no dot strip. `select-none` removed.

**Tablet / laptop (md+):** `grid md:grid-cols-[320px_1fr]`: ingredients column pinned left, step list right with the active step enlarged and others dimmed; tap any step to jump.

**Interactions**

Arrow keys and space as today. Portions stepper rescales ingredients. Last step `Terminé`: with `line` present, PATCH `/admin/events/:id/lines/:lineId { prepStatus: "done" }` (slice 5) then return to the day view; without it, return to the recipe.

### Doublons d'ingrédients (/ingredients/doublons)

Find duplicate ingredients, choose the survivor, merge with every recipe and grocery list remapped.

**Layout**

**Laptop:** list of candidate groups from `GET /admin/ingredients/duplicates`. Each group is a card: the normalised key as heading (`oeuf`), one row per ingredient with a radio button (survivor), name, unit, price, supplier, `utilisé dans 12 recettes`. A warning tag when units differ in the group. Buttons `Fusionner` and `Ignorer ce groupe`. A manual search box above to build a group by hand (`Ajouter un ingrédient au groupe`).

**Phone:** same cards stacked, radio rows 48px.

**Interactions**

Pick the survivor (default preselected: most referenced, then most recently updated). `Fusionner` calls `POST /admin/ingredients/merge`, shows the report (`12 recettes, 2 listes mises à jour, 2 ingrédients supprimés`). Groups with mixed unit families require a confirm checkbox `Je confirme que les quantités resteront cohérentes` which sends `force: true`. `Ignorer` stores the pair in `settings.ignoredDuplicatePairs` so it stops reappearing.

### Événement (/events/:id)

One event: menu grouped by course in service order, costs, client, and from slice 4 its ledger state.

**Layout**

**Both:** `max-w-[840px]`. Breadcrumb `Événements / Mariage Dupont`. Title, date, convives, client link (slice 3), prestation type tag and VAT rate (slice 4). Four stat tiles (Coût, Revenu, Marge, Marge %) using the shared `calcEventCost`. Section `Menu`: one block per course in `settings.courses` order (`Apéritif`, `Entrée`, `Plat`, `Dessert`, `Autre`), rows `Mini quiches` `× 30`, each row with `▲ ▼` buttons (44px), a course select, and a `Cuisiner` icon button. `+ Recette` opens the existing search. Section `Notes`. Section `Coûts supplémentaires` with a `kind` select per line (slice 4). Section `Facturation` (slice 4): either `Créer la ligne de journal` or the linked entry summary (`Facture 2026-014 · 1 452,00 € TVAC · Payée le 3/11`).

**Phone:** same order, tiles 2×2, course rows 56px.

**Interactions**

Reorder with ▲ ▼ (slice 2) or drag on laptop (slice 5); both call `PUT /admin/events/:id/lines` with the full ordered array. Change course via the select. Edit portions inline. `Cuisiner` per line. `Terminer l'événement` button replaces the status pill: sets `status: completed`, which triggers the server-side cost snapshot (slice 4). `Dupliquer`, `Enregistrer comme modèle` (slice 3), `Proposition de menu (PDF)` (slice 5), `Supprimer` in the ActionMenu.

### Clients and Client (/clients and /clients/:id)

Recurring clients, their defaults and their weekly template (Hoona).

**Layout**

**Clients list, both:** `ListRow` per client: name `text-base font-medium`, second line `Entreprise · Menu à emporter · 6 %`, third line `Prochain : mardi 14 oct`. Search box. `+ Client`.

**Client detail, laptop:** header with name, kind, contact (editable), defaults (prestation type, price per guest, VAT). Section `Semaine type`: a table Lundi..Dimanche, each weekday row shows its template (recipes with portions, convives, price) or `+ Ajouter un jour`. Section `Favoris` for templates without a weekday. Section `Événements`: upcoming then past, grouped by week. Primary button `Créer la semaine du 20 oct` (next week without events).

**Phone:** same sections stacked; weekday rows collapsible.

**Interactions**

Edit template inline (reuse the recipe search from EventEditor). `Créer la semaine …` calls `POST /admin/clients/:id/instantiate { weekStart }` and navigates to `/semaine/:isoWeek`. `Créer depuis ce favori` asks date and convives only. On an event: `Mettre à jour le modèle depuis cet événement` pushes changes back to the template.

### Comptes / Journal (/comptes/journal?year=2026&month=10)

The revenue journal (and purchase lines) that replaces the twelve month sheets.

**Layout**

**Laptop:** month selector, book toggle `Recettes | Achats`, table with the workbook's columns: N° | Date | Intitulé | Type | Total TVAC | HTVA | TVA 6 % | TVA 12 % | TVA 21 % | Réglé | Mode | Encaissé le | KM | Description. Footer row: Σ TVAC, Σ HTVA, Σ per rate, `Total CA 10/2026`, then Σ HTVA per prestation type. Toolbar: `+ Ligne`, `Exporter xlsx`, `Exporter csv`, `Verrouiller le mois`.

**Phone:** list rows: label, date, TVAC bold, paid tag; tap opens the entry form full screen. Table only on md+.

**Interactions**

`+ Ligne` opens the entry form (kind select: facture, acompte, comptoir, commission, bon cadeau, autre; purchases: matières premières, personnel extra, autre). Typing TVAC and rate prefills HTVA and VAT via `splitTvac`; HTVA stays editable and the invariant `htva + Σ vat = tvac ± 0.01` is validated. `Réglé` checkbox with method and date. Locked entries (month exported) show a lock and refuse edits without `Déverrouiller`. Filter by kind, paid/unpaid.

### Comptes / Aperçu par mois (/comptes/apercu?year=2026)

Monthly overview against last year and the objective, plus revenue mix by prestation type.

**Layout**

**Laptop:** table Mois | CA HTVA N−1 | CA HTVA N | Δ % | Objectif | Signé (événements) | Atteint. Totals row. Right-hand box: seuil annuel/mensuel, objectif annuel/mensuel. Under it the bar chart moved from Dashboard (CA N vs CA N−1 vs Objectif, axis labels 12px, theme tokens). Second table `Mix par prestation`: Type | CA N−1 | % | CA N | % | Objectif | % | Nb nécessaires.

**Phone:** month rows as cards with three numbers; mix as a list.

**Interactions**

Year select. Click a month to open the Journal filtered to that month. Hover bar for values.

### Comptes / Compte de résultats (/comptes/resultats?year=2026)

The monthly income statement that replaces 'Analyse marge'.

**Layout**

**Laptop:** 12 rows + Total: Mois | CA HTVA | Coûts MP | Marge brute | Charges fixes | Personnel extra | Autres coûts | Résultat avant impôts | Marge % | Impôts | Résultat net. Ratio rows (MP/CA, Marge brute/CA, Charges fixes/CA). A `Simulation` row from the year objective. Scenario toggle `Avec salarié | Seule` for the fixed-charge column. Source badge in the MP cell (`achats` or `recettes`).

**Phone:** month cards with CA, MP, Résultat; full table on md+.

**Interactions**

Year select, scenario toggle, click a month's MP cell to open the purchases book for that month, `Exporter` adds this sheet to the workbook export.

### Comptes / Prévisionnel and Au réel (/comptes/previsionnel and /comptes/au-reel?year=2026)

Prévisionnel: fixed charges, objective, breakeven, treasury, investments (slice 5). Au réel: signed vs target per month with hours (slice 5).

**Layout**

**Prévisionnel, laptop:** table Intitulé | Catégorie | Mensuel | Mensuel sans salarié | Annuel | Valable du/au, totals; inputs for the year objective (CA annuel, mois actifs, % MP, taux ISoc, mois de trésorerie, épargne mensuelle, investissements). Derived box: seuil de rentabilité (CA), seuil mensuel, bénéfice avant impôts prévu, ISoc prévu, marge nette prévue, besoin de trésorerie. **Au réel, laptop:** one block per month: Client / événement | Type | CA HTVA | Heures | Observations, footer Σ CA signé, Σ heures, Objectif, Heures disponibles, Reste à signer, Heures restantes.

**Phone:** forms stacked; tables become cards.

**Interactions**

Editing a charge amount closes the current row (`to`) and creates a new row from the chosen month, so past months keep their figure. Objective per year editable in place. Au réel reads events; hours editable inline (`hoursSpent`).

### Paramètres (/settings)

Lists the app depends on: recipe categories, suppliers, courses, prestation types; from slice 4 also fixed charges and objectives (linked from Prévisionnel).

**Layout**

**Both:** 700px column, one section per list with sentence-case labels at `text-base`, 44px rows, up/down buttons. Prestation types rows have a default VAT select. Suppliers get an optional colour swatch (slice 5).

**Interactions**

Add, rename, reorder, remove with confirm; `Enregistrer` saves the whole settings item (today's behaviour).

## Data model changes

All additions are optional on read unless marked **required**. Existing DynamoDB rows keep reading correctly in every slice; derived fields are filled lazily on write or by an idempotent script.

## Slice 1

```ts
// packages/types/src/entities/ingredient.ts
export interface Ingredient {
  // ...existing fields
  aliases?: string[];      // normalised names of merged duplicates; import and duplicate search match on them
  mergedFrom?: string[];   // ingredientIds removed by a merge, audit only
}

// packages/types/src/normalize.ts (new, shared by backend and frontend)
export function normalizeIngredientName(raw: string): string;
export function findDuplicateGroups(ings: Pick<Ingredient, "ingredientId" | "name" | "unit">[]): string[][];

// packages/types/src/dto/ingredients.ts
export const mergeIngredientsSchema = z.object({
  survivorId: z.string().min(1),
  mergedIds: z.array(z.string().min(1)).min(1),
  force: z.boolean().default(false),   // allow mixed unit families
}).strict();

// packages/types/src/entities/settings.ts
ignoredDuplicatePairs?: string[];     // "idA|idB" sorted, hides a group on the Doublons page
```

Existing rows: no change. `aliases` undefined reads as `[]`.

## Slice 2

```ts
// packages/types/src/entities/event.ts
export interface EventRecipeLine {
  lineId?: string;                 // server fills randomUUID() on create/update when absent; readers fall back to `${recipeId}-${index}`
  recipeId: string;                // required (unchanged)
  portions: number;                // required (unchanged)
  course?: string;                 // value from settings.courses; absent renders under "Autre"
  notes?: string;
  prepStatus?: "todo" | "done";    // UI in slice 5, DTO accepts it from slice 2
  prepDate?: string;               // YYYY-MM-DD; UI in slice 5
}
// Manual order = array order. No separate order field.

// packages/types/src/entities/recipe.ts
defaultCourse?: string;            // copied onto a new event line

// packages/types/src/entities/settings.ts
courses?: string[];                // default ["Apéritif", "Entrée", "Plat", "Dessert", "Autre"]

// packages/types/src/dto/events.ts
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const eventRecipeLineSchema = z.object({
  lineId: z.string().min(1).optional(),
  recipeId: z.string().min(1),
  portions: z.number().int().positive(),
  course: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(500).optional(),
  prepStatus: z.enum(["todo", "done"]).optional(),
  prepDate: isoDate.optional(),
}).strict();
export const putEventLinesSchema = z.object({ lines: z.array(eventRecipeLineSchema).min(0) }).strict();
export const patchEventLineSchema = eventRecipeLineSchema.omit({ lineId: true, recipeId: true }).partial().strict();
// createEventRequestSchema.date becomes isoDate
```

Existing rows: lines without `lineId` are keyed by index until the next write adds ids. Duplicate `recipeId` allowed once lineId exists (same recipe in two courses). `EventEditor` keeps the "no duplicate" guard for lines it adds; `EventDetail` does not.

## Slice 3

```ts
// packages/types/src/entities/client.ts (new table ta-clients-{stage}, PK clientId)
export interface ClientTemplate {
  templateId: string;              // required
  name: string;                    // required, e.g. "Lundi" or "Buffet 40 pers"
  weekday?: 1 | 2 | 3 | 4 | 5 | 6 | 7;   // ISO weekday; present = part of the "semaine type"
  guestCount: number;              // required
  recipes: EventRecipeLine[];      // required, may be empty
  extraCosts: EventExtraCost[];    // required, may be empty
  sellingPricePerGuest: number;    // required
  notes?: string;
}
export interface Client {
  clientId: string;                // required
  name: string;                    // required
  nameLower: string;               // required, server-set
  kind?: "company" | "private";
  contactName?: string; phone?: string; email?: string; address?: string; vatNumber?: string;
  defaultPrestationType?: string;  // key from settings.prestationTypes (slice 4)
  defaultVatRate?: 6 | 12 | 21;
  defaultPricePerGuest?: number;
  notes?: string;
  templates: ClientTemplate[];     // required, default []
  active: boolean;                 // required, default true
  createdAt: string; updatedAt: string;
}

// packages/types/src/entities/event.ts
clientId?: string;
templateId?: string;               // which client template created it (idempotency key with date)
```

Existing events: `clientId` absent; readers show `client?.name ?? contactName`. Optional dry-run script `apps/backend/scripts/seed-clients.ts` groups events by `contactEmail || contactName` and proposes clients; nothing runs automatically.

## Slice 4

```ts
// packages/types/src/entities/accounting.ts (new)
export type VatRate = 0 | 6 | 12 | 21;
export const SALES_KINDS = ["facture", "acompte", "comptoir", "commission", "bon_cadeau", "autre"] as const;
export const PURCHASE_KINDS = ["mp", "personnel", "autre"] as const;

export interface LedgerEntry {               // new table ta-ledger-{stage}, PK entryId
  entryId: string;                           // required
  book: "sales" | "purchases";               // required
  kind: typeof SALES_KINDS[number] | typeof PURCHASE_KINDS[number];  // required
  date: string;                              // required, YYYY-MM-DD
  ym: string;                                // required, server-set date.slice(0, 7)
  number?: string;                           // Falco invoice number
  label: string;                             // required
  eventId?: string; clientId?: string; prestationType?: string;
  totalTvac: number;                         // required, 2 decimals
  htva: number;                              // required, 2 decimals, stored as typed, never recomputed
  vat: { rate: VatRate; amount: number }[];  // required, may be []
  paid: boolean;                             // required
  paymentMethod?: "virement" | "cash" | "bancontact" | "payconiq" | "autre";
  paidAt?: string;
  description?: string; km?: number;
  hours?: number; hourlyRate?: number; personName?: string;   // purchases kind "personnel"
  locked?: boolean;                          // set by "Verrouiller le mois"
  createdAt: string; updatedAt: string;
}

export interface PrestationTypeSetting { key: string; label: string; defaultVatRate: 6 | 12 | 21 }
export interface FixedCharge {
  chargeId: string; label: string; category?: string;
  monthlyAmount: number; monthlyAmountSolo?: number;
  from: string;                              // "YYYY-MM"
  to?: string;                               // "YYYY-MM", inclusive; absent = still active
}
export interface YearObjective {
  annualRevenue: number; monthsActive: number;          // monthsActive default 10
  monthlyOverrides?: Record<string, number>;            // "2026-07": 0
  byPrestation: { type: string; amount: number; eventsNeeded?: number; guestsPerEvent?: number }[];
  hoursAvailablePerMonth?: number;
  rawMaterialPct: number;                                // 0.38 default
  corporateTaxRate: number;                              // 0.25 default
  extrasBudget?: number; treasuryMonths: number; treasurySavingPerMonth?: number;
  investments: { label: string; amount: number }[];
}

// packages/types/src/entities/settings.ts additions
prestationTypes?: PrestationTypeSetting[];   // default: the seven workbook types with 6/12/21 defaults
fixedCharges?: FixedCharge[];
objectives?: Record<string, YearObjective>;  // keyed by "2026"
lockedMonths?: string[];                     // "2026-01"

// packages/types/src/entities/event.ts additions
prestationType?: string; vatRate?: 6 | 12 | 21;
hoursPlanned?: number; hoursSpent?: number; km?: number;
ledgerEntryId?: string;
costSnapshot?: { rawMaterial: number; extras: number; lines: { lineId: string; recipeId: string; portions: number; unitCost: number }[]; takenAt: string; approximate?: boolean };

// EventExtraCost
kind?: "matiere" | "personnel" | "location" | "transport" | "autre";   // undefined reads as "autre"

// packages/types/src/costing.ts (new, moved from apps/frontend/src/lib/recipe-helpers.ts)
export function calcIngredientLineCost(ri, ing): number;
export function calcRecipeCost(recipe, ingredientById: Map<string, Ingredient>): number;
export function calcEventCost(ev, recipeCost: Record<string, number>, recipePortions: Record<string, number>): { calculated: number; rawMaterial: number; extras: number; total: number };
// rawMaterial = ev.costSnapshot?.rawMaterial ?? ev.actualCost ?? calculated

// Zod: money = z.number().refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6); ledger refine |htva + Σ vat.amount − totalTvac| < 0.011; all new DTOs .strict()
```

Existing rows: completed events have no `costSnapshot`; the script `apps/backend/scripts/snapshot-completed-events.ts --dry-run` writes one at today's prices with `approximate: true`, and reports show a `≈` marker. `estimateBelgianTax` and the toggle are deleted with no replacement in the event model.

## Slice 5

```ts
// packages/types/src/entities/grocery-list.ts
eventIds?: string[];               // enables "Régénérer" when a linked event is newer than the list
// packages/types/src/entities/settings.ts
suppliers: { name; address?; phone?; color?: string }[];   // color optional, fallback hash into 8 accessible colours
```

## Backend plumbing shared by the slices

- `apps/backend/src/shared/ddb.service.ts`: loop on `UnprocessedItems` in `batchWrite` and `batchDelete` (slice 1); add `expectedUpdatedAt?` option to `update()` producing `AND #updatedAt = :expected` (slice 2); map `ConditionalCheckFailedException` to 409 in a Nest filter.
- `apps/backend/src/config/config.service.ts`: `CLIENTS_TABLE` and `LEDGER_TABLE` declared `.optional()` and thrown at first use, so the EC2 boots before the SSM parameter exists. `infrastructure/lib/data-stack.ts` updated so CDK matches reality.
- `apps/frontend/src/lib/api.ts`: invalidation sets `ingredients.merge → [ingredients, recipes]`, `events.lines.* → [events]`, `clients.instantiate → [events, clients]`, `ledger.fromEvent → [events]`; ledger list uncached; `SETTINGS_TTL` lowered to 30 s once courses live there.

## Feature solutions

### planning

## Week overview, day view, clickable prep sheets (slice 2, done state in slice 5)

**Data.** No new entity. The week view is a projection of `events` filtered by date range, the day view a projection of lines where `(line.prepDate ?? event.date) === date`. Lines gain `lineId` and `course` (slice 2), `prepStatus` and `prepDate` (slice 5). Week revenue = Σ `sellingPricePerGuest × guestCount` per day and per week (signed, from events); from slice 4 the strip also shows CA facturé from the ledger so the two are never confused.

**Files.** New `apps/frontend/src/pages/admin/Week.tsx` and `Day.tsx`; `apps/frontend/src/lib/week.ts` (move `startOfWeekMonday`/`endOfWeekSunday` out of `Events.tsx`, add `isoWeekOf(date)`, `datesOfIsoWeek(isoWeek)`, grouping by `date.slice(0, 10)` rather than `new Date()`); `App.tsx` routes `/`, `/semaine/:isoWeek`, `/jour/:date`; `AdminSidebar.tsx` first item `Semaine`; `Events.tsx` loses `WeekPlannerModal` and `generateAggregatedPdf` (replaced by a per-day grouped PDF `apps/frontend/src/lib/pdf/week-pdf.ts` kept for the paper fallback); sort fix in `Events.tsx:45` ascending when filter is `upcoming`.

**Cook from a line.** `RecipeCook.tsx` reads `portions`, `event`, `line` from the query string (`useSearchParams`) and initialises `cookPortions` from `portions` instead of `r.portions`; it loads the event when `event` is given to show `pour Hoona · 30 portions`. `EventDetail.tsx` and `Day.tsx` link to it. This is the four-clicks-plus-twenty-taps fix.

**Writes from the phone.** `PATCH /admin/events/:id/lines/:lineId` (patchEventLineSchema) for `prepStatus`, `notes`, `prepDate`, `portions`; it loads the event, replaces the one line, `ddb.update({ recipes })`. `PUT /admin/events/:id/lines` for reorder and course changes. Neither goes through the whole-event PATCH, so an open EventEditor on the laptop does not overwrite a `Fait` tapped in the kitchen. `EventEditor.tsx` sends a diff against the loaded snapshot (`buildPayload` compares with a `loadedRef`) instead of every field.

**PDF.** Kept for one or two months as `PDF semaine` on the Semaine page, generated per day and per event from the same grouped structure, body 11pt, ingredient rows 12pt, one event per page. Removed when Dalia says she no longer prints it.

### readability

## Design system applied to recipe reading first (slice 1, chrome in slice 5)

**Tokens (`apps/frontend/src/index.css`, `tailwind.config.ts`).**
- `html { font-size: 16px }`, `body { @apply text-base leading-relaxed }`. Nothing read in the kitchen below 16px; metadata at 14px; nothing below 13px. Grep-and-replace `text-[10px]` and `text-[11px]` (15 occurrences) to `text-sm`.
- `--muted-foreground: 20 10% 36%` (about 5.9:1 on background). `--primary: 25 55% 44%` so white on primary passes 4.5:1. New `--success`, `--warning`, `--info` with `-muted` pairs in warm hues, exposed in `tailwind.config.ts`; `text-green-600`, `bg-blue-100`, `bg-amber-*` and the hex chart constants replaced by them.
- Light sidebar: `--sidebar-background: 30 20% 93%`, `--sidebar-foreground: 20 20% 15%`, `--sidebar-accent: 25 50% 90%`.
- Serif rule restricted to `h1, h2`; `h3`-`h6` sans. Playfair only at 24px and up.
- `.input-field` becomes `text-base py-2.5 bg-card`; no iOS zoom. Table-cell variant `.input-compact` at `text-sm`.
- Spacing: content column `max-w-[720px]` for reading pages, `max-w-[840px]` for event, `max-w-[1100px]` only for tables and accounting.

**Components (`apps/frontend/src/components/ui/`).** `Tag` (variants neutral, success, warning, info, primary; dark text on tint, never coloured text), `FieldLabel` (sentence case, `text-sm font-medium text-foreground`; replaces the three local copies in EventEditor, RecipeEditor, IngredientFormModal), `PageHeader` (breadcrumb line + `h1 font-serif text-3xl sm:text-4xl` + actions), `ListRow` (name `text-base font-medium`, secondary line `text-sm text-muted-foreground`, 48px min, optional right slot), `Stepper` (44px buttons). Hover-only actions get `[@media(hover:none)]:opacity-100`.

**Recipe page.** `RecipeDetail.tsx` gains a read mode as default (new `RecipeRead` component in the same file or `RecipeRead.tsx`) and keeps today's JSX as `?mode=edit`. Layout in the screen list. Steps `text-lg leading-relaxed text-foreground space-y-6`, 32px number badge, no click-to-edit, no hover delete. Ingredients two-column list with the portions stepper; `scaleQty` moves to `recipe-helpers.ts`. Costing and pricing inside `<details>` `Coût et prix`. Fix `h-22` (invalid class) by showing the first photo full width.

**Cook mode.** `RecipeCook.tsx` as described in the screen list: left-aligned, context line for the previous step, ingredients bottom sheet on phone and side column on md+, 56px prev/next, `4 / 9` counter, no `select-none`, 44px stepper.

**Measure.** Before/after screenshots on an iPhone SE width (375px) and a 13-inch laptop for RecipeDetail and RecipeCook, attached to the PR. Contrast checked with a 10-line script over the tokens (`scripts/check-contrast.mjs`).

**Deferred to slice 5.** List rows replacing the 13 tables on phone, bottom tab bar, supplier colours in settings, grocery page card layout at every breakpoint, PDF typography.

### ingredientMerge

## Find, choose, remap, delete (slice 1)

**Detection (`packages/types/src/normalize.ts`, shared).** `normalizeIngredientName(raw)`:
1. `normalize("NFD")`, strip combining marks, `œ → oe`, `æ → ae`, lowercase, trim.
2. Remove parenthesised text `\([^)]*\)` and anything after ` - ` or `,`.
3. Remove unit tokens at the end: `g`, `gr`, `kg`, `ml`, `cl`, `l`, `pièce(s)`, `pc(s)`, `botte(s)`, `boite`, `bte`, and leading quantities (`^\d+[.,]?\d*\s*`).
4. Replace punctuation and apostrophes with spaces, collapse whitespace.
5. Singularise each token longer than 3 letters: strip trailing `s` or `x` (`oeufs → oeuf`, `choux → chou`), `aux → al` is not attempted.
6. Drop stop words `de`, `du`, `des`, `d`, `la`, `le`, `les`, `en`.

`findDuplicateGroups(ings)` groups by the normalised key, then runs a second pass joining keys of length ≥ 5 with Damerau-Levenshtein ≤ 1 (catches `tomatte`), and never joins keys shorter than 5 fuzzily (`sel` vs `sol`). Pairs listed in `settings.ignoredDuplicatePairs` are split out. Each group carries `unitFamilies` (set of `PRICE_TO_QTY_UNIT[ing.unit]`) and `usage` per ingredient (count of recipes referencing it, from one scan of recipes).

`GET /admin/ingredients/duplicates` (new in `ingredients.controller.ts`) returns `{ groups: { key, ingredients: [{ ingredientId, name, unit, price, supplier, recipeCount }], mixedUnits: boolean }[] }`.

**Survivor.** Default preselection: highest `recipeCount`, tie-break most recent `updatedAt`, then the shortest name (the canonical form is usually shorter). The user can pick any other row. The survivor keeps its own name, price, unit and supplier; the merged names are appended to `survivor.aliases` so `importIngredients` (`ingredients.service.ts`, `existingByName`) also matches aliases and stops recreating the duplicate at the next CSV import.

**Unit families.** If `PRICE_TO_QTY_UNIT[merged.unit] !== PRICE_TO_QTY_UNIT[survivor.unit]`, `calcIngredientLineCost` would price a `pièce` line with a per-kg price. The endpoint returns 409 `{ reason: "mixed-units", details }` unless `force: true`. The UI requires the confirm checkbox and shows the lines concerned so Dalia can fix quantities afterwards. No automatic conversion.

**Remap (`IngredientsService.merge`, order matters).**
1. Load survivor and all merged rows; 404 if any is missing (a retry after partial success lands here for already-deleted ids and is treated as done, see 5).
2. `scanAll(recipes)`. For each recipe with a line whose `ingredientId ∈ mergedIds`: rewrite to `survivorId`; if two lines now share `ingredientId` and `unit`, sum `qty` and keep the max `lossPct`; `ddb.update(recipes, { recipeId }, { ingredients, updatedAt })`. Count `recipesUpdated`.
3. `scanAll(groceryLists)`. Rewrite `items[].ingredientId`, set `name`, `supplier`, `pricePerUnit`, `priceUnit` from the survivor; merge items with the same `ingredientId:unit` by summing `totalQty` and `haveQty`; `checked` = both checked. `ddb.update`. Count `listsUpdated`.
4. `ddb.update(ingredients, { survivorId }, { aliases, mergedFrom, updatedAt })`.
5. `batchDelete(mergedIds)` with the `UnprocessedItems` loop added in `ddb.service.ts`.
6. Return `{ recipesUpdated, listsUpdated, removed }`; the controller logs it like `deduplicate` does today.

`localStorage` `recipe-book:grocery-list-pending` is ephemeral and consumed on the next GroceryListPage load; it is not touched. `DELETE /admin/ingredients/:id` gains a reference check and returns 409 with the recipe names when referenced.

**Partial failure.** Remap happens before any delete, so a crash at step 2 or 3 leaves both ingredients alive and some recipes already pointing to the survivor; nothing is orphaned, the group still appears on the Doublons page, and re-running the same merge finishes the job (steps 2 and 3 find fewer rows, step 5 deletes). If step 5 fails after steps 2 to 4, the merged rows survive unreferenced and the next run deletes them; step 1 treats a missing merged id as already removed. Every step is idempotent, so no transaction is needed; `transactWrite` is not added. The frontend invalidates `ingredients` and `recipes` caches together.

**UI.** `apps/frontend/src/pages/admin/IngredientDuplicates.tsx` at `/ingredients/doublons`, linked from the Ingrédients page header; the old `Dédoublonner` menu item and the `deduplicate` endpoint are removed.

### eventOrdering

## Course on the line, order in the array (slice 2, drag in slice 5)

**Where the course lives.** On the event line (`EventRecipeLine.course`), with `recipe.defaultCourse` as the default copied in when a line is added. Same recipe can be an amuse-bouche at one event and a starter at another, so the recipe alone is not enough; the recipe default saves typing. Course values come from `settings.courses` (default `Apéritif, Entrée, Plat, Dessert, Autre`), editable in Paramètres; `recipeCategories` (service formats) are untouched.

**How manual order is stored.** The array order of `event.recipes` is the order. No `order` field, so there is nothing to keep in sync. Rendering: group lines by `course` following `settings.courses` index (unknown or missing course last under `Autre`), and inside a group keep array order. Moving a line up or down swaps it with its neighbour inside the group and rewrites the array; changing its course moves it to the end of the new group. Both call `PUT /admin/events/:id/lines { lines }` with the full ordered array (lines carry `lineId`, server validates that the set of lineIds equals the stored set, 409 otherwise, so a stale client cannot drop lines).

**Identity.** `lineId` is filled by `EventsService.create/update/putLines` when absent (`randomUUID()`), so existing rows migrate on their next write. Readers key by `lineId ?? \`${recipeId}-${i}\``. `EventDetail.tsx` stops keying by `recipeId` and stops `updateRecipePortions` by `recipeId`; it uses the line endpoint.

**Files.** `packages/types/src/entities/event.ts`, `dto/events.ts` (strict line schema, `putEventLinesSchema`, `patchEventLineSchema`); `apps/backend/src/events/events.controller.ts` (`PUT :id/lines`, `PATCH :id/lines/:lineId`), `events.service.ts` (`ensureLineIds`, `putLines`, `patchLine`); `apps/frontend/src/pages/admin/EventDetail.tsx` (course groups, ▲ ▼, course select, `Cuisiner` per line); `EventEditor.tsx` (course select next to portions; diff-based autosave); `RecipeDetail.tsx` edit mode and `RecipeEditor.tsx` (default course select); `Settings.tsx` (Courses list); `packages/types/src/entities/settings.ts`.

**Drag and drop** on laptop in slice 5 with the same `PUT`; the ▲ ▼ buttons stay for touch.

### recurringClient

## Hoona: set up once, see the week, reuse next week (slice 3)

**Entity.** One new table `ta-clients`, templates embedded in the client (`Client.templates: ClientTemplate[]`). No second table for templates: a client has at most a handful, each a few hundred bytes, and they are always edited from the client page. Templates are not events, so nothing in revenue, week view or journal can mistake them for one.

**Set up once.** Dalia creates the client `Hoona` (`/clients/new`): kind Entreprise, contact, default prestation type `Menu à emporter`, default VAT 6 %, default price per guest. On `/clients/hoona` the section `Semaine type` lists Lundi to Dimanche. She fills Monday: convives 30, recipes (search, portions default to convives, course), price; then Tuesday, and so on. Days she does not deliver stay empty. `Enregistrer comme modèle` on any existing event (`EventDetail` ActionMenu) creates a template from that event and asks for a weekday or `Favori`, which is the fastest path from the events she already has.

**See the week or a day.** `/semaine/:isoWeek` with the client chip `Hoona` shows only her events, one per weekday, each listing the lines in course order with portions; the day view `/jour/:date` lists `Mini quiches × 30 · Hoona` under its course alongside other clients of that day. `/clients/hoona` also shows `Cette semaine` and `Semaine prochaine` as two rows of day cards with a quick link to each event.

**Reuse next week.** `POST /admin/clients/:id/instantiate { weekStart: "2026-10-20", templateIds?: string[], guestCount?: number }`. The service loads the client, for each template with a `weekday` computes `date = weekStart + weekday − 1`, skips it if an event with the same `clientId`, `templateId` and `date` exists (idempotent), and creates an event `{ name: "Hoona · mardi 21 oct", date, clientId, templateId, guestCount, recipes (fresh lineIds), extraCosts, sellingPricePerGuest, prestationType, vatRate, contact* from the client, status: upcoming }`. Returns the created events. The Semaine page shows a banner when the following week has no events for a client with weekday templates; one tap runs the instantiation for next week. The client page has the same button for any week. Templates without a weekday are `Favoris`: `Créer depuis ce favori` asks date and convives only and creates one event.

**Editing.** Changing an event never changes its template. `Mettre à jour le modèle depuis cet événement` on the event pushes recipes, portions and price back into the template. Deleting a client keeps its events (`clientId` dangling reads as the stored `contactName`).

**Files.** `packages/types/src/entities/client.ts`, `dto/clients.ts`; `apps/backend/src/clients/{clients.module,clients.controller,clients.service}.ts` (CRUD + `instantiate`, injects `EventsService`); `config.service.ts` `CLIENTS_TABLE` optional; `infrastructure/lib/data-stack.ts`; `scripts/ec2-bootstrap.sh`, `scripts/setup-ssm-params.sh`; `apps/frontend/src/pages/admin/{Clients,ClientDetail}.tsx`; `EventEditor.tsx` (client select, defaults applied); `EventDetail.tsx` (client link, template actions); `Week.tsx` (banner, client chips); `api.ts` (`clients.*`); optional `apps/backend/scripts/seed-clients.ts --dry-run`.

**Invoicing a week.** Hoona is probably invoiced monthly or weekly, not per day. The ledger entry (slice 4) has `clientId` and an optional `eventId`; a weekly invoice is one sales entry with `clientId: hoona` and no `eventId`. Au réel then uses `price × guests` from the events for the signed figure and the journal for the invoiced one.

### accounting

## Livre des comptes and compte de résultats (slice 4 core, slice 5 Prévisionnel and Au réel)

### Entities

- **LedgerEntry** (new table `ta-ledger`, append-only records, both books): fields in the data model section. Sales kinds: `facture`, `acompte`, `comptoir`, `commission`, `bon_cadeau`, `autre`. Purchase kinds: `mp` (raw material receipts or supplier invoices), `personnel` (extra staff, with `hours`, `hourlyRate`, `personName`), `autre`. `ym` written server-side from `date.slice(0, 7)`. `paid` is stored, not derived; deposits are `acompte` entries, paid at creation.
- **FixedCharge** (inside the settings item, effective-dated `from`/`to`, amount and `monthlyAmountSolo`).
- **YearObjective** (inside settings, keyed by year): annual revenue, months active, per-prestation targets, hours available, `rawMaterialPct`, `corporateTaxRate`, treasury months and saving, investments.
- **PrestationTypeSetting** (inside settings): the seven workbook types with a default VAT rate each; `event.prestationType` holds the key.
- **Event additions**: `prestationType`, `vatRate`, `hoursPlanned`, `hoursSpent`, `km`, `ledgerEntryId`, `costSnapshot`; `extraCosts[].kind`.

No `Deposit`, `ExtraShift` or `Purchase` tables: all three are ledger entries with a `kind`. One table, one service, one page.

### How an event becomes a journal line

Explicit, never automatic, because the Falco number is typed by hand. On `/events/:id`, section `Facturation`, button `Créer la ligne de journal` (enabled once `status === completed`, or any time for an `acompte`). It opens the Journal entry form prefilled by `POST /admin/ledger/from-event/:eventId` (dry prefill, no write): `date = event.date`, `label = event.name` (or `client.name · event.name`), `kind = facture`, `prestationType`, `clientId`, `eventId`, `km`, `htva = round2(sellingPricePerGuest × guestCount − Σ htva of acompte entries with this eventId)`, `vat = [{ rate: event.vatRate ?? default of prestationType, amount: round2(htva × rate / 100) }]`, `totalTvac = htva + vat`. Dalia overwrites with the Falco figures and the invoice number, saves; the entry is created and `event.ledgerEntryId` is set in the same request (`POST /admin/ledger` with `eventId` triggers the back-reference). The event page then shows `Facture 2026-014 · 1 452,00 € TVAC · Payée le 3/11` from the entry; `status` stays a kitchen flag. Lines that are not events (`comptoir`, `commission`, `bon_cadeau`) are added from the Journal page directly.

### How raw material cost reaches the income statement

Two sources, shown with a badge so a month never changes silently:
1. **Achats**: Σ purchases `kind = mp` with `ym = m`, when at least one exists for the month. This is the workbook's hand-typed `Coûts MP` from receipts.
2. **Recettes** (fallback): Σ over events with `date` in `m` and `status = completed` of `costSnapshot.rawMaterial ?? actualCost ?? calculated`, plus Σ `extraCosts` with `kind = matiere`.

The snapshot is written server-side: `EventsService.update` detects the transition to `completed` with no `costSnapshot`, loads recipes and ingredients (inject `RecipesService` and `IngredientsService` into `EventsModule`), computes with `packages/types/src/costing.ts` (the same code the frontend uses) and stores `{ rawMaterial, extras, lines, takenAt }`. Reopening an event (`upcoming`) keeps the snapshot; a `Recalculer le coût` action on the event page replaces it on purpose. Ingredient price edits after that date no longer move past margins.

### Fixed charges, objectives, breakeven

Stored in settings (single reader, small). Editing a charge's amount from month M closes the old row (`to = M−1`) and inserts a new row (`from = M`); past months keep their figure. `charges fixes(m) = Σ monthlyAmount (or monthlyAmountSolo in the Seule scenario) where from ≤ m ≤ (to ?? ∞)`. Objective per year is the single source for Aperçu, Au réel and Prévisionnel; `objectif mensuel(m) = monthlyOverrides[m] ?? annualRevenue / monthsActive`.

### Reports (views, never stored)

**Journal des recettes** (`/comptes/journal`): N° | Date | Intitulé | Type | Total TVAC | HTVA | TVA 6 % | TVA 12 % | TVA 21 % | Réglé | Mode | Encaissé le | KM | Description. Footer: Σ TVAC, Σ HTVA, Σ per rate, `Total CA mm/aaaa` = Σ HTVA, Σ HTVA per prestation type. Sums in cents (`sumMoney`), formatted with `Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR" })`.

**Aperçu par mois** (`/comptes/apercu`): Mois | CA HTVA N−1 | CA HTVA N | Δ % = (N − N−1) / N−1 (blank when N−1 = 0) | Objectif = objectif mensuel(m) | Signé = Σ events in m of price × guests | Atteint = CA N ≥ Objectif. Totals. Box: seuil annuel et mensuel, objectif annuel et mensuel. Mix par prestation: Type | CA N−1 | % | CA N = Σ sales htva by prestationType (entries without type under `Sans type`) | % | Objectif | % | Nb nécessaires = eventsNeeded ?? Objectif ÷ (CA N ÷ nb lignes du type).

**Compte de résultats** (`/comptes/resultats`), per month m: CA HTVA = Σ sales htva (all sales kinds; commissions included, as in the workbook) | Coûts MP (source above) | Marge brute = CA − MP | Charges fixes(m) | Personnel extra = Σ purchases kind personnel (hours × hourlyRate when present, else amount) | Autres coûts = Σ purchases kind autre + Σ event extraCosts not matière/personnel | Résultat avant impôts = Marge brute − Charges fixes − Personnel − Autres | Marge % = Résultat / CA | Impôts = max(0, Résultat) × corporateTaxRate, annual row uses max(0, Σ Résultat) × rate | Résultat net = Résultat − Impôts. Ratio rows MP/CA, Marge brute/CA, Charges fixes/CA. Simulation row: CA = annualRevenue, MP = CA × rawMaterialPct, Charges = Σ charges × 12, Personnel = extrasBudget.

**Prévisionnel** (`/comptes/previsionnel`, slice 5): charge table with scenario column; seuil de rentabilité (CA) = (Σ charges annuelles + 12 × treasurySavingPerMonth + Σ investments) ÷ (1 − rawMaterialPct), with the workbook's hors-MP figure shown beside it for one year; seuil mensuel = seuil ÷ monthsActive; bénéfice avant impôts prévu = annualRevenue × (1 − rawMaterialPct) − Σ charges annuelles − extrasBudget; ISoc prévu = max(0, bénéfice) × corporateTaxRate (default 0.25, help text about the 20 % SME rate to confirm with the accountant); marge nette prévue = (bénéfice − ISoc) ÷ annualRevenue; besoin de trésorerie = Σ charges mensuelles × treasuryMonths.

**Au réel** (`/comptes/au-reel`, slice 5), per month: Client / événement | Type | CA HTVA = Σ sales htva with that eventId, else price × guests | Heures = hoursSpent ?? hoursPlanned | Observations = notes. Footer: Σ CA signé, Σ heures, Objectif mensuel, Heures disponibles, Reste à signer, Heures restantes; year total and écart to annualRevenue.

### Export

`Exporter xlsx` on the Journal page writes `Livre des recettes 2026.xlsx` with `XLSX.utils.aoa_to_sheet` (already a dependency): one sheet per month named `Janvier`..`Décembre`, headers in the workbook's exact wording and order (`NUMERO OPERATION, DATE FACTURE/OPERATION, INTITULE, Total tvac, RECETTE htva, TVA 6%, TVA 12%, TVA 21%, réglé, mode paiement, date encaissement, Type, Description, KM`), dates as Excel date cells, a TOTAL row and the per-type totals as values; a sheet `recettes 2026` with all lines; a sheet `Compte de résultats`. CSV variant with `;` and decimal comma. `Verrouiller le mois` sets `locked` on the month's entries and adds the month to `settings.lockedMonths`; locked entries refuse PATCH unless unlocked first. Code in `apps/frontend/src/lib/accounting-export.ts`.

### What the Dashboard becomes

`Dashboard.tsx` is deleted in slice 4 along with `estimateBelgianTax`, the tax toggle and the override input; the SRL pays corporate tax on the result after charges, and that lives in Compte de résultats with a settable rate. The home is Semaine with four tiles: CA du mois (Σ journal HTVA, month to date, with the objective as a progress bar), Signé ce mois (events), À encaisser (count and Σ TVAC of unpaid sales entries, oldest date), Marge brute du mois % = (CA − MP) ÷ CA. The monthly chart moves to Aperçu as CA N vs CA N−1 vs Objectif using theme tokens. `KpiCard` and `MonthlyChart` are lifted into `apps/frontend/src/components/ui/`.

### Files

`packages/types/src/entities/accounting.ts`, `dto/ledger.ts`, `dto/settings.ts`, `costing.ts`; `apps/backend/src/ledger/{module,controller,service}.ts`; `events.service.ts` (snapshot), `events.module.ts` (imports); `settings.service.ts` (widened Pick, defaults for prestationTypes); `config.service.ts` (`LEDGER_TABLE`); `apps/frontend/src/lib/accounting.ts` (`groupByMonth`, `sumMoney`, `fmtEur`, `incomeStatement(year, entries, events, settings)`), `accounting-export.ts`; `apps/frontend/src/pages/admin/accounting/{AccountingLayout,Journal,Apercu,Resultats,Previsionnel,AuReel}.tsx`; `EventDetail.tsx` (Facturation section, prestation type, VAT, hours, km, `Terminer l'événement`); `EventEditor.tsx` (same fields); `Settings.tsx` (prestation types, charges, objective); `Week.tsx` (tiles); `apps/backend/scripts/snapshot-completed-events.ts`.

### ai

## One optional feature: import a recipe from a photo or pasted text (end of slice 5)

**Not needed for the four requests.** Duplicate detection is string normalisation, planning is a view, Hoona is a template, accounting is arithmetic. None of them gets better with a model, so AI is last and optional.

**The one feature.** `Importer une recette` on `/recipes`: Dalia uploads a photo of a handwritten or printed recipe card, or pastes text from Notion. Backend `POST /admin/recipes/parse` (multipart image or `{ text }`) calls the OpenAI Responses API with `gpt-4o-mini`, vision input, a JSON schema `{ name, portions, description, steps: string[], ingredients: { name, qty, unit }[] }`, temperature 0. The service maps each ingredient name through `normalizeIngredientName` and `aliases` to an existing `ingredientId`; unmatched names come back flagged. The frontend opens `RecipeEditor` prefilled, unmatched ingredients highlighted with the existing `IngredientFormModal` to create them. Nothing is saved until Dalia presses Enregistrer.

**Inputs:** one image (jpg/png, ≤ 5 MB) or text ≤ 8 000 characters. **Outputs:** a prefilled recipe form plus a list of unmatched ingredient names. **Cost:** about 0.001 to 0.01 € per import at gpt-4o-mini vision prices; a few euros per year. Key stored as an optional SSM parameter `OPENAI_API_KEY`; when absent `ConfigService` reports `aiEnabled: false` via `/health` and the button is hidden. **Effort:** about three days including the matching and the error states. Ships only if Dalia provides a key; otherwise skipped with no other impact.

## Roadmap

### Slice 1 (weeks 1-2): readable recipes, cook mode, ingredient merge

Tokens and base type scale in `apps/frontend/src/index.css` and `tailwind.config.ts` (16px body, darker muted, darker primary, success/warning/info, light sidebar, serif only h1/h2, `.input-field` text-base); replace `text-[10px]`/`text-[11px]`; new `Tag`, `FieldLabel`, `PageHeader`, `ListRow`, `Stepper` in `apps/frontend/src/components/ui/`. `RecipeDetail.tsx` read mode (720px column, photo, big title, portions stepper, ingredient list, steps at 18px, `Coût et prix` disclosure) with `?mode=edit` keeping today's page. `RecipeCook.tsx` rewrite (query params, left-aligned, ingredients sheet/column, 56px nav, counter). `packages/types/src/normalize.ts`; `GET /admin/ingredients/duplicates`, `POST /admin/ingredients/merge`, 409 on referenced delete, `UnprocessedItems` loop in `ddb.service.ts`; `IngredientDuplicates.tsx` at `/ingredients/doublons`; remove `deduplicate`. Breadcrumbs on detail pages. Not built: any new table.

**Migration:** None. `aliases`, `mergedFrom`, `ignoredDuplicatePairs` optional on read. `pnpm build:types` then deploy backend before frontend (frontend calls the new endpoints). Back up the ingredients and recipes tables (on-demand backup) before the first real merge.

**Rationale:** Highest value over effort: the readability complaint is literal and fixable with tokens and one read view; the duplicate merge is the first verbatim request and the current `deduplicate` corrupts recipes. Dalia notices: recipe pages she can read on her phone, a cook mode she can follow, and `oeuf`/`oeufs` merged without losing recipe lines.

### Slice 2 (weeks 3-4): courses, order, week and day views

`EventRecipeLine` gains `lineId`, `course`, `notes` (+ `prepStatus`, `prepDate` accepted by the DTO, UI later); strict Zod; `PUT /admin/events/:id/lines`, `PATCH /admin/events/:id/lines/:lineId`; `ensureLineIds` in `events.service.ts`; `settings.courses` and `recipe.defaultCourse`; `EventDetail.tsx` menu grouped by course with ▲ ▼ and course select, `Cuisiner` per line, `Terminer l'événement` button replacing the pill; `EventEditor.tsx` diff-based autosave and course select; `Week.tsx` at `/` and `/semaine/:isoWeek`, `Day.tsx` at `/jour/:date`, `lib/week.ts`; sidebar first item Semaine, Dashboard moved to `/finances`; `WeekPlannerModal` and `generateAggregatedPdf` removed, `PDF semaine` per day kept; events list ascending for upcoming. Not built: drag and drop, prep done toggle (slice 5).

**Migration:** None required. `lineId` filled on the next write of each event; readers fall back to index keys. `settings.courses` defaults when absent. Deploy backend first (new endpoints), then frontend.

**Rationale:** Second and third verbatim requests (ordering, week overview) with zero new tables; the day view is the clickable prep sheet that retires the 30-page PDF. Dalia notices: the home page is her week with revenue, each day is a prep list, every line opens cook mode at the right portions, and menus read in service order.

### Slice 3 (weeks 5-6): clients and weekly templates (Hoona)

New table `ta-clients` (CDK `data-stack.ts`, SSM, `ec2-bootstrap.sh`, `config.service.ts` optional var), `packages/types/src/entities/client.ts`, `dto/clients.ts`, `apps/backend/src/clients/*` with `instantiate`; `event.clientId`, `event.templateId`; `Clients.tsx`, `ClientDetail.tsx` with `Semaine type` and `Favoris`; `EventEditor.tsx` client select applying defaults; `EventDetail.tsx` `Enregistrer comme modèle`, `Mettre à jour le modèle`; `Week.tsx` client chips and next-week banner; `api.ts` `clients.*`. Not built: CRM pipeline, mailing, quote states.

**Migration:** Table provisioning per README (console or CDK deploy, SSM parameter, `.env` line, `pm2 restart`). `config.service.ts` declares `CLIENTS_TABLE` optional and throws at first use, so a backend deploy before the parameter exists still boots. Optional `apps/backend/scripts/seed-clients.ts --dry-run` lists proposed clients from `contactEmail || contactName`; run without `--dry-run` to create them and set `clientId` on matching events via `ddb.update`. Existing events keep working without `clientId`.

**Rationale:** Removes Monday's duplicate-and-edit ritual, the third verbatim request, with one small table. Dalia notices: Hoona set up once, `Créer la semaine du 20 oct` in one tap, a client page that shows her week.

### Slice 4 (weeks 7-8): accounting core

`packages/types/src/entities/accounting.ts`, `costing.ts` (shared maths), `dto/ledger.ts`, settings additions (`prestationTypes`, `fixedCharges`, `objectives`, `lockedMonths`); event additions (`prestationType`, `vatRate`, `hoursPlanned`, `hoursSpent`, `km`, `ledgerEntryId`, `costSnapshot`, `extraCosts[].kind`); new table `ta-ledger` and `apps/backend/src/ledger/*` (CRUD, `from-event` prefill, lock); snapshot on completion in `events.service.ts`; `Settings.tsx` sections for prestation types, charges fixes, objectif; `accounting/{AccountingLayout,Journal,Apercu,Resultats}.tsx`, `lib/accounting.ts`, `accounting-export.ts` (xlsx and csv); `EventDetail.tsx` Facturation section; `Dashboard.tsx` and `estimateBelgianTax` deleted, four tiles on `Week.tsx`, chart moved to Aperçu. Not built: Prévisionnel and Au réel pages (slice 5), invoicing, bank import.

**Migration:** Table provisioning as in slice 3 for `ta-ledger`. `apps/backend/scripts/snapshot-completed-events.ts --dry-run` then real run: writes `costSnapshot` with `approximate: true` for completed events at today's prices, idempotent (skips events that have one). Settings defaults seeded on first read (`prestationTypes` from the seven workbook values). No ledger backfill: Dalia keeps the 2025 workbook as the record and starts the app's journal at the month of deployment; a one-off import of the 2026 month sheets can be done with `importLedgerRows` if she wants history in the app (optional, half a day).

**Rationale:** The fourth request, built on the smallest entity set that reproduces every workbook sheet (one ledger table with two books, settings for charges and objectives). Dalia notices: closing an event asks for the Falco number and VAT, the journal and `Total CA` per month come out of the app, the income statement shows real corporate tax instead of the sole-trader estimate, and the accountant gets the xlsx in the columns she already uses.

### Slice 5 (weeks 9-10): polish, prep status, prévisionnel, au réel, cheap substitutes, optional AI

`prepStatus` toggle on `Day.tsx` and from cook mode end, `prepDate` picker per line; `accounting/Previsionnel.tsx` and `AuReel.tsx`; `MobileTabBar.tsx` bottom tabs, list rows replacing the 13 tables below `md`, grocery page card layout at every breakpoint with 48px rows and full-row tap, supplier `color` in settings and `Tag` rendering, PDF typography; drag-and-drop reorder on laptop; `GroceryList.eventIds` and `Régénérer`; `Proposition de menu (PDF)` from an event (menu by course, price per guest, convives, contact) as the quote substitute; `hoursSpent` inline on the event; optional `POST /admin/recipes/parse` AI import behind `OPENAI_API_KEY`. Not built: Falco replacement, Odoo, scheduling, stock.

**Migration:** None. `eventIds` and `suppliers[].color` optional. `OPENAI_API_KEY` optional SSM parameter only if the AI import ships.

**Rationale:** Everything here is valuable but none of it blocks the four requests, so it goes last and can be trimmed. Dalia notices: `Fait` ticks on the day sheet, breakeven and treasury in the app, a phone layout with bottom tabs, a client-facing menu PDF in one click.

## Risks

- **Slice 4 is the largest and may overrun two weeks.** Mitigation: ship Journal and export first (the accountant's value), then Résultats; Aperçu's chart can lag a week. Prévisionnel and Au réel are already pushed to slice 5.
- **Two new tables need manual provisioning on the EC2** (README four-step process, CDK stack out of date). Declaring the env vars optional avoids a boot failure, but a forgotten `.env` line surfaces as a 500 on the Clients or Comptes page. Mitigation: `/health` reports which tables are configured; update `data-stack.ts` in the same PR so `cdk diff` shows reality.
- **EventEditor autosave vs line endpoints.** Until the diff-based autosave ships in slice 2, an editor left open on the laptop can overwrite a reorder done on the phone. Mitigation: ship the diff in the same slice; add `expectedUpdatedAt` 409 handling as a follow-up if conflicts are observed.
- **Merge with `force: true` on mixed units** can leave recipe lines priced with the wrong unit family. Mitigation: the response lists the affected recipe names and the Doublons page links to them; the cost table on those recipes shows a warning tag when `PRICE_TO_QTY_UNIT[ing.unit] !== ri.unit`.
- **Approximate cost snapshots for already-completed events** are a reconstruction at today's prices. They are flagged `approximate` and shown with `≈`; the 2025 workbook stays the record for 2025.
- **One ledger table for sales and purchases** could confuse the accountant export if purchases leak into the revenue sheets. Mitigation: export filters `book = sales`; the purchases book is a separate sheet named `Achats`.
- **Corporate tax rate and VAT defaults per prestation type are guesses** (25 % ISoc; atelier at 21 %). Both are editable in settings with help text; confirm with the accountant before relying on Résultats.
- **Settings item grows** (courses, prestation types, charges, objectives, locked months). Still far below 400 KB, but `SettingsService.update` is put-based last-write-wins; acceptable for a single user, noted for later.
- **Readability work is judged by Dalia, not by metrics.** Mitigation: slice 1 ends with a 20-minute session on her phone in the kitchen, and the token values are adjusted before slice 2 starts.
- **I did not verify** the Belgian 20 % SME corporate rate conditions, whether Hoona is invoiced weekly or monthly, or whether deposits go through Falco; all three are modelled so either answer works but the defaults may need changing.
