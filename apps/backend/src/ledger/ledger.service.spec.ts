import { BadRequestException, ConflictException } from "@nestjs/common";
import type { AppSettings, CreateLedgerEntryRequest, ImportLedgerRow } from "@packages/types";
import { DdbService } from "../shared/ddb.service";
import { SettingsService } from "../settings/settings.service";
import { LedgerController } from "./ledger.controller";
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

const invoice = (overrides: Partial<ImportLedgerRow> = {}): ImportLedgerRow => ({
  number: "INV/2026/0001",
  date: "2026-10-05",
  label: "Dupont SA",
  htva: 100,
  vatRate: 21,
  vatAmount: 21,
  totalTvac: 121,
  paid: false,
  ...overrides,
});

describe("LedgerService", () => {
  let ddb: FakeDdb;
  let settings: FakeSettings;
  let service: LedgerService;

  beforeEach(() => {
    ddb = new FakeDdb();
    settings = new FakeSettings();
    service = new LedgerService(ddb as unknown as DdbService, settings as unknown as SettingsService);
  });

  it("create stores ca_mensuel as paid", async () => {
    const entry = await service.create(sale({ kind: "ca_mensuel", date: "2026-10-31", label: "CA · Octobre 2026", paid: false }));
    expect(entry.paid).toBe(true);
    expect((await service.getOrFail(entry.entryId)).paid).toBe(true);
    const replaced = await service.replace(entry.entryId, sale({ kind: "ca_mensuel", date: "2026-10-31", paid: false }));
    expect(replaced.paid).toBe(true);
  });

  it("importInvoices creates one facture entry per new number", async () => {
    const result = await service.importInvoices([
      invoice({ number: "INV/2026/0001" }),
      invoice({ number: "INV/2026/0002", date: "2026-10-12", label: "Pirson", paid: true, paidAt: "2026-10-20", prestationType: "buffet" }),
    ]);
    expect(result).toEqual({ created: 2, updated: 0, skippedLocked: 0 });
    const all = await service.list();
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({
      book: "ventes", kind: "facture", imported: true, number: "INV/2026/0001", ym: "2026-10", label: "Dupont SA",
      htva: 100, vatRate: 21, vatAmount: 21, totalTvac: 121, paid: false,
    });
    expect(all[0].eventIds).toBeUndefined();
    expect(all[0].clientId).toBeUndefined();
    expect("paidAt" in all[0]).toBe(false);
    expect(all[1]).toMatchObject({ number: "INV/2026/0002", paid: true, paidAt: "2026-10-20", prestationType: "buffet" });
    expect(all[1].createdAt).toBe(all[1].updatedAt);
  });

  it("importInvoices updates a known number and creates nothing", async () => {
    const first = await service.importInvoices([invoice({ number: "INV/2026/0001" }), invoice({ number: "INV/2026/0002", date: "2026-10-12" })]);
    expect(first.created).toBe(2);
    const [stored] = await service.list();
    const again = await service.importInvoices([
      invoice({ number: "INV/2026/0001", date: "2026-10-07", label: "Dupont SA (corrigée)", htva: 200, vatAmount: 42, totalTvac: 242, paid: true, paidAt: "2026-10-30" }),
    ]);
    expect(again).toEqual({ created: 0, updated: 1, skippedLocked: 0 });
    const all = await service.list();
    expect(all).toHaveLength(2);
    const updated = await service.getOrFail(stored.entryId);
    expect(updated).toMatchObject({
      entryId: stored.entryId, createdAt: stored.createdAt, number: "INV/2026/0001", date: "2026-10-07",
      label: "Dupont SA (corrigée)", htva: 200, vatAmount: 42, totalTvac: 242, paid: true, paidAt: "2026-10-30", imported: true,
    });
  });

  it("importInvoices ignores a manual entry that carries the same number", async () => {
    const manual = await service.create(sale({ number: "INV/2026/0001" }));
    const result = await service.importInvoices([invoice({ number: "INV/2026/0001" })]);
    expect(result).toEqual({ created: 1, updated: 0, skippedLocked: 0 });
    expect((await service.getOrFail(manual.entryId)).imported).toBeUndefined();
    expect(await service.list()).toHaveLength(2);
  });

  it("importInvoices skips and counts a row in a locked month", async () => {
    await service.create(sale({ date: "2026-09-05" }));
    await service.lockMonth({ ym: "2026-09" });
    const result = await service.importInvoices([
      invoice({ number: "INV/2026/0001", date: "2026-09-20" }),
      invoice({ number: "INV/2026/0002", date: "2026-10-12" }),
    ]);
    expect(result).toEqual({ created: 1, updated: 0, skippedLocked: 1 });
    const all = await service.list();
    expect(all.filter((e) => e.imported)).toHaveLength(1);
    expect(all.find((e) => e.imported)?.number).toBe("INV/2026/0002");
  });

  it("import reports an invalid row and imports the others", async () => {
    const controller = new LedgerController(service);
    const result = await controller.import({
      rows: [
        invoice({ number: "INV/2026/0001" }),
        { ...invoice({ number: "INV/2026/0002" }), vatAmount: 5 },
        { ...invoice(), number: "" },
      ],
    });
    expect(result).toEqual({ created: 1, updated: 0, skippedLocked: 0, invalid: ["INV/2026/0002 : HTVA + TVA doit égaler TVAC", expect.stringMatching(/^ligne 3 : /)] });
    expect(await service.list()).toHaveLength(1);
    const empty = await controller.import({ rows: [] }).catch((e) => e);
    expect(empty).toBeInstanceOf(BadRequestException);
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
