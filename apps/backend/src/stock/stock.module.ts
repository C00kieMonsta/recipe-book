import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { IngredientsModule } from "../ingredients/ingredients.module";
import { RecipesModule } from "../recipes/recipes.module";
import { LedgerModule } from "../ledger/ledger.module";
import { SettingsModule } from "../settings/settings.module";
import { StockService } from "./stock.service";
import { StockController } from "./stock.controller";

@Module({
  imports: [
    AuthModule,
    IngredientsModule,
    RecipesModule,
    LedgerModule,
    SettingsModule,
  ],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
