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

Nothing in the plan is implemented. Start with section 9 of `REDESIGN.md` (questions for the caterer and the accountant), then slice 1 of section 8.

The workbook at the repo root contains client names and revenue figures. Keep it out of git unless that is intended.
