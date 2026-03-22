import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { SharedModule } from "./shared/shared.module";
import { IngredientsModule } from "./ingredients/ingredients.module";
import { RecipesModule } from "./recipes/recipes.module";
import { SettingsModule } from "./settings/settings.module";
import { EventsModule } from "./events/events.module";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [ConfigModule, SharedModule, IngredientsModule, RecipesModule, SettingsModule, EventsModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
