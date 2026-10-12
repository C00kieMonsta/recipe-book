import { ConflictException } from "@nestjs/common";
import type { AppSettings, CreateLedgerEntryRequest } from "@packages/types";
import { DdbService } from "../shared/ddb.service";
import { SettingsService } from "../settings/settings.service";
import { LedgerService } from "./ledger.service";

type Item = Record<string, unknown>;

class FakeDdb {
  tables: Record<string, Map<string, Item>> = {};
  private store(table: string) {
    return (this.tables[table] ??= new Map());
  }
  requireTable(name: string) { return name; }
  async get(table: string, key: Record<string, string>) {
    return this.store(table).get(Object.values(key)[0]) ?? null;
  }
  async put(table: string, item: Item) {
    const [pk] = Object.keys(item).filter((k) => k.endsWith("Id"));
    this.store(table).set(item[pk] as string, { ...item });
  }
  async update(table: string, key: Record<string, string>, fields: Item) {
    const id = Object.values(key)[0];
    const current = this.store(table).get(id);
    if (!current) throw new Error("ConditionalCheckFailedException");
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      if (v === null) delete current[k];
      else current[k] = v;
    }
  }
  async scanAll(table: string) { return [...this.store(table).values()].map((i) => ({ ...i })); }
  async delete(table: string, key: Record<string, string>) { this.store(table).delete(Object.values(key)[0]); }
  async batchWrite(table: string, items: Item[]) { for (const i of items) await this.put(table, i); }
  async batchDelete(table: string, keys: Record<string, string>[]) { for (const k of keys) await this.delete(table, k); }
}

class FakeSettings {
  settings: AppSettings = {
    settingsId: "global",
    recipeCategories: [],
    suppliers: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
    monthCloses: {},
  };
  async get() { return this.settings; }
  async update(fields: Partial<AppSettings>) {
    this.settings = { ...this.settings, ...fields, updatedAt: new Date().toISOString() };
    return this.settings;
  }
}

const sale = (overrides: Partial<CreateLedgerEntryRequest> = {}): CreateLedgerEntryRequest => ({
  book: "ventes",
  kind: "facture",
  date: "2026-10-05",
  label: "Buffet Dupont",
  totalTvac: 106,
  htva: 100,
  vatRate: 6,
  vatAmount: 6,
  paid: false,
  ...overrides,
} as CreateLedgerEntryRequest);

describe("LedgerService", () => {
  let ddb: FakeDdb;
  let settings: FakeSettings;
  let service: LedgerService;

  beforeEach(() => {
    ddb = new FakeDdb();
    settings = new FakeSettings();
    service = new LedgerService(ddb as unknown as DdbService, settings as unknown as SettingsService);
  });

  it("create computes ym from the date and defaults paid", async () => {
    const entry = await service.create(sale({ date: "2026-10-05" }));
    expect(entry.ym).toBe("2026-10");
    expect(entry.paid).toBe(false);
    expect(entry.entryId).toBeTruthy();
    expect(entry.createdAt).toBe(entry.updatedAt);
    const purchase = await service.create({
      book: "achats", kind: "mp", date: "2026-11-02", label: "Barn", totalTvac: 21.2, htva: 20, vatRate: 6, vatAmount: 1.2,
    });
    expect(purchase.ym).toBe("2026-11");
    expect(purchase.paid).toBe(false);
  });

  it("list filters by year and sorts by date then createdAt", async () => {
    await service.create(sale({ date: "2026-10-20", label: "b" }));
    await service.create(sale({ date: "2026-10-05", label: "a" }));
    await service.create(sale({ date: "2025-12-31", label: "old" }));
    const all = await service.list();
    expect(all.map((e) => e.label)).toEqual(["old", "a", "b"]);
    const year = await service.list("2026");
    expect(year.map((e) => e.label)).toEqual(["a", "b"]);
  });

  it("replace recomputes ym and keeps entryId and createdAt", async () => {
    const created = await service.create(sale({ date: "2026-10-05" }));
    const replaced = await service.replace(created.entryId, sale({ date: "2026-11-05", label: "Nouveau" }));
    expect(replaced.entryId).toBe(created.entryId);
    expect(replaced.createdAt).toBe(created.createdAt);
    expect(replaced.ym).toBe("2026-11");
    expect(replaced.label).toBe("Nouveau");
  });

  it("replace and remove return 409 LOCKED on a locked entry", async () => {
    const created = await service.create(sale());
    await service.lockMonth({ ym: "2026-10" });
    const replaceErr = await service.replace(created.entryId, sale({ label: "x" })).catch((e) => e);
    expect(replaceErr).toBeInstanceOf(ConflictException);
    expect((replaceErr as ConflictException).getResponse()).toMatchObject({ code: "LOCKED" });
    const removeErr = await service.remove(created.entryId).catch((e) => e);
    expect(removeErr).toBeInstanceOf(ConflictException);
    expect((removeErr as ConflictException).getResponse()).toMatchObject({ code: "LOCKED" });
    expect(await service.get(created.entryId)).not.toBeNull();
  });

  it("patch is allowed on a locked entry and only touches payment fields", async () => {
    const created = await service.create(sale());
    await service.lockMonth({ ym: "2026-10" });
    const patched = await service.patch(created.entryId, { paid: true, paymentMethod: "virement", paidAt: "2026-10-20" });
    expect(patched.paid).toBe(true);
    expect(patched.paymentMethod).toBe("virement");
    expect(patched.paidAt).toBe("2026-10-20");
    expect(patched.locked).toBe(true);
    expect(patched.label).toBe("Buffet Dupont");
  });

  it("unlockMonth appends the reason after the lock note", async () => {
    await service.create(sale({ date: "2026-10-05" }));
    await service.lockMonth({ ym: "2026-10", note: "clôture" });
    await service.unlockMonth({ ym: "2026-10", reason: "facture oubliée" });
    expect(settings.settings.monthCloses?.["2026-10"]?.note).toBe("clôture · Déverrouillé : facture oubliée");
  });

  it("create and replace into a locked month return 409 LOCKED", async () => {
    const nov = await service.create(sale({ date: "2026-11-05" }));
    await service.lockMonth({ ym: "2026-10" });
    const createErr = await service.create(sale({ date: "2026-10-20" })).catch((e) => e);
    expect(createErr).toBeInstanceOf(ConflictException);
    expect((createErr as ConflictException).getResponse()).toMatchObject({ code: "LOCKED" });
    const moveErr = await service.replace(nov.entryId, sale({ date: "2026-10-20" })).catch((e) => e);
    expect(moveErr).toBeInstanceOf(ConflictException);
    expect((await service.getOrFail(nov.entryId)).ym).toBe("2026-11");
    expect(await service.list()).toHaveLength(1);
    await service.unlockMonth({ ym: "2026-10", reason: "oubli" });
    expect((await service.create(sale({ date: "2026-10-20" }))).ym).toBe("2026-10");
  });

  it("remove deletes an unlocked entry", async () => {
    const created = await service.create(sale());
    await service.remove(created.entryId);
    expect(await service.get(created.entryId)).toBeNull();
  });

  it("lockMonth marks only the month's entries and writes monthCloses", async () => {
    const oct = await service.create(sale({ date: "2026-10-05" }));
    const nov = await service.create(sale({ date: "2026-11-05" }));
    const result = await service.lockMonth({ ym: "2026-10", mpSource: "saisi", rawMaterial: 250, note: "clôture" });
    expect(result).toEqual({ locked: 1 });
    expect((await service.getOrFail(oct.entryId)).locked).toBe(true);
    expect((await service.getOrFail(nov.entryId)).locked).toBeUndefined();
    const close = settings.settings.monthCloses?.["2026-10"];
    expect(close).toMatchObject({ mpSource: "saisi", rawMaterial: 250, note: "clôture" });
    expect(close?.lockedAt).toBeTruthy();
  });

  it("lockMonth defaults mpSource to calcule when nothing is stored", async () => {
    await service.create(sale());
    await service.lockMonth({ ym: "2026-10" });
    expect(settings.settings.monthCloses?.["2026-10"]?.mpSource).toBe("calcule");
  });

  it("unlockMonth restores the entries, clears lockedAt and keeps mpSource", async () => {
    const oct = await service.create(sale({ date: "2026-10-05" }));
    await service.lockMonth({ ym: "2026-10", mpSource: "achats" });
    const result = await service.unlockMonth({ ym: "2026-10", reason: "facture oubliée" });
    expect(result).toEqual({ unlocked: 1 });
    const stored = await service.getOrFail(oct.entryId);
    expect(stored.locked).toBeUndefined();
    expect("locked" in stored).toBe(false);
    const close = settings.settings.monthCloses?.["2026-10"];
    expect(close?.mpSource).toBe("achats");
    expect(close?.lockedAt).toBeUndefined();
    expect(close?.unlockedAt).toBeTruthy();
    expect(close?.note).toBe("Déverrouillé : facture oubliée");
    const replaced = await service.replace(oct.entryId, sale({ label: "après déverrouillage" }));
    expect(replaced.label).toBe("après déverrouillage");
  });
});
