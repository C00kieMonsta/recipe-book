import type { AppEvent } from "../entities/event";
import type { Offer, OfferLine } from "../entities/offer";
import { createEventRequestSchema } from "../dto/events";
import { createOfferSchema } from "../dto/offers";
import {
  eventFromOffer,
  linesForGuests,
  mergeOfferLines,
  offerFromEvent,
  offerSummary,
  quoteTotals,
  suggestedPricePerGuest,
  type QuoteInput,
} from "./offers";
import type { RecipeLookup } from "./planning";

const recipeCostById = new Map<string, number>([
  ["houmous", 10],
  ["poulet", 60],
  ["tarte", 20],
]);
const recipePortionsById = new Map<string, number>([
  ["houmous", 10],
  ["poulet", 10],
  ["tarte", 8],
]);
const recipeById: RecipeLookup = new Map([
  ["houmous", { name: "Houmous", ingredients: [] }],
  ["poulet", { name: "Poulet basquaise", ingredients: [{ ingredientId: "i1", qty: 1, unit: "g", lossPct: 0 }] }],
  ["tarte", { name: "Tarte citron", ingredients: [{ ingredientId: "i2", qty: 1, unit: "g", lossPct: 0 }] }],
]);

function quote(partial: Partial<QuoteInput> = {}): QuoteInput {
  return {
    lines: [{ recipeId: "poulet", portionsPerGuest: 1 }],
    guests: 10,
    extraCosts: [],
    revenueLines: [],
    pricingMode: "par_convive",
    sellingPricePerGuest: 40,
    ...partial,
  };
}

function event(partial: Partial<AppEvent> = {}): AppEvent {
  return {
    eventId: "ev1",
    name: "Mariage Dupont",
    nameLower: "mariage dupont",
    date: "2026-10-17",
    guestCount: 60,
    recipes: [{ lineId: "l1", recipeId: "poulet", portions: 50 }],
    extraCosts: [{ label: "Serveur", amount: 150, kind: "personnel" }],
    sellingPricePerGuest: 42,
    status: "upcoming",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function offer(partial: Partial<Offer> = {}): Offer {
  return {
    offerId: "of1",
    name: "Buffet 1",
    nameLower: "buffet 1",
    prestationType: "buffet_avec_service",
    vatRate: 12,
    guestCountRef: 20,
    lines: [
      { recipeId: "houmous", portionsPerGuest: 1 },
      { recipeId: "poulet", portionsPerGuest: 1, course: "Plat" },
    ],
    extraCosts: [],
    revenueLines: [],
    pricingMode: "par_convive",
    sellingPricePerGuest: 42,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("linesForGuests", () => {
  it("rounds 0,5 per guest at 7 guests up to 4 portions", () => {
    expect(linesForGuests([{ recipeId: "r", portionsPerGuest: 0.5 }], 7)).toEqual([{ recipeId: "r", portions: 4 }]);
  });
  it("gives 1 portion per line at 0 guests", () => {
    expect(linesForGuests([{ recipeId: "r", portionsPerGuest: 1 }], 0)).toEqual([{ recipeId: "r", portions: 1 }]);
    expect(linesForGuests([{ recipeId: "r", portionsPerGuest: 3 }], -2)).toEqual([{ recipeId: "r", portions: 1 }]);
  });
  it("does not round a whole product up because of float noise", () => {
    expect(linesForGuests([{ recipeId: "r", portionsPerGuest: 0.1 }], 30)[0].portions).toBe(3);
    expect(linesForGuests([{ recipeId: "r", portionsPerGuest: 3 }], 20)[0].portions).toBe(60);
  });
  it("keeps course and notes when present", () => {
    expect(linesForGuests([{ recipeId: "r", portionsPerGuest: 1, course: "Plat", notes: "sans sel" }], 2)).toEqual([
      { recipeId: "r", portions: 2, course: "Plat", notes: "sans sel" },
    ]);
  });
});

describe("quoteTotals", () => {
  it("costs the lines at the guest count and prices per guest", () => {
    const t = quoteTotals(quote(), recipeCostById, recipePortionsById);
    expect(t.portionsByRecipe.get("poulet")).toBe(10);
    expect(t.rawMaterial).toBe(60);
    expect(t.extrasCost).toBe(0);
    expect(t.costTotal).toBe(60);
    expect(t.costPerGuest).toBe(6);
    expect(t.foodHtva).toBe(400);
    expect(t.linesHtva).toBe(0);
    expect(t.totalHtva).toBe(400);
    expect(t.totalTvac).toBe(400);
    expect(t.pricePerGuest).toBe(40);
    expect(t.margin).toBe(340);
    expect(t.marginPct).toBe(85);
    expect(t.marginPerGuest).toBe(34);
    expect(t.incompleteRecipes).toBe(0);
  });
  it("ignores guests for the revenue in total mode", () => {
    const t = quoteTotals(
      quote({ guests: 3, pricingMode: "total", sellingTotal: 1000, sellingPricePerGuest: 999 }),
      recipeCostById,
      recipePortionsById,
    );
    expect(t.foodHtva).toBe(1000);
    expect(t.totalHtva).toBe(1000);
    expect(t.pricePerGuest).toBe(333.33);
  });
  it("adds food at 12 % and service at 21 % into totalTvac", () => {
    const t = quoteTotals(
      quote({
        guests: 10,
        sellingPricePerGuest: 40,
        vatRate: 12,
        revenueLines: [{ label: "Service", amount: 100, vatRate: 21 }],
      }),
      recipeCostById,
      recipePortionsById,
    );
    expect(t.foodHtva).toBe(400);
    expect(t.linesHtva).toBe(100);
    expect(t.totalHtva).toBe(500);
    expect(t.totalTvac).toBe(569);
  });
  it("adds the extra costs and keeps marginPct at 0 when there is no revenue", () => {
    const t = quoteTotals(
      quote({ sellingPricePerGuest: 0, extraCosts: [{ label: "Transport", amount: 40 }] }),
      recipeCostById,
      recipePortionsById,
    );
    expect(t.extrasCost).toBe(40);
    expect(t.costTotal).toBe(100);
    expect(t.margin).toBe(-100);
    expect(t.marginPct).toBe(0);
  });
  it("counts a recipe with no ingredient and not an unknown id", () => {
    const t = quoteTotals(
      quote({
        lines: [
          { recipeId: "houmous", portionsPerGuest: 1 },
          { recipeId: "poulet", portionsPerGuest: 1 },
          { recipeId: "inconnue", portionsPerGuest: 1 },
        ],
      }),
      recipeCostById,
      recipePortionsById,
      recipeById,
    );
    expect(t.incompleteRecipes).toBe(1);
    expect(quoteTotals(quote(), recipeCostById, recipePortionsById).incompleteRecipes).toBe(0);
  });
  it("sums portions of the same recipe on two lines", () => {
    const t = quoteTotals(
      quote({
        lines: [
          { recipeId: "poulet", portionsPerGuest: 1 },
          { recipeId: "poulet", portionsPerGuest: 0.5 },
        ],
      }),
      recipeCostById,
      recipePortionsById,
    );
    expect(t.portionsByRecipe.get("poulet")).toBe(15);
    expect(t.rawMaterial).toBe(90);
  });
});

describe("suggestedPricePerGuest", () => {
  it("divides by 30 % when no share is given", () => {
    expect(suggestedPricePerGuest(13.2)).toBe(44);
  });
  it("divides by the given share", () => {
    expect(suggestedPricePerGuest(13.2, 0.25)).toBe(52.8);
  });
  it("falls back to 30 % for a share outside (0, 1]", () => {
    expect(suggestedPricePerGuest(13.2, 0)).toBe(44);
    expect(suggestedPricePerGuest(13.2, 1.5)).toBe(44);
    expect(suggestedPricePerGuest(13.2, -0.3)).toBe(44);
    expect(suggestedPricePerGuest(13.2, 1)).toBe(13.2);
  });
});

describe("offerFromEvent", () => {
  it("turns a 50-portion line on a 60-guest event into 0,83 per guest", () => {
    const o = offerFromEvent(event(), "Buffet mariage");
    expect(o.name).toBe("Buffet mariage");
    expect(o.guestCountRef).toBe(60);
    expect(o.lines).toEqual([{ recipeId: "poulet", portionsPerGuest: 0.83 }]);
    expect(o.pricingMode).toBe("par_convive");
    expect(o.sellingPricePerGuest).toBe(42);
    expect(o.sellingTotal).toBeUndefined();
    expect(o.extraCosts).toEqual([{ label: "Serveur", amount: 150, kind: "personnel" }]);
    expect(o.revenueLines).toEqual([]);
    expect(createOfferSchema.safeParse(o).success).toBe(true);
  });
  it("gives 1 per guest on a 0-guest event", () => {
    const o = offerFromEvent(event({ guestCount: 0, recipes: [{ lineId: "l1", recipeId: "poulet", portions: 1 }] }), "X");
    expect(o.lines[0].portionsPerGuest).toBe(1);
    expect(o.guestCountRef).toBe(1);
  });
  it("copies the pricing fields, prestation, VAT, lines and notes", () => {
    const o = offerFromEvent(
      event({
        pricingMode: "total",
        sellingTotal: 900,
        sellingPricePerGuest: 15,
        prestationType: "walking_cocktail",
        vatRate: 21,
        notes: "Sans porc",
        revenueLines: [{ label: "Service", amount: 450, vatRate: 21 }],
        recipes: [{ lineId: "l1", recipeId: "poulet", portions: 60, course: "Plat", notes: "épicé" }],
      }),
      "Total",
    );
    expect(o.pricingMode).toBe("total");
    expect(o.sellingTotal).toBe(900);
    expect(o.sellingPricePerGuest).toBe(15);
    expect(o.prestationType).toBe("walking_cocktail");
    expect(o.vatRate).toBe(21);
    expect(o.notes).toBe("Sans porc");
    expect(o.revenueLines).toEqual([{ label: "Service", amount: 450, vatRate: 21 }]);
    expect(o.lines).toEqual([{ recipeId: "poulet", portionsPerGuest: 1, course: "Plat", notes: "épicé" }]);
    expect(createOfferSchema.safeParse(o).success).toBe(true);
  });
  it("omits an absent prestation, VAT rate and notes", () => {
    const o = offerFromEvent(event({ prestationType: undefined, vatRate: undefined }), "X");
    expect("prestationType" in o).toBe(false);
    expect("vatRate" in o).toBe(false);
    expect("notes" in o).toBe(false);
  });
  it("round-trips whole ratios through linesForGuests at the same guest count", () => {
    const ev = event({
      guestCount: 20,
      recipes: [
        { lineId: "a", recipeId: "houmous", portions: 20 },
        { lineId: "b", recipeId: "poulet", portions: 40 },
        { lineId: "c", recipeId: "tarte", portions: 10 },
      ],
    });
    const o = offerFromEvent(ev, "Retour");
    expect(linesForGuests(o.lines, 20).map((l) => l.portions)).toEqual([20, 40, 10]);
  });
});

describe("eventFromOffer", () => {
  it("builds a valid create body with lines at the guest count", () => {
    const body = eventFromOffer(offer(), { name: "Mariage Dupont", date: "2026-10-17", guests: 30, clientId: "c1" });
    expect(body.name).toBe("Mariage Dupont");
    expect(body.date).toBe("2026-10-17");
    expect(body.guestCount).toBe(30);
    expect(body.recipes).toEqual([
      { recipeId: "houmous", portions: 30 },
      { recipeId: "poulet", portions: 30, course: "Plat" },
    ]);
    expect(body.pricingMode).toBe("par_convive");
    expect(body.sellingPricePerGuest).toBe(42);
    expect(body.sellingTotal).toBeUndefined();
    expect(body.prestationType).toBe("buffet_avec_service");
    expect(body.vatRate).toBe(12);
    expect(body.clientId).toBe("c1");
    expect(body.offerId).toBe("of1");
    expect(body.status).toBe("upcoming");
    expect(body.tasks).toEqual([]);
    expect(createEventRequestSchema.safeParse(body).success).toBe(true);
  });
  it("keeps the total and derives the per-guest price in total mode", () => {
    const body = eventFromOffer(offer({ pricingMode: "total", sellingTotal: 1000, sellingPricePerGuest: 50 }), {
      name: "X",
      date: "2026-10-17",
      guests: 3,
    });
    expect(body.pricingMode).toBe("total");
    expect(body.sellingTotal).toBe(1000);
    expect(body.sellingPricePerGuest).toBe(333.33);
    expect(createEventRequestSchema.safeParse(body).success).toBe(true);
  });
  it("copies revenue lines, extra costs and the given notes", () => {
    const body = eventFromOffer(
      offer({
        revenueLines: [{ label: "Service", amount: 450, vatRate: 21 }],
        extraCosts: [{ label: "Serveur", amount: 150, kind: "personnel" }],
        notes: "Note de l'offre",
      }),
      { name: "X", date: "2026-10-17", guests: 10, notes: "Note du client" },
    );
    expect(body.revenueLines).toEqual([{ label: "Service", amount: 450, vatRate: 21 }]);
    expect(body.extraCosts).toEqual([{ label: "Serveur", amount: 150, kind: "personnel" }]);
    expect(body.notes).toBe("Note du client");
    expect("clientId" in body).toBe(false);
  });
});

describe("mergeOfferLines", () => {
  it("adds 1 + 0,5 on the same recipe, keeps the current course and appends a new one", () => {
    const current: OfferLine[] = [{ recipeId: "poulet", portionsPerGuest: 1, course: "Plat" }];
    const merged = mergeOfferLines(current, [
      { recipeId: "poulet", portionsPerGuest: 0.5, course: "Buffet" },
      { recipeId: "tarte", portionsPerGuest: 1, course: "Dessert" },
    ]);
    expect(merged).toEqual([
      { recipeId: "poulet", portionsPerGuest: 1.5, course: "Plat" },
      { recipeId: "tarte", portionsPerGuest: 1, course: "Dessert" },
    ]);
    expect(current).toEqual([{ recipeId: "poulet", portionsPerGuest: 1, course: "Plat" }]);
  });
  it("returns the current lines unchanged when nothing comes in", () => {
    expect(mergeOfferLines([{ recipeId: "a", portionsPerGuest: 2 }], [])).toEqual([{ recipeId: "a", portionsPerGuest: 2 }]);
  });
});

describe("offerSummary", () => {
  it("costs the offer at guestCountRef and returns the list columns", () => {
    const s = offerSummary(offer(), recipeCostById, recipePortionsById, recipeById);
    expect(s).toEqual({ costPerGuest: 7, pricePerGuest: 42, marginPct: 83.33, incompleteRecipes: 1 });
  });
  it("reads 0 incomplete lines without a recipe lookup", () => {
    expect(offerSummary(offer(), recipeCostById, recipePortionsById).incompleteRecipes).toBe(0);
  });
});
