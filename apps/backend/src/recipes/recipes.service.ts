import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { ImportRecipeIngredient, Recipe, RecipeIngredient } from "@packages/types";
import { aliasCategory, recipeCategoryOf } from "@packages/types";
import { DdbService } from "../shared/ddb.service";
import { S3Service } from "../shared/s3.service";
import { IngredientLookup, IngredientsService } from "../ingredients/ingredients.service";

@Injectable()
export class RecipesService {
  private get table() { return this.ddb.tables.recipes; }

  constructor(
    private ddb: DdbService,
    private s3: S3Service,
    private ingredientsService: IngredientsService,
  ) {}

  private async signPhotos(recipe: Recipe): Promise<Recipe> {
    if (!recipe.photos?.length) return recipe;
    const signed = await Promise.all(
      recipe.photos.map(async (p) => ({ ...p, url: await this.s3.presignedUrl(p.key) })),
    );
    return { ...recipe, photos: signed };
  }

  // Served shape: the stored fields plus the category derived from the legacy ones when not stored yet.
  private serve(stored: Recipe): Promise<Recipe> {
    return this.signPhotos({ ...stored, category: recipeCategoryOf(stored) });
  }

  async getAll(): Promise<Recipe[]> {
    const items = await this.ddb.scanAll(this.table);
    const recipes = items as unknown as Recipe[];
    return Promise.all(recipes.map((r) => this.serve(r)));
  }

  async getPreparationDefinitions(recipeIds: string[]): Promise<Pick<Recipe, "recipeId" | "name" | "preparations">[]> {
    const uniqueIds = [...new Set(recipeIds)];
    const items = await Promise.all(uniqueIds.map((recipeId) => this.ddb.get(this.table, { recipeId })));
    return items.flatMap((item) => {
      if (!item) return [];
      const recipe = item as unknown as Recipe;
      return [{ recipeId: recipe.recipeId, name: recipe.name, preparations: recipe.preparations ?? [] }];
    });
  }

  async get(recipeId: string): Promise<Recipe | null> {
    const item = await this.ddb.get(this.table, { recipeId });
    if (!item) return null;
    return this.serve(item as unknown as Recipe);
  }

  async getOrFail(recipeId: string): Promise<Recipe> {
    const item = await this.get(recipeId);
    if (!item) throw new NotFoundException("Recipe not found");
    return item;
  }

  async create(data: Omit<Recipe, "recipeId" | "nameLower" | "createdAt" | "updatedAt">): Promise<Recipe> {
    const now = new Date().toISOString();
    const { defaultCourse, ...rest } = data;
    const category = data.category ? aliasCategory(data.category) : recipeCategoryOf({ type: data.type, defaultCourse });
    const recipe: Recipe = {
      recipeId: randomUUID(),
      ...rest,
      category,
      type: category,
      nameLower: data.name.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    };
    await this.ddb.put(this.table, recipe as unknown as Record<string, unknown>);
    return recipe;
  }

  async update(recipeId: string, fields: Partial<Recipe>): Promise<Recipe> {
    await this.getOrFail(recipeId);
    const { defaultCourse: _dropped, ...rest } = fields;
    const updates: Record<string, unknown> = {
      ...rest,
      updatedAt: new Date().toISOString(),
    };
    if (fields.name) updates.nameLower = fields.name.toLowerCase();
    // A category drives both keys; a bare type from an old client is mapped into both. Legacy names are aliased first.
    const category = fields.category
      ? aliasCategory(fields.category)
      : fields.type ? recipeCategoryOf({ type: fields.type }) : undefined;
    if (category) {
      updates.category = category;
      updates.type = category;
    }
    await this.ddb.update(this.table, { recipeId }, updates);
    return this.getOrFail(recipeId);
  }

  async delete(recipeId: string): Promise<void> {
    await this.ddb.delete(this.table, { recipeId });
  }

  async importRecipes(rows: ImportRecipeRow[]): Promise<{ created: number; skipped: number; unmatchedIngredients: string[] }> {
    const existing = await this.getAll();
    const existingByName = new Set(existing.map((r) => r.nameLower));

    const ingByName = new IngredientLookup(await this.ingredientsService.getAll());

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
        const match = ingByName.find(ri.name);
        if (!match) { unmatchedSet.add(ri.name.trim()); continue; }
        recipeIngredients.push({
          ingredientId: match.ingredientId,
          qty: ri.qty,
          unit: ri.unit ?? "g",
          lossPct: 0,
        });
      }

      const category = row.category?.trim() ? aliasCategory(row.category.trim()) : recipeCategoryOf({ type: row.type || "Buffet" });
      const recipe: Recipe = {
        recipeId: randomUUID(),
        name,
        nameLower: name.toLowerCase(),
        category,
        type: category,
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

export interface ImportRecipeRow {
  name: string;
  type?: string;
  // Wins over type when present (the CSV « categorie » column).
  category?: string;
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
