# Proposal 2: Model first: lines, clients, templates, ledger. Screens fall out of the tables.

Angle: Data model first. Fix the entities, DTOs, endpoints and write paths so that planning, Hoona, ingredient merge and the livre des comptes are projections over records the backend can trust. Three new DynamoDB tables (clients, event-templates, ledger), everything else as optional fields or settings. Reports are pure functions in packages/types computed on the client from the existing scans.

## Vision

The app today has five tables and one real computation (recipe cost). Every feature the caterer asks for is blocked by the same gap: the event line is `{recipeId, portions}` with no identity, the event has no client, no type, no VAT and no invoice, and the ingredient id is referenced from three places that nothing remaps. Fixing the model once unblocks all four requests at the same time. A line with `lineId`, `course`, `order`, `prepStatus` and `prepDate` is a week view, a day sheet and a reorderable menu. An event with `clientId`, `prestationType`, `vatRate`, `costSnapshot` and `ledgerEntryIds` is a journal line, a revenue-mix bucket and a frozen historical margin. A template keyed on a client is "Hoona without duplicating". A merge endpoint that rewrites recipes and grocery lists before it deletes is the duplicate fix.

The accounting is the same move. The workbook is twenty sheets but only three kinds of record: journal lines (sales and purchases, including deposits and extra staff), fixed charges with a validity period, and one objective per year. Everything else in the workbook (aperçu par mois, mix par prestation, analyse marge, prévisionnel, au réel) is a formula over those records plus the events. So the design stores exactly those records, in one ledger table and the settings item, and ships the reports as pure TypeScript functions in `packages/types` that both the browser and a future backend job can run. Historical figures cannot drift because the journal is append-only, fixed charges are effective-dated, and the raw material cost of a completed event is snapshotted server-side when it is closed.

This angle wins for a solo developer because every slice is a backward-compatible field addition or a new empty table, nothing requires a rewrite, and each phase ends with a migration script that is idempotent and dry-runnable. The screens described here are deliberately thin: they exist to prove the model is sufficient, and the readability pass (type scale, tokens, list rows) is applied to the new screens first and then back-ported to RecipeDetail and RecipeCook.

## Navigation

## Home

`/` renders **Semaine** (the week view for the current ISO week) with a four-tile money strip above it. `Dashboard.tsx` is deleted; its chart moves to `/comptes/apercu`.

## Sidebar (laptop) and bottom tabs (phone), in order

1. **Semaine** (`/`, `/semaine/:weekStart`) - what to cook, per day, with signed and invoiced revenue.
2. **Événements** (`/events`) - list, now sorted ascending for "À venir".
3. **Clients** (`/clients`) - new. Recurring clients, their favourites and their next four weeks.
4. **Recettes** (`/recipes`) - unchanged list; detail becomes a reading page with a "Coût & prix" toggle.
5. **Ingrédients** (`/ingredients`) - with a "Doublons" sub-page (`/ingredients/doublons`).
6. **Courses** (`/grocery-list`) - unchanged.
7. **Comptes** (`/comptes/*`) - new section with tabs: Journal, Aperçu par mois, Compte de résultats, Prévisionnel, Au réel.
8. **Paramètres** (`/settings`) - gains Catégories de plat, Types de prestation, Charges fixes, Objectifs, Société.

Phone bottom tab bar shows Semaine, Événements, Recettes, Courses; the rest sits behind "Plus". The mobile drawer in `AdminSidebar.tsx` is replaced by this bar.

## Removed or merged

- "Tableau de bord" removed. KPIs reduced to four tiles on Semaine (CA du mois, Signé ce mois, À encaisser, Marge brute du mois).
- "Planning semaine" modal in `Events.tsx` removed; `/semaine` replaces it.
- "PDF agrégé" removed from the week; a per-day "Imprimer la fiche" stays as a fallback built from the same grouped lines.
- "Dédoublonner" (blind `POST /admin/ingredients/deduplicate`) removed; replaced by the Doublons page.
- Tax toggle, override input and `estimateBelgianTax` removed.

Files: `apps/frontend/src/App.tsx` (routes), `apps/frontend/src/components/admin/AdminSidebar.tsx` (menu items and bottom bar), `apps/frontend/src/components/admin/AdminLayout.tsx` (bottom padding on phone).

## Screens

### Semaine (/ and /semaine/:weekStart (YYYY-MM-DD of the Monday))

Answer 'what do I cook this week and for whom' and show the week's money. Replaces Dashboard and the WeekPlannerModal.

**Layout**

**Data**: `api.events.list()`, `api.clients.list()`, `api.recipes.list()`, `api.ledger.list(year)`, `api.eventTemplates.list()`; `weekPlan()` and `prepLinesForDate()` from `packages/types/src/planning.ts`.

**Laptop**: header row with prev/next week, 'Semaine du 13 au 19 octobre', and a 'Favoris' menu listing templates with weekdays (one entry per template: 'Planifier Hoona semaine type'). Below, a four-tile strip (CA du mois, Signé ce mois, À encaisser, Marge brute du mois). Then seven columns, Monday to Sunday. Each column: date heading (text-lg), per-day total guests and signed revenue, then one card per event (client name or event name, prestation type tag, guests) and inside each card the lines sorted by course then order: 'Mini quiches · 30' with a prep status dot. Lines whose `prepDate` is this day but whose event is another day appear under their prep day with 'pour samedi'.

**Phone**: the seven days stack vertically, today expanded, other days collapsed to a one-line summary (date, n événements, n convives). Tiles become a two-by-two grid under the header. Tap a day heading to open `/jour/:date`.

**Interactions**

- Prev/next week buttons and a date picker change the route.
- Tap a day heading: open `/jour/:date`.
- Tap an event card: open `/events/:id`.
- Tap a line: opens cook mode at that line's portions (`/recipes/:recipeId/cook?event=&line=&portions=`).
- Long-press or hover a line: toggle prepStatus (`PATCH /admin/events/:id/lines/:lineId { prepStatus }`).
- 'Planifier <favori> pour cette semaine': calls `POST /admin/event-templates/:id/instantiate { dates }` with the template's weekdays mapped onto this week; shows 'Créé 5, déjà présent 0'.
- Client filter chip (`?client=<clientId>`) narrows the week to one client (the Hoona week view).
- 'Imprimer la semaine': builds the PDF from the same grouped lines, per day, one page per day.

### Fiche du jour (/jour/:date)

The clickable prep sheet for one day: every recipe line to produce that day, grouped by course, with per-client portions and a done toggle.

**Layout**

**Data**: same scans; `prepLinesForDate(events, recipes, clients, date)`.

**Laptop**: 720px reading column. Title 'Mardi 14 octobre', subtitle 'n lignes · n convives · 3 événements'. Toggle 'Par événement / Par recette'. In 'Par événement' mode: one section per event (client name, type tag, guests), lines grouped by course heading (Apéritif, Entrée, Plat, Dessert, Autre), each line 56px: recipe name (text-lg), portions bold, prep status checkbox (44px), notes under the name. In 'Par recette' mode: lines merged by recipeId with total portions and the breakdown 'Hoona 30 + Mariage 50' under it.

**Phone**: same column full width, sticky day header, course headings sticky. Checkbox on the left so the thumb reaches it.

**Interactions**

- Tap the checkbox: cycles todo → doing → done via `PATCH /admin/events/:id/lines/:lineId { prepStatus }`; optimistic update; invalidates ['events'].
- Tap the recipe name: cook mode at this line's portions.
- Tap a note: inline edit, saved with the same line PATCH.
- 'Déplacer la préparation' on a line: date picker writes `prepDate` so a Saturday dessert can sit on Friday's sheet.
- 'Imprimer': PDF of this screen only.

### Événement (/events/:id)

Read and adjust one event: menu grouped by course with manual reorder, costs, client, prestation, hours, and the close-out actions that create journal lines.

**Layout**

**Data**: `api.events.get(id)`, recipes, ingredients, clients, ledger entries filtered by `eventId`.

**Laptop**: breadcrumb 'Événements / Hoona · lundi 13 oct'. Header: client name (link to `/clients/:id`), date, guests, prestation type tag, VAT rate, status tag, and derived badges 'Facturé n° 2026-014' and 'Payé le 20/10' from linked ledger entries. Four stat tiles: Coût matières (snapshot or live, labelled), Revenu signé, Marge, Marge %. Then the menu: one block per course in settings order, lines inside sorted by `order`; each line row shows recipe, portions (editable), notes, prep status, a 'Cuisiner' button and a grip handle. Then Coûts supplémentaires with a `kind` select per row. Then Heures et déplacements (hoursPlanned, hoursSpent, km). Then 'Journal' listing linked entries with a 'Créer la facture' and 'Ajouter un acompte' button.

**Phone**: same order, tiles in a two-by-two grid, grip handles replaced by up/down buttons (44px), course blocks collapsible.

**Interactions**

- Drag a line (laptop) or tap up/down (phone): `PUT /admin/events/:id/lines/order { lineIds }`.
- Change course on a line (select): `PATCH /admin/events/:id/lines/:lineId { course }` followed by the order call.
- Edit portions or notes inline: line PATCH.
- 'Ajouter une recette': `POST /admin/events/:id/lines { recipeId, portions, course }`, course prefilled from `recipe.defaultCourse`.
- Status 'Marquer terminé': `PATCH /admin/events/:id { status: 'completed' }`; the server writes `costSnapshot`. A 'Recalculer le coût' action calls `POST /admin/events/:id/snapshot` after a confirm.
- 'Créer la facture': sheet prefilled by `POST /admin/ledger/from-event/:id`; the user types the Falco number, confirms TVAC, KM, réglé.
- 'Ajouter un acompte': same sheet with kind acompte.
- 'Enregistrer comme favori': `POST /admin/event-templates/from-event/:id { name, weekdays }`.
- Header fields (client, prestation type, VAT, hours) edit inline through `PATCH /admin/events/:id` with `expectedUpdatedAt`.

### Cuisiner (/recipes/:id/cook?portions=30&event=<eventId>&line=<lineId>)

Follow one recipe at the event's portions in large type, and mark the event line done at the end.

**Layout**

**Laptop or tablet**: two columns. Left: ingredients list scaled to `portions` (text-lg rows, name left, quantity bold right). Right: steps as a scrollable list at text-2xl serif, left-aligned, the active step highlighted, with 'n / total' and two 56px prev/next buttons. Header shows the recipe name, the event and client name when `event` is set, and a portions stepper initialised from the query param.

**Phone**: single column, steps list on top, ingredients in a bottom drawer that opens with a 'Ingrédients' button. Text selection enabled.

**Interactions**

- Portions stepper: rescales; `scaleQty` stays in `RecipeCook.tsx`.
- Tap a step: makes it active; arrows and space keep working.
- 'Terminé' on the last step: when `event` and `line` are set, `PATCH /admin/events/:event/lines/:line { prepStatus: 'done' }` then navigates back to `/jour/:date`.
- 'Quitter': returns to the referrer (day sheet or recipe).

### Recette (lecture) (/recipes/:id and /recipes/:id?view=cout)

Read a recipe comfortably; costing and pricing live behind a toggle, editing behind an explicit mode.

**Layout**

**Laptop**: 720px column. Photo full width (aspect 3/2) when present, title in Playfair 36px, metadata line (format tag with `recipe.type`, course tag with `recipe.defaultCourse`, portions, poids). Ingredients as a two-column list at text-lg with a portions stepper. Steps as a numbered list at text-lg, 40px gaps. Buttons: 'Cuisiner' (primary), 'Modifier', 'Coût & prix'. The 'Coût & prix' view keeps today's six-column table and the pricing simulation.

**Phone**: same column full width; 'Coût & prix' table falls back to cards.

**Interactions**

- 'Modifier' enters edit mode: fields become inputs with visible borders, delete controls appear; the existing `saveRecipeField` autosave is kept.
- 'Catégorie de plat' select writes `recipe.defaultCourse` via `PATCH /admin/recipes/:id`.
- Reading mode has no click-to-edit targets.

### Clients (/clients and /clients/:id)

Hold recurring clients, their defaults and favourites, and show their next four weeks so Hoona is set up once and reused.

**Layout**

**List (laptop)**: rows at text-base: name, kind tag (Société / Particulier), default prestation type, next event date. Search box. 'Nouveau client' button.

**Detail (laptop)**: header with name, contact, VAT number, defaults (prestation type, VAT rate, price per guest, guest count), notes. Left: 'Favoris' list (templates with `clientId`), each with weekdays and a 'Planifier' button. Right: a four-week grid, rows = weeks, cells = weekdays; a cell shows the event (guests, status) or a '+' when the client's weekly template has that weekday and no event exists. Below: past events list with invoiced total from ledger.

**Phone**: list rows full width; detail stacks header, favourites, then the grid as a vertical list of weeks.

**Interactions**

- Create and edit through `POST/PATCH /admin/clients`.
- 'Planifier la semaine du X' on a favourite: `POST /admin/event-templates/:id/instantiate { dates }`.
- Tap a grid cell with an event: open `/events/:id`. Tap '+': instantiate for that single date.
- 'Nouvel événement pour ce client': opens `/events/new?client=<id>` with defaults prefilled.
- Delete refused with 409 when events reference the client; the UI offers 'Archiver' (`active: false`) instead.

### Doublons d'ingrédients (/ingredients/doublons)

Find duplicate ingredients, choose the survivor, and merge with every recipe and grocery list remapped.

**Layout**

**Laptop**: list of candidate groups from `GET /admin/ingredients/duplicates`. Each group is a card: the normalised key as the heading ('oeuf'), one row per member: radio (survivor), name, price and unit, supplier, 'utilisé dans n recettes, n listes', updatedAt. The suggested survivor is preselected. A 'Fusionner' button per group and a 'Ignorer ce groupe' link (stored in localStorage only). A search field to build a manual group from two arbitrary ingredients.

**Phone**: cards stack; rows are 56px with the radio on the left.

**Interactions**

- Pick the survivor and tap 'Fusionner': `POST /admin/ingredients/merge { survivorId, mergedIds }`; a confirm sheet lists the recipes and lists that will be rewritten.
- On 409 UNIT_MISMATCH the sheet shows the offending recipes and lines; the user picks another survivor or fixes the line unit on the recipe first.
- After success: toast with counts, group removed, caches ['ingredients','recipes'] invalidated.

### Comptes · Journal (/comptes/journal?year=2026&month=10)

The journal des recettes and the purchases book: records, totals, lock and export for the accountant.

**Layout**

**Laptop**: year and month selectors, book toggle (Ventes / Achats), filters (type, réglé). A real table in the workbook's column order: N° | Date | Intitulé | Type | Total TVAC | HTVA | TVA 6 % | TVA 12 % | TVA 21 % | Réglé | Mode | Encaissé le | KM | Description. Footer rows: TOTAL, 'Total CA mm/aaaa', then one row per prestation type. Locked months show a lock icon and read-only rows. Purchases book columns: Date | Intitulé | Type (MP / Personnel / Autre) | Fournisseur ou Personne | Heures | Taux | HTVA | TVA | TVAC | Réf. Buttons: 'Nouvelle ligne', 'Exporter le livre YYYY', 'Verrouiller le mois'.

**Phone**: cards per entry (label, date, TVAC, paid tag); the add form is a full-screen sheet.

**Interactions**

- 'Nouvelle ligne': form with kind select; for sales, typing TVAC and a rate prefills HTVA and VAT via `splitTvac`; the user can overwrite HTVA (the sheet note 'tvac/1,06 ou 1,12 ou 1,21').
- Row click: edit sheet; `PATCH /admin/ledger/:id`; 409 when locked.
- 'Verrouiller le mois' after export: `POST /admin/ledger/lock { yearMonth }`.
- 'Exporter': client-side xlsx (see accounting section).

### Comptes · Aperçu par mois (/comptes/apercu?year=2026)

CA HTVA by month against last year, the objective and the forecast, plus the revenue mix by prestation type.

**Layout**

**Laptop**: the bar chart from Dashboard.tsx reused with three series (CA N, CA N-1, Objectif). Below, the Aperçu table and the Mix par prestation table (columns in the accounting section). An objective box (seuil annuel et mensuel, objectif annuel et mensuel). **Phone**: chart full width, tables as cards.

**Interactions**

- Year select. Click a month: navigates to the journal for that month. Click 'Modifier l'objectif': opens Paramètres › Objectifs.

### Comptes · Compte de résultats (/comptes/resultats?year=2026)

Monthly income statement: CA, MP, marge brute, charges fixes, personnel extra, autres coûts, résultat avant impôts, impôts, résultat net.

**Layout**

**Laptop**: 12 rows plus Total, columns per the accounting section, ratio rows, a Simulation row from the objective. Each MP cell carries a small source label (achats / recettes). **Phone**: one card per month with the same lines stacked.

**Interactions**

- Year select. Tap an MP cell: shows the events and purchases that compose it. 'Taux ISoc' link opens Paramètres › Objectifs.

### Comptes · Prévisionnel (/comptes/previsionnel?year=2026)

Fixed charges with the solo scenario, breakeven, treasury need, investment envelope.

**Layout**

**Laptop**: scenario toggle 'Avec salarié / Seule'. Charges table: Intitulé | Catégorie | Mensuel | Mensuel sans salarié | Annuel | Valide du / au. Summary tiles: Seuil de rentabilité annuel et mensuel, Besoin de trésorerie, Bénéfice avant impôts prévu, ISoc prévu, Marge nette prévue. Investments list. **Phone**: tiles first, charges as cards.

**Interactions**

- Edit a charge: opens a sheet; changing an amount closes the current row (`to`) and creates a new one (`from` = next month). Stored in settings.fixedCharges via `PATCH /admin/settings`.

### Comptes · Au réel (/comptes/au-reel?year=2026&month=10)

Signed versus target per month with hours, replacing the 'Au réel' sheet.

**Layout**

**Laptop**: one block per month: table Client / événement | Type | CA HTVA | Heures | Observations; footer with Σ CA signé, Σ heures, Objectif mensuel, Heures disponibles, Reste à signer, Heures restantes. Year total and écart. **Phone**: one month at a time with a month selector.

**Interactions**

- Row click opens the event. Hours edited inline write `hoursSpent` through `PATCH /admin/events/:id`.

### Paramètres (/settings)

Hold the three taxonomies, suppliers, fixed charges, objectives and company data in the single settings item.

**Layout**

**Laptop**: sections as cards: Formats de recette (today's recipeCategories, renamed), Catégories de plat (courses, ordered), Types de prestation (key, label, default VAT), Fournisseurs (with colour), Charges fixes, Objectifs par année, Société (name, VAT number, address for the export header). **Phone**: same sections stacked, each collapsible.

**Interactions**

- All sections save through `PATCH /admin/settings` with the extended DTO; the page keeps the dirty-and-save pattern from `Settings.tsx`.
- Course order via up/down; renaming a course prompts 'Renommer aussi sur les lignes existantes ?' which runs a client-side loop of line PATCHes (small data).

## Data model changes

## 1. Taxonomies and money primitives (new file `packages/types/src/entities/taxonomies.ts`)

```ts
export const DEFAULT_COURSES = ["Apéritif", "Entrée", "Plat", "Accompagnement", "Dessert", "Autre"];

export const PRESTATION_TYPES = [
  "menu_a_emporter", "buffet_a_emporter", "buffet_avec_service",
  "atelier", "brunch", "walking_cocktail", "chef_a_domicile",
] as const;
export type PrestationType = (typeof PRESTATION_TYPES)[number];

export const VAT_RATES = [0, 6, 12, 21] as const;
export type VatRate = (typeof VAT_RATES)[number];

export interface PrestationTypeSetting {
  key: string;                 // one of PRESTATION_TYPES or a user-added key
  label: string;               // "Menu à emporter"
  defaultVatRate: VatRate;     // 6 for take-away, 12 for served, 21 for atelier (to confirm with the accountant)
}
export const DEFAULT_PRESTATION_TYPES: PrestationTypeSetting[] = [
  { key: "menu_a_emporter", label: "Menu à emporter", defaultVatRate: 6 },
  { key: "buffet_a_emporter", label: "Buffet à emporter", defaultVatRate: 6 },
  { key: "buffet_avec_service", label: "Buffet avec service", defaultVatRate: 12 },
  { key: "atelier", label: "Atelier", defaultVatRate: 21 },
  { key: "brunch", label: "Brunch", defaultVatRate: 12 },
  { key: "walking_cocktail", label: "Walking / cocktail", defaultVatRate: 12 },
  { key: "chef_a_domicile", label: "Chef à domicile", defaultVatRate: 12 },
];
```

`packages/types/src/money.ts` (new): `round2`, `sumMoney(xs)` (sums in integer cents), `splitTvac(tvac, rate) => { htva, vat }`, `fmtEur` using `Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR" })`.

`packages/types/src/costing.ts` (new, moved from `apps/frontend/src/lib/recipe-helpers.ts`): `calcIngredientLineCost`, `calcRecipeCost(recipe, ingredientById: Map)`, `calcEventCost(event, recipeById, ingredientById) => { calculated, rawMaterial, extras, total, source: "snapshot" | "actual" | "live" }` with `rawMaterial = event.actualCost ?? event.costSnapshot?.rawMaterial ?? calculated`. `recipe-helpers.ts` re-exports them so the existing pages compile.

## 2. Event (`packages/types/src/entities/event.ts`)

```ts
export type PrepStatus = "todo" | "doing" | "done";

export interface EventRecipeLine {
  lineId: string;            // REQUIRED after migration 001; server fills randomUUID() on every write
  recipeId: string;          // required
  portions: number;          // required
  course?: string;           // optional; value from settings.courses; undefined renders under "Autre"
  order?: number;            // optional; global position in the event, server reassigns 0..n-1 on reorder
  notes?: string;            // optional
  prepStatus?: PrepStatus;   // optional; undefined reads as "todo"
  prepDate?: string;         // optional YYYY-MM-DD; undefined reads as event.date
}

export type ExtraCostKind = "matiere" | "personnel" | "location" | "transport" | "autre";
export interface EventExtraCost {
  label: string;
  amount: number;
  kind?: ExtraCostKind;      // optional; undefined reads as "autre"
}

export interface EventCostSnapshot {
  rawMaterial: number;       // Σ unitCost × portions over lines + Σ extraCosts kind "matiere"
  extras: number;            // Σ extraCosts not "matiere"
  lines: { lineId: string; recipeId: string; portions: number; unitCost: number }[];
  takenAt: string;           // ISO timestamp
  approximate?: boolean;     // true when written by migration 002 at today's prices
}

export interface AppEvent {
  eventId: string; name: string; nameLower: string; date: string; guestCount: number;
  recipes: EventRecipeLine[]; extraCosts: EventExtraCost[]; sellingPricePerGuest: number;
  notes?: string; contactName?: string; contactPhone?: string; contactEmail?: string;
  actualCost?: number | null; status: EventStatus; createdAt: string; updatedAt: string;
  // new, all optional
  clientId?: string;
  templateId?: string;
  prestationType?: string;       // key into settings.prestationTypes
  vatRate?: VatRate;
  hoursPlanned?: number;
  hoursSpent?: number;
  km?: number;
  serviceTime?: string;          // "11:30"
  address?: string;
  costSnapshot?: EventCostSnapshot;
  ledgerEntryIds?: string[];     // sales entries created from this event (facture, acomptes)
}
```

Existing rows: read correctly. Every new attribute is optional; `removeUndefinedValues: true` already drops undefined on put. Only `lineId` needs migration 001 because the line endpoints address lines by it.

## 3. Recipe, Ingredient, GroceryList

```ts
// recipe.ts
export interface Recipe { /* unchanged */ defaultCourse?: string; }   // optional; used to prefill line.course

// ingredient.ts
export interface Ingredient { /* unchanged */
  mergedFrom?: string[];   // optional; ids merged into this one, for audit
  aliases?: string[];      // optional; lower-cased names of merged ingredients, used by name-based imports
}

// grocery-list.ts
export interface GroceryList { /* unchanged */ eventIds?: string[]; }  // optional; lets the page show "Régénérer" when an event changed
```

All optional, existing rows read correctly.

## 4. Settings (`packages/types/src/entities/settings.ts`), single item, no new table

```ts
export interface SettingsSupplier { name: string; address?: string; phone?: string; color?: string; }

export interface FixedCharge {
  chargeId: string; label: string;
  category: "social" | "salaire" | "assurance" | "abonnement" | "frais" | "remboursement" | "autre";
  monthlyAmount: number;          // "avec salarié" scenario
  monthlyAmountSolo?: number;     // "sans salarié" column; undefined means same as monthlyAmount
  from: string;                   // "YYYY-MM" inclusive
  to?: string;                    // "YYYY-MM" inclusive; undefined means still active
  note?: string;
}

export interface YearObjective {
  annualRevenue: number; monthsActive: number;                       // 160000, 10
  monthlyOverrides?: Record<string, number>;                         // "2026-07": 0
  byPrestation: { type: string; amount: number; eventsNeeded?: number; guestsPerEvent?: number }[];
  hoursAvailablePerMonth?: number;
  rawMaterialPct: number;         // 0.38 default; used by breakeven and the simulation row
  corporateTaxRate: number;       // 0.25 default, editable
  extrasBudget?: number;          // annual extra-staff budget for the simulation row
  treasuryMonths: number;         // 3
  treasurySavingPerMonth?: number;
  investments: { label: string; amount: number }[];
}

export interface AppSettings {
  settingsId: "global"; recipeCategories: string[]; suppliers: SettingsSupplier[]; updatedAt: string;
  courses?: string[];                              // defaults to DEFAULT_COURSES on read
  prestationTypes?: PrestationTypeSetting[];       // defaults to DEFAULT_PRESTATION_TYPES on read
  fixedCharges?: FixedCharge[];                    // defaults to []
  objectives?: Record<string, YearObjective>;      // keyed by "2026"
  company?: { name: string; vatNumber: string; address: string }; // export header
}
```

`SettingsService.get` fills defaults the same way it fills `suppliers` today. `SettingsService.update`'s `Pick` and `updateSettingsRequestSchema` are extended with these keys. The item stays far below 400 KB (30 charges, a handful of years).

## 5. Client (new table `ta-clients-{stage}`, PK `clientId`)

```ts
export interface Client {
  clientId: string; name: string; nameLower: string;
  kind: "company" | "private";
  contactName?: string; phone?: string; email?: string; address?: string; vatNumber?: string;
  defaultPrestationType?: string; defaultVatRate?: VatRate;
  defaultPricePerGuest?: number; defaultGuestCount?: number;
  notes?: string; active: boolean; createdAt: string; updatedAt: string;
}
```

## 6. EventTemplate (new table `ta-event-templates-{stage}`, PK `templateId`)

```ts
export interface EventTemplate {
  templateId: string; name: string;            // "Hoona semaine type"
  clientId?: string;
  prestationType?: string; vatRate?: VatRate;
  guestCount: number; sellingPricePerGuest: number;
  recipes: EventRecipeLine[];                  // lineIds regenerated at instantiation
  extraCosts: EventExtraCost[];
  weekdays?: number[];                         // 1..7 ISO; undefined means single event, no recurrence
  namePattern?: string;                        // "{client} · {weekday} {d} {mmm}" default
  notes?: string; createdAt: string; updatedAt: string;
}
```

Not an event with a flag: `Dashboard.monthlyData`, the week view and the ledger views all iterate events, and a flagged template would need every reader patched.

## 7. LedgerEntry (new table `ta-ledger-{stage}`, PK `entryId`)

```ts
export type SalesKind = "facture" | "acompte" | "comptoir" | "commission" | "bon_cadeau" | "autre";
export type PurchaseKind = "mp" | "personnel" | "autre";
export type PaymentMethod = "virement" | "cash" | "bancontact" | "payconiq" | "autre";

interface LedgerBase {
  entryId: string;
  book: "sales" | "purchases";
  date: string;            // YYYY-MM-DD (invoice or operation date)
  yearMonth: string;       // "2026-01", written server-side from date.slice(0, 7)
  label: string;
  description?: string;
  eventId?: string; clientId?: string;
  totalTvac: number; htva: number;
  vat: { rate: VatRate; amount: number }[];   // one element per rate present on the line
  locked?: boolean;        // set by the month lock after export; PATCH and DELETE refuse
  createdAt: string; updatedAt: string;
}
export interface SalesEntry extends LedgerBase {
  book: "sales"; kind: SalesKind;
  number?: string;                 // Falco invoice number, typed by hand
  prestationType?: string;
  paid: boolean; paymentMethod?: PaymentMethod; paidAt?: string;
  km?: number;
}
export interface PurchaseEntry extends LedgerBase {
  book: "purchases"; kind: PurchaseKind;
  supplier?: string;               // kind "mp"
  personName?: string; hours?: number; hourlyRate?: number; invoiceRef?: string;  // kind "personnel"
}
export type LedgerEntry = SalesEntry | PurchaseEntry;
export type Deposit = SalesEntry & { kind: "acompte" };          // no separate table
export type ExtraShift = PurchaseEntry & { kind: "personnel" };  // no separate table; amount = hours × hourlyRate = htva
```

Deposit and ExtraShift are narrow types of the same record so the journal, the export and the income statement have one source. Objective and FixedCharge live in settings (section 4). Table starts empty; no migration.

## 8. Zod DTO changes (`packages/types/src/dto/*.ts`)

```ts
// dto/primitives.ts
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const yearMonth = z.string().regex(/^\d{4}-\d{2}$/);
export const money = z.number().refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "2 decimals max");
export const vatRate = z.union([z.literal(0), z.literal(6), z.literal(12), z.literal(21)]);

// dto/events.ts
const eventRecipeLineSchema = z.object({
  lineId: z.string().min(1).optional(),            // server fills when absent
  recipeId: z.string().min(1),
  portions: z.number().int().positive(),
  course: z.string().trim().max(40).optional(),
  order: z.number().int().nonnegative().optional(),
  notes: z.string().trim().max(500).optional(),
  prepStatus: z.enum(["todo", "doing", "done"]).optional(),
  prepDate: isoDate.optional(),
}).strict();
const eventExtraCostSchema = z.object({
  label: z.string().min(1).trim(), amount: z.number().nonnegative(),
  kind: z.enum(["matiere", "personnel", "location", "transport", "autre"]).optional(),
}).strict();
export const createEventRequestSchema = z.object({
  /* existing fields, date becomes isoDate */
  clientId: z.string().min(1).optional(), templateId: z.string().min(1).optional(),
  prestationType: z.string().min(1).optional(), vatRate: vatRate.optional(),
  hoursPlanned: z.number().nonnegative().optional(), hoursSpent: z.number().nonnegative().optional(),
  km: z.number().nonnegative().optional(), serviceTime: z.string().optional(), address: z.string().trim().optional(),
}).strict();
export const updateEventRequestSchema = createEventRequestSchema.partial()
  .extend({ expectedUpdatedAt: z.string().optional() }).strict();
export const addEventLineSchema = eventRecipeLineSchema.omit({ lineId: true, order: true }).strict();
export const updateEventLineSchema = eventRecipeLineSchema.omit({ lineId: true, recipeId: true }).partial().strict();
export const reorderEventLinesSchema = z.object({ lineIds: z.array(z.string().min(1)).min(1) }).strict();

// dto/ingredients.ts
export const mergeIngredientsSchema = z.object({
  survivorId: z.string().min(1), mergedIds: z.array(z.string().min(1)).min(1),
}).strict().refine((v) => !v.mergedIds.includes(v.survivorId), "survivor cannot be merged");

// dto/recipes.ts: add defaultCourse: z.string().trim().optional(); constrain pricing tva to vatRate

// dto/clients.ts (new)
export const createClientSchema = z.object({
  name: z.string().min(1).trim(), kind: z.enum(["company", "private"]).default("company"),
  contactName: z.string().trim().optional(), phone: z.string().trim().optional(), email: z.string().trim().optional(),
  address: z.string().trim().optional(), vatNumber: z.string().trim().optional(),
  defaultPrestationType: z.string().optional(), defaultVatRate: vatRate.optional(),
  defaultPricePerGuest: money.optional(), defaultGuestCount: z.number().int().positive().optional(),
  notes: z.string().trim().optional(), active: z.boolean().default(true),
}).strict();
export const updateClientSchema = createClientSchema.partial().strict();

// dto/event-templates.ts (new)
export const createTemplateSchema = z.object({
  name: z.string().min(1).trim(), clientId: z.string().optional(), prestationType: z.string().optional(),
  vatRate: vatRate.optional(), guestCount: z.number().int().positive(), sellingPricePerGuest: money.default(0),
  recipes: z.array(eventRecipeLineSchema).default([]), extraCosts: z.array(eventExtraCostSchema).default([]),
  weekdays: z.array(z.number().int().min(1).max(7)).optional(), namePattern: z.string().optional(), notes: z.string().optional(),
}).strict();
export const templateFromEventSchema = z.object({ name: z.string().min(1).trim(), weekdays: z.array(z.number().int().min(1).max(7)).optional() }).strict();
export const instantiateTemplateSchema = z.object({ dates: z.array(isoDate).min(1).max(31), guestCount: z.number().int().positive().optional() }).strict();

// dto/ledger.ts (new)
const vatLine = z.object({ rate: vatRate, amount: money }).strict();
const ledgerBase = { date: isoDate, label: z.string().min(1).trim(), description: z.string().trim().optional(),
  eventId: z.string().optional(), clientId: z.string().optional(), totalTvac: money, htva: money, vat: z.array(vatLine).default([]) };
const vatIdentity = (e: { htva: number; totalTvac: number; vat: { amount: number }[] }) =>
  Math.abs(e.htva + e.vat.reduce((s, v) => s + v.amount, 0) - e.totalTvac) < 0.011;
export const createSalesEntrySchema = z.object({ ...ledgerBase, book: z.literal("sales"),
  kind: z.enum(["facture", "acompte", "comptoir", "commission", "bon_cadeau", "autre"]),
  number: z.string().trim().optional(), prestationType: z.string().optional(),
  paid: z.boolean().default(false), paymentMethod: z.enum(["virement", "cash", "bancontact", "payconiq", "autre"]).optional(),
  paidAt: isoDate.optional(), km: z.number().nonnegative().optional() }).strict().refine(vatIdentity, "htva + vat must equal totalTvac");
export const createPurchaseEntrySchema = z.object({ ...ledgerBase, book: z.literal("purchases"),
  kind: z.enum(["mp", "personnel", "autre"]), supplier: z.string().optional(), personName: z.string().optional(),
  hours: z.number().nonnegative().optional(), hourlyRate: money.optional(), invoiceRef: z.string().optional() }).strict().refine(vatIdentity);
export const createLedgerEntrySchema = z.discriminatedUnion("book", [createSalesEntrySchema.innerType(), createPurchaseEntrySchema.innerType()]);
export const ledgerFromEventSchema = z.object({ kind: z.enum(["facture", "acompte"]), number: z.string().optional(), date: isoDate.optional(),
  totalTvac: money.optional(), vatRate: vatRate.optional(), km: z.number().nonnegative().optional(),
  paid: z.boolean().optional(), paymentMethod: z.enum(["virement", "cash", "bancontact", "payconiq", "autre"]).optional(), paidAt: isoDate.optional() }).strict();
export const lockMonthSchema = z.object({ yearMonth }).strict();

// dto/settings.ts: extend with courses, prestationTypes, fixedCharges (from/to yearMonth, money amounts), objectives (record of YearObjective), company, supplier color
```

`.strict()` on every new or changed schema: zod 3.25 strips unknown keys by default, which is how new line fields would silently vanish today.

## 9. NestJS endpoints (all under `AdminGuard`)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/admin/ingredients/duplicates` | none | `{ groups: { key, suggestedSurvivorId, members: { ingredientId, name, unit, price, supplier, updatedAt, recipeRefs, listRefs }[] }[] }` |
| POST | `/admin/ingredients/merge` | `mergeIngredientsSchema` | `{ recipesUpdated, listsUpdated, removed, survivor }`; 409 `{ code: "UNIT_MISMATCH", lines: { recipeId, name, unit }[] }` |
| DELETE | `/admin/ingredients/:id` | none | `{ ok }`; 409 `{ code: "IN_USE", recipes: { recipeId, name }[], lists: number }` |
| POST | `/admin/events/:id/lines` | `addEventLineSchema` | `AppEvent` |
| PATCH | `/admin/events/:id/lines/:lineId` | `updateEventLineSchema` | `AppEvent` |
| PUT | `/admin/events/:id/lines/order` | `reorderEventLinesSchema` (must be a permutation of existing lineIds, else 400) | `AppEvent` |
| DELETE | `/admin/events/:id/lines/:lineId` | none | `AppEvent` |
| PATCH | `/admin/events/:id` | `updateEventRequestSchema`; status → completed triggers `costSnapshot` when absent; `expectedUpdatedAt` → 409 on mismatch | `AppEvent` |
| POST | `/admin/events/:id/snapshot` | none | `AppEvent` (re-takes the snapshot, explicit) |
| GET/POST/PATCH/DELETE | `/admin/clients[/:id]` | `createClientSchema` / `updateClientSchema` | `Client`; DELETE 409 `{ code: "IN_USE", events }` |
| GET/POST/PATCH/DELETE | `/admin/event-templates[/:id]` | `createTemplateSchema` | `EventTemplate` |
| POST | `/admin/event-templates/from-event/:eventId` | `templateFromEventSchema` | `EventTemplate` |
| POST | `/admin/event-templates/:id/instantiate` | `instantiateTemplateSchema` | `{ created: AppEvent[], skipped: string[] }` |
| GET | `/admin/ledger?year=2026` | none | `LedgerEntry[]` (scanAll filtered on `yearMonth.startsWith(year)`) |
| POST | `/admin/ledger` | `createLedgerEntrySchema` | `LedgerEntry` |
| PATCH | `/admin/ledger/:id` | partial of the matching book schema | `LedgerEntry`; 409 when locked |
| DELETE | `/admin/ledger/:id` | none | `{ ok }`; 409 when locked |
| POST | `/admin/ledger/from-event/:eventId` | `ledgerFromEventSchema` | `LedgerEntry`; also appends `entryId` to `event.ledgerEntryIds` |
| POST | `/admin/ledger/lock` | `lockMonthSchema` | `{ locked: number }` |
| PATCH | `/admin/settings` | extended `updateSettingsRequestSchema` | `AppSettings` |

`POST /admin/ingredients/deduplicate` is removed.

## 10. DynamoDB decisions

| Data | Where | Why |
|---|---|---|
| Line fields, event fields, cost snapshot | embedded in `ta-events` | one item per event, read as a whole everywhere |
| Courses, prestation types, fixed charges, objectives, company | `ta-settings` item | tiny, one reader, effective-dated rows keep history |
| Client | new `ta-clients` | referenced by events, templates and ledger; independent lifecycle |
| EventTemplate | new `ta-event-templates` | must never be counted as an event |
| LedgerEntry (incl. deposits, extra shifts, purchases) | new `ta-ledger` | append-only, grows yearly, locked after export |
| Deposit, ExtraShift, FixedCharge, Objective | no table | narrow types of ledger or settings |

No sort keys, no GSI: single-PK tables plus `scanAll` stay the convention. Payload estimate at five years of data: ~5 000 ledger items × ~400 bytes = 2 MB per full scan, filtered by year server-side to ~400 KB. Revisit with a `yearMonth` GSI only if the journal page becomes measurably slow.

## 11. DdbService and config changes (`apps/backend/src/shared/ddb.service.ts`, `apps/backend/src/config/config.service.ts`)

- `batchWrite` and `batchDelete`: loop on `UnprocessedItems` with backoff (100 ms × 2^n, 5 tries, then throw).
- New `transactWrite(ops: TransactWriteItem[])`: used when a write set has ≤ 100 ops (DynamoDB limit); callers fall back to ordered individual writes above that.
- `update(table, key, fields, opts?: { expectedUpdatedAt?: string })`: appends `AND #updatedAt = :expected` to the condition.
- New `apps/backend/src/shared/ddb-exception.filter.ts` mapping `ConditionalCheckFailedException` and `TransactionCanceledException` to HTTP 409.
- Config: `CLIENTS_TABLE`, `EVENT_TEMPLATES_TABLE`, `LEDGER_TABLE` declared `z.string().min(1).optional()`; `DdbService.requireTable("clients")` throws `ServiceUnavailableException("CLIENTS_TABLE not configured")` at first use so the API still boots on the existing EC2 before the SSM parameter exists. Update `infrastructure/lib/data-stack.ts`, `scripts/setup-ssm-params.sh`, `scripts/ec2-bootstrap.sh` and the README table section for the three new tables.
- Drop the unused `QueryCommand` import. Delete `packages/utils` and `TABLE_NAMES` from `packages/types/src/constants`.

## 12. Write plans

- **Event line endpoints**: read the event, modify the array in memory, `ddb.update` the `recipes` attribute only (plus `updatedAt`), conditional on `attribute_exists(eventId)`. One write, no batch.
- **Whole-event PATCH from EventEditor**: EventEditor sends only fields changed since load (diff against the loaded event) plus `expectedUpdatedAt`; a 409 shows "Modifié ailleurs, recharger".
- **Cost snapshot**: in `EventsService.update`, when `fields.status === "completed"` and the stored event has no `costSnapshot`, load recipes and ingredients (inject `RecipesService` and `IngredientsService`; `EventsModule` imports `RecipesModule` and `IngredientsModule`), compute with `calcEventCost`, include `costSnapshot` in the same `ddb.update`.
- **Template instantiation**: scan events once, build the set of `(templateId, date)` already present, skip those, then one `put` per date with `ConditionExpression: attribute_not_exists(eventId)`; ≤ 31 writes, sequential. Re-running with the same dates creates nothing (idempotent by the skip set).
- **Ledger from event**: `transactWrite` with two ops: put the entry (condition `attribute_not_exists(entryId)`) and update `event.ledgerEntryIds` with `list_append(if_not_exists(ledgerEntryIds, :empty), :ids)`.
- **Month lock**: scan ledger filtered by `yearMonth`, `ddb.update` each with `locked: true`, 10 concurrent, idempotent.
- **Ingredient merge**: see the ingredient merge section (ordered remap-then-delete, transaction when ≤ 100 ops).
- **Migrations**: per-item `ddb.update`, never `put`, 10 concurrent, idempotent, `--dry-run`.

## 13. Backward-compatible reads (what each reader defaults)

- Lines: sort key = `(courseIndex(line.course ?? "Autre"), line.order ?? arrayIndex)`; `prepStatus ?? "todo"`; `prepDate ?? event.date`.
- Client name: `clientById.get(event.clientId)?.name ?? event.contactName ?? event.name`.
- Cost: `actualCost ?? costSnapshot?.rawMaterial ?? live`.
- Prestation type: `event.prestationType ?? "Non classé"` bucket in reports.
- Ledger paid badges: derived from entries with this `eventId`; events with none show no badge.
- Settings: `courses ?? DEFAULT_COURSES`, `prestationTypes ?? DEFAULT_PRESTATION_TYPES`, `fixedCharges ?? []`, `objectives ?? {}`.
- Supplier colour: `supplier.color ?? hash(name) into an 8-colour accessible set` replaces `SUPPLIER_COLORS`.

## 14. Migration script outline (`apps/backend/scripts/migrate.ts`, run with `tsx`)

```
pnpm --filter @apps/backend exec tsx scripts/migrate.ts --name 001-line-ids --dry-run
```

Runner: `import "dotenv/config"`; `new ConfigService()`; `new DdbService(config)`; pick the migration by name; `scanAll` the table; compute a patch per item or `null`; when not dry-run, `ddb.update(table, key, patch)` with 10-way concurrency; print `{ scanned, updated, skipped }`. Each migration is safe to re-run.

- **001-line-ids** (Phase 0, mandatory): for each event, if any line lacks `lineId`, patch `recipes` with `lineId: randomUUID()` and `order: index` filled where missing.
- **002-cost-snapshots** (Phase 4): for each `status === "completed"` event without `costSnapshot`, compute at today's prices with `approximate: true`. The income statement labels those months "estimé".
- **003-clients-from-contacts** (Phase 3, optional): group events by `contactEmail || contactName.toLowerCase()`, print the proposed clients in dry-run, create them and patch `clientId` on confirm.
- **004-ledger-yearmonth** (only if an entry was ever written without `yearMonth`; the service always writes it, so normally a no-op).

Settings defaults need no migration (filled on read). New tables start empty.

## Feature solutions

### planning

## Interactive planning from the line model

No new table. Week and day views are projections of `AppEvent.recipes[]` once lines carry `lineId`, `course`, `order`, `prepStatus`, `prepDate`.

**Derived views** in `packages/types/src/planning.ts` (pure, unit-tested with the existing jest project for types):

```ts
export interface PrepLine { eventId; eventName; clientName?; prestationType?; lineId; recipeId; recipeName; portions; course: string; order: number; prepStatus: PrepStatus; date: string; notes?: string }
export function prepLinesForDate(events, recipeById, clientById, courses, date): PrepLine[]
  // (line.prepDate ?? event.date) === date, sorted by courses.indexOf(course) then order ?? index
export function groupByRecipe(lines: PrepLine[]): { recipeId; recipeName; total: number; parts: { label: string; portions: number }[] }[]
export function weekPlan(events, ledgerSales, weekStart): { days: { date; events; guests; signedRevenue; prepLines: number }[]; signedRevenue; invoicedRevenue }
  // signedRevenue = Σ sellingPricePerGuest × guestCount; invoicedRevenue = Σ ledger htva with eventId in the week
```

**Routes** (`App.tsx`): `/` and `/semaine/:weekStart` render `Semaine.tsx`; `/jour/:date` renders `Jour.tsx`; `WeekPlannerModal` and `generateAggregatedPdf` in `Events.tsx` are deleted.

**Writes from the kitchen** never touch the whole-array PATCH: `PATCH /admin/events/:id/lines/:lineId { prepStatus }` and `{ notes }`, `{ prepDate }`. The week revenue strip reads `weekPlan().signedRevenue` and `invoicedRevenue` so the caterer sees quote-level and invoice-level money side by side, matching the workbook's 'Prévision' and 'CA htva' columns.

**Cook mode from a line**: `/recipes/:id/cook?portions=&event=&line=`; `RecipeCook.tsx` reads the query, initialises `cookPortions` from it instead of `r.portions`, and on 'Terminé' PATCHes the line to done.

**PDF fallback**: a per-day 'Imprimer' builds a one-page-per-day PDF from `prepLinesForDate` grouped by course, 11pt body, so the paper copy matches the screen. The 30-page aggregated PDF is gone.

**Events list**: `Events.tsx` sorts ascending when the filter is 'À venir'.

### readability

## Design system, scoped to what the data model work touches first

Tokens and a scale, applied to the new screens (Semaine, Jour, Événement, Clients, Doublons, Comptes) as they are built, then back-ported to RecipeDetail and RecipeCook in the same phase.

**`apps/frontend/tailwind.config.ts`**: fontSize scale `sm: 14px/20px`, `base: 16px/24px`, `lg: 18px/28px`, `xl: 22px/30px`, `2xl: 28px/36px`, `3xl: 36px/44px`; spacing used in layout limited to 2, 4, 6, 10, 16 (8/16/24/40/64 px); `maxWidth.reading: 720px`.

**`apps/frontend/src/index.css`**: `html { font-size: 16px }`, `body { @apply text-base leading-relaxed }`; `--muted-foreground: 20 10% 38%` (5.9:1 on background); `--primary: 25 55% 45%` (4.6:1 with white); new `--success`, `--info`, `--warning` warm hues validated at 4.5:1 on card; `.input-field` at `text-base py-2.5 bg-card`; remove the global `h1..h6 { font-serif }` rule and apply `font-serif` explicitly at 28px and above only; `--sidebar-background: 30 20% 93%` with dark text.

**Components in `apps/frontend/src/components/ui/`**: `Tag` (variant: success | info | warning | neutral | supplier with tinted background and dark text), `FieldLabel` (sentence case, `text-sm font-medium text-foreground`), `ListRow` (min-h 56px, primary text-base, secondary text-sm muted, trailing slot), `PageHeader` (breadcrumb line + Playfair title), `StatTile`, `CourseGroup` (heading + ListRows), `BottomTabBar`.

**Rules**: no `text-xs` or `text-[10px]`/`text-[11px]` on any page the caterer reads in the kitchen; tables only on laptop costing views (RecipeDetail 'Coût & prix', Journal, Compte de résultats) with card fallback below `md`; every button 44px minimum on Jour, Cuisiner, Courses; hover-only controls removed, destructive actions live in edit mode.

**Recipe reading first** (`RecipeDetail.tsx`): split into a reading column (720px, text-lg ingredients and steps, `space-y-5`, 32px step badges, no click-to-edit) and a `?view=cout` toggle that keeps the existing table and `PricingSimulation`. 'Modifier' toggles the existing inline editors on. `RecipeCook.tsx` keeps its type scale, drops `select-none`, left-aligns steps, shows ingredients beside steps on tablets, and replaces the dot strip with 'n / total' plus two large buttons.

**Fix list**: `h-22` → `h-24`; GroceryListPage full-bleed via an outlet context `fullBleed` in `AdminLayout.tsx` and `h-[calc(100dvh-52px)] md:h-[100dvh]`; `StatusTag` non-interactive in lists; status changed from the event page only.

### ingredientMerge

## Duplicates: find, pick, remap, delete

**Finding duplicates** (`GET /admin/ingredients/duplicates`, `IngredientsService.findDuplicates`):

1. Normalise each name to a key with `normalizeIngredientName` in `packages/types/src/normalize.ts` so the frontend search can reuse it: NFD and strip combining marks; `œ`→`oe`, `æ`→`ae`; lowercase; drop any parenthesised segment `\(.*?\)`; drop unit and packaging tokens (`kg`, `g`, `gr`, `l`, `ml`, `cl`, `pièce`, `piece`, `pc`, `pcs`, `botte`, `bte`, `sachet`, `boite`, `boîte`, `paquet`, `x\d+`); drop articles (`de`, `du`, `des`, `la`, `le`, `les`, `d'`); strip a trailing `s` or `x` from tokens of 4+ letters (`oeufs`→`oeuf`, `choux`→`chou`); collapse whitespace and punctuation to single spaces.
2. Exact-key groups form first.
3. A second pass merges keys whose Levenshtein distance ≤ 1 for keys of length ≥ 5 (catches `tomate cerise` / `tomates cerises` already handled by the plural rule, and `courgete` / `courgette`), and keys where one is a token-subset of the other (`oeuf` vs `oeuf bio`) are shown as a suggestion group flagged `weak: true` so the UI lists them below the strong groups.
4. For each member, count references by scanning recipes (`recipe.ingredients[].ingredientId`) and grocery lists (`items[].ingredientId`). Three scans total.

**Choosing the survivor**: suggested survivor = most recipe references, tie broken by most recent `updatedAt`, tie broken by the shortest name. The user can change the radio. Never automatic: the endpoint only proposes.

**Merging** (`POST /admin/ingredients/merge { survivorId, mergedIds }`, `IngredientsService.merge`):

1. Load survivor and merged rows (404 if any missing). Load all recipes and grocery lists.
2. Unit check: for every recipe line referencing a merged id, the line unit must be `PRICE_TO_QTY_UNIT[survivor.unit]`; otherwise respond 409 `UNIT_MISMATCH` with the recipe names and the line units. Nothing is written.
3. For each recipe with at least one affected line: rewrite `ingredientId` to `survivorId`; if the recipe then has two lines with the survivor id and the same unit, sum `qty` (weighted lossPct: keep the max). Collect `{ recipeId, recipes }` patches.
4. For each grocery list with affected items: rewrite `ingredientId`, set `name` to the survivor name, keep `totalQty`, `haveQty`, `checked`; merge duplicates by `ingredientId:unit` summing `totalQty` and `haveQty`. Collect patches.
5. Survivor patch: `mergedFrom: union(existing, mergedIds)`, `aliases: union(existing, merged nameLower values)`.
6. Write in this order: recipe updates, list updates, survivor update, then `batchDelete(mergedIds)`. When the total op count is ≤ 100, all of it goes in one `transactWrite` (most merges: 2 ingredients, under 20 recipes, a couple of lists). Above 100, the ordered sequence runs with 10 concurrent `ddb.update` per step.
7. Return `{ recipesUpdated, listsUpdated, removed, survivor }`.

**Remapped records**: `ta-recipes` `recipe.ingredients[].ingredientId`; `ta-grocery-lists` `items[].ingredientId` and `name`; survivor `mergedFrom` and `aliases`. Events reference `recipeId` only; settings hold no ingredient ids. The localStorage pending payload (`recipe-book:grocery-list-pending`) is transient: `GroceryListPage.tsx` drops pending items whose `ingredientId` is not in the fresh ingredient list and toasts 'n ingrédients ignorés'. `RecipesService.importRecipes` and `IngredientsService.importIngredients` match names against `nameLower` and `aliases`, so an old CSV naming 'Oeufs' still resolves to the survivor.

**Partial failure**: the order guarantees there is never a deleted ingredient with live references. If a recipe update fails, merged ingredients still exist and the remaining recipes still point at them; the UI shows the error and 'Réessayer' calls the same endpoint again: already-remapped recipes are no-ops, the rest get remapped, deletion happens last. If the deletion batch is throttled, the `UnprocessedItems` loop retries; if it still fails, the merged ingredients survive with no references and reappear as a duplicate group tagged 'non référencé', and the next merge removes them. `DELETE /admin/ingredients/:id` returns 409 `IN_USE` with the referencing recipe names so a plain delete can no longer orphan a line.

**Cache**: `api.ingredients.merge` invalidates `['ingredients', 'recipes']`; `api.ingredients.delete` the same. `calcRecipeCost` takes an `ingredientById` Map built once per page.

### eventOrdering

## Course lives on the line, with a default on the recipe

**Where the course lives**: both. `recipe.defaultCourse?` is a convenience for the 'Ajouter une recette' action (and a filter on the recipes list). `line.course?` is the truth for the event: a cheese tart can be an entrée on Tuesday and a plat on Saturday, and a Hoona template may put the same recipe in two courses on two lines, which the `lineId` identity now allows (duplicate `recipeId` per event is permitted). The course list is `settings.courses` (ordered, editable). Lines whose course is not in the list (renamed or undefined) render under 'Autre' at the end; renaming a course in Paramètres offers to PATCH the lines that carry the old value.

**Where the order lives**: `line.order` is an integer, global across the event, assigned by the server. `POST /admin/events/:id/lines` appends with `order = max + 1`. `PUT /admin/events/:id/lines/order { lineIds }` validates that `lineIds` is a permutation of the stored ids (400 otherwise) and rewrites `order = index`. Display groups by `courses.indexOf(course)` first and then by `order`, so the same `order` sequence survives a course change: moving a line to another course is `PATCH line { course }` followed by the order call with the new visual sequence. Events written before Phase 1 have no `order`; the reader falls back to array index, and migration 001 writes `order = index` so the fallback is never needed after it runs.

**Manual reorder UI**: laptop uses HTML5 drag and drop (the pattern already in `GroceryListPage.tsx`) across course blocks on `/events/:id`; phone uses 44px up/down buttons per line and a course select. Both end in the two small calls above; EventEditor's 800 ms whole-array autosave is no longer involved in ordering because EventEditor sends only changed top-level fields plus `expectedUpdatedAt`.

**Downstream**: `prepLinesForDate` and the per-day PDF use the same sort, so the kitchen sheet reads in service order. Templates copy `course` and `order`; instantiation regenerates `lineId` only.

### recurringClient

## Hoona: set up once, see the week or the day, reuse next week

**Entities**: `Client` (new table) and `EventTemplate` (new table) with `weekdays?` for recurrence. The event gets `clientId` and `templateId`.

**Setting up once**
1. `/clients` → 'Nouveau client': name 'Hoona', kind Société, default prestation type `menu_a_emporter`, default VAT 6 %, default price per guest, default guest count (say 30), contact.
2. Create the first week as events. If Hoona is one delivery per week: one event 'Hoona · semaine 42' on Monday with the week's lines grouped by course. If Hoona is fed every working day: five events, one per day, created from `/events/new?client=<id>` which prefills client defaults.
3. On the finished event: ⋯ → 'Enregistrer comme favori' → `POST /admin/event-templates/from-event/:eventId { name: "Hoona semaine type", weekdays: [1,2,3,4,5] }` (or no weekdays for a single weekly event). The template copies `clientId`, `prestationType`, `vatRate`, `guestCount`, `sellingPricePerGuest`, `extraCosts` and the lines with `course`, `order`, `portions`, `notes`.

**Seeing the week or a day**
- `/semaine/:weekStart?client=<hoonaId>` shows only Hoona's events, day by day, with lines and portions, and the signed revenue for Hoona that week.
- `/jour/:date` shows Hoona's lines among the others, each labelled 'pour Hoona', and the 'Par recette' toggle shows 'Mini quiches 80 = Hoona 30 + Mariage 50'.
- `/clients/<hoonaId>` shows a four-week grid: each weekday cell is either the existing event (guests, prep progress) or a '+' when the template has that weekday and no event exists yet.

**Reusing next week**
- On Semaine, the 'Favoris' menu lists 'Hoona semaine type'. 'Planifier pour la semaine du 20 oct' calls `POST /admin/event-templates/<id>/instantiate { dates: ["2026-10-20", ..., "2026-10-24"] }` (dates computed on the client from `weekdays` and the week start). The server scans events once, skips any date that already has an event with this `templateId`, and creates the rest with names from `namePattern` ('Hoona · lundi 20 oct'), `status: upcoming`, fresh `lineId`s, `clientId` and `templateId` set. Response `{ created, skipped }` is toasted.
- Portions differ from the template? `guestCount` in the body scales every line proportionally (ceil). Day-level tweaks are then line PATCHes.
- Menu changes for good? Edit the template on `/clients/<id>` (same line editor as the event) or 'Mettre à jour le favori depuis cet événement'.

**What this replaces**: `handleDuplicate` in `EventDetail.tsx` stays for one-off copies but no longer sets today's date; it opens the editor with the date field focused. Nothing is duplicated by hand for recurring clients.

**Accounting link**: Hoona's monthly 'facture comptoir' pattern from the workbook is a ledger sales entry with `clientId` and no `eventId`, created on the Journal page; the client page lists both event-linked and direct entries, so a monthly invoice covering five events is one line, not five.

### accounting

## Entities

- `LedgerEntry` in the new `ta-ledger` table, two books. Sales kinds: facture, acompte, comptoir, commission, bon_cadeau, autre. Purchase kinds: mp (raw material receipts), personnel (an extra's shift: `personName`, `hours`, `hourlyRate`, `htva = hours × hourlyRate`), autre.
- `Deposit` = sales entry of kind acompte with `eventId`, `paid: true`, `paidAt`, VAT at the event's rate. `ExtraShift` = purchase entry of kind personnel. No separate tables.
- `FixedCharge[]` and `objectives[year]` in the settings item (section 4 of the data model). Changing a charge amount closes the row (`to`) and adds a new one, so past months keep their figure.
- Event additions: `prestationType`, `vatRate`, `hoursPlanned`, `hoursSpent`, `km`, `costSnapshot`, `ledgerEntryIds`. `extraCosts[].kind` separates matière from personnel.
- Records versus views: ledger entries, fixed charges, objectives, `costSnapshot`, `actualCost`, `extraCosts`, `sellingPricePerGuest` are records. Everything in the reports below is a view computed at render time by `packages/types/src/reports.ts` and never stored.

## Screens

`/comptes/journal`, `/comptes/apercu`, `/comptes/resultats`, `/comptes/previsionnel`, `/comptes/au-reel` (described in the screens list), plus the Charges fixes and Objectifs sections in `/settings`. The Extras check ('Factures Kristoff') is the purchases book filtered on kind personnel and person, with Σ heures, taux and montant in the footer.

## How an event becomes a journal line

On `/events/:id`, 'Créer la facture' opens a sheet prefilled by `POST /admin/ledger/from-event/:eventId { kind: "facture" }`:

- `date` = event.date, `label` = client name or event name, `prestationType` = event.prestationType, `clientId`, `eventId`, `km` = event.km
- `htva` = round2(sellingPricePerGuest × guestCount) minus Σ htva of existing acompte entries for the event
- `rate` = event.vatRate ?? settings.prestationTypes[type].defaultVatRate; `totalTvac` = round2(htva × (1 + rate/100)); `vat = [{ rate, amount: totalTvac − htva }]`

The user types the Falco number and overwrites TVAC or HTVA with the invoice figures (the DTO enforces `htva + Σ vat = totalTvac` within 0.01), sets réglé, mode, encaissé le. Save creates the entry and appends its id to `event.ledgerEntryIds` in one transaction. 'Ajouter un acompte' is the same sheet with kind acompte and `paid: true`. The event page then shows 'Facturé n° …' and 'Payé le …' derived from the entries; `event.status` stays a kitchen flag. Non-event lines (comptoir, commission at 0 %, bon cadeau) are created on the Journal page. `paid`, `paymentMethod`, `paidAt` are edited on the entry, never on the event.

## How raw material cost reaches the income statement

Two sources, the report says which it used per month:

- Achats: when the purchases book has kind mp entries in month m, `Coûts MP(m) = Σ purchases.mp.htva in m`.
- Recettes: otherwise `Coûts MP(m) = Σ over events dated in m with status completed of (actualCost ?? costSnapshot.rawMaterial ?? live) + Σ extraCosts kind matière`. `costSnapshot` is written server-side when the event flips to completed, so a later price edit does not move a closed month. Migration 002 snapshots already-completed events at today's prices with `approximate: true`, shown as 'estimé'.

`Personnel extra(m) = Σ purchases.personnel.htva in m + Σ extraCosts kind personnel`. `Autres coûts(m) = Σ remaining extraCosts of completed events in m + Σ purchases.autre`.

## Reports (French labels from the workbook, columns and formulas)

**Journal des recettes (par mois)**: N° | Date | Intitulé | Type | Total TVAC | HTVA | TVA 6 % | TVA 12 % | TVA 21 % | Réglé | Mode | Encaissé le | KM | Description. Footer: TOTAL (Σ TVAC, Σ HTVA, Σ per rate), 'Total CA mm/aaaa' = Σ HTVA, then Σ HTVA per prestation type (the workbook's SUMIF block), 'Sans type' for untyped lines.

**Aperçu par mois**: Mois | CA HTVA N−1 | CA HTVA N | % augmentation = (N − N−1) / N−1 (blank when N−1 = 0) | Objectif de CA HTVA = `monthlyOverrides[ym] ?? annualRevenue / monthsActive` | Prévision = Σ events dated in m of sellingPricePerGuest × guestCount | Atteint ? = CA N ≥ Objectif. Totals row. Box: Seuil de rentabilité annuel et mensuel (formula below), Objectif annuel et mensuel. Comparison block: CA HTVA for 1 jan to 30 avr and 30 avr to 30 juin for N, N−1, N−2.

**Mix par prestation**: Type | CA N−1 | % | CA N = Σ sales htva by prestationType | % | Objectif = byPrestation.amount | % | Nombre nécessaire = eventsNeeded ?? Objectif / (CA N / count of lines of that type). Total row. Commissions and comptoir lines are their own rows so 'CA hors kombucha' is a filter.

**Compte de résultats** (12 rows + Total année): Mois | CA HTVA | Coûts MP | Marge brute = CA − MP | Charges fixes = Σ FixedCharge active in m (from ≤ ym ≤ to), scenario amount | Personnel extra | Autres coûts | Résultat avant impôts = Marge brute − Charges fixes − Personnel − Autres | Marge % = Résultat / CA | Impôts = max(0, Résultat) × corporateTaxRate (Total row: max(0, Σ Résultat) × taux) | Résultat net = Résultat − Impôts. Ratio rows: MP / CA, Marge brute / CA, Charges fixes / CA. Simulation row: CA = annualRevenue, MP = CA × rawMaterialPct, Charges = Σ FixedCharge × 12, Personnel = extrasBudget, Résultat, Marge %.

**Prévisionnel**: charges table Intitulé | Catégorie | Mensuel | Mensuel sans salarié | Annuel, totals per scenario. Then:
- Charges annuelles = Σ (scenario amount × months active in the year)
- Besoin de trésorerie = Σ charges mensuelles × treasuryMonths
- Seuil de rentabilité (CA) = (Charges annuelles + 12 × treasurySavingPerMonth + Σ investments) / (1 − rawMaterialPct); mensuel = seuil / monthsActive. The workbook's figure ignores MP; the page shows 'hors matières' next to it for one year so the caterer recognises her number.
- Bénéfice avant impôts prévu = annualRevenue × (1 − rawMaterialPct) − Charges annuelles − extrasBudget
- ISoc prévu = max(0, bénéfice) × corporateTaxRate; Marge nette prévue % = (bénéfice − ISoc) / annualRevenue
- Investissements list with total.

**Au réel** (one block per month): Client / événement | Type | CA HTVA = Σ sales entries of the event, else sellingPricePerGuest × guestCount | Heures = hoursSpent ?? hoursPlanned | Observations = event.notes. Footer: Σ CA signé, Σ heures, Objectif mensuel, Heures disponibles = hoursAvailablePerMonth, Reste à signer = Objectif − Σ CA, Heures restantes = disponibles − Σ heures. Year total and écart = annualRevenue − Σ.

**Tax**: `estimateBelgianTax` is deleted. The company is an SRL; the only tax figure is Impôts in the Compte de résultats using `objectives[year].corporateTaxRate` (default 0.25, help text about the 20 % SME rate to confirm with the accountant).

## Export for the accountant

`apps/frontend/src/lib/export-livre.ts` using the `xlsx` dependency already in the frontend: 'Livre des recettes YYYY.xlsx' with one sheet per month ('Janvier' … 'Décembre') in the workbook's exact header row (NUMERO OPERATION, DATE FACTURE/OPERATION, INTITULE, Total tvac, RECETTE htva, TVA 6%, TVA 12%, TVA 21%, réglé, mode paiement, date encaissement, Type, Description, KM), dates as Excel date cells, TOTAL row and per-type totals written as values; a 'recettes YYYY' sheet with the whole year plus the ACOMPTES block (Client, montant, date paiement, date évent) and the THERMOMIX commissions block; a 'Achats YYYY' sheet; a 'Compte de résultats' sheet. Header rows carry `settings.company`. A CSV variant per month with ';' and decimal comma. After export, 'Verrouiller le mois' locks the entries.

## What the Dashboard becomes

`Dashboard.tsx` is deleted. The home is Semaine with four tiles: CA du mois (Σ sales htva month to date, with the monthly objective as a progress bar), Signé ce mois (Σ events of the month, price × guests), À encaisser (count and Σ TVAC of sales entries with paid = false, oldest date), Marge brute du mois % = (CA − MP) / CA. The tax toggle, override input, `estimateBelgianTax`, the all-time KPIs and the events table are removed. `MonthlyChart` moves to `/comptes/apercu` with series CA N, CA N−1, Objectif, axis labels at 12px minimum.

### ai

Not now for anything the model solves: duplicate detection is string normalisation plus Levenshtein, templates replace duplication, and reports are formulas. One optional slice for a later phase, gated on the caterer providing a key: `POST /admin/recipes/parse` accepting `{ text }` or a photo upload, calling the configured provider with the key stored server-side in `settings.ai?.apiKey` (never returned by `GET /admin/settings`, written through a dedicated `PATCH /admin/settings/ai`), returning a draft `CreateRecipeRequest` whose ingredient names are matched against `nameLower` and `aliases`, with unmatched names listed. The UI is a 'Importer depuis un texte ou une photo' button on `/recipes/new` that fills the editor; nothing is saved until the user saves. If no key is configured the button is hidden. This proposal does not pick a provider; the brief mentions an OpenAI key, and the endpoint shape is provider-neutral.

## Roadmap

### Phase 0: foundations (about 1 week)

Move cost maths to `packages/types/src/costing.ts` and re-export from `recipe-helpers.ts`; add `money.ts`, `normalize.ts`, `taxonomies.ts`. Harden `ddb.service.ts` (UnprocessedItems loop, `transactWrite`, `expectedUpdatedAt`), add the 409 exception filter. `.strict()` and `isoDate` on event DTOs, new line fields in `eventRecipeLineSchema`, `EventsService` fills `lineId` and `order` on every write. Settings gains `courses` and `prestationTypes` with defaults on read; `Settings.tsx` edits them. Delete `packages/utils` and `TABLE_NAMES`. `Events.tsx` ascending sort for 'À venir'.

**Migration:** Run `001-line-ids` (dry-run, then real) before deploying the Phase 1 frontend. No new tables. `pnpm build:types` then deploy backend first (reads are backward compatible), then frontend.

**Rationale:** Every later phase depends on line identity, strict DTOs and shared costing. Nothing user-visible changes except the sort, so risk is low.

### Phase 1: planning and ordering, readability tokens (about 2 weeks)

Line endpoints (`POST/PATCH/DELETE /admin/events/:id/lines`, `PUT .../lines/order`). `Semaine.tsx` at `/` with the Favoris menu stubbed, `Jour.tsx`, course blocks with reorder on `EventDetail.tsx`, cook mode query params in `RecipeCook.tsx`, `recipe.defaultCourse`. Delete `WeekPlannerModal`, `generateAggregatedPdf`, and `Dashboard.tsx` (tiles land in Phase 4; until then Semaine shows Signé only). Tailwind scale, tokens, `Tag`, `FieldLabel`, `ListRow`, `PageHeader`, `BottomTabBar`; RecipeDetail reading column with 'Coût & prix' toggle; RecipeCook layout fixes. EventEditor sends a diff plus `expectedUpdatedAt`.

**Migration:** None beyond 001. Old lines without `course` render under 'Autre'.

**Rationale:** Answers requests 2 and the planning half of 3 and the readability complaint with no new tables, so the caterer sees the main change fast.

### Phase 2: ingredient merge (about 1 week)

`GET /admin/ingredients/duplicates`, `POST /admin/ingredients/merge`, 409 guards on `DELETE /admin/ingredients/:id` and `DELETE /admin/recipes/:id`, `aliases` used by both imports, `Doublons.tsx` at `/ingredients/doublons`, removal of `deduplicate`, cache invalidation sets in `api.ts`, pending-list sanitising in `GroceryListPage.tsx`, supplier colour from settings.

**Migration:** None. `mergedFrom` and `aliases` are optional fields on survivors only.

**Rationale:** Request 1, and it must land before any import or grocery feature grows, because every merge after that is cheaper.

### Phase 3: clients and templates (1 to 2 weeks)

Tables `ta-clients` and `ta-event-templates`; `ClientsModule`, `EventTemplatesModule`; `Clients.tsx`, `ClientDetail.tsx`; `from-event` and `instantiate` endpoints; Favoris menu on Semaine; client filter on Semaine; `/events/new?client=` prefill; `EventDetail.tsx` shows client link and 'Enregistrer comme favori'.

**Migration:** Create the two tables (console or updated `data-stack.ts`), add `CLIENTS_TABLE` and `EVENT_TEMPLATES_TABLE` to SSM, `ec2-bootstrap.sh`, `.env`, `pm2 restart`. Config declares them optional so the API boots either way. Optionally run `003-clients-from-contacts` in dry-run and confirm.

**Rationale:** Request 3's 'ne pas dupliquer' half. Separate tables keep templates out of every event reader.

### Phase 4: ledger, journal, close-out, snapshot (about 2 weeks)

Table `ta-ledger`, `LedgerModule` with CRUD, `from-event`, `lock`; `costSnapshot` on completion and `POST /admin/events/:id/snapshot`; event fields `prestationType`, `vatRate`, `km`, `hoursPlanned`, `hoursSpent` in `EventDetail.tsx` and `EventEditor.tsx`; `extraCosts[].kind`; `/comptes/journal` with the add and edit sheets; `export-livre.ts` (journal sheets first, Compte de résultats sheet in Phase 5); Semaine money tiles; 'Créer la facture' and 'Ajouter un acompte' on the event page.

**Migration:** Create `ta-ledger`, add `LEDGER_TABLE` the same way. Run `002-cost-snapshots` (dry-run first). Ask the accountant to validate one exported month before the caterer stops using the workbook.

**Rationale:** Gives the accountant value first (journal and export) and freezes historical margins before any report depends on them.

### Phase 5: income statement, prévisionnel, au réel (about 2 weeks)

Settings `fixedCharges`, `objectives`, `company` with their Paramètres sections; purchases book (kind mp, personnel) in the Journal page; `reports.ts` functions with jest tests; `/comptes/apercu` (chart moved here), `/comptes/resultats`, `/comptes/previsionnel`, `/comptes/au-reel`; Compte de résultats sheet in the export.

**Migration:** None. The caterer types the ~30 fixed charges once (a CSV paste helper on the Paramètres page reads 'label;montant;montant solo' to speed this up) and the 2026 objective.

**Rationale:** Replaces the remaining workbook sheets. All views, so no risk to records.

### Phase 6 (optional): AI recipe import

`POST /admin/recipes/parse`, settings `ai.apiKey` write-only, 'Importer depuis un texte ou une photo' on `/recipes/new`.

**Migration:** None.

**Rationale:** Only if the caterer supplies a key and still imports recipes by hand after Phase 2's alias matching.

## Risks

- **Concurrent edits**: EventEditor's 800 ms autosave still PATCHes top-level fields. The diff plus `expectedUpdatedAt` reduces overwrites, but a laptop editing portions in EventEditor while the phone marks a line done can still get a 409 on the laptop side. Mitigation: EventEditor reloads on 409 and reapplies the unsaved diff. I did not prototype this.
- **Manual table provisioning**: three new tables each need the four-step README process. The optional env vars keep the API booting, but a forgotten SSM parameter makes Clients, Favoris or Comptes return 503 until fixed. Updating `data-stack.ts` and the two scripts in the same PR as each table is the control.
- **Approximate snapshots**: migration 002 freezes past completed events at today's prices. Those months are labelled 'estimé' and the caterer may prefer typing `actualCost` from receipts for 2025.
- **VAT defaults and tax rate are assumptions**: 6 % take-away, 12 % served, 21 % atelier and the 25 % corporate rate are editable defaults. Confirm with the accountant before the first export.
- **Deposit double counting**: if a Falco final invoice is not net of the deposit, the journal would count the deposit twice. `from-event` subtracts existing acomptes from the prefilled HTVA, but the user can overwrite it; the event page shows Σ entries versus signed revenue to make a mismatch visible.
- **Settings item last-write-wins**: fixed charges and objectives share the single put in `SettingsService.update`. Two tabs editing at once can overwrite each other. Acceptable for one user; adding `expectedUpdatedAt` to settings is a one-line follow-up.
- **Hoona interpretation**: the design covers one event per week and one per weekday, but if Hoona is a monthly counter invoice with daily deliveries the ledger side needs the direct `clientId` entry path described, not `from-event`. Both exist; the caterer should confirm which pattern applies.
- **Normalisation false positives**: the subset rule (`oeuf` vs `oeuf bio`) can suggest merging distinct products. Those groups are flagged `weak` and never preselected, and the merge needs an explicit survivor choice.
- **Workbook mismatch on breakeven**: the proposed seuil includes raw material cost and will be higher than the caterer's number. The page shows both for a year to avoid confusion.
- **Scan growth**: `GET /admin/ledger?year=` filters server-side but still scans the whole table. At the stated volumes this stays under a few hundred milliseconds for years; a `yearMonth` GSI is the fallback.
- **Not covered**: I did not inspect `LoginPage.tsx`, `IngredientFormModal.tsx` or `RecipeEditor.tsx` in detail; the FieldLabel replacement there is assumed mechanical.
