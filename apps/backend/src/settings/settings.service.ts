import { Injectable } from "@nestjs/common";
import type { AppSettings } from "@packages/types";
import { DEFAULT_RECIPE_CATEGORIES } from "@packages/types";
import { DdbService } from "../shared/ddb.service";

const GLOBAL_ID = "global";

@Injectable()
export class SettingsService {
  private get table() { return this.ddb.tables.settings; }

  constructor(private ddb: DdbService) {}

  async get(): Promise<AppSettings> {
    const item = await this.ddb.get(this.table, { settingsId: GLOBAL_ID });
    if (item) return item as unknown as AppSettings;
    return {
      settingsId: GLOBAL_ID,
      recipeCategories: DEFAULT_RECIPE_CATEGORIES,
      updatedAt: new Date().toISOString(),
    };
  }

  async update(fields: Partial<Pick<AppSettings, "recipeCategories">>): Promise<AppSettings> {
    const current = await this.get();
    const updated: AppSettings = {
      ...current,
      ...fields,
      settingsId: GLOBAL_ID,
      updatedAt: new Date().toISOString(),
    };
    await this.ddb.put(this.table, updated as unknown as Record<string, unknown>);
    return updated;
  }
}
