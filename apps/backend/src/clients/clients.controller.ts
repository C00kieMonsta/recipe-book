import { Controller, Get, Post, Patch, Delete, Param, Body, BadRequestException, HttpCode, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import {
  createClientSchema,
  updateClientSchema,
  instantiateSchema,
  linkEventsSchema,
} from "@packages/types";
import { ClientsService } from "./clients.service";

@UseGuards(AdminGuard)
@Controller("admin/clients")
export class ClientsController {
  constructor(private clients: ClientsService) {}

  @Get()
  async list() {
    return this.clients.getAll();
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return this.clients.getOrFail(id);
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createClientSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.clients.create(parsed.data);
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: unknown) {
    const parsed = updateClientSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.clients.update(id, parsed.data);
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    await this.clients.delete(id);
    return { ok: true };
  }

  @Post(":id/instantiate")
  @HttpCode(200)
  async instantiate(@Param("id") id: string, @Body() body: unknown) {
    const parsed = instantiateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.clients.instantiate(id, parsed.data);
  }

  @Post(":id/link-events")
  @HttpCode(200)
  async linkEvents(@Param("id") id: string, @Body() body: unknown) {
    const parsed = linkEventsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.clients.linkEvents(id, parsed.data);
  }
}
