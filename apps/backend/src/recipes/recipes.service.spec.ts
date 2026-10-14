import type { Recipe } from "@packages/types";
import type { DdbService, UpdateOptions } from "../shared/ddb.service";
import type { S3Service } from "../shared/s3.service";
import type { IngredientsService } from "../ingredients/ingredients.service";
import { RecipesController } from "./recipes.controller";
import { RecipesService } from "./recipes.service";

type Item = Record<string, unknown>;
type UpdateCall = { table: string; key: Record<string, string>; fields: Item; options: UpdateOptions };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// In-memory stand-in for DdbService: one Map per table, rows keyed by recipeId.
class FakeDdb {
  tables = { events: "events", ingredients: "ingredients", recipes: "recipes", settings: "settings", groceryLists: "groceryLists" };
  store = new Map<string, Map<string, Item>>();
  updates: UpdateCall[] = [];

  rows(table: string) {
    if (!this.store.has(table)) this.store.set(table, new Map());
    return this.store.get(table) as Map<string, Item>;
  }

  raw(table: string, id: string) {
    return this.rows(table).get(id);
  }

  async get(table: string, key: Record<string, string>) {
    const item = this.rows(table).get(Object.values(key)[0]);
    return item ? clone(item) : null;
  }

  async put(table: string, item: Item | Recipe) {
    this.rows(table).set(String((item as Item).recipeId), clone(item as Item));
  }

  async update(table: string, key: Record<string, string>, fields: Item, options: UpdateOptions = {}) {
    this.updates.push({ table, key, fields: clone(fields), options });
    const item = this.rows(table).get(Object.values(key)[0]);
    if (!item) throw Object.assign(new Error("missing"), { name: "ConditionalCheckFailedException" });
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      if (v === null) delete item[k];
      else item[k] = clone(v);
    }
  }

  async scanAll(table: string) {
    return [...this.rows(table).values()].map(clone);
  }

  async delete(table: string, key: Record<string, string>) {
    this.rows(table).delete(Object.values(key)[0]);
  }

  async batchWrite(table: string, items: Item[]) {
    for (const item of items) await this.put(table, item);
  }
}

class FakeS3 {
  async presignedUrl(key: string) { return `https://signed/${key}`; }
}

class FakeIngredients {
  async getAll() { return []; }
}

const recipe = (overrides: Partial<Recipe> & { recipeId: string; name: string }): Recipe => ({
  nameLower: overrides.name.toLowerCase(),
  type: "Buffet",
  portions: 4,
  portionWeight: 150,
  techniques: [],
  ingredients: [],
  photos: [],
  pricing: { surPlace: { coef: 4, tva: 12 }, takeAway: { coef: 3, tva: 6 }, chosenPrice: { surPlace: 0, takeAway: 0 } },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const createBody = (overrides: Partial<Recipe> & { name: string }) => {
  const { recipeId: _id, nameLower: _lower, createdAt: _c, updatedAt: _u, ...rest } = recipe({ recipeId: "x", ...overrides });
  return rest;
};

function build() {
  const ddb = new FakeDdb();
  const s3 = new FakeS3();
  const service = new RecipesService(
    ddb as unknown as DdbService,
    s3 as unknown as S3Service,
    new FakeIngredients() as unknown as IngredientsService,
  );
  const controller = new RecipesController(service, s3 as unknown as S3Service);
  return { ddb, service, controller };
}

describe("RecipesService read", () => {
  it("fills category from defaultCourse first, else a mapped type, else a custom type as is", async () => {
    const { ddb, service } = build();
    await ddb.put("recipes", recipe({ recipeId: "r1", name: "Tarte", type: "Buffet", defaultCourse: "Dessert" }));
    await ddb.put("recipes", recipe({ recipeId: "r2", name: "Quiche", type: "Lunch" }));
    await ddb.put("recipes", recipe({ recipeId: "r3", name: "Soupe", type: "Menu semaine", defaultCourse: "Autre" }));
    await ddb.put("recipes", recipe({ recipeId: "r4", name: "Cocktail", type: "Walking dinner" }));
    await ddb.put("recipes", recipe({ recipeId: "r5", name: "Houmous", type: "Lunch", category: "Apéritif" }));

    const all = await service.getAll();
    const byId = new Map(all.map((r) => [r.recipeId, r.category]));
    expect(byId.get("r1")).toBe("Dessert");
    expect(byId.get("r2")).toBe("Plat");
    expect(byId.get("r3")).toBe("Plat");
    expect(byId.get("r4")).toBe("Walking dinner");
    expect(byId.get("r5")).toBe("Apéritif");

    const one = await service.get("r2");
    expect(one?.category).toBe("Plat");
    expect(one?.type).toBe("Lunch");
    expect(ddb.raw("recipes", "r2")?.category).toBeUndefined();
  });

  it("filters the list on the served category, with type as an alias", async () => {
    const { ddb, controller } = build();
    await ddb.put("recipes", recipe({ recipeId: "r1", name: "Tarte", type: "Buffet", defaultCourse: "Dessert" }));
    await ddb.put("recipes", recipe({ recipeId: "r2", name: "Quiche", type: "Lunch" }));
    await ddb.put("recipes", recipe({ recipeId: "r3", name: "Soupe", category: "Plat", type: "Plat" }));

    const plats = await controller.list({ category: "Plat" });
    expect(plats.map((r) => r.recipeId)).toEqual(["r2", "r3"]);
    const alias = await controller.list({ type: "Dessert" });
    expect(alias.map((r) => r.recipeId)).toEqual(["r1"]);
    expect((await controller.list({})).length).toBe(3);
  });
});

describe("RecipesService.create", () => {
  it("writes category and type equal and drops defaultCourse", async () => {
    const { ddb, service } = build();
    const created = await service.create(createBody({ name: "Houmous", category: "Apéritif", type: "Buffet", defaultCourse: "Entrée" }));
    const stored = ddb.raw("recipes", created.recipeId);
    expect(stored?.category).toBe("Apéritif");
    expect(stored?.type).toBe("Apéritif");
    expect("defaultCourse" in (stored ?? {})).toBe(false);
    expect(created.category).toBe("Apéritif");
    expect(created.type).toBe("Apéritif");
  });

  it("derives the category from the legacy fields when none is given", async () => {
    const { ddb, service } = build();
    const fromType = await service.create(createBody({ name: "Quiche", type: "Lunch" }));
    expect(ddb.raw("recipes", fromType.recipeId)?.category).toBe("Plat");
    expect(ddb.raw("recipes", fromType.recipeId)?.type).toBe("Plat");

    const fromCourse = await service.create(createBody({ name: "Tarte", type: "Buffet", defaultCourse: "Dessert" }));
    expect(ddb.raw("recipes", fromCourse.recipeId)?.category).toBe("Dessert");
    expect(ddb.raw("recipes", fromCourse.recipeId)?.type).toBe("Dessert");
  });
});

describe("RecipesService.update", () => {
  it("mirrors a given category into type", async () => {
    const { ddb, service } = build();
    await ddb.put("recipes", recipe({ recipeId: "r1", name: "Tarte", type: "Buffet", defaultCourse: "Dessert" }));
    const updated = await service.update("r1", { category: "Entrée" });
    expect(updated.category).toBe("Entrée");
    expect(updated.type).toBe("Entrée");
    expect(ddb.updates[0].fields.category).toBe("Entrée");
    expect(ddb.updates[0].fields.type).toBe("Entrée");
    expect(ddb.raw("recipes", "r1")?.defaultCourse).toBe("Dessert");
  });

  it("maps a bare type from an old client into both keys", async () => {
    const { ddb, service } = build();
    await ddb.put("recipes", recipe({ recipeId: "r1", name: "Quiche", type: "Buffet" }));
    const updated = await service.update("r1", { type: "Lunch" });
    expect(updated.category).toBe("Plat");
    expect(updated.type).toBe("Plat");
    expect(ddb.updates[0].fields).toMatchObject({ category: "Plat", type: "Plat" });
  });

  it("never writes defaultCourse again", async () => {
    const { ddb, service } = build();
    await ddb.put("recipes", recipe({ recipeId: "r1", name: "Quiche", type: "Buffet" }));
    await service.update("r1", { portions: 6, defaultCourse: "Plat" });
    expect("defaultCourse" in ddb.updates[0].fields).toBe(false);
    expect(ddb.updates[0].fields.portions).toBe(6);
    expect(ddb.updates[0].fields.category).toBeUndefined();
  });
});

describe("RecipesService.importRecipes", () => {
  it("maps the type column through the legacy mapping and lets categorie win", async () => {
    const { ddb, service } = build();
    const result = await service.importRecipes([
      { name: "Quiche", type: "Lunch" },
      { name: "Tarte", type: "Lunch", category: "Dessert" },
      { name: "Houmous" },
    ]);
    expect(result).toEqual({ created: 3, skipped: 0, unmatchedIngredients: [] });
    const byName = new Map([...ddb.rows("recipes").values()].map((r) => [r.name, r]));
    expect(byName.get("Quiche")).toMatchObject({ category: "Plat", type: "Plat" });
    expect(byName.get("Tarte")).toMatchObject({ category: "Dessert", type: "Dessert" });
    expect(byName.get("Houmous")).toMatchObject({ category: "Buffet", type: "Buffet" });
  });
});
