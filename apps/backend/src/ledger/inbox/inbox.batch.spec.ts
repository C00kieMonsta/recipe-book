import { BadGatewayException, BadRequestException } from "@nestjs/common";
import type OpenAI from "openai";
import { PDFDocument } from "pdf-lib";
import type { AppSettings, CreateLedgerEntryRequest, ExtractedInvoice } from "@packages/types";
import type { ConfigService } from "../../config/config.service";
import type { DdbService } from "../../shared/ddb.service";
import type { SettingsService } from "../../settings/settings.service";
import { LedgerService } from "../ledger.service";
import { InboxController } from "./inbox.controller";
import type { ExtractClient, ExtractParams, ExtractRequestOptions } from "./inbox.extract";
import { InboxService, type InboxStore, INBOX_PREFIX } from "./inbox.service";

type Item = Record<string, unknown>;

class MemoryDdb {
  private readonly tables = new Map<string, Map<string, Item>>();
  private table(name: string) {
    let table = this.tables.get(name);
    if (!table) this.tables.set(name, (table = new Map()));
    return table;
  }
  requireTable(name: string) { return name; }
  async get(table: string, key: Record<string, string>) { return this.table(table).get(Object.values(key)[0]) ?? null; }
  async put(table: string, item: Item) {
    const pk = Object.keys(item).find((key) => key.endsWith("Id"));
    if (pk) this.table(table).set(item[pk] as string, { ...item });
  }
  async update(table: string, key: Record<string, string>, fields: Item) {
    const item = this.table(table).get(Object.values(key)[0]);
    if (!item) throw new Error("ConditionalCheckFailedException");
    for (const [name, value] of Object.entries(fields)) {
      if (value === null) delete item[name];
      else if (value !== undefined) item[name] = value;
    }
  }
  async scanAll(table: string) { return [...this.table(table).values()].map((item) => ({ ...item })); }
  async delete(table: string, key: Record<string, string>) { this.table(table).delete(Object.values(key)[0]); }
}

class MemoryStore implements InboxStore {
  readonly objects = new Map<string, { body: Buffer; contentType: string; metadata?: Record<string, string> }>();
  failNextUploadEnding?: string;
  async upload(key: string, body: Buffer, contentType: string, metadata?: Record<string, string>) {
    if (this.failNextUploadEnding && key.endsWith(this.failNextUploadEnding)) {
      this.failNextUploadEnding = undefined;
      throw new Error("S3 upload failed");
    }
    this.objects.set(key, { body, contentType, metadata });
  }
  async get(key: string) {
    const value = this.objects.get(key);
    if (!value) throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
    return value;
  }
  async delete(key: string) { this.objects.delete(key); }
}

type Script = { json?: unknown; text?: string; refusal?: boolean; status?: "completed" | "incomplete" };
class ScriptedClient implements ExtractClient {
  readonly calls: ExtractParams[] = [];
  private readonly scripts: Script[];
  constructor(scripts: Script[]) { this.scripts = [...scripts]; }
  responses = {
    create: async (params: ExtractParams, _options?: ExtractRequestOptions): Promise<OpenAI.Responses.Response> => {
      this.calls.push(params);
      const script = this.scripts.shift();
      if (!script) throw new Error("No scripted response");
      const text = script.text ?? JSON.stringify(script.json);
      const content = script.refusal
        ? [{ type: "refusal", refusal: "Refusé" }]
        : [{ type: "output_text", text, annotations: [] }];
      return {
        id: "resp_batch_test",
        status: script.status ?? "completed",
        output: [{ type: "message", id: "msg_batch_test", role: "assistant", status: "completed", content }],
        output_text: script.refusal ? "" : text,
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        error: null,
      } as unknown as OpenAI.Responses.Response;
    },
  };
}

const VAT = "BE 0766.607.232";
const configuration = { get: (key: string) => ({ OPENAI_API_KEY_PARAMETER: "/test/key", OPENAI_MODEL: "test-model", AWS_REGION: "eu-west-1" })[key] } as unknown as ConfigService;
const settingsFixture: AppSettings = {
  settingsId: "global",
  recipeCategories: [],
  suppliers: [{ name: "Vds" }],
  company: { name: "Table d'Amélie SRL", vatNumber: VAT, address: "Bruxelles" },
  updatedAt: "2026-01-01T00:00:00.000Z",
  monthCloses: {},
};

const invoice = (overrides: Partial<ExtractedInvoice> = {}): ExtractedInvoice => ({
  issuerName: "Table d'Amélie SRL",
  issuerVat: VAT,
  recipientName: "Mme Dupont",
  recipientVat: null,
  number: "INV-2026-001",
  date: "2026-10-05",
  dueDate: null,
  currency: "EUR",
  totalTvac: 106,
  htva: 100,
  vatAmount: 6,
  vatLines: [{ rate: 6, base: 100, amount: 6 }],
  kindGuess: "facture",
  paid: false,
  confidence: 0.98,
  remarks: null,
  ...overrides,
});

const sale = (overrides: Partial<CreateLedgerEntryRequest> = {}): CreateLedgerEntryRequest => ({
  book: "ventes", kind: "facture", date: "2026-10-05", label: "Mme Dupont", number: "INV-2026-001",
  totalTvac: 106, htva: 100, vatRate: 6, vatAmount: 6, paid: false,
  ...overrides,
} as CreateLedgerEntryRequest);
const purchase = (supplier: string, number = "SUP-2026-001"): CreateLedgerEntryRequest => ({
  book: "achats", kind: "mp", date: "2026-10-05", label: supplier, supplier, number,
  totalTvac: 121, htva: 100, vatRate: 21, vatAmount: 21,
} as CreateLedgerEntryRequest);

const pdfFile = (name = "achats-octobre.pdf") => ({ originalname: name, mimetype: "application/pdf", buffer: Buffer.from("not used") });
const photoFile = () => ({ originalname: "facture.jpg", mimetype: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) });

async function threePagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let page = 0; page < 3; page++) doc.addPage([300, 400]);
  return Buffer.from(await doc.save());
}

function harness(scripts: Script[]) {
  const ddb = new MemoryDdb();
  const settings = {
    get: async () => settingsFixture,
    update: async (fields: Partial<AppSettings>) => ({ ...settingsFixture, ...fields }),
  };
  const store = new MemoryStore();
  const client = new ScriptedClient(scripts);
  const ledger = new LedgerService(ddb as unknown as DdbService, settings as unknown as SettingsService, store as never);
  const service = new InboxService(configuration, ledger, settings as unknown as SettingsService, store, async () => client);
  return { ddb, store, client, ledger, service, controller: new InboxController(service) };
}

async function uploadPdf(h: ReturnType<typeof harness>) {
  return h.service.upload({ ...pdfFile(), buffer: Buffer.from(new Uint8Array(await threePagePdf())) });
}

const batch = (...invoices: { pageStart: number; pageEnd: number; invoice: ExtractedInvoice }[]) => ({ invoices, truncated: false });

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

describe("InboxService.extractBatch", () => {
  it("reuses cached page extraction and child IDs while refreshing duplicate flags", async () => {
    const h = harness([{ json: batch(
      { pageStart: 1, pageEnd: 2, invoice: invoice({ number: "INV-ONE" }) },
      { pageStart: 3, pageEnd: 3, invoice: invoice({ number: "INV-TWO" }) },
    ) }]);
    const upload = await uploadPdf(h);
    const first = await h.service.extractBatch(upload.inboxId);
    const firstIds = first.invoices.map((proposal) => proposal.inboxId);
    expect(h.store.objects.size).toBe(4); // source, cache, and two child PDFs

    await h.ledger.create(sale({ number: "INV-ONE" }));
    const retry = await h.service.extractBatch(upload.inboxId);
    expect(h.client.calls).toHaveLength(1);
    expect(retry.invoices.map((proposal) => proposal.inboxId)).toEqual(firstIds);
    expect(retry.invoices[0].flags.map((flag) => flag.code)).toContain("duplicate");
    expect(h.store.objects.size).toBe(4); // source, cache, and two child PDFs
  });

  it("cleans newly split PDFs when saving the extraction cache fails and preserves the source", async () => {
    const h = harness([{ json: batch(
      { pageStart: 1, pageEnd: 2, invoice: invoice({ number: "INV-ONE" }) },
      { pageStart: 3, pageEnd: 3, invoice: invoice({ number: "INV-TWO" }) },
    ) }]);
    const upload = await uploadPdf(h);
    h.store.failNextUploadEnding = ".batch.json";
    await expect(h.service.extractBatch(upload.inboxId)).rejects.toThrow("S3 upload failed");
    expect(h.store.objects.size).toBe(1);
    expect(h.store.objects.has(`${INBOX_PREFIX}${upload.inboxId}`)).toBe(true);
  });

  it("clears only the parent extraction cache when removing the source", async () => {
    const h = harness([{ json: batch({ pageStart: 1, pageEnd: 3, invoice: invoice() }) }]);
    const upload = await uploadPdf(h);
    const result = await h.service.extractBatch(upload.inboxId);
    const childKey = `${INBOX_PREFIX}${result.invoices[0].inboxId}`;
    const cacheKey = `${INBOX_PREFIX}${upload.inboxId}.batch.json`;
    expect(h.store.objects.has(cacheKey)).toBe(true);
    await h.service.remove(upload.inboxId);
    expect(h.store.objects.has(`${INBOX_PREFIX}${upload.inboxId}`)).toBe(false);
    expect(h.store.objects.has(cacheKey)).toBe(false);
    expect(h.store.objects.has(childKey)).toBe(true);
  });

  it("shares one model extraction and one child set for same-process concurrent calls", async () => {
    const h = harness([{ json: batch(
      { pageStart: 1, pageEnd: 2, invoice: invoice({ number: "INV-ONE" }) },
      { pageStart: 3, pageEnd: 3, invoice: invoice({ number: "INV-TWO" }) },
    ) }]);
    const upload = await uploadPdf(h);
    const [first, second] = await Promise.all([
      h.service.extractBatch(upload.inboxId),
      h.service.extractBatch(upload.inboxId),
    ]);
    expect(h.client.calls).toHaveLength(1);
    expect(second.invoices.map((proposal) => proposal.inboxId)).toEqual(first.invoices.map((proposal) => proposal.inboxId));
    expect(h.store.objects.size).toBe(4);
  });

  it("makes a repeated confirmation idempotent when the invoice number was unreadable", async () => {
    const h = harness([]);
    const upload = await h.service.upload(pdfFile("sans-numero.pdf"));
    const item = { inboxId: upload.inboxId, entry: sale({ number: undefined }), replace: false };
    const first = await h.service.confirm([item]);
    const retry = await h.service.confirm([item]);
    expect(first[0]).toMatchObject({ ok: true, entryId: expect.any(String) });
    expect(retry).toEqual(first);
    expect(await h.ledger.list()).toHaveLength(1);
  });

  it("allows a matching purchase number from a different supplier and rejects the same supplier", async () => {
    const h = harness([]);
    await h.ledger.create(purchase("Vds"));
    const differentSupplier = await h.service.upload(pdfFile("other.pdf"));
    const sameSupplier = await h.service.upload(pdfFile("same.pdf"));
    const results = await h.service.confirm([
      { inboxId: differentSupplier.inboxId, entry: purchase("Delhaize"), replace: false },
      { inboxId: sameSupplier.inboxId, entry: purchase("Vds"), replace: false },
    ]);
    expect(results.map((result) => result.ok)).toEqual([true, false]);
    expect(results[1]).toMatchObject({ inboxId: sameSupplier.inboxId, ok: false, error: expect.stringContaining("Déjà dans le journal") });
    expect(await h.ledger.list()).toHaveLength(2);
  });

  it("splits a 3-page upload into two invoice PDFs and keeps their attachments independent", async () => {
    const h = harness([{ json: batch(
      { pageStart: 1, pageEnd: 2, invoice: invoice({ number: "INV-ONE" }) },
      { pageStart: 3, pageEnd: 3, invoice: invoice({ number: "INV-TWO", totalTvac: 212, htva: 200, vatAmount: 12 }) },
    ) }]);
    const upload = await uploadPdf(h);
    const proposal = await h.service.extractBatch(upload.inboxId);

    expect(proposal.invoices.map(({ pageStart, pageEnd }) => [pageStart, pageEnd])).toEqual([[1, 2], [3, 3]]);
    expect(proposal.invoices.map(({ name }) => name)).toEqual(["achats-octobre · p1-2.pdf", "achats-octobre · p3.pdf"]);
    expect(h.store.objects.has(`${INBOX_PREFIX}${upload.inboxId}`)).toBe(true);
    const [first, second] = proposal.invoices;
    expect(first.inboxId).not.toBe(second.inboxId);
    expect((await PDFDocument.load((await h.store.get(`${INBOX_PREFIX}${first.inboxId}`)).body)).getPageCount()).toBe(2);
    expect((await PDFDocument.load((await h.store.get(`${INBOX_PREFIX}${second.inboxId}`)).body)).getPageCount()).toBe(1);

    const [confirmed] = await h.service.confirm([{ inboxId: first.inboxId, entry: sale({ number: "INV-ONE" }), replace: false }]);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) throw new Error("confirmation failed");
    await h.service.remove(second.inboxId);
    const ledgerEntry = await h.ledger.getOrFail(confirmed.entryId);
    expect(ledgerEntry.attachment?.key).toBe(`${INBOX_PREFIX}${first.inboxId}`);
    expect(h.store.objects.has(ledgerEntry.attachment!.key)).toBe(true);
    expect(h.store.objects.has(`${INBOX_PREFIX}${second.inboxId}`)).toBe(false);
  });

  it.each([
    ["overlapping page ranges", batch(
      { pageStart: 1, pageEnd: 2, invoice: invoice({ number: "ONE" }) },
      { pageStart: 2, pageEnd: 3, invoice: invoice({ number: "TWO" }) },
    )],
    ["out-of-bounds pages", batch({ pageStart: 1, pageEnd: 4, invoice: invoice() })],
    ["reversed pages", batch({ pageStart: 3, pageEnd: 1, invoice: invoice() })],
  ])("rejects %s before creating any child PDFs", async (_label, response) => {
    const h = harness([{ json: response }]);
    const upload = await uploadPdf(h);
    const error = await h.service.extractBatch(upload.inboxId).catch((reason) => reason);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect(h.store.objects.size).toBe(1);
    expect(h.store.objects.has(`${INBOX_PREFIX}${upload.inboxId}`)).toBe(true);
  });

  it.each([
    ["incomplete response", { json: batch({ pageStart: 1, pageEnd: 3, invoice: invoice() }), status: "incomplete" as const }],
    ["truncated invoice list", { json: { ...batch({ pageStart: 1, pageEnd: 3, invoice: invoice() }), truncated: true } }],
    ["model refusal", { refusal: true }],
  ])("does not create children for an %s", async (_label, script) => {
    const h = harness([script]);
    const upload = await uploadPdf(h);
    const error = await h.service.extractBatch(upload.inboxId).catch((reason) => reason);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect(h.store.objects.size).toBe(1);
    expect(h.store.objects.has(`${INBOX_PREFIX}${upload.inboxId}`)).toBe(true);
  });

  it("wraps a single photo extraction in a one-invoice batch without changing photo extraction", async () => {
    const h = harness([{ json: invoice({ number: "PHOTO-1" }) }]);
    const upload = await h.service.upload(photoFile());
    const proposal = await h.service.extractBatch(upload.inboxId);
    expect(proposal.invoices).toHaveLength(1);
    expect(proposal.invoices[0]).toMatchObject({ inboxId: upload.inboxId, name: "facture.jpg", size: 4, entry: { number: "PHOTO-1" } });
    const [message] = h.client.calls[0].input as unknown as { content: Record<string, unknown>[] }[];
    expect(message.content[1]?.type).toBe("input_image");
  });

  it("validates the batch extraction API body", async () => {
    const h = harness([]);
    const missing = await h.controller.extractBatch({}).catch((reason) => reason);
    const extra = await h.controller.extractBatch({ inboxId: "id", extra: true }).catch((reason) => reason);
    expect(missing).toBeInstanceOf(BadRequestException);
    expect(extra).toBeInstanceOf(BadRequestException);
    expect(h.client.calls).toHaveLength(0);
  });
});
