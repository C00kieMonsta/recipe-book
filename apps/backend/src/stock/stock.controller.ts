import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { AppEvent } from "@packages/types";
import {
  stockMovementRequestSchema,
  stockReceiptRequestSchema,
} from "@packages/types";
import { AdminGuard } from "../auth/admin.guard";
import { DdbService } from "../shared/ddb.service";
import { StockService } from "./stock.service";

@UseGuards(AdminGuard)
@Controller("admin/stock")
export class StockController {
  constructor(
    private stock: StockService,
    private ddb: DdbService,
  ) {}
  @Get() overview() {
    return this.stock.overview();
  }
  @Post("movements") async move(@Body() body: unknown) {
    const parsed = stockMovementRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.stock.move(parsed.data);
  }
  @Post("receipts") async receive(@Body() body: unknown) {
    const parsed = stockReceiptRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.stock.receive(parsed.data);
  }
  @Post("events/:id/consume") async consume(@Param("id") id: string) {
    const event = await this.ddb.get(this.ddb.tables.events, { eventId: id });
    if (!event) throw new NotFoundException("Événement introuvable.");
    const balances = await this.stock.consume(event as unknown as AppEvent);
    await this.ddb.update(
      this.ddb.tables.events,
      { eventId: id },
      { stockConsumption: { state: "done", at: new Date().toISOString() } },
    );
    return balances;
  }
}
