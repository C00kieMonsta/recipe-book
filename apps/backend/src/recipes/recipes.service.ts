import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Recipe, RecipeIngredient, Ingredient } from "@packages/types";
import { DdbService } from "../shared/ddb.service";
import { IngredientsService } from "../ingredients/ingredients.service";

@Injectable()
export class RecipesService {
  private get table() { return this.ddb.tables.recipes; }

  constructor(
    private ddb: DdbService,
    private ingredientsService: IngredientsService,
  ) {}

  async getAll(): Promise<Recipe[]> {
    const items = await this.ddb.scanAll(this.table);
    return items as unknown as Recipe[];
  }

  async get(recipeId: string): Promise<Recipe | null> {
    const item = await this.ddb.get(this.table, { recipeId });
    return item as Recipe | null;
  }

  async getOrFail(recipeId: string): Promise<Recipe> {
    const item = await this.get(recipeId);
    if (!item) throw new NotFoundException("Recipe not found");
    return item;
  }

  async create(data: Omit<Recipe, "recipeId" | "nameLower" | "createdAt" | "updatedAt">): Promise<Recipe> {
    const now = new Date().toISOString();
    const recipe: Recipe = {
      recipeId: randomUUID(),
      ...data,
      nameLower: data.name.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    };
    await this.ddb.put(this.table, recipe as unknown as Record<string, unknown>);
    return recipe;
  }

  async update(recipeId: string, fields: Partial<Recipe>): Promise<Recipe> {
    await this.getOrFail(recipeId);
    const updates: Record<string, unknown> = {
      ...fields,
      updatedAt: new Date().toISOString(),
    };
    if (fields.name) updates.nameLower = fields.name.toLowerCase();
    await this.ddb.update(this.table, { recipeId }, updates);
    return this.getOrFail(recipeId);
  }

  async delete(recipeId: string): Promise<void> {
    await this.ddb.delete(this.table, { recipeId });
  }

  async importRecipes(rows: ImportRecipeRow[]): Promise<{ created: number; skipped: number; unmatchedIngredients: string[] }> {
    const existing = await this.getAll();
    const existingByName = new Set(existing.map((r) => r.nameLower));

    const allIngredients = await this.ingredientsService.getAll();
    const ingByName = new Map<string, Ingredient>(
      allIngredients.map((i) => [i.nameLower, i]),
    );

    const now = new Date().toISOString();
    let created = 0;
    let skipped = 0;
    const unmatchedSet = new Set<string>();
    const toCreate: Recipe[] = [];

    for (const row of rows) {
      const name = row.name.trim();
      if (!name) continue;
      if (existingByName.has(name.toLowerCase())) { skipped++; continue; }

      const recipeIngredients: RecipeIngredient[] = [];
      for (const ri of row.ingredients || []) {
        const match = ingByName.get(ri.name.trim().toLowerCase());
        if (!match) { unmatchedSet.add(ri.name.trim()); continue; }
        recipeIngredients.push({
          ingredientId: match.ingredientId,
          qty: ri.qty,
          unit: (ri.unit || "g") as RecipeIngredient["unit"],
          lossPct: 0,
        });
      }

      const recipe: Recipe = {
        recipeId: randomUUID(),
        name,
        nameLower: name.toLowerCase(),
        type: row.type || "Buffet",
        portions: row.portions || 1,
        portionWeight: row.portionWeight || 150,
        description: row.description || "",
        techniques: [],
        ingredients: recipeIngredients,
        photos: [],
        pricing: {
          surPlace: { coef: row.coeffSP || 4, tva: row.tvaSP || 12 },
          takeAway: { coef: row.coeffTA || 3, tva: row.tvaTA || 6 },
          chosenPrice: { surPlace: row.prixTVACSP || 0, takeAway: row.prixTVACTA || 0 },
        },
        createdAt: now,
        updatedAt: now,
      };
      toCreate.push(recipe);
      existingByName.add(recipe.nameLower);
    }

    if (toCreate.length > 0) {
      await this.ddb.batchWrite(this.table, toCreate as unknown as Record<string, unknown>[]);
    }
    created = toCreate.length;

    return { created, skipped, unmatchedIngredients: [...unmatchedSet] };
  }
}

export interface ImportRecipeIngredient {
  name: string;
  qty: number;
  unit?: string;
}

export interface ImportRecipeRow {
  name: string;
  type?: string;
  portions?: number;
  portionWeight?: number;
  description?: string;
  ingredients?: ImportRecipeIngredient[];
  coeffSP?: number;
  coeffTA?: number;
  tvaSP?: number;
  tvaTA?: number;
  prixTVACSP?: number;
  prixTVACTA?: number;
}
