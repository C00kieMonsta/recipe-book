import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  BadRequestException,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AdminGuard } from "../auth/admin.guard";
import {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  addEventLineSchema,
  addEventTaskSchema,
  createEventRequestSchema,
  patchEventLineSchema,
  patchEventTaskSchema,
  putEventLinesSchema,
  renameAttachmentSchema,
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

  @Post(":id/tasks")
  async addTask(@Param("id") id: string, @Body() body: unknown) {
    const parsed = addEventTaskSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.events.addTask(id, parsed.data);
  }

  @Patch(":id/tasks/:taskId")
  async patchTask(@Param("id") id: string, @Param("taskId") taskId: string, @Body() body: unknown) {
    const parsed = patchEventTaskSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.events.patchTask(id, taskId, parsed.data);
  }

  @Delete(":id/tasks/:taskId")
  async removeTask(@Param("id") id: string, @Param("taskId") taskId: string) {
    return this.events.removeTask(id, taskId);
  }

  // A file over the size limit surfaces as 413 through Nest's multer mapping.
  @Post(":id/attachments")
  @UseInterceptors(FileInterceptor("file", {
    limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
    fileFilter: (_req, f, cb) => cb(null, f.mimetype in ATTACHMENT_TYPES),
  }))
  async addAttachment(@Param("id") id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("Fichier manquant ou format non pris en charge (PDF, image, Word, Excel ou texte)");
    }
    return this.events.addAttachment(id, file);
  }

  @Patch(":id/attachments/:attachmentId")
  async renameAttachment(@Param("id") id: string, @Param("attachmentId") attachmentId: string, @Body() body: unknown) {
    const parsed = renameAttachmentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.events.renameAttachment(id, attachmentId, parsed.data.name);
  }

  @Delete(":id/attachments/:attachmentId")
  async removeAttachment(@Param("id") id: string, @Param("attachmentId") attachmentId: string) {
    return this.events.removeAttachment(id, attachmentId);
  }

  @Get(":id/attachments/:attachmentId/url")
  async attachmentUrl(@Param("id") id: string, @Param("attachmentId") attachmentId: string) {
    return this.events.attachmentUrl(id, attachmentId);
  }
}
