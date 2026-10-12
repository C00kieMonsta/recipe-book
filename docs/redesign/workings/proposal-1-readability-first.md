# Proposal 1: La Table d'Amélie as a document: a Notion-style reading system applied page by page

Angle: Reading experience first. Define one design system (type scale, spacing, colour roles, seven primitives) in index.css, tailwind.config.ts and components/ds, then rebuild every screen as a one-column document made only of those primitives: recipe, cook mode, week, day prep sheet, event, clients, ingredient merge, and the accounting reports that replace the workbook.

## Vision

The caterer's three complaints (font size, colours, layout) and her reference (Notion) point at the same thing: the app is a back-office of tables, and she uses it as a kitchen reading tool. The proposal starts with a design system and nothing else. Body text becomes 16px at 1.6 line height, recipe steps and prep lines 18px, page titles 32 to 40px Playfair, and nothing in the admin app renders below 13px. Boxes disappear: a page is a single 704px column of headings, whitespace, lists and numbered blocks, the way a Notion page reads. Tables survive only where numbers must line up (ingredient costs, the journal, the income statement) and they become a DataTable that collapses to cards on a phone. Editing stays inline, but it is revealed on hover on a laptop and always visible at reduced opacity on touch, so the reading surface is calm and wet hands still work.

Seven primitives carry every screen: PageTitle, Section, Block, Chip, InlineField, Toggle (a Notion disclosure block) and DataTable, plus a ListRow and a Stepper. Once they exist, each page is migrated in isolation, oldest pain first: the recipe page becomes a document with a photo, meta chips, a scannable ingredient list with a portion stepper, numbered step blocks, and pricing collapsed behind a Toggle. Cook mode keeps ingredients visible beside the steps. The home page becomes "Cette semaine": seven day sections, each event a row, each recipe line a tappable prep line that opens cook mode at the right portions and can be ticked "fait". This replaces the 30-page aggregated PDF with the same data on screen.

The same primitives build the accounting section. The journal is a DataTable with the workbook's 14 columns, an event becomes a journal line through one "Clôturer" action, fixed charges and objectives live in settings with validity dates, and the income statement, overview, mix, breakeven and "au réel" pages are views over those records. The finance dashboard and its sole-trader tax toggle go away; the chart moves to "Aperçu par mois" where it compares invoiced HTVA with last year and the objective.

This angle wins because it fixes the complaint she voices most (she cannot read a recipe on the site) in the first two weeks with no schema change, and because every later feature (planning, merge, courses, clients, accounting) is then built once, in a consistent visual language, instead of adding more tables to an app she already finds hard to read. The stack does not change: React, Tailwind, NestJS, DynamoDB, optional fields on existing rows, three new tables.

## Navigation

## Home

`/` is **Cette semaine** (route alias `/semaine/:isoWeek`). It answers "what do I cook this week and for whom" and carries a thin money strip. The finance dashboard is removed; its chart moves to Comptes › Aperçu.

## Sidebar (laptop), light surface, text-base, icon 20px, emoji anchor per section

| Order | Label | Route | Icon |
|---|---|---|---|
| 1 | Cette semaine | `/` | 📅 |
| 2 | Recettes | `/recipes` | 📖 |
| 3 | Événements | `/events` | 🗓 |
| 4 | Clients | `/clients` | 👥 |
| 5 | Ingrédients | `/ingredients` | 🧾 |
| 6 | Courses | `/grocery-list` | 🛒 |
| 7 | Comptes | `/comptes/journal` | 💶 |
| 8 | Paramètres | `/settings` | ⚙️ |

Comptes has in-page tabs rendered as Chips: Journal · Aperçu · Résultats · Prévisionnel · Au réel. Active item: `bg-primary-soft` with a 3px `border-l-primary` bar. The version string leaves the sidebar and goes to Paramètres. Collapse behaviour is kept.

## Phone

A bottom tab bar replaces the drawer for the four daily items: Semaine, Recettes, Événements, Courses, plus "Plus" which opens a sheet with Clients, Ingrédients, Comptes, Paramètres, Déconnexion. The top bar (52px, light) shows the breadcrumb and the page title instead of the logo. Cook mode hides both bars.

## Breadcrumb

Every detail page renders `Breadcrumb` above the title: "Recettes / Tarte au citron", "Semaine du 13 oct / Mardi 14", "Événements / Hoona mardi", "Comptes / Journal / Octobre 2026". `navigate(-1)` "Retour" buttons are removed; the breadcrumb link is the way back.

## Removed or merged

- "Tableau de bord" (Dashboard.tsx): deleted. KPI strip moves to Cette semaine; chart moves to Comptes › Aperçu; `estimateBelgianTax`, the tax toggle and the override input are deleted.
- "Planning semaine" modal and "Télécharger PDF agrégé" in Events.tsx: deleted. The week is a page. "Imprimer" on the Jour page produces an 11pt PDF from the same grouped structure for one transition phase.
- Clickable status pill in lists: removed. Status changes on the event page.
- Row-level trash icons in Events and Ingredients lists: removed. Delete lives on the detail page or the edit modal.
- Hamburger drawer: replaced by the bottom tab bar.

## Screens

### Cette semaine (home) (/ and /semaine/:isoWeek (for example /semaine/2026-W42))

Plan the week: see every event per day with its recipe lines, portions and client, the signed revenue per day and week, and jump to a day's prep sheet or straight into cook mode. Replaces the Dashboard home and the WeekPlannerModal in Events.tsx.

**Layout**

**Laptop.** One column `max-w-wide` (1152px). `PageTitle` eyebrow "Semaine 42", title "Du 13 au 19 octobre" with ‹ › and "Aujourd'hui" buttons, actions "Favoris" (create events from templates) and "Nouvel événement". Below, a sticky day strip: seven cells "Lun 13 · 2 évén. · 1 240 €" that scroll to the day. Then a money strip of four tiles (`card-elevated`, the only boxes on the page): "Signé cette semaine" (Σ sellingPricePerGuest × guestCount of the week), "CA du mois" (Σ ledger HTVA month to date, with a progress bar to the monthly objective), "À encaisser" (count and Σ TVAC of unpaid ledger lines), "Marge brute du mois %". Then seven `Section`s titled "Lundi 13 octobre" with meta "85 convives · 1 240 € HTVA". Each event is a `ListRow`: leading anchor (client initial in a tinted circle or 📅), title "Hoona · Lunch du mardi", subtitle "30 convives · Buffet à emporter · 6 recettes", trailing status `Chip`. Under each event, its lines are rendered open: "30 × Mini quiches" at text-lead with a course `Chip` and a 28px check (44px tap area). Days without events show one muted line "Rien de prévu".

**Phone.** Same order, one column. Day strip scrolls horizontally. Money tiles scroll horizontally, two per screen. Event lines are collapsed under a `Toggle` per event ("6 recettes") to keep the week glanceable; the day heading is sticky.

**Interactions**

- ‹ › change the ISO week; the URL updates so a week can be bookmarked. Keyboard ← → on laptop.
- Day heading click opens `/jour/:date`.
- Event row click opens `/events/:id`. Line click opens `/jour/:date` scrolled to that line; a "Cuisiner" button on the line (hover-revealed on pointer, always visible on touch) opens `/recipes/:recipeId/cook?portions=30&event=:eventId&line=:lineId`.
- Check on a line calls `PATCH /admin/events/:id/lines/:lineId { prepStatus: "fait" }`, optimistic, strike-through.
- Filter chips above the days: "Tous", one chip per client with events this week ("Hoona"), "À préparer" (hides fait lines).
- "Favoris" opens a dialog listing EventTemplates with a weekday checkbox row; confirms with one POST per date (see recurringClient).
- ⋯ menu: "Imprimer la semaine" (PDF, 11pt, same grouping), "Liste de courses de la semaine" (reuses generateGroceryList with the week's events).

### Fiche du jour (prep sheet) (/jour/:date (YYYY-MM-DD))

The per-day preparation sheet that replaces the aggregated PDF: every recipe line to prepare that day, grouped by event and course or by recipe with the per-client breakdown, with a done state and a direct way into cook mode.

**Layout**

**Laptop.** `max-w-doc` column. `Breadcrumb` "Semaine du 13 oct / Mardi 14". `PageTitle` "Mardi 14 octobre" with ‹ › day arrows, meta chips "3 événements · 85 convives · 1 240 € HTVA". A `Switch` "Par événement / Par recette" (default Par événement). Par événement: one `Section` per event ("Hoona · 30 convives", client chip, prestation chip), inside it course headings (🥂 Apéritif, 🥗 Entrée, 🍽 Plat, 🍰 Dessert, Autre) in settings.courses order, each line a `ListRow` at text-lead: 28px checkbox, "30 × Mini quiches", optional note in muted text, trailing "Cuisiner" button. Lines with a `prepDate` earlier than the event date carry a chip "pour samedi 18". Par recette: one `Section` per recipe ("Mini quiches · 80 portions") with breakdown chips "Hoona 30 · Mariage Dupont 50", a `Toggle` "Ingrédients pour 80" showing the scaled ingredient list, one checkbox per contributing event line, and a "Cuisiner 80" button.

**Phone.** Same column. Day title sticky. Checkbox left (44px), text in the middle, "Cuisiner" as a 44px icon button on the right. Done lines sink to the bottom of their course group with strike-through.

**Interactions**

- Checkbox toggles prepStatus a_faire ↔ fait via the line endpoint; the row animates to the bottom.
- Text tap opens the recipe document `/recipes/:id`.
- "Cuisiner" opens cook mode with `portions`, `event` and `line` query params; finishing cook mode marks the line fait and returns here.
- Note icon (hover/touch reveal) opens an `InlineField` textarea for `line.notes`.
- "Imprimer" in ⋯ renders this exact structure to PDF at 11pt body, 13pt lines, 16pt headings, one event per page.
- Lines are selected with `(line.prepDate ?? event.date) === :date`, sorted by course index then `order ?? index`.

### Recette (document) (/recipes/:id)

Read a recipe comfortably on a phone, tablet or laptop; scale it; see cost and pricing only on demand. The worst-case page of the readability audit, rebuilt first.

**Layout**

**Laptop.** `max-w-doc` (704px) single column, no cards. `Breadcrumb` "Recettes / Tarte au citron". Photo full-width `aspect-[3/2] rounded-xl` when present (first photo; others behind a `Toggle` "Photos"). `PageTitle` serif 40px with the category emoji anchor. Meta row of `Chip`s: 🍰 Dessert (category, select), Buffet (service format), 10 portions, 150 g/pers, Créé le 12 mars. Description at text-base muted, leading-relaxed. `Section` "Ingrédients" with a `Stepper` (portions, 44px buttons) on the right: a list of 48px rows at text-lead, name left, quantity bold with unit muted right, hairline between rows, supplier shown as a 14px tag only on hover. `Section` "Préparation": `Block` steps, 32px numbered circle, text-lead, left aligned, `space-y-6`, `whitespace-pre-wrap`. Then three collapsed `Toggle`s: "Coût matières · 12,40 € HTVA" (a `DataTable`: Produit | Qté | Perte | Prix/unité | Coût, footer Total matières HTVA, editable qty and perte), "Simulation de prix" (existing PricingSimulation maths rendered in a DataTable Sur place | Take away with `InlineField` numbers), "Photos". A primary button "Cuisiner" sits in the title actions with the ⋯ menu (Modifier, Dupliquer, Exporter PDF, Supprimer).

**Phone.** Identical order. Stepper is sticky under the Ingrédients heading while the list scrolls. "Cuisiner" becomes a sticky bottom button (56px). Toggles stay collapsed.

**Interactions**

- Title, description, portions, poids, category and format are `InlineField`s: plain text with a pencil revealed on hover (pointer) or shown at 60% opacity (touch); click enters an input at the same size with a visible border; Enter or blur saves through `api.recipes.update` as today.
- Stepper scales displayed quantities with `scaleQty` from RecipeCook.tsx; it does not write to the recipe. Reset link "Recette de base (10)" appears when scaled.
- Each step `Block` reveals a ⋯ (Modifier, Monter, Descendre, Supprimer) on hover/touch; editing opens a textarea in place; "+ Étape" is a 44px dashed row at the end of the list.
- Ingredient rows reveal ⋯ (Modifier la quantité, Voir l'ingrédient, Retirer). "+ Ingrédient" opens the existing SearchSelect row inside the list.
- Toggles remember their state per device in localStorage (`ds:toggle:recipe-cost`).
- No text is a click target unless it shows a pencil or a chevron.

### Cuisiner (cook mode) (/recipes/:id/cook?portions=30&event=:eventId&line=:lineId)

Follow a recipe in the kitchen at the portions of an event line, with ingredients visible beside the steps, large type, big targets, and a way to mark the event line done.

**Layout**

**Tablet and laptop (md+).** Full screen, no sidebar. Header 64px: ✕ Quitter (44px), title serif 24px, `Stepper` portions (44px buttons, prefilled from `?portions`), "Étape 3 / 9" text. Body in two columns: left 320px, a sticky ingredient list at text-lead (scaled, each row tappable to tick off); right, the step list where the current step renders at text-cook (28px, left aligned, serif) with a 40px number circle and the other steps at text-lead muted. Footer: two 56px buttons Précédent / Suivant, and on the last step "Terminer" (or "Marquer fait" when opened from an event line).

**Phone.** One column of steps, current step enlarged. A 48px bar "Ingrédients (12)" pinned above the footer opens a bottom sheet with the scaled list. Footer with two 56px buttons and the step counter. No progress dots.

**Interactions**

- Tap a step to make it current; Suivant/Précédent and ← → keys advance; space is not bound (it scrolls).
- Text is selectable (`select-none` removed).
- Portions stepper rescales live; a chip "pour Hoona · mardi 14" shows the event context when present.
- `navigator.wakeLock.request("screen")` on mount when supported, released on unmount.
- "Marquer fait" calls `PATCH /admin/events/:event/lines/:line { prepStatus: "fait" }` and navigates back to `/jour/:date`; plain "Terminer" returns to the recipe.
- Escape exits.

### Recettes (list) (/recipes)

Find a recipe fast by name or category, with an anchor per category so the grid can be scanned.

**Layout**

**Laptop.** `max-w-wide`. `PageTitle` "Recettes" with count as meta, actions "Nouvelle recette" and ⋯ (Exporter Excel, Importer). Search input at text-base and category `Chip`s (each with its emoji). Gallery grid 3 columns of cards (the one place cards stay): photo `aspect-[3/2]` or a 160px tinted block with the category emoji at 48px, name serif 20px, description text-sm muted two lines, meta text-sm "12 ing. · 12,40 € HT · 38 € TVAC".

**Phone.** Full-width `ListRow`s with a 64px thumbnail (or emoji block), name text-base medium, subtitle category · cost. Search sticky under the top bar.

**Interactions**

- Card or row click opens the document. Long press (touch) or hover ⋯ gives Dupliquer and Supprimer.
- Category chips filter; "Tous" resets; the chip set comes from settings.recipeCategories plus values found on recipes, with icons from settings.categoryIcons.
- Import and export modals are unchanged in logic, restyled with `FieldLabel`, text-base inputs and `DataTable` previews.

### Événement (document) (/events/:id)

Everything about one event: the menu in service order grouped by course with reorder, prep state, costing and margin on demand, invoicing fields and the link to the journal.

**Layout**

**Laptop.** `max-w-doc`. `Breadcrumb` "Événements / Mariage Dupont". `PageTitle` name (InlineField) with client anchor. Meta chips: 📅 samedi 18 octobre (date picker on click), 👥 60 convives (InlineField), 🏷 Buffet avec service (prestation select), 👤 Dupont (client select, falls back to contactName), status `Chip` (select: À venir / Terminé). `Section` "Menu": course groups in settings.courses order, each line a `ListRow` at text-lead: drag handle (pointer) or ▲▼ buttons (touch, 44px), "Mini quiches" (link), portions `InlineField` number, course `Chip` (select), note icon, "Cuisiner" button, ⋯ (Retirer). Add row at the bottom with the existing recipe SearchSelect; a secondary action "Trier par catégorie". `Section` "Notes" as a `Block` callout. `Toggle` "Coût & marge" (open on laptop): four tiles Coût HTVA, Revenu HTVA, Marge, Marge %; `DataTable` per line Recette | Portions | Coût unit. | Coût total; extra costs list with kind `Chip` (matière, personnel, location, transport, autre) and amount; "Coût réel recettes" `InlineField`; when completed, a line "Coûts figés le 18/10/2026" from `costSnapshot`. `Toggle` "Facturation": TVA (6/12/21 select), heures prévues/passées, km, the linked journal lines with paid chips, and the button "Clôturer et créer la ligne de journal". `Toggle` "Contact": name, phone, email.

**Phone.** Same column; Coût & marge and Facturation collapsed by default; course groups keep ▲▼ buttons.

**Interactions**

- Reorder: drag on pointer devices (HTML5 DnD, same pattern as GroceryListPage.tsx), ▲▼ on touch; both call `PUT /admin/events/:id/lines/order { lineIds }`. Moving across a course group also sets `course` on the line.
- "Trier par catégorie" sorts by course index then recipe name and persists the order.
- Portions edit calls `PATCH /admin/events/:id/lines/:lineId { portions }`; status, name, date, guests, prestation, vatRate, hours, km patch the event.
- "Clôturer…" opens the journal line form prefilled (see accounting); on save it sets status completed if not already, which triggers the server-side cost snapshot.
- ⋯ menu: Modifier (EventEditor), Dupliquer, Mettre en favori (creates an EventTemplate from this event), Liste de courses, PDF, Supprimer.

### Événements (list) (/events)

Browse and multi-select events for a grocery list; take an order.

**Layout**

**Laptop.** `max-w-wide`. `PageTitle` "Événements", action "Nouvel événement". Search, status chips (À venir, Terminés, Tous), client chips. `ListRow`s: checkbox, anchor, "Mariage Dupont", subtitle "sam. 18 oct · 60 convives · Buffet avec service · 12 recettes", trailing status `Chip` and PV/pers text-sm. Selection bar appears above the list: "3 sélectionnés · Liste de courses · Imprimer".

**Phone.** Same rows without the PV column; selection bar sticks to the bottom.

**Interactions**

- Sort ascending when the filter is À venir, descending otherwise (fixes the Events.tsx:45 order).
- Row click opens the document; checkbox selects; no delete icon in rows.
- "Liste de courses" reuses generateGroceryList and writes `eventIds` on the created list.

### Nouvel événement / Modifier (/events/new and /events/:id/edit)

Take an order: name, date, client, prestation type, guests, price, menu, extra costs. Kept as a form because order intake is a batch of inputs; restyled with the design system.

**Layout**

**Laptop.** `max-w-doc`. `PageTitle` "Nouvel événement" with the autosave status as meta and a "Terminé" action. `Section` "Informations": client SearchSelect (creates a client inline, fills contact and defaults), name, date, prestation type, guests, PV/pers, TVA, status, notes. `Section` "Menu": recipe search, lines grouped by course as in the document, portions inputs. `Section` "Coûts supplémentaires" with kind select. `Section` "Résumé" tiles. A "Depuis un favori" chooser at the top when the page is new.

**Phone.** Single column, inputs at text-base (no iOS zoom), 44px rows.

**Interactions**

- Autosave stays at 800ms but `buildPayload` sends only fields changed since load (a `dirty` set), and `recipes` is sent only when the menu changed in this editor, so a prepStatus ticked on the phone is not overwritten.
- Choosing a client copies defaultPrestationType, defaultVatRate, defaultPricePerGuest into empty fields.
- "Depuis un favori" asks date and guest count, calls `POST /admin/events/from-template/:templateId`, then opens the editor on the created event.

### Clients (/clients and /clients/:id)

A thin client entity so recurring clients (Hoona) have one page with their favourites, their coming weeks and their history, and so journal lines can be grouped by client.

**Layout**

**Laptop.** List: `max-w-doc`, `PageTitle` "Clients", search, `ListRow`s (initial anchor, name, subtitle "Entreprise · Buffet à emporter · 2 favoris · prochain: mar. 14"). Detail: `Breadcrumb`, `PageTitle` name, chips (type, TVA, PV/pers par défaut), `Section` "Favoris" (EventTemplate rows: name, weekday chip, guests, price, actions "Créer cette semaine", "Modifier"), `Section` "À venir" (events of the next 4 weeks as rows grouped by week), `Section` "Historique" (`DataTable` Date | Événement | Convives | HTVA | Facturé chip), `Toggle` "Contact et notes".

**Phone.** Same, one column.

**Interactions**

- "Créer cette semaine" on a favourite opens the weekday picker and posts one event per chosen date.
- "Reconduire la semaine prochaine" in the À venir section clones this client's events of the current week to +7 days from their templates.
- Contact fields are `InlineField`s; old events without clientId still show `contactName`.

### Ingrédients and Doublons (/ingredients and /ingredients/doublons)

Maintain the price list, and merge duplicate ingredients safely with every recipe and grocery list remapped.

**Layout**

**Laptop.** Ingrédients: `max-w-wide`, `PageTitle`, search, supplier chips (coloured dot from supplier.color), `DataTable` Ingrédient | Prix HTVA | Unité | Fournisseur (tag, dark text on tint) | Commentaire | Modifié, 44px rows, no trash column; a banner "12 doublons probables · Fusionner" when `GET /admin/ingredients/duplicates` returns groups. Doublons: `max-w-doc`, `PageTitle` "Doublons d'ingrédients", one `Section` per group ("Oeuf · 4 variantes · 23 recettes") with a confidence chip (Identique, Proche, À vérifier); inside, one row per candidate with a radio "Conserver", name, price/unit, supplier, "dans 12 recettes · 2 listes", updated date; a footer "Fusionner dans Oeufs" button and "Ignorer ce groupe".

**Phone.** DataTable falls back to cards; the Doublons page is already a list.

**Interactions**

- Radio picks the survivor (default: most referenced, then most recent). Candidates whose unit family differs from the survivor are greyed with "Unité différente (€/pièce vs €/kg): modifier d'abord" and cannot be included.
- "Fusionner" calls `POST /admin/ingredients/merge { survivorId, mergedIds }`; the result toast says "23 recettes et 2 listes mises à jour, 3 ingrédients supprimés". On partial failure the group stays with a "Réessayer" button and the error list.
- "Ignorer ce groupe" stores the group key in `settings.ignoredDuplicateGroups` so it is not proposed again.
- Creating an ingredient whose normalised key matches an existing one shows "Semblable à : Oeufs" with a "Utiliser Oeufs" shortcut before creating.

### Courses (grocery list) (/grocery-list and /grocery-list?id=:listId)

Shop from a phone: supplier-grouped list with stock versus need. Logic kept, presentation moved to the design system.

**Layout**

**Laptop.** Two panes: saved lists as `ListRow`s left (280px), the list right in `max-w-doc`. Supplier `Section`s with the supplier tag; each item a 48px `ListRow`: 28px checkbox, name text-base, "à acheter 1,2 kg" bold, stock `InlineField` revealed by a tap, drag handle on pointer. Toolbar actions behind a labelled ⋯ (PDF, CSV, Copier, Masquer cochés). A banner "Les événements liés ont changé · Régénérer" when any `eventIds` event has `updatedAt` newer than the list.

**Phone.** Lists pane becomes a Toggle at the top; items use the same rows at every breakpoint (no desktop table); full-row tap toggles checked.

**Interactions**

- Full-row tap toggles checked; drag between suppliers on pointer; a "Déplacer vers" select on touch.
- Régénérer rebuilds items from the linked events and keeps haveQty and checked by ingredientId.
- Suppliers come from `api.settings.get()` instead of DEFAULT_SUPPLIERS.

### Comptes · Journal des recettes (/comptes/journal?ym=2026-10&book=ventes)

The revenue (and purchase) journal that replaces the twelve monthly sheets: one record per invoice, deposit, counter sale, commission, voucher, and on the purchase side raw-material receipts and extra staff shifts.

**Layout**

**Laptop.** `max-w-wide`. `PageTitle` "Journal" with month ‹ › and a year select; tabs as `Chip`s (Journal, Aperçu, Résultats, Prévisionnel, Au réel). Book switch "Ventes / Achats". Filter chips: Type, Réglé/Non réglé. `DataTable` (text-sm tabular, sticky header, 44px rows) with the workbook columns in order: N° | Date | Intitulé | Type | Total TVAC | HTVA | TVA 6 % | TVA 12 % | TVA 21 % | Réglé | Mode | Encaissé le | KM | Description. Footer: Σ TVAC, Σ HTVA, Σ per rate, then a per-type block "Total CA 10/2026 · Menu à emporter 1 240 € · …". Achats book columns: Date | Intitulé | Type (MP, Personnel, Autre) | Personne | Heures | Taux | HTVA | TVA | TVAC | Événement. Actions: "Nouvelle ligne", "Exporter 2026 (xlsx)", "Exporter CSV".

**Phone.** DataTable falls back to cards: title line "F-2026-031 · Hoona", second line "14 oct · 1 240,00 € TVAC · Réglé ✓"; totals in a sticky footer.

**Interactions**

- "Nouvelle ligne" opens a sheet form: book, kind, date, number, label, client, event (optional), prestation type, TVAC, VAT rate(s) with a `splitTvac` prefill of HTVA and VAT, paid, method, paidAt, description, km (and for personnel: person, hours, rate). Zod refuses lines where HTVA + Σ TVA ≠ TVAC by more than 0,01.
- Row click opens the same form for edit; locked rows (exported) show a banner and require "Déverrouiller" with confirmation.
- Paid toggle inline (`Chip` select) writes `paid`, `paidAt` default today.
- Export builds the workbook client-side (see accounting).

### Comptes · Aperçu par mois (/comptes/apercu?year=2026)

The monthly overview and revenue mix: invoiced HTVA this year against last year and the objective, with the forecast from signed events, plus the mix by prestation type and its targets.

**Layout**

**Laptop.** `max-w-wide`. Tiles: CA année, Objectif année, Atteint %, Seuil mensuel. The MonthlyChart from Dashboard.tsx, moved here and recoloured with theme tokens: three bars per month (CA N−1, CA N, Objectif) and a line for Prévision. `DataTable` Mois | CA HTVA N−1 | CA HTVA N | Δ % | Objectif | Prévision | Atteint, totals row. `Section` "Mix par prestation": `DataTable` Type | CA N−1 | % | CA N | % | Objectif | % | Nb nécessaires. `Toggle` "Comparaison par période" with the two workbook periods for N, N−1, N−2.

**Phone.** Tiles 2 per row, chart full width with 12px axis labels, tables as cards.

**Interactions**

- Year select; chart hover shows the month's three figures; clicking a month opens the journal for that month.
- Objective figures are read from settings.objectives[year]; a link "Modifier l'objectif" goes to Prévisionnel.

### Comptes · Compte de résultats (/comptes/resultats?year=2026)

The monthly income statement that replaces 'Analyse marge': CA, raw material cost, gross margin, fixed charges, extra staff, other event costs, profit before tax, corporate tax, net.

**Layout**

**Laptop.** `max-w-wide`. `DataTable` with 12 month rows plus Total: Mois | CA HTVA | Coûts MP | Marge brute | Charges fixes | Personnel extra | Autres coûts | Résultat avant impôts | Marge % | Impôts | Résultat net. Ratio rows under the total: MP / CA, Marge brute / CA, Charges fixes / CA. Each Coûts MP cell carries a small source chip ("figé", "achats", "calculé") and a tooltip listing the events. `Section` "Simulation" with the objective scenario row. A `Toggle` "Paramètres" shows the corporate tax rate and raw material % used, linking to Prévisionnel.

**Phone.** Month cards with the four key figures (CA, MP, Résultat, Net) and a Toggle for the rest.

**Interactions**

- Year select. Cells are read-only; clicking a month's CA opens the journal, clicking Coûts MP opens a drawer listing the events and purchase lines that compose it.
- "Exporter" adds a sheet "Compte de résultats" to the xlsx export.

### Comptes · Prévisionnel (/comptes/previsionnel?year=2026)

Fixed charges, objectives, breakeven, treasury and investment envelope: the 'Prévisionnel financier' and 'Simulation si seule' sheets, stored as records with validity periods.

**Layout**

**Laptop.** `max-w-wide`. `Section` "Charges fixes": `DataTable` Intitulé | Catégorie | Mensuel | Mensuel sans salarié | Annuel | Depuis | Jusqu'au, totals, a `Switch` "Scénario: avec salarié / seule". `Section` "Objectif 2026": form fields in a two-column grid (CA annuel, mois actifs, % MP, taux ISoc, budget extras, mois de trésorerie, épargne mensuelle, heures disponibles/mois) and a `DataTable` Objectif par prestation: Type | Montant | Nb nécessaires | Convives/évén. `Section` "Investissements" list. `Section` "Seuil et trésorerie": computed tiles Seuil annuel, Seuil mensuel, Besoin de trésorerie, Bénéfice prévu, ISoc prévu, Marge nette prévue, with the workbook's "hors MP" figure shown beside for one year.

**Phone.** Sections stacked; tables as cards; forms single column.

**Interactions**

- Editing a charge amount closes the current row (`to` = previous month) and creates a new row from the chosen month, so past months keep their figure; a "Modifier à partir de" month picker drives this.
- Objective fields save through `PATCH /admin/settings` (new keys); a "Copier depuis 2025" action seeds a new year.
- Scenario switch only changes which amount column is summed.

### Comptes · Au réel (/comptes/reel?ym=2026-10)

Signed revenue versus target per month with hours, the 'Au réel' tracker.

**Layout**

**Laptop.** `max-w-doc`. Month ‹ ›. `DataTable` Client / événement | Type | CA HTVA | Heures | Observations, one row per event dated in the month (CA = Σ journal HTVA of the event, else sellingPricePerGuest × guestCount, with a chip "signé" or "facturé"). Footer: Σ CA signé, Σ heures, Objectif mensuel, Heures disponibles, Reste à signer, Heures restantes. A year summary line: Σ année and écart to the annual objective.

**Phone.** Cards per event; footer sticky.

**Interactions**

- Heures cell is an `InlineField` writing `event.hoursSpent`; Observations writes `event.notes`.
- Row click opens the event document.

### Paramètres (/settings)

Taxonomies and defaults: recipe categories with icons, courses, prestation types, suppliers with colours, ignored duplicate groups.

**Layout**

**Laptop.** `max-w-doc`. `Section`s: "Catégories de recettes" (rows with emoji picker and name, ▲▼), "Catégories de service" (courses: Apéritif, Entrée, Plat, Dessert, Autre, reorderable, with emoji), "Types de prestation" (the seven workbook labels, editable), "Fournisseurs" (name, colour swatch from an 8-colour accessible set, address, phone), "Doublons ignorés" (list with "Reprendre"), "À propos" (version).

**Phone.** Same, single column, 44px rows.

**Interactions**

- Save button appears when dirty, as today; the backend `updateSettingsRequestSchema` gains the new optional keys.
- Renaming a course rewrites nothing on events (course is stored as a string); a rename dialog offers "Renommer aussi sur 42 lignes d'événement" which runs a client-side loop of line patches.

## Data model changes

All additions are optional on read. Existing DynamoDB rows need no migration to keep rendering; readers default missing values. Three new tables. Shared code goes in `packages/types` (run `pnpm build:types`).

## Taxonomies (new file `packages/types/src/entities/taxonomies.ts`)

```ts
export const PRESTATION_TYPES = ["menu_a_emporter","buffet_a_emporter","buffet_avec_service","atelier","brunch","walking_cocktail","chef_a_domicile"] as const;
export type PrestationType = (typeof PRESTATION_TYPES)[number];
export const PRESTATION_LABELS: Record<PrestationType, string> = {
  menu_a_emporter: "Menu à emporter", buffet_a_emporter: "Buffet à emporter", buffet_avec_service: "Buffet avec service",
  atelier: "Atelier", brunch: "Brunch", walking_cocktail: "Walking / cocktail", chef_a_domicile: "Chef à domicile",
};
export const VAT_RATES = [0, 6, 12, 21] as const;
export type VatRate = (typeof VAT_RATES)[number];
export const DEFAULT_COURSES = ["Apéritif", "Entrée", "Plat", "Dessert", "Autre"];
export const DEFAULT_COURSE_ICONS: Record<string, string> = { "Apéritif": "🥂", "Entrée": "🥗", "Plat": "🍽️", "Dessert": "🍰", "Autre": "🧺" };
```

## Event (`packages/types/src/entities/event.ts`)

```ts
export type PrepStatus = "a_faire" | "en_cours" | "fait";

export interface EventRecipeLine {
  lineId?: string;          // optional on read; EventsService fills randomUUID() when absent on create/update
  recipeId: string;         // required (unchanged)
  portions: number;         // required (unchanged)
  course?: string;          // optional; a value of settings.courses; fallback recipe.defaultCourse, then "Autre"
  order?: number;           // optional; sort key inside the course; fallback array index
  notes?: string;           // optional; per-line prep note
  prepStatus?: PrepStatus;  // optional; undefined reads as "a_faire"
  prepDate?: string;        // optional YYYY-MM-DD; undefined reads as event.date
}

export type ExtraCostKind = "matiere" | "personnel" | "location" | "transport" | "autre";
export interface EventExtraCost { label: string; amount: number; kind?: ExtraCostKind } // undefined reads "autre"

export interface EventCostSnapshot {
  rawMaterial: number;      // Σ (recipeCost / recipe.portions) × line.portions at takenAt
  extras: number;           // Σ extraCosts.amount at takenAt
  lines: { lineId: string; recipeId: string; portions: number; unitCost: number }[];
  takenAt: string;          // ISO
}

export interface AppEvent {
  // existing fields unchanged
  clientId?: string;        // optional; readers show client?.name ?? contactName
  templateId?: string;      // optional; which favourite created it
  prestationType?: PrestationType;  // optional; reports bucket undefined under "Sans type"
  vatRate?: VatRate;        // optional; default from prestation type when chosen
  hoursPlanned?: number;    // optional
  hoursSpent?: number;      // optional
  km?: number;              // optional
  costSnapshot?: EventCostSnapshot; // optional; written server-side when status becomes completed
}
```

Readers use `actualCost ?? costSnapshot?.rawMaterial ?? liveCalc` for raw material cost. Duplicate `recipeId`s in one event become legal once `lineId` exists (same recipe in two courses); EventEditor's `addRecipe` guard is relaxed.

## Recipe, Ingredient, GroceryList, Settings

```ts
// recipe.ts
defaultCourse?: string;     // optional; copied to line.course when the recipe is added to an event

// ingredient.ts
mergedFrom?: string[];      // optional; audit trail of merged ingredientIds

// grocery-list.ts
eventIds?: string[];        // optional; lists created from events; enables "Régénérer"

// settings.ts
export interface SettingsSupplier { name: string; address?: string; phone?: string; color?: string } // color optional, hex from an 8-colour set; fallback hash
export type ChargeCategory = "social" | "salaire" | "assurance" | "abonnement" | "frais" | "remboursement" | "autre";
export interface FixedCharge {
  chargeId: string; label: string; category: ChargeCategory;
  monthlyAmount: number; monthlyAmountSolo?: number;
  from: string;             // "YYYY-MM" inclusive
  to?: string;              // "YYYY-MM" inclusive; undefined = still active
  note?: string;
}
export interface Objective {
  annualRevenue: number; monthsActive: number;            // monthsActive default 10
  monthlyOverrides?: Record<string, number>;              // "YYYY-MM" → amount
  byPrestation: { type: PrestationType; amount: number; eventsNeeded?: number; guestsPerEvent?: number }[];
  hoursAvailablePerMonth?: number;
  rawMaterialPct: number;                                 // 0.38 default
  corporateTaxRate: number;                               // 0.25 default, editable
  extrasBudget?: number; treasuryMonths: number; treasurySavingPerMonth?: number;
  investments: { label: string; amount: number }[];
}
export interface AppSettings {
  settingsId: "global"; recipeCategories: string[]; suppliers: SettingsSupplier[]; updatedAt: string;
  courses?: string[];                       // default DEFAULT_COURSES
  courseIcons?: Record<string, string>;     // emoji per course
  categoryIcons?: Record<string, string>;   // emoji per recipe category
  prestationTypes?: string[];               // labels override; default PRESTATION_LABELS values
  fixedCharges?: FixedCharge[];
  objectives?: Record<string, Objective>;   // key = "2026"
  ignoredDuplicateGroups?: string[];        // normalised keys
}
```

Fixed charges and objectives stay in the single settings item (tiny, one writer, read through the 120s cache). `SettingsService.update` keeps its current put but the `Pick` widens to the new keys, and `SETTINGS_TTL` drops to 30s.

## New tables

```ts
// packages/types/src/entities/client.ts  (table ta-clients-{stage}, PK clientId)
export interface Client {
  clientId: string; name: string; nameLower: string;
  kind?: "entreprise" | "particulier";
  contactName?: string; phone?: string; email?: string; address?: string; vatNumber?: string;
  defaultPrestationType?: PrestationType; defaultVatRate?: VatRate; defaultPricePerGuest?: number;
  notes?: string; active: boolean; createdAt: string; updatedAt: string;
}

// packages/types/src/entities/event-template.ts  (table ta-event-templates-{stage}, PK templateId)
export interface EventTemplate {
  templateId: string; name: string; clientId?: string;
  prestationType?: PrestationType; vatRate?: VatRate;
  guestCount: number; recipes: EventRecipeLine[]; extraCosts: EventExtraCost[];
  sellingPricePerGuest: number; notes?: string;
  defaultWeekday?: 0 | 1 | 2 | 3 | 4 | 5 | 6;   // 1 = Monday
  createdAt: string; updatedAt: string;
}

// packages/types/src/entities/ledger.ts  (table ta-ledger-{stage}, PK entryId)
export type LedgerBook = "ventes" | "achats";
export type SalesKind = "facture" | "acompte" | "comptoir" | "commission" | "bon_cadeau" | "autre";
export type PurchaseKind = "mp" | "personnel" | "autre";
export type PaymentMethod = "virement" | "cash" | "bancontact" | "payconiq" | "autre";
export interface LedgerEntry {
  entryId: string; book: LedgerBook; kind: SalesKind | PurchaseKind;
  date: string;             // YYYY-MM-DD, invoice or operation date
  ym: string;               // "2026-10", written server-side from date.slice(0, 7)
  number?: string;          // Falco invoice number
  label: string;
  eventId?: string; clientId?: string; prestationType?: PrestationType;
  totalTvac: number; htva: number;
  vat: { rate: VatRate; base: number; amount: number }[];
  paid: boolean; paymentMethod?: PaymentMethod; paidAt?: string;
  description?: string; km?: number;
  personName?: string; hours?: number; hourlyRate?: number;   // achats / personnel
  locked?: boolean;         // set by the export; edits require unlock
  createdAt: string; updatedAt: string;
}
```

Amounts are euros with two decimals, validated `multipleOf(0.01)`, summed in cents (`sumMoney`). No GSI: `scanAll` plus client-side `ym` filter is fine at ≤ 1 000 lines a year.

## DTO changes (`packages/types/src/dto`)

```ts
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().multipleOf(0.01);

export const eventRecipeLineSchema = z.object({
  lineId: z.string().min(1).optional(), recipeId: z.string().min(1), portions: z.number().int().positive(),
  course: z.string().trim().max(40).optional(), order: z.number().int().nonnegative().optional(),
  notes: z.string().trim().max(500).optional(), prepStatus: z.enum(["a_faire","en_cours","fait"]).optional(),
  prepDate: isoDate.optional(),
}).strict();
export const updateEventLineSchema = eventRecipeLineSchema.omit({ lineId: true, recipeId: true }).partial().strict();
export const reorderEventLinesSchema = z.object({ lineIds: z.array(z.string().min(1)).min(1) }).strict();
export const mergeIngredientsSchema = z.object({ survivorId: z.string().min(1), mergedIds: z.array(z.string().min(1)).min(1) }).strict();
export const createLedgerEntrySchema = z.object({ /* fields above, date: isoDate, totalTvac: money, htva: money, vat: z.array(...) */ })
  .strict()
  .refine((e) => Math.abs(e.htva + e.vat.reduce((s, v) => s + v.amount, 0) - e.totalTvac) < 0.011, { message: "HTVA + TVA doit égaler TVAC" });
export const fromTemplateSchema = z.object({ date: isoDate, guestCount: z.number().int().positive().optional() }).strict();
```

`createEventRequestSchema` gains the optional event fields and `date: isoDate`. Existing event DTOs stay non-strict for one release so older clients do not break; every new DTO is `.strict()`.

## Backend

- `apps/backend/src/config/config.service.ts`: `CLIENTS_TABLE`, `EVENT_TEMPLATES_TABLE`, `LEDGER_TABLE` declared `.optional()`; services throw a 503 "table not configured" on first use. README steps and `scripts/ec2-bootstrap.sh` updated; `infrastructure/lib/data-stack.ts` gains the three tables so CDK matches reality.
- `apps/backend/src/shared/ddb.service.ts`: loop on `UnprocessedItems` with backoff in `batchWrite` and `batchDelete`; `update()` takes an optional `{ expectedUpdatedAt }` that appends `AND #updatedAt = :expected`; an exception filter maps `ConditionalCheckFailedException` to 409; the unused `QueryCommand` import is removed.
- `packages/types/src/costing.ts`: `calcIngredientLineCost`, `calcRecipeCost(recipe, ingredientById: Map)`, `calcEventCost(event, recipes, ingredients)` shared by the frontend and by `EventsService` for the snapshot. `apps/frontend/src/lib/recipe-helpers.ts` re-exports them.
- New modules: `clients`, `event-templates`, `ledger`, same shape as `events.service.ts`. New routes: `PATCH /admin/events/:id/lines/:lineId`, `PUT /admin/events/:id/lines/order`, `POST /admin/events/from-template/:templateId`, `GET /admin/ingredients/duplicates`, `POST /admin/ingredients/merge`, `POST /admin/ledger/from-event/:eventId`.
- `apps/frontend/src/lib/api.ts`: new groups `clients`, `templates`, `ledger` (ledger uncached like groceryLists); invalidation sets: `ingredients.merge → ["ingredients","recipes"]`, `events.update/lines → ["events"]`, `templates.instantiate → ["events","templates"]`, `ledger.fromEvent → ["events"]`.

## Migration scripts (`apps/backend/scripts/`, ts-node, boot ConfigService + DdbService, `--dry-run`, idempotent, per-item `ddb.update`)

- `backfill-line-ids.ts`: optional; lazy fill on next write covers it, the script only makes the phone-side line endpoints work for events never edited again.
- `snapshot-completed-events.ts`: writes `costSnapshot` for completed events that lack one, at today's prices, with `takenAt` and a log line stating it is an approximation.
- `seed-clients-from-contacts.ts`: groups events by `contactEmail || contactName`, creates clients, backfills `clientId`; dry-run prints the grouping for review.

## Feature solutions

### planning

## Week overview with revenue

`/` renders `pages/admin/Semaine.tsx` (new file). It loads `api.events.list()`, `api.clients.list()`, `api.ledger.list()` and `api.settings.get()`, selects events whose `date` falls in the ISO week of the route (`startOfWeekMonday` and `endOfWeekSunday` move from Events.tsx to `lib/dates.ts`, and a `weekKey(date)` helper produces `2026-W42`). Each day is a `Section`; each event a `ListRow`; each line rendered open on laptop and behind a `Toggle` on phone. Revenue per day and week is signed revenue (Σ sellingPricePerGuest × guestCount). The money strip adds journal figures: CA du mois = Σ `LedgerEntry.htva` where `book === "ventes"` and `ym` is the current month; À encaisser = unpaid sales lines; Objectif from `settings.objectives[year]`. Until the ledger exists (phase 3 ships before phase 5) the strip shows only Signé and the day totals.

## Day view

`/jour/:date` renders `pages/admin/Jour.tsx`. A `prepLinesForDate(events, recipes, date)` helper in `lib/planning.ts` returns `{ event, line, recipe }[]` where `(line.prepDate ?? event.date) === date`, sorted by course index (from `settings.courses`, fallback `DEFAULT_COURSES`) then `order ?? arrayIndex`. The same helper feeds the week page, the PDF, and the "Par recette" grouping (`groupBy(recipeId)` with per-event breakdown chips). This replaces `generateAggregatedPdf` and `exportRecipesPdf`; both functions are deleted once the Jour page ships, and the only PDF left is "Imprimer" on Jour, built with jsPDF at 11pt from the same structure.

## Clickable prep sheets per line

Each line has three targets: a checkbox (prepStatus), the text (opens the recipe document), and "Cuisiner" (opens `/recipes/:id/cook?portions=&event=&line=`). RecipeCook reads the query params with `useSearchParams`, sets `cookPortions` from `portions`, shows the event chip, and on the last step offers "Marquer fait" which calls `api.events.patchLine(eventId, lineId, { prepStatus: "fait" })` then navigates to `/jour/:date`. The line endpoint exists so a tick from the phone never goes through EventEditor's whole-array autosave.

## Files

New: `pages/admin/Semaine.tsx`, `pages/admin/Jour.tsx`, `lib/dates.ts`, `lib/planning.ts`. Changed: `App.tsx` (routes `/`, `/semaine/:isoWeek`, `/jour/:date`), `RecipeCook.tsx` (query params, two-column layout), `Events.tsx` (remove modal and aggregated PDF, fix sort direction), `EventDetail.tsx` (remove exportRecipesPdf), `AdminSidebar.tsx`, backend `events.controller.ts` and `events.service.ts` (line endpoints, lazy lineId).

### readability

## Design system (shipped before any feature)

### Type scale (`tailwind.config.ts`, `theme.extend.fontSize`)

| Token | Size / line height | Use |
|---|---|---|
| `text-caption` | 13px / 1.4 | timestamps, table footnotes; never smaller anywhere |
| `text-sm` | 14px / 1.5 | chips, table numerics, secondary list lines |
| `text-base` | 16px / 1.6 | body, inputs, list titles, form labels |
| `text-lead` | 18px / 1.6 | recipe steps, ingredient lines, prep lines |
| `text-h3` | 20px / 1.3, 600 | section titles (DM Sans) |
| `text-h2` | 24px / 1.25 | recipe names in cards, cook title (Playfair) |
| `text-h1` / `md:text-h1-lg` | 32px / 1.15, 40px / 1.1 | page titles (Playfair) |
| `text-cook` / `md:text-cook-lg` | 28px / 1.4, 36px / 1.35 | current cook step (Playfair) |

Playfair only at 24px and above; the global `h1..h6 { font-serif }` rule in index.css is removed and `PageTitle` applies `font-serif` explicitly. `text-xs`, `text-[10px]`, `text-[11px]`, `uppercase tracking-wider` are removed from `pages/admin` (a `scripts/check-type-scale.sh` grep fails CI if they come back).

### Spacing

Scale 8 / 16 / 24 / 40 / 64 (`spacing.block = 2.5rem`, `spacing.section = 4rem`). Blocks inside a section: `space-y-4` (lists) or `space-y-6` (steps). Sections: `mt-block`. Page padding: `px-4 md:px-8`. Reading column `max-w-doc = 44rem` (704px); wide tables `max-w-wide = 72rem`. Tap targets `min-h-tap min-w-tap = 2.75rem` (44px) on every button in recipe, cook, jour, courses pages.

### Colour roles (`index.css`)

```css
:root {
  --background: 30 25% 98%;   --foreground: 20 20% 13%;
  --card: 30 25% 98%;         /* same as background: documents, not boxes */
  --surface: 30 20% 94%;      /* sidebar, tile backgrounds */
  --hover: 30 15% 93%;        /* row hover, Notion grey */
  --muted: 30 15% 93%;        --muted-foreground: 20 10% 38%;   /* about 6:1 on background */
  --primary: 25 55% 44%;      --primary-foreground: 0 0% 100%;  /* about 4.6:1 */
  --primary-soft: 25 60% 93%;
  --success: 150 35% 30%;     --success-soft: 150 30% 92%;
  --warning: 35 75% 34%;      --warning-soft: 40 80% 92%;
  --info: 210 30% 38%;        --info-soft: 210 40% 93%;
  --destructive: 0 60% 42%;   --destructive-soft: 0 70% 94%;
  --border: 30 20% 88%;       --input: 30 20% 80%;
  --sidebar-background: 30 20% 94%; --sidebar-foreground: 20 20% 13%; --sidebar-accent: 25 60% 90%;
}
html { font-size: 16px; }
body { @apply bg-background text-foreground font-sans antialiased text-base; }
.input-field { @apply w-full px-3 py-2.5 border border-input rounded-lg text-base bg-background focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none; }
.card-elevated { @apply bg-surface rounded-xl border border-border; }  /* KPI tiles and gallery cards only */
```

One accent (primary, warm terracotta), calm warm greys, four status colours each with a soft tint; text on tints is always the dark role colour, never the colour on beige. Every pair is checked at 4.5:1 before merge; the values above are targets from the audit's measurements, not measured here. `tailwind.config.ts` adds `success`, `warning`, `info`, `hover`, `surface`, `primary.soft` and the `*-soft` entries, plus a plugin: `addVariant("touch", "@media (hover: none)")` and `addVariant("pointer", "@media (hover: hover)")`.

### Card versus document

Default is document: one column, headings and whitespace, hairline dividers, no borders around content. Cards only for the recipe gallery and KPI tiles. Tables only through `DataTable`.

### Hover-to-reveal editing

Controls that edit or delete carry `className="reveal"`: `pointer:opacity-0 pointer:group-hover:opacity-100 touch:opacity-60`. Reading text is never itself the click target; the pencil is.

### Anchors

Emoji per recipe category (`settings.categoryIcons`, defaults 🥐 Buffet, 🍸 Walking dinner, 🥪 Lunch, 📆 Menu semaine), per course (`courseIcons`), client initial avatar on events, section emoji in the sidebar. Supplier colour stored on the supplier (`color`), rendered as a dot next to the name or a tag with dark text.

### Component set (`apps/frontend/src/components/ds/`)

```ts
PageTitle({ eyebrow?: ReactNode /* Breadcrumb */, icon?: string, title: ReactNode, meta?: ReactNode, actions?: ReactNode })
Section({ title: string, meta?: ReactNode, action?: ReactNode, children })          // h2 text-h3, mt-block
Block({ variant: "step" | "callout" | "note", index?: number, actions?: ReactNode, children }) // numbered 32px circle for step
Chip({ variant: "neutral"|"primary"|"success"|"warning"|"info"|"danger", icon?: string, onClick?, options?: {value,label}[] }) // text-sm, 28px, select when options given
InlineField({ value, onSave, type: "text"|"number"|"textarea"|"select"|"date", options?, size?: "base"|"lead"|"h1", suffix?, min?, placeholder? }) // replaces EditableText, EditableInlineNum, EditableInlineText, EditableType, EditableNum
Toggle({ title: ReactNode, defaultOpen?: boolean, storageKey?: string, children })   // disclosure block with chevron
Switch({ value: boolean, onChange, labelOn, labelOff })
DataTable<T>({ columns: { key, label, align?, width?, render?, footer? }[], rows: T[], rowKey, onRowClick?, stickyHeader?, mobile: "cards" | "scroll", cardTitle?: (row) => ReactNode })
ListRow({ leading?: ReactNode, title: ReactNode, subtitle?: ReactNode, trailing?: ReactNode, onClick?, selected? })
Stepper({ value, onChange, min?, label? })
Breadcrumb({ items: { label, to? }[] })
FieldLabel({ children })                                                              // text-base font-medium, sentence case
```

### Applied incrementally, no rewrite

1. Tokens first (index.css, tailwind.config.ts). This changes every page at once: base size, contrast, input size, light sidebar. No JSX touched. One day.
2. Components in `components/ds`, with `InlineField` wrapping the behaviour of the four Editable* implementations so a page can swap one at a time. Two days.
3. Page by page, each a separate PR, each deletes its local helpers: RecipeDetail (document), RecipeCook, Recipes, then the new Semaine and Jour pages (built on DS from the start), EventDetail, Events, EventEditor, GroceryListPage, Ingredients, Settings, then the new Comptes pages. A page that has not migrated still looks better because of step 1.
4. `AdminSidebar.tsx` and `AdminLayout.tsx` switch to the light sidebar, bottom tab bar and breadcrumb slot in step 1 too; `AdminLayout` exposes `fullBleed` through outlet context so GroceryListPage stops using `-m-6`.

### ingredientMerge

## Finding duplicates

`GET /admin/ingredients/duplicates` (new, `IngredientsService.findDuplicates`) normalises every name with `normaliseIngredientKey` in `packages/types/src/normalise.ts` so the frontend can reuse it for the create-time warning:

1. `name.normalize("NFD").replace(/\p{M}/gu, "")`, then `œ → oe`, `æ → ae`, lowercase, trim.
2. Remove parenthesised and bracketed qualifiers: `(pièce)`, `[bio]`.
3. Replace punctuation and `/` with spaces, collapse whitespace.
4. Tokenise; drop unit and packaging tokens (`kg, g, gr, l, ml, cl, pce, pcs, piece, pieces, botte, bottes, sachet, boite, bte, paquet, x`) and pure numbers.
5. Singularise each token of length ≥ 4: strip trailing `x` after `au/eu` (`gateaux → gateau`), strip trailing `s`.
6. Key = tokens sorted and joined with a space. `Oeuf`, `Oeufs`, `Œuf`, `oeuf (pièce)` all become `oeuf`.

Groups are built in two passes. Pass one: exact key match, confidence `identique`. Pass two: for remaining singletons with key length ≥ 5, Damerau-Levenshtein distance ≤ 1 on the key gives `proche`, distance 2 or one token set strictly containing the other (`oeuf` vs `oeuf bio`) gives `a_verifier`. Groups whose key is in `settings.ignoredDuplicateGroups` are skipped. The response includes for each candidate `recipeCount` and `listCount` computed from one `scanAll` of recipes and grocery lists, so the UI can rank survivors and show impact.

## Choosing the survivor

Default pick: most recipe references, tie-break most recent `updatedAt`. The user can change the radio. A candidate is excluded (greyed) when `PRICE_TO_QTY_UNIT[candidate.unit] !== PRICE_TO_QTY_UNIT[survivor.unit]`, because recipe lines carry quantities in g, ml, pièce or botte and a survivor with another family would make `calcIngredientLineCost` wrong; the user edits the unit first or merges the other way. Never auto-merge; `deduplicate` and its button are removed.

## What is remapped

`POST /admin/ingredients/merge { survivorId, mergedIds }`, in this order, each step idempotent:

1. Load survivor and merged rows; 404 if the survivor is missing, 400 if any merged id equals the survivor or the unit families differ.
2. `scanAll(recipes)`. For each recipe with a line whose `ingredientId ∈ mergedIds`: set it to `survivorId`; if the recipe now has two lines with the same `ingredientId` and `unit`, collapse them by summing `qty` and keeping the max `lossPct`. `ddb.update(recipes, { recipeId }, { ingredients, updatedAt })`. Count `recipesUpdated`.
3. `scanAll(groceryLists)`. Same rewrite on `items[].ingredientId`, refreshing `name`, `supplier`, `pricePerUnit`, `priceUnit` from the survivor, collapsing duplicates by `(ingredientId, unit)` summing `totalQty` and `haveQty`, `checked = a && b`. Count `listsUpdated`.
4. Re-scan recipes and lists; if any reference to a merged id remains (a concurrent edit), stop and return 409 with the names.
5. `ddb.update(ingredients, survivor, { mergedFrom: [...existing, ...mergedIds], updatedAt })`, then `batchDelete(mergedIds)` with the new `UnprocessedItems` loop.
6. Return `{ recipesUpdated, listsUpdated, deleted, failures: [] }`.

The `localStorage` pending grocery payload is transient and not touched. `EventRecipeLine` references recipes only, so events are untouched.

## Partial failure

Step 2 and 3 are per-item updates; a failure is caught, recorded in `failures: [{ kind: "recipe", id, name, error }]`, and the loop continues. If `failures` is non-empty the service skips steps 4 to 6 and returns 207 with the payload; nothing is deleted, the survivor is already referenced by the updated records, and the merged ingredients still exist, so every page keeps working. The UI keeps the group open with "Réessayer"; re-running the same request finds fewer references (already remapped recipes are skipped) and finishes. Deleting only after a clean re-scan means a merged ingredient can never be deleted while something still points to it.

`DELETE /admin/ingredients/:id` gains the same reference scan and returns 409 with the referencing recipe names.

## Cache and UI

`api.ingredients.merge` invalidates `["ingredients", "recipes"]` so Events.generateGroceryList does not read 30-second-old recipes holding merged ids. The page is `/ingredients/doublons` (`pages/admin/IngredientDuplicates.tsx`), one `Section` per group. On create, `IngredientFormModal` calls `normaliseIngredientKey` against the loaded list and shows "Semblable à : Oeufs · Utiliser" before saving.

### eventOrdering

## Where the course lives

On both, with the event line authoritative:

- `recipe.defaultCourse?` is the default. When a recipe is added to an event (EventEditor `addRecipe`, EventDetail add row, template instantiation) the line gets `course = recipe.defaultCourse ?? "Autre"`.
- `line.course?` is what every renderer uses. Changing it on the event never changes the recipe, so a quiche can be an apéritif at a cocktail and an entrée at a lunch.
- The course list and its order are `settings.courses` (default `DEFAULT_COURSES`), editable and reorderable in Paramètres, with an emoji each.

## How order is stored

`line.order?: number` is the sort key inside a course. Renderers sort with:

```ts
const courseIdx = (c?: string) => { const i = courses.indexOf(c ?? "Autre"); return i === -1 ? courses.length : i; };
lines.map((l, i) => ({ l, i })).sort((a, b) => courseIdx(a.l.course) - courseIdx(b.l.course) || (a.l.order ?? a.i) - (b.l.order ?? b.i));
```

So events saved before this change render in their array order, under "Autre". A manual reorder calls `PUT /admin/events/:id/lines/order { lineIds }` with the full list in display order; `EventsService.reorderLines` loads the event, renumbers `order` 0..n following `lineIds`, and, for a line dropped into another course group, the UI sends `PATCH /lines/:lineId { course }` first. Lines not present in `lineIds` (a concurrent add) are appended at the end. Each line is identified by `lineId`, filled lazily by `EventsService.create` and `update` (`recipes.map(l => ({ ...l, lineId: l.lineId ?? randomUUID() }))`), so no migration is needed and duplicate `recipeId`s become allowed.

## Interaction

In `EventDetail.tsx` the Menu section renders one group per course with its emoji heading. Pointer devices drag by a handle (HTML5 DnD as in `GroceryListPage.tsx`); touch devices use ▲▼ 44px buttons; a course `Chip` on each line is a select. "Trier par catégorie" sorts by course index then recipe name and persists once. The same ordering feeds the Jour prep sheet, the week page, the client menu and the PDF, so the kitchen and the client read in service order.

## Files

`packages/types/src/entities/event.ts`, `recipe.ts`, `settings.ts`, `dto/events.ts`, `dto/settings.ts`; backend `events.controller.ts`, `events.service.ts`, `settings.service.ts`; frontend `EventDetail.tsx`, `EventEditor.tsx`, `Settings.tsx`, `lib/planning.ts` (`sortLines`), `api.ts` (`events.patchLine`, `events.reorderLines`).

### recurringClient

## Entities

`Client` and `EventTemplate` (called "Favori" in the UI) in two new tables. `AppEvent.clientId?` and `templateId?` link back. `contactName/Phone/Email` stay on events for old rows and as per-event overrides.

## Set up once (Hoona)

1. Clients › Nouveau client: "Hoona", entreprise, prestation par défaut "Buffet à emporter", TVA 6 %, PV/pers 14 €, contact.
2. Open any existing Hoona event, ⋯ › "Mettre en favori". A sheet asks for the favourite's name ("Hoona · Lunch du mardi"), the weekday (mardi) and keeps recipes with portions and courses, guest count, price, prestation, extra costs, notes. `POST /admin/event-templates` creates it; the Client page lists it under Favoris.
3. Repeat for the Thursday menu if it differs. Three or four favourites cover her weekly clients.

## See the week or a day

On Cette semaine, the client chips ("Hoona") filter the seven days to that client's events and lines, which is the "aperçu de la semaine entière" she asked for. The Jour page is the "jour par jour" view, with the same filter chip. The Client page shows "À venir" grouped by week for the next four weeks, so she can check Hoona is scheduled.

## Reuse next week

Three entry points, all calling `POST /admin/events/from-template/:templateId { date, guestCount? }` which copies the template into a new event (name = template name, date, `clientId`, `templateId`, status upcoming, fresh `lineId`s, `prepStatus` undefined):

- Cette semaine › "Favoris": a dialog listing favourites with a weekday row for the displayed week (the template's `defaultWeekday` is pre-checked), a guest count per favourite prefilled from the template, one Create button. Navigate to next week first and the same dialog creates next week's Hoona events in two clicks.
- Client page › favourite row › "Créer cette semaine" or "Créer la semaine prochaine".
- Client page › À venir › "Reconduire la semaine prochaine": for each of this client's events in the current week that has a `templateId`, create the same template at date + 7 days; events without a template are cloned with date + 7 (name kept, no "(copie)" suffix).

The created event opens in the editor only if she asks ("Ouvrir"); by default it appears in the week and she adjusts portions inline on the week page. "Dupliquer" stays for one-off events but now asks for the date instead of using today.

## Guarding reports

Templates are not events, so `Dashboard`-style revenue sums (now in Comptes) never see them. Deleting a client keeps its events (`clientId` dangling is rendered as the stored `contactName` or "Client supprimé").

## Files

`packages/types/src/entities/client.ts`, `event-template.ts`, `dto/clients.ts`, `dto/event-templates.ts`; backend modules `clients`, `event-templates`, `events.service.ts` (`createFromTemplate`), `config.service.ts`; frontend `pages/admin/Clients.tsx`, `ClientDetail.tsx`, the Favoris dialog `components/planning/FavoritesDialog.tsx`, `EventDetail.tsx` (Mettre en favori), `EventEditor.tsx` (client select, Depuis un favori), `api.ts`. Optional script `seed-clients-from-contacts.ts`.

### accounting

## Entities

Records (written on purpose, never recomputed): `LedgerEntry` (table `ta-ledger`), `FixedCharge[]` and `Objective` per year inside `settings`, plus on the event `sellingPricePerGuest`, `actualCost`, `extraCosts` and the server-written `costSnapshot`. Views (derived at render time, never stored): Aperçu par mois, Mix par prestation, Compte de résultats, Prévisionnel, Au réel, seuil, trésorerie. Full TypeScript in the data model section. `ExtraShift` is not a separate table: an extra's shift is a ledger line `book: "achats", kind: "personnel"` with `personName`, `hours`, `hourlyRate`, `htva = hours × hourlyRate`, so the "factures Kristoff" check is a filter on the journal's Achats book by person and period.

## Screens

`/comptes/journal`, `/comptes/apercu`, `/comptes/resultats`, `/comptes/previsionnel`, `/comptes/reel`, all under `pages/admin/comptes/`, sharing `components/comptes/ComptesTabs.tsx`. Maths lives in `apps/frontend/src/lib/accounting.ts` (`groupByMonth`, `sumMoney`, `splitTvac`, `fmtEur`, `incomeStatement(year, ledger, events, settings)`), with `groupByMonth` keying on `date.slice(0, 7)` rather than `new Date().getMonth()`.

## How an event becomes a journal line

On the event document, Facturation › "Clôturer et créer la ligne de journal" opens the ledger form prefilled: `book: "ventes"`, `kind: "facture"`, `date: event.date`, `label: event.name` (or client name), `clientId`, `eventId`, `prestationType: event.prestationType`, `htva = round2(sellingPricePerGuest × guestCount)`, `vat = [{ rate: event.vatRate ?? 12, base: htva, amount: round2(htva × rate/100) }]`, `totalTvac = htva + amount`, `km: event.km`. She overwrites with the Falco figures and types the invoice number. `POST /admin/ledger/from-event/:eventId` is explicit, not automatic, because the Falco number is typed by hand. Saving also sets `event.status = "completed"` if it was upcoming. Deposits: the same form with `kind: "acompte"`, `paid: true`, `paidAt`, created before the event; the final invoice line is entered net of the deposit as Falco issues it. Event revenue in reports = Σ ledger `htva` with that `eventId`; the event's `sellingPricePerGuest × guestCount` remains the forecast ("Signé"). Non-event lines (comptoir mensuel, commissions Thermomix at rate 0, bons cadeaux) are created from the Journal page directly.

VAT defaults by prestation type, editable: menu_a_emporter and buffet_a_emporter 6; buffet_avec_service, walking_cocktail, chef_a_domicile, brunch 12; atelier 21 (not confirmed with the accountant). `splitTvac(tvac, rate) = { htva: round2(tvac / (1 + rate/100)), vat: round2(tvac − htva) }` prefills only; stored HTVA is what was typed.

## How raw material cost reaches the income statement

When `EventsService.update` sees status change to `completed` and no `costSnapshot`, it loads recipes and ingredients (inject `RecipesService` and `IngredientsService` into `EventsModule`), computes with the shared `calcEventCost`, and writes `costSnapshot` in the same update. Readers use `rawMaterial(ev) = ev.actualCost ?? ev.costSnapshot?.rawMaterial ?? liveCalc(ev)`. Per month m:

- `Coûts MP(m)` = Σ purchases `book achats, kind mp, ym = m` when at least one exists for m (source chip "achats"), else Σ over events dated in m of `rawMaterial(ev)` + Σ `extraCosts` with `kind matiere` (chip "figé" when every event has a snapshot or actualCost, "calculé" otherwise).
- `Personnel extra(m)` = Σ achats `kind personnel` htva + Σ `extraCosts` kind `personnel`.
- `Autres coûts(m)` = Σ remaining `extraCosts` (location, transport, autre) of events dated in m.

## Fixed charges, objectives, breakeven

`settings.fixedCharges` is effective-dated (`from`, `to`), so `Charges fixes(m) = Σ monthlyAmount of charges with from ≤ m ≤ (to ?? ∞)` and editing an amount closes the old row and opens a new one. `settings.objectives[year]` holds `annualRevenue`, `monthsActive` (10), `monthlyOverrides`, `byPrestation`, `rawMaterialPct`, `corporateTaxRate` (0.25 default, help text about the 20 % SME rate to confirm with the accountant), `extrasBudget`, `treasuryMonths`, `treasurySavingPerMonth`, `investments`. One objective per year ends the four conflicting monthly targets in the workbook. `monthlyRevenue(m) = monthlyOverrides[m] ?? annualRevenue / monthsActive`.

## Reports, columns and formulas

**Journal des recettes** (records): N° | Date | Intitulé | Type | Total TVAC | HTVA | TVA 6 % | TVA 12 % | TVA 21 % | Réglé | Mode | Encaissé le | KM | Description. Footer: Σ TVAC, Σ HTVA, Σ per rate, "Total CA mm/aaaa" = Σ HTVA, and Σ HTVA per prestation type.

**Aperçu par mois** (view): Mois | CA HTVA N−1 | CA HTVA N | Δ % = (N − N−1) / N−1 (blank if N−1 = 0) | Objectif = monthlyRevenue(m) | Prévision = Σ events dated in m of sellingPricePerGuest × guestCount | Atteint = CA N ≥ Objectif. Totals row. Box: seuil annuel and mensuel, objectif annuel and mensuel, comparaison par période (1 jan → 30 avr, 30 avr → 30 juin) for N, N−1, N−2.

**Mix par prestation** (view): Type | CA N−1 | % | CA N = Σ ledger ventes htva by prestationType | % | Objectif = byPrestation.amount | % | Nb nécessaires = eventsNeeded ?? Objectif / (CA N / nombre de lignes du type). "Sans type" bucket for untyped lines.

**Compte de résultats** (view, 12 months + Total): Mois | CA HTVA = Σ ledger ventes htva | Coûts MP | Marge brute = CA − MP | Charges fixes | Personnel extra | Autres coûts | Résultat avant impôts = Marge brute − Charges fixes − Personnel − Autres | Marge % = Résultat / CA | Impôts = max(0, Résultat) × corporateTaxRate (annual row: max(0, Σ Résultat) × taux) | Résultat net = Résultat − Impôts. Ratios: MP / CA, Marge brute / CA, Charges fixes / CA. Simulation row: CA = annualRevenue, MP = CA × rawMaterialPct, Charges = Σ active charges × 12, Personnel = extrasBudget, Résultat, Marge %.

**Prévisionnel** (view on settings): charge table Intitulé | Catégorie | Mensuel | Mensuel sans salarié | Annuel; seuil de rentabilité (CA) = (Σ charges fixes annuelles + 12 × treasurySavingPerMonth + Σ investments) / (1 − rawMaterialPct); seuil mensuel = seuil / monthsActive; bénéfice avant impôts prévu = annualRevenue × (1 − rawMaterialPct) − Σ charges annuelles − extrasBudget; ISoc prévu = max(0, bénéfice) × corporateTaxRate; marge nette prévue % = (bénéfice − ISoc) / annualRevenue; besoin de trésorerie = Σ charges mensuelles × treasuryMonths. The workbook's "hors MP" breakeven is shown beside it for one year so she recognises her numbers.

**Au réel** (view, per month): Client / événement | Type | CA HTVA = Σ ledger htva of the event else sellingPricePerGuest × guestCount | Heures = hoursSpent ?? hoursPlanned | Observations = notes. Footer: Σ CA signé, Σ heures, Objectif mensuel, Heures disponibles, Reste à signer = Objectif − Σ CA, Heures restantes = disponibles − Σ heures. Year total and écart to annualRevenue.

## Export

`lib/ledger-export.ts` builds "Livre des recettes 2026.xlsx" with the existing `xlsx` dependency: one sheet per month "Janvier" … "Décembre" with header row A..N in the workbook's exact wording (NUMERO OPERATION, DATE FACTURE/OPERATION, INTITULE, Total tvac, RECETTE htva, TVA 6%, TVA 12%, TVA 21%, réglé, mode paiement, date encaissement, Type, Description, KM), dates as Excel date cells (`cellDates: true`), a TOTAL row and the per-type totals written as values; a sheet "recettes 2026" with the year's lines, THERMOMIX commissions and ACOMPTES blocks; a sheet "Achats" and a sheet "Compte de résultats". CSV variant per month with `;` separator and decimal comma. Export marks exported lines `locked: true`; the export never writes figures back.

## What the Dashboard becomes

`Dashboard.tsx` is deleted. `estimateBelgianTax`, the "Net après impôts (BE)" toggle and the override input are deleted (wrong base and wrong rate for an SRL; corporate tax lives in Compte de résultats). The MonthlyChart moves to `comptes/Apercu.tsx` with CA N−1, CA N and Objectif bars from the ledger, coloured with theme tokens. The home becomes Cette semaine with a four-tile strip: CA du mois (journal, with objective progress), Signé ce mois (events), À encaisser (unpaid count and Σ TVAC, oldest date), Marge brute du mois %.

## Files

`packages/types/src/entities/ledger.ts`, `settings.ts`, `taxonomies.ts`, `dto/ledger.ts`, `dto/settings.ts`, `costing.ts`; backend `ledger/*`, `events.service.ts` (snapshot), `settings.service.ts`, `config.service.ts`; frontend `pages/admin/comptes/{Journal,Apercu,Resultats,Previsionnel,Reel}.tsx`, `lib/accounting.ts`, `lib/ledger-export.ts`, `EventDetail.tsx` (Facturation toggle), `Semaine.tsx` (strip), `api.ts`.

### ai

Not now for planning, merge or accounting: duplicates are solved by string normalisation, and every report is arithmetic over records. One optional feature is worth scoping for a later phase, because it removes typing she does today: **recipe import from a photo or pasted text**.

- Input: on `/recipes`, ⋯ › "Importer depuis une photo ou un texte" accepts a JPEG/PNG (phone camera) or pasted text.
- Backend: `POST /admin/ai/parse-recipe` (new `ai` module) calls the OpenAI Responses API with structured output matching a Zod schema `{ name, portions?, description?, ingredients: { name, qty, unit }[], steps: string[] }`, using a key stored as the SSM parameter `/la-table-amelie/production/OPENAI_API_KEY` and read by `config.service.ts` as `.optional()`. If the key is absent the menu item is hidden.
- Output: a draft opened in `RecipeEditor` with ingredient names matched to existing ingredients through `normaliseIngredientKey`; unmatched names are shown as warning chips with "Créer" or "Choisir". Nothing is saved until she clicks Enregistrer.
- Cost: cents per recipe; no data leaves the app except the photo or text she chose to import.

A second candidate, "suggérer une catégorie de service pour chaque recette" (fill `defaultCourse` from the name), is cheaper done once with a keyword map in a script and does not need a model. Odoo and a ChatGPT account integration are explicitly out.

## Roadmap

### Phase 0 · Tokens and primitives (1 week)

Rewrite `apps/frontend/src/index.css` tokens (base 16px, muted-foreground, primary, status colours, light sidebar, `.input-field` at text-base), extend `tailwind.config.ts` (type scale, spacing, maxWidth doc/wide, status colours, `touch`/`pointer` variants). Create `components/ds/` (PageTitle, Section, Block, Chip, InlineField, Toggle, Switch, DataTable, ListRow, Stepper, Breadcrumb, FieldLabel). Light sidebar, bottom tab bar on phone and breadcrumb slot in `AdminSidebar.tsx` and `AdminLayout.tsx` (with `fullBleed` outlet context). Add `scripts/check-type-scale.sh`. Fix `h-22` and the Events sort direction while there.

**Migration:** None. No schema change. Every page is visibly larger and higher-contrast after this phase without JSX changes.

**Rationale:** The complaint she voices most is readability; tokens fix it everywhere in days, and the primitives are the prerequisite for every page that follows.

### Phase 1 · Recipe reading (1 to 2 weeks)

`RecipeDetail.tsx` as a document (photo, meta chips, ingredient list with Stepper, step Blocks, cost and pricing behind Toggles, InlineField replacing the four Editable* helpers). `RecipeCook.tsx` with query params, two-column tablet layout, phone ingredient sheet, 44px targets, selectable text, wake lock. `Recipes.tsx` gallery with category emoji (`settings.categoryIcons`) and phone rows. Single-recipe PDF at 11pt.

**Migration:** `settings.categoryIcons` optional; `supplier.color` optional. No script.

**Rationale:** Worst-case page first; zero backend change beyond two optional settings keys.

### Phase 2 · Lines, courses, merge (2 weeks)

`packages/types`: EventRecipeLine fields, `recipe.defaultCourse`, `settings.courses`, strict line DTOs, `mergeIngredientsSchema`, `normaliseIngredientKey`, shared `costing.ts`. Backend: lazy `lineId`, `PATCH /lines/:lineId`, `PUT /lines/order`, `GET /ingredients/duplicates`, `POST /ingredients/merge`, 409 on referenced delete, `UnprocessedItems` loop in `ddb.service.ts`. Frontend: `EventDetail.tsx` menu grouped by course with reorder, `EventEditor.tsx` dirty-field autosave, `Settings.tsx` courses, `/ingredients/doublons` page, create-time similarity warning, `api.ts` invalidation sets. Remove `deduplicate`.

**Migration:** All fields optional; `lineId` filled lazily. Optional `backfill-line-ids.ts --dry-run` for events that will never be edited again. Run `pnpm build:types`.

**Rationale:** Requests 1 and 2 verbatim, and the line identity the planning pages need.

### Phase 3 · Cette semaine and Fiche du jour (2 weeks)

`Semaine.tsx` at `/` and `/semaine/:isoWeek`, `Jour.tsx` at `/jour/:date`, `lib/dates.ts`, `lib/planning.ts`, cook mode "Marquer fait", day PDF at 11pt. Delete `WeekPlannerModal`, `generateAggregatedPdf`, `exportRecipesPdf`. Move `Dashboard.tsx` to `/comptes/apercu` unchanged for now (sidebar entry "Comptes"), delete the tax toggle immediately. `Events.tsx` as ListRows with selection bar.

**Migration:** None.

**Rationale:** Replaces the 30-page PDF with the interactive planning she asked for; needs only phase 2 fields.

### Phase 4 · Clients and Favoris (1 to 2 weeks)

Tables `ta-clients`, `ta-event-templates`; modules `clients`, `event-templates`; `POST /events/from-template/:id`; `Clients.tsx`, `ClientDetail.tsx`, `FavoritesDialog.tsx`, client select in `EventEditor.tsx`, "Mettre en favori" and date-asking Dupliquer in `EventDetail.tsx`, client chips on Semaine and Jour.

**Migration:** Create the two tables (console or updated `infrastructure/lib/data-stack.ts`), add SSM parameters and `.env` lines per README, `config.service.ts` vars `.optional()` so the API boots before the vars exist. `seed-clients-from-contacts.ts --dry-run` then run, to backfill `clientId` from `contactEmail || contactName`.

**Rationale:** Request 3 (Hoona) in full; also gives the ledger a client dimension.

### Phase 5 · Comptes part 1: journal and export (2 to 3 weeks)

Table `ta-ledger`, `ledger` module, `POST /ledger/from-event/:eventId`, event fields `prestationType`, `vatRate`, `hoursPlanned`, `hoursSpent`, `km`, `extraCosts[].kind`, server-side `costSnapshot` on completion (inject recipes and ingredients services into `EventsModule`). Frontend: `comptes/Journal.tsx` with DataTable and form, Facturation toggle on the event, `lib/accounting.ts`, `lib/ledger-export.ts` (xlsx and CSV), money strip on Semaine. Prestation type and VAT selects in `EventEditor.tsx`.

**Migration:** Create `ta-ledger`, same provisioning steps. `snapshot-completed-events.ts --dry-run` then run to freeze existing completed events at today's prices (logged as approximation). Hand the first export to the accountant before building the views.

**Rationale:** The journal and the export are what the accountant consumes; shipping them first retires the twelve monthly sheets even before the income statement exists.

### Phase 6 · Comptes part 2: views (2 weeks)

`settings.fixedCharges`, `settings.objectives`, widened `updateSettingsRequestSchema` and `SettingsService.update` Pick, `SETTINGS_TTL` 30s. Pages `comptes/Apercu.tsx` (chart moved from Dashboard and recoloured, overview table, mix, period comparison), `Resultats.tsx`, `Previsionnel.tsx`, `Reel.tsx`. Delete `Dashboard.tsx` and `estimateBelgianTax`.

**Migration:** Settings keys optional. A one-off import of the workbook's charge list and 2026 objective can be typed by hand in Prévisionnel (about 30 rows); no script.

**Rationale:** Completes the workbook replacement; every figure is a view over records already captured in phase 5.

### Phase 7 · Remaining pages and optional AI (1 to 2 weeks, as time allows)

`GroceryListPage.tsx` on the design system with `eventIds` and Régénérer, suppliers from settings; `Ingredients.tsx` DataTable; `Settings.tsx` prestation types and supplier colours; optional `ai` module and recipe import from photo if an OpenAI key is provided.

**Migration:** `groceryList.eventIds` optional. `OPENAI_API_KEY` optional SSM parameter.

**Rationale:** Pages already improved by tokens; this phase is polish and can be interleaved with feedback from the earlier phases.

## Risks

- Contrast and colour targets in this proposal are derived from the audit's measurements, not re-measured. Check every token pair with a contrast tool before merging phase 0; the primary fill at `25 55% 44%` darkens the brand orange noticeably and she should see it first.
- Half-migrated design system: between phase 0 and phase 7 some pages use `components/ds` and some do not. Tokens keep them visually close, but the four local Editable* helpers must be deleted page by page or they will drift.
- Whole-array `PATCH` from `EventEditor` can still overwrite line-level edits until the dirty-field autosave ships in phase 2; phases 2 and 3 should not be split across releases.
- `costSnapshot` for already-completed events is an approximation at today's prices; the Compte de résultats shows a "calculé" or "figé" chip so she knows which months are reconstructed.
- Three new tables each need the manual provisioning steps (console, SSM, `.env`, pm2 restart) and the CDK stack is out of date; declaring the env vars optional avoids a boot failure but a forgotten variable makes a whole section return 503.
- VAT defaults per prestation type and the 25 % corporate tax rate are not confirmed with the accountant; both are editable, and the atelier rate in particular should be checked.
- The accountant may want a different column order or a different file; the export reproduces the workbook exactly for that reason, and phase 5 should end with her accountant opening one real export before phase 6 starts.
- `scanAll` on every page stays fine at hundreds of events and about a thousand ledger lines a year; if the journal grows beyond that, add a `ym` GSI, not before.
- Zod `.strict()` on new DTOs rejects unknown keys; the existing non-strict event DTOs stay lenient for one release because `EventEditor` sends `actualCost: null` and older bundles may still be cached in browsers.
- The home page change moves finance two taps away; the money strip on Cette semaine is there so the figures she checks weekly stay visible.
- Removing Playfair below 24px and the uppercase micro-labels changes the brand feel; show her the recipe page from phase 1 before applying the same to lists.
- Not checked: the mobile bottom tab bar's interaction with the full-bleed grocery page and iOS safe areas; test on her phone early in phase 0.
