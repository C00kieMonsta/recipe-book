import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "./config/config.service";

// Served at /health for the EC2 check and at /api/health for the browser through the API distribution.
@Controller(["health", "api/health"])
export class HealthController {
  constructor(private config: ConfigService) {}

  @Get()
  check() {
    const { clients, ledger } = this.config.tables;
    return { status: "ok", tables: { clients: Boolean(clients), ledger: Boolean(ledger) } };
  }
}
