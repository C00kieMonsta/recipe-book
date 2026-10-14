import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Res, BadRequestException, UseGuards, UseInterceptors, UploadedFile } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { AdminGuard } from "../auth/admin.guard";
import { z } from "zod";
import { createRecipeRequestSchema, importRecipeIngredientSchema, updateRecipeRequestSchema } from "@packages/types";
import { RecipesService, type ImportRecipeRow } from "./recipes.service";
import { S3Service } from "../shared/s3.service";
import { randomUUID } from "crypto";
import { extname } from "path";

const importIngredientsSchema = z.array(importRecipeIngredientSchema);

const parseNum = (v: unknown): number => {
  if (v === undefined || v === null || v === "") return 0;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
};

function mapRow(row: Record<string, string>): ImportRecipeRow | null {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const val = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
      if (val !== undefined && val !== "") return val;
    }
    return undefined;
  };

  const name = (get("recette", "nom_recette", "nom", "name", "Recette", "Nom") || "").trim();
  if (!name) return null;

  return {
    name,
    type: get("type", "Type") || "Buffet",
    portions: parseNum(get("portions", "Portions")) || 1,
    portionWeight: parseNum(get("poids_portion", "poids", "portion_weight", "Poids")) || 150,
    description: (get("description", "Description") || "").trim(),
    coeffSP: parseNum(get("coeff_sur_place", "coeff_sp", "Coeff Sur Place", "coeffsp")) || 4,
    coeffTA: parseNum(get("coeff_take_away", "coeff_ta", "Coeff Take Away", "coeffta")) || 3,
    tvaSP: parseNum(get("tva_sp", "TVA SP", "tvasp", "TVA Sur Place")) || 12,
    tvaTA: parseNum(get("tva_ta", "TVA TA", "tvata", "TVA Take Away")) || 6,
    prixTVACSP: parseNum(get("prix_tvac_sp", "Prix TVAC SP", "prix_choisi_sp", "prixtvacsp")),
    prixTVACTA: parseNum(get("prix_tvac_ta", "Prix TVAC TA", "prix_choisi_ta", "prixtvacta")),
  };
}

function mapJsonRow(row: Record<string, unknown>): ImportRecipeRow | null {
  const name = (String(row.name || "")).trim();
  if (!name) return null;
  const ingredients = importIngredientsSchema.safeParse(row.ingredients ?? []);
  if (!ingredients.success) throw new BadRequestException({ recipe: name, issues: ingredients.error.issues });
  return {
    name,
    type: String(row.type || "Buffet"),
    portions: Number(row.portions) || 1,
    portionWeight: Number(row.portionWeight) || 150,
    description: String(row.description || ""),
    ingredients: ingredients.data,
    coeffSP: Number(row.coeffSP) || 4,
    coeffTA: Number(row.coeffTA) || 3,
    tvaSP: Number(row.tvaSP) || 12,
    tvaTA: Number(row.tvaTA) || 6,
    prixTVACSP: Number(row.prixTVACSP) || 0,
    prixTVACTA: Number(row.prixTVACTA) || 0,
  };
}

@UseGuards(AdminGuard)
@Controller("admin/recipes")
export class RecipesController {
  constructor(
    private recipes: RecipesService,
    private s3: S3Service,
  ) {}

  @Get()
  async list() {
    return this.recipes.getAll();
  }

  @Get("photo")
  async getPhoto(@Query("key") key: string, @Res() res: Response) {
    if (!key?.startsWith("recipe-photos/")) throw new BadRequestException("Invalid key");
    const { body, contentType } = await this.s3.get(key);
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(body);
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return this.recipes.getOrFail(id);
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createRecipeRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.recipes.create(parsed.data);
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: unknown) {
    const parsed = updateRecipeRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.recipes.update(id, parsed.data);
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    await this.recipes.delete(id);
    return { ok: true };
  }

  @Post("import")
  async importRecipes(@Body() body: unknown) {
    if (!Array.isArray(body)) throw new BadRequestException("Expected array of recipe rows");
    if (body.length > 2000) throw new BadRequestException("Maximum 2000 lignes par import");
    const rows = (body as Record<string, unknown>[]).map((row) => {
      if (row.ingredients && Array.isArray(row.ingredients)) return mapJsonRow(row);
      return mapRow(row as Record<string, string>);
    }).filter((r): r is ImportRecipeRow => r !== null);
    const result = await this.recipes.importRecipes(rows);
    console.log(JSON.stringify({ action: "importRecipes", ...result }));
    return result;
  }

  @Post("upload-photo")
  @UseInterceptors(FileInterceptor("file", {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (_req, f, cb) => cb(null, /^image\/(jpeg|png|webp|heic)$/.test(f.mimetype)),
  }))
  async uploadPhoto(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException("Photo manquante ou format non pris en charge (JPEG, PNG, WebP ou HEIC)");

    // The client file name never reaches S3; only a sanitised extension does.
    const ext = extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, "");
    const key = `recipe-photos/${randomUUID()}${ext}`;
    await this.s3.upload(key, file.buffer, file.mimetype);
    const url = await this.s3.presignedUrl(key);

    return { key, url };
  }
}
