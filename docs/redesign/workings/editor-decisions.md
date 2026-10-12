# Editor decisions log

Document written to `/Users/antoineboxho/Developer/Personal/02_projects/recipe-book/docs/redesign/REDESIGN.md` (12 sections, about 22 000 words, no em-dashes; the full per-finding table is in its section 12).

**Decisions log**

Conflicts decided by opening the code:
- simplifier-1 vs simplifier-2 item (2) (cut the migration runner vs keep migration 001): applied simplifier-1. `events.service.ts:17-26` makes a read-time `withLineIds` backfill that persists ids a ten-line change; every API response then carries `lineId`s, which answers simplifier-2's objection that PATCH cannot address old lines, with no `tsx` dependency and no deploy-ordering constraint. 002 and 003 cut; engineer-15/16 skipped as moot.
- simplifier-4 vs engineer-2/3 (`expectedUpdatedAt`): deferred `expectedUpdatedAt`, the DdbService condition and the 409 filter (simplifier-2, confirmed high, already defers them). Kept engineer-2's server-side merge-by-`lineId` on `PATCH /admin/events/:id` and the `EventDetail` portions change. engineer-3 skipped; its three details are recorded in section 11.
- completeness-2 vs simplifier-24 (week money strip): objective planning fields (`annualRevenue`, `monthsActive`, `monthlyOverrides`) move to slice 2 and the strip is one list everywhere (Signé cette semaine, Signé ce mois with bar, Préparation); slice 4 adds only the ledger "Facturé" tick on the month bar (one filtered scan); À encaisser and Marge brute move to Aperçu.
- dalia-1 fit estimate vs completeness-10/dalia-2: dalia-1's "under 548px" arithmetic is wrong (3×72 + 15×36 = 756); used "about 760px, the busiest column scrolls, toggle defaults to Événements under 800px tall".
- verifier-1 vs simplifier-17: `check-contrast.mjs` kept in slice 1 (confirmed high); `check-type-scale.sh` replaced by a `lint:type-scale` package script.
- verifier-4 vs simplifier-10 and engineer-8: fuzzy tiers kept, nothing fuzzy preselected, both keys ≥ 5; engineer-8's same-first-three-letters rule skipped (blocks oignon/ognon).
- accountant-4 vs simplifier-11/13: month lock and MP source tags kept (confirmed high); the lighter "Exporté le" marker is the fallback in section 11.
- simplifier-15 vs dalia-8: grid, `templateIds`, favourites and the from-event endpoint cut; `guestCount` on instantiate kept with the "Convives" sheet and "Ajuster les portions aux convives".
- simplifier-7 vs simplifier-2/dalia-9: `day-pdf.ts` and "PDF du jour" out of slices 1 to 4, `exportRecipesPdf` kept as the paper fallback; a day/week PDF with Web Share is in section 11 pending Q8.
- accountant-6: chose one VAT rate per entry (`vatRate`, `vatAmount`), matching the workbook, over base-per-rate arrays.
- accountant-2 adapted: precedence keyed on `settings.ledgerStartYm` per month rather than "any ledger entry in year Y", because 2026 will have only December in the ledger.
- completeness-7 applied in part: dates and risk fixed, 002 dropped; the 2026 month-sheet import skipped because the sheets are empty (dalia-10 refutation); 2026 Jan to Nov totals are typed into `yearActuals` instead.

Applied in full: engineer-1, 4 (via verifier-8), 5, 6, 7, 9, 10, 11, 12, 14, 17, 18, 19, 20, 21, 22; accountant-1, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25; dalia-2, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20; completeness-1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28; simplifier-5, 6, 8, 9, 12, 14, 16, 18, 19, 20, 21, 22; verifier-2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14.

Applied in part: engineer-23 (effort restated as 47 to 58 days after the cuts, flagged as estimates); accountant-20 (date rule stated; equal-split fallback moot without pro-rata); completeness-14 (counts re-measured: 60 `uppercase` occurrences on 57 lines, 31 with tracking-wider; `Dashboard.tsx:106-108`, not 105-107); engineer-13 (banner deferred with the `menuUpdatedAt` rule recorded).

Skipped: engineer-3, 15, 16 (superseded by the runner and concurrency deferrals); simplifier-3 (two tables kept: one-table-per-entity pattern, type filter in every reader, one to two hours per provisioning; recorded in section 11); simplifier-10, 11, 13 (conflict with confirmed highs, recorded in section 11).

Not applied, refuted: dalia-10 (residual wording about the empty 2026 month sheets added to slice 4 and 7.6), simplifier-23 (slice order unchanged).

Line references corrected while checking: `AdminLayout.tsx:15` for `pt-[68px] md:p-8` (dalia-1 cited line 14, which is `<AdminSidebar />`).