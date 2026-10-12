import { Controller, Get, Post, Patch, Put, Delete, Param, Body, BadRequestException, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import {
  addEventLineSchema,
  createEventRequestSchema,
  patchEventLineSchema,
  putEventLinesSchema,
  updateEventRequestSchema,
} from "@packages/types";
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

  @Post(":id/lines")
  async addLine(@Param("id") id: string, @Body() body: unknown) {
    const parsed = addEventLineSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.events.addLine(id, parsed.data);
  }

  @Patch(":id/lines/:lineId")
  async patchLine(@Param("id") id: string, @Param("lineId") lineId: string, @Body() body: unknown) {
    const parsed = patchEventLineSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.events.patchLine(id, lineId, parsed.data);
  }

  @Put(":id/lines")
  async putLines(@Param("id") id: string, @Body() body: unknown) {
    const parsed = putEventLinesSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.events.putLines(id, parsed.data);
  }

  @Delete(":id/lines/:lineId")
  async removeLine(@Param("id") id: string, @Param("lineId") lineId: string) {
    return this.events.removeLine(id, lineId);
  }
}
