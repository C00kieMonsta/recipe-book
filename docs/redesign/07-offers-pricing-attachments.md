# 07. Offers and quotes, pricing modes, attachments, categories merged, invoices in Odoo

Status: ready to build. Builds on `03-notion-ui.md` (the ten rules), `05-week-tasks-print.md` (tasks, moved lines, client dialog, print) and `06-week-day-transition.md` (shared header, DayHeads, DayStrip). Where this file and an earlier spec disagree, this file wins.

Inputs: Dalia's third feedback (thirteen points, 14 October 2026), three designs (caterer-first, data-model-first, Notion fidelity) and two judges (Dalia's reading, engineer). The synthesis takes: the caterer-first copy, the supplier price table, the separate Devis page, the delivery and billing rows and the nullable-on-update rule; the data-model design's `ca_mensuel` ledger kind, the Au réel rule, the offers behind their own endpoint, `settings.courses` kept as the stored key and read-time `category`; the Notion design's `NewRecipeDialog` everywhere, « Sans ingrédients » tag, long-press drag with the DayStrip as a drop target, `priceUpdatedAt`, `toggleWrap`, `offerId` and the archived flag.

Two bugs diagnosed separately (legacy ingredient price as text, unit outside the enum) are being fixed in `apps/backend/src/ingredients/ingredients.service.ts` (`normalizeStored`), `packages/types/src/lib/costing.ts` (finite guards) and the editor (`|| "g"` fallback). This spec assumes that fix is in and never re-specifies it.

No new DynamoDB table. Offers live in the existing settings table as a second item (`settingsId = "offers"`). Attachments live in the existing S3 bucket. Everything else is additive on the `events`, `recipes`, `ingredients`, `settings` and `ledger` items.

Paths are absolute from the repo root `/Users/antoineboxho/Developer/Personal/02_projects/recipe-book/` unless they start with `docs/`.

---

## 1. Goal and Dalia's thirteen points

| n | Dalia (verbatim) | What she gets |
|---|---|---|
| 1 | « retirer facture (d'office sur odoo) » | Paramètres › Société gets « Factures : Dans l'application / Dans un autre outil (Odoo) ». In the second mode the app never proposes to create an invoice or a deposit: the event page buttons, the « À facturer » lists and the week box rows disappear; the tab becomes « À terminer ». The revenue book stays usable: Journal › ⋯ « Saisir le CA du mois… » (one line per month and VAT rate) and « Importer des factures (CSV)… » (an Odoo export, previewed before import). Aperçu, Compte de résultats, Prévisionnel and Au réel keep reading the ledger. Nothing is deleted; her install is switched to « autre outil » at deploy. |
| 2 | « intégrer mes offres types » | A new « Offres » page: « Buffet 1 », « Walking dinner 2 », each with a prestation type, recipes with portions per guest, a price per guest or a total food price, optional service lines, costs and notes. Live cost per guest, price and margin on every offer. « Enregistrer comme offre type » on any event. |
| 3 | « quand j'ajoute une recette dans un événement, ce serait pratique de pouvoir créer directement la recette si elle n'existe pas » | Typing a name with no match in the recipe search shows « + Créer « Houmous maison » ». A small dialog (name, category, portions) creates the recipe and adds it to the menu in one go. The line carries a grey « Sans ingrédients » tag until the recipe is completed. Works on the event page, the event editor, the client template, the offer page and the devis. |
| 4 | « possible de faire une mise à jour des prix des ingrédients? (vds, barn, delhaize) » | Ingrédients › ⋯ « Mettre à jour les prix… » opens a price sheet for one supplier: one column of current prices, one column to type the new ones, Enter moves down, the gap in %, « Enregistrer 7 prix » at the end. Every price change is dated; the list shows « Vérifié il y a 3 mois » in red past six months and a callout counts stale prices. The CSV import gains a supplier choice and a « prix seulement » mode that updates matches and creates nothing. |
| 5 | « pouvoir déplacer la préparation à un autre jour (en le glissant manuellement dans une autre colonne) » | On a phone or a tablet: hold a line or a task for half a second, it lifts and follows the finger; drop it on a day of the L M M J V S D strip, on a day header, or on a column (tablet). Release elsewhere opens « Déplacer au… » so the gesture never dead-ends. On a laptop the whole row is draggable, not only the small grip. « Déplacer au… » stays everywhere. |
| 6 | « pouvoir choisir soit prix de vente par convive, soit prix total food, et ajouter une ligne avec prix "service, livraison, autres" à 21% tva » | The event price is either « par convive » or « total food » (a pill next to the amount). A new section « Service, livraison, autres » takes billed lines with their own VAT rate, 21 % by default. Revenue, margin, the week's « Signé », the reports and the menu PDF include them; the PDF prints one line per rate and a TVAC total. Superseded by `11-team-margin-reminders.md` (3.2, 4.3, 6.5): each line carries a `kind` (service, livraison, location_vaisselle, boissons, autre) picked from « Ajouter ▾ », shared component `RevenueLines.tsx`; the margin is food-only and excludes these lines. |
| 7 | « ajouter la possibilité d'inclure des pièces jointes (pdf, photo ou autre) dans l'événement » | A « Pièces jointes » section on the event page: PDF, photos, Office files and text, 20 Mo each, 20 per event. Open, rename, delete. On the phone the picker offers the camera. |
| 8 | « fusionner "format" et "catégorie" de la recette : concrètement il faudrait: apéritif - entrée - plat - walking dinner - buffet - dessert » | One list « Catégories » in Paramètres with her six values in that order. A recipe has one category; the Recettes tabs, the recipe page, the editor and the event menu grouping follow it. Existing recipes map onto it when read (Lunch and Menu semaine become Plat; Mignardises recipes keep Mignardises) and a script persists the mapping when the developer runs it. |
| 9 | « ne pas devoir cliquer sur la case bleue quand j'ajoute des ingrédients à une recette » | The blue check on the recipe page's add row is gone. Choose the product, type the quantity, Enter: the line is saved and the next row opens with the search focused. Leaving the row with a complete line also saves it. The editor loses the « Plusieurs lignes… » prompt; Enter in the last cell adds a row; Enter in a search picks the first match. |
| 10 | « bug quand j'ajoute hummus maison, ail sec dans une recette » | Fixed separately. The editor trusts the normalised list: the row unit follows the ingredient's unit, stays editable, and the ingredient form opened from the row shows the normalised unit so saving it writes the clean value. |
| 11 | « une section où je peux calculer le prix d'un buffet sur base des recettes intégrées (par exemple un client veut le buffet 1 mais veut ajouter deux plats du buffet 2) » | A « Devis » page: start from an offer, add recipes, « + Depuis une autre offre… » with a checkbox per dish, set the guests, see cost per guest, suggested price, margin, totals HTVA and TVAC. Then « Enregistrer comme offre », « Proposition de menu (PDF) » or « Créer l'événement ». The draft survives a phone reload. |
| 12 | « dans l'événement: contact de l'hôte: ajouter une ligne pour adresse et heure de livraison et coordonnées de facturation » | Two rows under the contact: « Livraison » (address · time) and « Facturation » (free text: name, address, VAT number) with « Reprendre le client » to fill it from the client record. The editor gets the same three fields; picking a client prefills them. The delivery time shows on the week and day cards, the printed day and the menu PDF. |
| 13 | « fonction mettre en gras ou en surligné dans les étapes de la recette » | Two buttons above a focused step, « Gras » and « Surligner » (⌘B, ⌘⇧H), that wrap the selection in `**…**` or `==…==`. The fiche, the cook mode and the prep sheet render bold and a yellow highlight; scaled quantities move from yellow to the light blue tint so the two never collide. PDFs and print strip the markers. |

Effort: 1 M, 2 L (with 11), 3 S, 4 M, 5 M, 6 M, 7 M, 8 M, 9 S, 10 S, 11 L (with 2), 12 S, 13 S.

---

## 2. Vocabulary

French words used in every label, menu, toast and empty state. English names are for code.

| French (UI) | Meaning | Code |
|---|---|---|
| Factures : dans l'application / dans un autre outil | The invoicing setting. « Autre outil » is Odoo today; the copy says « un autre outil (Odoo) ». | `settings.invoicing: "app" \| "externe"` |
| CA mensuel | A typed monthly revenue figure in the Journal, one per month and VAT rate, counted as CA, never an invoice. | `SalesKind "ca_mensuel"` |
| Facture importée | A ledger entry created by the Odoo CSV import, keyed by its invoice number. | `LedgerEntry.imported === true` with `number` |
| À terminer | The Comptabilité tab in externe mode (was « À facturer »). Same route. | `/comptes/a-facturer` |
| Offre type, offre | A named menu with portions per guest and a price. Sold as is or adjusted in a devis. | `Offer`, `/offres`, `/offres/:id` |
| Portions par convive | How many portions of a recipe one guest gets in an offer: 1 for a plat, 3 for walking-dinner pieces, 0,5 for a shared dish. | `OfferLine.portionsPerGuest` |
| Convives de référence | The guest count an offer is costed at on its page. | `Offer.guestCountRef` |
| Devis | The price simulator: an offer adjusted for one client at a guest count. Not stored; it becomes an offer or an event. | `/devis` |
| Prix par convive, prix total food | The two pricing modes of an event or an offer. Both are HTVA. | `pricingMode: "par_convive" \| "total"`, `sellingPricePerGuest`, `sellingTotal` |
| Service, livraison, autres | Billed lines on top of the food price, each with its own VAT rate (21 % by default). Revenue, not costs. | `EventRevenueLine[]`, `revenueLines` |
| Coûts supplémentaires | Unchanged: costs (personnel, location, transport…). | `extraCosts` |
| Prix suggéré | Cost per guest divided by the year's raw-material share (`rawMaterialPct`, 30 % when unset). | `suggestedPricePerGuest` |
| Pièces jointes | Files on an event. | `EventAttachment[]`, `attachments` |
| Catégorie | The one list that classes recipes and groups menus: Apéritif, Entrée, Plat, Walking dinner, Buffet, Dessert. « Format » no longer exists. | `settings.courses`, `recipe.category`, `line.course` |
| Sans ingrédients | Tag on a menu line whose recipe has no ingredient, so the cost is known to be missing. | `isIncompleteRecipe` |
| Livraison (adresse, heure), Facturation (coordonnées) | The three delivery and billing facts of an event. | `deliveryAddress`, `deliveryTime`, `billingDetails` |
| Reprendre le client | Fills the billing block from the linked client's name, address and VAT number. | `billingFromClient` |
| Vérifié | The date a price was last confirmed or changed. | `Ingredient.priceUpdatedAt` |
| Prix seulement | Import mode that updates matched prices and never creates an ingredient. | `?mode=prices` |
| Gras, Surligner | The two step markers. | `**…**`, `==…==`, `step-markup.ts` |
| Maintenir pour glisser | The touch move: hold 450 ms, drag, drop on a day. | `useLongPressDrag` |

Date and money helpers reused in new copy: `shortDayLabel` « jeu. 15 », `dayMonthLabel` « 13 octobre », `longDayLabel` « Jeudi 15 octobre », `monthLabel` « Octobre 2026 », `fmtEur` « 1 234,50 € », new `fmtTime` « 11h30 », new `fmtFileSize` « 1,2 Mo ».

---

## 3. Data model

### 3.1 Settings (`packages/types/src/entities/settings.ts`)

```ts
export type InvoicingMode = "app" | "externe";

export interface AppSettings {
  settingsId: "global";
  // Served equal to courses; accepted and ignored on write. Removed one release after the merge script has run everywhere.
  recipeCategories: string[];
  suppliers: SettingsSupplier[];
  updatedAt: string;
  // The one category list: classes recipes and groups menus. Stored key unchanged.
  courses?: string[];
  // Absent reads as "app". "externe": invoices are issued in another tool; the app stops proposing them.
  invoicing?: InvoicingMode;
  // ...every other field unchanged...
}

// Her six values, in her order.
export const DEFAULT_COURSES = ["Apéritif", "Entrée", "Plat", "Walking dinner", "Buffet", "Dessert"];
// Lists stored by earlier installs; upgradeCourses maps both onto DEFAULT_COURSES plus "Mignardises", which those installs were served and may use.
export const LEGACY_DEFAULT_COURSES = ["Apéritif", "Entrée", "Plat", "Dessert", "Autre"];
export const LEGACY_DEFAULT_COURSES_V2 = ["Apéritif", "Entrée", "Plat", "Dessert", "Mignardises", "Autre"];
// Old « Format » values that are not categories. Buffet and Walking dinner map to themselves.
export const LEGACY_TYPE_TO_CATEGORY: Record<string, string> = { Lunch: "Plat", "Menu semaine": "Plat" };
// Kept only for recipe CSV imports written by the old app.
export const DEFAULT_RECIPE_CATEGORIES = ["Buffet", "Walking dinner", "Lunch", "Menu semaine"];
```

`FALLBACK_COURSE = "Autre"` stays the bucket for a line whose category is not in the list; « Autre » is no longer a list value by default. Existing custom lists that contain it keep it.

### 3.2 Offers (`packages/types/src/entities/offer.ts`, new)

```ts
import type { EventExtraCost, EventRevenueLine, PricingMode } from "./event";
import type { VatRate } from "./ledger";

export interface OfferLine {
  recipeId: string;
  // Portions of this recipe per guest; 0,25 steps in the UI, any positive number in storage.
  portionsPerGuest: number;
  course?: string;
  notes?: string;
}

export interface Offer {
  offerId: string;
  name: string;
  nameLower: string;
  prestationType?: string;
  vatRate?: VatRate;
  // The guest count the offer page costs and previews at.
  guestCountRef: number;
  lines: OfferLine[];
  extraCosts: EventExtraCost[];
  revenueLines: EventRevenueLine[];
  pricingMode: PricingMode;
  // Per guest HTVA; in total mode the derived value, see 5.2.
  sellingPricePerGuest: number;
  sellingTotal?: number;
  notes?: string;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

// The settings-table item that holds the catalogue.
export interface OffersItem {
  settingsId: "offers";
  offers: Offer[];
  updatedAt: string;
}
```

Storage: one item in the settings table, key `{ settingsId: "offers" }`, written only by `OffersService` under a guard on its own `updatedAt`. The Settings page never reads or writes it, so a Paramètres save and an offer save never conflict. Nothing scans the settings table (checked: only `ddb.get` and `ddb.update` on `GLOBAL_ID`), so the second item is invisible to `SettingsService`. Caps: 100 offers, 60 lines each, which keeps the item under 150 KB.

### 3.3 Event (`packages/types/src/entities/event.ts`)

```ts
export type PricingMode = "par_convive" | "total";

// A billed line on top of the food price: service, delivery, other. Revenue HTVA at its own VAT rate.
export interface EventRevenueLine {
  label: string;
  amount: number;
  vatRate: VatRate;
}

export interface EventAttachment {
  attachmentId: string;
  // event-files/{eventId}/{attachmentId}{ext}
  key: string;
  name: string;
  contentType: string;
  size: number;
  addedAt: string;
}

export interface AppEvent {
  // ...existing fields unchanged...
  // Absent reads as "par_convive".
  pricingMode?: PricingMode;
  // Food price HTVA for the whole event, stored only in total mode.
  sellingTotal?: number;
  // In total mode the service derives this as round2(sellingTotal / guestCount) on every write. Readers that multiply by guestCount must call foodRevenue instead.
  sellingPricePerGuest: number;
  revenueLines?: EventRevenueLine[];
  deliveryAddress?: string;
  // HH:MM, 24 h.
  deliveryTime?: string;
  // Free text: name, address, VAT number, one per line.
  billingDetails?: string;
  // Server-owned; never accepted from a create or update body.
  attachments?: EventAttachment[];
  // The offer the event was created from, like templateId.
  offerId?: string;
}
```

### 3.4 Recipe (`packages/types/src/entities/recipe.ts`)

```ts
export interface Recipe {
  // ...existing fields unchanged...
  // The one category. Filled by RecipesService on every read; stored from the first write after this spec.
  category?: string;
  // Legacy « Format ». Mirrored to category on write so old CSV exports and scripts keep a value.
  type: string;
  // Legacy. Read by recipeCategoryOf when category is absent; never written again.
  defaultCourse?: string;
}
```

### 3.5 Ingredient (`packages/types/src/entities/ingredient.ts`)

```ts
export interface Ingredient {
  // ...existing fields unchanged...
  // Set by the service whenever a price is written, even unchanged (a confirmation). Absent on items never priced since this spec.
  priceUpdatedAt?: string;
}
```

### 3.6 Ledger (`packages/types/src/entities/ledger.ts`)

```ts
export type SalesKind =
  | "facture"
  | "acompte"
  | "comptoir"
  | "bon_cadeau"
  | "note_de_credit"
  | "commission"
  // Typed monthly revenue when invoices are issued elsewhere. Counts as CA, never as an invoice, never unpaid.
  | "ca_mensuel"
  | "autre";
```

`LedgerEntry` is unchanged: an imported Odoo invoice is a `facture` entry with `imported: true` and `number` set, no `eventIds`.

### 3.7 Client template (`packages/types/src/entities/client.ts`)

Unchanged. Templates stay priced per guest. « Enregistrer comme modèle » on a total-mode event writes `pricePerGuestOf(event)`.

### 3.8 DTOs

`packages/types/src/dto/events.ts`:

```ts
export const eventRevenueLineSchema = z
  .object({ label: z.string().trim().min(1).max(60), amount: moneyNonnegative, vatRate })
  .strict();

const deliveryTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "heure HH:MM");

// The plain object; create and update derive from it so a refine never blocks .partial().
const eventFieldsSchema = z.object({
  // ...every existing field...
  pricingMode: z.enum(["par_convive", "total"]).optional(),
  sellingTotal: moneyNonnegative.optional(),
  revenueLines: z.array(eventRevenueLineSchema).max(10).default([]),
  deliveryAddress: z.string().trim().max(200).optional(),
  deliveryTime: deliveryTime.optional(),
  billingDetails: z.string().trim().max(500).optional(),
  offerId: z.string().min(1).nullish(),
});

const totalNeedsAmount = (v: { pricingMode?: string; sellingTotal?: number | null }) =>
  v.pricingMode !== "total" || typeof v.sellingTotal === "number";

export const createEventRequestSchema = eventFieldsSchema.refine(totalNeedsAmount, "prix total requis");

// Scalars the editor can clear accept null, stored as a REMOVE (ddb.service.ts). contactName, contactPhone and contactEmail get the same treatment; today an empty value is never cleared.
export const updateEventRequestSchema = eventFieldsSchema
  .partial()
  .extend({
    contactName: z.string().trim().nullable().optional(),
    contactPhone: z.string().trim().nullable().optional(),
    contactEmail: z.string().trim().nullable().optional(),
    deliveryAddress: z.string().trim().max(200).nullable().optional(),
    deliveryTime: deliveryTime.nullable().optional(),
    billingDetails: z.string().trim().max(500).nullable().optional(),
    sellingTotal: moneyNonnegative.nullable().optional(),
    revenueLines: z.array(eventRevenueLineSchema).max(10).optional(),
  })
  .refine(totalNeedsAmount, "prix total requis");

export const renameAttachmentSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();
```

`attachments` is not in any schema; a plain `z.object` strips it, so an editor save can never clear the list. `costSnapshotSchema`, the line and task schemas are unchanged.

`packages/types/src/dto/offers.ts` (new):

```ts
export const offerLineSchema = z
  .object({
    recipeId: z.string().min(1),
    portionsPerGuest: z.number().positive().max(50),
    course: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

const offerFieldsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  prestationType: z.string().min(1).optional(),
  vatRate: vatRate.optional(),
  guestCountRef: z.number().int().positive().max(2000).default(20),
  lines: z.array(offerLineSchema).max(60).default([]),
  extraCosts: z.array(eventExtraCostSchema).max(20).default([]),
  revenueLines: z.array(eventRevenueLineSchema).max(10).default([]),
  pricingMode: z.enum(["par_convive", "total"]).default("par_convive"),
  sellingPricePerGuest: moneyNonnegative.default(0),
  sellingTotal: moneyNonnegative.optional(),
  notes: z.string().trim().max(2000).optional(),
  archived: z.boolean().optional(),
}).strict();

export const createOfferSchema = offerFieldsSchema.refine(totalNeedsAmount, "prix total requis");
export const updateOfferSchema = offerFieldsSchema
  .partial()
  .extend({
    prestationType: z.string().min(1).nullable().optional(),
    vatRate: vatRate.nullable().optional(),
    sellingTotal: moneyNonnegative.nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine(totalNeedsAmount, "prix total requis");
export type CreateOfferRequest = z.infer<typeof createOfferSchema>;
export type UpdateOfferRequest = z.infer<typeof updateOfferSchema>;
```

`packages/types/src/dto/settings.ts`: `invoicing: z.enum(["app", "externe"]).optional()`. `recipeCategories` stays accepted (old clients) and the service drops it. `courses` unchanged (`min(1)`).

`packages/types/src/dto/recipes.ts`: `category: z.string().trim().min(1).max(40).optional()` on create and update; `type` keeps its default so old importers pass. `listRecipesQuerySchema` gains `category: z.string().optional()` next to `type`.

`packages/types/src/dto/ingredients.ts`:

```ts
export const importIngredientsOptionsSchema = z.object({
  mode: z.enum(["all", "prices"]).default("all"),
  supplier: z.string().trim().max(60).optional(),
});
export type ImportIngredientsOptions = z.infer<typeof importIngredientsOptionsSchema>;
```

`packages/types/src/dto/ledger.ts`: `salesEntrySchema.kind` enum gains `"ca_mensuel"`. New:

```ts
export const importLedgerRowSchema = z
  .object({
    number: z.string().trim().min(1).max(40),
    date: isoDate,
    label: z.string().trim().min(1).max(120),
    htva: money,
    vatRate,
    vatAmount: money,
    totalTvac: money,
    paid: z.boolean().default(false),
    paidAt: isoDate.optional(),
    prestationType: z.string().optional(),
  })
  .strict()
  .refine(vatIdentity, "HTVA + TVA doit égaler TVAC");
export const importLedgerSchema = z.object({ rows: z.array(importLedgerRowSchema).min(1).max(2000) }).strict();
export type ImportLedgerRow = z.infer<typeof importLedgerRowSchema>;
```

`packages/types/src/dto/dto.test.ts` additions: `pricingMode: "total"` without `sellingTotal` is refused on create and on update; update accepts `deliveryTime: null`; `deliveryTime` accepts `09:05` and refuses `9h30` and `24:00`; `revenueLines` with 11 items is refused; `attachments` in a create body is stripped; `createOfferSchema` defaults `guestCountRef` to 20 and `pricingMode` to `par_convive`; `offerLineSchema` refuses `portionsPerGuest: 0`; `salesEntrySchema` accepts `ca_mensuel` on `ventes` and `purchaseEntrySchema` refuses it; `importLedgerRowSchema` refuses a row whose amounts do not add up; `importIngredientsOptionsSchema` defaults `mode` to `all`.

### 3.9 Migration and compatibility rules

- No write migration runs at deploy. Every rule below is read-time, and writes persist the new shape item by item.
- `settings.invoicing` absent reads as `"app"`. The seeded and empty local stacks keep today's behaviour. Dalia's production install is switched once, by the developer, after the deploy (5.8).
- `settings.courses` is served through `upgradeCourses` (4.1): the two old default lists become the six values plus « Mignardises » appended as a seventh (both lists were served with it, so recipes and event lines may carry it; she deletes it in Paramètres if unused); an absent list gives the six; a custom list is served as is. `recipeCategories` is served equal to `courses` and dropped on write.
- `recipe.category` is served on every read as `recipeCategoryOf(recipe)` (4.1) and written on create and update; `type` is written equal to it. `defaultCourse` is never written again and is ignored once `category` is stored. `scripts/merge-categories.mjs` (5.8) persists the mapping for every recipe when the developer runs it with `--apply`; until then reads map and writes persist one recipe at a time.
- `event.pricingMode` absent reads as `par_convive`; `sellingPricePerGuest` stays the stored per-guest figure, so every existing event is unchanged. In total mode the service derives `sellingPricePerGuest` on every write.
- `event.revenueLines`, `deliveryAddress`, `deliveryTime`, `billingDetails`, `attachments`, `offerId` absent read as empty. `tasksOf`-style accessors are not needed: readers use `event.revenueLines ?? []` through the libs.
- `ingredient.priceUpdatedAt` absent means never confirmed since this spec; the list shows « jamais vérifié » (6.10) and the stale callout counts it as stale.
- `SalesKind "ca_mensuel"` needs its label in `apps/frontend/src/lib/accounting.ts` (`SALES_KIND_LABEL`) or the Journal and the xlsx export print the raw key.
- Offers: the `offers` item is created on the first write (`putIfAbsent`), served as `[]` before.

---

## 4. Libs in `packages/types`

Tests sit next to the lib (`*.test.ts`, jest project `types`). Current count 277; this spec adds about 95.

### 4.1 `src/lib/planning.ts`

```ts
export type RecipeLookup = Map<string, Pick<Recipe, "name"> & Partial<Pick<Recipe, "category" | "defaultCourse" | "type" | "ingredients" | "portions">>>;

export type PricedEvent = Pick<AppEvent, "sellingPricePerGuest" | "guestCount"> &
  Partial<Pick<AppEvent, "pricingMode" | "sellingTotal" | "revenueLines">>;

// Food revenue HTVA: the typed total in total mode, else price × guests. Never NaN: a missing or non-finite value counts as 0.
export function foodRevenue(e: PricedEvent): number;
export function revenueLinesTotal(e: Pick<AppEvent, "revenueLines">): number;
// The "Signé" figure everywhere: food plus the billed lines.
export function signedRevenue(e: PricedEvent): number;
// Food revenue per guest, 0 when guestCount is 0.
export function pricePerGuestOf(e: PricedEvent): number;
export interface VatBucket { rate: VatRate; htva: number; tva: number; tvac: number }
// Food at the event rate (0 when absent), each billed line at its own rate; buckets merged by rate, ascending, empty buckets dropped.
export function vatBreakdown(e: PricedEvent & Pick<AppEvent, "vatRate">): VatBucket[];
export function revenueTvac(e: PricedEvent & Pick<AppEvent, "vatRate">): number;

// category, else defaultCourse unless it is "Autre", else the legacy type mapped, else the type itself, else "Autre".
export function recipeCategoryOf(r: Partial<Pick<Recipe, "category" | "defaultCourse" | "type">>): string;
// Raw course of a line: its own value, then the recipe category, then "Autre".
export function courseOf(line: Pick<EventRecipeLine, "course">, recipe?: Partial<Pick<Recipe, "category" | "defaultCourse" | "type">>): string;
// undefined or [] → DEFAULT_COURSES; the legacy five or the legacy six → DEFAULT_COURSES plus "Mignardises"; anything else as is.
export function upgradeCourses(stored: string[] | undefined): string[];
// Categories to offer in a select or as tabs: the settings list, then every value used by the given recipes that is not in it, alphabetical.
export function categoryOptions(courses: string[], recipes: Pick<Recipe, "category" | "defaultCourse" | "type">[]): string[];

export function isIncompleteRecipe(r: Pick<Recipe, "ingredients">): boolean;
// Lines whose recipe exists and has no ingredient.
export function incompleteCount(lines: Pick<EventRecipeLine, "recipeId">[], recipeById: RecipeLookup): number;

// "Dupont SA\nRue des Lilas 4, 1050 Ixelles\nBE 0123.456.789"; empty parts dropped.
export function billingFromClient(c: Pick<Client, "name" | "address" | "vatNumber">): string;
```

`courseIndex`, `courseBucket`, `sortEventLines`, `groupByCourse`, `weekPlan`, `monthSignedRevenue` keep their signatures; `weekPlan` and `monthSignedRevenue` call the new `signedRevenue`, so the week's « Signé » tiles include the billed lines without a code change there.

Tests (`planning.test.ts`): `foodRevenue` in total mode returns the total, not `sellingPricePerGuest × guests`; total mode with 3 guests and 1 000 € gives 1 000 and `pricePerGuestOf` gives 333,33; `signedRevenue` adds two lines at 21 % and 6 %; absent `pricingMode` behaves as today; `vatBreakdown` of food at 12 % and lines at 21 % and 21 % gives two buckets with `tvac` equal to `htva + tva`; `revenueTvac` equals the sum; `recipeCategoryOf` prefers `category`, then `defaultCourse`, skips `defaultCourse "Autre"`, maps `Lunch` to `Plat`, keeps an unknown custom type, falls back to « Autre »; `courseOf` with a line override wins; `upgradeCourses` gives seven values for the legacy five and for the V2 six, the six for undefined, and a custom list unchanged; `categoryOptions` appends « Mignardises » used by a recipe and not in the list; `isIncompleteRecipe` and `incompleteCount` ignore unknown recipe ids; `billingFromClient` with no VAT number gives two lines; `groupByCourse` ordering follows the six-value list with a line in « Mignardises » bucketed under « Autre » when the list lacks it (today's rule, pinned).

### 4.2 `src/lib/checklist.ts`

```ts
export interface ChecklistInputs {
  // ...existing...
  // Absent reads as "app".
  invoicing?: InvoicingMode;
}
```

Rules: `no_price` fires on `foodRevenue(e) <= 0`. In externe mode the money block (steps 7 to 10) emits only `to_close` (past upcoming events; `invoiced` is empty in that mode anyway) and never `to_invoice`, `to_invoice_many`, `to_invoice_month` or `unpaid`. `ChecklistItem` shapes are unchanged; the component reads the mode to choose the `to_close` wording (6.8).

Tests: externe keeps `to_close` and drops the four kinds; app mode unchanged; `no_price` fires on a total-mode event with `sellingTotal: 0` and not on one with `sellingPricePerGuest: 0` and `sellingTotal: 500`.

### 4.3 `src/lib/reports.ts`

- `CA_KINDS` gains `"ca_mensuel"`; `INVOICING_KINDS` does not. `isCaEntry` true, `isInvoiceEntry` false for it.
- `auReel(ym, inputs)`: when `inputs.settings.invoicing === "externe"` and the month holds at least one CA entry, the event « signé » rows are not emitted; `totalSigne` is then the ledger CA of the month. A month with no CA entry keeps the event rows as a forecast. App mode unchanged.
- `prestationMix`: `averagePricePerGuest` uses `pricePerGuestOf`.
- `aFacturer` and `incomeStatement` are unchanged: `signedRevenue` already includes the lines.

Tests: `ca_mensuel` counts in `caOfMonth` and the mix, never in `invoicedEventIds`, never in `aFacturer.unpaid`; `auReel` externe month with a `ca_mensuel` entry has no event rows and `totalSigne` equals the typed figure; the same month in app mode keeps both; `averagePricePerGuest` of a total-mode event uses the derived per-guest value.

### 4.4 `src/lib/prefill.ts`

```ts
export interface EventPrefill {
  entry: SalesEntryPrefill;
  // One per distinct VAT rate among the billed lines, kind facture, label "{client} · service, livraison, autres"; empty for a deposit.
  extraEntries: SalesEntryPrefill[];
  revenuePrevu: number;
  acomptesRecus: number;
}
export interface ClientMonthPrefill { /* same addition */ extraEntries: SalesEntryPrefill[] }

// Kind ca_mensuel, dated the last day of the month, paid, label "CA · Octobre 2026" unless given.
export function monthlyRevenueEntry(ym: string, htva: number, vatRate: VatRate, label?: string): SalesEntryPrefill;
```

`entry.htva` is `foodRevenue − deposits` for an event and `Σ foodRevenue − deposits` for a client month; deposits are taken from the food part only. `revenuePrevu` stays `signedRevenue` so the form's « Revenu prévu » shows the full figure.

Tests: an event with food at 12 % and two lines at 21 % gives one `entry` at 12 % and one `extraEntries` item at 21 % with `eventIds` set; a deposit prefill has no `extraEntries`; `monthlyRevenueEntry("2026-10", 1200, 12)` has date `2026-10-31`, `paid: true`, `totalTvac` 1 344; the client-month prefill sums lines across events per rate.

### 4.5 `src/lib/offers.ts` (new) and `offers.test.ts`

> Superseded by `11-team-margin-reminders.md` (4.4): `quoteTotals.margin` and `marginPct` are food-only (food revenue HTVA minus matières), with new `foodCost` and `resultHtva` for the figure that includes the revenue lines.

```ts
export interface QuoteInput {
  lines: OfferLine[];
  guests: number;
  extraCosts: EventExtraCost[];
  revenueLines: EventRevenueLine[];
  pricingMode: PricingMode;
  sellingPricePerGuest: number;
  sellingTotal?: number;
  vatRate?: VatRate;
}
export interface QuoteTotals {
  // recipeId → portions at this guest count.
  portionsByRecipe: Map<string, number>;
  rawMaterial: number;
  extrasCost: number;
  costTotal: number;
  costPerGuest: number;
  foodHtva: number;
  linesHtva: number;
  totalHtva: number;
  totalTvac: number;
  pricePerGuest: number;
  margin: number;
  marginPct: number;
  marginPerGuest: number;
  // Lines whose recipe is known and has no ingredient.
  incompleteRecipes: number;
}

// portions = max(1, ceil(portionsPerGuest × guests − 1e-9)); guests ≤ 0 gives 1 per line.
export function linesForGuests(lines: OfferLine[], guests: number): { recipeId: string; portions: number; course?: string; notes?: string }[];
export function quoteTotals(
  input: QuoteInput,
  recipeCostById: Map<string, number>,
  recipePortionsById: Map<string, number>,
  recipeById?: RecipeLookup,
): QuoteTotals;
// round2(costPerGuest / pct); pct outside (0, 1] or absent reads as 0.30.
export function suggestedPricePerGuest(costPerGuest: number, rawMaterialPct?: number): number;
// portionsPerGuest = round2(portions / guestCount) (guestCount ≤ 0 reads as 1), guestCountRef = guestCount, pricing fields, prestationType, vatRate, extraCosts, revenueLines, notes copied; name given.
export function offerFromEvent(event: AppEvent, name: string): CreateOfferRequest;
// A CreateEventRequest body: lines from linesForGuests, guestCount, pricingMode and prices, revenueLines, extraCosts, prestationType, vatRate, clientId, offerId, notes.
export function eventFromOffer(offer: Offer, args: { name: string; date: string; guests: number; clientId?: string; notes?: string }): CreateEventRequest;
// Same recipeId adds portionsPerGuest and keeps the current course; new recipes are appended in order.
export function mergeOfferLines(current: OfferLine[], incoming: OfferLine[]): OfferLine[];
// quoteTotals at guestCountRef, for the list columns.
export function offerSummary(offer: Offer, recipeCostById, recipePortionsById, recipeById?): Pick<QuoteTotals, "costPerGuest" | "pricePerGuest" | "marginPct" | "incompleteRecipes">;
```

`quoteTotals` uses `calcLinesRawMaterial` on the lines from `linesForGuests`, `sumExtraCosts` for the extras, `foodRevenue`-style arithmetic for the price (total mode ignores guests). `marginPct` is 0 when `totalHtva` is 0. `totalTvac` uses `vatBreakdown` with the food at `vatRate ?? 0`.

Tests: 0,5 per guest at 7 guests gives 4 portions; 1 per guest at 0 guests gives 1; total-mode revenue ignores guests; food at 12 % plus service at 21 % gives the right `totalTvac`; `suggestedPricePerGuest(13.2)` is 44 and `(13.2, 0.25)` is 52,80; `offerFromEvent` of a 60-guest event with a 50-portion line gives 0,83 and a 0-guest event gives 1 per guest; a round trip event → offer → `linesForGuests` at the same guest count returns the same portions for whole ratios; `mergeOfferLines` adds 1 + 0,5 on the same recipe and appends a new one; `incompleteRecipes` counts a recipe with no ingredient and not an unknown id.

### 4.6 `src/lib/step-markup.ts` (new), `step-markup.test.ts`, `src/lib/quantity.ts`

```ts
export interface StepSpan { text: string; bold: boolean; mark: boolean }
// "**" and "==" open a span that closes at the next identical marker in the same step; an unmatched marker is literal; nesting allowed one level each way; an empty pair (****) is literal.
export function parseStepMarkup(step: string): StepSpan[];
export function stripStepMarkup(step: string): string;
// Wraps [selStart, selEnd) in the marker, or unwraps it when both ends already carry it; with an empty selection inserts the pair and places the caret between. Returns the new text and selection.
export function toggleWrap(text: string, selStart: number, selEnd: number, marker: "**" | "=="): { text: string; selStart: number; selEnd: number };

export type StepSegment =
  | { kind: "text"; text: string; bold: boolean; mark: boolean }
  | { kind: "qty"; from: string; to: string; bold: boolean; mark: boolean };
// parseStepMarkup then scaleStepText on each span's text, so a quantity never spans a marker; ratio 1 returns one text segment per span.
export function scaleStepSegments(step: string, ratio: number): { segments: StepSegment[]; changed: boolean };
```

`quantity.ts` `scaleStepText` is unchanged and still exported.

Tests: bold and mark spans; nested bold inside mark; unclosed `**` stays literal; « Ajouter **200 g** de farine » at ratio 2 gives a `qty` segment `{ from: "200 g", to: "400 g", bold: true }`; « **200** g » at ratio 2 leaves « 200 » unscaled and literal (documented limit); `stripStepMarkup` is idempotent; `toggleWrap` wraps, unwraps, and inserts a pair on an empty selection with the caret between; `scaleStepSegments` at ratio 1 returns the spans unchanged with `changed: false`.

### 4.7 `src/lib/ledger-import.ts` (new) and `ledger-import.test.ts`

```ts
export type OdooField = "number" | "date" | "partner" | "untaxed" | "tax" | "total" | "status" | "paidAt";
// Lower-cased, accent-stripped header aliases, English and French Odoo exports.
export const ODOO_HEADERS: Record<OdooField, string[]>;
// Header → field, first match wins; undefined when a required field is missing (number, date, untaxed, total).
export function detectOdooColumns(headers: string[]): Partial<Record<OdooField, string>>;
// "1 234,56", "1,234.56", "1234.56", "-12,5", "€ 12,50" → number; NaN when unreadable.
export function parseOdooNumber(s: string): number;
// "2026-10-14", "14/10/2026", "14-10-2026", "2026-10-14 10:22:00" → "2026-10-14"; null when unreadable.
export function parseOdooDate(s: string): string | null;
// The VAT_RATES value closest to tax / untaxed; 0 when untaxed is 0.
export function nearestVatRate(untaxed: number, tax: number): VatRate;
// "paid", "payé", "in_payment", "en paiement", "partial", "partiel" → true.
export function isPaidStatus(s: string | undefined): boolean;
// Maps one CSV row to an ImportLedgerRow: tax defaults to total − untaxed, vatAmount is the exact tax so the identity holds, label is the partner, a credit note (negative total) keeps negative amounts.
export function mapOdooRow(row: Record<string, string>, columns: Partial<Record<OdooField, string>>): { ok: true; row: ImportLedgerRow } | { ok: false; reason: string };
```

Tests: French and English headers detected; comma and dot decimals; dd/mm/yyyy; a row without a number is refused with « numéro manquant »; a mixed-rate invoice (tax 15 on untaxed 100) maps to 21 with `vatAmount` 15 and `totalTvac` 115; `isPaidStatus("Payé")`; a negative total keeps the sign.

### 4.8 `src/lib/files.ts` (new) and `files.test.ts`

```ts
export type FileKind = "pdf" | "image" | "doc" | "sheet" | "text" | "other";
// Allowed upload types: mimetype → canonical extension.
export const ATTACHMENT_TYPES: Record<string, string>; // application/pdf → .pdf, image/jpeg → .jpg, image/png, image/webp, image/heic, image/gif, text/plain → .txt, application/vnd.openxmlformats-officedocument.wordprocessingml.document → .docx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet → .xlsx
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS = 20;
export function fileKindOf(contentType: string, name?: string): FileKind;
// fr-BE: "850 Ko", "1,2 Mo", "12 Mo"; bytes under 1 Ko print "1 Ko".
export function fmtFileSize(bytes: number): string;
// Lower-case extension with the dot, letters and digits only, at most 8 characters, "" when none.
export function safeExt(name: string): string;
```

Tests: sizes at 0, 512, 850 × 1024, 1,25 Mo, 12 Mo; `fileKindOf` for a PDF, a HEIC, a docx, an unknown type with a `.xlsx` name; `safeExt("Plan de salle.PDF")` is `.pdf`, `safeExt("notes")` is `""`.

### 4.9 `src/lib/dates.ts` and `src/lib/print.ts`

`dates.ts`: `fmtTime(hhmm: string): string` → « 11h30 »; « 09:05 » → « 9h05 »; an invalid string → `""`. Test both.

`print.ts`: `PrintBlock` gains `delivery?: string` (« Livraison 11h30 · Rue des Lilas 4 », either part alone when the other is missing) for event-day blocks only. `WeekPrintPage` prints it as a caption under the heading. Test: a day with two events, one with a time and an address, one without, gives one block with `delivery` and one without.

### 4.10 `src/lib/index.ts`

Export everything new: `offers.ts`, `step-markup.ts`, `ledger-import.ts`, `files.ts`, the new `planning.ts` and `prefill.ts` functions, `fmtTime`, `InvoicingMode`, `Offer`, `OfferLine`, `OffersItem`, `EventRevenueLine`, `EventAttachment`, `PricingMode`, the new DTO schemas and types.

---

## 5. Backend

### 5.1 Settings (`apps/backend/src/settings/settings.service.ts`, `settings.service.spec.ts`)

`withDefaults`: `invoicing: stored.invoicing ?? "app"`, `courses: upgradeCourses(stored.courses)`, `recipeCategories: upgradeCourses(stored.courses)` (alias). `update`: delete `recipeCategories` from `given` before the write. Nothing else changes; the `updatedAt` guard from the QA pass stays.

Spec: the existing « serves the legacy five-item courses list as the six defaults » case now expects the new six plus « Mignardises » (seven values, item untouched); a new case seeds the V2 six and expects the same seven; an absent list gives the six; `invoicing` absent reads `app`, `invoicing: "externe"` is kept; a PATCH with `recipeCategories` writes nothing for that key.

### 5.2 Offers module (`apps/backend/src/offers/`, new: `offers.module.ts`, `offers.controller.ts`, `offers.service.ts`, `offers.service.spec.ts`; register in `app.module.ts`)

Endpoints (AdminGuard, `admin/offers`):

- `GET /admin/offers` → `Offer[]`, archived included (the client filters).
- `POST /admin/offers` body `createOfferSchema` → the offer.
- `PATCH /admin/offers/:id` body `updateOfferSchema` → the offer; null fields become REMOVE on the offer object (the service deletes the key before writing the array).
- `DELETE /admin/offers/:id` → `{ ok: true }`; unknown id 404.

Service: reads `{ settingsId: "offers" }` from the settings table; absent reads as `{ offers: [] }`. Writes go through `withFreshItem(op)`: read, apply `op`, `ddb.update` with `{ offers, updatedAt }` under `guardFor(current)` (same helper as `settings.service.ts`; `attribute_not_exists(#ua)` when the item has no stamp), `putIfAbsent` on the first write, four retries on `ConditionalCheckFailedException` then 409 `{ code: "OFFERS_CHANGED" }`. `create` stamps `offerId`, `nameLower`, `createdAt`, `updatedAt`; refuses the 101st offer with 400 « 100 offres maximum ». `update` keeps unknown fields of the stored offer, refreshes `nameLower` and `updatedAt`. Total mode derives `sellingPricePerGuest = round2(sellingTotal / guestCountRef)` on create and update, same rule as events (5.3).

Spec: create appends with ids and stamps on an absent item; patch keeps fields it was not given and removes a null `notes`; delete of an unknown id is 404; a conditional failure retries then 409; the 101st create is refused; total mode derives the per-guest price.

### 5.3 Events (`apps/backend/src/events/events.controller.ts`, `events.service.ts`, `events.service.spec.ts`, `events.module.ts`)

Pricing (`create` and `update`): a private `applyPricing(stored | undefined, fields)` returns the fields to write:

- `pricingMode === "total"` (sent, or stored when not sent): `sellingPricePerGuest = round2((fields.sellingTotal ?? stored.sellingTotal ?? 0) / (fields.guestCount ?? stored.guestCount || 1))`, recomputed whenever `sellingTotal` or `guestCount` is in the payload.
- `pricingMode === "par_convive"` sent while the stored mode was total: `sellingTotal: null` (REMOVE) and `sellingPricePerGuest` from the payload (the editor always sends it).
- `revenueLines` sent → stored as is (max 10 by DTO).

Delivery and billing: the three fields go through `withoutNull` on create and reach `ddb.update` as `null` on update, which removes them. `contactName`, `contactPhone` and `contactEmail` now follow the same path (3.8).

Attachments:

- `POST /admin/events/:id/attachments`, `@UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 }, fileFilter: (_req, f, cb) => cb(null, f.mimetype in ATTACHMENT_TYPES) }))`. No file → 400 « Fichier manquant ou format non pris en charge (PDF, image, Word, Excel ou texte) ». Multer's size error surfaces as 413; the frontend maps it (6.1). Key `event-files/{eventId}/{attachmentId}{ATTACHMENT_TYPES[mimetype]}` (the client name never reaches S3). `addAttachment` runs under `withFreshEvent`: 21st file → 400 « 20 pièces jointes maximum »; uploads to S3 first, then appends `{ attachmentId, key, name: originalname trimmed to 120, contentType, size, addedAt }` with `writeFields`; on a write failure the object is deleted best-effort. Returns the event.
- `PATCH /admin/events/:id/attachments/:attachmentId` body `renameAttachmentSchema` → the event; unknown id 404.
- `DELETE /admin/events/:id/attachments/:attachmentId` → the event; S3 delete best-effort (logged), then the array write under the guard.
- `GET /admin/events/:id/attachments/:attachmentId/url` → `{ url }`, presigned 1 h with `ResponseContentDisposition: inline; filename*=UTF-8''{encoded name}`; 404 when the id is not on the event.
- `EventsService.delete(eventId)` reads the event first and deletes every attachment object best-effort before the item (unknown event still returns `{ ok: true }`, unchanged).
- `writeFields` accepts `attachments` next to `recipes` and `tasks`.
- `EventsModule` injects `S3Service` (already exported by `SharedModule`).

Spec additions: total mode derives the per-guest price on create and when `guestCount` changes; switching back to `par_convive` removes `sellingTotal`; update with `billingDetails: null` removes the attribute and with `""` stores nothing new (the DTO trims to `""`, the service maps `""` to `null` for the six clearable text fields); `addAttachment` appends under the guard and keeps lines; the 21st is refused; `renameAttachment` of an unknown id is 404; `removeAttachment` calls `s3.delete` with the stored key; `delete` deletes two objects; a create body with `attachments` stores none.

### 5.4 Recipes (`apps/backend/src/recipes/recipes.service.ts`, `recipes.controller.ts`, new `recipes.service.spec.ts`)

- Every read (`getAll`, `get`) returns `category = recipeCategoryOf(stored)` next to the stored fields.
- `create`: `category = data.category ?? recipeCategoryOf({ type: data.type, defaultCourse: data.defaultCourse })`; writes `category` and `type = category`; never writes `defaultCourse` (dropped from the item).
- `update`: when `category` is given, writes `category` and `type = category`; when only `type` is given (old client), maps it through `recipeCategoryOf({ type })` into both.
- `importRecipes`: the `type` column of a CSV maps through `recipeCategoryOf({ type })`; a `categorie` column, when present, wins.
- Controller `GET /admin/recipes?category=` filters on the served category; `?type=` stays as an alias.

Spec (new file, same `build()` pattern as the other specs): read fills `category` from `defaultCourse` first, else from a mapped `type` (`Lunch` → `Plat`), else from a custom type as is; create writes `category` and `type` equal; update with `category` mirrors `type`.

### 5.5 Ingredients (`apps/backend/src/ingredients/ingredients.service.ts`, `ingredients.controller.ts`, `ingredients.service.spec.ts`)

- `create` sets `priceUpdatedAt = now`. `update` sets it whenever `"price" in fields` (an unchanged price is a confirmation). `merge` keeps the survivor's. `importIngredients` sets it on every updated and created row.
- `importIngredients(rows, options: ImportIngredientsOptions)`: `options.supplier` fills rows whose `fournisseur` is empty (never overrides a row's own value); `options.mode === "prices"` updates matches (price, unit when same family, supplier, comment) and creates nothing; unmatched names are returned in `notFound: string[]`. The existing `unmatched` keeps its meaning (unit family differs). Result: `{ created, updated, unmatched, notFound }`.
- Controller: `@Post("import")` parses `@Query()` with `importIngredientsOptionsSchema` and the body as today.

Spec: prices mode updates the matched price and lists `notFound`, creates nothing; `options.supplier` fills rows without one and leaves a row's own supplier; `priceUpdatedAt` set on create, on update with `price`, untouched on update without `price`; import sets it.

### 5.6 Ledger (`apps/backend/src/ledger/ledger.controller.ts`, `ledger.service.ts`, `ledger.service.spec.ts`)

- `POST /admin/ledger/import` body `importLedgerSchema` → `{ created, updated, skippedLocked, invalid: string[] }`.
- `importInvoices(rows)`: loads every entry once; `byNumber` indexes `ventes` entries with `imported === true` by `number`. For each row: `ym` locked (`monthCloses[ym].lockedAt`) → `skippedLocked`; existing number → `put` with the stored `entryId` and `createdAt`, new amounts, date, label, paid, paidAt, `updatedAt`; else `put` a new `facture` entry `{ book: "ventes", kind: "facture", imported: true, number, date, ym, label, htva, vatRate, vatAmount, totalTvac, paid, paidAt?, prestationType? }`. No `eventIds`, no `clientId`. Rows that fail the DTO never reach the service (the controller reports them in `invalid` with their number or line index).
- `create` accepts `ca_mensuel` through the DTO; the service forces `paid: true` for that kind.

Spec: import creates two, re-import updates one and creates none, a row in a locked month is skipped and counted, an invalid row is reported; `ca_mensuel` is stored paid.

### 5.7 S3 (`apps/backend/src/shared/s3.service.ts`)

`presignedUrl(key, opts?: { filename?: string; inline?: boolean })`: when `filename` is given, `ResponseContentDisposition` is `inline; filename*=UTF-8''<encodeURIComponent(filename)>` (or `attachment;` when `inline === false`). Existing callers pass nothing and are unchanged.

### 5.8 Scripts and deploy (`scripts/`)

- `scripts/merge-categories.mjs` (new, Node 20, fetch only, same login as `seed-local.mjs`): `GET /api/admin/settings` and `/api/admin/recipes`; prints one line per recipe `name · type · defaultCourse → category` and the resulting `courses` list; with `--apply` PATCHes every recipe `{ category }` whose stored `category` is absent and PATCHes settings `{ courses }` with the served list. Idempotent. The owner runs it like a provisioning script after the deploy; nothing depends on it having run.
- Deploy step for Dalia's install (documented in the readme's deploy section): `curl -X PATCH "$API/api/admin/settings" -H "authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{"invoicing":"externe"}'`. The seeded and empty local stacks stay in app mode.
- `scripts/seed-local.mjs`: add an offer « Buffet 1 » (prestation `buffet_avec_service`, VAT 12, 20 guests, lines Houmous 1, Salade caprese 1, Poulet basquaise 1, Gratin 1, Tarte au citron 1, price 42 per guest) and « Walking dinner 2 » (walking_cocktail, Mini quiches 3, Verrines 2, Sablés 2, price 38); on Mariage Dupont a revenue line « Service » 450 at 21 %, `deliveryAddress` « Rue des Lilas 4, 1050 Ixelles », `deliveryTime` « 11:30 », `billingDetails` from the Dupont client; on Brunch Pirson `pricingMode: "total"`, `sellingTotal: 900`. Print the offer ids in the final log.

### 5.9 Backend test count

107 today; this spec adds about 30 (settings 4, offers 6, events 9, recipes 4, ingredients 4, ledger 5).

---

## 6. Screens

The ten rules of `03-notion-ui.md` apply: one primary per page, facts as properties, hover actions on pointer screens and menus or sheets on touch, hairlines, no bordered inputs on record pages, 44px targets on touch. French copy with vouvoiement.

### 6.1 Shared frontend pieces

**`apps/frontend/src/lib/api.ts`.**

- `api.offers.{ list (cached "offers"), create, update, delete }` with `withInvalidate(["offers"])`.
- `api.events.attachments.{ add(id, file), rename(id, attachmentId, name), remove(id, attachmentId), url(id, attachmentId) }`; `add` uses `uploadRequest` and invalidates `events`.
- `api.ingredients.import(rows, options?)` builds the query string `?mode=prices&supplier=Barn`; the response type gains `unmatched` and `notFound`.
- `api.ledger.import(rows)` → `POST /admin/ledger/import`, invalidates `events` and `settings`.
- `api.recipes.list` unchanged; `api.recipes.create` already invalidates `recipes`.
- The 413 message becomes « Fichier trop volumineux » (today it says « divisez le CSV », which is wrong for an attachment); the attachments section adds « (max 20 Mo) » itself.
- `EventInput` gains the new scalar fields; `attachments` is excluded from it.

**`apps/frontend/src/components/ui/SearchSelect.tsx`.** New props: `selectFirstOnEnter?: boolean` (default `true`), `onCommit?: (value: string) => void` (called after a selection, used to move focus), `inputRef?: RefObject<HTMLInputElement>`. Behaviour: with a non-empty query the matches are sorted prefix matches first, then by label length, then alphabetically; the active index starts at 0 (not −1) while the query is non-empty, so the first row is highlighted and Enter picks it even when several match; with an empty query Enter does nothing (as today). `aria-activedescendant` is set on the input from the active row id (closes part of A11Y-17).

**`apps/frontend/src/components/admin/NewRecipeDialog.tsx`** (new). Props `{ open, onClose, initial: { name: string; category?: string }, categories: string[], existing: Pick<Recipe, "recipeId" | "name">[], defaultPortions: number, onCreated: (recipe: Recipe) => void | Promise<void>, onUseExisting?: (recipeId: string) => void | Promise<void> }`. Dialog `size="sm"` (a Sheet on touch, like `NewClientDialog`), title « Nouvelle recette ». Fields: « Nom » (text, prefilled, autofocus), « Catégorie » (SelectPill over `categories`, default `initial.category` else « Plat »), « Portions de base » (NumericInput, default `defaultPortions`, help « Le nombre de portions que la recette de base produit. »). Caption « Les ingrédients et les étapes se complètent plus tard depuis la fiche. ». Duplicate guard: when a case-insensitive name match exists, a line « Une recette « Houmous » existe déjà · L'ajouter » (the link calls `onUseExisting`) and the primary reads « Créer quand même ». Footer « Annuler » / primary « Créer et ajouter ». Enter submits. Payload: `api.recipes.create({ name, category, type: category, portions, portionWeight: 150, techniques: [], ingredients: [], photos: [] })`. On error: toast with the server reason, dialog stays open.

**`apps/frontend/src/components/admin/StepToolbar.tsx`** (new). Props `{ textareaRef: RefObject<HTMLTextAreaElement>, value: string, onChange: (next: string) => void, className? }`. Renders two ghost IconButtons, 28px on pointer and 44px on touch: « Gras » (lucide `Bold`, title « Gras · ⌘B / Ctrl+B ») and « Surligner » (lucide `Highlighter`, title « Surligner · ⌘⇧H / Ctrl+Maj+H »). Each reads `selectionStart`/`selectionEnd` from the textarea, calls `toggleWrap`, writes the text through `onChange` and restores the selection on the next frame. Exposes `useStepShortcuts(textareaRef, value, onChange)` for the keydown handler (Cmd/Ctrl+B, Cmd/Ctrl+Shift+H). Pointer screens: shown while the textarea is focused (`focus-within` on the wrapper). Touch: always shown under the textarea.

**`apps/frontend/src/components/ui/RecipeReader.tsx`.** `StepText` calls `scaleStepSegments`; renders `kind: "text"` spans as `<strong>` when bold and `<mark className="rounded-sm bg-tag-yellow-bg px-0.5 text-inherit">` when mark (both when both); `kind: "qty"` as `<mark className="rounded-sm bg-selected px-0.5 text-inherit">{to}</mark>` plus the `(from)` base when `showBase`, wrapped in `<strong>` or the yellow mark when the span carries them. `RecipeCook.tsx` and `PrepSheet.tsx` reuse `StepText` and need no change beyond the legend (6.9).

**`apps/frontend/src/components/admin/AttachmentsSection.tsx`** (new). Props `{ event: AppEvent, onChange: (event: AppEvent) => void }`. Section « Pièces jointes », meta « 2 fichiers · 3,4 Mo » (hidden when empty), action ghost « + Ajouter » bound to a hidden `<input type="file" multiple accept=".pdf,image/*,.docx,.xlsx,.txt">`. Body on pointer screens is also a drop zone: on `dragover` it shows « Déposer les fichiers ici » with `bg-selected`. Empty: « Aucune pièce jointe. Devis signé, plan de salle, photo du lieu… ». Rows (`ListRow`, 36px, 44px on touch): icon by `fileKindOf` (lucide `FileText`, `Image`, `FileSpreadsheet`, `File`), name (button, opens), muted « 1,2 Mo · 12 oct. », trailing ⋯ (`ActionMenu`, `reveal` on pointer) with « Ouvrir », « Renommer », « Supprimer » (danger). « Ouvrir » calls `api.events.attachments.url` then `window.open(url, "_blank", "noopener")` (the call happens inside the click handler so the popup is not blocked; on failure a toast « Impossible d'ouvrir le fichier »). « Renommer » turns the name into an inline input (Enter saves, Escape cancels). « Supprimer » opens a Dialog « Supprimer « plan-salle.pdf » ? » with caption « Le fichier est effacé définitivement. », danger button « Supprimer ». Uploads run one at a time; the pending row shows the name muted with « Envoi… » and no ⋯; a refused file shows a toast with the server reason, or « Fichier trop volumineux (max 20 Mo) » on 413, or « Format non pris en charge » when the browser type is not in `ATTACHMENT_TYPES` (checked before the upload). The 21st file is refused client-side with « 20 pièces jointes maximum ».

**`apps/frontend/src/hooks/use-long-press-drag.ts`** (new). `useLongPressDrag<T>({ delay = 450, slop = 8, enabled, onStart(item), onMove(point, target), onEnd(target | null) })` returning `{ handlers(item: T): { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }, dragging: boolean, ghost: { x, y } | null, target: string | null }`. Pointer Events only (`pointerType === "touch"` or `"pen"`). On `pointerdown` a timer starts; a move over `slop` px before the timer fires cancels it (the page scrolls as usual); when it fires: `setPointerCapture`, `navigator.vibrate?.(10)`, a native non-passive `touchmove` listener on the row calls `preventDefault()` (React's root listener is passive), the row gets the class `touch-dragging` (`user-select: none; -webkit-touch-callout: none; touch-action: none`). On every move the target is `document.elementFromPoint(x, y)?.closest("[data-drop-day]")?.getAttribute("data-drop-day")`. Within 56px of the viewport top or bottom the page scrolls by 8px per frame (`requestAnimationFrame`), 16px within 24px. `pointerup` calls `onEnd(target)` and releases; `pointercancel` calls `onEnd(null)`. The week's swipe handler (`Week.tsx` `onTouchStart`/`onTouchEnd`) returns early while `dragging`.

**`apps/frontend/src/components/admin/DragGhost.tsx`** (new). A portal `div` at the pointer position (offset −24px, −56px so the finger does not cover it): `rounded-lg bg-background px-3 h-11 flex items-center gap-2 shadow-dialog pointer-events-none`, the status dot, the label truncated at 24 characters, and on the right « → jeu. 15 » when a target is under the finger, « Déposez sur un jour » in muted text otherwise.

**`apps/frontend/src/components/admin/DayStrip.tsx` and `DayHeads.tsx`.** Every cell gets `data-drop-day={date}`; a new prop `dropDay?: string | null` tints that cell `bg-selected` and gives it a 2px primary ring while a drag is in progress. The stacked day section header in `Week.tsx` gets the same attribute and tint.

**`apps/frontend/src/lib/menu-pdf.ts`** (new). `exportMenuPdf(input: { title: string; dateLine?: string; guestCount: number; priceLines: string[]; groups: { course: string; recipes: string[] }[]; contact?: string; delivery?: string; company?: string; fileName: string })` extracted from `EventDetail.exportMenuPdf`; the event page and the devis call it. `priceLines` are built by a helper `pricingLines(e: PricedEvent & { vatRate? }, prestationLabel?)`: « 30 convives · Prix food 32,50 € HTVA / convive (TVA 12 %) · Buffet avec service » or « 30 convives · Prix food 900,00 € HTVA (TVA 12 %) », then one line per revenue line « Service · 450,00 € HTVA (TVA 21 %) », then « Total HTVA 1 425,00 € · Total TVAC 1 652,50 € » (the totals line only when at least one revenue line exists or the mode is total).

**`apps/frontend/src/components/admin/AddFromOfferDialog.tsx`** (new). Props `{ open, onClose, offers: Offer[], excludeOfferId?: string, recipeById: Map<string, Recipe>, onAdd: (lines: OfferLine[]) => void }`. Dialog `size="md"` (Sheet on touch) « Ajouter depuis une offre »: a SelectPill « Offre » over the other active offers (first one preselected), then a Checkbox row per line « Poulet basquaise · 1 portion / convive » (category as muted detail), « Tout cocher » link, footer « Annuler » / primary « Ajouter 2 recettes » (count live, disabled at 0). Empty when there is no other offer: « Aucune autre offre. ».

**`apps/frontend/src/components/admin/OfferMenu.tsx`** (new, shared by the offer page and the devis). Props `{ lines: OfferLine[], courses: string[], recipes: Recipe[], guests: number, recipeCostById, recipePortionsById, onChange(lines), onCreateRecipe(name, category?) }`. Renders groups by category (through `groupByCourse` on `{ recipeId, course }` shaped lines); each row 36px (44px touch): recipe name as a link to `/recipes/:id`, « Sans ingrédients » grey Tag when `isIncompleteRecipe`, « × 1 / convive » as `EditableInlineNum` (min 0,25, step 0,25, suffix « / convive »), the computed « 30 port. » muted, « 4,20 € / convive » muted, ⋯ with the section « Changer de catégorie » (radios over `courses`), « Note » (inline text), « Retirer ». Under the groups: a SearchSelect « Ajouter une recette… » (detail = category, `onCreateNew` → `NewRecipeDialog`, Enter adds the top match, the row gets `portionsPerGuest: 1` and the recipe's category) and a subtle button « + Depuis une autre offre… » (the devis and the offer page pass their own handler). A deleted recipe renders « Recette supprimée » in red with « Retirer » only.

**`apps/frontend/src/lib/page-icons.ts`**: `offres: "📋"`, `devis: "🧮"`, `offre: "📋"`. **`AdminSidebar.tsx`**: entry « Offres » (`/offres`, active on `/offres` and `/devis`) between « Clients » and « Comptabilité ». **`App.tsx`** routes: `/offres` (Offers), `/offres/:id` (OfferDetail), `/devis` (Devis), `/ingredients/prix` (IngredientPrices).

**`apps/frontend/src/components/admin/WeekChecklist.tsx`**: prop `invoicing?: InvoicingMode`; the `to_close` sentence drops « , puis à facturer » in externe mode (« 1 événement passé est à terminer », « 3 événements passés sont à terminer »). The four invoice rows are never produced in that mode (4.2), so no copy change there.

**`apps/frontend/src/components/comptes/LedgerEntryForm.tsx`**: `SALES_KINDS` excludes `ca_mensuel` unless the prop `allowMonthly` is true (the Journal passes `settings.invoicing === "externe"`). With kind `ca_mensuel`: the « N° » field and the « Réglé » block are hidden, `paid` is sent `true`, the date defaults to `lastDayOfMonth` of the month the form was opened on, the label placeholder reads « CA · Octobre 2026 », and a caption under the amount reads « Une ligne par mois et par taux de TVA. ». `apps/frontend/src/lib/accounting.ts`: `SALES_KIND_LABEL.ca_mensuel = "CA mensuel"`.

**`apps/frontend/src/lib/use-report-inputs.ts`**: exposes `invoicing` from the loaded settings so the comptes pages and the event page read one value.

### 6.2 Paramètres (`apps/frontend/src/pages/admin/Settings.tsx`)

Société section (tab « Société ») gains a Property « Factures », kind select, options « Dans l'application » | « Dans un autre outil (Odoo) », saved with the section (`invoicing`). Sub under the property, only when « autre outil » is chosen: « L'application ne propose plus de créer les factures ni les acomptes. Le chiffre d'affaires du mois se saisit ou s'importe dans le Journal. ».

Catalogue tab: the sections « Formats de recette » and « Catégories du menu » become one Section « Catégories » with the meta « Classent les recettes et groupent le menu d'un événement : apéritif, entrée, plat… », the same `NameRow` editor (rename, reorder, delete with the existing confirmation and rename propagation). Validation toast: « Au moins une catégorie est requise ». The draft and the PATCH drop `recipeCategories`. `DEFAULT_COURSES` is the fallback when the list is empty.

### 6.3 Offres (`/offres`, `apps/frontend/src/pages/admin/Offers.tsx`, `max-w-wide`)

```
 📋 Offres                                                                 [Devis]  ⋯  [+ Nouvelle offre]
 6 offres                                                                  default · ghost · primary
 [Actives] [Archivées]                                                                       🔍  Trier ▾
 ────────────────────────────────────────────────────────────────────────────────────────────────────
 Nom                     Prestation             Recettes   Prix / conv.   Coût / conv.   Marge %
 Buffet 1                Buffet avec service    5          42,00 €        13,20 €        69 %
 Walking dinner 2        Walking / cocktail     3          38,00 €        9,80 €         74 %
```

Table columns: « Nom » (link to `/offres/:id`), « Prestation » (gray Tag, blank when none), « Recettes » (count), « Prix / conv. » (`pricePerGuest`, in total mode the derived value with a muted « total » suffix), « Coût / conv. » (`offerSummary`), « Marge % » (red under 0, with a red « ! » and the title « 2 recettes sans ingrédients » when `incompleteRecipes > 0`). Row ⋯: « Faire un devis », « Dupliquer », « Archiver » / « Réactiver », « Supprimer ». Trier: Nom, Prix, Marge %. Phone: the Table's list shape with the price trailing.

Toolbar: ViewTabs « Actives | Archivées »; « Devis » (default button, → `/devis`); ⋯ with « Depuis un événement… » (a Dialog « Créer une offre depuis un événement »: SearchSelect over events newest first with the date as detail, then « Nom de l'offre » prefilled with the event name, primary « Créer l'offre »; builds `offerFromEvent`); the page primary « + Nouvelle offre » creates « Nouvelle offre » (20 guests, par convive, 0 €) and opens it.

Empty state (no offer at all): « Aucune offre type. Une offre est un menu avec son prix par convive, à partir duquel vous faites un devis. » with « + Nouvelle offre » and « Depuis un événement… ». « Archivées » empty: « Aucune offre archivée. ».

### 6.4 Offre (`/offres/:id`, `apps/frontend/src/pages/admin/OfferDetail.tsx`, `max-w-doc`)

```
 Offres / Buffet 1                                                   [Faire un devis]   ⋯
 📋 Buffet 1                                                                                 40/700, inline editable
 🍽 Prestation            (Buffet avec service ▾)
 🧾 TVA                   (12 % ▾)
 👥 Convives de référence 20                       Sert au calcul du coût et des portions
 💶 Prix                  (par convive ▾) 42,00 € HTVA
 📝 Notes                 Ajouter une note
 ┌ Coût matières / conv. ┬ Prix / conv. ┬ Marge / conv. ┬ Marge % ┐
 │ 13,20 €               │ 42,00 €      │ 28,80 €       │ 69 %    │
 Menu · 5 recettes                                                            + Ajouter une recette
   Apéritif
   Houmous de betterave                 × 1 / convive   20 port.   0,95 € / conv.   ⋯
   …
 Service, livraison, autres · 0 €                                                      + Ajouter
 Coûts supplémentaires · 0 €                                                           + Ajouter
```

Properties: « Prestation » (select over prestation types, « Aucune » allowed; picking one sets « TVA » to its default when TVA is unset), « TVA » (select 0/6/12/21), « Convives de référence » (number, min 1), « Prix » (custom: SelectPill « par convive » | « total food » + `EditableInlineNum` + « HTVA »; in total mode a sub « soit 42,00 € / convive »), « Notes » (multiline). Switching to total prefills `sellingTotal = price × guestCountRef`; switching back divides. Stat row: four flat `MoneyTile`s from `quoteTotals` at `guestCountRef`; « Coût matières / conv. » gets the red sub « 2 recettes sans ingrédients » when it applies. Section « Menu » is `OfferMenu` (6.1) with `guests = guestCountRef`; its « + Depuis une autre offre… » opens `AddFromOfferDialog` excluding this offer and merges with `mergeOfferLines`. Section « Service, livraison, autres » (rows as on the event page, 6.6). Section « Coûts supplémentaires » (same rows as the event page). Every edit saves through `api.offers.update` with a 300 ms debounce per field; a 409 reloads the offer and toasts « L'offre a changé ailleurs, elle a été rechargée ».

Page primary « Faire un devis » → `/devis?offre={offerId}`. ⋯: « Dupliquer » (creates « Buffet 1 (copie) » and opens it), « Remplacer le menu depuis un événement… » (the event picker of 6.3, replaces `lines`, `extraCosts` and `revenueLines` from `offerFromEvent`, keeps the name and price; a Dialog confirms « Remplacer le menu de « Buffet 1 » par celui de « Mariage Dupont » ? »), « Archiver » / « Réactiver », « Supprimer » (Dialog « Supprimer « Buffet 1 » ? », caption « Les événements créés depuis cette offre ne changent pas. »). An archived offer shows a gray Tag « Archivée » next to the title. Phone: the stat row scrolls horizontally; « Faire un devis » sits in the sticky bottom bar.

### 6.5 Devis (`/devis`, `apps/frontend/src/pages/admin/Devis.tsx`, `max-w-doc`)

Reached from the Offres toolbar « Devis », from an offer's « Faire un devis », from the Offres row ⋯, and from a client page ⋯ « Faire un devis » (`/devis?client={clientId}`). Query params prefill once; the page state lives in `sessionStorage["devis:draft"]` (the whole form plus `loadedFrom`), restored on reload and cleared by « Réinitialiser », « Enregistrer comme offre » and « Créer l'événement ».

```
 🧮 Devis                                                        [Réinitialiser]  ⋯  [Créer l'événement]
 Un menu et un prix pour un client, à partir d'une offre ou de zéro.
 📋 Offre de départ       (Buffet 1 ▾)
 🏢 Client               (Famille Dupont ▾)                     + Nouveau client
 👥 Convives             30
 🍽 Prestation           (Buffet avec service ▾)
 🧾 TVA                  (12 % ▾)
 📅 Date                 Choisir une date                        facultatif, repris à la création
 Menu · 7 recettes                                                            + Ajouter une recette
   …                                                                          + Depuis une autre offre…
 Service, livraison, autres · 450,00 €                                                + Ajouter
 Coûts supplémentaires · 120,00 €                                                     + Ajouter
 Prix
 ┌ Coût matières / conv. ┬ Prix suggéré / conv. ┐
 │ 13,20 €               │ 44,00 €   matières à 30 % du prix │
 💶 Prix proposé          (par convive ▾) 42,00 € HTVA
 ┌ Marge / conv. ┬ Marge % ┬ Total HTVA ┬ Total TVAC ┐
 │ 24,80 €       │ 59 %    │ 1 710,00 € │ 1 943,70 € │
 [Enregistrer comme offre]  [Proposition de menu (PDF)]                         [Créer l'événement]
```

Rules:

- « Offre de départ » (relation over active offers, `allowEmpty` « Sans offre »): picking one loads lines, pricing, prestation, TVA, revenue lines, extra costs and sets « Convives » to `guestCountRef`; a Dialog « Remplacer le devis en cours ? » guards it when the menu is not empty.
- « Client » (relation, `onCreateNew` opens `NewClientDialog`): picking one sets « Convives » to `defaultGuestCount` when the field is untouched, « Prestation » and « TVA » from the client defaults when unset.
- « Convives » drives every figure live (`linesForGuests`, `quoteTotals`).
- Menu: `OfferMenu` with `guests`; « + Depuis une autre offre… » opens `AddFromOfferDialog` over every active offer (the starting one included, so « deux plats du buffet 2 » is two taps). Lines show the portions for the guests (« 30 port. »).
- « Prix suggéré / conv. » = `suggestedPricePerGuest(costPerGuest, objectives[year].rawMaterialPct)` with the sub « matières à 30 % du prix » (the actual percentage) and a link « Objectif » to `/settings#finances` in the sub when the objective is unset. « Prix proposé » is prefilled from the offer; a link-button « Reprendre le prix suggéré » sits under it.
- Tiles: « Marge / conv. », « Marge % » (red under 0), « Total HTVA », « Total TVAC » (`quoteTotals`). « Coût matières / conv. » gets the red sub « 2 recettes sans ingrédients » when it applies.
- Footer (sticky bottom bar on phones): « Enregistrer comme offre » (default; Dialog « Nom de l'offre », default « Buffet 1 · variante » or « Nouvelle offre », primary « Enregistrer »; creates through `api.offers.create` and navigates to it), « Proposition de menu (PDF) » (ghost; `exportMenuPdf` with title « Proposition · Famille Dupont » or « Proposition de menu », the date when set, the pricing lines, no contact), and the page primary « Créer l'événement » (Dialog: « Nom » default « Buffet 1 · Famille Dupont » or « Buffet 1 », « Date » required (prefilled from the property), caption « Le menu, le prix et les suppléments sont repris. Les tâches et l'équipe se complètent sur l'événement. », primary « Créer »; `eventFromOffer` with `notes: "Devis du 14/10/2026 depuis Buffet 1"` when an offer was the start; navigates to `/events/:id`).
- « Réinitialiser » reloads the starting offer (or empties the devis) after a Dialog « Réinitialiser le devis ? ».
- Empty menu: « Aucune recette. Partez d'une offre ou ajoutez des recettes. ».

### 6.6 Événement (`/events/:id`, `apps/frontend/src/pages/admin/EventDetail.tsx`)

Property list, in order: Date, Convives, Prestation, Client, **Prix**, Contact, **Livraison**, **Facturation**, Statut, Équipe, Heures passées.

- « 💶 Prix » replaces « Prix / convive »: `SelectPill` « par convive » | « total food » (gray) then `EditableInlineNum` then « HTVA ». Par convive: « 55,00 € » saves `sellingPricePerGuest`. Total food: « 3 300,00 € » saves `{ pricingMode: "total", sellingTotal }`; sub « soit 55,00 € / convive » (`pricePerGuestOf`). Switching to total prefills `price × guests`; switching back sends `{ pricingMode: "par_convive", sellingPricePerGuest: pricePerGuestOf(event) }`. Tooltip on the pill: « En total food, le prix ne change pas quand les convives changent. ».
- « 📍 Livraison » (custom): `InlineContact`-style inline address (placeholder « Ajouter une adresse », `inputMode="text"`) · Dot · inline time (placeholder « Heure »; a native `<input type="time">` while editing, 44px on touch; shown as « 11h30 » through `fmtTime`). Clearing a value sends `null`.
- « 🧾 Facturation » (kind multiline, placeholder « Nom, adresse, n° de TVA pour la facture »). Under the value, when a client is linked and `billingDetails` differs from `billingFromClient(client)`: a link-button « Reprendre le client » that writes that block. When they are equal: a muted « Depuis la fiche client ».
- Contact: unchanged; an emptied value now sends `null` so it clears.

Stat row: « Coût matières », « Revenu HTVA » (sub « dont 450 € service, livraison, autres » when lines exist; in total mode no change), « Marge », « Marge % ». Under the row a caption « TVAC 3 877,50 € · 12 % sur 3 300 € · 21 % sur 450 € » (from `vatBreakdown`, one bucket per rate, shown only when the event has a VAT rate or a revenue line). The cost tile's sub gains « · 1 recette sans coût » when `incompleteCount > 0`.

> Superseded by `11-team-margin-reminders.md` (6.3, 6.5): the tiles read « Marge food » and « Marge food % » (`foodMargin`), the result after the revenue lines and the team is « Reste », and the section « Service, livraison, autres » is the shared `RevenueLines` with a kind per line and the meta from `revenueByKindLabel`.

Sections, in order: Menu, Tâches, **Pièces jointes**, Coûts supplémentaires, **Service, livraison, autres**, Facturation, Notes.

- Menu: the add row is `SearchSelect` with `onCreateNew` (opens `NewRecipeDialog` with `defaultPortions = guestCount`; on creation `api.events.lines.add(id, { recipeId, portions: guestCount, course: category })`), Enter adds the top match. Lines whose recipe is incomplete show a gray Tag « Sans ingrédients » after the name; their ⋯ gains « Compléter la recette » (→ `/recipes/:id/edit?retour=/events/:eventId`). Meta: « 7 lignes · 1 à compléter ». Toast after a creation: « Recette créée et ajoutée » with the action « Compléter ».
- Pièces jointes: `AttachmentsSection`.
- Service, livraison, autres: Section with meta « 450,00 € HTVA », action ghost « + Ajouter » (appends « Service · 0 € · 21 % » and focuses the amount). Rows 36px (44px touch): `EditableInlineText` label (datalist « Service », « Livraison », « Autres »), `EditableInlineNum` amount with « € », `SelectPill` rate « 21 % » (0 / 6 / 12 / 21), × `reveal` (⋯ « Retirer » on touch). Empty: « Aucun supplément. Service, livraison ou autres, facturés en plus du prix food, TVA 21 % par défaut. ». Every change saves the whole `revenueLines` array.
- Facturation in app mode: unchanged, except that after the food invoice is saved and `prefill.extraEntries` is non-empty, the section opens a second `LedgerEntryForm` titled « Facture 2 / 2 · service, livraison, autres (21 %) » prefilled with the first extra entry (then 3 / 3 for a second rate); « Annuler » closes it. In externe mode: no « Créer la facture » and « Enregistrer un acompte » buttons, the `?facturer=` param is ignored, the body shows the linked entries when any, else the muted line « Les factures se font dans un autre outil (Odoo). ». The Statut row shows the billing tags only when linked entries exist.

⋯ menu gains « Enregistrer comme offre type » (Dialog « Nom de l'offre », default the event name, caption « Les portions sont converties par convive. », primary « Enregistrer »; `api.offers.create(offerFromEvent(event, name))`, toast « Offre « Buffet 1 » enregistrée » with the action « Ouvrir »). « Dupliquer » copies `pricingMode`, `sellingTotal`, `revenueLines`, `deliveryAddress`, `deliveryTime`, `billingDetails`, `offerId`; never `attachments`. « Enregistrer comme modèle » writes `pricePerGuestOf(event)`. « Proposition de menu (PDF) » calls `menu-pdf.ts` with `pricingLines` and `delivery` « Livraison le samedi 17 octobre à 11h30, Rue des Lilas 4 » (either part alone when the other is missing).

The line drag inside a course block (reorder, `canDrag = !isTouch`) is unchanged.

### 6.7 Éditeur d'événement (`/events/new`, `/events/:id/edit`, `apps/frontend/src/pages/admin/EventEditor.tsx`)

Informations: « Prix de vente par convive HTVA (€) » becomes a group labelled « Prix de vente HTVA » with two Tag buttons (`aria-pressed`) « Par convive » | « Total food » and one `NumericInput` whose suffix reads « € / convive » or « € »; in total mode a caption « soit 32,50 € / convive » updates with the guests. The payload sends `pricingMode`, `sellingPricePerGuest` (always; in total mode the derived value, the server recomputes it) and `sellingTotal` (total mode only).

Contact de l'hôte: a second row « Adresse de livraison » (text, full width) and « Heure de livraison » (`type="time"`); a third row « Coordonnées de facturation » (textarea, 2 rows, placeholder « Nom, adresse, n° de TVA »). `applyClientDefaults`: `setDeliveryAddress(prev => prev || c.address || "")`, `setBillingDetails(prev => prev || billingFromClient(c))`. The scalar payload sends `null` for an emptied contact, delivery or billing field on update.

New Section « Service, livraison, autres » between « Coûts supplémentaires » and « Résumé financier », caption « Facturés en plus du prix food, TVA 21 % par défaut. », rows: « Intitulé » (text with datalist), « Montant HTVA » (NumericInput), « TVA » (select 0/6/12/21, default 21), ×; subtle « + Ajouter ». Empty: « Aucun supplément. ».

Résumé financier tiles: « Coût total HTVA », « Revenu food HTVA », « Service, livraison, autres », « Revenu total HTVA », « Marge HTVA », « Marge % », « Coût/convive HTVA », « Marge/convive HTVA » (margin against the total revenue).

Menu: the SearchSelect gets `onCreateNew` → `NewRecipeDialog` (`defaultPortions = guestCount`); the created recipe is added as a local line with its category; Enter adds the top match. Incomplete recipes show the « Sans ingrédients » Tag in the line header. The « Catégorie » select of a line uses the merged list plus the line's current value when absent (as today).

### 6.8 Comptabilité when invoices are issued elsewhere

Everything below applies when `settings.invoicing === "externe"`; app mode is unchanged.

- `ComptesLayout.tsx`: the tab reads « À terminer » (same route `/comptes/a-facturer`); intro « Terminer les événements passés pour figer leur coût. Les factures se font dans un autre outil. ».
- `AFacturer.tsx`: only the Section « Événements passés à terminer » (rows « Mariage Dupont · 17 oct. · 60 conv. · 3 750,00 € » from `signedRevenue`, « Terminer » button as today); the stat row, « À facturer », « Factures impayées » and the phone footer are not rendered. Nothing-to-do state: « Tous les événements passés sont terminés. ».
- `Journal.tsx`: intro « Une ligne par vente, CA mensuel, facture importée ou achat, classée par mois. Les autres onglets se calculent à partir du journal. ». ⋯ gains « Saisir le CA du mois… » (opens `LedgerEntryForm` in `layout="dialog"` with `allowMonthly`, kind `ca_mensuel`, date `lastDayOfMonth(selected month)`, VAT from the first prestation type's default) and « Importer des factures (CSV)… » (6.8.1). A month that holds both `facture` and `ca_mensuel` entries shows a warning Callout above the table: « Ce mois contient des factures et un CA mensuel : le chiffre d'affaires est compté deux fois. ». Imported entries show a gray Tag « importée » after the label; their « Réglé » popover still works. Empty sales month: « Aucune vente ce mois. Saisissez le CA du mois ou importez les factures. » with « Saisir le CA du mois ».
- `Apercu.tsx`, `Resultats.tsx`, `Previsionnel.tsx`: no change (they read the ledger). `AuReel.tsx`: the row detail for a total-mode event reads « 900,00 € food » and for one with lines « 55,00 € × 60 + 450,00 € »; nothing else.
- Week box and event page: 6.1 and 6.6.

#### 6.8.1 Dialog « Importer des factures (CSV) »

Same two-step shape as the ingredient import (`Dialog size="lg"`). Step 1: drop zone « Déposez l'export Odoo (CSV ou XLSX) ou cliquez pour choisir », caption « Export Facturation › Factures clients, avec les colonnes Numéro, Date, Partenaire, Montant HT, Taxes, Total, État du paiement. ». Papa/XLSX parse as today; `detectOdooColumns` on the headers; a missing required column stops with the Callout « Colonne manquante : Numéro. Colonnes lues : … ». Step 2: a Table « Numéro · Date · Client · HTVA · TVA · TVAC · Payé » with a leading Tag per row: « Nouvelle » (green), « Mise à jour » (blue, number already imported), « Mois verrouillé » (gray, `monthCloses[ym].lockedAt`), « Ignorée » (red, with the reason as title). Counts in the step header « 12 nouvelles · 3 mises à jour · 1 ignorée ». Primary « Importer 15 factures » (disabled at 0) calls `api.ledger.import(rows)`; toast « 12 factures importées · 3 mises à jour » (plus « · 1 mois verrouillé » when any). Rows already linked to an event in app mode never exist in externe mode, so no collision rule is needed.

### 6.9 Recettes, Recette, Éditeur de recette, Cuisiner, fiche

**Recettes (`apps/frontend/src/pages/admin/Recipes.tsx`).** The first ViewTabs reads « Toutes » then `categoryOptions(settings.courses, recipes)` (her six, then any value in use), `aria-label="Catégorie"`; horizontal scroll under `md` as today. Trier: « Catégorie » replaces « Format ». List column and gallery Tag read `recipe.category`. « + Nouvelle recette » creates with `category: courses[0]` (« Apéritif ») and `type` equal. CSV export header « categorie » (the import accepts « type » and « categorie »). Import preview column « Catégorie ».

**Recette (`RecipeDetail.tsx`).** Property « 🏷 Catégorie » (select over the merged list plus the current value when absent; saves `{ category }`). The inline add-ingredient row (point 9):

- The row opens with the search focused (as today). Choosing a product fills the unit and moves focus to « Qté » (`SearchSelect.onCommit`); `inputMode="decimal"`, `enterKeyHint="next"`.
- Enter in « Qté » with a product and a quantity above 0 saves the line (`handleAddIngredient`), keeps `addingIngredient` true, resets the row and focuses the search again. A second Enter on an empty row closes it. Escape closes the row and discards it.
- Leaving the row (`focusout` whose `relatedTarget` is outside the `<tr>`) with a product and a quantity above 0 saves it the same way and closes the row; with a quantity of 0 the row stays open and a muted caption « Indiquez une quantité » shows under the field.
- The primary blue Check IconButton is removed. On touch a default-variant 44px button « Ajouter » sits at the row end (the phone keyboard's « Suivant » is the Enter path too). The ghost × « Annuler » stays.
- The row disables itself while the PATCH is in flight so two Enters never save twice.
- « + Créer « … » » in the search still opens `IngredientFormModal`; on save the focus returns to « Qté ».

Steps (point 13): the step textarea (edit and add) is wrapped with `StepToolbar` and `useStepShortcuts`; the step text renders through `StepText` at ratio 1 (bold and highlight visible, markers hidden). Caption under the section: « Sélectionnez un mot puis Gras ou Surligner. ». `exportPdf` writes `stripStepMarkup(step)`.

**Éditeur de recette (`RecipeEditor.tsx`).** « Format » becomes « Catégorie » (`recipe-category`), options the merged list; the form field is `category` and the payload sends `category` (and `type` equal). Ingrédients: `addIngLine` appends `{ ingredientId: "", qty: 0, unit: "g", lossPct: 0 }` and focuses the new row's search (placeholder « Produit… »); the « Plusieurs lignes… » button and its `prompt()` are removed; Enter in « Quantité » focuses « Unité », Enter in « Unité » focuses « Perte % », Enter in « Perte % » of the last row adds a row; save filters rows with an empty `ingredientId`. The unit of a row follows `PRICE_TO_QTY_UNIT[ing.unit] || "g"` and stays editable (point 10). Caption under the table on pointer screens: « Entrée choisit le premier produit et passe à la quantité ; Entrée sur la dernière case ajoute une ligne. ». Étapes: every step textarea gets `StepToolbar`; caption « Sélectionnez un mot puis Gras ou Surligner. ».

**Cuisiner (`RecipeCook.tsx`).** The legend reads « Quantités adaptées pour 60 portions, en bleu (recette de base : 10) ». Nothing else; `StepText` does the rendering.

**Fiche (`PrepSheet.tsx`).** Nothing; `RecipeReader` renders the steps. The header caption gains « Livraison 11h30 · Rue des Lilas 4 » when the event has either.

### 6.10 Ingrédients and the price sheet

**Ingrédients (`apps/frontend/src/pages/admin/Ingredients.tsx`).**

- ⋯ gains « Mettre à jour les prix… » (→ `/ingredients/prix?fournisseur=Barn`, the first supplier of settings) above « Importer CSV », which is renamed « Importer une liste de prix (CSV) ».
- A Callout above the table when at least one ingredient has no `priceUpdatedAt` or one older than 180 days: « 23 prix non vérifiés depuis 6 mois. » with the link « Mettre à jour les prix ». Dismiss for the session (×).
- The « Prix » cell gets the title « Vérifié le 12 mars » or « Jamais vérifié ». « Par fournisseur » view: each group header gets the meta « dernière mise à jour 12 mars » (max of the group) and a link « Mettre à jour » to the sheet filtered on that supplier.
- Import dialog: two controls above the preview, « Fournisseur » (select over settings suppliers plus « Comme dans le fichier », default the latter; when a supplier is chosen it fills rows whose supplier column is empty) and a Checkbox « Mettre à jour les prix seulement (ne crée pas de nouveaux ingrédients) », checked by default when a supplier is chosen. In that mode rows with no match show the Tag « Non trouvé » in the preview (client-side `IngredientLookup`-like match on `nameLower` and aliases, best effort) and the result toast reads « 38 prix mis à jour · 3 non trouvés : Filet de poulet 1 kg, … ». Button label « Importer 41 lignes » or « Mettre à jour 38 prix ».

**Prix fournisseur (`/ingredients/prix`, `apps/frontend/src/pages/admin/IngredientPrices.tsx`, `max-w-doc`).**

```
 Ingrédients / Prix Barn
 🧅 Prix Barn                                                          (Barn ▾)
 42 produits · dernière mise à jour 12 mars
 Tapez le nouveau prix, Entrée passe au suivant. Les lignes vides ne changent pas.
 Produit                 Unité   Prix actuel   Nouveau prix   Écart     Vérifié
 Betterave               €/kg    2,80 €        [ 2,95 ]       +5 %      il y a 3 mois
 Carotte                 €/kg    1,20 €        [      ]                 il y a 8 mois   (red)
 …
                                          [Annuler]   [Enregistrer 7 prix]
```

- Supplier `SelectPill` in the header (settings suppliers plus any supplier in use, plus « Sans fournisseur »); changing it with unsaved edits asks « Abandonner 7 prix non enregistrés ? ».
- Rows sorted by name. « Nouveau prix » is a 96px right-aligned `NumericInput` (`inputMode="decimal"`, `enterKeyHint="next"`); Enter and Tab move to the next row's input, Shift+Enter up; Escape clears the cell. « Écart » appears once a value differs: green Tag « −4 % », red Tag « +12 % », gray « = » when equal (an equal value still counts as a confirmation). « Vérifié »: « à l'instant », « il y a 12 jours », « il y a 3 mois », « il y a plus d'un an », « jamais », red past 180 days.
- Footer: « Annuler » (back to Ingrédients; asks when edits exist) and the page primary « Enregistrer 7 prix » (count of non-empty cells; disabled at 0). Saving runs `api.ingredients.update(id, { price })` sequentially through a small queue (no new endpoint); the button reads « Enregistrement 3 / 7… »; on completion toast « 7 prix enregistrés » and the cells clear; a failed row keeps its value, gets a red « ! » with the server reason as title, and the toast reads « 5 prix enregistrés · 2 erreurs ». Leaving the page mid-save is blocked by `beforeunload` while the queue runs.
- Phone: the same table in the Table primitive's list shape, one row per product with the input trailing; the « Vérifié » column becomes the row's second line.

### 6.11 Semaine and Jour on touch, laptop whole-row drag (`Week.tsx`, `Day.tsx`, `DayStrip.tsx`, `DayHeads.tsx`, `index.css`)

Touch screens (`useTouchScreen()`), every layout:

- Hold a line or task row 450 ms without moving more than 8px: a short vibration where supported, the row dims to `opacity-40`, the `DragGhost` appears under the finger, every `[data-drop-day]` cell shows a faint `bg-selected` and a caption « Déposez sur un jour » appears under the DayStrip (phone) or under the heads row (tablet at `xl`). Moving before the timer fires scrolls the page as usual, nothing lifts.
- Drop targets: the seven `DayStrip` cells (phone and tablet below `xl`, sticky in the bar), the stacked day section headers of the week (below `xl`), the seven `DayHeads` cells and the seven column bodies (`xl`, iPad landscape). The target under the finger turns `bg-selected` with the primary ring; the ghost reads « → jeu. 15 ».
- Release on a target: the existing `moveItem(item, date)` (lines `PATCH …/lines/:lineId { prepDate: date === eventDate ? null : date }`, tasks `PATCH …/tasks/:taskId { date }`); the row renders in its new place (the week's moved-in group « pour sam. 17 · Mariage Dupont » as today); no toast. Release on the current day: nothing. Release with no target: the row's « Déplacer au… » Sheet opens (the existing `MoveToDayMenu` rendered as a Sheet on touch, title « Déplacer « Poulet basquaise » »), so the gesture never dead-ends.
- The week swipe (previous/next week) is disabled while a row is lifted. The status dot tap and the row link are unchanged (the timer cancels on `pointerup` under 450 ms).
- First lift ever: a one-time caption in the callouts area « Maintenez une préparation pour la glisser vers un autre jour. Déplacer au… reste dans le menu ⋯. » with ×, stored in `tour-storage.ts` as `touchDragHintSeen`.
- Day page: same hook on its rows; targets are the `DayStrip` cells (below `xl`) and the `DayHeads` cells (`xl`).
- `index.css`: `.touch-dragging { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: none; }`.

Laptop (`xl`, pointer): `draggable` moves from the grip `span` to the row `li` (week columns and the day page's own-day rows); the grip stays as the visual hint; the row cursor is `grab`, `grabbing` while dragging; links and buttons inside keep `draggable={false}`. The drop logic is unchanged. A11Y-11 is unchanged: « Déplacer au… » remains the keyboard route.

`docs/redesign/REDESIGN.md` line 239 changes from « no long-press anywhere » to « no long-press anywhere except the lift of a line or task row for a move (07 section 6.11) »; the line 1005 table row « long-press status on the week » keeps its « cut » verdict (status stays a tap).

Event cards: the week column card meta and the stacked event header read « 60 conv. · 11h30 » when `deliveryTime` is set; the day page event header reads « Mariage Dupont · 11h30 ». `WeekPrintPage.tsx` prints the `delivery` caption under the block heading (4.9).

### 6.12 Client (`apps/frontend/src/pages/admin/ClientDetail.tsx`, `Clients.tsx`, `Events.tsx`)

- Client page ⋯ gains « Faire un devis » (→ `/devis?client={clientId}`).
- Semaine type editor: the recipe SearchSelect gets `onCreateNew` → `NewRecipeDialog` (`defaultPortions = template guestCount`); template lines of an incomplete recipe show the « Sans ingrédients » Tag.
- Every reader of `sellingPricePerGuest × guestCount` moves to `signedRevenue` (exhaustive list from `grep -rn sellingPricePerGuest apps/frontend/src packages/types/src`): `Clients.tsx:53`, `Events.tsx:190` (« Montant »), `ClientDetail.tsx:498` (« Signé »), `AFacturer.tsx:100`, `AuReel.tsx:114` (6.8), `EventEditor.tsx:275` (6.7), `EventDetail.tsx:576` (6.6), `reports.ts:530` (4.3), `checklist.ts:90` (4.2). `ClientDetail.tsx:124` and `:141` (template from event) use `pricePerGuestOf(ev)`. The builder re-runs the grep before closing the phase.

---

## 7. Tour and docs updates

`apps/frontend/src/components/admin/tour-steps.ts` (`docs/redesign/04-first-run-and-tour.md` section 3 lists the same steps):

- New step after `events-list`: key `offers`, route `/offres`, anchor `offers-list` (the Offers table or empty state carries `data-tour="offers-list"`), title « Offres et devis », body « Une offre est un menu type avec son prix par convive : Buffet 1, Walking dinner 2. Depuis une offre, Faire un devis adapte le menu et le nombre de convives pour un client, montre le coût et la marge, puis crée l'événement. », `fallbackBody` the same text, phone same anchor.
- `comptes-tabs` body: « Journal : une ligne par facture, acompte, CA du mois ou achat. À facturer, ou À terminer quand les factures se font dans un autre outil : les événements passés à clôturer. Aperçu et Compte de résultats : l'année. Prévisionnel : objectif et charges. Au réel : signé face à l'objectif. ».
- `settings-tabs` body: « Équipe : les personnes à qui vous attribuez le travail. Catalogue : catégories, types de prestation et fournisseurs. Société : vos coordonnées et où se font les factures. Finances : charges fixes et objectif. Pour revoir cette visite : Général › Visite guidée, juste en dessous. ».
- `week-day` phone body gains a last sentence: « Maintenez une préparation pour la glisser vers un autre jour. ». Pointer body gains « Glissez une préparation vers un autre jour, ou ⋯ › Déplacer au…. ».
- `fiche-ingredients` body unchanged.

Docs:

- `docs/redesign/REDESIGN.md`: line 239 amended (6.11); section 5.5 « Recette » mentions « Catégorie » instead of « Format »; section 5.17 Paramètres lists « Factures » and the single « Catégories » list; section 9 open questions gets the list of section 10 below.
- `docs/redesign/03-notion-ui.md`: 3.2 `RecipeReader.tsx` line (the `<mark>` class) now says scaled quantities use `bg-selected` and `==surligné==` uses `bg-tag-yellow-bg`; 4.5 Cuisiner rule « scaled numbers use the yellow tag tint » becomes « scaled numbers use the light blue selection tint; her own highlights use the yellow tag tint »; 4.6 Événement adds the Prix pill, the Livraison and Facturation rows and the two new sections; 4.8 Recette replaces « Format » by « Catégorie »; 4.9 Recettes tabs by category; 4.17 Paramètres « Factures » and « Catégories »; 4.1 Sidebar lists « Offres ».
- `docs/redesign/05-week-tasks-print.md`: section 2 vocabulary row « Catégories du menu » points to this spec; the Mignardises default list is superseded by 3.1 here.
- `docs/redesign/README.md`: a row for `07-offers-pricing-attachments.md`.
- `readme.md` (repo root) deploy section: the `merge-categories.mjs` run and the `invoicing: externe` PATCH (5.8).

---

## 8. Build plan

Phases run in sequence. Inside a phase, groups touch disjoint files and can run in parallel. Run `pnpm -r type-check`, `pnpm -r test` and `pnpm -r build` at the end of every phase. The screenshot driver is `/tmp/pw/shot.mjs`; add a `longpress` action to it in Phase 7 (pointer down, wait 500 ms, move in steps, up) before the acceptance run.

### Phase 1. Types and DTOs

- Group A: `packages/types/src/entities/settings.ts`, `packages/types/src/entities/event.ts`, `packages/types/src/entities/recipe.ts`, `packages/types/src/entities/ingredient.ts`, `packages/types/src/entities/ledger.ts`, `packages/types/src/entities/offer.ts`, `packages/types/src/entities/index.ts`. Tasks: 3.1 to 3.6.
- Group B: `packages/types/src/dto/events.ts`, `packages/types/src/dto/offers.ts`, `packages/types/src/dto/settings.ts`, `packages/types/src/dto/recipes.ts`, `packages/types/src/dto/ingredients.ts`, `packages/types/src/dto/ledger.ts`, `packages/types/src/dto/index.ts`, `packages/types/src/dto/dto.test.ts`. Tasks: 3.8 (Group B imports the entity types from Group A; coordinate the `PricingMode` and `EventRevenueLine` names before starting).

### Phase 2. Core libs

- Group A: `packages/types/src/lib/planning.ts`, `packages/types/src/lib/planning.test.ts`, `packages/types/src/lib/dates.ts`, `packages/types/src/lib/dates.test.ts`. Tasks: 4.1, 4.9 (`fmtTime`).
- Group B: `packages/types/src/lib/step-markup.ts`, `packages/types/src/lib/step-markup.test.ts`. Tasks: 4.6.
- Group C: `packages/types/src/lib/files.ts`, `packages/types/src/lib/files.test.ts`, `packages/types/src/lib/ledger-import.ts`, `packages/types/src/lib/ledger-import.test.ts`. Tasks: 4.7, 4.8.

### Phase 3. Dependent libs

- Group A: `packages/types/src/lib/checklist.ts`, `packages/types/src/lib/checklist.test.ts`, `packages/types/src/lib/reports.ts`, `packages/types/src/lib/reports.test.ts`. Tasks: 4.2, 4.3.
- Group B: `packages/types/src/lib/prefill.ts`, `packages/types/src/lib/prefill.test.ts`, `packages/types/src/lib/print.ts`, `packages/types/src/lib/print.test.ts`. Tasks: 4.4, 4.9 (`delivery`).
- Group C: `packages/types/src/lib/offers.ts`, `packages/types/src/lib/offers.test.ts`, `packages/types/src/lib/index.ts`. Tasks: 4.5, 4.10.

### Phase 4. Backend

- Group A: `apps/backend/src/settings/settings.service.ts`, `apps/backend/src/settings/settings.service.spec.ts`. Tasks: 5.1.
- Group B: `apps/backend/src/offers/offers.module.ts`, `apps/backend/src/offers/offers.controller.ts`, `apps/backend/src/offers/offers.service.ts`, `apps/backend/src/offers/offers.service.spec.ts`, `apps/backend/src/app.module.ts`. Tasks: 5.2.
- Group C: `apps/backend/src/events/events.controller.ts`, `apps/backend/src/events/events.service.ts`, `apps/backend/src/events/events.service.spec.ts`, `apps/backend/src/events/events.module.ts`, `apps/backend/src/shared/s3.service.ts`. Tasks: 5.3, 5.7.
- Group D: `apps/backend/src/recipes/recipes.service.ts`, `apps/backend/src/recipes/recipes.controller.ts`, `apps/backend/src/recipes/recipes.service.spec.ts`. Tasks: 5.4.
- Group E: `apps/backend/src/ingredients/ingredients.service.ts`, `apps/backend/src/ingredients/ingredients.controller.ts`, `apps/backend/src/ingredients/ingredients.service.spec.ts`. Tasks: 5.5.
- Group F: `apps/backend/src/ledger/ledger.controller.ts`, `apps/backend/src/ledger/ledger.service.ts`, `apps/backend/src/ledger/ledger.service.spec.ts`. Tasks: 5.6.
- Group G: `scripts/merge-categories.mjs`, `scripts/seed-local.mjs`, `readme.md`. Tasks: 5.8. Re-seed the local stack after this phase.

### Phase 5. Frontend shared pieces

- Group A: `apps/frontend/src/lib/api.ts`, `apps/frontend/src/lib/page-icons.ts`, `apps/frontend/src/lib/use-report-inputs.ts`, `apps/frontend/src/lib/accounting.ts`, `apps/frontend/src/lib/menu-pdf.ts`. Tasks: 6.1.
- Group B: `apps/frontend/src/components/ui/SearchSelect.tsx`, `apps/frontend/src/components/admin/NewRecipeDialog.tsx`. Tasks: 6.1.
- Group C: `apps/frontend/src/components/admin/StepToolbar.tsx`, `apps/frontend/src/components/ui/RecipeReader.tsx`. Tasks: 6.1.
- Group D: `apps/frontend/src/components/admin/AttachmentsSection.tsx`. Tasks: 6.1.
- Group E: `apps/frontend/src/hooks/use-long-press-drag.ts`, `apps/frontend/src/components/admin/DragGhost.tsx`, `apps/frontend/src/components/admin/DayStrip.tsx`, `apps/frontend/src/components/admin/DayHeads.tsx`, `apps/frontend/src/index.css`, `apps/frontend/src/lib/tour-storage.ts`. Tasks: 6.1, 6.11 (shared parts).
- Group F: `apps/frontend/src/components/admin/AddFromOfferDialog.tsx`, `apps/frontend/src/components/admin/OfferMenu.tsx`. Tasks: 6.1.
- Group G: `apps/frontend/src/components/admin/WeekChecklist.tsx`, `apps/frontend/src/components/comptes/LedgerEntryForm.tsx`. Tasks: 6.1.
- Group H: `apps/frontend/src/components/admin/AdminSidebar.tsx`, `apps/frontend/src/App.tsx`, `apps/frontend/src/components/admin/tour-steps.ts`, `docs/redesign/04-first-run-and-tour.md`, plus stub files `apps/frontend/src/pages/admin/Offers.tsx`, `OfferDetail.tsx`, `Devis.tsx`, `IngredientPrices.tsx` (each exports a component rendering « Bientôt » until Phase 6 fills it). Tasks: 6.1 (sidebar, routes), 7.

### Phase 6. Pages

- Group A: `apps/frontend/src/pages/admin/Settings.tsx`. Tasks: 6.2.
- Group B: `apps/frontend/src/pages/admin/Offers.tsx`, `apps/frontend/src/pages/admin/OfferDetail.tsx`. Tasks: 6.3, 6.4.
- Group C: `apps/frontend/src/pages/admin/Devis.tsx`. Tasks: 6.5.
- Group D: `apps/frontend/src/pages/admin/EventDetail.tsx`. Tasks: 6.6.
- Group E: `apps/frontend/src/pages/admin/EventEditor.tsx`. Tasks: 6.7.
- Group F: `apps/frontend/src/pages/admin/comptes/ComptesLayout.tsx`, `apps/frontend/src/pages/admin/comptes/AFacturer.tsx`, `apps/frontend/src/pages/admin/comptes/Journal.tsx`, `apps/frontend/src/pages/admin/comptes/AuReel.tsx`. Tasks: 6.8.
- Group G: `apps/frontend/src/pages/admin/Recipes.tsx`, `apps/frontend/src/pages/admin/RecipeDetail.tsx`, `apps/frontend/src/pages/admin/RecipeEditor.tsx`, `apps/frontend/src/pages/admin/RecipeCook.tsx`, `apps/frontend/src/pages/admin/PrepSheet.tsx`. Tasks: 6.9.
- Group H: `apps/frontend/src/pages/admin/Ingredients.tsx`, `apps/frontend/src/pages/admin/IngredientPrices.tsx`. Tasks: 6.10.
- Group I: `apps/frontend/src/pages/admin/Week.tsx`, `apps/frontend/src/pages/admin/Day.tsx`, `apps/frontend/src/pages/admin/WeekPrintPage.tsx`. Tasks: 6.11.
- Group J: `apps/frontend/src/pages/admin/ClientDetail.tsx`, `apps/frontend/src/pages/admin/Clients.tsx`, `apps/frontend/src/pages/admin/Events.tsx`. Tasks: 6.12.

### Phase 7. Docs and acceptance

- Group A: `docs/redesign/REDESIGN.md`, `docs/redesign/03-notion-ui.md`, `docs/redesign/05-week-tasks-print.md`, `docs/redesign/README.md`. Tasks: 7.
- Group B: `/tmp/pw/shot.mjs` (the `longpress` action), then one builder runs section 9 and fixes what fails; files: whatever the checks point at.

---

## 9. Acceptance checklist

Driver: `mkdir -p /tmp/shots/07 && cd /tmp/pw && OUT=/tmp/shots/07 node shot.mjs /tmp/shots/07/routes.json` against the seeded stack (`http://localhost:5173`, API `:3101`, re-seeded after Phase 4; ids from `GET /api/admin/events`, `/api/admin/offers` and `/api/admin/recipes`). Widths 375 (touch) and 1366 unless stated. The empty stack (`:5174`, `:3102`) checks the externe-mode screens after `PATCH /api/admin/settings {"invoicing":"externe"}`.

Tests:

- [ ] `packages/types`: jest passes, 277 plus about 95 new cases.
- [ ] `apps/backend`: jest passes, 107 plus about 30 new cases.
- [ ] `apps/frontend`: `tsc -b` passes; `pnpm --filter @apps/frontend lint:type-scale` passes.
- [ ] `node scripts/smoke-local.mjs` passes (40 plus the new steps below).

Point 1, invoices elsewhere (empty stack switched to externe, then the seeded stack in app mode):

- [ ] `settings-factures-1366.png` (`/settings`, Société): the « Factures » property shows « Dans un autre outil (Odoo) » with the sub sentence.
- [ ] `event-externe-1366.png` (an event page): no « Créer la facture », no « Enregistrer un acompte », the Facturation section reads « Les factures se font dans un autre outil (Odoo). ».
- [ ] `week-externe-375.png` (`/semaine` with a past upcoming event): the box shows « 1 événement passé est à terminer » and no invoice or unpaid row.
- [ ] `comptes-a-terminer-1366.png`: the tab reads « À terminer », only the « Événements passés à terminer » section.
- [ ] `journal-ca-mensuel-1366.png` (Journal › ⋯ « Saisir le CA du mois… »): the dialog form with kind « CA mensuel », no N° field, date the last day of the month, caption visible.
- [ ] `journal-import-preview-1366.png` (⋯ « Importer des factures (CSV)… », a three-row CSV with French headers): preview with « Nouvelle » tags and « Importer 3 factures ».
- [ ] Behaviour: after the import, Aperçu's month total equals the sum of the three HTVA amounts; a second import of the same file toasts « 0 factures importées · 3 mises à jour » and the total is unchanged; Au réel for that month lists the three entries and no event row.
- [ ] Behaviour (seeded stack, app mode): `/events/:id` still shows « Créer la facture »; the week box still lists « à facturer » rows; `invoicing` is absent from `GET /api/admin/settings` until set, and the smoke test is unchanged.

Points 2 and 11, offers and devis:

- [ ] `offres-1366.png` and `offres-375.png` (`/offres`): two seeded offers with prestation, recipes count, price, cost and margin; « + Nouvelle offre » is the only primary.
- [ ] `offres-empty-1366.png` (empty stack): the empty state sentence with the two actions.
- [ ] `offre-1366.png` and `offre-375.png` (`/offres/:id` of « Buffet 1 »): properties, the four tiles, the menu grouped by category with « × 1 / convive » and « 20 port. », the two sections, « Faire un devis » as the primary.
- [ ] Behaviour: changing « Convives de référence » to 40 doubles the portions and keeps cost per guest; switching « Prix » to « total food » prefills 840 € and shows « soit 42,00 € / convive »; a PATCH returns the derived `sellingPricePerGuest`.
- [ ] `devis-1366.png` (`/devis?offre=<Buffet 1>`): the offer loaded, 20 guests, tiles filled, « Prix suggéré / conv. » with the « matières à 30 % du prix » sub.
- [ ] `devis-add-from-offer-1366.png` (then « + Depuis une autre offre… »): the dialog with « Walking dinner 2 » selected and three checkbox rows, « Ajouter 0 recettes » disabled.
- [ ] Behaviour: ticking two rows and adding gives a 7-line menu; setting 30 guests gives « 30 port. » lines and « Total HTVA » = 30 × price + service lines; « Créer l'événement » with a date creates an event with 7 lines, `offerId`, `pricingMode`, the revenue lines, and opens it; « Enregistrer comme offre » creates « Buffet 1 · variante » and opens it; a reload at `/devis` restores the draft.
- [ ] `event-save-offer-1366.png` (`/events/<Mariage Dupont>` ⋯ « Enregistrer comme offre type »): the dialog with the name prefilled; after « Enregistrer », `GET /api/admin/offers` has a « Mariage Dupont » offer whose lines carry `portionsPerGuest` = portions ÷ 60 rounded to 2 decimals.

Point 3, create a recipe from the search:

- [ ] `event-new-recipe-1366.png` (`/events/<Mariage Dupont>`, type « Houmous maison » in the menu search): the « + Créer « Houmous maison » » row is highlighted.
- [ ] `event-new-recipe-dialog-375.png` (then Enter): the Sheet « Nouvelle recette », name prefilled, « Plat » selected, portions 60, caption visible.
- [ ] Behaviour: « Créer et ajouter » creates the recipe, adds a 60-portion line under « Plat » with the « Sans ingrédients » tag, toasts with « Compléter », the Menu meta reads « … · 1 à compléter » and the cost tile sub says « 1 recette sans coût »; the line ⋯ has « Compléter la recette » which opens the editor with `?retour=` back to the event. Typing « Houmous de betterave » shows « Une recette « Houmous de betterave » existe déjà · L'ajouter ».
- [ ] Behaviour: the same dialog works from `/events/new`, from a client template, from an offer page and from `/devis`.

Point 4, prices:

- [ ] `ingredients-stale-callout-1366.png` (`/ingredients`, seeded items have no `priceUpdatedAt`): the callout « N prix non vérifiés depuis 6 mois. » with N the seeded ingredient count and the link « Mettre à jour les prix ».
- [ ] `prix-barn-1366.png` and `prix-barn-375.png` (`/ingredients/prix?fournisseur=Barn`, type 2,95 on Betterave, Enter): the Betterave row shows « +5 % » and the focus is on the next row; the primary reads « Enregistrer 1 prix ».
- [ ] Behaviour: « Enregistrer 1 prix » PATCHes the ingredient, the row's « Vérifié » reads « à l'instant », `GET /api/admin/ingredients/:id` has `price: 2.95` and a fresh `priceUpdatedAt`; an unchanged value typed and saved refreshes `priceUpdatedAt` only; Escape clears a cell; leaving with unsaved edits asks.
- [ ] `ingredients-import-prices-1366.png` (import dialog with a two-row CSV, supplier « Barn » chosen): the checkbox « Mettre à jour les prix seulement » is checked, one row tagged « Non trouvé », the button reads « Mettre à jour 1 prix ».
- [ ] Behaviour: the import creates nothing (`created: 0`), returns `notFound: ["…"]`, and the toast lists the name.

Point 5, touch move:

- [ ] `week-touch-lift-375.png` (`/semaine/2026-W42`, `longpress` 500 ms on the « Houmous de betterave » row of Mariage Dupont, hold): the row dimmed, the ghost under the finger, the strip cells tinted, the caption « Déposez sur un jour ».
- [ ] Behaviour (375, `hasTouch`): longpress then move onto the « J 15 » strip cell and release: the line's `prepDate` is `2026-10-15` and the row renders under Thursday's « pour sam. 17 · Mariage Dupont »; longpress and release on the row itself opens the « Déplacer « Houmous de betterave » » Sheet; a move of 20px within 300 ms scrolls and lifts nothing; a tap on the status dot still cycles the status.
- [ ] Behaviour (1366): dragging a row by its text (not the grip) onto another column moves it; the grip still shows on hover; « Déplacer au… » in ⋯ still works.
- [ ] Behaviour (1024 wide, `hasTouch`, iPad): the heads row cells and column bodies accept a drop; the swipe between weeks does nothing while a row is lifted.
- [ ] `day-touch-lift-375.png` (`/jour/2026-10-13`): the same lift on the day page with the strip as target.

Point 6, pricing and billed lines:

- [ ] `event-price-total-1366.png` (`/events/<Brunch Pirson>`, seeded total mode 900 €): « Prix » shows « total food · 900,00 € HTVA », sub « soit 45,00 € / convive »; the stat row's « Revenu HTVA » reads 900,00 €.
- [ ] `event-revenue-lines-1366.png` and `-375.png` (`/events/<Mariage Dupont>`): the section « Service, livraison, autres · 450,00 € HTVA » with the « Service · 450,00 € · 21 % » row; « Revenu HTVA » shows « dont 450 € service, livraison, autres »; the TVAC caption lists « 12 % sur 3 300 € · 21 % sur 450 € ».
- [ ] Behaviour: changing Convives on Brunch Pirson to 30 keeps 900 € and shows « soit 30,00 € / convive »; `GET` returns `sellingPricePerGuest: 30`; switching to « par convive » removes `sellingTotal`; the week's « Signé » tiles include the 450 €; Events « Montant », Clients « signé cette année », the client page « Signé » tag and À facturer rows all equal `signedRevenue`; the checklist flags « no_price » on a total-mode event at 0 €.
- [ ] `event-invoice-2of2-1366.png` (app mode, Mariage Dupont, « Créer la facture », save): the second form « Facture 2 / 2 · service, livraison, autres (21 %) » prefilled with 450 € at 21 %.
- [ ] `editor-price-mode-375.png` (`/events/<Brunch Pirson>/edit`): the « Total food » tag pressed, the input suffix « € », the caption « soit 45,00 € / convive », the section « Service, livraison, autres ».
- [ ] Behaviour: the menu PDF of Mariage Dupont has the food line with « (TVA 12 %) », the « Service · 450,00 € HTVA (TVA 21 %) » line and the « Total HTVA · Total TVAC » line.

Point 7, attachments:

- [ ] `event-attachments-empty-1366.png` (`/events/<Mariage Dupont>`): the section « Pièces jointes » with its empty sentence and « + Ajouter ».
- [ ] Behaviour (API): `POST /api/admin/events/:id/attachments` with a 1 MB PDF returns the event with one attachment whose key starts with `event-files/<id>/`; a 25 MB file is refused with 413 and the UI toasts « Fichier trop volumineux (max 20 Mo) »; an `.exe` is refused with 400; `GET …/attachments/:aid/url` returns a URL that serves the PDF inline; `PATCH …/attachments/:aid { name }` renames; `DELETE` removes the row and the object; the 21st upload is refused; `PATCH /api/admin/events/:id { attachments: [] }` leaves the list untouched; « Dupliquer » yields an event with no attachment.
- [ ] `event-attachments-rows-375.png` (two files uploaded): rows with icon, name, « 1,2 Mo · 14 oct. », ⋯ with « Ouvrir », « Renommer », « Supprimer ».
- [ ] Behaviour: « Supprimer » asks « Supprimer « plan-salle.pdf » ? »; « Ouvrir » opens a new tab.

Point 8, categories:

- [ ] `GET /api/admin/settings` on the seeded stack (the seed stores the legacy five) returns `courses` = « Apéritif, Entrée, Plat, Walking dinner, Buffet, Dessert, Mignardises » and `recipeCategories` equal to it; on the empty stack the six without Mignardises.
- [ ] `settings-categories-1366.png` (`/settings`, Catalogue): one « Catégories » section, no « Formats de recette ».
- [ ] `recipes-tabs-1366.png` and `-375.png` (`/recipes`): tabs « Toutes · Apéritif · Entrée · Plat · Walking dinner · Buffet · Dessert · Mignardises »; « Risotto aux courgettes » (type Lunch) lists under « Plat », « Sablés bretons » under « Mignardises », « Houmous de betterave » (Buffet, Apéritif) under « Apéritif ».
- [ ] `recipe-category-1366.png` (`/recipes/<Risotto>`): the property « Catégorie · Plat ».
- [ ] Behaviour: saving a category from the editor stores `category` and `type` equal; `GET /api/admin/recipes/:id` of an untouched recipe has `category` without a stored one (check with `node scripts/merge-categories.mjs`, which lists it); `node scripts/merge-categories.mjs --apply` then re-run reports nothing to do; the event menu groups follow the merged list, with « Changer de catégorie » offering the six values.
- [ ] Behaviour: a CSV recipe import with a `type` column « Lunch » creates a « Plat » recipe.

Point 9, no blue box:

- [ ] `recipe-add-row-1366.png` (`/recipes/<Houmous>`, « + Ingrédient », type « bet »): the search list with « Betterave » highlighted first, no blue check in the row.
- [ ] Behaviour (keyboard only): Enter, « 250 », Enter: the line is saved, a fresh row is open with the search focused; Enter on the empty row closes it; clicking elsewhere with « Carotte » and 100 typed saves the line; with 0 typed the caption « Indiquez une quantité » shows.
- [ ] `recipe-add-row-375.png`: the row with the 44px « Ajouter » default button and no blue check.
- [ ] Behaviour (editor): « Ajouter » appends an empty row (placeholder « Produit… », no silent first ingredient); typing « bet », Enter, « 250 », Enter, Enter, Enter adds a second row; the « Plusieurs lignes… » button is gone; an empty row is dropped on save; the event menu search adds the top match on Enter.

Point 10, legacy unit:

- [ ] Behaviour (smoke step, through the DynamoDB local endpoint with the AWS SDK, as `scripts/dynamodb-local-tables.sh` does): an ingredient written with `unit: "€/kilo"` and `price: "4,20"` is listed as « 4,20 €/kg », selecting it in the editor sets the row unit to « g », and saving its form from the row writes `unit: "€/kg"`.

Point 12, delivery and billing:

- [ ] `event-delivery-1366.png` and `-375.png` (`/events/<Mariage Dupont>`): « Livraison · Rue des Lilas 4, 1050 Ixelles · 11h30 », « Facturation » with the three-line block and the muted « Depuis la fiche client ».
- [ ] Behaviour: clearing the address sends `null` and the attribute disappears from `GET`; editing the billing text shows « Reprendre le client », which restores the block; the editor prefills the three fields when a client is picked and sends `null` for an emptied contact e-mail.
- [ ] `week-delivery-time-375.png` (`/semaine/2026-W42`, Saturday expanded): « 60 conv. · 11h30 » on the Mariage Dupont header; the day page header reads « Mariage Dupont · 11h30 »; `/semaine/2026-W42/imprimer` shows « Livraison 11h30 · Rue des Lilas 4, 1050 Ixelles » under the block heading; the menu PDF has the « Livraison le samedi 17 octobre à 11h30, … » line.

Point 13, step markup:

- [ ] `recipe-step-toolbar-1366.png` (`/recipes/<Tarte au citron>`, click a step): the textarea with the two ghost buttons above it and the caption under the section.
- [ ] `recipe-step-toolbar-375.png`: the two 44px buttons under the textarea.
- [ ] Behaviour: selecting « froid » and pressing ⌘B writes `**froid**`; the reader shows « froid » bold with no markers; `==20 minutes==` renders yellow; the cook mode at 60 portions shows a scaled quantity in light blue inside a bold span and the legend « … en bleu »; `/recipes/<id>` « Exporter PDF » has no `**` in the text; a lone `**` typed stays visible as is.

---

## 10. Open questions for Dalia

Each with the assumption this spec takes until she answers.

1. Factures. Your install is switched to « Dans un autre outil (Odoo) » at deploy; new installs keep « Dans l'application ». Do deposits (acomptes) also live in Odoo? Assumed yes: in that mode the app proposes neither invoices nor deposits.
2. Factures. Do you want to type one « CA mensuel » line per month and VAT rate, or import the Odoo invoice export? Both are built; assumed you import when you have the file and type otherwise. Please send one Odoo export (CSV, French columns) so the column names can be pinned before the import ships; the preview protects you until then.
3. Factures. Should an event be marked « Facturé » when its Odoo invoice exists? Assumed no: the month totals are enough; « À terminer » only lists events to close.
4. Offres. Please send your current offer sheets (Buffet 1, Walking dinner 2…) to seed the catalogue, and confirm the prices are HTVA per guest. Assumed HTVA per guest; a total food price is available per offer.
5. Offres. « Portions par convive » defaults to 1 and steps by 0,25; for walking-dinner pieces you type 3. Is that how you count? Assumed yes.
6. Devis. The suggested price divides the cost per guest by the raw-material share of the year's objective (30 % when unset). Would you rather use the coefficients of the recipes (sur place 4, take away 3)? Assumed the objective share; the tile names its rule.
7. Service, livraison, autres. Always 21 %, or does delivery of food sometimes follow the food rate (6 or 12 %)? Assumed 21 % by default and changeable per line.
8. Catégories. « Mignardises » is not in your six values. It is kept as a seventh category after Dessert (assumed, since recipes use it; you can delete it in Paramètres and those recipes then group under « Autre »), or should those recipes become « Dessert »?
9. Catégories. « Lunch » and « Menu semaine » recipes become « Plat ». Confirm, or name the category you want for them.
10. Semaine. Do you drive the week from an iPad (columns, drop on a column) or a phone (stacked days, drop on the L M M J V S D strip)? Both are built; the answer decides which one gets tested on a real device first.
11. Pièces jointes. 20 Mo per file and 20 files per event. Enough for a scanned contract and a few photos? Assumed yes. Should the kitchen staff phones open them? Assumed yes (one admin role today, SEC-2 still open).
12. Livraison. Should events within a day be ordered by delivery time once most have one? Assumed not yet; they stay by name.
13. Prix fournisseurs. Do supplier lists arrive as PDF, Excel or in an e-mail? Assumed mostly PDF or paper, so the typed sheet is the main path and the CSV import the second; are their prices HTVA? Assumed HTVA.
14. Étapes. Scaled quantities move from yellow to light blue so that yellow is your highlighter. Acceptable in the cook mode? Assumed yes.
