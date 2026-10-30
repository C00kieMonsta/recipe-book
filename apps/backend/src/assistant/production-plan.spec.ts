import type { AppEvent, Ingredient, Recipe } from "@packages/types";
import { productionPlan } from "./production-plan";

const recipe = (extra: Partial<Recipe> = {}): Recipe => ({
  recipeId: "r1", name: "Soupe", nameLower: "soupe", type: "Plat", portions: 4, portionWeight: 100,
  techniques: ["Cuire au four."], ingredients: [{ ingredientId: "onion", qty: 200, unit: "g", lossPct: 10 }],
  photos: [], pricing: { surPlace: { coef: 4, tva: 12 }, takeAway: { coef: 3, tva: 6 }, chosenPrice: { surPlace: 0, takeAway: 0 } },
  createdAt: "", updatedAt: "", ...extra,
});
const ingredient: Ingredient = { ingredientId: "onion", name: "Oignons", nameLower: "oignons", price: 1, unit: "€/kg", supplier: "Vds", createdAt: "", updatedAt: "" };
const event = (extra: Partial<AppEvent> = {}): AppEvent => ({
  eventId: "e1", name: "Dîner", nameLower: "diner", date: "2026-10-30", guestCount: 8,
  recipes: [{ lineId: "line1", recipeId: "r1", portions: 8 }], tasks: [], extraCosts: [], sellingPricePerGuest: 20,
  status: "upcoming", createdAt: "", updatedAt: "", ...extra,
});

describe("productionPlan", () => {
  it("scales and sums onions across events, separating recipe and purchase quantities", () => {
    const plan = productionPlan([event(), event({ eventId: "e2", recipes: [{ lineId: "other", recipeId: "r1", portions: 4 }] })], [recipe()], [ingredient], "2026-10-30", "2026-10-30");
    expect(plan.ingredients).toEqual([{ ingredientId: "onion", name: "Oignons", unit: "g", qty: 600, purchaseQty: 660 }]);
  });

  it("counts one recipe once when several components are in the period and warns about the scope", () => {
    const plan = productionPlan([event({ tasks: [
      { taskId: "dough", label: "Cuire la pâte", date: "2026-10-28", recipeLineId: "line1", preparationId: "p1" },
      { taskId: "plating", label: "Dresser", date: "2026-10-30", recipeLineId: "line1", preparationId: "p2" },
    ] })], [recipe()], [ingredient], "2026-10-28", "2026-10-30");
    expect(plan.work.map((row) => row.taskId)).toEqual(["dough", "plating"]);
    expect(plan.ingredients[0].qty).toBe(400);
    expect(plan.warnings.join(" ")).toContain("recette entière");
  });

  it("keeps units separate and excludes finished work and completed events", () => {
    const r2 = recipe({ recipeId: "r2", ingredients: [{ ingredientId: "onion", qty: 2, unit: "pièce", lossPct: 0 }] });
    const plan = productionPlan([event({ recipes: [
      { lineId: "a", recipeId: "r1", portions: 4 },
      { lineId: "b", recipeId: "r2", portions: 4 },
      { lineId: "done", recipeId: "r1", portions: 100, prepStatus: "done" },
    ] }), event({ status: "completed" })], [recipe(), r2], [ingredient], "2026-10-30", "2026-10-30");
    expect(plan.ingredients.map((row) => [row.unit, row.qty])).toEqual([["g", 200], ["pièce", 2]]);
  });

  it("puts explicit cooking tasks first on the same day, using the component instructions", () => {
    const plan = productionPlan([event({ tasks: [
      { taskId: "plate", label: "Dressage", date: "2026-10-30", recipeLineId: "line1", preparationId: "plate" },
      { taskId: "bake", label: "Pâte", date: "2026-10-30", recipeLineId: "line1", preparationId: "bake" },
    ] })], [recipe({ preparations: [
      { preparationId: "bake", name: "Pâte", daysBefore: 0, description: "Cuire au four pendant 20 min." },
      { preparationId: "plate", name: "Dressage", daysBefore: 0 },
    ] })], [ingredient], "2026-10-30", "2026-10-30");
    expect(plan.work.map((row) => [row.taskId, row.cookingFirst])).toEqual([["bake", true], ["plate", false]]);
  });

  it("reports missing recipe data instead of inventing ingredient quantities", () => {
    const plan = productionPlan([event()], [], [], "2026-10-30", "2026-10-30");
    expect(plan.ingredients).toEqual([]);
    expect(plan.warnings[0]).toContain("r1");
  });
});
