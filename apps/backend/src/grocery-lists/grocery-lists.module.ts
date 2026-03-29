import { Module } from "@nestjs/common";
import { GroceryListsController } from "./grocery-lists.controller";
import { GroceryListsService } from "./grocery-lists.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [GroceryListsController],
  providers: [GroceryListsService],
})
export class GroceryListsModule {}
