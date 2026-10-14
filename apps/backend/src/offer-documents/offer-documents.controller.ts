import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { createOfferDocumentSchema, duplicateOfferDocumentSchema, updateOfferDocumentSchema } from "@packages/types";
import { AdminGuard } from "../auth/admin.guard";
import { OfferDocumentsService } from "./offer-documents.service";

@UseGuards(AdminGuard)
@Controller("admin/offer-documents")
export class OfferDocumentsController {
  constructor(private documents: OfferDocumentsService) {}

  @Get()
  async list() {
    return this.documents.getAll();
  }

  @Post("import-2026")
  async import2026() {
    return this.documents.importFixture();
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createOfferDocumentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.documents.create(parsed.data);
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return this.documents.get(id);
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: unknown) {
    const parsed = updateOfferDocumentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.documents.update(id, parsed.data);
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    await this.documents.delete(id);
    return { ok: true };
  }

  @Post(":id/duplicate")
  async duplicate(@Param("id") id: string, @Body() body: unknown) {
    const parsed = duplicateOfferDocumentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.documents.duplicate(id, parsed.data);
  }

  @Post(":id/sections/:sectionId/offer")
  async costSection(@Param("id") id: string, @Param("sectionId") sectionId: string) {
    return this.documents.costSection(id, sectionId);
  }
}
