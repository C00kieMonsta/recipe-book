import { Controller, Get, Patch, Body, BadRequestException, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { updateSettingsRequestSchema } from "@packages/types";
import { SettingsService } from "./settings.service";

@UseGuards(AdminGuard)
@Controller("admin/settings")
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get()
  async get() {
    return this.settings.get();
  }

  @Patch()
  async update(@Body() body: unknown) {
    const parsed = updateSettingsRequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.settings.update(parsed.data);
  }
}
