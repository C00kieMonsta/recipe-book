import { readFileSync } from "fs";
import { join } from "path";
import type { CreateOfferDocumentRequest, DocRow, DocSection } from "@packages/types";
import { createOfferDocumentSchema, documentFileName } from "@packages/types";

const FIXTURE = join(__dirname, "fixtures", "offer-documents-2026.json");

const raw = JSON.parse(readFileSync(FIXTURE, "utf8")) as unknown[];
const documents: CreateOfferDocumentRequest[] = raw.map((entry) => createOfferDocumentSchema.parse(entry));

const byTitle = (title: string) => documents.find((d) => d.title === title) as CreateOfferDocumentRequest;
const sectionOf = (d: CreateOfferDocumentRequest, title: string) => d.sections.find((s) => s.title === title) as DocSection;
const rowOf = (s: { rows: DocRow[] }, start: string) => s.rows.find((r) => r.text.startsWith(start)) as DocRow;
const allRows = (d: CreateOfferDocumentRequest) => d.sections.flatMap((s) => s.rows);

// The source headings of docs/redesign/workings/offers-source-2026.md, in order.
const SOURCE = [
  ["Offre brunch à emporter", 2025],
  ["Offre chef à domicile", 2026],
  ["Offre walking dinner", 2026],
  ["Offre buffets printemps été", 2026],
  ["Offre buffets automne hiver", 2026],
  ["Offre baptême", 2026],
  ["Carte à emporter", 2026],
] as const;

describe("offer-documents-2026 fixture", () => {
  it("has seven entries that all parse with createOfferDocumentSchema", () => {
    expect(raw).toHaveLength(7);
    for (const [index, entry] of raw.entries()) {
      const parsed = createOfferDocumentSchema.safeParse(entry);
      if (!parsed.success) throw new Error(`entry ${index + 1}: ${JSON.stringify(parsed.error.issues)}`);
    }
  });

  it("matches the seven headings of the source file, in order", () => {
    expect(documents.map((d) => [d.title, d.year])).toEqual(SOURCE.map(([title, year]) => [title, year]));
    expect(documents.map((d) => d.season)).toEqual([
      "toute_annee",
      "automne_hiver",
      "automne_hiver",
      "printemps_ete",
      "automne_hiver",
      "toute_annee",
      "toute_annee",
    ]);
  });

  // The source lists eleven section bullets on the carte; the spec's count of nine skips the two shared with sheet 5.
  it("transcribes the eleven sections and more than 80 rows of the carte à emporter", () => {
    const carte = byTitle("Carte à emporter");

    expect(carte.sections).toHaveLength(11);
    expect(allRows(carte).length).toBeGreaterThan(80);
    expect(carte.sections.map((s) => s.title)).toEqual([
      "PLATEAUX A PARTAGER",
      "Finger food / zakouskis froids",
      "Finger food / zakouskis chauds",
      "Verrines salées",
      "Mini sandwichs",
      "Proposition d'entrées",
      "Proposition de plats",
      "Proposition de plats « all-in-one » / faciles à réchauffer",
      "Gâteaux",
      "Verrines sucrées",
      "Mignardises",
    ]);
  });

  it("gives every priced row a unit kind of its own or from its section", () => {
    for (const d of documents) {
      for (const s of d.sections) {
        for (const r of s.rows) {
          if (r.price !== undefined) expect(r.unitKind ?? s.unitKind).toBeDefined();
        }
      }
      for (const r of d.services.rows) {
        if (r.price !== undefined) expect(r.unitKind).toBeDefined();
      }
    }
  });

  it("follows every sous_titre that carries a choice with at least two plat rows", () => {
    for (const d of documents) {
      for (const s of d.sections) {
        s.rows.forEach((row, index) => {
          if (row.kind !== "sous_titre" || !row.choice) return;
          const rest = s.rows.slice(index + 1);
          const end = rest.findIndex((r) => r.kind === "sous_titre" && r.choice !== undefined);
          const group = end === -1 ? rest : rest.slice(0, end);
          expect(group.filter((r) => r.kind === "plat").length).toBeGreaterThanOrEqual(2);
        });
      }
    }
  });

  it("lists the automne hiver sections with their prices", () => {
    const buffets = documents[4];

    expect(buffets.sections.map((s) => [s.title, s.price])).toEqual([
      ["APERITIF", 8.5],
      ["PLATEAUX A PARTAGER", undefined],
      ["BUFFET 1, Réconfort végétal", 24.5],
      ["BUFFET 2, La Tavola Italiana", 34.5],
      ["BUFFET 3, Saveurs du Levant", 35.5],
      ["BUFFET 4, Terre Mer", 38.5],
      ["BUFFET 5, Signature d'hiver", 44.5],
      ["BUFFET DE DESSERTS", 5.25],
      ["MIGNARDISES", 32],
    ]);
    expect(sectionOf(buffets, "PLATEAUX A PARTAGER").minimum).toEqual({ qty: 8, unit: "personnes" });
    expect(sectionOf(buffets, "MIGNARDISES")).toMatchObject({ unitLabel: "par boîte de 20 pièces", unitKind: "unite" });
    expect(sectionOf(buffets, "BUFFET 5, Signature d'hiver").rows.at(-1)).toMatchObject({ kind: "note", text: expect.stringMatching(/^Vous souhaitez interchanger/) });
    expect(documentFileName(buffets)).toBe("Offre buffets automne hiver 2026.pdf");
  });

  it("keeps the prices of the source", () => {
    const brunch = byTitle("Offre brunch à emporter");
    expect(sectionOf(brunch, "BRUNCH").price).toBe(42);
    expect(rowOf(sectionOf(brunch, "Possibilité d'ajouter à votre brunch"), "Saumon mariné maison")).toMatchObject({ price: 22, unitLabel: "par 300 g", unitKind: "unite" });

    expect(sectionOf(byTitle("Offre chef à domicile"), "FOOD").price).toBe(65);
    expect(sectionOf(byTitle("Offre walking dinner"), "WALKING DINNER").price).toBe(59);
    expect(sectionOf(byTitle("Offre buffets printemps été"), "BUFFET 4, Signature estivale").price).toBe(46.5);

    const bapteme = byTitle("Offre baptême");
    expect(sectionOf(bapteme, "Formule buffet de baptême Convivial").price).toBe(33);
    const options = sectionOf(bapteme, "Envie de compléter votre buffet ?");
    expect(options.intro).toBe("Quelques options peuvent être ajoutées sur demande");
    expect(rowOf(options, "Boîte antipasti")).toMatchObject({ price: 58, unitLabel: "pour 6 personnes", unitKind: "unite" });
    expect(rowOf(options, "Verrines salées")).toMatchObject({ price: 4.5, fromPrice: true, unitLabel: "à la pièce" });
    expect(rowOf(options, "Verrines sucrées")).toMatchObject({ price: 3.5, fromPrice: true });
    expect(rowOf(options, "Croûte aux fraises")).toMatchObject({ priceNote: "supplément en fonction du nombre de personnes" });
    expect(rowOf(options, "Croûte aux fraises").price).toBeUndefined();

    const carte = byTitle("Carte à emporter");
    expect(rowOf(sectionOf(carte, "Finger food / zakouskis froids"), "Choux fourrés").price).toBe(2.25);
    expect(rowOf(sectionOf(carte, "Finger food / zakouskis chauds"), "Pruneaux au lard").price).toBe(0.8);
    expect(rowOf(sectionOf(carte, "Verrines salées"), "Verrine de vitello tonnato").price).toBe(5.9);
    expect(rowOf(sectionOf(carte, "Mini sandwichs"), "Assortiment de mini sandwichs").price).toBe(16.25);
    expect(rowOf(sectionOf(carte, "Proposition de plats"), "Carré d'agneau").price).toBe(27.75);
    expect(rowOf(sectionOf(carte, "Gâteaux"), "Vase de pavlova")).toMatchObject({ price: 7.25, unitLabel: "entre 12 et 20 personnes, prix par personne", unitKind: "convive" });
    expect(sectionOf(carte, "Gâteaux").unitLabel).toBe("gâteau 8 parts");
    expect(rowOf(sectionOf(carte, "Verrines sucrées"), "Dacquoise").price).toBe(4.1);
  });

  it("keeps the minimums, choices and tags of the source", () => {
    const carte = byTitle("Carte à emporter");
    expect(sectionOf(carte, "Finger food / zakouskis froids").minimum).toEqual({ qty: 20, unit: "pieces", perSort: true });
    expect(sectionOf(carte, "Finger food / zakouskis chauds").minimum).toEqual({ qty: 20, unit: "pieces", perSort: true });
    expect(sectionOf(carte, "Verrines salées").minimum).toEqual({ qty: 12, unit: "pieces", label: "min par 12" });
    expect(sectionOf(carte, "Mini sandwichs").minimum).toEqual({ qty: 10, unit: "personnes" });
    expect(sectionOf(carte, "Verrines sucrées").minimum).toEqual({ qty: 10, unit: "pieces", label: "minimum par 10" });
    expect(rowOf(sectionOf(carte, "Verrines salées"), "Verrine de pastèque").tags).toEqual(["en saison"]);
    expect(rowOf(sectionOf(carte, "Gâteaux"), "Moelleux au chocolat à l'orange").tags).toEqual(["sans gluten"]);

    const chef = sectionOf(byTitle("Offre chef à domicile"), "FOOD");
    expect(chef.rows.filter((r) => r.kind === "sous_titre").map((r) => [r.text, r.choice])).toEqual([
      ["Apéritif", undefined],
      ["Entrée", { count: 1, scope: "table" }],
      ["Plat", { count: 1, scope: "table" }],
      ["Dessert", { count: 1, scope: "table" }],
    ]);
    expect(rowOf(chef, "Saumon mi-cuit").tags).toEqual(["tiède"]);

    const walking = sectionOf(byTitle("Offre walking dinner"), "WALKING DINNER");
    expect(rowOf(walking, "Petites assiettes").choice).toEqual({ count: 4, scope: "table", label: "sélection de 4 assiettes au choix" });
    expect(walking.rows.filter((r) => r.kind === "sous_titre").map((r) => r.text)).toEqual(["Apéritif", "Petites assiettes / bols", "Froid", "Chaud", "Desserts"]);
    expect(walking.rows.at(-1)).toMatchObject({ kind: "note", text: expect.stringMatching(/^Le prix comprend la vaisselle/) });

    const printemps = byTitle("Offre buffets printemps été");
    expect(rowOf(sectionOf(printemps, "BUFFET 2, Saveurs du Levant"), "Poulet chich taouk").tags).toEqual(["chaud / tiède / froid"]);
    expect(rowOf(sectionOf(printemps, "BUFFET 4, Signature estivale"), "Asperges vertes").tags).toEqual(["tiède / froid"]);
  });

  it("keeps the guests, services and VAT tables of each sheet", () => {
    const [brunch, chef, walking, printemps, automne, bapteme, carte] = documents;

    expect(brunch).toMatchObject({ prestationType: "buffet_a_emporter", prestationLabel: "A emporter", minGuests: 20, note: "Devis sur mesure pour les groupes de plus de 30 personnes" });
    expect(chef).toMatchObject({ prestationType: "chef_a_domicile", minGuests: 8, maxGuests: 14, guestsLabel: "entre 8 et 14 personnes" });
    expect(walking).toMatchObject({ prestationType: "walking_cocktail", minGuests: 30, maxGuests: 150 });
    expect(printemps).toMatchObject({ prestationType: "buffet_avec_service", minGuests: 20 });
    expect(automne.guestsLabel).toBeUndefined();
    expect(bapteme).toMatchObject({ prestationLabel: "à emporter", guestsLabel: "à partir de 20 personnes" });
    expect(bapteme.minGuests).toBeUndefined();
    expect(carte).toMatchObject({ minGuests: 8, guestsLabel: "8, sauf certains éléments, voir détails", note: "Chaque élément peut se choisir séparément." });

    const serveur = (d: CreateOfferDocumentRequest) => d.services.rows.find((r) => r.rowId === "serveur")?.price;
    expect([brunch, chef, walking, printemps, automne].map((d) => d.services.title)).toEqual(["SERVICE (FACULTATIF)", "SERVICES", "SERVICES", "SERVICES", "EXTRAS"]);
    expect([brunch, chef, walking, printemps, automne].map(serveur)).toEqual([50, 40, 40, 40, 50]);
    expect(documents.map((d) => d.services.rows.find((r) => r.rowId === "cuisinier")?.price)).toEqual([50, 50, 50, 50, 50, 50, 50]);
    expect(documents.map((d) => d.services.shown)).toEqual([true, true, true, true, true, false, false]);

    const vat = (d: CreateOfferDocumentRequest) => d.vatLines.map((l) => `${l.label} ${l.rate}`);
    expect(vat(brunch)).toEqual(["Food à emporter 6", "Food avec service 12", "Extras 21"]);
    expect(vat(chef)).toEqual(["Food à emporter 6", "Food avec service 12", "Extras 21"]);
    expect(vat(walking)).toEqual(["Food à emporter 6", "Food avec service 12", "Services 21"]);
    expect(vat(printemps)).toEqual(["Food 12", "Services 21"]);
    expect(vat(automne)).toEqual(["Food 12", "Services 21"]);
    expect(vat(bapteme)).toEqual(["Food à emporter 6", "Food avec service 12", "Livraison / location matériel 21"]);
    expect(vat(carte)).toEqual(["Food 12", "Services 21"]);
    expect(new Set(documents.map((d) => d.conditions)).size).toBe(1);
  });

  it("links no row to a recipe and strips the tag suffixes from the texts", () => {
    for (const d of documents) {
      for (const r of allRows(d)) {
        expect(r.recipeId).toBeUndefined();
        expect(r.text).not.toMatch(/\((chaud|tiède|froid|sans gluten|en saison)[^)]*\)\s*$/);
        if (r.kind === "exemple") expect(r.text).not.toMatch(/^ex\s*:/i);
      }
    }
  });
});
