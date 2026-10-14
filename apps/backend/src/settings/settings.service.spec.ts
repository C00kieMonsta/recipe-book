import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import {
  DEFAULT_COURSES,
  DEFAULT_PRESTATION_TYPES,
  DEFAULT_SUPPLIERS,
  LEGACY_DEFAULT_COURSES,
  LEGACY_DEFAULT_COURSES_V2,
} from "@packages/types";
import type { AppSettings } from "@packages/types";
import type { Tables } from "../config/config.service";
import type { DdbService, UpdateOptions } from "../shared/ddb.service";
import type { S3Service } from "../shared/s3.service";
import { SettingsController, brandFileFilter } from "./settings.controller";
import { SettingsService } from "./settings.service";

type Item = Record<string, unknown>;

// In-memory stand-in for DdbService: one Map per table, rows keyed by the table's key attributes.
class FakeDdb {
  readonly tables: Tables = {
    ingredients: "ingredients",
    recipes: "recipes",
    settings: "settings",
    events: "events",
    groceryLists: "groceryLists",
    clients: "clients",
    ledger: "ledger",
  };

  private readonly keyAttrs: Record<string, string[]> = {
    ingredients: ["ingredientId"],
    recipes: ["recipeId"],
    settings: ["settingsId"],
    events: ["eventId"],
    groceryLists: ["listId"],
    clients: ["clientId"],
    ledger: ["entryId"],
  };

  private readonly store = new Map<string, Map<string, Item>>();
  updates: Array<{ key: Record<string, string>; fields: Item; options: UpdateOptions }> = [];
  failNextUpdateWith?: Error;

  requireTable(name: "clients" | "ledger"): string {
    const table = this.tables[name];
    if (!table) throw new Error(`Table ${name} non configurée`);
    return table;
  }

  async get(table: string, key: Record<string, string>) {
    return structuredClone(this.rows(table).get(this.keyOf(table, key)) ?? null);
  }

  async put(table: string, item: Item) {
    this.rows(table).set(this.keyOf(table, item), structuredClone(item));
  }

  async putIfAbsent(table: string, item: Item) {
    if (this.rows(table).has(this.keyOf(table, item))) {
      throw Object.assign(new Error("exists"), { name: "ConditionalCheckFailedException" });
    }
    await this.put(table, item);
  }

  async update(table: string, key: Record<string, string>, fields: Item, options: UpdateOptions = {}) {
    this.updates.push({ key, fields: structuredClone(fields), options });
    if (this.failNextUpdateWith) {
      const err = this.failNextUpdateWith;
      this.failNextUpdateWith = undefined;
      throw err;
    }
    const rows = this.rows(table);
    const id = this.keyOf(table, key);
    const row = rows.get(id);
    if (!row) throw new Error("ConditionalCheckFailedException");
    const stale = options.condition === "#ua = :expected" && row.updatedAt !== options.values?.[":expected"];
    const present = options.condition === "attribute_not_exists(#ua)" && row.updatedAt !== undefined;
    if (stale || present) throw Object.assign(new Error("cond"), { name: "ConditionalCheckFailedException" });
    for (const [k, v] of Object.entries(fields)) {
      if (v === null) delete row[k];
      else if (v !== undefined) row[k] = structuredClone(v);
    }
  }

  async scanAll(table: string) {
    return [...this.rows(table).values()].map((row) => structuredClone(row));
  }

  async delete(table: string, key: Record<string, string>) {
    this.rows(table).delete(this.keyOf(table, key));
  }

  async batchWrite(table: string, items: Item[]) {
    for (const item of items) await this.put(table, item);
  }

  async batchDelete(table: string, keys: Record<string, string>[]) {
    for (const key of keys) await this.delete(table, key);
  }

  seed(table: string, item: Item) {
    this.rows(table).set(this.keyOf(table, item), structuredClone(item));
  }

  raw(table: string, key: Record<string, string>) {
    return this.rows(table).get(this.keyOf(table, key));
  }

  private rows(table: string) {
    let rows = this.store.get(table);
    if (!rows) {
      rows = new Map();
      this.store.set(table, rows);
    }
    return rows;
  }

  private keyOf(table: string, item: Item) {
    return (this.keyAttrs[table] ?? Object.keys(item)).map((attr) => String(item[attr])).join("|");
  }
}

type StoredObject = { body: Buffer; contentType: string };

class FakeS3 {
  objects = new Map<string, StoredObject>();
  deleted: string[] = [];

  async upload(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body, contentType });
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
}

// The two express calls the brand GET makes.
class FakeResponse {
  headers: Record<string, string> = {};
  sent?: Buffer;
  set(name: string, value: string) { this.headers[name] = value; }
  send(body: Buffer) { this.sent = body; }
}

const GLOBAL_KEY = { settingsId: "global" };

function build() {
  const ddb = new FakeDdb();
  const s3 = new FakeS3();
  const service = new SettingsService(ddb as unknown as DdbService);
  const controller = new SettingsController(service, s3 as unknown as S3Service);
  return { ddb, s3, service, controller };
}

const image = (mimetype: string, size = 16) => ({ mimetype, buffer: Buffer.alloc(size, 1) });

describe("SettingsService.get", () => {
  it("returns every default when no item exists yet", async () => {
    const { service } = build();

    const settings = await service.get();

    expect(settings).toEqual({
      settingsId: "global",
      recipeCategories: DEFAULT_COURSES,
      suppliers: DEFAULT_SUPPLIERS,
      courses: DEFAULT_COURSES,
      invoicing: "app",
      prestationTypes: DEFAULT_PRESTATION_TYPES,
      fixedCharges: [],
      objectives: {},
      yearActuals: {},
      monthCloses: {},
      ignoredDuplicateGroups: [],
      updatedAt: expect.any(String),
    });
    expect(settings).not.toHaveProperty("company");
    expect(settings).not.toHaveProperty("ledgerStartYm");
  });

  it("fills only the missing keys on an existing item", async () => {
    const { ddb, service } = build();
    ddb.seed("settings", {
      settingsId: "global",
      recipeCategories: ["Buffet"],
      updatedAt: "2026-01-01T00:00:00.000Z",
      courses: ["Plat"],
      fixedCharges: [{ chargeId: "c1", label: "Loyer", category: "frais", monthlyAmount: 100 }],
      ledgerStartYm: "2026-01",
    });

    const settings = await service.get();

    expect(settings.courses).toEqual(["Plat"]);
    expect(settings.recipeCategories).toEqual(["Plat"]);
    expect(settings.fixedCharges).toEqual([{ chargeId: "c1", label: "Loyer", category: "frais", monthlyAmount: 100 }]);
    expect(settings.ledgerStartYm).toBe("2026-01");
    expect(settings.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(settings.suppliers).toEqual(DEFAULT_SUPPLIERS);
    expect(settings.prestationTypes).toEqual(DEFAULT_PRESTATION_TYPES);
    expect(settings.objectives).toEqual({});
    expect(settings.yearActuals).toEqual({});
    expect(settings.monthCloses).toEqual({});
    expect(settings.ignoredDuplicateGroups).toEqual([]);
    expect(settings).not.toHaveProperty("company");
  });

  it("serves the legacy five-item courses list as the six defaults plus Mignardises without writing", async () => {
    const { ddb, service } = build();
    ddb.seed("settings", {
      settingsId: "global",
      courses: [...LEGACY_DEFAULT_COURSES],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const settings = await service.get();

    expect(settings.courses).toEqual([...DEFAULT_COURSES, "Mignardises"]);
    expect(settings.courses).toHaveLength(7);
    expect(settings.recipeCategories).toEqual(settings.courses);
    expect(ddb.raw("settings", GLOBAL_KEY)?.courses).toEqual(LEGACY_DEFAULT_COURSES);
    expect(ddb.raw("settings", GLOBAL_KEY)?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(ddb.updates).toHaveLength(0);
  });

  it("serves the legacy six-item courses list as the same seven values", async () => {
    const { ddb, service } = build();
    ddb.seed("settings", {
      settingsId: "global",
      courses: [...LEGACY_DEFAULT_COURSES_V2],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const settings = await service.get();

    expect(settings.courses).toEqual([...DEFAULT_COURSES, "Mignardises"]);
    expect(settings.recipeCategories).toEqual(settings.courses);
    expect(ddb.raw("settings", GLOBAL_KEY)?.courses).toEqual(LEGACY_DEFAULT_COURSES_V2);
  });

  it("serves the six defaults when the item has no courses list", async () => {
    const { ddb, service } = build();
    ddb.seed("settings", { settingsId: "global", suppliers: [{ name: "Barn" }], updatedAt: "2026-01-01T00:00:00.000Z" });

    const settings = await service.get();

    expect(settings.courses).toEqual(DEFAULT_COURSES);
    expect(settings.courses).not.toContain("Mignardises");
    expect(settings.recipeCategories).toEqual(DEFAULT_COURSES);
    expect(ddb.raw("settings", GLOBAL_KEY)).not.toHaveProperty("courses");
  });

  it("reads an absent invoicing as app", async () => {
    const { ddb, service } = build();
    ddb.seed("settings", { settingsId: "global", courses: ["Plat"], updatedAt: "2026-01-01T00:00:00.000Z" });

    const settings = await service.get();

    expect(settings.invoicing).toBe("app");
    expect(ddb.raw("settings", GLOBAL_KEY)).not.toHaveProperty("invoicing");
  });

  it("keeps invoicing externe", async () => {
    const { ddb, service } = build();
    ddb.seed("settings", { settingsId: "global", invoicing: "externe", updatedAt: "2026-01-01T00:00:00.000Z" });

    expect((await service.get()).invoicing).toBe("externe");
  });
});

describe("SettingsService.update", () => {
  it("keeps the keys it was not given and writes only the given ones", async () => {
    const { ddb, service } = build();
    const seed = {
      settingsId: "global",
      recipeCategories: ["Buffet"],
      suppliers: [{ name: "Barn" }],
      updatedAt: "2026-01-01T00:00:00.000Z",
      objectives: { "2026": { annualRevenue: 50000, monthsActive: 10 } },
      monthCloses: { "2026-09": { mpSource: "achats" } },
      company: { name: "Table d'Amélie", vatNumber: "BE0123", address: "Rue X" },
    };
    ddb.seed("settings", seed);

    const result = await service.update({
      courses: ["Entrée", "Plat"],
      monthCloses: { "2026-10": { mpSource: "saisi", rawMaterial: 1200 } },
    });

    expect(result.courses).toEqual(["Entrée", "Plat"]);
    expect(result.monthCloses).toEqual({ "2026-10": { mpSource: "saisi", rawMaterial: 1200 } });
    expect(result.recipeCategories).toEqual(["Entrée", "Plat"]);
    expect(result.suppliers).toEqual([{ name: "Barn" }]);
    expect(result.objectives).toEqual({ "2026": { annualRevenue: 50000, monthsActive: 10 } });
    expect(result.company).toEqual({ name: "Table d'Amélie", vatNumber: "BE0123", address: "Rue X" });
    expect(result.settingsId).toBe("global");
    expect(result.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");

    const stored = ddb.raw("settings", GLOBAL_KEY) as unknown as AppSettings;
    expect(stored).toEqual({
      ...seed,
      courses: ["Entrée", "Plat"],
      monthCloses: { "2026-10": { mpSource: "saisi", rawMaterial: 1200 } },
      updatedAt: result.updatedAt,
    });
    expect(await service.get()).toEqual(result);
  });

  it("a save from a stale draft keeps a section another tab saved meanwhile", async () => {
    const { service } = build();
    await service.update({ courses: ["Plat"], ignoredDuplicateGroups: [] });
    await service.update({ ignoredDuplicateGroups: ["oeuf"] });
    await service.update({ monthCloses: { "2026-10": { mpSource: "achats", lockedAt: "2026-11-01T00:00:00.000Z" } } });

    const result = await service.update({ courses: ["Plat", "Dessert"], objectives: {} });

    expect(result.courses).toEqual(["Plat", "Dessert"]);
    expect(result.ignoredDuplicateGroups).toEqual(["oeuf"]);
    expect(result.monthCloses?.["2026-10"]?.lockedAt).toBe("2026-11-01T00:00:00.000Z");
  });

  it("creates the item from defaults when none exists", async () => {
    const { ddb, service } = build();

    const result = await service.update({ ledgerStartYm: "2026-03" });

    expect(result.ledgerStartYm).toBe("2026-03");
    expect(result.courses).toEqual(DEFAULT_COURSES);
    expect(result.prestationTypes).toEqual(DEFAULT_PRESTATION_TYPES);
    expect(ddb.raw("settings", GLOBAL_KEY)).toEqual(result);
  });

  it("ignores keys passed as undefined", async () => {
    const { service } = build();
    await service.update({ courses: ["Plat"] });

    const result = await service.update({ courses: undefined, fixedCharges: [] });

    expect(result.courses).toEqual(["Plat"]);
  });

  it("writes nothing for recipeCategories sent by an old client", async () => {
    const { ddb, service } = build();
    ddb.seed("settings", { settingsId: "global", courses: ["Plat"], updatedAt: "2026-01-01T00:00:00.000Z" });

    const result = await service.update({ recipeCategories: ["Buffet"], suppliers: [{ name: "Barn" }] });

    expect(ddb.updates).toHaveLength(1);
    expect(ddb.updates[0].fields).not.toHaveProperty("recipeCategories");
    expect(ddb.raw("settings", GLOBAL_KEY)).not.toHaveProperty("recipeCategories");
    expect(result.recipeCategories).toEqual(["Plat"]);
    expect(result.suppliers).toEqual([{ name: "Barn" }]);
  });

  it("keeps invoicing externe once written", async () => {
    const { ddb, service } = build();

    const result = await service.update({ invoicing: "externe" });

    expect(result.invoicing).toBe("externe");
    expect(ddb.raw("settings", GLOBAL_KEY)?.invoicing).toBe("externe");
    expect((await service.get()).invoicing).toBe("externe");
  });
});

describe("SettingsService.update with the loaded updatedAt", () => {
  const seeded = () => {
    const built = build();
    built.ddb.seed("settings", { settingsId: "global", courses: ["Plat"], updatedAt: "2026-01-01T00:00:00.000Z" });
    return built;
  };

  it("409s SETTINGS_CHANGED on a stale updatedAt and writes nothing", async () => {
    const { ddb, service } = seeded();

    const call = service.update({ courses: ["Entrée"], updatedAt: "2025-12-31T00:00:00.000Z" });

    await expect(call).rejects.toBeInstanceOf(ConflictException);
    await call.catch((err: ConflictException) => {
      expect(err.getResponse()).toEqual({ code: "SETTINGS_CHANGED" });
    });
    expect(ddb.updates).toHaveLength(0);
    expect(ddb.raw("settings", GLOBAL_KEY)?.courses).toEqual(["Plat"]);
  });

  it("writes with the updatedAt condition when the stamp matches and does not store the stamp it was sent", async () => {
    const { ddb, service } = seeded();

    const result = await service.update({ courses: ["Entrée"], updatedAt: "2026-01-01T00:00:00.000Z" });

    expect(ddb.updates).toHaveLength(1);
    expect(ddb.updates[0].options).toEqual({
      condition: "#ua = :expected",
      names: { "#ua": "updatedAt" },
      values: { ":expected": "2026-01-01T00:00:00.000Z" },
    });
    expect(result.courses).toEqual(["Entrée"]);
    expect(result.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
    expect(ddb.updates[0].fields.updatedAt).toBe(result.updatedAt);
  });

  it("writes without a condition when the client sends no updatedAt", async () => {
    const { ddb, service } = seeded();

    await service.update({ courses: ["Entrée"] });

    expect(ddb.updates).toHaveLength(1);
    expect(ddb.updates[0].options).toEqual({});
  });

  it("guards a legacy row without updatedAt on the attribute being absent", async () => {
    const { ddb, service } = build();
    ddb.seed("settings", { settingsId: "global", courses: ["Plat"] });
    const loaded = await service.get();

    const result = await service.update({ courses: ["Entrée"], updatedAt: loaded.updatedAt });

    expect(ddb.updates[0].options).toEqual({ condition: "attribute_not_exists(#ua)", names: { "#ua": "updatedAt" } });
    expect(result.courses).toEqual(["Entrée"]);
    expect(typeof ddb.raw("settings", GLOBAL_KEY)?.updatedAt).toBe("string");
  });

  it("maps a conditional write failure to 409 SETTINGS_CHANGED", async () => {
    const { ddb, service } = seeded();
    ddb.failNextUpdateWith = Object.assign(new Error("cond"), { name: "ConditionalCheckFailedException" });

    const call = service.update({ courses: ["Entrée"], updatedAt: "2026-01-01T00:00:00.000Z" });

    await expect(call).rejects.toBeInstanceOf(ConflictException);
    await call.catch((err: ConflictException) => {
      expect(err.getResponse()).toEqual({ code: "SETTINGS_CHANGED" });
    });
  });

  it("rethrows other write errors untouched", async () => {
    const { ddb, service } = seeded();
    ddb.failNextUpdateWith = new Error("throttled");

    await expect(service.update({ courses: ["Entrée"], updatedAt: "2026-01-01T00:00:00.000Z" })).rejects.toThrow("throttled");
  });
});

describe("SettingsController brand assets", () => {
  it("refuses a HEIC through the filter and answers 400 when no file reached the handler", async () => {
    const { controller, s3 } = build();
    const accepted: boolean[] = [];
    brandFileFilter(undefined, { mimetype: "image/heic" }, (_err, accept) => accepted.push(accept));
    brandFileFilter(undefined, { mimetype: "image/png" }, (_err, accept) => accepted.push(accept));
    expect(accepted).toEqual([false, true]);

    const call = controller.uploadBrand("logo", undefined);

    await expect(call).rejects.toBeInstanceOf(BadRequestException);
    await call.catch((err: BadRequestException) => {
      expect(err.message).toBe("Image manquante ou format non pris en charge (JPEG ou PNG)");
    });
    await expect(controller.uploadBrand("logo", image("image/heic"))).rejects.toBeInstanceOf(BadRequestException);
    expect(s3.objects.size).toBe(0);
  });

  it("refuses an unknown kind", async () => {
    const { controller } = build();

    await expect(controller.uploadBrand("favicon", image("image/png"))).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.removeBrand("favicon")).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getBrand("favicon", new FakeResponse() as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("writes brand/logo.png and the key, with the extension taken from the mimetype", async () => {
    const { controller, ddb, s3, service } = build();

    const result = await controller.uploadBrand("logo", image("image/png", 200));

    expect(result.brandLogoKey).toBe("brand/logo.png");
    expect(result).not.toHaveProperty("brandBannerKey");
    expect(s3.objects.get("brand/logo.png")).toEqual({ body: Buffer.alloc(200, 1), contentType: "image/png" });
    expect(s3.deleted).toEqual([]);
    expect(ddb.raw("settings", GLOBAL_KEY)?.brandLogoKey).toBe("brand/logo.png");
    expect((await service.get()).brandLogoKey).toBe("brand/logo.png");
  });

  it("a second upload as JPEG deletes brand/logo.png and writes brand/logo.jpg", async () => {
    const { controller, s3 } = build();
    await controller.uploadBrand("logo", image("image/png"));

    const result = await controller.uploadBrand("logo", image("image/jpeg"));

    expect(result.brandLogoKey).toBe("brand/logo.jpg");
    expect(s3.deleted).toEqual(["brand/logo.png"]);
    expect([...s3.objects.keys()]).toEqual(["brand/logo.jpg"]);
    expect(s3.objects.get("brand/logo.jpg")?.contentType).toBe("image/jpeg");
  });

  it("keeps the object when the same key is uploaded again", async () => {
    const { controller, s3 } = build();
    await controller.uploadBrand("banner", image("image/jpeg", 10));

    await controller.uploadBrand("banner", image("image/jpeg", 20));

    expect(s3.deleted).toEqual([]);
    expect(s3.objects.get("brand/banner.jpg")?.body.length).toBe(20);
  });

  it("delete removes the object and the attribute", async () => {
    const { controller, ddb, s3 } = build();
    await controller.uploadBrand("logo", image("image/png"));
    await controller.uploadBrand("banner", image("image/jpeg"));

    const result = await controller.removeBrand("logo");

    expect(result).not.toHaveProperty("brandLogoKey");
    expect(result.brandBannerKey).toBe("brand/banner.jpg");
    expect(s3.deleted).toEqual(["brand/logo.png"]);
    expect(s3.objects.has("brand/logo.png")).toBe(false);
    expect(ddb.raw("settings", GLOBAL_KEY)).not.toHaveProperty("brandLogoKey");
    expect(ddb.updates.at(-1)?.fields).toEqual({ brandLogoKey: null, updatedAt: result.updatedAt });
  });

  it("delete without a key touches nothing and still returns the settings", async () => {
    const { controller, ddb, s3 } = build();

    const result = await controller.removeBrand("banner");

    expect(result.settingsId).toBe("global");
    expect(s3.deleted).toEqual([]);
    expect(ddb.updates).toHaveLength(0);
  });

  it("get is 404 without a key and streams the object with a private cache header otherwise", async () => {
    const { controller, s3 } = build();

    await expect(controller.getBrand("logo", new FakeResponse() as never)).rejects.toBeInstanceOf(NotFoundException);

    await controller.uploadBrand("logo", image("image/png", 8));
    const res = new FakeResponse();
    await controller.getBrand("logo", res as never);

    expect(res.headers).toEqual({ "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" });
    expect(res.sent).toEqual(Buffer.alloc(8, 1));

    s3.objects.clear();
    await expect(controller.getBrand("logo", new FakeResponse() as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("company.accent round-trips and brandLogoKey in a PATCH body is dropped", async () => {
    const { controller, ddb } = build();
    await controller.uploadBrand("logo", image("image/png"));
    const company = { name: "Table d'Amélie", vatNumber: "BE0123", address: "Rue X", phone: "0470 00 00 00", accent: "#e8847a" };

    const result = await controller.update({ company, brandLogoKey: "x", brandBannerKey: "y" });

    expect(result.company).toEqual(company);
    expect(result.brandLogoKey).toBe("brand/logo.png");
    expect(result).not.toHaveProperty("brandBannerKey");
    expect(ddb.raw("settings", GLOBAL_KEY)?.brandLogoKey).toBe("brand/logo.png");
    expect((await controller.get()).company?.accent).toBe("#e8847a");
    await expect(controller.update({ company: { ...company, accent: "red" } })).rejects.toBeInstanceOf(BadRequestException);
  });
});
