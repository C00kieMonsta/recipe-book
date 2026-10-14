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
import type {
  AppSettings,
  ExtractedInvoice,
  InboxConfirmRequest,
  InboxConfirmResult,
  InboxMappingContext,
  InboxProposal,
  InboxUpload,
  LedgerAttachment,
  LedgerBook,
  LedgerEntry,
} from "@packages/types";
import { createLedgerEntrySchema, mapExtractedInvoice, todayYmd } from "@packages/types";
import { ConfigService, DEFAULT_OPENAI_MODEL } from "../../config/config.service";
import { OpenAiNotConfiguredError, getOpenAiClient, invalidateOpenAiClient, isAssistantConfigured } from "../../shared/openai.client";
import { S3Service } from "../../shared/s3.service";
import { SettingsService } from "../../settings/settings.service";
import { LedgerService } from "../ledger.service";
import {
  ExtractUpstreamError,
  HEIC_UNSUPPORTED,
  INBOX_TYPES,
  UNSUPPORTED_TYPE,
  extractInvoice,
  isHeic,
  type ExtractClient,
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

type InboxObject = { key: string; body: Buffer; contentType: string; name: string };

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
    const { entry, flags } = mapExtractedInvoice(extracted, await this.mappingContext());
    return { inboxId, entry, flags, extracted };
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
    await this.store.delete(inboxKeyOf(inboxId));
    return { ok: true };
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
    const existing = entry.number === undefined ? undefined : findDuplicate(entries, entry.book, entry.number);
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
      return { key, body: object.body, contentType: object.contentType, name };
    } catch (err) {
      if (isMissingObject(err)) throw new NotFoundException(UPLOAD_NOT_FOUND);
      throw err;
    }
  }

  // The key stays where the upload put it; only the entry points at it.
  private async attachmentOf(inboxId: string): Promise<LedgerAttachment> {
    const object = await this.getObject(inboxId);
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
      existingNumbers.push({ book: e.book, number: e.number, entryId: e.entryId, locked: e.locked === true || lockedMonths.includes(e.ym) });
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

function findDuplicate(entries: LedgerEntry[], book: LedgerBook, number: string): LedgerEntry | undefined {
  const key = numberKey(number);
  return entries.find((e) => e.book === book && e.number !== undefined && numberKey(e.number) === key);
}
