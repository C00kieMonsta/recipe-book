import type { CompanySettings, PrestationTypeSetting } from "../entities/settings";
import { DEFAULT_PRESTATION_TYPES } from "../entities/settings";
import type { DocRow, DocSection, OfferDocument } from "../entities/offer-document";
import { DEFAULT_DOC_CONDITIONS, DEFAULT_DOC_SERVICES, DEFAULT_DOC_VAT_LINES } from "../entities/offer-document";
import type { Offer } from "../entities/offer";
import { createOfferSchema, updateOfferSchema } from "../dto/offers";
import {
  type DocPrintBlock,
  choiceLabelOf,
  documentBlocks,
  documentFileName,
  documentSectionFor,
  documentSummary,
  foodVatRateOf,
  guestsFact,
  minimumLabelOf,
  mixWithWhite,
  offerFromSection,
  offerSyncFromSection,
  priceLabelOf,
  revenueLinesFromRows,
  rowMinimumWarnings,
  sectionFromOffer,
  sectionRecipeLines,
  unitKindOf,
} from "./offer-document";

const prestationTypes: PrestationTypeSetting[] = DEFAULT_PRESTATION_TYPES;

// fmtEur separates the number and the sign with a narrow no-break space.
function plain(s: string | undefined): string | undefined {
  return s?.replace(/[  ]/g, " ");
}

function plat(rowId: string, text: string, extra: Partial<DocRow> = {}): DocRow {
  return { rowId, kind: "plat", text, ...extra };
}

function section(partial: Partial<DocSection> = {}): DocSection {
  return {
    sectionId: "buffet-2",
    title: "BUFFET 2, La Tavola Italiana",
    price: 34.5,
    unitLabel: "par personne",
    unitKind: "convive",
    rows: [
      plat("b2-vitello", "Vitello tonnato, artichauts grillés, parmesan, roquette", { recipeId: "vitello" }),
      plat("b2-polpettes", "Polpettes italiennes, sauce tomate mijotée, parmesan", { tags: ["chaud"] }),
      plat("b2-burrata", "Burrata, tomates confites"),
    ],
    ...partial,
  };
}

function entreeGroup(): DocSection {
  return {
    sectionId: "food",
    title: "FOOD",
    price: 65,
    unitLabel: "par personne",
    unitKind: "convive",
    rows: [
      { rowId: "apero", kind: "sous_titre", text: "Apéritif" },
      plat("apero-plateaux", "Plateaux apéritifs", { recipeId: "plateaux" }),
      { rowId: "apero-ex", kind: "exemple", text: "sablé au comté et mousse de chèvre", recipeId: "sable" },
      { rowId: "entree", kind: "sous_titre", text: "Entrée", choice: { count: 1, scope: "table" } },
      plat("e1", "Mousse de chèvre, betterave confite", { tags: ["froid"], recipeId: "chevre" }),
      plat("e2", "Ceviche de daurade", { tags: ["froid"] }),
      plat("e3", "Saumon mi-cuit laqué au soja", { tags: ["tiède"] }),
      plat("e4", "Eglefin en croûte de pistaches", { tags: ["chaud"] }),
      plat("e5", "Saint-Jacques snackées", { tags: ["chaud"] }),
      plat("e6", "Aubergine confite à l'asiatique", { tags: ["tiède"] }),
      plat("e7", "Oeuf parfait, bouillon dashi", { tags: ["chaud"] }),
      { rowId: "dessert", kind: "sous_titre", text: "Dessert", choice: { count: 1, scope: "table" } },
      plat("d1", "Cheesecake au speculoos", { recipeId: "cheesecake" }),
      plat("d2", "Pavlova aux fruits de saison", { recipeId: "pavlova" }),
    ],
  };
}

function carteSection(): DocSection {
  return {
    sectionId: "finger-froids",
    title: "Finger food / zakouskis froids",
    unitLabel: "à la pièce",
    unitKind: "piece",
    minimum: { qty: 20, unit: "pieces", perSort: true },
    rows: [
      plat("choux", "Choux fourrés au saumon fumé et fromage frais", { price: 2.25 }),
      plat("sables", "Sablés au comté et mousse de chèvre", { price: 0.9 }),
      plat("truffe", "Truffe de fromage de chèvre", { priceNote: "à voir ensemble" }),
    ],
  };
}

function document(partial: Partial<OfferDocument> = {}): OfferDocument {
  return {
    documentId: "doc-ah",
    title: "Offre buffets automne hiver",
    titleLower: "offre buffets automne hiver",
    year: 2026,
    season: "automne_hiver",
    prestationType: "buffet_avec_service",
    prestationLabel: "Avec ou sans service, A emporter ou avec livraison",
    minGuests: 20,
    note: "Chaque élément (apéro, buffet, dessert, mignardises) peut se choisir séparément.",
    sections: [
      {
        sectionId: "aperitif",
        title: "APERITIF",
        price: 8.5,
        unitLabel: "par personne",
        unitKind: "convive",
        rows: [
          plat("aperitif-plateau", "Plateau apéro (crudités de saison, dip, crackers, noix, fromage et olives)"),
          { rowId: "aperitif-ex", kind: "exemple", text: "sablé au comté et mousse de chèvre, blinis mousse de truite" },
        ],
      },
      {
        sectionId: "plateaux",
        title: "PLATEAUX A PARTAGER",
        unitLabel: "par personne",
        unitKind: "convive",
        minimum: { qty: 8, unit: "personnes" },
        rows: [
          plat("plateaux-apero", "Plateau apéro", { price: 4.2 }),
          plat("plateaux-boite", "Boîte antipasti à partager", { price: 58, unitLabel: "pour 6 personnes", unitKind: "unite" }),
          plat("plateaux-meme", "Plateau gourmand", { price: 13.5, unitLabel: "par personne" }),
        ],
      },
    ],
    services: { ...DEFAULT_DOC_SERVICES, title: "EXTRAS" },
    conditions: DEFAULT_DOC_CONDITIONS,
    vatLines: [
      { label: "Food", rate: 12 },
      { label: "Services", rate: 21 },
    ],
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-12T00:00:00Z",
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
      { recipeId: "poulet", portionsPerGuest: 1 },
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

const company: CompanySettings = {
  name: "Table d'Amélie SRL",
  vatNumber: "BE0766.607.232",
  address: "Drogenberg 55 A, 3090 Overijse",
  phone: "0032486.54.60.17",
  email: "tabledamelie@gmail.com",
  website: "www.tabledamelie.be",
};

describe("guestsFact", () => {
  it("prints the minimum when only minGuests is set", () => {
    expect(guestsFact({ minGuests: 20 })).toEqual(["Nombre minimum de personnes", "20"]);
  });
  it("prints a range with both bounds", () => {
    expect(guestsFact({ minGuests: 8, maxGuests: 14 })).toEqual(["Nombre de personnes", "entre 8 et 14"]);
  });
  it("prints the override as the value", () => {
    expect(guestsFact({ minGuests: 8, maxGuests: 14, guestsLabel: "entre 8 et 14 personnes" })).toEqual([
      "Nombre de personnes",
      "entre 8 et 14 personnes",
    ]);
    expect(guestsFact({ guestsLabel: "à partir de 20 personnes" })).toEqual(["Nombre de personnes", "à partir de 20 personnes"]);
    expect(guestsFact({ minGuests: 8, guestsLabel: "8, sauf certains éléments, voir détails" })).toEqual([
      "Nombre minimum de personnes",
      "8, sauf certains éléments, voir détails",
    ]);
  });
  it("is undefined when nothing is set", () => {
    expect(guestsFact({})).toBeUndefined();
    expect(guestsFact({ guestsLabel: "  " })).toBeUndefined();
  });
});

describe("minimumLabelOf", () => {
  it("prints the unit and the per-sort suffix", () => {
    expect(minimumLabelOf({ qty: 20, unit: "pieces", perSort: true })).toBe("minimum 20 pièces par sorte");
    expect(minimumLabelOf({ qty: 8, unit: "personnes" })).toBe("minimum 8 personnes");
    expect(minimumLabelOf({ qty: 12, unit: "unites" })).toBe("minimum 12 unités");
    expect(minimumLabelOf({ qty: 1, unit: "personnes" })).toBe("minimum 1 personne");
  });
  it("prints the override as is", () => {
    expect(minimumLabelOf({ qty: 12, unit: "pieces", label: "min par 12" })).toBe("min par 12");
  });
});

describe("choiceLabelOf", () => {
  it("derives the printed rule", () => {
    expect(choiceLabelOf({ count: 1, scope: "table" })).toBe("un choix pour la table");
    expect(choiceLabelOf({ count: 4, scope: "table" })).toBe("sélection de 4 au choix");
    expect(choiceLabelOf({ count: 2, scope: "convive" })).toBe("2 au choix par convive");
  });
  it("prints the override as is", () => {
    expect(choiceLabelOf({ count: 4, scope: "table", label: "sélection de 4 assiettes au choix" })).toBe(
      "sélection de 4 assiettes au choix",
    );
  });
});

describe("unitKindOf", () => {
  it("matches presets without case or accents", () => {
    expect(unitKindOf("Par Personne")).toBe("convive");
    expect(unitKindOf("A LA PIECE")).toBe("piece");
    expect(unitKindOf("par 300 g")).toBe("unite");
  });
  it("falls back for a free label or none", () => {
    expect(unitKindOf("par plateau")).toBe("unite");
    expect(unitKindOf("par plateau", "piece")).toBe("piece");
    expect(unitKindOf(undefined, "convive")).toBe("convive");
    expect(unitKindOf(undefined)).toBe("unite");
  });
});

describe("priceLabelOf", () => {
  it("formats the price, the àpd floor and the note", () => {
    expect(plain(priceLabelOf({ price: 2.25 }))).toBe("2,25 €");
    expect(plain(priceLabelOf({ price: 4.5, fromPrice: true }))).toBe("àpd 4,50 €");
    expect(priceLabelOf({ priceNote: "supplément en fonction du nombre de personnes" })).toBe(
      "supplément en fonction du nombre de personnes",
    );
    expect(priceLabelOf({})).toBeUndefined();
  });
});

describe("documentFileName", () => {
  it("joins the title and the year", () => {
    expect(documentFileName({ title: "Offre buffets automne hiver", year: 2026 })).toBe("Offre buffets automne hiver 2026.pdf");
    expect(documentFileName({ title: "Carte à emporter", year: 2026 })).toBe("Carte à emporter 2026.pdf");
  });
  it("strips the characters a file name refuses", () => {
    expect(documentFileName({ title: "Offre walking / dinner: été?", year: 2026 })).toBe("Offre walking dinner été 2026.pdf");
  });
});

describe("foodVatRateOf", () => {
  it("reads the prestation's default rate", () => {
    expect(foodVatRateOf({ prestationType: "buffet_a_emporter" }, prestationTypes)).toBe(6);
    expect(foodVatRateOf({ prestationType: "atelier" }, prestationTypes)).toBe(21);
  });
  it("falls back to 12 without a prestation or with an unknown one", () => {
    expect(foodVatRateOf({}, prestationTypes)).toBe(12);
    expect(foodVatRateOf({ prestationType: "inconnu" }, prestationTypes)).toBe(12);
  });
});

describe("sectionRecipeLines", () => {
  it("shares a choice group of 7 across its linked row", () => {
    const lines = sectionRecipeLines(entreeGroup());
    expect(lines).toEqual([
      { recipeId: "plateaux", portionsPerGuest: 1 },
      { recipeId: "chevre", portionsPerGuest: 0.14 },
      { recipeId: "cheesecake", portionsPerGuest: 0.5 },
      { recipeId: "pavlova", portionsPerGuest: 0.5 },
    ]);
  });
  it("gives 1 per linked row on a buffet", () => {
    const s = section({
      rows: [
        plat("a", "Vitello", { recipeId: "vitello" }),
        plat("b", "Polpettes"),
        plat("c", "Burrata", { recipeId: "burrata" }),
      ],
    });
    expect(sectionRecipeLines(s)).toEqual([
      { recipeId: "vitello", portionsPerGuest: 1 },
      { recipeId: "burrata", portionsPerGuest: 1 },
    ]);
  });
  it("ignores exemple rows even with a recipe", () => {
    const lines = sectionRecipeLines(entreeGroup());
    expect(lines.map((l) => l.recipeId)).not.toContain("sable");
  });
  it("takes the course from the nearest sous_titre when it matches a category", () => {
    const lines = sectionRecipeLines(entreeGroup(), ["Apéritif", "Entrée", "Plat", "Dessert"]);
    expect(lines.map((l) => l.course)).toEqual(["Apéritif", "Entrée", "Dessert", "Dessert"]);
    expect(sectionRecipeLines(entreeGroup(), ["Plat"]).every((l) => l.course === undefined)).toBe(true);
  });
});

describe("offerFromSection", () => {
  it("keeps the price and the prestation and lists the unlinked rows in notes", () => {
    const out = offerFromSection(document(), section(), prestationTypes);
    expect(out.name).toBe("Offre buffets automne hiver 2026 › BUFFET 2, La Tavola Italiana");
    expect(out.sellingPricePerGuest).toBe(34.5);
    expect(out.prestationType).toBe("buffet_avec_service");
    expect(out.vatRate).toBe(12);
    expect(out.guestCountRef).toBe(20);
    expect(out.pricingMode).toBe("par_convive");
    expect(out.lines).toEqual([{ recipeId: "vitello", portionsPerGuest: 1 }]);
    expect(out.notes).toBe(
      "Plats sans recette : Polpettes italiennes, sauce tomate mijotée, parmesan · Burrata, tomates confites",
    );
    expect(createOfferSchema.safeParse(out).success).toBe(true);
  });
  it("takes the given name and leaves notes out when every plat is linked", () => {
    const s = section({ rows: [plat("a", "Vitello", { recipeId: "vitello" })] });
    const out = offerFromSection(document({ prestationType: undefined, minGuests: undefined }), s, prestationTypes, "Buffet 2");
    expect(out.name).toBe("Buffet 2");
    expect(out.notes).toBeUndefined();
    expect(out.prestationType).toBeUndefined();
    expect(out.vatRate).toBe(12);
    expect(out.guestCountRef).toBe(20);
  });
});

describe("sectionFromOffer", () => {
  it("builds a formula section with one plat row per line", () => {
    let n = 0;
    const ids = () => `id-${++n}`;
    const names = new Map([
      ["houmous", "Houmous de betterave"],
      ["poulet", "Poulet basquaise"],
    ]);
    const s = sectionFromOffer(offer(), names, ids);
    expect(s).toEqual({
      sectionId: "id-1",
      title: "Buffet 1",
      price: 42,
      unitLabel: "par personne",
      unitKind: "convive",
      rows: [
        { rowId: "id-2", kind: "plat", text: "Houmous de betterave", recipeId: "houmous" },
        { rowId: "id-3", kind: "plat", text: "Poulet basquaise", recipeId: "poulet" },
      ],
      offerId: "of1",
    });
  });
  it("round-trips through offerSyncFromSection with the same lines", () => {
    const source = offer();
    const s = sectionFromOffer(source, new Map(), () => Math.random().toString(36).slice(2, 10));
    const sync = offerSyncFromSection(document(), s, prestationTypes);
    expect(sync.lines).toEqual(source.lines);
    expect(sync.sellingPricePerGuest).toBe(42);
    expect(sync.vatRate).toBe(12);
    expect(sync.prestationType).toBe("buffet_avec_service");
    expect(sync.notes).toBeNull();
    expect(updateOfferSchema.safeParse(sync).success).toBe(true);
  });
  it("clears the prestation and lists the unlinked rows on sync", () => {
    const sync = offerSyncFromSection(document({ prestationType: undefined }), section(), prestationTypes);
    expect(sync.prestationType).toBeNull();
    expect(sync.notes).toMatch(/^Plats sans recette : Polpettes/);
  });
});

describe("revenueLinesFromRows", () => {
  it("multiplies and rounds, and skips an unpriced row", () => {
    const s = carteSection();
    const out = revenueLinesFromRows(
      [
        { row: s.rows[0], qty: 60 },
        { row: s.rows[1], qty: 12 },
        { row: s.rows[2], qty: 5 },
      ],
      6,
    );
    expect(out).toEqual([
      { label: "Carte · Choux fourrés au saumon fumé et fromage frais × 60", amount: 135, vatRate: 6 },
      { label: "Carte · Sablés au comté et mousse de chèvre × 12", amount: 10.8, vatRate: 6 },
    ]);
  });
});

describe("rowMinimumWarnings", () => {
  it("flags a pick under a per-sort pieces minimum and nothing at the minimum", () => {
    const s = carteSection();
    expect(rowMinimumWarnings(s, [{ row: s.rows[1], qty: 12 }], 20)).toEqual([
      "Minimum 20 pièces par sorte : Sablés au comté et mousse de chèvre (12)",
    ]);
    expect(rowMinimumWarnings(s, [{ row: s.rows[0], qty: 20 }, { row: s.rows[1], qty: 60 }], 20)).toEqual([]);
  });
  it("checks a per-guest row against the guests", () => {
    const s = document().sections[1];
    expect(rowMinimumWarnings(s, [{ row: s.rows[0], qty: 6 }], 6)).toEqual(["Minimum 8 personnes : Plateau apéro (6)"]);
    expect(rowMinimumWarnings(s, [{ row: s.rows[0], qty: 1 }], 8)).toEqual([]);
  });
  it("is empty without a section minimum", () => {
    const s = section();
    expect(rowMinimumWarnings(s, [{ row: s.rows[0], qty: 1 }], 1)).toEqual([]);
  });
});

describe("documentBlocks", () => {
  const blocks = documentBlocks(document(), company);

  it("starts with the band and the company block", () => {
    expect(blocks[0]).toEqual({ kind: "band", text: "OFFRE BUFFETS AUTOMNE HIVER 2026" });
    expect(blocks[1]).toEqual({
      kind: "company",
      lines: [
        "Table d'Amélie SRL",
        "Drogenberg 55 A, 3090 Overijse",
        "TVA BE0766.607.232",
        "0032486.54.60.17",
        "tabledamelie@gmail.com",
        "www.tabledamelie.be",
      ],
      facts: [
        ["Type de prestation", "Avec ou sans service, A emporter ou avec livraison"],
        ["Nombre minimum de personnes", "20"],
        ["Note", "Chaque élément (apéro, buffet, dessert, mignardises) peut se choisir séparément."],
      ],
    });
  });
  it("yields one section block per section with its price, unit and minimum", () => {
    const sections = blocks.filter((b) => b.kind === "section");
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ title: "APERITIF", unit: "par personne" });
    expect(plain((sections[0] as { price?: string }).price)).toBe("8,50 €");
    expect(sections[1]).toMatchObject({ title: "PLATEAUX A PARTAGER", unit: "par personne", minimum: "minimum 8 personnes" });
    expect((sections[1] as { price?: string }).price).toBeUndefined();
  });
  it("leaves the band unit empty on a price list without unitLabel and prints every row unit", () => {
    const section: DocSection = { ...carteSection(), unitLabel: undefined, unitKind: undefined, rows: [plat("tarte", "Tarte", { price: 12, unitLabel: "gâteau 8 parts", unitKind: "unite" })] };
    const out = documentBlocks(document({ sections: [section] }), company);
    expect(out.find((b) => b.kind === "section")).not.toHaveProperty("unit");
    expect(out.find((b) => b.kind === "row")).toMatchObject({ unit: "gâteau 8 parts" });
  });
  it("prints exemple rows indented with the prefix and no price", () => {
    const ex = blocks.find((b) => b.kind === "row" && b.style === "exemple");
    expect(ex).toEqual({ kind: "row", style: "exemple", text: "ex : sablé au comté et mousse de chèvre, blinis mousse de truite", indent: 1 });
  });
  it("prints a row unit only when it differs from the section unit", () => {
    const rows = blocks.filter((b): b is Extract<typeof b, { kind: "row" }> => b.kind === "row" && b.style === "plat");
    const apero = rows.find((r) => r.text === "Plateau apéro");
    expect(plain(apero?.price)).toBe("4,20 €");
    expect(apero?.unit).toBeUndefined();
    const boite = rows.find((r) => r.text === "Boîte antipasti à partager");
    expect(boite?.unit).toBe("pour 6 personnes");
    const gourmand = rows.find((r) => r.text === "Plateau gourmand");
    expect(gourmand?.unit).toBeUndefined();
    const formulaRow = rows.find((r) => r.text.startsWith("Plateau apéro (crudités"));
    expect(formulaRow).toMatchObject({ indent: 0 });
    expect(formulaRow?.price).toBeUndefined();
  });
  it("appends tags and the choice and indents rows under a sous_titre", () => {
    const out = documentBlocks(document({ sections: [entreeGroup()] }), company);
    const rows = out.filter((b): b is Extract<typeof b, { kind: "row" }> => b.kind === "row");
    expect(rows[0]).toEqual({ kind: "row", style: "sous_titre", text: "Apéritif", indent: 0 });
    expect(rows[1]).toMatchObject({ style: "plat", text: "Plateaux apéritifs", indent: 1 });
    expect(rows[3]).toEqual({ kind: "row", style: "sous_titre", text: "Entrée (un choix pour la table)", indent: 0 });
    expect(rows[4]).toMatchObject({ style: "plat", text: "Mousse de chèvre, betterave confite (froid)", indent: 1 });
  });
  it("ends with services, conditions and the vat block", () => {
    const services = blocks.find((b) => b.kind === "services");
    expect(services).toMatchObject({ title: "EXTRAS", intro: DEFAULT_DOC_SERVICES.intro });
    const rows = (services as Extract<DocPrintBlock, { kind: "services" }>).rows;
    expect(plain(rows[0].price)).toBe("50,00 €");
    expect(rows[0].unit).toBe("€/heure (htva)");
    expect(rows[2]).toEqual({ text: "Transport", price: "forfait (htva) en fonction de l'adresse" });
    expect(blocks[blocks.length - 2]).toEqual({ kind: "conditions", text: DEFAULT_DOC_CONDITIONS });
    expect(blocks[blocks.length - 1]).toEqual({
      kind: "vat",
      rows: [
        ["Food", "12 %"],
        ["Services", "21 %"],
      ],
    });
  });
  it("has no services block when hidden and no company lines without a company", () => {
    const out = documentBlocks(document({ services: { ...DEFAULT_DOC_SERVICES, shown: false }, vatLines: DEFAULT_DOC_VAT_LINES }), undefined);
    expect(out.some((b) => b.kind === "services")).toBe(false);
    expect(out[1]).toMatchObject({ kind: "company", lines: [] });
    expect(out[out.length - 1]).toMatchObject({ kind: "vat", rows: [["Food à emporter", "6 %"], ["Food avec service", "12 %"], ["Extras", "21 %"]] });
  });
});


describe("documentSummary", () => {
  it("counts sections, rows, priced and linked rows", () => {
    expect(documentSummary(document())).toEqual({ sections: 2, rows: 5, priced: 3, linked: 0 });
    expect(documentSummary(document({ sections: [entreeGroup()] }))).toEqual({ sections: 1, rows: 14, priced: 0, linked: 5 });
  });
});

describe("documentSectionFor", () => {
  it("finds the document and section behind an offer", () => {
    const d = document({ sections: [section({ offerId: "of1" }), section({ sectionId: "b3", offerId: "of2" })] });
    const hit = documentSectionFor([document(), d], "of2");
    expect(hit?.document.documentId).toBe("doc-ah");
    expect(hit?.section.sectionId).toBe("b3");
    expect(documentSectionFor([document()], "of9")).toBeUndefined();
    expect(documentSectionFor([d], "")).toBeUndefined();
  });
});

describe("mixWithWhite", () => {
  it("blends the accent over white", () => {
    expect(mixWithWhite("#E8847A", 0.3)).toBe("#F8DAD7");
    expect(mixWithWhite("#e8847a", 1)).toBe("#E8847A");
    expect(mixWithWhite("#000000", 0)).toBe("#FFFFFF");
  });
  it("expands a short hex and falls back on garbage", () => {
    expect(mixWithWhite("#fff", 0.5)).toBe("#FFFFFF");
    expect(mixWithWhite("red", 0.3)).toBe("#F8DAD7");
  });
});
