import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OffersModule } from "../offers/offers.module";
import { SettingsModule } from "../settings/settings.module";
import { OfferDocumentsController } from "./offer-documents.controller";
import { OfferDocumentsService } from "./offer-documents.service";

@Module({
  imports: [AuthModule, OffersModule, SettingsModule],
  controllers: [OfferDocumentsController],
  providers: [OfferDocumentsService],
  exports: [OfferDocumentsService],
})
export class OfferDocumentsModule {}
