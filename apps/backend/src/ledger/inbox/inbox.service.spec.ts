import { BadGatewayException, BadRequestException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type OpenAI from "openai";
import type { AppSettings, CreateLedgerEntryRequest, ExtractedInvoice, InboxConfirmRequest } from "@packages/types";
import { extractedInvoiceSchema } from "@packages/types";
import type { ConfigService } from "../../config/config.service";
import type { DdbService } from "../../shared/ddb.service";
import { OpenAiNotConfiguredError } from "../../shared/openai.client";
import type { SettingsService } from "../../settings/settings.service";
import { LedgerService } from "../ledger.service";
import { InboxController } from "./inbox.controller";
import {
  EXTRACTED_INVOICE_JSON_SCHEMA,
  EXTRACT_FORMAT_NAME,
  EXTRACT_INSTRUCTION,
  EXTRACT_REFUSED,
  HEIC_UNSUPPORTED,
  type ExtractClient,
  type ExtractParams,
  type ExtractRequestOptions,
} from "./inbox.extract";
import { INBOX_PREFIX, InboxService, type InboxStore, LOCKED_MONTH, UPLOAD_NOT_FOUND } from "./inbox.service";

type Item = Record<string, unknown>;

class FakeDdb {
  tables: Record<string, Map<string, Item>> = {};
  private store(table: string) {
    return (this.tables[table] ??= new Map());
  }
  requireTable(name: string) { return name; }
  async get(table: string, key: Record<string, string>) {
    return this.store(table).get(Object.values(key)[0]) ?? null;
  }
  async put(table: string, item: Item) {
    const [pk] = Object.keys(item).filter((k) => k.endsWith("Id"));
    this.store(table).set(item[pk] as string, { ...item });
  }
  async update(table: string, key: Record<string, string>, fields: Item) {
    const id = Object.values(key)[0];
    const current = this.store(table).get(id);
    if (!current) throw new Error("ConditionalCheckFailedException");
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      if (v === null) delete current[k];
      else current[k] = v;
    }
  }
  async scanAll(table: string) { return [...this.store(table).values()].map((i) => ({ ...i })); }
  async delete(table: string, key: Record<string, string>) { this.store(table).delete(Object.values(key)[0]); }
}

const COMPANY_VAT = "BE 0766.607.232";

class FakeSettings {
  settings: AppSettings = {
    settingsId: "global",
    recipeCategories: [],
    suppliers: [{ name: "Barn" }, { name: "Vds" }, { name: "Delhaize" }],
    company: { name: "Table d'Amélie SRL", vatNumber: COMPANY_VAT, address: "Rue des Fleurs 1, 1000 Bruxelles" },
    updatedAt: "2026-01-01T00:00:00.000Z",
    monthCloses: {},
  };
  async get() { return this.settings; }
  async update(fields: Partial<AppSettings>) {
    this.settings = { ...this.settings, ...fields, updatedAt: new Date().toISOString() };
    return this.settings;
  }
}

type StoredObject = { body: Buffer; contentType: string; metadata?: Record<string, string> };

class FakeS3 implements InboxStore {
  objects = new Map<string, StoredObject>();
  deleted: string[] = [];
  async upload(key: string, body: Buffer, contentType: string, metadata?: Record<string, string>) {
    this.objects.set(key, { body, contentType, metadata });
  }
  async get(key: string) {
    const object = this.objects.get(key);
    if (!object) throw Object.assign(new Error("The specified key does not exist."), { name: "NoSuchKey" });
    return { ...object };
  }
  async delete(key: string) {
    this.deleted.push(key);
    this.objects.delete(key);
  }
  async presignedUrl(key: string, opts: { filename?: string } = {}) {
    return `https://bucket.test/${key}?filename=${encodeURIComponent(opts.filename ?? "")}`;
  }
}

// One scripted answer: the JSON text the model returns, or how it fails.
type Script = { json?: unknown; text?: string; refusal?: boolean; status?: "completed" | "incomplete"; throws?: Error };

class FakeClient implements ExtractClient {
  calls: ExtractParams[] = [];
  options: (ExtractRequestOptions | undefined)[] = [];
  private readonly scripts: Script[];

  constructor(scripts: Script[]) {
    this.scripts = [...scripts];
  }

  responses = {
    create: async (params: ExtractParams, options?: ExtractRequestOptions): Promise<OpenAI.Responses.Response> => {
      this.calls.push(params);
      this.options.push(options);
      const script = this.scripts.shift();
      if (!script) throw new Error("Aucun script de réponse restant");
      if (script.throws) throw script.throws;
      const text = script.text ?? JSON.stringify(script.json);
      const content = script.refusal ? [{ type: "refusal", refusal: "Non." }] : [{ type: "output_text", text, annotations: [] }];
      return {
        id: "resp_1",
        status: script.status ?? "completed",
        output: [{ type: "message", id: "msg_1", role: "assistant", status: "completed", content }],
        output_text: script.refusal ? "" : text,
        usage: { input_tokens: 1200, output_tokens: 80, total_tokens: 1280 },
        error: null,
      } as unknown as OpenAI.Responses.Response;
    },
  };
}

const config = (env: Record<string, string | undefined>): ConfigService =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

// A parameter name, not a key: isAssistantConfigured only checks that a source is named.
const CONFIGURED = config({ OPENAI_API_KEY_PARAMETER: "/test/OPENAI_API_KEY", OPENAI_MODEL: "test-model", AWS_REGION: "eu-west-1" });
const UNCONFIGURED = config({ AWS_REGION: "eu-west-1" });

const read = (over: Partial<ExtractedInvoice> = {}): ExtractedInvoice => ({
  issuerName: "Vds Food",
  issuerVat: "BE0123456789",
  recipientName: "Table d'Amélie SRL",
  recipientVat: "BE0766607232",
  number: "VDS-2026-001",
  date: "2026-10-02",
  dueDate: null,
  currency: "EUR",
  totalTvac: 121,
  htva: 100,
  vatAmount: 21,
  vatLines: [{ rate: 21, base: 100, amount: 21 }],
  kindGuess: "facture",
  paid: null,
  confidence: 0.95,
  remarks: null,
  ...over,
});

const saleRead = (over: Partial<ExtractedInvoice> = {}): ExtractedInvoice =>
  read({
    issuerName: "TABLE D'AMELIE SRL",
    issuerVat: "BE 0766.607.232",
    recipientName: "Mme Dupont",
    recipientVat: null,
    number: "INV/2026/0042",
    date: "2026-10-05",
    totalTvac: 106,
    htva: 100,
    vatAmount: 6,
    vatLines: [{ rate: 6, base: 100, amount: 6 }],
    paid: true,
    ...over,
  });

const pdf = (name = "facture.pdf") => ({ originalname: name, mimetype: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
const jpeg = (name = "photo.jpg") => ({ originalname: name, mimetype: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) });

const sale = (overrides: Partial<CreateLedgerEntryRequest> = {}): CreateLedgerEntryRequest => ({
  book: "ventes",
  kind: "facture",
  date: "2026-10-05",
  label: "Mme Dupont",
  number: "INV/2026/0042",
  totalTvac: 106,
  htva: 100,
  vatRate: 6,
  vatAmount: 6,
  paid: true,
  ...overrides,
} as CreateLedgerEntryRequest);

const codes = (flags: { code: string }[]) => flags.map((f) => f.code);

// The extract logs are checked in one test and kept out of the test output everywhere.
let log: jest.SpyInstance;
let error: jest.SpyInstance;
beforeEach(() => {
  log = jest.spyOn(console, "log").mockImplementation(() => undefined);
  error = jest.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  log.mockRestore();
  error.mockRestore();
});

type Harness = { ddb: FakeDdb; settings: FakeSettings; s3: FakeS3; client: FakeClient; ledger: LedgerService; service: InboxService };

function harness(scripts: Script[] = [], cfg: ConfigService = CONFIGURED, factory?: () => Promise<ExtractClient>): Harness {
  const ddb = new FakeDdb();
  const settings = new FakeSettings();
  const s3 = new FakeS3();
  const client = new FakeClient(scripts);
  const ledger = new LedgerService(ddb as unknown as DdbService, settings as unknown as SettingsService, s3 as never);
  const service = new InboxService(cfg, ledger, settings as unknown as SettingsService, s3, factory ?? (async () => client));
  return { ddb, settings, s3, client, ledger, service };
}

const confirmItem = (inboxId: string, entry: CreateLedgerEntryRequest, replace = false): InboxConfirmRequest["items"][number] => ({ inboxId, entry, replace });

describe("InboxService.upload", () => {
  it("stores the file under ledger-inbox with the name in metadata and returns the upload", async () => {
    const { service, s3 } = harness();
    const upload = await service.upload(pdf("Facture août.pdf"));
    expect(upload).toEqual({ inboxId: expect.stringMatching(/^[0-9a-f-]{36}\.pdf$/), name: "Facture août.pdf", contentType: "application/pdf", size: 13 });
    const stored = s3.objects.get(`${INBOX_PREFIX}${upload.inboxId}`);
    expect(stored).toBeDefined();
    expect(stored?.contentType).toBe("application/pdf");
    expect(stored?.metadata).toEqual({ name: encodeURIComponent("Facture août.pdf") });
    expect(stored?.body.toString()).toBe("%PDF-1.4 test");
    expect(s3.objects.size).toBe(1);
  });

  it("keeps the image extension and falls back to a name when the file has none", async () => {
    const { service } = harness();
    const upload = await service.upload(jpeg("  "));
    expect(upload.inboxId).toMatch(/\.jpg$/);
    expect(upload.name).toBe("facture.jpg");
  });

  it("refuses HEIC with a French message and refuses unknown types", async () => {
    const { service, s3 } = harness();
    const heic = await service.upload({ originalname: "IMG_0001.HEIC", mimetype: "image/heic", buffer: Buffer.from("x") }).catch((e) => e);
    expect(heic).toBeInstanceOf(BadRequestException);
    expect((heic as BadRequestException).message).toBe(HEIC_UNSUPPORTED);
    const docx = await service.upload({ originalname: "a.docx", mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("x") }).catch((e) => e);
    expect(docx).toBeInstanceOf(BadRequestException);
    expect(s3.objects.size).toBe(0);
  });
});

describe("InboxService.extract", () => {
  it("maps a ventes PDF whose issuer VAT equals the company's to a facture entry with no flags", async () => {
    const h = harness([{ json: saleRead() }]);
    const { inboxId } = await h.service.upload(pdf("INV-0042.pdf"));
    const proposal = await h.service.extract(inboxId);
    expect(proposal.inboxId).toBe(inboxId);
    expect(proposal.flags).toEqual([]);
    expect(proposal.entry).toEqual({
      book: "ventes", kind: "facture", date: "2026-10-05", number: "INV/2026/0042", label: "Mme Dupont",
      totalTvac: 106, htva: 100, vatRate: 6, vatAmount: 6, paid: true,
    });
    expect(proposal.extracted).toEqual(saleRead());

    const [params] = h.client.calls;
    expect(params.model).toBe("test-model");
    expect(params.store).toBe(false);
    expect(params.text).toEqual({ format: { type: "json_schema", name: EXTRACT_FORMAT_NAME, strict: true, schema: EXTRACTED_INVOICE_JSON_SCHEMA } });
    const [message] = params.input as unknown as { role: string; content: Record<string, unknown>[] }[];
    expect(message.role).toBe("user");
    expect(message.content[0]).toEqual({ type: "input_text", text: EXTRACT_INSTRUCTION });
    expect(message.content[1]).toEqual({
      type: "input_file",
      filename: "INV-0042.pdf",
      file_data: `data:application/pdf;base64,${Buffer.from("%PDF-1.4 test").toString("base64")}`,
    });
    expect(h.client.options[0]?.timeout).toBe(60_000);
    expect(h.client.options[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends a photo as input_image", async () => {
    const h = harness([{ json: read() }]);
    const { inboxId } = await h.service.upload(jpeg());
    await h.service.extract(inboxId);
    const [message] = h.client.calls[0].input as unknown as { content: Record<string, unknown>[] }[];
    expect(message.content[1]).toEqual({
      type: "input_image",
      detail: "high",
      image_url: `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64")}`,
    });
  });

  it("maps a purchase from Vds to achats · mp with the supplier from the settings", async () => {
    const h = harness([{ json: read({ issuerName: "VDS FOOD SA" }) }]);
    const { inboxId } = await h.service.upload(pdf("vds.pdf"));
    const proposal = await h.service.extract(inboxId);
    expect(proposal.flags).toEqual([]);
    expect(proposal.entry).toMatchObject({ book: "achats", kind: "mp", supplier: "Vds", label: "VDS FOOD SA", number: "VDS-2026-001", vatRate: 21 });
  });

  it("fixes a VAT that does not add up and flags the row", async () => {
    const h = harness([{ json: read({ totalTvac: 121, htva: 100, vatAmount: 19 }) }]);
    const { inboxId } = await h.service.upload(pdf());
    const proposal = await h.service.extract(inboxId);
    expect(codes(proposal.flags)).toEqual(["vat_fixed"]);
    expect(proposal.flags[0].message).toBe("TVA recalculée (19 lue, 21 retenue)");
    expect(proposal.entry).toMatchObject({ htva: 100, vatAmount: 21, totalTvac: 121 });
  });

  it("flags a number already in the journal and a locked month from the ledger and the settings", async () => {
    const h = harness([{ json: saleRead() }, { json: saleRead({ number: "INV/2026/0043", date: "2026-09-10" }) }]);
    const existing = await h.ledger.create(sale());
    await h.ledger.create(sale({ number: "SEP-1", date: "2026-09-02" }));
    await h.ledger.lockMonth({ ym: "2026-09" });

    const first = await h.service.extract((await h.service.upload(pdf())).inboxId);
    expect(first.flags).toEqual([{ code: "duplicate", message: "Déjà dans le journal (n° INV/2026/0042)", entryId: existing.entryId }]);

    const second = await h.service.extract((await h.service.upload(pdf())).inboxId);
    expect(codes(second.flags)).toEqual(["locked_month"]);
  });

  it("returns a null entry with missing_amount when the amounts cannot be completed", async () => {
    const h = harness([{ json: read({ totalTvac: null, htva: null, vatAmount: 21 }) }]);
    const proposal = await h.service.extract((await h.service.upload(pdf())).inboxId);
    expect(proposal.entry).toBeNull();
    expect(codes(proposal.flags)).toContain("missing_amount");
  });

  it("cuts over-long strings instead of failing the reading", async () => {
    const h = harness([{ json: read({ issuerName: "V".repeat(200), remarks: "r".repeat(400) }) }]);
    const proposal = await h.service.extract((await h.service.upload(pdf())).inboxId);
    expect(proposal.extracted.issuerName).toHaveLength(120);
    expect(proposal.extracted.remarks).toHaveLength(300);
  });

  it("turns a model failure, a refusal and an unusable answer into 502 ASSISTANT_UPSTREAM", async () => {
    const h = harness([
      { throws: Object.assign(new Error("Rate limit"), { status: 429 }) },
      { refusal: true },
      { text: "not json" },
      { json: { ...read(), kindGuess: "ticket" } },
      { json: read(), status: "incomplete" },
    ]);
    const { inboxId } = await h.service.upload(pdf());
    const errors: unknown[] = [];
    for (let i = 0; i < 5; i++) errors.push(await h.service.extract(inboxId).catch((e) => e));
    for (const err of errors) {
      expect(err).toBeInstanceOf(BadGatewayException);
      expect((err as BadGatewayException).getResponse()).toMatchObject({ code: "ASSISTANT_UPSTREAM" });
    }
    expect((errors[0] as BadGatewayException).getResponse()).toMatchObject({ message: "Rate limit" });
    expect((errors[1] as BadGatewayException).getResponse()).toMatchObject({ message: EXTRACT_REFUSED });
    expect((errors[3] as BadGatewayException).getResponse()).toMatchObject({ message: expect.stringContaining("kindGuess") });
  });

  it("is 404 for a missing upload and 400 for an id that is not an inbox id", async () => {
    const h = harness([{ json: read() }]);
    const missing = await h.service.extract("0d9a6e9c-5f3c-4b1a-9c2e-1f2a3b4c5d6e.pdf").catch((e) => e);
    expect(missing).toBeInstanceOf(NotFoundException);
    expect((missing as NotFoundException).message).toBe(UPLOAD_NOT_FOUND);
    const traversal = await h.service.extract("../event-files/x.pdf").catch((e) => e);
    expect(traversal).toBeInstanceOf(BadRequestException);
    expect(h.client.calls).toHaveLength(0);
  });

  it("never logs the invoice content", async () => {
    const h = harness([{ json: saleRead() }, { text: "not json" }]);
    const { inboxId } = await h.service.upload(pdf());
    await h.service.extract(inboxId);
    await h.service.extract(inboxId).catch(() => undefined);
    const lines = [...log.mock.calls, ...error.mock.calls].map((c) => String(c[0]));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain(inboxId);
    expect(lines[0]).toContain('"durationMs"');
    expect(lines[0]).toContain('"input_tokens":1200');
    for (const line of lines) {
      expect(line).not.toContain("Dupont");
      expect(line).not.toContain("INV/2026/0042");
      expect(line).not.toContain("%PDF");
    }
  });
});

describe("InboxService.confirm", () => {
  it("creates the entry with source depot and the attachment built from the object", async () => {
    const h = harness();
    const { inboxId } = await h.service.upload(pdf("Facture août.pdf"));
    const [result] = await h.service.confirm([confirmItem(inboxId, sale())]);
    expect(result).toEqual({ inboxId, ok: true, entryId: expect.any(String) });
    if (!result.ok) throw new Error("unreachable");
    const stored = await h.ledger.getOrFail(result.entryId);
    expect(stored).toMatchObject({ book: "ventes", number: "INV/2026/0042", ym: "2026-10", source: "depot" });
    expect(stored.attachment).toEqual({
      key: `${INBOX_PREFIX}${inboxId}`,
      name: "Facture août.pdf",
      contentType: "application/pdf",
      size: 13,
      uploadedAt: expect.any(String),
    });
    expect(h.s3.objects.has(`${INBOX_PREFIX}${inboxId}`)).toBe(true);
  });

  it("refuses a duplicate number in the same book and replaces it on demand", async () => {
    const h = harness();
    const existing = await h.ledger.create(sale({ label: "Ancienne" }));
    const { inboxId } = await h.service.upload(pdf());
    const [refused] = await h.service.confirm([confirmItem(inboxId, sale({ number: "inv/2026/0042" }))]);
    expect(refused).toEqual({ inboxId, ok: false, error: "Déjà dans le journal (n° INV/2026/0042)" });
    expect(await h.ledger.list()).toHaveLength(1);

    const [replaced] = await h.service.confirm([confirmItem(inboxId, sale({ label: "Nouvelle" }), true)]);
    expect(replaced).toEqual({ inboxId, ok: true, entryId: existing.entryId });
    const stored = await h.ledger.getOrFail(existing.entryId);
    expect(stored).toMatchObject({ label: "Nouvelle", source: "depot", createdAt: existing.createdAt });
    expect(stored.attachment?.key).toBe(`${INBOX_PREFIX}${inboxId}`);
    expect(await h.ledger.list()).toHaveLength(1);
  });

  it("lets the same number live in the other book", async () => {
    const h = harness();
    await h.ledger.create(sale());
    const { inboxId } = await h.service.upload(pdf());
    const purchase: CreateLedgerEntryRequest = { book: "achats", kind: "mp", date: "2026-10-05", label: "Vds", number: "INV/2026/0042", totalTvac: 121, htva: 100, vatRate: 21, vatAmount: 21, supplier: "Vds" };
    const [result] = await h.service.confirm([confirmItem(inboxId, purchase)]);
    expect(result.ok).toBe(true);
  });

  it("refuses a locked month, with or without replace", async () => {
    const h = harness();
    const existing = await h.ledger.create(sale({ date: "2026-09-05" }));
    await h.ledger.lockMonth({ ym: "2026-09" });
    const { inboxId } = await h.service.upload(pdf());
    const results = await h.service.confirm([
      confirmItem(inboxId, sale({ number: "NEW-1", date: "2026-09-20" })),
      confirmItem(inboxId, sale({ date: "2026-10-05" }), true),
    ]);
    expect(results).toEqual([
      { inboxId, ok: false, error: LOCKED_MONTH },
      { inboxId, ok: false, error: LOCKED_MONTH },
    ]);
    expect((await h.ledger.getOrFail(existing.entryId)).label).toBe("Mme Dupont");
    expect(await h.ledger.list()).toHaveLength(1);
  });

  it("handles the batch in order: the second file with the same number is a duplicate, the rest goes through", async () => {
    const h = harness();
    const a = await h.service.upload(pdf("a.pdf"));
    const b = await h.service.upload(pdf("b.pdf"));
    const c = await h.service.upload(pdf("c.pdf"));
    const results = await h.service.confirm([
      confirmItem(a.inboxId, sale()),
      confirmItem(b.inboxId, sale({ label: "Doublon" })),
      confirmItem(c.inboxId, sale({ number: "INV/2026/0043", label: "Autre" })),
    ]);
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(results[1]).toMatchObject({ error: "Déjà dans le journal (n° INV/2026/0042)" });
    expect(await h.ledger.list()).toHaveLength(2);
  });

  it("reports an invalid entry, a bad inbox id and a missing upload per item without stopping the batch", async () => {
    const h = harness();
    const { inboxId } = await h.service.upload(pdf());
    const results = await h.service.confirm([
      confirmItem(inboxId, { ...sale(), vatAmount: 5 }),
      confirmItem("../x.pdf", sale({ number: "N-1" })),
      confirmItem("0d9a6e9c-5f3c-4b1a-9c2e-1f2a3b4c5d6e.pdf", sale({ number: "N-2" })),
      confirmItem(inboxId, sale({ number: "N-3" })),
    ]);
    expect(results.map((r) => r.ok)).toEqual([false, false, false, true]);
    expect(results[0]).toMatchObject({ error: "HTVA + TVA doit égaler TVAC" });
    expect(results[2]).toMatchObject({ error: UPLOAD_NOT_FOUND });
    expect(await h.ledger.list()).toHaveLength(1);
  });

  it("drops the previous file when a replace points the entry at a new one", async () => {
    const h = harness();
    const first = await h.service.upload(pdf("v1.pdf"));
    const [created] = await h.service.confirm([confirmItem(first.inboxId, sale())]);
    const second = await h.service.upload(pdf("v2.pdf"));
    const [replaced] = await h.service.confirm([confirmItem(second.inboxId, sale({ label: "v2" }), true)]);
    expect(replaced.ok && created.ok && replaced.entryId === created.entryId).toBe(true);
    expect(h.s3.deleted).toEqual([`${INBOX_PREFIX}${first.inboxId}`]);
    expect(h.s3.objects.has(`${INBOX_PREFIX}${second.inboxId}`)).toBe(true);
  });
});

describe("InboxService.remove and the ledger cascade", () => {
  it("remove deletes the dropped file", async () => {
    const h = harness();
    const { inboxId } = await h.service.upload(pdf());
    expect(await h.service.remove(inboxId)).toEqual({ ok: true });
    expect(h.s3.objects.size).toBe(0);
    const bad = await h.service.remove("../event-files/x.pdf").catch((e) => e);
    expect(bad).toBeInstanceOf(BadRequestException);
  });

  it("LedgerService.remove deletes the attachment object with the entry", async () => {
    const h = harness();
    const { inboxId } = await h.service.upload(pdf());
    const [result] = await h.service.confirm([confirmItem(inboxId, sale())]);
    if (!result.ok) throw new Error("unreachable");
    await h.ledger.remove(result.entryId);
    expect(await h.ledger.get(result.entryId)).toBeNull();
    expect(h.s3.deleted).toEqual([`${INBOX_PREFIX}${inboxId}`]);
    const plain = await h.ledger.create(sale({ number: "PLAIN" }));
    await h.ledger.remove(plain.entryId);
    expect(h.s3.deleted).toHaveLength(1);
  });

  it("a hand edit through replace keeps the attachment and the source", async () => {
    const h = harness();
    const { inboxId } = await h.service.upload(pdf());
    const [result] = await h.service.confirm([confirmItem(inboxId, sale())]);
    if (!result.ok) throw new Error("unreachable");
    const edited = await h.ledger.replace(result.entryId, sale({ label: "Corrigée" }));
    expect(edited.label).toBe("Corrigée");
    expect(edited.source).toBe("depot");
    expect(edited.attachment?.key).toBe(`${INBOX_PREFIX}${inboxId}`);
    expect(h.s3.deleted).toEqual([]);
  });

  it("attachmentUrl presigns the object under its original name and is 404 without one", async () => {
    const h = harness();
    const { inboxId } = await h.service.upload(pdf("Facture août.pdf"));
    const [result] = await h.service.confirm([confirmItem(inboxId, sale())]);
    if (!result.ok) throw new Error("unreachable");
    expect(await h.ledger.attachmentUrl(result.entryId)).toEqual({
      url: `https://bucket.test/${INBOX_PREFIX}${inboxId}?filename=${encodeURIComponent("Facture août.pdf")}`,
    });
    const plain = await h.ledger.create(sale({ number: "PLAIN" }));
    const none = await h.ledger.attachmentUrl(plain.entryId).catch((e) => e);
    expect(none).toBeInstanceOf(NotFoundException);
  });
});

describe("InboxService without a key source", () => {
  it("every inbox call is 503 ASSISTANT_DISABLED", async () => {
    const h = harness([{ json: read() }], UNCONFIGURED);
    const calls = [
      h.service.upload(pdf()),
      h.service.extract("0d9a6e9c-5f3c-4b1a-9c2e-1f2a3b4c5d6e.pdf"),
      h.service.confirm([confirmItem("0d9a6e9c-5f3c-4b1a-9c2e-1f2a3b4c5d6e.pdf", sale())]),
      h.service.remove("0d9a6e9c-5f3c-4b1a-9c2e-1f2a3b4c5d6e.pdf"),
    ];
    for (const call of calls) {
      const err = await call.catch((e) => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect((err as ServiceUnavailableException).getResponse()).toEqual({ code: "ASSISTANT_DISABLED" });
    }
    expect(h.s3.objects.size).toBe(0);
    expect(h.client.calls).toHaveLength(0);
  });

  it("is 503 when the parameter is named but missing in SSM", async () => {
    const h = harness([], CONFIGURED, async () => { throw new OpenAiNotConfiguredError(); });
    const { inboxId } = await h.service.upload(pdf());
    const err = await h.service.extract(inboxId).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect((err as ServiceUnavailableException).getResponse()).toEqual({ code: "ASSISTANT_DISABLED" });
  });
});

describe("InboxController", () => {
  it("validates the bodies and passes the multer file through", async () => {
    const h = harness([{ json: saleRead() }]);
    const controller = new InboxController(h.service);
    const noFile = await controller.upload(undefined).catch((e) => e);
    expect(noFile).toBeInstanceOf(BadRequestException);
    const upload = await controller.upload({ ...pdf("INV-0042.pdf"), size: 13 } as Express.Multer.File);
    expect(upload.name).toBe("INV-0042.pdf");
    const badExtract = await controller.extract({ inboxId: "" }).catch((e) => e);
    expect(badExtract).toBeInstanceOf(BadRequestException);
    const proposal = await controller.extract({ inboxId: upload.inboxId });
    expect(proposal.entry?.number).toBe("INV/2026/0042");
    const badConfirm = await controller.confirm({ items: [] }).catch((e) => e);
    expect(badConfirm).toBeInstanceOf(BadRequestException);
    const confirmed = await controller.confirm({ items: [{ inboxId: upload.inboxId, entry: proposal.entry }] });
    expect(confirmed.results[0].ok).toBe(true);
    expect(await controller.remove(upload.inboxId)).toEqual({ ok: true });
  });
});

describe("EXTRACTED_INVOICE_JSON_SCHEMA", () => {
  it("lists exactly the keys of extractedInvoiceSchema, all required, no extra property", () => {
    const zodKeys = Object.keys(extractedInvoiceSchema.shape).sort();
    expect([...EXTRACTED_INVOICE_JSON_SCHEMA.required].sort()).toEqual(zodKeys);
    expect(Object.keys(EXTRACTED_INVOICE_JSON_SCHEMA.properties).sort()).toEqual(zodKeys);
    expect(EXTRACTED_INVOICE_JSON_SCHEMA.additionalProperties).toBe(false);
    const line = EXTRACTED_INVOICE_JSON_SCHEMA.properties.vatLines.items;
    const lineKeys = Object.keys(extractedInvoiceSchema.shape.vatLines.element.shape).sort();
    expect([...line.required].sort()).toEqual(lineKeys);
    expect(Object.keys(line.properties).sort()).toEqual(lineKeys);
    expect(line.additionalProperties).toBe(false);
    expect([...EXTRACTED_INVOICE_JSON_SCHEMA.properties.kindGuess.enum]).toEqual(extractedInvoiceSchema.shape.kindGuess.options);
  });

  it("nullable fields in the JSON schema are exactly the nullable fields of the Zod schema", () => {
    for (const [key, field] of Object.entries(extractedInvoiceSchema.shape)) {
      const json = EXTRACTED_INVOICE_JSON_SCHEMA.properties[key as keyof typeof EXTRACTED_INVOICE_JSON_SCHEMA.properties] as { type: string | readonly string[] };
      const jsonNullable = Array.isArray(json.type) && json.type.includes("null");
      expect({ key, nullable: jsonNullable }).toEqual({ key, nullable: field.isNullable() });
    }
  });
});
