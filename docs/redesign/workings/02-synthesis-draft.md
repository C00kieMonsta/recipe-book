# Plan de refonte: La Table d'Amélie

## 1. Summary

The home screen becomes the week: seven days, every recipe line with its client and portions, signed revenue per day, and one tap from a line to a prep sheet that reads the recipe at the event's portions in large type. The finance dashboard, the week modal and the aggregated PDF go away; the Comptes section replaces the Excel workbook with a journal, a monthly overview, an income statement, a forecast and a signed-versus-target tracker, all views over an append-only ledger plus effective-dated settings. The design system (16px body, 18px recipe text, darker muted grey, a primary that passes 4.5:1, sentence-case labels, 44px targets) ships first because tokens change every page in a day. The ingredient merge is rebuilt as remap-then-delete with a fuzzy finder and a chosen survivor, replacing the destructive `deduplicate`. Event lines get a stable `lineId`, a course and a prep status; array order is the order. Recurring clients get a `Client` record with embedded weekly templates, so Hoona is set up once and instantiated per week with an idempotent call. Two new DynamoDB tables (`ta-clients`, `ta-ledger`); everything else is optional fields or settings keys, with one migration runner. Order of delivery: readable recipes and the merge (weeks 1-2), courses and the week view (3-4), clients and templates (5-6), journal and export (7-8), reports and polish (9-11). The single-event-single-invoice assumption is dropped: a ledger entry can cover several events, which is how the workbook already invoices office lunches. Three accounting defaults (atelier VAT, corporate tax rate, VAT on deposits) are editable and flagged for the accountant before the first export.

## 2. What the caterer asked for, mapped to decisions

| Feedback item | Decision | Where |
|---|---|---|
| Replace the 30-page prep PDF with an interactive week view, planning plus revenue | `/semaine/:isoWeek` is the home; seven columns on laptop, stacked days on phone, signed revenue per day and week, month progress bar | 3, 5.1, 7.1 |
| Clickable prep sheets per day ("30 amuse-bouches pour tel client") | `/jour/:date` lists every line by event, course or recipe; `/events/:eventId/lines/:lineId` is the scaled reading sheet with a status control | 5.2, 5.3, 7.1 |
| Font size, colours, layout not user-friendly; hard to follow a recipe | Token pass in `index.css` and `tailwind.config.ts`, 720px reading column, `RecipeReader` shared by the prep sheet and `/recipes/:id`, cook mode rewrite | 4, 5.4, 5.5, 7.2 |
| Notion as the reference | Documents not boxes: headings and whitespace, one accent colour, soft tints, collapsible `SectionToggle`, light sidebar, breadcrumbs | 4 |
| Request 1: duplicate ingredients, pick one, replace in recipes | `GET /admin/ingredients/duplicates` (fuzzy), `/ingredients/doublons` page, `POST /admin/ingredients/merge` remap-then-delete, `aliases` on the survivor | 5.10, 7.3 |
| Request 2: reorder recipes in an event, sort by course | `lineId`, `course` on the line, `settings.courses`, array order, `PUT /admin/events/:id/lines` with set check, ▲▼ on phone and drag on laptop | 5.7, 6, 7.4 |
| Request 3: Hoona weekly view, day by day, favourite to stop duplicating | `Client` table with `templates[]` per weekday, `POST /admin/clients/:id/instantiate`, client chip on the week, four-week grid on the client page | 5.11, 7.5 |
| Request 4: Livre des comptes / compte de résultats | `ta-ledger` table, settings keys for fixed charges and objectives, five Comptes pages, xlsx export in the workbook's columns, SRL tax model | 5.12 to 5.16, 7.6 |
| Enobase: planning, main-d'œuvre, extras, devis, factures, CRM at 200 €/month | Planning and prep now; extras as ledger purchase lines; a one-day "Proposition de menu" PDF instead of quotes; invoices stay in Falco; CRM is the thin client record; Odoo never | 7.8 |
| AI integration unclear | Not now for the core; one optional recipe import from photo or text behind an optional key | 7.7 |

## 3. Information architecture

### Home

`/` redirects to `/semaine/<current ISO week>`. The week is the home on every device.

### Sidebar (laptop)

Edit `menuItems` in `apps/frontend/src/components/admin/AdminSidebar.tsx`, in this order:

| Label | Route | Icon (lucide) | Slice |
|---|---|---|---|
| Semaine | `/semaine` (active for `/semaine/*`, `/jour/*`, `/events/:id/lines/*`) | CalendarDays | 2 |
| Événements | `/events` | Calendar | existing |
| Recettes | `/recipes` | BookOpen | existing |
| Ingrédients | `/ingredients` (includes `/ingredients/doublons`) | ClipboardList | existing |
| Courses | `/grocery-list` | ShoppingCart | existing, renamed |
| Clients | `/clients` | Users | 3 |
| Comptes | `/comptes/journal` | Landmark | 4 |
| Finances (ancien) | `/finances` | BarChart3 | 2 to 4 only |
| Paramètres | `/settings` | Settings | existing |

The sidebar switches from the near-black brown to a light tinted panel (tokens in section 4). The version string at `AdminSidebar.tsx:94` moves to Paramètres.

### Phone

A bottom tab bar (`apps/frontend/src/components/admin/MobileTabBar.tsx`, new) with Semaine, Événements, Recettes, Courses and Plus. Plus opens a sheet with Clients, Ingrédients, Comptes, Paramètres, Déconnexion. The 52px top bar shows a breadcrumb and the page title instead of the logo and hamburger. `AdminLayout.tsx` keeps `pt-[68px]` on phones and adds `pb-[64px]`; cook mode hides both bars.

### Screens and routes

| Screen | Route | Status |
|---|---|---|
| Semaine | `/semaine/:isoWeek` | new |
| Jour | `/jour/:date` | new |
| Fiche de préparation | `/events/:eventId/lines/:lineId` | new |
| Cuisiner | `/recipes/:id/cook?portions=&event=&line=` | changed |
| Recette (lecture) | `/recipes/:id` | changed, read mode default |
| Recette (édition) | `/recipes/:id?mode=edit`, `/recipes/:id/edit` | existing JSX |
| Recettes | `/recipes` | restyled |
| Événement | `/events/:id` | changed |
| Événement (édition) | `/events/new?date=&client=`, `/events/:id/edit` | changed |
| Événements | `/events` | restyled, sort fix |
| Courses | `/grocery-list`, `/grocery-list?id=` | restyled |
| Doublons d'ingrédients | `/ingredients/doublons` | new |
| Clients, Client | `/clients`, `/clients/:id` | new |
| Comptes | `/comptes/journal`, `/comptes/apercu`, `/comptes/resultats`, `/comptes/previsionnel`, `/comptes/au-reel` | new |
| Finances (ancien) | `/finances` | moved `Dashboard.tsx`, deleted in slice 4 |
| Paramètres | `/settings` | extended |

### Removed or merged

- `Dashboard.tsx` moves to `/finances` in slice 2 and is deleted in slice 4 with `estimateBelgianTax` (lines 308 to 325), the tax toggle and the override input. Its chart is rebuilt in Aperçu over ledger HTVA. Note the in-place `events.sort(...)` on the state array at `Dashboard.tsx:49`; the file is deleted so it is not fixed separately.
- `WeekPlannerModal`, `generateAggregatedPdf`, `startOfWeekMonday`, `endOfWeekSunday` in `Events.tsx` are deleted; `exportRecipesPdf` in `EventDetail.tsx` is deleted. Paper comes from the day view.
- The "Dédoublonner" menu item (`Ingredients.tsx:105`) and `POST /admin/ingredients/deduplicate` are removed.
- The clickable status pill in the events list is removed; status changes on the event page.
- Breadcrumbs on every detail page replace `navigate(-1)` ("Retour") at `RecipeDetail.tsx:263` and `EventDetail.tsx:192`.
- Accounting lives under Comptes, with the money strip (four tiles) on the week header once the ledger exists.

## 4. Design system

### Type scale

Add to `theme.extend.fontSize` in `apps/frontend/tailwind.config.ts`:

| Token | Size / line height | Use |
|---|---|---|
| `text-caption` | 13px / 1.4 | timestamps, table footnotes; nothing smaller anywhere |
| `text-sm` | 14px / 1.5 | tags, table numerics, secondary list lines |
| `text-base` | 16px / 1.6 | body, inputs, list titles, form labels |
| `text-lead` | 18px / 1.6 | recipe steps, ingredient lines, prep lines |
| `text-h3` | 20px / 1.3, weight 600 | section headings, DM Sans |
| `text-h2` | 24px / 1.25 | recipe names in cards, cook title, Playfair |
| `text-h1` / `md:text-h1-lg` | 32px / 1.15, 40px / 1.1 | page titles, Playfair |
| `text-cook` / `md:text-cook-lg` | 28px / 1.4, 36px / 1.35 | current cook step, Playfair |

Playfair only at 24px and above. Remove `h1, h2, h3, h4, h5, h6 { @apply font-serif; }` from `index.css` and apply `font-serif` explicitly in `PageHeader` and the reader. Delete the 14 `text-[10px]` and `text-[11px]` uses (Dashboard 4, GroceryListPage 6, Ingredients 2, RecipeDetail 1, Recipes 1). Delete `uppercase tracking-wider` (57 `uppercase` hits under `pages/admin`); labels become sentence case.

### Spacing

8 / 16 / 24 / 40 / 64. `maxWidth.doc = 44rem` (704px) for reading pages, `maxWidth.wide = 72rem` for tables and the week grid. `spacing.block = 2.5rem` between sections. List rows `min-h-12 py-3`. Tap targets `min-h-11 min-w-11` (44px) on every control of the week, day, prep sheet, cook and grocery pages. `.input-field` at `text-base py-2.5` so iOS stops zooming.

### Colour roles

The warm palette stays; the greys and the primary get darker so they pass 4.5:1 on beige. Exact replacement of the `:root` block in `apps/frontend/src/index.css`:

```css
:root {
  --background: 30 30% 97%;   --foreground: 20 20% 13%;
  --card: 30 40% 99%;         --card-foreground: 20 20% 13%;
  --popover: 30 40% 99%;      --popover-foreground: 20 20% 13%;
  --surface: 30 20% 94%;      /* sidebar, tiles */
  --hover: 30 15% 93%;        /* row hover */
  --muted: 30 15% 93%;        --muted-foreground: 20 10% 38%;   /* about 5.9:1 on background */
  --primary: 25 55% 44%;      --primary-foreground: 0 0% 100%;  /* about 4.6:1 */
  --primary-soft: 25 60% 93%;
  --secondary: 30 25% 90%;    --secondary-foreground: 20 25% 25%;
  --accent: 25 60% 60%;       --accent-foreground: 0 0% 100%;
  --success: 150 35% 30%;     --success-soft: 150 30% 92%;
  --warning: 35 75% 34%;      --warning-soft: 40 80% 92%;
  --info: 210 30% 38%;        --info-soft: 210 40% 93%;
  --destructive: 0 60% 42%;   --destructive-foreground: 0 0% 100%; --destructive-soft: 0 70% 94%;
  --border: 30 20% 88%;       --input: 30 20% 80%;  --ring: 25 55% 44%;
  --radius: 0.625rem;
  --sidebar-background: 30 20% 94%;  --sidebar-foreground: 20 20% 13%;
  --sidebar-primary: 25 55% 44%;     --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 25 60% 90%;      --sidebar-accent-foreground: 20 20% 13%;
  --sidebar-border: 30 20% 86%;      --sidebar-ring: 25 55% 44%;
}
```

Rules: text on a tint is always the dark role colour, never the colour on beige. `text-green-600`, `bg-blue-100`, `bg-amber-*` and the hex constants `COLOR_MARGIN = "#16a34a"` and `COLOR_TREND = "#0f766e"` in `Dashboard.tsx` are replaced by these tokens. Supplier colours move from `SUPPLIER_COLORS` in `recipe-helpers.ts` to `settings.suppliers[].color`, with a hash into an eight-colour accessible set as fallback, rendered as a tag with dark text on a tint. The values above are targets derived from the audit's measurements; run `scripts/check-contrast.mjs` (a 20-line script over the token pairs) before merging.

### Base layer and components in `index.css`

```css
@layer base {
  html { font-size: 16px; }
  * { @apply border-border; }
  body { @apply bg-background text-foreground font-sans antialiased text-base; }
}
@layer components {
  .card-elevated { @apply bg-card rounded-xl border border-border/60; }   /* tiles and gallery cards only */
  .input-field { @apply w-full px-3 py-2.5 border border-input rounded-lg text-base bg-card focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none; }
  .input-compact { @apply px-2 py-1.5 text-sm; }
  .reveal { @apply pointer:opacity-0 pointer:group-hover:opacity-100 touch:opacity-70; }
}
@media print {
  aside, nav, .no-print { display: none !important; }
  body { font-size: 12pt; }
  .print-break { break-before: page; }
}
```

### `tailwind.config.ts` edits

```ts
theme: {
  extend: {
    fontSize: { caption: ["13px", "1.4"], lead: ["18px", "1.6"], h3: ["20px", { lineHeight: "1.3", fontWeight: "600" }], h2: ["24px", "1.25"], h1: ["32px", "1.15"], "h1-lg": ["40px", "1.1"], cook: ["28px", "1.4"], "cook-lg": ["36px", "1.35"] },
    maxWidth: { doc: "44rem", wide: "72rem" },
    spacing: { block: "2.5rem", tap: "2.75rem" },
    colors: {
      // existing entries unchanged, plus:
      surface: "hsl(var(--surface))", hover: "hsl(var(--hover))",
      primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))", soft: "hsl(var(--primary-soft))" },
      success: { DEFAULT: "hsl(var(--success))", soft: "hsl(var(--success-soft))" },
      warning: { DEFAULT: "hsl(var(--warning))", soft: "hsl(var(--warning-soft))" },
      info: { DEFAULT: "hsl(var(--info))", soft: "hsl(var(--info-soft))" },
      destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))", soft: "hsl(var(--destructive-soft))" },
    },
  },
},
plugins: [
  require("tailwindcss-animate"),
  function ({ addVariant }) { addVariant("touch", "@media (hover: none)"); addVariant("pointer", "@media (hover: hover)"); },
],
```

### Component primitives (`apps/frontend/src/components/ui/`)

```ts
PageHeader({ breadcrumb?: { label; to? }[], title, meta?, actions? })  // h1 font-serif text-h1
Section({ title, meta?, action?, children })                          // h2 text-h3, mt-block
Tag({ variant: "neutral"|"primary"|"success"|"warning"|"info"|"danger"|"supplier", children })
StatusTag({ status: "upcoming"|"completed"|"invoiced"|"paid" })      // non-interactive
ListRow({ leading?, title, subtitle?, trailing?, onClick? })           // min-h-12, text-base title
StatusControl({ value: PrepStatus, onChange })                         // three 44px segments
Stepper({ value, onChange, min?, label? })                             // 44px buttons
SectionToggle({ title, defaultOpen?, storageKey?, children })          // Notion disclosure
InlineField({ value, onSave, type, size?, options?, suffix? })         // replaces EditableText, EditableInlineNum, EditableInlineText, EditableType, EditableNum
DataTable<T>({ columns, rows, rowKey, footer?, mobile: "cards"|"scroll", cardTitle? })
FieldLabel({ children })                                               // text-base font-medium, shared by EventEditor, RecipeEditor, IngredientFormModal, LoginPage
MoneyTile({ label, value, sub?, progress? })
RecipeReader({ recipe, ingredientById, ratio, showCost? })
```

### Phone versus laptop rules

- Reading pages (recipe, prep sheet, day, event) are one `max-w-doc` column at every width; the week is the only seven-column layout and it stacks on phones.
- Tables exist only in `DataTable` and only on `md+`; below `md` every table renders cards. Costing tables (recipe cost, journal, income statement) are the only tables kept.
- Hover-revealed controls use `.reveal`; on touch they stay visible at 70%. Destructive actions live in edit modes, never on reading surfaces.
- `AdminLayout` exposes `fullBleed` through outlet context so `GroceryListPage.tsx:576` drops `-m-6` and sizes with `h-[calc(100dvh-52px-64px)] md:h-[100dvh]`.
- Fix the invalid `h-22` at `RecipeDetail.tsx:306` by showing the first photo full width (`aspect-[3/2]`).
- `scripts/check-type-scale.sh` greps `pages/admin` for `text-xs`, `text-[10px]`, `text-[11px]` and `uppercase tracking-wider` and fails lint when any appear.

## 5. Screens

### 5.1 Semaine (home)

Route `/semaine/:isoWeek`, for example `/semaine/2026-W42`. File `apps/frontend/src/pages/admin/Week.tsx`.

Purpose: what is cooked this week, for whom, and what it is worth.

Header: `‹ Semaine 42 ›` with 44px arrows, "13 au 19 octobre", an "Aujourd'hui" link, and from slice 3 a chip row "Tous · Hoona · Mariage Dupont" when any event has a `clientId`. Below it the money strip: slice 2 shows "Signé cette semaine" (Σ `sellingPricePerGuest × guestCount` for events dated in the week) and "Préparation 18 / 40 lignes faites"; slice 4 adds "CA du mois" (Σ ledger sales HTVA month to date with the objective as a progress bar), "À encaisser" (count and Σ TVAC of unpaid sales entries) and "Marge brute du mois %".

Laptop (≥1024px): `grid grid-cols-7 gap-3` inside `max-w-wide`. Column header "Mar 14" at `text-h3` with "2 événements · 60 conv. · 1 240 €"; today's header has a `primary-soft` background. One card per event (72px): name at `text-base font-medium`, prestation `Tag`, guests, a 4px progress bar of lines done. Under the card, the event's lines in course order as 36px rows at `text-sm`: status dot, recipe name, portions bold. Lines beyond five collapse into "+ 4 lignes". A header toggle "Lignes / Événements" (persisted with `useLocalStorage`) collapses all lines for an overview. Lines whose `prepDate` differs from the event date render under the prep day with a "→ sam." suffix. Columns scroll inside `max-h-[calc(100dvh-220px)]`; the header stays fixed. Six events and forty lines fit: the tallest column is about 3 × 72 + 15 × 36 px plus collapsed rows.

Phone: days stacked, today expanded, other days a 56px row "Mar 14 · 2 évén. · 60 conv. · 3/12 faites" that expands in place with a sticky day header. Rows are 48px at `text-base`. The money strip scrolls horizontally.

Interactions: prev/next week and ← → keys; tap a day header → `/jour/:date`; tap an event card → `/events/:id`; tap a line → prep sheet; long-press (touch) or hover (pointer) a line shows `StatusControl`, writing `PATCH /admin/events/:id/lines/:lineId { prepStatus }`; "+" on a day → `/events/new?date=`, and from slice 3 "Depuis un favori"; "Courses de la semaine" → `/grocery-list/new?from=&to=`; "Créer la semaine Hoona" banner when a client has weekday templates and no event in the displayed week (slice 3); "PDF du jour" per column during the transition.

### 5.2 Jour (prep sheet list)

Route `/jour/:date`. File `Day.tsx`.

Purpose: every recipe line to prepare that day, grouped the way the kitchen works, with status.

Layout: breadcrumb "Semaine 42 / Mardi 14 octobre", title at `text-h1` Playfair, meta "2 événements · 60 convives · 12 lignes · 3 faites". Segmented control: **Par événement** (default), **Par service** (courses from settings), **Par recette**. Buttons "Courses du jour", "Imprimer", "PDF du jour". One `max-w-doc` column. Group headings at `text-h3` with a count on the right. Each line is a 56px row: `StatusControl` on the left (44px), recipe name at `text-lead`, second line "Apéritif · note" at `text-sm` muted, portions bold at `text-lead` on the right, a chevron. Done lines are dimmed and sorted last; "Masquer les lignes faites" hides them. In **Par recette** mode the merged quantity shows the breakdown underneath ("Mini quiches · 80 portions", then "Hoona 30 · Mariage Dupont 50"), a single status control that writes to every underlying line, and a `SectionToggle` "Ingrédients pour 80" with the scaled ingredient list on screen, not only in print.

Phone: same column, sticky group headings, status control reachable with the thumb, mode control as a dropdown, swipe for prev/next day.

Print: `@media print` hides chrome, one page per group (`.print-break`), 12pt body, expanded lines; in Par recette mode the scaled ingredient table prints under each recipe. "PDF du jour" builds the same structure with jsPDF at 11pt (`apps/frontend/src/lib/pdf/day-pdf.ts`) for the first months, because iOS Safari page breaks are not reliable; it is removed when Dalia stops using it.

### 5.3 Fiche de préparation (prep sheet)

Route `/events/:eventId/lines/:lineId`. File `PrepSheet.tsx`.

Purpose: "30 amuse-bouches pour Hoona": read one recipe at the line's portions, track status, add a note. This is the recipe reading screen the complaint is about.

Layout: breadcrumb "Mardi 14 oct / Hoona". Title: recipe name at `text-h1`. Summary at `text-lead`: "**30 portions** pour Hoona · Apéritif" with "(recette de base : 10)" at `text-sm`. Body is `RecipeReader` in a `max-w-doc` column, no cards: photo `aspect-[3/2]` if any; **Ingrédients** heading with a `Stepper` above a two-column list at `text-lead` (48px rows, name left, quantity bold with unit muted right), quantities scaled with `scaleQty(qty, ratio)` moved from `RecipeCook.tsx:45` to `packages/types/src/lib/costing.ts`; **Préparation** as numbered steps at `text-lead leading-relaxed`, 32px badge, `space-y-5`, left-aligned, selectable; **Note pour cette fois** textarea at `text-base` saved on blur to `line.notes`; a collapsed `SectionToggle` "Coût matières" with the cost table at `text-sm`. A sticky bottom bar: `StatusControl` (À préparer / En cours / Fait, 48px) and a "Cuisiner" button.

Laptop ≥1280px: ingredients 320px left, steps right, status bar as a sticky right card. Phone: single column, status bar fixed above the tab bar, an "Ingrédients ▾" pill pinned under the top bar once the user scrolls into the steps.

Interactions: status writes `PATCH .../lines/:lineId { prepStatus }`; marking Fait navigates back to the day with a toast "Mini quiches faites" and a "Suivante" action opening the next À préparer line; "Cuisiner" → `/recipes/:recipeId/cook?portions=30&event=&line=`; the stepper rescales locally and shows "Enregistrer 36 portions" when it differs from the line, writing `{ portions }` only when tapped; ← → and swipe move to the previous or next line of the day; `navigator.wakeLock.request("screen")` on mount, released on unmount. No inline editing of the recipe; "Modifier la recette" in the overflow goes to `/recipes/:id?mode=edit`.

### 5.4 Cuisiner (cook mode)

Route `/recipes/:id/cook?portions=30&event=:eventId&line=:lineId`. File `RecipeCook.tsx`, rewritten.

Layout: header 64px with "Quitter" (44px), recipe name at `text-h2` Playfair, "pour Hoona · 30 portions" when `event` is present, `Stepper` prefilled from `?portions` (`useSearchParams`, `setCookPortions(Number(portions) || r.portions)` instead of line 19), "Étape 4 / 9". Tablet and laptop (`md+`): `grid md:grid-cols-[320px_1fr]`, ingredients pinned left at `text-lead` (each row tappable to tick off), steps right with the current step at `text-cook md:text-cook-lg` Playfair left-aligned and the others at `text-lead` muted; tap any step to jump. Phone: one column of steps with the current step enlarged, the previous step above at `text-base` muted for context, a 56px "Ingrédients (12)" bar that opens a bottom sheet with the scaled list. Footer: Précédent and Suivant at 56px, no dot strip. `select-none` removed from line 52; portion buttons 44px instead of `w-7 h-7`.

Interactions: ← → keys and swipe; space is unbound because it scrolls; Escape exits; wake lock on mount; last step shows "Marquer fait" when `line` is present, which writes `prepStatus: "done"` and returns to the day sheet, otherwise "Terminer" returns to the recipe.

### 5.5 Recette (lecture et édition)

Routes `/recipes/:id` (read, default) and `/recipes/:id?mode=edit`.

Read mode renders `RecipeReader` in a `max-w-doc` column: breadcrumb "Recettes / Tarte au citron", first photo full width, title at `text-h1`, meta row of `Tag`s (category with optional emoji from `settings.categoryIcons`, portions, g/pers), description at `text-base`, ingredients list with a `Stepper` defaulting to `recipe.portions`, steps at `text-lead`. Then two collapsed `SectionToggle`s: "Coût matières" (today's six-column table at `text-sm`, `DataTable` with card fallback) and "Simulation de prix" (`PricingSimulation` unchanged). Header actions: "Cuisiner" (primary), "Modifier", overflow with Dupliquer, Exporter PDF (bumped to 11pt body), Supprimer. Phone: sticky bottom bar with Cuisiner and Modifier.

Edit mode keeps today's `RecipeDetail.tsx` JSX in slice 1 so nothing is lost, with a "Terminé" button back to read mode. In slice 5 the four Editable* helpers (duplicated across `RecipeDetail.tsx` and `EventDetail.tsx`) are replaced by `InlineField`, which shows a pencil on hover (pointer) or at 70% on touch, so the pencil and not the text is the target. Reading surfaces never have click-to-edit text.

### 5.6 Recettes (liste)

Route `/recipes`. Laptop keeps the three-column card grid: photo `aspect-[3/2]` or a 160px tinted block with the category icon at 48px, name at `text-h2` Playfair, description at `text-sm` two lines, meta at `text-sm`. Phone switches to full-width `ListRow`s with a 64px thumbnail. Category chips come from `settings.recipeCategories` plus values found on recipes (as `Recipes.tsx:85` already unions them). Import and export modals keep their logic, restyled with `FieldLabel` and `text-base` inputs. Search sticky under the top bar on phones.

### 5.7 Événement

Route `/events/:id`. File `EventDetail.tsx`.

Layout: breadcrumb "Événements / Hoona · mardi 14 oct". Title at `text-h1`; meta line "Mardi 14 octobre · 30 convives · Buffet à emporter · Hoona" with the client name linking to `/clients/:id`; `StatusTag` À venir / Terminé plus derived "Facturé n° 2026-014" and "Payé le 3/11" from linked ledger entries (slice 4). Four `MoneyTile`s (Coût matières with a source note "figé le 18/10" or "estimé", Revenu HTVA, Marge, Marge %) using the shared `calcEventCost`. Sections separated by whitespace, no cards:

- **Menu**: one block per course in `settings.courses` order; each line a 56px row with a drag handle (pointer) or ▲▼ buttons (touch, 44px), recipe name at `text-base`, portions `InlineField`, status dot, course select, overflow (Note, Date de préparation, Cuisiner, Retirer). "+ Recette" opens the existing `SearchSelect` and prefills the course from `recipe.defaultCourse`.
- **Coûts supplémentaires**: label, `kind` select (Matière, Personnel, Location, Transport, Autre), amount.
- **Heures et déplacements** (slice 4): hoursPlanned, hoursSpent, km, serviceTime.
- **Facturation** (slice 4): linked entries with paid tags; buttons "Enregistrer un acompte", "Créer la facture"; red tag "Type de prestation manquant" when `prestationType` is absent.
- **Notes**.

Primary action: "Terminer l'événement" replaces the status pill; it PATCHes `status: "completed"` and the server writes the cost snapshot. Overflow: Modifier, Dupliquer (asks for a date instead of using today, `EventDetail.tsx:81`), Enregistrer comme modèle (slice 3), Proposition de menu PDF (slice 5), Supprimer. Phone: tiles 2×2, course blocks collapsible, ▲▼ only.

### 5.8 Événements (liste) and éditeur

`/events`: `ListRow`s instead of the eight-column table: name at `text-base`, "Mar 14 oct · 30 conv. · Hoona · Buffet à emporter" at `text-sm`, revenue HTVA and `StatusTag` on the right. Filter chips À venir (sorted ascending, fixing `Events.tsx:45`), Terminés (descending), Tous; client select; search. The checkbox column, the trash icon and the "Liste de courses (n)" action go; grocery lists come from the week or day view. No clickable status.

`/events/new?date=&client=` and `/events/:id/edit`: `EventEditor.tsx` keeps autosave but `buildPayload` (line 66) sends only fields changed since load (a `dirty` set compared against a `loadedRef`), sends `recipes` only when a line was added or removed in the editor, and includes `expectedUpdatedAt`; a 409 shows "Modifié ailleurs, recharger". New fields: client picker (creates a client inline, copies `defaultPrestationType`, `defaultVatRate`, `defaultPricePerGuest` into empty fields), prestation type (required for new events, defaults VAT), VAT rate, course select next to portions, extra cost kind. The `addRecipe` duplicate guard at line 136 becomes a confirmation once lines have ids. Inputs at `text-base`.

### 5.9 Courses

`/grocery-list/new?from=&to=`: a short generation form prefilled from the query: date range, the events found in range with a checkbox each (all on), "Exclure les lignes déjà faites", a title "Courses · semaine 42", a supplier-grouped preview, "Créer la liste". Generation uses `buildGroceryItems(events, lines, recipes, ingredientById)` in `apps/frontend/src/lib/grocery.ts`, the body of `generateGroceryList` (`Events.tsx:81-134`) with lines selected by `(line.prepDate ?? event.date)` in range; the list is created with `eventIds` and `range`; the `recipe-book:grocery-list-pending` localStorage hand-off (`Events.tsx:127`, `GroceryListPage.tsx:21`) is deleted.

`/grocery-list?id=`: `GroceryListPage.tsx` uses the card layout at every breakpoint (48px rows, full-row tap toggles checked, name at `text-base`, "à acheter" quantity bold, stock input revealed by a tap, drag between suppliers on pointer, "Déplacer vers" select on touch), supplier headers as `Tag`s, export actions behind a labelled `ActionMenu`, suppliers from `api.settings.get()` instead of `DEFAULT_SUPPLIERS` (line 46), and a banner "3 événements modifiés depuis la génération · Régénérer" when any linked event's `updatedAt` is newer than the list. Régénérer keeps `checked` and `haveQty` by `ingredientId`.

### 5.10 Doublons d'ingrédients

Route `/ingredients/doublons`. File `IngredientDuplicates.tsx`. Linked from a banner on `/ingredients` ("12 doublons probables · Fusionner").

Layout: a `max-w-doc` column of groups. Group header: the normalised key ("oeuf"), a confidence `Tag` (Identique, Proche, À vérifier), "4 variantes · 23 recettes". One row per candidate: radio "Conserver" (44px), name, price and unit, supplier, "dans 12 recettes · 2 listes", updated date. Candidates whose unit family differs from the chosen survivor are greyed with "Unité différente (€/pièce vs €/kg): modifier d'abord" and cannot be included. Footer: "Fusionner dans Oeufs" and "Ignorer ce groupe". A search box builds a manual group from two arbitrary ingredients. A top bar shows "12 groupes · 29 ingrédients".

Interactions: "Fusionner" calls `POST /admin/ingredients/merge { survivorId, mergedIds }` and shows "23 recettes et 2 listes mises à jour, 3 ingrédients supprimés"; on 207 the group stays open with the failure list and "Réessayer"; "Ignorer" stores the key in `settings.ignoredDuplicateGroups`. `IngredientFormModal` runs `normalizeIngredientName` against the loaded list on create and shows "Semblable à : Oeufs · Utiliser" before saving.

### 5.11 Clients

`/clients`: `ListRow`s with name, "Entreprise · Menu à emporter · 6 %", "Prochain : mardi 14 oct", "4 820 € cette année". Search, "+ Client".

`/clients/:id`: header with name, kind, contact, defaults (prestation type, VAT, price per guest, guest count), invoicing mode (par événement / mensuelle). Section **Semaine type**: a Lundi to Dimanche list where each weekday shows its template (recipes by course with portions, guests, price) or "+ Ajouter un jour". Section **Favoris**: templates without a weekday. Section **Prochaines semaines**: a four-week grid (rows = weeks, cells = weekdays) where a cell is the existing event (guests, status dot) or a "+" when the weekly template has that weekday and no event exists; the row header has "Créer la semaine". Section **Historique**: `DataTable` Date | Événement | Convives | HTVA | Facturé, and the client's journal entries with "Facturer le mois" (slice 4). Phone: sections stacked, the grid as a vertical list of weeks.

Interactions: "+" instantiates that single date, the row header instantiates the week, both through `POST /admin/clients/:id/instantiate { dates }` returning `{ created, skipped }`; "Créer depuis un événement" copies an event's lines into a weekday; "Mettre à jour le modèle depuis cet événement" on the event pushes changes back; delete is refused with 409 when events reference the client and the UI offers "Archiver".

### 5.12 Comptes · Journal

Route `/comptes/journal?ym=2026-10&book=ventes`. Tabs across every `/comptes/*` page: Journal · Aperçu · Compte de résultats · Prévisionnel · Au réel.

Laptop: year and month selects, book switch Ventes / Achats, filter chips (Tous, Non réglés, Événements, Comptoir, Acomptes, Commissions). `DataTable` at `text-sm` tabular with the workbook's columns in order: N° | Date | Intitulé | Type | Total TVAC | HTVA | TVA 6 % | TVA 12 % | TVA 21 % | Réglé | Mode | Encaissé le | KM | Description. Footer: Σ TVAC, Σ HTVA, Σ per rate, "Total CA 10/2026" = Σ HTVA, then Σ HTVA per prestation type with a "Sans type" row. Achats columns: Date | Intitulé | Type (MP, Personnel, Autre) | Fournisseur ou Personne | Heures | Taux | HTVA | TVA | TVAC | Réf. A right rail shows Acomptes du mois, Commissions, À encaisser, and in the Achats book a per-person **Résumé facture** (dates, Σ heures, taux, montant) that replaces the workbook's "factures" sheet. Buttons: "Nouvelle ligne", "Exporter 2026 (xlsx)", "CSV du mois", "Verrouiller le mois".

Phone: card per entry (label bold, date and N° muted, TVAC and HTVA right, Réglé tag), totals in a sticky footer; the entry form is a full-screen sheet.

Interactions: the form has kind, date, number, label, client, events (multi-select), prestation type, TVAC, VAT rate(s), HTVA and TVA prefilled by `splitTvac` and editable, paid with method and date, KM, description, and for personnel lines person, hours, rate. The DTO refuses lines where HTVA + Σ TVA differs from TVAC by more than 0,01. Row tap edits; locked rows show "Verrouillé" and need "Déverrouiller" with confirmation. "Réglé" inline opens a two-field popover. Export is described in 7.6.

### 5.13 Comptes · Aperçu par mois

Route `/comptes/apercu?year=2026`. Tiles: CA année, Objectif année, Atteint %, Seuil mensuel. The bar chart from `Dashboard.tsx` moved here, recoloured with tokens, three bars per month (CA N−1, CA N, Objectif) and a line for Prévision, 12px axis minimum. `DataTable` Mois | CA HTVA N−1 | CA HTVA N | Δ % | Objectif | Prévision (signé) | Atteint, totals row. Section Mix par prestation: Type | CA N−1 | % | CA N | % | Objectif | % | Nb nécessaires. `SectionToggle` Comparaison par période (1 jan to 30 avr, 30 avr to 30 juin, for N, N−1, N−2). Phone: tiles two per row, chart full width, tables as cards. Tap a month → journal for that month; tap a type → journal filtered; "Modifier l'objectif" → Prévisionnel.

### 5.14 Comptes · Compte de résultats

Route `/comptes/resultats?year=2026`. `DataTable` with 12 month rows plus Total année: Mois | CA HTVA | Coûts MP | Marge brute | Charges fixes | Personnel extra | Autres coûts | Résultat avant impôts | Marge % | Impôts | Résultat net. Each Coûts MP cell carries a `Tag` "achats", "figé" or "calculé" and a tooltip listing its sources; a view toggle "MP: réel si disponible / toujours calculé" compares the two, and a separate "MP prévu" line sums upcoming events of the month. Ratio rows MP / CA, Marge brute / CA, Charges fixes / CA. Scenario toggle Avec salarié / Seule for the fixed-charge column. A Simulation row from the objective. Settings inline: "Taux ISoc 25 %" with the help text and the note that the workbook used 15 %. Phone: one card per month with CA, MP, Résultat, Net and a disclosure for the rest. Tap Coûts MP → the month's purchase lines and event snapshots with "Ajouter un achat"; tap Personnel extra → the month's personnel lines; "Exporter" adds this sheet to the xlsx.

### 5.15 Comptes · Prévisionnel

Route `/comptes/previsionnel?year=2026`. Left: the Objectif form (CA annuel, mois actifs, heures disponibles par mois, % MP, taux ISoc, budget extras, mois de trésorerie, épargne mensuelle, objectif par prestation with events needed and guests per event, investissements). Right: charge table Intitulé | Catégorie | Mensuel | Mensuel seule | Annuel | Depuis | Jusqu'au with totals and a scenario toggle. Below: Seuil de rentabilité annuel et mensuel (workbook formula, primary), "Seuil ajusté matières" (secondary, labelled), Besoin de trésorerie, Bénéfice avant impôts prévu, ISoc prévu, Marge nette prévue %. Editing a charge amount closes the current row and creates a new one from the chosen month ("Modifier à partir de" defaults to the current month). "Copier l'objectif de 2025" seeds a new year. Phone: forms stacked, charges as cards.

### 5.16 Comptes · Au réel

Route `/comptes/au-reel?ym=2026-10`. Month ‹ ›. `DataTable` Client / événement | Type | CA HTVA | Heures | Observations, one row per event dated in the month plus the month's non-event sales lines, with a `Tag` "signé" or "facturé". Footer: Total signé, Total heures, Je vise, Temps disponible, Il me reste à signer, Heures restantes. Year summary with the gap to the annual objective. Heures is an `InlineField` writing `event.hoursSpent`; Observations writes `event.notes`; rows without a prestation type show a warning tag. Phone: cards with the footer pinned.

### 5.17 Paramètres

Route `/settings`, a `max-w-doc` column of sections at `text-base` with 44px rows: Catégories de recettes (with an optional emoji), Services (courses, ordered, ▲▼), Types de prestation (key, label, default VAT), Fournisseurs (name, address, phone, colour swatch), Charges fixes (table with Depuis / Jusqu'au and "Modifier le montant"), Objectifs par année, Société (name, VAT number, address for the export header), Doublons ignorés (with "Reprendre"), Intelligence artificielle (key presence only), À propos (version). Saves go through `PATCH /admin/settings` with the extended DTO. Renaming a course offers "Renommer aussi sur 42 lignes d'événement", which runs a client-side loop of line PATCHes.

## 6. Data model changes

All additions are optional on read unless marked required. `removeUndefinedValues: true` in `DdbService` (line 27) means undefined optionals are not written. Shared code goes in `packages/types`; run `pnpm build:types` after each change.

### Taxonomies and money (`packages/types/src/entities/taxonomies.ts`, new)

```ts
export const DEFAULT_COURSES = ["Apéritif", "Entrée", "Plat", "Dessert", "Autre"];
export const VAT_RATES = [0, 6, 12, 21] as const;
export type VatRate = (typeof VAT_RATES)[number];
export interface PrestationTypeSetting { key: string; label: string; defaultVatRate: VatRate }
export const DEFAULT_PRESTATION_TYPES: PrestationTypeSetting[] = [
  { key: "menu_a_emporter", label: "Menu à emporter", defaultVatRate: 6 },
  { key: "buffet_a_emporter", label: "Buffet à emporter", defaultVatRate: 6 },
  { key: "buffet_avec_service", label: "Buffet avec service", defaultVatRate: 12 },
  { key: "atelier", label: "Atelier", defaultVatRate: 21 },      // to confirm with the accountant
  { key: "brunch", label: "Brunch", defaultVatRate: 12 },
  { key: "walking_cocktail", label: "Walking / cocktail", defaultVatRate: 12 },
  { key: "chef_a_domicile", label: "Chef à domicile", defaultVatRate: 12 },
];
```

`packages/types/src/lib/money.ts`: `round2`, `sumMoney(xs)` (sums in integer cents), `splitTvac(tvac, rate)`, `fmtEur` using `Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR" })`. `packages/types/src/lib/costing.ts`: `calcIngredientLineCost`, `calcRecipeCost(recipe, ingredientById: Map)`, `calcEventCost`, `scaleQty`, moved from `apps/frontend/src/lib/recipe-helpers.ts` which re-exports them. `packages/types/src/lib/normalize.ts`: `normalizeIngredientName`. `packages/types/src/lib/planning.ts`: `sortEventLines`, `prepLinesForDate`, `groupByRecipe`, `weekPlan`. `packages/types/src/lib/reports.ts`: `incomeStatement`, `apercu`, `mix`, `previsionnel`, `auReel`, all pure and covered by the existing `types` jest project.

### Event (`packages/types/src/entities/event.ts`)

```ts
export type PrepStatus = "todo" | "doing" | "done";

export interface EventRecipeLine {
  lineId: string;            // required after migration 001; server fills randomUUID() on every write
  recipeId: string;
  portions: number;
  course?: string;           // value of settings.courses; fallback recipe.defaultCourse, then "Autre"
  notes?: string;
  prepStatus?: PrepStatus;   // undefined reads as "todo"
  prepDate?: string;         // YYYY-MM-DD; undefined reads as event.date
}
// Manual order = array order inside a course. No order field.

export type ExtraCostKind = "matiere" | "personnel" | "location" | "transport" | "autre";
export interface EventExtraCost { label: string; amount: number; kind?: ExtraCostKind }  // undefined reads "autre"

export interface EventCostSnapshot {
  rawMaterial: number;       // Σ (recipeCost / recipe.portions) × line.portions + Σ extraCosts kind matiere
  extras: number;            // Σ extraCosts not matiere
  lines: { lineId: string; recipeId: string; portions: number; unitCost: number }[];
  takenAt: string;
  approximate?: boolean;     // true when written by migration 002 at today's prices
}

export interface AppEvent {
  // existing fields unchanged
  clientId?: string;
  templateId?: string;
  prestationType?: string;   // key into settings.prestationTypes
  vatRate?: VatRate;
  hoursPlanned?: number; hoursSpent?: number; km?: number; serviceTime?: string;
  costSnapshot?: EventCostSnapshot;
}
```

Cost precedence everywhere: `actualCost ?? costSnapshot?.rawMaterial ?? liveCalc`. This keeps today's `EventEditor.tsx:125` rule where a typed real cost replaces the calculated one. Duplicate `recipeId`s in one event are allowed once `lineId` exists.

### Recipe, Ingredient, GroceryList, Settings

```ts
// recipe.ts
defaultCourse?: string;

// ingredient.ts
aliases?: string[];        // nameLower values of merged duplicates; imports match on them
mergedFrom?: string[];     // audit

// grocery-list.ts
eventIds?: string[]; range?: { from: string; to: string }; excludeDone?: boolean;

// settings.ts
export interface SettingsSupplier { name: string; address?: string; phone?: string; color?: string }
export interface FixedCharge {
  chargeId: string; label: string;
  category: "social" | "salaire" | "assurance" | "abonnement" | "frais" | "remboursement" | "autre";
  monthlyAmount: number; monthlyAmountSolo?: number;   // undefined reads as monthlyAmount
  from: string; to?: string;                            // "YYYY-MM" inclusive; undefined = still active
  note?: string;
}
export interface YearObjective {
  annualRevenue: number; monthsActive: number;          // default 10
  monthlyOverrides?: Record<string, number>;
  byPrestation: { type: string; amount: number; eventsNeeded?: number; guestsPerEvent?: number }[];
  hoursAvailablePerMonth?: number;
  rawMaterialPct: number;                               // default 0.38
  corporateTaxRate: number;                             // default 0.25; the workbook used 0.15
  extrasBudget?: number; treasuryMonths: number;        // default 3
  treasurySavingPerMonth: number;                       // default 0 (the live workbook cell is empty)
  investments: { label: string; amount: number }[];
}
export interface AppSettings {
  settingsId: "global"; recipeCategories: string[]; suppliers: SettingsSupplier[]; updatedAt: string;
  courses?: string[];                             // default DEFAULT_COURSES
  categoryIcons?: Record<string, string>; courseIcons?: Record<string, string>;
  prestationTypes?: PrestationTypeSetting[];      // default DEFAULT_PRESTATION_TYPES
  fixedCharges?: FixedCharge[];
  objectives?: Record<string, YearObjective>;     // key "2026"
  company?: { name: string; vatNumber: string; address: string };
  ignoredDuplicateGroups?: string[];
  openAiKeySet?: boolean;                         // the key itself lives in SSM
}
```

`SettingsService.get` fills defaults the way it fills `suppliers` at line 18. `SettingsService.update` widens its `Pick` and the DTO gains the keys. `SETTINGS_TTL` in `api.ts` drops from 120 s to 30 s. The item stays far under 400 KB.

### Client (new table `ta-clients-{stage}`, PK `clientId`)

```ts
export interface ClientTemplate {
  templateId: string; name: string;
  weekday?: 1 | 2 | 3 | 4 | 5 | 6 | 7;    // ISO weekday; present = part of the semaine type
  guestCount: number; sellingPricePerGuest: number;
  prestationType?: string; vatRate?: VatRate;
  recipes: EventRecipeLine[]; extraCosts: EventExtraCost[]; notes?: string;
}
export interface Client {
  clientId: string; name: string; nameLower: string;
  kind?: "entreprise" | "particulier";
  contactName?: string; phone?: string; email?: string; address?: string; vatNumber?: string;
  defaultPrestationType?: string; defaultVatRate?: VatRate; defaultPricePerGuest?: number; defaultGuestCount?: number;
  invoicing?: "par_evenement" | "mensuelle";
  templates: ClientTemplate[];              // required, default []
  notes?: string; active: boolean;
  createdAt: string; updatedAt: string;
}
```

Templates are embedded, not a third table: a client has a handful, they are edited only from its page, and they must never be mistaken for events. Rejected: "event with an `isTemplate` flag", because every revenue reader would need a filter.

### LedgerEntry (new table `ta-ledger-{stage}`, PK `entryId`)

```ts
export type SalesKind = "facture" | "acompte" | "comptoir" | "commission" | "bon_cadeau" | "autre";
export type PurchaseKind = "mp" | "personnel" | "autre";
export type PaymentMethod = "virement" | "cash" | "bancontact" | "payconiq" | "autre";

export interface LedgerEntry {
  entryId: string;
  book: "ventes" | "achats";
  kind: SalesKind | PurchaseKind;
  date: string;                  // YYYY-MM-DD
  ym: string;                    // "2026-10", written server-side from date.slice(0, 7)
  number?: string;               // Falco invoice number or supplier ref
  label: string;
  eventIds?: string[];           // zero, one or many events (monthly invoice)
  clientId?: string; prestationType?: string;
  totalTvac: number; htva: number;             // two decimals, htva stored as typed
  vat: { rate: VatRate; amount: number }[];
  paid: boolean; paymentMethod?: PaymentMethod; paidAt?: string;
  description?: string; km?: number;
  personName?: string; hours?: number; hourlyRate?: number;   // kind personnel
  supplier?: string;                                           // kind mp
  locked?: boolean;              // set by Verrouiller le mois
  createdAt: string; updatedAt: string;
}
```

Deposits are sales entries of kind `acompte` with `paid: true`. Extra shifts are purchase entries of kind `personnel` with `htva = hours × hourlyRate`. Fixed charges and objectives stay in settings. The event does not store `ledgerEntryId`; badges are derived from entries whose `eventIds` include the event. `locked` lives only on entries.

### Zod DTOs (`packages/types/src/dto/`)

```ts
// primitives.ts
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const yearMonth = z.string().regex(/^\d{4}-\d{2}$/);
export const money = z.number().refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "2 décimales max");
export const vatRate = z.union([z.literal(0), z.literal(6), z.literal(12), z.literal(21)]);

// events.ts
const eventRecipeLineSchema = z.object({
  lineId: z.string().min(1).optional(),
  recipeId: z.string().min(1),
  portions: z.number().int().positive(),
  course: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(500).optional(),
  prepStatus: z.enum(["todo", "doing", "done"]).optional(),
  prepDate: isoDate.optional(),
}).strict();
const eventExtraCostSchema = z.object({
  label: z.string().min(1).trim(), amount: money,
  kind: z.enum(["matiere", "personnel", "location", "transport", "autre"]).optional(),
}).strict();
export const createEventRequestSchema = z.object({
  /* existing fields, date: isoDate */
  clientId: z.string().min(1).optional(), templateId: z.string().min(1).optional(),
  prestationType: z.string().min(1).optional(), vatRate: vatRate.optional(),
  hoursPlanned: z.number().nonnegative().optional(), hoursSpent: z.number().nonnegative().optional(),
  km: z.number().nonnegative().optional(), serviceTime: z.string().optional(),
});   // not strict for one release: EventEditor sends actualCost: null and old bundles may be cached
export const updateEventRequestSchema = createEventRequestSchema.partial().extend({ expectedUpdatedAt: z.string().optional() });
export const putEventLinesSchema = z.object({ lines: z.array(eventRecipeLineSchema.required({ lineId: true })) }).strict();
export const addEventLineSchema = eventRecipeLineSchema.omit({ lineId: true }).strict();
export const patchEventLineSchema = eventRecipeLineSchema.omit({ lineId: true, recipeId: true }).partial().strict();

// ingredients.ts
export const mergeIngredientsSchema = z.object({ survivorId: z.string().min(1), mergedIds: z.array(z.string().min(1)).min(1) })
  .strict().refine((v) => !v.mergedIds.includes(v.survivorId), "survivor cannot be merged");

// recipes.ts: defaultCourse: z.string().trim().optional(); pricing tva: vatRate

// clients.ts
export const clientTemplateSchema = z.object({ templateId: z.string().min(1).optional(), name: z.string().min(1).trim(),
  weekday: z.number().int().min(1).max(7).optional(), guestCount: z.number().int().positive(), sellingPricePerGuest: money,
  prestationType: z.string().optional(), vatRate: vatRate.optional(),
  recipes: z.array(eventRecipeLineSchema).default([]), extraCosts: z.array(eventExtraCostSchema).default([]), notes: z.string().optional() }).strict();
export const createClientSchema = z.object({ name: z.string().min(1).trim(), kind: z.enum(["entreprise", "particulier"]).optional(),
  contactName: z.string().trim().optional(), phone: z.string().trim().optional(), email: z.string().trim().optional(),
  address: z.string().trim().optional(), vatNumber: z.string().trim().optional(),
  defaultPrestationType: z.string().optional(), defaultVatRate: vatRate.optional(), defaultPricePerGuest: money.optional(),
  defaultGuestCount: z.number().int().positive().optional(), invoicing: z.enum(["par_evenement", "mensuelle"]).optional(),
  templates: z.array(clientTemplateSchema).default([]), notes: z.string().optional(), active: z.boolean().default(true) }).strict();
export const updateClientSchema = createClientSchema.partial().strict();
export const instantiateSchema = z.object({ dates: z.array(isoDate).min(1).max(31), templateIds: z.array(z.string()).optional(),
  guestCount: z.number().int().positive().optional() }).strict();

// ledger.ts
const vatLine = z.object({ rate: vatRate, amount: money }).strict();
const vatIdentity = (e: { htva: number; totalTvac: number; vat: { amount: number }[] }) =>
  Math.abs(e.htva + e.vat.reduce((s, v) => s + v.amount, 0) - e.totalTvac) < 0.011;
const base = { date: isoDate, label: z.string().min(1).trim(), description: z.string().trim().optional(),
  eventIds: z.array(z.string()).optional(), clientId: z.string().optional(), number: z.string().trim().optional(),
  totalTvac: money, htva: money, vat: z.array(vatLine).default([]) };
const salesSchema = z.object({ ...base, book: z.literal("ventes"),
  kind: z.enum(["facture", "acompte", "comptoir", "commission", "bon_cadeau", "autre"]),
  prestationType: z.string().optional(), paid: z.boolean().default(false),
  paymentMethod: z.enum(["virement", "cash", "bancontact", "payconiq", "autre"]).optional(),
  paidAt: isoDate.optional(), km: z.number().nonnegative().optional() }).strict();
const purchaseSchema = z.object({ ...base, book: z.literal("achats"), kind: z.enum(["mp", "personnel", "autre"]),
  supplier: z.string().optional(), personName: z.string().optional(), hours: z.number().nonnegative().optional(),
  hourlyRate: money.optional() }).strict();
// Refine after the union so the VAT identity is enforced on both books (discriminatedUnion over innerType() would drop it).
export const createLedgerEntrySchema = z.union([salesSchema, purchaseSchema]).refine(vatIdentity, "HTVA + TVA doit égaler TVAC");
export const lockMonthSchema = z.object({ ym: yearMonth }).strict();

// settings.ts: courses, categoryIcons, courseIcons, prestationTypes, fixedCharges (from/to yearMonth, money), objectives, company, ignoredDuplicateGroups, supplier color
```

Zod is `^3.24` in the workspace; unknown keys are stripped unless `.strict()`, which is why today's `updateEventRequestSchema` would silently drop any new line field.

### Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/admin/ingredients/duplicates` | none | `{ groups: { key, confidence, suggestedSurvivorId, members: { ingredientId, name, unit, price, supplier, updatedAt, recipeCount, listCount }[] }[] }` |
| POST | `/admin/ingredients/merge` | `mergeIngredientsSchema` | `{ recipesUpdated, listsUpdated, removed }`; 207 `{ ..., failures }`; 409 `UNIT_MISMATCH` or `STILL_REFERENCED` |
| DELETE | `/admin/ingredients/:id` | none | 409 `IN_USE` with recipe names when referenced |
| POST | `/admin/events/:id/lines` | `addEventLineSchema` | `AppEvent` |
| PATCH | `/admin/events/:id/lines/:lineId` | `patchEventLineSchema` | `AppEvent` |
| PUT | `/admin/events/:id/lines` | `putEventLinesSchema`; lineId set must equal the stored set, else 409 | `AppEvent` |
| DELETE | `/admin/events/:id/lines/:lineId` | none | `AppEvent` |
| PATCH | `/admin/events/:id` | `updateEventRequestSchema`; status → completed writes `costSnapshot` when absent; `expectedUpdatedAt` mismatch → 409 | `AppEvent` |
| POST | `/admin/events/:id/snapshot` | none | retakes the snapshot on purpose |
| GET/POST/PATCH/DELETE | `/admin/clients[/:id]` | client schemas | `Client`; DELETE 409 `IN_USE` |
| POST | `/admin/clients/:id/instantiate` | `instantiateSchema` | `{ created: AppEvent[], skipped: string[] }` |
| POST | `/admin/clients/:id/templates/from-event/:eventId` | `{ name, weekday? }` | `Client` |
| GET | `/admin/ledger?year=2026` | none | `LedgerEntry[]` |
| POST / PATCH / DELETE | `/admin/ledger[/:id]` | `createLedgerEntrySchema` / partial | 409 when locked |
| GET | `/admin/ledger/prefill/event/:eventId?kind=facture` | none | a dry prefill, nothing written |
| GET | `/admin/ledger/prefill/client/:clientId?ym=` | none | prefill covering the client's completed uninvoiced events |
| POST | `/admin/ledger/lock` | `lockMonthSchema` | `{ locked: number }` |
| PATCH | `/admin/settings` | extended schema | `AppSettings` |

### Backend plumbing

- `apps/backend/src/shared/ddb.service.ts`: loop on `UnprocessedItems` with backoff (100 ms × 2ⁿ, five tries) in `batchWrite` and `batchDelete`; `update()` takes `{ expectedUpdatedAt? }` and appends `AND #updatedAt = :expected`; remove the unused `QueryCommand` import at line 9.
- `apps/backend/src/shared/ddb-exception.filter.ts`: maps `ConditionalCheckFailedException` to HTTP 409.
- `apps/backend/src/config/config.service.ts`: `CLIENTS_TABLE` and `LEDGER_TABLE` as `z.string().min(1).optional()`; `DdbService.requireTable("clients")` throws `ServiceUnavailableException` at first use so the EC2 boots before the SSM parameter exists. `infrastructure/lib/data-stack.ts` already defines the five current tables; add the two new ones there, in `scripts/setup-ssm-params.sh` and `scripts/ec2-bootstrap.sh` (lines 45-49, 66-70), and follow the README's four steps.
- `EventsModule` imports `RecipesModule` and `IngredientsModule` so `EventsService.update` can compute the snapshot with the shared `calcEventCost`.
- `IngredientsService.importIngredients` (`existingByName`, line 83) and `RecipesService.importRecipes` (`ingByName`, line 77) match on `nameLower` or any `alias`.
- Delete `packages/utils` (update `jest.config.js` moduleNameMapper, `tsconfig.json` paths, and the root `type-check` script) and the dead `TABLE_NAMES` export.
- `apps/frontend/src/lib/api.ts`: new groups `clients`, `ledger` (uncached like `groceryLists`); invalidation sets `ingredients.merge → ["ingredients","recipes"]`, `ingredients.delete → ["ingredients","recipes"]`, `events.lines.* → ["events"]`, `clients.instantiate → ["events","clients"]`, `ledger.* → ["events"]`.

### Backward-compatible read rules

- Lines: sort key `(courseIndex(line.course ?? recipe.defaultCourse ?? "Autre"), arrayIndex)`; `prepStatus ?? "todo"`; `prepDate ?? event.date`.
- Client name: `clientById.get(event.clientId)?.name ?? event.contactName ?? event.name`.
- Cost: `actualCost ?? costSnapshot?.rawMaterial ?? live`.
- Prestation type: `event.prestationType ?? "Sans type"` bucket.
- Settings: `courses ?? DEFAULT_COURSES`, `prestationTypes ?? DEFAULT_PRESTATION_TYPES`, `fixedCharges ?? []`, `objectives ?? {}`.
- Supplier colour: `supplier.color ?? hash(name)` into the eight-colour set.

### Migration runner

`apps/backend/scripts/` does not exist and neither `tsx` nor `ts-node` is installed. Add `tsx` as a backend devDependency and one runner:

```
pnpm --filter @apps/backend exec tsx scripts/migrate.ts --name 001-line-ids --dry-run
```

Runner: `import "dotenv/config"`, `new ConfigService()`, `new DdbService(config)`, `scanAll` the table, compute a patch per item or `null`, `ddb.update` per item (never `put`) with 10-way concurrency, print `{ scanned, updated, skipped }`. Each migration is idempotent.

- **001-line-ids** (slice 2, mandatory before the line endpoints ship): for each event, fill `lineId: randomUUID()` where missing.
- **002-cost-snapshots** (slice 4): for each completed event without `costSnapshot`, compute at today's prices with `approximate: true`.
- **003-clients-from-contacts** (slice 3, optional): group events by `contactEmail || contactName.toLowerCase()`, print the proposed clients in dry-run, create them and patch `clientId` on confirm.

Deploy order per slice: `pnpm build:types`, backend, then frontend. Take an on-demand DynamoDB backup of ingredients and recipes before the first live merge.

## 7. Feature designs

### 7.1 Interactive planning

No new entity. Week, day and prep sheet are projections of `event.recipes[]` once lines carry `lineId`, `course`, `prepStatus` and `prepDate`.

`packages/types/src/lib/planning.ts`:

```ts
export interface PrepLine { eventId; eventName; clientName?; prestationType?; lineId; recipeId; recipeName; portions; course: string; prepStatus: PrepStatus; date: string; notes?: string }
export function sortEventLines(lines, courses, recipeById): EventRecipeLine[]   // course index, then array order
export function prepLinesForDate(events, recipeById, clientById, courses, date): PrepLine[]   // (line.prepDate ?? event.date) === date
export function groupByRecipe(lines: PrepLine[]): { recipeId; recipeName; total; parts: { label; portions }[] }[]
export function weekPlan(events, weekStart): { days: { date; events; guests; signedRevenue; linesDone; linesTotal }[]; signedRevenue }
```

Dates: `apps/frontend/src/lib/dates.ts` with `isoWeekOf(date)`, `datesOfIsoWeek(isoWeek)`, grouping by `date.slice(0, 10)`; `startOfWeekMonday` and `endOfWeekSunday` leave `Events.tsx`.

Revenue: the week header sums `sellingPricePerGuest × guestCount` per day and per week, labelled "Signé" so it is not read as turnover. The month figure compares Σ signed events in the calendar month of the week's Thursday with `objectives[year].monthlyOverrides[ym] ?? annualRevenue / monthsActive`; after slice 4 a second tick shows Σ ledger sales HTVA for the month.

Status: `todo → doing → done` written only through `PATCH /admin/events/:id/lines/:lineId`, so an open `EventEditor` cannot undo a tick from the phone. The prep sheet, the day view, cook mode's last step and the week's long-press all call it. Nothing auto-resets.

Reading at the event's portions: the prep sheet renders `RecipeReader` with `ratio = line.portions / recipe.portions`. The old path (Événements → event → recipe → Mode recette → 20 taps on +) becomes two taps from the day view.

Grocery from a date range: `/grocery-list/new?from=&to=` from the week header ("Courses de la semaine") and each day ("Courses du jour"), see 5.9.

Print and PDF: `@media print` on the day view is the paper fallback; "PDF du jour" via `day-pdf.ts` stays during the transition. `generateAggregatedPdf`, `WeekPlannerModal` and `exportRecipesPdf` are deleted. The single-recipe PDF in `RecipeDetail.tsx` stays at 11pt body.

Files: new `Week.tsx`, `Day.tsx`, `PrepSheet.tsx`, `lib/dates.ts`, `lib/grocery.ts`, `lib/pdf/day-pdf.ts`, `components/ui/StatusControl.tsx`; changed `App.tsx`, `AdminSidebar.tsx`, `Events.tsx`, `EventDetail.tsx`, `RecipeCook.tsx`, `events.controller.ts`, `events.service.ts`, `dto/events.ts`, `api.ts`.

### 7.2 Readable recipes

Detail (`/recipes/:id`): read mode by default with `RecipeReader`, no click targets on text, cost and pricing behind `SectionToggle`s, edit behind `?mode=edit`. Steps at 18px full-contrast text instead of 14px muted grey that only darkens on hover (`RecipeDetail.tsx:347`); the six-column 400px-wide ingredient table (`RecipeDetail.tsx:402`) leaves the reading surface; the hover-only delete buttons (`:356`, `:438`) exist only in edit mode. The `h-22` bug is removed with the thumbnails.

Cook mode: context visible (ingredients beside or one tap below the steps, previous step above on phones), left-aligned text, 44px and 56px targets, "4 / 9" instead of 10px dots, selectable text, wake lock, portions from the query string, "Marquer fait" at the end.

Order of application: tokens (one day, every page changes); `PageHeader`, `Tag`, `ListRow`, `Stepper`, `SectionToggle`, `FieldLabel`, `RecipeReader`; `RecipeDetail` read mode and `RecipeCook`; then the new planning pages are built on the primitives from the start; then the list pages; then `InlineField` replaces the Editable* copies. Slice 1 ends with a 20-minute session on Dalia's phone in the kitchen, 375px and laptop before/after screenshots on the PR, and the contrast script output. Token values are adjusted from her reaction before the same look is applied to list pages.

### 7.3 Ingredient merge

**Detection.** `normalizeIngredientName(raw)` in `packages/types/src/lib/normalize.ts`:

1. `normalize("NFD")`, strip combining marks, `œ → oe`, `æ → ae`, lowercase, trim.
2. Remove parenthesised or bracketed text and anything after " - " or ",".
3. Remove unit and packaging tokens (`g`, `gr`, `kg`, `ml`, `cl`, `l`, `pièce(s)`, `pc(s)`, `botte(s)`, `sachet`, `boite`, `bte`, `paquet`, `x\d+`) and pure numbers.
4. Replace punctuation and apostrophes with spaces, collapse whitespace.
5. Singularise each token of four or more letters: strip trailing `s` or `x` (`oeufs → oeuf`, `choux → chou`).
6. Drop stop words `de`, `du`, `des`, `d`, `la`, `le`, `les`, `en`.
7. Key = tokens sorted and joined. "Oeuf", "Oeufs", "Œuf", "oeuf (pièce)", "OEUF x12" all become `oeuf`.

`GET /admin/ingredients/duplicates` groups by exact key (confidence `identique`), then for keys of five or more characters pairs those at Damerau-Levenshtein ≤ 1 (`proche`), and marks a key that is a strict token subset of another (`oeuf` vs `oeuf bio`) as `a_verifier`, never preselected. Keys shorter than five characters are never fuzzily joined (`sel` vs `sol`). Groups in `settings.ignoredDuplicateGroups` are skipped. One scan of recipes and one of grocery lists give `recipeCount` and `listCount` per member. No model needed at a few hundred ingredients.

**Survivor.** Suggested: most recipe references, then most recent `updatedAt`, then the shortest name. The user can pick any member. A member whose `PRICE_TO_QTY_UNIT[unit]` differs from the survivor's is excluded; the merge never converts quantities, because a line in `g` priced per piece would be silently wrong. No `force` flag.

**Remap set.** Recipes `recipe.ingredients[].ingredientId` (table `ta-recipes`); grocery lists `items[].ingredientId` plus denormalised `name`, `supplier`, `pricePerUnit`, `priceUnit` (table `ta-grocery-lists`); the survivor's `aliases` and `mergedFrom`. Events reference `recipeId` only; settings hold no ingredient ids; the localStorage hand-off is deleted in slice 2 and, until then, `GroceryListPage` drops pending items whose id no longer exists.

**Endpoint.** `POST /admin/ingredients/merge { survivorId, mergedIds }`, `IngredientsService.merge`, in order:

1. Load survivor and merged rows; 404 if the survivor is missing; a merged id that no longer exists is treated as done. 409 `UNIT_MISMATCH` with the offending names if families differ; nothing written.
2. `scanAll(recipes)`. For each recipe with a line in `mergedIds`: rewrite to `survivorId`; if two lines now share `ingredientId` and `unit`, sum `qty` and keep the max `lossPct`; `ddb.update(recipes, { recipeId }, { ingredients, updatedAt })`. Per-item failures are caught and collected.
3. `scanAll(groceryLists)`. Rewrite `items[].ingredientId`, refresh the denormalised fields from the survivor, merge duplicates by `ingredientId:unit` summing `totalQty` and `haveQty`, `checked = a && b`. Same failure handling.
4. If any failure: return 207 with `{ recipesUpdated, listsUpdated, failures }` and stop. Nothing is deleted.
5. Re-scan recipes and lists; if any reference to a merged id remains (a concurrent edit), return 409 `STILL_REFERENCED` with names.
6. `ddb.update(survivor, { aliases: union, mergedFrom: union, updatedAt })`, then `batchDelete(mergedIds)` with the `UnprocessedItems` loop.
7. Return `{ recipesUpdated, listsUpdated, removed }`.

**Failure handling.** Remap happens before any delete, so a crash at any step leaves both ingredients alive and some recipes already on the survivor; nothing is orphaned and the group still appears on the page. Re-running the same payload is idempotent: already-remapped recipes are no-ops, deletion is last, a missing merged id is treated as done. `DELETE /admin/ingredients/:id` gains a reference scan and returns 409 `IN_USE` with recipe names. `deduplicate` (`ingredients.service.ts:60-79`) and its controller route are removed. `api.ingredients.merge` invalidates `ingredients` and `recipes` together, so `generateGroceryList` never reads 30-second-old recipes holding merged ids.

**UI.** Section 5.10, plus the create-time "Semblable à" warning in `IngredientFormModal.tsx`.

### 7.4 Event recipe ordering and course grouping

Where the course lives: on the line (`EventRecipeLine.course`), with `recipe.defaultCourse` copied in when a line is added. A quiche can be an apéritif at a cocktail and an entrée at a lunch. The list and its order are `settings.courses` (default Apéritif, Entrée, Plat, Dessert, Autre), separate from `recipeCategories` (service formats) and from prestation types (on the event). A line whose course is not in the list sorts under Autre without being rewritten.

How order is stored: the array order of `event.recipes` inside each course. No `order` field, so nothing to keep in sync. Readers group by course index then array index, so events saved before the change render in their current order under Autre or the recipe's default course. ▲▼ swaps with the neighbour inside the group; a course change moves the line to the end of the new group; drag (laptop, HTML5 drag as in `GroceryListPage.tsx`) can do both in one drop. All of these call `PUT /admin/events/:id/lines { lines }` with the full ordered array; the server checks that the set of `lineId`s equals the stored set and returns 409 otherwise, so a stale tab cannot drop a line. Portions, notes, status and prep date go through `PATCH .../lines/:lineId`. `EventDetail.tsx` stops keying rows by `recipeId` (line 276) and stops `updateRecipePortions` by `recipeId` (line 178).

`lineId` is required after migration 001, which runs before the line endpoints ship, so there is no index-based fallback. `EventsService.create`, `update` and `putLines` still fill a missing `lineId` defensively.

Downstream: `prepLinesForDate`, the day view, the print layout and the future "Proposition de menu" PDF use the same sort, so the kitchen and the client read in service order. Templates copy `course`; instantiation regenerates `lineId` only.

### 7.5 Clients and weekly templates (Hoona)

Set up once: `/clients/new` with name Hoona, kind entreprise, default prestation `menu_a_emporter`, VAT 6 %, price per guest, guest count, invoicing `mensuelle` if that is how she bills. On the client page, fill the Semaine type: either by hand per weekday, or from an existing Hoona event with "Créer depuis un événement" (`POST /admin/clients/:id/templates/from-event/:eventId { name, weekday }`), which copies lines with course and portions, guests, price, prestation, VAT, extra costs, notes. Days with no delivery stay empty. One template covers one delivery a week; five templates cover daily delivery.

See the week or a day: `/semaine/:isoWeek?client=<id>` with the Hoona chip shows only Hoona's events and lines and the week revenue for Hoona alone. `/jour/:date` lists "Mini quiches × 30 · Hoona" under its course next to other clients; Par recette shows "80 = Hoona 30 + Mariage 50". The client page's four-week grid shows which weekdays already have an event.

Reuse next week: `POST /admin/clients/:id/instantiate { dates, templateIds?, guestCount? }`. The service loads the client, scans events once, builds the set of `(templateId, date)` already present, skips those, and creates the rest: name from "Hoona · mardi 21 oct", `date`, `clientId`, `templateId`, `guestCount` (scaling line portions proportionally when overridden), recipes with fresh `lineId`s and no `prepStatus`, extra costs, price, prestation, VAT, contact fields copied from the client, `status: upcoming`. Returns `{ created, skipped }`, which the UI toasts. Safe to tap twice. Entry points: the week banner "Hoona n'a pas d'événement la semaine prochaine · Créer la semaine", the client page row header, the "+" cell, and "Depuis un favori" on a day for templates without a weekday (asks date and guests only).

Editing: changing an event never changes its template; "Mettre à jour le modèle depuis cet événement" pushes back on purpose. Deleting a client keeps its events; a dangling `clientId` renders as the stored `contactName`. `Dupliquer` stays for one-offs and asks for a date.

Invoicing: Hoona's monthly invoice is one ledger entry with `eventIds` covering the month's completed events; see 7.6.

Files: `packages/types/src/entities/client.ts`, `dto/clients.ts`; `apps/backend/src/clients/{clients.module,controller,service}.ts` (injects `EventsService`); `config.service.ts`; `Clients.tsx`, `ClientDetail.tsx`; `EventEditor.tsx` (client select); `EventDetail.tsx` (client link, template actions); `Week.tsx` (chips, banner); `api.ts`.

### 7.6 Accounting

**Entities.** `LedgerEntry` in `ta-ledger` (records); `fixedCharges[]` and `objectives[year]` in settings (effective-dated records); event additions `prestationType`, `vatRate`, `hoursPlanned`, `hoursSpent`, `km`, `costSnapshot`, `extraCosts[].kind`. Deposits are `acompte` entries; extra shifts are `personnel` purchase entries; raw material receipts are `mp` purchase entries. Everything on the Comptes pages is a view computed at render time by `packages/types/src/lib/reports.ts` and never stored.

**How an event becomes a journal line.** "Terminer l'événement" PATCHes `status: "completed"`; `EventsService.update` sees the transition with no `costSnapshot`, loads recipes and ingredients, computes with the shared `calcEventCost`, and writes `costSnapshot` in the same `ddb.update`. The UI then offers "Créer la facture", which opens the entry form prefilled by `GET /admin/ledger/prefill/event/:id?kind=facture`:

- `date = event.date`, `label = client.name ?? event.name`, `prestationType`, `clientId`, `eventIds: [id]`, `km`
- `htva = round2(sellingPricePerGuest × guestCount − Σ htva of acompte entries whose eventIds include the event)`
- `rate = event.vatRate ?? prestationTypes[type].defaultVatRate`; `vat = [{ rate, amount: round2(htva × rate / 100) }]`; `totalTvac = htva + amount`

The form shows "Revenu prévu" and "Acomptes déjà reçus" read-only above the fields. Dalia types the Falco number and overwrites amounts; typing TVAC recomputes HTVA and TVA with `splitTvac`, typing HTVA recomputes the other way; the server enforces the identity within 0,01. "Enregistrer un acompte" is the same form with `kind: "acompte"`, `paid: true`, dated the day the money arrived; a note says the VAT treatment of deposits is to confirm with the accountant. `paid`, `paymentMethod`, `paidAt` are edited on the entry, never on the event. The event page derives "Facturé" from any sales entry including it and "Payé" when all such entries are paid. Non-event lines (comptoir, commission at rate 0, bon cadeau, autre) are created on the Journal page. Export sets `locked`; editing a locked line asks "Déverrouiller".

Monthly invoices: "Facturer le mois" on a client with `invoicing: "mensuelle"` calls `GET /admin/ledger/prefill/client/:id?ym=` which preselects the month's completed, uninvoiced events and sums their revenue minus deposits. One entry, several `eventIds`. Reports attribute a multi-event entry to its events pro rata by `sellingPricePerGuest × guestCount`, so Au réel and the client history never count an invoice once per event.

Event revenue in reports = Σ attributed HTVA of its sales entries when any exist, else `price × guests` labelled "prévu".

**Raw material cost per month.** Two figures, both shown, one used:

- `MP réel(m)` = Σ purchase entries kind `mp` with `ym = m`.
- `MP calculé(m)` = Σ over completed events dated in m of `(actualCost ?? costSnapshot.rawMaterial ?? live)` + Σ `extraCosts` kind `matiere`.
- The income statement uses réel when the month has at least one `mp` line, else calculé, and tags the cell. `MP prévu(m)` sums upcoming events of the month separately. Migration 002 snapshots already-completed events at today's prices with `approximate: true`, shown as "≈".

**Fixed charges and breakeven.** `charges fixes(m)` = Σ `monthlyAmount` (or `monthlyAmountSolo` in the Seule scenario) where `from ≤ m ≤ (to ?? ∞)`. Changing an amount from month M sets `to = M−1` on the old row and inserts a new row with `from = M`, so past months keep their figure. `objectif mensuel(m) = monthlyOverrides[m] ?? annualRevenue / monthsActive`. One objective per year ends the workbook's four conflicting targets.

Breakeven keeps the workbook's formula as the primary figure so Dalia recognises her numbers:

- `Charges annuelles` = Σ monthly × 12 for the chosen scenario
- `Seuil annuel` = Charges annuelles + 12 × `treasurySavingPerMonth` + Σ investments (`C42 + C47*12 + C48`)
- `Seuil mensuel` = charges mensuelles + `treasurySavingPerMonth` + Σ investments / 12 (`C41 + C47 + C48/12`)
- `Seuil ajusté matières` (second line, labelled) = Seuil annuel / (1 − `rawMaterialPct`), because raw materials are 34 to 38 % of revenue and the workbook's figure ignores them
- `Besoin de trésorerie` = charges mensuelles × `treasuryMonths`
- `Bénéfice avant impôts prévu` = `annualRevenue` × (1 − `rawMaterialPct`) − Charges annuelles − `extrasBudget`
- `ISoc prévu` = max(0, bénéfice) × `corporateTaxRate`; `Marge nette prévue %` = (bénéfice − ISoc) / `annualRevenue`

`treasurySavingPerMonth` defaults to 0 because the live workbook cell is empty.

**SRL tax model.** `estimateBelgianTax`, the toggle and the override input are deleted. Owner salary and UCM are fixed charges. Per month: `Résultat avant impôts = CA HTVA − Coûts MP − Charges fixes − Personnel extra − Autres coûts`; `Impôts = max(0, Résultat) × corporateTaxRate`; the annual row uses `max(0, Σ Résultat) × taux`; `Résultat net = Résultat − Impôts`. `corporateTaxRate` is per year on the objective, default 0.25, with help text "20 % sur la première tranche de 100 000 € si les conditions PME sont remplies, à confirmer avec le comptable; le classeur utilisait 15 %".

**Reports (columns and formulas).**

- Journal des recettes (per month): N° | Date | Intitulé | Type | Total TVAC | HTVA | TVA 6 % | TVA 12 % | TVA 21 % | Réglé | Mode | Encaissé le | KM | Description. Footer: Σ TVAC, Σ HTVA, Σ per rate, "Total CA mm/aaaa" = Σ HTVA of sales entries, Σ HTVA per prestation type plus "Sans type".
- Aperçu par mois: Mois | CA HTVA N−1 | CA HTVA N = Σ sales `htva` by `ym` | Δ % = (N − N−1) / N−1, blank when N−1 = 0 | Objectif = objectif mensuel(m) | Prévision = Σ events dated in m of price × guests | Atteint = CA N ≥ Objectif. Totals. Box: seuil annuel et mensuel, objectif annuel et mensuel. Comparaison par période: Σ `htva` by date range for N−2, N−1, N.
- Mix par prestation: Type | CA N−1 | % | CA N = Σ sales `htva` by `prestationType` | % | Objectif = `byPrestation.amount` | % | Nb nécessaires = `eventsNeeded ?? Objectif / (CA N / count of lines of that type)`. Commissions and comptoir lines are their own rows.
- Compte de résultats: Mois | CA HTVA | Coûts MP | Marge brute = CA − MP | Charges fixes | Personnel extra = Σ `personnel` entries (`hours × hourlyRate`, or `htva` when typed) + Σ `extraCosts` kind personnel | Autres coûts = Σ `autre` purchases + Σ `extraCosts` kind location, transport, autre | Résultat avant impôts | Marge % = Résultat / CA | Impôts | Résultat net. Ratios MP / CA, Marge brute / CA, Charges fixes / CA. Simulation row: CA = `annualRevenue`, MP = CA × `rawMaterialPct`, Charges = Σ active charges × 12, Personnel = `extrasBudget`.
- Prévisionnel: charge table and the figures above; investments list with total.
- Au réel (per month): Client / événement | Type | CA HTVA (attributed journal HTVA, else price × guests) | Heures = `hoursSpent ?? hoursPlanned` | Observations = notes. Footer: Total signé, Total heures, Je vise = objectif mensuel, Temps disponible = `hoursAvailablePerMonth`, Il me reste à signer = objectif − total, Heures restantes. Year total and écart to `annualRevenue`.
- Extras (inside the Achats book): per person, Date | Heures | Taux | Montant | Événement, with a Résumé facture footer (dates, Σ heures, taux, montant), replacing the "factures" sheet.

Month grouping uses `date.slice(0, 7)` everywhere, never `new Date().getMonth()` (`Dashboard.tsx:104-106`). Amounts are validated to two decimals and summed in cents; `fmtEur` formats "1 234,56 €".

**Export.** `apps/frontend/src/lib/ledger-export.ts` with the `xlsx` dependency already used in `Recipes.tsx:113-116`: "Livre des recettes 2026.xlsx" with one sheet per month ("Janvier" to "Décembre") whose header row is the workbook's exact wording and order (NUMERO OPERATION, DATE FACTURE/OPERATION, INTITULE, Total tvac, RECETTE htva, TVA 6%, TVA 12%, TVA 21%, réglé, mode paiement, date encaissement, Type, Description, KM), dates as Excel date cells, a TOTAL row and the per-type totals written as values; a "recettes 2026" sheet with the whole year, the THERMOMIX commissions block and the ACOMPTES block (client, montant, date paiement, date événement from the linked event), and the company header from `settings.company`; an "Achats" sheet; a "Compte de résultats" sheet. CSV per month with `;` and decimal comma. The export never writes figures back; "Verrouiller le mois" is a separate confirmed action. The accountant opens one real monthly export before the report views are built.

**What the Dashboard becomes.** Moved to `/finances` as "Finances (ancien)" in slice 2, deleted in slice 4. The home is the week with the four-tile money strip (CA du mois with objective bar, Signé ce mois, À encaisser, Marge brute du mois %). The monthly chart is rebuilt in Aperçu over ledger HTVA with N−1 and Objectif series.

Files: `packages/types/src/entities/ledger.ts`, `settings.ts`, `taxonomies.ts`, `dto/ledger.ts`, `dto/settings.ts`, `lib/reports.ts`, `lib/money.ts`; backend `ledger/{module,controller,service}.ts`, `events.service.ts` (snapshot), `events.module.ts`, `settings.service.ts`, `config.service.ts`; frontend `pages/admin/comptes/{ComptesLayout,Journal,Apercu,Resultats,Previsionnel,AuReel}.tsx`, `components/comptes/LedgerEntryForm.tsx`, `lib/accounting.ts`, `lib/ledger-export.ts`, `EventDetail.tsx`, `EventEditor.tsx`, `Settings.tsx`, `Week.tsx`, `api.ts`.

### 7.7 AI

Not now for the core. Duplicate detection is string normalisation, planning is a view, Hoona is a template, accounting is arithmetic that must stay deterministic.

One optional feature if Dalia provides an OpenAI key: **recipe import from a photo or pasted text**. Entry point: "Importer depuis une photo ou un texte" in the `/recipes` overflow. Input: one JPEG or PNG ≤ 5 MB from the phone camera, or text ≤ 8 000 characters. Backend `POST /admin/ai/parse-recipe` (multipart or JSON) calls the OpenAI Responses API with `gpt-4o-mini`, vision input, structured output matching a Zod schema `{ name, portions?, description?, ingredients: { name, qty, unit }[], steps: string[] }`, temperature 0; the key is read from the SSM parameter `/la-table-amelie/production/OPENAI_API_KEY`, declared `.optional()` in `config.service.ts`; `/health` reports `aiEnabled`. The service maps each ingredient name through `normalizeIngredientName` and `aliases` to an existing `ingredientId`; unmatched names come back flagged. Output: `RecipeEditor` opens prefilled with unmatched ingredients highlighted and a "Créer" shortcut to `IngredientFormModal`; nothing is saved until Enregistrer. Cost: about 0,01 € per import. When the key is absent the menu item is hidden. Effort: three days. Not proposed: AI for duplicates, pricing, planning suggestions, or anything that writes to the ledger.

### 7.8 Out of scope

- **Full invoicing**: Falco issues; the app records the ledger line and payment state. A Falco PDF drop that prefills the entry form is a later optional AI slice.
- **Quotes**: a one-day "Proposition de menu (PDF)" from an event (menu by course, convives, price per guest, contact, 11pt) covers the client-facing need; the legal quote stays in Falco.
- **CRM**: the thin `Client` record with contact, defaults and notes. Pipeline, follow-ups and mailing stay in Mailchimp and Notion.
- **Main-d'œuvre and extras**: a `personnel` purchase line with hours and a rate feeds the income statement and the per-person summary. No scheduling or rota. Note that Enobase's "extras" means extra staff while the app's `extraCosts` means extra costs; the `kind` field keeps the two apart.
- **Odoo**: never at this size. At 200 €/month Enobase costs 2 400 €/year against the workbook's 16 000 € HTVA monthly objective; the app's edge is that costing and margin already exist and the data is already there.
- **Persistent stock per ingredient**: later; `haveQty` on grocery lists is enough for now.

## 8. Roadmap

Deploy order for every slice: `pnpm build:types`, backend, then frontend. Each slice ends with a sentence on what Dalia notices.

### Slice 1 (weeks 1-2): readable recipes, cook mode, ingredient merge

Scope: tokens and scale in `index.css` and `tailwind.config.ts`; `touch`/`pointer` variants; `scripts/check-type-scale.sh` and `scripts/check-contrast.mjs`; `PageHeader`, `Section`, `Tag`, `StatusTag`, `ListRow`, `Stepper`, `SectionToggle`, `FieldLabel`, `RecipeReader`; light sidebar; `RecipeDetail.tsx` read mode with `?mode=edit` keeping today's JSX; `RecipeCook.tsx` rewrite with query params and wake lock; `scaleQty`, `calcIngredientLineCost`, `calcRecipeCost` moved to `packages/types/src/lib/costing.ts`; `normalize.ts`; `GET /admin/ingredients/duplicates`, `POST /admin/ingredients/merge`, 409 on referenced delete, `UnprocessedItems` loop; `aliases` matching in both imports; `IngredientDuplicates.tsx`; create-time warning in `IngredientFormModal`; removal of `deduplicate`; breadcrumbs on detail pages; fix `h-22`; delete `packages/utils` and `TABLE_NAMES`.
Files: as listed in 7.2 and 7.3, plus `ddb.service.ts`, `ingredients.controller.ts`, `ingredients.service.ts`, `recipes.service.ts`, `dto/ingredients.ts`, `api.ts`, `jest.config.js`, `tsconfig.json`, root `package.json`.
Schema: `aliases`, `mergedFrom`, `settings.ignoredDuplicateGroups`, `settings.categoryIcons`, `suppliers[].color`, all optional.
Migration: none. On-demand backup of ingredients and recipes before the first live merge.
Dalia notices: recipe pages she can read on her phone, a cook mode she can follow with wet hands, and "oeuf" / "oeufs" merged without losing recipe lines. The slice ends with a 20-minute kitchen session on her phone.
Effort: 9 to 10 days.

### Slice 2 (weeks 3-4): courses, order, week and day views

Scope: `EventRecipeLine` fields and strict line DTOs; `tsx` devDependency and `apps/backend/scripts/migrate.ts` with `001-line-ids`; `POST/PATCH/DELETE /admin/events/:id/lines[/:lineId]`, `PUT /admin/events/:id/lines` with the set check; `expectedUpdatedAt` in `DdbService.update` and the 409 filter; `settings.courses`, `recipe.defaultCourse`; `planning.ts`, `dates.ts`, `grocery.ts`, `StatusControl`; `Week.tsx` at `/semaine/:isoWeek` with `/` redirect, `Day.tsx`, `PrepSheet.tsx`, print stylesheet, `day-pdf.ts`; `EventDetail.tsx` menu by course with ▲▼, course select, "Terminer l'événement" replacing the pill; `EventEditor.tsx` diff-based autosave with `expectedUpdatedAt` and a course select; `Events.tsx` as `ListRow`s, ascending sort for À venir, deletion of the modal, the aggregated PDF, the multi-select and the localStorage hand-off; `exportRecipesPdf` deleted; `/grocery-list/new` generation with `eventIds` and the Régénérer banner; sidebar reorder, `MobileTabBar`, `Dashboard.tsx` moved to `/finances`; `SETTINGS_TTL` to 30 s.
Schema: line fields, `recipe.defaultCourse`, `settings.courses`, `groceryList.eventIds/range/excludeDone`.
Migration: `001-line-ids --dry-run`, then real, before the frontend deploy.
Dalia notices: the home page is her week with revenue, each day is a prep list she can tick, every line opens the recipe at the right portions, and menus read in service order.
Effort: 10 to 12 days.

### Slice 3 (weeks 5-6): clients and weekly templates

Scope: `ta-clients` table (console, SSM parameter, `ec2-bootstrap.sh`, `.env`, `pm2 restart`, `data-stack.ts`); `config.service.ts` optional var and `requireTable`; `client.ts`, `dto/clients.ts`; `clients` module with `instantiate` and `templates/from-event`; `Clients.tsx`, `ClientDetail.tsx` with the semaine type and the four-week grid; `EventEditor.tsx` client select with defaults; `EventDetail.tsx` client link, "Enregistrer comme modèle", "Mettre à jour le modèle", date-asking Dupliquer; `Week.tsx` client chips and next-week banner; `/events/new?client=` prefill; `api.ts` `clients.*`.
Schema: `event.clientId`, `event.templateId`.
Migration: `003-clients-from-contacts --dry-run`, run on confirm. Old events keep working through `contactName`.
Dalia notices: Hoona set up once, "Créer la semaine du 20 oct" in one tap, a client page that shows her next four weeks.
Effort: 7 to 9 days.

### Slice 4 (weeks 7-8): journal, closure, export

Scope: `taxonomies.ts`, `money.ts`, `ledger.ts`, `dto/ledger.ts`; settings `prestationTypes`, `company`; event fields `prestationType`, `vatRate`, `hoursPlanned`, `hoursSpent`, `km`, `serviceTime`, `costSnapshot`, `extraCosts[].kind`; snapshot on completion in `events.service.ts` with `EventsModule` importing recipes and ingredients, `POST /admin/events/:id/snapshot`; `ta-ledger` table and provisioning; `ledger` module with CRUD, prefill endpoints, lock; `calcEventCost` used by `EventDetail`, `EventEditor` and reports; `comptes/ComptesLayout.tsx`, `Journal.tsx`, `LedgerEntryForm.tsx`, `accounting.ts`, `ledger-export.ts`; Facturation section on the event with "Créer la facture" and "Enregistrer un acompte"; "Facturer le mois" on the client; prestation type and VAT in `EventEditor`; money strip on `Week.tsx`; `Dashboard.tsx` and `estimateBelgianTax` deleted.
Schema: `ta-ledger`, event fields, settings keys.
Migration: `002-cost-snapshots --dry-run`, then real. Settings defaults seeded on first read. No ledger backfill: the journal starts at the month of deployment; the 2025 workbook stays the record for 2025.
Dalia notices: closing an event asks for the Falco number and VAT, the journal and "Total CA" per month come out of the app, and the accountant receives an xlsx in the columns she already uses. The slice ends when the accountant has opened one real monthly export.
Effort: 10 to 12 days.

### Slice 5 (weeks 9-11): reports, prévisionnel, au réel, polish

Scope: settings `fixedCharges`, `objectives` with their Paramètres sections and a paste helper for the ~30 charge lines; `reports.ts` with jest fixtures; `Apercu.tsx` (chart moved and recoloured), `Resultats.tsx`, `Previsionnel.tsx`, `AuReel.tsx`; Extras summary in the Achats book; Compte de résultats sheet in the export; `InlineField` replacing the Editable* helpers in `RecipeDetail.tsx` and `EventDetail.tsx`; `DataTable` card fallbacks on `Ingredients.tsx` and the Comptes pages; grocery page card layout at every breakpoint with `fullBleed`; drag reorder on laptop; "Proposition de menu (PDF)"; supplier colour tags; `hoursSpent` inline.
Schema: settings keys only.
Migration: none.
Dalia notices: breakeven, treasury and the income statement in the app with the SRL tax, a client-facing menu PDF in one click, and the phone layout finished.
Effort: 10 to 12 days.

### Slice 6 (optional): AI recipe import

Scope: `ai` module, `POST /admin/ai/parse-recipe`, optional SSM key, `/health aiEnabled`, import flow into `RecipeEditor`. Migration: none. Effort: 3 days, only if Dalia supplies a key and still types recipes by hand.

Total: about 46 to 55 days across eleven weeks. If time runs out, stop after slice 4; the journal and the export already retire the monthly sheets, and the reports can follow a quarter later.

## 9. Open questions for the caterer

1. Is Hoona fed every working day or once a week? Default assumed: one template per delivery day; both shapes work.
2. Is Hoona (and the office lunches) invoiced per delivery or monthly? Default: `invoicing: "mensuelle"` with one entry over several events.
3. Which VAT rate applies to ateliers? Default: 21 %, editable in Paramètres.
4. Which corporate tax rate should the income statement use? Default: 25 %, with the 20 % SME rate to confirm with the accountant; the workbook used 15 %.
5. Are deposits invoiced through Falco and VAT-bearing in the month received? Default: yes, as `acompte` entries dated when the money arrived, matching the workbook.
6. Does the accountant accept the xlsx layout as is, or does she want a different column order or a CSV? Default: the workbook's exact columns, one sheet per month.
7. Should 2025 journal lines be imported from the workbook so Aperçu can compare years in 2026? Default: no import; the 2025 column stays empty until she asks.
8. Does she still want a printed sheet during the transition? Default: yes, "PDF du jour" stays for two months.
9. Which emoji or icon per recipe category and course, if any? Default: none until she asks; the fields exist.

## 10. Risks

- **Whole-array overwrites.** `EventEditor.buildPayload` (line 66) sends every field, including `recipes`, 800 ms after any keystroke. The diff-based autosave, `expectedUpdatedAt` and the line endpoints ship in the same slice; if the editor change slips, a laptop tab can undo a status ticked on the phone. Test the two-device case before release.
- **Migration 001 is a hard ordering constraint.** The line endpoints address lines by `lineId`; the frontend must not deploy before the script has run. Mitigation: the runner is idempotent and `EventsService` still fills missing ids on write.
- **Two new tables on a hand-provisioned stack.** Each needs the console, SSM, `.env` and pm2 steps. Optional env vars keep the API booting, but a forgotten parameter makes Clients or Comptes return 503. `/health` reports which tables are configured; `data-stack.ts` is updated in the same PR.
- **Approximate snapshots.** Events completed before slice 4 get `costSnapshot` at today's prices, flagged `≈`. The 2025 income statement is a reconstruction; she can type `actualCost` or an `mp` purchase line for those months.
- **Accounting defaults are assumptions.** Atelier VAT, the corporate tax rate and VAT on deposits are editable and flagged in the UI; the accountant should confirm them before the first export is relied on.
- **Breakeven mismatch.** The MP-adjusted seuil is higher than her number; it is the second line, labelled, and the workbook formula stays primary.
- **Pro-rata attribution of monthly invoices** is a rule the workbook does not have. Au réel shows both the attributed figure and the invoice total so a mismatch is visible.
- **Settings item is last-write-wins** (`SettingsService.update` is a put). Courses, prestation types, charges and objectives share it. Acceptable for one user; adding `expectedUpdatedAt` to settings is a one-line follow-up once accounting lands.
- **Merge on a concurrently edited recipe.** The remap writes each recipe's `ingredients` array; an edit to that array from another tab in the same seconds is lost, and the re-scan before delete catches a reintroduced reference. The page asks to close other tabs.
- **Print on iOS Safari.** Page breaks inside long groups are less controllable than jsPDF, which is why "PDF du jour" stays during the transition.
- **Design judged by Dalia, not by tokens.** The contrast values are targets derived from the audit's measurements, not re-measured here; the primary fill darkens the brand orange. Slice 1 ends with her phone in her hands before the same look reaches list pages.
- **Slice 4 may overrun.** Journal and export ship first; Résultats, Aperçu and the rest are already in slice 5.
- **Not checked:** iOS Safari behaviour of `100dvh` with the bottom tab bar over the full-bleed grocery page; whether Falco exports CSV; the live supplier list in settings; `LoginPage.tsx` and `RecipeEditor.tsx` were not read in detail, so the `FieldLabel` replacement there is assumed mechanical.