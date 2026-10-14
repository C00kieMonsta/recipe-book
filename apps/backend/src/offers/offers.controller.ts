import { Controller, Get, Post, Patch, Delete, Param, Body, BadRequestException, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { createOfferSchema, updateOfferSchema } from "@packages/types";
import { OffersService } from "./offers.service";

@UseGuards(AdminGuard)
@Controller("admin/offers")
export class OffersController {
  constructor(private offers: OffersService) {}

  @Get()
  async list() {
    return this.offers.getAll();
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createOfferSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.offers.create(parsed.data);
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: unknown) {
    const parsed = updateOfferSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.offers.update(id, parsed.data);
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    await this.offers.delete(id);
    return { ok: true };
  }
}
