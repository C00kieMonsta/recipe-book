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

  // Shallow merge: a record such as objectives is replaced whole by what the client sends.
  async update(fields: SettingsUpdate): Promise<AppSettings> {
    const current = await this.get();
    const given = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    const updated: AppSettings = {
      ...current,
      ...given,
      settingsId: GLOBAL_ID,
      updatedAt: new Date().toISOString(),
    };
    await this.ddb.put(this.table, updated as unknown as Record<string, unknown>);
    return updated;
  }
}
