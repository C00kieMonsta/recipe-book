import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  createLedgerEntrySchema,
  lockMonthSchema,
  patchLedgerEntrySchema,
  unlockMonthSchema,
} from "@packages/types";
import { AdminGuard } from "../auth/admin.guard";
import { LedgerService } from "./ledger.service";

@UseGuards(AdminGuard)
@Controller("admin/ledger")
export class LedgerController {
  constructor(private ledger: LedgerService) {}

  @Get()
  async list(@Query("year") year?: string) {
    return this.ledger.list(year || undefined);
  }

  @Post("lock")
  async lock(@Body() body: unknown) {
    const parsed = lockMonthSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.ledger.lockMonth(parsed.data);
  }

  @Post("unlock")
  async unlock(@Body() body: unknown) {
    const parsed = unlockMonthSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.ledger.unlockMonth(parsed.data);
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
