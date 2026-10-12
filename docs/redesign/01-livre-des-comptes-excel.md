# Livre des comptes: what the 2026 workbook contains

Source: `2026 LIVRE DE RECETTES TABLE D'AMELIE.xlsx` at the repo root (untracked). "Livre de recettes" here means revenue book, not recipe book. 20 sheets. Read with the `xlsx` package, formulas included. Amounts below are the caterer's own figures and stay private to this repo.

Company header (sheet "recettes 2025"): Table d'Amélie SRL, Drogenberg 55 A, 3090 Overijse, TVA BE0766.607.232, constituted 12/04/2021. The business is a company (SRL), not a sole trader. The forecast sheets model corporate tax at 15 to 25 % and the owner's salary as a fixed charge.

## Sheet by sheet

### "recettes 2025" and the twelve monthly sheets ("Janvier" to "Décembre"): revenue journal

Same column layout everywhere:

| Col | Header | Meaning |
|---|---|---|
| A | NUMERO OPERATION | invoice or operation number |
| B | DATE FACTURE/OPERATION | invoice date |
| C | INTITULE | label (client or event name) |
| D | Total tvac | amount including VAT |
| E | RECETTE htva | amount excluding VAT (note on the sheet: "tvac/1,06 ou 1,12 ou 1,21") |
| F, G, H | TVA 6 %, TVA 12 %, TVA 21 % | VAT amount per rate, one column filled per line |
| I | réglé | paid yes/no |
| J | mode paiement | payment method (virement, ...) |
| K | date encaissement | date the money arrived |
| L | Type | prestation type (see taxonomy below) |
| M | Description | free text |
| N | KM | kilometres driven for the job |

Each month sheet has a TOTAL row (SUM of D to H), a "Total CA mm/yyyy" label, and a per-type breakdown built with `SUMIF(L:L, type, E:E)` over seven prestation types. The 2026 month sheets are empty templates; some carry stale "Total CA" labels from 2023 and 2024, which shows the file is copied year to year by hand.

The annual sheet adds three sections below the journal:
- THERMOMIX commissions per month, no VAT (the caterer resells Thermomix).
- ACOMPTES (deposits): client, amount, payment date, event date, with a total.
- COMPARAISON year over year: HTVA revenue for two periods of the year (1 January to 30 April, 30 April to 30 June) for 2023 and 2024, with totals.

### "Apercu par mois": monthly overview and revenue mix

- Table: month, CA htva 2025, CA htva 2026, % augmentation, Objectif de CA HTVA, Prévision (from "Au réel"), Atteint?. Annual totals and a "Total 2024" reference.
- Objective box: breakeven (seuil de rentabilité) annual and monthly, objective annual and monthly. The monthly objective is annual ÷ 10 ("objectif sur 10 mois", two months off).
- Revenue mix by prestation type: 2024 amount and %, 2025 collected (sum of the monthly SUMIFs) and %, 2025 objective and %. A note says "(CA hors kombucha)" and "REFAIRE LES FORMULES DU GRAPHIQUE", so a chart existed and broke.
- "Objectif par prestation": target revenue per type and the number of events or sales needed to reach it (for example about 10 walking dinners of 50 to 55 guests, about 40 to 45 take-away menus per week, about 12 served buffets of 40 guests).

### "Analyse marge": monthly income statement

Columns: month, CA htva (from Falco, the invoicing tool), Coûts MP (raw material cost), Marge brute d'exploitation (CA minus MP), charges fixes (owner salary included), Rémunération personnel extra (linked to sheet "personnel"), Bénéfice avant impôts, Marge en %, Impôts, Marge nette. Totals row, ratios (MP as % of CA, gross margin %), and a SIMULATION row: CA 160 000, MP at 38 %, fixed charges 4 500 × 12, extras 1 800 × 10 ("20 heures par semaine à 20 euros, 10 mois"), profit before tax and margin %.

### "personnel": extra staff cost per month

Empty template, one row per month plus a total. Feeds "Analyse marge" column F.

### "factures": extra staff hours

"Factures Kristoff": one row per worked date with hours, a total of hours, an hourly rate (30 €) and the invoice amount (hours × rate). Used to check an extra's invoice.

### "Prévisionnel financier" and "Simulation si seule": budget and breakeven

- Objective: annual revenue HT and monthly (÷ 10).
- Breakeven = annual fixed charges + 12 × monthly treasury target + annual investment envelope.
- Fixed charge list, one monthly amount per line, with a second column for the "sans salarié" scenario: social contributions (UCM), accountant, BNB deposit, civil liability insurance, fire insurance, SD Worx admin and ONSS, owner contribution, Xerius, Allianz accident insurance, bank account, employee salary, owner salary, AFSCA, pension (to set up), Cohezio, internet, extinguisher maintenance, mobile, web hosting, office supplies, Canva, Mailchimp, Notion, Falco, car costs, repayment of owner investment, gas, electricity, water. Several lines are annual amounts divided by 12 in the formula.
- Derived: total monthly and annual charges, net profit (objective minus breakeven), net margin %, corporate tax estimate (15 %), treasury need (3 months of charges), investment envelope split in three lines.
- Help text: "Seules les cases en rouge sont à remplir" and a two-step guide. The file is a template from a coaching programme adapted by the caterer.

### "Au réel 2025": signed revenue versus target, per month

One block per month: rows "J'ai déjà signé..." with client or event name, prestation type, CA HTVA, hours spent, observations. Then: total signed revenue and hours, "Je vise X CA par mois", "J'ai X temps disponible", "Il me reste donc X euros de CA à faire", "Avec X temps disponible". A year total and the gap to the 160 k objective. Several rows are recurring business clients with a weekly or monthly menu (lunch for an office, "menu de la semaine", a monthly "facture comptoir" for counter sales), which is the same pattern as the "Hoona" request.

## Taxonomies and facts to reuse

- Prestation types (7, used for revenue mix and objectives): menu à emporter, buffet à emporter, buffet avec service, atelier, brunch, walking/cocktail, chef à domicile. This is a third taxonomy, distinct from recipe categories (Buffet, Walking dinner, Lunch, Menu semaine) and from courses (apéritif, entrée, plat, dessert). It belongs on the event, and the recipe category list in settings should probably be renamed or merged into it.
- VAT rates: 6, 12, 21 %. Commissions carry no VAT. The app's recipe pricing already uses 12 % sur place and 6 % take away.
- Payment tracking per line: paid flag, method, date received, deposits (acomptes) ahead of the event.
- Revenue not tied to an event: counter sales invoiced monthly, Thermomix commissions, gift vouchers.
- Hours: time spent per event, time available per month, extras' hours × hourly rate.
- Costs: raw materials (MP) per month, fixed charges list, extra staff, corporate tax.
- Objectives: annual revenue target, per prestation type target with event counts, per month target, breakeven, treasury target, investment envelope.

## What the app already has, and the gaps

Already there:
- Event revenue HTVA = sellingPricePerGuest × guestCount; calculated raw material cost from recipes, optional actual cost, extra costs, status upcoming/completed (apps/frontend/src/pages/admin/EventDetail.tsx, EventEditor.tsx).
- Dashboard with monthly revenue and margin chart per year, KPIs, and a tax toggle (apps/frontend/src/pages/admin/Dashboard.tsx).

Gaps:
- The Dashboard tax estimate (`estimateBelgianTax`) models a sole trader (social contributions 20.5 %, personal income tax brackets). The company is an SRL; the workbook models corporate tax 15 to 25 % with the owner's salary as a fixed charge. The model must change.
- No journal entries: invoice number, TVAC, VAT split, paid flag, payment method, date received, KM.
- No prestation type on events, so no revenue mix.
- No fixed charges, no objectives, no breakeven, no treasury target.
- No revenue outside events (comptoir, commissions, vouchers) and no deposits.
- No hours on events, no extra staff costs.
- No year-over-year comparison and no "signed versus target" view.

## Structures the app needs (starting point for the design)

```ts
// New
LedgerEntry {
  entryId; date; number?; label; kind: "event" | "comptoir" | "commission" | "voucher" | "other";
  eventId?; clientId?; prestationType?;
  totalTvac; htva; vat: { rate: 0 | 6 | 12 | 21; amount }[];
  paid: boolean; paymentMethod?; paidAt?; description?; km?;
}
Deposit { depositId; clientId?; eventId?; amount; paidAt; eventDate? }
FixedCharge { chargeId; label; monthlyAmount; scenario?: "with-staff" | "solo" | "both"; category?; active }
Objective { year; annualRevenue; monthsActive; byPrestation: { type; amount; eventsNeeded?; guestsPerEvent? }[]; hoursAvailablePerMonth?; treasuryMonths; investments: { label; amount }[] }
ExtraShift { shiftId; personName; date; hours; hourlyRate; eventId? }

// Event additions (all optional on read)
prestationType?; vatRate?; hoursPlanned?; hoursSpent?; invoiceNumber?; paid?; paidAt?
```

Reports to render from these: journal des recettes (month), aperçu par mois (this year vs last year vs objective), mix par prestation, compte de résultats (CA, MP, marge brute, charges fixes, extras, résultat avant impôts, impôts, résultat net), prévisionnel (breakeven, treasury, investments), au réel (signed vs target vs hours), and exports (xlsx/CSV) for the accountant.
