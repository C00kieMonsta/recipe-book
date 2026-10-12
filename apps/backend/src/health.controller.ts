import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "./config/config.service";

@Controller("health")
export class HealthController {
  constructor(private config: ConfigService) {}

  @Get()
  check() {
    const { clients, ledger } = this.config.tables;
    return { status: "ok", tables: { clients: Boolean(clients), ledger: Boolean(ledger) } };
  }
}
