import { Injectable } from "@nestjs/common";
import type { AppSettings } from "@packages/types";
import {
  DEFAULT_COURSES,
  DEFAULT_PRESTATION_TYPES,
  DEFAULT_RECIPE_CATEGORIES,
  DEFAULT_SUPPLIERS,
} from "@packages/types";
import { DdbService } from "../shared/ddb.service";

const GLOBAL_ID = "global";

export type SettingsUpdate = Partial<Omit<AppSettings, "settingsId" | "updatedAt">>;

// company and ledgerStartYm have no default and stay absent until set.
function withDefaults(stored: Partial<AppSettings>): AppSettings {
  return {
    ...stored,
    settingsId: GLOBAL_ID,
    recipeCategories: stored.recipeCategories ?? DEFAULT_RECIPE_CATEGORIES,
    suppliers: stored.suppliers ?? DEFAULT_SUPPLIERS,
    courses: stored.courses ?? DEFAULT_COURSES,
    prestationTypes: stored.prestationTypes ?? DEFAULT_PRESTATION_TYPES,
    fixedCharges: stored.fixedCharges ?? [],
    objectives: stored.objectives ?? {},
    yearActuals: stored.yearActuals ?? {},
    monthCloses: stored.monthCloses ?? {},
    ignoredDuplicateGroups: stored.ignoredDuplicateGroups ?? [],
    updatedAt: stored.updatedAt ?? new Date().toISOString(),
  };
}

@Injectable()
export class SettingsService {
  private get table() { return this.ddb.tables.settings; }

  constructor(private ddb: DdbService) {}

  async get(): Promise<AppSettings> {
    const item = await this.ddb.get(this.table, { settingsId: GLOBAL_ID });
    return withDefaults((item ?? {}) as Partial<AppSettings>);
  }

  // Writes only the keys given, so a save from one tab keeps sections saved by another.
  // A record such as objectives is still replaced whole by what the client sends.
  async update(fields: SettingsUpdate): Promise<AppSettings> {
    const given = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    const updatedAt = new Date().toISOString();
    const key = { settingsId: GLOBAL_ID };
    const current = await this.ddb.get(this.table, key);
    if (!current) {
      const item = withDefaults({ ...given, updatedAt }) as unknown as Record<string, unknown>;
      try {
        await this.ddb.putIfAbsent(this.table, item, "settingsId");
        return this.get();
      } catch (err) {
        if ((err as { name?: string }).name !== "ConditionalCheckFailedException") throw err;
      }
    }
    await this.ddb.update(this.table, key, { ...given, updatedAt });
    return this.get();
  }
}
