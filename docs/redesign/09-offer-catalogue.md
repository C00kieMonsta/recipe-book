# 09. Offer documents: the brochures Dalia sends, in one place

Status: ready to build, after the 07 frontend (Phase 6 pages) and the 08 assistant frontend have landed. Builds on `07-offers-pricing-attachments.md` (the `Offer` entity, the offers endpoint, the Offres, Offre and Devis pages, the Société section) and `08-assistant.md` (read tools). Where this file and 07 disagree, this file wins; the disagreements are listed in section 9.

Inputs: Dalia's request (« we need one place where I can find all those offers like the ones attached, do you think you can help me centralize those types of offers that I can generate »), her seven sheets transcribed in `docs/redesign/workings/offers-source-2026.md`, two designs (document-first, catalogue-first) and this synthesis. The skeleton is the document-first design: the sheet is the object, its sections and rows are stored as she writes them, and the costed 07 offer is an optional twin of a formula section. Grafted from the catalogue-first design: `fromPrice` and `priceNote` on rows, the server-side import with a confirmation dialog, « Utiliser dans un événement… » with an existing-event option, « — » on an uncosted formula, a cross-document search for the assistant, « + Section depuis une formule… », and the questions about the rates that differ between sheets.

No new DynamoDB table. One item per document in the settings table (`settingsId = "document:<id>"`). Brand images (logo, banner) in the existing S3 bucket under fixed keys. No new runtime dependency: the PDF uses `jspdf` and `jspdf-autotable`, both already in `apps/frontend/package.json`.

Paths are absolute from the repo root `/Users/antoineboxho/Developer/Personal/02_projects/recipe-book/` unless they start with `docs/`.

---

## 1. Goal

Dalia keeps seven PDF brochures (brunch à emporter, chef à domicile, walking dinner, buffets printemps-été, buffets automne-hiver, baptême, carte à emporter). Each is a brand page: logo, photo banner, a salmon title band, her company block, a key-value block (type de prestation, nombre de personnes, note), then sections of dishes with prices, a services block, a conditions paragraph and a VAT table. She rebuilds them by hand every season and cannot find the current version.

What she gets:

- One place, « Offres › Documents », listing every brochure with its season and year. Open one, change a price or a dish in place, download the PDF with her logo and banner. Duplicate for next year, archive the old one.
- A document is a page of blocks: sections (a formula at one price per person, or a price list with a price per line), rows (a dish, an italic example, a sub-header such as « Entrée (un choix pour la table) », a bold note), the services block, the conditions, the VAT table.
- Her seven sheets ship as the starting catalogue: « Importer les offres 2026 » on the empty page.
- Any formula can be costed once its dishes are linked to recipes (« Coster cette formule » creates the 07 offer and keeps it in sync on demand), any formula or price-list item can start a devis or an event, and the assistant can read every document.
- Logo, banner and the band colour are set once in Paramètres › Société.

Out of scope: sharing by e-mail link (she downloads the file and attaches it), translations, TVAC prices on the PDF, a shared article catalogue across documents (a dish typed in two documents is two rows; see the open questions).

---

## 2. Vocabulary

French words used in every label, menu, toast and empty state. English names are for code.

| French (UI) | Meaning | Code |
|---|---|---|
| Document, document d'offre | One brochure: « Offre buffets automne hiver 2026 », « Carte à emporter 2026 ». The thing she sends. | `OfferDocument`, `/offres/documents`, `/offres/documents/:id` |
| Formule | The 07 « offre type »: a menu of recipes with a price per guest, costed. Unchanged entity; the tab and the primary on `/offres` now say « formule ». | `Offer`, `/offres`, `/offres/:id` |
| Section | A salmon band of a document. With a price it is a formula (« BUFFET 2, La Tavola Italiana · 34,50 € par personne »); without one it is a price list (every row has its own price). | `DocSection`, `section.price` |
| Ligne | A row under a section: plat, exemple, sous-titre, note. | `DocRow`, `DocRowKind` |
| Plat | A dish or an article. The text is free; it may be linked to a recipe. | `kind: "plat"`, `recipeId` |
| Exemple | The italic muted line « ex : sablé au comté et mousse de chèvre, … ». | `kind: "exemple"` |
| Sous-titre | A light sub-header inside a section: « Apéritif », « Entrée », « Froid », « Chaud ». May carry a choice. | `kind: "sous_titre"`, `choice` |
| Un choix pour la table, 4 au choix | The choice rule printed after a sub-header. | `DocChoice { count, scope }` |
| Note | A bold italic remark: « Le prix comprend la vaisselle… ». | `kind: "note"` |
| Mention | A tag printed in parentheses after a dish: chaud, tiède, froid, sans gluten, en saison. | `row.tags` |
| Prix, unité | A price HTVA and how it multiplies: par personne, à la pièce, par boîte de 20 pièces, gâteau 8 parts, par 300 g. | `price`, `unitLabel`, `unitKind` |
| àpd | « À partir de »: the price is a floor. | `fromPrice` |
| Minimum | « minimum 20 pièces par sorte », « minimum 8 personnes », « min par 12 ». | `DocMinimum` |
| Services, Extras, Service (facultatif) | The block of hourly rates, transport and rental under the sections. Shown or hidden per document. | `DocServices` |
| Conditions | The centred italic paragraph. | `conditions` |
| Tableau TVA | The rate table at the bottom: « Food à emporter 6 % · Food avec service 12 % · Extras 21 % ». | `DocVatLine[]` |
| Saison, Année | Printemps-été, Automne-hiver, Toute l'année; the year prints in the band and in the file name. | `DocSeason`, `year` |
| Coster cette formule | Create the 07 offer that costs a formula section from its recipe-linked rows. « Mettre à jour la formule » re-syncs it. | `POST /admin/offer-documents/:id/sections/:sectionId/offer` |
| Dupliquer pour 2027 | A copy with the next year, optionally archiving the source. | `POST /admin/offer-documents/:id/duplicate` |
| Archivée | A document kept for reference; its PDF stays downloadable. | `archived` |
| Logo, Bannière, Couleur d'accent | The brand assets printed at the top of every PDF and the band colour. | `brandLogoKey`, `brandBannerKey`, `company.accent` |
| Importer les offres 2026 | Load the seven transcribed sheets into an install. | `POST /admin/offer-documents/import-2026` |
| Aperçu, Télécharger le PDF | Show the generated PDF in a dialog; save it as « Offre buffets automne hiver 2026.pdf ». | `exportOfferDocumentPdf`, `documentFileName` |

Helpers reused in copy: `fmtEur` « 1 234,50 € », `dayMonthLabel` « 13 octobre », `plural`.

---

## 3. Data model

### 3.1 Entities (`packages/types/src/entities/offer-document.ts`, new)

```ts
import type { VatRate } from "./ledger";

export type DocSeason = "printemps_ete" | "automne_hiver" | "toute_annee";
// plat: a dish or an article. exemple: the italic « ex : … » line. sous_titre: a light sub-header. note: a bold italic remark.
export type DocRowKind = "plat" | "exemple" | "sous_titre" | "note";
// How a price multiplies in a devis: per guest, per piece, per unit (box, cake, platter, bottle, 300 g).
export type DocUnitKind = "convive" | "piece" | "unite";

export interface DocChoice {
  // « un choix pour la table » = { count: 1, scope: "table" }; « sélection de 4 assiettes au choix » = { count: 4, scope: "table" }.
  count: number;
  scope: "table" | "convive";
  // Printed override; derived from count and scope when absent.
  label?: string;
}

export interface DocRow {
  rowId: string;
  kind: DocRowKind;
  text: string;
  // HTVA, this row alone. Absent on the rows of a formula (the section carries the price).
  price?: number;
  // Prints « àpd 4,50 € ».
  fromPrice?: boolean;
  // Printed in the price column when there is no price: « forfait (htva) en fonction de l'adresse », « supplément en fonction du nombre de personnes ».
  priceNote?: string;
  // Printed as typed: « à la pièce », « par 300 g », « gâteau 8 parts ». Defaults to the section's unitLabel.
  unitLabel?: string;
  unitKind?: DocUnitKind;
  // Printed in parentheses after the text: « chaud », « tiède / froid », « sans gluten », « en saison ».
  tags?: string[];
  // Only on sous_titre rows.
  choice?: DocChoice;
  // The recipe behind the dish; lets the section be costed through its offer.
  recipeId?: string;
}

export interface DocMinimum {
  qty: number;
  unit: "personnes" | "pieces" | "unites";
  // « minimum 20 pièces par sorte ».
  perSort?: boolean;
  // Printed override: « min par 12 », « entre 12 et 20 personnes ».
  label?: string;
}

export interface DocSection {
  sectionId: string;
  // « BUFFET 2, La Tavola Italiana », « Finger food / zakouskis froids », « Proposition de plats ».
  title: string;
  // Under the title in the band: « nombre de choix à définir en fonction du nombre de convives », « idéal pour entre 8 et 16 personnes ».
  intro?: string;
  // Formula price HTVA for the whole section; absent for a price list.
  price?: number;
  // Default « par personne ».
  unitLabel?: string;
  unitKind?: DocUnitKind;
  minimum?: DocMinimum;
  rows: DocRow[];
  // The 07 offer that costs this formula. Set by « Coster cette formule » and « + Section depuis une formule… »; cleared on duplicate.
  offerId?: string;
}

export interface DocServices {
  shown: boolean;
  // « SERVICES », « EXTRAS », « SERVICE (FACULTATIF) ».
  title: string;
  intro?: string;
  rows: DocRow[];
}

export interface DocVatLine { label: string; rate: VatRate }

export interface OfferDocument {
  documentId: string;
  // « Offre buffets automne hiver ». The year is separate so « Dupliquer pour 2027 » never edits the title.
  title: string;
  titleLower: string;
  year: number;
  season?: DocSeason;
  // 07 prestation key, optional. Gives the food VAT rate and the devis prestation.
  prestationType?: string;
  // Printed in « Type de prestation : … » as typed.
  prestationLabel: string;
  minGuests?: number;
  maxGuests?: number;
  // Printed override for the guests fact; derived from minGuests and maxGuests when absent.
  guestsLabel?: string;
  note?: string;
  sections: DocSection[];
  services: DocServices;
  conditions: string;
  vatLines: DocVatLine[];
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

// One settings-table item per document.
export interface OfferDocumentItem {
  settingsId: `document:${string}`;
  document: OfferDocument;
  updatedAt: string;
}

export const DEFAULT_DOC_CONDITIONS =
  "Le retrait des commandes et le retour des plats s'effectue à Overijse sauf si une livraison est prévue. Les plats sont présentés dans des jolis plats de service, lesquels doivent être rapportés propres dans les 5 jours après l'événement. Présentation dans des plats jetables également possible sur demande.";

export const DEFAULT_DOC_SERVICES: DocServices = {
  shown: true,
  title: "SERVICES",
  intro: "Service sur place (en fonction du type d'événement et du nombre de convives)",
  rows: [
    { rowId: "cuisinier", kind: "plat", text: "Tarif horaire par cuisinier", price: 50, unitLabel: "€/heure (htva)", unitKind: "unite" },
    { rowId: "serveur", kind: "plat", text: "Tarif horaire par serveur (4h30 à 5h en moyenne)", price: 40, unitLabel: "€/heure (htva)", unitKind: "unite" },
    { rowId: "transport", kind: "plat", text: "Transport", priceNote: "forfait (htva) en fonction de l'adresse" },
    { rowId: "location", kind: "plat", text: "Location matériel supplémentaire", priceNote: "à voir ensemble" },
  ],
};

export const DEFAULT_DOC_VAT_LINES: DocVatLine[] = [
  { label: "Food à emporter", rate: 6 },
  { label: "Food avec service", rate: 12 },
  { label: "Extras", rate: 21 },
];

export const DOC_SERVICES_TITLES = ["SERVICES", "EXTRAS", "SERVICE (FACULTATIF)"];
export const DOC_VAT_LABELS = ["Food à emporter", "Food avec service", "Food", "Extras", "Services", "Livraison / location matériel"];

// Unit label to kind; the editor's presets. Anything else is typed free and defaults to "unite".
export const DOC_UNIT_PRESETS: Record<string, DocUnitKind> = {
  "par personne": "convive",
  "à la pièce": "piece",
  "par boîte de 20 pièces": "unite",
  "gâteau 8 parts": "unite",
  "par 300 g": "unite",
  "pour env. 12 personnes": "unite",
  "pour 6 personnes": "unite",
  "1 litre": "unite",
  "33 cl": "unite",
};

export const DOC_TAG_PRESETS = ["chaud", "tiède", "froid", "chaud / tiède / froid", "sans gluten", "en saison"];
export const MAX_OFFER_DOCUMENTS = 60;
```

`packages/types/src/entities/index.ts`: `export * from "./offer-document";`.

### 3.2 Settings (`packages/types/src/entities/settings.ts`, extended)

```ts
export interface CompanySettings {
  name: string;
  vatNumber: string;
  address: string;
  constitutedOn?: string;
  phone?: string;
  email?: string;
  website?: string;
  // Hex; the band colour of the PDF. DEFAULT_BRAND_ACCENT when absent.
  accent?: string;
}

// The salmon of her sheets, sampled from the title band. Editable in Paramètres › Société.
export const DEFAULT_BRAND_ACCENT = "#E8847A";

export interface AppSettings {
  // ...unchanged...
  // S3 keys of the brand images (brand/logo.png, brand/banner.jpg). Written only by the brand endpoints; never in a PATCH body.
  brandLogoKey?: string;
  brandBannerKey?: string;
}
```

The two keys live at the top level of the global item, not inside `company`, because the Société section saves `company` whole: a key inside it would be lost on the next save. They are absent from `updateSettingsRequestSchema` (a plain `z.object`, so a client that sends them writes nothing).

### 3.3 Relation to the 07 Offer

- A `DocSection` with a `price` is a formula. `section.offerId` points to the 07 offer that costs it. The offer carries nothing back; it is a normal offer, listed under « Formules », usable in Devis as today. The document page finds it through `api.offers.list`; the offer page finds its document through `documentSectionFor(documents, offerId)` on the cached document list.
- `sectionRecipeLines(section)`: rows with a `recipeId` become `OfferLine`s with `portionsPerGuest` 1, except rows under a `sous_titre` that carries a `choice` (until the next `sous_titre`): `round2(choice.count / n)` with `n` the number of plat rows in that group, which costs the average of the choice. A row with no recipe is not a line; `offerFromSection` lists those rows in the offer `notes` so nothing is lost.
- Sync is one way, document → offer, and explicit: « Coster cette formule » creates, « Mettre à jour la formule » re-writes `lines`, `sellingPricePerGuest`, `vatRate`, `prestationType` and `notes`; it never touches the offer's `extraCosts` or `revenueLines`.
- The reverse: « + Section depuis une formule… » builds a section from an existing offer (`sectionFromOffer`): title = offer name, price = `sellingPricePerGuest`, one plat row per line with the recipe name and `recipeId`, `offerId` set. Rows are then edited freely; « Mettre à jour la formule » pushes them back.
- A price-list row (own `price` and `unitKind`) never becomes an `OfferLine` by itself; it reaches a devis as a quantity (section 6.6).
- A deleted offer leaves a dangling `offerId`: the section shows « Formule supprimée » with « Retirer le lien »; the cost endpoint treats it as a create.
- Uncosted formula in the 07 table: when `offer.lines` is empty, « Coût / conv. » and « Marge % » print « — » with the title « Aucun plat lié à une recette » instead of 0 € and 100 %. This is the one tweak to 07 section 6.3.

### 3.4 DTOs (`packages/types/src/dto/offer-documents.ts`, new; `packages/types/src/dto/settings.ts`, extended)

```ts
import { z } from "zod";
import { moneyNonnegative, vatRate } from "./primitives";
import { DEFAULT_DOC_CONDITIONS, DEFAULT_DOC_SERVICES, DEFAULT_DOC_VAT_LINES } from "../entities/offer-document";

// Client-generated: crypto.randomUUID().slice(0, 8); the server checks uniqueness inside the document.
const docId = z.string().regex(/^[a-z0-9-]{1,40}$/);
const unitKind = z.enum(["convive", "piece", "unite"]);

export const docChoiceSchema = z
  .object({ count: z.number().int().min(1).max(20), scope: z.enum(["table", "convive"]), label: z.string().trim().max(80).optional() })
  .strict();

export const docRowSchema = z
  .object({
    rowId: docId,
    kind: z.enum(["plat", "exemple", "sous_titre", "note"]),
    text: z.string().trim().min(1).max(300),
    price: moneyNonnegative.optional(),
    fromPrice: z.boolean().optional(),
    priceNote: z.string().trim().max(80).optional(),
    unitLabel: z.string().trim().max(60).optional(),
    unitKind: unitKind.optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(4).optional(),
    choice: docChoiceSchema.optional(),
    recipeId: z.string().min(1).optional(),
  })
  .strict()
  .refine((r) => r.kind === "sous_titre" || r.choice === undefined, "choix réservé aux sous-titres");

export const docMinimumSchema = z
  .object({ qty: z.number().positive().max(10000), unit: z.enum(["personnes", "pieces", "unites"]), perSort: z.boolean().optional(), label: z.string().trim().max(80).optional() })
  .strict();

export const docSectionSchema = z
  .object({
    sectionId: docId,
    title: z.string().trim().min(1).max(120),
    intro: z.string().trim().max(300).optional(),
    price: moneyNonnegative.optional(),
    unitLabel: z.string().trim().max(60).optional(),
    unitKind: unitKind.optional(),
    minimum: docMinimumSchema.optional(),
    rows: z.array(docRowSchema).max(120),
    offerId: z.string().min(1).optional(),
  })
  .strict()
  // A priced row multiplies by its own kind or the section's.
  .refine((s) => s.rows.every((r) => r.price === undefined || r.unitKind !== undefined || s.unitKind !== undefined), "unité requise avec un prix");

export const docServicesSchema = z
  .object({ shown: z.boolean(), title: z.string().trim().min(1).max(60), intro: z.string().trim().max(300).optional(), rows: z.array(docRowSchema).max(12) })
  .strict();

export const docVatLineSchema = z.object({ label: z.string().trim().min(1).max(60), rate: vatRate }).strict();

// The plain object; create and update derive from it so a refine never blocks .partial().
const documentFieldsSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    year: z.number().int().min(2020).max(2100),
    season: z.enum(["printemps_ete", "automne_hiver", "toute_annee"]).optional(),
    prestationType: z.string().min(1).optional(),
    prestationLabel: z.string().trim().max(120).default("À emporter"),
    minGuests: z.number().int().positive().max(5000).optional(),
    maxGuests: z.number().int().positive().max(5000).optional(),
    guestsLabel: z.string().trim().max(120).optional(),
    note: z.string().trim().max(500).optional(),
    sections: z.array(docSectionSchema).max(40).default([]),
    services: docServicesSchema.default(DEFAULT_DOC_SERVICES),
    conditions: z.string().trim().max(2000).default(DEFAULT_DOC_CONDITIONS),
    vatLines: z.array(docVatLineSchema).max(12).default(DEFAULT_DOC_VAT_LINES),
    archived: z.boolean().optional(),
  })
  .strict();

// Section ids unique, row ids unique across the document and the services, at most 300 rows in the sections.
const idsAndSize = (d: { sections?: { sectionId: string; rows: { rowId: string }[] }[]; services?: { rows: { rowId: string }[] } }) => { /* ... */ return true; };

export const createOfferDocumentSchema = documentFieldsSchema.refine(idsAndSize, "identifiants en double ou plus de 300 lignes");
export type CreateOfferDocumentRequest = z.infer<typeof createOfferDocumentSchema>;

// Nullable scalars are removed from the stored document by the service. updatedAt is the stamp the client loaded (409 when it moved).
export const updateOfferDocumentSchema = documentFieldsSchema
  .partial()
  .extend({
    season: z.enum(["printemps_ete", "automne_hiver", "toute_annee"]).nullable().optional(),
    prestationType: z.string().min(1).nullable().optional(),
    minGuests: z.number().int().positive().max(5000).nullable().optional(),
    maxGuests: z.number().int().positive().max(5000).nullable().optional(),
    guestsLabel: z.string().trim().max(120).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    updatedAt: z.string().optional(),
  })
  .strict()
  .refine(idsAndSize, "identifiants en double ou plus de 300 lignes");
export type UpdateOfferDocumentRequest = z.infer<typeof updateOfferDocumentSchema>;

export const duplicateOfferDocumentSchema = z
  .object({ year: z.number().int().min(2020).max(2100), archiveSource: z.boolean().default(false) })
  .strict();
export type DuplicateOfferDocumentRequest = z.infer<typeof duplicateOfferDocumentSchema>;

export type BrandKind = "logo" | "banner";
export const BRAND_KINDS: BrandKind[] = ["logo", "banner"];
export const BRAND_IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };
export const MAX_BRAND_IMAGE_BYTES = 5 * 1024 * 1024;
```

`packages/types/src/dto/settings.ts`, `companySettingsSchema` gains:

```ts
phone: z.string().trim().max(40).optional(),
email: z.string().trim().max(80).optional(),
website: z.string().trim().max(80).optional(),
accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, "couleur hex").optional(),
```

`packages/types/src/dto/index.ts`: `export * from "./offer-documents";`.

`packages/types/src/dto/dto.test.ts` additions: `createOfferDocumentSchema` defaults `services`, `conditions`, `vatLines` and `prestationLabel`; a `choice` on a plat row is refused; a priced row with no unit kind on the row nor on the section is refused and accepted once the section has one; two rows with the same id are refused; 301 rows are refused; update accepts `note: null` and `season: null`; `companySettingsSchema` refuses `accent: "red"` and accepts `#e8847a`; `updateSettingsRequestSchema` strips `brandLogoKey`.

### 3.5 Storage, size, concurrency

- One item per document: `{ settingsId: "document:<uuid>", document, updatedAt }`. The settings table then holds three kinds of items (`global`, `offers`, `document:*`). `SettingsService` and `OffersService` read by key and never scan, so the new items are invisible to them (the 07 invariant « a Paramètres save and an offer save never conflict » holds; a document save conflicts with neither).
- Listing: `ddb.scanAll(settings)` filtered in memory on the `document:` prefix. The table is small (tens of items, a few hundred KB) and the cap of 60 documents keeps it so; a GSI is the step if that cap is ever raised.
- Size: the DTO caps (40 sections, 120 rows per section, 300 rows per document, text 300 chars, conditions 2000) keep any item under 60 KB. The carte à emporter (about 100 rows with its examples) is about 16 KB. One item per document, rather than one `documents` array item like `offers`, is what lets archived years accumulate without a size wall: ten documents in one array would be 150 KB, the 07 comfort limit, with no room for 2027.
- Concurrency: the editor sends the `updatedAt` it loaded with every PATCH; the service refuses with 409 `{ code: "DOCUMENT_CHANGED" }` when the stored stamp differs (the settings pattern), without retrying. A PATCH that sends no stamp (scripts) writes under the presence guard with the four-retry loop of `OffersService`. The client serialises its debounced patches so each carries the stamp returned by the previous one.
- Migration: none. The first document is created by the import or by « + Nouveau document ». `brandLogoKey`, `brandBannerKey`, `company.phone`, `company.email`, `company.website`, `company.accent` absent read as unset; the PDF prints the company name in the band when the logo is missing and skips the banner.

### 3.6 Versions and archiving

A document is self-contained (its rows carry their own prices), so archiving freezes nothing and costs nothing: « Archiver » sets `archived: true`, the row moves to the « Archivées » tab, the page becomes read-only with a gray Tag « Archivée » and the PDF stays downloadable. « Dupliquer pour 2027… » copies the document with the next year, new `documentId`, the same section and row ids, `offerId` cleared on every section (two documents must not drive one costed offer), and archives the source when the box is ticked (on by default). « Réactiver » clears the flag.

---

## 4. Libs

### 4.1 `packages/types/src/lib/offer-document.ts` (new) and `offer-document.test.ts`

Pure, no I/O. Exported from `packages/types/src/lib/index.ts`.

```ts
import type { CompanySettings, PrestationTypeSetting } from "../entities/settings";
import type { DocChoice, DocMinimum, DocRow, DocRowKind, DocSection, DocUnitKind, OfferDocument } from "../entities/offer-document";
import type { EventRevenueLine } from "../entities/event";
import type { Offer, OfferLine } from "../entities/offer";
import type { VatRate } from "../entities/ledger";
import type { CreateOfferRequest, UpdateOfferRequest } from "../dto/offers";

// The flat layout model the PDF reads. The renderer never looks at the entity.
export type DocPrintBlock =
  | { kind: "band"; text: string }                                                  // « OFFRE BUFFETS AUTOMNE HIVER 2026 »
  | { kind: "company"; lines: string[]; facts: [string, string][] }                 // left block; right key-values
  | { kind: "section"; title: string; intro?: string; price?: string; unit?: string; minimum?: string }
  | { kind: "row"; style: DocRowKind; text: string; price?: string; unit?: string; indent: 0 | 1 }
  | { kind: "services"; title: string; intro?: string; rows: { text: string; price?: string; unit?: string }[] }
  | { kind: "conditions"; text: string }
  | { kind: "vat"; rows: [string, string][] };

// ["Nombre minimum de personnes", "20"] when only minGuests is set; ["Nombre de personnes", "entre 8 et 14"] with both; the override as value when set; undefined when nothing is set.
export function guestsFact(d: Pick<OfferDocument, "minGuests" | "maxGuests" | "guestsLabel">): [string, string] | undefined;
// « minimum 20 pièces par sorte », « minimum 8 personnes », « minimum 12 unités »; the label override as is.
export function minimumLabelOf(m: DocMinimum): string;
// { 1, table } → « un choix pour la table »; { 4, table } → « sélection de 4 au choix »; { 2, convive } → « 2 au choix par convive »; the label override as is.
export function choiceLabelOf(c: DocChoice): string;
// Preset lookup (case and accent insensitive), else fallback ?? "unite".
export function unitKindOf(unitLabel: string | undefined, fallback?: DocUnitKind): DocUnitKind;
// « 2,25 € », « àpd 4,50 € », the priceNote when there is no price, undefined when neither.
export function priceLabelOf(row: Pick<DocRow, "price" | "fromPrice" | "priceNote">): string | undefined;
// « Offre buffets automne hiver 2026.pdf »: [\\/:*?"<>|] stripped, spaces collapsed, trimmed.
export function documentFileName(d: Pick<OfferDocument, "title" | "year">): string;
// The prestation's default rate, else 12.
export function foodVatRateOf(d: Pick<OfferDocument, "prestationType">, prestationTypes: PrestationTypeSetting[]): VatRate;
// The layout model, section 8. Money through fmtEur; tags appended « (chaud) »; examples prefixed « ex : »; a row unit printed only when it differs from the section unit; a choice appended to its sous_titre « Entrée (un choix pour la table) »; indent 1 for exemple rows and for rows under a sous_titre.
export function documentBlocks(d: OfferDocument, company: CompanySettings | undefined): DocPrintBlock[];
// Rows with a recipe, portionsPerGuest 1, or round2(choice.count / n) inside a choice group. course from the nearest sous_titre when it matches a category, else absent.
export function sectionRecipeLines(s: DocSection, categories?: string[]): OfferLine[];
// name default « <title> <year> › <section title> ». Keeps price, prestation, vatRate; unlinked plat rows listed in notes as « Plats sans recette : … ».
export function offerFromSection(d: OfferDocument, s: DocSection, prestationTypes: PrestationTypeSetting[], name?: string): CreateOfferRequest;
export function offerSyncFromSection(d: OfferDocument, s: DocSection, prestationTypes: PrestationTypeSetting[]): Pick<UpdateOfferRequest, "lines" | "sellingPricePerGuest" | "notes" | "vatRate" | "prestationType">;
// A formula section from a 07 offer: title = name, price = sellingPricePerGuest, « par personne », one plat row per line (recipe name, recipeId), offerId set. ids() supplies row and section ids.
export function sectionFromOffer(offer: Offer, recipeNameById: Map<string, string>, ids: () => string): DocSection;
// One revenue line per pick: label « Carte · Choux fourrés au saumon fumé × 60 », amount round2(qty × price), the given vatRate. Rows without a price are skipped.
export function revenueLinesFromRows(picks: { row: DocRow; qty: number }[], vatRate: VatRate): EventRevenueLine[];
// « Minimum 20 pièces par sorte : Sablés au comté (12) », « Minimum 8 personnes : Plateau apéro (6) ». Empty when every pick meets the section's or the row's minimum.
export function rowMinimumWarnings(section: DocSection, picks: { row: DocRow; qty: number }[], guests: number): string[];
// Counts for the list columns and the assistant.
export function documentSummary(d: OfferDocument): { sections: number; rows: number; priced: number; linked: number };
// The document and section whose offerId matches; undefined when none.
export function documentSectionFor(documents: OfferDocument[], offerId: string): { document: OfferDocument; section: DocSection } | undefined;
// Hex blended over white: mixWithWhite("#E8847A", 0.3) = "#F8DAD7". Used for the sub-header fill.
export function mixWithWhite(hex: string, share: number): string;
```

Tests (`offer-document.test.ts`): `guestsFact` for the four shapes; `minimumLabelOf` with `perSort`; `choiceLabelOf` for { 1, table }, { 4, table }, { 2, convive } and an override; `unitKindOf("Par Personne")` is `convive` and `unitKindOf("par 300 g")` is `unite`; `priceLabelOf` for 2,25, àpd 4,50 and a note; `documentFileName` of « Offre buffets automne hiver » 2026 and of a title with a slash; `foodVatRateOf` with `buffet_a_emporter` gives 6 and with no prestation 12; `sectionRecipeLines` on a chef-à-domicile entrée group of 7 with one linked row gives 0,14, on a buffet gives 1 per linked row, and ignores exemple rows; `offerFromSection` keeps the price and prestation and puts the unlinked rows in notes; `sectionFromOffer` round-trips through `offerSyncFromSection` with the same lines; `revenueLinesFromRows` rounds 60 × 2,25 to 135 and skips an unpriced row; `rowMinimumWarnings` flags 12 pieces under a 20-per-sort minimum, nothing at 20, and a per-guest row at 6 guests under « minimum 8 personnes »; `documentBlocks` on a two-section document yields one `section` block per section, exemple rows as `style: "exemple"` with `indent: 1`, the row unit only when it differs, the `vat` block last and no `services` block when `shown` is false; `mixWithWhite`.

### 4.2 Totals

No new totals lib. A formula section is costed by the 07 `quoteTotals` through its offer (`offerSummary` for the inline figure on the document page). Price-list rows enter a devis as revenue lines, so `quoteTotals`, `totalHtva`, `totalTvac` and `vatBreakdown` are unchanged.

---

## 5. Backend

### 5.1 Offer documents module (`apps/backend/src/offer-documents/`, new)

Files: `offer-documents.module.ts` (imports `AuthModule`, `OffersModule`, `SettingsModule`; exports `OfferDocumentsService`), `offer-documents.controller.ts`, `offer-documents.service.ts`, `offer-documents.service.spec.ts`, `fixtures/offer-documents-2026.json` (section 7), `offer-documents-2026.spec.ts`. Register in `app.module.ts`. `nest-cli.json` gains `"assets": [{ "include": "offer-documents/fixtures/*.json" }]` so the fixture reaches `dist`.

Endpoints (AdminGuard, `admin/offer-documents`):

- `GET /admin/offer-documents` → `OfferDocument[]`, archived included (the client filters), sorted year descending then `titleLower`.
- `GET /admin/offer-documents/:id` → the document; 404.
- `POST /admin/offer-documents` body `createOfferDocumentSchema` → the document. 400 « 60 documents maximum » past the cap.
- `PATCH /admin/offer-documents/:id` body `updateOfferDocumentSchema` → the document. Null scalars become REMOVE on the document object; `title` refreshes `titleLower`; a body `updatedAt` that differs from the stored stamp is 409 `{ code: "DOCUMENT_CHANGED" }`.
- `DELETE /admin/offer-documents/:id` → `{ ok: true }`; 404 when absent.
- `POST /admin/offer-documents/:id/duplicate` body `duplicateOfferDocumentSchema` → the copy (section 3.6).
- `POST /admin/offer-documents/:id/sections/:sectionId/offer` → `{ document, offer }`. When the section has an `offerId` that resolves, `OffersService.update(offerId, offerSyncFromSection(...))`; else `OffersService.create(offerFromSection(...))` and the section's `offerId` is written. 404 for an unknown section. Prestation types come from `SettingsService.get()`.
- `POST /admin/offer-documents/import-2026` → `{ created: string[]; skipped: string[] }` (section 7).

Service: `getAll` (scan, prefix filter), `get`, `create` (stamps `documentId`, `titleLower`, `createdAt`, `updatedAt`; `putIfAbsent`), `update` (`ddb.update(key, { document, updatedAt }, guardFor(current))` with the 409 rule above; `nextStamp` as in `offers.service.ts`), `delete`, `duplicate`, `costSection`, `importFixture`. The `guardFor`, `nextStamp` and `isConditionFailure` helpers are copied from `offers.service.ts` (three small functions; a shared file is not worth the churn on a 07 file).

Spec (`offer-documents.service.spec.ts`, fake `DdbService` as in `offers.service.spec.ts`): list filters the prefix and sorts year desc then title; create stamps and refuses the 61st; patch keeps fields it was not given, removes a null `note`, refreshes `titleLower`, and answers 409 on a stale `updatedAt`; delete of an unknown id is 404; duplicate bumps the year, clears every `offerId`, and archives the source when asked; `costSection` creates an offer named « Offre buffets automne hiver 2026 › Buffet 2 » and writes `offerId`, re-syncs lines on a second call, and recreates when the offer is gone; `importFixture` creates seven on an empty table and zero on a second run.

### 5.2 Settings: brand assets (`apps/backend/src/settings/settings.controller.ts`, `settings.service.ts`, `settings.service.spec.ts`)

`S3Service` is global (`SharedModule`), so the settings module injects it without a new import.

- `POST /admin/settings/brand/:kind` (`kind` in `BRAND_KINDS`, else 400). `FileInterceptor("file", { limits: { fileSize: MAX_BRAND_IMAGE_BYTES, files: 1 }, fileFilter: mimetype in BRAND_IMAGE_TYPES })`. No file: 400 « Image manquante ou format non pris en charge (JPEG ou PNG) ». Key `brand/${kind}.${BRAND_IMAGE_TYPES[mimetype]}` (the extension comes from the mimetype, never from the file name). When the stored key differs (a PNG replacing a JPEG) the old object is deleted after the upload. Writes `brandLogoKey` or `brandBannerKey` through `SettingsService.update` (unguarded, as scripts do) and returns the settings.
- As built: the key computation, the S3 upload and the deletion of the previous object live in the controller (`uploadBrand`, `removeBrand`); the service only exposes `brandKeyField(kind)` and `removeBrandKey(kind)`.
- `DELETE /admin/settings/brand/:kind` → deletes the object, removes the key (`SettingsService.removeBrandKey(kind)`, a direct `ddb.update` with `null` so the attribute is removed), returns the settings.
- `GET /admin/settings/brand/:kind` → 404 when the key is absent; else `s3.get(key)` streamed with `Content-Type` from S3 and `Cache-Control: private, max-age=86400`. The client appends `?v=<settings.updatedAt>` so a replaced image is refetched.

Spec: upload with `image/heic` is refused by the filter (400); upload writes `brand/logo.png` and the key; a second upload as JPEG deletes `brand/logo.png` and writes `brand/logo.jpg`; delete removes the object and the attribute; `get` is 404 without a key; `company.accent` round-trips and `brandLogoKey` in a PATCH body is dropped.

### 5.3 Assistant (`apps/backend/src/assistant/assistant.tools.ts`, `assistant.prompt.ts`, `assistant.tools.spec.ts`, `assistant.module.ts`)

`AssistantModule` imports `OfferDocumentsModule`. `CatalogueSummary` gains `documents: { documentId: string; title: string; year: number; season?: string; sections: { title: string; price?: number; unitLabel?: string }[] }[]` (titles and formula prices only, so the prompt stays small) and `formatCatalogue` prints « Documents d'offre :\n- Offre buffets automne hiver 2026 (documentId …) : Apéritif 8,50 € par personne ; Plateaux à partager ; Buffet 1 · Réconfort végétal 24,50 € … ».

Two read tools:

| name | arguments | returns |
|---|---|---|
| `get_offer_document` | `{ documentId }` | title, year, season, prestation, guests fact, note, sections with rows (`text`, `kind`, `price`, `fromPrice`, `priceNote`, `unitLabel`, `tags`, `choice`, `recipeId`), each section's `price`, `unitLabel`, `minimum`; services; conditions; VAT lines |
| `search_offer_rows` | `{ query: string; limit?: number }` | up to 20 of `{ documentId, documentTitle, year, sectionTitle, sectionPrice?, text, price?, fromPrice?, priceNote?, unitLabel?, minimum?, tags?, recipeId? }` ranked with the existing `nameScore` over `text`, archived documents excluded |

Both are wrapped and truncated like the others; tool summaries « Lecture de « Offre buffets automne hiver 2026 » » and « Recherche dans les offres « verrine vitello » ». The system prompt gains one sentence after the catalogue: « Les documents d'offre sont les brochures publiques ; leurs prix sont HTVA et ne se modifient que par l'utilisateur. » No `propose_*` for documents in this iteration; a quote from price-list rows goes through `quote_price` extras (label, amount, rate), which the model builds from `search_offer_rows`.

Spec additions: `search_offer_rows("vitello")` returns the carte row at 5,90 € before the buffet row; `get_offer_document` of an unknown id answers `{ error }`; the catalogue summary lists seven documents after the fixture is loaded into the fake service.

### 5.4 Scripts, seed, readme (`scripts/`, `readme.md`)

- `scripts/import-offer-documents.mjs` (new, Node 20, fetch, same login and env as `seed-local.mjs`): `POST /api/admin/offer-documents/import-2026`, prints one line per title « Offre buffets automne hiver 2026 · créée » / « · déjà présente ». Safe to re-run.
- `scripts/seed-local.mjs`: section 8 « Offer documents » calls the same endpoint, then uploads `scripts/fixtures/brand/logo.png` and `scripts/fixtures/brand/banner.jpg` (two small placeholder images drawn by the builder, a wordmark and a 1600 × 400 photo-like gradient; never her real files) through the brand endpoints, and PATCHes `company` with phone, e-mail, website and `accent` from the source file. Logs the document ids.
- `scripts/smoke-local.mjs`: three steps: `GET /api/admin/offer-documents` returns 7; a PATCH with a stale `updatedAt` is 409; `GET /api/admin/settings/brand/logo` is 200 `image/png`.
- `readme.md` deploy section: « After the deploy that adds the offer documents »: Dalia clicks « Importer les offres 2026 » on Offres › Documents, or the developer runs `API=$API SMOKE_EMAIL=… SMOKE_PASSWORD=… node scripts/import-offer-documents.mjs`; she uploads her logo and banner in Paramètres › Société. The brand images are never committed.

### 5.5 Backend test count

About 20 new cases (offer documents 11, settings 6, assistant 3) plus the fixture spec (section 7).

---

## 6. Screens

The ten rules of `docs/redesign/03-notion-ui.md` apply. French copy with vouvoiement.

### 6.1 Shared frontend pieces

**`apps/frontend/src/lib/api.ts`.**

```ts
offerDocuments: {
  list: cached("offerDocuments", () => request<OfferDocument[]>("/admin/offer-documents")),
  get: (id) => request<OfferDocument>(`/admin/offer-documents/${id}`),
  create: withInvalidate(["offerDocuments"], (data: CreateOfferDocumentRequest) => ...POST),
  update: withInvalidate(["offerDocuments"], (id, data: UpdateOfferDocumentRequest) => ...PATCH),
  delete: withInvalidate(["offerDocuments"], (id) => ...DELETE),
  duplicate: withInvalidate(["offerDocuments"], (id, data: DuplicateOfferDocumentRequest) => ...POST),
  costSection: withInvalidate(["offerDocuments", "offers"], (id, sectionId) => request<{ document: OfferDocument; offer: Offer }>(...)),
  import2026: withInvalidate(["offerDocuments"], () => request<{ created: string[]; skipped: string[] }>("/admin/offer-documents/import-2026", { method: "POST" })),
},
settings: {
  // ...existing...
  brand: {
    upload: withInvalidate(["settings"], (kind: BrandKind, file: File) => uploadRequest<AppSettings>(`/admin/settings/brand/${kind}`, file)),
    remove: withInvalidate(["settings"], (kind: BrandKind) => request<AppSettings>(`/admin/settings/brand/${kind}`, { method: "DELETE" })),
    url: (kind: BrandKind, version: string) => `${API_BASE}/admin/settings/brand/${kind}?v=${encodeURIComponent(version)}`,
  },
},
```

**`apps/frontend/src/lib/pdf-images.ts`** (new). `loadImageForPdf(url: string, opts?: { cropRatio?: number; maxWidth?: number }): Promise<PdfImage>` with `PdfImage = { dataUrl: string; format: "PNG" | "JPEG"; width: number; height: number }`: fetches with the admin token (as `RecipeDetail.loadPhotoForPdf` does today), decodes through an `Image`, and when `cropRatio` is given draws the cover-cropped centre onto a canvas (JPEG, quality 0,85, width capped at `maxWidth`, default 1600). `brandImage(kind: BrandKind, version: string, opts?)`: `loadImageForPdf(api.settings.brand.url(kind, version), opts)`, `null` on 404, cached in module memory by kind and version. `RecipeDetail.tsx` switches its `loadPhotoForPdf` to `loadImageForPdf` (Phase 5, group E).

**`apps/frontend/src/lib/offer-document-pdf.ts`** (new). `exportOfferDocumentPdf(input: { blocks: DocPrintBlock[]; accent: string; logo?: PdfImage; banner?: PdfImage; footer: string; fileName: string }): jsPDF`. Returns the document; callers `save(fileName)` or `output("bloburl")`. Layout in section 8.

**`apps/frontend/src/lib/page-icons.ts`**: `documents: "📄"`, `document: "📄"`.

**`apps/frontend/src/components/admin/OffersTabs.tsx`** (new). Props `{ current: "documents" | "formules" | "archivees"; base: "/offres/documents" | "/offres" }`. Renders `ViewTabs` with « Documents » (`to: "/offres/documents"`), « Formules » (`to: "/offres"`), « Archivées » (`to: `${base}?vue=archivees``). On `/offres` the archived tab lists archived formulas (07 behaviour kept), on `/offres/documents` archived documents; the count line under the title says which (« 2 documents archivés », « 1 formule archivée »).

**`apps/frontend/src/components/admin/DocSectionBlock.tsx`**, **`DocRow.tsx`** (new): the section and row blocks of the editor (6.3). **`DocumentPreviewDialog.tsx`** (new): Dialog `size="lg"` with an `<iframe title="Aperçu du PDF">` of the blob URL; on touch it opens the blob URL in a new tab instead and renders nothing. **`AddFromDocumentDialog.tsx`**, **`UseInEventDialog.tsx`** (new): 6.6. **`BrandAssetProperty.tsx`** (new): 6.5.

**`apps/frontend/src/components/admin/AdminSidebar.tsx`**: the « Offres » entry points to `/offres/documents`, active on `/offres` and `/devis` (`startsWith("/offres", "/devis")` already covers the sub-route).

**`apps/frontend/src/App.tsx`**: routes `/offres/documents` (`OfferDocuments`) and `/offres/documents/:id` (`OfferDocumentDetail`), declared before `/offres/:id`; React Router ranks the static segment above the param in any case.

**`apps/frontend/src/components/admin/tour-steps.ts`**: step `offers` route becomes `/offres/documents`, anchor `documents-list` (the documents table or empty state carries `data-tour="documents-list"`), title « Offres et devis », body « Documents : vos offres en PDF, à votre image (buffets, chef à domicile, carte à emporter). Formules : un menu type avec son prix par convive, costé par recette. Depuis une formule, Faire un devis prépare un prix pour un client et crée l'événement. » (211 characters), `fallbackBody` the same; phone same anchor.

### 6.2 Documents list (`/offres/documents`, `apps/frontend/src/pages/admin/OfferDocuments.tsx`, `max-w-wide`)

```
 📄 Offres                                                              [Devis]  ⋯  [+ Nouveau document]
 7 documents
 [Documents] [Formules] [Archivées]                                                    🔍  Trier ▾
 ──────────────────────────────────────────────────────────────────────────────────────────────────
 Titre                                Saison            Année   Prestation             Sections   Modifié
 Offre buffets automne hiver          Automne-hiver     2026    Avec ou sans service…  9          12 oct.   ⋯
 Carte à emporter                     Toute l'année     2026    Sans service, A emp…   9          12 oct.   ⋯
```

Columns: « Titre » (link to `/offres/documents/:id`), « Saison » (gray Tag: Printemps-été, Automne-hiver, Toute l'année; blank when none), « Année », « Prestation » (`prestationLabel` truncated at 28 characters, the full text as `title`), « Sections » (count), « Modifié » (`dayMonthLabel(updatedAt)`). Trier: Année (default, descending, then titre), Titre, Modifié. Row ⋯ (`reveal`): « Télécharger le PDF », « Dupliquer pour 2027… », « Archiver » / « Réactiver », « Supprimer ». Phone: the Table's list shape, the year trailing.

Toolbar: `OffersTabs current="documents" base="/offres/documents"`; « Devis » (default, → `/devis`); ⋯ with « Importer les offres 2026 » (Dialog « Importer les sept offres de 2026 ? », caption « Brunch à emporter, chef à domicile, walking dinner, buffets printemps-été et automne-hiver, baptême, carte à emporter. Les plats et les prix sont repris tels quels ; vous pourrez tout modifier. Les documents déjà présents (même titre et même année) ne sont pas touchés. », primary « Importer »; toast « 7 documents importés » or « 3 documents importés · 4 déjà présents », with « Ouvrir » on the first created); the page primary « + Nouveau document » creates « Nouveau document » (current year, defaults) and opens it.

Empty state: « Aucun document. Un document est l'offre que vous envoyez : formules, prix, conditions, en PDF à votre image. » with « + Nouveau document » and, as the default button, « Importer les offres 2026 ». « Archivées » empty: « Aucun document archivé. ».

### 6.3 Document editor (`/offres/documents/:id`, `apps/frontend/src/pages/admin/OfferDocumentDetail.tsx`, `max-w-doc`)

```
 Offres / Documents / Offre buffets automne hiver 2026                      [Aperçu]  ⋯  [Télécharger le PDF]
 📄 Offre buffets automne hiver                                                              title, inline editable
 📅 Année                 2026
 🍂 Saison                (Automne-hiver ▾)
 🍽 Prestation            Avec ou sans service, A emporter ou avec livraison
 🧾 Type                  (Buffet avec service ▾)         Sert au devis et à la TVA food (12 %)
 👥 Convives              min 20 · max —                  Imprimé : « Nombre minimum de personnes : 20 » · Modifier le texte
 📝 Note                  Chaque élément (apéro, buffet, dessert, mignardises) peut se choisir séparément.
 ───────────────────────────────────────────────────────────────────────────────────────── hairline
 ▌APERITIF                                                                  8,50 €  (par personne ▾)   ⋯
   Plateau apéro (crudités de saison, dip, crackers, noix, fromage et olives)                         ⋯
   Bouchées apéritives (3 pièces / personne), à passer sur plateaux                                   ⋯
   ex : sablé au comté et mousse de chèvre, blinis mousse de truite, …                                ⋯
   + Ligne
 ▌PLATEAUX A PARTAGER · minimum 8 personnes                                        (par personne ▾)   ⋯
   Plateau apéro (crudités de saison, …)                                     4,20 €  par personne     ⋯
   Plateau antipasti (printemps/été) (…)                                     9,50 €  par personne     ⋯
   + Ligne
 ▌BUFFET 2, La Tavola Italiana                                              34,50 €  (par personne ▾)   ⋯
   Vitello tonnato, artichauts grillés, parmesan, roquette                                            ⋯
   Polpettes italiennes, sauce tomate mijotée, parmesan  [chaud]                                      ⋯
   …
   Coût moyen 11,40 € / conv. · marge 67 % · 2 plats sans recette · Ouvrir la formule     (when offerId is set)
 + Section ▾                                                        Nouvelle section · Depuis une formule…
 Services · affichés                                                                       Masquer   ⋯
   (SERVICES ▾)  Service sur place (en fonction du type d'événement et du nombre de convives)
   Tarif horaire par cuisinier                                             50,00 €  €/heure (htva)   ⋯
   Transport                                                                forfait (htva) en fonction de l'adresse   ⋯
 Conditions                                                                    Reprendre le texte standard
   Le retrait des commandes et le retour des plats s'effectue à Overijse …
 TVA                                                                                      + Ligne
   Food à emporter        (6 % ▾)   ×
   Food avec service      (12 % ▾)  ×
   Extras                 (21 % ▾)  ×
```

Properties (rule 8, no bordered inputs):

- « Année » (number, min 2020).
- « Saison » (select: Printemps-été, Automne-hiver, Toute l'année, Aucune).
- « Prestation » (text, placeholder « Avec service, à emporter… », printed as typed in « Type de prestation : »).
- « Type » (select over the prestation types, « Aucun » allowed; sub « Sert au devis et à la TVA food (12 %) » with the resolved rate).
- « Convives » (custom): two `EditableInlineNum` « min » and « max » (placeholder « — »), then a muted « Imprimé : « Nombre minimum de personnes : 20 » » from `guestsFact` and a link-button « Modifier le texte » that turns the printed value into an `EditableInlineText` override (`guestsLabel`); clearing the override returns to the derived text. Nothing set: « Non imprimé ».
- « Note » (multiline, placeholder « Ajouter une note »).

The band of the PDF prints `${title} ${year}` upper-cased; the editor keeps her casing.

Sections are blocks:

- Section header row, 40 px (44 on touch): a 3 px bar on the left in `company.accent` (the band is salmon only in the PDF; the editor stays white, rule 1), the title as `EditableInlineText` 14/600 (placeholder « Titre de la section »), the `intro` as a second muted inline text (placeholder « Ajouter une mention sous le titre »), the minimum as a muted chip « minimum 8 personnes » (click opens a Menu: `NumericInput` « Quantité », `MenuRadio` personnes / pièces / unités, `MenuCheck` « par sorte », an inline « Texte imprimé » override, « Retirer »; when absent a `reveal` link « + Minimum »). On the right the price (`EditableInlineNum`, placeholder « Prix », suffix « € », empty allowed) and the unit `SelectPill` over `DOC_UNIT_PRESETS` plus « Autre… » (inline text). An empty price means a price list: the caption under the header reads « Liste de prix : chaque ligne a son prix. » in muted 12.
- Section ⋯: « Coster cette formule » (formula without `offerId`; calls `api.offerDocuments.costSection`, toast « Formule « Buffet 2 » créée » with « Ouvrir »; disabled with the title « Liez d'abord un plat à une recette » when no row has a recipe), « Mettre à jour la formule » and « Ouvrir la formule » (linked), « Retirer le lien » (dangling), « Créer un devis depuis cette formule » (formula), « Utiliser dans un événement… » (formula), « Ajouter au devis… » (price list, → `/devis?document=<id>&section=<sectionId>`), « Monter », « Descendre », « Dupliquer la section », « Supprimer la section » (Dialog « Supprimer « Buffet 2 » et ses 6 lignes ? », danger « Supprimer »; caption « La formule costée, si elle existe, n'est pas supprimée. »).
- Rows, 36 px (44 on touch), `ListRow`-shaped: drag grip (`reveal`, pointer only), the text as `EditableInlineText` (Enter saves and opens a new plat row below; Shift+Enter inserts a line break; Backspace on an empty row deletes it and focuses the previous one; Escape cancels), tags as small gray Tags after the text (click removes; ⋯ « Ajouter une mention » lists `DOC_TAG_PRESETS` plus a free text), a blue Tag « Recette » when `recipeId` is set (click opens `/recipes/:id`), the price and unit on the right (hidden on the rows of a formula section unless the row has a price; shown on every row of a price list), ⋯ `reveal`.
  - `exemple` rows: italic, `text-muted-foreground`, a rendered prefix « ex : » (not stored), no price column, indented.
  - `sous_titre` rows: 14/600 on a `bg-callout` band, optional chip « un choix pour la table » (Menu: `NumericInput` « Nombre », `MenuRadio` « pour la table » / « par convive », inline « Texte imprimé », « Retirer »; absent: `reveal` « + Choix »).
  - `note` rows: bold italic.
  - Price cell: `EditableInlineNum` « € »; ⋯ « Prix à partir de » (`MenuCheck`, prints « àpd »); « Mention de prix… » (inline text for `priceNote`, shown in the price column in muted italic when there is no price).
  - Row ⋯: « Transformer en » (`MenuRadio` Plat, Exemple, Sous-titre, Note), « Ajouter une mention », « Lier à une recette… » (`SearchSelect` over recipes with `onCreateNew` → `NewRecipeDialog`, category from the nearest sous_titre when it matches a category, else « Plat »), « Retirer la recette » (linked), « Prix à partir de », « Mention de prix… », « Insérer un exemple dessous », « Monter », « Descendre », « Déplacer vers… » (`MenuRadio` over the other sections), « Supprimer ».
  - Reorder inside a section: HTML5 drag on pointer, `useLongPressDrag` on touch; across sections through « Déplacer vers… ».
- « + Ligne » (ghost, under the rows). « + Section » (ghost under the last section) is a Menu: « Nouvelle section » (creates « Nouvelle section », focuses its title) and « Depuis une formule… » (a Dialog `size="sm"` « Ajouter une formule » with a `SearchSelect` over active offers; `sectionFromOffer`, the recipe names from `api.recipes.list`; primary « Ajouter »).
- Services: a Section whose meta reads « affichés » or « masqués » with the action link « Masquer » / « Afficher » (`services.shown`); the title is a `SelectPill` over `DOC_SERVICES_TITLES` plus « Autre… »; the intro an inline text; rows as above with the price column always visible; « + Ligne ».
- Conditions: multiline inline text; the link « Reprendre le texte standard » when the text differs from `DEFAULT_DOC_CONDITIONS`.
- TVA: rows with the label (`EditableInlineText`, datalist `DOC_VAT_LABELS`) and the rate `SelectPill` 0 / 6 / 12 / 21, × `reveal` (⋯ « Retirer » on touch), « + Ligne ».

Costed formula sub (under the rows, muted 12): « Coût moyen 11,40 € / conv. · marge 67 % · 2 plats sans recette · Ouvrir la formule » from `offerSummary` of the linked offer with the 07 recipe maps; « coût moyen » because a choice group is costed as its average. « Formule supprimée » in red with « Retirer le lien » when the offer is gone.

Saving: every edit patches the part it touched (`sections`, `services`, `conditions`, `vatLines`, or one scalar) with a 300 ms debounce and the loaded `updatedAt`; patches are queued so each carries the stamp returned by the previous one; a 409 reloads and toasts « Le document a changé ailleurs, il a été rechargé ». Page ⋯: « Dupliquer pour 2027… » (Dialog: « Année » prefilled year + 1, `Checkbox` « Archiver la version 2026 » on by default, primary « Dupliquer »; opens the copy), « Archiver » / « Réactiver », « Supprimer » (Dialog « Supprimer « Offre buffets automne hiver 2026 » ? », caption « Les formules et les événements créés depuis ce document ne changent pas. », danger « Supprimer »). An archived document shows a gray Tag « Archivée » next to the title, every editor is read-only, and « Télécharger le PDF » stays.

« Aperçu » (default button) builds the PDF in memory and opens `DocumentPreviewDialog` (on touch: a new tab with the blob URL; iOS shows its viewer and the share sheet). « Télécharger le PDF » is the page primary and calls `doc.save(documentFileName(d))`. Both show a `Callout tone="warning"` above the properties, « Logo et bannière manquants · Les ajouter dans Paramètres › Société », when neither image is set; the PDF then prints the company name in the band and skips the banner. Toast after a download: « PDF téléchargé ».

Phone: the properties stack; a row's price and unit move under the text as a second muted line; « Télécharger le PDF » sits in the sticky bottom bar; « Aperçu » goes to ⋯.

### 6.4 07 pages edited (`Offers.tsx`, `OfferDetail.tsx`)

`Offers.tsx`: the ViewTabs « Actives | Archivées » become `OffersTabs current="formules" base="/offres"` (the `?vue=archivees` list is unchanged); the count line reads « 6 formules »; the primary reads « + Nouvelle formule »; the empty state reads « Aucune formule. Une formule est un menu avec son prix par convive, à partir duquel vous faites un devis. Vos documents d'offre sont dans l'onglet Documents. »; « Coût / conv. » and « Marge % » print « — » (title « Aucun plat lié à une recette ») when `lines` is empty. Nothing else moves.

`OfferDetail.tsx`: under the title, when `documentSectionFor(documents, offerId)` finds one, a muted line « Formule de « Offre buffets automne hiver 2026 » › Buffet 2 » whose document part links to the document. Only change.

### 6.5 Paramètres › Société (`apps/frontend/src/pages/admin/Settings.tsx`)

After « Adresse »: « Téléphone », « E-mail », « Site web » (kind text, saved with the section). Then « Couleur d'accent » (custom: a 28 px swatch that is a native `<input type="color">` next to the hex as `EditableInlineText`; default `DEFAULT_BRAND_ACCENT`; caption « Les bandes de titre des documents d'offre. »), « Logo » and « Bannière » (`BrandAssetProperty`: a 40 px-tall thumbnail from `brandImage(kind, settings.updatedAt)` or a dashed placeholder, « Ajouter » / « Remplacer » bound to a hidden `<input type="file" accept="image/jpeg,image/png">`, « Retirer » as a danger link; uploads call `api.settings.brand.upload` at once, outside the section's dirty state; toasts « Logo enregistré », « Bannière retirée », or the server reason; a file over 5 Mo is refused client-side with « Image trop volumineuse (max 5 Mo) », a HEIC with « Format non pris en charge (JPEG ou PNG) »). Caption under « Bannière »: « Imprimés en tête des documents d'offre. JPEG ou PNG, 5 Mo max. La bannière est recadrée en 4:1 (1600 × 400 px conseillé). ». The section caption becomes « Repris dans l'en-tête des exports comptables et des documents d'offre. ».

### 6.6 Devis and events

**Section → devis (« Créer un devis depuis cette formule »).** Navigates to `/devis?document=<id>&section=<sectionId>`. `Devis.tsx` prefills once, in this order: « Prestation » from `document.prestationType`, « TVA » from `foodVatRateOf`, « Convives » from `minGuests` (20 when absent), « Prix proposé » par convive from `section.price`, the menu from `sectionRecipeLines`, `loadedFrom = { documentId, sectionId, title: "Offre buffets automne hiver 2026 › Buffet 2" }`. When the section has an `offerId` that resolves, the page loads that offer instead (`?offre=` behaviour) and keeps `loadedFrom` for the label.

Devis extension, under the Menu section, when `loadedFrom.sectionId` is set and the section has plat rows without a recipe: a muted block « Plats de « Buffet 2 » sans recette · 4 » listing them in italic, each with a link « Lier » (the same « Lier à une recette… » search; linking patches the document and moves the row into the menu), caption « Non comptés dans le coût matières. ». The « Coût matières / conv. » tile adds the red sub « 4 plats sans recette ». « Créer l'événement » writes those rows into the event `notes` as « Buffet 2 · La Tavola Italiana : Vitello tonnato… · Polpettes… ». The footer gets a ghost « Document (PDF) » when `loadedFrom.documentId` is set (downloads the document's PDF; the « Proposition de menu (PDF) » stays recipes-only).

**Price-list rows → devis (« + Depuis un document… »).** `AddFromDocumentDialog` opens from the Devis menu footer next to « + Depuis une autre offre… », and from `?document=&section=` when the section is a price list. Dialog `size="md"` (Sheet on touch) « Ajouter depuis un document »: `SelectPill` « Document » over active documents, then one group per section with its title and minimum, a `Checkbox` row per plat row « Choux fourrés au saumon fumé · 2,25 € à la pièce »; a checked row with `unitKind !== "convive"` shows a `NumericInput` « Quantité » (default the minimum, else 20 for pieces and 1 for units); per-guest rows default to the devis guests. Unpriced rows are listed muted and unselectable. Footer « Annuler » / primary « Ajouter 3 lignes ». Result:

- rows with a `recipeId` → `OfferLine`s through `mergeOfferLines` (`portionsPerGuest` 1 for per-guest rows, `round2(qty / guests)` for pieces and units);
- rows without a recipe → `revenueLinesFromRows` at the document's food rate (`foodVatRateOf`), label « Carte · Choux fourrés au saumon fumé × 60 », amount 135,00, rate 6 or 12. They land in « Service, livraison, autres », editable there; the section meta reads « 585,00 € dont 450,00 € carte ». Caption under the tiles: « 3 articles de la carte sans recette : revenu compté, coût non compté. »;
- `rowMinimumWarnings` shows a `Callout tone="warning"` « Minimum 20 pièces par sorte : Sablés au comté (12) » above the dialog footer; never blocking.

This reuses the 07 arrays with no new event field; the compromise (a carte article is revenue at the food rate inside « Service, livraison, autres ») is open question 9.

**Section → event (« Utiliser dans un événement… »).** `UseInEventDialog` `size="sm"` (Sheet on touch) « Utiliser « Buffet 2 » dans un événement »: `SelectPill` « Nouvel événement | Événement existant ».

- Nouvel événement: « Nom » (default « Buffet 2 · La Tavola Italiana »), « Date » (required), « Convives » (default `minGuests` or 20), « Client » (relation, optional, `onCreateNew` → `NewClientDialog`), caption « Le prix par convive et les plats liés à une recette sont repris ; les autres plats vont dans les notes. », primary « Créer ». Builds a transient offer with `offerFromSection`, calls `eventFromOffer` with `notes` = the unlinked rows plus « Depuis le document Offre buffets automne hiver 2026 »; `offerId` only when the section is costed. Navigates to `/events/:id`.
- Événement existant: `SearchSelect` over upcoming events (soonest first, date as detail), caption « Les plats liés à une recette sont ajoutés au menu ; le prix de l'événement ne change pas. », primary « Ajouter ». Calls `api.events.lines.add` for each line of `linesForGuests(sectionRecipeLines(section), event.guestCount)` and appends the unlinked rows to the event notes; toast « 4 recettes ajoutées à « Mariage Dupont » · prix inchangé », action « Ouvrir ».

The event page shows nothing document-specific; « Enregistrer comme offre type » keeps working.

### 6.7 Assistant

Read-only (5.3). The sheet's welcome chips are unchanged; the context store does not publish document pages in this iteration (the assistant finds documents by title through `search_offer_rows` and the catalogue summary).

---

## 7. Import

### 7.1 The fixture (`apps/backend/src/offer-documents/fixtures/offer-documents-2026.json`)

A JSON array of seven `CreateOfferDocumentRequest` objects, in this order, transcribed one to one from `docs/redesign/workings/offers-source-2026.md` by the builder of Phase 3 group A. The structure of one entry:

```json
{
  "title": "Offre buffets automne hiver",
  "year": 2026,
  "season": "automne_hiver",
  "prestationType": "buffet_avec_service",
  "prestationLabel": "Avec ou sans service, A emporter ou avec livraison",
  "minGuests": 20,
  "note": "Chaque élément (apéro, buffet, dessert, mignardises) peut se choisir séparément.",
  "sections": [
    {
      "sectionId": "aperitif",
      "title": "APERITIF",
      "price": 8.5,
      "unitLabel": "par personne",
      "unitKind": "convive",
      "rows": [
        { "rowId": "aperitif-plateau", "kind": "plat", "text": "Plateau apéro (crudités de saison, dip, crackers, noix, fromage et olives)" },
        { "rowId": "aperitif-bouchees", "kind": "plat", "text": "Bouchées apéritives (3 pièces / personne), à passer sur plateaux" },
        { "rowId": "aperitif-ex", "kind": "exemple", "text": "sablé au comté et mousse de chèvre, blinis mousse de truite, bouchée de saumon mariné, tartare de boeuf huile de truffe, brochette de poulet sauce saté, mini kefta et sauce yaourt, brochette de pastèque féta menthe, brochette melon jambon, mini salade césar, liste non exhaustive" }
      ]
    },
    {
      "sectionId": "plateaux",
      "title": "PLATEAUX A PARTAGER",
      "unitLabel": "par personne",
      "unitKind": "convive",
      "minimum": { "qty": 8, "unit": "personnes" },
      "rows": [
        { "rowId": "plateaux-apero", "kind": "plat", "text": "Plateau apéro (crudités de saison, dip, crackers, noix, fromage et olives)", "price": 4.2 },
        { "rowId": "plateaux-antipasti", "kind": "plat", "text": "Plateau antipasti (printemps/été) (légumes grillés, mozzarella, sélection de fromages et charcuteries, noix, olives et focaccia maison)", "price": 9.5 }
      ]
    },
    {
      "sectionId": "buffet-2",
      "title": "BUFFET 2, La Tavola Italiana",
      "price": 34.5,
      "unitLabel": "par personne",
      "unitKind": "convive",
      "rows": [
        { "rowId": "b2-vitello", "kind": "plat", "text": "Vitello tonnato, artichauts grillés, parmesan, roquette" },
        { "rowId": "b2-polpettes", "kind": "plat", "text": "Polpettes italiennes, sauce tomate mijotée, parmesan", "tags": ["chaud"] }
      ]
    }
  ],
  "services": { "shown": true, "title": "EXTRAS", "intro": "Service sur place (en fonction du type d'événement et du nombre de convives)", "rows": [ "…four rows as in DEFAULT_DOC_SERVICES, serveur at 50 on this sheet…" ] },
  "conditions": "Le retrait des commandes …",
  "vatLines": [ { "label": "Food", "rate": 12 }, { "label": "Services", "rate": 21 } ]
}
```

Transcription rules:

- Titles and years: « Offre brunch à emporter » 2025 (`toute_annee`, `prestationType` `buffet_a_emporter`, prestationLabel « A emporter », minGuests 20, note « Devis sur mesure pour les groupes de plus de 30 personnes », services title « SERVICE (FACULTATIF) » with cuisinier and serveur both at 50, VAT « Food à emporter » 6 / « Food avec service » 12 / « Extras » 21); « Offre chef à domicile » 2026 (`automne_hiver`, `chef_a_domicile`, « Avec service », minGuests 8, maxGuests 14, guestsLabel « entre 8 et 14 personnes », note « Si plus que 14 personnes, location de matériel et personnel en plus. », one section « FOOD » at 65 with sous_titre rows « Apéritif », « Entrée » choice { 1, table }, « Plat » choice { 1, table }, « Dessert » choice { 1, table }, the dishes with tags froid / tiède / chaud, then « Assortiment de mignardises »); « Offre walking dinner » 2026 (`automne_hiver`, `walking_cocktail`, « Avec service », 30 to 150, one section at 59 with sous_titre « Apéritif », « Petites assiettes / bols » choice { 4, table, label « sélection de 4 assiettes au choix » }, « Froid », « Chaud », « Desserts », the bold note on the crockery as a `note` row; VAT line « Services » 21); « Offre buffets printemps été » 2026 (`printemps_ete`, `buffet_avec_service`, minGuests 20, APERITIF 8,50, BUFFET 1 to 4 at their prices, the « Vous souhaitez interchanger… » line as a `note` row appended to BUFFET 4, BUFFET DE DESSERTS 5,25 with its intro, MIGNARDISES 32 « par boîte de 20 pièces » `unite`; VAT « Food » 12 / « Services » 21); « Offre buffets automne hiver » 2026 (same shape, PLATEAUX A PARTAGER as a price list with minimum 8 personnes, BUFFET 1 to 5, services title « EXTRAS », cuisinier and serveur at 50); « Offre baptême » 2026 (`toute_annee`, `buffet_a_emporter`, « à emporter », guestsLabel « à partir de 20 personnes », a formula section « Formule buffet de baptême Convivial » at 33 and a price-list section « Envie de compléter votre buffet ? » with intro « Quelques options peuvent être ajoutées sur demande », rows « Boîte antipasti à partager (…) » 58 « pour 6 personnes » `unite`, « Verrines salées » 4,50 `fromPrice` « à la pièce », « Verrines sucrées » 3,50 `fromPrice`, « Croûte aux fraises » and « Pavlova aux fruits de saison » with `priceNote` « supplément en fonction du nombre de personnes »; services `shown: false`; VAT « Food à emporter » 6 / « Food avec service » 12 / « Livraison / location matériel » 21); « Carte à emporter » 2026 (`toute_annee`, `buffet_a_emporter`, « Sans service, A emporter ou avec livraison », minGuests 8, guestsLabel « 8, sauf certains éléments, voir détails », note « Chaque élément peut se choisir séparément. », nine price-list sections with their minimums: finger food froids and chauds { 20, pieces, perSort }, verrines salées { 12, pieces, label « min par 12 » }, mini sandwichs { 10, personnes }, verrines sucrées { 10, pieces, label « minimum par 10 » }; section units « à la pièce », « par personne », « gâteau 8 parts », « par boîte de 20 pièces »; the pavlova vase with its own unitLabel « entre 12 et 20 personnes, prix par personne » and `unitKind` `convive`; tags « en saison », « sans gluten »; services `shown: false`; VAT « Food » 12 / « Services » 21).
- Examples: the « (par exemple: …, liste non exhaustive) » text of a dish becomes an `exemple` row right under it, without the « ex : » prefix.
- Tags: « (chaud) », « (tiède) », « (chaud / tiède / froid) », « (sans gluten) », « (en saison) » are stripped from the text and stored in `tags`.
- Services: each document keeps the rates of its own sheet (the serveur is 40 on chef and walking dinner, 50 on brunch and buffets automne hiver); open question 7.
- No `recipeId` anywhere. Section and row ids are stable slugs (`b2-vitello`) so a re-transcription is diffable.
- Dish names are copied exactly, accents and typos included (« Tzatzíki », « céléri-rave », « Balotines »); Dalia corrects in the editor.

### 7.2 The fixture spec (`apps/backend/src/offer-documents/offer-documents-2026.spec.ts`)

Reads the JSON; every entry parses with `createOfferDocumentSchema`; seven entries; the titles and years match the seven headings of the source file (« Offre brunch à emporter » 2025 … « Carte à emporter » 2026); the carte à emporter has 11 sections and more than 80 rows; every priced row resolves a unit kind (own or section); every `sous_titre` with a `choice` is followed by at least two plat rows; the buffets automne hiver document has sections titled APERITIF, PLATEAUX A PARTAGER, BUFFET 1 to BUFFET 5, BUFFET DE DESSERTS and MIGNARDISES with prices 8,5, none, 24,5, 34,5, 35,5, 38,5, 44,5, 5,25, 32; `documentFileName` of the fifth gives « Offre buffets automne hiver 2026.pdf ».

### 7.3 Loading and idempotency

`POST /admin/offer-documents/import-2026` (`OfferDocumentsService.importFixture`): reads the JSON from `__dirname/fixtures`, parses every entry (a parse failure is a 500 with the issue list; the spec above prevents it), lists the existing documents, skips every entry whose `titleLower` and `year` already exist, creates the others in order, returns `{ created, skipped }` as titles. Never updates an existing document, so her edits survive a re-run. Three ways in: the button (6.2), the script (5.4), the seed (5.4). Company fields are not touched by the import (open question 13).

---

## 8. PDF layout

### 8.1 Approach: jspdf and jspdf-autotable, one renderer for the preview and the download

Why not the print route: the salmon bands and the banner only print when the browser's « Background graphics » option is on (off by default in Chrome and Safari); the file name is chosen by the browser; the iPad print sheet is two taps further than a share sheet. `jspdf` and `jspdf-autotable` are already dependencies (`menu-pdf.ts`, the recipe fiche, the grocery list), `RecipeDetail` already proves the image path, and autotable handles wrapping, row-level page breaks and cell fills. The preview is the generated PDF itself, so there is no second renderer to keep in sync. `documentBlocks` (4.1) is the only reader of the entity; `exportOfferDocumentPdf` reads blocks and never the entity.

### 8.2 Page, fonts, colours

- A4 portrait, 210 × 297 mm, margins 15 mm, content width 180 mm, `unit: "mm"`.
- Fonts: Helvetica core, four faces (normal, bold, italic, bolditalic). WinAnsi covers é è à ç ô œ € « ». `pdfText` from `menu-pdf.ts` (exported there, or duplicated: one line) replaces the narrow no-break space of `fmtEur` with a plain space. No TTF embedding in this iteration (open question 1).
- Colours: text `#37352f`; muted `#787774`; rules `rgba(55,53,47,0.16)` rendered as `#d3d2cf`; accent `company.accent ?? DEFAULT_BRAND_ACCENT` (`#E8847A`, sampled from her title band); sub-header fill `mixWithWhite(accent, 0.3)` (`#F8DAD7` for the default); table head text on the accent band stays dark (contrast 4,4:1 on the default accent, bold only).

### 8.3 Page 1 header

1. Logo top-left at (15, 12), scaled into 40 × 18 mm keeping its ratio (`PdfImage.format` passed to `addImage`, so a PNG keeps its transparency). Without a logo: the company name in bold 14 at the same spot.
2. Banner under it at y = 33, full width 180 mm × 45 mm, cover-cropped to 4:1 by `loadImageForPdf({ cropRatio: 4 })` before `addImage` (JPEG). Without a banner: nothing, the band moves up.
3. Title band: full width, 12 mm tall, filled with the accent, text `blocks.band.text` (« OFFRE BUFFETS AUTOMNE HIVER 2026 ») bold 16, centred vertically and horizontally.
4. Company block, two columns, 4 mm under the band. Left column 95 mm, 9 pt: name bold, then address, « TVA BE0766.607.232 », phone, e-mail, website, one per line (blank lines skipped). Right column 85 mm, 9 pt: each fact as a bold label « Type de prestation : » followed by the value in normal weight, wrapped with `splitTextToSize` at 85 mm; facts are « Type de prestation », the guests fact (`guestsFact`), « Note ».
5. Column heads, 5 mm under the taller column: a 0,3 mm rule, then « Description » left and « Coût unitaire/pers (htva) » right-aligned at x = 195, bold 9; a second rule 1 mm under the text. The same heads are drawn at the top of every following page (y = 15) by `pageTop()`, called from each table's `didDrawPage` when the page number changed and after every manual `addPage()`.

### 8.4 Body: one autoTable per section

Before each section: if `pageHeight − 15 − cursorY < 32` mm, `addPage()` (a band never sits alone at the bottom; 32 mm is a band plus two rows). Then one `autoTable` call, `theme: "plain"`, `startY: cursorY`, `margin: { left: 15, right: 15 }`, `columnStyles: { 0: { cellWidth: 140 }, 1: { cellWidth: 40, halign: "right" } }`, `rowPageBreak: "avoid"`, `styles: { font: "helvetica", fontSize: 10, textColor: "#37352f", cellPadding: { top: 1.4, bottom: 1.4, left: 2, right: 2 } }`, `showHead: false`, with the rows built from the blocks:

- The section row: `fillColor: accent`, bold 11, the title in cell 0 (with the `intro` as a second line, italic 9, when set; the `minimum` appended to the title « · minimum 8 personnes » when set); cell 1 the price bold 11 « 34,50 € » with the unit under it in normal 8 (« par personne »), or empty for a price list (cell 1 then shows the section unit in 8 muted so the reader knows the column's unit). `minCellHeight` 8.
- `sous_titre` rows: `fillColor: mixWithWhite(accent, 0.3)`, bold 10, `colSpan: 2`, the choice already appended by the lib « Entrée (un choix pour la table) ». `minCellHeight` 6,5.
- `plat` rows: normal 10, text in cell 0 (tags already in parentheses), cell 1 the price « 2,25 € » (or « àpd 4,50 € », or the `priceNote` italic 8 muted) with the unit under it in 8 muted when the lib emitted one. Indent 1 adds 4 mm of left padding.
- `exemple` rows: italic 9, muted, « ex : … » prefixed by the lib, left padding 6 mm, `colSpan: 2`.
- `note` rows: bolditalic 10, `colSpan: 2`.
- `didParseCell` applies the styles above from a `styleByRow` array built alongside the rows; `didDrawPage` draws the footer and calls `pageTop()` on a new page.
- Cursor: `doc.lastAutoTable.finalY + 3`.

Choice of autotable over hand-placed text: wrapping of long dish names and examples, row-level page breaks and cell fills come for free; the renderer stays under 300 lines.

### 8.5 Services, conditions, VAT

- Services (`blocks.services`, absent when hidden): the same table shape; the header row filled with `mixWithWhite(accent, 0.3)`, bold 10, the title (« EXTRAS ») and the intro italic 9 under it; rows text left, price « 50,00 € » with « €/heure (htva) » under it, or the `priceNote` italic 8 muted in the price column (« forfait (htva) en fonction de l'adresse », « à voir ensemble »).
- Conditions: 6 mm gap; italic 9 muted, centred, `splitTextToSize` at 170 mm. Kept together with the VAT table: if less than 40 mm remain before the conditions, `addPage()`.
- VAT table: 4 mm gap; `autoTable` 70 mm wide centred (`margin: { left: 70 }`, `tableWidth: 70`), head row « TVA » filled with the accent, bold 9, then one row per line « Food à emporter » / « 6 % », `theme: "plain"` with 0,2 mm hairlines between rows (`didDrawCell` draws the line), 9 pt.

### 8.6 Footer, page breaks, file

- Footer on every page: 8 pt muted, centred at y = 290: `input.footer` (« La Table d'Amélie · 0032486.54.60.17 · tabledamelie@gmail.com · www.tabledamelie.be », built by the page from `company`, parts missing are skipped), and « page n / {total} » right-aligned at x = 195, resolved with `doc.putTotalPages("{total}")` after the last table.
- Page breaks, in one list: never inside a row (`rowPageBreak: "avoid"`); a section band keeps at least two rows after it (the 32 mm pre-check); services, conditions and the VAT table move together when fewer than 40 mm remain; the column heads repeat on every page.
- Expected lengths: brunch 1 page, chef à domicile 2, walking dinner 2, buffets printemps-été 2, buffets automne-hiver 3, baptême 1, carte à emporter 4 at most.
- File name: `documentFileName(d)`, « Offre buffets automne hiver 2026.pdf », « Carte à emporter 2026.pdf ». `doc.save(name)` on the page, the row ⋯ and the Devis footer; `doc.output("bloburl")` for the preview.
- Assets: `brandImage("logo", settings.updatedAt)` and `brandImage("banner", settings.updatedAt, { cropRatio: 4 })`, cached per session so « Aperçu » then « Télécharger » fetch once.

Fidelity note: her sheets use a font that is not Helvetica (unknown until she sends the original file). The salmon is sampled from a screenshot of the band, so it is close, not exact. Both are editable later without touching the layout: the accent in Paramètres, the font by embedding one TTF through `addFileToVFS` (about 200 KB, one more asset).

---

## 9. Build plan

Runs AFTER `07-offers-pricing-attachments.md` Phase 6 (the pages `Offers.tsx`, `OfferDetail.tsx`, `Devis.tsx`, `Settings.tsx`, `RecipeDetail.tsx` as built) and after the 08 assistant frontend (`AdminLayout`, `AdminSidebar`, `tour-steps.ts` as mounted) have landed on main. Builders rebase on those files, not on the stubs. Phases run in sequence; inside a phase, groups touch disjoint files and can run in parallel. Run `pnpm -r type-check`, `pnpm -r test` and `pnpm -r build` at the end of every phase.

07 files edited by this spec: `packages/types/src/entities/settings.ts`, `packages/types/src/dto/settings.ts`, `packages/types/src/dto/dto.test.ts`, `apps/backend/src/settings/settings.controller.ts`, `apps/backend/src/settings/settings.service.ts`, `apps/backend/src/settings/settings.service.spec.ts`, `apps/frontend/src/lib/api.ts`, `apps/frontend/src/lib/page-icons.ts`, `apps/frontend/src/pages/admin/Offers.tsx`, `apps/frontend/src/pages/admin/OfferDetail.tsx`, `apps/frontend/src/pages/admin/Devis.tsx`, `apps/frontend/src/pages/admin/Settings.tsx`, `apps/frontend/src/pages/admin/RecipeDetail.tsx`, `apps/frontend/src/components/admin/AdminSidebar.tsx`, `apps/frontend/src/components/admin/tour-steps.ts`, `apps/frontend/src/App.tsx`, `scripts/seed-local.mjs`, `scripts/smoke-local.mjs`, `readme.md`. 08 files edited: `apps/backend/src/assistant/assistant.tools.ts`, `assistant.prompt.ts`, `assistant.tools.spec.ts`, `assistant.module.ts`.

### Phase 1. Types and DTOs

- Group A: `packages/types/src/entities/offer-document.ts`, `packages/types/src/entities/settings.ts`, `packages/types/src/entities/index.ts`. Tasks: 3.1, 3.2.
- Group B: `packages/types/src/dto/offer-documents.ts`, `packages/types/src/dto/settings.ts`, `packages/types/src/dto/index.ts`, `packages/types/src/dto/dto.test.ts`. Tasks: 3.4 (imports the names fixed in 3.1; the two groups agree on them before starting).

### Phase 2. Lib

- Group A: `packages/types/src/lib/offer-document.ts`, `packages/types/src/lib/offer-document.test.ts`, `packages/types/src/lib/index.ts`. Tasks: 4.1.

### Phase 3. Backend

- Group A: `apps/backend/src/offer-documents/offer-documents.module.ts`, `offer-documents.controller.ts`, `offer-documents.service.ts`, `offer-documents.service.spec.ts`, `fixtures/offer-documents-2026.json`, `offer-documents-2026.spec.ts`, `apps/backend/src/app.module.ts`, `apps/backend/src/assistant/assistant.module.ts` (imports the new module), `apps/backend/nest-cli.json`. Tasks: 5.1, 7.1, 7.2, 7.3.
- Group B: `apps/backend/src/settings/settings.controller.ts`, `settings.service.ts`, `settings.service.spec.ts`. Tasks: 5.2.
- Group C: `apps/backend/src/assistant/assistant.tools.ts`, `assistant.prompt.ts`, `assistant.tools.spec.ts`. Tasks: 5.3 (injects `OfferDocumentsService.getAll()` from group A; the name and signature are fixed in 5.1).
- Group D: `scripts/import-offer-documents.mjs`, `scripts/seed-local.mjs`, `scripts/smoke-local.mjs`, `scripts/fixtures/brand/logo.png`, `scripts/fixtures/brand/banner.jpg`, `readme.md`. Tasks: 5.4. Re-seed the local stack after this phase.

### Phase 4. Frontend shared pieces

- Group A: `apps/frontend/src/lib/api.ts`, `apps/frontend/src/lib/page-icons.ts`, `apps/frontend/src/lib/pdf-images.ts`, `apps/frontend/src/lib/offer-document-pdf.ts`. Tasks: 6.1 (api, images, renderer), 8.
- Group B: `apps/frontend/src/components/admin/OffersTabs.tsx`, `DocSectionBlock.tsx`, `DocRow.tsx`, `DocumentPreviewDialog.tsx`. Tasks: 6.1, 6.3 (blocks).
- Group C: `apps/frontend/src/components/admin/AddFromDocumentDialog.tsx`, `UseInEventDialog.tsx`, `BrandAssetProperty.tsx`. Tasks: 6.5, 6.6 (dialogs).
- Group D: `apps/frontend/src/App.tsx`, `apps/frontend/src/components/admin/AdminSidebar.tsx`, `apps/frontend/src/components/admin/tour-steps.ts`, stubs `apps/frontend/src/pages/admin/OfferDocuments.tsx` and `OfferDocumentDetail.tsx` (« Bientôt » until Phase 5). Tasks: 6.1 (routes, sidebar, tour).

### Phase 5. Pages

- Group A: `apps/frontend/src/pages/admin/OfferDocuments.tsx`, `OfferDocumentDetail.tsx`. Tasks: 6.2, 6.3.
- Group B: `apps/frontend/src/pages/admin/Offers.tsx`, `OfferDetail.tsx`. Tasks: 6.4.
- Group C: `apps/frontend/src/pages/admin/Devis.tsx`. Tasks: 6.6 (devis side).
- Group D: `apps/frontend/src/pages/admin/Settings.tsx`. Tasks: 6.5.
- Group E: `apps/frontend/src/pages/admin/RecipeDetail.tsx`. Tasks: 6.1 (switch to `loadImageForPdf`).

### Phase 6. Docs and acceptance

- Group A: `docs/redesign/README.md` (a row for this file), `docs/redesign/04-first-run-and-tour.md` (step 8 route, anchor and copy), `docs/redesign/08-assistant.md` (two rows in the 4.3 tool table). Tasks: 6.1 (tour), 5.3.
- Group B: one builder runs section 10 against the seeded stack and fixes what fails; files: whatever the checks point at.

---

## 10. Acceptance checklist

Driver: `mkdir -p /tmp/shots/09 && cd /tmp/pw && OUT=/tmp/shots/09 node shot.mjs /tmp/shots/09/routes.json` against the seeded stack (`http://localhost:5173`, API `:3101`, re-seeded after Phase 3; ids from `GET /api/admin/offer-documents`, `/api/admin/offers`, `/api/admin/events`). Widths 375 (touch) and 1366 unless stated. PDFs are captured through Playwright's `download` event into `/tmp/shots/09/` and checked with `pdfinfo` (page count) and `pdftotext -layout` (text order), then opened and compared by eye against the descriptions in `docs/redesign/workings/offers-source-2026.md`.

Tests:

- [ ] `packages/types`: jest passes, with about 40 new cases (lib 30, DTO 10).
- [ ] `apps/backend`: jest passes, with about 20 new cases plus the fixture spec.
- [ ] `apps/frontend`: `tsc -b` passes; `pnpm --filter @apps/frontend lint:type-scale` passes.
- [ ] `node scripts/smoke-local.mjs` passes with the three new steps.
- [ ] `node scripts/import-offer-documents.mjs` twice: the second run prints « déjà présente » seven times and `GET /api/admin/offer-documents` still returns 7.

Documents list and editor:

- [ ] `documents-1366.png` and `documents-375.png` (`/offres/documents`): seven rows with season tags, years and section counts; the tabs « Documents · Formules · Archivées »; « + Nouveau document » the only primary; the sidebar « Offres » active.
- [ ] `documents-empty-1366.png` (empty stack): the empty sentence with « + Nouveau document » and the default « Importer les offres 2026 »; then the import dialog `documents-import-dialog-1366.png`; after « Importer » the toast « 7 documents importés » and seven rows.
- [ ] `document-1366.png` and `document-375.png` (`/offres/documents/<buffets automne hiver>`): the six properties, the APERITIF section with its price and unit, PLATEAUX A PARTAGER as a price list with « minimum 8 personnes » and a price per row, BUFFET 2 with the « chaud » tag on the polpettes, the services block titled EXTRAS, the conditions, the three VAT rows (two on this document).
- [ ] `document-section-menu-1366.png` (BUFFET 2 ⋯): « Coster cette formule » disabled with its title (no linked row), « Créer un devis depuis cette formule », « Utiliser dans un événement… », « Monter », « Descendre », « Dupliquer la section », « Supprimer la section ».
- [ ] Behaviour: clicking the price of BUFFET 2, typing 35 and Enter saves (`GET` shows 35 and a new `updatedAt`); Enter at the end of « Vitello tonnato… » opens a new row under it; Backspace on that empty row removes it; « Transformer en › Exemple » renders the row italic with « ex : »; « Lier à une recette… » on « Vitello tonnato… » with « Houmous de betterave » sets the blue « Recette » tag; « Coster cette formule » is then enabled, creates « Offre buffets automne hiver 2026 › BUFFET 2, La Tavola Italiana » in `GET /api/admin/offers` with one line at 1 portion per guest and price 35, and the section sub shows « Coût moyen … · 5 plats sans recette · Ouvrir la formule »; a PATCH with the old `updatedAt` from a second tab is 409 and the page toasts « Le document a changé ailleurs, il a été rechargé ».
- [ ] Behaviour: « + Section › Depuis une formule… » with « Buffet 1 » adds a section « Buffet 1 » at 42,00 € with five linked rows and `offerId` set; « Mettre à jour la formule » after removing one row rewrites the offer to four lines.
- [ ] Behaviour: « Dupliquer pour 2027… » with the archive box ticked creates « Offre buffets automne hiver 2027 » with no `offerId` on any section, archives 2026 (gray Tag « Archivée », editors read-only, « Télécharger le PDF » still works), and the « Archivées » tab lists it with the count line « 1 document archivé ».
- [ ] `document-preview-1366.png` (« Aperçu »): the dialog with the PDF's first page visible in the iframe.

PDF:

- [ ] `Offre buffets automne hiver 2026.pdf` (downloaded from the page): 3 pages at most; page 1 has the seeded logo top-left, the banner 180 × 45, the salmon band « OFFRE BUFFETS AUTOMNE HIVER 2026 », the company block left (name, address, TVA, phone, e-mail, website) and the facts right (« Type de prestation : Avec ou sans service, A emporter ou avec livraison », « Nombre minimum de personnes : 20 », « Note : … »), the column heads; sections in the source order with their prices right-aligned; PLATEAUX A PARTAGER rows priced per row; examples italic and muted; « (chaud) » after the polpettes; no band as the last line of a page; EXTRAS, conditions and the VAT table « Food 12 % · Services 21 % » at the end; « page n / 3 » on every page. Text order checked with `pdftotext -layout`.
- [ ] `Carte à emporter 2026.pdf`: 4 pages at most; eleven sections; « minimum 20 pièces par sorte » on the two finger food bands; « à la pièce » under the column for those sections and « 2,25 € » on the choux row; « gâteau 8 parts » on the cakes; the pavlova vase with « entre 12 et 20 personnes, prix par personne » under its price; no services block; the VAT table last.
- [ ] `Offre chef à domicile 2026.pdf`: 2 pages; one band « FOOD · 65,00 € par personne »; sub-headers « Apéritif », « Entrée (un choix pour la table) », « Plat (un choix pour la table) », « Dessert (un choix pour la table) » on the pale fill; « (froid) », « (tiède) », « (chaud) » after the dishes; « SERVICES » with cuisinier 50 and serveur 40.
- [ ] `Offre baptême 2026.pdf`: 1 page; « Nombre de personnes : à partir de 20 personnes »; « àpd 4,50 € » and « àpd 3,50 € » on the verrines; « supplément en fonction du nombre de personnes » in the price column of the croûte and the pavlova; no services block; VAT « Livraison / location matériel 21 % ».
- [ ] Behaviour (empty stack, no brand images): the editor shows the warning callout; the PDF prints the company name in the band position, no banner, and the layout holds.

Paramètres, Devis, events:

- [ ] `settings-societe-brand-1366.png` (`/settings`, Société): « Téléphone », « E-mail », « Site web », « Couleur d'accent » with the swatch, « Logo » and « Bannière » with thumbnails and « Remplacer » / « Retirer ».
- [ ] Behaviour (API): `POST /api/admin/settings/brand/logo` with a 200 KB PNG returns settings with `brandLogoKey: "brand/logo.png"`; the same with a JPEG replaces it with `brand/logo.jpg` and the PNG object is gone; a HEIC is 400 and the UI toasts « Format non pris en charge (JPEG ou PNG) »; a 6 MB file is refused client-side; `GET /api/admin/settings/brand/logo` serves `image/jpeg` with `Cache-Control: private, max-age=86400`; `DELETE` removes the attribute; `PATCH /api/admin/settings { brandLogoKey: "x" }` leaves it untouched.
- [ ] `devis-from-document-1366.png` (`/devis?document=<buffets AH>&section=buffet-2` after linking one row): prestation « Buffet avec service », TVA 12 %, 20 convives, « Prix proposé » 34,50 €, one menu line, the block « Plats de « BUFFET 2, La Tavola Italiana » sans recette · 5 » with « Lier » links, the cost tile sub « 5 plats sans recette », the ghost « Document (PDF) » in the footer.
- [ ] `devis-add-from-document-1366.png` (« + Depuis un document… », « Carte à emporter » chosen, « Choux fourrés au saumon fumé » ticked with 60, « Sablés au comté… » ticked with 12): the warning « Minimum 20 pièces par sorte : Sablés au comté et mousse de chèvre (12) » and the primary « Ajouter 2 lignes ».
- [ ] Behaviour: after « Ajouter », « Service, livraison, autres » holds « Carte · Choux fourrés au saumon fumé et fromage frais × 60 · 135,00 € · 6 % » and the sablés line at 10,80 €; the section meta reads « … dont 145,80 € carte »; « Total TVAC » includes 6 % on those lines; « Créer l'événement » writes both revenue lines and the unlinked plats into the event notes.
- [ ] `use-in-event-375.png` (BUFFET 2 ⋯ « Utiliser dans un événement… », « Événement existant », « Mariage Dupont »): the Sheet with the event picked and the caption « Les plats liés à une recette sont ajoutés au menu ; le prix de l'événement ne change pas. ».
- [ ] Behaviour: « Ajouter » adds one line of 60 portions to Mariage Dupont, appends the five unlinked plats to its notes, keeps its price, toasts « 1 recette ajoutée à « Mariage Dupont » · prix inchangé »; « Nouvel événement » with a date creates an event at 34,50 € per guest, 20 guests, one line, notes with « Depuis le document Offre buffets automne hiver 2026 », and `offerId` set only because the section is costed.
- [ ] `offres-formules-1366.png` (`/offres`): the tabs with « Formules » active, the count « 4 formules », « + Nouvelle formule », the document-born formula with « — » in « Coût / conv. » and « Marge % » when its lines are empty, and `offre-from-document-1366.png` (`/offres/<that id>`): the muted « Formule de « Offre buffets automne hiver 2026 » › BUFFET 2, La Tavola Italiana » line with the link.

Assistant (needs a key, as in 08):

- [ ] « Combien coûte la verrine de vitello tonnato à emporter ? » → the tool row « Recherche dans les offres « verrine vitello » » then « 5,90 € HTVA à la pièce, minimum par 12 (Carte à emporter 2026) »; no card.
- [ ] « Qu'y a-t-il dans le buffet 2 de l'offre automne hiver ? » → the six dishes with « (chaud) » where it applies and « 34,50 € HTVA par personne ».

Tour:

- [ ] `tour-8-1366.png` (`/offres/documents`): the cut-out around the documents table, title « Offres et devis », the new body.

---

## 11. Open questions for Dalia

Each with the assumption taken until she answers.

1. Logo et bannière. Pouvez-vous envoyer le logo (PNG fond transparent de préférence), la photo de bannière en haute résolution, et le fichier original d'une brochure (Canva, Word…) pour relever la couleur saumon exacte et la police ? Hypothèse : saumon `#E8847A`, police Helvetica, bannière recadrée en 4:1 ; la couleur se change dans Paramètres › Société.
2. Chef à domicile et walking dinner. Les entrées, plats, desserts et petites assiettes sont des sous-titres « un choix pour la table » ou « sélection de 4 au choix » avec la liste dessous ; le texte imprimé ne change pas. Dans un devis, le choix du client reste une note, et le coût d'une formule à choix est la moyenne des plats. Voulez-vous plutôt cocher le plat choisi dans le devis ? Hypothèse : une note.
3. Prix à la pièce. La carte à emporter (choux, verrines, gâteaux) est un document parmi les sept, et ses articles s'ajoutent à un devis avec une quantité. D'accord, ou préférez-vous une page « Carte » à part ? Hypothèse : même catalogue, un document.
4. Brunch 2025. L'importer tel quel en 2025, ou le passer en 2026 aux mêmes prix ? Hypothèse : importé en 2025, actif ; vous le dupliquez pour 2026 quand vous le relisez.
5. Mention « (actualisée) » sur les buffets automne hiver. Faut-il l'imprimer dans le bandeau ? Hypothèse : non, la date de modification suffit.
6. Tableau TVA. Trois lignes (6 % à emporter, 12 % avec service, 21 % extras) sur toutes les brochures, ou « Food 12 % · Services 21 % » seul sur les buffets et la carte, comme aujourd'hui ? Hypothèse : chaque document garde son tableau tel qu'importé.
7. Tarifs de service. Le serveur est à 40 €/h sur le chef à domicile et le walking dinner, à 50 €/h sur le brunch et les buffets automne hiver. Quel tarif est le bon en 2026 ? Hypothèse : chaque document garde le tarif de sa feuille ; vous corrigez dans l'éditeur.
8. « Plateau antipasti (printemps/été) » figure dans la feuille automne hiver. Le garder ? Hypothèse : gardé tel quel.
9. Article de la carte dans un devis. Le revenu est compté au taux food dans « Service, livraison, autres » et le coût matières n'est pas connu tant que l'article n'a pas de recette. Acceptable pour commencer ? Hypothèse : oui.
10. Bloc « Nombre (minimum) de personnes ». Imprimer le texte dérivé (« Nombre minimum de personnes : 20 », « Nombre de personnes : entre 30 et 150 ») ou toujours votre formulation ? Hypothèse : dérivé, avec un texte libre quand vous le modifiez. Le chef à domicile imprime « Nombre de personnes : entre 8 et 14 personnes » (votre feuille dit « minimum »).
11. Traductions. Faut-il une version en néerlandais ou en anglais de certaines brochures ? Hypothèse : non ; une traduction serait un document à part.
12. Nom du fichier. « Offre buffets automne hiver 2026.pdf ». Voulez-vous le nom de la société devant ? Hypothèse : non.
13. Coordonnées. Téléphone 0032486.54.60.17, e-mail tabledamelie@gmail.com et site www.tabledamelie.be sont lus sur vos feuilles ; vous les tapez une fois dans Paramètres › Société (l'import ne les écrit pas). Sont-ils à jour ?
14. Prix TVAC. Le PDF reste HTVA avec le tableau TVA en bas, comme vos feuilles. Voulez-vous aussi une colonne TVAC ? Hypothèse : non.
15. Un plat qui apparaît dans plusieurs documents (plateau apéro, cheesecake, mignardises) est une ligne par document : changer son prix dans la carte ne change pas les buffets. Est-ce gênant ? Hypothèse : non pour commencer ; un catalogue d'articles partagé est l'étape suivante si oui.
