import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type {
  DuplicateGroup,
  DuplicateMember,
  GroceryList,
  GroceryListItem,
  ImportIngredientRow,
  Ingredient,
  Recipe,
  RecipeIngredient,
  RefCounts,
} from "@packages/types";
import { PRICE_TO_QTY_UNIT, groupDuplicates, normalizeIngredientName } from "@packages/types";
import { DdbService } from "../shared/ddb.service";
import { SettingsService } from "../settings/settings.service";

export type DuplicateMemberDetail = DuplicateMember & Pick<Ingredient, "price" | "supplier" | "updatedAt">;
export type DuplicateGroupDetail = Omit<DuplicateGroup, "members"> & { members: DuplicateMemberDetail[] };
export interface DuplicatesResult { groups: DuplicateGroupDetail[] }

export interface MergeFailure { id: string; table: "recipes" | "groceryLists"; message: string }
export type MergeResult =
  | { ok: true; recipesUpdated: number; listsUpdated: number; removed: number; preexisting: number }
  | { ok: false; recipesUpdated: number; listsUpdated: number; failures: MergeFailure[]; preexisting: number };

export interface ImportIngredientsResult { created: number; updated: number; unmatched: string[] }


// Finds an ingredient by name: exact nameLower, then normalized name, then normalized alias.
export class IngredientLookup {
  private exact = new Map<string, Ingredient>();
  private live = new Map<string, Ingredient>();
  private alias = new Map<string, Ingredient>();

  constructor(ingredients: Ingredient[]) {
    for (const ing of ingredients) this.add(ing);
  }

  add(ing: Ingredient) {
    this.exact.set(ing.nameLower || ing.name.toLowerCase(), ing);
    const key = normalizeIngredientName(ing.name);
    if (key && !this.live.has(key)) this.live.set(key, ing);
    for (const a of ing.aliases ?? []) {
      const aliasKey = normalizeIngredientName(a);
      if (aliasKey && !this.alias.has(aliasKey)) this.alias.set(aliasKey, ing);
    }
  }

  find(name: string): Ingredient | undefined {
    const trimmed = name.trim();
    const exact = this.exact.get(trimmed.toLowerCase());
    if (exact) return exact;
    const key = normalizeIngredientName(trimmed);
    if (!key) return undefined;
    return this.live.get(key) ?? this.alias.get(key);
  }
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

type Tracked<T> = { line: T; touched: boolean };

// Rewrites merged ids to the survivor and sums lines that collide because of this merge.
function remapRecipeLines(
  lines: RecipeIngredient[],
  survivorId: string,
  merged: Set<string>,
): { lines: RecipeIngredient[]; preexisting: number } {
  const out: Tracked<RecipeIngredient>[] = [];
  for (const raw of lines) {
    const touched = merged.has(raw.ingredientId);
    const line = touched ? { ...raw, ingredientId: survivorId } : raw;
    if (line.ingredientId === survivorId) {
      const idx = out.findIndex((o) =>
        o.line.ingredientId === survivorId && o.line.unit === line.unit && (o.touched || touched));
      if (idx >= 0) {
        const target = out[idx].line;
        out[idx] = {
          touched: true,
          line: { ...target, qty: target.qty + line.qty, lossPct: Math.max(target.lossPct ?? 0, line.lossPct ?? 0) },
        };
        continue;
      }
    }
    out.push({ line, touched });
  }
  const unitsSeen = new Map<string, number>();
  for (const o of out) {
    if (o.line.ingredientId !== survivorId) continue;
    unitsSeen.set(o.line.unit, (unitsSeen.get(o.line.unit) ?? 0) + 1);
  }
  const preexisting = [...unitsSeen.values()].filter((n) => n > 1).length;
  return { lines: out.map((o) => o.line), preexisting };
}

function mergeHaveQty(a: GroceryListItem, b: GroceryListItem): number | undefined {
  if ((a.haveQty ?? b.haveQty) === undefined) return undefined;
  return (a.haveQty ?? 0) + (b.haveQty ?? 0);
}

function remapListItems(
  items: GroceryListItem[],
  survivor: Ingredient,
  merged: Set<string>,
): GroceryListItem[] {
  const out: Tracked<GroceryListItem>[] = [];
  for (const raw of items) {
    const touched = merged.has(raw.ingredientId);
    const item = touched ? { ...raw, ingredientId: survivor.ingredientId, name: survivor.name } : raw;
    if (item.ingredientId === survivor.ingredientId) {
      const idx = out.findIndex((o) =>
        o.line.ingredientId === survivor.ingredientId && o.line.unit === item.unit && (o.touched || touched));
      if (idx >= 0) {
        const target = out[idx].line;
        const haveQty = mergeHaveQty(target, item);
        out[idx] = {
          touched: true,
          line: {
            ...target,
            totalQty: target.totalQty + item.totalQty,
            checked: Boolean(target.checked && item.checked),
            ...(haveQty !== undefined ? { haveQty } : {}),
          },
        };
        if (haveQty === undefined) delete out[idx].line.haveQty;
        continue;
      }
    }
    out.push({ line: item, touched });
  }
  return out.map((o) => o.line);
}

@Injectable()
export class IngredientsService {
  private get table() { return this.ddb.tables.ingredients; }

  constructor(private ddb: DdbService, private settings: SettingsService) {}

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
    const stored = await this.getOrFail(ingredientId);
    if (fields.unit && PRICE_TO_QTY_UNIT[fields.unit] !== PRICE_TO_QTY_UNIT[stored.unit]) {
      await this.assertUnused(ingredientId, "UNIT_IN_USE");
    }
    const updates: Record<string, unknown> = {
      ...fields,
      updatedAt: new Date().toISOString(),
    };
    if (fields.name) updates.nameLower = fields.name.toLowerCase();
    await this.ddb.update(this.table, { ingredientId }, updates);
    return this.getOrFail(ingredientId);
  }

  private async scanRecipes(): Promise<Recipe[]> {
    return (await this.ddb.scanAll(this.ddb.tables.recipes)) as unknown as Recipe[];
  }

  private async scanLists(): Promise<GroceryList[]> {
    return (await this.ddb.scanAll(this.ddb.tables.groceryLists)) as unknown as GroceryList[];
  }

  async delete(ingredientId: string): Promise<void> {
    await this.assertUnused(ingredientId, "IN_USE");
    await this.ddb.delete(this.table, { ingredientId });
  }

  // 409 with the recipe names when any recipe line references the ingredient.
  private async assertUnused(ingredientId: string, code: "IN_USE" | "UNIT_IN_USE"): Promise<void> {
    const recipes = await this.scanRecipes();
    const names = recipes
      .filter((r) => (r.ingredients ?? []).some((l) => l.ingredientId === ingredientId))
      .map((r) => r.name);
    if (names.length > 0) throw new ConflictException({ code, recipes: names });
  }

  async batchPut(ingredients: Ingredient[]): Promise<void> {
    await this.ddb.batchWrite(this.table, ingredients as unknown as Record<string, unknown>[]);
  }

  async duplicates(): Promise<DuplicatesResult> {
    const [ingredients, recipes, lists, settings] = await Promise.all([
      this.getAll(),
      this.scanRecipes(),
      this.scanLists(),
      this.settings.get(),
    ]);
    const refCounts = new Map<string, RefCounts>();
    const bump = (id: string, field: keyof RefCounts) => {
      const c = refCounts.get(id) ?? { recipeCount: 0, listCount: 0 };
      c[field] += 1;
      refCounts.set(id, c);
    };
    for (const r of recipes) {
      for (const id of new Set((r.ingredients ?? []).map((l) => l.ingredientId))) bump(id, "recipeCount");
    }
    for (const l of lists) {
      for (const id of new Set((l.items ?? []).map((i) => i.ingredientId))) bump(id, "listCount");
    }
    const byId = new Map(ingredients.map((i) => [i.ingredientId, i]));
    const groups = groupDuplicates(ingredients, { ignoredKeys: settings.ignoredDuplicateGroups ?? [], refCounts });
    return {
      groups: groups.map((g) => ({
        ...g,
        members: g.members.map((m) => {
          const ing = byId.get(m.ingredientId);
          return { ...m, price: ing?.price ?? 0, supplier: ing?.supplier ?? "", updatedAt: ing?.updatedAt ?? "" };
        }),
      })),
    };
  }

  async merge(survivorId: string, mergedIds: string[]): Promise<MergeResult> {
    const survivor = await this.get(survivorId);
    if (!survivor) throw new NotFoundException("Ingredient not found");
    const ids = [...new Set(mergedIds)].filter((id) => id !== survivorId);
    const mergedRows = (await Promise.all(ids.map((id) => this.get(id)))).filter((r): r is Ingredient => r !== null);

    const family = PRICE_TO_QTY_UNIT[survivor.unit];
    const mismatched = mergedRows.filter((r) => PRICE_TO_QTY_UNIT[r.unit] !== family).map((r) => r.name);
    if (mismatched.length > 0) throw new ConflictException({ code: "UNIT_MISMATCH", names: mismatched });

    const merged = new Set(ids);
    const now = new Date().toISOString();
    const failures: MergeFailure[] = [];
    let recipesUpdated = 0;
    let listsUpdated = 0;
    let preexisting = 0;

    for (const recipe of await this.scanRecipes()) {
      if (!(recipe.ingredients ?? []).some((l) => merged.has(l.ingredientId))) continue;
      const result = remapRecipeLines(recipe.ingredients, survivorId, merged);
      preexisting += result.preexisting;
      try {
        await this.ddb.update(this.ddb.tables.recipes, { recipeId: recipe.recipeId }, { ingredients: result.lines, updatedAt: now });
        recipesUpdated++;
      } catch (err) {
        failures.push({ id: recipe.recipeId, table: "recipes", message: errorMessage(err) });
      }
    }

    for (const list of await this.scanLists()) {
      if (!(list.items ?? []).some((i) => merged.has(i.ingredientId))) continue;
      const items = remapListItems(list.items, survivor, merged);
      try {
        await this.ddb.update(this.ddb.tables.groceryLists, { listId: list.listId }, { items, updatedAt: now });
        listsUpdated++;
      } catch (err) {
        failures.push({ id: list.listId, table: "groceryLists", message: errorMessage(err) });
      }
    }

    if (failures.length > 0) return { ok: false, recipesUpdated, listsUpdated, failures, preexisting };

    const stillRecipes = (await this.scanRecipes())
      .filter((r) => (r.ingredients ?? []).some((l) => merged.has(l.ingredientId)))
      .map((r) => r.name);
    const stillLists = (await this.scanLists())
      .filter((l) => (l.items ?? []).some((i) => merged.has(i.ingredientId)))
      .map((l) => l.title);
    const still = [...stillRecipes, ...stillLists];
    if (still.length > 0) throw new ConflictException({ code: "STILL_REFERENCED", names: still });

    const aliases = new Set(survivor.aliases ?? []);
    for (const row of mergedRows) {
      aliases.add(row.nameLower || row.name.toLowerCase());
      const key = normalizeIngredientName(row.name);
      if (key) aliases.add(key);
      for (const a of row.aliases ?? []) aliases.add(a);
    }
    const mergedFrom = new Set([...(survivor.mergedFrom ?? []), ...mergedRows.map((r) => r.ingredientId)]);
    await this.ddb.update(this.table, { ingredientId: survivorId }, {
      aliases: [...aliases],
      mergedFrom: [...mergedFrom],
      updatedAt: now,
    });
    if (mergedRows.length > 0) {
      await this.ddb.batchDelete(this.table, mergedRows.map((r) => ({ ingredientId: r.ingredientId })));
    }
    return { ok: true, recipesUpdated, listsUpdated, removed: mergedRows.length, preexisting };
  }

  async importIngredients(rows: ImportIngredientRow[]): Promise<ImportIngredientsResult> {
    const existing = await this.getAll();
    const lookup = new IngredientLookup(existing);
    const now = new Date().toISOString();

    const toCreate: Ingredient[] = [];
    const toUpdate: Array<{ ingredientId: string; fields: Record<string, unknown> }> = [];
    const unmatched: string[] = [];

    for (const row of rows) {
      const name = row.nom.trim();
      const nameLower = name.toLowerCase();
      if (!nameLower) continue;

      const match = lookup.find(name);
      if (match) {
        if (PRICE_TO_QTY_UNIT[row.unite] !== PRICE_TO_QTY_UNIT[match.unit]) {
          unmatched.push(name);
          continue;
        }
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
          name,
          nameLower,
          price: row.prix_htva,
          unit: row.unite,
          supplier: row.fournisseur,
          comment: row.commentaire,
          createdAt: now,
          updatedAt: now,
        };
        toCreate.push(ingredient);
        lookup.add(ingredient);
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

    return { created: toCreate.length, updated: toUpdate.length, unmatched };
  }
}
