# 10. Dépôt de factures: drop invoices, they land in the Journal

Status: spec. Depends on 07 (ledger import, dedupe by number, attachments in S3 through the events module), 08 (the OpenAI client in `apps/backend/src/shared/openai.client.ts` and its key handling) and the Odoo invoicing mode. Build after the 08 backend lands; the frontend after the 08 sheet lands (it edits `Journal.tsx`, which 07 is editing now).

## 1. Goal

The owner, verbatim: « we need a zone where we can drop all invoices and these are automatically added to "livres de recettes" ».

Dalia drops PDFs or photos of invoices (the sales invoices Odoo issued, the purchase invoices from Vds, Barn, Delhaize, the butcher) into one zone. Each file is read by the document model, turned into a proposed Journal entry in the right book, shown in a review table with what was read and what looks wrong, and added to the Journal with the file attached to the entry. Nothing enters the book without her click, but the click is one for the whole batch.

Rules:

- One file is one entry. A multi-page PDF is one invoice.
- The book is decided by who issued the invoice: issued by Table d'Amélie SRL (the VAT number in Paramètres › Société) means « ventes », anything else means « achats ».
- The three amounts must agree (HTVA + TVA = TVAC); when the reading does not, the TVA is recomputed from the two others and the row is flagged.
- A number already in the book is a duplicate: skipped by default, « Remplacer » on demand.
- A locked month is never written to; the row says so.
- Low confidence or a missing number, date or amount flags the row « À vérifier »; every field is editable before confirmation.
- Files live in the private S3 bucket; links are presigned and short-lived.

## 2. Vocabulary

| French (UI) | Meaning | Code |
|---|---|---|
| Dépôt | The tab and the zone | `/comptes/depot`, `InvoiceInbox.tsx` |
| lecture | The model reading a file | `extract` |
| proposition | The entry the app proposes for a file | `InboxItem.proposal` |
| À vérifier | A proposition with a doubt | `InboxItem.flags` |
| Ajouter au journal | Confirm one or all | `confirm` |
| pièce | The invoice file attached to an entry | `LedgerEntry.attachment` |

## 3. Data model

`packages/types/src/entities/ledger.ts`:

```ts
export interface LedgerAttachment { key: string; name: string; contentType: string; size: number; uploadedAt: string }
export interface LedgerEntry { /* unchanged */ attachment?: LedgerAttachment; source?: "saisie" | "import_csv" | "depot" }
```

`attachment` and `source` are written by the server only (the create and patch DTOs do not accept them; the import sets `source: "import_csv"`, the inbox sets `source: "depot"`, hand entries read as `saisie` when absent).

`packages/types/src/dto/ledger.ts`, new:

```ts
export const extractedInvoiceSchema = z.object({
  issuerName: z.string().max(120).nullable(),
  issuerVat: z.string().max(20).nullable(),
  recipientName: z.string().max(120).nullable(),
  recipientVat: z.string().max(20).nullable(),
  number: z.string().max(40).nullable(),
  date: z.string().nullable(),            // YYYY-MM-DD when the model is sure, else null
  dueDate: z.string().nullable(),
  currency: z.string().max(3).nullable(),
  totalTvac: z.number().nullable(),
  htva: z.number().nullable(),
  vatAmount: z.number().nullable(),
  vatLines: z.array(z.object({ rate: z.number(), base: z.number(), amount: z.number() })),
  kindGuess: z.enum(["facture", "note_de_credit", "acompte", "autre"]),
  paid: z.boolean().nullable(),
  confidence: z.number().min(0).max(1),
  remarks: z.string().max(300).nullable(),
}).strict();
export const inboxConfirmSchema = z.object({
  items: z.array(z.object({ inboxId: z.string().min(1), entry: createLedgerEntrySchema, replace: z.boolean().default(false) }).strict()).min(1).max(50),
}).strict();
```

Types: `ExtractedInvoice`, `InboxUpload = { inboxId, name, contentType, size }`, `InboxProposal = { inboxId, entry: CreateLedgerEntryRequest; flags: InboxFlag[]; extracted: ExtractedInvoice }`, `InboxFlag = { code: "vat_fixed" | "low_confidence" | "missing_number" | "missing_date" | "missing_amount" | "duplicate" | "locked_month" | "multi_rate" | "unknown_supplier" | "currency"; message: string }`, `InboxConfirmResult = { inboxId; ok: true; entryId } | { inboxId; ok: false; error: string }`.

No new DynamoDB table.

## 4. Lib `packages/types/src/lib/invoice-inbox.ts` (new, tested)

```ts
export interface InboxMappingContext {
  companyVat: string | null;                 // Paramètres › Société
  suppliers: string[];                       // settings.suppliers names
  existingNumbers: { book: LedgerBook; number: string; entryId: string; locked: boolean }[];
  lockedMonths: string[];                    // ym
  today: string;
}
export function normalizeVat(v: string | null): string | null;      // "BE 0766.607.232" -> "BE0766607232"
export function mapExtractedInvoice(x: ExtractedInvoice, ctx: InboxMappingContext): { entry: CreateLedgerEntryRequest | null; flags: InboxFlag[] };
```

Rules of `mapExtractedInvoice`:

- `book`: `normalizeVat(issuerVat) === normalizeVat(companyVat)` or, when the issuer VAT is missing, the issuer name contains « table d'amélie » → `ventes`; else `achats`.
- `ventes`: `kind` = `kindGuess` when it is `facture`, `note_de_credit` or `acompte`, else `facture`; `label` = recipientName or « Facture <number> »; `number`; `paid` from `paid ?? false`; a credit note gets negative amounts and keeps its number (the sign rule of the DTO).
- `achats`: `kind` = `mp` when the issuer name matches a supplier in `ctx.suppliers` (case-insensitive, accents folded) else `autre`; `supplier` = the matched supplier name or the issuer name; `label` = issuerName or « Achat <number> »; flag `unknown_supplier` when no supplier matched.
- Amounts: `totalTvac`, `htva`, `vatAmount` through `round2`; when one of the three is null and the two others are known, derive it; when `|htva + vatAmount - totalTvac| > 0.02`, set `vatAmount = round2(totalTvac - htva)` and flag `vat_fixed`; when any amount is still null flag `missing_amount` and return `entry: null`.
- `vatRate`: the rate of the largest `vatLines` base, else `nearestVatRate(htva, vatAmount)` from `ledger-import.ts`; more than one rate flags `multi_rate` (one entry, dominant rate, as the CSV import does).
- `date`: as read when valid; a missing or invalid date flags `missing_date` and uses `today`; `number` missing flags `missing_number` (and the entry keeps `number` undefined).
- `currency` not EUR flags `currency`.
- `confidence < 0.7` flags `low_confidence`.
- Duplicate: same `book` and same normalised `number` in `existingNumbers` flags `duplicate` with the `entryId`; `locked` on that entry or the entry's `ym` in `lockedMonths` flags `locked_month`.

Tests: ventes by VAT with spaces and dots; ventes by name when the VAT is missing; achats with a known supplier → `mp`; unknown supplier → `autre` and the flag; TVA recomputed and flagged; a missing TVAC derived; credit note sign; two rates → dominant and `multi_rate`; low confidence; duplicate and locked month; missing date defaults to today with the flag.

## 5. Backend `apps/backend/src/ledger/inbox/` (new: `inbox.controller.ts`, `inbox.service.ts`, `inbox.extract.ts`, `inbox.service.spec.ts`; register in `ledger.module.ts`)

Endpoints (AdminGuard, 503 `ASSISTANT_DISABLED` when no OpenAI key source, since reading needs the model):

```ts
POST /admin/ledger/inbox/upload       multipart field file (pdf, jpeg, png, webp, heic; 20 MB; 1 file)  -> InboxUpload
   stores at ledger-inbox/{inboxId}{ext} in S3; nothing in DynamoDB
POST /admin/ledger/inbox/extract      { inboxId }  -> InboxProposal   (60 s timeout; 502 ASSISTANT_UPSTREAM on model failure)
POST /admin/ledger/inbox/confirm      inboxConfirmSchema -> { results: InboxConfirmResult[] }
DELETE /admin/ledger/inbox/:inboxId   deletes the S3 object (a dropped file the user discards)
GET /admin/ledger/:entryId/attachment/url -> { url } presigned, 10 minutes, inline with the file name
```

`inbox.extract.ts`: builds the Responses-API call with the OpenAI client of 08: `input_file` (base64 PDF, `filename`) for PDFs, `input_image` for images, a French instruction (« Lisez cette facture et renvoyez les champs demandés. Montants en nombres, dates en AAAA-MM-JJ, null quand illisible. Ne devinez pas un numéro. ») and `text: { format: { type: "json_schema", strict: true, schema } }` from `extractedInvoiceSchema` (converted to JSON schema by hand in the module; keep it in sync). HEIC is converted to JPEG before the call when `sharp` is already a dependency, else refused with a French message (check `apps/backend/package.json`; do not add `sharp` for this). Model from `OPENAI_MODEL`. Logs: inboxId, duration, usage; never the content.

`inbox.service.ts`:

- `extract(inboxId)`: reads the object, calls the model, validates with `extractedInvoiceSchema`, builds the context (company VAT from settings, suppliers, existing numbers over both books, locked months), returns `mapExtractedInvoice` plus `extracted`.
- `confirm(items)`: for each item, in order: re-validate `entry`; a duplicate number in the same book without `replace` → `{ ok: false, error: "Déjà dans le journal (n° …)" }`; a locked month → `{ ok: false, error: "Mois verrouillé" }`; otherwise `LedgerService.create` (or `replace` when `replace` is true and the existing entry is not locked) with `source: "depot"` and `attachment` built from the S3 object's metadata (name = the original file name kept in the object's `ContentDisposition` or a `x-amz-meta-name`); the S3 key stays where it is (keys are opaque).
- `LedgerService.remove` deletes the attachment object when present (cascade, like events).
- `attachmentUrl(entryId)`: presigned GET through `S3Service.presignedUrl(key, { filename })`.

Tests (fake OpenAI, fake S3, fake ddb): upload stores and returns metadata; extract maps a ventes PDF (issuer VAT equal to the company's) to a `facture` entry with no flags; a purchase from « Vds » to `mp`; a VAT mismatch is fixed and flagged; a duplicate number is refused on confirm and accepted with `replace`; a locked month is refused; confirm sets `attachment` and `source`; remove deletes the object; 503 without a key source.

## 6. Screens

### 6.1 Comptabilité › « Dépôt » (`/comptes/depot`, `apps/frontend/src/pages/admin/comptes/InvoiceInbox.tsx`, tab added in `ComptesLayout.tsx` after « Journal », intro line « Déposez vos factures, l'application les lit et les ajoute au journal après votre accord. »)

- Drop zone at the top: a dashed `rounded-lg` area, `bg-callout` on drag-over, icon Upload, « Déposez vos factures ici » and « PDF ou photo · 20 Mo par fichier », button « Choisir des fichiers » (`input type=file multiple accept="application/pdf,image/*"`); on phones a second button « Prendre une photo » (`capture="environment"`). Dropping anywhere on a Comptabilité page opens this tab with the files (a window `dragover`/`drop` listener in `ComptesLayout`).
- Queue: one row per file in a `Table` (laptop) or list rows (phone): file name with the kind icon, size, state `Tag` (« Envoi… », « Lecture… », « À vérifier » yellow, « Prêt » green, « Ajouté » gray, « Erreur » red, « Doublon » gray, « Mois verrouillé » red), then the proposition fields, editable inline (`Property`-style controls in the row or a `Sheet` on phones): Livre (`SelectPill` Ventes | Achats), Type (kind), Date, N°, Libellé (client or supplier), HTVA, TVA, TVAC (money inputs; the identity line turns red when they disagree, as in the entry form), Payé (`Checkbox`), Fournisseur (achats). Flags render as a muted sentence under the row (« TVA recalculée · 2 taux lus, 12 % retenu »). « Ouvrir » shows the file (object URL before confirm, presigned after).
- Files are processed sequentially: upload, then extract, with the row updating; a failed file keeps its row with « Réessayer ».
- Footer: « Ajouter au journal » (primary, `n factures prêtes`) adds every « Prêt » row; a row « Ajouter » for one; « Ignorer » removes a row (and deletes the upload); duplicates get a « Remplacer » link that sets `replace`.
- After confirmation each row shows « Ajouté · Voir » linking to `/comptes/journal?ym=<ym>&entry=<entryId>`; the batch summary toasts « 7 factures ajoutées, 1 doublon ignoré ».
- Empty queue: `EmptyState` « Aucune facture déposée. »; disabled model: `Callout` « La lecture automatique n'est pas configurée (clé OPENAI). Vous pouvez saisir les factures à la main dans le Journal. ».
- The queue lives in component state only; a reload clears it (the uploads already in S3 are orphaned until confirmed or ignored; a nightly cleanup is out of scope, note it).

### 6.2 Journal

- Rows with an attachment show a paperclip `IconButton` « Pièce » (opens the presigned URL in a new tab); the entry form shows « Pièce jointe : facture.pdf · Ouvrir » read-only; `source` shows as a gray `Tag` « dépôt » or « import ».
- ⋯ gains « Déposer des factures… » linking to `/comptes/depot`.

### 6.3 Assistant (08)

Read tool `list_recent_ledger_entries` (last 30 days) is enough for questions like « quelles factures ai-je ajoutées cette semaine ? »; no inbox tool. Not built in phase A; add it to `assistant.tools.ts` when the question comes up.

## 7. Build plan

Phase A (after the 08 backend): libs (`invoice-inbox.ts` + tests, `dto/ledger.ts`, `entities/ledger.ts`), backend (`ledger/inbox/*`, `ledger.service.ts` cascade and `attachmentUrl`, `ledger.module.ts`, `ledger.controller.ts` for the url route), tests.
Phase B (after the 08 sheet): `api.ts` (inbox upload with FormData, extract, confirm, remove, attachment url), `InvoiceInbox.tsx`, `ComptesLayout.tsx` tab and global drop, `Journal.tsx` paperclip and menu item, `LedgerEntryForm.tsx` read-only attachment line.
Phase C: acceptance with a key (the owner's local export) on three real-looking PDFs generated with Playwright (a Table d'Amélie invoice, a Vds invoice, a credit note) and one photo; without a key the 503 path.

## 8. Acceptance

- Drop three PDFs and one JPEG at 1366: rows go Envoi → Lecture → Prêt/À vérifier; the ventes PDF maps to Ventes · facture with the company's VAT recognised; the Vds PDF maps to Achats · mp · Vds; the credit note has negative amounts; the photo reads at least number, date and TVAC or flags what is missing.
- A VAT mismatch in a file is fixed and flagged; editing TVA by hand clears the flag.
- « Ajouter au journal » creates the entries in the right months with `source: depot` and the paperclip opens the file; the same file dropped again is « Doublon » and « Remplacer » updates the entry.
- A locked month refuses with the message; the Journal month total changes by the sum of the added entries; Aperçu picks them up.
- Phone 375: the zone, « Prendre une photo », rows as list items, 44 px targets, no horizontal scroll.
- Without a key: the tab shows the disabled callout; the Journal keeps working.
- No key or invoice content in the logs; `git grep` finds no key.
