import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { Writable } from "node:stream";
import { strFromU8, unzipSync } from "fflate";
import { decode, sign } from "jsonwebtoken";
import type { ConfigService, Tables } from "../config/config.service";
import type { DdbService } from "../shared/ddb.service";
import type { S3ObjectStream, S3ObjectSummary, S3Service } from "../shared/s3.service";
import { BACKUP_SCOPE, BACKUP_TOKEN_TTL_S, BackupController, backupFilename } from "./backup.controller";
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BackupManifest,
  BackupObjectEntry,
  BackupService,
  LIST_DENIED,
  MANIFEST_FILE,
  OBJECTS_INDEX_FILE,
} from "./backup.service";
import { ARCHIVE_CLOSED } from "./zip-stream";

const JWT_SECRET = "test-secret-with-at-least-thirty-two-characters";
const REGION = "eu-north-1";
const BUCKET = "uploads-test";

const fakeConfig = {
  get: (key: string) => {
    if (key === "JWT_SECRET") return JWT_SECRET;
    if (key === "AWS_REGION") return REGION;
    if (key === "S3_BUCKET") return BUCKET;
    throw new Error(`unexpected key ${key}`);
  },
} as unknown as ConfigService;

type Item = Record<string, unknown>;

const ALL_TABLES: Tables = {
  ingredients: "ta-ingredients",
  recipes: "ta-recipes",
  settings: "ta-settings",
  events: "ta-events",
  groceryLists: "ta-grocery-lists",
  clients: "ta-clients",
  ledger: "ta-ledger",
};

class FakeDdb {
  scanned: string[] = [];

  constructor(readonly tables: Tables, private readonly rows: Record<string, Item[]> = {}) {}

  async scanAll(table: string): Promise<Item[]> {
    this.scanned.push(table);
    return structuredClone(this.rows[table] ?? []);
  }
}

type Stored = { body: Uint8Array; contentType: string; lastModified?: Date };

class FakeS3 {
  objects = new Map<string, Stored>();
  listError?: Error;
  // Thrown after the first chunk of any body, to mimic a read that breaks part-way.
  streamError?: Error;
  chunkSize = 64 * 1024;

  async listAll(): Promise<S3ObjectSummary[]> {
    if (this.listError) throw this.listError;
    return [...this.objects].map(([key, o]) => ({ key, size: o.body.length, lastModified: o.lastModified }));
  }

  async stream(key: string): Promise<S3ObjectStream> {
    const stored = this.objects.get(key);
    if (!stored) throw Object.assign(new Error("The specified key does not exist."), { name: "NoSuchKey" });
    const { chunkSize, streamError } = this;
    const body = stored.body;
    async function* chunks() {
      for (let i = 0; i < body.length; i += chunkSize) {
        if (streamError && i > 0) throw streamError;
        yield body.subarray(i, i + chunkSize);
      }
    }
    return { body: chunks(), contentType: stored.contentType, contentLength: body.length, lastModified: stored.lastModified };
  }
}

const MODIFIED = new Date("2026-10-01T08:00:00.000Z");

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

function stores(tables: Tables = ALL_TABLES) {
  const ddb = new FakeDdb(tables, {
    "ta-ingredients": [{ ingredientId: "i1", name: "Beurre", price: 8.5 }, { ingredientId: "i2", name: "Œufs", price: 0.3 }],
    "ta-recipes": [{ recipeId: "r1", name: "Quiche", photos: [{ key: "recipe-photos/r1.jpg" }] }],
    "ta-settings": [{ settingsId: "global", courses: ["Entrée"] }, { settingsId: "offers", offers: [] }],
    "ta-events": [{ eventId: "e1", title: "Mariage" }],
    "ta-clients": [{ clientId: "c1", name: "Dupont" }],
    "ta-ledger": [{ entryId: "l1", amount: 120 }],
  });
  const s3 = new FakeS3();
  s3.objects.set("brand/logo.png", { body: text("PNG-LOGO"), contentType: "image/png", lastModified: MODIFIED });
  s3.objects.set("recipe-photos/r1.jpg", { body: text("JPEG-DATA"), contentType: "image/jpeg", lastModified: MODIFIED });
  s3.objects.set("event-files/e1/a1.pdf", { body: text("%PDF-1.4"), contentType: "application/pdf" });
  return { ddb, s3 };
}

const service = (ddb: FakeDdb, s3: FakeS3) => new BackupService(ddb as unknown as DdbService, s3 as unknown as S3Service, fakeConfig);

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(new Uint8Array(chunk));
  return concat(chunks);
}

const unzip = (archive: Uint8Array) => unzipSync(archive);
const readJson = <T>(files: Record<string, Uint8Array>, name: string): T => JSON.parse(strFromU8(files[name])) as T;

async function until(check: () => boolean, tries = 200): Promise<void> {
  for (let i = 0; i < tries && !check(); i++) await new Promise<void>((resolve) => setImmediate(resolve));
  if (!check()) throw new Error("condition not met");
}

describe("BackupService", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => errorSpy.mockRestore());

  it("writes one JSON file per table, every object under s3/, the index and the manifest", async () => {
    const { ddb, s3 } = stores();
    const files = unzip(await collect(service(ddb, s3).write()));

    expect(Object.keys(files).sort()).toEqual([
      "dynamodb/clients.json",
      "dynamodb/events.json",
      "dynamodb/groceryLists.json",
      "dynamodb/ingredients.json",
      "dynamodb/ledger.json",
      "dynamodb/recipes.json",
      "dynamodb/settings.json",
      MANIFEST_FILE,
      OBJECTS_INDEX_FILE,
      "s3/brand/logo.png",
      "s3/event-files/e1/a1.pdf",
      "s3/recipe-photos/r1.jpg",
    ]);
    expect(readJson<Item[]>(files, "dynamodb/ingredients.json")).toEqual([
      { ingredientId: "i1", name: "Beurre", price: 8.5 },
      { ingredientId: "i2", name: "Œufs", price: 0.3 },
    ]);
    expect(readJson<Item[]>(files, "dynamodb/groceryLists.json")).toEqual([]);
    expect(strFromU8(files["s3/brand/logo.png"])).toBe("PNG-LOGO");
    expect(strFromU8(files["s3/event-files/e1/a1.pdf"])).toBe("%PDF-1.4");

    const manifest = readJson<BackupManifest>(files, MANIFEST_FILE);
    expect(manifest.format).toBe(BACKUP_FORMAT);
    expect(manifest.version).toBe(BACKUP_FORMAT_VERSION);
    expect(manifest.region).toBe(REGION);
    expect(new Date(manifest.exportedAt).getTime()).toBeGreaterThan(0);
    expect(manifest.dynamodb).toEqual([
      { name: "ingredients", table: "ta-ingredients", keyAttribute: "ingredientId", items: 2, file: "dynamodb/ingredients.json" },
      { name: "recipes", table: "ta-recipes", keyAttribute: "recipeId", items: 1, file: "dynamodb/recipes.json" },
      { name: "settings", table: "ta-settings", keyAttribute: "settingsId", items: 2, file: "dynamodb/settings.json" },
      { name: "events", table: "ta-events", keyAttribute: "eventId", items: 1, file: "dynamodb/events.json" },
      { name: "groceryLists", table: "ta-grocery-lists", keyAttribute: "listId", items: 0, file: "dynamodb/groceryLists.json" },
      { name: "clients", table: "ta-clients", keyAttribute: "clientId", items: 1, file: "dynamodb/clients.json" },
      { name: "ledger", table: "ta-ledger", keyAttribute: "entryId", items: 1, file: "dynamodb/ledger.json" },
    ]);
    expect(manifest.s3).toEqual({ bucket: BUCKET, objects: 3, bytes: 8 + 9 + 8, index: OBJECTS_INDEX_FILE });

    const index = readJson<BackupObjectEntry[]>(files, OBJECTS_INDEX_FILE);
    expect(index).toEqual([
      { key: "brand/logo.png", size: 8, contentType: "image/png", lastModified: MODIFIED.toISOString(), file: "s3/brand/logo.png" },
      { key: "recipe-photos/r1.jpg", size: 9, contentType: "image/jpeg", lastModified: MODIFIED.toISOString(), file: "s3/recipe-photos/r1.jpg" },
      { key: "event-files/e1/a1.pdf", size: 8, contentType: "application/pdf", file: "s3/event-files/e1/a1.pdf" },
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("leaves out the tables that are not configured", async () => {
    const { ddb, s3 } = stores({ ...ALL_TABLES, clients: undefined, ledger: undefined });
    const files = unzip(await collect(service(ddb, s3).write()));

    expect(files["dynamodb/clients.json"]).toBeUndefined();
    expect(files["dynamodb/ledger.json"]).toBeUndefined();
    expect(ddb.scanned).not.toContain("ta-clients");
    expect(readJson<BackupManifest>(files, MANIFEST_FILE).dynamodb.map((t) => t.name)).toEqual(["ingredients", "recipes", "settings", "events", "groceryLists"]);
  });

  it("streams a large object in chunks and the archive stays whole", async () => {
    const { ddb, s3 } = stores();
    const big = new Uint8Array(3 * 1024 * 1024);
    for (let i = 0; i < big.length; i++) big[i] = (i * 7) & 0xff;
    s3.objects.set("event-files/e1/big.bin", { body: big, contentType: "application/octet-stream" });

    const archive = await collect(service(ddb, s3).write());
    const files = unzip(archive);
    expect(same(files["s3/event-files/e1/big.bin"], big)).toBe(true);
    // Stored, not deflated: the archive is at least as large as the object.
    expect(archive.length).toBeGreaterThan(big.length);
  });

  it("fails the stream when an object cannot be read, rather than ending a short archive", async () => {
    const { ddb, s3 } = stores();
    s3.objects.set("event-files/e1/big.bin", { body: new Uint8Array(200 * 1024).fill(1), contentType: "application/octet-stream" });
    s3.streamError = Object.assign(new Error("socket hang up"), { name: "TimeoutError" });

    await expect(collect(service(ddb, s3).write())).rejects.toThrow("socket hang up");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("socket hang up"));
  });

  it("stops filling once the reader has gone away", async () => {
    const { ddb, s3 } = stores();
    s3.objects.set("event-files/e1/big.bin", { body: new Uint8Array(4 * 1024 * 1024).fill(2), contentType: "application/octet-stream" });

    const out = service(ddb, s3).write();
    out.once("data", () => out.destroy());
    await new Promise<void>((resolve) => out.on("close", resolve));
    await until(() => errorSpy.mock.calls.length > 0);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(ARCHIVE_CLOSED));
  });

  it("preflight counts the tables and the bucket", async () => {
    const { ddb, s3 } = stores();
    await expect(service(ddb, s3).preflight()).resolves.toEqual({ tables: 7, objects: 3, bytes: 25 });
  });

  it("preflight answers 503 with the IAM hint when the bucket cannot be listed", async () => {
    const { ddb, s3 } = stores();
    s3.listError = Object.assign(new Error("Access Denied"), { name: "AccessDenied" });
    await expect(service(ddb, s3).preflight()).rejects.toThrow(ServiceUnavailableException);
    await expect(service(ddb, s3).preflight()).rejects.toThrow(LIST_DENIED);
  });

  it("passes any other listing failure through", async () => {
    const { ddb, s3 } = stores();
    s3.listError = Object.assign(new Error("boom"), { name: "InternalError" });
    await expect(service(ddb, s3).preflight()).rejects.toThrow("boom");
  });
});

// The express response as the download sees it: headers, then a sink for the archive bytes.
class FakeResponse extends Writable {
  headers: Record<string, string> = {};
  chunks: Uint8Array[] = [];

  set(headers: Record<string, string>) {
    Object.assign(this.headers, headers);
  }

  _write(chunk: Uint8Array, _enc: BufferEncoding, cb: (err?: Error | null) => void) {
    this.chunks.push(new Uint8Array(chunk));
    cb();
  }
}

describe("BackupController", () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => logSpy.mockRestore());

  const controller = () => {
    const { ddb, s3 } = stores();
    return { controller: new BackupController(service(ddb, s3), fakeConfig), s3 };
  };

  it("prepare answers the counts and a backup-scoped ticket that lives two minutes", async () => {
    const before = Math.floor(Date.now() / 1000);
    const ticket = await controller().controller.prepare();

    expect(ticket).toMatchObject({ tables: 7, objects: 3, bytes: 25 });
    const payload = decode(ticket.token) as { scope: string; iat: number; exp: number; email?: string };
    expect(payload.scope).toBe(BACKUP_SCOPE);
    expect(payload.email).toBeUndefined();
    expect(payload.exp - payload.iat).toBe(BACKUP_TOKEN_TTL_S);
    expect(payload.exp).toBeGreaterThanOrEqual(before + BACKUP_TOKEN_TTL_S);
    expect(ticket.expiresAt).toBe(new Date(payload.exp * 1000).toISOString());
  });

  it("prepare passes the listing failure on", async () => {
    const { controller: c, s3 } = controller();
    s3.listError = Object.assign(new Error("Access Denied"), { name: "AccessDenied" });
    await expect(c.prepare()).rejects.toThrow(ServiceUnavailableException);
  });

  it("download refuses a missing, forged, expired or session token", async () => {
    const { controller: c } = controller();
    const res = new FakeResponse();
    await expect(c.download(undefined, res as never)).rejects.toThrow(UnauthorizedException);
    await expect(c.download("", res as never)).rejects.toThrow(UnauthorizedException);
    await expect(c.download(sign({ scope: BACKUP_SCOPE }, "another-secret"), res as never)).rejects.toThrow(UnauthorizedException);
    await expect(c.download(sign({ scope: BACKUP_SCOPE }, JWT_SECRET, { expiresIn: -1 }), res as never)).rejects.toThrow(UnauthorizedException);
    await expect(c.download(sign({ email: "amelie@example.com", remember: true }, JWT_SECRET), res as never)).rejects.toThrow(UnauthorizedException);
    expect(res.chunks).toEqual([]);
  });

  it("download sets the attachment headers and pipes a whole archive", async () => {
    const { controller: c } = controller();
    const res = new FakeResponse();
    const ticket = await c.prepare();

    await c.download(ticket.token, res as never);

    expect(res.headers["Content-Type"]).toBe("application/zip");
    expect(res.headers["Content-Disposition"]).toMatch(/^attachment; filename="la-table-amelie-\d{4}-\d{2}-\d{2}-\d{4}\.zip"$/);
    expect(res.headers["Cache-Control"]).toBe("private, no-store");
    expect(res.headers["X-Accel-Buffering"]).toBe("no");
    const files = unzip(concat(res.chunks));
    expect(readJson<BackupManifest>(files, MANIFEST_FILE).s3.objects).toBe(3);
    expect(strFromU8(files["s3/brand/logo.png"])).toBe("PNG-LOGO");
  });

  it("names the file after the UTC minute", () => {
    expect(backupFilename(new Date("2026-10-17T10:30:45.000Z"))).toBe("la-table-amelie-2026-10-17-1030.zip");
  });
});
