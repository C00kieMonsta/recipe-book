import type { Ingredient } from "../entities/ingredient";
import { damerauLevenshtein, groupDuplicates, normalizeIngredientName, singularize } from "./normalize";

describe("normalizeIngredientName", () => {
  const cases: [string, string][] = [
    ["Oeuf", "oeuf"],
    ["Oeufs", "oeuf"],
    ["Œuf", "oeuf"],
    ["oeuf (pièce)", "oeuf"],
    ["OEUF x12", "oeuf"],
    ["pois chiche 400g bte", "chiche pois"],
    ["pois chiches", "chiche pois"],
    ["lait entier 1L", "entier lait"],
    ["Creme fraiche 35%", "creme fraiche"],
    ["Crème fraîche", "creme fraiche"],
    ["4x125g yaourt", "yaourt"],
    ["2 clementines", "clementine"],
    ["4 gousses d'ail", "ail gousse"],
    ["Farine T55", "farine t55"],
    ["sel", "sel"],
    ["sol", "sol"],
    ["chou-fleur", "choufleur"],
    ["beurre demi-sel", "beurre demisel"],
    ["Choux de Bruxelles", "bruxelle chou"],
    ["gateaux", "gateau"],
    ["noix de cajou", "cajou noix"],
    ["radis", "radis"],
    ["ananas", "ananas"],
    ["cassis", "cassis"],
    ["prix", "prix"],
    ["Tomates cerises - Delhaize", "cerise tomate"],
    ["Saumon fumé, tranché", "fume saumon"],
    ["Yaourt [bio] 2 pièces", "yaourt"],
    ["Basilic 1 botte", "basilic"],
    ["Carottes 1,5 kg", "carotte"],
    ["Huile d'olive 75cl", "huile olive"],
    ["Pain au levain", "au levain pain"],
    ["  Persil   plat  ", "persil plat"],
  ];
  it.each(cases)("%s -> %s", (raw, key) => {
    expect(normalizeIngredientName(raw)).toBe(key);
  });

  it("quantity regex needs a token boundary after the unit", () => {
    expect(normalizeIngredientName("4x125g yaourt")).toBe("yaourt");
    expect(normalizeIngredientName("2 clementines")).toBe("clementine");
    expect(normalizeIngredientName("Farine T55")).toBe("farine t55");
    expect(normalizeIngredientName("100g")).toBe("");
  });
});

describe("singularize", () => {
  it("follows the plan's exceptions", () => {
    expect(singularize("choux")).toBe("chou");
    expect(singularize("gateaux")).toBe("gateau");
    expect(singularize("noix")).toBe("noix");
    expect(singularize("pois")).toBe("pois");
    expect(singularize("tomates")).toBe("tomate");
    expect(singularize("des")).toBe("des");
    expect(singularize("bus")).toBe("bus");
    expect(singularize("virus")).toBe("virus");
    expect(singularize("cosmos")).toBe("cosmos");
  });
});

describe("damerauLevenshtein", () => {
  it("counts insert, delete, substitute and swap as one", () => {
    expect(damerauLevenshtein("poire", "poivre")).toBe(1);
    expect(damerauLevenshtein("sauge", "sauce")).toBe(1);
    expect(damerauLevenshtein("farine", "marine")).toBe(1);
    expect(damerauLevenshtein("oignon", "ognon")).toBe(1);
    expect(damerauLevenshtein("menthe", "mente")).toBe(1);
    expect(damerauLevenshtein("oeuf", "boeuf")).toBe(1);
    expect(damerauLevenshtein("sel", "sol")).toBe(1);
    expect(damerauLevenshtein("abcd", "abdc")).toBe(1);
    expect(damerauLevenshtein("chou", "choufleur")).toBe(5);
    expect(damerauLevenshtein("", "abc")).toBe(3);
    expect(damerauLevenshtein("abc", "abc")).toBe(0);
  });
});

type Candidate = Pick<Ingredient, "ingredientId" | "name" | "unit" | "updatedAt">;

function c(ingredientId: string, name: string, updatedAt = "2026-01-01T00:00:00Z", unit: Ingredient["unit"] = "€/kg"): Candidate {
  return { ingredientId, name, unit, updatedAt };
}

function groupOf(groups: ReturnType<typeof groupDuplicates>, id: string) {
  return groups.find((g) => g.members.some((m) => m.ingredientId === id));
}

function conf(groups: ReturnType<typeof groupDuplicates>, id: string) {
  return groupOf(groups, id)?.members.find((m) => m.ingredientId === id)?.confidence;
}

describe("groupDuplicates", () => {
  it("clusters exact keys as identique", () => {
    const groups = groupDuplicates([c("a", "Oeuf"), c("b", "Oeufs"), c("c", "OEUF x12"), c("d", "Carotte")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("oeuf");
    expect(groups[0].members.map((m) => m.ingredientId).sort()).toEqual(["a", "b", "c"]);
    expect(groups[0].members.every((m) => m.confidence === "identique")).toBe(true);
  });

  it("drops groups of one", () => {
    expect(groupDuplicates([c("a", "Carotte"), c("b", "Poireau")])).toEqual([]);
  });

  it("links poire / poivre, sauge / sauce, farine / marine as proche, never identique", () => {
    const groups = groupDuplicates([
      c("poire", "Poire"), c("poivre", "Poivre"),
      c("sauge", "Sauge"), c("sauce", "Sauce"),
      c("farine", "Farine"), c("marine", "Marine"),
    ]);
    expect(groups).toHaveLength(3);
    for (const g of groups) {
      const identique = g.members.filter((m) => m.confidence === "identique");
      expect(identique).toHaveLength(1);
      expect(identique[0].ingredientId).toBe(g.suggestedSurvivorId);
      const other = g.members.find((m) => m.ingredientId !== g.suggestedSurvivorId);
      expect(other?.confidence).toBe("proche");
    }
  });

  it("links oignon / ognon and menthe / mente as proche", () => {
    const groups = groupDuplicates([c("a", "Oignon"), c("b", "ognon"), c("c", "Menthe"), c("d", "mente")]);
    expect(groups).toHaveLength(2);
    expect(groupOf(groups, "a")).toBe(groupOf(groups, "b"));
    expect(groupOf(groups, "c")).toBe(groupOf(groups, "d"));
    expect([conf(groups, "a"), conf(groups, "b")].sort()).toEqual(["identique", "proche"]);
    expect([conf(groups, "c"), conf(groups, "d")].sort()).toEqual(["identique", "proche"]);
  });

  it("never links keys shorter than five characters: oeuf / boeuf, sel / sol", () => {
    expect(groupDuplicates([c("a", "Oeuf"), c("b", "Boeuf")])).toEqual([]);
    expect(groupDuplicates([c("a", "Sel"), c("b", "Sol")])).toEqual([]);
  });

  it("links oeuf / oeuf bio as a_verifier", () => {
    const groups = groupDuplicates([c("a", "Oeuf", "2026-02-01T00:00:00Z"), c("b", "Oeuf bio")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].suggestedSurvivorId).toBe("a");
    expect(conf(groups, "a")).toBe("identique");
    expect(conf(groups, "b")).toBe("a_verifier");
  });

  it("links other qualifier variants and the smoked case", () => {
    const groups = groupDuplicates([
      c("a", "Beurre"), c("b", "Beurre doux"), c("c", "Beurre demi-sel"),
      c("d", "Saumon"), c("e", "Saumon fumé"),
      c("f", "Farine"), c("g", "Farine T55"),
    ]);
    expect(groupOf(groups, "a")).toBe(groupOf(groups, "b"));
    expect(groupOf(groups, "a")).toBe(groupOf(groups, "c"));
    expect(groupOf(groups, "d")).toBe(groupOf(groups, "e"));
    expect(groupOf(groups, "f")).toBe(groupOf(groups, "g"));
    expect(groups).toHaveLength(3);
  });

  it("does not link subsets whose extra token is not a qualifier", () => {
    const groups = groupDuplicates([
      c("a", "Citron"), c("b", "Citron vert"),
      c("c", "Noix"), c("d", "Noix de cajou"),
      c("e", "Chou"), c("f", "Chou-fleur"),
      c("g", "Pomme"), c("h", "Pomme de terre"),
    ]);
    expect(groups).toEqual([]);
  });

  it("only includes identique members in the default set", () => {
    const groups = groupDuplicates([c("a", "Poire"), c("b", "Poivre"), c("c", "Oeuf"), c("d", "Oeuf bio")]);
    for (const g of groups) {
      const preselected = g.members.filter((m) => m.confidence === "identique");
      expect(preselected.map((m) => m.ingredientId)).toEqual([g.suggestedSurvivorId]);
    }
  });

  it("skips an ignored key", () => {
    const list = [c("a", "Oeuf"), c("b", "Oeufs"), c("c", "Carotte"), c("d", "Carottes")];
    expect(groupDuplicates(list)).toHaveLength(2);
    const groups = groupDuplicates(list, { ignoredKeys: ["oeuf"] });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("carotte");
  });

  it("suggests the survivor by recipe references, then updatedAt, then shortest name", () => {
    const refCounts = new Map([
      ["a", { recipeCount: 1, listCount: 0 }],
      ["b", { recipeCount: 3, listCount: 5 }],
    ]);
    const byRefs = groupDuplicates([c("a", "Oeuf", "2026-03-01T00:00:00Z"), c("b", "Oeufs", "2025-01-01T00:00:00Z")], { refCounts });
    expect(byRefs[0].suggestedSurvivorId).toBe("b");
    expect(byRefs[0].members.find((m) => m.ingredientId === "b")).toMatchObject({ recipeCount: 3, listCount: 5 });
    expect(byRefs[0].members.find((m) => m.ingredientId === "a")).toMatchObject({ recipeCount: 1, listCount: 0 });

    const byDate = groupDuplicates([c("a", "Oeuf", "2026-03-01T00:00:00Z"), c("b", "Oeufs", "2025-01-01T00:00:00Z")]);
    expect(byDate[0].suggestedSurvivorId).toBe("a");

    const byName = groupDuplicates([c("a", "Oeufs x12"), c("b", "Oeuf")]);
    expect(byName[0].suggestedSurvivorId).toBe("b");
    expect(byName[0].members[0].ingredientId).toBe("b");
  });

  it("reports zero counts when refCounts is missing", () => {
    const groups = groupDuplicates([c("a", "Oeuf"), c("b", "Oeufs")]);
    expect(groups[0].members.every((m) => m.recipeCount === 0 && m.listCount === 0)).toBe(true);
  });

  it("keeps unit on members so the page can flag mismatches", () => {
    const groups = groupDuplicates([c("a", "Oeuf", undefined, "€/pièce"), c("b", "Oeufs", undefined, "€/kg")]);
    expect(groups[0].members.map((m) => m.unit).sort()).toEqual(["€/kg", "€/pièce"]);
  });

  it("ignores names that normalise to nothing", () => {
    expect(groupDuplicates([c("a", "100g"), c("b", "2 pièces")])).toEqual([]);
  });
});
