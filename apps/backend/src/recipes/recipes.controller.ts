import { Controller, Get, Post, Patch, Delete, Param, Body, BadRequestException, UseGuards, UseInterceptors, UploadedFile } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AdminGuard } from "../auth/admin.guard";
import { createRecipeRequestSchema, updateRecipeRequestSchema } from "@packages/types";
import { RecipesService, type ImportRecipeRow, type ImportRecipeIngredient } from "./recipes.service";
import { S3Service } from "../shared/s3.service";
import { randomUUID } from "crypto";

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
  return {
    name,
    type: String(row.type || "Buffet"),
    portions: Number(row.portions) || 1,
    portionWeight: Number(row.portionWeight) || 150,
    description: String(row.description || ""),
    ingredients: (row.ingredients as ImportRecipeIngredient[]) || [],
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
    const rows = (body as Record<string, unknown>[]).map((row) => {
      if (row.ingredients && Array.isArray(row.ingredients)) return mapJsonRow(row);
      return mapRow(row as Record<string, string>);
    }).filter((r): r is ImportRecipeRow => r !== null);
    const result = await this.recipes.importRecipes(rows);
    console.log(JSON.stringify({ action: "importRecipes", ...result }));
    return result;
  }

  @Post("upload-photo")
  @UseInterceptors(FileInterceptor("file"))
  async uploadPhoto(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file uploaded");
    if (!file.mimetype.startsWith("image/")) throw new BadRequestException("File must be an image");

    const key = `recipe-photos/${randomUUID()}-${file.originalname}`;
    await this.s3.upload(key, file.buffer, file.mimetype);
    const url = await this.s3.presignedUrl(key);

    return { key, url };
  }
}
