import { Module } from "@nestjs/common";
import { OffersController } from "./offers.controller";
import { OffersService } from "./offers.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [OffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
