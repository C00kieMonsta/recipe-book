# Critique of the synthesis draft

## Critic summary: engineer

The draft is buildable on the stated stack and most of its code references check out: of the roughly 35 file:line citations in sections 3, 5.7 to 5.11, 6, 7 and 10, all but five point at the right line (AdminSidebar.tsx:94 is wrong, four others are off by one or two). data-stack.ts does define five tables and README.md:149 is the stale statement. packages/utils is imported by no app code, but the deletion list misses the utils jest project block and two GitHub workflows. The main design hole is in the line endpoints: PUT /lines carries full line objects, so a reorder from a stale laptop tab writes back an old prepStatus, and PATCH /admin/events/:id still accepts the whole recipes array, so the concurrency guard can be bypassed by old bundles and by EventDetail.saveField. The expectedUpdatedAt flow is under-specified on the create path and after each autosave response. The ledger PATCH schema cannot be derived from a ZodEffects union with .partial(). GET /admin/ingredients/duplicates will be shadowed by @Get(":id") unless declared first, and the merge/delete reference scans must go through DdbService to avoid a RecipesModule/IngredientsModule cycle; EventsModule importing Recipes and Ingredients creates no cycle. The merge algorithm is sound on ordering and idempotency but rewrites historical grocery prices and can produce NaN on haveQty. Tailwind and Zod details are valid for 3.4.19 and 3.25 except the missing sm/base overrides and the ledger partial. The effort total of 46 to 55 days is low by roughly a third for a solo developer given the file lists.

## Critic summary: accountant

The accounting sections reproduce the workbook's shapes faithfully: the 14 journal columns, the TOTAL row, the SUMIF-per-type block, the Analyse marge columns, the breakeven formula (C42 + C47×12 + C48 and C41 + C47 + C48/12), the ÷10 objective, the Au réel footer and the Mix table are all there, and treasurySavingPerMonth is the right reading of the empty C47. The SRL model (owner salary and UCM as charges, ISoc on the result, default 25 %) is the correct direction and the help text is right as far as it goes, but it omits the minimum director remuneration condition that this company fails at 1 500 €/month, and a flat rate cannot express the 20 %/25 % two-tier. Four points would make an accountant reject the numbers: the P&L charges column includes the 600 €/month loan repayment (Prévisionnel C37), which is not an expense; Thermomix commissions are folded into "Total CA" although the workbook keeps them outside the journal totals and Falco; the MP réel/calculé precedence flips a month to purchases as soon as one supplier line exists; and the Compte de résultats carries a what-if scenario toggle on realised months. The prior-year data that Aperçu, Mix and the period comparison depend on has no source in the draft (the workbook stores it as typed values), so those reports are empty in the first year of use. Deposits as VAT-bearing paid entries in the month received is the correct Belgian treatment; the deposit-only state leaks into the Facturé/Payé badges and the event revenue rule. The lock description contradicts itself inside 7.6, and locking the paid flag will fight real life. Smaller gaps: mixed-rate lines have no base per rate, credit notes have no kind, hours available is per year instead of per month, and six accountant questions are missing from section 9.

## Critic summary: dalia

Through Dalia's eyes the draft resolves the four requests on paper: the week is the home, every line opens the recipe at the event's portions, "oeuf" duplicates get a survivor and a remap, event lines have a course and an order, Hoona is a client with weekday templates, and the workbook's sheets map to five Comptes pages with an xlsx export in her columns. The flows count well: Tuesday morning is zero taps to see today and one tap to the Hoona amuse-bouches; Sunday evening is one click to next week and one click to create the Hoona week; closing an event is "Terminer" then "Créer la facture"; month end is Journal, export, lock. Three things would make her complain. The seven-column week on her 1366px laptop gives 139px columns, so recipe names truncate at about ten characters and the "six events and forty lines fit" claim is off by a factor of two. The journal starts "at the month of deployment", which with today's date and the 11-week plan is December 2026, so the first "Livre des recettes 2026.xlsx" the accountant opens would hold one month. On the phone the prep sheet, which the plan calls the screen the complaint is about, keeps 180px of chrome and a full-width photo above the ingredients. Several places are vague enough that the developer would guess: the phone week structure (event header or not, tap expands or navigates), whether export locks the month, what "modifier d'abord" means when a duplicate has a different unit, and what the month progress bar shows before objectives exist in slice 5. Naming has one real collision in French: "Services" for apéritif/entrée/plat next to "Courses" for groceries and "Buffet avec service" as a prestation type. Scope order is right (tokens, then recipes, then the week) but slice 2 could land the week view a week earlier by deferring statuses, course ordering and the Events restyle, and slices 1 and 2 carry cleanup she will never see. The AI proposal is a reasonable "not now plus one import feature", but it should say that a ChatGPT subscription cannot be used and that an API key with billing is needed.

## Critic summary: completeness

The draft answers every item on the brief's checklist: the four verbatim requests, the Enobase, planning, readability and open-point bullets, all nine bullets of the working interpretation, every weakness in section 3, every constraint in section 4 and all nine questions in section 5 have a concrete home in sections 3 to 8. Almost every file and line reference checks out against the code (EventEditor.tsx:66/125/136, Events.tsx:45/127, EventDetail.tsx:81/178/192/276, RecipeDetail.tsx:263/306/347/402/438, RecipeCook.tsx:19/45/52, ddb.service.ts:9/27, settings.service.ts:18, ingredients.service.ts:60-79/83, recipes.service.ts:77, ec2-bootstrap.sh:45-49/66-70, SETTINGS_TTL 120 s); the exceptions are the sidebar version string (line 86, not 94) and three off-by-one or count claims. The internal problems are mostly cross-section drift. The two that would mislead a developer are the cost formula (section 6 folds matiere extras into costSnapshot.rawMaterial, section 7.6 adds them again, and actualCost has a different meaning in the live code) and the week money strip, which in slice 2 and slice 4 compares against an objective that only exists from slice 5. The strip is also described three ways (five tiles in 5.1, four in 3 and 7.6, "cette semaine" versus "ce mois"). Smaller contradictions: "append-only ledger" versus PATCH/DELETE endpoints; "export sets locked" versus "lock is a separate action"; client delete refused (5.11) versus allowed with dangling ids (7.5 and the read rules); week helpers "deleted" (3) versus moved to dates.ts (7.1). The backfill story is dated wrong: the roadmap lands the journal in December 2026 but the open question and the risk list talk about 2025, so the first full year (2027) would have no N-1 column and migration 002 snapshots events whose revenue never enters the ledger. The three-taxonomy question is answered implicitly but the draft never states what happens to settings.recipeCategories. The screens table misses routes used elsewhere (/grocery-list/new, /clients/new, /recipes/new) and never decides the fate of RecipeEditor.tsx. New file paths are consistent between 6, 7 and 8; no file is both deleted and changed, but DataTable, MoneyTile and calcEventCost are used in earlier slices than the ones that build them.

## Critic summary: simplifier

The draft delivers the four requests and the readability goal, but it wraps them in machinery sized for a team and a fleet of devices rather than one developer and one caterer. The outcomes Dalia will notice are: readable recipes at event portions, a week and day view with prep status, oeuf/oeufs merged without losing lines, courses and order on an event, Hoona created in one tap, and a journal she can export for the accountant. None of those need a migration runner, optimistic concurrency, a bottom tab bar, a jsPDF fallback next to a print stylesheet, a generic DataTable, three confidence tiers of fuzzy matching, a month lock, pro-rata invoice attribution, or an effective-dated charge editor. I checked the code behind each claim: the backend has no tsx or scripts directory (apps/backend/package.json), DdbService.update already guards on attribute_exists (ddb.service.ts:41-69), EventEditor autosaves the whole payload 800 ms after any keystroke (EventEditor.tsx:66-98), the sidebar already has a working phone hamburger (AdminSidebar.tsx:20), and every new table costs the README's four manual steps plus config.service.ts, ec2-bootstrap.sh and data-stack.ts. Two items are rated high because they are the ones most likely to stall a solo deploy: the mandatory migration 001 with its ordering constraint, and the size of slice 2 as written. The merge's remap-before-delete order, the aliases on the survivor, the lineId and course on lines, the cost snapshot at completion, the ledger as records, the VAT identity check, and the xlsx export in the workbook's columns all stay. With the cuts, one new table is provisioned once instead of two, three migrations become zero, four endpoints and two scripts disappear, and the total drops from 46 to 55 days to roughly 31 to 38 days. I also suggest shipping the journal before clients so the ledger starts at a month boundary and the accountant's slow feedback loop opens earlier; the Hoona slice shrinks once clientId and the ledger exist.

## Critic summary: verifier

Verified by running code in /tmp/draft-verify (tailwind 3.4.19, zod 3.24.4, node 22). What passed: the current index.css measurements match the audit exactly (muted-foreground 4.44:1 on background, 4.70:1 on card, white on primary 2.86:1); the draft's muted-foreground, success, warning, info, destructive, surface, sidebar and primary-soft pairs all pass 4.5:1 (5.85, 6.09, 6.19/5.68, 4.81/4.54, 6.04/5.46, 6.33/5.59, 14.21, 14.21/12.93, 13.80). The tailwind.config snippet compiles as .cjs with the addVariant plugin, and `.reveal { @apply pointer:opacity-0 pointer:group-hover:opacity-100 touch:opacity-70 }` builds correctly into `@media (hover: hover)` and `@media (hover: none)` blocks. Every Zod snippet in section 6 behaves as described: `.required({ lineId: true })` keeps `.strict()`, the union+refine rejects a 0.02 VAT mismatch and accepts 0.01, money accepts 12.34 and rejects 12.345, and `createEventRequestSchema.partial().extend(...)` works; the claim that today's non-strict line schema strips new fields is confirmed in packages/types/src/dto/events.ts. The ISO week helpers round-trip on all edge dates (2026-01-01 → 2026-W01, 2026-12-31 and 2027-01-03 → 2026-W53, 2024-12-30 → 2025-W01). The normaliser produces `oeuf` for all five egg spellings, `sel`/`sol` stay apart, and `ail`/`ails`, `chou`/`choux`, crème fraîche, pommes de terre, huile d'olive, tomates cerises and citron vert group correctly. What failed: the primary token (25 55% 44%) measures 4.42:1 with white and 4.15:1 on background, not "about 4.6:1"; the week example "13 au 19 octobre" is wrong (2026-W42 is 12 to 18 October) and every "mardi 14 octobre" in the screens is a Wednesday; step 3 of the normaliser does not strip units glued to numbers ("400g", "1L"), so "pois chiches" and "pois chiche 400g bte" are not identique; the DL≤1 "proche" rule merges poire/poivre, sauge/sauce and farine/marine; text-sm and text-base line heights in the type table are not delivered by the config snippet; and the refined ledger union has no `.partial()`, so the PATCH ledger endpoint as written has no schema. Spot-checks of about 40 file:line references in the draft all hold except RecipeCook.tsx:45 (scaleQty is at :46) and AdminSidebar.tsx:94 (the version string is at :86).

## Findings

### [engineer-1] (high · CONFIRMED) 7.4 Event recipe ordering and course grouping

**Claim:** All of these call PUT /admin/events/:id/lines { lines } with the full ordered array; the server checks that the set of lineIds equals the stored set and returns 409 otherwise, so a stale tab cannot drop a line. Portions, notes, status and prep date go through PATCH .../lines/:lineId.

**Problem:** putEventLinesSchema is z.array(eventRecipeLineSchema.required({ lineId: true })), so the PUT body carries portions, notes, prepStatus and prepDate from the client's copy. The set check guards membership only. A laptop tab loaded before the phone ticked a line to done sends prepStatus: "todo" back on the next reorder and the tick is lost, which is exactly the whole-array overwrite the line endpoints were meant to end.

**Evidence:** Draft section 6 Zod DTOs: putEventLinesSchema definition; section 7.1 'Status: todo → doing → done written only through PATCH'. No server rule says PUT ignores those fields.

**Fix:** Make PUT take only order and course: putEventLinesSchema = z.object({ lines: z.array(z.object({ lineId: z.string().min(1), course: z.string().trim().max(40).optional() }).strict()).min(1) }).strict(); the service reorders the stored lines by lineId, applies course when present, and keeps every other stored field. Also reject payloads whose lineId array contains duplicates (set equality passes when one id is repeated).

**Refuter:** The problem is real. Draft line 536 defines putEventLinesSchema as z.array(eventRecipeLineSchema.required({ lineId: true })), and eventRecipeLineSchema (lines 514-522) carries recipeId, portions, course, notes, prepStatus and prepDate, so every PUT body contains the client's copy of the PATCH-owned fields. The only server rule stated for PUT (endpoints table line 594, section 7.4 line 717) is the lineId set-equality check; nothing says the service keeps stored values for the other fields, and line 719 ("putLines still fills a missing lineId defensively") only makes sense if the body's lines are what gets stored. expectedUpdatedAt is added to updateEventRequestSchema only, not to putEventLinesSchema (strict, lines only). So the sequence laptop-loads, phone PATCHes prepStatus done, laptop presses ▲ and PUTs the stale array passes the set check and stores prepStatus todo, which contradicts section 7.1 line 661 ("written only through PATCH ... cannot undo a tick from the phone"). The audit the draft was built on (workings/audits.md line 253) recommended an ids-only reorder DTO; the draft widened it to full lines to carry course and reintroduced the overwrite. The duplicate-id point also holds: set equality passes for [a, a, b, c] against stored {a, b, c}, and a map-by-lineId service would then store line a twice. Current code confirms the baseline (EventDetail.tsx updateRecipePortions PATCHes the whole recipes array; EventEditor.tsx line 66 buildPayload sends every field, line 98 autosaves at 800 ms; events.service.ts update spreads fields straight into ddb.update). The proposed fix is correct in substance; it is incomplete only in that three other sentences in the draft must change with it and the service algorithm should be spelled out.

**Corrected fix:** Keep the critic's DTO: putEventLinesSchema = z.object({ lines: z.array(z.object({ lineId: z.string().min(1), course: z.string().trim().max(40).optional() }).strict()).min(1) }).strict().refine((v) => new Set(v.lines.map((l) => l.lineId)).size === v.lines.length, "lineId dupliqué"). Service putLines(eventId, body): load the event; build byId = Map(stored.recipes by lineId); return 409 LINES_CHANGED when body.lines.length !== stored.recipes.length or any body lineId is missing from byId (with the Zod duplicate refine this is set equality); write recipes = body.lines.map((l) => ({ ...byId.get(l.lineId), ...(l.course !== undefined && { course: l.course }) })) through ddb.update, so recipeId, portions, notes, prepStatus and prepDate always come from storage. No expectedUpdatedAt on this endpoint: a stale reorder merges cleanly, it does not need to 409. Then update the draft for consistency: (1) section 6 line 536 and the endpoints row at line 594 ("putEventLinesSchema; body is { lineId, course? }[] in the new order; the server rewrites stored lines in that order, applies course when sent, keeps every other stored field; 409 when the id set differs or an id repeats"); (2) section 7.4 line 717, replace "with the full ordered array" with "with the ordered list of { lineId, course? }" and add the sentence "PUT never writes portions, notes, prepStatus or prepDate; a laptop tab that reorders after the phone ticked a line keeps the tick"; (3) section 7.4 line 719, drop putLines from "still fill a missing lineId defensively" since the PUT body no longer carries lines to fill; (4) section 10 "Whole-array overwrites" risk, note that EventDetail's reorder path is covered by the merge-by-lineId rule and only EventEditor depends on the diff-based autosave and expectedUpdatedAt. Section 8 slice 2 scope wording ("PUT /admin/events/:id/lines with the set check") can stay.

### [engineer-2] (medium) 5.8 Événements (liste) and éditeur / 6 Endpoints

**Claim:** PATCH /admin/events/:id with updateEventRequestSchema; expectedUpdatedAt mismatch → 409. EventEditor sends recipes only when a line was added or removed. Not strict for one release: old bundles may be cached.

**Problem:** updateEventRequestSchema = createEventRequestSchema.partial() still accepts the whole recipes array, so the old path survives next to the line endpoints. EventDetail.tsx:180 saveField({ recipes }) and any cached old bundle send the full array without expectedUpdatedAt, so the guard is bypassed and prepStatus, notes, course and prepDate set elsewhere are overwritten. Section 10 names the risk but the design does not close it.

**Evidence:** apps/frontend/src/pages/admin/EventDetail.tsx:178-181 updateRecipePortions → saveField({ recipes }); apps/backend/src/events/events.service.ts:42-51 spreads fields straight into ddb.update; packages/types/src/dto/events.ts:29 .partial().

**Fix:** In EventsService.update, when fields.recipes is present merge by lineId against the stored array: keep stored prepStatus, notes, course and prepDate unless the incoming line carries the key explicitly, and fill lineId only for lines without one. Require expectedUpdatedAt whenever recipes is present. In the new EventDetail, route portions through PATCH .../lines/:lineId and delete updateRecipePortions.

### [engineer-3] (medium) 5.8 Événements (liste) and éditeur

**Claim:** buildPayload (line 66) sends only fields changed since load (a dirty set compared against a loadedRef) ... and includes expectedUpdatedAt; a 409 shows 'Modifié ailleurs, recharger'.

**Problem:** Three gaps. (1) On /events/new the first autosave is a POST (EventEditor.tsx:79-84) which has no condition; the second autosave is a PATCH and needs the updatedAt returned by the POST, so loadedRef must be refreshed from every create and update response or the editor 409s against its own save. (2) expectedUpdatedAt arrives inside fields and EventsService.update spreads fields into ddb.update, so it is written as an attribute unless destructured out. (3) After a 409 the 800 ms timer keeps firing on every keystroke with the same stale value, producing a toast per keystroke.

**Evidence:** apps/frontend/src/pages/admin/EventEditor.tsx:72-100 (autoSave, create then update, timer); apps/backend/src/events/events.service.ts:42-48; apps/backend/src/shared/ddb.service.ts:41-69 (update builds names from the fields object).

**Fix:** Specify: loadedRef = response after every successful POST or PATCH; EventsService.update destructures { expectedUpdatedAt, ...fields } and passes it to ddb.update(table, key, fields, { expectedUpdatedAt }); ddb.update adds '#updatedAt' to ExpressionAttributeNames and ':expected' to values and appends ' AND #updatedAt = :expected'; on 409 the editor sets a blocked flag that disables autosave until 'Recharger' reloads the event.

### [engineer-4] (medium) 6 Data model changes, Zod DTOs

**Claim:** POST / PATCH / DELETE /admin/ledger[/:id] body: createLedgerEntrySchema / partial

**Problem:** createLedgerEntrySchema is z.union([salesSchema, purchaseSchema]).refine(...), a ZodEffects over a ZodUnion. Neither ZodEffects nor ZodUnion has .partial(), so the PATCH schema cannot be derived as written, and a partial edit of totalTvac alone would skip the VAT identity anyway.

**Evidence:** Draft section 6 ledger.ts snippet; zod 3.25.76 installed (audits.md datamodel section, node_modules).

**Fix:** Define updateLedgerEntrySchema = z.object({ expectedUpdatedAt: z.string().optional() }).merge(salesSchema.partial()).or(purchaseSchema.partial()) is still awkward; simpler: the PATCH handler loads the stored entry, merges the partial body, and validates the merged object with createLedgerEntrySchema, so the identity and the book literal are re-checked on every edit. Keep a thin patchLedgerEntrySchema = z.object({...}).partial().strict() of editable keys for input hygiene.

### [engineer-5] (medium) 6 Endpoints / 7.3 Ingredient merge

**Claim:** GET /admin/ingredients/duplicates ... POST /admin/ingredients/merge

**Problem:** ingredients.controller.ts declares @Get(":id") as its second route. Express matches routes in declaration order, so GET /admin/ingredients/duplicates resolves to getOrFail("duplicates") and returns 404 unless the new route is declared above @Get(":id"). The recipes controller already orders @Get("photo") before @Get(":id") for the same reason.

**Evidence:** apps/backend/src/ingredients/ingredients.controller.ts:16-19 (@Get(":id")); apps/backend/src/recipes/recipes.controller.ts:75 (@Get("photo")) before :84 (@Get(":id")).

**Fix:** State in 7.3: declare @Get("duplicates") before @Get(":id") in IngredientsController. POST merge and POST import have no conflict.

### [engineer-6] (medium) 7.3 Ingredient merge / 6 Backend plumbing

**Claim:** DELETE /admin/ingredients/:id gains a reference scan and returns 409 IN_USE with recipe names. GET duplicates returns recipeCount and listCount per member. EventsModule imports RecipesModule and IngredientsModule.

**Problem:** RecipesModule already imports IngredientsModule (RecipesService injects IngredientsService). If the reference scan or the counts are implemented by injecting RecipesService into IngredientsService, Nest reports a circular module dependency. The EventsModule import of Recipes and Ingredients is safe: neither of those modules imports EventsModule, and ClientsModule/LedgerModule importing EventsModule adds no cycle either.

**Evidence:** apps/backend/src/recipes/recipes.module.ts:9 imports IngredientsModule; apps/backend/src/recipes/recipes.service.ts:12-15 injects IngredientsService; apps/backend/src/events/events.module.ts imports only AuthModule; apps/backend/src/shared/shared.module.ts is @Global so DdbService is available everywhere.

**Fix:** Write in 7.3 that IngredientsService reads recipes and grocery lists through this.ddb.scanAll(this.ddb.tables.recipes) and this.ddb.tables.groceryLists, never through RecipesService or GroceryListsService. Keep the note that EventsModule → RecipesModule → IngredientsModule is acyclic.

### [engineer-7] (medium) 7.3 Ingredient merge

**Claim:** Step 3: rewrite items[].ingredientId, refresh the denormalised fields from the survivor, merge duplicates by ingredientId:unit summing totalQty and haveQty, checked = a && b.

**Problem:** Saved grocery lists are records of past shopping; refreshing pricePerUnit, priceUnit and supplier from the survivor changes their totals after the fact, which contradicts the brief's rule that records are not silently rewritten. haveQty is optional (GroceryListItem.haveQty?), so summing undefined + number yields NaN and the Zod preprocess on PATCH will reject the item on the next autosave.

**Evidence:** packages/types/src/entities/grocery-list.ts (haveQty?: number); packages/types/src/dto/grocery-lists.ts:11 haveQty preprocess; 00-brief.md section 4 'ledger lines are records, derived reports are views'.

**Fix:** Rewrite ingredientId and name only; leave pricePerUnit, priceUnit and supplier as stored. When collapsing two items: totalQty = a + b; haveQty = (a.haveQty ?? b.haveQty) === undefined ? undefined : (a.haveQty ?? 0) + (b.haveQty ?? 0); checked = a.checked && b.checked.

### [engineer-8] (medium) 7.3 Ingredient merge, Detection

**Claim:** for keys of five or more characters pairs those at Damerau-Levenshtein ≤ 1 (proche) ... marks a strict token subset as a_verifier, never preselected.

**Problem:** Only a_verifier is excluded from preselection, so proche groups arrive with the merge box ticked. Distance 1 on five-letter food words produces real different ingredients: poire/poivre (insertion), creme/crepe after NFD stripping, pate/pates after singularisation is avoided but farine/marine is not. One tap on 'Fusionner' then rewrites every recipe using the wrong survivor and deletes the other ingredient.

**Evidence:** Draft 7.3 Detection paragraph; normalizeIngredientName step 1 strips accents so crème and crêpe both become creme/crepe.

**Fix:** Never preselect proche members either; preselect only identique. Require the same first three letters for a proche pair, and show the two names side by side with their recipe counts before enabling the button.

### [engineer-9] (medium) 6 Backend plumbing / 8 Slice 1

**Claim:** Delete packages/utils (update jest.config.js moduleNameMapper, tsconfig.json paths, and the root type-check script) and the dead TABLE_NAMES export.

**Problem:** No app or package imports @packages/utils, so the deletion is safe, but the edit list is incomplete: jest.config.js has a whole 'utils' project block (lines 77-100) in addition to the backend moduleNameMapper (31-35); .github/workflows/cd-release.yml:118-122 uploads packages/utils/dist as an artifact and will fail the release job; .github/workflows/security-basic.yml:44-45 cds into packages/utils. TABLE_NAMES also exists in packages/utils/src/constants.ts, which goes with the package.

**Evidence:** grep for 'packages/utils' and '@packages/utils' across the repo excluding node_modules and docs: package.json:11, jest.config.js:31-35 and :77-100, tsconfig.json:19-20, pnpm-lock.yaml:410, .github/workflows/cd-release.yml:120-121, .github/workflows/security-basic.yml:45. No hit under apps/ or packages/types.

**Fix:** Extend the list: remove the utils project from jest.config.js, the artifact upload step in cd-release.yml, the audit line in security-basic.yml, then pnpm install to refresh the lockfile. TABLE_NAMES export at packages/types/src/index.ts:3 and packages/types/src/constants/ can go in the same commit.

### [engineer-10] (low) 3 Information architecture, Sidebar

**Claim:** The version string at AdminSidebar.tsx:94 moves to Paramètres.

**Problem:** Line 94 is the LogOut icon. The version string 'admin · v1.0' is at line 86.

**Evidence:** apps/frontend/src/components/admin/AdminSidebar.tsx:86 `admin · v1.0`; :94 `<LogOut className=...>`.

**Fix:** Change to AdminSidebar.tsx:86.

### [engineer-11] (low) 3, 5.3, 7.6 and 10: file:line references

**Claim:** Dashboard.tsx:104-106 for new Date().getMonth(); estimateBelgianTax (lines 308 to 325); scaleQty moved from RecipeCook.tsx:45; generateGroceryList (Events.tsx:81-134).

**Problem:** Four references are off by one or two: the getMonth call is at Dashboard.tsx:108 (new Date at 106); estimateBelgianTax spans 308-326; RecipeCook.tsx:45 is portionRatio and scaleQty starts at 46; generateGroceryList ends at 138 with its finally block. Every other reference in the reviewed sections is correct: Dashboard:49, EventEditor:66/:125/:136, EventDetail:81/:178/:192/:276, Events:45/:127, GroceryListPage:21/:46/:576, RecipeDetail:263/:306/:347/:356/:402/:438, RecipeCook:19/:52, Ingredients:105, ingredients.service:60-79/:83, recipes.service:77, settings.service:18, ddb.service:9/:27, Recipes:85/:113-116, ec2-bootstrap.sh:45-49/:66-70, setup-ssm-params.sh, data-stack.ts (five tables; README.md:149 saying two is stale).

**Evidence:** awk/sed line dumps of each file during this review.

**Fix:** Dashboard.tsx:106-108; estimateBelgianTax lines 308 to 326; RecipeCook.tsx:46; Events.tsx:81-138.

### [engineer-12] (medium) 5.11 Clients versus 7.5 Clients and weekly templates

**Claim:** 5.11: delete is refused with 409 when events reference the client and the UI offers 'Archiver'. 7.5: Deleting a client keeps its events; a dangling clientId renders as the stored contactName.

**Problem:** The two sections specify opposite behaviours for the same DELETE /admin/clients/:id, and the endpoint table says 409 IN_USE. A developer implementing 7.5 ships a path the screen spec says cannot exist.

**Evidence:** Draft lines for 5.11 Interactions and 7.5 Editing paragraph; section 6 endpoint table row 'DELETE 409 IN_USE'.

**Fix:** Keep one rule: DELETE returns 409 IN_USE when any event has clientId = id; the UI offers active: false. Rewrite the 7.5 sentence to 'A client with events cannot be deleted, only archived; its events keep clientId.' The contactName fallback stays for events created before slice 3.

### [engineer-13] (medium) 5.9 Courses / 7.1 Interactive planning

**Claim:** a banner '3 événements modifiés depuis la génération · Régénérer' when any linked event's updatedAt is newer than the list. Status writes PATCH /admin/events/:id/lines/:lineId { prepStatus }.

**Problem:** Every status tick goes through EventsService and bumps event.updatedAt, so the banner fires for every grocery list of the week as soon as cooking starts, and an open EventEditor gets a 409 on its next autosave after any tick on the phone. The second is intended; the first is noise that trains Dalia to ignore the banner.

**Evidence:** apps/backend/src/events/events.service.ts:42-48 always writes updatedAt; draft 5.9 banner rule; draft 10 risk 'Whole-array overwrites'.

**Fix:** Add menuUpdatedAt on the event, bumped only by line add/remove, portions, prepDate and course changes and by PATCH /events/:id when recipes or guestCount change; the Régénérer banner compares the list's createdAt against menuUpdatedAt. Status and notes PATCHes bump updatedAt only.

### [engineer-14] (low) 7.3 Ingredient merge, Endpoint step 4 (207)

**Claim:** If any failure: return 207 with { recipesUpdated, listsUpdated, failures } and stop.

**Problem:** Nest cannot pick 207 or 200 per call with @HttpCode; the handler needs @Res({ passthrough: true }) and res.status(207). On the frontend, api.ts parseResponse treats every 2xx as success, so withInvalidate fires and the caller must inspect failures in the body; the draft's UI text ('on 207 the group stays open') implies a status check that the client does not expose.

**Evidence:** apps/frontend/src/lib/api.ts:15-22 parseResponse checks res.ok only; Nest 10 @HttpCode is static.

**Fix:** Return 200 with { ok: false, failures } or document the @Res passthrough and add a status field to the body; api.ingredients.merge returns the parsed body and the page branches on failures.length.

### [engineer-15] (low) 6 Migration runner

**Claim:** apps/backend/scripts/ does not exist and neither tsx nor ts-node is installed. Runner: import "dotenv/config", new ConfigService(), new DdbService(config).

**Problem:** ts-node 10.9.2 is a devDependency of infrastructure/ (in the pnpm workspace) and @swc/cli is a backend devDependency, so 'neither is installed' is wrong for the workspace, though tsx is still the simplest choice. Two details to state: new ConfigService() parses the full schema, so a table-only migration still needs S3_BUCKET, ADMIN_CREDENTIALS and a 32-char JWT_SECRET in .env (fine on EC2, a surprise locally); scripts/ sits outside apps/backend/tsconfig.json include: ["src"], so tsc --noEmit never type-checks the runner. tsx/esbuild does not emit decorator metadata, which is fine because nothing is resolved through Nest DI. dotenv resolves .env from cwd, which is apps/backend under pnpm --filter exec, so the path works.

**Evidence:** infrastructure/package.json:18 ts-node; apps/backend/package.json devDependencies @swc/cli; apps/backend/src/config/config.service.ts:4-16; apps/backend/tsconfig.json include.

**Fix:** Rewrite the sentence as 'tsx is not installed in apps/backend; add it as a devDependency'. Add a tsconfig.scripts.json extending the backend one with include: ["scripts"] and a type-check:scripts script. Note the full env requirement.

### [engineer-16] (low) 6 Migration runner, 002-cost-snapshots

**Claim:** Runner: scanAll the table, compute a patch per item or null, ddb.update per item.

**Problem:** 002 computes calcEventCost, which needs every recipe and ingredient, not only the events table; the single-table runner contract has no hook for that. 001 also overwrites the whole recipes array per event, so a concurrent autosave in the same second is lost or wins; at one user this is a timing note, not a bug.

**Evidence:** Draft 6 Migration runner paragraph; recipe-helpers.ts calcRecipeCost signature needs ingredients.

**Fix:** Give migrations a prepare(ddb) step returning context (recipeById, ingredientById) before the per-item patch function. Add 'run 001 and 002 with no editor open' to the deploy order.

### [engineer-17] (low) 4 / 8 Slice 1: tailwind.config.ts edits

**Claim:** Type scale table: text-sm 14px / 1.5, text-base 16px / 1.6. fontSize: { caption, lead, h3, h2, h1, h1-lg, cook, cook-lg }. spacing: { block: "2.5rem", tap: "2.75rem" }.

**Problem:** The snippet never overrides sm and base, so they stay at Tailwind's 14px/20px (1.43) and 16px/24px (1.5), not the table's values. spacing.tap duplicates the default key 11 (2.75rem), which min-h-11 already uses. Everything else checks out on the installed Tailwind 3.4.19: tuple values with { lineHeight, fontWeight }, maxWidth.doc/wide, addVariant with @media strings, stacked custom variants inside @apply (pointer:group-hover:opacity-100), arbitrary calc(100dvh-...) heights, and require() in the ESM .ts config (already used at tailwind.config.ts:46).

**Evidence:** apps/frontend/node_modules/tailwindcss/package.json version 3.4.19; apps/frontend/tailwind.config.ts.

**Fix:** Add sm: ["14px", "1.5"], base: ["16px", "1.6"] to extend.fontSize if the table is the spec; drop spacing.tap and use min-h-11 min-w-11.

### [engineer-18] (low) 3 Phone / 4 Phone versus laptop rules

**Claim:** The 52px top bar shows a breadcrumb... AdminLayout.tsx keeps pt-[68px] on phones and adds pb-[64px]... GroceryListPage sizes with h-[calc(100dvh-52px-64px)].

**Problem:** A 52px bar with a 68px top padding leaves 16px of dead space on every phone page, and the grocery height formula assumes 52px while the layout reserves 68px, so the full-bleed page overflows by 16px under the tab bar.

**Evidence:** apps/frontend/src/components/admin/AdminLayout.tsx:14 `pt-[68px]`; draft 3 Phone paragraph and 4 rule on fullBleed.

**Fix:** Pick one bar height (52px) and set pt-[52px] in AdminLayout, or keep 68px in both places.

### [engineer-19] (low) 6 Backend plumbing: IngredientsService.importIngredients alias matching

**Claim:** importIngredients (existingByName, line 83) and importRecipes (ingByName, line 77) match on nameLower or any alias.

**Problem:** existingByName is keyed by raw nameLower, and aliases are stored as nameLower values of merged rows, so a CSV row 'Oeuf' misses alias 'oeuf (pièce)' even though normalizeIngredientName would join them. Also importIngredients overwrites unit on a match (ingredients.service.ts:97-101); once alias matching widens which rows match, an import priced per kg can silently change the family of a per-piece survivor and corrupt every recipe line's cost.

**Evidence:** apps/backend/src/ingredients/ingredients.service.ts:83 and :93-104; draft 6 Ingredient aliases definition.

**Fix:** Key the lookup by normalizeIngredientName on both sides (survivor name and aliases). On a match whose unit family differs from the stored one, skip the row and report it in unmatched instead of updating unit.

### [engineer-20] (low) 6 Data model changes: packages/types/src/lib/reports.ts

**Claim:** reports.ts: incomeStatement, apercu, mix, previsionnel, auReel, all pure and covered by the existing types jest project.

**Problem:** The types project exists in jest.config.js but packages/types has zero test files today and the root pnpm test runs only @apps/backend, so nothing would execute those fixtures in CI without a script change.

**Evidence:** find packages/types -name '*.test.ts' -o -name '*.spec.ts' returns nothing; package.json:12 "test": "pnpm --filter @apps/backend test".

**Fix:** Change the root test script to also run pnpm --filter @packages/types test, and list the first fixture file (reports.test.ts) in slice 5's file list.

### [engineer-21] (low) 7.3 Ingredient merge, Failure handling and concurrency

**Claim:** Re-running the same payload is idempotent ... the re-scan before delete catches a reintroduced reference.

**Problem:** The ordering and idempotency hold as written: missing merged ids are treated as done, aliases union is idempotent, batchDelete of absent keys is a no-op. Two edges are not covered: a concurrent importIngredients between steps 1 and 6 can re-create a merged name as a new ingredient (not in mergedIds, so it survives and the group reappears, harmless) and from then on a live nameLower and a survivor alias collide, and importIngredients needs a tie-break. A recipe that already held two lines for the survivor with the same unit gets them summed too, which changes a recipe the user did not touch.

**Evidence:** Draft 7.3 steps 1 to 7; ingredients.service.ts importIngredients creates rows by nameLower.

**Fix:** Add: live nameLower match beats alias match in both imports; the summing rule applies only to lines that were rewritten in this merge, pre-existing duplicate lines on the survivor are left alone and reported.

### [engineer-22] (low) 6 Data model changes: config.service.ts optional tables

**Claim:** CLIENTS_TABLE and LEDGER_TABLE as z.string().min(1).optional(); DdbService.requireTable("clients") throws ServiceUnavailableException at first use.

**Problem:** Works as designed: schema.parse at boot no longer fails, tables.clients becomes string | undefined and each service's private get table() calls requireTable. One wrinkle: /health is excluded from the api prefix and returns { status: "ok" } only, so the risk section's '/health reports which tables are configured' needs HealthController to inject ConfigService; nothing says so.

**Evidence:** apps/backend/src/config/config.service.ts:7-11 and :34-42; apps/backend/src/health.controller.ts; apps/backend/src/main.ts:9.

**Fix:** Add HealthController to the slice 3 file list with a tables: { clients: boolean, ledger: boolean } field.

### [engineer-23] (medium) 8 Roadmap: effort estimates

**Claim:** Slice 1: 9 to 10 days. Slice 2: 10 to 12 days. Slice 5: 10 to 12 days. Total about 46 to 55 days.

**Problem:** Slice 1 bundles a token pass that edits every admin page (57 uppercase and 14 text-[10px]/[11px] hits verified under pages/admin), ten new primitives, a RecipeDetail read mode, a RecipeCook rewrite, moving the cost maths into packages/types, a normaliser with Damerau-Levenshtein, two endpoints with 207/409 paths, a reference-scanning delete, batch retry, alias matching in two imports, a new page, a create-time warning, breadcrumbs, the utils deletion, two lint scripts and a kitchen session; that is 12 to 15 days. Slice 2 has three new pages with phone layouts, four line endpoints, optimistic concurrency end to end, an autosave rewrite, an Events list rewrite, a grocery generation page plus banner, MobileTabBar, print CSS, day-pdf.ts and the migration runner; 14 to 18 days. Slice 5 carries five report pages plus the InlineField and DataTable refactors, the grocery card layout, drag reorder, a menu PDF and supplier colours. The brief says 'solo developer, limited time'; the total is closer to 60 to 70 days.

**Evidence:** grep counts: 57 'uppercase' lines and 14 'text-[10px]|text-[11px]' lines under apps/frontend/src/pages/admin; file lists in 7.1 to 7.3 and 8; 00-brief.md section 4 constraints.

**Fix:** Raise slice 1 to 12-15 and slice 2 to 14-18 days, or move the merge endpoint and duplicates page to a slice 1b, and move drag reorder, day-pdf.ts and 'Proposition de menu' to an explicit 'if time' list. State the total as 60 to 70 days.

### [accountant-1] (high · CONFIRMED) 7.6 Accounting, SRL tax model / 6 Settings FixedCharge

**Claim:** Résultat avant impôts = CA HTVA − Coûts MP − Charges fixes − Personnel extra − Autres coûts, with charges fixes(m) = Σ monthlyAmount of every active FixedCharge, and the category list includes "remboursement".

**Problem:** The workbook's charge list is a cash budget for the breakeven, not a P&L. It contains "Remboursement investissment dirigeant" 600/month (a loan principal repayment, balance sheet not expense) and the breakeven also adds treasury savings and the investment envelope. Summing every line into Résultat avant impôts understates the taxable result by 7 200 €/year and the ISoc estimate with it; the accountant's figure will disagree.

**Evidence:** Prévisionnel financier B37 "Remboursement investissment dirigeant" C37 600, included in C41 =SUM(C11:C40) and C42 =C41*12 which feed B3 (breakeven); Analyse marge E1 "charges fixes (rému dirigeant inclu)" is a separate hand-typed column, empty in the live file. Draft lines 759 and 773.

**Fix:** Add `inResult: boolean` (default true) to FixedCharge, default false for category "remboursement"; Compte de résultats sums only `inResult` lines, Prévisionnel breakeven and Besoin de trésorerie sum all lines. Same split for "Bénéfice avant impôts prévu" in 5.15. Add the question to section 9.

**Refuter:** Confirmed against the workbook and the draft. Workbook "Prévisionnel financier" (read with xlsx, formulas on): B37 "Remboursement investissment dirigeant", C37 = 600, D37 = 600 (also in the "sans salarié" column); C41 = SUM(C11:C40) = 7 527,27; C42 = C41*12 = 90 327,24; B3 = C42+(C47*12)+C48 = 95 827,24 (C47 treasury saving is empty, C48 = 5 500 investment envelope). "Simulation si seule" has the same B37/C37 = 600 inside C41 = SUM(C11:C40). "Analyse marge" E1 = "charges fixes (rému dirigeant inclu)", E2:E13 are empty with no formula (E16 = SUM(E2:E13) = 0), and G2/G3 (bénéfice avant impôts) are hand-typed values, so the workbook never links the charge list to the income statement; the critic's description is exact. Draft: line 420 FixedCharge.category includes "remboursement"; line 759 charges fixes(m) = Σ monthlyAmount of every active row; line 763 "Charges annuelles = Σ monthly × 12"; line 768 "Bénéfice avant impôts prévu = annualRevenue × (1 − rawMaterialPct) − Charges annuelles − extrasBudget"; line 773 "Résultat avant impôts = CA HTVA − Coûts MP − Charges fixes − Personnel extra − Autres coûts"; line 780 Simulation row "Charges = Σ active charges × 12". A repayment of the director's investment is a reduction of a liability (compte courant / prêt), not a charge; only interest, if any, is a charge. With every line summed, the monthly result is understated by 600 € and the annual taxable result by 7 200 €, so ISoc prévu and the Impôts column are understated by 1 800 € at the draft's 25 % default. The draft already keeps treasury savings and the investment envelope out of the result (line 768 subtracts only Charges annuelles), so the critic's point about those two applies to the workbook's F10/F12, not to the draft; the remboursement line is the real defect. No code exists yet for FixedCharge (grep over packages/types/src, apps/backend/src, apps/frontend/src is empty; packages/types/src/entities/settings.ts has only recipeCategories and suppliers), so no migration is needed. The proposed fix is right in direction but incomplete: 7.6 reuses one symbol "Charges annuelles" for both the cash breakeven (line 764) and the taxable result (line 768), the Simulation row (line 780) and the "Charges fixes / CA" ratio are not covered, the flag is stated as required rather than optional-on-read, and nothing shows Dalia why her 7 527,27 total no longer equals the income statement column.

**Corrected fix:** 1. Section 6, FixedCharge (draft line 420): add `inResult?: boolean;  // undefined reads as category !== "remboursement"`. Add the same optional boolean to the settings Zod DTO (dto/settings.ts fixedCharges item). Add to "Backward-compatible read rules": `inResult ?? charge.category !== "remboursement"`. No migration: fixedCharges is a new settings key with no live rows.

2. Section 7.6 "Fixed charges and breakeven" (lines 759-768): define two sums instead of one. `charges caisse(m)` = Σ monthlyAmount (or monthlyAmountSolo) of every row active in m; `charges résultat(m)` = the same sum over rows with inResult true. Then: Charges annuelles caisse = Σ charges caisse × 12; Seuil annuel = Charges annuelles caisse + 12 × treasurySavingPerMonth + Σ investments (unchanged, matches C42 + C47*12 + C48); Seuil mensuel and Seuil ajusté matières use the caisse figure; Besoin de trésorerie = charges caisse(m) × treasuryMonths; Bénéfice avant impôts prévu = annualRevenue × (1 − rawMaterialPct) − Charges annuelles résultat − extrasBudget; ISoc prévu and Marge nette prévue % follow from that.

3. Section 7.6 "SRL tax model" (line 773) and the Compte de résultats report (line 780): Charges fixes column = charges résultat(m); the Simulation row uses Charges = Σ charges résultat × 12; the ratio Charges fixes / CA uses the same column. The "Compte de résultats" sheet of the xlsx export inherits this through reports.ts.

4. Section 5.15 and 5.17 UI: the charge table gets a "Dans le résultat" toggle column (default on; off by default when category is remboursement) and shows two totals, "Total charges mensuelles" (caisse, matches the workbook's 7 527,27) and "dont hors résultat" (600). Rows with inResult false carry a Tag "hors résultat" in the Prévisionnel and Paramètres tables so the gap between breakeven and income statement is visible.

5. Section 9, new question: "La ligne 'Remboursement investissement dirigeant' (600 €/mois) est-elle un remboursement de capital (hors compte de résultats) ou comprend-elle des intérêts ? Default: capital only, excluded from the result and from the ISoc estimate, kept in the breakeven and the treasury need; if interest is charged, enter it as a separate 'frais' line." Optionally note in the same question that the management income statement has no amortissements line, so the accountant's statutory result will still differ by depreciation; that is outside this finding.

### [accountant-2] (high · CONFIRMED) 5.13 Aperçu / 7.6 Reports / 9 Q7

**Claim:** Aperçu shows CA HTVA N−1, Mix shows CA N−1 and %, Comparaison par période covers N, N−1, N−2; open question 7 defaults to no import, "the 2025 column stays empty until she asks".

**Problem:** Every prior-year figure in the workbook is a typed value, not a journal derivation, and the draft gives it no storage. With no import, Aperçu's N−1 column, Δ %, the Mix N−1 column and the period comparison are empty for all of 2026 and the comparison stays empty until 2028. Those are the columns the coach built the sheet around.

**Evidence:** Apercu par mois B3:B14 typed monthly 2025 totals (B3 9000.73), B18 "Total 2024" 140654.88, B22:B28 typed 2024 per type (B22 90703.19, B23/B24 text "ensemble avec ..."), recettes 2025 B185:C190 typed 2023/2024 period totals. Draft line 778 and 867.

**Fix:** Add `priorYear?: { monthly: Record<string, number>; byPrestation: Record<string, number>; byPeriod?: { label: string; from: string; to: string; amount: number }[] }` to YearObjective, editable in Paramètres › Objectifs with a "Reprendre du classeur" paste helper (12 + 7 + 4 numbers). Change Q7's default to "import the totals, not the lines".

**Refuter:** The problem is real. Evidence checked in the workbook with the xlsx package, formulas preserved: "Apercu par mois" B3:B14 are typed 2025 monthly HTVA (B3 9000.73, B4 12637.41, B5 15311.1, B6 22946.12, B7 21701.5, B8 28214.78, B11 19974.94, B14 10868.3, others 0); C3:C14 (2026) are empty and D3:D14 are formulas (C-B)/B; B22:B28 are typed 2024 per-type figures (B22 90703.19, B25 3441.49, B26 11166.64, B27 95953.32, B28 17650.21) with B23 and B24 as text ("ensemble avec buffet à emporter", "ensemble avec walking"), while the 2025 per-type column D22:D28 is a formula over the month sheets' M42:M50, which are empty, so it evaluates to 0; "recettes 2025" B185/C185 (17474, 41592) and B190/C190 (20381, 57050) are typed 2023/2024 period totals. The journal area of "recettes 2025" (rows 11-138, columns A-N) contains zero non-empty cells, and all twelve month sheets have zero data rows. The draft gives these figures no storage: `YearObjective` in docs/redesign/02-synthesis-draft.md section 6 has no prior-year field, grep finds no "2024", "2023", "actuals" or similar key, line 841 says "No ledger backfill: the journal starts at the month of deployment; the 2025 workbook stays the record for 2025", and line 778 defines CA N as Σ ledger `htva` by `ym` with nothing for N−1. So Aperçu's CA HTVA N−1 and Δ %, the Mix N−1 column and the Comparaison par période are blank for all of 2026, and the comparison's N−2 column stays blank until 2028. The critic's fix is right in direction (store typed totals, change Q7's default) but wrong in shape and in two facts: (1) nesting `priorYear` under the objective of year N cannot serve N−2, mislabels the 2024 per-type figures as N−1, and forces a copy every January; (2) the per-type block holds 5 numbers, not 7, and no typed 2025 per-type figure exists anywhere in the file; (3) B18 "Total 2024" 140654.88 equals Σ B3:B14 exactly, so it is the 2025 total under a stale label and must not be pasted as a 2024 figure. One more fact the fix ignores: "Au réel 2025" holds 75 typed rows (label, type, CA HTVA) in twelve monthly blocks whose totals match Apercu B3:B14 for ten months but not October (1125 vs 0) or December (0 vs 10868.30), so a line-level import is partly possible but cannot be the N−1 source.

**Corrected fix:** 1. Storage keyed by year, not on the objective. In `packages/types/src/entities/settings.ts` add `yearActuals?: Record<string, YearActuals>` to `AppSettings` (keys "2023", "2024", "2025") with `interface YearActuals { monthly?: Record<string, number>; /* "01".."12", CA HTVA */ byPrestation?: Record<string, number>; /* prestation key -> CA HTVA; absent = unknown */ byPeriod?: { from: string; to: string; amount: number }[]; /* "MM-DD" */ note?: string }`. Zod in `dto/settings.ts` with `money` values. Reason: Comparaison par période needs N−2, the workbook's per-type figures are 2024 (N−2 in 2026), and in 2027 N−1 comes from the ledger while N−2 reads `yearActuals["2025"]` with no copy step.

2. Precedence in `packages/types/src/lib/reports.ts`: for a year Y, `caByMonth(Y)` = Σ sales `htva` by `ym` when the ledger has at least one sales entry dated in Y, else `yearActuals[Y]?.monthly`; same rule for `byPrestation` and for `byPeriod` (derive a period from `monthly` only when its bounds are month ends, else blank). Figures that come from `yearActuals` carry a `Tag "saisi"` with the note as tooltip, the same pattern as "figé / calculé" in 5.14. Δ % stays blank when N−1 is missing. Update draft lines 778-779 to state this rule for CA N−1, Mix N−1 and the comparison.

3. Paramètres › Objectifs gains a section "Années précédentes": per year, a 12-cell monthly form, a per-type list and a period list; a paste helper is optional. What to enter from this file: 2025 `monthly` from Apercu B3:B14 (total 140 654.88; B18's "Total 2024" label is stale); 2024 `byPrestation` from B22:B28 as five values (menu_a_emporter 90703.19 including buffet à emporter, walking_cocktail 95953.32 including buffet avec service, atelier 3441.49, brunch 11166.64, chef_a_domicile 17650.21) with the two merged types shown as "inclus dans ..." in the Mix; `byPeriod` for 2023 (01-01 to 04-30: 17474; 04-30 to 06-30: 20381) and 2024 (41592; 57050) from recettes 2025 B185:C190. No typed 2025 per-type figure exists in the file (D22:D28 sum empty month sheets), so Mix N−1 in 2026 stays blank unless she types it or imports the Au réel lines.

4. Reword Q7: "The 2026 file holds no 2025 journal lines (recettes 2025 rows 11-138 are empty). Default: enter the typed totals (2025 monthly, 2024 by type, 2023 and 2024 period totals) in Paramètres when slice 5 ships, so Aperçu, Mix and Comparaison are filled from day one. Optional: import the 75 'Au réel 2025' rows (label, type, CA HTVA) as sales entries flagged `imported` to fill the 2025 mix by type; their monthly totals match Apercu for ten months but not October (1 125 vs 0) or December (0 vs 10 868,30), so the typed totals remain the N−1 source and the imported lines only feed the mix. Ask whether the 2025 workbook file exists if she wants line-level history."

5. Update draft line 841 to "No ledger backfill; prior-year totals are carried in `settings.yearActuals`", and add `yearActuals` with its Paramètres section to the slice 5 scope (line 847). Keep these figures out of the ledger: they are reference values, not journal records, so the export and "Verrouiller le mois" never see them.

### [accountant-3] (high · CONFIRMED) 7.6 Reports (Journal, Aperçu) / 6 LedgerEntry

**Claim:** "Total CA mm/aaaa" = Σ HTVA of sales entries; commissions are sales entries at rate 0 and get their own row in Mix; the month sheets export every sales line.

**Problem:** The workbook keeps Thermomix commissions outside the journal: they sit in a separate block per month, are not in the TOTAL row at 140, and the HTVA total at 162 does not pick them up. Analyse marge's CA column is "selon falco", and commissions are not Falco invoices. Counting them in Total CA makes the app's monthly CA disagree with Falco and with what the accountant books as commission income.

**Evidence:** recettes 2025 A145 "THERMOMIX" D145 "COMMISSIONS" F145 "pas de tva", K147 =SUM(D148:D159); D162 =SUM(D140:D159) picks up the commissions in column D but E162 =SUM(E140:E159) only sees E140; Analyse marge B1 "CA htva - selon falco". Draft lines 777 to 779.

**Fix:** Define CA = Σ htva of sales entries with kind in {facture, acompte, comptoir, bon_cadeau, autre}; show commissions as a separate "Autres produits" line in Journal footer, Aperçu and Compte de résultats (added to Résultat, not to CA). Export commissions only in the THERMOMIX block of the annual sheet, not in the month sheets.

**Refuter:** The problem is real and the draft text matches the finding's description.

Workbook facts, checked by reading the xlsx with the frontend's xlsx package (/Users/antoineboxho/Developer/Personal/02_projects/recipe-book/2026 LIVRE DE RECETTES TABLE D'AMELIE.xlsx):
- Month sheets never contain commissions. Janvier C27 "TOTAL" sums D3:D22..H3:H22 only, then C35 "Total CA 01/2025"; Février C44/C49 and Décembre C42/C47 have the same shape. No Thermomix or commission cell exists in any month sheet, so the workbook's "Total CA mm/yyyy" structurally excludes them.
- recettes 2025: C140 "TOTAL" with D140 =SUM(D11:D120), E140 =SUM(E11:E138). The block A145 "THERMOMIX", D145 "COMMISSIONS", F145 "pas de tva", A148:A159 janvier..décembre, K147 =SUM(D148:D159) "total thermomix" sits below the TOTAL row. Row 162: D162 =SUM(D140:D159) does include the commissions (typed in column D), E162 =SUM(E140:E159) only sees E140. So the finding's reading is literally correct for HTVA; note the TVAC grand total at D162 does include them, so row 162 is internally inconsistent, but the month sheets, Analyse marge and the mix are unambiguous.
- Analyse marge B1 = "CA htva - selon falco". Commission amounts in the block have no NUMERO OPERATION, date or label, which is consistent with them not being Falco invoices.
- Apercu par mois mix: rows 22-28 are the seven prestation types, D30 =SUM(D21:D28), B31 "(CA hors kombucha)". Commissions are not a row. Au réel 2025 has no commission row; A13 "facture comptoir janvier 2025" carries type "menu à emporter" (B13), so comptoir lines belong to a prestation row, not their own row.

Draft facts (/Users/antoineboxho/Developer/Personal/02_projects/recipe-book/docs/redesign/02-synthesis-draft.md):
- Line 478: SalesKind includes "commission". Line 777: "Total CA mm/aaaa" = Σ HTVA of sales entries. Line 780: Aperçu CA N = Σ sales htva by ym. Line 779: "Commissions and comptoir lines are their own rows" in Mix. Line 782: Au réel rows include the month's non-event sales lines and feed Total signé. Line 215: home tile "CA du mois" = Σ ledger sales HTVA. Compte de résultats CA HTVA is the same journal CA. Line 787: export writes one sheet per month from ledger lines plus a "recettes 2026" sheet with the whole year and a THERMOMIX block; nothing excludes commission entries from the month sheets or the annual list, so they would appear both as journal lines and in the block.
- grep finds no "Autres produits" in the draft and no open question about commissions in section 9 (lines 858-870).

Consequence: with the draft as written, the app's monthly CA, the Aperçu objective comparison, the Mix total, Au réel "Total signé", the home tile and the Compte de résultats CA all exceed the Falco figure by the commission amount, and the xlsx export double-lists commissions. This breaks the brief's constraint that the export must be in a shape the accountant accepts.

The proposed fix (CA = Σ htva of kinds facture, acompte, comptoir, bon_cadeau, autre; commissions as a separate "Autres produits" line added to Résultat, not CA; commissions only in the THERMOMIX block of the annual sheet) is correct in direction but incomplete: it does not fix line 779 (Mix rows), Au réel, the home tile, the annual sheet's whole-year list, or name a single shared helper so the definition is not re-implemented per view, and it does not add the accountant question.

**Corrected fix:** Apply the finding's fix and complete it as follows.

1. One definition. In `packages/types/src/lib/reports.ts` add `export const CA_KINDS: SalesKind[] = ["facture", "acompte", "comptoir", "bon_cadeau", "autre"]` and `isCaEntry(e) = e.book === "ventes" && CA_KINDS.includes(e.kind)`. Every CA figure in the draft reads through it: Journal footer "Total CA mm/aaaa" (line 777 and 5.12 line 313), Aperçu CA N, CA N−1 and Comparaison par période (line 780), Mix par prestation (line 779), Compte de résultats CA HTVA, Au réel "Total signé" (line 782), the home tile "CA du mois" (line 215), the Aperçu bar chart. Add a jest case in the `types` project: a month with one facture and one commission yields CA = facture only.

2. Journal (5.12 and line 777). Footer: Σ TVAC, Σ HTVA, Σ per rate and "Total CA mm/aaaa" over CA_KINDS lines; a separate footer line "Commissions (hors CA)" = Σ htva of commission entries of the month. The right-rail "Commissions" card shows the same figure. Commission entries stay visible as records behind the "Commissions" chip.

3. Mix par prestation (line 779). Replace "Commissions and comptoir lines are their own rows" with: rows are the prestation types from settings plus "Sans type"; comptoir lines fall into their prestation type (the workbook types "facture comptoir" as "menu à emporter") or "Sans type"; commission entries are not in the mix (workbook D30 sums the seven types only, B31 "CA hors kombucha").

4. Aperçu (line 780). CA N, Δ %, Objectif and Atteint use CA only. Add one line under the table: "Autres produits (commissions) N / N−1".

5. Compte de résultats (5.14 and line 781). Add a column "Autres produits" after Marge brute. Résultat avant impôts = Marge brute + Autres produits − Charges fixes − Personnel extra − Autres coûts. Marge %, MP / CA, Marge brute / CA and Charges fixes / CA keep CA (Falco) as denominator. The Simulation row has no Autres produits.

6. Au réel (5.16 and line 782). Rows are events plus non-event CA lines; commission entries are excluded from the rows and from "Total signé" (the workbook's Au réel has no commission row and "Je vise" is the CA objective).

7. Export (line 787). Month sheets and the whole-year list on the "recettes YYYY" sheet contain CA_KINDS lines only; their TOTAL rows exclude commissions, matching row 140. Commission entries are summed by `ym` into the THERMOMIX block (12 rows janvier..décembre, amount in the "Total tvac" column, "pas de tva", "total thermomix"). Do not reproduce the workbook's row 162 grand total, which mixes the two in column D only.

8. Section 9 open question 10: "How does the accountant book Thermomix commissions (chiffre d'affaires or autres produits d'exploitation), and are they VAT-exempt or self-billed by Vorwerk? Default: outside CA, VAT 0, shown as Autres produits, exported only in the THERMOMIX block."

### [accountant-4] (high · CONFIRMED) 7.6 Raw material cost per month / 5.14

**Claim:** The income statement uses réel when the month has at least one `mp` line, else calculé.

**Problem:** One typed supplier invoice flips the whole month to purchases and silently understates Coûts MP (and overstates the margin) until every invoice is in. The workbook's Coûts MP is a single hand-typed total per month, entered once the month is known. An accountant wants the source chosen deliberately, not inferred from a count.

**Evidence:** Analyse marge C2 2401.11 and C3 4162.41 are typed values with no formula; C4:C13 empty. Draft line 757.

**Fix:** Use réel only when the month is locked (Verrouiller le mois) or when a per-month `mpSource: "achats" | "calcule"` override is set in a small `monthOverrides` map on the objective; otherwise show calculé with réel beside it and a warning tag when réel < 70 % of calculé. Show the "MP prévu" line only for the current and future months.

**Refuter:** The claim and the evidence check out. Draft line 757 reads "The income statement uses réel when the month has at least one `mp` line, else calculé, and tags the cell." The workbook sheet "Analyse marge" has C2 = 2401.11 and C3 = 4162.41 as typed values with no formula and C4:C13 empty (verified with xlsx, cellFormula: true); B2, B3, G2, G3 are typed too, so the sheet is one deliberate figure per month.

The problem is real. Section 5.14 (line 325) tags the cell "achats" / "figé" / "calculé" and offers a view toggle, but the default view is "MP: réel si disponible" and the exported "Compte de résultats" sheet (line 787) uses the same figure. One supplier line typed on the 3rd of the month replaces the full calculé sum with that one invoice; Marge brute, Résultat avant impôts, Impôts and Résultat net all move. The tag says the source is purchases, not that it is partial. The draft's own risk entry (line 876) relies on this flip for 2025 months ("she can type ... an `mp` purchase line"), which confirms the rule is count-driven by design.

The proposed fix is right in direction (make the choice explicit) but wrong in three places:
1. "Use réel when the month is locked" has nothing to evaluate. `locked` lives only on ledger entries (lines 498, 503); `POST /admin/ledger/lock { ym }` returns `{ locked: number }` (line 605). A month with no purchase entries cannot be "locked", and deriving "locked" from entries is a count inference again. Worse, line 747 says "Export sets `locked`" (contradicting line 787), so exporting the year xlsx mid-month would lock the current month and flip it to a partial réel.
2. Locking the sales journal (for the VAT return) does not mean supplier invoices are complete; purchase invoices arrive late. The lock should prompt for the MP source, not select réel.
3. Storing `mpSource` in a `monthOverrides` map on the objective sits next to the existing `monthlyOverrides: Record<string, number>` (line 427, the per-month revenue target), mixes a planning record with a closing decision, and "Copier l'objectif de 2025" (5.15) would copy closing choices with targets. The fix also omits the workbook's actual practice, one typed total per month, which audits.md line 615 already proposed as `MonthClose { ym; rawMaterialOverride?; note? }`.

The 70 % warning is an acceptable hint. Hiding "MP prévu" for past months hides events that were never closed; a count warning is better.

**Corrected fix:** Replace the count rule at draft line 757 and the lock description with a per-month close record:

1. Settings key `monthCloses?: Record<string, MonthClose>` keyed by "YYYY-MM", next to `fixedCharges` and `objectives` in `packages/types/src/entities/settings.ts`:
   `MonthClose { mpSource: "calcule" | "achats" | "saisi"; rawMaterial?: number; lockedAt?: string; note?: string }`. Default when absent: `mpSource: "calcule"`. DTO: `mpSource` enum, `rawMaterial` money, required when `mpSource === "saisi"`.

2. Income statement, 7.6 and 5.14: `MP(m)` = `rawMaterial` when `mpSource` is "saisi"; Σ `mp` entries with `ym = m` when "achats"; Σ completed-event cost (`actualCost ?? costSnapshot.rawMaterial ?? live`) + `extraCosts` kind matiere when "calcule". The source is never inferred from a line count. The cell tag shows the source ("calculé", "achats", "saisi", plus "≈" for approximate snapshots). When the source is calculé and Σ `mp` entries > 0, show réel beside it with a "achats partiels" tag (keep the < 70 % threshold as the trigger if a threshold is wanted). The exported "Compte de résultats" sheet writes the figure used and a "Source MP" column.

3. "Verrouiller le mois": the confirmation dialog shows the three figures (calculé, achats, saisi) and asks which one the month keeps, defaulting to the current `mpSource`. `POST /admin/ledger/lock` body becomes `{ ym, mpSource?, rawMaterial?, note? }`; it sets `locked` on the month's entries and writes `monthCloses[ym]` with `lockedAt`. "Déverrouiller" clears `locked` on entries and `lockedAt`, leaves `mpSource` as chosen. Delete "Export sets `locked`" at line 747; line 787 stands.

4. For 2025 and other reconstructed months (risk at line 876), the path is "Verrouiller" or "Modifier la source MP" on the month row with `mpSource: "saisi"` and the workbook's C-column total typed in, not an `mp` purchase line.

5. "MP prévu": keep for the current and future months. For past months replace it with "N événements non terminés" linking to those events, so forgotten closes stay visible.

### [accountant-5] (medium) 5.14 Compte de résultats

**Claim:** Scenario toggle Avec salarié / Seule for the fixed-charge column.

**Problem:** The scenario belongs to the forecast. A realised month has one set of charges; a toggle that rewrites past months' Résultat and Impôts makes the P&L a simulation and an accountant will not trust the Total row.

**Evidence:** Analyse marge has a single charges column E1; the "sans salarié" column exists only in Prévisionnel financier D9:D42 and the separate "Simulation si seule" sheet. Draft line 335 (5.14).

**Fix:** Remove the toggle from Résultats; the column always uses `monthlyAmount`. Keep the scenario toggle in Prévisionnel and let the Simulation row at the bottom of Résultats pick a scenario.

### [accountant-6] (medium) 6 LedgerEntry / 5.12 Journal form / 7.6

**Claim:** `vat: { rate, amount }[]`; typing TVAC recomputes HTVA and TVA with `splitTvac(tvac, rate)`; the form has "VAT rate(s)".

**Problem:** An entry with two rates (food 12 %, drinks 21 % on a served buffet) cannot be split from one TVAC with one rate, and without a taxable base per rate neither the app nor the accountant can fill the VAT return (base per rate in boxes 01/02/03). The workbook's convention is one rate per line.

**Evidence:** Janvier F2:H2 one column per rate, recettes 2025 E6 "tvac/1,06 ou 1,12 ou 1,21" (one divisor per line). Draft lines 509, 555 to 558, 747.

**Fix:** Either enforce one rate per entry (`vat.length <= 1`, the form offers "Ajouter une ligne pour l'autre taux" which creates a second entry with the same number), or store `vat: { rate, base, amount }[]` with the DTO checking Σ base = htva and Σ amount + htva = tvac. State which in 6 and 7.6.

### [accountant-7] (medium) 7.6 How an event becomes a journal line / Export / 5.12

**Claim:** "Export sets `locked`; editing a locked line asks Déverrouiller" and, later in the same section, "The export never writes figures back; Verrouiller le mois is a separate confirmed action".

**Problem:** The two sentences contradict each other. Also, `paid`, `paymentMethod` and `paidAt` change after the accountant has the month (money arrives weeks later); if the lock covers them, every payment update needs an unlock and the Non réglés filter becomes stale.

**Evidence:** Draft line 747 versus line 787; workbook I/J/K columns (réglé, mode paiement, date encaissement) are filled after the invoice line.

**Fix:** Keep the second statement. Define the lock as freezing date, number, label, kind, amounts, VAT, prestationType and eventIds; paid, paymentMethod, paidAt and description stay editable on a locked entry. Unlock writes `unlockedAt` and a reason.

### [accountant-8] (medium) 5.7 Événement / 7.6 Facturé and Payé badges

**Claim:** The event page derives "Facturé" from any sales entry including it and "Payé" when all such entries are paid.

**Problem:** A deposit is a sales entry with `paid: true`. An event whose only entry is the deposit shows "Facturé" and "Payé" before the final invoice exists, which is the opposite of what the caterer needs to see in the week view's À encaisser tile.

**Evidence:** Draft line 747; workbook ACOMPTES block (recettes 2025 A166:D178) is kept separate from the journal precisely so a deposit is not read as the invoice.

**Fix:** Facturé = at least one entry of kind `facture` (or `comptoir`) includes the event; "Acompte reçu" = only acompte entries; Payé = Facturé and every entry including the event is paid. Three StatusTag values.

### [accountant-9] (medium) 7.6 Event revenue in reports / 5.16 Au réel

**Claim:** Event revenue in reports = Σ attributed HTVA of its sales entries when any exist, else price × guests labelled "prévu".

**Problem:** Between the deposit and the final invoice the event's revenue in Au réel and the client history drops to the deposit amount. Au réel is "J'ai déjà signé": the workbook counts the signed amount from the moment it is signed.

**Evidence:** Au réel 2025 A40 "De Frahan acompte" 750 and A49 "Doriane de Frahan (MM avocat)" 1487.5 both counted in February's Total signé C57; A3 "J'ai déjà signé...". Draft line 751.

**Fix:** Au réel uses price × guests ("signé") until a `facture` entry includes the event, then the attributed invoice HTVA; the client history shows both columns (Signé, Facturé).

### [accountant-10] (medium) 7.6 SRL tax model / 9 Q4

**Claim:** Help text: "20 % sur la première tranche de 100 000 € si les conditions PME sont remplies, à confirmer avec le comptable; le classeur utilisait 15 %"; Impôts = max(0, Résultat) × corporateTaxRate.

**Problem:** The rates are right (25 % standard, 20 % on the first 100 000 € for small companies) but the condition that this company fails is not named: the reduced rate requires a minimum director remuneration (45 000 €, or at least equal to the taxable result; the 2025 government programme raises it to 50 000 € indexed, which I did not verify in the published law). At 1 500 €/month the salary is 18 000 €, below both, so 25 % is the right default and the help text should say why. A flat rate also cannot express the two tiers when the result exceeds 100 000 €, which the solo simulation does.

**Evidence:** Prévisionnel financier C23 "Rémunération dirigeant" 1500, F12 =F10*15% labelled "Impôt sur les sociétés (estimé entre 15% et 25%)"; Simulation si seule E10 =C3-B3 = 103 869.76 and C23 1930. Draft lines 773 and 864.

**Fix:** Help text: "25 % par défaut. Le taux réduit de 20 % sur les premiers 100 000 € suppose une rémunération de dirigeant d'au moins 45 000 € (ou au moins égale au résultat imposable) et d'autres conditions PME; à confirmer avec le comptable. Le classeur utilisait 15 %, qui n'existe plus." Store `smeReducedRate?: boolean` and compute isoc = min(result, 100 000) × 0.20 + max(0, result − 100 000) × 0.25 when true, else result × 0.25.

### [accountant-11] (medium) 7.6 SRL tax model / 5.14

**Claim:** Per month Impôts = max(0, Résultat) × taux; the annual row uses max(0, Σ Résultat) × taux; Résultat net = Résultat − Impôts.

**Problem:** With a loss month the Total row of Impôts is not the sum of the column and the Total of Résultat net is not the sum either; the table will look wrong to anyone who adds it up. The workbook's I column is the accountant's typed figure, and there is no place in the draft to type the real ISoc once known.

**Evidence:** Analyse marge G2 2649.68, G3 −7873.18, I16 =SUM(I2:I13), J16 =G16-I16. Draft line 773.

**Fix:** Label the monthly Impôts column "Impôts (estimation)" with a footnote "le total annuel est calculé sur le résultat cumulé, pas additionné"; add `corporateTaxActual?: number` on YearObjective that replaces the annual estimate when typed and is marked "réel".

### [accountant-12] (medium) 6 LedgerEntry / 7.6 / 9

**Claim:** SalesKind = facture | acompte | comptoir | commission | bon_cadeau | autre; `money` is any number with two decimals.

**Problem:** Credit notes (notes de crédit) are part of every Falco journal and are the usual way a deposit is cancelled or an invoice corrected. The draft has no kind for them; a negative amount in kind `autre` passes validation silently and the export shows it with no marker, so the accountant's VAT total and the app's will differ in sign conventions.

**Evidence:** Draft lines 497 and 541; the workbook journal columns have no sign convention because the caterer has not needed one yet, but Falco numbers credit notes in their own sequence.

**Fix:** Add kind `note_de_credit` with `number` required, amounts negative, `eventIds` optional and a `refEntryId` to the invoice it corrects; reject negative amounts for every other kind; export as a negative line. Add "Comment Falco numérote les notes de crédit?" to section 9.

### [accountant-13] (medium) 7.6 Fixed charges and breakeven / 5.13 tiles

**Claim:** Seuil mensuel = charges mensuelles + treasurySavingPerMonth + Σ investments / 12; objectif mensuel = annualRevenue / monthsActive (10); Aperçu shows a "Seuil mensuel" tile next to "Objectif année".

**Problem:** The formulas reproduce the workbook, but the workbook's monthly seuil is a 12-month average placed next to a 10-month objective, and the live Aperçu seuil is the solo scenario's figure (56 130.24), not the with-staff one (95 827.24). The draft does not say which scenario the Aperçu tile shows, and the two denominators are never reconciled; in a 10-month year the seuil per active month is 10 % higher than the tile.

**Evidence:** Apercu par mois J4 56130.24 = Simulation si seule B3, J5 4677.52 = B4 (÷12), K5 =K4/10 "objectif sur 10 mois"; Prévisionnel financier B3 95827.24. Draft lines 764 to 766 and 329.

**Fix:** The Aperçu tile names its scenario ("Seuil mensuel (seule)") and uses the scenario selected on Prévisionnel; add a third line in 5.15, "Seuil par mois actif = Seuil annuel / monthsActive", so the comparison with the objective uses one denominator.

### [accountant-14] (medium) 6 YearObjective / 5.16 Au réel

**Claim:** `hoursAvailablePerMonth?: number` on the year objective; Au réel footer "Temps disponible = hoursAvailablePerMonth".

**Problem:** The workbook sets available time per month and it moves a lot (208 in winter, 120 in spring, 28 in July, 0 in September). One yearly value makes "Heures restantes" wrong in most months.

**Evidence:** Au réel 2025 C27 208, C60 208, C130 120, C165 120, C237 28, C309 0, C345 20, C417 120. Draft lines 426 and 782.

**Fix:** Add `hoursAvailableOverrides?: Record<string, number>` keyed by ym next to `monthlyOverrides`, editable inline from the Au réel footer; the yearly value is the fallback.

### [accountant-15] (low) 5.12 Comptes · Journal

**Claim:** DataTable "with the workbook's columns in order: N° | Date | Intitulé | Type | Total TVAC | HTVA | TVA 6 % | TVA 12 % | TVA 21 % | Réglé | Mode | Encaissé le | KM | Description".

**Problem:** That is not the workbook's order: Type is column L (twelfth), Description M, KM N. Moving Type to the fourth position on screen is fine, but the sentence claims fidelity it does not have, and KM/Description are swapped.

**Evidence:** Janvier A2:N2 and recettes 2025 A9:N9: ... K "date encaissement", L "Type", M "Description", N "KM". Draft line 302 versus the export list at line 787, which is correct.

**Fix:** Rewrite as "the workbook's 14 columns, with Type moved next to Intitulé on screen; the export keeps the workbook order" and put Description before KM.

### [accountant-16] (low) 7.6 Reports (Aperçu Prévision, Au réel Total signé)

**Claim:** Aperçu Prévision = Σ events dated in m of price × guests; Au réel rows are events plus the month's non-event sales lines, footer Total signé.

**Problem:** The workbook's Prévision column is the Au réel total, which includes comptoir and other non-event lines. Two functions give two "prévision" numbers for the same month.

**Evidence:** Apercu par mois F2 "Prévison (onglet au réel)"; Au réel 2025 A13 "facture comptoir janvier 2025" 842.92 inside C24 =SUM(C4:C23). Draft lines 778 and 782.

**Fix:** One function `auReel(m).totalSigne` in reports.ts feeds both the Au réel footer and the Aperçu Prévision column.

### [accountant-17] (low) 7.6 Mix par prestation

**Claim:** Nb nécessaires = eventsNeeded ?? Objectif / (CA N / count of lines of that type).

**Problem:** The workbook's counts are menus, orders or events chosen by hand; journal lines are invoices, and a monthly comptoir invoice is one line for dozens of menus, so the fallback yields nonsense for menu à emporter.

**Evidence:** Apercu par mois C40 "~2.940 menus (40-45 menus/semaine)", C41 "~40 commandes (moyenne de 1 semaine)", C13/C85 "facture comptoir" as one line. Draft line 779.

**Fix:** Show `eventsNeeded` only when typed; otherwise compute Objectif / (guestsPerEvent × average sellingPricePerGuest of that type's events) and label it "≈". Drop the line-count fallback.

### [accountant-18] (low) 7.6 Export

**Claim:** One sheet per month with the exact header row, dates as Excel date cells, a TOTAL row and the per-type totals; a "recettes 2026" sheet with the company header, THERMOMIX and ACOMPTES blocks.

**Problem:** Four details of what the accountant sees are unspecified: "réglé" is text "oui" in the workbook, not a boolean; the annual sheet totals KM; the header carries the date of constitution; the E6 note explains the HTVA rule. Booleans exported as TRUE/FALSE and a missing KM total are the kind of thing that gets the file sent back.

**Evidence:** recettes 2025 I10 "oui", N140 =SUM(N10:N120), B1 "Date de constitution" C1 44298 (12/04/2021), E6 "tvac/1,06 ou 1,12 ou 1,21". Draft line 787.

**Fix:** Write réglé as "oui"/"non", add Σ KM to the annual TOTAL row, add `constitutedOn` to `settings.company` and print it in B1:C1, copy the E6 note. Add a jest snapshot of the generated sheet against Janvier A2:N2.

### [accountant-19] (low) 6 Zod DTOs (ledger.ts) / Endpoints

**Claim:** `createLedgerEntrySchema = z.union([...]).refine(vatIdentity)`; PATCH `/admin/ledger/:id` takes "createLedgerEntrySchema / partial".

**Problem:** `.partial()` does not exist on the ZodEffects returned by `.refine`, and a partial patch of only `htva` would pass any partial schema while breaking the identity on the stored entry.

**Evidence:** Draft lines 568 and 602; zod ^3.24 `ZodEffects` has no `partial`.

**Fix:** Define `updateLedgerEntrySchema` from the inner object schemas (`salesSchema.partial()`, `purchaseSchema.partial()`) and have `LedgerService.update` merge with the stored entry and run `vatIdentity` on the result before writing.

### [accountant-20] (low) 7.6 Monthly invoices, pro-rata attribution / 10 Risks

**Claim:** Reports attribute a multi-event entry to its events pro rata by sellingPricePerGuest × guestCount.

**Problem:** Two unstated cases: all weights zero (comptoir-style events with price 0) divides by zero; and an invoice dated 1 November for October lunches lands in Aperçu's November (entry ym) while Au réel attributes it to October (event date), so the two pages disagree by design and nothing says so.

**Evidence:** Draft lines 749 and 879; workbook Au réel A53 "facture comptoir février" dated by month of invoice.

**Fix:** Fall back to an equal split when Σ weights = 0. Add one sentence: Aperçu and the journal follow the invoice date (VAT period); Au réel and the client history follow the event date; the Au réel footer shows "dont facturé en novembre: 1 300 €".

### [accountant-21] (low) 5.15 Prévisionnel / 7.6 breakeven figures

**Claim:** "Marge nette prévue %" = (bénéfice − ISoc) / annualRevenue; "Bénéfice avant impôts prévu" = annualRevenue × (1 − rawMaterialPct) − Charges annuelles − extrasBudget.

**Problem:** The workbook's "Marge nette" on this sheet is pre-tax and its "Bénéfice net" is objective minus breakeven (ignoring MP). The draft's figures are better but carry the workbook's labels with different meanings, so Dalia will see a different number under the same name and think the app is wrong.

**Evidence:** Prévisionnel financier F10 =C3-B3 "Bénéfice net", F11 =(F10/C3)*100 "Marge nette", F12 =F10*15%. Draft lines 768 to 769.

**Fix:** Label them "Résultat prévu après matières et extras" and "Marge nette après ISoc %", and show the workbook's "Objectif − seuil" as a third small line labelled "(formule du classeur)".

### [accountant-22] (low) 6 LedgerEntry SalesKind bon_cadeau / 9

**Claim:** bon_cadeau is a sales kind with VAT like any other line.

**Problem:** Since 2019 a gift voucher is revenue and VAT-bearing at sale only if it is single-purpose (rate known); a voucher usable across 6 % take-away and 12 % service is multi-purpose and taxed when redeemed. The workbook books it as a menu à emporter sale; the accountant may do otherwise.

**Evidence:** Au réel 2025 A76 "bon cadeau" B76 "menu à emporter" C76 188.68.

**Fix:** Keep the kind, default rate from the prestation type, and add to section 9: "Les bons cadeaux sont-ils facturés avec TVA à la vente ou à l'utilisation?" with a `redeemedEventId?` field reserved.

### [accountant-23] (low) 7.6 How an event becomes a journal line / Monthly invoices

**Claim:** "Terminer l'événement" writes the snapshot, "the UI then offers Créer la facture"; the monthly prefill preselects "the month's completed, uninvoiced events".

**Problem:** Invoices are often issued before the event (full prepayment for a B2B lunch, a wedding balance due a week before), and a monthly invoice regularly sweeps up an uninvoiced delivery from the previous month. Tying the invoice to completion and to one month leaves those cases to manual entry without eventIds, which breaks the Facturé badge and the pro-rata.

**Evidence:** Au réel 2025 A395 "commandes noel et nouvel an prévisionnel" (planned December sales invoiced ahead); draft lines 741 and 749.

**Fix:** Offer "Créer la facture" on upcoming events too (prefill from price × guests, no snapshot needed); the client prefill selects all uninvoiced events dated ≤ end of the chosen month, grouped by month in the form.

### [accountant-24] (low) 6 LedgerEntry personnel / 7.6 Extras

**Claim:** Extra shifts are purchase entries of kind personnel with htva = hours × hourlyRate; the Résumé facture groups per person with dates, Σ heures, taux, montant.

**Problem:** The extra's invoice is one document for many dates with VAT on the total (Kristoff: 17 dates, 158 h × 30 = 4 740 €). One entry per shift means the VAT identity, the number and the paid flag are repeated or split across 17 lines, and the Achats sheet will show 17 invoices where the accountant has one.

**Evidence:** factures sheet A8:C24 one row per date, C26 =SUM(C8:C24) 158, D26 30, E26 =C26*30 4740. Draft lines 528 and 783.

**Fix:** Model shifts as `shifts: { date, hours }[]` inside one personnel entry per invoice (htva = Σ hours × hourlyRate, VAT and number once); the Résumé facture renders the shifts list. Compte de résultats attributes the entry to its ym, or pro rata to shift months if the invoice spans two months.

### [accountant-25] (low) 9 Open questions for the caterer

**Claim:** Nine questions; the accounting ones are atelier VAT, corporate tax rate, VAT on deposits, xlsx layout, 2025 import.

**Problem:** The defaults given are the ones an accountant would pick (deposits VAT-bearing when received, 25 %, one sheet per month), but the questions that decide whether the app's figures match the accountant's are missing.

**Evidence:** Findings above: Prévisionnel C37 loan repayment, recettes 2025 THERMOMIX block outside totals, Au réel A76 bon cadeau, Falco credit notes, VAT return periodicity (monthly or quarterly decides the lock granularity and whether "Verrouiller le mois" or "le trimestre" is the real unit).

**Fix:** Add: (10) Is the 600 €/month loan repayment a charge in the P&L or only in the cash budget? (11) Are Thermomix commissions part of CA for the accountant, and do they carry VAT? (12) Are gift vouchers taxed at sale or at redemption? (13) How does Falco number credit notes? (14) Is the VAT return monthly or quarterly? (15) Which 2025 totals (monthly, per type, per period) should be typed in so Aperçu works in 2026?

### [dalia-1] (high · CONFIRMED) 5.1 Semaine (home), laptop layout

**Claim:** Laptop (≥1024px): `grid grid-cols-7 gap-3` inside `max-w-wide`. Column header "Mar 14" at `text-h3` with "2 événements · 60 conv. · 1 240 €". Under the card, the event's lines in course order as 36px rows at `text-sm`: status dot, recipe name, portions bold.

**Problem:** On a 1366×768 laptop the content width is 1366 − 240 (sidebar `w-60`, AdminSidebar.tsx:47) − 64 (`md:p-8`, AdminLayout.tsx:14) ≈ 1062px, minus a scrollbar ≈ 1047px. Seven columns with six 12px gaps gives about 139px per column. After row padding, a status dot and a bold portions figure there are about 75px left for the recipe name at 14px, roughly ten characters: "Mini quiches lorraines" becomes "Mini quich…". The header meta string is about 30 characters and wraps to three lines in 139px. The week view is her main request and she would be reading truncated names on the laptop she plans on.

**Evidence:** docs/redesign/02-synthesis-draft.md:217; apps/frontend/src/components/admin/AdminSidebar.tsx:47 (`w-60`); apps/frontend/src/components/admin/AdminLayout.tsx:14 (`md:p-8`); arithmetic (1047 − 72) / 7 ≈ 139px.

**Fix:** Below 1280px use a two-row grid (Lun–Jeu over Ven–Dim, four columns of about 250px) or a five-column working week with Sam/Dim stacked below; keep seven columns only at ≥1440px. Let recipe names wrap to two lines instead of truncating, and move the day revenue to a one-line footer of the column ("1 240 €") with the header meta shortened to "2 évén. · 60 conv.". State the chosen breakpoint in 5.1.

**Refuter:** The problem is real and the arithmetic checks out against the code. `w-60` (240px) is at apps/frontend/src/components/admin/AdminSidebar.tsx:106 and `md:p-8` (32px each side) at apps/frontend/src/components/admin/AdminLayout.tsx:15; the finding's line numbers (47, 14) are wrong but the classes exist and the draft does not change either on laptop (section 3 only adds `pb-[64px]` on phones; section 4 adds `fullBleed` for the grocery page only). Draft line 217 specifies `grid grid-cols-7 gap-3` inside `max-w-wide`, and section 4 sets `maxWidth.wide = 72rem` (1152px). At 1366px: 1366 - 240 - 64 = 1062px of content, minus six 12px gaps = 141px per column, 139px with a Windows scrollbar. DM Sans averages about 0.52em per character, so 14px text gives about 7.3px per character: "Mini quiches lorraines" (22 chars) needs about 160px and cannot fit on one line in any column the draft produces; the 33-character meta string needs about 240px and wraps to two or three lines in 139px. The draft only sized the column vertically ("3 x 72 + 15 x 36 px") and never checked width.

The finding understates it: `max-w-wide` caps the grid at 1152px, so columns never exceed (1152 - 72) / 7 = 154px on any monitor, and at 1440px with the sidebar open the width is (1440 - 240 - 64 - 72) / 7 = 152px. So the proposed "seven columns only at >=1440px" does not restore legibility on its own. The finding also misses the event card: name at 16px (about 16 characters per line in 139px) plus a prestation `Tag` such as "Buffet avec service" (19 characters, about 140px plus padding) cannot share a 72px card at this width.

Three parts of the proposed fix are wrong or incomplete: (1) the five-column working week with Sam/Dim demoted is wrong for this business, whose weddings, brunches and walking dinners fall on weekends (the audit's own example is "50 pour le mariage samedi"); (2) a column footer for the revenue scrolls out of view because columns scroll inside `max-h-[calc(100dvh-220px)]` while only the header stays fixed; (3) the two-row 4+3 grid on a 768px-tall screen leaves 768 - 220 (fixed header) - 64 (padding) = about 484px for two rows, roughly 240px each, which holds one card plus four lines before "+ N lignes", and the finding does not state that vertical cost.

**Corrected fix:** Rewrite the laptop paragraph of 5.1 (docs/redesign/02-synthesis-draft.md:217) as follows.

1. Breakpoints, stated explicitly: below `xl` (1280px, which covers phones and iPads in both orientations) the week is the stacked-days layout already described for phones. At `xl` and above it is seven columns.

2. Reclaim chrome width instead of adding rows. The week page opts out of `max-w-wide` and uses the `fullBleed` outlet context from `AdminLayout` (already proposed in section 4 for the grocery page) with `px-6`. On `/semaine` below `2xl` (1536px) the sidebar renders collapsed by default, reusing the existing `collapsed` state at `AdminSidebar.tsx:20` (`w-16` at line 106), persisted with `hooks/use-local-storage.ts` and overridable by the chevron. Resulting column widths, to be written into 5.1: 1280px gives 156px, 1366px gives 169px, 1440px gives 179px, 1536px with the sidebar open gives 168px.

3. Content rules so a 156px column reads without truncation: `grid-cols-[repeat(7,minmax(0,1fr))] gap-2 2xl:gap-3`. Column header on three lines, all inside the sticky header: "Mar 14" at `text-h3`, "2 évén. · 60 conv." at `text-sm`, "1 240 €" at `text-sm font-semibold`. Event card `min-h-[72px]` (not fixed 72px) with the name at `text-base font-medium line-clamp-2`, guests as "60 conv.", and the prestation `Tag` shown only at `2xl+`, as a `title` tooltip below that. Line rows `min-h-9` (not fixed 36px) with the recipe name at `text-sm line-clamp-2` and portions `font-semibold tabular-nums` on the right; no truncation anywhere in the column. Revise the fit estimate to "about 3 x 72 + 15 x 36 px when names fit on one line, up to 15 x 56 px when they wrap", which still sits under the 548px column budget on a 768px-tall screen with the "+ N lignes" collapse.

4. Drop the five-column working-week option entirely. If the developer prefers the 4+3 two-row grid at `xl` over collapsing the sidebar, 5.1 must state the vertical budget (768 - 220 - 64 = about 484px, about 240px per row, one card plus four lines before "+ N lignes") and make the "Lignes / Événements" toggle default to Événements in that layout.

### [dalia-2] (medium) 5.1 Semaine (home), vertical fit

**Claim:** Six events and forty lines fit: the tallest column is about 3 × 72 + 15 × 36 px plus collapsed rows.

**Problem:** The arithmetic does not hold. By the draft's own rule (five lines per event then a "+ n lignes" row) the tallest column with three events is 3 × 72 + 15 × 36 + 3 × 36 = 864px. On 768px of screen minus about 90px of browser chrome, the column body `max-h-[calc(100dvh-220px)]` is about 460px. The Saturday column scrolls inside itself, which is the one place a nested scroll is hardest to notice.

**Evidence:** docs/redesign/02-synthesis-draft.md:217; 768 − 90 − 220 ≈ 458px available versus 864px needed.

**Fix:** Replace the sentence with the real numbers and the consequence: "On 1366×768 a column shows about twelve 36px rows before scrolling; the Lignes / Événements toggle is the overview." Default the toggle to Événements on heights under 800px, and show the line count on the event card so the collapsed state still answers "how much today".

### [dalia-3] (medium) 5.1 Semaine (home) and 4 Spacing, touch targets

**Claim:** Tap targets `min-h-11 min-w-11` (44px) on every control of the week, day, prep sheet, cook and grocery pages. [...] lines in course order as 36px rows [...] long-press (touch) or hover (pointer) a line shows `StatusControl`.

**Problem:** The seven-column layout starts at 1024px, which is an iPad in landscape, a touch device the brief names for the kitchen. There the week lines are 36px rows and the status control is reached by long-press. 36px breaks the 44px rule the same section states, and long-press with wet hands is unreliable. The two sentences contradict each other and the developer would pick one.

**Evidence:** docs/redesign/02-synthesis-draft.md:101 (44px rule), :217 (36px rows at ≥1024px), :221 (long-press); 00-brief.md:123 ("phone or tablet in the kitchen").

**Fix:** Under the `touch:` variant the plan already adds, render week lines at `min-h-11` (44px) and show the status dot as a 44px tappable control that cycles todo → doing → done without long-press. Or move the grid breakpoint to 1280px so iPad landscape gets the stacked layout. Say which in 5.1.

### [dalia-4] (medium) 5.1 Semaine (home), phone

**Claim:** Phone: days stacked, today expanded, other days a 56px row "Mar 14 · 2 évén. · 60 conv. · 3/12 faites" that expands in place with a sticky day header. Rows are 48px at `text-base`. [...] tap a day header → `/jour/:date`.

**Problem:** Two gaps the developer would have to guess on the screen Dalia opens first every morning. First, the phone section describes only line rows (recipe name, portions); it does not say whether the 72px event card with the client name exists on the phone, so "for whom" may be missing from the expanded day. Second, tapping a day row is defined twice: it "expands in place" and, from the interactions list, goes to `/jour/:date`. On a 375px phone both cannot be the primary tap.

**Evidence:** docs/redesign/02-synthesis-draft.md:219 and :221; flow 1 walk-through on 375px: 0 taps to today, 1 tap to the Hoona line, but the client name is only on the event card, which the phone paragraph does not mention.

**Fix:** Specify the phone day structure: day row (56px) → event header row per event (name, client chip, guests, done count, tap → `/events/:id`) → line rows (48px, tap → prep sheet). Tap on the day row expands; a chevron or "Voir le jour ›" at the right of the sticky day header goes to `/jour/:date`. Add a 375px wireframe line to 5.1.

### [dalia-5] (medium) 5.3 Fiche de préparation, phone

**Claim:** Body is `RecipeReader` in a `max-w-doc` column: photo `aspect-[3/2]` if any; **Ingrédients** heading [...] Phone: single column, status bar fixed above the tab bar.

**Problem:** This is the screen the plan calls "the recipe reading screen the complaint is about", and on a phone it keeps the 52px top bar, a status bar with a 48px control (about 64px) and the 64px tab bar: 180px of chrome, leaving about 490px on a 375×667 phone. Above the ingredients sit a 32px title, the summary and a 343×229px photo, so the first ingredient is about 400px down and needs a scroll before she can start. Cook mode hides both bars; the prep sheet does not.

**Evidence:** docs/redesign/02-synthesis-draft.md:241 (photo first, then Ingrédients), :243 (status bar above the tab bar); 3 Phone paragraph (tab bar 64px, top bar 52px, "cook mode hides both bars").

**Fix:** On `/events/:eventId/lines/:lineId` hide the tab bar as cook mode does and merge StatusControl and "Cuisiner" into one 64px bottom bar. Show the photo as a 64px thumbnail beside the title on the prep sheet; keep the full-width photo on `/recipes/:id` only. Ingredients must start within the first screen on 375×667.

### [dalia-6] (medium) 4 Type scale and 5.3 / 5.4, 18px recipe text

**Claim:** `text-lead` 18px / 1.6 for recipe steps, ingredient lines, prep lines. [...] A sticky bottom bar: `StatusControl` [...] and a "Cuisiner" button.

**Problem:** 18px is comfortable with the phone in hand. It is not comfortable with the phone propped on the counter at arm's length, which is how she follows a recipe while cooking. The plan answers that with cook mode (28/36px) but then she has two reading screens for one job: the prep sheet has the note and the status, cook mode has the large type and "Marquer fait". The plan never says when she should use which, and she would end up bouncing between them.

**Evidence:** docs/redesign/02-synthesis-draft.md:88-90 (type scale), :241-245 (prep sheet), :249-253 (cook mode); the brief's complaint is "Dalia a du mal à suivre une recette sur le site" (00-brief.md:26).

**Fix:** Add a persisted text-size toggle ("Aa") on RecipeReader that switches steps and ingredients from 18px to 22px, so the prep sheet alone covers reading on the counter. State the split in one sentence in 5.3: prep sheet = read, note, tick; Cuisiner = hands-free step by step. Validate 18 versus 22 in the slice 1 kitchen session and record the result in 7.2.

### [dalia-7] (medium) 5.5 Recette (lecture) and 4 Component primitives, Stepper

**Claim:** `Stepper({ value, onChange, min?, label? }) // 44px buttons` [...] ingredients list with a `Stepper` defaulting to `recipe.portions`.

**Problem:** Flow 4 (read a recipe outside an event and adjust portions) still costs one tap per portion: a 10-portion recipe scaled to 60 is 50 taps, the same complaint 7.2 cites against today's cook mode ("20 taps on +"). The primitive as specified has no typed input and no multipliers.

**Evidence:** docs/redesign/02-synthesis-draft.md:189 (Stepper signature), :257 (Stepper on the recipe page), :677 ("20 taps on +" named as the old path).

**Fix:** Make the Stepper's number a 44px tappable field (`inputmode="numeric"`, select-all on focus) and add ×2 and ÷2 shortcuts; the prep sheet keeps the same primitive. Mention it in 4 and 5.5.

### [dalia-8] (medium) 7.5 Clients and weekly templates, and 5.1 banner

**Claim:** "Créer la semaine Hoona" banner when a client has weekday templates and no event in the displayed week [...] `instantiate { dates, templateIds?, guestCount? }` [...] scaling line portions proportionally when overridden.

**Problem:** Hoona's head count changes week to week. The one-tap banner creates five events at the template's guest count; to fix 32 instead of 30 she then opens each event and edits guests and every line's portions, because `EventEditor` only sets portions from guests when a line is added (`portions: guestCount` at EventEditor.tsx:137) and never rescales afterwards. The "ne pas dupliquer à chaque fois" request is answered, but the weekly ritual still has five edits in it. The banner condition ("no event in the displayed week") also hides it once she has created one day by hand.

**Evidence:** docs/redesign/02-synthesis-draft.md:221 (banner), :729 (instantiate with guestCount override only at creation); apps/frontend/src/pages/admin/EventEditor.tsx:137 (`portions: guestCount` at add time only).

**Fix:** The banner opens a one-field sheet "Convives : [30]" with "Créer la semaine"; the value goes into `instantiate.guestCount`. On the event page add "Ajuster les portions aux convives" (one action that scales every line by newGuests / oldGuests, confirmed). Show the banner whenever at least one weekday template has no event that week, not only when none do.

### [dalia-9] (medium) 5.2 Jour and 5.1 Semaine, print and send

**Claim:** Buttons "Courses du jour", "Imprimer", "PDF du jour". [...] "PDF du jour" per column during the transition.

**Problem:** Flow 2 ends with "print or send the prep list" for the week. The plan offers paper per day only, so a week for an extra is seven day pages generated one by one, and there is no share action at all (the brief's Enobase notes mention main-d'œuvre; the workbook's "factures" sheet shows Kristoff works for her). The day view also has two paper buttons, "Imprimer" and "PDF du jour", that do the same thing by different means; she would not know which to use.

**Evidence:** docs/redesign/02-synthesis-draft.md:229 (day buttons), :221 (PDF per column), :669 (print and PDF rationale), :868 (open question 8).

**Fix:** Add "PDF de la semaine" on the week header that concatenates the day structure (one day per page, Par événement) through `day-pdf.ts`. On phones expose the PDF through the Web Share API (`navigator.share({ files })`, falls back to download) so it goes to WhatsApp in one tap. Keep one paper button per view labelled "Imprimer / PDF"; let it print on laptop and share a PDF on phone.

### [dalia-10] (high · REFUTED) 8 Roadmap, slice 4, and 5.12 Journal

**Claim:** No ledger backfill: the journal starts at the month of deployment; the 2025 workbook stays the record for 2025. [...] Dalia notices: [...] the accountant receives an xlsx in the columns she already uses.

**Problem:** Today is 12 October 2026 and slice 4 lands in weeks 7-8, so the journal starts in December 2026. "Livre des recettes 2026.xlsx" would carry eleven empty month sheets and one filled one, and 2026 would be split between the workbook and the app. The accountant would not accept that as the year's book, and the request "avoir un Livre des comptes" is not met for the year in which the work ships. Open question 7 asks about 2025 lines for comparison only; the real question is 2026.

**Evidence:** docs/redesign/02-synthesis-draft.md:841 (no backfill), :843 (what Dalia notices), :865 (open question 7); timeline in 8 (eleven weeks from October 2026); 01-livre-des-comptes-excel.md:9-28 (same 14 columns, which makes an import mechanical).

**Fix:** Pick one and write it in 8 and 9: (a) a one-off import of the 2026 month sheets through the export mapping in reverse (same 14 columns; `xlsx` is already a dependency; about one day, lines imported with `locked: true`), or (b) the app's journal starts on 1 January 2027 and the 2026 export is explicitly out of scope. Default to (a) so Aperçu has a full 2026 and the accountant gets one file.

**Refuter:** The finding's factual premise is wrong: the workbook contains no 2026 journal lines, so there is nothing to import and no "split" between the workbook and the app.

Checked by reading `/Users/antoineboxho/Developer/Personal/02_projects/recipe-book/2026 LIVRE DE RECETTES TABLE D'AMELIE.xlsx` with the `xlsx` package (NODE_PATH set to `apps/frontend/node_modules`):
- All twelve month sheets (Janvier to Décembre) have only the 14-column header, a TOTAL row of zeros, the per-type SUMIF block with zeros, and stale labels "Total CA 10/2023", "Total CA 02/2024", "Total CA 01/2025". Zero data rows in every one of them. Two sheets carry a stray "oui | virement" in row 2 and nothing else.
- The "recettes 2025" sheet's journal area (rows 9 to 138) is empty apart from one stray "oui | virement"; its TOTAL row is zeros; the THERMOMIX and ACOMPTES blocks are empty. The only dated cells in that sheet are the 2023/2024 "COMPARAISON" block.
- "Apercu par mois" column C "CA htva 2026" is empty for all twelve months. The string "CA htva 2026" in C1 is the only occurrence of "2026" in the whole workbook; there is no 2026 date cell anywhere.
- The only 2025 figures are "Au réel 2025" blocks (client, type, HTVA per month, not the 14-column journal), the monthly totals in Apercu column B, and two months in "Analyse marge". The 2025 journal lines are not in this file either.

The critic cites `docs/redesign/01-livre-des-comptes-excel.md:9-28` as evidence that an import is mechanical; line 28 of that file states "The 2026 month sheets are empty templates". The "Analyse marge" header reads "CA htva - selon falco": Falco, not this workbook, is where 2026 invoices live, and `docs/redesign/00-brief.md:57` keeps Falco as the invoicing tool. Starting the app's journal in the deployment month therefore does not create a split that does not already exist.

The timeline arithmetic is right (weeks 7-8 from 12 October 2026 is late November to early December), and a December deployment would give a 2026 xlsx with mostly empty month sheets. That is cosmetic: the caterer's own 2026 workbook has twelve empty month sheets today, and the draft's acceptance test at `02-synthesis-draft.md:842` is "the accountant has opened one real monthly export", which matches the workbook's per-month-sheet structure and the "CSV du mois" action in 5.12. "The accountant would not accept that as the year's book" is asserted without evidence; the brief's only constraint (`00-brief.md:127`) is an export in a shape the accountant accepts, and the request (`00-brief.md:46`) is "a way to have" the book "in the end", a capability, not a 2026 backfill.

Both proposed fixes are worse than the draft. Fix (a) imports zero rows; even with a live file it would not be "about one day": `xlsx` is frontend-only (`apps/frontend/package.json:23`, used in `Recipes.tsx:13` and `Ingredients.tsx:14`, no backend dependency), the ledger DTO refuses lines where HTVA + Σ TVA differs from TVAC by more than 0,01 (draft 5.12 and `dto/ledger.ts`), and the workbook uses hand-typed HTVA, free-text types with trailing spaces (audits.md:627) and "oui" for paid. Fix (b) delays the only slice 4 acceptance test by a month and removes December 2026 from the app for no gain.

Residual low-severity wording note, not a confirmation of the finding: `02-synthesis-draft.md:841` says "the 2025 workbook stays the record for 2025" and does not say what the record for January to November 2026 is. One sentence would close it: the 2026 month sheets are empty, January to November 2026 stay in Falco, the app's journal starts with the deployment month, and "Exporter 2026 (xlsx)" writes only months that have entries. Open question 7 could also note that the workbook holds 2025 monthly totals (Apercu column B) rather than 2025 journal lines, so an N−1 seed is twelve numbers, not an import.

Not checked: whether a different, live copy of the 2026 workbook with filled month sheets exists outside the repo; the one provided has none.

### [dalia-11] (medium) 7.6 Accounting / 5.12 Journal, month-end flow

**Claim:** Export sets `locked`; editing a locked line asks "Déverrouiller". [...] The export never writes figures back; "Verrouiller le mois" is a separate confirmed action.

**Problem:** The two sentences in the same section contradict each other. Flow 6 depends on it: if export locks, a trial export on the 20th freezes lines she still has to mark paid; if it does not, the month can drift after the accountant has the file. The developer would guess, and Dalia would discover the answer the first time an edit is refused.

**Evidence:** docs/redesign/02-synthesis-draft.md:747 ("Export sets `locked`") versus :787 ("Verrouiller le mois is a separate confirmed action"); 5.12 lists "Exporter", "CSV du mois" and "Verrouiller le mois" as three buttons.

**Fix:** Keep export side-effect free. After an export, show a one-line prompt "Verrouiller octobre 2026 ?" with Oui / Plus tard. Note that "Réglé", mode and "Encaissé le" remain editable on locked lines, since payment arrives after the book is sent; only amounts, dates and numbers are frozen. Fix the sentence at line 747.

### [dalia-12] (medium) 5.10 Doublons d'ingrédients, unit mismatch

**Claim:** Candidates whose unit family differs from the chosen survivor are greyed with "Unité différente (€/pièce vs €/kg): modifier d'abord" and cannot be included.

**Problem:** This is the most likely real case in her list (one "Farine" at €/kg, one "Farine (sachet)" at €/pièce, or eggs by piece and by weight). The message tells her to modify first but not what: changing the ingredient's price unit would make every recipe line in `g` priced per piece, which the plan rightly refuses to do silently. She would be stuck on the page with no next step.

**Evidence:** docs/redesign/02-synthesis-draft.md:297; 7.3 "the merge never converts quantities" and "No `force` flag"; packages/types/src/entities/ingredient.ts:15 (`UNITS_PRICE`).

**Fix:** Replace "modifier d'abord" with a path: a "Voir les 3 recettes" link listing the recipes that use the odd-unit ingredient, and a one-line explanation "Ces recettes utilisent cet ingrédient en pièces. Convertissez leurs quantités en grammes, puis revenez fusionner." Keep the group visible with the greyed member so she can come back. If she confirms a conversion factor (for example 1 pièce = 60 g), a second phase could apply it; say explicitly it is not in this plan.

### [dalia-13] (medium) 3 Information architecture and 5.17 Paramètres, naming

**Claim:** Sidebar: Courses → `/grocery-list`. Paramètres: Services (courses, ordered, ▲▼). Day view: Par service. Prestation types include "Buffet avec service".

**Problem:** Three nearby labels collide in French. "Courses" is unambiguous for groceries, but the plan uses the English word "courses" for apéritif/entrée/plat in code and in the doc, and "Services" in the UI. "Service" for a caterer means the waiting staff ("Buffet avec service" is one of her seven prestation types, two sections below in the same settings page) or a seating. Dalia's own word in the request is "catégorie" ("les trier par catégorie (apéritif, entrée plat dessert etc)"), which the app already uses for Buffet / Walking dinner / Lunch / Menu semaine.

**Evidence:** docs/redesign/02-synthesis-draft.md:34-36 (sidebar), :337 (Services next to Types de prestation), :229 (Par service); 00-brief.md:41 (her wording); packages/types/src/entities/settings.ts:15-18 (current category values are service formats).

**Fix:** Use her word. Relabel the existing list "Catégories de recettes" → "Formats" (Buffet, Walking dinner, Lunch, Menu semaine) and call the new course list "Catégories du menu" (Apéritif, Entrée, Plat, Dessert, Autre) in Paramètres, "Par catégorie" on the day view and as the heading group on the event page. If "Catégories" is judged too overloaded, use "Moments du repas". Keep `courses` as the code name but add a comment mapping it to the French label.

### [dalia-14] (low) 3 Information architecture, sidebar labels

**Claim:** Comptes → `/comptes/journal` [...] Finances (ancien) → `/finances`, slices 2 to 4 only.

**Problem:** "Comptes" on its own reads as accounts or logins; her words are "livre des comptes" and "compte de résultats", and the audit used "Comptabilité". For three slices the sidebar would show two money entries, "Comptes" and "Finances (ancien)", which is the opposite of the calm the plan promises.

**Evidence:** docs/redesign/02-synthesis-draft.md:39-41; workings/audits.md journey finding "plan the week (home screen)" recommends a "Comptabilité" group.

**Fix:** Label the section "Comptabilité" (tabs unchanged). During slices 2-4 do not add "Finances (ancien)" to the sidebar; reach the old dashboard from a link inside Comptabilité › Aperçu ("Ancien tableau de bord") until Aperçu is built, then delete it.

### [dalia-15] (low) 3 Phone, breadcrumbs and tab bar

**Claim:** The 52px top bar shows a breadcrumb and the page title instead of the logo and hamburger. [...] 5.2: breadcrumb "Semaine 42 / Mardi 14 octobre", title at `text-h1` Playfair.

**Problem:** On a 375px phone the title appears twice: in the 52px top bar and as a 32px h1 in the page body. The breadcrumb "Semaine 42 / Mardi 14 octobre" plus title does not fit in 52px at the plan's own type scale (13px × 1.4 + 16px × 1.6 = 44px before padding). Notion's phone bar shows the title only once the body title scrolls out. The bottom tab bar is not Notion-like but it is the right choice for one thumb in a kitchen; the plan should say so rather than claim Notion parity.

**Evidence:** docs/redesign/02-synthesis-draft.md:48 (top bar), :229 and :241 (breadcrumb plus h1 on the page).

**Fix:** Phone top bar: back chevron plus the parent label only ("‹ Semaine 42"); the page h1 stays in the body and slides into the bar on scroll. Add one sentence in 3 justifying the tab bar on ergonomic grounds.

### [dalia-16] (low) 4 Phone versus laptop rules, tables

**Claim:** Costing tables (recipe cost, journal, income statement) are the only tables kept.

**Problem:** Sections 5.11, 5.13, 5.15 and 5.16 add DataTables for client history, Aperçu, charges and Au réel. Au réel is a per-event list with an inline hours field and free-text observations; the client's Historique is five columns of which two matter. Both read better as list rows, and the sentence in section 4 is already false.

**Evidence:** docs/redesign/02-synthesis-draft.md:201 versus :305, :321, :329, :333.

**Fix:** Rewrite the rule as "tables are kept where columns are summed (journal, compte de résultats, charges, aperçu)". Render Au réel and the client Historique as `ListRow`s (title, meta line, trailing amount, inline hours) at every width.

### [dalia-17] (low) 5.1 Semaine (home), money strip

**Claim:** slice 2 shows "Signé cette semaine" [...] slice 4 adds "CA du mois" (Σ ledger sales HTVA month to date with the objective as a progress bar). Section 2 table: "signed revenue per day and week, month progress bar".

**Problem:** `objectives` land in slice 5, so in slices 2 to 4 the progress bar has no target. The plan does not say what the tile shows in the meantime; the developer would guess between hiding the bar and showing a bar against zero.

**Evidence:** docs/redesign/02-synthesis-draft.md:11 (month progress bar), :215 (strip per slice), slice 5 scope "settings `fixedCharges`, `objectives`" (:847).

**Fix:** State: until `objectives[year]` exists, the tile shows the amount only with a link "Définir un objectif" (to Paramètres › Objectifs); the bar appears once an objective is set. Or move the `objectives.annualRevenue` and `monthsActive` fields into slice 4 as a two-field settings section.

### [dalia-18] (medium) 8 Roadmap, slices 1 and 2

**Claim:** Slice 1 (weeks 1-2) [...] `scripts/check-type-scale.sh` and `scripts/check-contrast.mjs` [...] delete `packages/utils` and `TABLE_NAMES` [...] Effort: 9 to 10 days. Slice 2 (weeks 3-4) [...] Effort: 10 to 12 days.

**Problem:** The week view is her stated main need and it arrives at the end of week 4. Slice 1 carries work she cannot see (lint scripts, deleting `packages/utils` and `TABLE_NAMES`, the `UnprocessedItems` loop, alias matching in imports) and slice 2 bundles the read-only week with statuses, course ordering, the Events list restyle, the grocery range generator and the editor's diff-based autosave. A read-only week, day and prep sheet with "Cuisiner" at the line's portions need only `lineId` and the planning helpers, and could be in her hands in week 3.

**Evidence:** docs/redesign/02-synthesis-draft.md:814-827; brief 00-brief.md:17 ("Besoin principal: remplacer le PDF de préparation par une vue interactive").

**Fix:** Move the lint scripts, `packages/utils` and `TABLE_NAMES` deletion to slice 5 (or a maintenance PR), and split slice 2: 2a (week 3) = migration 001, `Week.tsx`, `Day.tsx`, `PrepSheet.tsx` read-only, cook mode with `?portions`, `/` redirect; 2b (week 4) = prep status, course and ▲▼ on the event page, line endpoints with the set check, diff autosave, Events restyle, grocery range. Keep the merge in slice 1; it is a one-time cleanup she asked for first.

### [dalia-19] (low) 7.7 AI

**Claim:** One optional feature if Dalia provides an OpenAI key: recipe import from a photo or pasted text. [...] Effort: three days.

**Problem:** The choice is sensible and it is the one AI feature she would use, since her recipes exist on paper and in Notion. But the brief says "intégrer une clé API ou un compte ChatGPT"; a ChatGPT subscription cannot be called from the backend, and the plan never says so, so she may expect her existing account to be enough. The open questions do not ask which she has.

**Evidence:** docs/redesign/02-synthesis-draft.md:795; 00-brief.md:34; 9 Open questions (no AI question).

**Fix:** Add to 7.7: "A ChatGPT subscription does not give API access; this needs an OpenAI API key with billing, about 0,01 € per import." Add open question 10: "Do you have an OpenAI API key, or only a ChatGPT account? Do you still type recipes by hand from paper or photos?"

### [dalia-20] (low) 9 Open questions for the caterer

**Claim:** Nine questions: Hoona cadence, invoicing mode, atelier VAT, tax rate, deposits, export layout, 2025 import, printed sheet, emoji.

**Problem:** Three questions that change the design are missing: whether she reads recipes in the kitchen on a phone or an iPad (decides the week grid breakpoint and the 18px choice), whether she sends the prep list to an extra such as Kristoff (decides the week PDF and share action), and how much Hoona's head count varies week to week (decides whether instantiate must ask for guests).

**Evidence:** docs/redesign/02-synthesis-draft.md:859-869; workbook sheet "factures" (Kristoff) in 01-livre-des-comptes-excel.md:52; brief 00-brief.md:123.

**Fix:** Add: 10. "Dans la cuisine, téléphone ou tablette ? Posé sur le plan de travail ou en main ?" 11. "Envoyez-vous la fiche de préparation à un extra ? Par quel canal ?" 12. "Le nombre de convives Hoona change-t-il chaque semaine ?" Record the defaults assumed for each.

### [completeness-1] (high · CONFIRMED) 7.6 Accounting (Raw material cost per month) and 6 Data model changes (Event)

**Claim:** Section 6: `rawMaterial: Σ (recipeCost / recipe.portions) × line.portions + Σ extraCosts kind matiere`. Section 7.6: `MP calculé(m) = Σ over completed events of (actualCost ?? costSnapshot.rawMaterial ?? live) + Σ extraCosts kind matiere`. Cost precedence everywhere: `actualCost ?? costSnapshot?.rawMaterial ?? liveCalc`.

**Problem:** Matiere extras are counted twice whenever the snapshot is used (once inside rawMaterial, once added in 7.6). The precedence also mixes two meanings: in the live code `actualCost` replaces only the recipe cost and extraCosts are added on top (EventEditor.tsx:125 `actualCost !== null ? actualCost + totalExtraCosts : calculatedCost`), while `costSnapshot.rawMaterial` already contains matiere extras. The same event gives a different Coûts MP depending on which branch fires, which is the cost-consistency defect the finance audit flagged.

**Evidence:** apps/frontend/src/pages/admin/EventEditor.tsx:125; apps/frontend/src/pages/admin/EventDetail.tsx:62; audits.md 'Cost consistency across screens' and 'Cost snapshot / historical integrity' (snapshot recommended as recipeCost + extraCost, separately).

**Fix:** Define `costSnapshot.rawMaterial` as recipe cost only (Σ unitCost × portions) and keep extras out of it. Define `rawMaterial(event) = actualCost ?? costSnapshot?.rawMaterial ?? liveRecipeCost` and `MP calculé(m) = Σ rawMaterial(event) + Σ extraCosts kind matiere` once. Say this in both 6 and 7.6 with the same sentence.

**Refuter:** The double count is real and verifiable from the draft text alone. Section 6 (02-synthesis-draft.md line 383) defines costSnapshot.rawMaterial as recipe cost plus Σ extraCosts kind matiere. Section 7.6 (line 756) defines MP calculé(m) as Σ (actualCost ?? costSnapshot.rawMaterial ?? live) + Σ extraCosts kind matiere. When the snapshot branch fires (completed event, no typed actualCost, the normal case after slice 4), matiere extras are inside rawMaterial and added again by the trailing term. The mixed-meaning claim is also confirmed: EventEditor.tsx:125 is `actualCost !== null ? actualCost + totalExtraCosts : calculatedCost` and the input is labelled "Coût réel recettes HTVA" (line 316), so actualCost is recipe cost only with extras added on top; EventDetail.tsx:62 is the same rule. The draft never gives calcEventCost a body, so `live` is the recipe-only `calculated` from the audit helper. Branches 1 and 3 of the ?? chain are therefore recipe-only and branch 2 includes matiere extras, so the same event yields a different Coûts MP depending on which branch fires. Line 401's claim that the precedence "keeps today's EventEditor.tsx:125 rule" is false for the snapshot branch. The audit (workings/audits.md lines 292-302) kept recipeCost and extraCost as separate snapshot fields and its MP formula (line 612) adds matiere extras once on top of a recipe-only rawMaterial; the draft diverged when it merged them. The proposed fix is right in direction but incomplete: it leaves the snapshot's `extras: Σ extraCosts not matiere` field inconsistent, misses the third copy of the precedence at line 622 (backward-compatible read rules), and does not say that migration 002 and the EventDetail "Coût matières" tile (line 271) must use the same recipe-only definition.

**Corrected fix:** 1. Section 6, EventCostSnapshot: `rawMaterial: number; // Σ lines[].unitCost × lines[].portions, recipe cost only, no extras` and replace `extras: number; // Σ extraCosts not matiere` with either nothing (event.extraCosts is already a record and does not drift) or `extrasTotal: number; // Σ all extraCosts at takenAt, informational only, reports read event.extraCosts by kind`. Reports must never read matiere extras from the snapshot.
2. Define one helper in packages/types/src/lib/costing.ts and quote its contract in section 6: `calcEventCost(ev, recipeCostById, recipePortionsById) → { rawMaterial: ev.actualCost ?? ev.costSnapshot?.rawMaterial ?? liveRecipeCost, extras: { matiere, personnel, location, transport, autre }, total: rawMaterial + Σ all extraCosts }`. `total` is today's EventEditor.tsx:125 rule; `rawMaterial` is recipe cost only in all three branches.
3. Replace the precedence sentence at line 401 and the "Cost:" bullet at line 622 with the same wording: "rawMaterial(event) = actualCost ?? costSnapshot?.rawMaterial ?? liveRecipeCost; all three are recipe cost only; extras are always added on top by kind."
4. Section 7.6: `MP calculé(m) = Σ over completed events dated in m of (rawMaterial(event) + extras.matiere)`, with matiere extras counted exactly once. Personnel extra and Autres coûts keep reading extras.personnel and the remaining kinds from the same helper.
5. Section 5 event page (line 271): the "Coût matières" MoneyTile shows rawMaterial(event) + extras.matiere, the "Coût total" uses total, so the event page and the income statement agree per event.
6. Migration 002 writes the recipe-only rawMaterial (Σ unitCost × portions at today's prices, approximate: true); EventsService.update on completion writes the same figure via calcEventCost.

### [completeness-2] (high · CONFIRMED) 7.1 Interactive planning (Revenue), 5.1 Semaine, 2 table row 1, 8 Slice 2 / Slice 4 / Slice 5

**Claim:** 7.1: 'The month figure compares Σ signed events in the calendar month of the week's Thursday with objectives[year].monthlyOverrides[ym] ?? annualRevenue / monthsActive'. 2: 'signed revenue per day and week, month progress bar' (slice 2). 5.1: slice 4 adds 'CA du mois (Σ ledger sales HTVA month to date with the objective as a progress bar)'.

**Problem:** `settings.objectives` and the Prévisionnel form that edits them ship in slice 5 (section 8: 'settings fixedCharges, objectives with their Paramètres sections'). In slices 2 to 4 there is no objective, so the month progress bar has no denominator. A developer building Week.tsx in slice 2 has nothing to compare against.

**Evidence:** 02-synthesis-draft.md section 8 Slice 5 scope versus 7.1 Revenue paragraph and 5.1 money strip.

**Fix:** Either move `settings.objectives` (the YearObjective record and its Paramètres section only, not the Prévisionnel page) to slice 2 or 4, or drop the objective bar from slice 2 and 4 and state that the month tile shows only 'Signé ce mois' until slice 5.

**Refuter:** Confirmed against the draft and the code. Draft line 11 (section 2 row 1) promises a "month progress bar" on the week home and points to 5.1 and 7.1. Line 661 (7.1) computes the month figure against `objectives[year].monthlyOverrides[ym] ?? annualRevenue / monthsActive` and says "after slice 4 a second tick shows Σ ledger sales HTVA", so the objective comparison is a slice 2 deliverable. Line 215 (5.1) puts "CA du mois ... with the objective as a progress bar" in slice 4. Line 789 (7.6) lists "CA du mois with objective bar" in the strip that replaces the Dashboard deleted in slice 4. Section 8: slice 2 schema (line 826) is "line fields, recipe.defaultCourse, settings.courses, groceryList.eventIds/range/excludeDone"; slice 4 scope (line 839) names settings `prestationTypes` and `company` only; slice 5 (line 847) is the first mention of `objectives` and its Paramètres section. Nothing in the codebase supplies a fallback: `packages/types/src/entities/settings.ts` has no objective field, and the only "override" in `apps/frontend/src/pages/admin/Dashboard.tsx` (line 204) is the tax-rate input, not a revenue target. So in slices 2, 3 and 4 the bar has no denominator. The finding also understates one thing: 5.1, 7.1 and 7.6 disagree on which slice shows the month tile and what the tiles are (5.1 has five tiles with "Préparation" and no "Signé ce mois"; 7.6 has four with "Signé ce mois" and no "Préparation"). The proposed fix is workable but moves the whole YearObjective record (eleven fields, most of them report inputs with no consumer before slice 5) and does not reconcile the three sections.

**Corrected fix:** Move only the planning fields of the objective into slice 2 and make 5.1, 7.1, 7.6 and section 8 agree. Concretely:

1. Slice 2 scope and schema (section 8, lines 823 and 826): add `settings.objectives` limited to `annualRevenue`, `monthsActive` (default 10) and `monthlyOverrides?`. Slice 2 already edits `packages/types/src/dto/settings.ts`, `apps/backend/src/settings/settings.service.ts` and `apps/frontend/src/pages/admin/Settings.tsx` for `settings.courses`, so this is the same files plus a two-input "Objectifs par année" section (CA annuel HTVA, mois actifs). The read rule `objectives ?? {}` is already in section 6 (line 624).

2. Section 6 YearObjective (lines 425 to 435): mark `byPrestation`, `hoursAvailablePerMonth`, `rawMaterialPct`, `corporateTaxRate`, `extrasBudget`, `treasuryMonths`, `treasurySavingPerMonth` and `investments` as optional with the stated defaults filled by `SettingsService.get`, so a slice 2 record with only the three planning fields validates. Slice 5 scope (line 847) becomes "the remaining `objectives` fields and the Prévisionnel form" instead of `objectives`.

3. Make the three strip descriptions one description. Slice 2 strip: "Signé cette semaine", "Signé ce mois" with the objective bar (`objectif mensuel(m)` as defined at line 759), "Préparation 18 / 40". Slice 4 adds "CA du mois" (Σ ledger sales HTVA) as the second tick on the same bar, "À encaisser" and "Marge brute du mois %". Edit 5.1 (line 215), 7.1 (line 661) and 7.6 (line 789) to that wording; 7.6 currently omits "Préparation" and 5.1 omits "Signé ce mois".

4. State the empty case in 5.1 and section 6: when `objectives[year]` is absent, the tile shows "Signé ce mois" with no bar and a "Définir l'objectif" link to `/settings`.

Acceptable alternative if the developer prefers no settings work in slice 2: drop the objective bar until slice 5 and edit section 2 row 1, 5.1, 7.1 and 7.6 so the month tile is "Signé ce mois" only before slice 5. Note this leaves no objective anywhere under the "stop after slice 4" fallback at line 857.

### [completeness-3] (medium) 5.1 Semaine (money strip) versus 3 Removed or merged and 7.6 What the Dashboard becomes

**Claim:** 5.1: slice 2 shows 'Signé cette semaine' and 'Préparation 18 / 40 lignes faites'; slice 4 adds 'CA du mois', 'À encaisser', 'Marge brute du mois %' (five tiles). 3 and 7.6: 'the money strip (four tiles)': 'CA du mois with objective bar, Signé ce mois, À encaisser, Marge brute du mois %'.

**Problem:** Three descriptions of the same strip disagree on tile count (five versus four) and on the signed tile's period (cette semaine versus ce mois). The Préparation tile exists only in 5.1.

**Evidence:** Draft lines 78, 215, 789.

**Fix:** Pick one list and copy it into 3, 5.1 and 7.6. Suggested: slice 2 = Signé cette semaine, Préparation; slice 4 adds CA du mois, À encaisser, Marge brute (five tiles); drop 'four tiles' from 3 and 7.6.

### [completeness-4] (medium) 1 Summary versus 6 Endpoints and 5.12 Journal

**Claim:** Summary: 'all views over an append-only ledger'. Endpoints: 'POST / PATCH / DELETE /admin/ledger[/:id]'. 5.12: 'Row tap edits'.

**Problem:** An entry that can be patched and deleted is not append-only. The brief's constraint is 'never silently change a historical figure'; the data model audit recommended corrections as new entries or an explicit confirm. The draft never says which model it picked, so a developer does not know whether to implement correction entries or in-place edits with a lock.

**Evidence:** Draft lines 5, 602, 320; audits.md 'Job: close': 'Entries are immutable records; edits create a corrected entry or require an explicit confirm'.

**Fix:** Replace 'append-only' with 'a ledger of records edited only on purpose' and state the rule once: in-place edit allowed while unlocked, 409 when locked, no soft-delete; or, if correction entries are wanted, add `correctsEntryId?` and remove DELETE.

### [completeness-5] (medium) 7.6 Accounting (How an event becomes a journal line, Export)

**Claim:** 'Export sets `locked`; editing a locked line asks Déverrouiller.' Four paragraphs later: 'The export never writes figures back; Verrouiller le mois is a separate confirmed action.' 5.12 has both an 'Exporter' and a 'Verrouiller le mois' button.

**Problem:** The same section says the export locks and that the export does not lock. The endpoint table only has `POST /admin/ledger/lock { ym }`.

**Evidence:** Draft lines 747 and 787; 5.12 button list at line 318.

**Fix:** Delete 'Export sets locked' from the event-to-journal paragraph. Keep: export is read-only; lock is `POST /admin/ledger/lock` behind a confirmation, offered as a follow-up toast after a successful export.

### [completeness-6] (medium) 5.11 Clients versus 7.5 Clients and weekly templates and 6 Backward-compatible read rules

**Claim:** 5.11: 'delete is refused with 409 when events reference the client and the UI offers Archiver'. 7.5: 'Deleting a client keeps its events; a dangling clientId renders as the stored contactName.' Endpoint table: 'DELETE 409 IN_USE'. Read rule: `clientById.get(event.clientId)?.name ?? event.contactName ?? event.name`.

**Problem:** Delete is either refused when referenced or allowed with dangling ids; the draft states both. The read rule for dangling ids is only needed if deletes are allowed (or for migration 003 partial runs).

**Evidence:** Draft lines 304, 731, 599, 621.

**Fix:** Keep the 409 and `active: false` archive (5.11). Rewrite 7.5 to: 'A client with events cannot be deleted; Archiver hides it from pickers. The dangling-id fallback exists only for safety.'

### [completeness-7] (medium) 9 Open questions (Q7), 8 Slice 4 (Migration), 10 Risks (Approximate snapshots), 5.13 Aperçu

**Claim:** Slice 4: 'No ledger backfill: the journal starts at the month of deployment; the 2025 workbook stays the record for 2025.' Q7: 'Should 2025 journal lines be imported from the workbook so Aperçu can compare years in 2026?' Risks: 'The 2025 income statement is a reconstruction; she can type actualCost or an mp purchase line for those months.'

**Problem:** The live workbook is 2026 and today is October 2026; the roadmap lands the journal in weeks 7-8 (December 2026). The first full app year is 2027, whose Aperçu 'CA N−1', 'Mix CA N−1' and 'Comparaison N−2' columns need 2026 lines, which the plan neither imports nor asks about. With no 2025 or 2026 ledger there is no CA for those months, so there is no 'reconstructed 2025 income statement', and migration 002 snapshots pre-deployment events whose revenue never enters the ledger.

**Evidence:** 01-livre-des-comptes-excel.md: '2026 month sheets are empty templates'; draft lines 841, 867, 876; 5.13 and 7.6 report columns.

**Fix:** Change Q7 to ask about importing the current year's month sheets (same 14 columns as the export, so a `ledger-import.ts` reading the workbook is the inverse of `ledger-export.ts`, about one day). Rewrite the risk: 'Pre-deployment months have MP snapshots but no ledger revenue; the income statement is blank for them unless the year is imported.' Scope migration 002 to events dated in or after the first ledger month, or drop it.

### [completeness-8] (medium) 3 Removed or merged versus 7.1 Interactive planning (Dates)

**Claim:** 3: '`WeekPlannerModal`, `generateAggregatedPdf`, `startOfWeekMonday`, `endOfWeekSunday` in Events.tsx are deleted'. 7.1: '`startOfWeekMonday` and `endOfWeekSunday` leave Events.tsx' into `apps/frontend/src/lib/dates.ts`.

**Problem:** Deleted versus moved. Minor, but it is exactly the kind of statement the brief asked to be checkable.

**Evidence:** Draft lines 74 and 659.

**Fix:** In 3 write: '`startOfWeekMonday` and `endOfWeekSunday` move to `lib/dates.ts`; `WeekPlannerModal` and `generateAggregatedPdf` are deleted.'

### [completeness-9] (medium) 7.4 Event recipe ordering, 5.17 Paramètres, 6 Taxonomies (three taxonomies and settings.recipeCategories)

**Claim:** 7.4: courses are 'separate from `recipeCategories` (service formats) and from prestation types (on the event)'. 5.17 keeps 'Catégories de recettes (with an optional emoji)'. Section 6 adds `categoryIcons` but leaves `recipeCategories` untouched.

**Problem:** The brief's interpretation and 01-livre-des-comptes-excel.md both say the recipe category list 'should probably be renamed or merged' into prestation types. The draft keeps all three taxonomies but never states the decision, so a developer does not know whether 'Menu semaine' / 'Buffet' on recipes stays as the service format, gets relabelled 'Format de service', or is retired. The overlap between recipe 'Buffet' and prestation 'buffet_a_emporter' / 'buffet_avec_service' is not mentioned anywhere.

**Evidence:** 00-brief.md section 2 bullet on prestation types; 01-livre-des-comptes-excel.md 'Taxonomies and facts to reuse'; packages/types/src/entities/settings.ts DEFAULT_RECIPE_CATEGORIES; draft 7.4 first paragraph, 5.17.

**Fix:** Add one paragraph to 7.4: 'recipe.type and settings.recipeCategories stay as the recipe's service format, unchanged, no migration; the Paramètres heading becomes Formats de recette; prestation type is set on the event only and never derived from recipe.type.' Add a row to the section 2 table for the interpretation bullet.

### [completeness-10] (medium) 5.1 Semaine (Laptop layout)

**Claim:** 'Columns scroll inside `max-h-[calc(100dvh-220px)]`; the header stays fixed. Six events and forty lines fit: the tallest column is about 3 × 72 + 15 × 36 px plus collapsed rows.'

**Problem:** 3 × 72 + 15 × 36 = 756 px before headers and collapsed rows. On a 768 px laptop the column has 548 px, on 900 px it has 680 px, so the busiest column scrolls in both cases. The sentence claims the opposite of its own arithmetic.

**Evidence:** Arithmetic on the draft's figures (line 217).

**Fix:** Replace with: 'A column with three events and fifteen lines is about 760 px, so on a 768 px laptop the busiest day scrolls inside its column; the Lignes / Événements toggle is the overview.'

### [completeness-11] (medium) 3 Information architecture (Screens and routes) versus 5.9, 7.5, 5.5

**Claim:** The screens table lists `/grocery-list`, `/grocery-list?id=`, `/clients`, `/clients/:id`, `/recipes/:id?mode=edit`, `/recipes/:id/edit`.

**Problem:** Routes used elsewhere are missing: `/grocery-list/new?from=&to=` (5.1, 5.9, 7.1), `/clients/new` (7.5), `/recipes/new` and `/events/new` for creation. More important, `RecipeEditor.tsx` (333 lines, the form editor behind `/recipes/new` and `/recipes/:id/edit`) is never given a fate: 5.5 keeps RecipeDetail's inline-edit JSX behind `?mode=edit`, so two editors for one entity survive and the draft does not say which one 'Modifier' or 'Nouvelle recette' opens, nor whether RecipeEditor is restyled. The brief's question 1 asks 'what screens exist'.

**Evidence:** apps/frontend/src/App.tsx routes `/recipes/new`, `/recipes/:id/edit`, `/events/new`; draft lines 52-69, 257-261, 289, 725.

**Fix:** Add the missing rows. Add a 'Recette (formulaire)' row for RecipeEditor with a status (restyled with FieldLabel in slice 1, used for creation and photo upload; inline `?mode=edit` for quick edits), or state that RecipeEditor is retired in slice 5 when InlineField lands.

### [completeness-12] (low) 2 table (Request 2) and 5.7 Événement versus 8 Slice 2 / Slice 5

**Claim:** 2: '▲▼ on phone and drag on laptop' with Where 5.7, 6, 7.4. 5.7: 'a drag handle (pointer) or ▲▼ buttons (touch, 44px)' with no slice note.

**Problem:** Slice 2 ships 'EventDetail.tsx menu by course with ▲▼' and slice 5 ships 'drag reorder on laptop'. A reader of 5.7 or the table would expect drag in slice 2.

**Evidence:** Draft lines 16, 273, 823, 847.

**Fix:** Add '(drag from slice 5)' in 5.7 and in the table row.

### [completeness-13] (low) 7.7 AI versus 7.8 Out of scope (Full invoicing) and 00-brief Points ouverts

**Claim:** 7.7: 'Not proposed: AI for duplicates, pricing, planning suggestions, or anything that writes to the ledger.' 7.8: 'A Falco PDF drop that prefills the entry form is a later optional AI slice.'

**Problem:** 7.8 proposes an AI feature that 7.7 says is not proposed (it feeds the ledger form). The brief's two other open points are also unaddressed: the 'compte ChatGPT' option (the draft only covers an API key) and 'relire les notes de l'entretien avec le commercial Enobase' (no open question asks Dalia what Enobase's AI does).

**Evidence:** Draft lines 797, 801; 00-brief.md 'Points Ouverts'.

**Fix:** Either delete the Falco-drop sentence in 7.8 or list it in 7.7 as a second optional feature with input, output and UI location. Add to 7.7: 'A ChatGPT account cannot be called from the backend; only an API key works.' Add open question 10: 'What did the Enobase salesperson say the AI does? Default: nothing in the plan depends on the answer.'

### [completeness-14] (low) 3 Sidebar, 3 Removed or merged, 4 Type scale (line and count references)

**Claim:** 'The version string at `AdminSidebar.tsx:94` moves to Paramètres.' 'deleted in slice 4 with `estimateBelgianTax` (lines 308 to 325)'. '57 `uppercase` hits under `pages/admin`'. 7.6: '`Dashboard.tsx:104-106`'.

**Problem:** Line 94 of AdminSidebar.tsx is the Déconnexion button; the version string `admin · v1.0` is at line 86. `estimateBelgianTax` spans 308 to 326. `getMonth()` is at Dashboard.tsx:107 (105-107 for the three lines). `grep -o uppercase` over pages/admin returns 60, of which 31 are `uppercase tracking-wider`.

**Evidence:** apps/frontend/src/components/admin/AdminSidebar.tsx:86; apps/frontend/src/pages/admin/Dashboard.tsx:308-326 and 105-107; grep counts run on 2026-10-12.

**Fix:** Change to `AdminSidebar.tsx:86`, 'lines 308 to 326', 'Dashboard.tsx:105-107', and '60 `uppercase` hits (31 with tracking-wider)'. The 14 `text-[10px]`/`text-[11px]` count and its per-file split are correct.

### [completeness-15] (low) 6 Backend plumbing (Delete packages/utils) and 8 Slice 1

**Claim:** 'Delete `packages/utils` (update `jest.config.js` moduleNameMapper, `tsconfig.json` paths, and the root `type-check` script) and the dead `TABLE_NAMES` export.'

**Problem:** jest.config.js also contains a whole `utils` project (displayName 'utils', rootDir packages/utils, its own ts-jest transform), not only a moduleNameMapper entry; the root `test` run fails if that project block stays. `TABLE_NAMES` exists in two places: `packages/types/src/constants/constants.ts` (re-exported from `packages/types/src/index.ts:3`) and `packages/utils/src/constants.ts`; the draft does not say which one is 'the dead export'.

**Evidence:** jest.config.js lines 39-62 (utils project) and 67-78 (types project); packages/types/src/index.ts:3; packages/utils/src/constants.ts:4.

**Fix:** Write: 'remove the `utils` jest project block and the two `@packages/utils` moduleNameMapper lines; delete `packages/types/src/constants/` and its re-export in `index.ts`; drop `@packages/utils` from the root type-check script and tsconfig paths.'

### [completeness-16] (low) 5.12 Comptes · Journal versus 6 Endpoints (ledger)

**Claim:** 5.12: 'locked rows show Verrouillé and need Déverrouiller with confirmation'. Endpoint table: 'POST / PATCH / DELETE /admin/ledger[/:id] ... 409 when locked'; `POST /admin/ledger/lock` only.

**Problem:** There is no endpoint that unlocks a line or a month. A PATCH `{ locked: false }` would be refused by the 409 rule as written.

**Evidence:** Draft lines 320, 602, 605.

**Fix:** Add `POST /admin/ledger/unlock { entryId }` (or `{ ym }`) to the endpoint table, or state that PATCH with only `{ locked: false }` bypasses the 409 check.

### [completeness-17] (low) 10 Risks (Pro-rata attribution) versus 5.16 Comptes · Au réel

**Claim:** Risks: 'Au réel shows both the attributed figure and the invoice total so a mismatch is visible.'

**Problem:** 5.16's columns are Client / événement | Type | CA HTVA | Heures | Observations; there is no invoice-total column, and the footer has no reconciliation line.

**Evidence:** Draft lines 338 and 879.

**Fix:** Add to 5.16: a muted second line under CA HTVA, 'Facture 2026-014 : 1 840 € sur 3 événements', when the entry has several eventIds; or remove the sentence from the risk.

### [completeness-18] (low) 4 Component primitives, 5.5, 5.7 versus 8 Slice 1 / Slice 2 / Slice 4 / Slice 5

**Claim:** 5.5 (slice 1): 'Coût matières (today's six-column table at text-sm, DataTable with card fallback)'. 5.7 (slice 2): 'Four MoneyTiles ... using the shared calcEventCost'. Slice 1 scope lists PageHeader, Section, Tag, StatusTag, ListRow, Stepper, SectionToggle, FieldLabel, RecipeReader and moves scaleQty, calcIngredientLineCost, calcRecipeCost.

**Problem:** `DataTable` is used in slice 1 but built in no slice (only 'DataTable card fallbacks' in slice 5). `MoneyTile` is used in 5.7 and 5.13 and appears in no slice scope. `calcEventCost` is used by the slice 2 EventDetail restyle but is moved to `costing.ts` only in slice 4 ('calcEventCost used by EventDetail, EventEditor and reports').

**Evidence:** Draft lines 192, 194, 259, 271, 814, 839, 847.

**Fix:** Add `DataTable` (table mode only) and `MoneyTile` to slice 1 or 2 scope; move `calcEventCost` into the slice 1 costing.ts move, since 5.7 and the snapshot both need it.

### [completeness-19] (low) 7.6 Accounting (Files) and 8 Slice 4 versus 6 Taxonomies and money

**Claim:** Files: 'frontend ... `lib/accounting.ts`, `lib/ledger-export.ts`'. Slice 4 scope: '`accounting.ts`, `ledger-export.ts`'. Section 6: report maths in `packages/types/src/lib/reports.ts` 'all pure and covered by the existing types jest project' (slice 5).

**Problem:** `apps/frontend/src/lib/accounting.ts` is named twice but its content is never described, while 7.6 says 'everything on the Comptes pages is a view computed ... by packages/types/src/lib/reports.ts'. A developer cannot tell what goes where.

**Evidence:** Draft lines 433, 791, 839; audits.md 'Date grouping' recommended a `groupByMonth` helper in accounting.ts.

**Fix:** One sentence in 7.6: '`lib/accounting.ts` holds UI glue only: `groupByMonth`, month labels, the journal row model and the prefill-to-form mapping; every figure comes from `reports.ts`.' Or drop the file.

### [completeness-20] (low) 6 Zod DTOs (recipes.ts: pricing tva: vatRate)

**Claim:** 'recipes.ts: `defaultCourse: z.string().trim().optional()`; `pricing tva: vatRate`' (union of 0, 6, 12, 21).

**Problem:** Today `tva` is `z.number().nonnegative()` (packages/types/src/dto/recipes.ts:12-13). Any live recipe whose pricing.tva is another value would fail its next save through RecipeDetail or RecipeEditor, which breaks the brief's 'new fields must be optional on read or come with a migration' rule for an existing field. The draft also uses three names for one concept: `tva` (recipe), `vatRate` (event, client), `vat[].rate` (ledger).

**Evidence:** packages/types/src/dto/recipes.ts:12-13, :33-34 (defaults 12 and 6); 00-brief.md section 4 constraint on live data.

**Fix:** Keep `tva: z.number().nonnegative()` and add a UI select limited to VAT_RATES; or add a dry-run check in migration 001 that lists recipes with non-standard tva before tightening the schema. Note the naming in 6 as intentional (recipe field unchanged for compatibility).

### [completeness-21] (low) 6 Client (ClientTemplate) and Zod DTOs (clients.ts) versus 7.5

**Claim:** `ClientTemplate.recipes: EventRecipeLine[]` where `EventRecipeLine.lineId` is required; `clientTemplateSchema.recipes: z.array(eventRecipeLineSchema)` where lineId is optional and `prepStatus`, `prepDate` are allowed. 7.5: instantiation creates 'recipes with fresh lineIds and no prepStatus'.

**Problem:** A weekly template line can carry an absolute `prepDate` and a `prepStatus`, both meaningless in a template, and the TS type demands a `lineId` the DTO does not. 7.4 says 'instantiation regenerates lineId only', which would copy a stale prepDate into every new event.

**Evidence:** Draft lines 405-413 (EventRecipeLine), 471-479, 544-548 (clientTemplateSchema), 721, 729.

**Fix:** Define `templateLineSchema = eventRecipeLineSchema.omit({ lineId: true, prepStatus: true, prepDate: true })` and a `TemplateLine` type `{ recipeId, portions, course?, notes? }`; say instantiation adds lineId and leaves prepStatus and prepDate unset.

### [completeness-22] (low) 8 Slice 1 versus Slice 2 (SETTINGS_TTL) and 5.10

**Claim:** Slice 2 scope: '`SETTINGS_TTL` to 30 s'. Slice 1 ships `settings.ignoredDuplicateGroups` written by 'Ignorer ce groupe' on /ingredients/doublons.

**Problem:** With the 120 s settings cache (api.ts:47) an ignored group comes back for up to two minutes after a reload in slice 1, unless `api.settings.update` invalidates the cache (the draft does not say it does).

**Evidence:** apps/frontend/src/lib/api.ts:47 and :103; draft lines 299, 816, 823.

**Fix:** Move the TTL change to slice 1, and add `settings.update → ['settings']` to the invalidation list in 6 Backend plumbing.

### [completeness-23] (low) 3 Sidebar ('Finances (ancien)', '2 to 4 only') versus 3 Screens table and 7.6

**Claim:** Sidebar: 'Finances (ancien) | /finances | 2 to 4 only'. Screens: 'moved Dashboard.tsx, deleted in slice 4'. 7.6: 'Moved to /finances in slice 2, deleted in slice 4.'

**Problem:** '2 to 4' reads as present in slice 4; the other two say it is deleted in slice 4, so it exists in slices 2 and 3. While it exists it still shows the sole-trader tax toggle that the brief's section 3 calls wrong for an SRL; the draft does not say whether that toggle is hidden in slice 2.

**Evidence:** Draft lines 41, 68, 789; Dashboard.tsx:308-326.

**Fix:** Write 'slices 2 and 3'. Add to section 3: 'In slice 2 the tax toggle and override input are hidden (one `false` constant); the chart and KPIs stay until slice 4.'

### [completeness-24] (low) 6 Event (AppEvent additions) and 5.7 Heures et déplacements

**Claim:** `hoursPlanned?: number; hoursSpent?: number; km?: number; serviceTime?: string;` and 5.7 section 'Heures et déplacements (slice 4): hoursPlanned, hoursSpent, km, serviceTime'.

**Problem:** `serviceTime` is never defined (clock time of service? duration?), is not in the workbook, is not used by any report or screen beyond that list, and `z.string().optional()` has no format.

**Evidence:** Draft lines 420, 275, 535; 01-livre-des-comptes-excel.md 'Hours' bullet (time spent, time available, extras' hours only).

**Fix:** Either define it ('HH:MM, the delivery or service hour shown on the day view and the menu proposal PDF', regex `^\d{2}:\d{2}$`) and reference it in 5.2 and 7.8, or drop it.

### [completeness-25] (low) 9 Open questions and 5.1 / 5.16 ('signé' semantics) and 7.6 prefill

**Claim:** 5.1 labels Σ price × guests of upcoming events 'Signé cette semaine'; 5.16 tags rows 'signé' or 'facturé'; 7.6 prefills an invoice from `sellingPricePerGuest × guestCount`.

**Problem:** Every upcoming event is treated as signed; the journey audit flagged that quotes not yet accepted may exist and suggested asking. The monthly Hoona invoice is also assumed to be price × guests, while the workbook's recurring lines are flat amounts ('facture comptoir janvier 2025 842.92'). Neither assumption is in the open questions. Also, Au réel's rule 'attributed journal HTVA when any entry exists' means an event with only an acompte shows the deposit as its CA, understating 'signé' relative to the workbook, which counts the deposit on top of the signed amount.

**Evidence:** audits.md 'Job: take an order' (quote state) and 'Revenue model cannot feed the journal' (facture comptoir); draft lines 215, 338, 744, 751.

**Fix:** Add Q10 'Are all events in the app confirmed, or do you enter quotes too? Default: all confirmed; no quote status.' Add Q11 'Is the monthly office invoice per head or a flat amount? Default: per head, overwritten in the form.' In 7.6 use 'Σ facture-kind entries when any exist, else price × guests' so a lone deposit does not replace the signed figure.

### [completeness-26] (low) 6 Endpoints (GET /admin/ledger?year=) versus 00-brief section 3 (scanAll weakness)

**Claim:** `GET /admin/ledger?year=2026` returns `LedgerEntry[]`; the Journal page filters by month and book client-side.

**Problem:** The brief lists 'every list page does scanAll ... worth noting for any new access pattern' as a weakness to answer. The draft never states that the ledger read is a scanAll with a server-side year filter, nor bounds it (the data model audit said no GSI is needed below about 1 000 lines per year). The duplicates endpoint also scans recipes and grocery lists on every call without saying so.

**Evidence:** 00-brief.md section 3 'Weaknesses'; audits.md 'Ledger' recommendation ('scanAll + filter by yearMonth is enough at ≤ ~1 000 lines/year; no GSI yet').

**Fix:** Add one line under Endpoints: 'Both new tables are read with `scanAll` and filtered in the service (`ym.startsWith(year)`); at a few hundred lines a year this is the same cost as events. A GSI on `ym` is the first change if the journal passes a few thousand lines.'

### [completeness-27] (low) 5.17 Paramètres (course rename) versus 6 Endpoints and 7.4

**Claim:** 'Renaming a course offers Renommer aussi sur 42 lignes d'événement, which runs a client-side loop of line PATCHes.'

**Problem:** `PATCH /admin/events/:id/lines/:lineId` is one request per line and has no `expectedUpdatedAt`; forty-two concurrent requests against the same few events race on the `recipes` array inside `ddb.update`. The draft's own ordering rule (7.4) routes whole-array changes through `PUT /admin/events/:id/lines` with the set check.

**Evidence:** Draft lines 345, 593-596, 717.

**Fix:** Group lines by event and send one `PUT /admin/events/:id/lines` per event with the renamed course, sequentially; or add a `POST /admin/settings/courses/rename { from, to }` that does it server-side.

### [completeness-28] (low) 6 LedgerEntry (ym written server-side) versus Endpoints (PATCH /admin/ledger/:id partial)

**Claim:** `ym: string; // "2026-10", written server-side from date.slice(0, 7)` and `PATCH /admin/ledger/:id` accepts a partial `createLedgerEntrySchema`.

**Problem:** A PATCH that changes `date` must rewrite `ym`, and a PATCH that changes only `htva` must still satisfy the VAT identity, which the partial schema cannot check without the stored entry. Neither rule is stated, and `z.union(...).refine(...)` has no `.partial()`, so the PATCH DTO as written does not exist.

**Evidence:** Draft lines 498, 575-577, 602.

**Fix:** State: 'PATCH loads the entry, merges, re-validates with `createLedgerEntrySchema`, recomputes `ym`, then updates.' Define `updateLedgerEntrySchema = z.object({ ...base, ... }).partial().strict()` without the refine and move the identity check into the service.

### [simplifier-1] (high · CONFIRMED) 6 Migration runner / 8 Slice 2

**Claim:** Add tsx as a backend devDependency and one runner apps/backend/scripts/migrate.ts; 001-line-ids is mandatory before the line endpoints ship; 002-cost-snapshots and 003-clients-from-contacts follow. Risk section: 'the frontend must not deploy before the script has run'.

**Problem:** A migration runner with a hard deploy-ordering constraint is the single most likely thing to stall a solo developer on a hand-provisioned EC2 (dotenv, ConfigService boot, AWS credentials on the laptop, dry-run then real, then deploy frontend). The lazy alternative removes the runner, the ordering constraint and the tsx dependency. Migrations 002 and 003 have little value: 002 writes approximate snapshots the draft itself labels a reconstruction, and the 2025 workbook stays the record; 003 creates clients from contactEmail for three or four recurring clients Dalia can create by hand.

**Evidence:** apps/backend/package.json has no tsx, ts-node or scripts dir; apps/backend/src/events/events.service.ts:28-50 create/update are the only write paths; audits.md datamodel 'Event recipe lines' recommendation already proposed the lazy fill (`recipes.map(l => ({ ...l, lineId: l.lineId ?? randomUUID() }))`); draft lines 627-641 and 874.

**Fix:** Cut the runner and all three migrations. In EventsService add a private `withLineIds(event)` used by get, getOrFail and getAll: if any line lacks a lineId, fill it with randomUUID() and persist with one ddb.update({ recipes }) before returning. create, update and putLines also fill missing ids. Readers fall back to live cost for events completed before the snapshot exists (tag 'calculé'); Dalia types actualCost for any month she wants exact. Clients are created by hand from the client picker. Delete the 'Migration 001 is a hard ordering constraint' risk.

**Refuter:** The finding's facts check out and the problem is real.

Draft claims confirmed: docs/redesign/02-synthesis-draft.md:627-641 adds a tsx devDependency and apps/backend/scripts/migrate.ts with three migrations; :637 marks 001-line-ids "mandatory before the line endpoints ship"; :719 says "lineId is required after migration 001, which runs before the line endpoints ship, so there is no index-based fallback"; :823-825 put tsx and the runner in slice 2 scope with "001-line-ids --dry-run, then real, before the frontend deploy"; :874 is the "Migration 001 is a hard ordering constraint" risk; :833 and :841 schedule 003 and 002.

Codebase confirmed: apps/backend/package.json has no tsx or ts-node and apps/backend contains only dist, node_modules, src, nest-cli.json, package.json, tsconfig.json (no scripts dir). apps/backend/src/events/events.service.ts:28-50 create and update are the only content write paths (delete at :52). No other backend module reads the events table (grep for tables.events / EventsService outside apps/backend/src/events returns nothing), so a fill in EventsService covers every reader. The audits already recommended the lazy fill with "No migration needed" (docs/redesign/workings/audits.md:232).

Ops cost is real, not hypothetical: README.md:153-158 documents only the first-boot bootstrap, no redeploy or one-off-script procedure. apps/backend/.env on the laptop points at the -dev tables (suffix check), so running the runner against live data means either swapping five table names locally or SSH-ing to the EC2 and running tsx there, between the backend deploy and the frontend deploy. The draft's own mitigation (:874, "EventsService still fills missing ids on write") shows the runner is redundant with the service-side fill.

002 adds nothing the design does not already have: precedence is actualCost ?? costSnapshot?.rawMaterial ?? liveCalc (:401), so a completed event without a snapshot already renders live cost; 5.14 already defines the "calculé" tag; the snapshot 002 would write equals the live calc at the moment it runs and is flagged approximate anyway; POST /admin/events/:id/snapshot already exists for freezing one event on purpose; the income statement prefers mp purchase lines when any exist for the month. 003 is already labelled optional (:639) and old events keep rendering through contactName (:833).

The fix is right in direction but incomplete or imprecise in five places, corrected below: it must not bump updatedAt on the read-path backfill (the draft adds expectedUpdatedAt optimistic concurrency); getOrFail delegates to get so only get and getAll need the fill; the entity type can stay lineId: string required because the service guarantees it; "Dalia types actualCost for any month" conflates per-event actualCost with per-month mp lines; dropping 003 loses the client page history and year total for pre-slice-3 events, which should be stated, with an in-app link action as the no-runner replacement if she wants it.

**Corrected fix:** Cut the runner, the tsx devDependency and all three migrations. Concrete edits:

1. Section 6 "Migration runner" (lines 627-641): replace with "Lazy line ids". EventsService gets a private withLineIds(event): if event.recipes has any line without lineId, map lines to { ...l, lineId: l.lineId ?? randomUUID() }, persist with ddb.update(table, { eventId }, { recipes }) and return the filled object. Do not touch updatedAt in that update, so expectedUpdatedAt concurrency is unaffected and the returned object matches storage. Call it in get and getAll (getOrFail delegates to get). Skip events with no lines or with all ids present, so the write happens once per event. create, update and putLines fill missing ids on write as the draft already says. Entity keeps lineId: string required; the comment at line 369 becomes "guaranteed by EventsService on every read and write". Line DTO keeps lineId optional on input.

2. Section 7.4 line 719: replace "lineId is required after migration 001, which runs before the line endpoints ship" with "every event returned by the API carries lineIds because the service fills and persists them on first read, so there is no index-based fallback". The PUT set check stays valid because the client always loaded ids.

3. Slice 2 (lines 823-825): remove "tsx devDependency and apps/backend/scripts/migrate.ts with 001-line-ids"; Migration line becomes "none; lineIds are filled on first read". Keep "Deploy order: pnpm build:types, backend, then frontend" because the frontend calls new endpoints.

4. 002: delete line 638, the sentence at line 757 ("Migration 002 snapshots already-completed events...") and the slice 4 Migration line at 841 (keep "No ledger backfill..."). Remove approximate?: boolean from EventCostSnapshot (line 387) or keep it only for the existing POST /admin/events/:id/snapshot. Risk "Approximate snapshots" (line 876) becomes: events completed before slice 4 show live cost tagged "calculé" until she types actualCost on the event, enters an mp purchase line for the month (which the income statement prefers), or presses the per-event snapshot action. If bulk freezing is ever wanted, add POST /admin/events/snapshot-completed in the API (loop over completed events without costSnapshot, same code as completion), not a script.

5. 003: delete line 639 and the slice 3 Migration line at 833 ("Old events keep working through contactName" stays). State the consequence: the client page's Historique, "4 820 € cette année" and the four-week grid only see events created with a clientId. If she wants Hoona's history linked, add "Associer les événements existants" on the client page calling POST /admin/clients/:id/link-events { contactEmail?, contactName? }, which scans events, sets clientId where the contact matches and clientId is absent, and returns { linked }. Optional, no runner.

6. Risks: delete "Migration 001 is a hard ordering constraint" (line 874). Add one line: on the very first read after deploy, two overlapping reads of the same event can generate different ids and the second write wins; single user, sub-second window, the losing tab gets a 404 on its next line PATCH and reloads. If the developer wants a guard, pass a condition attribute_not_exists(#recipes[0].lineId) to the backfill update via the condition option added to DdbService.update for expectedUpdatedAt.

7. Section 1 summary: drop "with one migration runner".

### [simplifier-2] (high · CONFIRMED) 8 Slice 2 scope and effort

**Claim:** Slice 2 (10 to 12 days) includes line DTOs, migration runner, four line endpoints, expectedUpdatedAt and the 409 filter, planning.ts, dates.ts, grocery.ts, StatusControl, Week.tsx, Day.tsx, PrepSheet.tsx, print stylesheet, day-pdf.ts, EventDetail menu by course, EventEditor diff-based autosave, Events.tsx as ListRows, /grocery-list/new generation page, Régénérer banner, sidebar reorder, MobileTabBar, Dashboard move, SETTINGS_TTL.

**Problem:** This is three new pages, two rewritten pages, one new form page, a backend concurrency model, a migration and a navigation redesign in one slice. It is the slice that delivers requests 2 and the interactive planning, so if it slips nothing visible ships for a month. Most of the extras in it are not needed for what Dalia notices.

**Evidence:** Draft lines 821-827; AdminSidebar.tsx:6-13 and :20 (hamburger works today); EventEditor.tsx:66-98; GroceryListPage.tsx:576.

**Fix:** Slice 2 keeps: line fields and strict DTOs with lazy lineId, POST/PATCH/DELETE/PUT lines with the set check, settings.courses and recipe.defaultCourse, planning.ts and dates.ts, StatusControl, Week.tsx, Day.tsx with the print stylesheet, PrepSheet.tsx, EventDetail menu by course with ▲▼, EventEditor sending scalar fields only (see expectedUpdatedAt finding), Events.tsx list cleanup, sidebar reorder with '/' redirect, Dashboard moved to /finances. Defer to slice 5: MobileTabBar, day-pdf.ts, prepDate, the /grocery-list/new form (replace with a one-click 'Courses de la semaine' that creates the list and opens it), the Régénérer banner, the week's long-press status and the Lignes/Événements toggle. Revised effort 7 to 8 days.

**Refuter:** The claim is accurate and the problem is real. Draft line 824 lists every item the finding names in Slice 2. Section 7.1 (draft ~672) counts 7 new files and 9 changed files for planning alone; adding MobileTabBar, AdminLayout, GroceryListPage, migrate.ts, ddb.service.ts, ddb-exception.filter.ts, Dashboard, EventEditor and two DTO files brings the slice to about 25 files, the largest in the plan. The "Dalia notices" line (827) names four outcomes: the week home with revenue, tickable day lists, lines opening the recipe at the right portions, menus in service order. MobileTabBar, day-pdf.ts, the Régénérer banner, the /grocery-list/new form, the Lignes/Événements toggle, prepDate and the week long-press contribute to none of them. The draft's own risk register (line ~874) couples diff-based autosave, expectedUpdatedAt and the line endpoints in one slice and names the slip risk. Code evidence checks out: AdminSidebar.tsx:6-13 is the menuItems array, :20 is mobileOpen, and :125-131 renders sidebarContent(false) in the phone drawer, so reordering menuItems updates the phone navigation without a tab bar. EventEditor.tsx:66-69 buildPayload sends every field including recipes and :95-99 fires it 800 ms after any change. GroceryListPage.tsx:576 is the -m-6 full-bleed hack already scheduled for slice 5 (draft line ~848). The "scalars only" editor is safe on today's backend: dto/events.ts:30 is createEventRequestSchema.partial(), Zod 3.25.76 .partial() over a .default([]) field does not reinject recipes: [] when omitted (tested with node), events.service.ts:40-49 forwards only the supplied fields, and ddb.service.ts:40-70 builds a SET expression from those keys only, so omitting recipes leaves stored lines untouched and expectedUpdatedAt can be deferred without reopening the overwrite risk. The fix is right in direction but incomplete on three points, given in correctedFix: it drops the only paper output while deleting the old PDFs (audits.md:435 and :443 and draft open question 8 all say keep a PDF during the transition, and draft risk ~883 says iOS print breaks are unreliable); it omits migration 001 although PATCH/DELETE /lines/:lineId cannot address lines without ids (draft ~719 and risk ~875 call it a hard ordering constraint); and it omits grocery.ts although the one-click list needs buildGroceryItems once Events.tsx:81-134 is deleted. Effort: the deferred items sum to roughly four days, so 7 to 8 is consistent with the draft's 10 to 12 but sits at the low edge once the migration and the retained PDF button are counted.

**Corrected fix:** Keep the finding's split with these three corrections. (1) Paper fallback: do not delete exportRecipesPdf in EventDetail.tsx (lines 100-175, one function and one button) until day-pdf.ts ships in slice 5. generateAggregatedPdf, WeekPlannerModal and the Events.tsx multi-select still go in slice 2. This keeps a per-event printable sheet with zero new code, matching audits.md:435 ("keep a PDF button for the first months") and draft open question 8. If a day-level PDF is wanted sooner, adapt generateAggregatedPdf (Events.tsx:140-290, already jsPDF plus autoTable) into day-pdf.ts for about half a day; prefer retaining exportRecipesPdf. (2) Migration 001 stays in slice 2: the tsx devDependency and apps/backend/scripts/migrate.ts with 001-line-ids, dry-run then real, before the frontend deploy. "Lazy lineId" means only what the draft already says: the server fills randomUUID() on create, update and putLines when missing. Without the migration, PATCH and DELETE /admin/events/:id/lines/:lineId cannot address lines on existing events. Cost is one script of about 50 lines, under half a day. (3) grocery.ts stays in slice 2: buildGroceryItems(events, lines, recipes, ingredientById) is the body of generateGroceryList (Events.tsx:81-134), which is deleted with the multi-select. The one-click "Courses de la semaine" on Week.tsx and "Courses du jour" on Day.tsx call buildGroceryItems, then api.groceryLists.create({ title: "Courses · semaine 42", items, eventIds, range }) (api.ts:113, extend the create type by two fields), then navigate to /grocery-list?id=<listId>, which GroceryListPage.tsx:98-100 already handles. Write eventIds and range at creation even though the Régénérer banner is deferred, so lists created before slice 5 can be regenerated. Delete the recipe-book:grocery-list-pending hand-off (Events.tsx:127, GroceryListPage.tsx:21, :102-110) in slice 2 as planned. Everything else in the finding stands: defer MobileTabBar and the AdminLayout padding change, the prepDate UI (keep the optional field in the entity and patch DTO, skip the overflow item and the "→ sam." rendering), the /grocery-list/new form, the Régénérer banner, the week long-press status and the Lignes/Événements toggle to slice 5; defer expectedUpdatedAt in DdbService.update and the 409 filter, since EventEditor sends scalar fields only on existing events and line changes go through the line endpoints; keep the PUT set check (read-compare-write in the service). The PrepSheet bottom status bar sits at bottom:0 until the tab bar lands; AdminLayout.tsx:14 pt-[68px] is unchanged. Revised effort 7 to 9 days. Slice 5 absorbs about four days (14 to 16 over its three weeks); drop the Régénérer banner and the Lignes/Événements toggle entirely unless Dalia asks for them after using the week view.

### [simplifier-3] (medium) 6 Data model: Client and LedgerEntry tables / 10 Risks

**Claim:** Two new DynamoDB tables (ta-clients-{stage}, ta-ledger-{stage}), each needing the console, SSM, config.service.ts, ec2-bootstrap.sh, .env, pm2 restart and data-stack.ts, in two different slices.

**Problem:** Each table is the README's four manual steps plus four file edits, done twice on a stack the audits call 'partially out of date'. The ledger cannot live in settings (append-only, grows) and should not live in the events table (every scanAll reader would need a type filter, the same reason the draft rejects templates-as-events). But nothing requires clients and ledger entries to be in different tables: both are single-PK items read by scanAll.

**Evidence:** README.md:178-182; apps/backend/src/config/config.service.ts:7-11; scripts/ec2-bootstrap.sh:45-49 and 66-70; infrastructure/lib/data-stack.ts lists five tables; draft lines 451, 475, 612, 831, 839, 875.

**Fix:** One new table `ta-records-{stage}`, PK `id`, attribute `type: 'client' | 'ledger'`; `tables.records` in DdbService; ClientsService and LedgerService scanAll it and filter by type (a few hundred items a year). Provision it once, in whichever slice first ships a new entity. Lost: nothing at this scale; if the ledger ever needs a GSI on ym it can be added to the same table. Alternative if the developer prefers no shared table: keep ta-ledger only and store clients in settings (`clients?: Client[]`, a handful of records); the trade is settings last-write-wins on a client edit, acceptable for one user.

### [simplifier-4] (medium) 5.8 / 6 DTOs / 6 Backend plumbing: expectedUpdatedAt and the 409 filter

**Claim:** updateEventRequestSchema gains expectedUpdatedAt; DdbService.update appends `AND #updatedAt = :expected`; a ddb-exception.filter maps ConditionalCheckFailedException to 409; EventEditor builds a dirty set against a loadedRef and shows 'Modifié ailleurs, recharger'.

**Problem:** The real bug is EventEditor.buildPayload sending the whole `recipes` array 800 ms after any keystroke, which would overwrite a prepStatus ticked on the phone. The line endpoints already remove status and order from that path. Once the editor never sends `recipes` at all, the only remaining race is two devices editing the same scalar field of the same event within seconds, which does not happen for one user. The dirty-set autosave, the condition expression, the exception filter and the reload UI are three layers against a race that no longer exists.

**Evidence:** EventEditor.tsx:66-70 buildPayload, :98 setTimeout 800; EventDetail.tsx:31-35 saveField already PATCHes only the changed field; ddb.service.ts:41-69 update; draft lines 285, 535, 596, 610-611, 873.

**Fix:** In EventEditor drop `recipes` from buildPayload once the event exists; adding or removing a line in the editor calls POST/DELETE /lines directly, and portion edits call PATCH /lines/:lineId. For new events the create payload still carries recipes. Defer expectedUpdatedAt, the exception filter and the dirty set to a follow-up if a real overwrite is ever observed. Keep the PUT set check (next finding) as the one guard.

### [simplifier-5] (low) 6 Endpoints: PUT /admin/events/:id/lines set check

**Claim:** PUT /admin/events/:id/lines: lineId set must equal the stored set, else 409.

**Problem:** None. This is a five-line comparison in the service and it is the guard that makes dropping expectedUpdatedAt safe: a stale reorder cannot drop or invent a line.

**Evidence:** Draft line 594 and 717; events.service.ts update pattern at :41-50.

**Fix:** Keep. Implement as `new Set(stored.map(l => l.lineId))` equality before writing; return 409 with the missing ids.

### [simplifier-6] (medium) 3 Phone / 8 Slice 2: MobileTabBar, breadcrumbs, sidebar restyle

**Claim:** A bottom tab bar (MobileTabBar.tsx, new) with Semaine, Événements, Recettes, Courses and Plus; a 52px top bar with breadcrumb; AdminLayout adds pb-[64px]; cook mode hides both bars; grocery page sized with h-[calc(100dvh-52px-64px)].

**Problem:** The existing sidebar already has a working phone drawer (mobileOpen state, pt-[68px] in AdminLayout). The light restyle is free once the --sidebar-* tokens change in slice 1. The tab bar is a new component plus layout arithmetic on every page, a 'Plus' sheet, and the unverified iOS 100dvh risk the draft lists as 'Not checked'. What Dalia gains is one tap saved between pages on the phone; with '/' redirecting to the week she lands on the right page anyway.

**Evidence:** AdminSidebar.tsx:16-22 (mobileOpen, collapsed), AdminLayout.tsx:14 `pt-[68px]`; GroceryListPage.tsx:576 `-m-6`; draft lines 46-48, 203, 823, 885.

**Fix:** Slice 1: retoken the sidebar (light panel) and keep the hamburger. Slice 1 or 2: breadcrumbs through the PageHeader prop on detail pages (cheap, replaces navigate(-1)). Defer MobileTabBar and the dvh calc to slice 5 polish, after the kitchen session shows whether she misses it.

### [simplifier-7] (medium) 5.2 Jour print / 7.1: day-pdf.ts and the print stylesheet

**Claim:** @media print on the day view is the paper fallback; 'PDF du jour' via apps/frontend/src/lib/pdf/day-pdf.ts (jsPDF at 11pt) stays for the first months because iOS Safari page breaks are not reliable; removed when Dalia stops using it.

**Problem:** Two renderings of the same structure (groups, lines, scaled ingredient tables): one in React plus 10 lines of print CSS, one in imperative jsPDF code that must be kept in sync with every day-view change. Today's PDF workflow (generateAggregatedPdf in Events.tsx) is a laptop workflow, and on iOS the share sheet's Print preview can be pinched into a PDF from the print stylesheet. The jsPDF file is 150 to 250 lines for a transition the draft already plans to delete.

**Evidence:** Events.tsx:140 generateAggregatedPdf, :452 WeekPlannerModal (laptop modal); draft lines 233, 669, 671, 823, 882; frontend package.json already has jspdf for the single-recipe PDF, which stays.

**Fix:** Keep the print stylesheet only (`@media print` block in index.css plus `.print-break` per group). Cut day-pdf.ts and the 'PDF du jour' buttons. Keep the single-recipe PDF in RecipeDetail. Lost: exact page breaks on iOS; the printed sheet still comes out, with occasional mid-group breaks. Open question 8 stays and is answered by the kitchen session.

### [simplifier-8] (medium) 4 Component primitives / 5.12 to 5.16: DataTable with card fallbacks

**Claim:** DataTable<T>({ columns, rows, rowKey, footer?, mobile: 'cards'|'scroll', cardTitle? }); tables exist only in DataTable and only on md+; below md every table renders cards; used on the recipe cost table, Ingredients, client history and all five Comptes pages.

**Problem:** A generic table component with column definitions, footers and a card mode is a small library. The pages Dalia reads in the kitchen (week, day, prep sheet, recipe, event) are already ListRows and columns in the draft; what remains in tables is accounting and the ingredient list, which she uses at a desk like the workbook. Card fallbacks for a 14-column journal on a phone are work nobody asked for.

**Evidence:** Draft lines 192, 201, 259, 305, 313, 321, 325, 333, 847; the complaint in 00-brief.md section 1 is about reading recipes, not accounting tables on a phone.

**Fix:** Cut DataTable. Use a plain `<table>` with a `.table` class pair (text-sm tabular, 44px rows) inside `overflow-x-auto`, as the pages do today. Ingredients.tsx on phones becomes ListRows like the other lists. Lost: phone card layouts for Comptes; revisit if she opens the journal on her phone.

### [simplifier-9] (low) 4 Component primitives / 5.5 / 8 Slice 5: InlineField replacing the Editable* helpers

**Claim:** InlineField({ value, onSave, type, size?, options?, suffix? }) replaces EditableText, EditableInlineNum, EditableInlineText, EditableType, EditableNum in slice 5, with a pencil on hover (pointer) or at 70% on touch.

**Problem:** The helpers are duplicated across two files (about 150 lines each) but they work, and the draft already moves all reading off them (read mode by default, edit behind ?mode=edit). Rewriting them into one polymorphic component with a new touch affordance is cleanup on edit surfaces, which are laptop-first.

**Evidence:** RecipeDetail.tsx:667-800 (EditableNum, EditableText, EditableInlineNum, EditableType); EventDetail.tsx:345-500 (EditableText, EditableInlineText, EditableInlineNum, EditableStatus); draft lines 191, 261, 847.

**Fix:** Move the existing helpers as they are into apps/frontend/src/components/ui/editable.tsx when RecipeDetail read mode lands (half a day), import from both pages, delete the copies. Cut the InlineField redesign. Lost: the pencil-as-target affordance on touch for edit mode.

### [simplifier-10] (medium) 7.3 Ingredient merge: detection tiers

**Claim:** GET /admin/ingredients/duplicates groups by exact key (identique), then pairs keys of five or more characters at Damerau-Levenshtein ≤ 1 (proche), and marks strict token subsets (oeuf vs oeuf bio) as a_verifier, never preselected; a confidence Tag per group.

**Problem:** The seven-step normaliser already collapses every example Dalia gave (Oeuf, Oeufs, Œuf, oeuf (pièce), OEUF x12). The fuzzy tiers add a distance function, a subset rule, a minimum-length rule, three UI states and preselection logic to catch typos in a list of a few hundred rows that she can read sorted alphabetically. The draft's own manual pair search box already covers anything the tiers would find.

**Evidence:** Draft lines 683-693, 297; IngredientsService.deduplicate at ingredients.service.ts:60-79 is the only matcher today (exact nameLower); 00-brief.md request 1 asks for 'oeuf' and 'the other format'.

**Fix:** Keep the normaliser, exact-key groups, the survivor rule, the unit-family exclusion, the manual two-ingredient pair, 'Ignorer ce groupe' and the create-time 'Semblable à' warning. Cut Damerau-Levenshtein, the subset tier and the confidence Tag. Lost: automatic typo pairs; add the distance later if she reports a missed pair. The remap-before-delete order and the re-scan before delete are untouched.

### [simplifier-11] (low) 5.12 / 6 LedgerEntry / 7.6: Verrouiller le mois

**Claim:** locked on entries, POST /admin/ledger/lock, 409 on PATCH/DELETE when locked, 'Verrouillé' rows, 'Déverrouiller' with confirmation, export sets locked.

**Problem:** The lock protects Dalia from her own edits after the accountant has the file. It is a flag, an endpoint, a 409 path, two UI states and an unlock dialog for one user who exports once a month. The accountant's copy is already the record; the constraint 'never silently change a historical figure' is met by the ledger being records and the reports being views.

**Evidence:** Draft lines 317, 498, 602, 605, 747; 00-brief.md section 4 constraint on historical figures.

**Fix:** Defer. Store `exportedMonths?: Record<string, string>` (ym to ISO date) in settings when an export is downloaded, show 'Exporté le 3/11' on the month header, and ask 'Ce mois a été exporté, continuer ?' before saving an edit to a line in that month. No lock endpoint, no 409. Lost: a hard block, which the accountant does not need for the export.

### [simplifier-12] (medium) 7.6 Monthly invoices: pro-rata attribution

**Claim:** Reports attribute a multi-event entry to its events pro rata by sellingPricePerGuest × guestCount, so Au réel and the client history never count an invoice once per event; the risk section admits this is a rule the workbook does not have.

**Problem:** Attribution is a second revenue computation that must agree with the first, shown next to the invoice total 'so a mismatch is visible'. The workbook's Au réel lists 'facture comptoir janvier 2025' as one row. The same shape works here with no arithmetic.

**Evidence:** Draft lines 749-751, 782, 879; 01-livre-des-comptes-excel.md 'Au réel 2025' section (monthly comptoir invoice as one row).

**Fix:** Au réel rows: one row per sales entry of the month (label, type, HTVA, linked events listed in Observations), plus one row per event of the month not covered by any entry at price × guests tagged 'prévu'. Client history: entries and events as two lists, events tagged 'facturé' when any entry includes them. Cut pro-rata. Lost: per-event realised HTVA for monthly-invoiced clients; the planned figure stays on the event.

### [simplifier-13] (low) 5.14 / 7.6 Raw material cost per month: MP réel versus calculé

**Claim:** Each Coûts MP cell carries a Tag 'achats', 'figé' or 'calculé' with a tooltip listing its sources; a view toggle 'MP: réel si disponible / toujours calculé'; a separate 'MP prévu' line; migration 002 marks approximate snapshots with ≈.

**Problem:** One rule already decides the figure (réel when the month has mp lines, else calculé). The toggle, the three tags, the tooltip and the prévu line are presentation for a comparison Dalia did not ask for; the workbook has one typed Coûts MP per month.

**Evidence:** Draft lines 325, 753-757; 01-livre-des-comptes-excel.md 'Analyse marge' (one MP figure per month).

**Fix:** Keep the rule and the mp purchase kind. Show one footnote per month ('d'après achats' or 'd'après événements'). Cut the toggle, the tags, the tooltip, the MP prévu line and the ≈ marker (no migration 002). Upcoming events already appear as Prévision in Aperçu.

### [simplifier-14] (low) 6 Settings FixedCharge / 5.15 / 7.6: effective-dated fixed charges

**Claim:** FixedCharge has required from and optional to; editing an amount closes the current row and creates a new one from the chosen month ('Modifier à partir de' defaults to the current month); charge table shows Depuis | Jusqu'au.

**Problem:** About 30 lines that change roughly once a year. The auto-close interaction and the required from field add a form flow and date arithmetic on first entry (she must give every line a start month before the income statement shows anything). A flat list with an optional validity range gives the same history when she wants it.

**Evidence:** Draft lines 329, 759; audits.md 'Fixed charges, objectives, breakeven storage'; 01-livre-des-comptes-excel.md 'Prévisionnel financier' (one monthly amount per line).

**Fix:** Make from and to both optional (undefined = always). The charges table is a plain editable list; 'Jusqu'au' and 'Depuis' are two optional month fields she sets by hand when an amount changes. Cut the 'Modifier à partir de' flow. Lost: nothing; the income statement formula `from ≤ m ≤ to` is unchanged.

### [simplifier-15] (medium) 5.11 Clients: four-week grid and template extras

**Claim:** Section Prochaines semaines: a four-week grid (rows = weeks, cells = weekdays) with '+' per cell and 'Créer la semaine' per row, vertical list on phone; POST /admin/clients/:id/templates/from-event/:eventId; 'Mettre à jour le modèle depuis cet événement'; instantiate accepts templateIds and a guestCount override that scales portions; 'Depuis un favori' for templates without a weekday.

**Problem:** The week view already has the banner 'Hoona n'a pas d'événement la semaine prochaine · Créer la semaine' and '+' on a day, which is where Dalia will be when she creates the week. The grid repeats that on a second page. from-event and 'Mettre à jour le modèle' are server endpoints for what is a client-side copy of lines the page already holds. Favourites without a weekday duplicate Dupliquer-with-a-date.

**Evidence:** Draft lines 305-307, 600, 729-731, 831; EventDetail.tsx:77-98 handleDuplicate exists today.

**Fix:** Client page: header, Semaine type (weekday to template), Historique. One endpoint `POST /admin/clients/:id/instantiate { weekStart }` creating the missing weekday events of that week, idempotent, returning { created, skipped }. 'Créer depuis un événement' and 'Mettre à jour le modèle' become a client-side PATCH /admin/clients/:id with the event's lines copied in. Cut the grid, templateIds, guestCount scaling, favourites without weekday (Dupliquer asks for a date instead). Slice effort drops from 7 to 9 days to 4 to 5.

### [simplifier-16] (low) 7.7 AI / 5.17 Paramètres

**Claim:** Slice 6 optional AI recipe import; settings gain openAiKeySet and an 'Intelligence artificielle' section; /health reports aiEnabled.

**Problem:** The slice is correctly deferred, but its settings key, settings section and health flag leak into slice 4 and 5 scope. Nothing should be built for it until she supplies a key.

**Evidence:** Draft lines 335, 446, 797, 853-855.

**Fix:** Keep slice 6 as written and 'not now'. Remove openAiKeySet, the Paramètres section and aiEnabled from the slice 4 and 5 scope; they ship with slice 6 if it happens.

### [simplifier-17] (low) 4 Colour roles / Phone versus laptop rules / 8 Slice 1: the two scripts

**Claim:** scripts/check-contrast.mjs (a 20-line script over the token pairs) before merging; scripts/check-type-scale.sh greps pages/admin for text-xs, text-[10px], text-[11px] and uppercase tracking-wider and fails lint.

**Problem:** The contrast check is a one-off before the token PR; a browser devtools contrast picker on the staging build measures the real rendered pairs, which a script over HSL literals does not. The type-scale guard is useful but it is one grep line, not a script file. The draft also says the values 'are targets, not re-measured here', so a measurement is needed once, not a tool.

**Evidence:** Draft lines 132, 205, 814, 883.

**Fix:** Cut check-contrast.mjs; measure the six pairs once in devtools and paste the ratios into the PR. Replace check-type-scale.sh with a `lint:type-scale` entry in apps/frontend/package.json: `! grep -rnE 'text-xs|text-\[1[01]px\]|uppercase tracking-wider' src/pages/admin`.

### [simplifier-18] (low) 6 Taxonomies and money: taxonomies.ts and the lib layout

**Claim:** packages/types/src/entities/taxonomies.ts (new) holds DEFAULT_COURSES, VAT_RATES, PrestationTypeSetting and DEFAULT_PRESTATION_TYPES.

**Problem:** The existing settings defaults (DEFAULT_RECIPE_CATEGORIES, DEFAULT_SUPPLIERS) already live in entities/settings.ts; a separate taxonomies file is one more module for three constants that are all settings defaults.

**Evidence:** packages/types/src/entities/settings.ts:14-28; packages/types/src has constants, dto, entities only (no lib yet); draft lines 343-355, 791, 839.

**Fix:** Put DEFAULT_COURSES and DEFAULT_PRESTATION_TYPES next to DEFAULT_RECIPE_CATEGORIES in entities/settings.ts; VatRate next to the ledger entity. The lib/ files (money, costing, normalize, planning, reports) are fine; the jest 'types' project exists (jest.config.js:106).

### [simplifier-19] (medium) 6 Event / 7.1 / 5.1 / 5.9: prepDate

**Claim:** EventRecipeLine.prepDate (YYYY-MM-DD, undefined reads as event.date); week view renders such lines under the prep day with a '→ sam.' suffix; day view, grocery range selection and the 'Date de préparation' line action all read it.

**Problem:** Nobody asked to cook a line on a different day from its event. The field touches the week grid, the day selector, the grocery date range and the event overflow menu, and it makes 'what is on Tuesday' ambiguous (event date or prep date). It is the kind of modelling that is right eventually and wrong first.

**Evidence:** Draft lines 217, 273, 289, 375, 522, 654; 00-brief.md requests 2 and 3 mention order, courses and the week, not prep days.

**Fix:** Defer prepDate. Lines sit on their event's date. Lost: the day-before prep case; her note field on the line covers it until she asks.

### [simplifier-20] (medium) 6 Endpoints / 7.6: cost snapshot computed server-side, retake endpoint, prefill endpoints

**Claim:** EventsModule imports RecipesModule and IngredientsModule so EventsService.update computes the snapshot on completion; POST /admin/events/:id/snapshot retakes it; GET /admin/ledger/prefill/event/:id and /prefill/client/:id?ym= return dry prefills.

**Problem:** The snapshot is right (records versus views) but the place is expensive: two module imports, backend costing, and a retake endpoint. The frontend already holds every recipe and ingredient when it shows the event (EventDetail.tsx:25) and will have calcEventCost from packages/types after slice 1. Likewise the prefill is a pure function of data the Journal page already loads (event, client, ledger entries, settings); two GET endpoints for it is backend work for a form default.

**Evidence:** EventDetail.tsx:25-58 loads recipes and ingredients and computes cost; draft lines 596-597, 603-604, 613, 741-749; audits.md 'Cost snapshot' recommends server-side but the data is already client-side.

**Fix:** Accept `costSnapshot` in updateEventRequestSchema (strict shape); 'Terminer l'événement' sends `{ status: 'completed', costSnapshot }` computed with the shared calcEventCost. Retake = the same button in the overflow. Prefill = `prefillFromEvent(event, client, entries, settings)` and `prefillForClientMonth(...)` in apps/frontend/src/lib/accounting.ts, unit-tested. Cut the two prefill endpoints, the snapshot endpoint and the module imports. Lost: server authority over the snapshot; for one user the client is the only writer anyway.

### [simplifier-21] (low) 6 Event / 5.7: hoursPlanned, serviceTime, km

**Claim:** Event gains hoursPlanned, hoursSpent, km, serviceTime and a 'Heures et déplacements' section; Au réel uses hoursSpent ?? hoursPlanned.

**Problem:** serviceTime is never read by any report in the draft. hoursPlanned exists only as a fallback for hoursSpent. KM is a journal column and already lives on the ledger entry. Four fields and a section for one number the workbook uses (hours).

**Evidence:** Draft lines 275, 396, 533, 782; 01-livre-des-comptes-excel.md 'Au réel' (one hours figure per row) and journal column N (KM on the line).

**Fix:** Keep hoursSpent on the event (InlineField on Au réel and on the event page). Cut hoursPlanned, serviceTime and event.km; KM is typed on the ledger line.

### [simplifier-22] (low) 6 Settings: categoryIcons, courseIcons, supplier colour

**Claim:** settings.categoryIcons and courseIcons (emoji per category and course), suppliers[].color with a colour swatch in Paramètres and a hash fallback.

**Problem:** Open question 9 already says 'none until she asks'. Two settings keys, two Paramètres controls and a recipe-card icon block for a decision that is deferred.

**Evidence:** Draft lines 265, 335, 439, 816, 869; recipe-helpers.ts:21-32 SUPPLIER_COLORS hard-coded today.

**Fix:** Cut categoryIcons and courseIcons. Keep supplier colours as the hash into the eight-colour accessible set only (one function replacing SUPPLIER_COLORS); add the per-supplier override later if she asks.

### [simplifier-23] (high · REFUTED) 8 Roadmap: leaner slice order and effort

**Claim:** Order: readable recipes and merge (1-2), courses and week view (3-4), clients and templates (5-6), journal and export (7-8), reports and polish (9-11). Total 46 to 55 days.

**Problem:** With the cuts above, three slices shrink and one ordering choice improves the outcome: the journal should start at a month boundary and the accountant's feedback loop is the slowest in the project, so the journal should ship before clients. Once clientId and the ledger exist, the Hoona slice is smaller (the client picker, the week template and one instantiate endpoint). The one shared table is provisioned once, in slice 3.

**Evidence:** Draft lines 812-857; 00-brief.md section 4 (solo developer, ship in slices); README.md:178-182 (table provisioning cost).

**Fix:** Slice 1 (7 to 8 days): tokens, light sidebar, PageHeader/Tag/ListRow/Stepper/SectionToggle/RecipeReader, RecipeDetail read mode, RecipeCook rewrite, costing moved to packages/types, normaliser, duplicates (exact key + manual pair), merge remap-then-delete with the re-scan and 409 IN_USE on delete, aliases in both imports, UnprocessedItems loop, kitchen session. Slice 2 (7 to 8 days): line fields with lazy lineId, line endpoints with the PUT set check, courses, Week/Day/PrepSheet, print stylesheet, EventDetail menu by course with ▲▼, EventEditor sends scalars only, Events list cleanup, one-click 'Courses de la semaine', '/' redirect, Dashboard to /finances. Slice 3 (7 to 8 days): ta-records table provisioned once, ledger entity and DTOs with the VAT identity, Journal page and entry form, prefill as pure functions, client-side costSnapshot on completion, prestationType and vatRate on events, xlsx export in the workbook's columns, 'Exporté le' marker; ends when the accountant opens one export. Slice 4 (4 to 5 days): Client entity in the same table, client picker on the event, Semaine type on the client page, one instantiate endpoint, week banner and chip, 'Facturer le mois'. Slice 5 (6 to 8 days): fixedCharges and objectives in settings, reports.ts with fixtures, Aperçu, Compte de résultats, Prévisionnel, Au réel (one row per entry plus uncovered events), Extras summary, Compte de résultats sheet in the export, MobileTabBar if the kitchen session asked for it, Editable helpers moved to one file, grocery card layout, drag reorder. Slice 6 unchanged (optional, 3 days). Total about 31 to 38 days over eight to nine weeks; stop after slice 3 still retires the monthly sheets.

**Refuter:** The finding's ordering claim is not supported by evidence, and its causal reasoning is wrong in two places.

1. "Journal should start at a month boundary" is a deployment-timing matter, not an ordering argument. Either slice can be scheduled to land on a month start. The draft already says the journal starts at the month of deployment (02-synthesis-draft.md:841). Nothing in 00-brief.md or 01-livre-des-comptes-excel.md speaks to this.

2. "The accountant's feedback loop is the slowest in the project" has no source. The brief, the workbook analysis, audits.md and judgments.md say nothing about the accountant's turnaround. The draft already sequences for the accountant: journal and export (slice 4) ship before reports (slice 5), which is exactly audits.md:539 ("ship the Journal and export before the income statement so the accountant gets value early"). The reports do not code-depend on the accountant's answers: the three unconfirmed defaults (atelier VAT, ISoc rate, VAT on deposits) are editable settings (02-synthesis-draft.md:864-866, 877), and column-order feedback touches only ledger-export.ts. Also, a "real monthly export" needs a month of entries after deployment, so the gate cannot close two weeks after the journal ships under either order; the swap adds nothing there.

3. "Once clientId and the ledger exist, the Hoona slice is smaller" is factually wrong. In the critic's own plan, clientId arrives with the Client entity in slice 4 (the Hoona slice); the critic's slice 3 list contains no clientId. The ledger removes no Hoona work; the swap actually adds "Facturer le mois" to the Hoona slice. The 4-5 day figure comes from cuts (four-week grid, templates/from-event endpoint, "Mettre à jour le modèle", migration 003, date-asking Dupliquer), not from ordering.

4. "The one shared table is provisioned once" saves one provisioning round. README.md:178-182 lists four manual steps per table (console, SSM, config.service.ts + ec2-bootstrap.sh, .env + pm2 restart), plus data-stack.ts; that is one to two hours. In both plans the first table is provisioned in slice 3, so the ordering changes nothing. A shared table also needs a type discriminator in every scanAll reader (ddb.service.ts:18 has a fixed five-key tables record, scanAll at :69 reads the whole table), which is cost, not saving. The shared-table design itself belongs to another finding and is not evidenced here.

5. The draft's order has evidence behind it: the caterer listed Hoona as the third concrete request and accounting as the fourth (00-brief.md:38-46); audits.md:535-539 ranks story 3 (Hoona) above story 4 (journal) and recommends building in that order; judgments.md ranked the journal-first proposal last on feedback fit. Hoona's pain is weekly (manual duplication every week); the workbook month-end already works. Delivering the weekly relief first is the choice the sources support.

6. Effort: the critic's own numbers sum to 31-37 days (7+7+7+4+6 and 8+8+8+5+8), not 31-38. The reductions depend on cuts from other findings that cannot be checked here; neither the draft's nor the critic's figures are measured. Two of the critic's slice-2 items are also underspecified: "EventEditor sends scalars only" cannot hold on create (EventEditor.tsx:66-70 and the api.events.create path have no eventId for line endpoints), and "lazy lineId" leaves untouched old events with no lineId for PATCH /lines/:lineId to address, which is why the draft runs migration 001 first (02-synthesis-draft.md:719, 874).

The one real wrinkle in the draft is independent of the finding: the slice-4 end condition "when the accountant has opened one real monthly export" (:842) needs a full month of entries after deploy, so it is a milestone after the slice, not a slice end. The critic's fix repeats the same wording and does not address it.

### [simplifier-24] (low) 5.1 Semaine: money strip in slice 4

**Claim:** Slice 4 adds to the week header 'CA du mois' with objective bar, 'À encaisser' and 'Marge brute du mois %'.

**Problem:** Marge brute du mois on the home page needs the whole ledger, every completed event's cost and the objective loaded on every visit to the week. The week is the kitchen page; the money belongs in Aperçu, one tap away in the sidebar.

**Evidence:** Draft lines 215, 789, 839; 00-brief.md section 1 'Vue d'ensemble de la semaine: planning + chiffre d'affaires' (week revenue, not month margin).

**Fix:** Keep 'Signé cette semaine' and the prep progress on the week header. Move CA du mois, À encaisser and Marge brute to the Aperçu tiles in slice 5. Lost: nothing she asked for on the week.

### [verifier-1] (high · CONFIRMED) 4 Design system, Colour roles

**Claim:** `--primary: 25 55% 44%; --primary-foreground: 0 0% 100%;  /* about 4.6:1 */` and section 1 "a primary that passes 4.5:1"

**Problem:** Measured: white on 25 55% 44% (#ae6632) is 4.42:1, primary as link text on background is 4.15:1, on card 4.32:1. All three fail 4.5:1 for normal text. The audit's own suggestion (25 55% 45%) is worse at 4.27:1 and 4.00:1. The same value is copied into --ring, --sidebar-primary and --sidebar-ring.

**Evidence:** /tmp/draft-verify/contrast.mjs and primary-search.mjs output: 25 55% 44% → 4.42 / 4.15 / 4.32; 25 55% 42% → 4.80 / 4.50 / 4.69 (first value that passes both, but sits at exactly 4.50 on background); 25 55% 41% (#a25f2f) → 4.98 / 4.67 / 4.86.

**Fix:** Replace with `--primary: 25 55% 41%;  /* 4.98:1 with white, 4.67:1 as text on background, 4.86:1 on card */` and update `--ring`, `--sidebar-primary`, `--sidebar-ring` to `25 55% 41%`. Change the comment on --muted-foreground to "5.85:1 on background, 6.09:1 on card" (measured). In section 10 replace "The contrast values are targets derived from the audit's measurements, not re-measured here" with "Ratios were measured with scripts/check-contrast.mjs on the HSL values above".

**Refuter:** Confirmed. Independent re-measurement (Python colorsys HSL->sRGB, 8-bit rounding, WCAG 2.x luminance) gives the same numbers as the critic: 25 55% 44% is #ae6632; white on it is 4.42:1, primary as text on background (30 30% 97%, #faf7f5) is 4.15:1, on card (30 40% 99%, #fdfcfb) is 4.32:1. All three fail 4.5:1 for normal text, so the "/* about 4.6:1 */" comment on line 115 of /Users/antoineboxho/Developer/Personal/02_projects/recipe-book/docs/redesign/02-synthesis-draft.md, the line 105 sentence "the greys and the primary get darker so they pass 4.5:1 on beige" and the summary's "a primary that passes 4.5:1" (line 5) are wrong for the value given. The error comes from the audit: /Users/antoineboxho/Developer/Personal/02_projects/recipe-book/docs/redesign/workings/audits.md line 35 recommends "25 55% 45% (≈4.6:1 with white)", which measures 4.27:1 with white and 4.00:1 on background; the draft went one lightness step darker and kept the audit's unmeasured figure, which section 10 (line 883) admits ("not re-measured here"). The same method reproduces the audit's correct measurements for the current tokens (apps/frontend/src/index.css: primary 25 50% 58% = #c98b5e, 2.86:1 with white; muted-foreground 20 10% 45% = #7e6f67, 4.44:1 on background), so the method matches the audit's. The proposed value 25 55% 41% (#a25f2f) measures 4.98:1 with white, 4.67:1 on background, 4.86:1 on card. 25 55% 42% measures 4.8011 / 4.5011 / 4.6854, so 41% is the right choice for a margin against browser rounding. Muted-foreground 20 10% 38% (#6b5e57) measures 5.85:1 on background and 6.09:1 on card; the draft's "about 5.9:1" is already consistent, so that comment change is a precision upgrade, not a correction. The token part of the fix is right and --ring, --sidebar-primary, --sidebar-ring (lines 123, 126, 128) do carry the same value and should follow. Two gaps: (1) the proposed section 10 sentence says ratios were measured with scripts/check-contrast.mjs, but that file does not exist (ls /Users/antoineboxho/Developer/Personal/02_projects/recipe-book/scripts/ has no such file; it is only named in the draft, judgments.md and proposal-4 as a slice 1 deliverable, line 814), so the sentence would be false as written; (2) line 132 in section 4 repeats the same "targets derived from the audit's measurements" framing and is not covered by the proposed fix. Side note outside this finding: --accent 25 60% 60% with white --accent-foreground is 2.64:1, and primary 41% as text on primary-soft is 4.27:1, so the "dark role colour on tints" rule on line 132 must hold.

**Corrected fix:** In /Users/antoineboxho/Developer/Personal/02_projects/recipe-book/docs/redesign/02-synthesis-draft.md:

1. Line 115: replace with
   `--primary: 25 55% 41%;      --primary-foreground: 0 0% 100%;  /* 4.98:1 with white; 4.67:1 as text on background, 4.86:1 on card */`

2. Lines 123, 126, 128: change `--ring`, `--sidebar-primary`, `--sidebar-ring` from `25 55% 44%` to `25 55% 41%`.

3. Line 114 (optional, precision only): change the comment to `/* 5.85:1 on background, 6.09:1 on card */`.

4. Line 132: replace "The values above are targets derived from the audit's measurements; run `scripts/check-contrast.mjs` (a 20-line script over the token pairs) before merging." with "The ratios in the comments were measured with the WCAG 2.x formula on these HSL values (sRGB, 8-bit rounding). `scripts/check-contrast.mjs` (a 20-line script over the same token pairs, delivered in slice 1) re-runs the check and must pass before merging."

5. Line 883: replace "The contrast values are targets derived from the audit's measurements, not re-measured here; the primary fill darkens the brand orange." with "The contrast ratios in section 4 were measured with the WCAG formula on the HSL values given, not taken from the audit: the audit's suggested primary (25 55% 45%, stated as 4.6:1) measures 4.27:1 with white, so the primary is 25 55% 41%. The primary fill darkens the brand orange. `scripts/check-contrast.mjs` does not exist yet; it ships in slice 1."

Lines 5 and 105 need no change once the value is 41%, since the "passes 4.5:1" claims become true. Optionally annotate /Users/antoineboxho/Developer/Personal/02_projects/recipe-book/docs/redesign/workings/audits.md line 35, where the "≈4.6:1" figure for 25 55% 45% originates.

### [verifier-2] (high · CONFIRMED) 5.1 Semaine (home), and 5.2, 5.3, 5.7, 5.8, 7.5, Slice 3

**Claim:** `‹ Semaine 42 ›` with "13 au 19 octobre"; "Mar 14", "Mardi 14 octobre", "Hoona · mardi 14 oct", "Hoona · mardi 21 oct", "Créer la semaine du 20 oct"

**Problem:** 2026-W42 runs Monday 12 October to Sunday 18 October 2026. 14 October 2026 is a Wednesday, 21 October is a Wednesday, and week 43 starts Monday 19 October. The draft's own ISO week helper would render "12 au 18 octobre" under the header, contradicting the examples.

**Evidence:** /tmp/draft-verify/dates.mjs: datesOfIsoWeek("2026-W42") = 2026-10-12 .. 2026-10-18; 2026-10-12 is Monday; isoWeekOf("2026-10-19") = 2026-W43.

**Fix:** 5.1: "12 au 18 octobre"; column header "Mar 13". 5.2: breadcrumb "Semaine 42 / Mardi 13 octobre". 5.3: "Mardi 13 oct / Hoona". 5.7: "Hoona · mardi 13 oct", "Mardi 13 octobre · 30 convives". 5.8: "Mar 13 oct · 30 conv.". 7.5: "Hoona · mardi 20 oct". Slice 3: "Créer la semaine du 19 oct". Keep "figé le 18/10" and "Payé le 3/11" (no weekday stated).

**Refuter:** Confirmed. The draft anchors its examples in 2026: /Users/antoineboxho/Developer/Personal/02_projects/recipe-book/docs/redesign/02-synthesis-draft.md line 211 gives `/semaine/2026-W42` in section 5.1, and the ledger routes use `ym=2026-10`, `year=2026`, "Facturé n° 2026-014" (lines 271, 311, 321, 325, 329, 333). Today's date is 2026-10-12, the Monday of 2026-W42. Checked with Python `datetime.isocalendar`/`fromisocalendar`, independent of the verifier's /tmp/draft-verify/dates.mjs: 2026-W42 runs Mon 12 Oct to Sun 18 Oct; 14 Oct 2026 is a Wednesday; 21 Oct 2026 is a Wednesday; 2026-W43 starts Mon 19 Oct. The draft's day numbers ("13 au 19 octobre", "Mar 14", "mardi 21 oct", "Créer la semaine du 20 oct") form a consistent 2025 calendar (2025-W42 = 13 to 19 Oct, 14 Oct 2025 is a Tuesday), so the draft mixed a 2025 calendar with a 2026 route. Any correct ISO week helper (the draft names `isoWeekOf` and `datesOfIsoWeek` at line 659 but does not implement them) renders "12 au 18 octobre" for 2026-W42, contradicting the header text at line 215. Changing line 211 to 2025-W42 instead would conflict with the 2026 anchoring everywhere else, so correcting the day numbers is the right direction. The proposed fix is correct for every item it lists but misses two occurrences: line 219 (5.1 phone row "Mar 14 · 2 évén. · 60 conv. · 3/12 faites") and line 303 (5.11 Clients "Prochain : mardi 14 oct"). "figé le 18/10" stays coherent because lines 279 and 741 say the snapshot is written on "Terminer l'événement", which can happen on Sunday 18 Oct for a Tuesday 13 Oct event; "Payé le 3/11" (Tue 3 Nov 2026) has no weekday stated and needs no change.

**Corrected fix:** Apply the proposed fix plus two missed lines. All in /Users/antoineboxho/Developer/Personal/02_projects/recipe-book/docs/redesign/02-synthesis-draft.md:
- Line 215 (5.1): "13 au 19 octobre" -> "12 au 18 octobre".
- Line 217 (5.1 laptop column header): "Mar 14" -> "Mar 13".
- Line 219 (5.1 phone row, missed by the finding): "Mar 14 · 2 évén. · 60 conv. · 3/12 faites" -> "Mar 13 · 2 évén. · 60 conv. · 3/12 faites".
- Line 229 (5.2): "Semaine 42 / Mardi 14 octobre" -> "Semaine 42 / Mardi 13 octobre".
- Line 241 (5.3): "Mardi 14 oct / Hoona" -> "Mardi 13 oct / Hoona".
- Line 271 (5.7): "Hoona · mardi 14 oct" -> "Hoona · mardi 13 oct"; "Mardi 14 octobre · 30 convives" -> "Mardi 13 octobre · 30 convives". Keep "figé le 18/10" and "Payé le 3/11".
- Line 283 (5.8): "Mar 14 oct · 30 conv." -> "Mar 13 oct · 30 conv.".
- Line 303 (5.11 Clients, missed by the finding): "Prochain : mardi 14 oct" -> "Prochain : mardi 13 oct".
- Line 729 (7.5): "Hoona · mardi 21 oct" -> "Hoona · mardi 20 oct".
- Line 834 (Slice 3): "Créer la semaine du 20 oct" -> "Créer la semaine du 19 oct".
Leave line 211 (`/semaine/2026-W42`) as is.

### [verifier-3] (high · CONFIRMED) 7.3 Ingredient merge, Detection step 3

**Claim:** Remove unit and packaging tokens (`g`, `gr`, `kg`, `ml`, `cl`, `l`, ... `x\d+`) and pure numbers.

**Problem:** Implemented literally with word-boundary token matching, a unit glued to a number is one token that is neither a unit nor a pure number, so it survives. "pois chiche 400g bte" → `400g chiche poi` and "lait entier 1L" → `1l entier lait`. Result: "pois chiches" and "pois chiche 400g bte" are not identique (they fall to a_verifier as a strict subset), and the lait group gets a noisy key.

**Evidence:** /tmp/draft-verify/normalize.mjs output: "pois chiche 400g bte" -> "400g chiche poi"; "lait entier 1L" -> "1l entier lait"; identique groups list does not contain the pois chiche pair; a_verifier lists "chiche poi" ⊂ "400g chiche poi". "Creme fraiche 35%" works only because % is punctuation and 35 is then a pure number.

**Fix:** Rewrite step 3 as: "Remove numbers with or without an attached unit or percent (`\d+([.,]\d+)?\s*(g|gr|kg|ml|cl|l|%)?`), then the standalone unit and packaging tokens (`pièce(s)`, `pc(s)`, `botte(s)`, `sachet`, `boite`, `bte`, `paquet`, `x\d+`)." With that change "pois chiche 400g bte" → `chiche poi` (identique with "pois chiches") and "lait entier 1L" → `entier lait`. Add both strings to the jest fixture for normalize.ts.

**Refuter:** The problem is real at the specification level. Draft section 7.3 step 3 (docs/redesign/02-synthesis-draft.md line 687) says "Remove unit and packaging tokens (...) and pure numbers". Implemented literally with whole-token matching, a number glued to a unit is neither a listed token nor a pure number. Running the verifier's script (/tmp/draft-verify/normalize.mjs) reproduces it: "pois chiche 400g bte" -> "400g chiche poi", "lait entier 1L" -> "1l entier lait"; the identique groups omit the pois chiche pair and a_verifier lists "chiche poi" ⊂ "400g chiche poi" and "lait" ⊂ "1l entier lait". The draft's own example list ("OEUF x12") shows the author anticipated only the `x\d+` glued form, not `\d+unit`. "Creme fraiche 35%" survives only because `%` is punctuation and 35 then becomes a pure number. Evidence limits: I could not read live DynamoDB data; the workbook in the repo root is the accounting book and has zero cells matching number+unit; there is no seed CSV in the repo. So the two cited strings are constructed, not measured from Dalia's list. But the brief's "oeuf (pièce)" shows qualifiers do occur in names, the CSV import takes `nom` as free text, and the draft claims step 3 removes units, which it does not for the common "400g"/"1kg"/"75cl" form. The proposed fix is incomplete as written: its regex `\d+([.,]\d+)?\s*(g|gr|kg|ml|cl|l|%)?` carries no boundary. Applied literally it strips the first letters of any word after a number that starts with g, l, cl or ml: "2 clementines" -> "ementines", "4 gousses ail" -> "ousses ail", "10 grains poivre" -> "rains poivre", "farine t55" -> "farine t" (tested). With a trailing `\b` those cases are safe, but the `%` branch is then dead (`\b` after `%` never matches; the number is still removed by backtracking and `%` falls to step 4) and "4x125g" survives. The fix must state the token boundary explicitly. The fixture claim is consistent with the draft: line 361 says normalize.ts is covered by the `types` jest project, which jest.config.js line 106 defines; packages/types has no test files today, so the fixture is the new test file slice 1 creates.

**Corrected fix:** Rewrite step 3 as: "Remove quantity tokens, i.e. a number with an optional decimal part and an optional attached unit or percent, optionally preceded by a multipack count, and only when the match ends at a token boundary: `/\b(\d+\s*x\s*)?\d+([.,]\d+)?\s*(g|gr|kg|ml|cl|l|%)?(?![\p{L}\p{N}])/gu`. Then remove the standalone packaging tokens `pièce(s)`, `pc(s)`, `botte(s)`, `sachet`, `boite`, `bte`, `paquet`, `x\d+` with `\b` on both sides." The negative lookahead (not a trailing `\b`) is required: without a boundary "2 clementines" becomes "ementines" and "4 gousses ail" becomes "ousses ail"; with `\b` the `%` alternative can never match and "4x125g" survives. Tested outputs after the full pipeline: "pois chiche 400g bte" -> `chiche poi` (identique with "pois chiches"), "lait entier 1L" -> `entier lait`, "Creme fraiche 35%" -> `creme fraiche`, "4x125g yaourt" -> `yaourt`, "2 clementines" -> `clementine`, "4 gousses ail" -> `ail gousse`, "Farine T55" -> `farine t55` (unchanged, qualifier kept). Add to the normalize.ts jest fixture in the `types` project: "pois chiche 400g bte", "lait entier 1L", "2 clementines", "4 gousses d'ail", "4x125g yaourt", "Creme fraiche 35%", each with its expected key.

### [verifier-4] (high · CONFIRMED) 7.3 Ingredient merge, grouping rules (proche)

**Claim:** then for keys of five or more characters pairs those at Damerau-Levenshtein ≤ 1 (`proche`)

**Problem:** DL ≤ 1 on short French ingredient names merges distinct ingredients: poire/poivre (pear/pepper), sauge/sauce (sage/sauce), farine/marine. It also catches real spelling variants (oignon/ognon, menthe/mente), so the rule has value but cannot be trusted alone. The text is also ambiguous about whether both keys or either key must be ≥ 5: if either, oeuf (4) and boeuf (5) are DL 1 and become proche (egg/beef). The draft says a_verifier is never preselected but says nothing about proche.

**Evidence:** /tmp/draft-verify/dl-danger.mjs: poire~poivre DL=1 PROCHE; sauge~sauce DL=1 PROCHE; farine~marine DL=1 PROCHE; oeuf~boeuf DL=1, flagged only if one side ≥ 5 is enough; oignon~ognon DL=1 PROCHE (correct merge).

**Fix:** Replace with: "then, for pairs where both keys are five or more characters, those at Damerau-Levenshtein ≤ 1 (`proche`). Only `identique` members are preselected; `proche` and `a_verifier` members are shown unticked and collapsed, and the user ticks them explicitly. Keys shorter than five characters are never fuzzily joined (`sel` vs `sol`, `oeuf` vs `boeuf`)." Also add the poire/poivre and sauge/sauce pairs to the jest fixture as must-not-preselect cases.

**Refuter:** The core problem is real; one sub-claim is not.

Confirmed. Running /tmp/draft-verify/dl-danger.mjs (its damerauLevenshtein is a correct optimal-string-alignment implementation) gives poire~poivre, sauge~sauce and farine~marine at DL=1 with both normalised keys at 5+ characters, so the draft's rule at /Users/antoineboxho/Developer/Personal/02_projects/recipe-book/docs/redesign/02-synthesis-draft.md line 693 tags them `proche`. The same rule catches real variants (oignon~ognon, menthe~mente), so it has value but cannot decide alone. The draft says `a_verifier` is "never preselected" and says nothing about `proche`, so by implication `proche` groups are merge-ready. Worse, section 5.10 (lines 293-299) describes no per-member selection at all: each row has only a radio "Conserver" and the footer "Fusionner dans Oeufs" merges the whole group in one tap. "Preselected" in 7.3 has no UI counterpart. The merge rewrites recipe lines and deletes the merged rows; `aliases` and `mergedFrom` are audit fields, there is no undo. A caterer's list will contain poivre, poire, sauce and sauge; one tap on a "Proche" group turns every pepper line into pear.

Refuted sub-claim. The both-versus-either ambiguity is already settled by the draft's next sentence, "Keys shorter than five characters are never fuzzily joined (`sel` vs `sol`)": oeuf (4 chars) is never joined, so oeuf/boeuf is not `proche` as written. Saying "both keys" is a clarification, not a correction.

Fix gaps. (1) The proposed text edits 7.3 only; 5.10 must gain the per-member tick or the fix changes nothing in the UI. (2) The response shape at line 589 puts `confidence` at group level; if an identique cluster (Poire, Poires) and a proche neighbour (Poivre) share a group, per-member preselection needs per-member confidence. (3) "Add to the jest fixture" has nothing to attach to: the draft covers only `reports.ts` with tests (lines 361, 847) and `packages/types` has zero test files today. The `types` jest project exists in /Users/antoineboxho/Developer/Personal/02_projects/recipe-book/jest.config.js and `packages/types/package.json` has a `test` script selecting it, so a new test file runs, but the grouping logic must be a pure function in packages/types to be testable, and the draft currently puts it inside the GET endpoint.

**Corrected fix:** Four edits to /Users/antoineboxho/Developer/Personal/02_projects/recipe-book/docs/redesign/02-synthesis-draft.md.

1. Section 7.3, replace the detection paragraph at line 693 with:
"`groupDuplicates(ingredients, ignoredKeys)` in `packages/types/src/lib/normalize.ts` (pure, called by `GET /admin/ingredients/duplicates`) clusters by exact key, then, for pairs where both keys are five or more characters, links keys at Damerau-Levenshtein ≤ 1, and links a key that is a strict token subset of another (`oeuf` vs `oeuf bio`). Confidence is per member, relative to the suggested survivor's key: `identique` (same key), `proche` (DL ≤ 1), `a_verifier` (token subset). Only `identique` members are included by default; `proche` and `a_verifier` members are listed unticked and the user ticks them explicitly, because DL ≤ 1 also pairs distinct ingredients (poire/poivre, sauge/sauce, farine/marine). Keys shorter than five characters are never fuzzily joined (`sel` vs `sol`, `oeuf` vs `boeuf`). Groups whose key is in `settings.ignoredDuplicateGroups` are skipped. One scan of recipes and one of grocery lists give `recipeCount` and `listCount` per member. No model needed at a few hundred ingredients."

2. Section 5.10, in the Layout paragraph, change the row description to: "One row per candidate: radio 'Conserver' (44px), checkbox 'Inclure' (44px, ticked for Identique, unticked for Proche and À vérifier), name, price and unit, supplier, 'dans 12 recettes · 2 listes', updated date, confidence `Tag` per row." In Interactions: "'Fusionner dans X' sends the ticked members as `mergedIds` and is disabled when none is ticked; changing the survivor radio recomputes each row's confidence and default tick."

3. Endpoints table, line 589: move `confidence` into the member: `{ groups: { key, suggestedSurvivorId, members: { ingredientId, name, confidence, unit, price, supplier, updatedAt, recipeCount, listCount }[] }[] }`.

4. Slice 1 scope (line 814) and the libs paragraph (line 361): add `packages/types/src/lib/normalize.test.ts` under the existing `types` jest project (run with `pnpm --filter @packages/types test`). Cases: normalisation table from step 7; `groupDuplicates` returns poire/poivre, sauge/sauce, farine/marine as `proche` and never in the default-included set; oignon/ognon and menthe/mente as `proche`; oeuf/boeuf and sel/sol never linked; `oeuf` vs `oeuf bio` as `a_verifier`; an ignored key is skipped.

### [verifier-5] (medium) 7.3 Ingredient merge, grouping rules (a_verifier)

**Claim:** marks a key that is a strict token subset of another (`oeuf` vs `oeuf bio`) as `a_verifier`

**Problem:** On the test set the subset rule produces nine candidate groups; four are plausible merges (oeuf/oeufs bio, beurre/beurre doux, lait/lait entier, farine/farine T55) and five are distinct ingredients (chou/chou-fleur, saumon/saumon fumé, citron/citron vert, noix/noix de cajou, and the pois chiche case caused by the 400g bug). At a few hundred ingredients every base name will carry a group, which buries the real duplicates. Hyphenated compounds split into tokens, so chou-fleur becomes a subset of chou.

**Evidence:** /tmp/draft-verify/normalize.mjs a_verifier output: "oeuf" ⊂ "bio oeuf", "chou" ⊂ "chou fleur", "beurre" ⊂ "beurre dou", "saumon" ⊂ "fume saumon", "farine" ⊂ "farine t55", "lait" ⊂ "1l entier lait", "citron" ⊂ "citron vert", "noi" ⊂ "cajou noi", "chiche poi" ⊂ "400g chiche poi".

**Fix:** Add to step 4: "a hyphen between letters is removed, not replaced by a space, so `chou-fleur` → `choufleur` and `demi-sel` → `demisel`". Replace the a_verifier sentence with: "marks a key as `a_verifier` when it is a strict token subset of another and every extra token is a qualifier from a fixed list (`bio`, `doux`, `demisel`, `sale`, `entier`, `ecreme`, `frais`, `fume`, `surgele`, `t45`, `t55`, `t65`, `cru`, `cuit`), never preselected. Subsets with other extra tokens (`citron` vs `citron vert`, `noix` vs `noix de cajou`) are not grouped." Note the choice: `fumé` in the list means saumon/saumon fumé is still offered as a_verifier; drop it from the list if she treats smoked fish as a different product.

### [verifier-6] (medium) 7.3 Ingredient merge, Detection step 5

**Claim:** Singularise each token of four or more letters: strip trailing `s` or `x` (`oeufs → oeuf`, `choux → chou`).

**Problem:** The rule over-strips: noix → `noi`, pois → `poi`, doux → `dou`, cassis → `cassi`, radis → `radi`, maïs → `mai`, ananas → `anana`, prix → `pri`. Grouping still works because both sides are transformed the same way, but section 5.10 displays the key as the group header, so Dalia reads "cajou noi" and "chiche poi".

**Evidence:** /tmp/draft-verify/normalize.mjs: "noix" -> "noi", "pois chiches" -> "chiche poi", "beurre doux" -> "beurre dou"; dl-danger.mjs: cassis -> "cassi", radis -> "radi", ananas -> "anana", maïs -> "mai".

**Fix:** Rewrite step 5: "Singularise tokens of four or more letters: strip a trailing `s` unless the token ends in `ss`, `is`, `as`, `us` or `os`; strip a trailing `x` only after `au`, `eu` or `ou` (`choux → chou`, `gateaux → gateau`, but `noix`, `prix` unchanged)." In 5.10 change "the normalised key (\"oeuf\")" to "the suggested survivor's name (\"Oeufs\") with the key in `text-caption`", so the header is always a real name.

### [verifier-7] (medium) 4 Design system, Type scale and tailwind.config.ts edits

**Claim:** `text-sm` 14px / 1.5 and `text-base` 16px / 1.6 in the type scale table

**Problem:** The fontSize extend snippet only adds caption, lead, h3, h2, h1, h1-lg, cook, cook-lg. Tailwind's defaults for sm and base remain: the built CSS gives `.text-sm { font-size: .875rem; line-height: 1.25rem }` (1.43) and `.text-base { font-size: 1rem; line-height: 1.5rem }` (1.5). The 1.5 and 1.6 line heights the table promises, and that the Notion comparison in the audit calls out, are not delivered.

**Evidence:** /tmp/draft-verify/tw/out.css lines 693-696 and 719-722 after building the draft's config with `npx tailwindcss -c tw/tailwind.config.cjs`.

**Fix:** Add `sm: ["14px", "1.5"], base: ["16px", "1.6"]` to the `fontSize` extend object in the tailwind.config.ts snippet, and note under it: "overriding sm and base changes every existing text-sm and text-base use, which is intended."

### [verifier-8] (medium) 6 Data model changes, Zod DTOs (ledger.ts) and Endpoints table

**Claim:** `POST / PATCH / DELETE /admin/ledger[/:id]` with body `createLedgerEntrySchema` / partial

**Problem:** `createLedgerEntrySchema` is `z.union(...).refine(...)`, a ZodEffects, which has no `.partial()`; the inner union has none either. The PATCH body schema therefore does not exist as written. Separately, the comment "discriminatedUnion over innerType() would drop it" is misleading: `z.discriminatedUnion("book", [salesSchema, purchaseSchema]).refine(vatIdentity)` works in zod 3.24.4 because both options are plain strict ZodObjects, and it reports `kind: Invalid enum value...` instead of the plain union's bare `Invalid input`.

**Evidence:** /tmp/draft-verify/zod-test.mjs: `typeof createLedgerEntrySchema.partial` = undefined, `typeof createLedgerEntrySchema._def.schema.partial` = undefined; discriminatedUnion alternative accepts the valid entry, rejects the 0.02 mismatch, and yields `invalid_enum_value:kind` for a wrong kind versus `invalid_union` for z.union.

**Fix:** Replace the two lines with: `export const createLedgerEntrySchema = z.discriminatedUnion("book", [salesSchema, purchaseSchema]).refine(vatIdentity, "HTVA + TVA doit égaler TVAC");` and add `export const patchLedgerEntrySchema = z.object({ paid: z.boolean(), paymentMethod: z.enum([...]), paidAt: isoDate, number: z.string().trim(), description: z.string().trim(), km: z.number().nonnegative(), locked: z.boolean() }).partial().strict();`. In the endpoints table make the row `POST / PUT / DELETE /admin/ledger[/:id]` with `createLedgerEntrySchema` (PUT replaces the whole entry from the form) and add `PATCH /admin/ledger/:id` with `patchLedgerEntrySchema` for the Réglé popover and lock. Delete the comment about innerType().

### [verifier-9] (medium) 4 Design system, Colour roles (Tag variant primary)

**Claim:** Rules: text on a tint is always the dark role colour, never the colour on beige.

**Problem:** For the primary role the dark colour on its tint fails: primary 25 55% 41% on primary-soft 25 60% 93% is 4.26:1 (and 4.39:1 on surface). The other four roles pass on their tints (success 5.68, warning 4.54, info 5.46, destructive 5.59), so a `Tag variant="primary"` built by the stated rule is the one that fails.

**Evidence:** /tmp/draft-verify/extra.mjs: primary 25 55% 41% on primary-soft = 4.26; foreground 20 20% 13% on primary-soft = 13.80 (contrast.mjs).

**Fix:** Add after the rule: "Exception: the primary tint (`primary-soft`, today's column header, the primary `Tag`) uses `text-foreground` (13.8:1), not `text-primary` (4.26:1)."

### [verifier-10] (low) 4 Design system, Colour roles (accent)

**Claim:** `--accent: 25 60% 60%;        --accent-foreground: 0 0% 100%;` kept unchanged

**Problem:** White on 25 60% 60% (#d68f5c) is 2.64:1. The pair is unused in the app today (no bg-accent or text-accent outside index.css), so it is dormant, but it stays in the token block as a trap.

**Evidence:** /tmp/draft-verify/primary-search.mjs: accent-foreground white on accent = 2.64; `grep -rn 'bg-accent\|text-accent' apps/frontend/src` returns only the index.css definition.

**Fix:** Either delete the accent pair from the :root block and the tailwind colors, or set `--accent-foreground: 20 20% 13%` (6.10:1 on the accent) and note "accent is a tint, dark text only".

### [verifier-11] (low) 4 Design system, Colour roles (input border)

**Claim:** `--border: 30 20% 88%;       --input: 30 20% 80%;`

**Problem:** Input borders are a UI component boundary under WCAG 1.4.11 (3:1). 30 20% 80% on card is 1.54:1 (today's 30 25% 85% is 1.36:1). Reaching 3:1 needs about 30 20% 55%, which is much darker than the warm look. Not a regression, but the draft presents the token block as the pass-4.5 retune and this pair is still far below its own criterion.

**Evidence:** /tmp/draft-verify/extra.mjs: 30 20% 80% → 1.54 on card; 30 20% 55% → 3.12 on card, 3.00 on background.

**Fix:** Add one sentence after the token block: "Input borders stay at 1.5:1 on purpose (the warm look); inputs are distinguished by `bg-card` on `bg-background` plus the focus ring, and the 3:1 boundary rule is not met. Revisit if Dalia cannot find fields."

### [verifier-12] (low) 7.1 Interactive planning, Dates

**Claim:** `apps/frontend/src/lib/dates.ts` with `isoWeekOf(date)`, `datesOfIsoWeek(isoWeek)`

**Problem:** The helpers are named but the algorithm is not stated, and the edge cases matter for the home route: 2026 has 53 ISO weeks, so `/semaine/2026-W53` (28 Dec 2026 to 3 Jan 2027) is valid and `/semaine/2027-W01` starts 4 Jan 2027; 1 January 2026 belongs to 2026-W01 which starts 29 December 2025. A naive "week of 1 January" implementation or `new Date(ymd).getDay()` in a negative-offset timezone gets these wrong.

**Evidence:** /tmp/draft-verify/dates.mjs (Thursday rule, Monday from 4 January): 2026-01-01 → 2026-W01 [2025-12-29..2026-01-04]; 2026-12-31 → 2026-W53; 2027-01-03 → 2026-W53; 2024-12-30 → 2025-W01; all round-trip.

**Fix:** Append: "`isoWeekOf` uses the Thursday rule (shift the date to its week's Thursday, week = ceil((dayOfYear)/7)); `datesOfIsoWeek` starts from the Monday of the week containing 4 January; both parse `YYYY-MM-DD` with UTC getters so the browser timezone cannot shift the day. Jest cases: 2026-01-01 → 2026-W01, 2026-12-31 and 2027-01-03 → 2026-W53, 2024-12-30 → 2025-W01."

### [verifier-13] (low) 6 Data model changes, Zod DTOs (primitives.ts)

**Claim:** `export const money = z.number().refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "2 décimales max");` used for totalTvac, htva, amount

**Problem:** The refine works (12.34 and 0.1+0.2 pass, 12.345 and 1.005 fail) but accepts negatives (-5.5 passes). The draft never says whether credit notes (avoirs) are allowed as negative ledger lines, so the behaviour is implicit.

**Evidence:** /tmp/draft-verify/zod-test.mjs money section: -5.5 → OK.

**Fix:** Add one sentence after the primitives block: "`money` allows negatives on purpose so a credit note (avoir) can be a negative `facture` line; `hourlyRate`, `km` and `sellingPricePerGuest` wrap it in `.nonnegative()` where negative makes no sense." Or, if credit notes are out of scope, change to `money.nonnegative()` on totalTvac and htva.

### [verifier-14] (low) 5.3 Fiche de préparation and 3 Information architecture

**Claim:** `scaleQty(qty, ratio)` moved from `RecipeCook.tsx:45`; "The version string at `AdminSidebar.tsx:94` moves to Paramètres"

**Problem:** Both line numbers are off. `scaleQty` is defined at RecipeCook.tsx:46 (line 45 is blank). The version string `admin · v1.0` is at AdminSidebar.tsx:86; line 94 is the LogOut icon. The other roughly 40 file:line references spot-checked are correct.

**Evidence:** `sed -n 45,47p apps/frontend/src/pages/admin/RecipeCook.tsx` → blank, `const scaleQty = (qty: number) => {`; `grep -n 'v1.0' apps/frontend/src/components/admin/AdminSidebar.tsx` → 86.

**Fix:** 5.3: `RecipeCook.tsx:46`. Section 3: `AdminSidebar.tsx:86`.
