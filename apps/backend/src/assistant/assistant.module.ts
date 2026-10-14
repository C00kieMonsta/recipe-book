import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { EventsModule } from "../events/events.module";
import { IngredientsModule } from "../ingredients/ingredients.module";
import { OffersModule } from "../offers/offers.module";
import { RecipesModule } from "../recipes/recipes.module";
import { SettingsModule } from "../settings/settings.module";
import { AssistantController } from "./assistant.controller";
import { AssistantService } from "./assistant.service";
import { AssistantTools } from "./assistant.tools";

@Module({
  imports: [AuthModule, RecipesModule, IngredientsModule, EventsModule, ClientsModule, SettingsModule, OffersModule],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantTools],
})
export class AssistantModule {}
