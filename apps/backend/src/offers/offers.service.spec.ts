import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { Offer } from "@packages/types";
import type { DdbService, UpdateOptions } from "../shared/ddb.service";
import { OffersService } from "./offers.service";

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
  beforeUpdate?: (call: UpdateCall) => void;

  rows(table: string) {
    if (!this.store.has(table)) this.store.set(table, new Map());
    return this.store.get(table) as Map<string, Item>;
  }

  async get(table: string, key: Record<string, string>) {
    const item = this.rows(table).get(Object.values(key)[0]);
    return item ? clone(item) : null;
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
    const call = { table, key, fields: clone(fields), options };
    this.updates.push(call);
    this.beforeUpdate?.(call);
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

const OFFERS_KEY = "offers";

const baseOffer = (overrides: Partial<Offer> = {}): Offer => ({
  offerId: "o1",
  name: "Buffet 1",
  nameLower: "buffet 1",
  prestationType: "buffet_avec_service",
  vatRate: 12,
  guestCountRef: 20,
  lines: [{ recipeId: "r1", portionsPerGuest: 1 }],
  extraCosts: [],
  revenueLines: [],
  pricingMode: "par_convive",
  sellingPricePerGuest: 42,
  notes: "Sans porc",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const createBody = (name: string) => ({
  name,
  guestCountRef: 20,
  lines: [],
  extraCosts: [],
  revenueLines: [],
  pricingMode: "par_convive" as const,
  sellingPricePerGuest: 42,
});

function build() {
  const ddb = new FakeDdb();
  const service = new OffersService(ddb as unknown as DdbService);
  return { ddb, service };
}

function seeded(offers: Offer[] = [baseOffer()]) {
  const built = build();
  built.ddb.seed("settings", { settingsId: OFFERS_KEY, offers, updatedAt: "2026-01-01T00:00:00.000Z" });
  return built;
}

describe("OffersService.getAll", () => {
  it("serves an empty list when the item does not exist yet", async () => {
    const { ddb, service } = build();

    expect(await service.getAll()).toEqual([]);
    expect(ddb.puts).toHaveLength(0);
    expect(ddb.updates).toHaveLength(0);
  });

  it("returns the stored offers, archived included", async () => {
    const { service } = seeded([baseOffer(), baseOffer({ offerId: "o2", name: "Ancienne", nameLower: "ancienne", archived: true })]);

    const offers = await service.getAll();

    expect(offers.map((o) => o.offerId)).toEqual(["o1", "o2"]);
    expect(offers[1].archived).toBe(true);
  });
});

describe("OffersService.create", () => {
  it("appends with an id and stamps, creating the item when absent", async () => {
    const { ddb, service } = build();

    const offer = await service.create(createBody("Buffet 1"));

    expect(offer.offerId).toEqual(expect.any(String));
    expect(offer.nameLower).toBe("buffet 1");
    expect(offer.createdAt).toEqual(expect.any(String));
    expect(offer.updatedAt).toBe(offer.createdAt);
    expect(offer.sellingPricePerGuest).toBe(42);
    expect(ddb.puts).toHaveLength(1);
    expect(ddb.updates).toHaveLength(0);
    const item = ddb.raw("settings", OFFERS_KEY);
    expect(item?.settingsId).toBe("offers");
    expect(item?.offers).toEqual([offer]);
    const firstStamp = item?.updatedAt;
    expect(firstStamp).toEqual(expect.any(String));

    const second = await service.create(createBody("Walking dinner 2"));

    expect(ddb.updates).toHaveLength(1);
    expect(ddb.updates[0].options).toEqual({
      condition: "#ua = :expected",
      names: { "#ua": "updatedAt" },
      values: { ":expected": firstStamp },
    });
    expect((ddb.raw("settings", OFFERS_KEY)?.offers as Offer[]).map((o) => o.offerId)).toEqual([offer.offerId, second.offerId]);
    expect(await service.getAll()).toHaveLength(2);
  });

  it("refuses the 101st offer", async () => {
    const offers = Array.from({ length: 100 }, (_, i) => baseOffer({ offerId: `o${i}`, name: `Offre ${i}`, nameLower: `offre ${i}` }));
    const { ddb, service } = seeded(offers);

    const call = service.create(createBody("Une de trop"));

    await expect(call).rejects.toBeInstanceOf(BadRequestException);
    await call.catch((err: BadRequestException) => {
      expect(err.message).toBe("100 offres maximum");
    });
    expect(ddb.updates).toHaveLength(0);
    expect(ddb.raw("settings", OFFERS_KEY)?.offers).toHaveLength(100);
  });

  it("total mode derives the per-guest price from the total and the reference guests", async () => {
    const { service } = build();

    const offer = await service.create({
      ...createBody("Brunch"),
      pricingMode: "total",
      sellingTotal: 900,
      guestCountRef: 35,
      sellingPricePerGuest: 0,
    });

    expect(offer.sellingTotal).toBe(900);
    expect(offer.sellingPricePerGuest).toBe(25.71);
  });
});

describe("OffersService.update", () => {
  it("keeps the fields it was not given and removes a null notes", async () => {
    const { ddb, service } = seeded();

    const offer = await service.update("o1", { name: "Buffet 1 bis", notes: null });

    expect(offer.name).toBe("Buffet 1 bis");
    expect(offer.nameLower).toBe("buffet 1 bis");
    expect(offer).not.toHaveProperty("notes");
    expect(offer.prestationType).toBe("buffet_avec_service");
    expect(offer.vatRate).toBe(12);
    expect(offer.lines).toEqual([{ recipeId: "r1", portionsPerGuest: 1 }]);
    expect(offer.sellingPricePerGuest).toBe(42);
    expect(offer.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(offer.updatedAt > "2026-01-01T00:00:00.000Z").toBe(true);
    expect(ddb.updates).toHaveLength(1);
    expect(ddb.updates[0].options.values).toEqual({ ":expected": "2026-01-01T00:00:00.000Z" });
    expect(ddb.updates[0].fields.offers).toEqual([offer]);
    expect(ddb.updates[0].fields).not.toHaveProperty("notes");
    expect((ddb.raw("settings", OFFERS_KEY)?.offers as Offer[])[0]).toEqual(offer);
  });

  it("total mode derives the per-guest price and switching back removes the total", async () => {
    const { service } = seeded();

    const total = await service.update("o1", { pricingMode: "total", sellingTotal: 1000 });
    expect(total.sellingPricePerGuest).toBe(50);

    const moreGuests = await service.update("o1", { guestCountRef: 30 });
    expect(moreGuests.sellingTotal).toBe(1000);
    expect(moreGuests.sellingPricePerGuest).toBe(33.33);

    const perGuest = await service.update("o1", { pricingMode: "par_convive", sellingPricePerGuest: 40 });
    expect(perGuest.sellingPricePerGuest).toBe(40);
    expect(perGuest).not.toHaveProperty("sellingTotal");
  });

  it("is 404 for an unknown id", async () => {
    const { ddb, service } = seeded();

    await expect(service.update("nope", { name: "X" })).rejects.toBeInstanceOf(NotFoundException);
    expect(ddb.updates).toHaveLength(0);
  });

  it("re-reads and retries when another write moved the item in between", async () => {
    const { ddb, service } = seeded();
    ddb.beforeUpdate = () => {
      const row = ddb.raw("settings", OFFERS_KEY) as Item;
      row.offers = [...(row.offers as Offer[]), baseOffer({ offerId: "o2", name: "Nouvelle", nameLower: "nouvelle" })];
      row.updatedAt = "2026-01-02T00:00:00.000Z";
      ddb.beforeUpdate = undefined;
    };

    const offer = await service.update("o1", { name: "Buffet 1 bis" });

    expect(ddb.updates).toHaveLength(2);
    expect(ddb.updates[1].options.values).toEqual({ ":expected": "2026-01-02T00:00:00.000Z" });
    expect(offer.name).toBe("Buffet 1 bis");
    const stored = ddb.raw("settings", OFFERS_KEY)?.offers as Offer[];
    expect(stored.map((o) => o.name)).toEqual(["Buffet 1 bis", "Nouvelle"]);
  });

  it("gives up with 409 OFFERS_CHANGED after five conditional failures", async () => {
    const { ddb, service } = seeded();
    ddb.failUpdatesWith.push(conditionFailure(), conditionFailure(), conditionFailure(), conditionFailure(), conditionFailure());

    const call = service.update("o1", { name: "Buffet 1 bis" });

    await expect(call).rejects.toBeInstanceOf(ConflictException);
    await call.catch((err: ConflictException) => {
      expect(err.getResponse()).toEqual({ code: "OFFERS_CHANGED" });
    });
    expect(ddb.updates).toHaveLength(5);
    expect((ddb.raw("settings", OFFERS_KEY)?.offers as Offer[])[0].name).toBe("Buffet 1");
  });

  it("rethrows other write errors untouched", async () => {
    const { ddb, service } = seeded();
    ddb.failUpdatesWith.push(new Error("throttled"));

    await expect(service.update("o1", { name: "X" })).rejects.toThrow("throttled");
    expect(ddb.updates).toHaveLength(1);
  });
});

describe("OffersService.delete", () => {
  it("removes the offer under the guard", async () => {
    const { ddb, service } = seeded([baseOffer(), baseOffer({ offerId: "o2", name: "Autre", nameLower: "autre" })]);

    await service.delete("o1");

    expect(ddb.updates).toHaveLength(1);
    expect(ddb.updates[0].options.condition).toBe("#ua = :expected");
    expect((ddb.raw("settings", OFFERS_KEY)?.offers as Offer[]).map((o) => o.offerId)).toEqual(["o2"]);
  });

  it("is 404 for an unknown id and writes nothing", async () => {
    const { ddb, service } = seeded();

    await expect(service.delete("nope")).rejects.toBeInstanceOf(NotFoundException);
    expect(ddb.updates).toHaveLength(0);
    expect(ddb.raw("settings", OFFERS_KEY)?.offers).toHaveLength(1);
  });

  it("is 404 when the item does not exist yet", async () => {
    const { ddb, service } = build();

    await expect(service.delete("o1")).rejects.toBeInstanceOf(NotFoundException);
    expect(ddb.puts).toHaveLength(0);
  });
});
