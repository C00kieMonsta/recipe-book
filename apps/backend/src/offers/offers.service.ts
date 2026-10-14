import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { CreateOfferRequest, Offer, OffersItem, UpdateOfferRequest } from "@packages/types";
import { round2 } from "@packages/types";
import { DdbService, UpdateOptions } from "../shared/ddb.service";

const OFFERS_ID = "offers";
const MAX_OFFERS = 100;
const MAX_TRIES = 5;

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

// Total mode stores the derived per-guest price so every per-guest reader stays correct.
const derivedPricePerGuest = (sellingTotal: number | undefined, guestCountRef: number): number =>
  round2((sellingTotal ?? 0) / (guestCountRef || 1));

@Injectable()
export class OffersService {
  private get table() { return this.ddb.tables.settings; }

  constructor(private ddb: DdbService) {}

  async getAll(): Promise<Offer[]> {
    const item = (await this.ddb.get(this.table, { settingsId: OFFERS_ID })) as Partial<OffersItem> | null;
    return item?.offers ?? [];
  }

  async create(data: CreateOfferRequest): Promise<Offer> {
    return this.withFreshItem((offers) => {
      if (offers.length >= MAX_OFFERS) throw new BadRequestException(`${MAX_OFFERS} offres maximum`);
      const now = new Date().toISOString();
      const offer: Offer = {
        offerId: randomUUID(),
        ...data,
        nameLower: data.name.toLowerCase(),
        createdAt: now,
        updatedAt: now,
      };
      if (offer.pricingMode === "total") {
        offer.sellingPricePerGuest = derivedPricePerGuest(offer.sellingTotal, offer.guestCountRef);
      }
      return { offers: [...offers, offer], result: offer };
    });
  }

  // Keeps the stored fields it was not given; a null field is deleted from the offer.
  async update(offerId: string, fields: UpdateOfferRequest): Promise<Offer> {
    return this.withFreshItem((offers) => {
      const index = offers.findIndex((o) => o.offerId === offerId);
      if (index === -1) throw new NotFoundException("Offer not found");
      const stored = offers[index];
      const next: Record<string, unknown> = { ...stored };
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        if (value === null) delete next[key];
        else next[key] = value;
      }
      const offer = next as unknown as Offer;
      if (fields.name) offer.nameLower = fields.name.toLowerCase();
      if (offer.pricingMode === "total") {
        offer.sellingPricePerGuest = derivedPricePerGuest(offer.sellingTotal, offer.guestCountRef);
      } else if (fields.pricingMode === "par_convive" && stored.pricingMode === "total") {
        delete offer.sellingTotal;
      }
      offer.updatedAt = nextStamp(stored.updatedAt);
      return { offers: offers.map((o, i) => (i === index ? offer : o)), result: offer };
    });
  }

  async delete(offerId: string): Promise<void> {
    await this.withFreshItem((offers) => {
      if (!offers.some((o) => o.offerId === offerId)) throw new NotFoundException("Offer not found");
      return { offers: offers.filter((o) => o.offerId !== offerId), result: undefined };
    });
  }

  // Reads the item, applies op and writes the whole array under the updatedAt guard; retries on a concurrent write, then 409.
  private async withFreshItem<T>(op: (offers: Offer[]) => { offers: Offer[]; result: T }): Promise<T> {
    const key = { settingsId: OFFERS_ID };
    for (let attempt = 0; ; attempt++) {
      const current = (await this.ddb.get(this.table, key)) as Partial<OffersItem> | null;
      const { offers, result } = op(current?.offers ?? []);
      const updatedAt = nextStamp(current?.updatedAt);
      try {
        if (!current) {
          const item: OffersItem = { settingsId: OFFERS_ID, offers, updatedAt };
          await this.ddb.putIfAbsent(this.table, item as unknown as Record<string, unknown>, "settingsId");
        } else {
          await this.ddb.update(this.table, key, { offers, updatedAt }, guardFor(current));
        }
        return result;
      } catch (err) {
        if (!isConditionFailure(err)) throw err;
        if (attempt >= MAX_TRIES - 1) throw new ConflictException({ code: "OFFERS_CHANGED" });
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
      }
    }
  }
}
