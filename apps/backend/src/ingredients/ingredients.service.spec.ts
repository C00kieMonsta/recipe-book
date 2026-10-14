import { ConflictException, NotFoundException } from "@nestjs/common";
import type { GroceryList, Ingredient, Recipe } from "@packages/types";
import { DdbService, UpdateOptions } from "../shared/ddb.service";
import { SettingsService } from "../settings/settings.service";
import { IngredientsService } from "./ingredients.service";

type Item = Record<string, unknown>;
type UpdateCall = { table: string; key: Record<string, string>; fields: Item; options: UpdateOptions };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const KEY_ATTR: Record<string, string> = {
  ingredients: "ingredientId",
  recipes: "recipeId",
  groceryLists: "listId",
  settings: "settingsId",
  events: "eventId",
};

class FakeDdb {
  tables = { events: "events", ingredients: "ingredients", recipes: "recipes", settings: "settings", groceryLists: "groceryLists" };
  store = new Map<string, Map<string, Item>>();
  updates: UpdateCall[] = [];
  deleted: Array<{ table: string; key: Record<string, string> }> = [];
  failUpdateOn = new Map<string, Error>();
  scanCalls = new Map<string, number>();
  onScan?: (table: string, call: number, items: Item[]) => Item[];

  rows(table: string) {
    if (!this.store.has(table)) this.store.set(table, new Map());
    return this.store.get(table) as Map<string, Item>;
  }

  requireTable(name: "clients" | "ledger") { return name; }

  async get(table: string, key: Record<string, string>) {
    const item = this.rows(table).get(Object.values(key)[0]);
    return item ? clone(item) : null;
  }

  async put(table: string, item: Item) {
    this.rows(table).set(String(item[KEY_ATTR[table]]), clone(item));
  }

  async update(table: string, key: Record<string, string>, fields: Item, options: UpdateOptions = {}) {
    this.updates.push({ table, key, fields: clone(fields), options });
    const id = Object.values(key)[0];
    const fail = this.failUpdateOn.get(id);
    if (fail) {
      this.failUpdateOn.delete(id);
      throw fail;
    }
    const item = this.rows(table).get(id);
    if (!item) throw Object.assign(new Error("missing"), { name: "ConditionalCheckFailedException" });
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      if (v === null) delete item[k];
      else item[k] = clone(v);
    }
  }

  async scanAll(table: string) {
    const call = (this.scanCalls.get(table) ?? 0) + 1;
    this.scanCalls.set(table, call);
    const items = [...this.rows(table).values()].map(clone);
    return this.onScan ? this.onScan(table, call, items) : items;
  }

  async delete(table: string, key: Record<string, string>) {
    this.deleted.push({ table, key });
    this.rows(table).delete(Object.values(key)[0]);
  }

  async batchWrite(table: string, items: Item[]) {
    for (const item of items) await this.put(table, item);
  }

  async batchDelete(table: string, keys: Record<string, string>[]) {
    for (const key of keys) await this.delete(table, key);
  }
}

class FakeSettings {
  ignored: string[] = [];
  async get() { return { ignoredDuplicateGroups: this.ignored }; }
}

const ing = (overrides: Partial<Ingredient> & { ingredientId: string; name: string }): Ingredient => ({
  price: 1,
  unit: "€/pièce",
  supplier: "Barn",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  nameLower: overrides.name.toLowerCase(),
  ...overrides,
});

const recipe = (recipeId: string, name: string, ingredients: Recipe["ingredients"]): Recipe => ({
  recipeId,
  name,
  nameLower: name.toLowerCase(),
  type: "Buffet",
  portions: 4,
  portionWeight: 150,
  techniques: [],
  ingredients,
  photos: [],
  pricing: { surPlace: { coef: 4, tva: 12 }, takeAway: { coef: 3, tva: 6 }, chosenPrice: { surPlace: 0, takeAway: 0 } },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const list = (listId: string, title: string, items: GroceryList["items"]): GroceryList => ({
  listId,
  title,
  items,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const listItem = (overrides: Partial<GroceryList["items"][number]> & { ingredientId: string; name: string }): GroceryList["items"][number] => ({
  totalQty: 1,
  unit: "pièce",
  supplier: "Barn",
  pricePerUnit: 1,
  priceUnit: "€/pièce",
  checked: false,
  ...overrides,
});

describe("IngredientsService", () => {
  it("serves legacy items with a text price and an old unit spelling as numbers in the enum", async () => {
    const ddb = new FakeDdb();
    ddb.rows("ingredients").set("ail", { ingredientId: "ail", name: "Ail sec", nameLower: "ail sec", price: "4,20", unit: "€/kilo", supplier: "Vds" });
    ddb.rows("ingredients").set("hummus", { ingredientId: "hummus", name: "Hummus maison", nameLower: "hummus maison", unit: "€/pce", supplier: "" });
    const service = new IngredientsService(ddb as unknown as DdbService, new SettingsService(ddb as unknown as DdbService));
    const all = await service.getAll();
    expect(all.find((i) => i.ingredientId === "ail")).toMatchObject({ price: 4.2, unit: "€/kg" });
    expect(all.find((i) => i.ingredientId === "hummus")).toMatchObject({ price: 0, unit: "€/pièce" });
    expect(await service.get("ail")).toMatchObject({ price: 4.2, unit: "€/kg" });
    expect(ddb.updates).toHaveLength(0);
  });

  let ddb: FakeDdb;
  let settings: FakeSettings;
  let service: IngredientsService;

  const putAll = async (table: string, items: unknown[]) => {
    for (const item of items) await ddb.put(table, item as Item);
  };

  beforeEach(() => {
    ddb = new FakeDdb();
    settings = new FakeSettings();
    service = new IngredientsService(ddb as unknown as DdbService, settings as unknown as SettingsService);
  });

  describe("merge", () => {
    beforeEach(async () => {
      await putAll("ingredients", [
        ing({ ingredientId: "oeuf", name: "Oeuf", updatedAt: "2026-02-01T00:00:00.000Z" }),
        ing({ ingredientId: "oeufs", name: "Oeufs" }),
        ing({ ingredientId: "oeuf-bio", name: "Oeuf bio", aliases: ["oeufs bio"] }),
        ing({ ingredientId: "farine", name: "Farine", unit: "€/kg" }),
      ]);
      await putAll("recipes", [
        recipe("r1", "Omelette", [
          { ingredientId: "oeufs", qty: 3, unit: "pièce", lossPct: 5 },
          { ingredientId: "farine", qty: 100, unit: "g", lossPct: 0 },
        ]),
        recipe("r2", "Quiche", [
          { ingredientId: "oeuf", qty: 2, unit: "pièce", lossPct: 0 },
          { ingredientId: "oeufs", qty: 4, unit: "pièce", lossPct: 10 },
          { ingredientId: "oeuf-bio", qty: 1, unit: "pièce", lossPct: 0 },
        ]),
        recipe("r3", "Pain", [{ ingredientId: "farine", qty: 500, unit: "g", lossPct: 0 }]),
      ]);
      await putAll("groceryLists", [
        list("l1", "Courses lundi", [
          listItem({ ingredientId: "oeuf", name: "Oeuf", totalQty: 6, haveQty: 2, checked: true }),
          listItem({ ingredientId: "oeufs", name: "Oeufs", totalQty: 12, checked: true }),
          listItem({ ingredientId: "farine", name: "Farine", totalQty: 1000, unit: "g" }),
        ]),
        list("l2", "Courses mardi", [listItem({ ingredientId: "farine", name: "Farine", totalQty: 500, unit: "g" })]),
      ]);
    });

    it("remaps recipes and lists, collapses touched lines, writes aliases and deletes the merged rows", async () => {
      const result = await service.merge("oeuf", ["oeufs", "oeuf-bio"]);
      expect(result).toEqual({ ok: true, recipesUpdated: 2, listsUpdated: 1, removed: 2, preexisting: 0 });

      const r1 = await ddb.get("recipes", { recipeId: "r1" }) as unknown as Recipe;
      expect(r1.ingredients).toEqual([
        { ingredientId: "oeuf", qty: 3, unit: "pièce", lossPct: 5 },
        { ingredientId: "farine", qty: 100, unit: "g", lossPct: 0 },
      ]);
      const r2 = await ddb.get("recipes", { recipeId: "r2" }) as unknown as Recipe;
      expect(r2.ingredients).toEqual([{ ingredientId: "oeuf", qty: 7, unit: "pièce", lossPct: 10 }]);
      expect(r2.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
      const r3 = await ddb.get("recipes", { recipeId: "r3" }) as unknown as Recipe;
      expect(r3.updatedAt).toBe("2026-01-01T00:00:00.000Z");

      const l1 = await ddb.get("groceryLists", { listId: "l1" }) as unknown as GroceryList;
      expect(l1.items).toEqual([
        { ingredientId: "oeuf", name: "Oeuf", totalQty: 18, unit: "pièce", supplier: "Barn", pricePerUnit: 1, priceUnit: "€/pièce", checked: true, haveQty: 2 },
        { ingredientId: "farine", name: "Farine", totalQty: 1000, unit: "g", supplier: "Barn", pricePerUnit: 1, priceUnit: "€/pièce", checked: false },
      ]);
      expect(ddb.updates.filter((u) => u.table === "groceryLists").map((u) => u.key.listId)).toEqual(["l1"]);

      const survivor = await ddb.get("ingredients", { ingredientId: "oeuf" }) as unknown as Ingredient;
      expect(survivor.aliases).toEqual(["oeufs", "oeuf", "oeuf bio", "bio oeuf", "oeufs bio"]);
      expect(survivor.mergedFrom).toEqual(["oeufs", "oeuf-bio"]);
      expect(survivor.updatedAt).not.toBe("2026-02-01T00:00:00.000Z");
      expect(ddb.rows("ingredients").has("oeufs")).toBe(false);
      expect(ddb.rows("ingredients").has("oeuf-bio")).toBe(false);
      expect(ddb.rows("ingredients").has("farine")).toBe(true);
    });

    it("keeps haveQty undefined when neither item has one and sums it otherwise", async () => {
      await ddb.put("groceryLists", list("l3", "Sans stock", [
        listItem({ ingredientId: "oeufs", name: "Oeufs", totalQty: 1 }),
        listItem({ ingredientId: "oeuf", name: "Oeuf", totalQty: 2 }),
      ]) as unknown as Item);
      await ddb.put("groceryLists", list("l4", "Avec stock", [
        listItem({ ingredientId: "oeufs", name: "Oeufs", totalQty: 1, haveQty: 1 }),
        listItem({ ingredientId: "oeuf", name: "Oeuf", totalQty: 2, haveQty: 3 }),
      ]) as unknown as Item);
      await service.merge("oeuf", ["oeufs"]);
      const l3 = await ddb.get("groceryLists", { listId: "l3" }) as unknown as GroceryList;
      expect(l3.items).toHaveLength(1);
      expect("haveQty" in l3.items[0]).toBe(false);
      expect(l3.items[0].totalQty).toBe(3);
      const l4 = await ddb.get("groceryLists", { listId: "l4" }) as unknown as GroceryList;
      expect(l4.items[0].haveQty).toBe(4);
    });

    it("leaves pre-existing survivor duplicates alone and counts them", async () => {
      await ddb.put("recipes", recipe("r4", "Brioche", [
        { ingredientId: "oeuf", qty: 1, unit: "pièce", lossPct: 0 },
        { ingredientId: "oeuf", qty: 2, unit: "pièce", lossPct: 0 },
        { ingredientId: "oeufs", qty: 5, unit: "pièce", lossPct: 0 },
      ]) as unknown as Item);
      const result = await service.merge("oeuf", ["oeufs"]);
      expect(result).toMatchObject({ ok: true, preexisting: 1 });
      const r4 = await ddb.get("recipes", { recipeId: "r4" }) as unknown as Recipe;
      expect(r4.ingredients).toEqual([
        { ingredientId: "oeuf", qty: 6, unit: "pièce", lossPct: 0 },
        { ingredientId: "oeuf", qty: 2, unit: "pièce", lossPct: 0 },
      ]);
    });

    it("404s when the survivor is missing", async () => {
      await expect(service.merge("ghost", ["oeufs"])).rejects.toBeInstanceOf(NotFoundException);
      expect(ddb.updates).toHaveLength(0);
    });

    it("treats a merged id that no longer exists as done and does not record it", async () => {
      const result = await service.merge("oeuf", ["oeufs", "gone"]);
      expect(result).toMatchObject({ ok: true, removed: 1 });
      const survivor = await ddb.get("ingredients", { ingredientId: "oeuf" }) as unknown as Ingredient;
      expect(survivor.mergedFrom).toEqual(["oeufs"]);
    });

    it("409s UNIT_MISMATCH and writes nothing", async () => {
      const call = service.merge("oeuf", ["oeufs", "farine"]);
      await expect(call).rejects.toBeInstanceOf(ConflictException);
      await call.catch((err: ConflictException) => {
        expect(err.getResponse()).toEqual({ code: "UNIT_MISMATCH", names: ["Farine"] });
      });
      expect(ddb.updates).toHaveLength(0);
      expect(ddb.deleted).toHaveLength(0);
      expect(ddb.rows("ingredients").size).toBe(4);
    });

    it("returns ok false with the failure and deletes nothing when a recipe update fails", async () => {
      ddb.failUpdateOn.set("r1", new Error("throttled"));
      const result = await service.merge("oeuf", ["oeufs"]);
      expect(result).toEqual({
        ok: false,
        recipesUpdated: 1,
        listsUpdated: 1,
        failures: [{ id: "r1", table: "recipes", message: "throttled" }],
        preexisting: 0,
      });
      expect(ddb.deleted).toHaveLength(0);
      expect(ddb.rows("ingredients").has("oeufs")).toBe(true);
      const survivor = await ddb.get("ingredients", { ingredientId: "oeuf" }) as unknown as Ingredient;
      expect(survivor.aliases).toBeUndefined();
      expect(ddb.scanCalls.get("recipes")).toBe(1);
    });

    it("is idempotent when re-run after a partial failure", async () => {
      ddb.failUpdateOn.set("r1", new Error("throttled"));
      await service.merge("oeuf", ["oeufs"]);
      const r2AfterFirst = await ddb.get("recipes", { recipeId: "r2" });

      const result = await service.merge("oeuf", ["oeufs"]);
      expect(result).toEqual({ ok: true, recipesUpdated: 1, listsUpdated: 0, removed: 1, preexisting: 0 });
      expect(await ddb.get("recipes", { recipeId: "r2" })).toEqual(r2AfterFirst);
      const r1 = await ddb.get("recipes", { recipeId: "r1" }) as unknown as Recipe;
      expect(r1.ingredients[0]).toEqual({ ingredientId: "oeuf", qty: 3, unit: "pièce", lossPct: 5 });
      expect(ddb.rows("ingredients").has("oeufs")).toBe(false);
      const survivor = await ddb.get("ingredients", { ingredientId: "oeuf" }) as unknown as Ingredient;
      expect(survivor.aliases).toEqual(["oeufs", "oeuf"]);
      expect(survivor.mergedFrom).toEqual(["oeufs"]);
    });

    it("409s STILL_REFERENCED when a reference is reintroduced before the delete", async () => {
      ddb.onScan = (table, call, items) => {
        if (table !== "recipes" || call !== 2) return items;
        return [...items, recipe("r9", "Tarte", [{ ingredientId: "oeufs", qty: 1, unit: "pièce", lossPct: 0 }]) as unknown as Item];
      };
      const call = service.merge("oeuf", ["oeufs"]);
      await expect(call).rejects.toBeInstanceOf(ConflictException);
      await call.catch((err: ConflictException) => {
        expect(err.getResponse()).toEqual({ code: "STILL_REFERENCED", names: ["Tarte"] });
      });
      expect(ddb.deleted).toHaveLength(0);
      expect(ddb.rows("ingredients").has("oeufs")).toBe(true);
      expect(ddb.updates.some((u) => u.table === "ingredients")).toBe(false);
    });
  });

  describe("update", () => {
    beforeEach(async () => {
      await putAll("ingredients", [ing({ ingredientId: "oeuf", name: "Oeuf", unit: "€/pièce" })]);
      await putAll("recipes", [recipe("r1", "Omelette", [{ ingredientId: "oeuf", qty: 3, unit: "pièce", lossPct: 0 }])]);
    });

    it("409s UNIT_IN_USE when the unit changes family while recipes reference it", async () => {
      const call = service.update("oeuf", { unit: "€/kg" });
      await expect(call).rejects.toBeInstanceOf(ConflictException);
      await call.catch((err: ConflictException) => {
        expect(err.getResponse()).toEqual({ code: "UNIT_IN_USE", recipes: ["Omelette"] });
      });
      expect(ddb.updates).toHaveLength(0);
    });

    it("accepts a price change and a unit change within the family", async () => {
      const updated = await service.update("oeuf", { price: 0.4, unit: "€/pièce" });
      expect(updated.price).toBe(0.4);
      expect(updated.unit).toBe("€/pièce");
    });
  });

  describe("delete", () => {
    it("409s IN_USE with recipe names when referenced", async () => {
      await putAll("ingredients", [ing({ ingredientId: "oeuf", name: "Oeuf" })]);
      await putAll("recipes", [
        recipe("r1", "Omelette", [{ ingredientId: "oeuf", qty: 3, unit: "pièce", lossPct: 0 }]),
        recipe("r2", "Pain", []),
      ]);
      const call = service.delete("oeuf");
      await expect(call).rejects.toBeInstanceOf(ConflictException);
      await call.catch((err: ConflictException) => {
        expect(err.getResponse()).toEqual({ code: "IN_USE", recipes: ["Omelette"] });
      });
      expect(ddb.rows("ingredients").has("oeuf")).toBe(true);
    });

    it("deletes when unreferenced", async () => {
      await putAll("ingredients", [ing({ ingredientId: "oeuf", name: "Oeuf" })]);
      await service.delete("oeuf");
      expect(ddb.rows("ingredients").has("oeuf")).toBe(false);
    });
  });

  describe("duplicates", () => {
    it("groups Oeuf and Oeufs with ref counts and ingredient details", async () => {
      await putAll("ingredients", [
        ing({ ingredientId: "oeuf", name: "Oeuf", price: 0.3, supplier: "Vds", updatedAt: "2026-03-01T00:00:00.000Z" }),
        ing({ ingredientId: "oeufs", name: "Oeufs", price: 0.25 }),
        ing({ ingredientId: "farine", name: "Farine", unit: "€/kg" }),
      ]);
      await putAll("recipes", [
        recipe("r1", "Omelette", [
          { ingredientId: "oeufs", qty: 3, unit: "pièce", lossPct: 0 },
          { ingredientId: "oeufs", qty: 1, unit: "pièce", lossPct: 0 },
        ]),
        recipe("r2", "Quiche", [{ ingredientId: "oeufs", qty: 2, unit: "pièce", lossPct: 0 }]),
      ]);
      await putAll("groceryLists", [list("l1", "Courses", [listItem({ ingredientId: "oeuf", name: "Oeuf" })])]);

      const { groups } = await service.duplicates();
      expect(groups).toHaveLength(1);
      expect(groups[0].key).toBe("oeuf");
      expect(groups[0].suggestedSurvivorId).toBe("oeufs");
      expect(groups[0].members).toEqual([
        { ingredientId: "oeufs", name: "Oeufs", unit: "€/pièce", key: "oeuf", confidence: "identique", recipeCount: 2, listCount: 0, price: 0.25, supplier: "Barn", updatedAt: "2026-01-01T00:00:00.000Z" },
        { ingredientId: "oeuf", name: "Oeuf", unit: "€/pièce", key: "oeuf", confidence: "identique", recipeCount: 0, listCount: 1, price: 0.3, supplier: "Vds", updatedAt: "2026-03-01T00:00:00.000Z" },
      ]);
    });

    it("skips ignored keys", async () => {
      await putAll("ingredients", [ing({ ingredientId: "oeuf", name: "Oeuf" }), ing({ ingredientId: "oeufs", name: "Oeufs" })]);
      settings.ignored = ["oeuf"];
      expect((await service.duplicates()).groups).toEqual([]);
    });
  });

  describe("importIngredients", () => {
    beforeEach(async () => {
      await putAll("ingredients", [
        ing({ ingredientId: "oeuf", name: "Oeuf", aliases: ["oeufs", "oeuf bio"] }),
        ing({ ingredientId: "farine", name: "Farine", unit: "€/kg", price: 1 }),
      ]);
    });

    it("matches an alias and updates the survivor", async () => {
      const result = await service.importIngredients([
        { nom: "Oeufs", prix_htva: 0.4, unite: "€/pièce", fournisseur: "Vds" },
      ]);
      expect(result).toEqual({ created: 0, updated: 1, unmatched: [] });
      const survivor = await ddb.get("ingredients", { ingredientId: "oeuf" }) as unknown as Ingredient;
      expect(survivor.price).toBe(0.4);
      expect(survivor.supplier).toBe("Vds");
      expect(ddb.rows("ingredients").size).toBe(2);
    });

    it("matches a normalized live name before an alias", async () => {
      await ddb.put("ingredients", ing({ ingredientId: "oeuf-bio-live", name: "Oeufs bio" }) as unknown as Item);
      const result = await service.importIngredients([
        { nom: "OEUF BIO", prix_htva: 0.5, unite: "€/pièce", fournisseur: "Vds" },
      ]);
      expect(result).toEqual({ created: 0, updated: 1, unmatched: [] });
      expect(ddb.updates[0].key).toEqual({ ingredientId: "oeuf-bio-live" });
    });

    it("keeps the stored supplier when the row has none and replaces it when the row names one", async () => {
      await ddb.put("ingredients", ing({ ingredientId: "farine-t55", name: "Farine T55", unit: "€/kg", supplier: "Metro" }) as unknown as Item);

      const kept = await service.importIngredients([{ nom: "Farine T55", prix_htva: 1.3, unite: "€/kg", fournisseur: "" }]);
      expect(kept).toEqual({ created: 0, updated: 1, unmatched: [] });
      expect(ddb.updates[0].key).toEqual({ ingredientId: "farine-t55" });
      expect(ddb.updates[0].fields).toMatchObject({ price: 1.3, supplier: "Metro" });

      const replaced = await service.importIngredients([{ nom: "Farine T55", prix_htva: 1.4, unite: "€/kg", fournisseur: "Colruyt" }]);
      expect(replaced).toEqual({ created: 0, updated: 1, unmatched: [] });
      expect(ddb.updates[1].fields).toMatchObject({ price: 1.4, supplier: "Colruyt" });
      const stored = await ddb.get("ingredients", { ingredientId: "farine-t55" }) as unknown as Ingredient;
      expect(stored.supplier).toBe("Colruyt");
    });

    it("skips a unit-family mismatch instead of overwriting the unit", async () => {
      const result = await service.importIngredients([
        { nom: "Farine", prix_htva: 2, unite: "€/pièce", fournisseur: "Vds" },
        { nom: "Sucre", prix_htva: 1.5, unite: "€/kg", fournisseur: "Vds" },
      ]);
      expect(result).toEqual({ created: 1, updated: 0, unmatched: ["Farine"] });
      const farine = await ddb.get("ingredients", { ingredientId: "farine" }) as unknown as Ingredient;
      expect(farine.unit).toBe("€/kg");
      expect(farine.price).toBe(1);
      expect(ddb.rows("ingredients").size).toBe(3);
    });
  });
});
