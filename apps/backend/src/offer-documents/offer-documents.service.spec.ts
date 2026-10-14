import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { CreateOfferDocumentRequest, CreateOfferRequest, Offer, OfferDocument, UpdateOfferRequest } from "@packages/types";
import { DEFAULT_DOC_CONDITIONS, DEFAULT_DOC_SERVICES, DEFAULT_DOC_VAT_LINES, DEFAULT_PRESTATION_TYPES, MAX_OFFER_DOCUMENTS } from "@packages/types";
import type { DdbService, UpdateOptions } from "../shared/ddb.service";
import type { OffersService } from "../offers/offers.service";
import type { SettingsService } from "../settings/settings.service";
import { OfferDocumentsService } from "./offer-documents.service";

type Item = Record<string, unknown>;
type UpdateCall = { table: string; key: Record<string, string>; fields: Item; options: UpdateOptions };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const conditionFailure = () => Object.assign(new Error("cond"), { name: "ConditionalCheckFailedException" });

// In-memory stand-in for DdbService: one Map per table, rows keyed by their first attribute.
class FakeDdb {
  tables = { events: "", ingredients: "", recipes: "", settings: "settings", groceryLists: "" };
  store = new Map<string, Map<string, Item>>();
  updates: UpdateCall[] = [];
  puts: Item[] = [];
  failUpdatesWith: Error[] = [];

  rows(table: string) {
    if (!this.store.has(table)) this.store.set(table, new Map());
    return this.store.get(table) as Map<string, Item>;
  }

  async get(table: string, key: Record<string, string>) {
    const item = this.rows(table).get(Object.values(key)[0]);
    return item ? clone(item) : null;
  }

  async scanAll(table: string) {
    return [...this.rows(table).values()].map((item) => clone(item));
  }

  async put(table: string, item: Item) {
    const [keyAttr] = Object.keys(item);
    this.rows(table).set(String(item[keyAttr]), clone(item));
  }

  async putIfAbsent(table: string, item: Item, keyAttr: string) {
    this.puts.push(clone(item));
    if (this.rows(table).has(String(item[keyAttr]))) throw conditionFailure();
    await this.put(table, item);
  }

  async update(table: string, key: Record<string, string>, fields: Item, options: UpdateOptions = {}) {
    this.updates.push({ table, key, fields: clone(fields), options });
    const queued = this.failUpdatesWith.shift();
    if (queued) throw queued;
    const id = Object.values(key)[0];
    const item = this.rows(table).get(id);
    if (!item) throw conditionFailure();
    const stale = options.condition === "#ua = :expected" && item.updatedAt !== options.values?.[":expected"];
    const present = options.condition === "attribute_not_exists(#ua)" && item.updatedAt !== undefined;
    if (stale || present) throw conditionFailure();
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      if (v === null) delete item[k];
      else item[k] = clone(v);
    }
  }

  async delete(table: string, key: Record<string, string>) {
    this.rows(table).delete(Object.values(key)[0]);
  }

  seed(table: string, item: Item) {
    const [keyAttr] = Object.keys(item);
    this.rows(table).set(String(item[keyAttr]), clone(item));
  }

  raw(table: string, id: string) {
    return this.rows(table).get(id);
  }
}

// In-memory stand-in for OffersService: create, update (null removes) and getAll.
class FakeOffers {
  offers: Offer[] = [];
  private seq = 0;

  async getAll() {
    return clone(this.offers);
  }

  async create(data: CreateOfferRequest): Promise<Offer> {
    const offer = { offerId: `o${++this.seq}`, ...data, nameLower: data.name.toLowerCase(), createdAt: NOW, updatedAt: NOW } as Offer;
    this.offers.push(offer);
    return clone(offer);
  }

  async update(offerId: string, fields: UpdateOfferRequest): Promise<Offer> {
    const index = this.offers.findIndex((o) => o.offerId === offerId);
    if (index === -1) throw new NotFoundException("Offer not found");
    const next: Record<string, unknown> = { ...this.offers[index] };
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      if (value === null) delete next[key];
      else next[key] = value;
    }
    this.offers[index] = next as unknown as Offer;
    return clone(this.offers[index]);
  }
}

const NOW = "2026-01-01T00:00:00.000Z";

const baseDocument = (overrides: Partial<OfferDocument> = {}): OfferDocument => ({
  documentId: "d1",
  title: "Offre buffets automne hiver",
  titleLower: "offre buffets automne hiver",
  year: 2026,
  season: "automne_hiver",
  prestationType: "buffet_avec_service",
  prestationLabel: "Avec ou sans service",
  minGuests: 20,
  note: "Chaque élément peut se choisir séparément.",
  sections: [
    {
      sectionId: "buffet-2",
      title: "Buffet 2",
      price: 34.5,
      unitLabel: "par personne",
      unitKind: "convive",
      rows: [
        { rowId: "b2-vitello", kind: "plat", text: "Vitello tonnato", recipeId: "r1" },
        { rowId: "b2-polpettes", kind: "plat", text: "Polpettes italiennes", tags: ["chaud"] },
      ],
    },
  ],
  services: DEFAULT_DOC_SERVICES,
  conditions: DEFAULT_DOC_CONDITIONS,
  vatLines: DEFAULT_DOC_VAT_LINES,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const createBody = (title: string, year = 2026): CreateOfferDocumentRequest => ({
  title,
  year,
  prestationLabel: "A emporter",
  sections: [],
  services: DEFAULT_DOC_SERVICES,
  conditions: DEFAULT_DOC_CONDITIONS,
  vatLines: DEFAULT_DOC_VAT_LINES,
});

function build() {
  const ddb = new FakeDdb();
  const offers = new FakeOffers();
  const settings = { get: async () => ({ prestationTypes: DEFAULT_PRESTATION_TYPES }) };
  const service = new OfferDocumentsService(
    ddb as unknown as DdbService,
    offers as unknown as OffersService,
    settings as unknown as SettingsService,
  );
  const seed = (document: OfferDocument) =>
    ddb.seed("settings", { settingsId: `document:${document.documentId}`, document, updatedAt: document.updatedAt });
  return { ddb, offers, service, seed };
}

describe("OfferDocumentsService.getAll", () => {
  it("keeps only the document: items and sorts year descending then title", async () => {
    const { ddb, service, seed } = build();
    ddb.seed("settings", { settingsId: "global", company: { name: "x" }, updatedAt: NOW });
    ddb.seed("settings", { settingsId: "offers", offers: [], updatedAt: NOW });
    seed(baseDocument({ documentId: "brunch", title: "Offre brunch à emporter", titleLower: "offre brunch à emporter", year: 2025 }));
    seed(baseDocument({ documentId: "chef", title: "Offre chef à domicile", titleLower: "offre chef à domicile", archived: true }));
    seed(baseDocument({ documentId: "carte", title: "Carte à emporter", titleLower: "carte à emporter" }));

    const documents = await service.getAll();

    expect(documents.map((d) => d.documentId)).toEqual(["carte", "chef", "brunch"]);
    expect(documents[1].archived).toBe(true);
  });

  it("serves an empty list on an empty table", async () => {
    const { service } = build();

    expect(await service.getAll()).toEqual([]);
  });
});

describe("OfferDocumentsService.get", () => {
  it("answers 404 for an unknown id", async () => {
    const { service } = build();

    await expect(service.get("nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("OfferDocumentsService.create", () => {
  it("stamps the id, titleLower and dates and writes one document: item", async () => {
    const { ddb, service } = build();

    const document = await service.create(createBody("Offre baptême"));

    expect(document.documentId).toEqual(expect.any(String));
    expect(document.titleLower).toBe("offre baptême");
    expect(document.createdAt).toEqual(expect.any(String));
    expect(document.updatedAt).toBe(document.createdAt);
    expect(ddb.puts).toHaveLength(1);
    expect(ddb.puts[0].settingsId).toBe(`document:${document.documentId}`);
    expect(ddb.puts[0].updatedAt).toBe(document.updatedAt);
    expect((ddb.puts[0].document as OfferDocument).title).toBe("Offre baptême");
  });

  it("refuses the 61st document", async () => {
    const { service, seed } = build();
    for (let i = 0; i < MAX_OFFER_DOCUMENTS; i++) seed(baseDocument({ documentId: `d${i}` }));

    await expect(service.create(createBody("Un de trop"))).rejects.toThrow(new BadRequestException("60 documents maximum"));
  });
});

describe("OfferDocumentsService.update", () => {
  it("keeps the fields it was not given, removes a null note and refreshes titleLower", async () => {
    const { ddb, service, seed } = build();
    seed(baseDocument());

    const updated = await service.update("d1", { title: "Offre Buffets Hiver", note: null, updatedAt: NOW });

    expect(updated.title).toBe("Offre Buffets Hiver");
    expect(updated.titleLower).toBe("offre buffets hiver");
    expect(updated.note).toBeUndefined();
    expect(updated.sections).toHaveLength(1);
    expect(updated.minGuests).toBe(20);
    expect(updated.updatedAt > NOW).toBe(true);
    const stored = ddb.raw("settings", "document:d1") as { document: OfferDocument; updatedAt: string };
    expect(stored.document).toEqual(updated);
    expect(stored.updatedAt).toBe(updated.updatedAt);
    expect(ddb.updates[0].options).toEqual({ condition: "#ua = :expected", names: { "#ua": "updatedAt" }, values: { ":expected": NOW } });
  });

  it("answers 409 DOCUMENT_CHANGED on a stale updatedAt without writing", async () => {
    const { ddb, service, seed } = build();
    seed(baseDocument());

    await expect(service.update("d1", { title: "Autre", updatedAt: "2025-12-31T00:00:00.000Z" })).rejects.toThrow(
      new ConflictException({ code: "DOCUMENT_CHANGED" }),
    );
    expect(ddb.updates).toHaveLength(0);
  });

  it("retries a concurrent write when no stamp is sent", async () => {
    const { ddb, service, seed } = build();
    seed(baseDocument());
    ddb.failUpdatesWith.push(conditionFailure());

    const updated = await service.update("d1", { archived: true });

    expect(updated.archived).toBe(true);
    expect(ddb.updates).toHaveLength(2);
  });

  it("answers 404 for an unknown id", async () => {
    const { service } = build();

    await expect(service.update("nope", { title: "x" })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("OfferDocumentsService.delete", () => {
  it("removes the item", async () => {
    const { ddb, service, seed } = build();
    seed(baseDocument());

    await service.delete("d1");

    expect(ddb.raw("settings", "document:d1")).toBeUndefined();
  });

  it("answers 404 for an unknown id", async () => {
    const { service } = build();

    await expect(service.delete("nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("OfferDocumentsService.duplicate", () => {
  it("copies with the given year, a new id, the same section ids and no offerId", async () => {
    const { service, seed } = build();
    seed(baseDocument({ sections: [{ ...baseDocument().sections[0], offerId: "o9" }] }));

    const copy = await service.duplicate("d1", { year: 2027, archiveSource: false });

    expect(copy.documentId).not.toBe("d1");
    expect(copy.year).toBe(2027);
    expect(copy.title).toBe("Offre buffets automne hiver");
    expect(copy.sections[0].sectionId).toBe("buffet-2");
    expect(copy.sections[0].rows.map((r) => r.rowId)).toEqual(["b2-vitello", "b2-polpettes"]);
    expect(copy.sections[0].offerId).toBeUndefined();
    expect(copy.archived).toBeUndefined();
    const source = await service.get("d1");
    expect(source.archived).toBeUndefined();
    expect(source.sections[0].offerId).toBe("o9");
    expect(await service.getAll()).toHaveLength(2);
  });

  it("archives the source when asked", async () => {
    const { service, seed } = build();
    seed(baseDocument());

    const copy = await service.duplicate("d1", { year: 2027, archiveSource: true });

    expect(copy.archived).toBeUndefined();
    expect((await service.get("d1")).archived).toBe(true);
  });
});

describe("OfferDocumentsService.costSection", () => {
  it("creates the offer from the section and writes its id into the section", async () => {
    const { offers, service, seed } = build();
    seed(baseDocument());

    const { document, offer } = await service.costSection("d1", "buffet-2");

    expect(offer.name).toBe("Offre buffets automne hiver 2026 › Buffet 2");
    expect(offer.lines).toEqual([{ recipeId: "r1", portionsPerGuest: 1 }]);
    expect(offer.sellingPricePerGuest).toBe(34.5);
    expect(offer.vatRate).toBe(12);
    expect(offer.prestationType).toBe("buffet_avec_service");
    expect(offer.guestCountRef).toBe(20);
    expect(offer.notes).toBe("Plats sans recette : Polpettes italiennes");
    expect(document.sections[0].offerId).toBe(offer.offerId);
    expect((await service.get("d1")).sections[0].offerId).toBe(offer.offerId);
    expect(offers.offers).toHaveLength(1);
  });

  it("re-syncs the lines of the existing offer on a second call", async () => {
    const { offers, service, seed } = build();
    seed(baseDocument());
    const first = await service.costSection("d1", "buffet-2");
    const section = (await service.get("d1")).sections[0];
    await service.update("d1", {
      sections: [{ ...section, price: 36, rows: section.rows.map((r) => (r.rowId === "b2-polpettes" ? { ...r, recipeId: "r2" } : r)) }],
    });

    const second = await service.costSection("d1", "buffet-2");

    expect(second.offer.offerId).toBe(first.offer.offerId);
    expect(second.offer.lines).toEqual([
      { recipeId: "r1", portionsPerGuest: 1 },
      { recipeId: "r2", portionsPerGuest: 1 },
    ]);
    expect(second.offer.sellingPricePerGuest).toBe(36);
    expect(second.offer.notes).toBeUndefined();
    expect(offers.offers).toHaveLength(1);
  });

  it("recreates the offer when the linked one is gone", async () => {
    const { offers, service, seed } = build();
    seed(baseDocument({ sections: [{ ...baseDocument().sections[0], offerId: "gone" }] }));

    const { document, offer } = await service.costSection("d1", "buffet-2");

    expect(offer.offerId).not.toBe("gone");
    expect(document.sections[0].offerId).toBe(offer.offerId);
    expect(offers.offers).toHaveLength(1);
  });

  it("answers 404 for an unknown section", async () => {
    const { service, seed } = build();
    seed(baseDocument());

    await expect(service.costSection("d1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("OfferDocumentsService.importFixture", () => {
  it("creates the seven sheets on an empty table and none on a second run", async () => {
    const { service } = build();

    const first = await service.importFixture();

    expect(first.created).toEqual([
      "Offre brunch à emporter",
      "Offre chef à domicile",
      "Offre walking dinner",
      "Offre buffets printemps été",
      "Offre buffets automne hiver",
      "Offre baptême",
      "Carte à emporter",
    ]);
    expect(first.skipped).toEqual([]);
    expect(await service.getAll()).toHaveLength(7);

    const second = await service.importFixture();

    expect(second.created).toEqual([]);
    expect(second.skipped).toHaveLength(7);
    expect(await service.getAll()).toHaveLength(7);
  });

  it("never touches a document that already exists with that title and year", async () => {
    const { service } = build();
    const edited = await service.create({ ...createBody("Offre baptême"), note: "Ma version" });

    const result = await service.importFixture();

    expect(result.skipped).toEqual(["Offre baptême"]);
    expect(result.created).toHaveLength(6);
    expect((await service.get(edited.documentId)).note).toBe("Ma version");
  });
});
