import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { GroceryList } from "@packages/types";
import { DdbService } from "../shared/ddb.service";

@Injectable()
export class GroceryListsService {
  private get table() { return this.ddb.tables.groceryLists; }

  constructor(private ddb: DdbService) {}

  async getAll(): Promise<GroceryList[]> {
    const items = await this.ddb.scanAll(this.table);
    return (items as unknown as GroceryList[]).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async get(listId: string): Promise<GroceryList | null> {
    const item = await this.ddb.get(this.table, { listId });
    return item as GroceryList | null;
  }

  async getOrFail(listId: string): Promise<GroceryList> {
    const item = await this.get(listId);
    if (!item) throw new NotFoundException("Grocery list not found");
    return item;
  }

  async create(data: { title: string; items?: GroceryList["items"] }): Promise<GroceryList> {
    const now = new Date().toISOString();
    const list: GroceryList = {
      listId: randomUUID(),
      title: data.title,
      items: data.items ?? [],
      createdAt: now,
      updatedAt: now,
    };
    await this.ddb.put(this.table, list as unknown as Record<string, unknown>);
    return list;
  }

  async update(listId: string, fields: Partial<Pick<GroceryList, "title" | "items">>): Promise<GroceryList> {
    await this.getOrFail(listId);
    await this.ddb.update(this.table, { listId }, { ...fields, updatedAt: new Date().toISOString() });
    return this.getOrFail(listId);
  }

  async delete(listId: string): Promise<void> {
    await this.ddb.delete(this.table, { listId });
  }
}
