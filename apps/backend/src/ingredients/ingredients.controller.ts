import { Controller, Get, Post, Patch, Delete, Param, Body, BadRequestException, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { createIngredientRequestSchema, updateIngredientRequestSchema } from "@packages/types";
import { IngredientsService } from "./ingredients.service";

@UseGuards(AdminGuard)
@Controller("admin/ingredients")
export class IngredientsController {
  constructor(private ingredients: IngredientsService) {}

  @Get()
  async list() {
    return this.ingredients.getAll();
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
    const result = await this.ingredients.importIngredients(body);
    console.log(JSON.stringify({ action: "importIngredients", ...result }));
    return result;
  }

  @Post("deduplicate")
  async deduplicate() {
    const result = await this.ingredients.deduplicate();
    console.log(JSON.stringify({ action: "deduplicateIngredients", ...result }));
    return result;
  }
}
