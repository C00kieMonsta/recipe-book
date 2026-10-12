# Plan de refonte: La Table d'Amélie

## 1. Summary

The home screen becomes the week: seven days, every recipe line with its client and portions, signed revenue per day and per week, and one tap from a line to a prep sheet that reads the recipe at the event's portions in large type. The finance dashboard, the week modal and the aggregated PDF go away; the Comptabilité section replaces the Excel workbook with a journal, a monthly overview, an income statement, a forecast and a signed-versus-target tracker, all views over a ledger of records that are edited only on purpose, plus settings keys for charges, objectives and month closes. The design system (16px body, 18px recipe text, darker muted grey, a primary measured at 4.98:1 with white, sentence-case labels, 44px targets) ships first because tokens change every page in a day. The ingredient merge is rebuilt as remap-then-delete with a normaliser, a fuzzy finder whose fuzzy matches are never preselected, and a chosen survivor, replacing the destructive `deduplicate`. Event lines get a stable `lineId`, a course and a prep status; array order is the order; ids are filled on first read, so there is no migration script. Recurring clients get a `Client` record with embedded weekly templates, so Hoona is set up once and instantiated per week with an idempotent call that asks for the head count. Two new DynamoDB tables (`ta-clients`, `ta-ledger`); everything else is optional fields or settings keys. Order of delivery: readable recipes and the merge (weeks 1-2), courses and the week view (3-4, in two deliverables), clients and templates (5-6), journal and export (7-8), reports and polish (9-11). A ledger entry can cover several events, which is how the workbook already invoices office lunches. Thermomix commissions stay outside CA, the loan repayment stays outside the income statement, raw material cost per month has a deliberately chosen source, and prior-year totals are typed once so the overview compares years from day one. Accounting defaults (atelier VAT, corporate tax rate, VAT on deposits, commissions, vouchers, credit notes) are editable and listed for the accountant in section 9.

## 2. What the caterer asked for, mapped to decisions

| Feedback item | Decision | Where |
|---|---|---|
| Replace the 30-page prep PDF with an interactive week view, planning plus revenue | `/semaine/:isoWeek` is the home; seven columns from 1280px, stacked days below; "Signé cette semaine", "Signé ce mois" against the monthly objective, prep progress | 3, 5.1, 7.1 |
| Clickable prep sheets per day ("30 amuse-bouches pour tel client") | `/jour/:date` lists every line by event, category or recipe; `/events/:eventId/lines/:lineId` is the scaled reading sheet with a status control | 5.2, 5.3, 7.1 |
| Font size, colours, layout not user-friendly; hard to follow a recipe | Token pass in `index.css` and `tailwind.config.ts`, 704px reading column, `RecipeReader` shared by the prep sheet and `/recipes/:id`, an "Aa" size toggle, cook mode rewrite | 4, 5.4, 5.5, 7.2 |
| Notion as the reference | Documents not boxes: headings and whitespace, one accent colour, soft tints, collapsible `SectionToggle`, light sidebar, breadcrumbs | 4 |
| Request 1: duplicate ingredients, pick one, replace in recipes | `GET /admin/ingredients/duplicates`, `/ingredients/doublons` page, `POST /admin/ingredients/merge` remap-then-delete, `aliases` on the survivor | 5.10, 7.3 |
| Request 2: reorder recipes in an event, sort by category | `lineId`, `course` on the line, `settings.courses` labelled "Catégories du menu", array order, `PUT /admin/events/:id/lines` with the set check, ▲▼ on phone (slice 2) and drag on laptop (slice 5) | 5.7, 6, 7.4 |
| Request 3: Hoona weekly view, day by day, favourite to stop duplicating | `Client` table with `templates[]` per weekday, `POST /admin/clients/:id/instantiate` with a head count, client chip and "Créer la semaine" banner on the week | 5.11, 7.5 |
| Request 4: Livre des comptes / compte de résultats | `ta-ledger` table, settings keys for fixed charges, objectives, prior-year totals and month closes, five Comptabilité pages, xlsx export in the workbook's columns, SRL tax model | 5.12 to 5.16, 7.6 |
| Prestation types are a third taxonomy (working interpretation) | `prestationType` on the event only; `recipe.type` and `settings.recipeCategories` stay as the recipe's service format, relabelled "Formats de recette"; nothing is merged | 5.17, 7.4 |
| Enobase: planning, main-d'œuvre, extras, devis, factures, CRM at 200 €/month | Planning and prep now; extras as ledger purchase lines; a one-day "Proposition de menu" PDF instead of quotes; invoices stay in Falco; CRM is the thin client record; Odoo never | 7.8 |
| AI integration unclear | Not now for the core; one optional recipe import from photo or text behind an OpenAI API key (a ChatGPT subscription cannot be used) | 7.7 |

## 3. Information architecture

### Home

`/` redirects to `/semaine/<current ISO week>`. The week is the home on every device.

### Sidebar (laptop)

Edit `menuItems` in `apps/frontend/src/components/admin/AdminSidebar.tsx` (lines 6-13), in this order:

| Label | Route | Icon (lucide) | Slice |
|---|---|---|---|
| Semaine | `/semaine` (active for `/semaine/*`, `/jour/*`, `/events/:id/lines/*`) | CalendarDays | 2 |
| Événements | `/events` | Calendar | existing |
| Recettes | `/recipes` | BookOpen | existing |
| Ingrédients | `/ingredients` (includes `/ingredients/doublons`) | ClipboardList | existing |
| Courses | `/grocery-list` | ShoppingCart | existing, renamed |
| Clients | `/clients` | Users | 3 |
| Comptabilité | `/comptes/journal` | Landmark | 4 |
| Paramètres | `/settings` | Settings | existing |

"Comptabilité" is the label because "Comptes" alone reads as accounts or logins; her words are "livre des comptes" and "compte de résultats". The old dashboard is not a sidebar entry: in slices 2 and 3 it is reachable from a link "Ancien tableau de bord ›" under the week's money strip, and it is deleted in slice 4.

The sidebar switches from the near-black brown to a light tinted panel (tokens in section 4), keeping the existing `mobileOpen` drawer and `collapsed` state (`AdminSidebar.tsx:19-20`). The version string at `AdminSidebar.tsx:86` moves to Paramètres. On `/semaine` below 1536px the sidebar renders collapsed by default (`w-16`, line 106), persisted with `hooks/use-local-storage.ts` and overridable by the chevron; see 5.1.

### Phone

The existing hamburger drawer and the 68px top bar stay (`AdminLayout.tsx:15` `pt-[68px]`). Breadcrumbs come from the `PageHeader` prop and live in the page body, not in the bar; the page title appears once. Cook mode and the prep sheet hide the bar. A bottom tab bar (Semaine, Événements, Recettes, Courses, Plus) is deferred to slice 5 and listed in section 11; it is the right shape for one thumb in a kitchen, not a Notion feature, and it is built only if the slice 1 kitchen session shows she misses it. When it lands the phone top bar becomes a back chevron plus the parent label ("‹ Semaine 42") with the body h1 sliding into the bar on scroll.

### Screens and routes

| Screen | Route | Status |
|---|---|---|
| Semaine | `/semaine/:isoWeek` | new |
| Jour | `/jour/:date` | new |
| Fiche de préparation | `/events/:eventId/lines/:lineId` | new |
| Cuisiner | `/recipes/:id/cook?portions=&event=&line=` | changed |
| Recette (lecture) | `/recipes/:id` | changed, read mode default |
| Recette (édition rapide) | `/recipes/:id?mode=edit` | existing inline JSX, opened by "Modifier" |
| Recette (formulaire) | `/recipes/new`, `/recipes/:id/edit` | `RecipeEditor.tsx`, restyled with `FieldLabel` in slice 1; used for creation, photo upload and the AI import |
| Recettes | `/recipes` | restyled |
| Événement | `/events/:id` | changed |
| Événement (édition) | `/events/new?date=&client=`, `/events/:id/edit` | changed |
| Événements | `/events` | restyled, sort fix |
| Courses | `/grocery-list`, `/grocery-list?id=` | restyled |
| Doublons d'ingrédients | `/ingredients/doublons` | new |
| Clients, Client | `/clients`, `/clients/new`, `/clients/:id` | new |
| Comptabilité | `/comptes/journal`, `/comptes/apercu`, `/comptes/resultats`, `/comptes/previsionnel`, `/comptes/au-reel` | new |
| Finances (ancien) | `/finances` | moved `Dashboard.tsx`, slices 2 and 3 only, deleted in slice 4 |
| Paramètres | `/settings` | extended |

Two recipe editors survive this plan: the inline `?mode=edit` on `RecipeDetail.tsx` for quick edits and `RecipeEditor.tsx` (333 lines) for creation and photos. Retiring one of them is not in this plan.

### Removed or merged

- `Dashboard.tsx` moves to `/finances` in slice 2 and is deleted in slice 4 with `estimateBelgianTax` (lines 308 to 326), the tax toggle and the override input. In slice 2 the toggle and the override input are hidden behind one `false` constant, since the sole-trader model is wrong for an SRL; the chart and KPIs stay until slice 4. Its chart is rebuilt in Aperçu over ledger HTVA. Note the in-place `events.sort(...)` on the state array at `Dashboard.tsx:49`; the file is deleted so it is not fixed separately.
- `WeekPlannerModal`, `generateAggregatedPdf` and the multi-select in `Events.tsx` are deleted; `startOfWeekMonday` and `endOfWeekSunday` move to `lib/dates.ts`. `exportRecipesPdf` in `EventDetail.tsx` (lines 100-175, one function and one button) stays until slice 5 as the per-event paper fallback; see 7.1.
- The "Dédoublonner" menu item (`Ingredients.tsx:105`) and `POST /admin/ingredients/deduplicate` are removed.
- The clickable status pill in the events list is removed; status changes on the event page.
- Breadcrumbs on every detail page replace `navigate(-1)` ("Retour") at `RecipeDetail.tsx:263` and `EventDetail.tsx:192`.
- Accounting lives under Comptabilité. The week header carries the money strip defined in 5.1 (three tiles); À encaisser and Marge brute live on Aperçu and the journal, not on the week.

## 4. Design system

### Type scale

Add to `theme.extend.fontSize` in `apps/frontend/tailwind.config.ts`:

| Token | Size / line height | Use |
|---|---|---|
| `text-caption` | 13px / 1.4 | timestamps, table footnotes; nothing smaller anywhere |
| `text-sm` | 14px / 1.5 | tags, table numerics, secondary list lines |
| `text-base` | 16px / 1.6 | body, inputs, list titles, form labels |
| `text-lead` | 18px / 1.6 | recipe steps, ingredient lines, prep lines (22px with the "Aa" toggle, see 5.3) |
| `text-h3` | 20px / 1.3, weight 600 | section headings, DM Sans |
| `text-h2` | 24px / 1.25 | recipe names in cards, cook title, Playfair |
| `text-h1` / `md:text-h1-lg` | 32px / 1.15, 40px / 1.1 | page titles, Playfair |
| `text-cook` / `md:text-cook-lg` | 28px / 1.4, 36px / 1.35 | current cook step, Playfair |

`text-sm` and `text-base` are overridden in the config (Tailwind's defaults are 14/20 and 16/24); this changes every existing `text-sm` and `text-base` use, which is intended. Playfair only at 24px and above. Remove `h1, h2, h3, h4, h5, h6 { @apply font-serif; }` from `index.css` and apply `font-serif` explicitly in `PageHeader` and the reader. Delete the 14 `text-[10px]` and `text-[11px]` uses (Dashboard 4, GroceryListPage 6, Ingredients 2, RecipeDetail 1, Recipes 1). Delete `uppercase tracking-wider` (60 `uppercase` occurrences on 57 lines under `pages/admin`, 31 of them with `tracking-wider`); labels become sentence case.

### Spacing

8 / 16 / 24 / 40 / 64. `maxWidth.doc = 44rem` (704px) for reading pages, `maxWidth.wide = 72rem` for tables. `spacing.block = 2.5rem` between sections. List rows `min-h-12 py-3`. Tap targets `min-h-11 min-w-11` (44px, Tailwind's own `11` key, no custom `tap` key) on every control of the week, day, prep sheet, cook and grocery pages, including the week's line rows under the `touch:` variant. `.input-field` at `text-base py-2.5` so iOS stops zooming.

### Colour roles

The warm palette stays; the greys and the primary get darker so they pass 4.5:1 on beige. Exact replacement of the `:root` block in `apps/frontend/src/index.css`:

```css
:root {
  --background: 30 30% 97%;   --foreground: 20 20% 13%;
  --card: 30 40% 99%;         --card-foreground: 20 20% 13%;
  --popover: 30 40% 99%;      --popover-foreground: 20 20% 13%;
  --surface: 30 20% 94%;      /* sidebar, tiles; foreground 14.21:1 */
  --hover: 30 15% 93%;        /* row hover */
  --muted: 30 15% 93%;        --muted-foreground: 20 10% 38%;   /* 5.85:1 on background, 6.09:1 on card */
  --primary: 25 55% 41%;      --primary-foreground: 0 0% 100%;  /* 4.98:1 with white; 4.67:1 as text on background, 4.86:1 on card */
  --primary-soft: 25 60% 93%; /* foreground on it 13.80:1; primary on it only 4.26:1, see rule below */
  --secondary: 30 25% 90%;    --secondary-foreground: 20 25% 25%;
  --accent: 25 60% 60%;       --accent-foreground: 20 20% 13%;  /* 6.10:1; accent is a tint, dark text only (white would be 2.64:1); unused today */
  --success: 150 35% 30%;     --success-soft: 150 30% 92%;      /* 6.19:1 on background, 5.68:1 on its tint */
  --warning: 35 75% 34%;      --warning-soft: 40 80% 92%;       /* 4.81:1, 4.54:1 on its tint */
  --info: 210 30% 38%;        --info-soft: 210 40% 93%;         /* 6.04:1, 5.46:1 on its tint */
  --destructive: 0 60% 42%;   --destructive-foreground: 0 0% 100%; --destructive-soft: 0 70% 94%;  /* 6.33:1, 5.59:1 on its tint */
  --border: 30 20% 88%;       --input: 30 20% 80%;  --ring: 25 55% 41%;
  --radius: 0.625rem;
  --sidebar-background: 30 20% 94%;  --sidebar-foreground: 20 20% 13%;
  --sidebar-primary: 25 55% 41%;     --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent: 25 60% 90%;      --sidebar-accent-foreground: 20 20% 13%;  /* 12.93:1 */
  --sidebar-border: 30 20% 86%;      --sidebar-ring: 25 55% 41%;
}
```

The ratios in the comments were measured with the WCAG 2.x formula on these HSL values (sRGB, 8-bit rounding), not taken from the audit: the audit's suggested primary (25 55% 45%, stated as about 4.6:1) measures 4.27:1 with white, and 25 55% 44% measures 4.42:1, so the primary is 25 55% 41%. The primary fill darkens the brand orange. `scripts/check-contrast.mjs` (a 20-line script over the same token pairs, delivered in slice 1) re-runs the check and must pass before merging.

Rules: text on a tint is always the dark role colour, never the colour on beige. Exception: the primary tint (`primary-soft`, today's column header, the primary `Tag`) uses `text-foreground` (13.8:1), not `text-primary` (4.26:1). Input borders stay at about 1.5:1 on card on purpose (the warm look); inputs are distinguished by `bg-card` on `bg-background` plus the focus ring, so the 3:1 component-boundary rule is not met. Revisit if Dalia cannot find fields. `text-green-600`, `bg-blue-100`, `bg-amber-*` and the hex constants `COLOR_MARGIN = "#16a34a"` and `COLOR_TREND = "#0f766e"` in `Dashboard.tsx` are replaced by these tokens. Supplier colours: `SUPPLIER_COLORS` in `recipe-helpers.ts` is replaced by one function hashing the supplier name into an eight-colour accessible set, rendered as a tag with dark text on a tint. A per-supplier override in settings is not built (section 11).

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
  .table { @apply w-full text-sm tabular-nums; }                           /* plain tables, see rules below */
  .table th, .table td { @apply min-h-11 px-3 py-2.5 text-left align-middle; }
  .table tfoot td { @apply font-semibold border-t border-border; }
}
@media print {
  aside, nav, .no-print { display: none !important; }
  body { font-size: 12pt; }
  .print-break { break-before: page; }
}
```

The `.reveal` rule builds into `@media (hover: hover)` and `@media (hover: none)` blocks with the plugin below (verified on Tailwind 3.4.19).

### `tailwind.config.ts` edits

```ts
theme: {
  extend: {
    fontSize: {
      caption: ["13px", "1.4"], sm: ["14px", "1.5"], base: ["16px", "1.6"], lead: ["18px", "1.6"],
      h3: ["20px", { lineHeight: "1.3", fontWeight: "600" }], h2: ["24px", "1.25"], h1: ["32px", "1.15"], "h1-lg": ["40px", "1.1"],
      cook: ["28px", "1.4"], "cook-lg": ["36px", "1.35"],
    },
    maxWidth: { doc: "44rem", wide: "72rem" },
    spacing: { block: "2.5rem" },
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
StatusTag({ status: "upcoming"|"completed"|"invoiced"|"deposit"|"paid" })  // non-interactive
ListRow({ leading?, title, subtitle?, trailing?, onClick? })           // min-h-12, text-base title
StatusControl({ value: PrepStatus, onChange })                         // three 44px segments
Stepper({ value, onChange, min?, label? })                             // 44px buttons; the number is a 44px tappable field (inputmode="numeric", select-all on focus); ×2 and ÷2 shortcuts
SectionToggle({ title, defaultOpen?, storageKey?, children })          // Notion disclosure
FieldLabel({ children })                                               // text-base font-medium, shared by EventEditor, RecipeEditor, IngredientFormModal, LoginPage
MoneyTile({ label, value, sub?, progress?, ticks? })                   // slice 2
RecipeReader({ recipe, ingredientById, ratio, showCost?, size: "lead"|"xl" })
```

The existing `Editable*` helpers (`RecipeDetail.tsx:667-800`: `EditableNum`, `EditableText`, `EditableInlineNum`, `EditableType`; `EventDetail.tsx:345-500`: `EditableText`, `EditableInlineText`, `EditableInlineNum`, `EditableStatus`) move as they are into `components/ui/editable.tsx` when the recipe read mode lands, imported from both pages, duplicates deleted. A redesigned `InlineField` is not built (section 11). There is no generic `DataTable`: tables are plain `<table class="table">` inside `overflow-x-auto`.

### Phone versus laptop rules

- Reading pages (recipe, prep sheet, day, event) are one `max-w-doc` column at every width; the week is the only seven-column layout and it stacks below 1280px.
- Tables are kept where columns are summed: journal, compte de résultats, charges, aperçu, the recipe cost table. They scroll horizontally on phones. Everything else (events, clients, client history, Au réel, ingredients on phones) is `ListRow`s.
- Hover-revealed controls use `.reveal`; on touch they stay visible at 70%. Destructive actions live in edit modes, never on reading surfaces.
- `AdminLayout` exposes `fullBleed` through outlet context so `GroceryListPage.tsx:576` drops `-m-6` and sizes with `h-[calc(100dvh-68px)] md:h-[100dvh]`; the 68px matches `pt-[68px]` at `AdminLayout.tsx:15`. The week page uses the same `fullBleed` context.
- Fix the invalid `h-22` at `RecipeDetail.tsx:306` by showing the first photo full width (`aspect-[3/2]`).
- `lint:type-scale` in `apps/frontend/package.json`: `! grep -rnE 'text-xs|text-\[1[01]px\]|uppercase tracking-wider' src/pages/admin`, run by the root lint. No shell script.

## 5. Screens

### 5.1 Semaine (home)

Route `/semaine/:isoWeek`, for example `/semaine/2026-W42`. File `apps/frontend/src/pages/admin/Week.tsx`.

Purpose: what is cooked this week, for whom, and what it is worth.

Header: `‹ Semaine 42 ›` with 44px arrows, "12 au 18 octobre", an "Aujourd'hui" link, and from slice 3 a chip row "Tous · Hoona · Mariage Dupont" when any event has a `clientId`. Below it the money strip, three `MoneyTile`s, the same list in 3, 7.1 and 7.6:

- "Signé cette semaine": Σ `sellingPricePerGuest × guestCount` for events dated in the week.
- "Signé ce mois": the same sum for the calendar month of the week's Thursday, with a progress bar against `objectif mensuel(m)` (7.6). From slice 4 the bar gets a second tick "Facturé" = Σ ledger CA HTVA of the month (`isCaEntry`, 7.6). When `objectives[year]` is absent the tile shows the amount only and a link "Définir l'objectif" to `/settings`.
- "Préparation 18 / 40 lignes faites".

Laptop (`xl`, 1280px and above): seven columns. Below `xl`, which covers phones and iPads in both orientations, the week is the stacked layout described under Phone. The page opts out of `max-w-wide` through the `fullBleed` outlet context and uses `px-6`; on `/semaine` below `2xl` (1536px) the sidebar renders collapsed by default (`AdminSidebar.tsx:20`, `w-16` at line 106), persisted with `use-local-storage.ts`, overridable by the chevron. Column widths: 1280px gives 156px, 1366px gives 169px, 1440px gives 179px, 1536px with the sidebar open gives 168px. Grid: `grid-cols-[repeat(7,minmax(0,1fr))] gap-2 2xl:gap-3`. Column header on three lines inside the sticky header: "Mar 13" at `text-h3`, "2 évén. · 60 conv." at `text-sm`, "1 240 €" at `text-sm font-semibold`; today's header has a `primary-soft` background with `text-foreground`. One card per event, `min-h-[72px]`: name at `text-base font-medium line-clamp-2`, "60 conv.", "12 lignes · 3 faites", a 4px progress bar; the prestation `Tag` only at `2xl+`, as a `title` tooltip below that. Under the card, the event's lines in category order as `min-h-9` rows at `text-sm`: status dot, recipe name at `line-clamp-2`, portions `font-semibold tabular-nums` on the right; no truncation anywhere in the column. Lines beyond five collapse into "+ 4 lignes". A header toggle "Lignes / Événements" (persisted with `useLocalStorage`) collapses all lines; it defaults to Événements when the viewport is under 800px tall. Columns scroll inside `max-h-[calc(100dvh-220px)]`; the header stays fixed. A column with three events and fifteen lines is about 760px, so on a 768px laptop the busiest day scrolls inside its column; the Lignes / Événements toggle is the overview, and the line count on the card still answers "how much today" when collapsed.

Touch (`touch:` variant, any width): line rows are `min-h-11` and the status dot is a 44px control that cycles todo → doing → done on tap; no long-press anywhere.

Phone (below 1280px): days stacked, today expanded, other days a 56px row "Mar 13 · 2 évén. · 60 conv. · 3/12 faites". Tapping the day row expands it in place under a sticky day header; a chevron "Voir le jour ›" at the right of that header goes to `/jour/:date`. Inside a day: one event header row per event (name, client chip, guests, done count; tap → `/events/:id`), then its line rows at 48px `text-base` (tap → prep sheet). The money strip scrolls horizontally. 375px wireframe, one day expanded:

```
‹ Semaine 42 ›        12 au 18 octobre
[Signé sem. 4 820 €] [Signé mois 11 2…] [Prép 18/40]
─ Mar 13 · 2 évén. · 60 conv. · 3/12   Voir le jour ›
  Hoona · 30 conv. · 2/6 faites                      ›
    ● Mini quiches lorraines                  30
    ● Houmous betterave                       30
  Mariage Dupont · 30 conv. · 1/6 faites             ›
    ○ Tarte au citron                         30
─ Mer 14 · 1 évén. · 20 conv. · 0/5 faites           ▾
```

Interactions: prev/next week and ← → keys; tap an event card → `/events/:id`; tap a line → prep sheet; hover (pointer) a line shows `StatusControl`, the touch dot cycles; both write `PATCH /admin/events/:id/lines/:lineId { prepStatus }`; "+" on a day → `/events/new?date=` (and `&client=` when a client chip is selected, slice 3); "Courses de la semaine" creates a grocery list in one click (5.9); "Créer la semaine Hoona" banner (slice 3) whenever at least one weekday template of a client has no event in the displayed week; it opens a one-field sheet "Convives : [30]" with "Créer la semaine" (7.5); "Imprimer" prints the day structure of each day through the print stylesheet. Lines sit on their event's date in this plan (`prepDate` is stored but has no UI; section 11).

### 5.2 Jour (prep sheet list)

Route `/jour/:date`. File `Day.tsx`.

Purpose: every recipe line to prepare that day, grouped the way the kitchen works, with status.

Layout: breadcrumb "Semaine 42", title "Mardi 13 octobre" at `text-h1` Playfair, meta "2 événements · 60 convives · 12 lignes · 3 faites". Segmented control: **Par événement** (default), **Par catégorie** (courses from settings), **Par recette**. Buttons "Courses du jour" and "Imprimer". One `max-w-doc` column. Group headings at `text-h3` with a count on the right. Each line is a 56px row: `StatusControl` on the left (44px), recipe name at `text-lead`, second line "Apéritif · note" at `text-sm` muted, portions bold at `text-lead` on the right, a chevron. Done lines are dimmed and sorted last; "Masquer les lignes faites" hides them. In **Par recette** mode the merged quantity shows the breakdown underneath ("Mini quiches · 80 portions", then "Hoona 30 · Mariage Dupont 50"), a single status control that writes to every underlying line, and a `SectionToggle` "Ingrédients pour 80" with the scaled ingredient list on screen, not only in print.

Phone: same column, sticky group headings, status control reachable with the thumb, mode control as a dropdown, swipe for prev/next day.

Print: `@media print` hides chrome, one page per group (`.print-break`), 12pt body, expanded lines; in Par recette mode the scaled ingredient table prints under each recipe. On iOS the share sheet's print preview can be pinched into a PDF. There is no jsPDF day export in slices 1 to 4; the per-event `exportRecipesPdf` on the event page is the paper fallback. A day or week PDF with Web Share is in section 11.

### 5.3 Fiche de préparation (prep sheet)

Route `/events/:eventId/lines/:lineId`. File `PrepSheet.tsx`.

Purpose: "30 amuse-bouches pour Hoona": read one recipe at the line's portions, track status, add a note. This is the recipe reading screen the complaint is about. Split of the two reading screens, in one sentence: the prep sheet is read, note and tick; "Cuisiner" is hands-free step by step.

Layout: breadcrumb "Mardi 13 oct / Hoona". Title row: a 64px thumbnail of the first photo beside the recipe name at `text-h1` (the full-width photo exists on `/recipes/:id` only). Summary at `text-lead`: "**30 portions** pour Hoona · Apéritif" with "(recette de base : 10)" at `text-sm`. An "Aa" toggle (persisted) switches `RecipeReader` between `lead` (18px) and `xl` (22px) for steps and ingredients, for the phone propped on the counter. Body is `RecipeReader` in a `max-w-doc` column, no cards: **Ingrédients** heading with a `Stepper` above a two-column list at `text-lead` (48px rows, name left, quantity bold with unit muted right), quantities scaled with `scaleQty(qty, ratio)` moved from `RecipeCook.tsx:46` to `packages/types/src/lib/costing.ts`; **Préparation** as numbered steps at `text-lead leading-relaxed`, 32px badge, `space-y-5`, left-aligned, selectable; **Note pour cette fois** textarea at `text-base` saved on blur to `line.notes`; a collapsed `SectionToggle` "Coût matières" with the cost table at `text-sm`. One sticky 64px bottom bar holds `StatusControl` (À préparer / En cours / Fait, 48px) and "Cuisiner". On a 375×667 phone the first ingredient is within the first screen: 68px bar hidden on this route, title row 72px, summary 32px, heading 40px.

Laptop ≥1280px: ingredients 320px left, steps right, status bar as a sticky right card. Phone: single column, the bottom bar fixed at `bottom:0`, an "Ingrédients ▾" pill pinned under the top once the user scrolls into the steps.

Interactions: status writes `PATCH .../lines/:lineId { prepStatus }`; marking Fait navigates back to the day with a toast "Mini quiches faites" and a "Suivante" action opening the next À préparer line; "Cuisiner" → `/recipes/:recipeId/cook?portions=30&event=&line=`; the stepper rescales locally and shows "Enregistrer 36 portions" when it differs from the line, writing `{ portions }` only when tapped; ← → and swipe move to the previous or next line of the day; `navigator.wakeLock.request("screen")` on mount, released on unmount. No inline editing of the recipe; "Modifier la recette" in the overflow goes to `/recipes/:id?mode=edit`. The 18 versus 22px default is validated in the slice 1 kitchen session and the result recorded in 7.2.

### 5.4 Cuisiner (cook mode)

Route `/recipes/:id/cook?portions=30&event=:eventId&line=:lineId`. File `RecipeCook.tsx`, rewritten.

Layout: header 64px with "Quitter" (44px), recipe name at `text-h2` Playfair, "pour Hoona · 30 portions" when `event` is present, `Stepper` prefilled from `?portions` (`useSearchParams`, `setCookPortions(Number(portions) || r.portions)` instead of line 19), "Étape 4 / 9". Tablet and laptop (`md+`): `grid md:grid-cols-[320px_1fr]`, ingredients pinned left at `text-lead` (each row tappable to tick off), steps right with the current step at `text-cook md:text-cook-lg` Playfair left-aligned and the others at `text-lead` muted; tap any step to jump. Phone: one column of steps with the current step enlarged, the previous step above at `text-base` muted for context, a 56px "Ingrédients (12)" bar that opens a bottom sheet with the scaled list. Footer: Précédent and Suivant at 56px, no dot strip. `select-none` removed from line 52; portion buttons 44px instead of `w-7 h-7`.

Interactions: ← → keys and swipe; space is unbound because it scrolls; Escape exits; wake lock on mount; last step shows "Marquer fait" when `line` is present, which writes `prepStatus: "done"` and returns to the day sheet, otherwise "Terminer" returns to the recipe.

### 5.5 Recette (lecture et édition)

Routes `/recipes/:id` (read, default) and `/recipes/:id?mode=edit`.

Read mode renders `RecipeReader` in a `max-w-doc` column: breadcrumb "Recettes / Tarte au citron", first photo full width, title at `text-h1`, meta row of `Tag`s (format, portions, g/pers), description at `text-base`, ingredients list with a `Stepper` defaulting to `recipe.portions` (typed field plus ×2 and ÷2, so 10 → 60 is two taps and a number, not 50 taps), steps at `text-lead` with the "Aa" toggle. Then two collapsed `SectionToggle`s: "Coût matières" (today's six-column table as a `.table` inside `overflow-x-auto`) and "Simulation de prix" (`PricingSimulation` unchanged; the `tva` inputs become a select limited to `VAT_RATES`). Header actions: "Cuisiner" (primary), "Modifier" (opens `?mode=edit`), overflow with Dupliquer, Exporter PDF (bumped to 11pt body), Supprimer. Phone: sticky bottom bar with Cuisiner and Modifier.

Edit mode keeps today's `RecipeDetail.tsx` JSX in slice 1, with the `Editable*` helpers imported from `components/ui/editable.tsx` and a "Terminé" button back to read mode. Reading surfaces never have click-to-edit text.

### 5.6 Recettes (liste)

Route `/recipes`. Laptop keeps the three-column card grid: photo `aspect-[3/2]` or a 160px tinted block with a `BookOpen` icon, name at `text-h2` Playfair, description at `text-sm` two lines, meta at `text-sm`. Phone switches to full-width `ListRow`s with a 64px thumbnail. Format chips come from `settings.recipeCategories` plus values found on recipes (as `Recipes.tsx:85` already unions them). Import and export modals keep their logic, restyled with `FieldLabel` and `text-base` inputs. Search sticky under the top bar on phones. No emoji per format (section 9, Q9).

### 5.7 Événement

Route `/events/:id`. File `EventDetail.tsx`.

Layout: breadcrumb "Événements / Hoona · mardi 13 oct". Title at `text-h1`; meta line "Mardi 13 octobre · 30 convives · Buffet à emporter · Hoona" with the client name linking to `/clients/:id`; `StatusTag` À venir / Terminé plus, from slice 4, one of three derived tags: "Facturé n° 2026-014" (at least one `facture` or `comptoir` entry includes the event), "Acompte reçu" (only `acompte` entries include it), "Payé le 3/11" (Facturé and every entry including the event is paid). Four `MoneyTile`s using the shared `calcEventCost` (6): "Coût matières" = `rawMaterial + extras.matiere` with a source note "figé le 18/10" or "estimé", "Revenu HTVA", "Marge" = revenue − `total`, "Marge %". Sections separated by whitespace, no cards:

- **Menu**: one block per category in `settings.courses` order; each line a 56px row with ▲▼ buttons (44px) in slice 2 and a drag handle on pointer devices from slice 5, recipe name at `text-base`, portions `EditableInlineNum` writing `PATCH .../lines/:lineId { portions }` (`updateRecipePortions` at line 178 is deleted), status dot, category select, overflow (Note, Cuisiner, Retirer). "+ Recette" opens the existing `SearchSelect` and prefills the category from `recipe.defaultCourse`.
- **Coûts supplémentaires**: label, `kind` select (Matière, Personnel, Location, Transport, Autre), amount.
- **Heures** (slice 4): `hoursSpent` only. KM is typed on the ledger line.
- **Facturation** (slice 4): linked entries with their tags; buttons "Enregistrer un acompte" and "Créer la facture", both offered on upcoming events too (prefill from price × guests, no snapshot needed); red tag "Type de prestation manquant" when `prestationType` is absent.
- **Notes**.

Primary action: "Terminer l'événement" replaces the status pill; it computes `costSnapshot` with `calcEventCost` from the recipes and ingredients the page already loads (`EventDetail.tsx:25`) and PATCHes `{ status: "completed", costSnapshot }`. "Reprendre le coût" in the overflow sends a fresh snapshot the same way. "Ajuster les portions aux convives" (slice 3) rescales every line by `newGuests / oldGuests` after confirmation. Overflow: Modifier, Dupliquer (asks for a date instead of using today, `EventDetail.tsx:81`), Enregistrer comme modèle (slice 3), Proposition de menu PDF (slice 5), Exporter les recettes (PDF) (today's `exportRecipesPdf`, until slice 5), Supprimer. Phone: tiles 2×2, category blocks collapsible, ▲▼ only.

### 5.8 Événements (liste) and éditeur

`/events`: `ListRow`s instead of the eight-column table: name at `text-base`, "Mar 13 oct · 30 conv. · Hoona · Buffet à emporter" at `text-sm`, revenue HTVA and `StatusTag` on the right. Filter chips À venir (sorted ascending, fixing `Events.tsx:45`), Terminés (descending), Tous; client select; search. The checkbox column, the trash icon and the "Liste de courses (n)" action go; grocery lists come from the week or day view. No clickable status.

`/events/new?date=&client=` and `/events/:id/edit`: `EventEditor.tsx` keeps the 800 ms autosave (line 98). `buildPayload` (line 66) drops `recipes` once the event exists: adding or removing a line in the editor calls `POST` / `DELETE /admin/events/:id/lines[/:lineId]` directly and portion edits call `PATCH .../lines/:lineId`. For a new event the first autosave is a `POST` whose payload still carries `recipes` (lines 79-84), after which the editor holds `currentId` and switches to the line endpoints. The server-side merge rule in 6 (Endpoints, `PATCH /admin/events/:id`) protects status, notes and category against a cached old bundle that still sends the array. New fields: client picker (creates a client inline, copies `defaultPrestationType`, `defaultVatRate`, `defaultPricePerGuest` into empty fields), prestation type (required for new events, defaults VAT), VAT rate, category select next to portions, extra cost kind. The `addRecipe` duplicate guard at line 136 becomes a confirmation once lines have ids. Inputs at `text-base`. Optimistic concurrency (`expectedUpdatedAt`) is not built; section 11.

### 5.9 Courses

One-click generation: "Courses de la semaine" on `Week.tsx` and "Courses du jour" on `Day.tsx` call `buildGroceryItems(events, lines, recipes, ingredientById)` in `apps/frontend/src/lib/grocery.ts`, the body of `generateGroceryList` (`Events.tsx:81-138`) with lines selected by event date in range, then `api.groceryLists.create({ title: "Courses · semaine 42", items, eventIds, range })` (`api.ts:113`, the create type extended by two fields), then navigate to `/grocery-list?id=<listId>`, which `GroceryListPage.tsx:98-100` already handles. `eventIds` and `range` are written at creation even though the Régénérer banner is deferred (section 11), so lists made before it exists can be regenerated. The `recipe-book:grocery-list-pending` localStorage hand-off (`Events.tsx:127`, `GroceryListPage.tsx:21`, `:102-110`) is deleted. A generation form with checkboxes per event (`/grocery-list/new`) is not built.

`/grocery-list?id=`: `GroceryListPage.tsx` uses the card layout at every breakpoint (48px rows, full-row tap toggles checked, name at `text-base`, "à acheter" quantity bold, stock input revealed by a tap, drag between suppliers on pointer, "Déplacer vers" select on touch), supplier headers as `Tag`s, export actions behind a labelled `ActionMenu`, suppliers from `api.settings.get()` instead of `DEFAULT_SUPPLIERS` (line 46). The card layout lands in slice 5; until then the page is only retokened.

### 5.10 Doublons d'ingrédients

Route `/ingredients/doublons`. File `IngredientDuplicates.tsx`. Linked from a banner on `/ingredients` ("12 doublons probables · Fusionner").

Layout: a `max-w-doc` column of groups. Group header: the suggested survivor's name ("Oeufs") with the normalised key in `text-caption` ("oeuf"), "4 variantes · 23 recettes". One row per candidate: radio "Conserver" (44px), checkbox "Inclure" (44px, ticked for Identique, unticked for Proche and À vérifier), name, price and unit, supplier, "dans 12 recettes · 2 listes", updated date, confidence `Tag` per row (Identique, Proche, À vérifier). Candidates whose unit family differs from the chosen survivor are greyed and cannot be included; the row shows "Unité différente (€/pièce vs €/kg)", a link "Voir les 3 recettes" listing the recipes that use it, and the sentence "Ces recettes utilisent cet ingrédient en pièces. Convertissez leurs quantités en grammes, puis revenez fusionner." The group stays visible so she can come back. A confirmed conversion factor (1 pièce = 60 g) applied by the app is not in this plan. Footer: "Fusionner dans Oeufs" (disabled when nothing is ticked) and "Ignorer ce groupe". A search box builds a manual group from two arbitrary ingredients. A top bar shows "12 groupes · 29 ingrédients".

Interactions: changing the survivor radio recomputes each row's confidence and default tick; "Fusionner" sends the ticked members as `mergedIds` to `POST /admin/ingredients/merge { survivorId, mergedIds }` and shows "23 recettes et 2 listes mises à jour, 3 ingrédients supprimés"; when the body has `failures`, the group stays open with the failure list and "Réessayer"; "Ignorer" stores the key in `settings.ignoredDuplicateGroups` (`api.settings.update` already invalidates the settings cache, `api.ts:103`). `IngredientFormModal` runs `normalizeIngredientName` against the loaded list on create and shows "Semblable à : Oeufs · Utiliser" before saving.

### 5.11 Clients

`/clients`: `ListRow`s with name, "Entreprise · Menu à emporter · 6 %", "Prochain : mardi 13 oct", "4 820 € signés cette année". Search, "+ Client" → `/clients/new`.

`/clients/:id`: header with name, kind, contact, defaults (prestation type, VAT, price per guest, guest count), invoicing mode (par événement / mensuelle). Section **Semaine type**: a Lundi to Dimanche list where each weekday shows its template (recipes by category with portions, guests, price) or "+ Ajouter un jour"; "Créer depuis un événement" copies an event's lines, guests, price, prestation, VAT, extra costs and notes into a weekday through a client-side `PATCH /admin/clients/:id` (no dedicated endpoint). Section **Historique**: two `ListRow` lists, events (date, name, guests, Signé = price × guests, a "Facturé n° …" tag when a `facture` entry includes it) and the client's journal entries (slice 4) with "Facturer le mois". "Associer les événements existants" (optional) calls `POST /admin/clients/:id/link-events { contactEmail?, contactName? }` to set `clientId` on old events whose contact matches. Phone: sections stacked.

Not built: a four-week grid (the week banner and "+" on a day are where she creates the week), favourites without a weekday (Dupliquer asks for a date), "Mettre à jour le modèle depuis cet événement" as an endpoint (it is the same client-side copy). Delete is refused with 409 `IN_USE` when any event has `clientId = id`; the UI offers "Archiver" (`active: false`), which hides the client from pickers and chips.

### 5.12 Comptabilité · Journal

Route `/comptes/journal?ym=2026-10&book=ventes`. Tabs across every `/comptes/*` page: Journal · Aperçu · Compte de résultats · Prévisionnel · Au réel. The month header shows "Verrouillé le 3/11" when `monthCloses[ym].lockedAt` exists.

Laptop: year and month selects, book switch Ventes / Achats, filter chips (Tous, Non réglés, Événements, Comptoir, Acomptes, Commissions, Notes de crédit). A `.table` at `text-sm` tabular with the workbook's 14 columns, Type moved next to Intitulé on screen (the export keeps the workbook order): N° | Date | Intitulé | Type | Total TVAC | HTVA | TVA 6 % | TVA 12 % | TVA 21 % | Réglé | Mode | Encaissé le | Description | KM. Footer: Σ TVAC, Σ HTVA, Σ per rate, "Total CA 10/2026" = Σ HTVA over CA lines (`isCaEntry`, 7.6), then Σ HTVA per prestation type with a "Sans type" row, then a separate line "Commissions (hors CA)" = Σ HTVA of commission entries. Achats columns: Date | Intitulé | Type (MP, Personnel, Autre) | Fournisseur ou Personne | Heures | Taux | HTVA | TVA | TVAC | Réf. A right rail shows Acomptes du mois, Commissions, À encaisser (count and Σ TVAC of unpaid sales entries), and in the Achats book a per-person **Résumé facture** (shift dates, Σ heures, taux, montant) that replaces the workbook's "factures" sheet. Buttons: "Nouvelle ligne", "Exporter 2026 (xlsx)", "CSV du mois", "Verrouiller le mois" (or "Déverrouiller").

Phone: card per entry (label bold, date and N° muted, TVAC and HTVA right, Réglé tag), totals in a sticky footer; the entry form is a full-screen sheet.

Interactions: the form has kind, date, number, label, client, events (multi-select), prestation type, TVAC, one VAT rate, HTVA and TVA prefilled by `splitTvac` and editable, paid with method and date, KM, description; for `personnel` lines person, hourly rate and a shifts list (date, hours); for `note_de_credit` the corrected entry. One rate per entry, as in the workbook: "Ajouter une ligne pour l'autre taux" creates a second entry with the same number. The DTO refuses lines where HTVA + TVA differs from TVAC by more than 0,01. Row tap opens the form (`PUT`); "Réglé" inline opens a two-field popover (`PATCH`). On a locked month, amounts, dates, numbers, kind, type and events are read-only and the form says "Mois verrouillé"; Réglé, Mode, Encaissé le and Description stay editable. After a successful export a one-line prompt "Verrouiller octobre 2026 ?" offers Oui / Plus tard; the export itself writes nothing. Export is described in 7.6.

### 5.13 Comptabilité · Aperçu par mois

Route `/comptes/apercu?year=2026`. Tiles: CA année, Objectif année, Atteint %, "Seuil mensuel (seule)" or "(avec salarié)" following the scenario selected on Prévisionnel, À encaisser, Marge brute du mois %. The bar chart from `Dashboard.tsx` moved here, recoloured with tokens, three bars per month (CA N−1, CA N, Objectif) and a line for Prévision, 12px axis minimum. `.table` Mois | CA HTVA N−1 | CA HTVA N | Δ % | Objectif | Prévision (signé) | Atteint, totals row; a line under it "Autres produits (commissions) N / N−1". Cells that come from `settings.yearActuals` carry a `Tag` "saisi" with the note as tooltip. Section Mix par prestation: Type | CA N−1 | % | CA N | % | Objectif | % | Nb nécessaires. `SectionToggle` Comparaison par période (1 jan to 30 avr, 30 avr to 30 juin, for N, N−1, N−2). Phone: tiles two per row, chart full width, tables scroll. Tap a month → journal for that month; tap a type → journal filtered; "Modifier l'objectif" → Prévisionnel; "Années précédentes" → Paramètres.

### 5.14 Comptabilité · Compte de résultats

Route `/comptes/resultats?year=2026`. `.table` with 12 month rows plus Total année: Mois | CA HTVA | Coûts MP | Marge brute | Autres produits | Charges fixes | Personnel extra | Autres coûts | Résultat avant impôts | Marge % | Impôts (estimation) | Résultat net. Each Coûts MP cell carries a `Tag` with its source ("calculé", "achats", "saisi"); when the source is calculé and the month has `mp` purchase lines, the purchases figure shows beside it with a tag "achats partiels". For the current and future months a "MP prévu" line sums upcoming events; for past months it is replaced by "N événements non terminés" linking to them. Ratio rows MP / CA, Marge brute / CA, Charges fixes / CA, all over CA (Falco). No scenario toggle: realised months use `monthlyAmount`; a Simulation row at the bottom picks a scenario and reads the objective. Footnote under Impôts: "le total annuel est calculé sur le résultat cumulé, pas additionné"; when `corporateTaxActual` is typed it replaces the annual estimate and is tagged "réel". Settings inline: "Taux ISoc 25 %" with the help text from 7.6. Phone: one card per month with CA, MP, Résultat, Net and a disclosure for the rest. Tap Coûts MP → "Source MP" dialog (calculé / achats / saisi with the three figures) and the month's purchase lines with "Ajouter un achat"; tap Personnel extra → the month's personnel lines; "Exporter" adds this sheet to the xlsx.

### 5.15 Comptabilité · Prévisionnel

Route `/comptes/previsionnel?year=2026`. Left: the Objectif form (CA annuel, mois actifs, heures disponibles par mois with per-month overrides, % MP, taux ISoc and the "taux réduit PME" checkbox, budget extras, mois de trésorerie, épargne mensuelle, objectif par prestation with events needed and guests per event, investissements). Right: charge table Intitulé | Catégorie | Mensuel | Mensuel seule | Annuel | Dans le résultat | Depuis | Jusqu'au with a scenario toggle and two totals: "Total charges mensuelles" (all rows, matches the workbook's 7 527,27) and "dont hors résultat" (600). Rows with `inResult` false carry a `Tag` "hors résultat". Below: Seuil de rentabilité annuel et mensuel (workbook formula, primary), "Seuil par mois actif" = Seuil annuel / mois actifs, "Seuil ajusté matières" (secondary, labelled), Besoin de trésorerie, "Résultat prévu après matières et extras", ISoc prévu, "Marge nette après ISoc %", and a small third line "Objectif − seuil (formule du classeur)". Charges are a plain editable list; Depuis and Jusqu'au are optional month fields she sets by hand when an amount changes. "Copier l'objectif de 2025" seeds a new year. Phone: forms stacked, charges as cards.

### 5.16 Comptabilité · Au réel

Route `/comptes/au-reel?ym=2026-10`. Month ‹ ›. `ListRow`s, one per CA sales entry dated in the month (label, type, HTVA, linked events in the meta line) plus one per event dated in the month that no `facture` or `comptoir` entry covers (name, type, price × guests, tagged "signé"); entry rows are tagged "facturé". Commission entries are not rows. Trailing inline fields: Heures (`EditableInlineNum` writing `event.hoursSpent` on event rows) and Observations (`event.notes`). Footer: Total signé, Total heures, Je vise, Temps disponible (the month override or the yearly value), Il me reste à signer, Heures restantes. Year summary with the gap to the annual objective. Rows without a prestation type show a warning tag. Phone: the footer pinned.

### 5.17 Paramètres

Route `/settings`, a `max-w-doc` column of sections at `text-base` with 44px rows: Formats de recette (today's `recipeCategories`), Catégories du menu (courses, ordered, ▲▼), Types de prestation (key, label, default VAT), Fournisseurs (name, address, phone), Charges fixes (editable list with Dans le résultat, Depuis, Jusqu'au), Objectifs par année (slice 2 ships CA annuel HTVA and mois actifs; slice 5 adds the rest), Années précédentes (per year: 12 monthly cells, a per-type list, a period list, a note), Société (name, VAT number, address, date de constitution for the export header), Doublons ignorés (with "Reprendre"), À propos (version). Saves go through `PATCH /admin/settings` with the extended DTO. Renaming a category offers "Renommer aussi sur 42 lignes d'événement", which groups the lines by event and sends one `PUT /admin/events/:id/lines` per event, sequentially, with the renamed category. No AI section until slice 6 ships.

## 6. Data model changes

All additions are optional on read unless marked required. `removeUndefinedValues: true` in `DdbService` (line 27) means undefined optionals are not written. Shared code goes in `packages/types`; run `pnpm build:types` after each change.

### Taxonomies and money

Settings defaults stay together in `packages/types/src/entities/settings.ts`, next to `DEFAULT_RECIPE_CATEGORIES` and `DEFAULT_SUPPLIERS` (lines 14-28); `VatRate` sits next to the ledger entity. No separate taxonomies file.

```ts
// entities/settings.ts
export const DEFAULT_COURSES = ["Apéritif", "Entrée", "Plat", "Dessert", "Autre"];   // UI label: "Catégories du menu"
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
// entities/ledger.ts
export const VAT_RATES = [0, 6, 12, 21] as const;
export type VatRate = (typeof VAT_RATES)[number];
```

`packages/types/src/lib/money.ts`: `round2`, `sumMoney(xs)` (sums in integer cents), `splitTvac(tvac, rate)`, `fmtEur` using `Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR" })`. `packages/types/src/lib/costing.ts`: `calcIngredientLineCost`, `calcRecipeCost(recipe, ingredientById: Map)`, `calcEventCost`, `scaleQty`, moved from `apps/frontend/src/lib/recipe-helpers.ts` which re-exports them (slice 1). `packages/types/src/lib/normalize.ts`: `normalizeIngredientName`, `groupDuplicates`, with `normalize.test.ts`. `packages/types/src/lib/planning.ts`: `sortEventLines`, `prepLinesForDate`, `groupByRecipe`, `weekPlan`. `packages/types/src/lib/reports.ts`: `CA_KINDS`, `isCaEntry`, `incomeStatement`, `apercu`, `mix`, `previsionnel`, `auReel`, all pure, with `reports.test.ts`. The `types` jest project exists (`jest.config.js:106`) but has no test file today and the root `test` script runs only the backend (`package.json:12`); the root script becomes `pnpm --filter @apps/backend test && pnpm --filter @packages/types test`.

`calcEventCost` contract, the one cost rule for every screen and report:

```ts
export function calcEventCost(ev: AppEvent, recipeCostById: Map<string, number>, recipePortionsById: Map<string, number>): {
  rawMaterial: number;   // ev.actualCost ?? ev.costSnapshot?.rawMaterial ?? Σ (recipeCost / recipe.portions) × line.portions; recipe cost only in all three branches
  extras: { matiere: number; personnel: number; location: number; transport: number; autre: number };   // from ev.extraCosts by kind
  total: number;         // rawMaterial + Σ all extraCosts, today's EventEditor.tsx:125 rule
}
```

### Event (`packages/types/src/entities/event.ts`)

```ts
export type PrepStatus = "todo" | "doing" | "done";

export interface EventRecipeLine {
  lineId: string;            // guaranteed by EventsService on every read and write (randomUUID())
  recipeId: string;
  portions: number;
  course?: string;           // value of settings.courses; fallback recipe.defaultCourse, then "Autre"
  notes?: string;
  prepStatus?: PrepStatus;   // undefined reads as "todo"
  prepDate?: string;         // YYYY-MM-DD; stored and accepted by the DTO, no UI in this plan (section 11)
}
// Manual order = array order inside a course. No order field.

export type ExtraCostKind = "matiere" | "personnel" | "location" | "transport" | "autre";
export interface EventExtraCost { label: string; amount: number; kind?: ExtraCostKind }  // undefined reads "autre"

export interface EventCostSnapshot {
  rawMaterial: number;       // Σ lines[].unitCost × lines[].portions, recipe cost only, no extras
  extrasTotal: number;       // Σ all extraCosts at takenAt, informational only; reports read event.extraCosts by kind
  lines: { lineId: string; recipeId: string; portions: number; unitCost: number }[];
  takenAt: string;           // stamped server-side
}

export interface AppEvent {
  // existing fields unchanged
  clientId?: string;
  templateId?: string;
  prestationType?: string;   // key into settings.prestationTypes
  vatRate?: VatRate;
  hoursSpent?: number;
  costSnapshot?: EventCostSnapshot;
}
```

Cost rule everywhere: `rawMaterial(event) = actualCost ?? costSnapshot?.rawMaterial ?? liveRecipeCost`; all three are recipe cost only; extras are always added on top by kind through `calcEventCost`. Reports never read matiere extras from the snapshot. Duplicate `recipeId`s in one event are allowed once `lineId` exists. Not added: `hoursPlanned`, `km`, `serviceTime` (KM is a journal column on the ledger line).

### Recipe, Ingredient, GroceryList, Settings

```ts
// recipe.ts
defaultCourse?: string;

// ingredient.ts
aliases?: string[];        // nameLower values of merged duplicates; imports match on them through normalizeIngredientName
mergedFrom?: string[];     // audit

// grocery-list.ts
eventIds?: string[]; range?: { from: string; to: string };

// settings.ts
export interface FixedCharge {
  chargeId: string; label: string;
  category: "social" | "salaire" | "assurance" | "abonnement" | "frais" | "remboursement" | "autre";
  monthlyAmount: number; monthlyAmountSolo?: number;   // undefined reads as monthlyAmount
  inResult?: boolean;                                   // undefined reads as category !== "remboursement"
  from?: string; to?: string;                           // "YYYY-MM" inclusive; undefined = always
  note?: string;
}
export interface YearObjective {
  annualRevenue: number; monthsActive: number;          // slice 2; monthsActive default 10
  monthlyOverrides?: Record<string, number>;            // slice 2
  // the rest ships in slice 5; SettingsService.get fills the defaults so a slice 2 record validates
  byPrestation?: { type: string; amount: number; eventsNeeded?: number; guestsPerEvent?: number }[];
  hoursAvailablePerMonth?: number; hoursAvailableOverrides?: Record<string, number>;   // keyed by ym
  rawMaterialPct?: number;                              // default 0.38
  corporateTaxRate?: number;                            // default 0.25; the workbook used 0.15
  smeReducedRate?: boolean;                             // default false; 20 % on the first 100 000 € when true
  corporateTaxActual?: number;                          // the accountant's figure, replaces the annual estimate
  extrasBudget?: number; treasuryMonths?: number;       // default 3
  treasurySavingPerMonth?: number;                      // default 0 (the live workbook cell is empty)
  investments?: { label: string; amount: number }[];
}
export interface YearActuals {                          // typed reference values, never ledger records
  monthly?: Record<string, number>;                     // "01".."12" -> CA HTVA
  byPrestation?: Record<string, number>;                // prestation key -> CA HTVA; absent = unknown
  byPeriod?: { from: string; to: string; amount: number }[];   // "MM-DD"
  note?: string;
}
export interface MonthClose { mpSource: "calcule" | "achats" | "saisi"; rawMaterial?: number; lockedAt?: string; unlockedAt?: string; note?: string }
export interface AppSettings {
  settingsId: "global"; recipeCategories: string[]; suppliers: SettingsSupplier[]; updatedAt: string;
  courses?: string[];                             // default DEFAULT_COURSES
  prestationTypes?: PrestationTypeSetting[];      // default DEFAULT_PRESTATION_TYPES
  fixedCharges?: FixedCharge[];
  objectives?: Record<string, YearObjective>;     // key "2026"
  yearActuals?: Record<string, YearActuals>;      // keys "2023", "2024", "2025", "2026"
  monthCloses?: Record<string, MonthClose>;       // key "2026-10"; absent reads as mpSource "calcule"
  ledgerStartYm?: string;                         // first month the journal is the record; set on the first sales entry, editable
  company?: { name: string; vatNumber: string; address: string; constitutedOn?: string };
  ignoredDuplicateGroups?: string[];
}
```

`SettingsService.get` fills defaults the way it fills `suppliers` at line 18. `SettingsService.update` widens its `Pick` and the DTO gains the keys. `SETTINGS_TTL` in `api.ts` drops from 120 s to 30 s in slice 1. The item stays far under 400 KB. Not added: `categoryIcons`, `courseIcons`, `suppliers[].color`, `openAiKeySet` (sections 9 and 11).

### Client (new table `ta-clients-{stage}`, PK `clientId`)

```ts
export interface TemplateLine { recipeId: string; portions: number; course?: string; notes?: string }   // no lineId, prepStatus or prepDate
export interface ClientTemplate {
  templateId: string; name: string;
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;      // ISO weekday; every template belongs to the semaine type
  guestCount: number; sellingPricePerGuest: number;
  prestationType?: string; vatRate?: VatRate;
  recipes: TemplateLine[]; extraCosts: EventExtraCost[]; notes?: string;
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

Templates are embedded, not a third table: a client has a handful, they are edited only from its page, and they must never be mistaken for events. Rejected: "event with an `isTemplate` flag", because every revenue reader would need a filter. Two tables rather than one shared `ta-records` table: the existing pattern is one table per entity, a shared table would need a type filter in every `scanAll` reader, and provisioning is one to two hours per table (section 11).

### LedgerEntry (new table `ta-ledger-{stage}`, PK `entryId`)

```ts
export type SalesKind = "facture" | "acompte" | "comptoir" | "bon_cadeau" | "note_de_credit" | "commission" | "autre";
export type PurchaseKind = "mp" | "personnel" | "autre";
export type PaymentMethod = "virement" | "cash" | "bancontact" | "payconiq" | "autre";

export interface LedgerEntry {
  entryId: string;
  book: "ventes" | "achats";
  kind: SalesKind | PurchaseKind;
  date: string;                  // YYYY-MM-DD
  ym: string;                    // "2026-10", written server-side from date.slice(0, 7) on create and on PUT
  number?: string;               // Falco invoice number or supplier ref; required for note_de_credit
  label: string;
  eventIds?: string[];           // zero, one or many events (monthly invoice)
  clientId?: string; prestationType?: string;
  totalTvac: number; htva: number;             // two decimals, htva stored as typed; negative only for note_de_credit
  vatRate: VatRate; vatAmount: number;         // one rate per entry, as in the workbook
  refEntryId?: string;           // note_de_credit: the invoice it corrects
  paid: boolean; paymentMethod?: PaymentMethod; paidAt?: string;
  description?: string; km?: number;
  personName?: string; hourlyRate?: number; shifts?: { date: string; hours: number }[];   // kind personnel: one entry per invoice, htva = Σ hours × hourlyRate
  supplier?: string;                                           // kind mp
  imported?: boolean;            // reserved for an "Au réel 2025" import, not built
  locked?: boolean;              // set by Verrouiller le mois
  createdAt: string; updatedAt: string;
}
```

Deposits are sales entries of kind `acompte` with `paid: true`. Commissions are sales entries at rate 0 that are not CA (7.6). Credit notes are `note_de_credit` with negative amounts and `refEntryId`. Extra shifts are one `personnel` purchase entry per invoice with a `shifts` list. Fixed charges, objectives, prior-year totals and month closes stay in settings. The event does not store `ledgerEntryId`; tags are derived from entries whose `eventIds` include the event. `locked` lives only on entries and freezes date, number, label, kind, amounts, VAT, prestationType and eventIds; `paid`, `paymentMethod`, `paidAt` and `description` stay editable on a locked entry because money arrives after the book is sent.

The ledger is a ledger of records edited only on purpose, not append-only: in-place edit through `PUT` while the month is unlocked, `PATCH` for payment fields at any time, `DELETE` while unlocked, 409 when locked, no soft delete. Corrections of an issued invoice are credit notes, not edits.

### Zod DTOs (`packages/types/src/dto/`)

```ts
// primitives.ts
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const yearMonth = z.string().regex(/^\d{4}-\d{2}$/);
export const money = z.number().refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "2 décimales max");
// money allows negatives on purpose so a note_de_credit can carry negative amounts; every other kind refines to nonnegative below,
// and hourlyRate, km and sellingPricePerGuest use money.nonnegative()
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
  label: z.string().min(1).trim(), amount: money.nonnegative(),
  kind: z.enum(["matiere", "personnel", "location", "transport", "autre"]).optional(),
}).strict();
const costSnapshotSchema = z.object({
  rawMaterial: money.nonnegative(), extrasTotal: money.nonnegative(),
  lines: z.array(z.object({ lineId: z.string().min(1), recipeId: z.string().min(1), portions: z.number().int().positive(), unitCost: z.number().nonnegative() }).strict()),
}).strict();   // takenAt is stamped by the server
export const createEventRequestSchema = z.object({
  /* existing fields, date: isoDate */
  clientId: z.string().min(1).optional(), templateId: z.string().min(1).optional(),
  prestationType: z.string().min(1).optional(), vatRate: vatRate.optional(),
  hoursSpent: z.number().nonnegative().optional(),
  costSnapshot: costSnapshotSchema.optional(),
});   // not strict for one release: EventEditor sends actualCost: null and old bundles may be cached
export const updateEventRequestSchema = createEventRequestSchema.partial();
export const putEventLinesSchema = z.object({
  lines: z.array(z.object({ lineId: z.string().min(1), course: z.string().trim().max(40).optional() }).strict()).min(1),
}).strict().refine((v) => new Set(v.lines.map((l) => l.lineId)).size === v.lines.length, "lineId dupliqué");
export const addEventLineSchema = eventRecipeLineSchema.omit({ lineId: true }).strict();
export const patchEventLineSchema = eventRecipeLineSchema.omit({ lineId: true, recipeId: true }).partial().strict();

// ingredients.ts
export const mergeIngredientsSchema = z.object({ survivorId: z.string().min(1), mergedIds: z.array(z.string().min(1)).min(1) })
  .strict().refine((v) => !v.mergedIds.includes(v.survivorId), "survivor cannot be merged");

// recipes.ts: defaultCourse: z.string().trim().optional(). pricing tva stays z.number().nonnegative() (dto/recipes.ts:12-13) so no live
// recipe fails its next save; the UI select is limited to VAT_RATES. Three names for one concept are intentional: tva (recipe, unchanged
// for compatibility), vatRate (event, client, ledger).

// clients.ts
export const templateLineSchema = eventRecipeLineSchema.omit({ lineId: true, prepStatus: true, prepDate: true }).strict();
export const clientTemplateSchema = z.object({ templateId: z.string().min(1).optional(), name: z.string().min(1).trim(),
  weekday: z.number().int().min(1).max(7), guestCount: z.number().int().positive(), sellingPricePerGuest: money.nonnegative(),
  prestationType: z.string().optional(), vatRate: vatRate.optional(),
  recipes: z.array(templateLineSchema).default([]), extraCosts: z.array(eventExtraCostSchema).default([]), notes: z.string().optional() }).strict();
export const createClientSchema = z.object({ name: z.string().min(1).trim(), kind: z.enum(["entreprise", "particulier"]).optional(),
  contactName: z.string().trim().optional(), phone: z.string().trim().optional(), email: z.string().trim().optional(),
  address: z.string().trim().optional(), vatNumber: z.string().trim().optional(),
  defaultPrestationType: z.string().optional(), defaultVatRate: vatRate.optional(), defaultPricePerGuest: money.nonnegative().optional(),
  defaultGuestCount: z.number().int().positive().optional(), invoicing: z.enum(["par_evenement", "mensuelle"]).optional(),
  templates: z.array(clientTemplateSchema).default([]), notes: z.string().optional(), active: z.boolean().default(true) }).strict();
export const updateClientSchema = createClientSchema.partial().strict();
export const instantiateSchema = z.object({ dates: z.array(isoDate).min(1).max(31), guestCount: z.number().int().positive().optional() }).strict();
export const linkEventsSchema = z.object({ contactEmail: z.string().trim().optional(), contactName: z.string().trim().optional() }).strict();

// ledger.ts
const vatIdentity = (e: { htva: number; totalTvac: number; vatAmount: number }) => Math.abs(e.htva + e.vatAmount - e.totalTvac) < 0.011;
const base = { date: isoDate, label: z.string().min(1).trim(), description: z.string().trim().optional(),
  eventIds: z.array(z.string()).optional(), clientId: z.string().optional(), number: z.string().trim().optional(),
  totalTvac: money, htva: money, vatRate, vatAmount: money };
const salesSchema = z.object({ ...base, book: z.literal("ventes"),
  kind: z.enum(["facture", "acompte", "comptoir", "bon_cadeau", "note_de_credit", "commission", "autre"]),
  prestationType: z.string().optional(), refEntryId: z.string().optional(), paid: z.boolean().default(false),
  paymentMethod: z.enum(["virement", "cash", "bancontact", "payconiq", "autre"]).optional(),
  paidAt: isoDate.optional(), km: z.number().nonnegative().optional() }).strict();
const purchaseSchema = z.object({ ...base, book: z.literal("achats"), kind: z.enum(["mp", "personnel", "autre"]),
  supplier: z.string().optional(), personName: z.string().optional(), hourlyRate: money.nonnegative().optional(),
  shifts: z.array(z.object({ date: isoDate, hours: z.number().positive() }).strict()).optional() }).strict();
const signRule = (e: { kind: string; totalTvac: number; htva: number; vatAmount: number; number?: string }) =>
  e.kind === "note_de_credit" ? e.totalTvac <= 0 && e.htva <= 0 && e.vatAmount <= 0 && !!e.number : e.totalTvac >= 0 && e.htva >= 0 && e.vatAmount >= 0;
export const createLedgerEntrySchema = z.discriminatedUnion("book", [salesSchema, purchaseSchema])
  .refine(vatIdentity, "HTVA + TVA doit égaler TVAC").refine(signRule, "montants négatifs réservés aux notes de crédit");
export const patchLedgerEntrySchema = z.object({ paid: z.boolean(), paymentMethod: z.enum(["virement", "cash", "bancontact", "payconiq", "autre"]),
  paidAt: isoDate, description: z.string().trim() }).partial().strict();
export const lockMonthSchema = z.object({ ym: yearMonth, mpSource: z.enum(["calcule", "achats", "saisi"]).optional(),
  rawMaterial: money.nonnegative().optional(), note: z.string().trim().optional() }).strict()
  .refine((v) => v.mpSource !== "saisi" || v.rawMaterial !== undefined, "montant requis pour la source saisie");
export const unlockMonthSchema = z.object({ ym: yearMonth, reason: z.string().trim().min(1) }).strict();

// settings.ts: courses, prestationTypes, fixedCharges (from/to yearMonth optional, money, inResult), objectives (slice 2: annualRevenue,
// monthsActive, monthlyOverrides; slice 5: the rest), yearActuals (money values), monthCloses, ledgerStartYm, company, ignoredDuplicateGroups
```

Zod is `^3.24` in the workspace (3.24.4 installed); unknown keys are stripped unless `.strict()`, which is why today's `updateEventRequestSchema` would silently drop any new line field. Verified on 3.24.4: `.required({ lineId: true })` keeps `.strict()`, the discriminated union plus `.refine` rejects a 0.02 VAT mismatch and accepts 0.01 and reports `kind` errors by name, `money` accepts 12.34 and rejects 12.345, `createEventRequestSchema.partial().extend(...)` works. A refined union has no `.partial()`, which is why the ledger has a `PUT` with the full schema and a thin `PATCH`.

### Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/admin/ingredients/duplicates` (declared before `@Get(":id")`, `ingredients.controller.ts:16`) | none | `{ groups: { key, suggestedSurvivorId, members: { ingredientId, name, confidence, unit, price, supplier, updatedAt, recipeCount, listCount }[] }[] }` |
| POST | `/admin/ingredients/merge` | `mergeIngredientsSchema` | 200 `{ ok: true, recipesUpdated, listsUpdated, removed }` or 200 `{ ok: false, recipesUpdated, listsUpdated, failures }`; 409 `UNIT_MISMATCH` or `STILL_REFERENCED` |
| DELETE | `/admin/ingredients/:id` | none | 409 `IN_USE` with recipe names when referenced |
| POST | `/admin/events/:id/lines` | `addEventLineSchema` | `AppEvent` |
| PATCH | `/admin/events/:id/lines/:lineId` | `patchEventLineSchema` | `AppEvent` |
| PUT | `/admin/events/:id/lines` | `putEventLinesSchema`; body is `{ lineId, course? }[]` in the new order; the server rewrites stored lines in that order, applies `course` when sent, keeps every other stored field; 409 `LINES_CHANGED` when the id set differs or an id repeats | `AppEvent` |
| DELETE | `/admin/events/:id/lines/:lineId` | none | `AppEvent` |
| PATCH | `/admin/events/:id` | `updateEventRequestSchema`; when `recipes` is present the service merges by `lineId` against the stored array (stored `prepStatus`, `notes`, `course`, `prepDate` kept unless the incoming line carries the key explicitly; missing ids filled); `costSnapshot` is stored with a server `takenAt` | `AppEvent` |
| GET/POST/PATCH/DELETE | `/admin/clients[/:id]` | client schemas | `Client`; DELETE 409 `IN_USE` |
| POST | `/admin/clients/:id/instantiate` | `instantiateSchema` | `{ created: AppEvent[], skipped: string[] }` |
| POST | `/admin/clients/:id/link-events` | `linkEventsSchema` | `{ linked: number }` |
| GET | `/admin/ledger?year=2026` | none | `LedgerEntry[]` |
| POST / PUT / DELETE | `/admin/ledger[/:id]` | `createLedgerEntrySchema` (PUT replaces the whole entry from the form and recomputes `ym`) | 409 `LOCKED` when the entry is locked |
| PATCH | `/admin/ledger/:id` | `patchLedgerEntrySchema` (Réglé popover; allowed on locked entries) | `LedgerEntry` |
| POST | `/admin/ledger/lock` | `lockMonthSchema` | `{ locked: number }`; sets `locked` on the month's entries and writes `monthCloses[ym]` with `lockedAt` |
| POST | `/admin/ledger/unlock` | `unlockMonthSchema` | `{ unlocked: number }`; clears `locked` and `lockedAt`, writes `unlockedAt`, keeps `mpSource` |
| PATCH | `/admin/settings` | extended schema | `AppSettings` |

Both new tables are read with `scanAll` and filtered in the service (`ym.startsWith(year)`); at a few hundred lines a year this is the same cost as events. A GSI on `ym` is the first change if the journal passes a few thousand lines. The duplicates endpoint scans recipes and grocery lists on every call. No prefill endpoints: `prefillFromEvent(event, client, entries, settings)` and `prefillForClientMonth(client, events, entries, settings, ym)` are pure functions in `apps/frontend/src/lib/accounting.ts`, unit-tested in the frontend jest project.

`putLines(eventId, body)` in `EventsService`: load the event; `byId = new Map(stored.recipes.map((l) => [l.lineId, l]))`; return 409 `LINES_CHANGED` when `body.lines.length !== stored.recipes.length` or any body `lineId` is missing from `byId` (with the Zod duplicate refine this is set equality, and the response lists the missing ids); write `recipes = body.lines.map((l) => ({ ...byId.get(l.lineId), ...(l.course !== undefined && { course: l.course }) }))` through `ddb.update`, so `recipeId`, `portions`, `notes`, `prepStatus` and `prepDate` always come from storage. A stale reorder merges cleanly; it does not need to 409.

### Backend plumbing

- `apps/backend/src/shared/ddb.service.ts`: loop on `UnprocessedItems` with backoff (100 ms × 2ⁿ, five tries) in `batchWrite` and `batchDelete`; `update()` gains an optional `{ condition?: string }` appended to the existing `attribute_exists(#pk)` guard (lines 41-69), used by the line-id backfill; remove the unused `QueryCommand` import at line 9. No `expectedUpdatedAt` and no exception filter (section 11).
- `apps/backend/src/config/config.service.ts`: `CLIENTS_TABLE` and `LEDGER_TABLE` as `z.string().min(1).optional()`; `DdbService.requireTable("clients")` throws `ServiceUnavailableException` at first use so the EC2 boots before the SSM parameter exists. `HealthController` injects `ConfigService` and returns `{ status: "ok", tables: { clients: boolean, ledger: boolean } }`. `infrastructure/lib/data-stack.ts` already defines the five current tables (`README.md:149` saying two is stale); add the two new ones there, in `scripts/setup-ssm-params.sh` and `scripts/ec2-bootstrap.sh` (lines 45-49, 66-70), and follow the README's four steps (`README.md:178-182`).
- `EventsModule` keeps importing only `AuthModule`; the snapshot is computed client-side (5.7), so no module import and no backend costing. `ClientsModule` and `LedgerModule` import `EventsModule`; `EventsModule → RecipesModule → IngredientsModule` would be acyclic too, it is simply not needed.
- `IngredientsService` reads recipes and grocery lists through `this.ddb.scanAll(this.ddb.tables.recipes)` and `this.ddb.tables.groceryLists` (`SharedModule` is `@Global`), never through `RecipesService`, because `RecipesModule` already imports `IngredientsModule` (`recipes.module.ts:9`, `recipes.service.ts:12-15`) and the reverse injection would be a cycle.
- `IngredientsService.importIngredients` (`existingByName`, line 83) and `RecipesService.importRecipes` (`ingByName`, line 77) key their lookup by `normalizeIngredientName` on both sides (survivor name and aliases); a live `nameLower` match beats an alias match. On a match whose unit family differs from the stored one, `importIngredients` skips the row and reports it in `unmatched` instead of overwriting `unit` (lines 97-101 today), so a per-kg CSV row can never flip a per-piece survivor.
- `apps/frontend/src/lib/api.ts`: new groups `clients`, `ledger` (uncached like `groceryLists`); invalidation sets `ingredients.merge → ["ingredients","recipes"]`, `ingredients.delete → ["ingredients","recipes"]`, `events.lines.* → ["events"]`, `clients.instantiate → ["events","clients"]`, `clients.linkEvents → ["events","clients"]`, `ledger.* → ["events"]`; `settings.update → ["settings"]` already exists (line 103).
- Maintenance PR, outside the slices: delete `packages/utils` (no app or package imports it). Remove the `utils` jest project block (`jest.config.js:77-100`) and the two `@packages/utils` `moduleNameMapper` lines (`:31-35`), the `@packages/utils` paths in `tsconfig.json:19-20`, the `@packages/utils` step in the root `type-check` script (`package.json:11`), the "Upload Utils Build" step in `.github/workflows/cd-release.yml:118-122` and the audit line in `.github/workflows/security-basic.yml:44-45`, then `pnpm install` to refresh the lockfile. Delete `packages/types/src/constants/` and its re-export at `packages/types/src/index.ts:3` (`TABLE_NAMES`, unused) in the same commit.

### Backward-compatible read rules

- Lines: sort key `(courseIndex(line.course ?? recipe.defaultCourse ?? "Autre"), arrayIndex)`; `prepStatus ?? "todo"`.
- Client name: `clientById.get(event.clientId)?.name ?? event.contactName ?? event.name` (the dangling-id branch exists only for safety; clients with events cannot be deleted).
- Cost: `rawMaterial(event) = actualCost ?? costSnapshot?.rawMaterial ?? liveRecipeCost`, extras by kind on top (`calcEventCost`).
- Prestation type: `event.prestationType ?? "Sans type"` bucket.
- Settings: `courses ?? DEFAULT_COURSES`, `prestationTypes ?? DEFAULT_PRESTATION_TYPES`, `fixedCharges ?? []`, `objectives ?? {}`, `yearActuals ?? {}`, `monthCloses[ym] ?? { mpSource: "calcule" }`, `charge.inResult ?? charge.category !== "remboursement"`.
- Supplier colour: `hash(name)` into the eight-colour set.

### Lazy line ids

No migration runner, no `tsx` dependency, no deploy-ordering constraint. `EventsService` gets a private `withLineIds(event)`: if `event.recipes` has any line without `lineId`, map lines to `{ ...l, lineId: l.lineId ?? randomUUID() }`, persist with `ddb.update(table, { eventId }, { recipes })` without touching `updatedAt`, and return the filled object, which matches storage. It is called in `get` and `getAll` (`getOrFail` delegates to `get`, `events.service.ts:22`); events with no lines or with every id present are skipped, so the write happens once per event. `create`, `update` and `putLines` fill missing ids on write. Every event returned by the API therefore carries `lineId`s, and the line endpoints have no index-based fallback. Edge: on the very first read after deploy, two overlapping reads of the same event can generate different ids and the second write wins; single user, sub-second window, the losing tab gets a 404 on its next line PATCH and reloads. The backfill update passes `condition: "attribute_not_exists(#recipes[0].lineId)"` so the second writer fails instead of overwriting.

Cost snapshots: no backfill. Events completed before slice 4 show live cost tagged "calculé" until she types `actualCost`, presses "Reprendre le coût", or the month's `mpSource` is set to achats or saisi. Clients: no backfill; the optional `link-events` call attaches old Hoona events when she asks.

Deploy order per slice: `pnpm build:types`, backend, then frontend (the frontend calls new endpoints). Take an on-demand DynamoDB backup of ingredients and recipes before the first live merge.

## 7. Feature designs

### 7.1 Interactive planning

No new entity. Week, day and prep sheet are projections of `event.recipes[]` once lines carry `lineId`, `course` and `prepStatus`.

`packages/types/src/lib/planning.ts`:

```ts
export interface PrepLine { eventId; eventName; clientName?; prestationType?; lineId; recipeId; recipeName; portions; course: string; prepStatus: PrepStatus; date: string; notes?: string }
export function sortEventLines(lines, courses, recipeById): EventRecipeLine[]   // course index, then array order
export function prepLinesForDate(events, recipeById, clientById, courses, date): PrepLine[]   // event.date === date
export function groupByRecipe(lines: PrepLine[]): { recipeId; recipeName; total; parts: { label; portions }[] }[]
export function weekPlan(events, weekStart): { days: { date; events; guests; signedRevenue; linesDone; linesTotal }[]; signedRevenue }
```

Dates: `apps/frontend/src/lib/dates.ts` with `isoWeekOf(date)`, `datesOfIsoWeek(isoWeek)`, grouping by `date.slice(0, 10)`; `startOfWeekMonday` and `endOfWeekSunday` move here from `Events.tsx`. `isoWeekOf` uses the Thursday rule (shift the date to its week's Thursday, week = ceil(dayOfYear / 7)); `datesOfIsoWeek` starts from the Monday of the week containing 4 January; both parse `YYYY-MM-DD` with UTC getters so the browser timezone cannot shift the day. Jest cases: 2026-01-01 → 2026-W01 (29 Dec 2025 to 4 Jan 2026), 2026-12-31 and 2027-01-03 → 2026-W53, 2024-12-30 → 2025-W01, all round-trip. 2026-W42 is Monday 12 to Sunday 18 October; week 43 starts 19 October.

Revenue: the week header sums `sellingPricePerGuest × guestCount` per day and per week, labelled "Signé" so it is not read as turnover. "Signé ce mois" is the same sum over the calendar month of the week's Thursday against `objectif mensuel(m) = monthlyOverrides[m] ?? annualRevenue / monthsActive` (7.6), which is why `annualRevenue`, `monthsActive` and `monthlyOverrides` ship in slice 2 with a two-input Paramètres section; from slice 4 the bar shows a second tick, Σ ledger CA HTVA of the month.

Status: `todo → doing → done` written only through `PATCH /admin/events/:id/lines/:lineId`, so an open `EventEditor` cannot undo a tick from the phone. The prep sheet, the day view, cook mode's last step and the week's dot all call it. Nothing auto-resets.

Reading at the event's portions: the prep sheet renders `RecipeReader` with `ratio = line.portions / recipe.portions`. The old path (Événements → event → recipe → Mode recette → 20 taps on +) becomes two taps from the day view.

Grocery from a date range: one click on the week header ("Courses de la semaine") or a day ("Courses du jour"), see 5.9.

Print and PDF: `@media print` on the day view is the paper fallback. `generateAggregatedPdf` and `WeekPlannerModal` are deleted; `exportRecipesPdf` on the event page stays until slice 5 as the per-event printable sheet with zero new code (audits.md:435 recommends keeping a PDF button for the first months). A jsPDF day or week export (`lib/pdf/day-pdf.ts`, adapted from `generateAggregatedPdf` at `Events.tsx:140-290`, about half a day) is in section 11; the single-recipe PDF in `RecipeDetail.tsx` stays at 11pt body.

Files: new `Week.tsx`, `Day.tsx`, `PrepSheet.tsx`, `lib/dates.ts`, `lib/grocery.ts`, `components/ui/StatusControl.tsx`, `components/ui/MoneyTile.tsx`; changed `App.tsx`, `AdminSidebar.tsx`, `Events.tsx`, `EventDetail.tsx`, `EventEditor.tsx`, `RecipeCook.tsx`, `Settings.tsx`, `events.controller.ts`, `events.service.ts`, `settings.service.ts`, `dto/events.ts`, `dto/settings.ts`, `api.ts`.

### 7.2 Readable recipes

Detail (`/recipes/:id`): read mode by default with `RecipeReader`, no click targets on text, cost and pricing behind `SectionToggle`s, edit behind `?mode=edit`. Steps at 18px full-contrast text (22px with "Aa") instead of 14px muted grey that only darkens on hover (`RecipeDetail.tsx:347`); the six-column 400px-wide ingredient table (`RecipeDetail.tsx:402`) leaves the reading surface; the hover-only delete buttons (`:356`, `:438`) exist only in edit mode. The `h-22` bug is removed with the thumbnails.

Cook mode: context visible (ingredients beside or one tap below the steps, previous step above on phones), left-aligned text, 44px and 56px targets, "4 / 9" instead of 10px dots, selectable text, wake lock, portions from the query string, "Marquer fait" at the end.

Order of application: tokens (one day, every page changes); `PageHeader`, `Tag`, `ListRow`, `Stepper`, `SectionToggle`, `FieldLabel`, `RecipeReader`; `RecipeDetail` read mode and `RecipeCook`; then the new planning pages are built on the primitives from the start; then the list pages. Slice 1 ends with a 20-minute session on Dalia's phone in the kitchen, 375px and laptop before/after screenshots on the PR, and the contrast script output. Three things are decided in that session and written back here: token values, the default reading size (18 or 22px) and whether a bottom tab bar is wanted.

### 7.3 Ingredient merge

**Detection.** `normalizeIngredientName(raw)` in `packages/types/src/lib/normalize.ts`:

1. `normalize("NFD")`, strip combining marks, `œ → oe`, `æ → ae`, lowercase, trim.
2. Remove parenthesised or bracketed text and anything after " - " or ",".
3. Remove quantity tokens, i.e. a number with an optional decimal part and an optional attached unit or percent, optionally preceded by a multipack count, and only when the match ends at a token boundary: `/\b(\d+\s*x\s*)?\d+([.,]\d+)?\s*(g|gr|kg|ml|cl|l|%)?(?![\p{L}\p{N}])/gu`. Then remove the standalone packaging tokens `pièce(s)`, `pc(s)`, `botte(s)`, `sachet`, `boite`, `bte`, `paquet`, `x\d+` with `\b` on both sides. The negative lookahead, not a trailing `\b`, is required: with `\b` the `%` alternative can never match and "4x125g" survives; without a boundary "2 clementines" becomes "ementines".
4. A hyphen between letters is removed, not replaced by a space (`chou-fleur → choufleur`, `demi-sel → demisel`); other punctuation and apostrophes become spaces; collapse whitespace.
5. Singularise tokens of four or more letters: strip a trailing `s` unless the token ends in `ss`, `is`, `as`, `us` or `os`; strip a trailing `x` only after `au`, `eu` or `ou` (`choux → chou`, `gateaux → gateau`; `noix`, `prix`, `pois`, `cassis`, `radis`, `ananas` unchanged).
6. Drop stop words `de`, `du`, `des`, `d`, `la`, `le`, `les`, `en`.
7. Key = tokens sorted and joined. Tested outputs: "Oeuf", "Oeufs", "Œuf", "oeuf (pièce)", "OEUF x12" → `oeuf`; "pois chiche 400g bte" → `chiche pois` (identique with "pois chiches"); "lait entier 1L" → `entier lait`; "Creme fraiche 35%" → `creme fraiche`; "4x125g yaourt" → `yaourt`; "2 clementines" → `clementine`; "4 gousses d'ail" → `ail gousse`; "Farine T55" → `farine t55` (qualifier kept); `sel` and `sol` stay apart.

`groupDuplicates(ingredients, ignoredKeys)` in the same file (pure, called by `GET /admin/ingredients/duplicates`) clusters by exact key, then, for pairs where both keys are five or more characters, links keys at Damerau-Levenshtein ≤ 1, and links a key that is a strict token subset of another when every extra token is a qualifier from a fixed list (`bio`, `doux`, `demisel`, `sale`, `entier`, `ecreme`, `frais`, `fume`, `surgele`, `t45`, `t55`, `t65`, `cru`, `cuit`). Subsets with other extra tokens (`citron` vs `citron vert`, `noix` vs `noix de cajou`, `chou` vs `choufleur`) are not grouped. `fume` in the list means saumon / saumon fumé is still offered; drop it if she treats smoked fish as a different product. Confidence is per member, relative to the suggested survivor's key: `identique` (same key), `proche` (DL ≤ 1), `a_verifier` (qualifier subset). Only `identique` members are included by default; `proche` and `a_verifier` members are listed unticked and the user ticks them explicitly, because DL ≤ 1 also pairs distinct ingredients (poire / poivre, sauge / sauce, farine / marine) while catching real variants (oignon / ognon, menthe / mente). Keys shorter than five characters are never fuzzily joined (`sel` vs `sol`, `oeuf` vs `boeuf`). Groups whose key is in `settings.ignoredDuplicateGroups` are skipped. One scan of recipes and one of grocery lists give `recipeCount` and `listCount` per member. No model needed at a few hundred ingredients.

`normalize.test.ts` under the `types` jest project (`pnpm --filter @packages/types test`): the table from step 7 plus "pois chiche 400g bte", "lait entier 1L", "2 clementines", "4 gousses d'ail", "4x125g yaourt", "Creme fraiche 35%" with their keys; `groupDuplicates` returns poire / poivre, sauge / sauce, farine / marine as `proche` and never in the default-included set; oignon / ognon and menthe / mente as `proche`; oeuf / boeuf and sel / sol never linked; `oeuf` vs `oeuf bio` as `a_verifier`; an ignored key is skipped.

**Survivor.** Suggested: most recipe references, then most recent `updatedAt`, then the shortest name. The user can pick any member. A member whose `PRICE_TO_QTY_UNIT[unit]` differs from the survivor's is excluded; the merge never converts quantities, because a line in `g` priced per piece would be silently wrong. No `force` flag.

**Remap set.** Recipes `recipe.ingredients[].ingredientId` (table `ta-recipes`); grocery lists `items[].ingredientId` and `name` only (table `ta-grocery-lists`): `pricePerUnit`, `priceUnit` and `supplier` stay as stored, because a saved list is a record of past shopping; the survivor's `aliases` and `mergedFrom`. Events reference `recipeId` only; settings hold no ingredient ids; the localStorage hand-off is deleted in slice 2 and, until then, `GroceryListPage` drops pending items whose id no longer exists.

**Endpoint.** `POST /admin/ingredients/merge { survivorId, mergedIds }`, `IngredientsService.merge`, in order:

1. Load survivor and merged rows; 404 if the survivor is missing; a merged id that no longer exists is treated as done. 409 `UNIT_MISMATCH` with the offending names if families differ; nothing written.
2. `scanAll(recipes)`. For each recipe with a line in `mergedIds`: rewrite to `survivorId`; if a rewritten line now shares `ingredientId` and `unit` with another line, sum `qty` and keep the max `lossPct`; pre-existing duplicate lines on the survivor that this merge did not touch are left alone and reported; `ddb.update(recipes, { recipeId }, { ingredients, updatedAt })`. Per-item failures are caught and collected.
3. `scanAll(groceryLists)`. Rewrite `items[].ingredientId` and `name`; collapse two items with the same `ingredientId:unit` as `totalQty = a + b`, `haveQty = (a.haveQty ?? b.haveQty) === undefined ? undefined : (a.haveQty ?? 0) + (b.haveQty ?? 0)` (so an optional `haveQty` never becomes NaN and gets rejected by the `dto/grocery-lists.ts:11` preprocess on the next save), `checked = a.checked && b.checked`. Same failure handling.
4. If any failure: return 200 `{ ok: false, recipesUpdated, listsUpdated, failures }` and stop. Nothing is deleted. (A 207 would need `@Res({ passthrough: true })` and `api.ts` `parseResponse` treats every 2xx alike, lines 15-22; the page branches on `failures.length`.)
5. Re-scan recipes and lists; if any reference to a merged id remains (a concurrent edit), return 409 `STILL_REFERENCED` with names.
6. `ddb.update(survivor, { aliases: union, mergedFrom: union, updatedAt })`, then `batchDelete(mergedIds)` with the `UnprocessedItems` loop.
7. Return `{ ok: true, recipesUpdated, listsUpdated, removed }`.

**Failure handling.** Remap happens before any delete, so a crash at any step leaves both ingredients alive and some recipes already on the survivor; nothing is orphaned and the group still appears on the page. Re-running the same payload is idempotent: already-remapped recipes are no-ops, deletion is last, a missing merged id is treated as done. A concurrent `importIngredients` between steps 1 and 6 can re-create a merged name as a new ingredient; it survives, the group reappears, and from then on a live `nameLower` beats a survivor alias in both imports. `DELETE /admin/ingredients/:id` gains a reference scan (through `DdbService`, see 6) and returns 409 `IN_USE` with recipe names. `deduplicate` (`ingredients.service.ts:60-79`) and its controller route are removed. `api.ingredients.merge` invalidates `ingredients` and `recipes` together, so `buildGroceryItems` never reads 30-second-old recipes holding merged ids. The controller declares `@Get("duplicates")` above `@Get(":id")` (`ingredients.controller.ts:16`), as `recipes.controller.ts:75` already does for `photo`.

**UI.** Section 5.10, plus the create-time "Semblable à" warning in `IngredientFormModal.tsx`.

### 7.4 Event recipe ordering and course grouping

Where the category lives: on the line (`EventRecipeLine.course`), with `recipe.defaultCourse` copied in when a line is added. A quiche can be an apéritif at a cocktail and an entrée at a lunch. The list and its order are `settings.courses` (default Apéritif, Entrée, Plat, Dessert, Autre), labelled "Catégories du menu" in the UI because "catégorie" is her word and "service" would collide with "Buffet avec service"; `courses` stays the code name with a comment mapping it to the label. A line whose value is not in the list sorts under Autre without being rewritten.

Three taxonomies, stated once: `recipe.type` and `settings.recipeCategories` (Buffet, Walking dinner, Lunch, Menu semaine) stay as the recipe's service format, unchanged, no migration, relabelled "Formats de recette" in Paramètres; the menu category is on the line; the prestation type (menu à emporter, buffet avec service, ...) is set on the event only and never derived from `recipe.type`. The overlap between the recipe format "Buffet" and the prestation types `buffet_a_emporter` / `buffet_avec_service` is accepted: one describes how a recipe is served, the other what was sold.

How order is stored: the array order of `event.recipes` inside each category. No `order` field, so nothing to keep in sync. Readers group by category index then array index, so events saved before the change render in their current order under Autre or the recipe's default. ▲▼ swaps with the neighbour inside the group; a category change moves the line to the end of the new group; drag (laptop, HTML5 drag as in `GroceryListPage.tsx`, slice 5) can do both in one drop. All of these call `PUT /admin/events/:id/lines` with the ordered list of `{ lineId, course? }`; the server checks that the set of `lineId`s equals the stored set and returns 409 otherwise, so a stale tab cannot drop a line. PUT never writes portions, notes, prepStatus or prepDate; a laptop tab that reorders after the phone ticked a line keeps the tick. Portions, notes and status go through `PATCH .../lines/:lineId`. `EventDetail.tsx` stops keying rows by `recipeId` (line 276) and deletes `updateRecipePortions` (line 178).

Every event returned by the API carries `lineId`s because the service fills and persists them on first read (6, Lazy line ids), so there is no index-based fallback. `EventsService.create` and `update` fill a missing `lineId` on write.

Downstream: `prepLinesForDate`, the day view, the print layout and the future "Proposition de menu" PDF use the same sort, so the kitchen and the client read in service order. Templates copy `course`; instantiation adds `lineId` and leaves `prepStatus` and `prepDate` unset.

### 7.5 Clients and weekly templates (Hoona)

Set up once: `/clients/new` with name Hoona, kind entreprise, default prestation `menu_a_emporter`, VAT 6 %, price per guest, guest count, invoicing `mensuelle` if that is how she bills. On the client page, fill the Semaine type: either by hand per weekday, or from an existing Hoona event with "Créer depuis un événement", a client-side copy of the event's lines (as `TemplateLine`s), guests, price, prestation, VAT, extra costs and notes into a weekday, saved with `PATCH /admin/clients/:id`. Days with no delivery stay empty. One template covers one delivery a week; five templates cover daily delivery.

See the week or a day: `/semaine/:isoWeek?client=<id>` with the Hoona chip shows only Hoona's events and lines and the week revenue for Hoona alone. `/jour/:date` lists "Mini quiches × 30 · Hoona" under its category next to other clients; Par recette shows "80 = Hoona 30 + Mariage 50".

Reuse next week: the week banner "Hoona : 3 jours sans événement cette semaine · Créer la semaine" appears whenever at least one weekday template has no event in the displayed week. It opens a one-field sheet "Convives : [30]" prefilled from the template, then calls `POST /admin/clients/:id/instantiate { dates, guestCount? }` with the seven dates of the week. The service loads the client, scans events once, builds the set of `(templateId, date)` already present, skips those, and creates the rest: name "Hoona · mardi 20 oct", `date`, `clientId`, `templateId`, `guestCount` (line portions scaled by `guestCount / template.guestCount` when overridden), recipes with fresh `lineId`s and no `prepStatus`, extra costs, price, prestation, VAT, contact fields copied from the client, `status: upcoming`. Returns `{ created, skipped }`, which the UI toasts. Safe to tap twice. "+" on a day with the client chip selected opens `/events/new?date=&client=` prefilled from that weekday's template. On the event page, "Ajuster les portions aux convives" rescales every line by `newGuests / oldGuests` after confirmation, because `EventEditor` only sets portions from guests when a line is added (`EventEditor.tsx:137`).

Editing: changing an event never changes its template; "Mettre à jour le modèle depuis cet événement" on the event page is the same client-side copy into the matching weekday, on purpose. A client with events cannot be deleted, only archived (`active: false`); its events keep `clientId`. `Dupliquer` stays for one-offs and asks for a date.

Invoicing: Hoona's monthly invoice is one ledger entry with `eventIds` covering the month's events; see 7.6.

Files: `packages/types/src/entities/client.ts`, `dto/clients.ts`; `apps/backend/src/clients/{clients.module,controller,service}.ts` (injects `EventsService`); `config.service.ts`; `health.controller.ts`; `Clients.tsx`, `ClientDetail.tsx`; `EventEditor.tsx` (client select); `EventDetail.tsx` (client link, template actions, "Ajuster les portions"); `Week.tsx` (chips, banner, sheet); `api.ts`.

### 7.6 Accounting

**Entities.** `LedgerEntry` in `ta-ledger` (records); `fixedCharges[]`, `objectives[year]`, `yearActuals[year]` and `monthCloses[ym]` in settings; event additions `prestationType`, `vatRate`, `hoursSpent`, `costSnapshot`, `extraCosts[].kind`. Deposits are `acompte` entries; extra shifts are `personnel` purchase entries with a `shifts` list; raw material receipts are `mp` purchase entries. Everything on the Comptabilité pages is a view computed at render time by `packages/types/src/lib/reports.ts` and never stored. `apps/frontend/src/lib/accounting.ts` holds UI glue only: `groupByMonth`, month labels, the journal row model, `prefillFromEvent`, `prefillForClientMonth` and the prefill-to-form mapping; every figure comes from `reports.ts`.

**One definition of CA.** `reports.ts` exports `CA_KINDS: SalesKind[] = ["facture", "acompte", "comptoir", "bon_cadeau", "note_de_credit", "autre"]` and `isCaEntry(e) = e.book === "ventes" && CA_KINDS.includes(e.kind)`. Every CA figure reads through it: the journal footer "Total CA mm/aaaa", Aperçu CA N and N−1 and the period comparison, the Mix, the income statement CA HTVA, Au réel "Total signé", the week tick, the Aperçu chart. Commissions (`kind: "commission"`, rate 0) are not CA: the workbook keeps them in a separate THERMOMIX block outside the TOTAL row (row 140) and the "selon falco" CA column, and they are not Falco invoices. They appear as "Autres produits". Jest case: a month with one facture and one commission yields CA = facture only.

**How an event becomes a journal line.** "Terminer l'événement" computes `costSnapshot` with `calcEventCost` on the event page and PATCHes `{ status: "completed", costSnapshot }`; the server stamps `takenAt`. "Créer la facture" is offered on completed and upcoming events alike (full prepayments and balances due before the event are common) and opens the entry form prefilled by `prefillFromEvent`:

- `date = event.date`, `label = client.name ?? event.name`, `prestationType`, `clientId`, `eventIds: [id]`
- `htva = round2(sellingPricePerGuest × guestCount − Σ htva of acompte entries whose eventIds include the event)`
- `vatRate = event.vatRate ?? prestationTypes[type].defaultVatRate`; `vatAmount = round2(htva × vatRate / 100)`; `totalTvac = htva + vatAmount`

The form shows "Revenu prévu" and "Acomptes déjà reçus" read-only above the fields. Dalia types the Falco number and overwrites amounts; typing TVAC recomputes HTVA and TVA with `splitTvac`, typing HTVA recomputes the other way; the server enforces the identity within 0,01. "Enregistrer un acompte" is the same form with `kind: "acompte"`, `paid: true`, dated the day the money arrived; a note says the VAT treatment of deposits is to confirm with the accountant. `paid`, `paymentMethod`, `paidAt` are edited on the entry, never on the event. The event page derives three states: Facturé (a `facture` or `comptoir` entry includes it), Acompte reçu (only `acompte` entries include it), Payé (Facturé and every entry including it is paid). Non-event lines (comptoir, commission, bon cadeau, note de crédit, autre) are created on the Journal page. The export never locks anything.

Monthly invoices: "Facturer le mois" on a client with `invoicing: "mensuelle"` runs `prefillForClientMonth`, which preselects every uninvoiced event of that client dated on or before the end of the chosen month (grouped by month in the form, so a delivery forgotten last month is swept up) and sums their revenue minus deposits. One entry, several `eventIds`. There is no pro-rata attribution of a multi-event entry to its events: Au réel and the client history list entries as entries and events as events (below).

Dates, two rules stated once: the journal, Aperçu and the income statement follow the entry date (the VAT period); Au réel and the client history list entry rows by entry date and uninvoiced events by event date, so an invoice dated 1 November for October lunches sits in November in both, as the workbook's "facture comptoir février" does.

**Raw material cost per month.** The source is chosen per month, never inferred from a line count. `MP(m)` = `monthCloses[m].rawMaterial` when `mpSource` is "saisi"; Σ `mp` purchase entries with `ym = m` when "achats"; Σ over completed events dated in m of `rawMaterial(event) + extras.matiere` (`calcEventCost`, matiere extras counted exactly once) when "calcule", the default. The cell tag shows the source; when the source is calculé and Σ `mp` entries > 0, the purchases figure shows beside it tagged "achats partiels". "MP prévu" (upcoming events) is shown for the current and future months; past months show "N événements non terminés" instead. For months before the app (2025, January to November 2026), the path is "Modifier la source MP" on the month row with `mpSource: "saisi"` and the workbook's typed total, not an `mp` purchase line.

**Fixed charges and breakeven.** Two sums. `charges caisse(m)` = Σ `monthlyAmount` (or `monthlyAmountSolo` in the Seule scenario) of every row active in m, where active means `(from ?? −∞) ≤ m ≤ (to ?? ∞)`; `charges résultat(m)` = the same sum over rows with `inResult` true. The workbook's charge list is a cash budget for the breakeven, not a P&L: "Remboursement investissement dirigeant" (600 €/month, Prévisionnel financier C37) is a loan principal repayment, so it stays in the breakeven and the treasury need and out of the income statement. Changing an amount from a month is done by hand: set `to` on the old row and add a new row with `from`. `objectif mensuel(m) = monthlyOverrides[m] ?? annualRevenue / monthsActive`. One objective per year ends the workbook's four conflicting targets.

Breakeven keeps the workbook's formula as the primary figure so Dalia recognises her numbers:

- `Charges annuelles caisse` = Σ charges caisse × 12 for the chosen scenario
- `Seuil annuel` = Charges annuelles caisse + 12 × `treasurySavingPerMonth` + Σ investments (`C42 + C47*12 + C48`)
- `Seuil mensuel` = charges caisse mensuelles + `treasurySavingPerMonth` + Σ investments / 12 (`C41 + C47 + C48/12`)
- `Seuil par mois actif` = Seuil annuel / `monthsActive`, so the comparison with the ÷10 objective uses one denominator; the Aperçu tile names its scenario ("Seuil mensuel (seule)", the figure the live workbook shows, 56 130,24 ÷ 12) and follows the scenario selected on Prévisionnel
- `Seuil ajusté matières` (second line, labelled) = Seuil annuel / (1 − `rawMaterialPct`), because raw materials are 34 to 38 % of revenue and the workbook's figure ignores them
- `Besoin de trésorerie` = charges caisse mensuelles × `treasuryMonths`
- "Résultat prévu après matières et extras" = `annualRevenue` × (1 − `rawMaterialPct`) − Σ charges résultat × 12 − `extrasBudget`
- `ISoc prévu` from the tax model below; "Marge nette après ISoc %" = (résultat − ISoc) / `annualRevenue`; a third small line "Objectif − seuil (formule du classeur)" shows the workbook's own "Bénéfice net" (F10) so the same label never carries two meanings

`treasurySavingPerMonth` defaults to 0 because the live workbook cell (C47) is empty.

**SRL tax model.** `estimateBelgianTax`, the toggle and the override input are deleted. Owner salary and UCM are fixed charges. Per month: `Résultat avant impôts = CA HTVA − Coûts MP + Autres produits − Charges fixes − Personnel extra − Autres coûts` with `Charges fixes = charges résultat(m)` and `Autres produits = Σ commission htva`; `Impôts (estimation) = isoc(max(0, Résultat))`; the annual row uses `isoc(max(0, Σ Résultat))`, which is why the column does not add up (footnote in 5.14) and why `corporateTaxActual`, once typed, replaces the annual estimate tagged "réel"; `Résultat net = Résultat − Impôts`. `isoc(r) = smeReducedRate ? min(r, 100 000) × 0.20 + max(0, r − 100 000) × 0.25 : r × corporateTaxRate`, default rate 0.25. Help text: "25 % par défaut. Le taux réduit de 20 % sur les premiers 100 000 € suppose une rémunération de dirigeant d'au moins 45 000 € (ou au moins égale au résultat imposable) et d'autres conditions PME; à confirmer avec le comptable. Le classeur utilisait 15 %, qui n'existe plus." At 1 500 €/month (Prévisionnel financier C23) the salary is 18 000 €, below the condition, so 25 % is the right default. The management income statement has no amortissements line, so the accountant's statutory result will still differ by depreciation.

**Prior years.** The workbook's prior-year figures are typed values, not journal derivations, and the app stores them the same way in `settings.yearActuals` keyed by year, with a Paramètres section "Années précédentes" (12 monthly cells, a per-type list, a period list, a note per year). Precedence in `reports.ts`: months from `settings.ledgerStartYm` onwards read the ledger; earlier months read `yearActuals[Y].monthly[m]`; `byPrestation` and `byPeriod` follow the same rule per year (a period is derived from the ledger only when every month in it is a ledger month, else from `yearActuals[Y].byPeriod`, else blank). Figures from `yearActuals` carry a `Tag` "saisi" with the note as tooltip; Δ % stays blank when N−1 is missing. What to enter from this file when slice 5 ships: 2025 `monthly` from Apercu par mois B3:B14 (total 140 654,88; the "Total 2024" label at B18 is stale); 2024 `byPrestation` from B22:B28 as five values (`menu_a_emporter` 90 703,19 including buffet à emporter, `walking_cocktail` 95 953,32 including buffet avec service, `atelier` 3 441,49, `brunch` 11 166,64, `chef_a_domicile` 17 650,21, the two merged types shown as "inclus dans …" in the Mix); `byPeriod` for 2023 (01-01 to 04-30: 17 474; 04-30 to 06-30: 20 381) and 2024 (41 592; 57 050) from recettes 2025 B185:C190; and 2026 January to November monthly totals from Falco, since the 2026 workbook month sheets are empty and the app's journal starts with the deployment month. No typed 2025 per-type figure exists in the file, so Mix N−1 in 2026 stays blank unless she types it. These values are reference values, never ledger records: the export and "Verrouiller le mois" never see them.

**Reports (columns and formulas).**

- Journal des recettes (per month): the 14 workbook columns (5.12). Footer: Σ TVAC, Σ HTVA, Σ per rate, "Total CA mm/aaaa" = Σ HTVA over `isCaEntry` lines, Σ HTVA per prestation type plus "Sans type", then "Commissions (hors CA)".
- Aperçu par mois: Mois | CA HTVA N−1 | CA HTVA N = Σ CA `htva` by `ym` | Δ % = (N − N−1) / N−1, blank when N−1 is missing | Objectif = objectif mensuel(m) | Prévision = `auReel(m).totalSigne` (the same function as the Au réel footer, as the workbook's F column reads the Au réel sheet) | Atteint = CA N ≥ Objectif. Totals. Under the table "Autres produits (commissions) N / N−1". Box: seuil annuel, mensuel et par mois actif, objectif annuel et mensuel. Comparaison par période: CA by date range for N−2, N−1, N.
- Mix par prestation: rows are the prestation types from settings plus "Sans type"; comptoir lines fall into their prestation type (the workbook types "facture comptoir" as menu à emporter) or "Sans type"; commissions are not in the mix (workbook D30 sums the seven types, "CA hors kombucha"). Columns Type | CA N−1 | % | CA N = Σ CA `htva` by `prestationType` | % | Objectif = `byPrestation.amount` | % | Nb nécessaires = `eventsNeeded` when typed, else "≈ Objectif / (guestsPerEvent × average sellingPricePerGuest of that type's events)" when `guestsPerEvent` is typed, else blank. No line-count fallback: a monthly comptoir invoice is one line for dozens of menus.
- Compte de résultats: Mois | CA HTVA | Coûts MP = MP(m) | Marge brute = CA − MP | Autres produits | Charges fixes = charges résultat(m) | Personnel extra = Σ `personnel` entries (`Σ shifts.hours × hourlyRate`, or `htva` when typed; an entry whose shifts span two months is split pro rata to the shift months) + Σ `extraCosts` kind personnel | Autres coûts = Σ `autre` purchases + Σ `extraCosts` kind location, transport, autre | Résultat avant impôts | Marge % = Résultat / CA | Impôts (estimation) | Résultat net. Ratios MP / CA, Marge brute / CA, Charges fixes / CA, all over CA. Simulation row: CA = `annualRevenue`, MP = CA × `rawMaterialPct`, Charges = Σ charges résultat × 12 in the chosen scenario, Personnel = `extrasBudget`, no Autres produits.
- Prévisionnel: charge table and the figures above; investments list with total.
- Au réel (per month): one row per CA sales entry of the month (label, type, HTVA, linked events) tagged "facturé", plus one row per event of the month that no `facture` or `comptoir` entry covers, at price × guests, tagged "signé". An event with only a deposit therefore shows twice, as the deposit row and the signed row, which is what the workbook does (February 2025: "De Frahan acompte" 750 and "Doriane de Frahan" 1 487,5 both in Total signé). Heures = `hoursSpent`; Observations = notes. Footer: Total signé, Total heures, Je vise = objectif mensuel, Temps disponible = `hoursAvailableOverrides[m] ?? hoursAvailablePerMonth` (the workbook's figure moves from 208 in winter to 0 in September), Il me reste à signer = objectif − total, Heures restantes. Year total and écart to `annualRevenue`.
- Extras (inside the Achats book): per person, one entry per invoice with its shifts (Date | Heures) and a Résumé facture footer (dates, Σ heures, taux, montant), replacing the "factures" sheet (Kristoff: 17 dates, 158 h × 30 € = 4 740 €, one VAT line, one number).
- Client history: events (Signé = price × guests, "Facturé n° …" tag) and entries, two lists.

Month grouping uses `date.slice(0, 7)` everywhere, never `new Date().getMonth()` (`Dashboard.tsx:106-108`). Amounts are validated to two decimals and summed in cents; `fmtEur` formats "1 234,56 €".

**Lock.** "Verrouiller le mois" opens a confirmation showing the three MP figures (calculé, achats, saisi) and asks which one the month keeps, defaulting to the current `mpSource`; it calls `POST /admin/ledger/lock { ym, mpSource?, rawMaterial?, note? }`, which sets `locked` on the month's entries and writes `monthCloses[ym]` with `lockedAt`. The lock freezes date, number, label, kind, amounts, VAT, prestation type and events; Réglé, Mode, Encaissé le and Description stay editable (`PATCH`). "Déverrouiller" asks for a reason, calls `POST /admin/ledger/unlock { ym, reason }`, clears `locked` and `lockedAt`, writes `unlockedAt`, and leaves `mpSource` as chosen. A successful export offers "Verrouiller octobre 2026 ?"; it never locks by itself.

**Export.** `apps/frontend/src/lib/ledger-export.ts` with the `xlsx` dependency already used in `Recipes.tsx:113-116`: "Livre des recettes 2026.xlsx" with one sheet per month ("Janvier" to "Décembre") whose header row is the workbook's exact wording and order (NUMERO OPERATION, DATE FACTURE/OPERATION, INTITULE, Total tvac, RECETTE htva, TVA 6%, TVA 12%, TVA 21%, réglé, mode paiement, date encaissement, Type, Description, KM), CA lines only (`isCaEntry`), `vatAmount` in the column of its rate, dates as Excel date cells, "réglé" as "oui" / "non" (not booleans), credit notes as negative lines, a TOTAL row (Σ D to H) and the per-type totals written as values, the E6 note "tvac/1,06 ou 1,12 ou 1,21" copied; a "recettes 2026" sheet with the company header from `settings.company` including "Date de constitution" in B1:C1, the whole year's CA lines with a TOTAL row that also sums KM (N140), the THERMOMIX block (12 rows janvier to décembre, commission amounts by `ym` in the "Total tvac" column, "pas de tva", "total thermomix") and the ACOMPTES block (client, montant, date paiement, date événement from the linked event); the workbook's row 162 grand total, which mixes commissions into column D only, is not reproduced. An "Achats" sheet; a "Compte de résultats" sheet with a "Source MP" column. Only months with entries are written; the 2026 month sheets in the workbook are empty, January to November 2026 stay in Falco, and the app's journal starts with the deployment month. CSV per month with `;` and decimal comma. A jest snapshot compares the generated month header with Janvier A2:N2. The accountant opens one real monthly export before the report views are built; that needs a full month of entries after deployment, so it is a milestone after slice 4, not its end.

**What the Dashboard becomes.** Moved to `/finances` as "Finances (ancien)" in slice 2 (reachable from a link under the week's money strip), deleted in slice 4. The home is the week with the three-tile strip from 5.1; À encaisser and Marge brute du mois are Aperçu tiles. The monthly chart is rebuilt in Aperçu over ledger HTVA with N−1 and Objectif series.

Files: `packages/types/src/entities/ledger.ts`, `settings.ts`, `dto/ledger.ts`, `dto/settings.ts`, `dto/primitives.ts`, `lib/reports.ts`, `lib/reports.test.ts`, `lib/money.ts`; backend `ledger/{module,controller,service}.ts`, `settings.service.ts`, `config.service.ts`, `health.controller.ts`; frontend `pages/admin/comptes/{ComptesLayout,Journal,Apercu,Resultats,Previsionnel,AuReel}.tsx`, `components/comptes/LedgerEntryForm.tsx`, `lib/accounting.ts`, `lib/accounting.test.ts`, `lib/ledger-export.ts`, `EventDetail.tsx`, `EventEditor.tsx`, `Settings.tsx`, `Week.tsx`, `api.ts`.

### 7.7 AI

Not now for the core. Duplicate detection is string normalisation, planning is a view, Hoona is a template, accounting is arithmetic that must stay deterministic.

A ChatGPT subscription does not give API access; the feature below needs an OpenAI API key with billing, about 0,01 € per import. Nothing is built for it before she supplies a key: no settings key, no Paramètres section, no `/health` flag until slice 6.

One optional feature: **recipe import from a photo or pasted text**. Entry point: "Importer depuis une photo ou un texte" in the `/recipes` overflow. Input: one JPEG or PNG ≤ 5 MB from the phone camera, or text ≤ 8 000 characters. Backend `POST /admin/ai/parse-recipe` (multipart or JSON) calls the OpenAI Responses API with `gpt-4o-mini`, vision input, structured output matching a Zod schema `{ name, portions?, description?, ingredients: { name, qty, unit }[], steps: string[] }`, temperature 0; the key is read from the SSM parameter `/la-table-amelie/production/OPENAI_API_KEY`, declared `.optional()` in `config.service.ts`; `/health` reports `aiEnabled`. The service maps each ingredient name through `normalizeIngredientName` and `aliases` to an existing `ingredientId`; unmatched names come back flagged. Output: `RecipeEditor` opens prefilled with unmatched ingredients highlighted and a "Créer" shortcut to `IngredientFormModal`; nothing is saved until Enregistrer. When the key is absent the menu item is hidden. Effort: three days.

A second optional feature, same slice, same key: **Falco invoice PDF drop** on the Journal page. Input: one PDF; output: the entry form prefilled with number, date, label, TVAC, HTVA and VAT rate, nothing written until Enregistrer. Not proposed: AI for duplicates, pricing, planning suggestions, or anything that writes to the ledger without the form.

### 7.8 Out of scope

- **Full invoicing**: Falco issues; the app records the ledger line and payment state.
- **Quotes**: a one-day "Proposition de menu (PDF)" from an event (menu by category, convives, price per guest, contact, 11pt) covers the client-facing need; the legal quote stays in Falco.
- **CRM**: the thin `Client` record with contact, defaults and notes. Pipeline, follow-ups and mailing stay in Mailchimp and Notion.
- **Main-d'œuvre and extras**: a `personnel` purchase line with shifts and a rate feeds the income statement and the per-person summary. No scheduling or rota. Note that Enobase's "extras" means extra staff while the app's `extraCosts` means extra costs; the `kind` field keeps the two apart.
- **Odoo**: never at this size. At 200 €/month Enobase costs 2 400 €/year against the workbook's 16 000 € HTVA monthly objective; the app's edge is that costing and margin already exist and the data is already there.
- **Persistent stock per ingredient**: later; `haveQty` on grocery lists is enough for now.
- **Unit conversion during a merge** (1 pièce = 60 g): not in this plan; the page shows the recipes to convert by hand.

## 8. Roadmap

Deploy order for every slice: `pnpm build:types`, backend, then frontend. No migration script in any slice. Each slice ends with a sentence on what Dalia notices. Effort figures are estimates, not measurements; the engineer critic rated the draft's figures about a third low before the cuts listed in section 11, and the figures below include those cuts.

### Slice 1 (weeks 1-2): readable recipes, cook mode, ingredient merge

Scope: tokens and scale in `index.css` and `tailwind.config.ts` (including the `sm` and `base` overrides and `.table`); `touch`/`pointer` variants; `scripts/check-contrast.mjs` and the `lint:type-scale` package script; `PageHeader`, `Section`, `Tag`, `StatusTag`, `ListRow`, `Stepper` (typed field, ×2, ÷2), `SectionToggle`, `FieldLabel`, `RecipeReader` with the "Aa" toggle; `Editable*` helpers moved to `components/ui/editable.tsx`; light sidebar; breadcrumbs through `PageHeader`; `RecipeDetail.tsx` read mode with `?mode=edit` keeping today's JSX; `RecipeEditor.tsx` restyled with `FieldLabel`; `RecipeCook.tsx` rewrite with query params and wake lock; `scaleQty`, `calcIngredientLineCost`, `calcRecipeCost`, `calcEventCost` moved to `packages/types/src/lib/costing.ts` (`EventDetail.tsx:62` and `EventEditor.tsx:125` read `total` from it); `normalize.ts` with `normalize.test.ts` and the root `test` script change; `GET /admin/ingredients/duplicates` (declared before `:id`), `POST /admin/ingredients/merge`, 409 on referenced delete, `UnprocessedItems` loop; alias matching in both imports with the unit-family skip; `IngredientDuplicates.tsx`; create-time warning in `IngredientFormModal`; removal of `deduplicate`; fix `h-22`; `SETTINGS_TTL` to 30 s.
Files: as listed in 7.2 and 7.3, plus `ddb.service.ts`, `ingredients.controller.ts`, `ingredients.service.ts`, `recipes.service.ts`, `dto/ingredients.ts`, `api.ts`, root `package.json`.
Schema: `aliases`, `mergedFrom`, `settings.ignoredDuplicateGroups`, all optional.
Migration: none. On-demand backup of ingredients and recipes before the first live merge.
Dalia notices: recipe pages she can read on her phone, a cook mode she can follow with wet hands, and "oeuf" / "oeufs" merged without losing recipe lines. The slice ends with a 20-minute kitchen session on her phone.
Effort: 11 to 14 days.

### Slice 2 (weeks 3-4): categories, order, week and day views

Two deliverables so the week is in her hands in week 3.

2a (week 3), read-only planning: `EventRecipeLine` fields and strict line DTOs; lazy line ids in `EventsService` (`withLineIds`, `condition` option on `DdbService.update`); `settings.courses`, `recipe.defaultCourse`; `settings.objectives` limited to `annualRevenue`, `monthsActive`, `monthlyOverrides` with the two-input "Objectifs par année" section in `Settings.tsx` (same files as `courses`: `dto/settings.ts`, `settings.service.ts`); `planning.ts`, `dates.ts` with its jest cases, `MoneyTile`; `Week.tsx` at `/semaine/:isoWeek` with the `/` redirect, the sidebar collapse rule and the money strip; `Day.tsx` with the print stylesheet; `PrepSheet.tsx`; cook mode with `?portions`; sidebar reorder; `Dashboard.tsx` moved to `/finances` with the tax toggle hidden.

2b (week 4), writing: `POST/PATCH/DELETE /admin/events/:id/lines[/:lineId]`, `PUT /admin/events/:id/lines` with the set check, the merge-by-`lineId` rule on `PATCH /admin/events/:id`; `StatusControl` and the touch dot; `EventDetail.tsx` menu by category with ▲▼, category select, portions through the line endpoint, "Terminer l'événement" replacing the pill (snapshot field arrives in slice 4; until then it PATCHes the status only); `EventEditor.tsx` sending scalars only on existing events, lines through the line endpoints, category select; `Events.tsx` as `ListRow`s, ascending sort for À venir, deletion of the modal, the aggregated PDF, the multi-select and the localStorage hand-off; `grocery.ts` with the one-click "Courses de la semaine" and "Courses du jour" writing `eventIds` and `range`.
Schema: line fields (`prepDate` stored, no UI), `recipe.defaultCourse`, `settings.courses`, `settings.objectives` (three fields), `groceryList.eventIds/range`.
Migration: none; line ids are filled on first read.
Dalia notices (2a): the home page is her week with signed revenue and the month objective, each day is a prep list, every line opens the recipe at the right portions. (2b): she ticks lines from the phone, menus read in service order, and a week's groceries are one click.
Effort: 8 to 10 days.

### Slice 3 (weeks 5-6): clients and weekly templates

Scope: `ta-clients` table (console, SSM parameter, `ec2-bootstrap.sh`, `.env`, `pm2 restart`, `data-stack.ts`); `config.service.ts` optional var, `requireTable`, `HealthController` tables field; `client.ts`, `dto/clients.ts`; `clients` module with `instantiate` and `link-events`; `Clients.tsx`, `ClientDetail.tsx` with the semaine type and the two-list history; `EventEditor.tsx` client select with defaults and template prefill from `?client=`; `EventDetail.tsx` client link, "Enregistrer comme modèle", "Mettre à jour le modèle", "Ajuster les portions aux convives", date-asking Dupliquer; `Week.tsx` client chips, banner and the "Convives" sheet; `api.ts` `clients.*`.
Schema: `event.clientId`, `event.templateId`.
Migration: none. Old events keep working through `contactName`; the client page's history and "signés cette année" only see events with a `clientId` until she presses "Associer les événements existants".
Dalia notices: Hoona set up once, "Créer la semaine du 19 oct" in one tap with this week's head count.
Effort: 5 to 6 days.

### Slice 4 (weeks 7-8): journal, closure, export

Scope: `money.ts`, `ledger.ts`, `dto/ledger.ts`, `dto/primitives.ts`; settings `prestationTypes`, `company`, `monthCloses`, `ledgerStartYm`; event fields `prestationType`, `vatRate`, `hoursSpent`, `costSnapshot`, `extraCosts[].kind`; `costSnapshot` accepted by `updateEventRequestSchema` and computed on the event page; `ta-ledger` table and provisioning; `ledger` module with CRUD (`PUT` full, `PATCH` thin), lock and unlock; `CA_KINDS` and `isCaEntry` in `reports.ts` with the first `reports.test.ts` cases; `comptes/ComptesLayout.tsx`, `Journal.tsx`, `LedgerEntryForm.tsx` (one rate per entry, shifts list, credit notes), `accounting.ts` with the two prefills and their tests, `ledger-export.ts` with the header snapshot test; Facturation section on the event with the three tags, "Créer la facture" (also on upcoming events) and "Enregistrer un acompte"; "Facturer le mois" on the client; prestation type and VAT in `EventEditor`; the "Facturé" tick on the week's month bar; `Dashboard.tsx` and `estimateBelgianTax` deleted.
Schema: `ta-ledger`, event fields, settings keys.
Migration: none. Settings defaults seeded on first read. No ledger backfill; prior-year and pre-deployment totals are carried in `settings.yearActuals` (slice 5). The 2026 workbook month sheets are empty, January to November 2026 stay in Falco, and the app's journal starts with the deployment month; "Exporter 2026 (xlsx)" writes only months that have entries.
Dalia notices: closing an event asks for the Falco number and VAT, the journal and "Total CA" per month come out of the app, and the accountant receives an xlsx in the columns she already uses. Milestone after the slice: the accountant has opened one real monthly export.
Effort: 10 to 12 days.

### Slice 5 (weeks 9-11): reports, prévisionnel, au réel, polish

Scope: settings `fixedCharges` (with `inResult`), the remaining `objectives` fields and `yearActuals` with their Paramètres sections and a paste helper for the ~30 charge lines; `reports.ts` complete with jest fixtures (`incomeStatement` with the three MP sources and the loss-month tax rule, `apercu` with the `ledgerStartYm` precedence, `mix`, `previsionnel`, `auReel`); `Apercu.tsx` (chart moved and recoloured), `Resultats.tsx` with the "Source MP" dialog, `Previsionnel.tsx`, `AuReel.tsx`; Extras summary in the Achats book; Compte de résultats sheet in the export; grocery page card layout at every breakpoint with `fullBleed`; drag reorder on laptop; "Proposition de menu (PDF)"; `hoursSpent` inline; then the section 11 items she has asked for after using the week view, in her order.
Schema: settings keys only.
Migration: none.
Dalia notices: breakeven, treasury and the income statement in the app with the SRL tax, last year's figures beside this year's, a client-facing menu PDF in one click, and the phone layout finished.
Effort: 13 to 16 days.

### Slice 6 (optional): AI recipe import

Scope: `ai` module, `POST /admin/ai/parse-recipe`, optional SSM key, `/health aiEnabled`, Paramètres "Intelligence artificielle" (key presence only), import flow into `RecipeEditor`; the Falco PDF drop if wanted. Migration: none. Effort: 3 days (plus 2 for the PDF drop), only if Dalia supplies an API key and still types recipes by hand.

### Maintenance PR (any time)

Delete `packages/utils` and `TABLE_NAMES` as listed in 6 (Backend plumbing). Half a day, no user-visible change.

Total: about 47 to 58 days across eleven weeks. If time runs out, stop after slice 4; the journal and the export already retire the monthly sheets, the week keeps its objective bar from slice 2, and the reports can follow a quarter later.

## 9. Open questions for the caterer

1. Is Hoona fed every working day or once a week? Default assumed: one template per delivery day; both shapes work.
2. Is Hoona (and the office lunches) invoiced per delivery or monthly, and per head or as a flat amount? Default: `invoicing: "mensuelle"` with one entry over several events, prefilled per head and overwritten in the form.
3. Which VAT rate applies to ateliers? Default: 21 %, editable in Paramètres.
4. Which corporate tax rate should the income statement use? Default: 25 %; the 20 % reduced rate needs a director remuneration of at least 45 000 € and other SME conditions, which the current 1 500 €/month salary does not meet; the workbook's 15 % no longer exists.
5. Are deposits invoiced through Falco and VAT-bearing in the month received? Default: yes, as `acompte` entries dated when the money arrived, matching the workbook.
6. Does the accountant accept the xlsx layout as is, or does she want a different column order or a CSV? Default: the workbook's exact columns, one sheet per month, "oui" / "non" for réglé.
7. Which prior-year totals should be typed into Paramètres so Aperçu works from day one? The 2026 file holds no 2025 journal lines (recettes 2025 rows 11-138 are empty), only typed totals: 2025 monthly (Apercu B3:B14), 2024 by type (B22:B28), 2023 and 2024 period totals (B185:C190). Default: enter those when slice 5 ships, plus the 2026 January to November monthly totals from Falco. Optional: import the 75 "Au réel 2025" rows (label, type, CA HTVA) as entries flagged `imported` to fill the 2025 mix by type; their monthly totals match Apercu for ten months but not October (1 125 vs 0) or December (0 vs 10 868,30), so the typed totals stay the N−1 source. Does the 2025 workbook file exist if she wants line-level history?
8. Does she still want a printed sheet during the transition, and does she send the prep list to an extra such as Kristoff, by what channel? Default: the day view prints and the per-event PDF stays until slice 5; a day or week PDF with phone sharing is built only if she says yes.
9. Which emoji or icon per recipe format and menu category, if any? Default: none; nothing is built until she asks.
10. Is the line "Remboursement investissement dirigeant" (600 €/month) a repayment of capital (outside the income statement) or does it include interest? Default: capital only, excluded from the result and the ISoc estimate, kept in the breakeven and the treasury need; if interest is charged, enter it as a separate "frais" line.
11. How does the accountant book Thermomix commissions (chiffre d'affaires or autres produits d'exploitation), and are they VAT-exempt or self-billed by Vorwerk? Default: outside CA, VAT 0, shown as Autres produits, exported only in the THERMOMIX block.
12. Are gift vouchers taxed at sale or at redemption? Default: at sale, at the prestation type's rate, as the workbook books them; a `redeemedEventId` field is reserved, not built.
13. How does Falco number credit notes, and should a credit note cancel a deposit or an invoice? Default: `note_de_credit` entries with negative amounts referencing the corrected entry, exported as negative lines.
14. Is the VAT return monthly or quarterly? Default: monthly lock granularity; a quarterly return only changes when she presses "Verrouiller".
15. Are all events in the app confirmed, or does she enter quotes too? Default: all confirmed; no quote status, "Signé" counts every upcoming event.
16. In the kitchen, phone or tablet, propped on the counter or in hand? Default: phone in hand for ticking, propped for reading, hence the "Aa" toggle and the 1280px grid breakpoint.
17. Does Hoona's head count change from week to week? Default: yes, hence the "Convives" field on "Créer la semaine" and "Ajuster les portions aux convives".
18. Does she have an OpenAI API key, or only a ChatGPT account, and does she still type recipes by hand from paper or photos? Default: no key; slice 6 does not run. What did the Enobase salesperson say their AI does? Default: nothing in the plan depends on the answer.

## 10. Risks

- **Whole-array overwrites.** `EventEditor.buildPayload` (line 66) sends every field, including `recipes`, 800 ms after any keystroke. In slice 2b the editor stops sending `recipes` for existing events and the server merges any `recipes` array it still receives by `lineId`, keeping stored status, notes and category; `EventDetail`'s reorder path is covered by the `PUT` merge-by-`lineId` rule. Test the two-device case (laptop editor open, phone ticking) before release. Optimistic concurrency is not built (section 11).
- **Line-id backfill on first read.** Two overlapping first reads of the same event could generate different ids; the `attribute_not_exists` condition makes the second write fail and the losing tab reloads on its next 404. Single user, sub-second window.
- **Two new tables on a hand-provisioned stack.** Each needs the console, SSM, `.env` and pm2 steps. Optional env vars keep the API booting, but a forgotten parameter makes Clients or Comptabilité return 503. `/health` reports which tables are configured; `data-stack.ts` is updated in the same PR.
- **Pre-deployment months.** They have no ledger revenue and no snapshots; the income statement is blank for them unless she types the monthly totals in `yearActuals` and sets the month's MP source to "saisi" with the workbook's figure. The 2025 workbook stays the record for 2025.
- **Accounting defaults are assumptions.** Atelier VAT, the corporate tax rate and its SME condition, VAT on deposits, commissions outside CA, vouchers, credit notes and the loan repayment are editable or listed in section 9; the accountant should confirm them before the first export is relied on. The management result has no depreciation line.
- **Breakeven mismatch.** The MP-adjusted seuil is higher than her number; it is the second line, labelled, and the workbook formula stays primary. The breakeven includes the loan repayment and the income statement does not; the "hors résultat" tag makes the gap visible.
- **Au réel double-counts a deposit and its event on purpose**, as the workbook does; the final invoice is entered net of the deposit, so the year total is right.
- **Settings item is last-write-wins** (`SettingsService.update` is a put). Categories, prestation types, charges, objectives, prior years and month closes share it. Acceptable for one user.
- **Merge on a concurrently edited recipe.** The remap writes each recipe's `ingredients` array; an edit to that array from another tab in the same seconds is lost, and the re-scan before delete catches a reintroduced reference. The page asks to close other tabs.
- **Print on iOS Safari.** Page breaks inside long groups are less controllable than jsPDF; the per-event PDF stays until slice 5 and the day PDF is built only on request.
- **Design judged by Dalia, not by tokens.** The contrast ratios in section 4 were measured with the WCAG formula on the HSL values given, not taken from the audit: the audit's suggested primary (25 55% 45%, stated as 4.6:1) measures 4.27:1 with white, so the primary is 25 55% 41%. `scripts/check-contrast.mjs` does not exist yet; it ships in slice 1. Slice 1 ends with her phone in her hands before the same look reaches list pages.
- **Slice 4 may overrun.** Journal and export ship first; Résultats, Aperçu and the rest are already in slice 5.
- **Not checked:** whether Falco exports CSV or PDF in a parsable form; the live supplier list in settings; `LoginPage.tsx` was not read in detail, so the `FieldLabel` replacement there is assumed mechanical; the minimum director remuneration figure in the 2025 government programme (45 000 € is the published condition used here).

## 11. Deferred simplifications

Things the draft had, cut or deferred by the critique, kept here so the developer can revisit them. None is required by the accountant for the journal export, by the merge's remap-before-delete safety, or by what Dalia sees in slices 1 and 2.

| Item | Status | Revisit when |
|---|---|---|
| Migration runner (`tsx`, `apps/backend/scripts/migrate.ts`, 001-line-ids, 002-cost-snapshots, 003-clients-from-contacts) | cut; ids filled on first read, no snapshot or client backfill | a bulk action is wanted: add `POST /admin/events/snapshot-completed` in the API, not a script |
| `expectedUpdatedAt` on `PATCH /admin/events/:id`, the condition in `DdbService.update`, the `ddb-exception.filter.ts` 409 mapping, the dirty-set autosave with `loadedRef` in `EventEditor` | deferred | a real overwrite is observed; then: `loadedRef` refreshed from every POST and PATCH response, `{ expectedUpdatedAt, ...fields }` destructured in `EventsService.update` and passed to `ddb.update` as a condition, a `blocked` flag that stops autosave until "Recharger" |
| `MobileTabBar.tsx`, `pb-[64px]` in `AdminLayout`, the 52px phone top bar, `h-[calc(100dvh-52px-64px)]` on the grocery page | deferred to slice 5 | the slice 1 kitchen session shows she misses it; pick one bar height and use it in both the layout padding and the grocery formula; check iOS Safari `100dvh` |
| `lib/pdf/day-pdf.ts`, "PDF du jour", "PDF de la semaine", Web Share on phones | deferred to slice 5 | Q8 says yes; adapt `generateAggregatedPdf` (`Events.tsx:140-290`), one day per page, `navigator.share({ files })` with download fallback; then delete `exportRecipesPdf` |
| `prepDate` UI (overflow item "Date de préparation", "→ sam." rendering on the week, prep-day selection in grocery generation) | deferred; field stored and accepted | she asks to cook a line on another day than its event; the line note covers it until then |
| `/grocery-list/new?from=&to=` generation form with per-event checkboxes and "Exclure les lignes déjà faites" | cut; one-click creation instead | she asks to exclude events; `excludeDone` would be the first field back |
| "3 événements modifiés depuis la génération · Régénérer" banner on a grocery list | deferred to slice 5 | built against a `menuUpdatedAt` on the event, bumped only by line add or remove, portions, category and `guestCount` changes, not by status ticks, otherwise it fires on every tick; Régénérer keeps `checked` and `haveQty` by `ingredientId` |
| "Lignes / Événements" toggle default logic beyond the height rule, long-press status on the week | cut | not needed: the touch dot cycles status |
| Generic `DataTable<T>` with card fallbacks, `Ingredients.tsx` cards on phones | cut; plain `.table` inside `overflow-x-auto` | she opens the journal on her phone and the scroll is a problem |
| `InlineField` redesign replacing the `Editable*` helpers, pencil-as-target on touch | cut; helpers moved as they are | edit surfaces are used on touch devices |
| Four-week grid on the client page, `templateIds` on instantiate, favourites without a weekday, `POST /admin/clients/:id/templates/from-event/:eventId` | cut | she wants a second template shape; the week banner and "+" cover creation today |
| Pro-rata attribution of a multi-event invoice to its events | cut; entries and events are listed separately | per-event realised HTVA is wanted for monthly-invoiced clients; fall back to an equal split when Σ weights = 0 |
| "Modifier à partir de" auto-close flow on fixed charges, required `from` | cut; `from` and `to` optional, set by hand | never, unless she edits charges monthly |
| `settings.categoryIcons`, `courseIcons`, `suppliers[].color` with a swatch | cut; hash colour only | Q9 gets an answer |
| `hoursPlanned`, `serviceTime`, `event.km` | cut; `hoursSpent` only, KM on the ledger line | a delivery hour is wanted on the day view (then `HH:MM`, regex `^\d{2}:\d{2}$`, shown on the day and the menu PDF) |
| Server-side cost snapshot (`EventsModule` importing Recipes and Ingredients), `POST /admin/events/:id/snapshot`, `GET /admin/ledger/prefill/*` | cut; client-side with the shared `calcEventCost` and pure prefills | a second writer appears |
| Shared `ta-records` table for clients and ledger entries | not adopted; two tables | the developer prefers one provisioning round over a type filter in every reader |
| `scripts/check-type-scale.sh` | replaced by a `lint:type-scale` package script | never |
| Month lock, `Verrouiller le mois` | kept (accountant); the lighter "Exporté le 3/11" marker with a confirm-on-edit is the fallback | the lock dialog proves heavier than she wants |
| Fuzzy tiers (Damerau-Levenshtein, qualifier subsets) in duplicate detection | kept, never preselected | too many wrong pairs are offered; drop to exact keys plus the manual pair |
| À encaisser and Marge brute du mois on the week header | moved to Aperçu | she asks for money on the week beyond "Signé" |
| `openAiKeySet`, Paramètres "Intelligence artificielle", `/health aiEnabled` | moved to slice 6 | she supplies a key |
| `tsconfig.scripts.json` and `type-check:scripts` for a backend scripts directory | moot without the runner | a script directory is created |

## 12. Critique log

| Finding | Applied | Reason |
|---|---|---|
| engineer-1 | applied | PUT body `{ lineId, course? }[]`, server merges by id, 7.4 and risk reworded |
| engineer-2 | applied in part | merge-by-`lineId` on PATCH with `recipes`, `updateRecipePortions` deleted; `expectedUpdatedAt` requirement skipped (deferred, section 11) |
| engineer-3 | skipped | superseded by the `expectedUpdatedAt` deferral; its three details are recorded in section 11 for when it returns |
| engineer-4 | applied | via verifier-8: discriminated union, PUT full plus thin PATCH |
| engineer-5 | applied | `@Get("duplicates")` before `@Get(":id")` |
| engineer-6 | applied | `IngredientsService` scans through `DdbService`; module cycle note |
| engineer-7 | applied | lists keep price fields; `haveQty` rule |
| engineer-8 | applied in part | preselect only identique (verifier-4); the same-first-three-letters rule skipped because it would block oignon / ognon |
| engineer-9 | applied | full deletion list, moved to a maintenance PR |
| engineer-10 | applied | `AdminSidebar.tsx:86` |
| engineer-11 | applied | `Dashboard.tsx:106-108` (verified: `getMonth` at 108), 308-326, `RecipeCook.tsx:46`, `Events.tsx:81-138` |
| engineer-12 | applied | 409 plus archive; 7.5 reworded |
| engineer-13 | deferred | banner deferred to slice 5 with the `menuUpdatedAt` rule recorded in section 11 |
| engineer-14 | applied | 200 with `ok: false, failures` |
| engineer-15 | skipped | runner cut |
| engineer-16 | skipped | runner cut |
| engineer-17 | applied | `sm`/`base` overrides, `spacing.tap` dropped |
| engineer-18 | applied | 68px in both places (tab bar deferred) |
| engineer-19 | applied | lookup keyed by `normalizeIngredientName`; unit-family skip |
| engineer-20 | applied | root `test` script, `reports.test.ts` listed |
| engineer-21 | applied | live name beats alias; summing limited to rewritten lines |
| engineer-22 | applied | `HealthController` tables field |
| engineer-23 | applied in part | estimates revised after the cuts: 47 to 58 days, stated as estimates |
| accountant-1 | applied | `inResult`, two charge sums, UI toggle and totals, Q10 |
| accountant-2 | applied, adapted | `yearActuals` as specified; precedence keyed on `settings.ledgerStartYm` per month instead of "any ledger entry in Y", because the first ledger year (2026) has only December in the ledger |
| accountant-3 | applied | `CA_KINDS`, commissions outside CA everywhere, THERMOMIX block, Q11 |
| accountant-4 | applied | `monthCloses`, lock dialog, no count rule, "non terminés" line |
| accountant-5 | applied | no scenario toggle on Résultats |
| accountant-6 | applied | one rate per entry (`vatRate`, `vatAmount`), second entry for a second rate |
| accountant-7 | applied | lock scope; payment fields editable; unlock with reason |
| accountant-8 | applied | three tags |
| accountant-9 | applied | signed until a facture covers the event; two lists in the client history |
| accountant-10 | applied | help text, `smeReducedRate`, two-tier formula |
| accountant-11 | applied | "Impôts (estimation)", footnote, `corporateTaxActual` |
| accountant-12 | applied | `note_de_credit`, sign rule, Q13 |
| accountant-13 | applied | scenario-named tile, Seuil par mois actif |
| accountant-14 | applied | `hoursAvailableOverrides` |
| accountant-15 | applied | column order wording, Description before KM |
| accountant-16 | applied | `auReel(m).totalSigne` feeds Prévision |
| accountant-17 | applied | Nb nécessaires without the line-count fallback |
| accountant-18 | applied | oui/non, Σ KM, `constitutedOn`, E6 note, header snapshot test |
| accountant-19 | applied | via verifier-8 |
| accountant-20 | applied in part | date rule stated; equal-split fallback moot without pro-rata (noted in section 11) |
| accountant-21 | applied | relabelled, workbook line kept as a third line |
| accountant-22 | applied | Q12, field reserved not built |
| accountant-23 | applied | invoice on upcoming events; prefill up to the end of the chosen month |
| accountant-24 | applied | `shifts` inside one personnel entry; pro rata to shift months |
| accountant-25 | applied | questions 10 to 15 |
| dalia-1 | applied | breakpoints at `xl`, collapsed sidebar, column widths, content rules; its fit estimate ("under 548px") replaced by completeness-10's arithmetic (760px scrolls) |
| dalia-2 | applied | real numbers, toggle default under 800px, line count on the card |
| dalia-3 | applied | grid at 1280px and 44px rows with a tappable dot under `touch:` |
| dalia-4 | applied | phone day structure, chevron to the day, wireframe |
| dalia-5 | applied | thumbnail, one 64px bottom bar, top bar hidden on the prep sheet |
| dalia-6 | applied | "Aa" toggle, one-sentence split, decided in the kitchen session |
| dalia-7 | applied | typed Stepper with ×2 ÷2 |
| dalia-8 | applied | "Convives" sheet, "Ajuster les portions", banner condition |
| dalia-9 | applied in part | one paper button per view; week PDF and share deferred (section 11) because simplifier-2 keeps day-pdf out of slice 2 |
| dalia-10 | not applied | refuted: the workbook holds no 2026 journal lines; the residual wording note was added to slice 4 and 7.6 |
| dalia-11 | applied | export side-effect free, prompt after export |
| dalia-12 | applied | recipes-to-convert path, group stays visible |
| dalia-13 | applied | "Formats de recette", "Catégories du menu", "Par catégorie" |
| dalia-14 | applied | "Comptabilité"; old dashboard linked from the week strip, not the sidebar |
| dalia-15 | applied | h1 once, in the body; bar behaviour stated for when the tab bar lands |
| dalia-16 | applied | tables only where columns are summed; Au réel and history as rows |
| dalia-17 | applied | via completeness-2 |
| dalia-18 | applied | slice 2 split into 2a and 2b; utils deletion moved to a maintenance PR; contrast script kept in slice 1 (verifier-1) |
| dalia-19 | applied | API key note, Q18 |
| dalia-20 | applied | Q16, Q17, Q8 extended |
| completeness-1 | applied | `calcEventCost` contract, snapshot recipe-only, matiere once |
| completeness-2 | applied | three objective fields in slice 2, one strip description, empty case |
| completeness-3 | applied | one list in 3, 5.1, 7.6 |
| completeness-4 | applied | "records edited only on purpose", rule stated once |
| completeness-5 | applied | |
| completeness-6 | applied | |
| completeness-7 | applied in part | dates fixed, 002 dropped, risk rewritten; the import of 2026 month sheets skipped because they are empty (dalia-10 refutation); 2026 totals typed instead |
| completeness-8 | applied | moved, not deleted |
| completeness-9 | applied | three-taxonomy paragraph in 7.4, table row in 2 |
| completeness-10 | applied | |
| completeness-11 | applied | routes added, `RecipeEditor` fate stated |
| completeness-12 | applied | |
| completeness-13 | applied | Falco drop listed in 7.7, ChatGPT note, Enobase question |
| completeness-14 | applied in part | counts verified: 60 occurrences on 57 lines, 31 with tracking-wider; `Dashboard.tsx:106-108` not 105-107 |
| completeness-15 | applied | with engineer-9 |
| completeness-16 | applied | `POST /admin/ledger/unlock` |
| completeness-17 | applied | sentence removed with pro-rata; entries list their events |
| completeness-18 | applied | `MoneyTile` in slice 2, `calcEventCost` in slice 1, `DataTable` cut |
| completeness-19 | applied | `accounting.ts` content defined |
| completeness-20 | applied | `tva` unchanged, UI select, naming note |
| completeness-21 | applied | `TemplateLine`, `templateLineSchema` |
| completeness-22 | applied | TTL to slice 1; `settings.update` already invalidates (`api.ts:103`) |
| completeness-23 | applied | "slices 2 and 3", toggle hidden |
| completeness-24 | applied | `serviceTime` dropped (simplifier-21) |
| completeness-25 | applied | Q2 and Q15; signed rule uses facture-kind entries |
| completeness-26 | applied | scanAll note under Endpoints |
| completeness-27 | applied | one PUT per event, sequential |
| completeness-28 | applied | via verifier-8; PUT recomputes `ym` |
| simplifier-1 | applied | chosen over simplifier-2's "migration 001 stays": the read-time backfill with a persisted write gives every API response ids, which answers simplifier-2's objection (PATCH cannot address old lines) without a script or a deploy-ordering constraint; `events.service.ts:17-26` makes it a ten-line change |
| simplifier-2 | applied, except item (2) | split and cuts applied, `exportRecipesPdf` kept, `grocery.ts` kept; migration 001 replaced by lazy ids (see simplifier-1) |
| simplifier-3 | skipped | two tables kept: existing one-table-per-entity pattern, type filter in every reader, one to two hours per provisioning; recorded in section 11 |
| simplifier-4 | applied | editor sends scalars only on existing events; `expectedUpdatedAt` deferred |
| simplifier-5 | applied | set check kept |
| simplifier-6 | applied | tab bar deferred, breadcrumbs via `PageHeader` |
| simplifier-7 | applied in part | `day-pdf.ts` out of slices 1 to 4 and the "PDF du jour" button cut; the file stays listed in section 11 rather than cut outright, because simplifier-2 and dalia-9 both want a PDF path if Q8 says yes |
| simplifier-8 | applied | `DataTable` cut |
| simplifier-9 | applied | helpers moved, `InlineField` cut |
| simplifier-10 | skipped | conflicts with verifier-4 (confirmed high), which keeps the tiers with safeguards; recorded in section 11 |
| simplifier-11 | skipped | conflicts with accountant-4 (confirmed high); the lighter marker is the fallback in section 11 |
| simplifier-12 | applied | pro-rata cut; Au réel and history list entries and events |
| simplifier-13 | skipped | conflicts with accountant-4; the toggle is gone anyway, the source tag stays |
| simplifier-14 | applied | |
| simplifier-15 | applied in part | grid, `templateIds`, favourites, from-event endpoint cut; `guestCount` override kept for dalia-8 |
| simplifier-16 | applied | |
| simplifier-17 | applied in part | type-scale guard is a package script; `check-contrast.mjs` kept because verifier-1 (confirmed high) delivers it in slice 1 |
| simplifier-18 | applied | defaults in `entities/settings.ts`, `VatRate` with the ledger |
| simplifier-19 | applied as in simplifier-2 | field stored, UI deferred |
| simplifier-20 | applied | client-side snapshot, pure prefills, no module imports |
| simplifier-21 | applied | |
| simplifier-22 | applied | |
| simplifier-23 | not applied | refuted: slice order unchanged |
| simplifier-24 | applied in part | À encaisser and Marge brute moved to Aperçu; the ledger "Facturé" tick on the month bar kept because completeness-2 (confirmed high) asks for it and it is one filtered scan |
| verifier-1 | applied | primary 25 55% 41% everywhere, measured comments, script wording |
| verifier-2 | applied | 12 au 18 octobre, Mar 13, 20 oct, 19 oct, all eleven lines |
| verifier-3 | applied | quantity regex, packaging tokens, fixture list |
| verifier-4 | applied | both-≥5 rule, per-member confidence, nothing fuzzy preselected, tests |
| verifier-5 | applied | hyphen rule, qualifier list, `fume` note |
| verifier-6 | applied | singularisation exceptions, survivor name as header |
| verifier-7 | applied | with engineer-17 |
| verifier-8 | applied | discriminated union, `patchLedgerEntrySchema`, PUT row; `innerType()` comment deleted |
| verifier-9 | applied | primary tint exception |
| verifier-10 | applied | dark accent foreground |
| verifier-11 | applied | input border sentence |
| verifier-12 | applied | algorithm and jest cases in 7.1 |
| verifier-13 | applied | negatives reserved for credit notes, nonnegative elsewhere |
| verifier-14 | applied | |
