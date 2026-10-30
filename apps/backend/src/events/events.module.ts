import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { AuthModule } from "../auth/auth.module";
import { RecipesModule } from "../recipes/recipes.module";

@Module({
  imports: [AuthModule, RecipesModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
