import { ConflictException } from "@nestjs/common";
import {
  DEFAULT_COURSES,
  DEFAULT_PRESTATION_TYPES,
  DEFAULT_RECIPE_CATEGORIES,
  DEFAULT_SUPPLIERS,
  LEGACY_DEFAULT_COURSES,
} from "@packages/types";
import type { AppSettings } from "@packages/types";
import type { Tables } from "../config/config.service";
import type { DdbService, UpdateOptions } from "../shared/ddb.service";
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

const GLOBAL_KEY = { settingsId: "global" };

function build() {
  const ddb = new FakeDdb();
  const service = new SettingsService(ddb as unknown as DdbService);
  return { ddb, service };
}

describe("SettingsService.get", () => {
  it("returns every default when no item exists yet", async () => {
    const { service } = build();

    const settings = await service.get();

    expect(settings).toEqual({
      settingsId: "global",
      recipeCategories: DEFAULT_RECIPE_CATEGORIES,
      suppliers: DEFAULT_SUPPLIERS,
      courses: DEFAULT_COURSES,
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

    expect(settings.recipeCategories).toEqual(["Buffet"]);
    expect(settings.courses).toEqual(["Plat"]);
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

  it("serves the legacy five-item courses list as the six defaults without writing", async () => {
    const { ddb, service } = build();
    ddb.seed("settings", {
      settingsId: "global",
      courses: [...LEGACY_DEFAULT_COURSES],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const settings = await service.get();

    expect(settings.courses).toEqual(DEFAULT_COURSES);
    expect(settings.courses).toHaveLength(6);
    expect(settings.courses).toContain("Mignardises");
    expect(ddb.raw("settings", GLOBAL_KEY)?.courses).toEqual(LEGACY_DEFAULT_COURSES);
    expect(ddb.raw("settings", GLOBAL_KEY)?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
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
    expect(result.recipeCategories).toEqual(["Buffet"]);
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
