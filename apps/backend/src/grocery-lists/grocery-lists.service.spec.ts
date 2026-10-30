import type { GroceryList } from "@packages/types";
import { DdbService } from "../shared/ddb.service";
import { GroceryListsController } from "./grocery-lists.controller";
import { GroceryListsService } from "./grocery-lists.service";

type Item = Record<string, unknown>;

class FakeDdb {
  readonly tables = { groceryLists: "grocery-lists" };
  private readonly rows = new Map<string, Item>();

  async get(_table: string, key: Record<string, string>) {
    const row = this.rows.get(key.listId);
    return row ? structuredClone(row) : null;
  }

  async put(_table: string, row: Item) {
    this.rows.set(row.listId as string, structuredClone(row));
  }

  async update(_table: string, key: Record<string, string>, fields: Item) {
    const row = this.rows.get(key.listId);
    if (!row) throw new Error("missing row");
    this.rows.set(key.listId, { ...row, ...structuredClone(fields) });
  }

  async scanAll() { return [...this.rows.values()].map((row) => structuredClone(row)); }
  async delete(_table: string, key: Record<string, string>) { this.rows.delete(key.listId); }
}

describe("GroceryListsController persistence", () => {
  let ddb: FakeDdb;
  let service: GroceryListsService;
  let controller: GroceryListsController;

  beforeEach(() => {
    ddb = new FakeDdb();
    service = new GroceryListsService(ddb as unknown as DdbService);
    controller = new GroceryListsController(service);
  });

  it("persists zero and decimal quantity edits, preserves item identity, and stores manual rayon moves", async () => {
    const created = await controller.create({
      title: "Courses",
      items: [{ ingredientId: "ing-1", name: "Farine", totalQty: 1.5, unit: "kg", supplier: "Barn", pricePerUnit: 2, priceUnit: "€/kg", checked: false, storage: "dry" }],
    }) as GroceryList;
    const original = created.items[0];

    const decimal = await controller.update(created.listId, {
      items: [{ ...original, totalQty: 0.25, storage: "fresh" }],
    }) as GroceryList;
    expect(decimal.items).toEqual([{ ...original, totalQty: 0.25, storage: "fresh" }]);
    expect((await ddb.get("grocery-lists", { listId: created.listId }))?.items).toEqual(decimal.items);

    const zero = await controller.update(created.listId, {
      items: [{ ...decimal.items[0], totalQty: 0, storage: "dry" }],
    }) as GroceryList;
    expect(zero.items[0]).toMatchObject({ ingredientId: "ing-1", name: "Farine", totalQty: 0, unit: "kg", storage: "dry" });
    expect((await ddb.get("grocery-lists", { listId: created.listId }))?.items).toEqual(zero.items);
  });

  it("continues to read existing lists whose items have no storage field", async () => {
    const oldList: GroceryList = {
      listId: "old-list",
      title: "Ancienne liste",
      items: [{ ingredientId: "ing-old", name: "Produit ancien", totalQty: 2, unit: "pièce", supplier: "Autre", pricePerUnit: 0, priceUnit: "€/pièce", checked: false }],
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    await ddb.put("grocery-lists", oldList as unknown as Item);

    expect(await controller.get("old-list")).toEqual(oldList);
  });
});
