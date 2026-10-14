import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import type { InboxConfirmResult, InboxProposal, InboxUpload } from "@packages/types";
import { inboxConfirmSchema } from "@packages/types";
import { AdminGuard } from "../../auth/admin.guard";
import { INBOX_TYPES } from "./inbox.extract";
import { InboxService, MAX_INBOX_BYTES } from "./inbox.service";

const extractBodySchema = z.object({ inboxId: z.string().min(1) }).strict();

@UseGuards(AdminGuard)
@Controller("admin/ledger/inbox")
export class InboxController {
  constructor(private inbox: InboxService) {}

  // A file over the size limit surfaces as 413 through Nest's multer mapping.
  @Post("upload")
  @UseInterceptors(FileInterceptor("file", {
    limits: { fileSize: MAX_INBOX_BYTES, files: 1 },
    fileFilter: (_req, f, cb) => cb(null, Object.hasOwn(INBOX_TYPES, f.mimetype)),
  }))
  async upload(@UploadedFile() file?: Express.Multer.File): Promise<InboxUpload> {
    if (!file) throw new BadRequestException("Fichier manquant ou format non pris en charge (PDF, JPEG, PNG ou WebP)");
    return this.inbox.upload(file);
  }

  @Post("extract")
  @HttpCode(200)
  async extract(@Body() body: unknown): Promise<InboxProposal> {
    const parsed = extractBodySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.inbox.extract(parsed.data.inboxId);
  }

  @Post("confirm")
  @HttpCode(200)
  async confirm(@Body() body: unknown): Promise<{ results: InboxConfirmResult[] }> {
    const parsed = inboxConfirmSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return { results: await this.inbox.confirm(parsed.data.items) };
  }

  @Delete(":inboxId")
  async remove(@Param("inboxId") inboxId: string): Promise<{ ok: true }> {
    return this.inbox.remove(inboxId);
  }
}
