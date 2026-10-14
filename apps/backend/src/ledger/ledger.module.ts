import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SettingsModule } from "../settings/settings.module";
import { InboxController } from "./inbox/inbox.controller";
import { InboxService } from "./inbox/inbox.service";
import { LedgerController } from "./ledger.controller";
import { LedgerService } from "./ledger.service";

@Module({
  imports: [AuthModule, SettingsModule],
  controllers: [LedgerController, InboxController],
  providers: [LedgerService, InboxService],
  exports: [LedgerService],
})
export class LedgerModule {}
