import { ConflictException, Injectable } from "@nestjs/common";
import type { AppSettings } from "@packages/types";
import { DEFAULT_PRESTATION_TYPES, DEFAULT_SUPPLIERS, upgradeCourses } from "@packages/types";
import { DdbService, UpdateOptions } from "../shared/ddb.service";

const GLOBAL_ID = "global";

export type SettingsUpdate = Partial<Omit<AppSettings, "settingsId" | "updatedAt">> & { updatedAt?: string };

const isConditionFailure = (err: unknown) => (err as { name?: string }).name === "ConditionalCheckFailedException";

// Legacy rows have no updatedAt, so the guard is a presence check rather than an equality on the stamp get() fabricates.
const guardFor = (current: { updatedAt?: unknown }): UpdateOptions =>
  typeof current.updatedAt === "string"
    ? { condition: "#ua = :expected", names: { "#ua": "updatedAt" }, values: { ":expected": current.updatedAt } }
    : { condition: "attribute_not_exists(#ua)", names: { "#ua": "updatedAt" } };

// company and ledgerStartYm have no default and stay absent until set.
// A legacy courses list is served upgraded and recipeCategories is served equal to courses; nothing is written until the next save.
function withDefaults(stored: Partial<AppSettings>): AppSettings {
  const courses = upgradeCourses(stored.courses);
  return {
    ...stored,
    settingsId: GLOBAL_ID,
    recipeCategories: courses,
    suppliers: stored.suppliers ?? DEFAULT_SUPPLIERS,
    courses,
    invoicing: stored.invoicing ?? "app",
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
  // A client that sends the updatedAt it loaded gets 409 SETTINGS_CHANGED when the document moved since; scripts that send none write unguarded.
  async update(fields: SettingsUpdate): Promise<AppSettings> {
    const { updatedAt: expected, ...rest } = fields;
    const given = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    // Served as an alias of courses, so an old client that still sends it writes nothing for that key.
    delete given.recipeCategories;
    const updatedAt = new Date().toISOString();
    const key = { settingsId: GLOBAL_ID };
    const current = await this.ddb.get(this.table, key);
    if (!current) {
      const item = withDefaults({ ...given, updatedAt }) as unknown as Record<string, unknown>;
      try {
        await this.ddb.putIfAbsent(this.table, item, "settingsId");
        return this.get();
      } catch (err) {
        if (!isConditionFailure(err)) throw err;
      }
    }
    const stored = current ?? {};
    if (expected !== undefined && typeof stored.updatedAt === "string" && expected !== stored.updatedAt) {
      throw new ConflictException({ code: "SETTINGS_CHANGED" });
    }
    const guard = expected === undefined ? {} : guardFor(stored);
    try {
      await this.ddb.update(this.table, key, { ...given, updatedAt }, guard);
    } catch (err) {
      if (isConditionFailure(err)) throw new ConflictException({ code: "SETTINGS_CHANGED" });
      throw err;
    }
    return this.get();
  }
}
