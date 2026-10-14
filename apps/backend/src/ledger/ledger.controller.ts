import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import {
  createLedgerEntrySchema,
  importLedgerRowSchema,
  lockMonthSchema,
  patchLedgerEntrySchema,
  unlockMonthSchema,
} from "@packages/types";
import type { ImportLedgerRow } from "@packages/types";
import { AdminGuard } from "../auth/admin.guard";
import { LedgerService } from "./ledger.service";

const yearQuerySchema = z.string().regex(/^\d{4}$/).optional();
// Rows are checked one by one so a bad row is reported instead of refusing the whole file.
const importEnvelopeSchema = z.object({ rows: z.array(z.unknown()).min(1).max(2000) }).strict();

export interface ImportLedgerResponse {
  created: number;
  updated: number;
  skippedLocked: number;
  invalid: string[];
}

@UseGuards(AdminGuard)
@Controller("admin/ledger")
export class LedgerController {
  constructor(private ledger: LedgerService) {}

  @Get()
  async list(@Query("year") year?: string) {
    const parsed = yearQuerySchema.safeParse(year || undefined);
    if (!parsed.success) throw new BadRequestException("year doit être une année sur 4 chiffres");
    return this.ledger.list(parsed.data);
  }

  @Post("lock")
  @HttpCode(200)
  async lock(@Body() body: unknown) {
    const parsed = lockMonthSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.ledger.lockMonth(parsed.data);
  }

  @Post("unlock")
  @HttpCode(200)
  async unlock(@Body() body: unknown) {
    const parsed = unlockMonthSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.ledger.unlockMonth(parsed.data);
  }

  @Post("import")
  @HttpCode(200)
  async import(@Body() body: unknown): Promise<ImportLedgerResponse> {
    const envelope = importEnvelopeSchema.safeParse(body);
    if (!envelope.success) throw new BadRequestException(envelope.error.issues);
    const rows: ImportLedgerRow[] = [];
    const invalid: string[] = [];
    envelope.data.rows.forEach((raw, i) => {
      const parsed = importLedgerRowSchema.safeParse(raw);
      if (parsed.success) {
        rows.push(parsed.data);
        return;
      }
      const number = (raw as { number?: unknown } | null)?.number;
      const ref = typeof number === "string" && number.trim() ? number.trim() : `ligne ${i + 1}`;
      invalid.push(`${ref} : ${parsed.error.issues[0]?.message ?? "ligne invalide"}`);
    });
    const result = rows.length
      ? await this.ledger.importInvoices(rows)
      : { created: 0, updated: 0, skippedLocked: 0 };
    return { ...result, invalid };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return this.ledger.getOrFail(id);
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createLedgerEntrySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.ledger.create(parsed.data);
  }

  @Put(":id")
  async replace(@Param("id") id: string, @Body() body: unknown) {
    const parsed = createLedgerEntrySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.ledger.replace(id, parsed.data);
  }

  @Patch(":id")
  async patch(@Param("id") id: string, @Body() body: unknown) {
    const parsed = patchLedgerEntrySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.ledger.patch(id, parsed.data);
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.ledger.remove(id);
    return { ok: true };
  }
}
