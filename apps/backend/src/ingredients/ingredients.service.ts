import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Ingredient } from "@packages/types";
import { DdbService } from "../shared/ddb.service";

@Injectable()
export class IngredientsService {
  private get table() { return this.ddb.tables.ingredients; }

  constructor(private ddb: DdbService) {}

  async getAll(): Promise<Ingredient[]> {
    const items = await this.ddb.scanAll(this.table);
    return items as unknown as Ingredient[];
  }

  async get(ingredientId: string): Promise<Ingredient | null> {
    const item = await this.ddb.get(this.table, { ingredientId });
    return item as Ingredient | null;
  }

  async getOrFail(ingredientId: string): Promise<Ingredient> {
    const item = await this.get(ingredientId);
    if (!item) throw new NotFoundException("Ingredient not found");
    return item;
  }

  async create(data: Omit<Ingredient, "ingredientId" | "nameLower" | "createdAt" | "updatedAt">): Promise<Ingredient> {
    const now = new Date().toISOString();
    const ingredient: Ingredient = {
      ingredientId: randomUUID(),
      ...data,
      nameLower: data.name.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    };
    await this.ddb.put(this.table, ingredient as unknown as Record<string, unknown>);
    return ingredient;
  }

  async update(ingredientId: string, fields: Partial<Ingredient>): Promise<Ingredient> {
    await this.getOrFail(ingredientId);
    const updates: Record<string, unknown> = {
      ...fields,
      updatedAt: new Date().toISOString(),
    };
    if (fields.name) updates.nameLower = fields.name.toLowerCase();
    await this.ddb.update(this.table, { ingredientId }, updates);
    return this.getOrFail(ingredientId);
  }

  async delete(ingredientId: string): Promise<void> {
    await this.ddb.delete(this.table, { ingredientId });
  }

  async batchPut(ingredients: Ingredient[]): Promise<void> {
    await this.ddb.batchWrite(this.table, ingredients as unknown as Record<string, unknown>[]);
  }

  async deduplicate(): Promise<{ removed: number }> {
    const all = await this.getAll();
    const groups = new Map<string, Ingredient[]>();
    for (const ing of all) {
      const key = ing.nameLower || ing.name.toLowerCase();
      const group = groups.get(key) ?? [];
      group.push(ing);
      groups.set(key, group);
    }
    const toDelete: { ingredientId: string }[] = [];
    for (const group of groups.values()) {
      if (group.length <= 1) continue;
      group.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
      toDelete.push(...group.slice(1).map((i) => ({ ingredientId: i.ingredientId })));
    }
    if (toDelete.length > 0) {
      await this.ddb.batchDelete(this.table, toDelete);
    }
    return { removed: toDelete.length };
  }

  async importIngredients(rows: Array<{ nom: string; prix_htva: number; unite: string; fournisseur: string; commentaire?: string }>): Promise<{ created: number; updated: number }> {
    const existing = await this.getAll();
    const existingByName = new Map(existing.map((i) => [i.nameLower, i]));
    const now = new Date().toISOString();

    const toCreate: Ingredient[] = [];
    const toUpdate: Array<{ ingredientId: string; fields: Record<string, unknown> }> = [];

    for (const row of rows) {
      const nameLower = row.nom.trim().toLowerCase();
      if (!nameLower) continue;

      const match = existingByName.get(nameLower);
      if (match) {
        toUpdate.push({
          ingredientId: match.ingredientId,
          fields: {
            price: row.prix_htva,
            unit: row.unite,
            supplier: row.fournisseur,
            comment: row.commentaire || match.comment,
            updatedAt: now,
          },
        });
      } else {
        const ingredient: Ingredient = {
          ingredientId: randomUUID(),
          name: row.nom.trim(),
          nameLower,
          price: row.prix_htva,
          unit: row.unite as Ingredient["unit"],
          supplier: row.fournisseur,
          comment: row.commentaire,
          createdAt: now,
          updatedAt: now,
        };
        toCreate.push(ingredient);
        existingByName.set(nameLower, ingredient);
      }
    }

    // batch write all new items (25 per DynamoDB request)
    if (toCreate.length > 0) {
      await this.ddb.batchWrite(this.table, toCreate as unknown as Record<string, unknown>[]);
    }

    // updates must be individual (batchWrite only supports PutRequest/DeleteRequest)
    await Promise.all(toUpdate.map(({ ingredientId, fields }) =>
      this.ddb.update(this.table, { ingredientId }, fields),
    ));

    return { created: toCreate.length, updated: toUpdate.length };
  }
}
