import type { Ingredient } from "../entities/ingredient";
import type { Recipe } from "../entities/recipe";
import { suggestedPricePerGuest } from "./offers";
import { quoteGroups, type QuoteGroupsInput } from "./quote";

function ingredient(ingredientId: string, price: number, unit: Ingredient["unit"]): Ingredient {
  return {
    ingredientId,
    name: ingredientId,
    nameLower: ingredientId,
    price,
    unit,
    supplier: "Barn",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function recipe(recipeId: string, portions: number, ingredients: Recipe["ingredients"]): Recipe {
  return {
    recipeId,
    name: `Recette ${recipeId}`,
    nameLower: `recette ${recipeId}`,
    type: "Buffet",
    portions,
    portionWeight: 150,
    techniques: [],
    ingredients,
    photos: [],
    pricing: { surPlace: { coef: 4, tva: 12 }, takeAway: { coef: 3, tva: 6 }, chosenPrice: { surPlace: 0, takeAway: 0 } },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const ingredientById = new Map<string, Ingredient>([
  ["pois", ingredient("pois", 4, "€/kg")],
  ["tahini", ingredient("tahini", 20, "€/kg")],
  ["oeuf", ingredient("oeuf", 0.5, "€/pièce")],
]);

// menu: 14 € for 10 portions (1.40 each); risotto: 2.60 € for 4 (0.65); mousse: 16 € for 8 (2.00); eau: free.
const recipeById = new Map<string, Recipe>([
  ["menu", recipe("menu", 10, [
    { ingredientId: "pois", qty: 1000, unit: "g", lossPct: 0 },
    { ingredientId: "tahini", qty: 500, unit: "g", lossPct: 0 },
  ])],
  ["risotto", recipe("risotto", 4, [
    { ingredientId: "oeuf", qty: 2, unit: "pièce", lossPct: 0 },
    { ingredientId: "pois", qty: 400, unit: "g", lossPct: 0 },
  ])],
  ["mousse", recipe("mousse", 8, [{ ingredientId: "tahini", qty: 800, unit: "g", lossPct: 0 }])],
  ["eau", recipe("eau", 1, [])],
]);

function input(partial: Partial<QuoteGroupsInput> = {}): QuoteGroupsInput {
  return {
    groups: [{ label: "Menu XYZ", guests: 50, lines: [{ recipeId: "menu" }], pricePerGuest: 55 }],
    foodVatRate: 12,
    recipeById,
    ingredientById,
    suggest: (c) => suggestedPricePerGuest(c),
    ...partial,
  };
}

describe("quoteGroups", () => {
  it("prices two groups, one given at 55 € and one suggested", () => {
    const out = quoteGroups(
      input({
        groups: [
          { label: "Menu XYZ", guests: 50, lines: [{ recipeId: "menu" }], pricePerGuest: 55 },
          { label: "Menu ABC", guests: 1, lines: [{ recipeId: "risotto" }, { recipeId: "mousse" }] },
        ],
      }),
    );
    expect(out.groups).toHaveLength(2);
    const [a, b] = out.groups;
    expect(a).toMatchObject({
      label: "Menu XYZ",
      guests: 50,
      cost: 70,
      costPerGuest: 1.4,
      pricePerGuest: 55,
      priceSource: "donné",
      revenueHtva: 2750,
      marginHtva: 2680,
      marginPct: 97.45,
    });
    expect(a.lines).toEqual([{ recipeId: "menu", name: "Recette menu", portions: 50, cost: 70 }]);
    expect(b).toMatchObject({
      label: "Menu ABC",
      guests: 1,
      cost: 2.65,
      costPerGuest: 2.65,
      pricePerGuest: 8.83,
      priceSource: "suggéré",
      revenueHtva: 8.83,
      marginHtva: 6.18,
      marginPct: 69.99,
    });
    expect(b.lines.map((l) => l.cost)).toEqual([0.65, 2]);
    expect(out.totals).toMatchObject({ guests: 51, cost: 72.65, foodHtva: 2758.83, extrasHtva: 0, htva: 2758.83 });
    expect(out.totals.vatByRate).toEqual({ "12": 331.06 });
    expect(out.totals.tvac).toBe(3089.89);
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0]).toMatch(/Prix suggéré pour « Menu ABC »/);
    expect(out.notes[0]).toMatch(/8,83/);
  });

  it("adds extras at 21 % on top of the food VAT", () => {
    const out = quoteGroups(input({ extras: [{ label: "Livraison", amount: 150, vatRate: 21 }] }));
    expect(out.extras).toEqual([{ label: "Livraison", amount: 150, vatRate: 21, vat: 31.5 }]);
    expect(out.totals).toEqual({
      guests: 50,
      cost: 70,
      foodHtva: 2750,
      extrasHtva: 150,
      htva: 2900,
      vatByRate: { "12": 330, "21": 31.5 },
      tvac: 3261.5,
      marginHtva: 2830,
      marginPct: 97.59,
    });
    expect(out.notes).toEqual([]);
  });

  it("groups VAT by rate and merges extras that share the food rate", () => {
    const out = quoteGroups(
      input({
        foodVatRate: 6,
        extras: [
          { label: "Service", amount: 100, vatRate: 21 },
          { label: "Location", amount: 50, vatRate: 21 },
          { label: "Boissons", amount: 20, vatRate: 6 },
          { label: "Exonéré", amount: 10, vatRate: 0 },
        ],
      }),
    );
    expect(out.totals.vatByRate).toEqual({ "6": 166.2, "21": 31.5, "0": 0 });
    expect(out.totals.htva).toBe(2930);
    expect(out.totals.tvac).toBe(3127.7);
  });

  it("flags an unknown recipe, counts it at 0 and adds a note", () => {
    const out = quoteGroups(
      input({ groups: [{ label: "Buffet", guests: 10, lines: [{ recipeId: "menu" }, { recipeId: "inconnue" }], pricePerGuest: 20 }] }),
    );
    const g = out.groups[0];
    expect(g.lines[1]).toEqual({ recipeId: "inconnue", name: "inconnue", portions: 10, cost: 0, missing: true });
    expect(g.lines[0].missing).toBeUndefined();
    expect(g.cost).toBe(14);
    expect(out.notes).toEqual(["Recette inconnue : « inconnue », comptée à 0,00 €."]);
  });

  it("multiplies portions by portionsPerGuest", () => {
    const out = quoteGroups(
      input({ groups: [{ label: "Apéro", guests: 10, lines: [{ recipeId: "menu", portionsPerGuest: 3 }], pricePerGuest: 12 }] }),
    );
    const g = out.groups[0];
    expect(g.lines[0]).toMatchObject({ portions: 30, cost: 42 });
    expect(g.costPerGuest).toBe(4.2);
    expect(g.revenueHtva).toBe(120);
    expect(g.marginHtva).toBe(78);
    expect(g.marginPct).toBe(65);
  });

  it("gives a 100 % margin with a given price and cost 0, and 0 % when the suggested price is 0", () => {
    const given = quoteGroups(input({ groups: [{ label: "Eau", guests: 5, lines: [{ recipeId: "eau" }], pricePerGuest: 10 }] }));
    expect(given.groups[0]).toMatchObject({ cost: 0, costPerGuest: 0, revenueHtva: 50, marginHtva: 50, marginPct: 100 });
    expect(given.totals).toMatchObject({ cost: 0, htva: 50, marginHtva: 50, marginPct: 100 });

    const suggested = quoteGroups(input({ groups: [{ label: "Eau", guests: 5, lines: [{ recipeId: "eau" }] }] }));
    expect(suggested.groups[0]).toMatchObject({ pricePerGuest: 0, priceSource: "suggéré", revenueHtva: 0, marginHtva: 0, marginPct: 0 });
    expect(suggested.totals).toMatchObject({ htva: 0, tvac: 0, marginPct: 0 });
    expect(Number.isNaN(suggested.totals.marginPct)).toBe(false);
  });

  it("rejects a group with zero guests", () => {
    expect(() => quoteGroups(input({ groups: [{ label: "Vide", guests: 0, lines: [{ recipeId: "menu" }] }] }))).toThrow(
      /convives du groupe « Vide »/,
    );
    expect(() => quoteGroups(input({ groups: [{ label: "Négatif", guests: -3, lines: [] }] }))).toThrow(/supérieur à zéro/);
  });

  it("falls back to 12 % food VAT when the rate is not a number", () => {
    const out = quoteGroups(input({ foodVatRate: Number.NaN }));
    expect(out.totals.vatByRate).toEqual({ "12": 330 });
  });
});
