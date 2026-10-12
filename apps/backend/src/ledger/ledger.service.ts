import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type {
  CreateLedgerEntryRequest,
  LedgerEntry,
  LockMonthRequest,
  MonthClose,
  PatchLedgerEntryRequest,
  UnlockMonthRequest,
} from "@packages/types";
import { DdbService } from "../shared/ddb.service";
import { SettingsService } from "../settings/settings.service";

const LOCKED = { code: "LOCKED", message: "Mois verrouillé" };

@Injectable()
export class LedgerService {
  // Resolved per call so a missing table fails the request, not the boot.
  private get table() { return this.ddb.requireTable("ledger"); }

  constructor(private ddb: DdbService, private settings: SettingsService) {}

  async list(year?: string): Promise<LedgerEntry[]> {
    const items = (await this.ddb.scanAll(this.table)) as unknown as LedgerEntry[];
    const selected = year ? items.filter((e) => e.ym.startsWith(year)) : items;
    return selected.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  }

  async get(entryId: string): Promise<LedgerEntry | null> {
    const item = await this.ddb.get(this.table, { entryId });
    return item as LedgerEntry | null;
  }

  async getOrFail(entryId: string): Promise<LedgerEntry> {
    const item = await this.get(entryId);
    if (!item) throw new NotFoundException("Écriture introuvable");
    return item;
  }

  async create(body: CreateLedgerEntryRequest): Promise<LedgerEntry> {
    const now = new Date().toISOString();
    const entry: LedgerEntry = {
      ...body,
      entryId: randomUUID(),
      ym: body.date.slice(0, 7),
      paid: body.book === "ventes" ? body.paid : false,
      createdAt: now,
      updatedAt: now,
    };
    await this.ddb.put(this.table, entry as unknown as Record<string, unknown>);
    return entry;
  }

  async replace(entryId: string, body: CreateLedgerEntryRequest): Promise<LedgerEntry> {
    const stored = await this.getOrFail(entryId);
    if (stored.locked) throw new ConflictException(LOCKED);
    const entry: LedgerEntry = {
      ...body,
      entryId: stored.entryId,
      ym: body.date.slice(0, 7),
      paid: body.book === "ventes" ? body.paid : false,
      createdAt: stored.createdAt,
      updatedAt: new Date().toISOString(),
      ...(stored.locked !== undefined && { locked: stored.locked }),
    };
    await this.ddb.put(this.table, entry as unknown as Record<string, unknown>);
    return entry;
  }

  async patch(entryId: string, body: PatchLedgerEntryRequest): Promise<LedgerEntry> {
    await this.getOrFail(entryId);
    const { paid, paymentMethod, paidAt, description } = body;
    await this.ddb.update(
      this.table,
      { entryId },
      { paid, paymentMethod, paidAt, description, updatedAt: new Date().toISOString() },
    );
    return this.getOrFail(entryId);
  }

  async remove(entryId: string): Promise<void> {
    const stored = await this.getOrFail(entryId);
    if (stored.locked) throw new ConflictException(LOCKED);
    await this.ddb.delete(this.table, { entryId });
  }

  async lockMonth({ ym, mpSource, rawMaterial, note }: LockMonthRequest): Promise<{ locked: number }> {
    const entries = await this.monthEntries(ym);
    const now = new Date().toISOString();
    for (const e of entries) {
      await this.ddb.update(this.table, { entryId: e.entryId }, { locked: true, updatedAt: now });
    }
    const settings = await this.settings.get();
    const monthCloses = { ...(settings.monthCloses ?? {}) };
    monthCloses[ym] = {
      ...(monthCloses[ym] ?? { mpSource: "calcule" }),
      ...(mpSource && { mpSource }),
      ...(rawMaterial !== undefined && { rawMaterial }),
      ...(note && { note }),
      lockedAt: now,
    };
    await this.settings.update({ monthCloses });
    return { locked: entries.length };
  }

  async unlockMonth({ ym, reason }: UnlockMonthRequest): Promise<{ unlocked: number }> {
    const entries = await this.monthEntries(ym);
    const now = new Date().toISOString();
    for (const e of entries) {
      await this.ddb.update(this.table, { entryId: e.entryId }, { locked: null, updatedAt: now });
    }
    const settings = await this.settings.get();
    const monthCloses = { ...(settings.monthCloses ?? {}) };
    const previous: MonthClose = { ...(monthCloses[ym] ?? { mpSource: "calcule" }) };
    delete previous.lockedAt;
    monthCloses[ym] = { ...previous, unlockedAt: now, note: reason };
    await this.settings.update({ monthCloses });
    return { unlocked: entries.length };
  }

  private async monthEntries(ym: string): Promise<LedgerEntry[]> {
    const items = (await this.ddb.scanAll(this.table)) as unknown as LedgerEntry[];
    return items.filter((e) => e.ym === ym);
  }
}
