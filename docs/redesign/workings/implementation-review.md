# Implementation review (after build)

## Reviewer: backend (14 findings)

Read-only review of apps/backend/src and packages/types/src/dto against the plan's endpoint table and apps/frontend/src/lib/api.ts. No high-severity data-loss bug found: merge, putLines, the update merge by lineId, lazy line ids and lock/unlock all match the plan and their specs. The DynamoDB expressions in ddb.service.ts are sound (placeholders for every name, no empty value map, REMOVE for null). The findings are medium and low: unvalidated import bodies that 500 or store arbitrary units, settings written as a whole-item put so two tabs clobber each other's sections, unlock overwriting the month note with the reason, ledger POST and PUT allowed into a locked month, line endpoints doing unconditioned read-modify-write of the recipes array, events whose clientId cannot be cleared through the DTO, a few response-shape and validation nits, and no scanAll calls inside loops.

## Reviewer: planning (16 findings)

Reviewed Week, Day, PrepSheet, EventDetail, EventEditor, Events, RecipeCook, StatusDot, use-planning-data, grocery and dates against plan screens 5.1 to 5.4, 5.7, 5.8 and sections 7.1, 7.4. The planning pages are in good shape: status, portions and notes all go through PATCH /admin/events/:id/lines/:lineId, reorder and category changes go through PUT with { lines: [{ lineId, course? }] }, every line call replaces the whole event locally so cards, progress bars and money tiles stay in sync, keyboard handlers skip inputs, and touch targets are 44px. No high-severity finding. The weak spot is EventEditor: its autosave still sends status on every PATCH (so an open editor reverts "Terminer l'événement"), the post-create refetch can overwrite text typed during the POST, an autosave that fires while another is in flight is dropped, and float portions reach an int-only DTO. Other mediums: RecipeCook shows "Chargement…" forever on a fetch failure, date labels on the events list and breadcrumbs have no month ("Mar 13" instead of "Mar 13 oct"), and the backend line PATCH is a whole-array read-modify-write so two quick taps on one event can lose an update. The rest are low: wording, UTC default date, swipe firing after a text selection, and the prep sheet laptop two-column layout from 5.3 not built. Note: api.ts, EventDetail.tsx and EventEditor.tsx were being edited by another process during the review; line numbers reflect the working tree at review time.

## Reviewer: accounting (12 findings)

Reviewed the Comptabilité pages, LedgerEntryForm, accounting.ts, ledger-export.ts, use-report-inputs.ts, reports.ts and prefill.ts against plan 5.12 to 5.16, 7.6 and the workbook doc. The money arithmetic in reports.ts and prefill.ts is right: splitTvac runs TVAC to HTVA, HTVA to TVA to TVAC the other way, the identity is checked client-side within 0,011, CA excludes commissions everywhere, grouping uses ym or date.slice(0, 7), breakeven and isoc follow the plan. The query parameters type and kind are honoured by the Journal (uncommitted edit on disk). The important defects are elsewhere: useReportInputs loads one year of entries so every N−1 and N−2 figure in Aperçu, the Mix and the period comparison reads 0 from an empty set, and "Facturer le mois" can miss invoices dated in the previous year; the recettes sheet of the export writes the THERMOMIX block on top of the per-type totals; "Ajouter une ligne pour l'autre taux" on an existing entry overwrites that entry instead of creating a second one; the Prévisionnel resets both forms after saving one and loses the other form's unsaved edits; yearActuals are unreachable because nothing sets ledgerStartYm and isLedgerMonth defaults to the ledger; the server accepts new lines in a locked month. 12 findings, 3 high.

## Reviewer: catalog (19 findings)

Reviewed RecipeDetail, Recipes, RecipeEditor, Ingredients, IngredientDuplicates, Clients, ClientDetail, Settings, GroceryListPage, LoginPage and components/ui against plan screens 5.5, 5.6, 5.9, 5.10, 5.11, 5.17 and sections 7.3 and 7.5. The merge UI is sound: mergedIds come from the ticked set, members whose PRICE_TO_QTY_UNIT family differs from the survivor are excluded on init, on survivor change and in the checkbox, and the 409 UNIT_MISMATCH / STILL_REFERENCED and failures paths are handled. Settings sends every objectives and yearActuals year it loaded, so a normal save does not drop keys; the one data-loss path is the load-failure fallback (draft built from defaults, then a save overwrites objectives, yearActuals, fixedCharges and ignoredDuplicateGroups). Template editing keeps all lines (toTemplatePayload strips only lineId/prepStatus/prepDate and empty extra-cost rows). The "Semblable à" warning only fires from Ingredients.tsx because RecipeDetail, RecipeEditor and GroceryListPage never pass `existing` to IngredientFormModal. GroceryListPage keeps a pre-existing autosave loop: `list` is in the effect deps and every save response replaces it. RecipeDetail keeps a stale Stepper value after portions are edited, which silently rescales ingredient quantities in read mode. No text-xs, text-[10px]/[11px] or uppercase labels remain in the reviewed files; hover-only controls use .reveal with the touch fallback. Remaining items are low: default suppliers instead of settings suppliers in two ingredient modals, text-xl instead of a 22px token in RecipeReader, Dupliquer landing on the old RecipeEditor route, a few client fields that cannot be cleared or can be rejected by the two-decimal money rule, a duplicate SupplierTag, and login landing on /recipes instead of the week home.

## Reviewer: conformance (11 findings)

Walked plan sections 2, 3, 5 and 7 against the branch (committed plus the uncommitted edits on disk). Almost every stated behaviour is present: the week home with money strip, client chips, banner and sheet; the day view with three groupings and print; the prep sheet with Aa, stepper, note, status bar and "Suivante"; cook mode rewrite; recipe read mode; the merge page and endpoint with remap-then-delete; lineId, course, PUT/PATCH line endpoints with lazy backfill; clients with templates, instantiate and link-events; the five Comptabilité pages, lock/unlock, xlsx and CSV export; Settings sections; tokens, sidebar, routes, health, infra and scripts. packages/types tests pass (163). Gaps found: 11. The one high finding is that settings.ledgerStartYm is never written (not on the first sales entry, not editable in Paramètres), so every month counts as a ledger month and the typed prior-year figures in yearActuals are never read by Aperçu, Mix or the period comparison. Medium: "+" with a client chip does not prefill the weekday template; instantiate's skip set differs from the week banner's "missing" rule, so a manual Hoona event on a weekday is duplicated by "Créer la semaine"; the prep sheet has no laptop two-column layout. The rest is polish (22px reader size, phone ingredients pill, template notes on instantiate, missing export header test, tag colour, inline ISoc edit).

## Findings

### [backend-1] (medium) apps/backend/src/ingredients/ingredients.controller.ts:49

**Problem:** POST /admin/ingredients/import passes the raw body array to the service without validating rows, so a malformed row crashes the request and a bad unit is stored verbatim.

**Evidence:** The handler only checks Array.isArray(body) and calls importIngredients(body). In the service, line 314 does row.nom.trim() (TypeError 500 when nom is missing or not a string) and line 341 stores unit: row.unite as Ingredient["unit"] for new rows, so unite: "kilo" or undefined lands in the ingredients table and breaks PRICE_TO_QTY_UNIT lookups later (merge, costing). importIngredientRowSchema already exists in packages/types/src/dto/ingredients.ts and is unused.

**Fix:** In importIngredients(), parse with z.array(importIngredientRowSchema).safeParse(body) (import importIngredientRowSchema from @packages/types), throw BadRequestException(parsed.error.issues) on failure, and pass parsed.data to the service. Optionally route unite through the same preprocess as priceUnitSchema so "kg" and "kilo" still import.

### [backend-2] (medium) apps/backend/src/settings/settings.service.ts:54

**Problem:** Settings are saved as a whole-item PutCommand after a read, so a save from one tab overwrites every section with the values that tab read, including sections changed by another tab moments earlier.

**Evidence:** update() does get() then put({...current, ...given}). Settings.tsx:323-333 sends nine sections from a draft that may be minutes old (objectives, yearActuals, ignoredDuplicateGroups, company...). If the user ignores a duplicate group in IngredientDuplicates.tsx:193 or saves objectives in Previsionnel.tsx:233 in a second tab, then presses Enregistrer in the Settings tab, those changes are lost. The LedgerService lock and unlock also pass through this path, so a Settings save right after a lock drops monthCloses[ym].lockedAt.

**Fix:** Replace the put with this.ddb.update(this.table, { settingsId: GLOBAL_ID }, given) so only the keys sent are written (keep a put only when no item exists yet, guarded by attribute_not_exists). Then return this.get(). In Settings.tsx, send only the sections the user actually edited (track dirty per section) so a stale draft never carries untouched sections.

### [backend-3] (medium) apps/backend/src/ledger/ledger.service.ts:116

**Problem:** unlockMonth overwrites the month close's note with the unlock reason, losing the MP note typed at lock time.

**Evidence:** monthCloses[ym] = { ...previous, unlockedAt: now, note: reason } replaces previous.note. The plan (line 684 and 868) says unlock clears locked and lockedAt, writes unlockedAt and keeps mpSource; it does not say the reason replaces the note. MonthClose has no separate field for the reason, so the lock-time note (for example 'MP saisi d'après les factures Barn') is gone after an unlock.

**Fix:** Add unlockReason?: string to MonthClose in packages/types/src/entities/settings.ts and to monthCloseSchema in packages/types/src/dto/settings.ts, and write monthCloses[ym] = { ...previous, unlockedAt: now, unlockReason: reason } in unlockMonth, leaving note untouched. Update the spec 'unlockMonth restores the entries, clears lockedAt and keeps mpSource' accordingly.

### [backend-4] (medium) apps/backend/src/ledger/ledger.service.ts:40

**Problem:** create() and replace() accept entries dated inside a locked month, so a locked month can gain unlocked lines after the VAT return was filed.

**Evidence:** create() writes the entry with ym = date.slice(0, 7) and never looks at settings.monthCloses[ym].lockedAt. replace() only checks stored.locked, so moving an unlocked entry's date into a locked month (ym recomputed on line 60) is allowed and the new entry carries no locked flag. The plan's endpoint row (line 681) puts POST, PUT and DELETE together under '409 LOCKED when the entry is locked' and section 868 says the lock freezes date and amounts for the month.

**Fix:** In create() and replace(), load settings (this.settings is already injected), compute ym from body.date, and throw new ConflictException(LOCKED) when settings.monthCloses?.[ym]?.lockedAt is set and (for replace) also when stored.ym is locked. Add two spec cases: 'create 409s LOCKED when the month is locked' and 'replace 409s LOCKED when the new date falls in a locked month'.

### [backend-5] (medium) apps/backend/src/events/events.service.ts:110

**Problem:** Every line endpoint rewrites the whole recipes array from a read done a few milliseconds earlier with no condition, so two overlapping line writes from two tabs lose one of them.

**Evidence:** addLine, patchLine, putLines and removeLine each do getOrFail() then writeLines(), which calls ddb.update with { recipes, updatedAt } and only the attribute_exists(#pk) guard. If the phone ticks a line (PATCH prepStatus) while the laptop reorders (PUT) and the PUT's read happened before the tick's write, the PUT writes the pre-tick array and the tick is gone. The plan (line 796) promises 'a laptop tab that reorders after the phone ticked a line keeps the tick', which only holds when the reads do not overlap.

**Fix:** In writeLines, take the stored event as a parameter and pass options { condition: '#ua = :expected', names: { '#ua': 'updatedAt' }, values: { ':expected': stored.updatedAt } } to ddb.update. On ConditionalCheckFailedException, re-run the operation once from a fresh getOrFail (wrap each public method's body in a small retry helper), then surface a 409 { code: 'LINES_CHANGED' } if it fails again. Add a spec: 'patchLine retries once when updatedAt moved under it'.

### [backend-6] (medium) packages/types/src/dto/events.ts:56

**Problem:** clientId, templateId, prestationType and vatRate cannot be cleared through PATCH /admin/events/:id because the schema rejects null and the service only REMOVEs on null.

**Evidence:** clientId is z.string().min(1).optional(); EventEditor.tsx:144 sends clientId: clientId || undefined, which JSON drops, so detaching a client from an event is a no-op and the event keeps pointing at the old client (and the client then cannot be deleted because of the IN_USE scan). actualCost already uses .nullish() for exactly this reason and ddb.update turns null into REMOVE.

**Fix:** Change clientId, templateId, prestationType and vatRate in createEventRequestSchema to .nullish() (clientId: z.string().min(1).nullish(), etc.). EventsService.update already forwards null to ddb.update which emits REMOVE. In EventEditor.tsx scalarPayload send clientId: clientId || null and prestationType: prestationType || null when the event already exists. Add a dto.test.ts case that updateEventRequestSchema accepts { clientId: null }.

### [backend-7] (medium) apps/backend/src/recipes/recipes.controller.ts:52

**Problem:** POST /admin/recipes/import trusts row.ingredients from the JSON body, so a malformed ingredient line crashes the request with a 500 and an unknown unit string is stored on the recipe.

**Evidence:** mapJsonRow casts row.ingredients as ImportRecipeIngredient[] without checks. In recipes.service.ts:91 ingByName.find(ri.name) calls name.trim(), which throws when name is missing. Line 94 stores unit: (ri.unit || 'g') as RecipeIngredient['unit'] so 'kg' or 'tbsp' ends up in recipe.ingredients[].unit, where costing and the merge unit-family check silently misbehave.

**Fix:** Define an importRecipeIngredientSchema = z.object({ name: z.string().min(1), qty: z.number().nonnegative(), unit: z.enum(UNITS_QTY).optional() }) next to the recipe DTOs and parse row.ingredients with z.array(...).safeParse in mapJsonRow, throwing BadRequestException with the issues. Also parse qty with z.number() rather than trusting the type.

### [backend-8] (low) apps/backend/src/ingredients/ingredients.service.ts:170

**Problem:** PATCH /admin/ingredients/:id may change unit to a different price family while recipes still carry quantities in the old family, which corrupts costing.

**Evidence:** update() writes fields.unit straight through. The plan guards importIngredients against this (unit-family mismatch goes to unmatched) and merge 409s UNIT_MISMATCH, but the direct edit path has no check, so flipping Oeufs from €/pièce to €/kg leaves recipes with qty 6 'pièce' costed at the per-kg price.

**Fix:** In update(), when fields.unit is present and PRICE_TO_QTY_UNIT[fields.unit] !== PRICE_TO_QTY_UNIT[stored.unit], scan recipes (this.scanRecipes()) and throw ConflictException({ code: 'UNIT_IN_USE', recipes: names }) when any recipe line references the ingredient. Keep the stored row from getOrFail to compare against.

### [backend-9] (low) apps/backend/src/events/events.service.ts:126

**Problem:** An event stored without a recipes attribute is returned with recipes undefined, and every line endpoint then throws a TypeError (500) instead of handling it.

**Evidence:** withLineIds builds lines = event.recipes ?? [] but, when every (empty) line already has an id, returns the original event whose recipes is still undefined. addLine does [...stored.recipes, ...], putLines does stored.recipes.map(...), removeLine does stored.recipes.some(...), all of which throw on undefined.

**Fix:** Return { ...event, recipes: lines } on the early-exit path in withLineIds (change 'if (lines.every((l) => l.lineId)) return event;' to 'if (lines.every((l) => l.lineId)) return { ...event, recipes: lines };') so every event the service hands out carries an array.

### [backend-10] (low) apps/backend/src/ledger/ledger.controller.ts:29

**Problem:** GET /admin/ledger?year= accepts any string and filters by prefix, so year=2 returns every 2xxx entry and year=abc returns an empty list instead of a 400.

**Evidence:** list() passes year || undefined straight to the service, which does e.ym.startsWith(year). The plan's row reads 'GET /admin/ledger?year=2026'.

**Fix:** Validate with z.string().regex(/^\d{4}$/).optional().safeParse(year) in the controller and throw BadRequestException on failure; pass the parsed value to the service.

### [backend-11] (low) packages/types/src/dto/ledger.ts:63

**Problem:** The Réglé PATCH cannot clear paymentMethod or paidAt once set, so an entry un-marked as paid keeps a stale payment date.

**Evidence:** patchLedgerEntrySchema is .partial().strict() with paidAt: isoDate and paymentMethod: paymentMethodSchema, neither nullable. LedgerService.patch forwards undefined (skipped by ddb.update) so { paid: false } leaves paidAt and paymentMethod in place and the export shows a date for an unpaid line.

**Fix:** Make paymentMethod and paidAt .nullable() in patchLedgerEntrySchema; ddb.update already converts null to REMOVE. In the Réglé popover send paidAt: null and paymentMethod: null when paid is switched off.

### [backend-12] (low) apps/backend/src/ingredients/ingredients.controller.ts:54

**Problem:** POST /admin/ingredients/merge, /admin/ledger/lock, /admin/ledger/unlock, /admin/clients/:id/instantiate and /link-events return 201 while the plan's endpoint table documents 200 for merge.

**Evidence:** Nest defaults every @Post to 201 and no handler sets @HttpCode(200). /tmp/smoke/run.mjs line 130 already asserts 201 for merge, and the frontend only checks res.ok, so nothing breaks, but the table (plan line 670) says 200.

**Fix:** Either add @HttpCode(200) to the merge, lock, unlock, instantiate and link-events handlers (these are actions, not resource creations) and update the smoke script assertions, or change the plan table to 201. Pick one; the frontend is indifferent.

### [backend-13] (low) apps/backend/src/ingredients/ingredients.service.ts:292

**Problem:** merge() records ids that do not exist in survivor.mergedFrom.

**Evidence:** mergedRows filters out ids whose row is missing, but mergedFrom is built from ids (the unfiltered set), so a retry after a partial merge, or a typo id, appends ids that were never ingredients to the survivor's audit list.

**Fix:** Build mergedFrom from mergedRows: new Set([...(survivor.mergedFrom ?? []), ...mergedRows.map((r) => r.ingredientId)]).

### [backend-14] (low) apps/backend/src/ledger/ledger.service.ts:57

**Problem:** replace() rebuilds the entry from the form body and drops server-owned flags that are not part of the DTO, such as imported.

**Evidence:** The entry literal spreads body and only re-adds entryId, ym, paid, createdAt, updatedAt and locked (and the locked branch is unreachable because a locked entry already threw). LedgerEntry has imported?: boolean which is lost on every PUT.

**Fix:** Spread the stored server-only fields before the body: const entry = { ...(stored.imported !== undefined && { imported: stored.imported }), ...body, entryId: stored.entryId, ... }. Remove the dead locked spread.

### [planning-1] (medium) apps/frontend/src/pages/admin/EventEditor.tsx:142

**Problem:** Every autosave PATCH carries `status`, so an editor left open on the laptop reverts an event that the phone completed through "Terminer l'événement", and the Statut select lets the user mark an event completed without the costSnapshot the plan requires.

**Evidence:** `scalarPayload` includes `status` and the autosave fires on any field change (deps at line 180). Backend `update()` writes `{ ...fields }` unconditionally; the merge rule only protects lines. Plan 5.7 says "Terminer l'événement replaces the status pill" and computes `costSnapshot`; 5.8 lists no status field in the editor.

**Fix:** Remove `status` from `scalarPayload` (line 142) and delete the `<select id="ev-status">` block (lines 423-429) plus the `status` state and `EventStatus` import. Keep `setStatus(ev.status)` removal in the load effect. Status is written only by EventDetail (`complete` / `reopen`).

### [planning-2] (medium) apps/frontend/src/pages/admin/EventEditor.tsx:109

**Problem:** After the first POST, `navigate("/events/:id/edit", { replace: true })` changes `id`, the load effect runs again, refetches the event and overwrites every local field with the server copy, discarding anything typed during the POST round trip, and then triggers one more redundant autosave.

**Evidence:** `autoSave` (line 165-168) calls `setCurrentId` then `navigate(...)`; the effect at line 95-134 has deps `[id]` and unconditionally calls `api.events.get(id)` then `setName`, `setRecipes`, etc. `initialized.current` is already true so the setters schedule another PATCH.

**Fix:** In the load effect change `if (!isNew && id) {` to `if (!isNew && id && id !== currentId) {` so the editor skips the refetch when it already owns the event it just created. Keep the recipes/ingredients/clients/settings reload.

### [planning-3] (medium) apps/frontend/src/pages/admin/EventEditor.tsx:157

**Problem:** An autosave that fires while a previous save is in flight is dropped and never rescheduled, so edits made during the request are not saved until the user changes something else.

**Evidence:** `if (savingRef.current) return;` at line 157 exits silently; nothing re-arms the timer after `finally` at line 173. The 800 ms debounce fires before a slow POST/PATCH returns whenever the user keeps typing.

**Fix:** Add `const pendingRef = useRef(false);`. In `autoSave`, replace the early return with `if (savingRef.current) { pendingRef.current = true; return; }`, and in `finally` after `savingRef.current = false; setSaving(false);` add `if (pendingRef.current) { pendingRef.current = false; autoSaveRef.current(); }`.

### [planning-4] (medium) apps/frontend/src/pages/admin/EventEditor.tsx:499

**Problem:** Portions and guest counts typed with a decimal ("12,5") are committed as floats, the Zod DTO requires `int()`, the request returns 400, and the local line already shows the rejected value.

**Evidence:** `NumericInput.commit` does `parseFloat` and only clamps `min`. `patchLine(i, { portions: v })` first does `setRecipes(next)` then calls `api.events.lines.patch`. `eventRecipeLineSchema.portions` is `z.number().int().positive()`, `guestCount` too. For a new event the POST fails on every autosave until the value is corrected.

**Fix:** Line 499: `onChange={(v) => { const p = Math.max(1, Math.round(v)); if (p !== rl.portions) patchLine(i, { portions: p }); }}`. Line 409 (convives): `onChange={(v) => { guestCountTouched.current = true; setGuestCount(Math.max(1, Math.round(v))); }}`. In `addRecipe` use `portions: Math.max(1, Math.round(guestCount))`.

### [planning-5] (medium) apps/frontend/src/pages/admin/RecipeCook.tsx:110

**Problem:** If the recipe or ingredient fetch fails the page stays on a full-screen "Chargement…" forever with no way out; the toast is the only signal.

**Evidence:** `.catch(() => toast(...))` at line 38 leaves `recipe` null; line 110 renders the loading screen whenever `!recipe`, and the fixed-inset layout has no Quitter button in that branch.

**Fix:** Add `const [error, setError] = useState(false);` set in the catch. Before line 110 add: `if (!loading && (error || !recipe)) return (<div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background p-6"><p className="text-lead text-muted-foreground">Recette introuvable.</p><button type="button" onClick={() => navigate(-1)} className="inline-flex min-h-11 items-center rounded-lg border px-4 text-base font-medium hover:bg-hover">Quitter</button></div>);` and keep the loading branch for `loading` only.

### [planning-6] (medium) apps/frontend/src/pages/admin/Events.tsx:58

**Problem:** Date labels in the events list, the event breadcrumb and the prep sheet breadcrumb have no month: "Mar 13 · 30 conv." instead of the plan's "Mar 13 oct", so a "Terminés" or "Tous" list spanning months is ambiguous.

**Evidence:** `dayLabel` in packages/types/src/lib/dates.ts formats `{ weekday: "short", day: "numeric" }` only. Used at Events.tsx:58, EventDetail.tsx:667 and :838, PrepSheet.tsx:168. Plan 5.8: "Mar 13 oct · 30 conv. · Hoona"; 5.7: "Hoona · mardi 13 oct"; 5.3: "Mardi 13 oct / Hoona".

**Fix:** In packages/types/src/lib/dates.ts add `const shortDayMonth = new Intl.DateTimeFormat("fr-BE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });` and `export function dayMonthShortLabel(date: string): string { return capitalize(shortDayMonth.format(parseYmd(date)).replace(/\./g, "")); }` (gives "Mar 13 oct"). Export it from packages/types index and from apps/frontend/src/lib/dates.ts. Use it at Events.tsx:58, EventDetail.tsx:667 and :838, and PrepSheet.tsx:168.

### [planning-7] (medium) apps/backend/src/events/events.service.ts:81

**Problem:** `patchLine` is a read-modify-write of the whole `recipes` array, so two PATCHes on the same event that overlap in time lose one of the updates; the frontend issues such pairs (prep sheet note blur plus a status tap, two quick dot taps on one event in the week view).

**Evidence:** `patchLine` does `getOrFail`, maps the array, then `writeLines` writes `{ recipes }` entirely. PrepSheet.tsx:245 saves notes on blur while the status button at the bottom bar starts a second PATCH in the same tick; Week.tsx:142 `cycle` does not serialize taps. Plan 7.1: status written only through this endpoint and "nothing auto-resets".

**Fix:** In `patchLine`, replace the full-array write with an indexed update guarded by a condition: `await this.ddb.update(this.table, { eventId }, { [`recipes[${index}].${field}`]: value ... , updatedAt }, { ConditionExpression: `recipes[${index}].lineId = :lid`, ExpressionAttributeValues: { ":lid": lineId } })` (extend `ddb.update` to accept a condition if it does not), retrying once on ConditionalCheckFailed. If that is too large, serialize in the frontend instead: in apps/frontend/src/lib/use-planning-data.ts keep a `Map<string, Promise<unknown>>` per eventId and chain each `patchLine` call on the previous promise for that event.

### [planning-8] (low) apps/frontend/src/pages/admin/EventEditor.tsx:322

**Problem:** "Terminé" on a new event lands on /events instead of the event it just created because `currentId` in the closure is still null after `autoSave` created it.

**Evidence:** `handleDone` calls `await autoSave()` then `navigate(currentId ? ... : "/events")`; `autoSave` sets `currentId` via state, which the closure does not see.

**Fix:** Make `autoSave` return the id: `return created.eventId;` in the create branch and `return currentId;` in the update branch (type `Promise<string | null>`). In `handleDone`: `const savedId = await autoSave(); navigate(savedId ? `/events/${savedId}` : "/events");`.

### [planning-9] (low) apps/frontend/src/pages/admin/EventEditor.tsx:56

**Problem:** The default date of a new event is the UTC day, so after midnight Belgian time (until 01:00 or 02:00) "Nouvel événement" without ?date= defaults to yesterday.

**Evidence:** `useState(new Date().toISOString().split("T")[0])`. The rest of the pages use `todayIso()` from lib/dates for the local calendar date.

**Fix:** Import `todayIso` from "@/lib/dates" and use `useState(todayIso())`.

### [planning-10] (low) apps/frontend/src/pages/admin/EventEditor.tsx:493

**Problem:** Choosing "Non définie" sends `course: ""`, which the server stores; `courseOf` uses `??` so the empty string overrides `recipe.defaultCourse` and the line sorts under Autre everywhere instead of the recipe's default category.

**Evidence:** `patchLine(i, { course: e.target.value })` with value ""; `eventRecipeLineSchema.course` is `z.string().trim().max(40).optional()` (no min); planning.ts `courseOf` returns `line.course ?? recipe?.defaultCourse ?? "Autre"`.

**Fix:** On change: `const c = e.target.value || rec?.defaultCourse || "Autre"; patchLine(i, { course: c });` and drop the "Non définie" option once `rl.lineId` exists (keep it only for unsaved local lines).

### [planning-11] (low) apps/frontend/src/pages/admin/Day.tsx:267

**Problem:** When the load fails, the page shows the error and, right under it, "Aucune ligne à préparer ce jour. Créer un événement", which reads as an empty day rather than a failure.

**Evidence:** The empty-state condition is `!loading && lines.length === 0`; `error` is rendered separately at line 264 and does not gate it.

**Fix:** Change the condition to `!loading && !error && lines.length === 0`, and the "Tout est fait" condition below to `!loading && !error && lines.length > 0 && shownGroups.length === 0`.

### [planning-12] (low) apps/frontend/src/pages/admin/Day.tsx:319

**Problem:** The done notice reads "{recipe} faite" which disagrees with most recipe names ("Mini quiches lorraines faite", "Houmous faite").

**Evidence:** `{notice.name} faite` is fixed singular feminine; the plan's example "Mini quiches faites" is plural because of the recipe name, so agreement cannot be computed.

**Fix:** Render `Fait : {notice.name}` instead.

### [planning-13] (low) apps/frontend/src/pages/admin/RecipeCook.tsx:144

**Problem:** "Marquer fait" returns to the day without `?done=<lineId>`, so the day page does not show the "Suivante" notice that the prep sheet path shows for the same action.

**Evidence:** `navigate(`/jour/${event.date}`)` at line 146; PrepSheet.tsx:114 navigates to `/jour/${date}?done=${lineId}` and Day.tsx:140 reads `done` to build the notice with the next À préparer line.

**Fix:** Change line 146 to `navigate(`/jour/${event.date}?done=${lineId}`)` and drop the separate toast at line 145 since the day notice replaces it.

### [planning-14] (low) apps/frontend/src/pages/admin/PrepSheet.tsx:93

**Problem:** The swipe handler is on the whole sheet, so a horizontal text-selection drag on a step (steps are selectable per the plan) or a drag inside the notes textarea navigates to the previous or next line.

**Evidence:** `onTouchEnd` only checks `dx` and `dy`; it does not check where the touch started or whether a selection exists. Same pattern in RecipeCook.tsx:121 on the `main` with `select-text`.

**Fix:** In both `onTouchStart` handlers record the target: `const el = e.target as HTMLElement; if (el.closest("textarea, input, select")) { touchStart.current = null; return; }`. In both `onTouchEnd`, before navigating: `if (window.getSelection()?.toString()) return;`.

### [planning-15] (low) apps/frontend/src/pages/admin/PrepSheet.tsx:231

**Problem:** Plan 5.3's laptop layout (ingredients 320px left, steps right, status as a sticky right card) and the phone "Ingrédients ▾" pill are not built; RecipeReader renders one column at every width and the status bar is a bottom bar on laptop too.

**Evidence:** RecipeReader.tsx renders `<section>` Ingrédients then `<section>` Préparation with no breakpoint classes; PrepSheet.tsx:255 renders the bottom bar unconditionally.

**Fix:** In RecipeReader wrap the two sections in `<div className="xl:grid xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-10">` and give the ingredients section `xl:sticky xl:top-4 xl:self-start`; in PrepSheet widen the content column to `max-w-wide` at `xl` (`max-w-doc xl:max-w-wide`). The phone pill can stay deferred.

### [planning-16] (low) apps/frontend/src/pages/admin/Week.tsx:243

**Problem:** With a client chip selected, "Signé cette semaine" and "Préparation" use the filtered events while "Signé ce mois" uses all events, so the three tiles describe different scopes under the same labels.

**Evidence:** `plan = weekPlan(filteredEvents, monday)` feeds the first and third tiles; `monthSigned = monthSignedRevenue(events, ym)` uses the unfiltered list. Plan 5.1 defines the tiles as sums over all events of the week and month.

**Fix:** Compute the money strip from the unfiltered week: `const weekTotals = useMemo(() => weekPlan(weekEvents, monday), [weekEvents, monday]);` and use `weekTotals.signedRevenue`, `weekTotals.guests`, `weekTotals.linesDone`, `weekTotals.linesTotal` in the three MoneyTiles, keeping `plan` (filtered) for the columns.

### [accounting-1] (high · CONFIRMED) apps/frontend/src/lib/use-report-inputs.ts:42

**Problem:** Only the selected year's ledger entries are loaded, so every prior-year figure computed from the ledger is 0 instead of the real value or blank.

**Evidence:** `api.ledger.list(yearStr)` fetches entries whose ym starts with the year. reports.ts then calls `caOfMonth(inputs, `${year - 1}…`)`, `commissionsOfYear(year - 1)`, `caOfPeriod(inputs, year - 2 | year - 1, …)` and `mix` `caByType(year - 1, …)` on that same array; with `ledgerStartYm` unset every month is a ledger month, so Aperçu shows "CA HTVA N−1" = 0,00 € for all 12 months, the chart draws zero N−1 bars, Mix CA N−1 = 0, the period comparison shows 0 for N−1 and N−2, and "Autres produits N−1" = 0. In the Journal, `prefillForClientMonth(client, events, entries, …)` uses the same array, so an event dated December invoiced by an entry dated in December is not in `invoicedEventIds` when the page is on January of the next year and is proposed for invoicing again. ClientDetail.tsx:178 already loads `[list(year), list(year - 1)]`, the hook does not. Plan 7.6: Aperçu N−1, Mix N−1 and the period comparison read the ledger for ledger months; the comparison covers N−2.

**Fix:** In the useEffect, replace the single `api.ledger.list(yearStr)` call with `Promise.all([y, y - 1, y - 2].map((yr) => api.ledger.list(String(yr)).catch(handle503)))` (where `const y = Number(year)` and handle503 returns [] on ApiError 503 and sets notConfigured), then `setEntries(lists.flat())`. Keep `entries` in the returned ReportData as the full array; the Journal already filters by ym and the export filters by `entryYm(e).startsWith(String(year))`.

**Refuter:** Confirmed. apps/frontend/src/lib/use-report-inputs.ts:42 loads only api.ledger.list(String(year)); the backend (apps/backend/src/ledger/ledger.service.ts:25) filters by e.ym.startsWith(year), so the array never holds N−1 or N−2 entries. ledgerStartYm has no default (apps/backend/src/settings/settings.service.ts:15), so isLedgerMonth is true for every month and packages/types/src/lib/reports.ts takes the ledger branch for prior years: caOfMonth (line 343) returns { amount: 0, source: "ledger" } for each N−1 month, commissionsOfYear(year - 1) (line 440) returns 0, caOfPeriod (line 399) returns 0 for N−1 and N−2, and mix (line 502, 513) sets ledgerYearN1 = true and caByType(year - 1) = 0. Apercu.tsx:271 and 294 render those through fmtMoney, so the user sees 0,00 € rather than blank, and the chart draws zero N−1 bars. The lib test at packages/types/src/lib/reports.test.ts:357 shows the intended contract: N−1 ledger figures come from the same entries array the caller supplies. For the Journal, prefillForClientMonth (packages/types/src/lib/prefill.ts:122) builds invoicedEventIds from that array, so on January N a December N−1 event already covered by a December facture is proposed again. ClientDetail.tsx:178 and EventDetail.tsx:164 load the ledger separately and are not affected by the hook.

The proposed fix is correct but incomplete in one place: the Aperçu "À encaisser" tile (apps/frontend/src/pages/admin/comptes/Apercu.tsx:176) sums every unpaid CA entry in the array with no year filter, so after the change it would silently include unpaid invoices from N−1 and N−2. Either scope it to the year (keeps today's meaning) or accept the wider meaning deliberately; the corrected fix scopes it. The Journal credit-note reference list (Journal.tsx:186) would also list three years of invoices, which is an improvement and needs no change. Cost note: each list(year) call is a full DynamoDB scan, so three calls are three scans per page load; acceptable for this table size, and a single api.ledger.list() with no year would be one scan but unbounded. Related follow-up outside this finding: EventDetail.tsx:164 loads only the event's year, so an invoice dated January covering a December event is not shown on that event's page.

### [accounting-2] (high · CONFIRMED) apps/frontend/src/lib/ledger-export.ts:155

**Problem:** On the "recettes <year>" sheet the THERMOMIX block is written over the per-type totals, so the exported rows mix month names, type labels and two different amounts in the same lines.

**Evidence:** `buildLedgerWorkbook` writes `typeBlock(ca, …)` at `A${layout.totalRow + 1}`; that block is 9 rows (title, 7 prestation types, "Sans type") occupying totalRow+1 to totalRow+9, columns C and E. `yearSheetLayout` sets `thermomixRow = totalRow + THERMOMIX_OFFSET` with `THERMOMIX_OFFSET = 5`, so `thermomixBlock` (columns A and D) starts at totalRow+5. `sheet_add_aoa` skips null cells, so rows totalRow+5 to totalRow+9 end up with "janvier" in A, a prestation label in C, the commission amount in D and the type total in E. Plan 7.6 expects the TOTAL row, then the THERMOMIX block and the ACOMPTES block as separate blocks.

**Fix:** Compute the offset from the type block length: in `yearSheetLayout(caCount, typeRows)` take a second argument `typeRows = typeBlock(...).length` and set `const thermomixRow = totalRow + 1 + typeRows + 2;` (keep `acomptesRow: thermomixRow + 17`). In `buildLedgerWorkbook` build `const types = typeBlock(ca, settings, `Total CA ${year}`)` once, call `yearSheetLayout(ca.length, types.length)` and write `types` at `A${layout.totalRow + 1}`. Add a jest case asserting that no cell of the thermomix rows is overwritten (e.g. the "janvier" row has an empty column C and E).

**Refuter:** Confirmed by building the workbook with the real xlsx 0.18.5 library (esbuild bundle of apps/frontend/src/lib/ledger-export.ts, default prestation types, one facture typed "atelier", one January commission, one acompte). yearSheetLayout(1) returns { totalRow: 140, thermomixRow: 145, acomptesRow: 162 }. typeBlock writes 9 rows (title + 7 default types + "Sans type") in columns C and E from row 141 to 149; thermomixBlock starts at row 145 in columns A and D. sheet_add_aoa skips null cells, so rows 145 to 149 come out as: 145 "THERMOMIX" | "Atelier" | 100; 146 "janvier" | "Brunch" | 42 | 0; 147 "février" | "Walking / cocktail" | 0 | 0; 148 "mars" | "Chef à domicile"; 149 "avril" | "Sans type" | 47.17. The two blocks interleave exactly as the reviewer described. The proposed layout fix is correct: with thermomixRow = totalRow + 1 + types.length + 2 the sheet shows TOTAL at 140, per-type totals 141 to 149, THERMOMIX at 152 to 166, ACOMPTES at 169, and no thermomix month row has a C or E cell. The offset also adapts when settings.prestationTypes has a different length, which the constant 5 never could. yearSheetLayout has no other callers (grep of apps/frontend/src), so the signature change is safe. The fix is incomplete only in its test step: apps/frontend has no jest (no jest/vitest config, no *.spec.ts or *.test.ts, package.json scripts are dev/build/preview/lint:type-scale), and ledger-export.ts imports @/lib/accounting which imports @/lib/api using import.meta.env, so a jest case cannot be added in that package as written. The plan's "jest snapshot compares the generated month header" also does not exist today.

### [accounting-3] (high · CONFIRMED) apps/frontend/src/components/comptes/LedgerEntryForm.tsx:250

**Problem:** "Ajouter une ligne pour l'autre taux" on an existing entry replaces that entry with the second rate's amounts instead of creating a second entry, so the first rate's line is lost.

**Evidence:** `save(keepOpen)` does `saved = entry ? await api.ledger.replace(entry.entryId, body) : await api.ledger.create(body)`. After a keepOpen save the form stays mounted with the same `entry` prop (Journal's onSaved only reloads), the amounts are cleared and the rate switched; the next Enregistrer calls `replace(entry.entryId, …)` again with the second rate's amounts, overwriting the entry that was just saved. Plan 5.12: the button "creates a second entry with the same number".

**Fix:** Add `const [createNext, setCreateNext] = useState(false);`. In `save`, use `const target = createNext ? undefined : entry;` and `saved = target ? await api.ledger.replace(target.entryId, body) : await api.ledger.create(body);` (also use `target` for the `locked && entry` branch and for `remove`). In the `if (keepOpen)` block call `setCreateNext(true)` after resetting the amounts. Also change the title to "Nouvelle ligne" and hide Supprimer when `createNext` is true.

**Refuter:** Confirmed in apps/frontend/src/components/comptes/LedgerEntryForm.tsx:239-259 and apps/frontend/src/pages/admin/comptes/Journal.tsx:559. save(true) replaces or creates, then onSaved(saved, { keepOpen: true }); Journal's handler only calls reload() and keeps form.entry, and the form is mounted without a key, so the entry prop is unchanged and f (from useState initializer) persists. The keepOpen block only switches vatRate and clears the amounts. The next Enregistrer runs save(false) with entry still set and calls api.ledger.replace(entry.entryId, body), overwriting the first rate's line. Plan 5.12 (docs/redesign/REDESIGN.md:351) requires a second entry with the same number. The proposed fix is correct in direction but incomplete: remove, the "Créée le" paragraph and the Supprimer block all still dereference entry, so they must switch to the same target. Not applied or type-checked.

### [accounting-4] (medium) apps/frontend/src/pages/admin/comptes/Previsionnel.tsx:170

**Problem:** Saving the objective discards unsaved charge edits, and saving the charges discards unsaved objective edits.

**Evidence:** The effect `useEffect(() => { if (!settings) return; setObjective(settings.objectives?.[String(year)] ?? DEFAULT_OBJECTIVE); setCharges(settings.fixedCharges ?? []); setObjectiveDirty(false); setChargesDirty(false); }, [settings, year])` runs after `reload()` from either `saveObjective` or `saveCharges`. Both forms live on the same page with separate Enregistrer buttons, so editing a charge amount, then saving the objective, resets `charges` to the server value and clears `chargesDirty`; the charge edit is gone without warning.

**Fix:** Split the effect in two and guard each by its dirty flag: `useEffect(() => { if (settings && !objectiveDirty) setObjective(settings.objectives?.[String(year)] ?? DEFAULT_OBJECTIVE); }, [settings, year]);` and `useEffect(() => { if (settings && !chargesDirty) setCharges(settings.fixedCharges ?? []); }, [settings, year]);`. Set the relevant dirty flag to false inside `saveObjective` / `saveCharges` right after the successful `api.settings.update`, before `reload()`. On a `year` change, reset `objectiveDirty` to false explicitly (`useEffect(() => setObjectiveDirty(false), [year])`) since the objective is per year.

### [accounting-5] (medium) packages/types/src/lib/reports.ts:332

**Problem:** Typed prior-year figures (settings.yearActuals) are never shown because nothing in the app sets ledgerStartYm and isLedgerMonth defaults to the ledger for every month.

**Evidence:** `isLedgerMonth` returns true when `settings.ledgerStartYm === undefined`. The only writers of `ledgerStartYm` are backend specs; Settings.tsx has no field for it (grep finds none in apps/frontend/src). So after Dalia types 2025 monthly totals in "Années précédentes", `caOfMonth` still reads the (empty) ledger for 2025 and Aperçu shows 0,00 € with no "saisi" tag; `mix` sets `ledgerYearN1` true and shows 0 for CA N−1 instead of blank, and `caOfPeriod` ignores `byPeriod`. Plan 7.6: months before `ledgerStartYm` read `yearActuals`, and Mix N−1 stays blank unless typed.

**Fix:** Two parts. (1) In reports.ts, make the default use typed data when it exists: `export function isLedgerMonth(settings: Pick<AppSettings, "ledgerStartYm" | "yearActuals">, ym: string): boolean { if (settings.ledgerStartYm !== undefined) return ym >= settings.ledgerStartYm; return settings.yearActuals?.[ym.slice(0, 4)] === undefined; }` and update the test "reads the ledger everywhere when no start is set" to use a settings object without yearActuals. (2) In apps/frontend/src/pages/admin/Settings.tsx, inside the "Années précédentes" Section (line 931), add a `<input type="month">` labelled "Début du journal" bound to `draft.ledgerStartYm` and include `ledgerStartYm` in the `api.settings.update` payload at line 323.

### [accounting-6] (medium) apps/backend/src/ledger/ledger.service.ts:40

**Problem:** A locked month accepts new entries and entries moved into it, so the figures of an exported, locked month can change after the lock.

**Evidence:** `create` and `replace` only check `stored.locked` on the existing entry; neither reads `settings.monthCloses[body.date.slice(0, 7)].lockedAt`. The Journal passes `locked={form.entry ? … : false}` for new lines and keeps "Nouvelle ligne" enabled on a locked month (Journal.tsx:272), so a new facture dated inside a locked month is written, is not flagged `locked`, and changes Total CA of a month the accountant already received. Plan 7.6: the lock freezes date, number, label, kind, amounts, VAT, type and events of the month.

**Fix:** Add a private helper `private async assertOpen(ym: string) { const s = await this.settings.get(); if (s.monthCloses?.[ym]?.lockedAt) throw new ConflictException(LOCKED); }` and call `await this.assertOpen(body.date.slice(0, 7))` at the top of `create` and `replace` (in `replace`, also after the `stored.locked` check so a move into a locked month is refused). Add a spec: create into a month with `lockedAt` set throws 409. The frontend already maps 409 to "Mois verrouillé" in ledgerErrorMessage.

### [accounting-7] (low) apps/frontend/src/pages/admin/comptes/Apercu.tsx:322

**Problem:** The Mix row link opens the Journal on today's month, not on the selected year, so the type filter shows the wrong period.

**Evidence:** `const to = `/comptes/journal?type=${encodeURIComponent(r.type ?? "")}`` carries no `ym`; Journal.tsx:132 falls back to `today.slice(0, 7)`. Viewing the 2025 Mix and tapping a type lands on the current month of 2026 filtered by type. Plan 5.13: "tap a type → journal filtered".

**Fix:** Include the month: `const to = `/comptes/journal?ym=${report.focusYm}&type=${encodeURIComponent(r.type ?? "")}`` (focusYm is the current month when the year is the current year, else the last month with CA).

### [accounting-8] (low) apps/frontend/src/components/comptes/LedgerEntryForm.tsx:162

**Problem:** Switching the kind to Commission sets the rate to 0 but leaves HTVA and TVA computed at the previous rate, so the form then fails the VAT identity until the user retypes the amount.

**Evidence:** `onKind` sets `vatRate: kind === "commission" ? 0 : p.vatRate` without recomputing `htva` and `tva` from `tvac`; `onRate` does that recomputation but is not called. With TVAC 121 at 21 % then kind → Commission, the fields show HTVA 100, TVA 21, rate 0 %, and `identityOk` is still true (100 + 21 = 121) so the server receives a 0 % line with 21 of VAT.

**Fix:** In `onKind`, when `kind === "commission"` call `onRate(0)` after setting the kind: `setF((p) => ({ ...p, kind, paid: kind === "acompte" ? true : p.paid })); if (kind === "commission") onRate(0);`. Also add to `validate()`: `if (isSales && f.kind === "commission" && num(f.tva) !== 0) return "Une commission n'a pas de TVA.";`.

### [accounting-9] (low) apps/frontend/src/pages/admin/comptes/Journal.tsx:467

**Problem:** The rail tiles sum amounts with floating-point reduce instead of sumMoney.

**Evidence:** `acomptes.reduce((n, e) => n + e.totalTvac, 0)` and `commissions.reduce((n, e) => n + e.htva, 0)` accumulate floats; the rest of the page sums in cents. Plan 7.6: "Amounts are validated to two decimals and summed in cents". fmtEur hides most drift but a value like 0.1 + 0.2 can round the other way at the half-cent boundary.

**Fix:** Import `sumMoney` from "@packages/types" and use `sumMoney(acomptes.map((e) => e.totalTvac))` and `sumMoney(commissions.map((e) => e.htva))`.

### [accounting-10] (low) apps/frontend/src/pages/admin/comptes/Previsionnel.tsx:233

**Problem:** Saving the objective writes back the objectives record from the page's initial load, so objectives of other years changed elsewhere since the page opened are overwritten.

**Evidence:** `api.settings.update({ objectives: { ...settings.objectives, [String(year)]: cleanObjective(objective) } })` spreads `settings` from `useReportInputs`, captured when the page loaded. The backend `SettingsService.update` is a shallow merge that replaces the whole `objectives` record. Resultats.tsx's SourceMpDialog avoids this by calling `api.settings.get()` right before writing `monthCloses`.

**Fix:** Mirror SourceMpDialog: `const fresh = await api.settings.get(); await api.settings.update({ objectives: { ...fresh.objectives, [String(year)]: cleanObjective(objective) } });`. `api.settings.get` is invalidated on every update so the read is current within the tab.

### [accounting-11] (low) apps/backend/src/ledger/ledger.service.ts:116

**Problem:** Unlocking overwrites the month's lock note with the unlock reason, so the note typed at lock time (for example why MP was "saisi") is lost.

**Evidence:** `monthCloses[ym] = { ...previous, unlockedAt: now, note: reason };` replaces `note`. Plan 7.6 says unlock "writes unlockedAt and leaves mpSource as chosen"; it does not say the note is replaced.

**Fix:** Append instead of replace: `note: previous.note ? `${previous.note} · Déverrouillé : ${reason}` : `Déverrouillé : ${reason}``.

### [accounting-12] (low) apps/frontend/src/lib/ledger-export.ts:387

**Problem:** The CSV TOTAL row sums every sales line including commissions, while the xlsx TOTAL row sums CA lines only, so the two exports of the same month disagree on Σ TVAC and Σ HTVA.

**Evidence:** `exportMonthCsv` does `const sales = rows.filter((e) => e.book === "ventes"); const t = salesTotals(sales, settings);` and writes `t.tvac`, `t.htva` as TOTAL; `monthSheetRows` builds `totalRow(ca, false)` with `ca = …filter(isCaEntry)`. A month with a 150 € commission shows a TOTAL 150 € higher in the CSV than in the workbook sheet; the workbook keeps commissions outside the TOTAL row.

**Fix:** Compute the TOTAL line over CA lines: `const t = salesTotals(sales.filter(isCaEntry), settings);` and add a separate line after "Total CA": `["", "", "", "", "Commissions (hors CA)", "", csvNumber(salesTotals(sales, settings).commissions)].join(";")`.

### [catalog-1] (high · CONFIRMED) apps/frontend/src/pages/admin/Settings.tsx:258

**Problem:** When GET /admin/settings fails, the page builds the draft from defaults and still renders the editable form; the next Enregistrer sends objectives {}, yearActuals {}, fixedCharges [], ignoredDuplicateGroups [] and default suppliers/categories, and SettingsService.update replaces each record whole, wiping the stored values.

**Evidence:** .catch(() => setDraft(fromSettings({ settingsId: "global", recipeCategories: [], suppliers: [], updatedAt: "" }))) at line 258, then handleSave at lines 323-333 sends every key from that default draft; settings.service.ts update is a shallow merge ("a record such as objectives is replaced whole by what the client sends"). Plan 5.17: saves go through PATCH with the extended DTO and must preserve objectives and yearActuals.

**Fix:** Replace the catch with `.catch(() => setLoadError("Impossible de charger les paramètres"))` (add `const [loadError, setLoadError] = useState<string | null>(null)`), and after the loading guard render `if (!draft) return <div className="p-8 text-base text-destructive">{loadError ?? "Paramètres indisponibles"} <button type="button" className={btnSecondary} onClick={() => window.location.reload()}>Recharger</button></div>;` so the form and the save button never appear without the loaded settings.

**Refuter:** Confirmed. In /Users/antoineboxho/Developer/Personal/02_projects/recipe-book/apps/frontend/src/pages/admin/Settings.tsx the catch at line 258 builds the draft from an empty AppSettings, so fromSettings yields objectives {}, yearActuals {}, fixedCharges [], ignoredDuplicateGroups [], company with blank strings, and DEFAULT_* for the four taxonomies. The form renders, any edit sets dirty, and handleSave (lines 323-333) sends every key. In apps/backend/src/settings/settings.service.ts, update() only filters values that are undefined; {} and [] pass through and the spread `{ ...current, ...given }` replaces each stored record whole, so objectives, yearActuals, fixedCharges, ignoredDuplicateGroups and company are wiped (monthCloses and ledgerStartYm survive only because the page does not send them). Plan 5.17 says saves go through PATCH /admin/settings and must keep the stored data.

The proposed fix is incomplete. The existing guard is `if (loading || !draft) return <Chargement…>`. Adding `if (!draft) return <error>` after it is unreachable: on a failed GET, loading becomes false, draft stays null, and the page shows "Chargement…" forever. The guard must become `if (loading)` only, so the `!draft` branch renders the error. With that change, TypeScript narrows draft to Draft for the rest of the component.

Verification: I applied the corrected fix, `cd apps/frontend && npx tsc -b` exited 0, and `pnpm --filter @apps/frontend run lint:type-scale` failed only on the known dead pages/admin/Dashboard.tsx. The api `cached` helper drops the cache entry on rejection, so a reload re-fetches rather than replaying the failure.

Side note on repository state: while my temporary edit was in the working tree, a commit d5c11c2 ("Refactor code structure for improved readability and maintainability") was created on redesign/2026-10 by another process, sweeping up the previously uncommitted files plus my Settings.tsx change. I did not make that commit. I had restored the pre-fix file from a backup before noticing, then reset Settings.tsx to HEAD with `git checkout --`, so the working tree is now clean and HEAD contains the corrected fix.

### [catalog-2] (medium) apps/frontend/src/pages/admin/GroceryListPage.tsx:83

**Problem:** Autosave loops: the effect depends on `list`, and autoSave/createAndSave call setList(updated) with a new object from the API, which re-triggers the effect, which schedules another PATCH 800 ms later, indefinitely while a list is open.

**Evidence:** useEffect(..., [title, items, list, editing, autoSave, createAndSave]) at line 83; autoSave does `setList(updated)` at line 52 and createAndSave does `setList(created)` at line 64. Each response is a fresh object, so `list` changes after every save and the timer is re-armed with unchanged title/items.

**Fix:** Depend on the id, not the object: add `const listId = list?.listId ?? null;` before the effect, change the body to `if (listId) autoSave(listId, title, items); else createAndSave(title, items);` and the deps to `[title, items, listId, editing, autoSave, createAndSave]`. Also add a `dirtyRef = useRef(false)` set to true in patchItem, removeItem, addItemFromIngredient and the title onChange, checked at the top of the effect (`if (!dirtyRef.current) return;`) and reset to false inside autoSave/createAndSave before the request, so selecting a list does not trigger a no-op save.

### [catalog-3] (medium) apps/frontend/src/pages/admin/RecipeDetail.tsx:176

**Problem:** After editing Portions in edit mode, the read-mode Stepper keeps the old value and RecipeReader scales every ingredient by oldPortions/newPortions, so quantities shown (and the ?portions= passed to Cuisiner) are silently wrong.

**Evidence:** `portions` is set once at load (line 161: setPortions(r.portions)); saveRecipeField (lines 176-184) updates `recipe` but not `portions`; read mode uses readPortions = portions || recipe.portions (line 286) and RecipeReader computes ratio = portions / recipe.portions (RecipeReader.tsx line 29). Plan 5.5: the Stepper defaults to recipe.portions.

**Fix:** In saveRecipeField, after `setRecipe(updated);` add `if (patch.portions !== undefined) setPortions(updated.portions);` so the reader follows the recipe's new base portions.

### [catalog-4] (medium) apps/frontend/src/pages/admin/RecipeDetail.tsx:299

**Problem:** The create-ingredient modal opened from the ingredient SearchSelect never shows the "Semblable à" warning because `existing` is not passed, so duplicates are created from the recipe page.

**Evidence:** IngredientFormModal at lines 298-305 receives ingredient, supplierNames, onSave, onCancel only; the modal computes `similar` only when `existing` is set (IngredientFormModal.tsx lines 27-36). Plan 7.3 UI: "IngredientFormModal runs normalizeIngredientName against the loaded list on create and shows 'Semblable à : Oeufs · Utiliser' before saving." The page already holds `ingredients`.

**Fix:** Add `existing={ingredients}` and `onUseExisting={(ing) => { setNewIng((p) => ({ ...p, ingredientId: ing.ingredientId, unit: PRICE_TO_QTY_UNIT[ing.unit] || "g" })); setCreatingIngredient(null); }}` to the creatingIngredient IngredientFormModal.

### [catalog-5] (medium) apps/frontend/src/pages/admin/RecipeEditor.tsx:323

**Problem:** Same gap: the create-ingredient modal has no `existing`, so "Semblable à" never fires, and the created ingredient is not assigned to the row that opened the modal.

**Evidence:** Lines 322-329 pass ingredient, supplierNames, onSave, onCancel only; handleCreateIngredient (lines 103-112) appends to allIngredients and closes without touching form.ingredients. Plan 7.3 UI requires the create-time warning.

**Fix:** Track the row: change `creatingIngredient` to `{ name: string; row: number } | null`, set it from the row's onCreateNew as `(name) => setCreatingIngredient({ name, row: i })`. Pass `existing={allIngredients}` and `onUseExisting={(ing) => { assign(ing); setCreatingIngredient(null); }}` where `assign = (ing: Ingredient) => { const a = [...form.ingredients]; a[row] = { ...a[row], ingredientId: ing.ingredientId, unit: PRICE_TO_QTY_UNIT[ing.unit] }; update("ingredients", a); }`, and call the same assign(created) in handleCreateIngredient.

### [catalog-6] (medium) apps/frontend/src/pages/admin/GroceryListPage.tsx:568

**Problem:** The create-ingredient modal on the grocery page has no `existing`, so the "Semblable à" warning never fires there.

**Evidence:** Lines 567-574 pass ingredient, supplierNames, onSave, onCancel only; `allIngredients` is loaded at line 93. Plan 7.3 UI requires the create-time warning wherever IngredientFormModal creates.

**Fix:** Add `existing={allIngredients}` and `onUseExisting={(ing) => { setNewIngId(ing.ingredientId); setNewIngUnit(PRICE_TO_QTY_UNIT[ing.unit] || "g"); setCreatingIngredient(null); }}`.

### [catalog-7] (medium) apps/frontend/src/pages/admin/Settings.tsx:856

**Problem:** Inputs that reset while typing: default-backed number fields snap back to their default the moment the field is cleared, so the user cannot clear and retype (common on the phone numeric keyboard).

**Evidence:** NumInput value={round2((obj.rawMaterialPct ?? DEFAULT_RAW_MATERIAL_PCT) * 100)} with onChange setting rawMaterialPct undefined when empty (lines 854-859); the next render shows 38 again. Same pattern at line 865 (corporateTaxRate → 25), line 887 (treasuryMonths ?? 3), line 891 (treasurySavingPerMonth ?? 0), line 766 (annualRevenue: v ?? 0 shows "0" then "05") and line 770 (monthsActive: v ?? 10).

**Fix:** Show the default as a placeholder instead of a value: for 856 use `value={obj.rawMaterialPct === undefined ? undefined : round2(obj.rawMaterialPct * 100)} placeholder="38"`; for 865 `value={obj.corporateTaxRate === undefined ? undefined : round2(obj.corporateTaxRate * 100)} placeholder="25"`; for 887 `value={obj.treasuryMonths} placeholder="3"`; for 891 `value={obj.treasurySavingPerMonth} placeholder="0"`. For 766 and 770 widen Draft to `objectives: Record<string, Partial<YearObjective>>`, pass `value={obj.annualRevenue}` / `value={obj.monthsActive}` with `onChange={(v) => setObj({ annualRevenue: v })}` / `setObj({ monthsActive: v })` and placeholders "0" / "10"; cleanObjective already coerces with `o.annualRevenue || 0` and `o.monthsActive || DEFAULT_MONTHS_ACTIVE`, so adjust its parameter type to Partial<YearObjective>.

### [catalog-8] (medium) apps/frontend/src/pages/admin/Ingredients.tsx:76

**Problem:** Deleting an ingredient that is used in recipes shows "Request failed: 409" instead of the recipe names the backend returns.

**Evidence:** deleteIngredient catches and toasts `(e as Error).message`; the backend throws ConflictException({ code: "IN_USE", recipes: names }) (ingredients.service.ts line 194), which has no `message`, so parseResponse in api.ts falls back to `Request failed: 409`. Plan 7.3: DELETE "returns 409 IN_USE with recipe names".

**Fix:** Import ApiError from "@/lib/api" and replace the catch with: `catch (e) { if (e instanceof ApiError && e.status === 409) { const names = ((e.body as { recipes?: string[] } | null)?.recipes ?? []); toast({ title: `Utilisé dans ${names.length} recette${names.length > 1 ? "s" : ""} : ${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}`, variant: "destructive" }); } else toast({ title: (e as Error).message || "Erreur lors de la suppression", variant: "destructive" }); }`.

### [catalog-9] (low) apps/frontend/src/pages/admin/RecipeDetail.tsx:153

**Problem:** The ingredient modals get DEFAULT_SUPPLIERS although settings are fetched on the same page, so suppliers added in Paramètres are missing from the supplier picker.

**Evidence:** const [supplierNames] = useState(() => DEFAULT_SUPPLIERS.map((s) => s.name)) at line 153; the load at lines 160-161 reads settings but only uses recipeCategories. Plan 5.9 and 5.17 make settings.suppliers the source of suppliers.

**Fix:** Change to `const [supplierNames, setSupplierNames] = useState(() => DEFAULT_SUPPLIERS.map((s) => s.name));` and in the `.then` at line 161 add `if (s?.suppliers?.length) setSupplierNames(s.suppliers.map((x) => x.name));`.

### [catalog-10] (low) apps/frontend/src/pages/admin/RecipeEditor.tsx:47

**Problem:** Same as RecipeDetail: supplierNames come from DEFAULT_SUPPLIERS while settings are already loaded.

**Evidence:** const [supplierNames] = useState(() => DEFAULT_SUPPLIERS.map((s) => s.name)) at line 47; settings are fetched at lines 57-62 and only recipeCategories is used.

**Fix:** Use `const [supplierNames, setSupplierNames] = useState(...)` and after setCategories at line 62 add `if (settings?.suppliers?.length) setSupplierNames(settings.suppliers.map((x) => x.name));`.

### [catalog-11] (low) apps/frontend/src/components/ui/RecipeReader.tsx:30

**Problem:** The "Aa" large size uses Tailwind's default text-xl (20px / 28px), not the 22px the type scale specifies, and it is the only size on the reading surfaces that is not a design token.

**Evidence:** const textSize = size === "xl" ? "text-xl" : "text-lead"; tailwind.config.ts fontSize defines caption, sm, base, lead, h3, h2, h1, h1-lg, cook, cook-lg only. Plan section 4: text-lead is "18px / 1.6 (22px with the Aa toggle, see 5.3)".

**Fix:** Add `"lead-lg": ["22px", "1.6"]` to theme.extend.fontSize in apps/frontend/tailwind.config.ts and change line 30 to `const textSize = size === "xl" ? "text-lead-lg" : "text-lead";`. Apply the same token in PrepSheet.tsx if it sizes its "xl" mode with a non-token class.

### [catalog-12] (low) apps/frontend/src/pages/admin/RecipeDetail.tsx:230

**Problem:** Dupliquer navigates to the old full-form RecipeEditor route instead of the inline edit mode every other path uses.

**Evidence:** navigate(`/recipes/${created.recipeId}/edit`) at line 230, while Recipes.tsx createRecipe navigates to `?mode=edit` (line 130). Plan 5.5 defines edit as `/recipes/:id?mode=edit`.

**Fix:** Change line 230 to `navigate(`/recipes/${created.recipeId}?mode=edit`);`.

### [catalog-13] (low) apps/frontend/src/pages/admin/IngredientDuplicates.tsx:155

**Problem:** After a successful merge the page refreshes ingredients and recipes but not grocery lists, so the "n listes" counts on remaining groups stay stale.

**Evidence:** Lines 155-156 call api.ingredients.list() and api.recipes.list() only; listsUsing (lines 117-129) is built from `lists`.

**Fix:** After line 156 add `api.groceryLists.list().then(setLists).catch(() => {});`.

### [catalog-14] (low) apps/frontend/src/pages/admin/IngredientDuplicates.tsx:386

**Problem:** A local SupplierTag duplicates components/ui/SupplierTag.tsx, which already renders the dot and uses the tint.

**Evidence:** function SupplierTag at lines 386-393 rebuilds the same markup; components/ui/index.ts exports SupplierTag.

**Fix:** Delete the local function, add SupplierTag to the `@/components/ui` import at line 10, and drop the now unused `supplierColor` import at line 9.

### [catalog-15] (low) apps/frontend/src/pages/admin/ClientDetail.tsx:343

**Problem:** Clearing the client name in the header commits `name: ""`, which the strict DTO rejects (min 1), leaving the header blank with a generic "Erreur d'enregistrement" toast.

**Evidence:** EditableText onSave={(v) => update({ name: v })} at line 343; updateClientSchema derives from `name: z.string().min(1).trim()`.

**Fix:** Change to `onSave={(v) => { const name = v.trim(); if (name) update({ name }); else setForm((p) => ({ ...p, name: client?.name ?? p.name })); }}`.

### [catalog-16] (low) apps/frontend/src/pages/admin/ClientDetail.tsx:110

**Problem:** Prices with more than two decimals are rejected by moneyNonnegative, so a template save or the price-per-guest autosave fails with a generic toast.

**Evidence:** toTemplatePayload sends `sellingPricePerGuest: Math.max(0, t.sellingPricePerGuest || 0)` (line 110) and the field at line 432 sends parseNum(e.target.value) unrounded; dto/primitives.ts moneyNonnegative has `.refine(twoDecimals, "2 décimales max")`.

**Fix:** Import round2 from "@packages/types"; use `sellingPricePerGuest: round2(Math.max(0, t.sellingPricePerGuest || 0))` at line 110, `amount: round2(Math.max(0, c.amount || 0))` at line 121, and at line 432 `update({ defaultPricePerGuest: n === undefined ? undefined : round2(n) })` with `const n = parseNum(e.target.value)`.

### [catalog-17] (low) packages/types/src/dto/clients.ts:45

**Problem:** Optional client fields cannot be cleared from the UI: choosing "Non précisé" or emptying a number sends `undefined`, which JSON.stringify drops, so the server keeps the previous value.

**Evidence:** ClientDetail.tsx update({ kind: undefined }) (line 373), update({ invoicing: undefined }) (line 401), update({ defaultVatRate: undefined }) (line 425), update({ defaultPricePerGuest: undefined }) (line 432), update({ defaultGuestCount: undefined }) (line 436); updateClientSchema is createClientSchema.partial().strict() with no nullable fields, and ClientsService.update spreads fields into ddb.update.

**Fix:** In updateClientSchema allow null for the clearable keys: `export const updateClientSchema = createClientSchema.partial().extend({ kind: createClientSchema.shape.kind.nullable(), invoicing: createClientSchema.shape.invoicing.nullable(), defaultPrestationType: createClientSchema.shape.defaultPrestationType.nullable(), defaultVatRate: createClientSchema.shape.defaultVatRate.nullable(), defaultPricePerGuest: createClientSchema.shape.defaultPricePerGuest.nullable(), defaultGuestCount: createClientSchema.shape.defaultGuestCount.nullable() }).strict();`. In apps/backend/src/clients/clients.service.ts update(), split null values into a REMOVE list (or write them as undefined with removeUndefinedValues) so the attribute is deleted. In ClientDetail.tsx send `null` instead of `undefined` for those five fields and map null back to undefined in the local form state.

### [catalog-18] (low) apps/frontend/src/pages/admin/Settings.tsx:345

**Problem:** The course rename on event lines is offered and applied on input blur, before the settings are saved; if the user then discards or never saves, event lines carry a category that is not in the list and sort under Autre.

**Evidence:** checkCourseRename runs from onBlur at line 498 and applyRename sends PUT /admin/events/:id/lines immediately (lines 360-377), independent of handleSave. Plan 5.17 describes the rename as part of renaming a category in Paramètres, i.e. tied to the saved list.

**Fix:** Collect renames instead of prompting on blur: in checkCourseRename push `{ from, to }` into a `pendingRenames` state (dedupe by from) and in handleSave, after `setDraft(fromSettings(updated))`, fetch events once, compute `affected` for each pending pair, and only then setRename(...) with the first pair (chain the rest after applyRename). Clear pendingRenames when the save fails or the user discards.

### [catalog-19] (low) apps/frontend/src/pages/LoginPage.tsx:20

**Problem:** After login the app lands on /recipes, while the home of the redesign is the week page.

**Evidence:** navigate("/recipes") at line 20; App.tsx routes "/" to HomeRedirect, which goes to /semaine/:isoWeek. Plan section 3 "Home" is Semaine.

**Fix:** Change line 20 to `navigate("/");`.

### [conformance-1] (high · CONFIRMED) apps/backend/src/ledger/ledger.service.ts:40

**Problem:** settings.ledgerStartYm is never set, so the typed prior-year figures (settings.yearActuals) are never used: Aperçu CA N−1, Mix CA N−1 and the period comparison always read the ledger, which is empty for past years.

**Evidence:** Plan line 501 says ledgerStartYm is "set on the first sales entry, editable" and line 853 says months before it read yearActuals. grep shows ledgerStartYm is only read (packages/types/src/lib/reports.ts:333 isLedgerMonth returns true when it is undefined) and never written: LedgerService.create (line 40) puts the entry and returns; Settings.tsx has no field for it. Result: after Dalia types 2025 monthly totals in Paramètres > Années précédentes, Aperçu 2026 shows 0 for every N−1 cell and a blank Δ %, and the "saisi" tags never appear.

**Fix:** In LedgerService.create, after `await this.ddb.put(...)`, add: `if (entry.book === "ventes") { const s = await this.settings.get(); if (!s.ledgerStartYm) await this.settings.update({ ledgerStartYm: entry.ym }); }`. Add a backend spec in ledger.service.spec.ts asserting a first sales entry writes ledgerStartYm and a second one does not overwrite it.

**Refuter:** Confirmed. Nothing writes settings.ledgerStartYm: LedgerService.create (apps/backend/src/ledger/ledger.service.ts:40-52) only puts the entry, and apps/frontend/src/pages/admin/Settings.tsx has no field (its Draft type, fromSettings and the save payload omit the key). The only occurrences in the repo are spec fixtures and the DTO/entity declarations. With the setting absent, isLedgerMonth (packages/types/src/lib/reports.ts:333) returns true for every month, so caOfMonth for 2025 months returns { amount: 0, source: "ledger" } (ledgerCaOfMonth sums an empty list), delta() returns undefined because n1 is 0, and caOfPeriod reads the ledger for 2024 and 2025. Aperçu N−1 shows 0, Δ % is blank, and no "saisi" tag appears. One correction: Mix (reports.ts:509-514) reads yearActuals[Y-1].byPrestation before checking ledgerStartYm, so typed per-type figures do show; only an untyped type falls back to the ledger and shows 0 instead of blank.

The proposed backend change is correct but incomplete. Plan line 501 says the value is "set on the first sales entry, editable". The fix covers the first half only. In the deployment scenario at plan line 853 (2026 January to November typed from Falco, journal starting in December) a backdated first sales entry, for example an older unpaid invoice recorded to track its payment, pins ledgerStartYm to that earlier month and hides the typed months from it onward, with no way to correct it. The frontend cache is not a concern: api.ledger.create already invalidates "settings" (apps/frontend/src/lib/api.ts:209).

### [conformance-2] (medium) apps/frontend/src/pages/admin/Settings.tsx:1012

**Problem:** ledgerStartYm is not editable in Paramètres, so Dalia cannot move the boundary between typed prior-year months and ledger months (plan line 501: "editable").

**Evidence:** The Société section (line 1012) has name, VAT number, address and constitutedOn only; grep for ledgerStartYm in Settings.tsx returns nothing. The DTO already accepts it (packages/types/src/dto/settings.ts:103).

**Fix:** In the Société section add a `<input type="month">` labelled "Début du journal" bound to `draft.ledgerStartYm ?? ""` and included in the PATCH payload as `ledgerStartYm: value || undefined`, with the help text "Les mois avant cette date lisent les Années précédentes".

### [conformance-3] (medium) apps/frontend/src/pages/admin/EventEditor.tsx:127

**Problem:** "+" on a day with the client chip selected opens /events/new?date=&client= but the editor only copies the client's defaults; it does not prefill from that weekday's template (menu lines, guests, price, prestation, VAT, extra costs, notes, templateId).

**Evidence:** Plan line 808: "'+' on a day with the client chip selected opens /events/new?date=&client= prefilled from that weekday's template." EventEditor line 125-127 reads ?client and calls applyClientDefaults(c, types) only; grep for "template" in EventEditor.tsx matches only the `templates: []` of the inline client creation. The new event starts with an empty menu and no templateId, so the week banner keeps counting that day as missing.

**Fix:** After `applyClientDefaults(c, types)` at line 127 add: `const t = c.templates.find((x) => x.weekday === weekdayOf(date));` (date = the validated ?date param or today) and when found: `setName(`${c.name} · ${longDayLabel(date)}`); setGuestCount(t.guestCount); guestCountTouched.current = true; setSellingPricePerGuest(t.sellingPricePerGuest); setPrestationType(t.prestationType ?? c.defaultPrestationType ?? ""); setVatRate(t.vatRate ?? c.defaultVatRate); setRecipes(t.recipes.map((l) => ({ recipeId: l.recipeId, portions: l.portions, course: l.course, notes: l.notes }))); setExtraCosts(t.extraCosts); setNotes(t.notes ?? ""); setTemplateId(t.templateId);` with a new `templateId` state included in scalarPayload as `templateId: templateId || undefined`. Import weekdayOf and longDayLabel from @/lib/dates.

### [conformance-4] (medium) apps/backend/src/clients/clients.service.ts:103

**Problem:** instantiate skips a (templateId, date) only when an existing event carries that templateId, while the week banner treats any client event on the same weekday as present; "Créer la semaine" therefore creates a duplicate on a day Dalia already created by hand.

**Evidence:** clients.service.ts:103-104 builds `existing` from `events.filter((e) => e.clientId === clientId && e.templateId)`. Week.tsx:109-120 computes `missing` as templates with no event matching `e.templateId === t.templateId || weekdayOf(e.date) === t.weekday`, and createClientWeek (Week.tsx:177) sends all seven `dates`. With a manual Hoona event on Monday (no templateId) and Tuesday missing, the banner says "1 jour" but the call creates Monday and Tuesday. Plan line 808: "builds the set of (templateId, date) already present, skips those" and "Safe to tap twice".

**Fix:** In instantiate, also build `const datesTaken = new Set(events.filter((e) => e.clientId === clientId && !e.templateId).map((e) => e.date.slice(0, 10)))` and skip when `existing.has(key) || datesTaken.has(date)`, pushing the key to `skipped`. In Week.tsx createClientWeek send only the missing days: `dates: [...new Set(sheet.missing.map((t) => dates[t.weekday - 1]))]` (store `missing` in the sheet state alongside client and guestCount). Add a spec case in clients.service.spec.ts for the manual same-date event.

### [conformance-5] (medium) apps/frontend/src/pages/admin/PrepSheet.tsx:164

**Problem:** The prep sheet has no laptop layout: at 1280px and above it stays a single max-w-doc column with the status bar at the bottom instead of ingredients 320px left, steps right and the status bar as a sticky right card.

**Evidence:** Plan line 277: "Laptop ≥1280px: ingredients 320px left, steps right, status bar as a sticky right card." PrepSheet.tsx:162-164 renders `flex h-dvh flex-col` with one `mx-auto max-w-doc` column and a bottom bar at line 256; RecipeReader renders ingredients and steps as stacked sections with no layout prop.

**Fix:** Add a `layout?: "stack" | "split"` prop to RecipeReader; when "split", wrap the ingredients section and the steps section in `<div className="xl:grid xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-10">` with the ingredients section `xl:sticky xl:top-4 xl:self-start` and `extra` plus the cost toggle under the steps column. In PrepSheet pass `layout="split"`, widen the column to `max-w-doc xl:max-w-wide`, and at xl render the StatusControl plus Cuisiner block as `hidden xl:block xl:sticky xl:top-4` card in a third column (`xl:grid-cols-[320px_minmax(0,1fr)_240px]`) while keeping the bottom bar `xl:hidden`.

### [conformance-6] (low) apps/frontend/src/pages/admin/PrepSheet.tsx:162

**Problem:** No "Ingrédients ▾" pill appears on the phone once the user scrolls into the steps.

**Evidence:** Plan line 277: "an 'Ingrédients ▾' pill pinned under the top once the user scrolls into the steps." PrepSheet.tsx has no IntersectionObserver or scroll handler and no pinned element besides the bottom bar.

**Fix:** Add a ref on the RecipeReader ingredients heading (expose `ingredientsRef` via a prop or wrap the reader in a div and query `h2` text), an IntersectionObserver that sets `ingredientsOut` when it leaves the scroll container, and render `{ingredientsOut && <button className="fixed left-1/2 top-2 z-20 -translate-x-1/2 rounded-full bg-card px-4 min-h-11 shadow md:hidden" onClick={() => ref.current?.scrollIntoView({ behavior: "smooth" })}>Ingrédients ▾</button>}`.

### [conformance-7] (low) apps/frontend/src/components/ui/RecipeReader.tsx:30

**Problem:** The "Aa" large size renders steps and ingredients at Tailwind's default text-xl (20px / 1.75) instead of the plan's 22px.

**Evidence:** Plan line 96 and 275: `text-lead` 18px, "22px with the 'Aa' toggle". RecipeReader.tsx:30: `const textSize = size === "xl" ? "text-xl" : "text-lead";` and tailwind.config.ts defines no `xl` override, so the toggle moves 18px to 20px with a looser line height.

**Fix:** Add `"lead-xl": ["22px", "1.6"]` to `theme.extend.fontSize` in apps/frontend/tailwind.config.ts and change line 30 to `size === "xl" ? "text-lead-xl" : "text-lead"`.

### [conformance-8] (low) apps/backend/src/clients/clients.service.ts:169

**Problem:** Instantiating a week drops the template's notes: the created event has no notes even though "Créer depuis un événement" copied the event notes into the template.

**Evidence:** ClientTemplate has `notes?: string` (plan line 553) and EventDetail.templateCopy stores `notes: event.notes`; eventFromTemplate (clients.service.ts:148-177) maps recipes, extraCosts, price, prestation, VAT, contact and status but never `template.notes`.

**Fix:** In eventFromTemplate add `...(template.notes !== undefined && { notes: template.notes }),` next to `extraCosts: template.extraCosts` at line 169, and assert it in clients.service.spec.ts.

### [conformance-9] (low) apps/frontend/src/lib/ledger-export.ts:15

**Problem:** No jest test compares the generated month sheet header with the workbook's Janvier A2:N2; the frontend jest project has no test file at all.

**Evidence:** Plan line 870: "A jest snapshot compares the generated month header with Janvier A2:N2." `ls apps/frontend/src/lib/*.test.ts` finds nothing and grep for WORKBOOK_HEADER or monthSheetRows outside ledger-export.ts finds nothing, while jest.config.js already has a frontend project matching src/**/*.test.ts.

**Fix:** Add apps/frontend/src/lib/ledger-export.test.ts: `import { monthSheetRows, WORKBOOK_HEADER } from "./ledger-export"; test("month header matches Janvier A2:N2", () => { const rows = monthSheetRows("2026-01", [], { prestationTypes: undefined }); expect(rows[1]).toEqual(["NUMERO OPERATION","DATE FACTURE/OPERATION","INTITULE","Total tvac","RECETTE htva","TVA 6%","TVA 12%","TVA 21%","réglé","mode paiement","date encaissement","Type","Description","KM"]); expect(WORKBOOK_HEADER).toMatchSnapshot(); });` and run it with the root test script.

### [conformance-10] (low) apps/frontend/src/pages/admin/EventDetail.tsx:698

**Problem:** "Type de prestation manquant" is a warning (amber) tag, not the red tag the plan specifies.

**Evidence:** Plan line 310: "red tag 'Type de prestation manquant' when prestationType is absent." EventDetail.tsx:698: `<Tag variant="warning">Type de prestation manquant</Tag>`; Tag supports a "danger" variant.

**Fix:** Change line 698 to `<Tag variant="danger">Type de prestation manquant</Tag>`.

### [conformance-11] (low) apps/frontend/src/pages/admin/comptes/Resultats.tsx:372

**Problem:** The "Taux ISoc" setting is shown read-only with a link to Prévisionnel instead of being editable inline on the Compte de résultats page.

**Evidence:** Plan line 359: "Settings inline: 'Taux ISoc 25 %' with the help text from 7.6." Resultats.tsx:372 renders `<Section title={`Taux ISoc ${fmtPct(taxRate, 0)}`} ... action={<Link to="/comptes/previsionnel">Modifier dans le Prévisionnel</Link>}>` with only the help paragraph inside.

**Fix:** Inside that Section render a NumericInput bound to `round2(taxRate * 100)` and a checkbox for `objective?.smeReducedRate`; on change call `api.settings.update({ objectives: { ...settings.objectives, [String(year)]: { ...(objective ?? { annualRevenue: 0, monthsActive: 10 }), corporateTaxRate: v / 100, smeReducedRate } } })` then `reload()`. Keep the help text below.

## Fixer reports

### backend

All checks pass: `pnpm build:types` ok, `pnpm --filter @apps/backend type-check` ok, `pnpm --filter @apps/backend test` 70/70 (was 59), `pnpm --filter @packages/types test` 165/165, `cd apps/frontend && npx tsc -b` ok. Note: the branch moved to `main` mid-run and commits 57d3ef9 and c9ebcb9 picked up most of my edits; three files are still uncommitted (events.service.ts, ingredients.service.spec.ts, settings.service.spec.ts). I did not commit.

## Applied

- backend-1: `apps/backend/src/ingredients/ingredients.controller.ts` parses the body with `z.array(importIngredientRowSchema)` and 400s with the issues; the service now takes `ImportIngredientRow` from `@packages/types` and drops the `as Ingredient["unit"]` casts.
- backend-2: `apps/backend/src/settings/settings.service.ts` writes only the given keys through `ddb.update`; first creation uses a new `DdbService.putIfAbsent` (conditional put) in `apps/backend/src/shared/ddb.service.ts` and falls back to update on a race. Spec updated and a stale-draft case added.
- backend-5 and planning-7: `apps/backend/src/events/events.service.ts` `writeLines` takes the stored event and conditions on `updatedAt` (or `attribute_not_exists` for legacy rows); `addLine`, `patchLine`, `putLines`, `removeLine` run through `withFreshEvent`, which re-reads and retries once, then 409 `{ code: "LINES_CHANGED", missing: [] }`. The new stamp is strictly later than the old one so same-millisecond writes cannot share it. Three specs added (guard options, retry once, 409 after two moves).
- backend-6: DTO was already `.nullish()` (now in HEAD). Added `withoutNull` in `EventsService.create` so a null on create is not stored as a NULL attribute. Update path already REMOVEs.
- backend-7: `apps/backend/src/recipes/recipes.controller.ts` `mapJsonRow` parses `row.ingredients` with `z.array(importRecipeIngredientSchema)` and 400s `{ recipe, issues }`; service uses the `@packages/types` type and `ri.unit ?? "g"` with no cast.
- backend-8: `IngredientsService.update` compares `PRICE_TO_QTY_UNIT` families against the stored row and 409s `{ code: "UNIT_IN_USE", recipes }` via a shared `assertUnused` helper (also used by `delete`). Two specs added.
- backend-9: `withLineIds` early exit returns `{ ...event, recipes: lines }`. Spec added for an event stored without `recipes`.
- backend-10: `apps/backend/src/ledger/ledger.controller.ts` validates `year` with `/^\d{4}$/` and 400s otherwise.
- backend-11: DTO already `.nullable()` (in HEAD); `LedgerService.patch` forwards null, which `ddb.update` turns into REMOVE. No backend change needed.
- backend-12: `@HttpCode(200)` on merge, lock, unlock, instantiate, link-events.
- backend-13: `mergedFrom` built from `mergedRows`; the spec that asserted `"gone"` was recorded now asserts it is not.
- accounting-6: `LedgerService.assertOpen(ym)` reads `settings.monthCloses[ym].lockedAt`; called in `create` and in `replace` after the `stored.locked` check. Spec added (create and move into a locked month 409, allowed again after unlock).
- accounting-11: unlock note is appended: `"<previous> · Déverrouillé : <reason>"` or `"Déverrouillé : <reason>"`. Existing spec updated, one added.
- catalog-17: already done in `packages/types/src/dto/clients.ts` and `clients.service.ts` (in HEAD). No change.
- conformance-4: `instantiate` also skips a date where the client has a hand-made event (no `templateId`), pushing the key to `skipped`. Spec added.
- conformance-8: `eventFromTemplate` copies `template.notes`. Spec asserts it on Jeudi and its absence on Mardi.

## Skipped

- conformance-7: frontend only (`RecipeReader.tsx`, `tailwind.config.ts`), outside my area.

## Belongs to other areas

- /tmp/smoke/run.mjs: status assertions must change from 201 to 200 at lines 130 (merge), 254, 260, 265 (instantiate), 269 (link-events), 309 (lock), 324 (unlock).
- backend-2: `apps/frontend/src/pages/admin/Settings.tsx` should send only the sections the user edited; the backend now preserves untouched keys regardless.
- backend-6: `apps/frontend/src/pages/admin/EventEditor.tsx` `scalarPayload` should send `clientId: clientId || null` and `prestationType: prestationType || null` on an existing event.
- backend-11: the Réglé popover should send `paidAt: null` and `paymentMethod: null` when paid is switched off.
- backend-8: the ingredient edit UI should map 409 `UNIT_IN_USE` to a message listing `recipes`.
- conformance-4: `apps/frontend/src/pages/admin/Week.tsx` `createClientWeek` should send only the missing days.
- accounting-6: Journal should disable "Nouvelle ligne" on a locked month; the 409 is already mapped to "Mois verrouillé".
- conformance-7: add `"lead-xl": ["22px", "1.6"]` to `apps/frontend/tailwind.config.ts` and use `text-lead-xl` in `apps/frontend/src/components/ui/RecipeReader.tsx:30`.
- Plan table (docs/redesign/REDESIGN.md line 670 area) now matches: merge, lock, unlock, instantiate and link-events return 200.

### planning-events

Verification is complete: `npx tsc -b` exits 0, `npx vite build` succeeds, and the type-scale lint fails only on the dead `Dashboard.tsx`.

## Applied

- planning-1: removed `status` from state, `scalarPayload`, the autosave deps, the `EventStatus` import and the Statut select in `/Users/antoineboxho/Developer/Personal/02_projects/recipe-book/apps/frontend/src/pages/admin/EventEditor.tsx`. Status is now written only by EventDetail.
- planning-2: added `createdIdRef`; the load effect skips `api.events.get` when `id === createdIdRef.current`. I did not use `id !== currentId` as suggested because `currentId` is initialised to `id` on a direct open of `/events/:id/edit`, which would have skipped the initial fetch.
- planning-3: `pendingRef` set when a save is in flight; `finally` re-arms `autoSaveRef.current()` once.
- planning-4: `Math.max(1, Math.round(v))` on convives, line portions and `addRecipe`.
- planning-5: `error` state in `RecipeCook.tsx`; "Recette introuvable." screen with a Quitter button; loading branch only for `loading`.
- planning-6: `dayMonthShortLabel` ("Mar 13 oct") added to `/Users/antoineboxho/Developer/Personal/02_projects/recipe-book/apps/frontend/src/lib/dates.ts` (my area) instead of packages/types; used in Events.tsx, EventDetail.tsx (both uses) and PrepSheet.tsx.
- planning-8: `autoSave` returns `Promise<string | null>`; `handleDone` navigates to `/events/${savedId}`.
- planning-9: `useState(todayIso())`.
- planning-10: "Non définie" sends `rec?.defaultCourse || "Autre"`; the select shows `rl.course ?? rec?.defaultCourse` and the "Non définie" option only when no value resolves.
- planning-11: both empty states gated on `!error` in `Day.tsx`.
- planning-12: notice reads `Fait : {notice.name}`.
- planning-13: RecipeCook "Marquer fait" navigates to `/jour/${date}?done=${lineId}` and the toast is dropped.
- planning-14: swipe ignored when the touch starts in `textarea, input, select` or a text selection exists, in PrepSheet.tsx and RecipeCook.tsx.
- planning-16: `weekTotals = weekPlan(weekEvents, monday)` feeds the three MoneyTiles in `Week.tsx`; `plan` stays filtered for the columns.
- conformance-3: `?client=` with a template for that weekday prefills name (`${c.name} · ${longDayLabel(date)}`), guests, price, prestation, VAT, recipes, extra costs, notes and `templateId`; `templateId` is a new state included in `scalarPayload` and loaded from the event.
- conformance-10: Tag variant `danger` for "Type de prestation manquant".
- conformance-5 / planning-15, partial: PrepSheet at `xl` is a grid `minmax(0,44rem)_280px` inside `max-w-wide`, with the StatusControl plus Cuisiner as a sticky `card-elevated` on the right and the bottom bar `xl:hidden`. 280px instead of 240px because the three-segment StatusControl does not fit in 240px at text-base. The ingredients/steps split column is not done (see below).
- conformance-6: IntersectionObserver on the first `section` of the reader (root = scroll container); an "Ingrédients ▾" pill (`fixed top-2`, `md:hidden`, min-h-11) scrolls back to it.

## Skipped

None.

## Belongs to another area

- planning-6: the finding asked for `dayMonthShortLabel` in `packages/types/src/lib/dates.ts` plus its index export. I implemented it in the frontend `lib/dates.ts` only. If the types package should own it, move the function there and re-export; the signature is `dayMonthShortLabel(date: string): string`.
- planning-15 / conformance-5: the ingredients-left, steps-right split needs a `layout?: "stack" | "split"` prop in `apps/frontend/src/components/ui/RecipeReader.tsx` (wrap the two sections in `xl:grid xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-10`, ingredients section `xl:sticky xl:top-4 xl:self-start`). PrepSheet is ready to pass `layout="split"` once that exists; the wrapper div with `ref={readerRef}` around `<RecipeReader>` is where the prop goes.

### accounting

Verification passed: `npx tsc -b` clean, `npx vite build` succeeded, the layout repro prints thermomixRow 152, acomptesRow 169 and "thermomix month rows with C or E filled: 0", and `lint:type-scale` fails only on the pre-existing Dashboard.tsx lines.

## Applied

- accounting-1: `/Users/antoineboxho/Developer/Personal/02_projects/recipe-book/apps/frontend/src/lib/use-report-inputs.ts` now loads ledger years N, N-1, N-2 and flattens them; `yearStr` dropped. `/Users/antoineboxho/Developer/Personal/02_projects/recipe-book/apps/frontend/src/pages/admin/comptes/Apercu.tsx:176` keeps the "À encaisser" tile year-scoped with `e.ym.startsWith(yearPrefix)`. Side effect to be aware of: Journal's `refOptions` (credit note "Facture corrigée" list) now also offers prior-year invoices, which covers a January credit note on a December invoice; I left it.
- accounting-2: `/Users/antoineboxho/Developer/Personal/02_projects/recipe-book/apps/frontend/src/lib/ledger-export.ts` removes `THERMOMIX_OFFSET`; `yearSheetLayout(caCount, typeRows)` places THERMOMIX at `totalRow + 1 + typeRows + 2`; `buildLedgerWorkbook` builds the type block once and passes its length.
- accounting-3: `/Users/antoineboxho/Developer/Personal/02_projects/recipe-book/apps/frontend/src/components/comptes/LedgerEntryForm.tsx` adds `createNext` state and `target`; save, remove, title, "Créée le" and the Supprimer block use `target`, and `setCreateNext(true)` runs after the keepOpen reset. `locked` and `bookFixed` still read `entry`.
- accounting-4: `/Users/antoineboxho/Developer/Personal/02_projects/recipe-book/apps/frontend/src/pages/admin/comptes/Previsionnel.tsx` splits the effect: a `[year]` effect always loads that year's objective and clears `objectiveDirty`; `[settings]` effects reload objective and charges only when not dirty; both save handlers clear their dirty flag before `reload()`. I used a year-keyed effect instead of the separate `useEffect(() => setObjectiveDirty(false), [year])` suggested, because that one would run in the same commit as the guarded effect and the guard would still see the stale dirty flag.
- accounting-7: Mix row link in Apercu.tsx now carries `ym=${report.focusYm}`.
- accounting-8: `onKind` calls `onRate(0)` for commissions; `validate()` rejects a commission with non-zero TVA.
- accounting-9: `/Users/antoineboxho/Developer/Personal/02_projects/recipe-book/apps/frontend/src/pages/admin/comptes/Journal.tsx` rail tiles use `sumMoney`.
- accounting-10: `saveObjective` re-reads `api.settings.get()` before writing `objectives`.
- accounting-12: CSV TOTAL and "Total CA" rows use CA lines only; a "Commissions (hors CA)" line follows.
- conformance-11: `/Users/antoineboxho/Developer/Personal/02_projects/recipe-book/apps/frontend/src/pages/admin/comptes/Resultats.tsx` renders a NumericInput (percent) and a "Taux réduit PME" checkbox inside the Taux ISoc section; `saveTax` merges into the fresh objectives record then reloads. The link to Prévisionnel stays, relabelled "Objectif dans le Prévisionnel".

## Skipped

- conformance-9: the frontend jest project is not run by the root `test` script, maps `@packages/*` to `dist`, and ledger-export.ts imports `@/lib/accounting` which pulls `@/lib/api` (`import.meta.env`) through ts-jest CJS. Adding the test needs tooling changes outside this area; the esbuild repro at `/tmp/ledger-repro/entry.ts` covers the layout check for now.

## Belongs to another area

- conformance-1 and accounting-5: backend `apps/backend/src/ledger/ledger.service.ts` (set `ledgerStartYm` on first sales entry, spec), `packages/types/src/lib/reports.ts` (`isLedgerMonth` default to typed data when `yearActuals` exists), and `apps/frontend/src/pages/admin/Settings.tsx` (editable "Début du journal" field, validation, payload). Not edited.
- backend-3, backend-4, backend-14: `apps/backend/src/ledger/ledger.service.ts` and spec, plus `packages/types/src/entities/settings.ts` and `packages/types/src/dto/settings.ts` for `unlockReason`. Not edited.
- Follow-up from accounting-1: `apps/frontend/src/pages/admin/EventDetail.tsx:164` loads only the event's year, so a January invoice for a December event does not show on the event page.

### catalog

Applied (all in the working tree, tsc exit 0, vite build OK, lint:type-scale fails only on Dashboard.tsx as before):

- catalog-1: already in working tree (loadError state, catch sets error, split render guard). No change needed.
- catalog-2: already in working tree (listId dep, dirtyRef set in patchItem/removeItem/addItemFromIngredient/title onChange, reset in autoSave/createAndSave). No change needed.
- catalog-3: already in working tree (`if (patch.portions !== undefined) setPortions(updated.portions)`). No change needed.
- catalog-4: already in working tree (`existing={ingredients}` and `onUseExisting` on RecipeDetail modal). No change needed.
- catalog-5: already in working tree (`creatingIngredient: { name, row }`, `assignToRow`, `existing`, `onUseExisting`). No change needed.
- catalog-6: already in working tree (`existing={allIngredients}` and `onUseExisting` on GroceryListPage modal). No change needed.
- catalog-7: applied in /Users/antoineboxho/Developer/Personal/02_projects/recipe-book/apps/frontend/src/pages/admin/Settings.tsx. `Draft.objectives` is now `Record<string, Partial<YearObjective>>`, `cleanObjective` takes `Partial<YearObjective>`, `emptyObjective` removed (default `{}`), CA annuel / Mois actifs / % matières premières / Taux ISoc / Mois de trésorerie / Épargne mensuelle show the default as a placeholder and store `undefined` when cleared.
- catalog-8: already in working tree (ApiError 409 branch with recipe names). No change needed.
- catalog-9: already in working tree (setSupplierNames from settings.suppliers in RecipeDetail). No change needed.
- catalog-10: already in working tree (same in RecipeEditor). No change needed.
- catalog-12: already in working tree (`?mode=edit` after duplicate). No change needed.
- catalog-13: already in working tree (groceryLists refetch after merge). No change needed.
- catalog-14: already in working tree (shared SupplierTag imported, local one removed, supplierColor import gone). No change needed.
- catalog-15: already in working tree (empty name restores client name instead of sending ""). No change needed.
- catalog-16: already in working tree (round2 on sellingPricePerGuest, extra cost amount, defaultPricePerGuest). No change needed.
- catalog-18: applied in Settings.tsx. `checkCourseRename` replaced by `queueCourseRename` (onBlur pushes `{ from, to }` into `pendingRenames`, deduped by `from`, chained renames collapse A→B then B→C into A→C). `handleSave` fetches events once after a successful PATCH, fills `renameQueue` and calls `offerNextRename`, which opens the dialog for the first pair with affected lines. `applyRename` updates the local event copies and offers the next pair; "Non" and the backdrop skip to the next pair. Deviation from the finding: `pendingRenames` is kept when the save fails, since the renames only run after a successful save and the user will usually retry. There is no discard action on the page, so nothing clears them on discard.
- catalog-19: already in working tree (`navigate("/")`). No change needed.
- conformance-2: applied in Settings.tsx. `Draft.ledgerStartYm`, read in `fromSettings`, sent as `ledgerStartYm: draft.ledgerStartYm || undefined` in the PATCH, and a `<input type="month" id="co-ledger-start">` "Début du journal" in the Société section with the help text "Les mois avant cette date lisent les Années précédentes." Note: clearing the field sends no key, so the stored value is kept rather than removed.

Skipped:

- catalog-11: needs `"lead-lg": ["22px", "1.6"]` added to `theme.extend.fontSize` in /Users/antoineboxho/Developer/Personal/02_projects/recipe-book/apps/frontend/tailwind.config.ts, which is outside my area. I did not change RecipeReader.tsx line 30, because `text-lead-lg` without the token would render no size at all (worse than text-xl). Once the token exists, change /Users/antoineboxho/Developer/Personal/02_projects/recipe-book/apps/frontend/src/components/ui/RecipeReader.tsx line 30 to `const textSize = size === "xl" ? "text-lead-lg" : "text-lead";`. PrepSheet.tsx (pages/admin, not mine) does not size "xl" itself; it passes `size` to RecipeReader, so no change needed there.

Belongs to another area:

- tailwind.config.ts token for catalog-11 (above).
