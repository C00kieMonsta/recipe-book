import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { AuthModule } from "../auth/auth.module";
import { RecipesModule } from "../recipes/recipes.module";
import { StockModule } from "../stock/stock.module";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [AuthModule, RecipesModule, StockModule, SettingsModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
