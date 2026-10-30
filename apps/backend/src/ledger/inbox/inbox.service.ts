import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { PDFDocument } from "pdf-lib";
import type {
  AppSettings,
  ExtractedInvoice,
  InboxConfirmRequest,
  InboxConfirmResult,
  InboxBatchProposal,
  InboxMappingContext,
  InboxProposal,
  InboxUpload,
  LedgerAttachment,
  LedgerBook,
  LedgerEntry,
} from "@packages/types";
import { createLedgerEntrySchema, extractedInvoiceSchema, mapExtractedInvoice, normalizeInvoiceParty, todayYmd } from "@packages/types";
import { ConfigService, DEFAULT_OPENAI_MODEL } from "../../config/config.service";
import { OpenAiNotConfiguredError, getOpenAiClient, invalidateOpenAiClient, isAssistantConfigured } from "../../shared/openai.client";
import { S3Service } from "../../shared/s3.service";
import { SettingsService } from "../../settings/settings.service";
import { LedgerService } from "../ledger.service";
import { parseOdooInvoicePages, pdfTextPages } from "./odoo-pdf";
import {
  ExtractUpstreamError,
  HEIC_UNSUPPORTED,
  INBOX_TYPES,
  UNSUPPORTED_TYPE,
  extractInvoice,
  extractInvoiceBatch,
  isHeic,
  type ExtractClient,
  type ExtractedInvoicePages,
  type ExtractClientFactory,
} from "./inbox.extract";

export const ASSISTANT_DISABLED = { code: "ASSISTANT_DISABLED" };
// Injection token of the client factory; absent in the app, given by the tests.
export const INBOX_CLIENT = "INBOX_CLIENT";
export const INBOX_PREFIX = "ledger-inbox/";
export const MAX_INBOX_BYTES = 20 * 1024 * 1024;

export const LOCKED_MONTH = "Mois verrouillé";
export const UPLOAD_NOT_FOUND = "Fichier déposé introuvable";
export const INVALID_INBOX_ID = "Identifiant de dépôt invalide";

// The multer fields the service reads; the controller passes the uploaded file as is.
export type UploadedInboxFile = { originalname: string; mimetype: string; buffer: Buffer };

// What the inbox needs from S3; the metadata fields stay optional until S3Service carries them.
export type InboxStore = {
  upload(key: string, body: Buffer, contentType: string, metadata?: Record<string, string>): Promise<void>;
  get(key: string): Promise<{ body: Buffer; contentType: string; metadata?: Record<string, string> }>;
  delete(key: string): Promise<void>;
};

type InboxObject = { key: string; body: Buffer; contentType: string; name: string; metadata?: Record<string, string> };
type CachedBatchInvoice = ExtractedInvoicePages & { inboxId: string; name: string };
type CachedBatch = { version: 1; invoices: CachedBatchInvoice[] };

// The inboxId carries the extension so the key is rebuilt without listing the bucket.
const EXTENSIONS = Object.values(INBOX_TYPES).map((ext) => ext.slice(1)).join("|");
const INBOX_ID = new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(${EXTENSIONS})$`);

export function inboxKeyOf(inboxId: string): string {
  if (!INBOX_ID.test(inboxId)) throw new BadRequestException(INVALID_INBOX_ID);
  return `${INBOX_PREFIX}${inboxId}`;
}

const extOf = (inboxId: string): string => inboxId.slice(inboxId.lastIndexOf("."));
const numberKey = (n: string): string => n.toUpperCase().replace(/\s+/g, "");
const isMissingObject = (err: unknown): boolean => {
  const name = (err as { name?: string } | null)?.name;
  return name === "NoSuchKey" || name === "NotFound";
};

const lockedMonthsOf = (settings: AppSettings): string[] =>
  Object.entries(settings.monthCloses ?? {})
    .filter(([, close]) => Boolean(close.lockedAt))
    .map(([ym]) => ym);

// S3 metadata is ASCII only, so the name travels URL-encoded.
const encodeName = (name: string): string => encodeURIComponent(name);
function decodeName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function sdkClient(config: ConfigService): Promise<ExtractClient> {
  const client = await getOpenAiClient(config);
  return { responses: { create: (params, options) => client.responses.create(params, options) } };
}

@Injectable()
export class InboxService {
  private readonly clientFactory: ExtractClientFactory;
  private readonly batchInFlight = new Map<string, Promise<InboxBatchProposal>>();

  constructor(
    private config: ConfigService,
    private ledger: LedgerService,
    private settings: SettingsService,
    @Inject(S3Service) private store: InboxStore,
    @Optional() @Inject(INBOX_CLIENT) clientFactory?: ExtractClientFactory,
  ) {
    this.clientFactory = clientFactory ?? (() => sdkClient(config));
  }

  assertConfigured(): void {
    if (!isAssistantConfigured(this.config)) throw new ServiceUnavailableException(ASSISTANT_DISABLED);
  }

  // Stores the file under ledger-inbox/; nothing is written to DynamoDB until confirm.
  async upload(file: UploadedInboxFile): Promise<InboxUpload> {
    this.assertConfigured();
    const ext = Object.hasOwn(INBOX_TYPES, file.mimetype) ? INBOX_TYPES[file.mimetype] : undefined;
    if (ext === undefined) throw new BadRequestException(UNSUPPORTED_TYPE);
    if (isHeic(file.mimetype)) throw new BadRequestException(HEIC_UNSUPPORTED);
    const name = file.originalname.trim().slice(0, 120) || `facture${ext}`;
    const inboxId = `${randomUUID()}${ext}`;
    await this.store.upload(inboxKeyOf(inboxId), file.buffer, file.mimetype, { name: encodeName(name) });
    return { inboxId, name, contentType: file.mimetype, size: file.buffer.length };
  }

  async extract(inboxId: string): Promise<InboxProposal> {
    const client = await this.client();
    const object = await this.getObject(inboxId);
    if (isHeic(object.contentType)) throw new BadRequestException(HEIC_UNSUPPORTED);
    const model = this.config.get("OPENAI_MODEL") ?? DEFAULT_OPENAI_MODEL;
    let extracted: ExtractedInvoice;
    try {
      extracted = await extractInvoice(client, model, inboxId, { body: object.body, contentType: object.contentType, filename: object.name });
    } catch (err) {
      if (err instanceof ExtractUpstreamError) {
        if (err.status === 401) invalidateOpenAiClient();
        throw new BadGatewayException({ code: "ASSISTANT_UPSTREAM", message: err.message });
      }
      throw err;
    }
    if (extracted.documentStatus === "reversed") {
      await this.store.upload(object.key, object.body, object.contentType, { ...object.metadata, name: encodeName(object.name), documentstatus: "reversed" });
    }
    const { entry, flags } = mapExtractedInvoice(extracted, await this.mappingContext());
    return { inboxId, entry, flags, extracted };
  }

  async extractBatch(inboxId: string): Promise<InboxBatchProposal> {
    const inFlight = this.batchInFlight.get(inboxId);
    if (inFlight) return inFlight;
    const pending = this.extractBatchOnce(inboxId);
    this.batchInFlight.set(inboxId, pending);
    try {
      return await pending;
    } finally {
      if (this.batchInFlight.get(inboxId) === pending) this.batchInFlight.delete(inboxId);
    }
  }

  private async extractBatchOnce(inboxId: string): Promise<InboxBatchProposal> {
    const object = await this.getObject(inboxId);
    if (object.contentType !== "application/pdf") {
      const proposal = await this.extract(inboxId);
      return { invoices: [{ ...proposal, name: object.name, size: object.body.length }] };
    }
    let pdf: PDFDocument;
    try { pdf = await PDFDocument.load(object.body); }
    catch { throw new BadRequestException("PDF illisible ou protégé par un mot de passe."); }
    if (pdf.getPageCount() > 200) throw new BadRequestException("Le PDF dépasse 200 pages. Divisez-le en plusieurs fichiers.");
    const cacheKey = `${object.key}.batch.json`;
    const cached = await this.readBatchCache(cacheKey, pdf.getPageCount());
    let readings: CachedBatchInvoice[];
    const created: string[] = [];
    if (cached) {
      readings = cached.invoices;
    } else {
      let extractedPages: ExtractedInvoicePages[];
      let textPages: string[] = [];
      try { textPages = await pdfTextPages(object.body); } catch { /* Scanned and unsupported PDFs use the document reader. */ }
      let structured: ExtractedInvoicePages[] | null = null;
      if (textPages.length) {
        try { structured = parseOdooInvoicePages(textPages); }
        catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "PDF Odoo incohérent"); }
      }
      try {
        extractedPages = structured ?? await extractInvoiceBatch(await this.client(), this.config.get("OPENAI_MODEL") ?? DEFAULT_OPENAI_MODEL, inboxId, {
          body: object.body, contentType: object.contentType, filename: object.name,
        });
      } catch (err) {
        if (err instanceof ExtractUpstreamError) {
          if (err.status === 401) invalidateOpenAiClient();
          throw new BadGatewayException({ code: "ASSISTANT_UPSTREAM", message: err.message });
        }
        throw err;
      }
      readings = extractedPages
        .sort((a, b) => a.pageStart - b.pageStart)
        .map((reading) => ({ ...reading, inboxId: `${randomUUID()}.pdf`, name: this.batchChildName(object.name, reading.pageStart, reading.pageEnd) }));
      this.assertBatchRanges(readings, pdf.getPageCount());
    }

    const context = await this.mappingContext();
    const invoices: InboxBatchProposal["invoices"] = [];
    try {
      for (const reading of readings) {
        const childKey = inboxKeyOf(reading.inboxId);
        let child: { body: Buffer; contentType: string; metadata?: Record<string, string> } | undefined;
        try { child = await this.store.get(childKey); } catch (err) { if (!isMissingObject(err)) throw err; }
        if (!child) {
          const document = await PDFDocument.create();
          const indices = Array.from({ length: reading.pageEnd - reading.pageStart + 1 }, (_, i) => reading.pageStart - 1 + i);
          for (const page of await document.copyPages(pdf, indices)) document.addPage(page);
          const body = Buffer.from(await document.save());
          created.push(reading.inboxId);
          await this.store.upload(childKey, body, "application/pdf", { name: encodeName(reading.name), ...(reading.invoice.documentStatus === "reversed" ? { documentstatus: "reversed" } : {}) });
          child = { body, contentType: "application/pdf" };
        }
        const { entry, flags } = mapExtractedInvoice(reading.invoice, context);
        invoices.push({ inboxId: reading.inboxId, name: reading.name, size: child.body.length, pageStart: reading.pageStart, pageEnd: reading.pageEnd, extracted: reading.invoice, entry, flags });
      }
      if (!cached) {
        await this.assertObjectPresent(object.key);
        const cache: CachedBatch = { version: 1, invoices: readings };
        await this.store.upload(cacheKey, Buffer.from(JSON.stringify(cache)), "application/json");
        await this.assertObjectPresent(object.key);
      }
    } catch (err) {
      await Promise.allSettled([
        ...created.map((id) => this.store.delete(inboxKeyOf(id))),
        ...(!cached ? [this.store.delete(cacheKey)] : []),
      ]);
      throw err;
    }
    // Each row now owns a separate PDF. Ignoring or replacing one cannot remove another invoice's attachment.
    return { invoices };
  }

  // Items are handled in order; an entry written earlier in the batch counts as existing for the next ones.
  async confirm(items: InboxConfirmRequest["items"]): Promise<InboxConfirmResult[]> {
    this.assertConfigured();
    const lockedMonths = lockedMonthsOf(await this.settings.get());
    const entries = await this.ledger.list();
    const results: InboxConfirmResult[] = [];
    for (const item of items) results.push(await this.confirmOne(item, entries, lockedMonths));
    return results;
  }

  async remove(inboxId: string): Promise<{ ok: true }> {
    this.assertConfigured();
    const key = inboxKeyOf(inboxId);
    const batchCacheKey = `${key}.batch.json`;
    try {
      await this.store.get(batchCacheKey);
      await this.store.delete(batchCacheKey);
    } catch (err) {
      if (!isMissingObject(err)) throw err;
    }
    await this.store.delete(key);
    return { ok: true };
  }

  private async readBatchCache(key: string, pageCount: number): Promise<CachedBatch | null> {
    let object: { body: Buffer };
    try { object = await this.store.get(key); }
    catch (err) { if (isMissingObject(err)) return null; throw err; }
    let value: unknown;
    try { value = JSON.parse(object.body.toString("utf8")); }
    catch { return null; }
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("invoices" in value) || !Array.isArray(value.invoices)) return null;
    if (value.invoices.length < 1 || value.invoices.length > 200) return null;
    const invoices: CachedBatchInvoice[] = [];
    for (const item of value.invoices) {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.inboxId !== "string" || !INBOX_ID.test(candidate.inboxId) || typeof candidate.name !== "string" ||
          typeof candidate.pageStart !== "number" || !Number.isInteger(candidate.pageStart) ||
          typeof candidate.pageEnd !== "number" || !Number.isInteger(candidate.pageEnd)) return null;
      const parsed = extractedInvoiceSchema.safeParse(candidate.invoice);
      if (!parsed.success) return null;
      invoices.push({
        inboxId: candidate.inboxId,
        name: candidate.name,
        pageStart: candidate.pageStart,
        pageEnd: candidate.pageEnd,
        invoice: parsed.data,
      });
    }
    try { this.assertBatchRanges(invoices, pageCount); }
    catch { return null; }
    return { version: 1, invoices };
  }

  private async assertObjectPresent(key: string): Promise<void> {
    try { await this.store.get(key); }
    catch (err) {
      if (isMissingObject(err)) throw new NotFoundException(UPLOAD_NOT_FOUND);
      throw err;
    }
  }

  private assertBatchRanges(readings: Pick<CachedBatchInvoice, "pageStart" | "pageEnd">[], pageCount: number): void {
    const sorted = [...readings].sort((a, b) => a.pageStart - b.pageStart);
    let lastPage = 0;
    for (const reading of sorted) {
      if (reading.pageStart <= lastPage || reading.pageEnd < reading.pageStart || reading.pageEnd > pageCount) {
        throw new BadGatewayException({ code: "ASSISTANT_UPSTREAM", message: "Les pages des factures sont incohérentes. Vérifiez le PDF puis réessayez." });
      }
      lastPage = reading.pageEnd;
    }
  }

  private batchChildName(filename: string, pageStart: number, pageEnd: number): string {
    const suffix = pageStart === pageEnd ? `p${pageStart}` : `p${pageStart}-${pageEnd}`;
    return `${filename.replace(/\.pdf$/i, "").slice(0, 100)} · ${suffix}.pdf`;
  }

  private async confirmOne(
    item: InboxConfirmRequest["items"][number],
    entries: LedgerEntry[],
    lockedMonths: string[],
  ): Promise<InboxConfirmResult> {
    const { inboxId } = item;
    const parsed = createLedgerEntrySchema.safeParse(item.entry);
    if (!parsed.success) return { inboxId, ok: false, error: parsed.error.issues[0]?.message ?? "Écriture invalide" };
    const entry = parsed.data;
    // A retry after a lost response must not create another entry, even without a readable number.
    const alreadyAdded = entries.find((existing) => existing.attachment?.key === `${INBOX_PREFIX}${inboxId}`);
    if (alreadyAdded) return { inboxId, ok: true, entryId: alreadyAdded.entryId };
    const existing = entry.number === undefined ? undefined : findDuplicate(entries, entry.book, entry.number, entry.book === "achats" ? entry.supplier ?? entry.label : undefined);
    if (existing && !item.replace) return { inboxId, ok: false, error: `Déjà dans le journal (n° ${existing.number})` };
    if (existing?.locked || lockedMonths.includes(entry.date.slice(0, 7))) return { inboxId, ok: false, error: LOCKED_MONTH };
    try {
      const attachment = await this.attachmentOf(inboxId);
      const provenance = { source: "depot" as const, attachment };
      const stored = existing
        ? await this.ledger.replaceEntry(existing.entryId, entry, provenance)
        : await this.ledger.createEntry(entry, provenance);
      const index = entries.findIndex((e) => e.entryId === stored.entryId);
      if (index >= 0) entries[index] = stored;
      else entries.push(stored);
      return { inboxId, ok: true, entryId: stored.entryId };
    } catch (err) {
      if (err instanceof HttpException) return { inboxId, ok: false, error: err.message };
      throw err;
    }
  }

  private async client(): Promise<ExtractClient> {
    this.assertConfigured();
    try {
      return await this.clientFactory();
    } catch (err) {
      if (err instanceof OpenAiNotConfiguredError) throw new ServiceUnavailableException(ASSISTANT_DISABLED);
      throw err;
    }
  }

  private async getObject(inboxId: string): Promise<InboxObject> {
    const key = inboxKeyOf(inboxId);
    try {
      const object = await this.store.get(key);
      const name = decodeName(object.metadata?.name) ?? `facture${extOf(inboxId)}`;
      return { key, body: object.body, contentType: object.contentType, name, metadata: object.metadata };
    } catch (err) {
      if (isMissingObject(err)) throw new NotFoundException(UPLOAD_NOT_FOUND);
      throw err;
    }
  }

  // The key stays where the upload put it; only the entry points at it.
  private async attachmentOf(inboxId: string): Promise<LedgerAttachment> {
    const object = await this.getObject(inboxId);
    if (object.metadata?.documentstatus === "reversed") throw new BadRequestException("Facture extournée : rapprochez-la de son avoir avant toute écriture.");
    return {
      key: object.key,
      name: object.name,
      contentType: object.contentType,
      size: object.body.length,
      uploadedAt: new Date().toISOString(),
    };
  }

  private async mappingContext(): Promise<InboxMappingContext> {
    const settings = await this.settings.get();
    const lockedMonths = lockedMonthsOf(settings);
    const entries = await this.ledger.list();
    const existingNumbers: InboxMappingContext["existingNumbers"] = [];
    for (const e of entries) {
      if (!e.number) continue;
      existingNumbers.push({ book: e.book, number: e.number, entryId: e.entryId, locked: e.locked === true || lockedMonths.includes(e.ym), party: e.supplier ?? e.label });
    }
    return {
      companyVat: settings.company?.vatNumber ?? null,
      suppliers: settings.suppliers.map((s) => s.name),
      existingNumbers,
      lockedMonths,
      today: todayYmd(),
    };
  }
}

function findDuplicate(entries: LedgerEntry[], book: LedgerBook, number: string, party?: string): LedgerEntry | undefined {
  const key = numberKey(number);
  return entries.find((e) => e.book === book && e.number !== undefined && numberKey(e.number) === key &&
    (book === "ventes" || normalizeInvoiceParty(e.supplier ?? e.label) === normalizeInvoiceParty(party ?? "")));
}
