import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import type {
  CreateOfferDocumentRequest,
  DocSection,
  DuplicateOfferDocumentRequest,
  Offer,
  OfferDocument,
  OfferDocumentItem,
  UpdateOfferDocumentRequest,
} from "@packages/types";
import { DEFAULT_PRESTATION_TYPES, MAX_OFFER_DOCUMENTS, createOfferDocumentSchema, offerFromSection, offerSyncFromSection } from "@packages/types";
import { DdbService, UpdateOptions } from "../shared/ddb.service";
import { OffersService } from "../offers/offers.service";
import { SettingsService } from "../settings/settings.service";

const KEY_PREFIX = "document:";
const MAX_TRIES = 5;
const FIXTURE_PATH = join(__dirname, "fixtures", "offer-documents-2026.json");

const isConditionFailure = (err: unknown) => (err as { name?: string }).name === "ConditionalCheckFailedException";

// Legacy rows have no updatedAt, so the guard is a presence check rather than an equality on the stamp.
const guardFor = (current: { updatedAt?: unknown }): UpdateOptions =>
  typeof current.updatedAt === "string"
    ? { condition: "#ua = :expected", names: { "#ua": "updatedAt" }, values: { ":expected": current.updatedAt } }
    : { condition: "attribute_not_exists(#ua)", names: { "#ua": "updatedAt" } };

// Strictly later than the previous stamp so two writes in one millisecond never share it.
const nextStamp = (previous?: string): string => {
  const now = new Date().toISOString();
  if (!previous || now > previous || Number.isNaN(Date.parse(previous))) return now;
  return new Date(Date.parse(previous) + 1).toISOString();
};

const keyOf = (documentId: string) => ({ settingsId: `${KEY_PREFIX}${documentId}` });

const isDocumentItem = (item: Record<string, unknown>): item is Record<string, unknown> & OfferDocumentItem =>
  typeof item.settingsId === "string" && item.settingsId.startsWith(KEY_PREFIX) && typeof item.document === "object" && item.document !== null;

// A null field is removed from the stored document; a new title refreshes titleLower.
function applyFields(stored: OfferDocument, fields: Omit<UpdateOfferDocumentRequest, "updatedAt">): OfferDocument {
  const next: Record<string, unknown> = { ...stored };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else next[key] = value;
  }
  const document = next as unknown as OfferDocument;
  if (fields.title) document.titleLower = fields.title.toLowerCase();
  return document;
}

const withoutOffer = (section: DocSection): DocSection => {
  const copy = { ...section };
  delete copy.offerId;
  return copy;
};

function readFixture(): CreateOfferDocumentRequest[] {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as unknown;
  if (!Array.isArray(raw)) throw new InternalServerErrorException("Fixture des offres 2026 illisible");
  return raw.map((entry, index) => {
    const parsed = createOfferDocumentSchema.safeParse(entry);
    if (!parsed.success) {
      throw new InternalServerErrorException({ message: `Fixture des offres 2026 : entrée ${index + 1} invalide`, issues: parsed.error.issues });
    }
    return parsed.data;
  });
}

@Injectable()
export class OfferDocumentsService {
  private get table() { return this.ddb.tables.settings; }

  constructor(private ddb: DdbService, private offers: OffersService, private settings: SettingsService) {}

  // Every document, archived included, year descending then title.
  async getAll(): Promise<OfferDocument[]> {
    const items = await this.ddb.scanAll(this.table);
    return items
      .filter(isDocumentItem)
      .map((item) => item.document)
      .sort((a, b) => b.year - a.year || a.titleLower.localeCompare(b.titleLower));
  }

  async get(documentId: string): Promise<OfferDocument> {
    return (await this.item(documentId)).document;
  }

  async create(data: CreateOfferDocumentRequest): Promise<OfferDocument> {
    const count = (await this.getAll()).length;
    return this.insert(data, count);
  }

  // A stale body stamp is 409 at once; without a stamp a concurrent write is retried like the offers.
  async update(documentId: string, fields: UpdateOfferDocumentRequest): Promise<OfferDocument> {
    const { updatedAt: expected, ...rest } = fields;
    return this.mutate(documentId, expected, (stored) => applyFields(stored, rest));
  }

  async delete(documentId: string): Promise<void> {
    await this.item(documentId);
    await this.ddb.delete(this.table, keyOf(documentId));
  }

  // A copy for another year: new id, same section and row ids, no offerId, not archived; the source is archived when asked.
  async duplicate(documentId: string, body: DuplicateOfferDocumentRequest): Promise<OfferDocument> {
    const source = await this.get(documentId);
    const count = (await this.getAll()).length;
    const now = new Date().toISOString();
    const copy: OfferDocument = {
      ...source,
      documentId: randomUUID(),
      year: body.year,
      sections: source.sections.map(withoutOffer),
      createdAt: now,
      updatedAt: now,
    };
    delete copy.archived;
    await this.put(copy, count);
    if (body.archiveSource) await this.update(documentId, { archived: true });
    return copy;
  }

  // Re-syncs the 07 offer a formula section points at, or creates it and writes offerId into the section.
  async costSection(documentId: string, sectionId: string): Promise<{ document: OfferDocument; offer: Offer }> {
    const document = await this.get(documentId);
    const section = document.sections.find((s) => s.sectionId === sectionId);
    if (!section) throw new NotFoundException("Section introuvable");
    const prestationTypes = (await this.settings.get()).prestationTypes ?? DEFAULT_PRESTATION_TYPES;
    const existing = section.offerId ? (await this.offers.getAll()).find((o) => o.offerId === section.offerId) : undefined;
    if (existing) {
      const offer = await this.offers.update(existing.offerId, offerSyncFromSection(document, section, prestationTypes));
      return { document, offer };
    }
    const offer = await this.offers.create(offerFromSection(document, section, prestationTypes));
    const linked = await this.mutate(documentId, undefined, (stored) => ({
      ...stored,
      sections: stored.sections.map((s) => (s.sectionId === sectionId ? { ...s, offerId: offer.offerId } : s)),
    }));
    return { document: linked, offer };
  }

  // Creates the fixture entries missing from the table (same titleLower and year); never updates an existing document.
  async importFixture(): Promise<{ created: string[]; skipped: string[] }> {
    const entries = readFixture();
    const existing = await this.getAll();
    const present = new Set(existing.map((d) => `${d.titleLower}|${d.year}`));
    let count = existing.length;
    const created: string[] = [];
    const skipped: string[] = [];
    for (const entry of entries) {
      const key = `${entry.title.toLowerCase()}|${entry.year}`;
      if (present.has(key)) {
        skipped.push(entry.title);
        continue;
      }
      await this.insert(entry, count);
      count += 1;
      present.add(key);
      created.push(entry.title);
    }
    return { created, skipped };
  }

  private async item(documentId: string): Promise<OfferDocumentItem> {
    const item = (await this.ddb.get(this.table, keyOf(documentId))) as Partial<OfferDocumentItem> | null;
    if (!item?.document) throw new NotFoundException("Document introuvable");
    return item as OfferDocumentItem;
  }

  private async insert(data: CreateOfferDocumentRequest, count: number): Promise<OfferDocument> {
    const now = new Date().toISOString();
    const document: OfferDocument = {
      documentId: randomUUID(),
      ...data,
      titleLower: data.title.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    };
    await this.put(document, count);
    return document;
  }

  private async put(document: OfferDocument, count: number): Promise<void> {
    if (count >= MAX_OFFER_DOCUMENTS) throw new BadRequestException(`${MAX_OFFER_DOCUMENTS} documents maximum`);
    const item: OfferDocumentItem = { settingsId: `${KEY_PREFIX}${document.documentId}`, document, updatedAt: document.updatedAt };
    await this.ddb.putIfAbsent(this.table, item as unknown as Record<string, unknown>, "settingsId");
  }

  // Applies op to the fresh document and writes it under the updatedAt guard, retrying only when no stamp was expected.
  private async mutate(documentId: string, expected: string | undefined, op: (stored: OfferDocument) => OfferDocument): Promise<OfferDocument> {
    const key = keyOf(documentId);
    for (let attempt = 0; ; attempt++) {
      const current = await this.item(documentId);
      if (expected !== undefined && expected !== current.document.updatedAt) throw new ConflictException({ code: "DOCUMENT_CHANGED" });
      const document = op(current.document);
      const updatedAt = nextStamp(current.updatedAt);
      document.updatedAt = updatedAt;
      try {
        await this.ddb.update(this.table, key, { document, updatedAt }, guardFor(current));
        return document;
      } catch (err) {
        if (!isConditionFailure(err)) throw err;
        if (expected !== undefined || attempt >= MAX_TRIES - 1) throw new ConflictException({ code: "DOCUMENT_CHANGED" });
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
      }
    }
  }
}
