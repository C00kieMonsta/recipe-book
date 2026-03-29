import { Controller, Get, Post, Patch, Delete, Param, Body, BadRequestException, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { createGroceryListSchema, updateGroceryListSchema } from "@packages/types";
import { GroceryListsService } from "./grocery-lists.service";

@UseGuards(AdminGuard)
@Controller("admin/grocery-lists")
export class GroceryListsController {
  constructor(private groceryLists: GroceryListsService) {}

  @Get()
  async list() {
    return this.groceryLists.getAll();
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return this.groceryLists.getOrFail(id);
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createGroceryListSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.groceryLists.create(parsed.data);
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: unknown) {
    const parsed = updateGroceryListSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.groceryLists.update(id, parsed.data);
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    await this.groceryLists.delete(id);
    return { ok: true };
  }
}
