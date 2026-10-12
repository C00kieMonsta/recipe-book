# Audit: readability

The admin app is a dense, table-first back-office skin applied to what the caterer uses as a kitchen reading tool. Across the 11 admin pages there are 149 uses of text-xs (12px), 117 of text-sm (14px), 15 of 10 or 11px literals, and only 4 of text-base (16px), two of which are in cook mode; 14px grey is the default for body copy, including recipe steps. Labels are uppercase tracking-wider muted in about 60 places. The palette is warm beige with Playfair and DM Sans, but the measured contrast is weak: muted-foreground is 4.44:1 on the page background, white-on-primary buttons are 2.86:1, green-600 margin figures are 3.03:1, supplier pill text goes down to 2.05:1, and the Tailwind blue/green/amber pills and hard-coded chart greens sit outside the theme. Layout is 13 HTML tables across 10 pages with horizontal scroll as the phone fallback; only the grocery page has a card view. The recipe reading path is the worst case: RecipeDetail shows steps at 14px in grey inside a six-column costing page where every value is click-to-edit and delete buttons appear only on hover, while RecipeCook separates ingredients from steps, shows one step per screen with no context, disables text selection, and uses 28px and 10px tap targets. Navigation is a dark sidebar plus "Retour" buttons with no breadcrumb, page titles switch typeface between list and detail pages, and the home page is a finance dashboard. Compared with Notion the gaps are concrete: body 14px vs 16px, default line height vs 1.5, 1100px multi-card layouts vs one 700px column, uppercase micro-labels vs sentence case, hover-only actions that do not exist on touch, and no icon or colour anchors on recipes or categories.

## [high] Typography: type scale

Body copy defaults to 14px or smaller across the whole admin app. Grep over apps/frontend/src/pages/admin: text-xs 149 occurrences, text-sm 117, text-[10px] 5, text-[11px] 10, text-base 4 (two in RecipeDetail, two in RecipeCook). The tailwind config defines no custom scale and index.css sets no base font size, so Tailwind's 14px text-sm became the de facto body size. The caterer's complaint about font size is literal.

**Evidence:** apps/frontend/src/pages/admin/RecipeDetail.tsx:328 `text-sm leading-relaxed` (steps); RecipeDetail.tsx:402 `<table className="w-full text-sm min-w-[400px]">`; Recipes.tsx:168 `text-xs text-muted-foreground line-clamp-2` (description); GroceryListPage.tsx:497 `text-xs font-medium` (ingredient name), :501 `text-[10px]` (unit), :513 `text-[10px]` (price); Dashboard.tsx:443 `text-[11px]`; apps/frontend/src/index.css:44-46 sets font family only

**Recommendation:** Define a scale in tailwind.config.ts and apply it: body 16px/1.5 (text-base) for anything read, 18px for recipe steps and ingredient lines, 14px only for metadata and table numerics, never below 13px. Remove every text-[10px] and text-[11px]. Add `html { font-size: 16px }` and `body { @apply text-base leading-relaxed }` in index.css so unstyled text is readable by default.

## [high] Recipe reading: steps

Preparation steps, the main content of a recipe, render at 14px in muted grey (4.70:1 on card) and only turn dark on hover. Each step is also a click-to-edit target with a hover-only delete button, so the reading surface doubles as the editing surface. The number badge is 24px with 12px digits and steps are spaced 8px apart, so a 10-step recipe reads as a grey block.

**Evidence:** apps/frontend/src/pages/admin/RecipeDetail.tsx:326 `<ol className="space-y-2">`; :328 `text-sm leading-relaxed`; :329 `w-6 h-6 ... text-xs font-bold` badge; :347 `text-muted-foreground pt-0.5 flex-1 cursor-pointer hover:text-foreground`; :356 `opacity-0 group-hover:opacity-100` delete

**Recommendation:** Render steps as a numbered list at text-lg (18px) text-foreground leading-relaxed with space-y-5, 32px number badge at text-base, inside a 700px reading column. Editing enters via a visible pencil per step or a page-level 'Modifier' mode, not by clicking the text. Delete lives in that mode, always visible.

## [high] Recipe reading: ingredient table

Ingredients are a six-column costing table (Produit, Qté, Perte, Prix/unité, Coût, delete) with 12px uppercase headers and a 400px minimum width. On a 375px phone the content area is about 343px, so the table scrolls horizontally. The columns kept on phone are name, qty and cost; cost is noise in the kitchen, while loss and unit price are hidden. Quantities are inline-editable `<strong>` elements with no affordance, and there is no portion scaling on this page.

**Evidence:** apps/frontend/src/pages/admin/RecipeDetail.tsx:401 `overflow-x-auto -mx-4`; :402 `min-w-[400px]`; :405-409 `text-xs font-bold uppercase text-muted-foreground` headers, `hidden sm:table-cell` on Perte and Prix/unité; :429-436 qty via EditableInlineNum, cost column always shown; :426 8px supplier dot

**Recommendation:** Replace with a two-column list at text-base: ingredient name left, quantity bold with unit muted right, 44px rows, a portions stepper above the list that scales quantities (reuse scaleQty from RecipeCook.tsx:45). Move Perte, Prix/unité, Coût and the total into a collapsible 'Coût matières' block (Notion toggle) or a 'Coût & prix' tab, desktop-oriented, where the table can stay.

## [high] Colour and contrast

Measured WCAG ratios for the tokens in index.css: muted-foreground #7e6f67 on background #f8f5f2 is 4.44:1 and on card 4.70:1, below or at AA while used at 12px and 11px in dozens of places; muted-foreground/50 placeholders are 1.95:1; white on primary #c98b5e (every primary button) is 2.86:1; primary as link text on card is 2.79:1; green-600 margin numbers on beige are 3.03:1; destructive/70 trash icons are 3.21:1. The light beige makes greys and oranges wash out, which matches the 'colours not user-friendly' feedback.

**Evidence:** apps/frontend/src/index.css:19 `--muted-foreground: 20 10% 45%`, :15 `--primary: 25 50% 58%`; muted-foreground used 25 times each in Dashboard.tsx, RecipeDetail.tsx, GroceryListPage.tsx; RecipeDetail.tsx:730 `text-muted-foreground/50 italic`; Recipes.tsx:134 and RecipeCook.tsx:146 `bg-primary text-primary-foreground`; Dashboard.tsx:224 `text-primary font-medium hover:underline`; EventDetail.tsx:244 `text-green-600`; Events.tsx:410 `text-destructive/70`

**Recommendation:** Retune tokens: --muted-foreground to about 20 10% 38% (≈5.9:1 on background), keep it for metadata only, never for primary content; primary button fill to about 25 55% 45% (≈4.6:1 with white) or switch to dark text on a light primary tint; add --success at a warm green that reaches 4.5:1 on beige and use it instead of green-600; raise placeholder opacity to /70. Add a contrast check to the design tokens doc.

## [high] Layout: tables as default

13 `<table>` elements across 10 admin pages. Events has 8 columns including a checkbox and a trash icon, Ingredients 7, Dashboard recent events 8, each with 12px uppercase headers and 10px row padding. On phones every one of them falls back to `overflow-x-auto` horizontal scrolling; only GroceryListPage has a card alternative. Notion's equivalent is a list or gallery with one primary line and muted secondary text, and tables only when the user chooses them.

**Evidence:** apps/frontend/src/pages/admin/Events.tsx:353-417 (`overflow-x-auto card-elevated`, 8 `<th>`); Ingredients.tsx:125-155; Dashboard.tsx:228-259; EventDetail.tsx:262-293; Settings.tsx:138-188; RecipeEditor.tsx:265-291; GroceryListPage.tsx:463 `hidden lg:table` with card fallback at :524

**Recommendation:** Make the list row the default component: name at text-base font-medium, secondary line at text-sm muted (date · convives · statut), status as a coloured tag, actions in a row menu. Keep a real table only on desktop costing views (ingredient costs, income statement) and give those a card fallback below md. Remove row-level trash icons from lists; delete from the detail page.

## [medium] Recipe reading: cook mode structure

RecipeCook puts all ingredients on screen 0 and then one step per screen, so while on step 4 the cook cannot see quantities or the previous step; going back loses position context. Text selection is disabled on the whole screen. Steps are centred serif 24 to 30px, which is readable, but centred multi-line paragraphs are harder to scan than left-aligned. The header shows the recipe name truncated at 16px on phones.

**Evidence:** apps/frontend/src/pages/admin/RecipeCook.tsx:52 `fixed inset-0 bg-background flex flex-col select-none`; :79-99 ingredient screen only at step 0; :100-112 single step, `text-2xl md:text-3xl text-center leading-relaxed font-serif`; :57 `text-base sm:text-xl font-bold truncate`

**Recommendation:** Keep the big type but show context: on tablets a two-column layout (ingredients left, steps right, current step highlighted); on phones a collapsible ingredients drawer pinned at the bottom and a scrollable step list with the active step enlarged, tap to advance. Left-align step text. Remove select-none. Keep keyboard arrows and the portion stepper.

## [medium] Touch targets

Several controls used in the kitchen are below the 44px minimum: cook-mode portion +/- buttons are 28px, progress dots 10px, step-number badge 24px, grocery checkboxes 20px, grocery toolbar icon buttons about 28px, '+ Étape' and '+ Ingrédient' buttons text-xs with 4px vertical padding, ActionMenu trigger 32px.

**Evidence:** apps/frontend/src/pages/admin/RecipeCook.tsx:62 and :66 `w-7 h-7 rounded-full`; :131 `w-2.5 h-2.5`; GroceryListPage.tsx:492 and :533 `w-5 h-5 rounded border-2`; :384-399 `p-1.5 border rounded-lg text-xs` with `h-3.5 w-3.5` icons; RecipeDetail.tsx:320 `px-2.5 py-1 ... text-xs`; apps/frontend/src/components/ui/ActionMenu.tsx:28 `p-2` with `h-4 w-4`

**Recommendation:** Set a minimum 44x44px hit area for every button on recipe, cook and grocery pages (`min-h-11 min-w-11`). Replace the dot strip with a text '4 / 9' and two large prev/next buttons. Make grocery rows tappable in full to toggle the checkbox. Give header buttons text labels at text-sm with py-2.5.

## [medium] Hover-only actions on touch devices

Delete-step, delete-ingredient, delete-list and rename-list affordances are hidden with opacity-0 and only appear on hover. Tablets and phones have no hover, so in the kitchen these actions do not exist. Notion uses hover-to-reveal on desktop but always shows a handle or menu on touch.

**Evidence:** apps/frontend/src/pages/admin/RecipeDetail.tsx:356 and :438 `opacity-0 group-hover:opacity-100`; GroceryListPage.tsx:333 `opacity-0 group-hover:opacity-100`; :373 pencil icon `opacity-0 group-hover:opacity-100`

**Recommendation:** Keep hover-reveal on pointer devices but show the control at reduced opacity under `@media (hover: none)` (Tailwind: add a `touch:` variant or use `[@media(hover:none)]:opacity-100`). Better: move destructive actions into an explicit edit mode so reading surfaces have no delete buttons at all.

## [medium] Labels: uppercase tracking-wider muted

About 60 `uppercase` and 31 `tracking-wider` uses across admin pages, all at 11 to 12px muted grey: every table header, every form label (FieldLabel components), KPI labels, recipe type pill, photo captions, and even a Playfair serif section heading. Small caps grey labels at 12px are the hardest text in the app to read and they appear on every screen.

**Evidence:** apps/frontend/src/pages/admin/EventEditor.tsx:350 and RecipeEditor.tsx:333 `text-xs font-semibold uppercase tracking-wider text-muted-foreground` (FieldLabel); Dashboard.tsx:231-238 table headers, :440 KPI label; RecipeDetail.tsx:405-409 table headers, :307 photo caption `text-[11px] ... uppercase tracking-wider`, :800 type pill `text-xs font-semibold uppercase tracking-wider`; EventDetail.tsx:249 `font-serif text-sm font-bold uppercase tracking-wider text-muted-foreground`; apps/frontend/src/components/ui/IngredientFormModal.tsx:27 labels

**Recommendation:** Sentence case everywhere. Form labels: text-sm font-medium text-foreground. Table headers: text-sm font-medium muted, no uppercase. KPI and section labels: text-sm. Reserve tracking-wider for nothing. Make FieldLabel a shared component in components/ui and use it in EventEditor, RecipeEditor, IngredientFormModal, LoginPage.

## [medium] Reading and editing mixed on one page

RecipeDetail serves three jobs at once: read the recipe, cost it, and edit it. Title, description, portions, weight, category, every step, every ingredient quantity and loss percentage, and the pricing simulation inputs are all live-editable on the same screen, with add-row forms appearing inline. Nothing signals which text is editable until you hover. For a cook this means accidental edits (a tap on a quantity opens an input) and for a reader it means the page is visually busy: two cards of tables plus a gradient simulation card below a 1100px-wide header.

**Evidence:** apps/frontend/src/pages/admin/RecipeDetail.tsx:261 `max-w-[1100px]`; :281-300 EditableType, EditableText x2, EditableInlineNum x2; :318-323 add step button; :394-399 add ingredient button; :445-487 inline add row with SearchSelect, NumericInput, select; :537-645 PricingSimulation with EditableNum inputs; :729-735 editable div with hover-only background

**Recommendation:** Split by job. 'Recette' view: 700px column, photo, title, metadata line, ingredients list, steps, a 'Cuisiner' primary button; no inline inputs. 'Coût & prix' view (tab or toggle block): ingredient cost table and pricing simulation. 'Modifier' button enters an edit mode (or routes to RecipeEditor) where fields become inputs with visible borders. Keep autosave in edit mode.

## [medium] Navigation and orientation

There is no breadcrumb or page context. Detail pages use a 'Retour' button bound to navigate(-1), which depends on history. Page titles change typeface between list and detail pages: list h1s are Playfair (global h1 rule) while RecipeDetail and EventDetail titles are DM Sans because EditableText renders a div. The recipe title and category pill are editable on click with no visible affordance. The sidebar lists six flat items with no grouping, and the current section is only indicated inside the dark sidebar, which is hidden on phones behind a hamburger.

**Evidence:** apps/frontend/src/pages/admin/RecipeDetail.tsx:263 `navigate(-1)`; EventDetail.tsx:192 `navigate(-1)`; RecipeDetail.tsx:285 `text-2xl sm:text-3xl font-bold tracking-tight` on a div vs Recipes.tsx:125 `<h1 className="text-2xl sm:text-3xl ...">`; EventDetail.tsx:216; apps/frontend/src/index.css:46 `h1..h6 { font-serif }`; apps/frontend/src/components/admin/AdminSidebar.tsx:6-13 flat menu, :105-116 mobile top bar with hamburger only

**Recommendation:** Add a breadcrumb line above every detail title ('Recettes / Tarte au citron', 'Semaine du 13 oct / Hoona'). Render all page titles as h1 Playfair 32 to 40px. Show an explicit pencil for editable titles. Group the sidebar: Cette semaine, Recettes, Ingrédients, Courses, Comptes, Paramètres, and on phones add a bottom tab bar with the four daily items.

## [medium] Sidebar and app chrome

The sidebar is near-black brown (#2b211d) against a beige content area, so the app reads as two unrelated surfaces, unlike Notion's single light surface with a slightly tinted sidebar. Nav items are 14px at 70% opacity, the version string is 11px at 3.52:1, the collapse chevron 50% opacity. On phones the chrome is a 52px fixed dark bar plus a full-width drawer; AdminLayout then pads content by 68px.

**Evidence:** apps/frontend/src/index.css:28 `--sidebar-background: 20 20% 14%`; apps/frontend/src/components/admin/AdminSidebar.tsx:72 `text-sm font-medium`, :77 `text-sidebar-foreground/70`, :94 `text-[11px] text-sidebar-foreground/40`, :36 `text-sidebar-foreground/50`; :105 `fixed top-0 ... bg-sidebar`; apps/frontend/src/components/admin/AdminLayout.tsx:15 `pt-[68px]`

**Recommendation:** Switch to a light sidebar: background hsl(30 20% 93%), text-foreground at text-base, active item with a primary-tinted background and a 3px left bar, icons 20px. Drop the version string or move it to Paramètres. On phones replace the drawer with a bottom tab bar and use the freed top bar for the breadcrumb and page title.

## [medium] Off-theme colours

Status, import and chart colours come from the Tailwind default palette and hard-coded hex values rather than theme tokens: cool blue-100/700 and green-100/700 pills for 'À venir' and 'Terminé', amber for import warnings, #16a34a and #0f766e in the SVG chart. On a warm beige base these read as foreign and the app has no success/info/warning tokens to use instead.

**Evidence:** apps/frontend/src/pages/admin/Events.tsx:398, EventDetail.tsx:489, Dashboard.tsx:252 `bg-blue-100 text-blue-700` / `bg-green-100 text-green-700`; Ingredients.tsx:278, :288; Recipes.tsx:329-336 amber; Dashboard.tsx:300-302 `COLOR_MARGIN = "#16a34a"`, `COLOR_TREND = "#0f766e"`; tailwind.config.ts:19-40 defines no success/info/warning

**Recommendation:** Add --success, --info, --warning (and -foreground, -muted) tokens in warm-leaning hues in index.css and tailwind.config.ts, and a `Tag` component in components/ui that takes a variant. Use the same tokens for chart series. Validate each pair at 4.5:1 on card.

## [medium] Supplier colours

Supplier colours are six hard-coded hex values keyed by exact supplier name with a grey fallback; any supplier added in Settings gets #999. They are shown as 8px dots with no legend in the recipe ingredient table and grocery headers, and as coloured text on a 12% tint in the Ingredients table, where Notenschop yellow measures 2.05:1 and Barn orange 2.70:1. The ingredient filter pills use the colour only as a 3px left border.

**Evidence:** apps/frontend/src/lib/recipe-helpers.ts:21-32 SUPPLIER_COLORS and `return SUPPLIER_COLORS[s] || "#999"`; RecipeDetail.tsx:426 `w-2 h-2 rounded-full`; GroceryListPage.tsx:457 `w-2 h-2`; Ingredients.tsx:145 `style={{ color: supplierColor(...), background: supplierColor(...) + "12" }}`; Ingredients.tsx:118 `borderLeftColor`

**Recommendation:** Store `color` on the supplier in AppSettings.suppliers (optional on read, fallback to a hash into a fixed 8-colour accessible set). Render supplier as a tag with dark text on the tinted background, never coloured text. Drop the 8px dots from the recipe ingredient list; keep them only in grocery headers at 12px next to the supplier name.

## [medium] Density and spacing

Spacing is tight throughout: cards padded 16 to 20px, table rows 8 to 10px vertical padding, step list 8px gaps, section gaps 20px, and line height is the Tailwind default everywhere except five `leading-relaxed` uses. Content width is 1100px on recipe, event and list pages, which spreads a recipe across a laptop screen instead of a readable column. Notion uses 16px/1.5 body, 700px column, 24 to 48px between blocks.

**Evidence:** Only 5 `leading-` classes in all admin pages (RecipeDetail.tsx:291, :292, :328; RecipeCook.tsx:105; EventDetail.tsx:253); RecipeDetail.tsx:261 `max-w-[1100px]`, :314 `grid gap-5`, :315 `card-elevated p-4 sm:p-5`, :326 `space-y-2`; Dashboard.tsx:243-256 `py-2.5` rows; apps/frontend/src/index.css:50 `.card-elevated` has no padding token

**Recommendation:** Adopt a spacing scale (8/16/24/40/64) and apply: reading column max-w-[720px] on RecipeDetail, RecipeCook, EventDetail; list rows min-h-11 with py-3; blocks separated by 40px with no card border (Notion style: headings and whitespace, not boxes); `leading-relaxed` on body by default. Keep cards only for KPI tiles.

## [medium] Home page and screen competition

The home page is a finance dashboard with a tax toggle, four KPI tiles, a legend, a year select, an SVG chart with 10px axis labels, a paragraph of Belgian tax parameters at 12px, an eight-column paginated table and a grocery grid. Nothing on it tells the caterer what to cook this week. The week view exists only as a read-only modal with 14px/12px text and one action, a PDF download.

**Evidence:** apps/frontend/src/pages/admin/Dashboard.tsx:137-150 header with toggle; :152-157 KPI grid; :179-216 tax explanation `text-xs`; :396 and :412 `fontSize={10}` SVG; :228-259 table; Events.tsx:484-545 WeekPlannerModal `text-sm` / `text-xs`, :541 'Télécharger PDF agrégé'

**Recommendation:** Make the home page 'Cette semaine': seven day blocks at text-lg headings, each event as a row (name, convives, prestation type tag), tap to open the day's prep lines. Move finance to a 'Comptes' section. If the chart stays, axis labels at 12px minimum and the tax explanation behind an info popover.

## [medium] Form inputs

`.input-field` is text-sm (14px) on a muted translucent background with a 1px border; labels are 12px uppercase. Inputs below 16px trigger automatic zoom on iOS Safari, which is disorienting on a phone. Inline numeric inputs in tables are forced to text-xs with `!py-1 !text-xs`.

**Evidence:** apps/frontend/src/index.css:48-50 `.input-field { @apply w-full px-3 py-2 border rounded-lg text-sm bg-muted/30 ... }`; EventEditor.tsx:270 and RecipeEditor.tsx:284-286 `input-field !py-1 !text-xs`; GroceryListPage.tsx:500 and :506 `text-xs tabular-nums` NumericInput

**Recommendation:** Set `.input-field` to text-base py-2.5 with bg-card and a 1.5px border on focus; never override below text-sm. For table cells use a compact variant at text-sm, not text-xs. Labels per the sentence-case finding.

## [low] Recipe cards (list page)

Recipe cards show the category as an 11px uppercase pill, the description at 12px clamped to two lines, and a 12px meta row (ingredient count, cost, price). Cards without a photo show only a 6px gradient strip, so the grid is visually uneven, and there is no icon, emoji or colour per category to anchor scanning, which is one of the things the caterer likes about Notion.

**Evidence:** apps/frontend/src/pages/admin/Recipes.tsx:163 `h-1.5 bg-gradient-to-r` placeholder; :166 `text-[11px] font-semibold uppercase tracking-wider`; :168 `text-xs text-muted-foreground line-clamp-2`; :169 `text-xs text-muted-foreground font-medium`

**Recommendation:** Card body: category as a coloured tag with an icon (store icon/colour per category in settings.recipeCategories, optional on read), name text-lg Playfair, description text-sm, meta text-sm. For photo-less recipes show a 160px tinted block with the category icon. On phones use full-width rows with a 64px thumbnail instead of a 1-column card grid.

## [medium] Grocery list detail

The grocery detail, used on a phone in a shop, renders an eight-column desktop table at text-xs with 10px units and prices, 20px checkboxes, drag handles at 40% opacity (1.68:1), and a toolbar of four unlabelled 28px icon buttons. The mobile card version is better but still 14px names, 11px secondary text and 20px checkboxes.

**Evidence:** apps/frontend/src/pages/admin/GroceryListPage.tsx:463-521 desktop table (`text-xs`, `text-[10px]`, `text-muted-foreground/40 cursor-grab`); :384-399 icon buttons `p-1.5 ... h-3.5 w-3.5`; :524-558 mobile cards `text-sm`, `text-[11px]`, `w-5 h-5` checkbox

**Recommendation:** Use the card layout at every breakpoint: 48px rows, full-row tap toggles checked, name at text-base, 'à acheter' qty bold at text-base, stock input revealed by a tap. Put PDF/CSV/Copier behind a labelled ActionMenu. Group headers at text-base with the supplier tag.

## [low] Typeface usage

Playfair Display, a high-contrast display serif, is applied to every heading level by the global rule and is also used at 14px (section headings in EventDetail and RecipeEditor), where its thin strokes blur on screens. Meanwhile the biggest text in the app, recipe and event titles, renders in DM Sans because they are divs.

**Evidence:** apps/frontend/src/index.css:46 `h1, h2, h3, h4, h5, h6 { @apply font-serif; }`; EventDetail.tsx:249 `font-serif text-sm font-bold uppercase`; RecipeEditor.tsx:298 and :307 `font-serif text-sm font-bold`; 20 section h2s at `font-serif text-lg` (grep count); RecipeDetail.tsx:285 title without font-serif

**Recommendation:** Use Playfair only at 24px and above (page titles, recipe names, cook-mode title). Section headings in DM Sans 18 to 20px semibold. Remove the global h1-h6 serif rule and apply font-serif explicitly where wanted.

## [low] PDF output

The recipe PDF, the per-event recipes PDF and the aggregated week PDF set body text at 8 to 9pt with autoTable at fontSize 8. This is the '30-page PDF' the caterer wants to replace; if any PDF survives it is currently unreadable in a kitchen.

**Evidence:** apps/frontend/src/pages/admin/Events.tsx:186-190 `setFontSize(9)`, `setFontSize(8)`, :228 `styles: { fontSize: 8, cellPadding: 2 }`, :261 `setFontSize(8)`; EventDetail.tsx:135 `fontSize: 8`, :162 `setFontSize(8)`; RecipeDetail.tsx:49 and :85 `setFontSize(9)`

**Recommendation:** Replace the aggregated PDF with on-screen prep sheets. For the single-recipe PDF that may remain, 11pt body, 13pt ingredient lines, 16pt headings, one recipe per page.

## [low] Layout bug: grocery full-bleed

GroceryListPage cancels the layout padding with -m-6 and sizes itself to 100vh minus 4rem, but AdminLayout pads 32px on desktop (p-8) and 16px plus a 68px top offset on mobile. Desktop gets an 8px uneven gutter; on mobile the panel is about 20px taller than the viewport and produces a second scrollbar.

**Evidence:** apps/frontend/src/pages/admin/GroceryListPage.tsx:576 `h-[calc(100vh-4rem)] flex flex-col -m-6`; apps/frontend/src/components/admin/AdminLayout.tsx:15 `px-4 py-4 pt-[68px] md:p-8 md:pt-8`

**Recommendation:** Give AdminLayout a `fullBleed` outlet context or a route-level class so the page can opt out of padding, and size with `h-[calc(100dvh-52px)] md:h-[100dvh]`.

## [low] Invalid utility class

`h-22` is not a Tailwind 3.4 class, so recipe photo thumbnails on phones have no fixed height; object-cover has no effect and thumbnails of different aspect ratios have different heights next to each other.

**Evidence:** apps/frontend/src/pages/admin/RecipeDetail.tsx:306 `className="w-28 h-22 sm:w-36 sm:h-28 object-cover rounded-lg border"`; apps/frontend/package.json `"tailwindcss": "^3.4.17"`

**Recommendation:** Use h-20 or h-24 on mobile. On the redesigned recipe page, show the first photo full-width (aspect-[3/2]) above the title instead of 112px thumbnails.

## [low] Status pills and feedback

Event status is a clickable pill whose only hint is a title attribute; the same pill in the Events list toggles status on click while in Dashboard it does not, which makes the same visual element behave differently. Pill text is 11 to 12px.

**Evidence:** apps/frontend/src/pages/admin/Events.tsx:395-401 `onClick={(e) => toggleStatus(ev, e)} title="Cliquer pour changer le statut"` at `text-xs`; Dashboard.tsx:252 same pill, not clickable, `text-[11px]`; EventDetail.tsx:487-492 toggle

**Recommendation:** Single `StatusTag` component at text-sm, non-interactive in lists; change status from the event detail with a labelled select or a 'Marquer terminé' button.

# Audit: datamodel

The data model is five single-partition-key DynamoDB tables (ingredients, recipes, settings, events, grocery-lists), read everywhere with scanAll and written through a thin DdbService that has no query, transaction, or UnprocessedItems handling. It cannot express anything the brief asks for: event recipe lines are bare {recipeId, portions} with no identity, order, course, notes or prep status; there is no client, template, prestation type, VAT, hours, ledger line, fixed charge or objective anywhere. The ingredient deduplicate path is confirmed to orphan references: it deletes by nameLower without touching recipes.ingredients[].ingredientId or groceryList.items[].ingredientId, and every reader then silently skips the line (cost drops, grocery list omits, PDFs print the UUID). All costs and margins are recomputed client-side from live ingredient prices on every page, so historical event margins drift whenever a price or a recipe changes, which breaks the accounting constraint that records never change; the fix is a server-side cost snapshot at completion, not a server-side read aggregate (scale is hundreds of rows, scanAll plus client filtering is fine for the journal, week view and income statement). Zod DTOs run in strip mode and the event update DTO is a whole-array replacement, so new per-line fields are silently dropped until the DTO changes and the 800 ms autosave in EventEditor will overwrite line-level edits made from the phone. The 30 s API cache invalidates only the entity being written, so a server-side merge or an event-to-ledger write leaves recipes or ledger views stale for up to 30 s. Adding optional fields is backward compatible on read with no migration (the code already defaults missing suppliers and nameLower); three new tables (clients, event-templates, ledger) are justified, while courses, prestation types, effective-dated fixed charges and per-year objectives fit inside the single settings item. Each new table costs the four-step manual provisioning documented in the README because the CDK data stack is out of date.

## [high] Ingredient merge / referential integrity

IngredientsService.deduplicate groups by exact nameLower, keeps the most recently updated row and batch-deletes the rest without remapping any reference. Plain DELETE /admin/ingredients/:id has the same gap. Every reader then hides the orphan: calcRecipeCost skips it so recipe and event costs silently drop, RecipeDetail returns null for the row, RecipeCook shows a dash, the event grocery generator drops the ingredient, and both event PDFs print the raw UUID. Complete list of ingredientId references: (1) recipes table recipe.ingredients[].ingredientId; (2) grocery-lists table items[].ingredientId (plus denormalised name/price so saved lists still render but no longer resolve, and re-adding the survivor creates a second line); (3) localStorage key recipe-book:grocery-list-pending holding items[].ingredientId and a full allIngredients snapshot that GroceryListPage never reads; (4) in-memory lookups in recipe-helpers, EventDetail, Events, GroceryListPage, RecipeDetail, RecipeCook, RecipeEditor; (5) backend RecipesService.importRecipes maps names to ids at import time only. Events reference recipeId only; settings hold no ingredient ids. The survivor rule (newest updatedAt) also ignores which row the recipes reference, and the exact-name match cannot group Oeuf / Oeufs / Œuf / oeuf (pièce).

**Evidence:** apps/backend/src/ingredients/ingredients.service.ts:60-79 (groups by nameLower, sorts by updatedAt line 72, batchDelete line 76, no recipe or list scan); :52-54 delete has no guard. Readers: apps/frontend/src/lib/recipe-helpers.ts:11-12 `if (!ing) return total`; apps/frontend/src/pages/admin/RecipeDetail.tsx:416 `if (!ing) return null` and :63 `return ["-", "-"]`; RecipeCook.tsx:92 `ing?.name || "—"`; Events.tsx:101 `if (!ing) return;`, :225 and EventDetail.tsx:132 `ing?.name || ri.ingredientId`. localStorage payload: Events.tsx:127-131 writes {title, items, allIngredients}; GroceryListPage.tsx:21,107-109 reads only title and items. Schemas: packages/types/src/dto/recipes.ts:5, dto/grocery-lists.ts:4.

**Recommendation:** Replace deduplicate with a server-side merge that remaps before it deletes, so a retry is idempotent: `POST /admin/ingredients/merge` with `z.object({ survivorId: z.string().min(1), mergedIds: z.array(z.string().min(1)).min(1) }).strict()`. Service: load survivor and merged rows; scanAll recipes, for each line whose ingredientId is in mergedIds set it to survivorId (refuse or convert via PRICE_TO_QTY_UNIT if the survivor's unit family differs), collapse duplicate lines by summing qty, ddb.update the recipe; scanAll grocery lists, rewrite items[].ingredientId the same way; only then batchDelete mergedIds. Return {recipesUpdated, listsUpdated, removed}. Add `mergedFrom?: string[]` on Ingredient for audit (optional, read-compatible). Candidate detection is a separate GET that normalises names (NFD strip accents, lowercase, trim, drop trailing s, drop parenthesised qualifiers) and groups by Levenshtein ≤ 2, returned to the UI for the user to pick the survivor; never auto-delete. Also make DELETE /admin/ingredients/:id return 409 with the referencing recipe names when references exist.

## [high] Event recipe lines: identity, order, course, prep state

EventRecipeLine is {recipeId, portions}. Order is implicit array order and nothing persists or edits it; EventDetail keys rows and updates portions by recipeId, EventEditor removes by index and refuses duplicate recipeIds, so a line has no stable identity. There is no course dimension anywhere: recipe.type and settings.recipeCategories are service formats (Buffet, Walking dinner, Lunch, Menu semaine). No per-line notes, prep status or prep date exist, so the day view and clickable prep sheets have nothing to persist.

**Evidence:** packages/types/src/entities/event.ts:1-4; packages/types/src/dto/events.ts:3-6; apps/frontend/src/pages/admin/EventDetail.tsx:276 `key={rl.recipeId}`, :178 updateRecipePortions by recipeId; EventEditor.tsx:136 `if (recipes.some((r) => r.recipeId === recipeId)) return;`, :141 and :147 index-based; packages/types/src/entities/settings.ts DEFAULT_RECIPE_CATEGORIES.

**Recommendation:** Add optional fields, all backward compatible on read (renderers sort by settings.courses index then `order ?? arrayIndex`):
```ts
export interface EventRecipeLine {
  lineId?: string;          // server fills randomUUID() when absent
  recipeId: string;
  portions: number;
  course?: string;          // value from settings.courses, fallback recipe.defaultCourse
  order?: number;           // sort key inside the course
  notes?: string;           // per-line prep note
  prepStatus?: "todo" | "doing" | "done";
  prepDate?: string;        // YYYY-MM-DD when cooked before event.date
}
// Recipe
defaultCourse?: string;
// AppSettings
courses?: string[];         // default ["Apéritif","Entrée","Plat","Dessert","Autre"]
```
No migration needed: fill lineId lazily in EventsService.create/update (`recipes.map(l => ({ ...l, lineId: l.lineId ?? randomUUID() }))`). Allow duplicate recipeIds once lineId exists (same recipe, two courses).

## [high] Zod DTOs: strip mode and whole-array updates

z.object strips unknown keys by default (zod 3.25.76 installed), so any new line field the client sends is silently dropped until eventRecipeLineSchema is changed; there is no .strict() anywhere so typos vanish too. updateEventRequestSchema is createEventRequestSchema.partial(): recipes is always a whole-array replacement. EventEditor rebuilds the entire payload from its own state and PATCHes it 800 ms after any keystroke, and EventDetail PATCHes whole arrays as well, so a prepStatus toggled on the phone or a reorder done elsewhere is overwritten by the next autosave from a laptop still holding the old array. date is z.string().min(1) with no format, although week, day and ledger grouping will all parse it as YYYY-MM-DD.

**Evidence:** packages/types/src/dto/events.ts:3-6 (line schema), :15 `date: z.string().min(1)`, :29 `.partial()`; apps/frontend/src/pages/admin/EventEditor.tsx:66-70 buildPayload sends every field, :98 `setTimeout(() => { autoSave(); }, 800)`; EventDetail.tsx:31-38 saveField, :178-181 sends full recipes array; node_modules/zod/package.json version 3.25.76.

**Recommendation:** ```ts
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const eventRecipeLineSchema = z.object({
  lineId: z.string().min(1).optional(),
  recipeId: z.string().min(1),
  portions: z.number().int().positive(),
  course: z.string().trim().optional(),
  order: z.number().int().nonnegative().optional(),
  notes: z.string().trim().max(500).optional(),
  prepStatus: z.enum(["todo","doing","done"]).optional(),
  prepDate: isoDate.optional(),
}).strict();
export const updateEventLineSchema = eventRecipeLineSchema.omit({ lineId: true, recipeId: true }).partial().strict();
export const reorderEventLinesSchema = z.object({ lineIds: z.array(z.string().min(1)).min(1) }).strict();
```
Add `PATCH /admin/events/:id/lines/:lineId` and `PUT /admin/events/:id/lines/order` so prep status and ordering never go through the whole-array path. Make EventEditor send only fields that changed since load, and add an optional `expectedUpdatedAt` to update DTOs that DdbService.update turns into `AND updatedAt = :expected` (409 on mismatch). Use `.strict()` on every new DTO.

## [medium] Clients and templates / recurrence

There is no client entity; contact fields are copied into each event and Dupliquer copies them again with today's date. The workbook's Au réel sheet is full of recurring business clients (weekly lunch, monthly facture comptoir), which is the Hoona pattern. Storing a template as an event with a flag is unsafe because Dashboard monthlyData sums every event of the year regardless of status, so a template would leak into revenue unless every reader is patched.

**Evidence:** packages/types/src/entities/event.ts contactName/contactPhone/contactEmail; apps/frontend/src/pages/admin/EventDetail.tsx:77-95 handleDuplicate, :81 `date: new Date().toISOString().split("T")[0]`; Dashboard.tsx:103-116 monthlyData filters on year only (status filter only at :126 for KPIs); infrastructure/lib/data-stack.ts defines only the five existing tables; docs/redesign/01-livre-des-comptes-excel.md Au réel section.

**Recommendation:** Two new tables, each with a single string PK, read with scanAll like the others:
```ts
export interface Client { clientId: string; name: string; nameLower: string; kind?: "company" | "private"; contactName?: string; phone?: string; email?: string; address?: string; vatNumber?: string; defaultPrestationType?: string; defaultVatRate?: 6 | 12 | 21; notes?: string; active: boolean; createdAt: string; updatedAt: string }
export interface EventTemplate { templateId: string; name: string; clientId?: string; prestationType?: string; guestCount: number; recipes: EventRecipeLine[]; extraCosts: EventExtraCost[]; sellingPricePerGuest: number; notes?: string; defaultWeekday?: 0|1|2|3|4|5|6; createdAt: string; updatedAt: string }
// AppEvent additions (optional, read-compatible)
clientId?: string; templateId?: string;
```
`POST /admin/events/from-template/:templateId { date, guestCount? }` creates one event; the week view calls it once per day for "Semaine Hoona". Readers show `client?.name ?? contactName`, so old events need no migration; an optional dry-run script can group events by contactEmail || contactName to seed clients and backfill clientId.

## [medium] Prestation type, VAT and hours on events

The workbook keys the revenue mix, the per-type objectives and the SUMIF totals on seven prestation types (menu à emporter, buffet à emporter, buffet avec service, atelier, brunch, walking/cocktail, chef à domicile). The app has no field for it; recipe.type is a service format on the recipe, not on the event. VAT rate per event (6/12/21) and hours (Au réel "temps passé", objectives "temps disponible") are also absent, and KM (journal column N) too.

**Evidence:** packages/types/src/entities/event.ts (no prestationType/vatRate/hours/km); packages/types/src/entities/settings.ts recipeCategories; apps/frontend/src/pages/admin/Recipes.tsx:85 unions categories and recipe.type; workbook sheet Apercu par mois rows 17-23 and Janvier row 5 per-type breakdown (read via xlsx).

**Recommendation:** ```ts
// AppSettings
prestationTypes?: string[]; // default the seven workbook values
// AppEvent
prestationType?: string; vatRate?: 6 | 12 | 21; hoursPlanned?: number; hoursSpent?: number; km?: number;
```
All optional on read; the revenue-mix report buckets events without a type under "Non classé" and the completion flow prompts for it. Keep recipeCategories untouched (recipes.type depends on it) and add courses separately.

## [high] Cost snapshot / historical integrity

Event cost and margin are recomputed on every render from the current ingredient price list and the current recipe definition. Editing an ingredient price, a recipe's portions or its ingredient list changes the margin of every past event, and the Dashboard chart and KPIs move with it. The only frozen value is the manual optional actualCost. The workbook treats Coûts MP per month as a fact. The costing maths lives only in the frontend, so the backend cannot compute a snapshot today; packages/utils is dead code from another project, not a home for it.

**Evidence:** apps/frontend/src/pages/admin/Dashboard.tsx:35-39 recipeCostMap from live ingredients, :47-61 eventRows; EventDetail.tsx:41-58 same pattern; apps/frontend/src/lib/recipe-helpers.ts:3-16 uses ing.price now; packages/types/src/entities/event.ts actualCost?: number | null; packages/utils/src/index.ts header "DEPRECATED", packages/utils/src/constants.ts "material extractor project".

**Recommendation:** Move calcIngredientLineCost/calcRecipeCost into packages/types (already shared by both apps) and snapshot on completion, server-side:
```ts
// AppEvent
costSnapshot?: {
  recipeCost: number;   // Σ (recipeCost / recipe.portions) × line.portions at takenAt
  extraCost: number;
  lines: { lineId: string; recipeId: string; portions: number; unitCost: number }[];
  takenAt: string;      // ISO
};
```
EventsService.update: when status transitions to completed and costSnapshot is absent, load recipes and ingredients (inject RecipesService and IngredientsService into EventsModule) and write the snapshot in the same update. Readers use `actualCost ?? costSnapshot?.recipeCost ?? liveCalc`, so old events keep working. One-off script snapshots existing completed events at today's prices and logs that it is an approximation.

## [high] Ledger (journal des recettes) and payments

The app has no record of invoiced revenue: Dashboard revenue is sellingPricePerGuest × guestCount and monthly totals include upcoming events, so it is a forecast, not the journal. The workbook journal has 14 columns per line (number, date, label, TVAC, HTVA, VAT 6/12/21, paid, method, date received, type, description, KM), deposits ahead of the event, and lines that are not events (comptoir, Thermomix commissions, vouchers). The income statement also needs purchase-side facts (extra staff with hours × rate, raw material purchases). None of this fits inside the event.

**Evidence:** apps/frontend/src/pages/admin/Dashboard.tsx:58 `revenue = ev.sellingPricePerGuest * ev.guestCount`, :103-116 no status filter; packages/types/src/entities/event.ts has no invoice/paid/VAT fields; workbook sheets recettes 2025 row 5 and Janvier row 0 (columns A-N), factures sheet hours × taux horaire, personnel sheet (read via xlsx).

**Recommendation:** New table ta-ledger-{stage}, PK entryId, append-only records:
```ts
type VatRate = 0 | 6 | 12 | 21;
export interface LedgerEntry {
  entryId: string;
  book: "sales" | "purchases";
  date: string;        // YYYY-MM-DD
  yearMonth: string;   // "2026-01", denormalised for grouping and a future GSI
  number?: string;     // Falco invoice number
  label: string;
  kind: "event" | "comptoir" | "commission" | "voucher" | "other" | "mp" | "staff" | "fixed";
  eventId?: string; clientId?: string; prestationType?: string;
  totalTvac: number; htva: number;
  vat: { rate: VatRate; amount: number }[];
  payments: { amount: number; paidAt: string; method?: string; kind: "deposit" | "balance" }[];
  description?: string; km?: number;
  hours?: number; hourlyRate?: number; personName?: string;  // staff lines
  locked?: boolean;    // set once exported to the accountant
  createdAt: string; updatedAt: string;
}
```
`paid` is derived (Σ payments ≥ totalTvac − 0.01); deposits are payments with kind deposit on an entry whose number may still be empty. Zod: `.refine(e => Math.abs(e.htva + e.vat.reduce((s,v)=>s+v.amount,0) − e.totalTvac) < 0.011)`, amounts `.multipleOf(0.01)` or store cents, date regex, `.strict()`. `POST /admin/ledger/from-event/:eventId` prefills (htva from revenue, vat from event.vatRate, label, prestationType, clientId) and stores `event.ledgerEntryId?` back; it is explicit, not automatic, because the Falco number is typed by hand. Updates refuse when locked. scanAll + filter by yearMonth is enough at ≤ ~1 000 lines/year; no GSI yet. Export: client-side xlsx (already a dependency) writing the 14 workbook columns per month sheet from ledger lines only.

## [medium] Fixed charges, objectives, breakeven storage

Nothing stores the ~30 fixed charge lines, the sans-salarié scenario, the per-year objective (annual, ÷10 months, per prestation with event counts, hours available, treasury months, investments) or the corporate tax rate. If charges are stored as a flat current list, editing one rewrites every past month's income statement. SettingsService.update replaces the whole item with put, so settings is viable for small config but has last-write-wins across tabs.

**Evidence:** apps/backend/src/settings/settings.service.ts:29-39 (get, spread, put at :37); packages/types/src/entities/settings.ts; workbook Prévisionnel financier rows 5-13 (charge list, "sans salarié" column, "Impôt sur les sociétés (estimé entre 15% et 25%)"), Apercu par mois rows 1-3 (seuil, objectif, "objectif sur 10 mois") (read via xlsx).

**Recommendation:** Keep in the settings item (tiny, single reader, 120 s cache is fine) but effective-dated so history is stable:
```ts
// AppSettings
fixedCharges?: { chargeId: string; label: string; monthlyAmount: number; from: string /* YYYY-MM */; to?: string; scenario: "both" | "with-staff" | "solo"; category?: string }[];
objectives?: Record<string /* year */, {
  annualRevenue: number; monthsActive: number;
  byPrestation: { type: string; amount: number; eventsNeeded?: number; guestsPerEvent?: number }[];
  hoursAvailablePerMonth?: number; treasuryMonths: number;
  investments: { label: string; amount: number }[];
  corporateTaxRate: number;  // 0.20 default
}>;
```
Changing an amount closes the old row (to) and adds a new one. Read-compatible (undefined → empty). Extend updateSettingsRequestSchema and SettingsService.update's Pick accordingly. Only move to a table if the item approaches 400 KB, which is not plausible here.

## [medium] Tax model (SRL vs sole trader)

estimateBelgianTax applies 20.5 % social contributions, a personal allowance and IPP brackets to event margin. The business is an SRL; the workbook puts the owner's salary and UCM in fixed charges and applies corporate tax of 15 to 25 % on profit before tax. The net-margin toggle therefore reports the wrong number for this business.

**Evidence:** apps/frontend/src/pages/admin/Dashboard.tsx:308-326 estimateBelgianTax; :63-75 taxRateByYear spreads it per event; workbook Prévisionnel financier row 4 "Structure juridique SARL" and row 8 corporate tax line (read via xlsx).

**Recommendation:** Delete estimateBelgianTax. Income statement per month = Σ ledger sales htva − (Σ event.costSnapshot.recipeCost for completed events that month, or Σ purchases kind mp when entered) − Σ fixedCharges active in that month − Σ purchases kind staff → résultat avant impôts × objectives[year].corporateTaxRate. Keep the override input as the rate. No schema beyond the settings fields above.

## [medium] Client-side aggregation and server-side needs

Every page fetches the full recipes and ingredients lists and rebuilds a cost map; calcRecipeCost does ingredients.find per line (O(lines × ingredients)). At the current scale (hundreds of recipes and ingredients, a few hundred events, ≤ ~1 000 ledger lines a year) no planning or accounting view needs a server-side read aggregate; scanAll plus client filtering by week, day or yearMonth is adequate, and week revenue can be summed from events in the existing WeekPlannerModal which today shows only a recipe count. What must move server-side are write-time computations: the cost snapshot, the ingredient merge, template instantiation and ledger prefill. Dashboard also sorts the React state array in place.

**Evidence:** apps/frontend/src/pages/admin/Dashboard.tsx:29 Promise.all of three lists, :48-49 `events.sort(...)` mutates state; EventDetail.tsx:25; EventEditor.tsx:44; Events.tsx:84 and :147; Recipes.tsx:77; recipe-helpers.ts:11 `ingredients.find`; Events.tsx:452-520 WeekPlannerModal, :517 shows `ev.recipes.length` only.

**Recommendation:** Build an ingredientById Map once per page (Events.tsx:88 already does) and pass it to calcRecipeCost; share the costing module from packages/types so the backend snapshot and the frontend views agree. Add the four server-side write paths listed above; do not add a reporting endpoint until a view is measurably slow. Replace `events.sort` with `[...events].sort`.

## [medium] DynamoDB wrapper: batch, transaction, condition support

batchWrite and batchDelete ignore UnprocessedItems, so a throttled chunk is lost silently; this matters for merges and migration scripts. No TransactWriteCommand exists, so a merge touching 30 recipes, 5 lists and 3 deletions is 38 independent writes with no atomicity. QueryCommand is imported but there is no query method. update() supports only the attribute_exists(pk) condition and derives the guard from the first key attribute. ConditionalCheckFailedException is not mapped, so a conditional failure surfaces as HTTP 500. removeUndefinedValues: true means undefined optional fields are dropped on put, which is the right behaviour for optional-field additions.

**Evidence:** apps/backend/src/shared/ddb.service.ts:87-101 (no UnprocessedItems loop), :9 QueryCommand import unused, :41-69 update, :64 ConditionExpression, :27 removeUndefinedValues; grep for TransactWrite|UnprocessedItems in apps/backend/src returns nothing.

**Recommendation:** (a) Loop on response.UnprocessedItems with exponential backoff in both batch methods. (b) Add `transactWrite(ops)` for ≤ 100 operations and use it for small merges; for larger merges keep the remap-then-delete ordering so retries are safe. (c) Extend update() with an optional `{ expectedUpdatedAt?: string }` that appends `AND #updatedAt = :expected`. (d) Add a Nest exception filter mapping ConditionalCheckFailedException to 409. (e) Either add a `query(table, keyCondition)` or delete the unused import; single-PK tables plus scanAll remain the convention for new tables.

## [medium] Migration strategy: optional fields vs new tables

The codebase already handles missing attributes on read (settings.suppliers default, nameLower fallback), so optional-field additions need no migration. Derived or denormalised fields (lineId, yearMonth, costSnapshot for already-completed events, clientId backfill) need a one-off script, and none exists. New tables are expensive operationally: the README documents a four-step manual process (console, SSM parameter, config.service.ts, ec2-bootstrap.sh, then edit .env and pm2 restart) and states the CDK data stack is out of date; config.service.ts requires every table env var with min(1), so the API will refuse to boot on the existing EC2 until the new SSM parameter and .env line exist.

**Evidence:** apps/backend/src/settings/settings.service.ts:18 `if (!settings.suppliers) settings.suppliers = DEFAULT_SUPPLIERS`; apps/backend/src/ingredients/ingredients.service.ts:63 `ing.nameLower || ing.name.toLowerCase()`; README.md section "Adding a new DynamoDB table" and note "the CDK stacks are partially out of date"; infrastructure/lib/data-stack.ts (five tables); apps/backend/src/config/config.service.ts:7-11 `z.string().min(1)` per table; `find . -iname "*migrat*"` returns nothing.

**Recommendation:** Rules: optional field → no migration, readers default. Derived field → idempotent ts-node script under apps/backend/scripts/ that boots ConfigService + DdbService, supports --dry-run, scanAll then per-item ddb.update (not put, to avoid clobbering concurrent edits), logs counts, safe to re-run. New table → declare the env var `.optional()` in config.service.ts for the rollout release and throw at first use instead, update data-stack.ts so CDK matches reality, add the SSM parameter and bootstrap line. Limit new tables to three: ta-clients, ta-event-templates, ta-ledger. Reject "template as event with a flag" and "ledger inside settings" (a ledger grows past the single-item comfort zone and must be append-only).

## [medium] API cache invalidation across entities

cached() keys are static strings (ingredients, recipes, events, settings) with 30 s TTL (120 s for settings) and each write invalidates only its own key. After a server-side merge that rewrites recipes, Events.generateGroceryList would read fresh ingredients but 30 s-old recipes holding merged ids, so ingMap.get misses and those ingredients are silently dropped from the list; the aggregated PDF prints UUIDs. Any event write that also creates a ledger line, or a template instantiation that creates an event, has the same cross-key staleness. groceryLists is the only uncached list.

**Evidence:** apps/frontend/src/lib/api.ts:46-47 TTLs, :52-69 cached(), :71-73 invalidate(), :89 and :91 ingredient delete/deduplicate invalidate ["ingredients"] only, :110 events.update invalidates ["events"] only, :114 groceryLists.list uncached; Events.tsx:84-88 and :100-101.

**Recommendation:** Declare invalidation sets per write path: ingredients.merge → ["ingredients","recipes"]; ingredients.delete → ["ingredients","recipes"]; events.update/complete and ledger.fromEvent → ["events","ledger"]; templates.instantiate → ["events","templates"]; clients.update → ["clients"] (do not denormalise client name into events). Keep ledger uncached like groceryLists since its page is write-heavy. Consider dropping SETTINGS_TTL to 30 s once courses and prestation types live there, because a course added on the laptop is invisible on the phone for two minutes.

## [medium] Validation gaps for money, dates and references

All amounts are plain z.number() floats, dates are free strings, no schema is strict, and no DTO checks that a recipeId or ingredientId exists. A bogus recipeId renders as a dash; a bogus ingredientId is skipped. For a journal, floating sums and unvalidated VAT splits will produce cent-level mismatches against Falco, and an unparseable date breaks month grouping silently.

**Evidence:** packages/types/src/dto/events.ts:4 recipeId z.string().min(1), :9 amount, :15 date, :18 sellingPricePerGuest; dto/recipes.ts:5; dto/grocery-lists.ts:4; apps/frontend/src/pages/admin/EventDetail.tsx:279 `rec?.name || "—"`; apps/backend/src/ingredients/ingredients.service.ts:52-54 and recipes.service.ts delete without reference checks.

**Recommendation:** Ledger and objective amounts: `.multipleOf(0.01)` (or integer cents) and server-side rounding; VAT identity refine as in the ledger finding; `date` regex on events and ledger; `.strict()` on every new DTO. EventsService.create/update: one scanAll of recipes to reject unknown recipeIds with 400. IngredientsService.delete and RecipesService.delete: scan references and return 409 listing the dependants (cheap at this scale).

## [low] Per-day prep sheets and week revenue (derived views)

The week planner is locked to the current week, shows only a recipe count per event, and its single action is the aggregated PDF, which merges the same recipe across events by recipeId and loses per-event attribution. Day and week views are pure projections of events once lines carry course, order, prepStatus and prepDate; no new entity is required. The only write path needed is line-level status from the phone, which must not go through the whole-array PATCH.

**Evidence:** apps/frontend/src/pages/admin/Events.tsx:452-520 WeekPlannerModal (`const ref = new Date()` at :455, :517 shows recipes.length), :140-253 generateAggregatedPdf keyed by recipeId (aggregatedScale map); EventDetail.tsx:178-181 whole-array PATCH.

**Recommendation:** Day view: for date D, collect lines from events where `(line.prepDate ?? event.date) === D`, sort by settings.courses index then `order ?? index`, display event/client name, recipe, portions, prepStatus; week view groups by day and sums `sellingPricePerGuest × guestCount` per day and per week (signed revenue; invoiced revenue comes from the ledger). Writes use `PATCH /admin/events/:id/lines/:lineId { prepStatus }` and invalidate ["events"].

## [low] Dead constants and foreign shared package

packages/types/src/constants/constants.ts exports TABLE_NAMES with four names (no groceryLists) and nothing imports it except the index. packages/utils is a copy of another project's code (material extractor, organisations, Prisma types) marked DEPRECATED. The brief suggests packages/utils as a possible home for shared maths; it is not.

**Evidence:** packages/types/src/constants/constants.ts; grep TABLE_NAMES in apps and packages/types/src hits only index.ts and constants.ts; packages/utils/src/index.ts header "DEPRECATED"; packages/utils/src/constants.ts "Central constants for the material extractor project".

**Recommendation:** Delete packages/utils and the TABLE_NAMES export (or make it mirror ConfigService.tables). Put the shared costing module and the ledger/report maths in packages/types (already built with pnpm build:types and consumed by both apps).

# Audit: journey

The app covers two of Dalia's eight weekly jobs well (taking an order into an event, generating a supplier-grouped grocery list) and the rest only partly or not at all. The home screen is a finance dashboard (Dashboard.tsx), so "what do I cook this week" is two clicks away in a modal that shows only the current week, is not navigable or clickable, and whose single action is a PDF. That PDF (generateAggregatedPdf, Events.tsx:140) merges every recipe across the selected events into one alphabetical list with "(total sélection)" portions, so it answers "how much of X this week" but not "30 amuse-bouches pour Hoona mardi", which is the exact sentence in the brief; it also draws paper checkboxes, confirming the printed-sheet workflow. Prep has no per-day sheet and no per-line done state; cook mode is reachable only via the recipe page and starts at the recipe's base portions, so cooking an event line costs four clicks plus one tap per portion. The close and month-end jobs live entirely in the Excel workbook and Falco: an event has one status ("upcoming"/"completed") that conflates served, invoiced and paid, and no invoice number, VAT, paid flag, hours, extra staff or KM. The Dashboard reports calculated revenue (price × guests) on completed events and models a sole trader's tax, while the business is an SRL and the workbook tracks invoiced HTVA, objectives, fixed charges and corporate tax. Recurring clients ("Hoona") have no client entity or template; the weekly ritual is Dupliquer, which sets today's date and appends "(copie)", then edit name, date and portions. Against Enobase, the app's defensible advantage is its costing maths and the fact that its event data already contains everything a week view and a prep sheet need; it should ship planning, prep and the ledger now, add a thin client entity and extra-staff shifts next, and leave quote and invoice issuing to Falco.

## [high] Job: plan the week (home screen)

The home screen is a finance dashboard. The first thing Dalia sees is KPIs on completed events, a yearly bar chart, a sole-trader tax toggle and a paginated table of all events sorted ascending from the oldest. Nothing on it answers 'what do I cook this week and for whom'. The week view is reached by Sidebar > Événements > Planning semaine (2 clicks) and opens a modal, not a page.

**Evidence:** apps/frontend/src/pages/admin/Dashboard.tsx:126-154 (KPIs filter status === "completed"), :162 (Performance mensuelle), :223 (Événements récents); apps/frontend/src/components/admin/AdminSidebar.tsx:7 ({ path: "/", label: "Tableau de bord" }); apps/frontend/src/App.tsx:22 (<Route path="/" element={<Dashboard />} />)

**Recommendation:** Make `/` the week view (Semaine) and move the finance dashboard to a `/finances` route under a new 'Comptabilité' nav group. Nav order: Semaine, Événements, Recettes, Ingrédients, Courses, Comptabilité, Paramètres.

## [high] Job: plan the week (week planner modal)

WeekPlannerModal is locked to the calendar week containing today (`const ref = new Date()`), has no previous/next, and renders each event as name + guest count + recipe count. Events are not clickable, recipe lines are not listed, and there is no revenue per day or per week. The only action is 'Télécharger PDF agrégé'. To see what a given day's events contain, Dalia closes the modal and opens each EventDetail: for a week with 5 events that is 2 + 5×2 = 12 clicks across 7 screens, or 3 clicks and the PDF.

**Evidence:** apps/frontend/src/pages/admin/Events.tsx:452 (function WeekPlannerModal), :455 (const ref = new Date();), :515-517 ({ev.guestCount} conv. / {ev.recipes.length} recette), :541 ("Télécharger PDF agrégé")

**Recommendation:** Replace the modal with a full page `/semaine/:isoWeek` with prev/next, seven day columns (or stacked on mobile), each day listing recipe lines as 'recipe × portions pour client' with a per-day guest total and HTVA revenue, and a week revenue header compared with the monthly objective ÷ 4.33. Tapping a line opens the prep sheet (see prep finding). Keep a 'PDF' button on the page for the first months so the paper fallback does not disappear overnight.

## [high] Job: plan the week / prep (the 30-page PDF)

generateAggregatedPdf sums `rl.portions / recipe.portions` per recipeId across all selected events, then prints one block per recipe sorted alphabetically with the label '(total sélection)'. The per-event and per-day attribution is lost: the PDF can say 'Mini quiches — 80 portions' but never '30 pour Hoona mardi, 50 pour le mariage samedi'. Each block prints the full ingredient table and every technique step with a drawn checkbox, so a week of 15 recipes runs to 30 pages. The per-event PDF in EventDetail (exportRecipesPdf) has the same shape for one event.

**Evidence:** apps/frontend/src/pages/admin/Events.tsx:151-169 (aggregatedScale, mergedRecipes sorted by recipe.name), :182 ("Recettes agrégées"), :217 ("(total sélection)"), :235 and :263 (doc.rect checkboxes); apps/frontend/src/pages/admin/EventDetail.tsx:100 (exportRecipesPdf), :142 and :164 (doc.rect)

**Recommendation:** Build the prep sheet as a screen, not a document: day view lists lines grouped by course then recipe, each line showing recipe, client, portions, and a 'fait' toggle; a 'Regrouper par recette' switch shows the summed quantity with the per-client breakdown underneath (e.g. 'Mini quiches 80 = Hoona 30 + Mariage 50'). Keep PDF export but generate it from the same grouped structure so the paper copy matches the screen.

## [low] Job: plan the week (events list order)

The Événements list defaults to the 'À venir' filter sorted by date descending, so the farthest-future event is first and the next event to prepare is at the bottom (or on page 2 with 20 per page).

**Evidence:** apps/frontend/src/pages/admin/Events.tsx:26 (useState<...>("upcoming")), :45 (arr.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()))

**Recommendation:** Sort ascending when the filter is 'upcoming' and descending when it is 'completed' or 'all'. One-line change; ship it with the week view.

## [high] Job: prep (follow a recipe at event portions)

Cook mode is reachable only from RecipeDetail ('Mode recette' button) and initialises portions to `recipe.portions`; there is no query param, route state, or link from an event line. To cook one event line Dalia does: Événements > event > recipe link > Mode recette > tap +/- once per portion (base 10, event 30 = 20 taps): 4 clicks + 20 taps per recipe, 5 recipes per event = 20 clicks + 100 taps. So she prints the PDF instead. Cook mode itself is the only large-type screen in the app (text-2xl/3xl steps), which is the right direction for the readability complaint.

**Evidence:** apps/frontend/src/pages/admin/RecipeCook.tsx:14 (useState(0)), :19 (setCookPortions(r.portions)), :46 (scaleQty), :105 (text-2xl md:text-3xl); apps/frontend/src/pages/admin/RecipeDetail.tsx:267 (navigate(`/recipes/${id}/cook`)); apps/frontend/src/App.tsx:20 (/recipes/:id/cook has no portions param); apps/frontend/src/pages/admin/EventDetail.tsx:278 (Link to recipe, not cook mode)

**Recommendation:** Accept `?portions=30&event=<id>&line=<idx>` on the cook route and add a 'Cuisiner' button per line in EventDetail and in the day view. Add a 'fait' flag per event recipe line so finishing cook mode marks the line done. Apply the cook-mode type scale (serif 2xl steps, xl ingredient rows) to RecipeDetail's reading mode.

## [medium] Job: prep (per-line state and prep day)

EventRecipeLine is `{recipeId, portions}` only. There is no order, course, note, done state, or prep date. An event has a single `date`, so a Saturday wedding whose desserts are made Friday cannot appear on Friday's sheet. This is why the week planner can only show 'n recettes' and why the PDF is the crutch.

**Evidence:** packages/types/src/entities/event.ts (EventRecipeLine { recipeId; portions }); apps/frontend/src/pages/admin/EventEditor.tsx:135-137 (addRecipe pushes { recipeId, portions: guestCount }); apps/frontend/src/pages/admin/EventDetail.tsx:270 (event.recipes.map with no order)

**Recommendation:** Extend EventRecipeLine with optional `course?`, `order?`, `note?`, `done?`, `prepDate?` (all optional on read; array index is the default order so existing data needs no migration). The day view places a line on `prepDate ?? event.date`. Manual reorder via up/down buttons first; drag-and-drop later.

## [high] Job: take an order (client, prestation type, deposit, quote state)

Order intake works (Événements > Nouvel événement, autosave after the name, recipes default to guestCount portions, 2 screens) but captures only what costing needs. There is no client entity: contact name/phone/email are free-text fields copied per event and re-copied by Dupliquer. There is no prestation type, so the revenue mix in 'Apercu par mois' cannot be computed. There is no deposit (acompte), no VAT rate, no quote-sent/accepted state, and no planned hours. The workbook's 'Au réel' sheet ('J'ai déjà signé...' with type, CA HTVA, hours) and the 'ACOMPTES' block are where this is written today.

**Evidence:** packages/types/src/entities/event.ts (contactName?, contactPhone?, contactEmail?, status: "upcoming" | "completed"); apps/frontend/src/pages/admin/EventEditor.tsx:29 (useState contactName), :214-218 (Contact de l'hôte inputs), :208 (only two status options); apps/frontend/src/pages/admin/EventDetail.tsx:87 (handleDuplicate copies contactName); docs/redesign/01-livre-des-comptes-excel.md (Au réel 2025, ACOMPTES)

**Recommendation:** Add a `Client { clientId, name, contact*, defaultPrestationType?, defaultPricePerGuest?, vatRate?, notes? }` table and an optional `event.clientId` (keep the contact fields for backward compatibility; a one-off script can create clients from distinct contactName values). Add `event.prestationType` from the seven workbook types stored in settings, `event.vatRate`, `event.deposit?: { amount, paidAt }`, `event.hoursPlanned?`. Add status values 'devis' and 'confirmé' before 'upcoming' only if Dalia confirms she tracks unconfirmed quotes; otherwise keep two statuses and add paid tracking in the ledger (see close finding).

## [high] Job: recurring clients (Hoona)

The only reuse mechanism is Dupliquer in EventDetail, which creates a copy named '<name> (copie)' dated today, copies recipes/portions/contact, and opens the editor. The weekly ritual per recurring client is: event > ⋯ menu > Dupliquer > rename > change date > adjust portions > Terminé (5 clicks plus edits). With three or four weekly clients that is the bulk of Monday's admin. The recipe category 'Menu semaine' exists but it describes the recipe, not the client, and there is no per-client view of upcoming or past weeks.

**Evidence:** apps/frontend/src/pages/admin/EventDetail.tsx:77-98 (handleDuplicate), :80 (`${event.name} (copie)`), :81 (date: new Date().toISOString().split("T")[0]); packages/types/src/entities/settings.ts (DEFAULT_RECIPE_CATEGORIES includes "Menu semaine"); no match for template/favori/recurr in apps/frontend/src, packages/types/src, apps/backend/src

**Recommendation:** Add `EventTemplate { templateId, name, clientId?, recipes, guestCount, sellingPricePerGuest, prestationType, extraCosts }` (or a boolean `isTemplate` on AppEvent with no date, which is cheaper). 'Nouvel événement' offers 'Depuis un favori' and asks only for date and guest count; the Client page lists that client's templates and the next four weeks. On the week view, a 'Semaine prochaine : créer Hoona' prompt from the template covers the 'ne pas dupliquer à chaque fois' request.

## [medium] Job: shop (grocery list)

This is the best-served job: Événements > tick n events > 'Liste de courses (n)' hands items to GroceryListPage via localStorage, grouped by supplier with stock vs need, drag between suppliers, PDF/CSV/copy, and a mobile card layout. Gaps: the list is a snapshot with no link back to the events, so a portion change after generation silently leaves the list stale; duplicates like 'oeuf'/'oeufs' appear as separate lines because aggregation keys on ingredientId:unit; the supplier list is the hardcoded DEFAULT_SUPPLIERS rather than settings; stock (haveQty) lives on the list item and is forgotten next week.

**Evidence:** apps/frontend/src/pages/admin/Events.tsx:127 (localStorage.setItem("recipe-book:grocery-list-pending")), key `${ri.ingredientId}:${ri.unit}` in generateGroceryList; apps/frontend/src/pages/admin/GroceryListPage.tsx:21 (PENDING_KEY), :46 (DEFAULT_SUPPLIERS), :104-110 (pending read), :220 (needQty), :231 (exportPdf), :279 (exportCsv); packages/types/src/entities/grocery-list.ts has no eventIds

**Recommendation:** Store `eventIds` on GroceryList and show a 'Régénérer' button when any linked event's updatedAt is newer than the list. Read suppliers from api.settings. Ship the ingredient merge tool (request 1) before the week view: a fuzzy finder (normalise accents, strip plural s, token overlap) that proposes groups, lets Dalia pick the survivor, and remaps recipe.ingredients[].ingredientId and groceryList.items[].ingredientId in one backend transaction before deleting. Persistent stock per ingredient is a later slice.

## [medium] Job: shop / close (raw material cost capture)

The income statement's 'Coûts MP' column is a real monthly figure from receipts. The app has only the calculated recipe cost and an optional per-event `actualCost`, which is editable in EventEditor only (not inline in EventDetail), so entering it costs event > ⋯ > Modifier > scroll > field > Terminé. Weekly supermarket receipts that span several events, or counter sales, have nowhere to go. Month-end MP therefore comes from the accountant or the workbook, and the app's margin stays theoretical.

**Evidence:** apps/frontend/src/pages/admin/EventEditor.tsx:32 (useState actualCost), :317-325 (Coût réel recettes HTVA input); apps/frontend/src/pages/admin/EventDetail.tsx:62 (totalCost uses actualCost), :235-238 (read-only display); docs/redesign/01-livre-des-comptes-excel.md ('Analyse marge' Coûts MP)

**Recommendation:** Make actualCost inline-editable in EventDetail. Add a `Purchase { purchaseId, date, supplier, amountHtva, vatAmount, eventId?, note }` table (a receipt line) and let the income statement use Σ purchases per month when present, falling back to Σ event cost (actual or calculated) when the month has no purchases. Show both figures side by side so a historical month never changes silently.

## [medium] Job: deliver / serve (hours, extra staff, KM)

No screen serves this job. An event has no service time, address, hours spent, extra staff, or kilometres. `extraCosts` can carry 'Kristoff 5h = 150 €' as an amount, but the hours themselves, the hourly rate, and the monthly total that feeds 'Analyse marge' column F are only in the workbook sheets 'factures' (Kristoff hours × 30 €) and 'personnel'. 'Au réel' records hours spent per signed job to compare with time available.

**Evidence:** packages/types/src/entities/event.ts (EventExtraCost { label; amount } only; no hours, no km, no address); docs/redesign/01-livre-des-comptes-excel.md ('factures', 'personnel', 'Au réel' hours column, journal column N KM)

**Recommendation:** Add `event.hoursSpent?`, `event.km?`, `event.serviceTime?`, `event.address?` (optional). Add `ExtraShift { shiftId, personName, date, hours, hourlyRate, eventId? }` with a small list screen under Comptabilité; the monthly sum feeds the income statement's 'Extras' line and a per-person month view reproduces the 'Factures Kristoff' check. No scheduling or rota.

## [high] Job: close (status, invoice line, payment)

Closing an event today is one click on the status pill (list or detail), which flips 'upcoming' to 'completed'. That single flag stands in for served, invoiced and paid. None of the journal columns exist on the event: invoice number, TVAC, HTVA, VAT split, réglé, mode de paiement, date d'encaissement, KM. After issuing the invoice in Falco, Dalia retypes a 14-column row into the month sheet. Revenue in the app is always `sellingPricePerGuest × guestCount`, so an invoice that includes delivery, a discount, or extra staff billed to the client diverges from the dashboard with no reconciliation.

**Evidence:** apps/frontend/src/pages/admin/Events.tsx toggleStatus (optimistic flip between "upcoming"/"completed"); apps/frontend/src/pages/admin/EventDetail.tsx:212 (EditableStatus), :484 (two-value type); packages/types/src/entities/event.ts (EventStatus = "upcoming" | "completed"); docs/redesign/01-livre-des-comptes-excel.md (journal columns A-N)

**Recommendation:** Add a `LedgerEntry` table as described in 01-livre-des-comptes-excel.md and a 'Clôturer' action on EventDetail that pre-fills one entry (date, label = event name, HTVA = revenue, VAT rate from event, TVAC computed, prestationType, eventId) and asks for invoice number and KM. Paid/method/paidAt are edited on the entry, not the event. Keep event.status for the kitchen; derive 'facturé' and 'payé' badges from the linked entry. Non-event entries (comptoir, commission, bon cadeau) are created directly on the journal page. Entries are immutable records; edits create a corrected entry or require an explicit confirm.

## [high] Job: month end (journal, objective, income statement)

The Dashboard cannot replace any workbook sheet. KPIs count only completed events; revenue is calculated, not invoiced; the tax toggle applies Belgian sole-trader rules (20.5 % social, 10 570 € allowance, IPP brackets, communal surcharge) to an SRL that pays corporate tax with the owner's salary as a fixed charge; there is no objective line, no last-year comparison, no revenue mix by prestation type, no fixed charges, no extra staff, no breakeven, no treasury target, and no non-event revenue (counter sales, Thermomix commissions, vouchers). There is no export for the accountant.

**Evidence:** apps/frontend/src/pages/admin/Dashboard.tsx:126-129 (completedEvents), :142 (title "indépendant, Belgique"), :183 (Estimation nette — indépendant), :305-310 (estimateBelgianTax, social = annualProfit * 0.205); docs/redesign/01-livre-des-comptes-excel.md ('Apercu par mois', 'Analyse marge', 'Prévisionnel financier')

**Recommendation:** Create a Comptabilité section with four pages that are views over LedgerEntry, Purchase, ExtraShift, FixedCharge and Objective: Journal (month table with the workbook's 14 columns, add-entry form, xlsx export with one sheet per month in the same column order), Aperçu (month × CA HTVA this year, last year, objective, % reached, mix by prestation type), Compte de résultats (CA, MP, marge brute, charges fixes, extras, résultat avant impôts, impôt sociétés at a settable rate, résultat net), Prévisionnel (fixed-charge list with solo/with-staff columns, breakeven, treasury months, investment envelope). Delete estimateBelgianTax. The current Dashboard chart can stay as the Aperçu chart once it reads ledger HTVA instead of event revenue.

## [medium] Competitor: Enobase feature map for a solo caterer

Planning: now. It is the stated reason to look at Enobase, and the app already holds events, recipes, portions and dates; only the view is missing. Main-d'œuvre: later, minimal. One occasional extra (Kristoff) needs a shift record with hours × rate feeding the income statement, not scheduling. Extras: later, same record; note that Enobase's 'extras' means extra staff while the app's 'extraCosts' means extra costs, so do not merge the two concepts. Devis: later, cheap version only. A client-facing 'Proposition de menu' PDF from an event (menu by course, price per guest, guest count) is a day of work; the legal quote stays in Falco. Factures: never issue, now record. Falco issues; the app records the ledger line and payment state because the journal depends on it. CRM: later, thin. A Client entity with contact, defaults and notes is needed for recurring clients and for the ledger; pipeline, follow-ups and mailing stay in Mailchimp/Notion. AI: not now. The two concrete uses (duplicate ingredient grouping, recipe import from a photo or pasted text) can be scoped later; dedupe does not need a model, string similarity is enough. Odoo: never for this business size. At 200 €/month, Enobase costs 2 400 €/year against a monthly objective that the workbook sets at 16 000 € HTVA; the app's edge is that costing and margin are already built and the data is already there.

**Evidence:** docs/redesign/00-brief.md section 1 (Enobase feature list, 200€/mois) and section 2 (working interpretation); docs/redesign/01-livre-des-comptes-excel.md ('Objectif de CA', 'factures Kristoff'); apps/frontend/src/lib/recipe-helpers.ts (calcRecipeCost, the costing maths that Notion lacks)

**Recommendation:** Phase 1: week view, day prep sheet, cook mode from event line, ingredient merge, course/order on lines. Phase 2: Client, EventTemplate, LedgerEntry with Clôturer and Journal export, prestation type. Phase 3: Purchases, ExtraShift, FixedCharge, Objective, Compte de résultats and Prévisionnel pages, remove sole-trader tax. Phase 4 (optional): menu proposal PDF, AI recipe import. Never: quote and invoice issuing, Odoo, CRM pipeline.

## [high] User stories (ranked)

1. When I open the app on Monday morning, I want to see the week day by day with every recipe line (recipe, client, portions) and the week's HTVA revenue, so that I know what to cook for whom without printing the PDF. 2. When I tap a recipe line on a day, I want cook mode to open at that line's portions in large type with a 'fait' toggle, so that I can follow it in the kitchen with wet hands and see what is left. 3. When Hoona's weekly menu comes in, I want to create next week's event from that client's saved setup by entering only the date and guest count, so that I stop duplicating and re-editing by hand. 4. When an event is done and invoiced in Falco, I want to close it by entering the invoice number, VAT rate, paid flag and date received, so that the month's journal is built from the app and exported to the accountant in the workbook's column order. 5. When the month ends, I want one page with CA HTVA versus last year and the objective, the revenue mix by prestation type, and the income statement (CA, MP, charges fixes, extras, impôt sociétés, net), so that I can retire the workbook. 6. When I build an event's menu, I want to group recipes by course (apéritif, entrée, plat, dessert) and reorder them, so that the prep sheet and the client menu read in service order.

**Evidence:** docs/redesign/00-brief.md section 1 (three verbatim requests and the accounting request); apps/frontend/src/pages/admin/Events.tsx:452-545 (what the week view is today); apps/frontend/src/pages/admin/RecipeCook.tsx:19 (portions not from event); apps/frontend/src/pages/admin/EventDetail.tsx:77-98 (Dupliquer); packages/types/src/entities/event.ts (no ledger fields, no course/order)

**Recommendation:** Build in this order. Stories 1, 2 and 6 touch only the frontend plus optional fields on EventRecipeLine and can ship first without a migration. Story 3 needs Client and EventTemplate tables. Stories 4 and 5 need LedgerEntry, FixedCharge, Objective and the export; ship the Journal and export before the income statement so the accountant gets value early.

# Audit: finance

Through the money lens the app today has one revenue formula (sellingPricePerGuest × guestCount, HTVA) and one cost formula (recipe cost scaled by portions, plus untyped extra costs, with an optional actualCost override), displayed on EventDetail, EventEditor and Dashboard. Those three screens disagree: Dashboard ignores actualCost, mixes upcoming and completed events in the monthly chart, and recomputes every historical cost from today's ingredient prices, so past margins drift when a price is edited. The tax toggle (estimateBelgianTax) models a Belgian sole trader (20.5 % social contributions, personal income tax brackets, communal surcharge) applied to gross event margin; the business is an SRL whose workbook puts the owner's salary and social contributions in the fixed charges and applies corporate tax to the result after those charges, so the current "net" is wrong in base and in rate. Recipe pricing (coef on HTVA cost, TVAC = HTVA × (1 + tva/100), chosen TVAC ÷ (1 + tva/100)) is consistent with the workbook's "tvac/1,06 ou 1,12 ou 1,21" convention, but the VAT rate is an unconstrained number and never reaches the event, which has no VAT, invoice number, TVAC, paid flag, payment method, date received, prestation type, KM or hours. None of the workbook's sheets can be produced from existing data alone: the journal, deposits, commissions, fixed charges, objectives and extra staff are new records; the monthly overview, mix, income statement, breakeven and "au réel" are views over those records plus the events. The workbook itself has defects the app should not copy: four different monthly objectives, a breakeven that ignores raw material cost, a 15 % corporate tax rate, free-text prestation types with trailing spaces, and hand-typed profit figures. The findings below give the entities, fields, report columns and formulas in the workbook's French vocabulary, and what the Dashboard becomes once accounting exists.

## [high] Tax model (SRL vs sole trader)

The net-margin toggle computes personal income tax for a self-employed person on the sum of event gross margins. The company is an SRL. An SRL pays corporate tax on its result after all charges, and the owner's salary plus her social contributions are charges of the company, not a percentage of margin. The current toggle is wrong twice: the base (event margin, which still contains the owner's salary and every fixed charge) and the rate (IPP brackets up to 50 % plus 20.5 % social). It also taxes upcoming events and gives negative-margin events a negative tax.

**Evidence:** apps/frontend/src/pages/admin/Dashboard.tsx:308-325 `const social = annualProfit * 0.205; let taxable = Math.max(0, annualProfit - social - 10570); ... tax *= 1.075`; :71-80 rate = estimateBelgianTax(Σ e.margin per year) / Σ margin, applied at :86-89 to every event row including status upcoming; :148 label "Net après impôts (BE)". Workbook: Prévisionnel financier F12 `=F10*15%` labelled "Impôt sur les sociétés (estimé entre 15% et 25%)", B23 "Rémunération dirigeant" 1500 and B11 "UCM (cotisations sociales)" 300 are lines of the fixed-charge list; Analyse marge E1 "charges fixes (rému dirigeant inclu)", I1 "Impôts", J1 "Marge nette".

**Recommendation:** Delete estimateBelgianTax, the toggle and the override input. The net figure lives in Compte de résultats with this formula, per month m and year Y:

résultat avant impôts(m) = CA HTVA(m) − coûts MP(m) − charges fixes(m) − personnel extra(m) − autres coûts événement(m)
  where charges fixes(m) = Σ FixedCharge.monthlyAmount active in m (rémunération dirigeant, UCM, assurances, abonnements, remboursement dirigeant, ...)
impôts(Y) = max(0, Σ_m résultat avant impôts(m)) × corporateTaxRate(Y)
impôts(m) (estimate shown per month) = max(0, résultat avant impôts(m)) × corporateTaxRate(Y)
résultat net = résultat avant impôts − impôts

corporateTaxRate is stored on the Objective record for the year (see entities finding). Default 0.25; the Belgian reduced SME rate is 0.20 on the first 100 000 € but requires conditions (notably a minimum director salary) that I did not verify for this company; the workbook's 15 % is out of date.

## [high] Cost consistency across screens

Dashboard ignores event.actualCost while EventDetail and EventEditor replace the calculated recipe cost with it. The same completed event shows one margin on its page and another in the dashboard table and chart, and the future Coûts MP column would inherit whichever formula the report author picks.

**Evidence:** apps/frontend/src/pages/admin/Dashboard.tsx:51-57 `const recipeCost = ev.recipes.reduce(...); const extraCost = ...; const totalCost = recipeCost + extraCost;` (no actualCost). apps/frontend/src/pages/admin/EventDetail.tsx:62 `const totalCost = event.actualCost != null ? event.actualCost + totalExtraCosts : calculatedCost;` and EventEditor.tsx:125 same.

**Recommendation:** One helper in apps/frontend/src/lib/recipe-helpers.ts used by all three screens and by the income statement:

```ts
export function calcEventCost(ev: AppEvent, recipeCost: Record<string, number>, recipePortions: Record<string, number>) {
  const calculated = ev.recipes.reduce((s, l) => s + ((recipeCost[l.recipeId] || 0) / (recipePortions[l.recipeId] || 1)) * l.portions, 0);
  const rawMaterial = ev.costSnapshot?.rawMaterial ?? ev.actualCost ?? calculated;
  const extras = ev.extraCosts.reduce((s, c) => s + c.amount, 0);
  return { calculated, rawMaterial, extras, total: rawMaterial + extras };
}
```

## [high] Records versus views (historical drift)

Every event cost is recomputed on each render from the current ingredient price list. Editing an ingredient price in 2026 changes the cost and margin of every 2025 completed event, which violates the brief's rule that historical figures never change silently. The only stored money facts today are sellingPricePerGuest, actualCost and extraCosts.

**Evidence:** apps/frontend/src/pages/admin/Dashboard.tsx:35-39 `recipes.forEach((r) => { map[r.recipeId] = calcRecipeCost(r, ingredients); })` from live ingredients; EventDetail.tsx:41-45 same; apps/frontend/src/lib/recipe-helpers.ts:3-15 reads `ing.price` at call time.

**Recommendation:** Classify explicitly.
Records (written once, edited only on purpose, never recomputed): LedgerEntry (journal lines, deposits, commissions, counter sales, vouchers), FixedCharge with a validity period, Objective per year, ExtraShift, event.actualCost, event.extraCosts, event.sellingPricePerGuest, and a new event.costSnapshot { rawMaterial, extras, computedAt } written when status flips to completed (or by a "Clôturer le mois" action).
Views (always derived at render time, never stored): CA du mois, Coûts MP du mois, marge brute, charges fixes du mois, résultat, impôts, mix par prestation, aperçu par mois, seuil de rentabilité, trésorerie, au réel.
Reports read costSnapshot when present and fall back to the live calculation only for upcoming events.

## [high] Revenue model cannot feed the journal

Revenue exists only as sellingPricePerGuest × guestCount in HTVA on the event. There is no invoice number, no TVAC, no VAT split, no paid flag, no payment method, no date received, no KM, no description, and no way to record revenue that is not an event (monthly counter invoice, Thermomix commission, gift voucher). Per-guest pricing also does not describe a monthly "facture comptoir" or a take-away order.

**Evidence:** packages/types/src/entities/event.ts:14-29 (fields listed; none of the journal columns); packages/types/src/dto/events.ts:13-26; apps/frontend/src/pages/admin/EventDetail.tsx:63 `const totalRevenue = event.sellingPricePerGuest * event.guestCount;`. Workbook journal columns A..N (Janvier A2:N2): NUMERO OPERATION, DATE FACTURE/OPERATION, INTITULE, Total tvac, RECETTE htva, TVA 6%, TVA 12%, TVA 21%, réglé, mode paiement, date encaissement, Type, Description, KM. Au réel 2025 A13 "facture comptoir janvier 2025" 842.92, A5 "Elodie wilmes" menu à emporter 323; recettes 2025 A145 "THERMOMIX COMMISSIONS".

**Recommendation:** Add a LedgerEntry record (see entities finding). The event keeps sellingPricePerGuest as the quote and prévision; realised revenue is the journal. On the event page add "Créer la ligne de journal" which pre-fills: date = event.date, label = event.name, kind = facture, prestationType = event.prestationType, htva = round2(sellingPricePerGuest × guestCount), rate = event.vatRate, tvac = round2(htva × (1 + rate/100)), eventId, km = event.km. The user then overwrites with the Falco invoice figures. Invariant enforced in the DTO: htva + Σ vat.amount = totalTvac within 0.01. HTVA is stored as typed, never recomputed from TVAC on read; a helper splitTvac(tvac, rate) = { htva: round2(tvac / (1 + rate/100)), vat: round2(tvac − htva) } only pre-fills the form, matching the sheet note "tvac/1,06 ou 1,12 ou 1,21".

## [medium] VAT handling

Recipe pricing is consistent with the workbook convention (price HTVA = cost × coef; TVAC = HTVA × (1 + tva/100); chosen TVAC ÷ (1 + tva/100) back to HTVA), but the VAT rate is any non-negative number and lives only on the recipe. Events have no VAT rate, so neither TVAC nor the VAT column of the journal can be derived from an event, and an invoice that mixes food at 12 % and drinks at 21 % cannot be represented.

**Evidence:** apps/frontend/src/pages/admin/RecipeDetail.tsx:569-581 `const cpP = totalCost / portions; const spHTVA = cpP * pricing.surPlace.coef; const spTVAC = spHTVA * (1 + pricing.surPlace.tva / 100); ... spChosen / (1 + pricing.surPlace.tva / 100) - cpP`. packages/types/src/dto/recipes.ts:12-13 `tva: z.number().nonnegative()`. packages/types/src/entities/event.ts has no vat field. Defaults RecipeDetail.tsx:17-18 surPlace 12 %, takeAway 6 %.

**Recommendation:** In packages/types: `export const VAT_RATES = [0, 6, 12, 21] as const; export type VatRate = typeof VAT_RATES[number];` Constrain recipe pricing tva to `z.union([z.literal(6), z.literal(12), z.literal(21)])`. Add `event.vatRate?: 6 | 12 | 21`, defaulted from prestationType when the type is chosen: menu_a_emporter and buffet_a_emporter → 6; buffet_avec_service, walking_cocktail, chef_a_domicile, brunch → 12; atelier → 21 (defaults are editable; I did not confirm the atelier rate with the accountant). LedgerEntry carries `vat: { rate: VatRate; base: number; amount: number }[]` so one line can hold several rates; the journal renders one column per rate as the workbook does.

## [medium] Raw material versus staff costs

EventExtraCost is a free label and an amount, added to cost everywhere. The workbook's income statement needs raw material (Coûts MP) separate from extra staff (Rémunération personnel extra) and the rest. Without a kind on extra costs the Compte de résultats cannot split them, and a staff line typed as an extra cost would land in MP.

**Evidence:** packages/types/src/entities/event.ts:6-9 `EventExtraCost { label: string; amount: number }`; summed into cost at Dashboard.tsx:56, EventDetail.tsx:60-62, EventEditor.tsx:123-125. Workbook Analyse marge C1 "Couts MP" vs F1 "Rémunération personnel extra" (F2 `=personnel!B6`); C2 = 2401.11 is a hand-typed purchases total, not a recipe theory figure.

**Recommendation:** `EventExtraCost { label; amount; kind?: "matiere" | "personnel" | "location" | "transport" | "autre" }`, undefined read as "autre" (no migration). Compte de résultats per month m:
Coûts MP(m) = Σ events dated in m of rawMaterial (costSnapshot ?? actualCost ?? calculated) + Σ extraCosts kind matiere
Personnel extra(m) = Σ ExtraShift(hours × hourlyRate) dated in m + Σ extraCosts kind personnel
Autres coûts événement(m) = Σ remaining extraCosts
Optional later: `MonthClose { ym: "YYYY-MM"; rawMaterialOverride?: number; note?: string }` so the caterer can type the real purchases total from supplier invoices when it differs from recipe theory; the report shows which source it used.

## [medium] Forecast mixed with realised revenue

The Dashboard monthly chart sums all events of the year regardless of status, while the KPI cards use completed events only and span all years. A future event's price × guests is a forecast, not revenue. The workbook keeps "CA htva" (from invoices) and "Prévision (onglet au réel)" in separate columns.

**Evidence:** apps/frontend/src/pages/admin/Dashboard.tsx:103-116 `eventRows.forEach((ev) => { ... months[m].revenue += ev.revenue; ...})` with no status filter; :126-129 `const completedEvents = eventRows.filter((e) => e.status === "completed")`; :154 KpiCard "Revenu total HTVA" sub "Événements terminés" across all years while the chart is per `year`. Workbook Apercu par mois B2 "CA htva 2025", F2 "Prévison (onglet au réel)".

**Recommendation:** Two distinct series everywhere: CA HTVA = Σ LedgerEntry.htva by month (realised, from invoices); Prévision / Signé = Σ events dated in the month of sellingPricePerGuest × guestCount (upcoming and completed). Aperçu par mois shows both; the Dashboard strip shows "CA du mois" (journal), "Signé" (events) and "Objectif".

## [medium] Prestation type taxonomy

The revenue mix depends on a prestation type per line. The workbook uses free text and SUMIF, and already has inconsistent values ("Atelier" capitalised, "chef à domicile " with a trailing space, which SUMIF would not match). The app has no prestation type at all; recipe.type is a service format.

**Evidence:** Janvier N42:N48 = "menu à emporter", "buffet à emporter", "buffet avec service", "Atelier", "brunch", "walking/cocktail", "chef à domicile"; M42 `=SUMIF(L4:L38, N42,E4:E38)`; Apercu D22 sums the twelve M42 cells. Au réel 2025 B41 = "chef à domicile " (trailing space), B14 = "Atelier". packages/types/src/entities/settings.ts:13-18 DEFAULT_RECIPE_CATEGORIES = Buffet, Walking dinner, Lunch, Menu semaine.

**Recommendation:** ```ts
export const PRESTATION_TYPES = ["menu_a_emporter","buffet_a_emporter","buffet_avec_service","atelier","brunch","walking_cocktail","chef_a_domicile"] as const;
export type PrestationType = typeof PRESTATION_TYPES[number];
export const PRESTATION_LABELS: Record<PrestationType, string> = { menu_a_emporter: "Menu à emporter", buffet_a_emporter: "Buffet à emporter", buffet_avec_service: "Buffet avec service", atelier: "Atelier", brunch: "Brunch", walking_cocktail: "Walking / cocktail", chef_a_domicile: "Chef à domicile" };
```
`event.prestationType?: PrestationType` (optional on read, required in the editor for new events), copied onto each LedgerEntry at creation and editable there. Mix par prestation groups LedgerEntry.htva by prestationType with a "Sans type" bucket for legacy lines. Keep recipe categories separate.

## [medium] Workbook sheet to app mapping

Exact coverage per sheet. Nothing in the workbook is fully covered today; events supply part of the journal and the raw material figure.

**Evidence:** docs/redesign/01-livre-des-comptes-excel.md sheet list; packages/types/src/entities/event.ts; apps/frontend/src/pages/admin/Dashboard.tsx:47-62.

**Recommendation:** Journal (Janvier..Décembre, recettes 2025): NEW record LedgerEntry. Derivable from an event: date, label (name), htva (sellingPricePerGuest × guestCount), prestationType and km (both new on event). New only: number, totalTvac, vat[], paid, paymentMethod, paidAt, description, kind.
THERMOMIX commissions: NEW LedgerEntry kind commission, vat rate 0.
ACOMPTES: NEW LedgerEntry kind acompte with eventId; event date derivable.
COMPARAISON année: VIEW over LedgerEntry.htva by date range.
Apercu par mois: VIEW: LedgerEntry by month for N and N−1 (new), Objective.annualRevenue / monthsActive (new), prévision from events (existing name, date, price, guests).
Mix par prestation and Objectif par prestation: VIEW over LedgerEntry.prestationType (new) and Objective.byPrestation (new).
Analyse marge: VIEW: CA from LedgerEntry (new); Coûts MP derivable from events (actualCost / calculated, existing) plus extraCosts.kind (new); charges fixes from FixedCharge (new); personnel extra from ExtraShift (new); impôts from Objective.corporateTaxRate (new).
personnel: VIEW Σ ExtraShift by month. factures: VIEW ExtraShift by person and period (dates, heures, taux, montant). Both need ExtraShift (new).
Prévisionnel financier and Simulation si seule: FixedCharge records with a solo amount (new) and Objective (new); seuil, trésorerie, ISoc are VIEWS.
Au réel: VIEW over events by month (existing: name, revenue, notes; new: prestationType, hoursSpent) plus Objective.monthlyRevenue and hoursAvailablePerMonth (new).

## [medium] Minimal entity set

Five records cover every sheet. All event additions are optional on read so no migration is needed; new tables start empty.

**Evidence:** packages/types/src/entities/event.ts; apps/backend/src/shared/ddb.service.ts:18 tables list; apps/backend/src/events/events.service.ts create/update pattern.

**Recommendation:** ```ts
// packages/types/src/entities/event.ts additions
prestationType?: PrestationType; vatRate?: 6 | 12 | 21; hoursPlanned?: number; hoursSpent?: number; km?: number; clientId?: string;
costSnapshot?: { rawMaterial: number; extras: number; computedAt: string };

// packages/types/src/entities/ledger.ts
export interface LedgerEntry {
  entryId: string; ym: string; date: string; number?: string; label: string;
  kind: "facture" | "acompte" | "comptoir" | "commission" | "bon_cadeau" | "autre";
  eventId?: string; clientId?: string; prestationType?: PrestationType;
  totalTvac: number; htva: number; vat: { rate: VatRate; base: number; amount: number }[];
  paid: boolean; paymentMethod?: "virement" | "cash" | "bancontact" | "payconiq" | "autre"; paidAt?: string;
  description?: string; km?: number; createdAt: string; updatedAt: string;
}

// packages/types/src/entities/fixed-charge.ts
export interface FixedCharge {
  chargeId: string; label: string; category: "social" | "salaire" | "assurance" | "abonnement" | "frais" | "remboursement" | "autre";
  monthlyAmount: number; monthlyAmountSolo?: number; validFrom: string; validTo?: string; note?: string;
}
// A change of amount = close the period (validTo) and create a new charge, so past months keep their figure.

// packages/types/src/entities/objective.ts
export interface Objective {
  year: number; annualRevenue: number; monthsActive: number; monthlyOverrides?: Record<string, number>;
  byPrestation: { type: PrestationType; amount: number; eventsNeeded?: number; guestsPerEvent?: number }[];
  hoursAvailablePerMonth?: number; rawMaterialPct: number; corporateTaxRate: number;
  extrasBudget?: number; treasuryMonths: number; treasurySavingPerMonth?: number;
  investments: { label: string; amount: number }[]; updatedAt: string;
}

// packages/types/src/entities/extra-shift.ts
export interface ExtraShift { shiftId: string; ym: string; personName: string; date: string; hours: number; hourlyRate: number; eventId?: string; invoiceRef?: string; createdAt: string; updatedAt: string }
```
Backend: four new DynamoDB tables (ledger-entries pk entryId, fixed-charges pk chargeId, objectives pk year as string, extra-shifts pk shiftId), same CRUD service shape as events.service.ts, scanAll is fine at a few hundred lines per year. `ym` is written server-side from `date.slice(0, 7)`.

## [medium] Deposits (acomptes)

The workbook lists deposits in a side table and also counts a deposit as signed revenue in Au réel. The app has no deposit concept. Modelling deposits as journal lines keeps one revenue source and lets the final invoice be recorded net of the deposit.

**Evidence:** recettes 2025 A166 "ACOMPTES", A167:D167 Client | montant | date paiement | date évent, B178 `=SUM(B169:B176)`; Au réel 2025 A40 "De Frahan acompte" walking/cocktail 750.

**Recommendation:** A deposit is `LedgerEntry { kind: "acompte", eventId, date: date received, paid: true, paidAt, vat split at the event's rate }`. The final invoice line is the balance. Event revenue in reports = Σ LedgerEntry.htva with that eventId. The "Acomptes" view lists kind acompte lines with the event date joined from the event. I did not confirm with the accountant whether deposits are invoiced through Falco; in Belgian VAT a received deposit is chargeable, so recording it in the month received matches the workbook's behaviour.

## [medium] Hours and extra staff

Three workbook figures depend on hours: time spent per signed job, time available per month, and extras' hours × hourly rate. The app stores no hours anywhere.

**Evidence:** Au réel 2025 D3 "Temps passé", D24 `=SUM(D4:D23)`, C27 "J'ai X temps disponible" 208, C30 `=C27-D24`; factures C26 `=SUM(C8:C24)` 158 h, D26 30, E26 `=C26*30` 4740; Analyse marge J23 "20 heures par semaine à 20 euros (10 mois)".

**Recommendation:** event.hoursPlanned and event.hoursSpent (optional numbers); ExtraShift record (see entities); Objective.hoursAvailablePerMonth. Au réel uses hoursSpent ?? hoursPlanned per event. The "Extras" screen is a dated list per person with a "Facture" summary: dates, Σ heures, taux, montant = Σ heures × taux, which replaces sheet factures.

## [medium] Breakeven ignores raw material cost

The workbook's breakeven and "bénéfice net" subtract only fixed charges from the revenue objective. For a caterer whose raw materials are 34 to 38 % of revenue this understates the revenue needed by more than a third. The app should not copy this.

**Evidence:** Prévisionnel financier B3 `=C42+(C47*12)+C48` (charges annuelles + 12 × trésorerie + investissements = 95 827), F10 `=C3-B3` bénéfice net, no MP term. Analyse marge C23 `=B23*38%` and C18 ratio 0.344 show MP at 34 to 38 % of CA. At 38 % MP, 95 827 of charges needs about 154 560 of revenue, not 95 827.

**Recommendation:** seuil de rentabilité (CA) = (Σ charges fixes annuelles + 12 × treasurySavingPerMonth + Σ investments) / (1 − rawMaterialPct)
seuil mensuel = seuil / monthsActive
bénéfice avant impôts prévu = annualRevenue × (1 − rawMaterialPct) − Σ charges fixes annuelles − extrasBudget
ISoc prévu = max(0, bénéfice) × corporateTaxRate
marge nette prévue % = (bénéfice − ISoc) / annualRevenue
besoin de trésorerie = Σ charges mensuelles × treasuryMonths
rawMaterialPct defaults to last year's MP / CA from Compte de résultats. Show the workbook's "hors MP" figure alongside for one year so the caterer recognises her numbers.

## [low] Corporate tax rate value

The workbook applies 15 %. The Belgian corporate rate is 25 %, with a 20 % reduced rate on the first 100 000 € for SMEs that meet conditions, including a minimum director salary. The workbook pays the director 1 500 €/month, which may not satisfy that condition. I did not verify the conditions for this company.

**Evidence:** Prévisionnel financier F12 `=F10*15%`; Simulation si seule E12 `=E10*15%`; B23 "Rémunération dirigeant" 1500.

**Recommendation:** corporateTaxRate on Objective per year, default 0.25, editable, with help text "20 % sur la première tranche de 100 000 € si les conditions PME sont remplies, à confirmer avec le comptable". Never hard-code the rate in a component.

## [low] One objective per year

The workbook holds four different monthly targets for the same year. The app must have a single source so Aperçu, Au réel and Prévisionnel agree.

**Evidence:** Apercu par mois K4 160 000, K5 `=K4/10` 16 000; Au réel 2025 C26 "Je vise X CA par mois" 25 000; Prévisionnel financier C3 260 000, C4 `=C3/10` 26 000; Simulation si seule C3 160 000.

**Recommendation:** Objective keyed by year. monthlyRevenue(m) = monthlyOverrides["YYYY-MM"] ?? annualRevenue / monthsActive. monthsActive defaults to 10 ("objectif sur 10 mois"). Every report reads this record; the Prévisionnel scenario toggle ("avec salarié" / "seule") only switches which FixedCharge amount column is summed, not the objective.

## [low] Money arithmetic and formatting

Amounts are floats summed with plain addition and displayed with toFixed(2) and a space before €, without a thousands separator or French decimal comma. For recipe estimates this is fine. For a journal that must reconcile to the accountant's totals to the cent, float accumulation and a derived HTVA can drift by a cent.

**Evidence:** apps/frontend/src/lib/recipe-helpers.ts:17-19 `return (n || 0).toFixed(2) + " €";` → "1234.56 €"; apps/frontend/src/pages/admin/Dashboard.tsx:56-58 raw float reduce.

**Recommendation:** Ledger amounts stored as euros with exactly two decimals, validated in Zod: `const money = z.number().refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6)`. Sum in cents: `const sumMoney = (xs: number[]) => xs.reduce((s, x) => s + Math.round(x * 100), 0) / 100`. Format with `new Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR" })` in a `fmtEur` used by the accounting screens; keep `fmt` for recipe costs until the design pass replaces it.

## [medium] Reports: columns and formulas

Six views in the workbook's vocabulary, all derived from the records above. Columns in display order; formulas use the entity fields.

**Evidence:** Janvier A2:N2 and M42:N48; Apercu par mois A2:G2 and A20:G30; Analyse marge A1:J1 and B23:H23; Prévisionnel financier B2:C4, B10:D10, F41:F42; Au réel 2025 A3:E3, A24:C30.

**Recommendation:** Journal des recettes (par mois, lines are records): N° | Date | Intitulé | Type | Total TVAC | HTVA | TVA 6 % | TVA 12 % | TVA 21 % | Réglé | Mode | Encaissé le | KM | Description. Pied: Σ TVAC, Σ HTVA, Σ par taux, "Total CA mm/aaaa" = Σ HTVA, Σ HTVA par type. Filter: year, month, kind, paid.

Aperçu par mois (vue): Mois | CA HTVA N−1 | CA HTVA N | Δ % = (N − N−1) / N−1, blank when N−1 = 0 | Objectif = Objective.monthlyRevenue(m) | Prévision = Σ events dated in m of sellingPricePerGuest × guestCount | Atteint = CA N ≥ Objectif. Totals row. Box: seuil annuel et mensuel, objectif annuel et mensuel, comparaison par période (1 jan to 30 avr, 30 avr to 30 juin) for N, N−1, N−2.

Mix par prestation (vue): Type | CA N−1 | % | CA N = Σ LedgerEntry.htva by prestationType | % of total | Objectif = Objective.byPrestation.amount | % | Nb nécessaires = eventsNeeded ?? Objectif / (CA N / nombre de lignes du type). Total row.

Compte de résultats (vue, 12 months + Total année): Mois | CA HTVA (journal) | Coûts MP | Marge brute = CA − MP | Charges fixes = Σ FixedCharge active in m | Personnel extra = Σ ExtraShift hours × hourlyRate | Autres coûts = Σ extraCosts not matière/personnel | Résultat avant impôts = Marge brute − Charges fixes − Personnel − Autres | Marge % = Résultat / CA | Impôts = max(0, Résultat) × corporateTaxRate (annual row: max(0, Σ Résultat) × taux) | Résultat net = Résultat − Impôts. Ratio rows: MP / CA, Marge brute / CA, Charges fixes / CA. Simulation row from Objective: CA = annualRevenue, MP = CA × rawMaterialPct, Charges = Σ FixedCharge × 12, Personnel = extrasBudget, Résultat, Marge %.

Prévisionnel (vue on FixedCharge + Objective): charge table Intitulé | Catégorie | Mensuel | Mensuel sans salarié | Annuel, totals; then seuil, besoin de trésorerie, bénéfice prévu, ISoc prévu, marge nette prévue (formulas in the breakeven finding); investments list with total.

Au réel (vue, one block per month): Client / événement | Type | CA HTVA = Σ journal lines of the event, else sellingPricePerGuest × guestCount | Heures = hoursSpent ?? hoursPlanned | Observations = notes. Pied: Σ CA signé, Σ heures, Objectif mensuel, Heures disponibles, Reste à signer = Objectif − Σ CA, Heures restantes = disponibles − Σ heures. Year total and écart = annualRevenue − Σ.

## [medium] What the Dashboard becomes

Today the home page is a finance dashboard with a wrong tax model. Once the accounting section exists the finance detail belongs there and the home page should answer "what do I cook this week" with a thin money strip.

**Evidence:** apps/frontend/src/pages/admin/Dashboard.tsx:135-250 (KPIs, toggle, chart, events table, grocery lists); brief section 3 "Home page is a finance dashboard, not what do I cook this week".

**Recommendation:** Home = planning of the week (other lens) plus one row of four tiles: CA du mois (Σ journal HTVA, month to date) with the objective as a progress bar; Signé ce mois (Σ events of the month, price × guests); À encaisser (count and Σ TVAC of LedgerEntry.paid = false, oldest invoice date); Marge brute du mois % = (CA − MP) / CA. Remove the tax toggle, override input, estimateBelgianTax, the year chart and the all-time KPIs. The monthly chart moves to Aperçu par mois as CA N vs CA N−1 vs Objectif bars. New sidebar entry "Comptabilité" with tabs: Journal, Aperçu par mois, Mix par prestation, Compte de résultats, Prévisionnel, Au réel, Charges fixes, Extras.

## [low] Export for the accountant

The brief requires an xlsx or CSV export the accountant accepts. The existing recipe export already uses the xlsx package, so the journal export is cheap if it keeps the workbook's exact column layout.

**Evidence:** apps/frontend/src/pages/admin/Recipes.tsx:99-117 `XLSX.utils.json_to_sheet(rows) ... XLSX.writeFile(wb, "recettes.xlsx")`; workbook header row Janvier A2:N2.

**Recommendation:** Export "Livre des recettes YYYY.xlsx": one sheet per month plus "recettes YYYY", headers in the workbook's order and wording (NUMERO OPERATION, DATE FACTURE/OPERATION, INTITULE, Total tvac, RECETTE htva, TVA 6%, TVA 12%, TVA 21%, réglé, mode paiement, date encaissement, Type, Description, KM), dates as Excel date cells, a TOTAL row and the per-type totals written as values (not formulas), plus a sheet "Compte de résultats". CSV variant with ";" separator and decimal comma for fr-BE Excel. Export is read-only over records; it never writes back.

## [low] Date grouping

Month grouping parses "YYYY-MM-DD" with new Date(), which is UTC midnight, then reads getMonth() in the browser's timezone. Safe in Europe/Brussels, wrong west of UTC. The accounting views will group far more lines by month.

**Evidence:** apps/frontend/src/pages/admin/Dashboard.tsx:104-106 `const d = new Date(ev.date); if (d.getFullYear() !== year) return; const m = d.getMonth();`

**Recommendation:** Group by `date.slice(0, 7)` (the `ym` attribute on LedgerEntry and ExtraShift, written server-side), and by `date.slice(0, 4)` for the year. One `groupByMonth(items, getDate)` helper in a new apps/frontend/src/lib/accounting.ts shared by every view.
