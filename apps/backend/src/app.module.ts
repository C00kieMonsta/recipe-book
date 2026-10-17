import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { SharedModule } from "./shared/shared.module";
import { IngredientsModule } from "./ingredients/ingredients.module";
import { RecipesModule } from "./recipes/recipes.module";
import { SettingsModule } from "./settings/settings.module";
import { EventsModule } from "./events/events.module";
import { GroceryListsModule } from "./grocery-lists/grocery-lists.module";
import { ClientsModule } from "./clients/clients.module";
import { LedgerModule } from "./ledger/ledger.module";
import { OffersModule } from "./offers/offers.module";
import { OfferDocumentsModule } from "./offer-documents/offer-documents.module";
import { AuthModule } from "./auth/auth.module";
import { AssistantModule } from "./assistant/assistant.module";
import { BackupModule } from "./backup/backup.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [ConfigModule, SharedModule, IngredientsModule, RecipesModule, SettingsModule, EventsModule, GroceryListsModule, ClientsModule, LedgerModule, OffersModule, OfferDocumentsModule, AuthModule, AssistantModule, BackupModule],
  controllers: [HealthController],
})
export class AppModule {}
