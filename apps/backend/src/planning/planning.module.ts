import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Module,
  Post,
  UseGuards,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  applyScheduleSchema,
  productionSchedule,
  scheduleOptionsSchema,
} from "@packages/types";
import type { ScheduleOptions } from "@packages/types";
import { AdminGuard } from "../auth/admin.guard";
import { AuthModule } from "../auth/auth.module";
import { EventsModule } from "../events/events.module";
import { EventsService } from "../events/events.service";
import { RecipesModule } from "../recipes/recipes.module";
import { RecipesService } from "../recipes/recipes.service";

@UseGuards(AdminGuard)
@Controller("admin/planning")
export class PlanningController {
  constructor(
    private events: EventsService,
    private recipes: RecipesService,
  ) {}
  private async calculate(options: ScheduleOptions) {
    const [events, recipes] = await Promise.all([
      this.events.getAll(),
      this.recipes.getAll(),
    ]);
    events.sort((a, b) => a.eventId.localeCompare(b.eventId));
    recipes.sort((a, b) => a.recipeId.localeCompare(b.recipeId));
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ options, events, recipes }))
      .digest("hex");
    return {
      events,
      fingerprint,
      ...productionSchedule(events, recipes, options),
    };
  }
  @Post("preview") async preview(@Body() body: unknown) {
    const parsed = scheduleOptionsSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const { events: _events, ...plan } = await this.calculate(parsed.data);
    return plan;
  }
  @Post("apply") async apply(@Body() body: unknown) {
    const parsed = applyScheduleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const plan = await this.calculate(parsed.data.options);
    if (plan.fingerprint !== parsed.data.fingerprint)
      throw new ConflictException(
        "Les données ont changé. Recalculez la proposition.",
      );
    const results: { eventId: string; ok: boolean; error?: string }[] = [];
    for (const eventId of new Set(plan.slots.map((slot) => slot.eventId))) {
      try {
        await this.events.applySchedule(
          eventId,
          plan.events.find((event) => event.eventId === eventId)!.updatedAt,
          plan.slots.filter((slot) => slot.eventId === eventId),
        );
        results.push({ eventId, ok: true });
      } catch (error) {
        results.push({
          eventId,
          ok: false,
          error:
            error instanceof Error ? error.message : "Échec de l'application",
        });
      }
    }
    return { results };
  }
}
@Module({
  imports: [AuthModule, EventsModule, RecipesModule],
  controllers: [PlanningController],
})
export class PlanningModule {}
