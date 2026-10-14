import type { AppEvent, EventExtraCost } from "../entities/event";
import type { Ingredient } from "../entities/ingredient";
import type { Recipe, RecipeIngredient } from "../entities/recipe";
import {
  buildCostSnapshot,
  calcEventCost,
  calcIngredientLineCost,
  calcLinesRawMaterial,
  calcRecipeCost,
  extrasByKind,
  rawMaterialOf,
  scaleQty,
  scaleQtyNumber,
  sumExtraCosts,
} from "./costing";

function ing(partial: Partial<Ingredient> & Pick<Ingredient, "ingredientId" | "price" | "unit">): Ingredient {
  return {
    name: partial.ingredientId,
    nameLower: partial.ingredientId,
    supplier: "Barn",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function line(ingredientId: string, qty: number, unit: RecipeIngredient["unit"], lossPct = 0): RecipeIngredient {
  return { ingredientId, qty, unit, lossPct };
}

function recipe(ingredients: RecipeIngredient[], portions = 4): Recipe {
  return {
    recipeId: "r1",
    name: "R",
    nameLower: "r",
    type: "Buffet",
    portions,
    portionWeight: 100,
    techniques: [],
    ingredients,
    photos: [],
    pricing: { surPlace: { coef: 3, tva: 12 }, takeAway: { coef: 3, tva: 6 }, chosenPrice: { surPlace: 0, takeAway: 0 } },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function event(partial: Partial<AppEvent>): AppEvent {
  return {
    eventId: "e1",
    name: "E",
    nameLower: "e",
    date: "2026-10-13",
    guestCount: 10,
    recipes: [],
    extraCosts: [],
    sellingPricePerGuest: 30,
    status: "upcoming",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("calcIngredientLineCost", () => {
  it("divides €/kg and €/l prices by 1000", () => {
    expect(calcIngredientLineCost(line("a", 500, "g"), ing({ ingredientId: "a", price: 10, unit: "€/kg" }))).toBeCloseTo(5);
    expect(calcIngredientLineCost(line("a", 250, "ml"), ing({ ingredientId: "a", price: 2, unit: "€/l" }))).toBeCloseTo(0.5);
  });
  it("uses the unit price as is for pieces and bunches", () => {
    expect(calcIngredientLineCost(line("a", 3, "pièce"), ing({ ingredientId: "a", price: 0.4, unit: "€/pièce" }))).toBeCloseTo(1.2);
    expect(calcIngredientLineCost(line("a", 2, "botte"), ing({ ingredientId: "a", price: 1.5, unit: "€/botte" }))).toBeCloseTo(3);
  });
  it("applies the loss percentage", () => {
    expect(calcIngredientLineCost(line("a", 1000, "g", 20), ing({ ingredientId: "a", price: 10, unit: "€/kg" }))).toBeCloseTo(12);
  });
});

describe("calcRecipeCost", () => {
  const byId = new Map<string, Ingredient>([
    ["flour", ing({ ingredientId: "flour", price: 2, unit: "€/kg" })],
    ["egg", ing({ ingredientId: "egg", price: 0.5, unit: "€/pièce" })],
  ]);
  it("sums the lines", () => {
    expect(calcRecipeCost(recipe([line("flour", 500, "g"), line("egg", 4, "pièce")]), byId)).toBeCloseTo(3);
  });
  it("ignores unknown ingredients", () => {
    expect(calcRecipeCost(recipe([line("flour", 500, "g"), line("ghost", 4, "pièce")]), byId)).toBeCloseTo(1);
  });
  it("is 0 for an empty recipe", () => {
    expect(calcRecipeCost(recipe([]), byId)).toBe(0);
  });
});

describe("scaleQty", () => {
  it("prints whole numbers without decimals", () => {
    expect(scaleQty(200, 2)).toBe("400");
    expect(scaleQty(4, 0.5)).toBe("2");
  });
  it("prints one decimal otherwise", () => {
    expect(scaleQty(3, 0.5)).toBe("1.5");
    expect(scaleQty(100, 1 / 3)).toBe("33.3");
  });
  it("scaleQtyNumber returns the raw product", () => {
    expect(scaleQtyNumber(3, 0.5)).toBe(1.5);
  });
});

describe("calcEventCost", () => {
  const costs = new Map<string, number>([["r1", 40], ["r2", 10]]);
  const portions = new Map<string, number>([["r1", 4], ["r2", 2]]);
  const lines = [
    { lineId: "l1", recipeId: "r1", portions: 10 },
    { lineId: "l2", recipeId: "r2", portions: 3 },
  ];

  it("sums recipe costs per portion when no actual cost or snapshot", () => {
    const ev = event({ recipes: lines });
    expect(calcLinesRawMaterial(ev, costs, portions)).toBeCloseTo(115);
    expect(rawMaterialOf(ev, costs, portions)).toBeCloseTo(115);
    expect(calcEventCost(ev, costs, portions).rawMaterial).toBeCloseTo(115);
  });

  it("prefers the snapshot over live recipe costs", () => {
    const ev = event({
      recipes: lines,
      costSnapshot: { rawMaterial: 99, extrasTotal: 0, lines: [], takenAt: "2026-10-01T00:00:00Z" },
    });
    expect(calcEventCost(ev, costs, portions).rawMaterial).toBe(99);
  });

  it("prefers the actual cost over the snapshot", () => {
    const ev = event({
      recipes: lines,
      actualCost: 80,
      costSnapshot: { rawMaterial: 99, extrasTotal: 0, lines: [], takenAt: "2026-10-01T00:00:00Z" },
    });
    expect(calcEventCost(ev, costs, portions).rawMaterial).toBe(80);
  });

  it("treats a null actual cost as absent", () => {
    const ev = event({ recipes: lines, actualCost: null });
    expect(calcEventCost(ev, costs, portions).rawMaterial).toBeCloseTo(115);
  });

  it("counts a missing recipe as 0", () => {
    const ev = event({ recipes: [...lines, { lineId: "l3", recipeId: "ghost", portions: 50 }] });
    expect(calcEventCost(ev, costs, portions).rawMaterial).toBeCloseTo(115);
  });

  it("falls back to one portion when the recipe has none", () => {
    const ev = event({ recipes: [{ lineId: "l1", recipeId: "r0", portions: 2 }] });
    expect(calcEventCost(ev, new Map([["r0", 7]]), new Map([["r0", 0]])).rawMaterial).toBeCloseTo(14);
  });

  it("splits extras by kind and reads an unknown kind as autre", () => {
    const extraCosts: EventExtraCost[] = [
      { label: "Fleurs", amount: 10, kind: "matiere" },
      { label: "Extra", amount: 20, kind: "personnel" },
      { label: "Salle", amount: 30, kind: "location" },
      { label: "Camionnette", amount: 40, kind: "transport" },
      { label: "Divers", amount: 5, kind: "autre" },
      { label: "Sans kind", amount: 1 },
      { label: "Encore", amount: 2, kind: "matiere" },
    ];
    expect(extrasByKind(extraCosts)).toEqual({ matiere: 12, personnel: 20, location: 30, transport: 40, autre: 6 });
    expect(sumExtraCosts(extraCosts)).toBe(108);
    expect(extrasByKind([])).toEqual({ matiere: 0, personnel: 0, location: 0, transport: 0, autre: 0 });
  });

  it("total is raw material plus every extra cost", () => {
    const ev = event({
      recipes: lines,
      extraCosts: [
        { label: "Salle", amount: 30, kind: "location" },
        { label: "Sans kind", amount: 1 },
      ],
    });
    const r = calcEventCost(ev, costs, portions);
    expect(r.rawMaterial).toBeCloseTo(115);
    expect(r.extras).toEqual({ matiere: 0, personnel: 0, location: 30, transport: 0, autre: 1 });
    expect(r.total).toBeCloseTo(146);
  });

  it("ignores tasks: an event with tasks costs and snapshots the same as without", () => {
    const tasks = [
      { taskId: "t1", label: "Dégeler le poisson", date: "2026-10-11" },
      { taskId: "t2", label: "Cuire les sablés", date: "2026-10-12", prepStatus: "done" as const },
      { taskId: "t3", label: "Dresser la salle", date: "2026-10-13", assignedTo: ["amelie"] },
    ];
    const without = event({ recipes: lines });
    const withTasks = event({ recipes: lines, tasks });
    expect(calcLinesRawMaterial(withTasks, costs, portions)).toBe(calcLinesRawMaterial(without, costs, portions));
    expect(calcEventCost(withTasks, costs, portions)).toEqual(calcEventCost(without, costs, portions));
    expect(buildCostSnapshot(withTasks, costs, portions)).toEqual(buildCostSnapshot(without, costs, portions));
    expect(buildCostSnapshot(withTasks, costs, portions).lines).toHaveLength(2);
  });

  it("total uses the actual cost when set, like today's EventEditor", () => {
    const ev = event({ recipes: lines, actualCost: 100, extraCosts: [{ label: "x", amount: 25, kind: "transport" }] });
    expect(calcEventCost(ev, costs, portions).total).toBeCloseTo(125);
  });
});

describe("buildCostSnapshot", () => {
  it("freezes unit costs per line, the raw material and the extras total", () => {
    const event = {
      recipes: [
        { lineId: "a", recipeId: "r1", portions: 30 },
        { lineId: "b", recipeId: "r2", portions: 10 },
        { lineId: "c", recipeId: "unknown", portions: 5 },
      ],
      extraCosts: [{ label: "Livraison", amount: 10.005 }, { label: "Extra", amount: 5 }],
    };
    const snapshot = buildCostSnapshot(event, new Map([["r1", 40], ["r2", 7.5]]), new Map([["r1", 10], ["r2", 4]]));
    expect(snapshot.lines).toEqual([
      { lineId: "a", recipeId: "r1", portions: 30, unitCost: 4 },
      { lineId: "b", recipeId: "r2", portions: 10, unitCost: 1.875 },
      { lineId: "c", recipeId: "unknown", portions: 5, unitCost: 0 },
    ]);
    expect(snapshot.rawMaterial).toBe(138.75);
    expect(snapshot.extrasTotal).toBe(15.01);
    expect("takenAt" in snapshot).toBe(false);
  });
  it("handles an event without lines", () => {
    expect(buildCostSnapshot({ recipes: [], extraCosts: [] }, new Map(), new Map())).toEqual({ rawMaterial: 0, extrasTotal: 0, lines: [] });
  });
  it("buildCostSnapshot treats recipe portions 0 as 1", () => {
    const snapshot = buildCostSnapshot({ recipes: [{ lineId: "a", recipeId: "r", portions: 2 }], extraCosts: [] }, new Map([["r", 10]]), new Map([["r", 0]]));
    expect(snapshot.rawMaterial).toBe(20);
    expect(snapshot.lines[0].unitCost).toBe(10);
  });
});

describe("legacy ingredient data", () => {
  it("costs a price stored as text with a comma and ignores a missing price", () => {
    const textPrice = ing({ ingredientId: "farine", price: "4,20" as unknown as number, unit: "€/kg" });
    expect(calcIngredientLineCost(line("farine", 500, "g"), textPrice)).toBeCloseTo(2.1);
    const noPrice = ing({ ingredientId: "sel", price: undefined as unknown as number, unit: "€/kg" });
    expect(calcIngredientLineCost(line("sel", 10, "g"), noPrice)).toBe(0);
  });

  it("builds a snapshot without NaN when a recipe cost is not a number", () => {
    const event = { recipes: [{ lineId: "l1", recipeId: "r1", portions: 30 }], extraCosts: [] } as unknown as AppEvent;
    const snap = buildCostSnapshot(event, new Map([["r1", Number.NaN]]), new Map([["r1", 10]]));
    expect(snap.lines[0].unitCost).toBe(0);
    expect(snap.rawMaterial).toBe(0);
  });
});
