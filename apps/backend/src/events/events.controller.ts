import { Controller, Get, Post, Patch, Delete, Param, Body, BadRequestException, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { createEventRequestSchema, updateEventRequestSchema } from "@packages/types";
import { EventsService } from "./events.service";

@UseGuards(AdminGuard)
@Controller("admin/events")
export class EventsController {
  constructor(private events: EventsService) {}

  @Get()
  async list() {
    return this.events.getAll();
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return this.events.getOrFail(id);
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createEventRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.events.create(parsed.data);
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: unknown) {
    const parsed = updateEventRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.events.update(id, parsed.data);
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    await this.events.delete(id);
    return { ok: true };
  }
}
