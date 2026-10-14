import { Controller, Get, Post, Patch, Delete, Param, Body, BadRequestException, HttpCode, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AdminGuard } from "../auth/admin.guard";
import {
  createIngredientRequestSchema,
  importIngredientRowSchema,
  mergeIngredientsSchema,
  updateIngredientRequestSchema,
} from "@packages/types";

const importRowsSchema = z.array(importIngredientRowSchema).max(2000, "Maximum 2000 lignes par import");
import { IngredientsService } from "./ingredients.service";

@UseGuards(AdminGuard)
@Controller("admin/ingredients")
export class IngredientsController {
  constructor(private ingredients: IngredientsService) {}

  @Get()
  async list() {
    return this.ingredients.getAll();
  }

  @Get("duplicates")
  async duplicates() {
    return this.ingredients.duplicates();
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return this.ingredients.getOrFail(id);
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createIngredientRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.ingredients.create(parsed.data);
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: unknown) {
    const parsed = updateIngredientRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.ingredients.update(id, parsed.data);
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    await this.ingredients.delete(id);
    return { ok: true };
  }

  @Post("import")
  async importIngredients(@Body() body: unknown) {
    if (!Array.isArray(body)) throw new BadRequestException("Expected array of ingredient rows");
    const parsed = importRowsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const result = await this.ingredients.importIngredients(parsed.data);
    console.log(JSON.stringify({ action: "importIngredients", ...result }));
    return result;
  }

  @Post("merge")
  @HttpCode(200)
  async merge(@Body() body: unknown) {
    const parsed = mergeIngredientsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const result = await this.ingredients.merge(parsed.data.survivorId, parsed.data.mergedIds);
    console.log(JSON.stringify({ action: "mergeIngredients", survivorId: parsed.data.survivorId, ...result }));
    return result;
  }
}
