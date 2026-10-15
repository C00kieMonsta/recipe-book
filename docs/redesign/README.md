# Redesign, October 2026

Plan for the rethink of the app after the caterer's feedback (planning view, readability, duplicate ingredients, event ordering, recurring clients) and the request to replace the accounting workbook.

| File | What it is |
|---|---|
| `REDESIGN.md` | The plan. Twelve sections: summary, feedback-to-decision map, information architecture, design system, screens, data model, feature designs, roadmap in six slices, open questions for the caterer and her accountant, risks, deferred simplifications, critique log. |
| `00-brief.md` | Inputs: the caterer's feedback (French), the four requests, the working interpretation, the current app and its weaknesses, constraints. |
| `01-livre-des-comptes-excel.md` | Structure of `2026 LIVRE DE RECETTES TABLE D'AMELIE.xlsx` (repo root, untracked): sheets, columns, formulas, taxonomies, and the gaps versus the app. |
| `workings/audits.md` | Four audits of the current app: readability, data model, user journey, finance. |
| `workings/proposal-*.md` | Five independent redesign proposals (planning-first, readability-first, model-first, finance-first, pragmatic roadmap). |
| `workings/judgments.md` | Four judges (caterer, engineer, product designer, accountant) ranking the proposals. Winner: planning-first. |
| `workings/02-synthesis-draft.md` | The first unified plan, before critique. |
| `workings/critique.md` | 134 findings from six critics (engineer, accountant, caterer, completeness, simplifier, hands-on verifier); the 16 high-severity ones were each checked by a refuter (14 confirmed, 2 refuted). |
| `workings/editor-decisions.md` | How the critique was applied to produce `REDESIGN.md`. |
| `02-planning-iteration.md` | Second pass on the planning flow: Sunday checklist, people assignment, scaled quantities, mise en place, À facturer. |
| `03-notion-ui.md` | The Notion-like design system: ten rules, tokens, primitives, every screen, acceptance. |
| `04-first-run-and-tour.md` | The guided tour (Visite guidée) and the first-run help: entry points, ten steps since 07 (« Offres et devis » was added), component API, persistence, accessibility, acceptance. |
| `05-week-tasks-print.md` | Dalia's second feedback: client from the event, menu categories with Mignardises, the week box reworded, tasks without a recipe and preparations moved to another day, a printable week. |
| `06-week-day-transition.md` | The day is the week with one column open: one shared header and row of day heads on the week and the day page, from the owner's production screenshots. |
| `07-offers-pricing-attachments.md` | Dalia's third feedback (thirteen points): invoices in Odoo (`invoicing: externe`, CA mensuel, Odoo CSV import), standard offers (`/offres`) and the Devis page, recipe creation from any menu search, the supplier price sheet and dated prices, price per guest or total food plus « Service, livraison, autres » lines, attachments on events, one « Catégories » list replacing Format, the recipe add row without the blue check, delivery and billing rows, bold and highlight in steps, touch long-press move. Implemented on main. |
| `08-assistant.md` | The Assistant: a chat sheet on every page that proposes recipes, event changes and price estimates, applied only on click. Key in SSM, Responses API with tools, no new table. |
| `09-offer-catalogue.md` | The offer catalogue: Dalia's brochures as editable block documents, costed formulas linked to the offers, branded PDFs, her seven 2026 sheets as the starting content. |
| `10-invoice-inbox.md` | Dépôt de factures: drop PDFs or photos, the document model reads them, a review table proposes the Journal entries, one click adds them with the file attached. |
| `11-team-margin-reminders.md` | Dalia's fourth feedback (nine points): rates and payment mode per person, « En cuisine » and « Sur place » teams with hours and km per person and a Comptabilité › Équipe table, revenue line kinds, the margin on food only, Zakouskis and Mignardises merged into Apéritif and Dessert (read-time alias plus a dry-run script), the tablet drag (sticky drop targets, columns in landscape), and reminders that work without people, without the ledger table and in Odoo mode (`invoicedAt`). |
| `workings/offers-source-2026.md` | Dalia's seven offer sheets (2025 to 2026) transcribed as the source for the offer catalogue. |
| `workings/implementation-review.md` | Review of the first implementation against the plan. |
| `workings/qa-review-2026-10-14.md` | Full code review and QA (seven reviewers, two QA runs, adversarial verification): what was confirmed, fixed and deferred. |
| `workings/first-run-review.md` | Five first-time personas walking the running app, the judge's sixteen fixes, what the tour explains, what is deferred. |

The plan, the planning iteration, the Notion UI, the first-run pass, the week tasks and print (05), the week and day transition (06) and the offers pass (07) are implemented on main (October 2026). Where 07 and an earlier file disagree, 07 wins; the earlier files carry a note at the superseded line. Section 9 of `REDESIGN.md` (questions for the caterer and the accountant) and the deferred list in `workings/first-run-review.md` are the open items.

The workbook at the repo root contains client names and revenue figures. Keep it out of git unless that is intended.
