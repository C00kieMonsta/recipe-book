# Redesign brief: La Table d'Amélie

Internal tool for a Belgian solo caterer. Single admin user (the caterer, Dalia, plus the developer). UI in French. Repo root: `/Users/antoineboxho/Developer/Personal/02_projects/recipe-book`.

## 1. Feedback from the caterer (verbatim, French)

### Contexte: Enobase

- Outil de gestion pour traiteurs, découvert via une pub Instagram
- Cible les indépendants qui gèrent tout seuls et peinent avec leurs outils
- Fonctionnalités incluses: planning, main-d'œuvre, extras, devis, factures, CRM
- Prix: 200€/mois
  - Inclut la migration des fichiers existants et la mise en place complète

### Fonctionnalité Clé: Planning Interactif

- Besoin principal: remplacer le PDF de préparation par une vue interactive
  - Vue d'ensemble de la semaine: planning + chiffre d'affaires
  - Fiches de préparation cliquables par jour (ex: "30 amuse-bouches pour tel client")
  - Pas un PDF de 30 pages, quelque chose de visuel et rapide à lire

### UX et Lisibilité

- Interface actuelle jugée peu agréable
  - Taille de police, couleurs, mise en page: pas user-friendly
  - Dalia a du mal à suivre une recette sur le site
- Référence souhaitée: Notion
  - Notion apprécié pour son côté visuel et intuitif
  - Limite de Notion: pas de calculs, d'où l'intérêt d'Enobase

### Points Ouverts

- Intégration IA: à reclarifier (l'entretien avec le commercial n'est pas clair)
  - Option: intégrer une clé API ou un compte ChatGPT
- Intégration Odoo: mentionnée, mais pas un besoin prioritaire
- Relire les notes de l'entretien avec le commercial Enobase pour clarifier les fonctionnalités IA

### Three concrete requests (verbatim)

1. "chercher les ingrédients doublons (par ex oeuf) et en choisir un et s'assurer que l'autre format soient remplacés dans les recettes"
2. "dans un évenement, pouvoir changer l'ordre des recettes affichées, et les trier par catégorie (apéritif, entrée plat dessert etc)"
3. "hoona: avoir un aperçu de la semaine entière, ou faire jour par jour, le mettre en favori pour ne pas devoir dupliquer à chaque fois?"

### Fourth request: accounting (verbatim)

"We also need a way to have 'Livre des comptes/compte de resultats' in the end, check what is inside this excel file 2026 LIVRE DE RECETTES TABLE D'AMELIE.xlsx to understand the type of structures and tables we need to reflect in the app."

The workbook has been analysed in `docs/redesign/01-livre-des-comptes-excel.md`. Read that file too. In short: a revenue journal per month (invoice number, date, label, TVAC, HTVA, VAT 6/12/21, paid, method, date received, prestation type, KM), a monthly overview against last year and an objective, a revenue mix by prestation type with targets, a monthly income statement (CA, raw material cost, gross margin, fixed charges, extras, profit before tax, tax, net), a fixed-charge list with breakeven and treasury target, a "signed versus target" tracker per month with hours, deposits, and extra staff hours. The company is an SRL (corporate tax), not a sole trader.

## 2. Working interpretation (assumptions to respect unless you find evidence otherwise)

- "Hoona" is a recurring client (likely a company fed weekly, matching the existing recipe category "Menu semaine"). The request is: see that client's week at a glance or day by day, and save the setup as a favorite/template so it is not duplicated by hand every week.
- Course categories (apéritif, entrée, plat, dessert) are a new dimension. The current `recipe.type` values (Buffet, Walking dinner, Lunch, Menu semaine) describe service format, not course. Both may be needed.
- "Fiches de préparation" are per-day prep sheets: for each day, every recipe line (recipe × event × portions), for example "30 amuse-bouches pour Hoona". Today this only exists as PDF output.
- "Le PDF de 30 pages" is the aggregated recipes PDF produced by `generateAggregatedPdf` in `apps/frontend/src/pages/admin/Events.tsx` and `exportRecipesPdf` in `apps/frontend/src/pages/admin/EventDetail.tsx`.
- Readability complaint applies to the whole admin app, with recipe reading (RecipeDetail and RecipeCook) as the worst case.
- Enobase features that matter for a solo caterer are planning and prep. Quotes, full invoicing, CRM and Odoo are out of scope for the first iteration unless a proposal shows they are cheap and high value. Accounting is now in scope (fourth request): the app must replace the workbook's journal, monthly overview, revenue mix, income statement, fixed charges and breakeven, and signed-versus-target tracker. Falco stays the invoicing tool; the app records the ledger line and its payment status, it does not issue the invoice.
- Prestation types (menu à emporter, buffet à emporter, buffet avec service, atelier, brunch, walking/cocktail, chef à domicile) are a third taxonomy, on the event, distinct from recipe categories and from courses.
- Events are the main source of ledger lines (one event, one invoice line, sometimes a deposit first), but the journal also needs lines that are not events: monthly counter sales, Thermomix commissions, gift vouchers.

## 3. Current app (facts)

### Stack

- Monorepo (pnpm). `apps/frontend`: React 18, Vite, React Router v6, Tailwind, lucide icons, jsPDF, xlsx, papaparse. No component library in use (packages/ui exists but is unused).
- `apps/backend`: NestJS 10, DynamoDB document client, S3 for photos, JWT auth. Each entity has its own table with a single string partition key and no sort key or GSI. All reads are `scanAll`.
- `packages/types`: TS entities and Zod DTOs shared by both apps. Must run `pnpm build:types` after editing.
- Deployed: SPA on S3+CloudFront, API on one EC2 with PM2. Live DynamoDB data exists, so schema changes need backward-compatible reads or a migration.

### Key files

| File | Lines | Role |
|---|---|---|
| `packages/types/src/entities/{ingredient,recipe,event,grocery-list,settings}.ts` | ~150 | Entities |
| `packages/types/src/dto/*.ts` | ~170 | Zod schemas |
| `apps/backend/src/{ingredients,recipes,events,grocery-lists,settings}/*.service.ts` | ~440 | CRUD services |
| `apps/backend/src/shared/ddb.service.ts` | 104 | DynamoDB wrapper (get/put/update/scanAll/batchWrite/batchDelete) |
| `apps/frontend/src/App.tsx` | 38 | Routes |
| `apps/frontend/src/components/admin/AdminSidebar.tsx` | 136 | Nav: Tableau de bord, Recettes, Ingrédients, Événements, Listes de courses, Paramètres |
| `apps/frontend/src/lib/api.ts` | 120 | API client with 30s TTL cache |
| `apps/frontend/src/lib/recipe-helpers.ts` | 32 | Cost maths, supplier colours |
| `apps/frontend/src/index.css` + `tailwind.config.ts` | | Design tokens: warm beige palette, Playfair Display headings, DM Sans body |
| `apps/frontend/src/pages/admin/Dashboard.tsx` | 446 | KPIs, monthly revenue/margin SVG chart, Belgian tax estimate, recent events table, grocery lists |
| `apps/frontend/src/pages/admin/Recipes.tsx` | 379 | Card grid, search, type filter, CSV/JSON import, Excel export |
| `apps/frontend/src/pages/admin/RecipeDetail.tsx` | 819 | Inline-editable recipe: steps, ingredients table, pricing simulation, PDF export |
| `apps/frontend/src/pages/admin/RecipeEditor.tsx` | 333 | Form editor (name, photos, steps, ingredients, pricing) |
| `apps/frontend/src/pages/admin/RecipeCook.tsx` | 147 | Full-screen step-by-step cook mode with portion scaling |
| `apps/frontend/src/pages/admin/Ingredients.tsx` | 310 | Table, supplier filter, CSV import, naive dedupe |
| `apps/frontend/src/pages/admin/Events.tsx` | 547 | Table, multi-select → grocery list or aggregated recipes PDF, "Planning semaine" modal (current week only, read-only list, PDF button) |
| `apps/frontend/src/pages/admin/EventEditor.tsx` | 360 | Autosaving form: info, contact, recipes with portions, extra costs, financial summary |
| `apps/frontend/src/pages/admin/EventDetail.tsx` | 494 | Inline-editable event: stats, notes, recipes table, extra costs, PDF |
| `apps/frontend/src/pages/admin/GroceryListPage.tsx` | 613 | Sidebar of saved lists + detail grouped by supplier, stock vs need, PDF/CSV/copy |
| `apps/frontend/src/pages/admin/Settings.tsx` | 219 | Recipe categories list, suppliers list |

### Data model (today)

```ts
Ingredient { ingredientId, name, nameLower, price, unit: "€/kg"|"€/pièce"|"€/l"|"€/botte", supplier, comment?, createdAt, updatedAt }
Recipe { recipeId, name, nameLower, type: string, portions, portionWeight, description?, techniques: string[], ingredients: {ingredientId, qty, unit: "g"|"pièce"|"ml"|"botte", lossPct}[], photos: {key,label,url?}[], pricing: {surPlace:{coef,tva}, takeAway:{coef,tva}, chosenPrice:{surPlace,takeAway}}, createdAt, updatedAt }
AppEvent { eventId, name, nameLower, date: "YYYY-MM-DD", guestCount, recipes: {recipeId, portions}[], extraCosts: {label,amount}[], sellingPricePerGuest, notes?, contactName?, contactPhone?, contactEmail?, actualCost?, status: "upcoming"|"completed", createdAt, updatedAt }
GroceryList { listId, title, items: {ingredientId,name,totalQty,unit,supplier,pricePerUnit,priceUnit,checked,haveQty?}[], createdAt, updatedAt }
AppSettings { settingsId: "global", recipeCategories: string[], suppliers: {name,address?,phone?}[], updatedAt }
```

Cost maths: `calcIngredientLineCost = qty × (1 + lossPct/100) × pricePerUnit` where €/kg and €/l are divided by 1000 to match g and ml. Event cost = Σ (recipeCost / recipe.portions) × line.portions + extra costs. Revenue = sellingPricePerGuest × guestCount.

### Weaknesses already identified by the developer

- `IngredientsService.deduplicate` keeps the newest ingredient per `nameLower` and deletes the rest without remapping `recipe.ingredients[].ingredientId`, so recipes silently lose lines (RecipeDetail skips unknown ingredients with `if (!ing) return null`). It also only matches exact lower-cased names, so "Oeuf", "Oeufs", "Œuf" and "oeuf (pièce)" are not grouped.
- `event.recipes` is an unordered array of `{recipeId, portions}`; no course, no order, no per-line notes, no prep status.
- No client/customer entity; contact fields are copied per event. No template or recurrence concept; "Dupliquer" copies an event with today's date.
- Week planning is a modal in Events.tsx limited to the current week, not navigable, not clickable, and its only action is a PDF.
- Home page is a finance dashboard, not "what do I cook this week".
- Typography is dense: most body text is `text-sm` or `text-xs`, tables everywhere, uppercase tracking-wider labels, muted greys on beige. Cook mode is the only large-type screen.
- Recipe categories are service formats (Buffet, Walking dinner, Lunch, Menu semaine); there is no course dimension.
- Every list page does `scanAll`; fine at current scale (hundreds of items) but worth noting for any new access pattern.
- `estimateBelgianTax` in Dashboard.tsx models a sole trader (social contributions, personal income tax brackets). The business is an SRL; the workbook models corporate tax at 15 to 25 % with the owner's salary and social contributions as fixed charges. The current net-margin toggle is therefore wrong for this business.

## 4. Constraints

- Solo developer, limited time. Prefer changes that ship in slices on the existing stack (React, Tailwind, NestJS, DynamoDB). A full rewrite or a framework switch must be justified against that.
- Live data in DynamoDB. New fields must be optional on read or come with a one-off migration script.
- Must work on a phone or tablet in the kitchen (wet hands, glanceable) and on a laptop for planning.
- French UI labels. Plain English in docs and code.
- Keep the costing and margin maths; they are the reason to use this instead of Notion.
- AI: the caterer may provide an OpenAI key or ChatGPT account. Treat AI as optional and keep any proposal concrete (what input, what output, where in the UI).
- Accounting must be exportable (xlsx or CSV) in a shape the accountant accepts, and must never silently change a historical figure: ledger lines are records, derived reports are views.

## 5. What the redesign must answer

1. Information architecture: what is the home screen, what is the navigation, what screens exist.
2. Interactive planning: week overview with revenue, day view, clickable prep sheets per recipe line, replacing the aggregated PDF.
3. Readability: a design system (type scale, spacing, colour, components) that reads like Notion, applied to recipe reading first.
4. Ingredient merge: find duplicates (fuzzy), pick a survivor, remap every recipe and grocery list, then delete the rest.
5. Event recipe ordering and course grouping (apéritif, entrée, plat, dessert, and so on), with manual reorder.
6. Recurring client setups ("Hoona"): weekly view, day-by-day, favorite/template to avoid duplicating by hand.
7. AI: a concrete, optional proposal or an explicit "not now".
8. Accounting ("Livre des comptes / compte de résultats"): the entities, screens and reports that replace the workbook, how events feed the journal, how raw material cost feeds the income statement, how fixed charges, objectives and breakeven are stored, what the Dashboard becomes, and the export for the accountant.
9. A phased roadmap that a solo developer can ship incrementally, with data migrations called out.
