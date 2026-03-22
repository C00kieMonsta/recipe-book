import { Module } from "@nestjs/common";
import { RecipesController } from "./recipes.controller";
import { RecipesService } from "./recipes.service";
import { AuthModule } from "../auth/auth.module";
import { IngredientsModule } from "../ingredients/ingredients.module";

@Module({
  imports: [AuthModule, IngredientsModule],
  controllers: [RecipesController],
  providers: [RecipesService],
  exports: [RecipesService],
})
export class RecipesModule {}
