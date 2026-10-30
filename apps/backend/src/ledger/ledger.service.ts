import { ConflictException, Injectable, NotFoundException, Optional, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type {
  CreateLedgerEntryRequest,
  ImportLedgerRow,
  LedgerAttachment,
  LedgerEntry,
  LedgerEntrySource,
  LockMonthRequest,
  MonthClose,
  PatchLedgerEntryRequest,
  UnlockMonthRequest,
} from "@packages/types";
import { DdbService } from "../shared/ddb.service";
import { S3Service } from "../shared/s3.service";
import { SettingsService } from "../settings/settings.service";

const LOCKED = { code: "LOCKED", message: "Mois verrouillé" };
const ATTACHMENT_URL_SECONDS = 600;

// Fields the server writes itself; the public DTOs never carry them.
export type EntryProvenance = { source: LedgerEntrySource; attachment?: LedgerAttachment };

export interface ImportInvoicesResult {
  created: number;
  updated: number;
  skippedLocked: number;
}

// A typed monthly revenue is never an open invoice.
const paidOf = (body: CreateLedgerEntryRequest): boolean =>
  body.book === "ventes" ? body.kind === "ca_mensuel" || body.paid : false;

@Injectable()
export class LedgerService {
  // Resolved per call so a missing table fails the request, not the boot.
  private get table() { return this.ddb.requireTable("ledger"); }

  // S3 is optional so the older specs can build the service without it.
  constructor(private ddb: DdbService, private settings: SettingsService, @Optional() private s3?: S3Service) {}

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
    return this.createEntry(body);
  }

  async createEntry(body: CreateLedgerEntryRequest, provenance?: EntryProvenance): Promise<LedgerEntry> {
    await this.assertOpen(body.date.slice(0, 7));
    const now = new Date().toISOString();
    const entry: LedgerEntry = {
      ...body,
      entryId: randomUUID(),
      ym: body.date.slice(0, 7),
      paid: paidOf(body),
      createdAt: now,
      updatedAt: now,
      ...provenance,
    };
    await this.ddb.put(this.table, entry as unknown as Record<string, unknown>);
    return entry;
  }

  async replace(entryId: string, body: CreateLedgerEntryRequest): Promise<LedgerEntry> {
    return this.replaceEntry(entryId, body);
  }

  // A hand edit keeps the stored attachment and source; a provenance given by the server overrides them.
  async replaceEntry(entryId: string, body: CreateLedgerEntryRequest, provenance?: EntryProvenance): Promise<LedgerEntry> {
    const stored = await this.getOrFail(entryId);
    if (stored.locked) throw new ConflictException(LOCKED);
    await this.assertOpen(body.date.slice(0, 7));
    const entry: LedgerEntry = {
      ...body,
      entryId: stored.entryId,
      ym: body.date.slice(0, 7),
      paid: paidOf(body),
      createdAt: stored.createdAt,
      updatedAt: new Date().toISOString(),
      ...(stored.locked !== undefined && { locked: stored.locked }),
      ...(stored.attachment && { attachment: stored.attachment }),
      ...(stored.source && { source: stored.source }),
      ...provenance,
    };
    await this.ddb.put(this.table, entry as unknown as Record<string, unknown>);
    if (stored.attachment && stored.attachment.key !== entry.attachment?.key) await this.deleteObject(stored.attachment.key);
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

  // Invoices issued elsewhere, keyed by their number: a known number updates the entry, a new one creates a facture.
  async importInvoices(rows: ImportLedgerRow[]): Promise<ImportInvoicesResult> {
    const settings = await this.settings.get();
    const items = (await this.ddb.scanAll(this.table)) as unknown as LedgerEntry[];
    const byNumber = new Map<string, LedgerEntry>();
    for (const e of items) {
      if (e.book === "ventes" && e.imported === true && e.number) byNumber.set(e.number, e);
    }
    const result: ImportInvoicesResult = { created: 0, updated: 0, skippedLocked: 0 };
    for (const row of rows) {
      const ym = row.date.slice(0, 7);
      const stored = byNumber.get(row.number);
      if (settings.monthCloses?.[ym]?.lockedAt || stored?.locked) {
        result.skippedLocked += 1;
        continue;
      }
      const now = new Date().toISOString();
      const fields = {
        book: "ventes" as const,
        kind: "facture" as const,
        imported: true,
        source: "import_csv" as const,
        number: row.number,
        date: row.date,
        ym,
        label: row.label,
        htva: row.htva,
        vatRate: row.vatRate,
        vatAmount: row.vatAmount,
        ...(row.vatLines ? { vatLines: row.vatLines } : {}),
        totalTvac: row.totalTvac,
        paid: row.paid,
        updatedAt: now,
      };
      const entry: LedgerEntry = stored
        ? { ...stored, ...fields, entryId: stored.entryId, createdAt: stored.createdAt }
        : { entryId: randomUUID(), ...fields, createdAt: now };
      if (row.paidAt) entry.paidAt = row.paidAt;
      else delete entry.paidAt;
      if (row.prestationType) entry.prestationType = row.prestationType;
      await this.ddb.put(this.table, entry as unknown as Record<string, unknown>);
      byNumber.set(row.number, entry);
      if (stored) result.updated += 1;
      else result.created += 1;
    }
    return result;
  }

  async remove(entryId: string): Promise<void> {
    const stored = await this.getOrFail(entryId);
    if (stored.locked) throw new ConflictException(LOCKED);
    await this.ddb.delete(this.table, { entryId });
    if (stored.attachment) await this.deleteObject(stored.attachment.key);
  }

  async attachmentUrl(entryId: string): Promise<{ url: string }> {
    const stored = await this.getOrFail(entryId);
    if (!stored.attachment) throw new NotFoundException("Aucune pièce jointe");
    if (!this.s3) throw new ServiceUnavailableException("Stockage indisponible");
    return { url: await this.s3.presignedUrl(stored.attachment.key, { filename: stored.attachment.name, expiresIn: ATTACHMENT_URL_SECONDS }) };
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
    const note = previous.note ? `${previous.note} · Déverrouillé : ${reason}` : `Déverrouillé : ${reason}`;
    monthCloses[ym] = { ...previous, unlockedAt: now, note };
    await this.settings.update({ monthCloses });
    return { unlocked: entries.length };
  }

  // A locked month refuses new entries and entries moved into it.
  private async assertOpen(ym: string): Promise<void> {
    const settings = await this.settings.get();
    if (settings.monthCloses?.[ym]?.lockedAt) throw new ConflictException(LOCKED);
  }

  private async monthEntries(ym: string): Promise<LedgerEntry[]> {
    const items = (await this.ddb.scanAll(this.table)) as unknown as LedgerEntry[];
    return items.filter((e) => e.ym === ym);
  }

  // Best-effort: a missing object must not block the entry write.
  private async deleteObject(key: string): Promise<void> {
    try {
      await this.s3?.delete(key);
    } catch (err) {
      console.warn(JSON.stringify({ action: "ledger:deleteAttachmentObject", key, error: String(err) }));
    }
  }
}
