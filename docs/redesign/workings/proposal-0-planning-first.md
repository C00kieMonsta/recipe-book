# Proposal 0: La semaine d'abord: planning, fiches de préparation et livre des comptes

Angle: Planning first. The week is the home screen; every other screen is reached from a day, an event or a prep sheet. Accounting hangs off event closure and shows up as one revenue line in the week header.

## Vision

The app opens on the current week. Seven days, each with its events, each event with its recipe lines ("Mini quiches · 30 portions · Hoona"), each line with a status dot. The header shows what is signed this week in HTVA and how far the month is from its objective. Dalia reads the week on Monday on her laptop, then on Tuesday she opens the day on her phone, taps the first line, and reads the recipe at 30 portions in 18px type with a "Fait" button at the bottom. The 30-page PDF disappears because the day view is the prep sheet; if she wants paper, the day view prints.

Everything the brief asks for is a projection of data the app already holds. Events have dates, recipes and portions; the week and day views only need per-line identity, course, order and status, which are optional fields with no migration. The aggregated PDF, the week modal and the finance Dashboard go away. The costing maths stay exactly where they are and feed two new things: the cost snapshot taken when an event is closed, and the income statement.

Accounting attaches to closure. "Clôturer" on an event flips it to completed, freezes its raw material cost, and pre-fills a journal line (date, label, HTVA, VAT rate, prestation type, KM) that Dalia completes with the Falco invoice number. Deposits, counter sales, commissions and extra staff are journal lines too. The reports (Journal, Aperçu par mois, Compte de résultats, Prévisionnel, Au réel) are views over those records plus the fixed charges and the yearly objective stored in settings. The export writes the workbook's fourteen columns, one sheet per month, so the accountant sees the same file as before.

This angle wins because it matches how the week is lived: plan on Monday, cook during the week, close at the end, review at month end. The home screen answers the first question of the day, the prep sheet is the recipe reading screen the readability complaint is about, and the ledger is reached from the same event the kitchen already uses. Three new tables (clients, event templates, ledger), optional fields everywhere else, no framework change.

## Navigation

## Home

`/` redirects to `/week/<current ISO week>`. The week view is the home screen on every device.

## Sidebar (laptop, light surface instead of the dark brown)

Order and French labels, in `apps/frontend/src/components/admin/AdminSidebar.tsx` `menuItems`:

1. **Semaine** `/week` (icon CalendarDays). Active for `/week/*`, `/day/*` and `/events/:id/lines/*`.
2. **Événements** `/events` (Calendar). List, detail, editor, Clôturer.
3. **Recettes** `/recipes` (BookOpen).
4. **Ingrédients** `/ingredients` (ClipboardList). Includes `/ingredients/duplicates`.
5. **Courses** `/grocery-list` (ShoppingCart).
6. **Clients** `/clients` (Users). New, phase 3.
7. **Comptes** `/accounts` (Landmark). New, phase 4. Sub-tabs inside the page: Journal, Aperçu, Compte de résultats, Prévisionnel, Au réel.
8. **Paramètres** `/settings` (Settings). Gains Services (courses), Types de prestation, Charges fixes, Objectifs, Clé IA.

The sidebar becomes light (`--sidebar-background: 30 20% 93%`, text at text-base, active item with a primary tint and a 3px left bar). The version string moves to Paramètres.

## Phone

Bottom tab bar with four items: Semaine, Recettes, Courses, Plus. "Plus" opens a sheet with Événements, Ingrédients, Clients, Comptes, Paramètres, Déconnexion. The top bar shows the breadcrumb and page title instead of the logo and hamburger. `AdminLayout.tsx` keeps `pt-[68px]` on phones for the top bar and adds `pb-[64px]` for the tab bar.

## Removed or merged

- **Tableau de bord** is removed. `Dashboard.tsx` is deleted along with `estimateBelgianTax`, the tax toggle and the year chart. Its two useful pieces move: the monthly chart becomes the Aperçu par mois chart (ledger HTVA vs objective), and "recent events" is replaced by the week view.
- **Planning semaine modal** and `generateAggregatedPdf` in `Events.tsx` are deleted. `exportRecipesPdf` in `EventDetail.tsx` is deleted. Paper comes from the day view print stylesheet.
- **Listes de courses** stays as "Courses" but lists are created from a date range on the week or day view, not from a multi-select in the events table. The checkbox column in the events table goes.
- Breadcrumbs on every detail page: "Semaine 42 / Mardi 14 oct / Hoona / Mini quiches". `navigate(-1)` is replaced by explicit parent links.

## Screens

### Semaine (home) (/week/:isoWeek (e.g. /week/2026-W42); / redirects to the current week)

Answer 'what do I cook this week, for whom, and how much is it worth'. Planning plus revenue in one screen, every line one tap from its prep sheet.

**Layout**

## Header (both)

Line 1: `‹ Semaine 42 ›` with prev/next arrows (44px targets), date range "13 au 19 octobre", and an "Aujourd'hui" link. Line 2: three figures at text-lg: **Signé cette semaine** (Σ sellingPricePerGuest × guestCount for events dated in the week, HTVA), **Mois** as a progress bar "11 200 / 16 000 € (70 %)" where the target is `Objective.monthlyRevenue(yyyy-mm)` and the value is Σ signed events in the month (ledger HTVA shown as a second tick once phase 4 ships), and **Préparation** "18 / 40 lignes faites". A client filter chip row appears when any event has a clientId ("Tous · Hoona · Mariage Dupont").

## Laptop (≥ 1024px)

Seven columns, `grid-cols-7 gap-3`, one per day Monday to Sunday. Column header: "Mar 14" at text-lg Playfair, under it "2 événements · 60 conv. · 1 240 €". Today's column has a primary-tinted header. Inside the column, one card per event: name at text-base semibold, prestation tag, "30 conv.", and a 4px progress bar (lines done / lines). Under the card, the event's lines in course order as 36px rows at text-sm: status dot (grey / amber / green), recipe name, portions in bold. Lines beyond five are collapsed into "+ 4 lignes"; a header toggle "Lignes / Événements" hides all lines for a pure overview. Lines whose `prepDate` differs from the event date render on the prep day with a small "→ sam." suffix. Days with no event show a dashed "+" block.

With six events and forty lines: each event card is 72px, each line row 36px, five lines max per card, so the tallest column (three events, 25 lines) is about 3 × 72 + 15 × 36 + collapsed rows = 800px, which scrolls inside the column (`max-h-[calc(100dvh-220px)] overflow-y-auto`). The header stays fixed. The "Événements" toggle brings the whole week into one screen with no scrolling.

## Phone

Days stacked vertically. Today is expanded; other days collapsed to a single 56px row: "Mar 14 · 2 évén. · 60 conv. · 12 lignes · 3 faites". Tap expands the day in place; the day header is sticky while expanded. Inside, events are full-width cards and lines are 48px rows at text-base with the status dot on the left and portions bold on the right. The week header collapses to two lines; the revenue figures sit in a horizontally scrollable strip.

## Print

`@media print` hides the sidebar, tab bar and header controls and prints the seven columns as a landscape page with all lines expanded.

**Interactions**

- Prev/next week, "Aujourd'hui", keyboard ← → on laptop.
- Tap a day header → `/day/:date`.
- Tap an event card title → `/events/:id`.
- Tap a line → `/events/:eventId/lines/:lineId` (prep sheet).
- Long-press (phone) or hover (laptop) a line shows a three-state status control (À préparer / En cours / Fait); tapping writes `PATCH /admin/events/:id/lines/:lineId { prepStatus }`.
- "+" on a day → sheet with "Nouvel événement" (opens `/events/new?date=2026-10-14`) and "Depuis un favori" (template picker, phase 3).
- "Courses" button in the header → `/grocery-list/new?from=2026-10-13&to=2026-10-19`. Day columns also expose "Courses du jour".
- Client filter chips narrow the grid to one client's events (the Hoona week).
- "Lignes / Événements" density toggle persisted in localStorage via `useLocalStorage`.
- "Créer la semaine Hoona" prompt appears at the top when a template has `defaultWeekdays` and no event exists for that client in this week (phase 3).
- Drag a line to another day on laptop sets `prepDate` (phase 1b, optional).

### Jour (prep sheet list) (/day/:date (e.g. /day/2026-10-14))

The per-day prep sheet. Every recipe line to prepare that day, grouped the way the kitchen works, with status, and the paper fallback via print.

**Layout**

## Header (both)

Breadcrumb "Semaine 42 / Mardi 14 octobre". Title "Mardi 14 octobre" Playfair 32px. Meta line: "2 événements · 60 convives · 12 lignes · 3 faites". Segmented control with three modes: **Par événement** (default), **Par service** (courses from settings), **Par recette** (merged across events). Buttons: "Courses du jour", "Imprimer".

## Laptop

A single 760px reading column. Group headings at text-xl semibold with a right-aligned count ("Hoona · 30 conv. · 5 lignes"). Each line is a 56px row: status control on the left (three 44px segments on hover, a dot otherwise), recipe name at text-lg, second line at text-sm muted "Apéritif · note", portions bold at text-lg on the right, a chevron. Lines marked Fait are dimmed and sorted last inside their group when "Masquer les lignes faites" is off. "Par recette" shows the merged quantity with its breakdown underneath: "Mini quiches · 80 portions" then "Hoona 30 · Mariage Dupont 50" at text-sm, and a single status control that writes to every underlying line.

## Phone

Same column full width. Group headings sticky. Rows 56px with the status as a 44px tap target on the left (cycles À préparer → En cours → Fait) and the rest of the row opening the prep sheet. The mode control becomes a dropdown.

## Print

One page per group, each line as a checkbox row with recipe, portions and client; "Par recette" mode prints the ingredient table scaled to the merged portions under each recipe (the one thing the old PDF did well). `break-before: page` per group. Body 12pt.

**Interactions**

- Status control per line writes `PATCH /admin/events/:id/lines/:lineId { prepStatus }` and invalidates the events cache; optimistic update.
- Tap a line → prep sheet. Tap a group heading in Par événement mode → `/events/:id`.
- "Par recette" merged status writes to all underlying lines in parallel; partial failures show a toast listing the lines that did not save.
- "Masquer les lignes faites" toggle.
- "Courses du jour" → `/grocery-list/new?from=:date&to=:date`.
- "Imprimer" → `window.print()`.
- Prev/next day arrows in the header, swipe on phone.

### Fiche de préparation (prep sheet) (/events/:eventId/lines/:lineId)

'30 amuse-bouches pour Hoona': read one recipe at the event's portions, track its status, add a note. This is the recipe reading screen the readability complaint is about.

**Layout**

## Both

Breadcrumb "Mardi 14 oct / Hoona". Title: recipe name Playfair 32px. Under it a one-line summary at text-lg: "**30 portions** pour Hoona · Apéritif" with a small "(recette de base : 10)" at text-sm. A sticky status bar at the bottom: three 48px segments **À préparer / En cours / Fait**, and a "Cuisiner" button (opens cook mode at these portions).

Body in a 720px column, no cards, headings and whitespace:

1. Photo, if any, full width `aspect-[3/2]` rounded.
2. **Ingrédients** heading text-xl. Two-column list at text-lg, 48px rows: name left, quantity bold with unit muted right, quantities scaled with `scaleQty` from RecipeCook.tsx (moved to `apps/frontend/src/lib/recipe-helpers.ts` as `scaleQty(qty, ratio)`). A portions stepper (44px buttons) above the list lets her override the scale for a batch without changing the line.
3. **Préparation** heading. Numbered steps at text-lg leading-relaxed, 32px number badge, `space-y-5`. Left-aligned.
4. **Note pour cette fois** textarea at text-base, saved on blur to `line.notes`.
5. Collapsed **Coût matières** toggle (Notion-style) showing the cost table at text-sm for the laptop user; closed by default.

No inline editing of the recipe here. A "Modifier la recette" link in the overflow menu goes to `/recipes/:id/edit`.

## Laptop

The status bar is a right-hand sticky card next to the column; ingredients and steps can sit side by side (ingredients 320px, steps the rest) when the viewport is ≥ 1280px.

## Phone

Single column, status bar fixed at the bottom above the tab bar, ingredients list collapsible once the user scrolls into the steps (a "Ingrédients ▾" pill stays pinned under the top bar so quantities are one tap away).

**Interactions**

- Status segments write `PATCH /admin/events/:id/lines/:lineId { prepStatus }`. Marking Fait also navigates back to the day with a toast "Mini quiches faites" and a "Suivante" action that opens the next À préparer line of the day.
- "Cuisiner" → `/recipes/:recipeId/cook?portions=30&event=:eventId&line=:lineId`; finishing cook mode marks the line Fait.
- Portions stepper rescales quantities locally; a "Enregistrer 36 portions" link appears if the value differs from the line and writes `{ portions }` to the line.
- Note saved on blur with `{ notes }`.
- ← / → arrows (laptop) and swipe (phone) move to the previous / next line of the same day.
- "Coût matières" toggle opens the cost table (read-only).

### Mode cuisine (/recipes/:id/cook?portions=30&event=:eventId&line=:lineId)

Full-screen step-by-step reading for wet hands, started at the event line's portions instead of the recipe base.

**Layout**

Keeps `RecipeCook.tsx` structure (header, body, footer) with these changes: portions initialised from `?portions` when present; header shows "Mini quiches · 30 portions pour Hoona"; on tablets and laptops (≥ 768px) a two-column body with the ingredient list pinned left (text-lg, scaled) and the current step right at text-3xl Playfair, left-aligned; on phones the ingredient list is a bottom drawer ("Ingrédients" pill) and the step fills the screen. Progress dots replaced by "4 / 9" text and two 56px prev/next buttons. `select-none` removed. Portion +/- buttons 44px.

**Interactions**

- ← → keys, swipe, prev/next buttons.
- When `line` is present the last screen shows "Marquer comme fait" which writes `prepStatus: "done"` and returns to the prep sheet; otherwise "Terminer" returns to the recipe.
- Portions stepper rescales locally only.

### Recette (lecture) et édition (/recipes/:id (lecture), /recipes/:id/edit (édition), /recipes (liste))

Read a recipe outside any event, and edit or cost it on purpose rather than by accident.

**Layout**

`/recipes/:id` reuses the same `RecipeReader` component as the prep sheet (720px column, photo, title, metadata line, ingredients at text-lg, steps at text-lg) with a portions stepper defaulting to `recipe.portions`. Header actions: "Cuisiner", "Modifier", overflow (Dupliquer, Exporter PDF, Supprimer). A collapsed "Coût & prix" block holds the current six-column cost table and `PricingSimulation` unchanged, at text-sm, desktop-oriented with a card fallback on phones. `/recipes/:id/edit` is `RecipeEditor.tsx` with visible inputs at text-base; the click-to-edit `EditableText`, `EditableInlineNum`, inline add-step and add-ingredient paths are removed from `RecipeDetail.tsx` (which shrinks from 819 lines to the reader plus the cost block). The list page keeps the card grid on laptops and switches to 72px rows with a 64px thumbnail on phones; category rendered as a `Tag`.

**Interactions**

- Portions stepper rescales quantities.
- "Modifier" → editor; autosave stays in the editor.
- "Coût & prix" toggle.
- "Cuisiner" → cook mode at the stepper's portions.

### Événement (/events/:id (detail), /events/:id/edit (editor), /events/new?date=&template= (creation))

The order: client, date, guests, price, menu by course, costs, and the close action that feeds the journal.

**Layout**

## Detail (both)

Breadcrumb "Semaine 42 / Hoona". Title Playfair 32px, under it "Mardi 14 octobre · 30 convives · Buffet à emporter · Hoona" with the client name linking to `/clients/:id`. Status as a `StatusTag` (À venir / Terminé) plus derived badges "Facturé" and "Payé" from linked ledger entries (phase 4). Four stat tiles: Coût HTVA, Revenu HTVA, Marge, Marge % (same maths as today via a shared `calcEventCost`). Notes block.

**Menu** section: lines grouped by course heading (Apéritif, Entrée, Plat, Dessert, Autre), each line a 56px row: drag handle (laptop) or ▲▼ buttons (phone), recipe name text-base, portions (inline numeric), status dot, course select, overflow (Note, Date de préparation, Retirer). "+ Recette" opens the existing recipe search and asks for a course (default `recipe.defaultCourse`).

**Coûts supplémentaires** list with a `kind` select (Matière / Personnel / Location / Transport / Autre).

Primary action on the right (laptop) or bottom (phone): **Clôturer** when status is upcoming; **Ligne de journal** link when completed.

## Editor

`EventEditor.tsx` keeps its autosave but gains: client picker (creates a client inline), prestation type select (required for new events, defaults VAT rate), VAT rate, hours planned, KM, and the same course-grouped line list. The recipes array is sent only when a line was added or removed in the editor; portion, course, order and status edits go through the line endpoints so an open editor tab never overwrites a phone's status change.

**Interactions**

- Drag (laptop, HTML5 drag like GroceryListPage) or ▲▼ (phone) reorder within a course; drop on another course heading changes `course`. Both write `PUT /admin/events/:id/lines/order { lineIds }` after an optimistic reorder, and `PATCH .../lines/:lineId { course }` for the course change.
- Portions inline edit → `PATCH .../lines/:lineId { portions }`.
- "Clôturer" opens a modal: date, invoice number, label (prefilled), HTVA (prefilled price × guests), VAT rate (prefilled from event), TVAC computed, type, KM, paid / method / date received. Confirm → `POST /admin/events/:id/close` (status completed, cost snapshot) then `POST /admin/ledger` with eventId. Cancel leaves the event untouched.
- "Enregistrer comme favori" in the overflow → creates an EventTemplate from the event (phase 3).
- "Dupliquer" stays for one-offs but asks for a date instead of using today.

### Événements (liste) (/events)

Find an event by name, client or month; the week view is the daily entry point, this list is the archive and search.

**Layout**

List rows instead of the 8-column table: name at text-base, second line "Mar 14 oct · 30 conv. · Hoona · Buffet à emporter" at text-sm muted, right side revenue HTVA and a StatusTag. Filter chips: À venir (default, sorted ascending), Terminés (descending), Tous; a client select and a month select. No checkbox column, no trash icon in rows. Laptop: rows in a 900px column. Phone: same rows full width.

**Interactions**

- Tap row → detail. "Nouvel événement" → `/events/new`. Search by name or client. The "Liste de courses (n)" and "PDF agrégé" multi-select actions are removed; grocery lists come from the week or day view.

### Courses depuis une période (/grocery-list/new?from=YYYY-MM-DD&to=YYYY-MM-DD (generation), /grocery-list?id= (detail, existing))

Generate a supplier-grouped grocery list for a date range with one tap from the week or day view, and keep the link to the events so the list can be regenerated.

**Layout**

Generation screen: a short form prefilled from the query: date range, a list of the events found in the range with a checkbox each (all on by default), a toggle "Exclure les lignes déjà faites", and the resulting title "Courses · semaine 42". Below, a preview grouped by supplier. "Créer la liste" saves. The detail page is `GroceryListPage.tsx` with the audit's card layout at every breakpoint (48px rows, full-row tap toggles checked, text-base names, labelled export menu) and a banner "3 événements modifiés depuis la génération · Régénérer" when any linked event's updatedAt is newer than the list. Laptop keeps the saved-lists sidebar; phone shows the list and reaches saved lists through a "Mes listes" sheet.

**Interactions**

- Generation aggregates exactly as `generateGroceryList` in Events.tsx does today (key `ingredientId:unit`, scale `line.portions / recipe.portions`), moved to `apps/frontend/src/lib/grocery.ts` as `buildGroceryItems(events, lines, recipes, ingredientById)`; lines are selected by `(line.prepDate ?? event.date)` in range. The list is created through `api.groceryLists.create` with `eventIds` and `range`; the localStorage hand-off is deleted.
- "Régénérer" rebuilds items, keeps `checked` and `haveQty` by ingredientId, and PATCHes.
- Existing toggles (hide checked, drag between suppliers, add ingredient, PDF/CSV/Copier) stay.

### Doublons d'ingrédients (/ingredients/duplicates)

Find probable duplicate ingredients, choose the survivor, remap every recipe and grocery list, then delete the rest. Replaces the 'Dédoublonner' button.

**Layout**

Groups as cards in a 900px column. Card header: the normalised key ("oeuf") and a match reason tag ("Même nom normalisé" or "Noms proches"). Inside, one row per ingredient: radio button (survivor), name, unit, price, supplier, and "utilisé dans 7 recettes · 2 listes". The proposed survivor is pre-selected. Rows whose unit family differs from the survivor get an amber note "unité différente, à convertir à la main" and the merge button is disabled for that group until a compatible survivor is picked or the row is unticked. Footer: "Fusionner (3 → 1)" primary, "Ignorer ce groupe" secondary. A top bar shows "12 groupes · 29 ingrédients" and a search. Phone: same cards full width, radio targets 44px.

**Interactions**

- Load → `GET /admin/ingredients/duplicates` returns groups with reference counts.
- Radio picks the survivor; checkbox unticks a row from the merge.
- "Fusionner" → `POST /admin/ingredients/merge { survivorId, mergedIds }`; the card shows "7 recettes et 2 listes mises à jour, 2 ingrédients supprimés" then collapses. Errors show a "Réessayer" button that resends the same payload (the endpoint is idempotent).
- "Ignorer" stores the group key in `settings.ignoredDuplicateGroups` so it stops appearing.
- A banner "2 fusions inachevées" appears if any ingredient still has `mergedInto` set, with "Reprendre".

### Clients (/clients (list), /clients/:id (detail))

One record per recurring or notable client; the detail is the client's own calendar: past and coming weeks, templates, defaults for new events.

**Layout**

List: rows with name, kind tag (Entreprise / Particulier), default prestation type, "12 événements · 4 820 € cette année". Detail (laptop): header with name, contact fields, defaults (type, VAT, price per guest); left column "Favoris" (templates with "Créer pour une date…" and "Créer la semaine"); right column a month-by-month list of that client's events with status dots and revenue. Phone: sections stacked, Favoris first.

**Interactions**

- Create a client from the list, or inline from the event editor's client picker ("+ Nouveau client").
- Template actions: "Créer pour une date…" → date and guests prompt → `POST /admin/events/from-template/:templateId { date, guestCount }`. "Créer la semaine" → week picker → one event per `defaultWeekdays` entry, skipping days that already have an event for this client.
- Tap an event → detail. "Voir la semaine" → `/week/:isoWeek?client=:clientId`.

### Comptes · Journal des recettes (/accounts/journal?year=2026&month=10)

The revenue book: one line per invoice or operation, with VAT split and payment tracking, exported in the workbook's layout.

**Layout**

Tabs across the top of every `/accounts/*` page: Journal · Aperçu · Compte de résultats · Prévisionnel · Au réel. Journal: year and month selects, filter chips (Tous / Non réglés / Événements / Comptoir / Acomptes / Commissions), "Nouvelle ligne", "Exporter". Laptop: a real table (this is a desktop costing view) with the workbook's columns in order: N° | Date | Intitulé | Type | Total TVAC | HTVA | TVA 6 % | TVA 12 % | TVA 21 % | Réglé | Mode | Encaissé le | KM | Description, text-sm, tabular numerals, footer with Σ TVAC, Σ HTVA, Σ per rate, "Total CA 10/2026" and a per-type sub-table (Σ HTVA by prestation type). Phone: card rows (label, date, HTVA bold, paid tag) with a tap-to-expand detail; the table is not shown.

**Interactions**

- "Nouvelle ligne" opens the entry form (kind, date, number, label, type, HTVA, VAT rate(s), TVAC auto, paid, method, paidAt, KM, description, eventId optional). `splitTvac(tvac, rate)` pre-fills HTVA from TVAC when the user types TVAC first.
- Row tap → edit form; locked rows (exported) require "Déverrouiller" with a confirm.
- "Réglé" checkbox inline writes `paid`, `paidAt = today` and asks the method.
- "Exporter" → xlsx "Livre des recettes 2026.xlsx" (one sheet per month + annual + Compte de résultats) or CSV ";" fr-BE; export sets `locked: true` on exported lines after a confirm.

### Comptes · Aperçu par mois (/accounts/overview?year=2026)

CA HTVA by month against last year and the objective, plus the revenue mix by prestation type.

**Layout**

Top: a bar chart (reuse the SVG from Dashboard.tsx, axis labels 12px minimum) with three series per month: CA N−1, CA N, Objectif. Table: Mois | CA HTVA N−1 | CA HTVA N | Δ % | Objectif | Prévision (signé) | Atteint. Totals row. Objective box: seuil annuel / mensuel, objectif annuel / mensuel, comparaison par période (1 jan–30 avr, 30 avr–30 juin) for N, N−1, N−2. Below: Mix par prestation table: Type | CA N−1 | % | CA N | % | Objectif | % | Nb nécessaires. Phone: chart then the two tables as stacked rows (month name, N, Δ, objective).

**Interactions**

- Year select. Tap a month → journal filtered to that month. Tap a type → journal filtered by type. "Modifier l'objectif" → settings.

### Comptes · Compte de résultats (/accounts/income?year=2026)

The monthly income statement: CA, raw material, gross margin, fixed charges, extras, result before tax, corporate tax, net.

**Layout**

Laptop: table with 12 month rows plus Total année: Mois | CA HTVA | Coûts MP | Marge brute | Charges fixes | Personnel extra | Autres coûts | Résultat avant impôts | Marge % | Impôts | Résultat net. Ratio rows under the table: MP / CA, Marge brute / CA, Charges fixes / CA. A Simulation row from the objective. Each Coûts MP cell carries a small source tag ("achats" when ledger purchase lines exist for the month, "recettes" when derived from event snapshots). Phone: one card per month with the eleven figures in two columns, current month first.

**Interactions**

- Year select. Tap Coûts MP → a side panel listing the month's purchase lines and event snapshots with "Ajouter un achat". Tap Personnel extra → the month's extra shifts with "Ajouter des heures". Tap Charges fixes → settings. "Exporter" adds this sheet to the xlsx.

### Comptes · Prévisionnel (/accounts/forecast?year=2026)

Fixed charges, breakeven, treasury need, investment envelope, and the 'seule' scenario.

**Layout**

Scenario toggle "Avec salarié / Seule" at the top. Charges table: Intitulé | Catégorie | Mensuel | Mensuel seule | Annuel, totals, read from `settings.fixedCharges` active in the selected year. Figures block at text-lg: Seuil de rentabilité annuel et mensuel, Besoin de trésorerie, Bénéfice avant impôts prévu, ISoc prévu, Marge nette prévue %. A smaller "hors MP (méthode du classeur)" figure next to the seuil for one year. Investments list with total. Phone: figures block first, then the charges as rows.

**Interactions**

- Scenario toggle changes which amount column is summed, not the objective.
- "Modifier les charges" and "Modifier l'objectif" → settings sections. Everything else is read-only.

### Comptes · Au réel (/accounts/signed?year=2026&month=10)

Signed revenue versus the monthly target, with hours: 'il me reste X € à signer avec Y heures disponibles'.

**Layout**

Month select. Table (laptop) or rows (phone): Client / événement | Type | CA HTVA | Heures | Observations, one row per event dated in the month (CA = Σ journal lines of the event when any exist, else price × guests; Heures = hoursSpent ?? hoursPlanned). Footer: Σ CA signé, Σ heures, Objectif mensuel, Heures disponibles, Reste à signer, Heures restantes. Year total and écart at the bottom.

**Interactions**

- Tap a row → event detail. Inline edit of Heures writes `hoursSpent` on the event. "Heures disponibles" is edited in the objective.

### Paramètres (/settings)

Lists the app needs: services (courses), prestation types, suppliers, recipe categories, fixed charges, yearly objectives, optional AI key.

**Layout**

Sections in a 760px column with sentence-case headings: Services (ordered list, drag or ▲▼, used for course grouping), Types de prestation (list with default VAT rate per type), Fournisseurs (existing, plus a colour swatch), Catégories de recettes (existing), Charges fixes (table: label, catégorie, mensuel, mensuel seule, du, au; "Modifier le montant" closes the current period and opens a new row), Objectifs (per year: CA annuel, mois actifs, par type with events needed, heures disponibles, % MP, taux ISoc, mois de trésorerie, investissements), Intelligence artificielle (optional OpenAI key, stored server-side). Phone: same sections stacked, tables as rows.

**Interactions**

- Every list edits inline and PATCHes `/admin/settings` with only the changed key.
- Fixed charge amount change → new row with `from = next month`, old row gets `to`.
- Objective per year duplicates last year's values as a starting point.

## Data model changes

All additions are optional on read unless marked required. Existing DynamoDB rows keep reading correctly: readers default missing fields exactly as `SettingsService.get` already defaults `suppliers`. New tables start empty. `removeUndefinedValues: true` in `DdbService` means undefined optionals are not written.

## Event lines, event, recipe (`packages/types/src/entities/event.ts`, `recipe.ts`)

```ts
export type PrepStatus = "todo" | "doing" | "done";

export interface EventRecipeLine {
  lineId?: string;        // optional on read; EventsService fills randomUUID() on create/update when absent
  recipeId: string;       // required (unchanged)
  portions: number;       // required (unchanged)
  course?: string;        // value from settings.courses; fallback recipe.defaultCourse, then "Autre"
  order?: number;         // sort key inside the course; fallback array index
  prepStatus?: PrepStatus; // undefined reads as "todo"
  prepDate?: string;      // YYYY-MM-DD; line shows on this day instead of event.date
  notes?: string;         // per-line note for this event
}

export interface EventExtraCost {
  label: string;
  amount: number;
  kind?: "matiere" | "personnel" | "location" | "transport" | "autre"; // undefined reads as "autre"
}

export type EventStatus = "upcoming" | "completed"; // unchanged; "facturé" and "payé" are derived from ledger entries

export interface AppEvent {
  // existing fields unchanged
  clientId?: string;
  templateId?: string;
  prestationType?: PrestationType;
  vatRate?: VatRate;
  hoursPlanned?: number;
  hoursSpent?: number;
  km?: number;
  costSnapshot?: {
    rawMaterial: number;   // Σ (recipeCost / recipe.portions) × line.portions at closure, or actualCost if set
    extras: number;        // Σ extraCosts.amount at closure
    lines: { lineId: string; recipeId: string; portions: number; unitCost: number }[];
    takenAt: string;       // ISO
  };
}

// Recipe
export interface Recipe {
  // existing fields unchanged
  defaultCourse?: string;  // used when a line is added without a course
}
```

Sort rule everywhere (`sortEventLines` in `packages/types/src/lib/event-lines.ts`): by index of `course ?? recipe.defaultCourse ?? "Autre"` in `settings.courses`, then `order ?? arrayIndex`. Duplicate `recipeId` is allowed once `lineId` exists (same recipe in two courses).

## Shared taxonomies (`packages/types/src/entities/accounting.ts`)

```ts
export const VAT_RATES = [0, 6, 12, 21] as const;
export type VatRate = (typeof VAT_RATES)[number];

export const PRESTATION_TYPES = [
  "menu_a_emporter", "buffet_a_emporter", "buffet_avec_service",
  "atelier", "brunch", "walking_cocktail", "chef_a_domicile",
] as const;
export type PrestationType = (typeof PRESTATION_TYPES)[number];
export const PRESTATION_LABELS: Record<PrestationType, string> = {
  menu_a_emporter: "Menu à emporter", buffet_a_emporter: "Buffet à emporter",
  buffet_avec_service: "Buffet avec service", atelier: "Atelier", brunch: "Brunch",
  walking_cocktail: "Walking / cocktail", chef_a_domicile: "Chef à domicile",
};
export const DEFAULT_VAT_BY_TYPE: Record<PrestationType, VatRate> = {
  menu_a_emporter: 6, buffet_a_emporter: 6, buffet_avec_service: 12, brunch: 12,
  walking_cocktail: 12, chef_a_domicile: 12, atelier: 21, // atelier rate to confirm with the accountant
};
```

## Settings (`packages/types/src/entities/settings.ts`), single item, effective-dated where history matters

```ts
export interface FixedCharge {
  chargeId: string; label: string;
  category: "social" | "salaire" | "assurance" | "abonnement" | "frais" | "remboursement" | "autre";
  monthlyAmount: number;        // with-staff scenario
  monthlyAmountSolo?: number;   // "seule" scenario; undefined reads as monthlyAmount
  from: string;                 // "YYYY-MM"
  to?: string;                  // "YYYY-MM", inclusive; undefined = still active
  note?: string;
}

export interface Objective {
  annualRevenue: number; monthsActive: number;            // default 10
  monthlyOverrides?: Record<string, number>;               // "YYYY-MM" → amount
  byPrestation: { type: PrestationType; amount: number; eventsNeeded?: number; guestsPerEvent?: number }[];
  hoursAvailablePerMonth?: number;
  rawMaterialPct: number;        // 0.38 default
  corporateTaxRate: number;      // 0.25 default, editable
  extrasBudget?: number;
  treasuryMonths: number;        // 3 default
  investments: { label: string; amount: number }[];
}

export interface AppSettings {
  settingsId: "global";
  recipeCategories: string[];
  suppliers: SettingsSupplier[];   // SettingsSupplier gains color?: string
  courses?: string[];              // default ["Apéritif","Entrée","Plat","Dessert","Autre"]
  prestationTypes?: { type: PrestationType; label?: string; vatRate?: VatRate }[]; // default from the constants
  fixedCharges?: FixedCharge[];
  objectives?: Record<string, Objective>;   // key = year "2026"
  ignoredDuplicateGroups?: string[];
  openAiKeySet?: boolean;          // the key itself is stored in SSM, never returned
  updatedAt: string;
}
```

`SettingsService.update` keeps its spread-and-put; extend the `Pick` and `updateSettingsRequestSchema` with the new keys. Item size stays far under 400 KB.

## Ingredient (`ingredient.ts`)

```ts
export interface Ingredient {
  // existing fields unchanged
  mergedInto?: string;   // tombstone written at merge start; readers resolve it, see ingredientMerge
  mergedFrom?: string[]; // audit on the survivor
}
```

## New table `ta-clients-{stage}` (PK `clientId`)

```ts
export interface Client {
  clientId: string; name: string; nameLower: string;
  kind?: "company" | "private";
  contactName?: string; phone?: string; email?: string; address?: string; vatNumber?: string;
  defaultPrestationType?: PrestationType; defaultVatRate?: VatRate; defaultPricePerGuest?: number;
  notes?: string; active: boolean;      // active required, default true
  createdAt: string; updatedAt: string;
}
```

## New table `ta-event-templates-{stage}` (PK `templateId`)

```ts
export interface EventTemplate {
  templateId: string; name: string;        // "Hoona · menu semaine"
  clientId?: string;
  prestationType?: PrestationType; vatRate?: VatRate;
  guestCount: number; sellingPricePerGuest: number;
  recipes: EventRecipeLine[];               // lineIds are regenerated on instantiation
  extraCosts: EventExtraCost[];
  notes?: string;
  defaultWeekdays?: (0 | 1 | 2 | 3 | 4 | 5 | 6)[];  // for "Créer la semaine"
  createdAt: string; updatedAt: string;
}
```

## New table `ta-ledger-{stage}` (PK `entryId`), append-only records

```ts
export type LedgerKind =
  | "facture" | "acompte" | "comptoir" | "commission" | "bon_cadeau" | "autre"  // sales
  | "achat_mp" | "extra";                                                      // purchase side

export interface LedgerEntry {
  entryId: string;
  book: "sales" | "purchases";
  kind: LedgerKind;
  date: string;          // YYYY-MM-DD
  ym: string;            // "2026-10", written server-side from date
  number?: string;       // Falco invoice number
  label: string;
  eventId?: string; clientId?: string; prestationType?: PrestationType;
  totalTvac: number; htva: number;
  vat: { rate: VatRate; base: number; amount: number }[];   // one row per rate on the invoice
  paid: boolean; paymentMethod?: "virement" | "cash" | "bancontact" | "payconiq" | "autre"; paidAt?: string;
  description?: string; km?: number;
  // extra staff lines only
  personName?: string; hours?: number; hourlyRate?: number;
  locked?: boolean;      // set when exported
  createdAt: string; updatedAt: string;
}
```

Zod (`packages/types/src/dto/ledger.ts`): `.strict()`, `date` regex `^\d{4}-\d{2}-\d{2}$`, money fields `multipleOf(0.01)`, refine `|htva + Σ vat.amount − totalTvac| < 0.011`, `hours × hourlyRate` refined to equal `htva` for kind `extra`.

## Grocery list (`grocery-list.ts`)

```ts
export interface GroceryList {
  // existing fields unchanged
  eventIds?: string[];
  range?: { from: string; to: string };
  excludeDone?: boolean;
}
```

## DTO changes (`packages/types/src/dto/events.ts`)

```ts
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const eventRecipeLineSchema = z.object({
  lineId: z.string().min(1).optional(),
  recipeId: z.string().min(1),
  portions: z.number().int().positive(),
  course: z.string().trim().optional(),
  order: z.number().int().nonnegative().optional(),
  prepStatus: z.enum(["todo", "doing", "done"]).optional(),
  prepDate: isoDate.optional(),
  notes: z.string().trim().max(500).optional(),
}).strict();
export const updateEventLineSchema = eventRecipeLineSchema.omit({ lineId: true, recipeId: true }).partial().strict();
export const reorderEventLinesSchema = z.object({ lineIds: z.array(z.string().min(1)).min(1) }).strict();
export const closeEventSchema = z.object({ hoursSpent: z.number().nonnegative().optional(), km: z.number().nonnegative().optional() }).strict();
```

`date` on events becomes `isoDate`. `updateEventRequestSchema` gains `expectedUpdatedAt?: string`; `DdbService.update` gets an optional `{ expectedUpdatedAt }` that appends `AND #updatedAt = :expected` and a Nest filter maps `ConditionalCheckFailedException` to 409.

## Migration notes

- Line fields, event fields, recipe.defaultCourse, settings keys, grocery list fields, extra cost kind: no migration. `EventsService.create/update` fill `lineId` lazily: `recipes.map(l => ({ ...l, lineId: l.lineId ?? randomUUID() }))`. The line endpoints match on `lineId` and fall back to array index only in the first release (`PATCH .../lines/idx:3`) so an event never edited since the deploy is still addressable from the phone.
- Optional one-off script `apps/backend/scripts/backfill-line-ids.ts` (ts-node, boots ConfigService + DdbService, `--dry-run`, scanAll events, `ddb.update` per event missing any lineId). Idempotent.
- Cost snapshot for already-completed events: `apps/backend/scripts/snapshot-completed-events.ts` writes `costSnapshot` at today's prices with `takenAt` and logs that it is an approximation. Reports read `actualCost ?? costSnapshot?.rawMaterial ?? liveCalc`.
- Clients backfill (optional): `apps/backend/scripts/seed-clients.ts` groups events by `contactEmail || contactName`, creates clients, sets `clientId`. Readers show `client?.name ?? contactName` so it can run later or never.
- New tables: declare `CLIENTS_TABLE`, `EVENT_TEMPLATES_TABLE`, `LEDGER_TABLE` as `.optional()` in `config.service.ts` for the rollout release and throw a 503 at first use when missing, so the EC2 API keeps booting before the SSM parameter and `.env` line exist. Update `infrastructure/lib/data-stack.ts` so CDK matches reality. Follow the four README steps per table.
- `DdbService.batchWrite` and `batchDelete` loop on `UnprocessedItems` with backoff before any merge or script relies on them.
- Costing maths (`calcIngredientLineCost`, `calcRecipeCost`, `calcEventCost`, `scaleQty`, `sortEventLines`) move to `packages/types/src/lib/` so the backend snapshot and the frontend views agree; `apps/frontend/src/lib/recipe-helpers.ts` re-exports them. Delete `packages/utils` and the dead `TABLE_NAMES` export.

## Feature solutions

### planning

## Week, day, prep sheet

Three screens, all projections of events, no new entity:

- **Week** `/week/:isoWeek` (home). `apps/frontend/src/pages/admin/Week.tsx`, new. Loads `api.events.list()`, `api.recipes.list()`, `api.settings.get()`, optionally `api.clients.list()`. Filters events whose date or any line's `prepDate` falls in the ISO week (helpers `isoWeekRange(isoWeek)` and `isoWeekOf(date)` in `apps/frontend/src/lib/dates.ts`, replacing `startOfWeekMonday` in Events.tsx). Groups by day, sorts each event's lines with `sortEventLines`. Revenue header: Σ `sellingPricePerGuest × guestCount` for the week; month figure Σ for the calendar month of the week's Thursday versus `objectives[year].monthlyOverrides[ym] ?? annualRevenue / monthsActive`; once the ledger exists a second tick shows Σ ledger HTVA for the month.
- **Day** `/day/:date`. `Day.tsx`, new. Collects `{ event, line }` pairs where `(line.prepDate ?? event.date) === date`. Three groupings: by event, by course (`settings.courses` order), by recipe (merge by `recipeId`, Σ portions, breakdown per event).
- **Prep sheet** `/events/:eventId/lines/:lineId`. `PrepSheet.tsx`, new. Renders `RecipeReader` (shared with `/recipes/:id`) with `ratio = line.portions / recipe.portions` applied to every ingredient quantity via `scaleQty`. Status segmented control, note, "Cuisiner".

## Status tracking

`prepStatus` on the line: `todo` (default) → `doing` → `done`. Written only through `PATCH /admin/events/:id/lines/:lineId` (new in `events.controller.ts`; `EventsService.updateLine(eventId, lineId, patch)` loads the event, replaces the one line, `ddb.update` with the new array and `updatedAt`). Never through the whole-array PATCH, so an open EventEditor tab cannot undo a status set from the phone. Cook mode's last screen and the prep sheet's "Fait" both call it. The week header's "18 / 40 lignes faites" and each event card's progress bar count `done` over all lines of the week. Status resets are manual (tap again); nothing auto-resets.

## Reading a recipe from a prep sheet

The prep sheet is the reading screen. Title is the recipe name, the summary line says "30 portions pour Hoona", and every quantity is already scaled. A stepper lets her rescale for a batch ("je fais 36 pour avoir de la marge") without touching the line unless she taps "Enregistrer". "Cuisiner" opens `RecipeCook` with `?portions=30&event=&line=` (change in `RecipeCook.tsx`: `useSearchParams`, `setCookPortions(Number(portions) || r.portions)`). The old path (Événements → event → recipe → Mode recette → 20 taps) becomes two taps from the day view.

## Grocery list from a date range

The week header has "Courses de la semaine", each day column "Courses du jour", both linking to `/grocery-list/new?from=&to=`. Generation runs `buildGroceryItems` (the body of `generateGroceryList` in Events.tsx, moved to `apps/frontend/src/lib/grocery.ts`) over lines in range, optionally skipping `done` lines, and creates the list through `api.groceryLists.create({ title, items, eventIds, range, excludeDone })`. The localStorage hand-off (`recipe-book:grocery-list-pending`) and the multi-select checkbox column in `Events.tsx` are deleted. GroceryListPage shows a "Régénérer" banner when any event in `eventIds` has `updatedAt` newer than the list.

## Killing the PDF

`generateAggregatedPdf`, `WeekPlannerModal`, `startOfWeekMonday`, `endOfWeekSunday` in `Events.tsx` and `exportRecipesPdf` in `EventDetail.tsx` are deleted, along with the jspdf imports there. Paper = `window.print()` on the day view with a print stylesheet in `index.css` (`@media print`: hide nav, 12pt body, `break-before: page` per group, expand collapsed lines, in "Par recette" mode print the scaled ingredient table under each recipe). The single-recipe PDF in `RecipeDetail.tsx` stays for sharing a recipe, bumped to 11pt body.

## Six events, forty lines, still readable

- Laptop week: event cards 72px, line rows 36px, five lines visible per card then "+ n lignes", column scroll beyond `100dvh − 220px`, header fixed. The "Événements" density toggle collapses every card to its progress bar so the week fits one screen. Lines use one colour signal only (the status dot); course and client are text, not colour.
- Phone week: only today expanded; other days are one row with counts. Forty lines never render at once.
- Day view: groups with sticky headings, done lines dimmed and sorted last, "Masquer les lignes faites" to shrink the list as the day goes on. "Par recette" merges duplicates, so a day with 20 lines over three events typically shows 12 recipes.
- Client filter chips cut the week to one client when the question is "what does Hoona get this week".
- Type: lines at text-sm in the week grid is the only place below 16px on a reading screen; day and prep sheet are text-base and text-lg.

Files: new `Week.tsx`, `Day.tsx`, `PrepSheet.tsx`, `lib/dates.ts`, `lib/grocery.ts`, `components/ui/StatusControl.tsx`, `components/ui/LineRow.tsx`; changed `App.tsx` (routes, `/` redirect), `AdminSidebar.tsx`, `Events.tsx`, `EventDetail.tsx`, `RecipeCook.tsx`, `events.controller.ts`, `events.service.ts`, `dto/events.ts`, `api.ts` (`events.updateLine`, `events.reorderLines`, invalidate `events`).

### readability

## Design system, applied to the prep sheet first

Tokens in `apps/frontend/src/index.css` and `tailwind.config.ts`:

- `html { font-size: 16px }`, `body { @apply text-base leading-relaxed }`. Scale: `text-sm` 14px for metadata and table numerics only; `text-base` 16px for everything read; `text-lg` 18px for ingredient lines and steps; `text-xl` 20px section headings (DM Sans semibold); `text-2xl`/`text-3xl` page and recipe titles in Playfair. Delete every `text-[10px]` and `text-[11px]`; `text-xs` allowed only inside tags.
- Colour: `--muted-foreground: 20 10% 38%` (about 5.9:1 on background), `--primary: 25 55% 45%` (4.6:1 with white), new `--success`, `--warning`, `--info` with `-foreground` and `-muted` pairs in warm hues checked at 4.5:1 on card. Replace `text-green-600`, `bg-blue-100`, amber and the hard-coded chart hex with these tokens. Supplier colour stored on `settings.suppliers[].color` with an 8-colour accessible fallback by name hash; rendered as a tag with dark text on a tint, never coloured text.
- Spacing: 8/16/24/40/64. Reading column `max-w-[720px]`. List rows `min-h-12 py-3`. Blocks separated by 40px with headings and whitespace, no card borders; `card-elevated` kept for stat tiles only.
- Sentence case everywhere; remove `uppercase tracking-wider`. Remove the global `h1..h6 { font-serif }` rule and apply `font-serif` explicitly at 24px and above.
- `.input-field` at text-base `py-2.5`, `bg-card`, 1.5px focus border, so iOS stops zooming.
- Min 44px hit area on every control on the week, day, prep sheet, cook and grocery screens. Hover-only actions get `[@media(hover:none)]:opacity-100`; destructive actions move into edit modes.

Components in `apps/frontend/src/components/ui/`: `PageHeader` (breadcrumb, Playfair title, actions), `Tag` (variant: neutral | success | warning | info | supplier), `StatusTag` (À venir / Terminé / Facturé / Payé), `StatusControl` (three-segment prep status, 44px), `LineRow` (name, secondary line, right value, chevron), `Stepper` (44px ± with a value), `SectionToggle` (Notion-style collapsible), `FieldLabel` (shared, sentence case), `RecipeReader` (photo, title, meta, ingredient list with ratio, steps).

Order of application: 1) `RecipeReader` used by the prep sheet and `/recipes/:id`; 2) `RecipeCook` (two-column on tablet, drawer on phone, 44px buttons, `select-none` removed, left-aligned steps); 3) week, day and the new list rows for events, recipes, grocery; 4) `RecipeDetail.tsx` loses inline editing and keeps the cost table inside a `SectionToggle`; 5) forms (`EventEditor`, `RecipeEditor`, `IngredientFormModal`, `LoginPage`) with the shared `FieldLabel`; 6) sidebar goes light, bottom tab bar on phone; 7) tables remain only in Ingrédients, Coût & prix, and the Comptes pages, with card fallbacks under `md`.

Fix the layout bugs on the way: `h-22` in RecipeDetail.tsx (invalid, use `h-24`), the grocery `-m-6` full-bleed hack (give `AdminLayout` a `fullBleed` outlet context), the `events.sort` state mutation in Dashboard.tsx (file deleted anyway).

### ingredientMerge

## Finding duplicates

`GET /admin/ingredients/duplicates` in `ingredients.controller.ts`, service method `findDuplicates()`:

1. Normalise each name with `normalizeIngredientName` in `packages/types/src/lib/normalize.ts`: NFD, strip combining marks, `œ→oe`, `æ→ae`, lowercase, trim; remove any parenthesised segment `\s*\(.*?\)`; remove unit tokens matching `^(kg|g|gr|l|ml|cl|pc|pcs|piece|pieces|botte|bottes|x\d+|\d+[a-z]*)$`; collapse whitespace and punctuation to single spaces; strip a trailing `s` or `x` from tokens longer than three letters (`oeufs→oeuf`, `tomates→tomate`, `choux→chou`); drop stop tokens `de`, `du`, `des`, `la`, `le`, `les`, `d`. Result for "Oeufs (pièce)", "Œuf", "oeuf", "OEUF x12" is `oeuf`.
2. Group by exact normalised key. That catches the four egg variants.
3. Second pass on keys of five characters or more: pair keys whose Levenshtein distance is ≤ 1, or whose token sets overlap on every token of the shorter name (so "tomate cerise" joins "tomates cerises" but not "tomate"). These groups carry reason `proche` and are never merged automatically.
4. Drop groups whose key is in `settings.ignoredDuplicateGroups`.
5. For every ingredient in a group, count references: scan recipes once, build `Map<ingredientId, recipeIds[]>`; scan grocery lists once, same. Return `{ key, reason, ingredients: [{ ingredient, recipeCount, listCount, recipeNames }] }[]`.

No model needed; string normalisation is enough at a few hundred ingredients.

## Choosing the survivor

Default pre-selection: most recipe references; tie → most recently `updatedAt`; tie → the one whose name has no parentheses. Dalia can change the radio. Rows whose price unit family differs from the survivor's (`PRICE_TO_QTY_UNIT[ing.unit]` ≠ survivor's) are flagged and the merge is blocked for the group until she picks a survivor of the same family or unticks the row, because a recipe line in `g` cannot silently become `pièce`.

## Merging

`POST /admin/ingredients/merge` body `{ survivorId: string, mergedIds: string[] }` (`.strict()`, min 1). Service `merge()`:

0. Load survivor and merged rows; 404 if the survivor is missing; skip merged ids that no longer exist (makes retries safe). Check unit families; 409 with the offending names otherwise.
1. **Tombstone**: `ddb.update` each merged ingredient with `mergedInto: survivorId`. From this moment every reader resolves the id: `resolveIngredient(id, byId)` follows `mergedInto` up to three hops. The shared lookup lives in `packages/types/src/lib/ingredients.ts` and replaces the `ingredients.find(...)` calls in recipe-helpers, RecipeDetail, RecipeCook, EventDetail, Events, GroceryListPage, RecipeEditor. So a crash after step 1 leaves the app fully working.
2. **Recipes**: scanAll recipes; for each recipe with a line in `mergedIds`, rewrite `ingredientId` to `survivorId`; if the recipe now has two lines with the same `ingredientId` and the same `unit`, collapse them by summing `qty` and keeping the max `lossPct`; `ddb.update(recipes, { recipeId }, { ingredients, updatedAt })`. Count updated.
3. **Grocery lists**: scanAll lists; rewrite `items[].ingredientId`, refresh `name`, `supplier`, `pricePerUnit`, `priceUnit` from the survivor, collapse duplicate `(ingredientId, unit)` items by summing `totalQty` and `haveQty`; `ddb.update`. Count updated.
4. **Delete**: `batchDelete` merged ids (with the `UnprocessedItems` loop added to `DdbService`).
5. **Audit**: `ddb.update(survivor, { mergedFrom: [...existing, ...mergedIds], updatedAt })`.

Return `{ recipesUpdated, listsUpdated, removed }`. Steps 2 to 5 are each idempotent (rewriting an already-rewritten line is a no-op, deleting a deleted id is a no-op), so the UI's "Réessayer" resends the same payload. The frontend `api.ingredients.merge` invalidates `["ingredients", "recipes"]`; grocery lists are uncached. Also: `DELETE /admin/ingredients/:id` returns 409 with the referencing recipe names when references exist; the old `deduplicate` endpoint and the "Dédoublonner" confirm modal in `Ingredients.tsx` are removed.

## Partial failure

- Crash between 1 and 4: ids still resolve through `mergedInto`; the duplicates page shows "2 fusions inachevées · Reprendre", which calls `merge` again with `mergedIds = ingredients.filter(i => i.mergedInto === survivorId)`.
- A throttled batch delete: retried by the `UnprocessedItems` loop; if it still fails the tombstones remain and the banner handles it.
- A recipe edited concurrently in another tab between the scan and the update: the per-recipe `ddb.update` writes only the `ingredients` array, so other fields survive; the line-level change in the other tab may be lost, which is acceptable for a one-time admin action and is why the merge page says "Fermez les autres onglets".
- Readers never see a UUID: `resolveIngredient` returns the survivor or `undefined`, and the renderers already handle `undefined` with a dash.

Files: `ingredients.service.ts`, `ingredients.controller.ts`, `dto/ingredients.ts` (`mergeIngredientsSchema`), `packages/types/src/lib/normalize.ts`, `packages/types/src/lib/ingredients.ts`, `ddb.service.ts` (UnprocessedItems), new `pages/admin/IngredientDuplicates.tsx`, `Ingredients.tsx` (link "Doublons" instead of the modal), `api.ts`.

### eventOrdering

## Where the course lives

On the event line: `EventRecipeLine.course?: string`. The recipe carries only a default, `Recipe.defaultCourse?: string`, used when a line is added without a course. Both are optional on read. The same recipe can be an apéritif at one event and an entrée at another, and the prep sheet groups by what the event says. Course values come from `settings.courses` (default `["Apéritif", "Entrée", "Plat", "Dessert", "Autre"]`, editable and reorderable in Paramètres). A line whose course is not in the list sorts under "Autre" without being rewritten. Recipe categories (`recipe.type`, service formats) and prestation types (on the event) are untouched and separate.

## How manual order is stored

`EventRecipeLine.order?: number`, a plain integer sort key inside the course. Readers sort with `sortEventLines(lines, courses, recipesById)`: `(courseIndex(line.course ?? recipe.defaultCourse ?? "Autre"), line.order ?? arrayIndex)`. Reorder is stored by `PUT /admin/events/:id/lines/order` body `{ lineIds: string[] }`: the service rewrites the whole `recipes` array in the given sequence and sets `order = index` on every line, in one `ddb.update`. Moving a line to another course is a `PATCH .../lines/:lineId { course }` followed by the reorder call. Existing events have no `order`, so they keep their array order inside course "Autre" (or the recipe default course) until the first reorder, which writes `order` for all lines at once.

## UI

EventDetail and EventEditor show lines under course headings. Laptop: drag handle per row (HTML5 drag, same pattern as `GroceryListPage.tsx` drag between suppliers), drop within a course reorders, drop on a heading changes the course. Phone: ▲▼ buttons (44px) and a course select in the row's overflow. Optimistic update, then the API call; on error reload the event and toast.

`lineId` is required for this to work: the service fills it lazily on create/update, and the first release accepts `idx:n` as a line id for untouched events. EventEditor's `addRecipe` drops the `recipes.some(r => r.recipeId === recipeId)` guard once lines have ids.

### recurringClient

## Hoona, concretely

Hoona is a company that gets a weekly menu. Setup once:

1. **Client**: in Paramètres or from an existing Hoona event ("Enregistrer le contact comme client"), create client "Hoona" with kind Entreprise, contact, `defaultPrestationType: menu_a_emporter`, `defaultVatRate: 6`, `defaultPricePerGuest: 14`.
2. **Favori**: on the Hoona event that has the right menu, overflow → "Enregistrer comme favori". That copies lines (with courses and portions), guestCount, price, extra costs, notes into an `EventTemplate` named "Hoona · menu semaine" with `clientId`. On the template she ticks `defaultWeekdays` Mon to Fri if Hoona is fed daily, or just Tuesday if it is one delivery.

## Each week

- Open the week view. If Hoona has a template with `defaultWeekdays` and no event for that client exists in the displayed week, the header shows "Créer la semaine Hoona". One tap → `POST /admin/events/from-template/:templateId { date }` once per weekday (sequential, skipping days where a Hoona event already exists), each event named "Hoona · mar. 14 oct", status upcoming, `templateId` and `clientId` set, lines copied with fresh `lineId`s and `prepStatus` reset. A guest-count prompt appears once and applies to every created event; she can edit a single day afterwards.
- Or, for one day: "+" on the day → "Depuis un favori" → pick Hoona → date is the day, guests prompt → one event.
- She then adjusts the day's menu in the event (add, remove, reorder lines) because the week's menu changes; the template is the starting point, not a constraint.

## Seeing Hoona's week or day

- Week view with the client chip "Hoona" selected shows only Hoona's events and lines, with the week revenue for Hoona alone (`/week/2026-W43?client=<id>`).
- Day view, "Par événement" mode, Hoona is one group: "Hoona · 30 conv. · 5 lignes".
- Client page `/clients/:id` lists past and coming weeks with status dots and revenue per event, and the template with its two actions.

## Why a table and not a flagged event

An event with `isTemplate` would leak into week revenue, Au réel and the income statement unless every reader filtered it. A separate `ta-event-templates` table with its own CRUD (`templates.service.ts`, same shape as `events.service.ts`) keeps every existing reader untouched. Templates have no date and no status. The Client table makes the chips, the client page and the ledger's `clientId` possible; `contactName` fields stay on events for old data and the editor copies the client's contact into them on selection so nothing downstream changes.

`Dupliquer` stays for one-off reuse but now asks for a date.

### accounting

## Entities

- `LedgerEntry` in the new `ta-ledger` table (sales and purchase side, see data model). Kinds: `facture`, `acompte`, `comptoir`, `commission`, `bon_cadeau`, `autre` (book sales); `achat_mp` (raw material purchase, receipt), `extra` (extra staff: personName, hours, hourlyRate, htva = hours × rate) (book purchases).
- `FixedCharge[]` and `objectives[year]` in the settings item, effective-dated.
- Event additions: `prestationType`, `vatRate`, `hoursPlanned`, `hoursSpent`, `km`, `clientId`, `costSnapshot`. Extra cost `kind`.

Records (written on purpose, never recomputed): ledger entries, fixed charges with periods, objectives, event `sellingPricePerGuest`, `actualCost`, `extraCosts`, `costSnapshot`. Views (derived on render): everything on the Comptes pages.

## How an event becomes a journal line

"Clôturer" on EventDetail (upcoming events only):

1. `POST /admin/events/:id/close { hoursSpent?, km? }` → `EventsService.close`: loads recipes and ingredients (inject `RecipesService`, `IngredientsService` into `EventsModule`), computes `rawMaterial = actualCost ?? Σ (calcRecipeCost(recipe, ingredients) / recipe.portions) × line.portions` with the shared `calcEventCost` from `packages/types`, `extras = Σ extraCosts.amount`, writes `costSnapshot` and `status: "completed"` in one update. Skips the snapshot if one already exists.
2. The modal then shows the journal line form prefilled: `date = event.date`, `label = event.name` (+ client name), `kind = facture`, `prestationType = event.prestationType`, `htva = round2(sellingPricePerGuest × guestCount)`, `vat = [{ rate: event.vatRate ?? DEFAULT_VAT_BY_TYPE[type], base: htva, amount: round2(htva × rate / 100) }]`, `totalTvac = htva + amount`, `km = event.km`, `eventId`, `clientId`. Dalia overwrites with the Falco invoice figures (number, exact amounts) and ticks paid if already received. `POST /admin/ledger` creates the entry. Cancel at this step leaves the event completed without a journal line; the event detail then shows "Créer la ligne de journal".
3. Deposits: "Acompte" button on an upcoming event creates a `kind: "acompte"` entry with `paid: true`, dated the day the money arrived. The final `facture` line is entered for the balance. Event revenue in reports = Σ htva of its entries when any exist, else price × guests.

Non-event lines (comptoir, commission at rate 0, bon cadeau, achat_mp, extra) are created on the Journal page. Entries get `locked: true` when exported; editing a locked line asks for confirmation. Nothing is ever recomputed from events after creation.

## Raw material cost to the income statement

Per month m: `Coûts MP(m) = Σ ledger achat_mp.htva in m` when at least one purchase line exists in m, else `Σ events completed with date in m of (actualCost ?? costSnapshot.rawMaterial ?? liveCalc) + Σ extraCosts kind matiere`. The cell shows which source was used. This lets Dalia type real purchase totals from supplier invoices when she has them (the workbook's hand-typed 2 401,11) and still get a figure from the recipes when she does not. `liveCalc` only applies to completed events closed before the snapshot script ran.

## Fixed charges, objectives, breakeven

`settings.fixedCharges[]` with `from`/`to` months: `charges fixes(m) = Σ monthlyAmount (or monthlyAmountSolo in the "seule" scenario) where from ≤ m ≤ (to ?? ∞)`. Changing an amount closes the current row and adds a new one, so past months keep their figure. `settings.objectives[year]` holds `annualRevenue`, `monthsActive` (10), `monthlyOverrides`, `byPrestation`, `hoursAvailablePerMonth`, `rawMaterialPct`, `corporateTaxRate` (0.25 default, help text about the 20 % SME rate to confirm with the accountant), `treasuryMonths`, `investments`. One objective per year ends the workbook's four conflicting targets.

## Screens

`/accounts/journal`, `/accounts/overview`, `/accounts/income`, `/accounts/forecast`, `/accounts/signed`, plus Charges fixes and Objectifs sections in `/settings`. Files: `pages/admin/accounts/{Journal,Overview,Income,Forecast,Signed}.tsx`, `components/accounts/LedgerEntryForm.tsx`, `lib/accounting.ts` (`groupByMonth`, `sumMoney`, `fmtEur`, `splitTvac`, `monthlyObjective`, `fixedChargesFor`), backend `ledger/{ledger.controller,ledger.service,ledger.module}.ts`, `dto/ledger.ts`.

## Reports (French labels from the workbook, formulas)

**Journal des recettes** (records, per month): N° | Date | Intitulé | Type | Total TVAC | HTVA | TVA 6 % | TVA 12 % | TVA 21 % | Réglé | Mode | Encaissé le | KM | Description. Footer: Σ TVAC, Σ HTVA, Σ per rate, "Total CA mm/aaaa" = Σ HTVA of sales entries, then Σ HTVA per prestation type (the SUMIF block).

**Aperçu par mois** (view): Mois | CA HTVA N−1 | CA HTVA N = Σ sales htva by `ym` | Δ % = (N − N−1) / N−1, blank when N−1 = 0 | Objectif = `monthlyOverrides[ym] ?? annualRevenue / monthsActive` | Prévision = Σ events dated in m of price × guests | Atteint = CA N ≥ Objectif. Totals. Box: seuil annuel / mensuel (formula below), objectif annuel / mensuel, comparaison par période for N, N−1, N−2. Mix par prestation: Type | CA N−1 | % | CA N | % | Objectif | % | Nb nécessaires = `eventsNeeded ?? Objectif / (CA N / count of lines of that type)`, with a "Sans type" bucket.

**Compte de résultats** (view, 12 months + Total année): Mois | CA HTVA = Σ sales htva | Coûts MP (above) | Marge brute = CA − MP | Charges fixes = Σ active FixedCharge | Personnel extra = Σ `extra` entries htva in m + Σ extraCosts kind personnel | Autres coûts = Σ extraCosts not matière / personnel | Résultat avant impôts = Marge brute − Charges fixes − Personnel − Autres | Marge % = Résultat / CA | Impôts = max(0, Résultat) × corporateTaxRate (annual row: max(0, Σ Résultat) × rate) | Résultat net = Résultat − Impôts. Ratios: MP / CA, Marge brute / CA, Charges fixes / CA. Simulation row: CA = annualRevenue, MP = CA × rawMaterialPct, Charges = Σ FixedCharge × 12, Personnel = extrasBudget, Résultat, Marge %.

**Prévisionnel** (view): charge table Intitulé | Catégorie | Mensuel | Mensuel seule | Annuel, totals. `seuil de rentabilité (CA) = (Σ charges fixes annuelles + 12 × treasurySavingPerMonth + Σ investments) / (1 − rawMaterialPct)`; `seuil mensuel = seuil / monthsActive`; `bénéfice avant impôts prévu = annualRevenue × (1 − rawMaterialPct) − Σ charges annuelles − extrasBudget`; `ISoc prévu = max(0, bénéfice) × corporateTaxRate`; `marge nette prévue % = (bénéfice − ISoc) / annualRevenue`; `besoin de trésorerie = Σ charges mensuelles × treasuryMonths`. The workbook's "hors MP" seuil is shown beside it for one year.

**Au réel** (view, per month): Client / événement | Type | CA HTVA (Σ event's entries, else price × guests) | Heures = hoursSpent ?? hoursPlanned | Observations = notes. Footer: Σ CA signé, Σ heures, Objectif mensuel, Heures disponibles, Reste à signer = Objectif − Σ, Heures restantes = disponibles − Σ. Year total and écart to annualRevenue.

**Extras** (view inside Journal, filter kind extra): per person and period: dates, Σ heures, taux, montant = Σ heures × taux, replacing sheet "factures".

## Export

"Exporter" on the Journal page, client-side with the `xlsx` package already used in `Recipes.tsx`: file "Livre des recettes 2026.xlsx", one sheet per month named "Janvier" to "Décembre" plus "recettes 2026", headers in the workbook's exact wording and order (NUMERO OPERATION, DATE FACTURE/OPERATION, INTITULE, Total tvac, RECETTE htva, TVA 6%, TVA 12%, TVA 21%, réglé, mode paiement, date encaissement, Type, Description, KM), dates as Excel date cells, a TOTAL row and per-type totals written as values, a "Compte de résultats" sheet. CSV variant with ";" and decimal comma. Export is read-only over records; it sets `locked` after confirm.

## Money

Ledger amounts validated to two decimals (`multipleOf(0.01)`), sums in cents (`sumMoney`), `fmtEur` with `Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR" })` on every accounting screen. Month grouping by `date.slice(0, 7)`, never `new Date().getMonth()`.

## What the Dashboard becomes

Deleted. `/` is the week. The week header carries the money strip: Signé cette semaine, Mois (signed and, once the ledger exists, invoiced HTVA) versus objective, and after phase 4 an "À encaisser" count linking to the journal's Non réglés filter. The monthly chart moves to Aperçu par mois reading ledger HTVA. `estimateBelgianTax`, the tax toggle and the override input are removed; the net figure is the Compte de résultats' Résultat net with corporate tax from the objective.

### ai

Not now for the core. Duplicate detection is string normalisation, planning needs no model, and accounting must stay deterministic.

One optional, phase-6 feature if Dalia provides an OpenAI key: **recipe import from text or photo**. Input: a pasted recipe text or a photo of a handwritten/printed recipe, from a "Importer avec l'IA" button on `/recipes`. Output: a draft `CreateRecipeRequest` (name, portions, steps, ingredient lines with qty and unit, each line matched to an existing ingredient by `normalizeIngredientName` or flagged "nouveau") opened in `RecipeEditor` for review; nothing is saved until she taps Enregistrer. Backend: `POST /admin/ai/parse-recipe` (multipart or JSON), key read from SSM `/la-table-amelie/{stage}/OPENAI_API_KEY`, `settings.openAiKeySet` tells the UI whether to show the button. Cost is a few cents per import. If no key, the button is hidden and nothing else changes.

Not proposed: AI for duplicates, pricing, planning suggestions, or anything that writes to the ledger.

## Roadmap

### Phase 0 · Fondations lisibles (1 semaine)

Tokens and scale in index.css and tailwind.config.ts; shared components (PageHeader, Tag, StatusTag, LineRow, Stepper, SectionToggle, FieldLabel, RecipeReader); move calcIngredientLineCost, calcRecipeCost, scaleQty into packages/types/src/lib and re-export from recipe-helpers.ts; RecipeCook two-column/drawer layout with 44px targets and ?portions support; /recipes/:id becomes RecipeReader + collapsed Coût & prix; delete packages/utils and TABLE_NAMES. Fix h-22 and the grocery full-bleed.

**Migration:** None. pnpm build:types after moving the maths.

**Rationale:** The prep sheet reuses RecipeReader, so the reading screen must exist first. Ships value on the readability complaint in week one.

### Phase 1 · La semaine (2 semaines)

Line fields (lineId, course, order, prepStatus, prepDate, notes) and strict DTOs; EventsService lazy lineId; PATCH /admin/events/:id/lines/:lineId and PUT .../lines/order; settings.courses; Week.tsx, Day.tsx, PrepSheet.tsx, lib/dates.ts, StatusControl; / redirects to the week; sidebar reorder and light surface, bottom tab bar; EventDetail and EventEditor course-grouped lines with reorder; grocery from date range (lib/grocery.ts, eventIds on lists, Régénérer banner); delete WeekPlannerModal, generateAggregatedPdf, exportRecipesPdf, the events multi-select, the localStorage hand-off; print stylesheet for the day view; events list ascending for À venir.

**Migration:** No migration required: readers default missing fields, lineId filled lazily, idx:n fallback for untouched events. Optional backfill-line-ids.ts with --dry-run.

**Rationale:** Answers requests 2 and 3 (week, day, prep sheet, ordering) and removes the PDF. Everything is frontend plus optional fields.

### Phase 2 · Doublons (1 semaine)

normalizeIngredientName and resolveIngredient in packages/types; GET /admin/ingredients/duplicates; POST /admin/ingredients/merge with tombstone, remap recipes and lists, delete, audit; UnprocessedItems loop in DdbService; DELETE ingredient returns 409 when referenced; IngredientDuplicates.tsx; remove the deduplicate endpoint and modal; api.ingredients.merge invalidates ingredients and recipes.

**Migration:** None. Run the duplicates page once on live data with Dalia; the tombstone makes a failed merge recoverable.

**Rationale:** Request 1. Must land before heavy grocery use so lists stop showing oeuf/oeufs twice.

### Phase 3 · Clients et favoris (2 semaines)

ta-clients and ta-event-templates tables, services and controllers; Client picker in EventEditor; clientId on events; EventTemplate from an event; POST /admin/events/from-template/:id; Créer la semaine; client chips on the week; /clients and /clients/:id; Dupliquer asks for a date.

**Migration:** Two new tables via the README's four steps; env vars optional in config.service.ts for the rollout release; data-stack.ts updated. Optional seed-clients.ts groups events by contactEmail || contactName (--dry-run first). Old events keep working through contactName.

**Rationale:** The Hoona request. Needs tables, so it comes after the no-migration phases.

### Phase 4 · Journal et clôture (3 semaines)

Shared taxonomies (VAT_RATES, PRESTATION_TYPES, DEFAULT_VAT_BY_TYPE); prestationType, vatRate, hoursPlanned, hoursSpent, km, costSnapshot on events; extraCosts.kind; POST /admin/events/:id/close with server-side snapshot (EventsModule imports RecipesService and IngredientsService); ta-ledger table, ledger module, dto/ledger.ts; Clôturer modal and Acompte on EventDetail; derived Facturé/Payé badges; /accounts/journal with entry form, filters, xlsx and CSV export, locking; /accounts/overview with the chart moved from Dashboard; delete Dashboard.tsx and estimateBelgianTax; week header shows invoiced HTVA and À encaisser.

**Migration:** One new table (ta-ledger). snapshot-completed-events.ts writes approximate costSnapshot for already-completed events (logged as approximation, --dry-run). Prestation type backfill is manual: the Journal and Aperçu show a Sans type bucket until events are tagged. Historical journal lines from the 2025 workbook can be imported by a one-off CSV import on the Journal page (same 14 columns) if Dalia wants year-over-year figures in 2026.

**Rationale:** Gives the accountant the export first. The journal is the record everything else reads.

### Phase 5 · Compte de résultats et prévisionnel (2 semaines)

settings.fixedCharges and settings.objectives with their Paramètres sections; /accounts/income, /accounts/forecast, /accounts/signed; extra staff and achat_mp entries on the Journal with the per-person Extras view; Compte de résultats sheet in the export; supplier colour in settings.

**Migration:** None (settings keys optional). Dalia types the ~30 fixed charges and the 2026 objective once; the Prévisionnel shows the workbook's hors-MP seuil beside the new one for the first year.

**Rationale:** Completes the workbook replacement once the journal has a few months of data to show.

### Phase 6 · Optionnel

AI recipe import behind an OpenAI key; drag lines to another day on the laptop week to set prepDate; client-facing menu proposal PDF from an event; persistent stock per ingredient for grocery lists.

**Migration:** None.

**Rationale:** Only after the six core phases are in daily use.

## Risks

- **Whole-array overwrites**: `EventEditor` still PATCHes the full `recipes` array on autosave. Phase 1 restricts the editor to sending `recipes` only when a line is added or removed, and adds `expectedUpdatedAt` with a 409. If that slips, a laptop editor left open can undo a status set from the phone. Mitigation: the line endpoints and the editor change ship in the same release; test the two-device case.
- **Lazy lineId and the idx fallback**: events never touched after the deploy have no `lineId`. The `idx:n` fallback works until a line is added or removed from another device at the same moment. Running `backfill-line-ids.ts` right after the deploy removes the window.
- **Cost snapshot approximation**: events completed before phase 4 get a snapshot at today's prices. The income statement for 2025 months will therefore be approximate; the report marks snapshots with `takenAt` after the event date. Prefer importing the 2025 workbook's MP totals as `achat_mp` lines for those months.
- **VAT defaults**: the atelier rate (21 %) and the corporate tax rate (25 % vs 20 % SME) are not verified with the accountant. Both are editable in settings; the UI says so.
- **Week revenue is signed, not invoiced**: before phase 4 the week header shows price × guests only. Label it "Signé" to avoid reading it as turnover.
- **Three new tables on a hand-provisioned stack**: each costs the README's four manual steps and the API will throw 503 on the new endpoints until the env var exists. Keeping the env vars optional avoids a boot failure but means a half-configured deploy shows errors on the new pages only.
- **Merge on a concurrently edited recipe**: the merge writes the `ingredients` array of each affected recipe; an edit to that array from another tab in the same seconds is lost. Acceptable for a one-time admin action; the page asks to close other tabs.
- **Print as the paper fallback**: `window.print()` on iOS Safari works but page breaks inside long groups are less controllable than jsPDF. If Dalia prints daily, the single-recipe PDF remains, and a server-free "print day as PDF" can be added later from the same DOM.
- **Scope for one developer**: eleven weeks across six phases. Phases 0 to 2 (four weeks) deliver the three verbatim requests and the readability fix; accounting is a second block of five weeks. If time runs out, stop after phase 4 with the journal and export; the income statement can wait a quarter.
- **I did not check**: the mobile Safari behaviour of `100dvh` inside the week grid, nor the exact supplier list in live settings, nor whether Hoona is fed daily or once a week (the template supports both).
