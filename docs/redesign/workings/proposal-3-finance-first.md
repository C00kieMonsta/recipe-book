# Proposal 3: Les comptes d'abord: l'événement comme pivot entre la cuisine et le livre des recettes

Angle: The books first. The event is the single pivot: it is the menu and the prep plan for the kitchen, it is a frozen raw-material cost when it is served, and it is a line in the journal des recettes when it is invoiced. Every month and year is steered against an objective stored once. The workbook's 20 sheets become two records (ledger entries, effective-dated settings) and six views.

## Vision

Today the caterer runs the business in three places: the app for costing and grocery lists, Falco for invoices, and a 20-sheet workbook copied by hand every year for the journal, the objectives and the income statement. The workbook is where the real decisions are made, and the app only feeds it indirectly. The redesign makes the app the book of record. An event is created once and then carries three lives: a plan (recipe lines by course, portions, prep day), a cost (a snapshot of raw-material cost frozen the day it is marked "terminé"), and revenue (one or more journal lines created from it, with the invoice number typed from Falco). Lines that are not events (facture comptoir, commissions Thermomix, bons cadeaux, acomptes) are added directly in the journal. Fixed charges and the yearly objective are stored once and dated, so a past month never changes when a charge is edited.

This angle wins for three reasons. First, the month-end job is the one the caterer cannot skip, and it is the one with zero coverage today; shipping the journal and the accountant export early gives value that nothing else in the app provides. Second, the journal forces the two fields that every other feature needs anyway: a prestation type on the event (for the revenue mix) and a frozen cost (so the Dashboard stops rewriting history). Once those exist, the week view can show real signed revenue against the monthly objective, and the recurring-client setup can carry its invoicing mode. Third, the finance views are pure projections over a few hundred rows a year, so they cost no new infrastructure: two new DynamoDB tables (clients, ledger), optional fields on events, and a settings item that grows.

The kitchen side is not dropped. The home page becomes "Cette semaine": seven days, each recipe line with its client and portions, a prep sheet per day, cook mode opened at the line's portions, and a money strip (CA du mois from the journal, Signé from events, Objectif). Readability is handled by a small design system applied first to recipe reading, then reused by every new accounting screen so they ship readable from day one.

What is explicitly not built: issuing quotes or invoices (Falco stays), a CRM pipeline, Odoo, and a general-purpose AI assistant.

## Navigation

## Home

`/` is **Cette semaine**: the current ISO week, seven day blocks, every recipe line with client and portions, and a four-tile money strip. The finance dashboard route is removed; its chart moves to Aperçu par mois.

## Sidebar (laptop) and bottom tab bar (phone), in order

| # | Label (FR) | Route | Notes |
|---|---|---|---|
| 1 | Cette semaine | `/` and `/semaine/:isoWeek` | home, prev/next week |
| 2 | Événements | `/events` | list sorted ascending when filter is À venir |
| 3 | Recettes | `/recipes` | unchanged route, new reading layout |
| 4 | Ingrédients | `/ingredients` | adds `/ingredients/doublons` |
| 5 | Courses | `/grocery-list` | unchanged |
| 6 | Clients | `/clients` | new, thin |
| 7 | Comptes | `/comptes` | section with tabs: Journal, Aperçu, Compte de résultats, Prévisionnel, Au réel, Charges fixes, Extras |
| 8 | Paramètres | `/settings` | adds Services (courses) and corporate tax help |

Phone bottom tab bar shows the four daily items: Semaine, Événements, Recettes, Courses. Clients, Comptes and Paramètres sit behind a "Plus" tab. The dark sidebar becomes a light tinted panel (see readability).

## Removed or merged

- "Tableau de bord" is removed. KPIs on completed events, the year chart, the sole-trader tax toggle, `estimateBelgianTax` and the override input are deleted. The chart is rebuilt in Aperçu par mois over journal HTVA.
- "Planning semaine" modal in `Events.tsx` is removed; `/` replaces it. The aggregated PDF button stays on the week page for one release, generated from the day-grouped structure.
- "Listes de courses" is renamed "Courses".
- Breadcrumb line above every detail title: `Événements / Mariage Dupont`, `Comptes / Journal / Mars 2026`, `Clients / Hoona / Semaine type`.

## Screens

### Cette semaine (home) (/ and /semaine/:isoWeek (e.g. /semaine/2026-W42))

Answer "what do I cook this week, for whom, and where am I against the month" without a PDF. Replaces Dashboard and the WeekPlannerModal.

**Layout**

**Laptop (>= 1024px):** page title `Semaine 42 · 13 au 19 octobre` with prev/next arrows and an `Aujourd'hui` button. Below it a money strip of four tiles: `CA du mois` (Σ journal HTVA month to date, with a progress bar against `Objectif mensuel`), `Signé ce mois` (Σ events dated in month of price × guests), `À encaisser` (count and Σ TVAC of unpaid sales entries, oldest date), `Marge brute du mois %`. Then seven day columns Monday to Sunday, each with a heading `Mardi 14` at text-lg, the day's guest total and HTVA, and one row per recipe line: recipe name (text-base, medium), client or event name and portions on a second muted line, course tag. Days with nothing show `Rien de prévu` in muted text. Below the grid: a week footer `Total semaine: 312 convives · 9 840 € HTVA`. The `PDF de la semaine` button sits at the end of the header, secondary style.

**Phone:** the money strip collapses to two tiles (`CA du mois` with bar, `À encaisser`). Days stack vertically; today is expanded, other days show the heading and a one-line summary (`3 événements · 85 convives`) and expand on tap. Rows are 48px tall and full-width tappable.

**Interactions**

- Prev/next week arrows and swipe on phone change `:isoWeek`.
- Tap a day heading opens `/jour/:date` (prep sheet).
- Tap a recipe line opens cook mode at that line's portions: `/recipes/:id/cook?event=:eventId&line=:lineId`.
- Tap the client or event name opens `/events/:id`.
- A `fait` checkbox at the end of each line toggles `prepStatus` through `PATCH /admin/events/:id/lines/:lineId`.
- `+ Événement` button in the header, and when a client has a weekly template and no events in this week, a prompt row `Hoona: générer la semaine` calls `POST /admin/clients/:id/generate-week`.
- The `CA du mois` tile links to `/comptes/journal/:ym`; `À encaisser` links to the journal filtered on `Réglé = non`.
- `PDF de la semaine` prints the same day-grouped list (one page per day, 11pt) and is removed once the caterer stops using it.

### Fiche du jour (prep sheet) (/jour/:date (YYYY-MM-DD))

The per-day prep sheet. Every recipe line to cook that day, grouped by course then recipe, with the per-client breakdown. Replaces generateAggregatedPdf and exportRecipesPdf.

**Layout**

**Both:** breadcrumb `Semaine 42 / Mardi 14 octobre`, title at Playfair 32px, a line `3 événements · 85 convives · 2 640 € HTVA`. A segmented control `Par événement | Par recette`. In `Par événement` mode: one block per event (name, client, guests, service time if set), lines sorted by `settings.courses` index then `order`, each line: course tag, recipe name at text-lg, `30 portions` bold, notes in muted text, a 44px `fait` toggle. In `Par recette` mode: one block per recipe, heading `Mini quiches · 80 portions`, under it the breakdown `Hoona 30 · Mariage Dupont 50`, then the scaled ingredient list for the summed portions (two columns: name, quantity bold) and the steps at text-base. **Laptop:** 720px reading column. **Phone:** same column, blocks separated by 40px, sticky day header.

**Interactions**

- Tap a recipe heading opens cook mode at the line's portions (per event mode) or at the summed portions (per recipe mode) with `?portions=80`.
- `fait` toggles per line, optimistic, `PATCH /admin/events/:id/lines/:lineId { prepStatus }`.
- Lines whose `prepDate` is this day but whose event is another day show a tag `pour samedi`.
- `Imprimer` prints this page via CSS, no jsPDF.

### Cuisiner (cook mode) (/recipes/:id/cook?portions=30&event=:eventId&line=:lineId)

Follow one recipe in the kitchen at the portions of an event line, large type, with context.

**Layout**

**Tablet and laptop:** two columns. Left (320px): ingredient list scaled to `portions`, name text-lg, quantity bold text-lg. Right: all steps as a scrollable list at text-2xl serif, left aligned, the active step with a tinted background and the others at full contrast; `Étape 4 / 9` text above the list. Header: recipe name serif text-xl, portion stepper with 44px buttons, `Quitter`. **Phone:** steps fill the screen as a scrollable list; a bottom drawer `Ingrédients` (collapsed to a 56px bar) pulls up over the steps. No `select-none`.

**Interactions**

- Portion stepper initialises from `?portions` or the line's portions, else recipe.portions.
- Tap a step to make it active; prev/next buttons 56px; keyboard arrows kept.
- On the last step, `Marquer fait` sets the line's `prepStatus = done` when `event` and `line` are present, then returns to the day sheet.
- Wake lock requested while the screen is open (navigator.wakeLock when available).

### Événement (/events/:id)

The pivot record: plan, cost and billing of one event, with explicit edit mode and the close flow.

**Layout**

**Laptop:** breadcrumb, title serif 32px, meta line `Samedi 18 octobre · 50 convives · Buffet avec service · Hoona` with status tags (`À venir | Terminé`, plus derived `Acompte reçu`, `Facturé`, `Payé`). Four stat tiles: `Coût matières` (snapshot when completed, live otherwise, labelled `figé le 18/10` or `estimé`), `Revenu HTVA`, `Marge brute`, `Marge %`. Then sections separated by whitespace, no cards: `Menu` (lines grouped by course with drag handles in edit mode, portions bold, notes), `Coûts supplémentaires` (label, kind tag, amount), `Facturation` (list of linked journal lines: date, N°, kind, TVAC, HTVA, Réglé), `Notes`. **Phone:** stats as a 2×2 grid, sections stacked, course groups collapsible.

**Interactions**

- Header buttons: `Modifier` (enters edit mode: fields become inputs with visible borders, drag handles appear), `Cuisiner` dropdown listing the lines, `⋯` menu with `Dupliquer`, `Enregistrer comme semaine type` (if a client is set), `Supprimer`.
- Status: a `Marquer terminé` button. On click the app calls `POST /admin/events/:id/complete`, the server writes `costSnapshot` and flips status; the UI then asks `Créer la ligne de journal maintenant ?` and opens the Clôturer form if yes. `Terminé` can be reverted with confirmation; the snapshot is kept unless the user ticks `Recalculer le coût`.
- `Facturation` section buttons: `Enregistrer un acompte`, `Créer la facture` (Clôturer form), `Marquer réglé` on each line.
- In the menu: move lines between courses (drag on laptop, up/down arrows and a course select on phone), persisted with `PUT /admin/events/:id/lines/order`.
- `actualCost` is editable inline in the stats tile as `Coût réel` and overrides the snapshot in reports.
- `prestationType` and `vatRate` are required before `Créer la facture`; a missing type shows a red tag `Type de prestation manquant`.

### Clôturer (create journal line from event) (/events/:id/cloturer (also reachable as a dialog from the Journal with ?event=))

Turn an event into one journal line with the Falco figures, in under a minute.

**Layout**

**Both:** single 560px form. Prefilled read-only summary at the top: event name, date, prestation type, `Revenu HTVA prévu 2 500,00 €`, `Acomptes déjà reçus 750,00 € HTVA`. Fields in order: `N° facture Falco`, `Date facture`, `Intitulé`, `Total TVAC`, `Taux TVA` (6 / 12 / 21 segmented), computed `Recette HTVA` and `TVA` shown live and editable, `Réglé` toggle with `Mode` and `Encaissé le` when on, `KM`, `Description`. Phone uses full-width inputs at text-base; laptop shows the summary on the left and the form on the right.

**Interactions**

- Prefill from `GET /admin/ledger/prefill/event/:id`: label = event name, date = event date, prestationType, vatRate, htva = round2(price × guests − Σ deposit htva), tvac = round2(htva × (1 + rate/100)), km = event.km, clientId.
- Typing TVAC recomputes HTVA and TVA with `splitTvac`; typing HTVA recomputes the other way; the invariant `htva + Σ vat = totalTvac ± 0,01` is validated server-side.
- `Enregistrer` creates the entry and returns to the event with a `Facturé` tag; the journal cache is invalidated.
- A second button `Facturer avec d'autres événements du client` lists that client's uninvoiced completed events and creates one entry with several `eventIds` (monthly invoice pattern).

### Journal des recettes (/comptes/journal/:ym (e.g. /comptes/journal/2026-03), /comptes/journal/:year for the annual view)

The month sheet of the workbook. Lines are records; totals and per-type sums are views. Export for the accountant.

**Layout**

**Laptop:** breadcrumb `Comptes / Journal`, month picker with prev/next, filter chips `Tous | Non réglés | Acomptes | Hors événement`. Table with the workbook's columns in order: `N°`, `Date`, `Intitulé`, `Type`, `Total TVAC`, `Recette HTVA`, `TVA 6 %`, `TVA 12 %`, `TVA 21 %`, `Réglé`, `Mode`, `Encaissé le`, `KM`, `Description`. Rows at text-sm, tabular numerals, 44px tall. Footer rows: `TOTAL` (Σ TVAC, Σ HTVA, Σ per rate), `Total CA 03/2026` = Σ HTVA, then one row per prestation type `Σ HTVA`. Right rail (280px): `Acomptes du mois`, `Commissions Thermomix`, `À encaisser`. **Phone:** card per line: intitulé bold, date and N° muted, TVAC and HTVA on the right, a `Réglé` tag; footer totals as a list. The annual view lists the 12 month totals plus the ACOMPTES and COMMISSIONS sections.

**Interactions**

- `+ Ligne` opens the entry form (same as Clôturer, without event prefill) with kind `comptoir | commission | bon_cadeau | acompte | autre`; commissions default to rate 0.
- Tap a line opens it for editing; entries in a locked month are read-only with a `Verrouillé` tag.
- `Marquer réglé` inline on the `Réglé` cell opens a two-field popover (mode, date).
- `Exporter` menu: `Livre des recettes 2026.xlsx` (one sheet per month, headers in the workbook's wording, TOTAL row and per-type totals as values, plus sheets `recettes 2026`, `Achats`, `Compte de résultats`), `CSV du mois` (`;` separator, decimal comma).
- `Verrouiller mars` sets `locked` on every entry of the month after export; unlocking requires confirmation and is logged in the entry's `updatedAt`.

### Aperçu par mois (/comptes/apercu/:year)

This year versus last year versus objective, the revenue mix by prestation type, and the objective per prestation with events needed.

**Layout**

**Laptop:** year picker. Objective box at the top: `Seuil de rentabilité annuel / mensuel`, `Objectif annuel / mensuel (sur 10 mois)`. Then the monthly table: `Mois`, `CA HTVA 2025`, `CA HTVA 2026`, `% augmentation`, `Objectif`, `Prévision (signé)`, `Atteint ?`, with a totals row and `Total 2024` reference. Under it the rebuilt bar chart: three series per month (N−1, N, Objectif) with 12px axis labels and theme colours. Then `Mix par prestation`: `Type`, `CA N−1`, `%`, `CA N`, `%`, `Objectif`, `%`, `Nb nécessaires`. Then `Comparaison par période` (1 jan to 30 avr, 30 avr to 30 juin, N−2, N−1, N). **Phone:** the monthly table becomes 12 rows of `Mois · CA N / Objectif` with a progress bar; the mix becomes a list with horizontal bars.

**Interactions**

- Tap a month row opens that month's journal.
- Tap a prestation type filters the journal by type.
- `Modifier l'objectif` links to Prévisionnel.
- Hover on chart bars shows a tooltip with the three figures.

### Compte de résultats (/comptes/resultats/:year)

The monthly and yearly income statement in the workbook's vocabulary, with the SRL tax model.

**Layout**

**Laptop:** 12 month rows plus `Total année`: `Mois`, `CA HTVA`, `Coûts MP`, `Marge brute`, `Charges fixes`, `Personnel extra`, `Autres coûts`, `Résultat avant impôts`, `Marge %`, `Impôts`, `Résultat net`. Each `Coûts MP` cell carries a small source tag `réel` or `calculé`. Below: ratio rows `MP / CA`, `Marge brute / CA`, `Charges fixes / CA`, and the `SIMULATION` row from the objective. Settings inline: `Taux ISoc 25 %` with the help text. **Phone:** one card per month showing CA, Marge brute, Résultat net and a `Détail` disclosure for the other columns.

**Interactions**

- Toggle `MP: réel si disponible | toujours calculé` to compare the two sources; the choice is a view preference, not stored.
- Tap `Coûts MP` to open the purchases list for that month (`/comptes/achats/:ym`).
- Tap `Charges fixes` to open Charges fixes filtered on that month.
- `Exporter` adds this table as a sheet to the yearly xlsx.

### Prévisionnel (/comptes/previsionnel/:year)

Fixed charge budget with the "avec salarié / seule" scenario, breakeven, treasury target and investment envelope; the yearly objective is edited here.

**Layout**

**Laptop:** two columns. Left: `Objectif` form (annual revenue, months active, hours available per month, raw material %, corporate tax rate, extras budget, treasury months, per-prestation targets with events needed and guests per event, investments). Right: charge table `Intitulé`, `Catégorie`, `Mensuel`, `Mensuel seule`, `Annuel`, totals, scenario toggle `Avec salarié | Seule`. Below both: derived box `Seuil de rentabilité (CA)`, `Seuil mensuel`, `Besoin de trésorerie`, `Bénéfice avant impôts prévu`, `ISoc prévu`, `Marge nette prévue %`, and the workbook's old `hors MP` figure shown greyed for one year. **Phone:** stacked, charge table as a list with amount on the right.

**Interactions**

- Editing a charge amount closes the current period (`to = previous month`) and creates a new row from the chosen month; a `Modifier depuis` date picker defaults to the current month.
- `+ Charge` with category select.
- `Copier l'objectif de 2025` prefills a new year.
- All figures update live from the form.

### Au réel (/comptes/au-reel/:ym)

Signed revenue versus the monthly target with hours, one block per month, reading events and journal lines.

**Layout**

**Both:** month picker. Table `Client / événement`, `Type`, `CA HTVA`, `Heures`, `Observations` for every event dated in the month, plus non-event journal lines of the month (comptoir, bons cadeaux). Footer: `Total signé`, `Total heures`, `Je vise`, `Temps disponible`, `Il me reste à signer`, `Heures restantes`. Year summary at the bottom with the gap to the annual objective. Phone shows the same as a list with the footer pinned.

**Interactions**

- Hours cell editable inline (writes `event.hoursSpent`).
- Tap a row opens the event or the journal line.
- Rows with no prestation type show a warning tag.

### Charges fixes et Extras (/comptes/charges and /comptes/extras)

Charges: the dated list of recurring charges. Extras: extra staff shifts (hours × rate) per person and month, replacing sheets personnel and factures.

**Layout**

**Charges:** list grouped by category, each row `Intitulé`, `Mensuel`, `Mensuel seule`, `Depuis`, `Jusqu'à`; past periods collapsed under `Historique`. **Extras:** month picker, list of purchase entries kind `personnel`: `Date`, `Personne`, `Heures`, `Taux`, `Montant`, `Événement`; a `Facture Kristoff` summary per person: dates, Σ heures, taux, montant. Phone: same lists, amounts right-aligned.

**Interactions**

- Charges: add, edit from a month, archive (sets `to`).
- Extras: `+ Heures` form (person, date, hours, rate, optional event); `Résumé facture` per person copies the lines to the clipboard or exports a one-sheet xlsx.

### Clients et semaine type (/clients, /clients/:id)

A thin client record for recurring business, with a weekly template so Hoona is set up once.

**Layout**

**List:** rows `Nom`, `Type (entreprise / particulier)`, `Facturation (par événement / mensuelle)`, `Prochain événement`, `CA année`. **Detail (laptop):** header with contact fields, defaults (prestation type, TVA, prix par convive). Section `Semaine type`: a Monday to Sunday grid, each day either empty or a template card (guests, price, recipe lines by course). Section `Prochaines semaines`: the next four weeks, each showing which days already have an event. Section `Facturation`: journal lines for this client, `Facturer le mois` button. **Phone:** sections stacked, week grid as a vertical list.

**Interactions**

- `Modifier la semaine type` edits templates inline; `Créer depuis un événement` copies an existing event's lines into a weekday.
- `Générer la semaine du 20 octobre` creates one event per template day that has no event yet (`POST /admin/clients/:id/generate-week { weekStart }`), names them `Hoona · lundi 20/10`, and links `clientId` and `templateId`.
- `Facturer le mois` opens Clôturer with all uninvoiced completed events of the client preselected.

### Doublons d'ingrédients (merge) (/ingredients/doublons)

Find duplicate ingredients, pick the survivor, remap every recipe and grocery list, then delete the others.

**Layout**

**Both:** list of candidate groups from `GET /admin/ingredients/duplicates`. Each group is a card: the proposed survivor highlighted, each member row with name, unit, price, supplier, `utilisé dans N recettes`. A radio selects the survivor. Groups with mixed unit families show a warning. Laptop: two columns of cards; phone: one column, rows 48px.

**Interactions**

- `Fusionner` on a group calls `POST /admin/ingredients/merge` and shows the result `12 recettes et 2 listes mises à jour, 2 ingrédients supprimés`.
- `Ignorer` hides a group for this session.
- `Chercher` lets the user type a name to build a manual group.

### Recette (reading) (/recipes/:id (reading), /recipes/:id/edit (editing), /recipes/:id?onglet=cout (costing))

Read a recipe comfortably; cost it on a separate tab; edit in an explicit mode.

**Layout**

**Both:** 720px column. Photo full width (aspect 3/2) when present, else a tinted block with the category icon. Title serif 32 to 40px, meta line `Buffet · 10 portions · 150 g/pers`. Portions stepper. `Ingrédients` as a two-column list at text-base (name left, quantity bold right), 44px rows, no cost. `Préparation` as numbered steps at text-lg, leading-relaxed, 32px number badge, 24px gaps, full-contrast text. Tabs above the content: `Recette | Coût et prix`. The cost tab keeps the six-column table and the pricing simulation, desktop oriented with a card fallback on phone.

**Interactions**

- `Cuisiner` primary button opens cook mode.
- `Modifier` enters edit mode (RecipeEditor layout with visible inputs); no click-to-edit on the reading surface.
- Portions stepper scales quantities with `scaleQty`.
- Delete lives only in edit mode.

## Data model changes

All event additions are optional, so existing DynamoDB rows read unchanged. Two new tables (`ta-clients-{stage}`, `ta-ledger-{stage}`) start empty. Settings grows inside the existing single item.

## Shared constants (new file `packages/types/src/entities/accounting.ts`)

```ts
export const PRESTATION_TYPES = ["menu_a_emporter","buffet_a_emporter","buffet_avec_service","atelier","brunch","walking_cocktail","chef_a_domicile"] as const;
export type PrestationType = typeof PRESTATION_TYPES[number];
export const PRESTATION_LABELS: Record<PrestationType, string> = {
  menu_a_emporter: "Menu à emporter", buffet_a_emporter: "Buffet à emporter", buffet_avec_service: "Buffet avec service",
  atelier: "Atelier", brunch: "Brunch", walking_cocktail: "Walking / cocktail", chef_a_domicile: "Chef à domicile",
};
export const VAT_RATES = [0, 6, 12, 21] as const;
export type VatRate = typeof VAT_RATES[number];
export const DEFAULT_COURSES = ["Apéritif", "Entrée", "Plat", "Dessert", "Autre"];
```

## Event (`packages/types/src/entities/event.ts`)

```ts
export interface EventRecipeLine {
  lineId?: string;          // optional on read; server fills randomUUID() on create/update when absent
  recipeId: string;         // required (unchanged)
  portions: number;         // required (unchanged)
  course?: string;          // optional; fallback recipe.defaultCourse, then "Autre"
  order?: number;           // optional; sort key inside the course, fallback array index
  notes?: string;           // optional
  prepStatus?: "todo" | "doing" | "done"; // optional, default todo
  prepDate?: string;        // optional YYYY-MM-DD; line appears on this day instead of event.date
}

export interface EventExtraCost {
  label: string; amount: number;                       // unchanged
  kind?: "matiere" | "personnel" | "location" | "transport" | "autre"; // optional, read as "autre"
}

export interface EventCostSnapshot {
  rawMaterial: number;      // Σ (recipeCost / recipe.portions) × line.portions at takenAt
  extras: number;           // Σ extraCosts.amount at takenAt
  lines: { lineId: string; recipeId: string; portions: number; unitCost: number }[];
  takenAt: string;          // ISO timestamp
}

export interface AppEvent {
  // existing fields unchanged, plus:
  clientId?: string;        // optional
  templateId?: string;      // optional, the client template that generated it
  prestationType?: PrestationType; // optional on read, required by the Clôturer form
  vatRate?: 6 | 12 | 21;    // optional, defaulted from prestationType in the editor
  hoursPlanned?: number;    // optional
  hoursSpent?: number;      // optional
  km?: number;              // optional
  serviceTime?: string;     // optional "HH:MM"
  costSnapshot?: EventCostSnapshot; // optional, written server-side on completion
}
```

`status` stays `"upcoming" | "completed"`. "Facturé" and "Payé" are derived from ledger entries whose `eventIds` include the event.

## Recipe (`packages/types/src/entities/recipe.ts`)

```ts
defaultCourse?: string;     // optional, value from settings.courses
```

## Settings (`packages/types/src/entities/settings.ts`)

```ts
export interface FixedCharge {
  chargeId: string; label: string;
  category: "social" | "salaire" | "assurance" | "abonnement" | "frais" | "remboursement" | "autre";
  monthlyAmount: number;          // "avec salarié" scenario
  monthlyAmountSolo?: number;     // optional; undefined means same as monthlyAmount, 0 means absent in solo scenario
  from: string;                   // "YYYY-MM" inclusive
  to?: string;                    // "YYYY-MM" inclusive, undefined = still active
  note?: string;
}

export interface Objective {
  annualRevenue: number; monthsActive: number;             // default 10
  monthlyOverrides?: Record<string, number>;               // "YYYY-MM" -> amount
  byPrestation: { type: PrestationType; amount: number; eventsNeeded?: number; guestsPerEvent?: number }[];
  hoursAvailablePerMonth?: number;
  rawMaterialPct: number;         // 0.38 default, used by breakeven and simulation
  corporateTaxRate: number;       // 0.25 default
  extrasBudget?: number;          // annual
  treasuryMonths: number;         // default 3
  treasurySavingPerMonth?: number;
  investments: { label: string; amount: number }[];
}

export interface AppSettings {
  settingsId: "global"; recipeCategories: string[]; suppliers: SettingsSupplier[]; updatedAt: string; // unchanged
  courses?: string[];                       // optional, default DEFAULT_COURSES
  fixedCharges?: FixedCharge[];             // optional, default []
  objectives?: Record<string, Objective>;   // optional, keyed by year "2026"
}
```

`SettingsService.update` widens its `Pick` to these keys; `updateSettingsRequestSchema` gets the three optional arrays/records with `.strict()` on nested objects.

## Ledger (new file `packages/types/src/entities/ledger.ts`, table `ta-ledger-{stage}`, PK `entryId`)

```ts
export type SalesKind = "facture" | "acompte" | "comptoir" | "commission" | "bon_cadeau" | "autre";
export type PurchaseKind = "mp" | "personnel" | "autre";

export interface LedgerEntry {
  entryId: string;
  book: "ventes" | "achats";
  kind: SalesKind | PurchaseKind;
  date: string;                 // YYYY-MM-DD, invoice or operation date
  ym: string;                   // "YYYY-MM", written server-side from date
  number?: string;              // Falco invoice number (sales) or supplier invoice ref (purchases)
  label: string;                // INTITULE
  eventIds?: string[];          // zero, one or many events (monthly invoice)
  clientId?: string;
  prestationType?: PrestationType;
  totalTvac: number;            // two decimals
  htva: number;                 // two decimals, stored as typed, never recomputed on read
  vat: { rate: VatRate; amount: number }[];  // one element per rate present on the line
  paid: boolean;
  paymentMethod?: "virement" | "cash" | "bancontact" | "payconiq" | "autre";
  paidAt?: string;              // YYYY-MM-DD, "date encaissement"
  description?: string;
  km?: number;
  personName?: string; hours?: number; hourlyRate?: number;   // kind personnel only
  supplier?: string;                                           // kind mp only
  locked?: boolean;             // set by "Verrouiller le mois" after export
  createdAt: string; updatedAt: string;
}
```

Zod (`packages/types/src/dto/ledger.ts`): `money = z.number().refine(v => Math.abs(v*100 - Math.round(v*100)) < 1e-6)`, `isoDate` regex, `.strict()`, and `.refine(e => Math.abs(e.htva + Σ vat.amount − e.totalTvac) < 0.011)`. Deposits are sales entries with `kind: "acompte"`, `paid: true`; the event's invoice line is the balance.

## Client (new file `packages/types/src/entities/client.ts`, table `ta-clients-{stage}`, PK `clientId`)

```ts
export interface EventTemplate {
  templateId: string; name: string;
  weekday?: 1 | 2 | 3 | 4 | 5 | 6 | 7;   // ISO weekday for the weekly setup; undefined = ad hoc favourite
  guestCount: number; sellingPricePerGuest: number;
  prestationType?: PrestationType; vatRate?: 6 | 12 | 21;
  recipes: EventRecipeLine[]; extraCosts: EventExtraCost[]; notes?: string;
}

export interface Client {
  clientId: string; name: string; nameLower: string;
  kind?: "entreprise" | "particulier";
  contactName?: string; phone?: string; email?: string; address?: string; vatNumber?: string;
  defaultPrestationType?: PrestationType; defaultVatRate?: 6 | 12 | 21; defaultPricePerGuest?: number;
  invoicing?: "par_evenement" | "mensuelle";
  templates?: EventTemplate[];   // the "semaine type" lives here, no third table
  notes?: string; active: boolean;
  createdAt: string; updatedAt: string;
}
```

## Ingredient

```ts
mergedFrom?: string[];   // optional audit trail of merged ingredientIds
```

## Shared costing module (new `packages/types/src/costing.ts`)

`calcIngredientLineCost`, `calcRecipeCost(recipe, ingredientById: Map)`, `calcEventCost(event, recipeCostById, recipePortionsById)` returning `{ calculated, rawMaterial: costSnapshot?.rawMaterial ?? actualCost ?? calculated, extras, total }`, `splitTvac(tvac, rate)`, `sumMoney(xs)` summing in cents, `groupByMonth(items, getDate)` using `date.slice(0,7)`. `apps/frontend/src/lib/recipe-helpers.ts` re-exports from it; `packages/utils` is deleted.

## Migration notes

- Optional fields: no migration. Readers default (`course ?? recipe.defaultCourse ?? "Autre"`, `order ?? index`, `kind ?? "autre"`).
- `lineId`: filled lazily in `EventsService.create/update`; one idempotent script `apps/backend/scripts/backfill-line-ids.ts` (`--dry-run`) for rows not touched since.
- `costSnapshot` for already completed events: script `snapshot-completed-events.ts` computes at today's prices and sets `takenAt` plus `approximate: true` inside the snapshot; reports show a tag `approx.`.
- New tables: `LEDGER_TABLE` and `CLIENTS_TABLE` declared `.optional()` in `config.service.ts` for the rollout release; `DdbService.tables` throws at first use when missing. Update `infrastructure/lib/data-stack.ts`, add the SSM parameters and `scripts/ec2-bootstrap.sh` lines per the README procedure.
- `DdbService`: loop on `UnprocessedItems` with backoff in `batchWrite`/`batchDelete`; add `transactWrite(ops)` for the merge; map `ConditionalCheckFailedException` to 409 via a Nest exception filter; add `expectedUpdatedAt` guard in `update()`.
- DTOs: `.strict()` on every new schema; `date` regex on events; `tva` on recipe pricing restricted to 6 | 12 | 21.
- API cache (`apps/frontend/src/lib/api.ts`): `ingredients.merge` invalidates `["ingredients","recipes"]`; `events.complete` and `ledger.*` invalidate `["events","ledger"]`; `clients.generateWeek` invalidates `["events","clients"]`; `SETTINGS_TTL` to 30 s.

## Feature solutions

### planning

## Week and day views are projections of events

No new entity. A line appears on day `line.prepDate ?? event.date`. The week page (`apps/frontend/src/pages/admin/Week.tsx`, route `/` and `/semaine/:isoWeek`) loads `api.events.list()`, `api.recipes.list()`, `api.clients.list()` and the current month's ledger, then groups lines by day with `groupByDay` in `packages/types/src/costing.ts`. Day revenue = Σ `sellingPricePerGuest × guestCount` of events dated that day; week revenue is the sum. The money strip reads the journal for `CA du mois` and `À encaisser`, events for `Signé`, settings objectives for `Objectif mensuel = monthlyOverrides[ym] ?? annualRevenue / monthsActive`.

The day page (`Day.tsx`, `/jour/:date`) builds two structures from the same data: per event (sorted by `settings.courses` index then `order ?? index`) and per recipe (`Map<recipeId, { totalPortions, parts: { eventName, portions }[] }>`), which is the aggregated PDF's maths with the attribution kept.

Writes from these views never touch the whole `recipes` array: `PATCH /admin/events/:id/lines/:lineId { prepStatus | notes | prepDate }` (new in `events.controller.ts`, service loads the event, patches one line by `lineId`, writes the array back with `expectedUpdatedAt`). `EventEditor.tsx` autosave sends only changed top-level fields and skips `recipes` when the editor did not touch them, so a `fait` toggled on the phone survives a laptop autosave.

Cook mode (`RecipeCook.tsx`) accepts `?portions=&event=&line=`; `Marquer fait` on the last step patches the line. `WeekPlannerModal` and `generateAggregatedPdf` in `Events.tsx` are deleted; the week page keeps a `PDF de la semaine` button for one release, printing the day-grouped list at 11pt. The Events list sorts ascending when the filter is `À venir` (`Events.tsx:45`).

### readability

## Design system (applied to recipe reading first, then reused by every accounting screen)

**Type scale** (`tailwind.config.ts` `fontSize`, `index.css` base): `html { font-size: 16px }`, `body { @apply text-base leading-relaxed }`. Scale: `xs 13px` (table numerics only), `sm 14px` (metadata), `base 16px` (everything read), `lg 18px` (recipe steps, ingredient lines, day headings), `xl 20px` (section headings, DM Sans semibold), `2xl 24px` and `3xl 32px` and `4xl 40px` (Playfair, page and recipe titles, cook mode). Remove every `text-[10px]` and `text-[11px]`. Drop the global `h1..h6 { font-serif }` rule; apply `font-serif` explicitly at 24px and above.

**Tokens** (`index.css`): `--muted-foreground: 20 10% 38%` (≈5.9:1 on background), `--primary: 25 55% 45%` (white text ≈4.6:1), new `--success`, `--info`, `--warning` with `-foreground` in warm hues validated at 4.5:1 on card, `--sidebar-background: 30 20% 93%` with foreground text, placeholders at `/70`. Chart series read the same tokens; `COLOR_MARGIN = "#16a34a"` and `#0f766e` go away.

**Spacing**: 8/16/24/40/64. Reading column `max-w-[720px]` on RecipeDetail, RecipeCook, EventDetail, Day. List rows `min-h-11 py-3`. Blocks separated by 40px whitespace and a heading, not by card borders; `card-elevated` kept for stat tiles only. `.input-field` becomes `text-base py-2.5 bg-card`; table compact variant `text-sm`, never `text-xs`.

**Components** (`apps/frontend/src/components/ui/`): `PageHeader` (breadcrumb, Playfair title, actions), `Tag` (variants `neutral | success | info | warning | danger`, text-sm, sentence case), `StatusTag` (non-interactive in lists), `FieldLabel` (text-sm font-medium, sentence case, shared by EventEditor, RecipeEditor, IngredientFormModal, LoginPage), `ListRow` (primary line text-base, secondary muted text-sm, trailing slot, 44px), `MoneyTile` (label, value tabular, optional progress bar), `Money` (Intl.NumberFormat fr-BE). Supplier shown as a `Tag` with dark text on a tint; `color?` stored on `settings.suppliers[]` with a hash fallback into an 8-colour accessible set.

**Recipe reading** (`RecipeDetail.tsx` split into `RecipeRead.tsx` and `RecipeCost.tsx` tab): photo full width, title serif 32 to 40px, meta line, portions stepper, ingredients as a two-column list at text-base with 44px rows, steps at text-lg full contrast with 32px badges and 24px gaps, a `Cuisiner` primary button, `Modifier` entering an explicit edit mode. No click-to-edit on the reading surface, no hover-only delete. Cook mode: two columns on tablet, bottom ingredient drawer on phone, left-aligned steps, 44px controls, `4 / 9` text instead of dots, `select-none` removed.

**Touch**: every control on week, day, cook, grocery pages `min-h-11 min-w-11`; hover-reveal kept on pointer devices with `[@media(hover:none)]:opacity-100` for the rest. `AdminLayout` gets a `fullBleed` outlet context so `GroceryListPage` stops using `-m-6`.

### ingredientMerge

## Finding duplicates

`GET /admin/ingredients/duplicates` (new in `ingredients.controller.ts`) returns candidate groups. Normalisation `normalizeName(name)` in `packages/types/src/costing.ts` (shared so the frontend search can reuse it):
1. NFD decompose and strip combining marks (`Œuf` → `Oeuf`, `é` → `e`); map `œ` → `oe`, `æ` → `ae`.
2. Lowercase, trim, collapse spaces.
3. Remove parenthesised qualifiers: `oeuf (pièce)` → `oeuf`.
4. Remove unit suffixes and quantities: trailing `kg`, `g`, `l`, `ml`, `pièce(s)`, `pc`, `botte`, numbers.
5. Singularise each token: trailing `s` or `x` removed when the token is longer than 3 characters (`oeufs` → `oeuf`, `choux` → `chou`), `aux` → `al` not attempted.
6. Drop stop words `de`, `du`, `des`, `la`, `le`, `les`, `d'`.
Groups are formed on exact normalised key, then merged when the Levenshtein distance between keys is ≤ 2 and the first two letters match. Groups are ranked by number of referencing recipes. The response includes, per member, `recipeCount` and `listCount` (one scan each of recipes and grocery lists).

## Choosing the survivor

Proposed survivor = the member referenced by the most recipes, tie broken by most recent `updatedAt`. The user can override with a radio. If members span two unit families (`€/kg` vs `€/pièce`), the group shows a warning and the merge converts nothing: lines in the other family keep their quantity and unit, and the response lists them as `unitMismatch` for manual review.

## Remapping and deletion

`POST /admin/ingredients/merge { survivorId, mergedIds }` (`.strict()`), in `IngredientsService.merge`:
1. Load survivor and merged rows; 404 if any is missing, 400 if survivor is in `mergedIds`.
2. Scan recipes. For each recipe with a line whose `ingredientId ∈ mergedIds`, rewrite to `survivorId`; if the recipe now has two lines on the survivor with the same unit, sum `qty` and keep the max `lossPct`. `ddb.update(recipes, { recipeId }, { ingredients, updatedAt })`.
3. Scan grocery lists, rewrite `items[].ingredientId` the same way and merge duplicate `(ingredientId, unit)` items by summing `totalQty` and `haveQty`.
4. Scan clients; templates reference `recipeId` only, nothing to do.
5. Only then `batchDelete` the merged ids (with the `UnprocessedItems` retry loop), and `ddb.update(ingredients, { survivorId }, { mergedFrom: [...existing, ...mergedIds] })`.
6. Return `{ recipesUpdated, listsUpdated, removed, unitMismatch }`.

When the total number of writes is ≤ 100 the service uses the new `DdbService.transactWrite`; otherwise it runs in the order above.

## Partial failure

Because remapping happens before deletion, a crash leaves recipes pointing at the survivor and the merged rows still present; re-running the same request is idempotent (steps 2 to 4 find nothing to change, step 5 deletes). The UI shows the error and a `Réessayer` button with the same payload. `DELETE /admin/ingredients/:id` returns 409 with the referencing recipe names when references exist. The old `deduplicate` endpoint and `api.ingredients.deduplicate` are removed. The localStorage `recipe-book:grocery-list-pending` payload is regenerated on next use and needs no remap.

### eventOrdering

## Where the course lives

Both. `recipe.defaultCourse?` is the recipe's usual place (set in RecipeEditor from `settings.courses`), and `line.course?` on the event line overrides it. Display course = `line.course ?? recipe.defaultCourse ?? "Autre"`. This way an amuse-bouche recipe lands in Apéritif without any work, and the same recipe can be a Plat in one event and an Entrée in another. The course list lives in `settings.courses` (default `Apéritif, Entrée, Plat, Dessert, Autre`) and is edited on `/settings`, separate from `recipeCategories` (service formats, untouched).

## Manual reorder storage

`line.order?: number` is the sort key inside a course; renderers sort by `courses.indexOf(course)` then `order ?? arrayIndex`. `lineId` gives each line a stable identity (filled server-side on create/update), so duplicates of the same recipe in two courses are allowed and `EventEditor.addRecipe`'s duplicate guard becomes a confirmation instead.

Reorder is persisted with `PUT /admin/events/:id/lines/order { lines: { lineId, course, order }[] }` (`.strict()`), which rewrites only `course` and `order` on matching lines and leaves other fields untouched. On laptop EventDetail uses HTML5 drag and drop between course groups; on phone each line has up/down arrows and a course select. `prepDate` is edited on the same line form (`Préparer le …`) for the Friday-desserts case.

Files: `packages/types/src/dto/events.ts` (line schema, `updateEventLineSchema`, `reorderEventLinesSchema`), `apps/backend/src/events/events.controller.ts` and `events.service.ts`, `EventDetail.tsx` menu section, `EventEditor.tsx` (course select on add).

### recurringClient

## Hoona concretely

1. **Set up once.** `/clients/new`: name `Hoona`, type entreprise, prestation type `Menu à emporter`, TVA 6 %, invoicing `mensuelle`, price per guest 14 €. On the client page, `Semaine type` is a Monday to Sunday grid. The caterer fills Monday to Friday either by hand or with `Créer depuis un événement` which copies an existing Hoona event's lines into that weekday. Each day template stores guests, price, recipe lines with courses and portions, extra costs. Stored on the client row as `templates[]` with `weekday`.

2. **See the week or a day.** The home week page shows every Hoona line on its day with the client name; the client page section `Prochaines semaines` shows four weeks with a dot per weekday that already has an event. Day view `/jour/:date` lists `Hoona · 30 amuse-bouches` among the other events of that day.

3. **Reuse next week.** On the week page, when a client with weekday templates has no event on a given day of the displayed week, a prompt row `Hoona: générer la semaine du 20 octobre` appears. It calls `POST /admin/clients/:id/generate-week { weekStart: "2026-10-20", days?: number[] }` (`ClientsService.generateWeek`), which creates one event per template weekday that has no event for that client on that date (idempotent), named `Hoona · lundi 20/10`, with `clientId`, `templateId`, `prestationType`, `vatRate`, and `status: upcoming`. The caterer then adjusts guest counts inline on the week page. `Dupliquer` remains for one-off events.

4. **Invoice monthly.** Hoona is billed once a month. On the client page, `Facturer le mois` opens Clôturer with the month's completed, uninvoiced Hoona events preselected; one ledger entry is created with `eventIds` = those events and `htva` = Σ their revenue, which the caterer overwrites with the Falco figure. The Journal shows `Facturé` on each event.

`event.contactName/Phone/Email` stay for old rows; readers show `client?.name ?? contactName`. An optional script `seed-clients.ts --dry-run` groups events by `contactEmail || contactName` to propose clients and backfill `clientId`.

### accounting

## Entities

- `LedgerEntry` (table `ta-ledger-{stage}`): the journal des recettes (book `ventes`) and the purchase side (book `achats`: raw material receipts kind `mp`, extra staff kind `personnel`, other). Records, append-only in spirit: edits allowed until `locked`.
- `AppEvent.costSnapshot`, `prestationType`, `vatRate`, `hoursPlanned/Spent`, `km`: the event's money facts.
- `AppSettings.fixedCharges[]` (effective-dated), `AppSettings.objectives[year]`.
- `Client` for `clientId` on entries and monthly invoicing.

Backend: `apps/backend/src/ledger/{ledger.module,controller,service}.ts` (CRUD shaped like `events.service.ts`, `ym = date.slice(0,7)` written server-side, `locked` refusal with 409, `POST /admin/ledger/lock { ym }`, `GET /admin/ledger?year=`), `GET /admin/ledger/prefill/event/:eventId`, `POST /admin/events/:id/complete` in `events.service.ts` (injects `RecipesService` and `IngredientsService`, computes the snapshot with the shared costing module), `apps/backend/src/clients/*`. Frontend: `apps/frontend/src/pages/admin/comptes/{Journal,Apercu,Resultats,Previsionnel,AuReel,Charges,Extras,Achats}.tsx`, `apps/frontend/src/lib/accounting.ts` (all report maths, pure functions over arrays, unit-tested), `api.ts` gets `ledger` and `clients` groups.

## How an event becomes a journal line

- **Marquer terminé** → `POST /admin/events/:id/complete`. Server: if `costSnapshot` is absent, compute `rawMaterial = Σ (calcRecipeCost(recipe)/recipe.portions) × line.portions` and `extras`, store with `takenAt`; set `status = completed`. The UI then offers `Créer la ligne de journal`. Reverting to `À venir` keeps the snapshot unless `Recalculer` is ticked.
- **Acompte** → `Enregistrer un acompte` on the event creates `LedgerEntry { book: ventes, kind: acompte, eventIds: [id], date: paidAt, paid: true, paidAt, paymentMethod, totalTvac, htva, vat }` with the split at the event's rate. It is journal revenue in the month received (matches the workbook; VAT treatment of deposits to confirm with the accountant).
- **Créer la facture** → prefill: `label = event.name`, `date = event.date`, `prestationType`, `clientId`, `km`, `htva = round2(price × guests − Σ acompte.htva for this event)`, `vat = [{ rate: event.vatRate, amount: round2(htva × rate/100) }]`, `totalTvac = htva + vat`. The caterer types the Falco number and overwrites amounts; the DTO enforces `htva + Σ vat = totalTvac ± 0.01`. Nothing on the event is recomputed afterwards.
- **Paiement reçu** → `PATCH /admin/ledger/:id { paid: true, paymentMethod, paidAt }`. The event shows `Payé` when every sales entry linked to it is paid.
- **Non-event lines** (comptoir, commission, bon cadeau, autre) are created on the Journal page; commissions default to rate 0.
- Event revenue in reports = Σ `htva` of sales entries whose `eventIds` include the event when any exist, else `price × guests` labelled `prévu`.

## Raw material cost per month

Two figures per month, both shown, one used:
- `Coûts MP calculé(m)` = Σ over events dated in m with status completed of `costSnapshot.rawMaterial` (`actualCost` overrides when set) + Σ `extraCosts` of kind `matiere`. Upcoming events in m contribute to a separate `MP prévu`.
- `Coûts MP réel(m)` = Σ purchase entries kind `mp` with `ym = m` (receipts or the accountant's monthly purchases total entered as one line).
- Compte de résultats uses `réel` when the month has at least one `mp` purchase line, else `calculé`, and tags the cell. A view toggle forces `calculé` for comparison. Historical months never move because snapshots and entries are records.

## Reports (French labels, columns, formulas)

**Journal des recettes** (`/comptes/journal/:ym`): `N°` | `Date` | `Intitulé` | `Type` | `Total TVAC` | `Recette HTVA` | `TVA 6 %` | `TVA 12 %` | `TVA 21 %` | `Réglé` | `Mode` | `Encaissé le` | `KM` | `Description`. Footer: `TOTAL` (Σ TVAC, Σ HTVA, Σ per rate), `Total CA mm/aaaa` = Σ HTVA, then `Σ HTVA par type` for the seven prestation types plus `Sans type`. Side blocks: `Acomptes` (client, montant, date paiement, date événement from the linked event), `Commissions Thermomix`, `À encaisser` = entries with `paid = false`.

**Aperçu par mois** (`/comptes/apercu/:year`): `Mois` | `CA HTVA N−1` | `CA HTVA N` | `% augmentation` = (N − N−1) / N−1, blank when N−1 = 0 | `Objectif` = `monthlyOverrides[ym] ?? annualRevenue / monthsActive` | `Prévision (signé)` = Σ events dated in m of price × guests | `Atteint ?` = CA N ≥ Objectif. Totals row and `Total N−2`. Box: `Seuil de rentabilité annuel/mensuel` (formula below), `Objectif annuel/mensuel`. `Mix par prestation`: `Type` | `CA N−1` | `%` | `CA N` = Σ sales `htva` by `prestationType` | `%` | `Objectif` = `byPrestation.amount` | `%` | `Nb nécessaires` = `eventsNeeded ?? Objectif / (CA N / nb lignes du type)`. `Comparaison par période`: Σ `htva` by date range for N−2, N−1, N.

**Compte de résultats** (`/comptes/resultats/:year`), per month m and `Total année`: `CA HTVA` = Σ sales `htva` in m | `Coûts MP` (as above) | `Marge brute` = CA − MP | `Charges fixes` = Σ `fixedCharges` with `from ≤ m ≤ (to ?? ∞)` of `monthlyAmount` (scenario `avec salarié`) | `Personnel extra` = Σ purchase entries kind `personnel` in m (`hours × hourlyRate`, or `htva` when typed) + Σ `extraCosts` kind `personnel` of events in m | `Autres coûts` = Σ purchase entries kind `autre` + Σ `extraCosts` of kind `location | transport | autre` | `Résultat avant impôts` = Marge brute − Charges fixes − Personnel extra − Autres coûts | `Marge %` = Résultat / CA | `Impôts` = max(0, Résultat) × `corporateTaxRate` per month, and for the year max(0, Σ Résultat) × taux | `Résultat net` = Résultat − Impôts. Ratio rows: `MP / CA`, `Marge brute / CA`, `Charges fixes / CA`. `SIMULATION` row: CA = `annualRevenue`, MP = CA × `rawMaterialPct`, Charges = Σ active charges × 12, Personnel = `extrasBudget`, Résultat, Marge %.

**Prévisionnel** (`/comptes/previsionnel/:year`): charge table `Intitulé` | `Catégorie` | `Mensuel` | `Mensuel seule` | `Annuel` with totals per scenario. Derived: `Charges annuelles` = Σ monthly × 12 for the chosen scenario; `Seuil de rentabilité (CA)` = (Charges annuelles + 12 × `treasurySavingPerMonth` + Σ investments) / (1 − `rawMaterialPct`); `Seuil mensuel` = Seuil / `monthsActive`; `Besoin de trésorerie` = Σ charges mensuelles × `treasuryMonths`; `Bénéfice avant impôts prévu` = `annualRevenue` × (1 − `rawMaterialPct`) − Charges annuelles − `extrasBudget`; `ISoc prévu` = max(0, Bénéfice) × `corporateTaxRate`; `Marge nette prévue %` = (Bénéfice − ISoc) / `annualRevenue`. The workbook's `hors MP` breakeven is shown greyed for one year. `corporateTaxRate` default 0.25 with help text `20 % sur la première tranche de 100 000 € si les conditions PME sont remplies, à confirmer avec le comptable`.

**Au réel** (`/comptes/au-reel/:ym`): `Client / événement` | `Type` | `CA HTVA` (journal when linked, else price × guests) | `Heures` = `hoursSpent ?? hoursPlanned` | `Observations` = notes. Footer: `Total signé`, `Total heures`, `Je vise` = Objectif mensuel, `Temps disponible` = `hoursAvailablePerMonth`, `Il me reste à signer` = Objectif − Total, `Heures restantes` = disponible − heures. Year: Σ and `Écart` = `annualRevenue` − Σ.

**Extras** (`/comptes/extras`): purchase entries kind `personnel`: `Date` | `Personne` | `Heures` | `Taux` | `Montant` = heures × taux | `Événement`; per person `Facture`: dates, Σ heures, taux, montant.

## Fixed charges and objectives storage

In the settings item, effective-dated. Changing an amount closes the old row (`to`) and inserts a new one from the chosen month, so past months are stable. `objectives["2026"]` is the single source for Aperçu, Au réel, Prévisionnel and the simulation row; the scenario toggle only switches the charge column summed. `SETTINGS_TTL` drops to 30 s.

## Export for the accountant

Client-side with the `xlsx` package already used in `Recipes.tsx`: `Livre des recettes 2026.xlsx` with one sheet per month (`Janvier` … `Décembre`), headers in the workbook's wording and order (`NUMERO OPERATION`, `DATE FACTURE/OPERATION`, `INTITULE`, `Total tvac`, `RECETTE htva`, `TVA 6%`, `TVA 12%`, `TVA 21%`, `réglé`, `mode paiement`, `date encaissement`, `Type`, `Description`, `KM`), dates as Excel date cells, a `TOTAL` row and the per-type totals written as values; sheet `recettes 2026` with the full year plus `COMMISSIONS` and `ACOMPTES` sections; sheet `Achats`; sheet `Compte de résultats`. CSV variant per month with `;` and decimal comma. Export never writes back. `Verrouiller le mois` after export.

## What the Dashboard becomes

`Dashboard.tsx` is deleted with `estimateBelgianTax`, the toggle, the override input, the all-time KPIs and the year chart. The home page is the week with a four-tile money strip (`CA du mois` with objective bar, `Signé ce mois`, `À encaisser`, `Marge brute du mois %`). The chart is rebuilt in Aperçu over journal HTVA with N−1 and objective series. The tax question is answered by `Compte de résultats` with the SRL model: owner salary and UCM are fixed charges, corporate tax applies to the result after charges.

### ai

Not now for the product. Two bounded uses are kept as optional later work, both behind a `Paramètres / IA` key field (OpenAI, stored server-side in settings, never in the browser):

1. **Recipe import from text or photo** (`/recipes/new?import=ia`): input is pasted text or a photo of a handwritten recipe; the model returns JSON `{ name, portions, ingredients: [{ name, qty, unit }], steps }`; the app maps ingredient names through `normalizeName` to existing ingredients and shows unmatched ones for manual pick; output lands in the RecipeEditor form, nothing is saved automatically. One backend endpoint `POST /admin/ai/parse-recipe`.
2. **Journal line from an invoice PDF**: drop a Falco PDF on the Journal, the model returns `{ number, date, label, totalTvac, vatRate }` to prefill the entry form.

Ingredient duplicate detection does not use a model; string normalisation and Levenshtein are enough and deterministic. Menu suggestions, chat, and Odoo are out.

## Roadmap

### Phase 0: Foundations (1 week)

Move costing maths into `packages/types/src/costing.ts` (calcRecipeCost with a Map, calcEventCost, splitTvac, sumMoney, groupByMonth, normalizeName) and re-export from `recipe-helpers.ts`; delete `packages/utils`. Design tokens and type scale in `index.css` and `tailwind.config.ts`; `PageHeader`, `Tag`, `StatusTag`, `FieldLabel`, `ListRow`, `MoneyTile`, `Money` components. `DdbService`: UnprocessedItems retry, `transactWrite`, `expectedUpdatedAt`, 409 filter. `.strict()` and `isoDate` on event DTOs; `tva` restricted to 6/12/21. Events list ascending sort for À venir. `calcEventCost` used by Dashboard, EventDetail, EventEditor so the three agree on `actualCost`.

**Migration:** None. Build with `pnpm build:types`. The 409 filter changes nothing for existing clients.

**Rationale:** Every later phase depends on shared maths and readable components; doing it first avoids rewriting the new accounting screens later.

### Phase 1: The event as pivot and the journal (3 weeks)

Event fields `prestationType`, `vatRate`, `km`, `hoursPlanned/Spent`, `serviceTime`; `EventExtraCost.kind`; `POST /admin/events/:id/complete` with `costSnapshot`; `ta-ledger` table, `LedgerModule`, DTOs; Clôturer form, Acompte, Marquer réglé; `Facturation` section on EventDetail with derived tags; Journal page (month and year), non-event lines, lock, xlsx and CSV export. Prestation type and VAT required in the Clôturer form, prompted in EventEditor.

**Migration:** Create `ta-ledger-{stage}` (console, SSM, config `.optional()`, bootstrap, `.env`, pm2 restart) and update `data-stack.ts`. Script `snapshot-completed-events.ts --dry-run` snapshots existing completed events at current prices with `approximate: true`. No change to existing event rows otherwise.

**Rationale:** Month-end has zero coverage today and the accountant export is the first deliverable the caterer can retire a sheet with. It also forces the prestation type and the frozen cost that all later views need.

### Phase 2: Planning views and line fields (2 to 3 weeks)

`EventRecipeLine` optional fields with lazy `lineId`; `PATCH /admin/events/:id/lines/:lineId` and `PUT /admin/events/:id/lines/order`; `settings.courses` and `recipe.defaultCourse`; EventDetail menu by course with reorder and edit mode; `Week.tsx` as home with money strip (journal CA, signé, à encaisser, objective bar reading `objectives` if present); `Day.tsx` prep sheet; cook mode query params and `Marquer fait`; EventEditor autosave sends changed fields only; delete WeekPlannerModal and both aggregated PDFs (keep `PDF de la semaine` from the day structure); new sidebar and phone tab bar.

**Migration:** Optional fields only. `backfill-line-ids.ts --dry-run` for untouched rows. Dashboard route removed; `/` now renders Week. SETTINGS_TTL to 30 s.

**Rationale:** The verbatim planning request, built on top of the pivot so revenue on the week is the real figure.

### Phase 3: Reports and objectives (2 to 3 weeks)

`fixedCharges` and `objectives` in settings with DTOs; `Prévisionnel`, `Charges fixes`, `Aperçu par mois` (table, mix, comparison, rebuilt chart), `Compte de résultats` (MP réel vs calculé, SRL tax), `Au réel`, `Extras` and `Achats` (purchase entries). Delete `Dashboard.tsx` and `estimateBelgianTax`. Add the Compte de résultats sheet to the export.

**Migration:** None for data. The caterer enters the 2026 charge list and objective once via the Prévisionnel form (a one-off import script from the workbook's `Prévisionnel financier` sheet is optional, two hours).

**Rationale:** With the journal filled for a few months the reports have data; objectives and charges are small settings edits.

### Phase 4: Clients and Hoona (2 weeks)

`ta-clients` table, `ClientsModule`, `Clients.tsx` and `ClientDetail.tsx` with `Semaine type` grid, `generate-week`, week page prompt, `Facturer le mois` with multi-event entries, `clientId` on events and entries, `Enregistrer comme semaine type` from an event.

**Migration:** Create `ta-clients-{stage}` per the README procedure. Optional `seed-clients.ts --dry-run` groups events by contact to propose clients and backfill `clientId`. Old events keep contact fields.

**Rationale:** Recurring clients need the invoicing mode and the journal to exist; the weekly template is then a small addition.

### Phase 5: Ingredient merge and recipe reading (2 weeks)

`GET /admin/ingredients/duplicates`, `POST /admin/ingredients/merge`, `Doublons.tsx`; 409 on delete with references; remove `deduplicate`. `RecipeRead.tsx` and `RecipeCost.tsx` split with the reading column, explicit edit mode; cook mode two-column and drawer layout, 44px controls; grocery page card layout at every breakpoint and `fullBleed` outlet.

**Migration:** `mergedFrom` optional. Merge runs are user-triggered; no bulk migration.

**Rationale:** Merge is request 1 and is contained; the recipe reading rewrite reuses the components proven on the accounting screens.

### Phase 6 (optional): AI import

`Paramètres / IA` key, `POST /admin/ai/parse-recipe`, import flow into RecipeEditor; later the invoice PDF prefill for the journal.

**Migration:** Settings gains an encrypted `openaiKey`; no table.

**Rationale:** Only if the caterer provides a key and still enters recipes by hand.

## Risks

- **Double entry with Falco.** The invoice number and amounts are still typed by hand from Falco. If this feels like the workbook again, the AI invoice-PDF prefill (Phase 6) or a Falco CSV import is the mitigation. I did not check whether Falco exports CSV.
- **VAT on deposits and the corporate tax rate are not verified.** Deposits are recorded as revenue in the month received because the workbook does so; the 25 % default and the 20 % SME condition need the accountant's confirmation. Both are editable, neither is hard-coded.
- **Two raw-material figures can confuse.** `réel` and `calculé` shown side by side with a source tag is the mitigation; if the caterer never enters purchases, the income statement is a recipe-theory statement and says so.
- **Settings item is last-write-wins** (`SettingsService.update` does a put). Fixed charges and objectives edited on two devices at once would lose one edit. Acceptable for one user; the `expectedUpdatedAt` guard can be extended to settings later.
- **Existing completed events get approximate snapshots** at today's prices. Reports tag them `approx.`; the caterer can enter `actualCost` or a monthly `mp` purchase line for those months.
- **New tables cost manual provisioning** (console, SSM, bootstrap, `.env`, pm2) because the CDK stack is out of date; two tables keep this to two rounds. Declaring the env vars optional for the rollout release avoids an API that refuses to boot.
- **Autosave overwrite.** Until `EventEditor` sends only changed fields (Phase 2), a prep status toggled on the phone can be overwritten by a laptop autosave. Line endpoints ship in the same phase.
- **Scope for a solo developer.** Phases 1 to 3 are about eight weeks of focused work. If time is short, Phase 1 alone (journal, Clôturer, export) is a complete, useful release.
- **Monthly invoicing assumption for Hoona** is inferred from the workbook's `facture comptoir` and `Lunch Philippson` lines, not confirmed. The `invoicing` field on the client and multi-event entries cover both cases.
- **Phone-first finance screens** are tables with 14 columns; the card fallback below `md` is specified but will need testing on a real phone in the kitchen, which I did not do.
