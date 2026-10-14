import type { AppEvent, EventRecipeLine } from "../entities/event";
import type { Recipe } from "../entities/recipe";
import { DEFAULT_COURSES, DEFAULT_PRESTATION_TYPES, type Person } from "../entities/settings";
import { weekPrintPages, type WeekPrintInput } from "./print";

const WEEK = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];

function recipe(recipeId: string, name: string, extra: Partial<Recipe> = {}): Recipe {
  return {
    recipeId,
    name,
    nameLower: name.toLowerCase(),
    type: "Plat",
    portions: 10,
    portionWeight: 100,
    techniques: [],
    ingredients: [],
    photos: [],
    pricing: { margin: 0, sellingPrice: 0 } as unknown as Recipe["pricing"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

const recipeById = new Map<string, Recipe>([
  ["quiche", recipe("quiche", "Mini quiches", { defaultCourse: "Apéritif" })],
  ["tarte", recipe("tarte", "Tarte citron", { defaultCourse: "Dessert" })],
  ["poulet", recipe("poulet", "Poulet basquaise", { defaultCourse: "Plat" })],
  [
    "sables",
    recipe("sables", "Sablés bretons", {
      defaultCourse: "Mignardises",
      ingredients: [{ ingredientId: "beurre", qty: 125, unit: "g", lossPct: 0 }],
    }),
  ],
]);

const ingredientById = new Map([["beurre", { name: "Beurre" }]]);

const people: Person[] = [
  { personId: "amelie", name: "Amélie", initials: "AM", active: true },
  { personId: "kristoff", name: "Kristoff", initials: "KR", active: true },
  { personId: "old", name: "Ancien", active: false },
];

function line(recipeId: string, extra: Partial<EventRecipeLine> = {}): EventRecipeLine {
  return { lineId: `l-${recipeId}`, recipeId, portions: 10, ...extra };
}

function event(partial: Partial<AppEvent> & Pick<AppEvent, "eventId" | "date">): AppEvent {
  return {
    name: partial.eventId,
    nameLower: partial.eventId,
    guestCount: 10,
    recipes: [],
    extraCosts: [],
    sellingPricePerGuest: 20,
    status: "upcoming",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function input(partial: Partial<WeekPrintInput> = {}): WeekPrintInput {
  return {
    events: [],
    weekDates: WEEK,
    courses: DEFAULT_COURSES,
    recipeById,
    clientById: new Map(),
    people,
    prestationTypes: DEFAULT_PRESTATION_TYPES,
    ingredientById,
    byPerson: false,
    withIngredients: false,
    onePagePerDay: true,
    ...partial,
  };
}

const monday = event({ eventId: "Hoona", date: "2026-10-12", guestCount: 30, prestationType: "menu_a_emporter", assignedTo: ["amelie", "kristoff"], recipes: [line("poulet")] });
const tuesday = event({ eventId: "Brunch Léa", date: "2026-10-13", guestCount: 12, recipes: [line("tarte")] });

describe("weekPrintPages, whole week", () => {
  it("gives one page per day in date order with onePagePerDay", () => {
    const pages = weekPrintPages(input({ events: [tuesday, monday] }));
    expect(pages).toHaveLength(2);
    expect(pages[0].title).toBe("Semaine 42 · 12 au 18 octobre 2026");
    expect(pages[0].caption).toBe("2 événements · 42 convives");
    expect(pages[0].sections.map((s) => s.heading)).toEqual(["Lundi 12 octobre"]);
    expect(pages[1].title).toBe("Semaine 42 · 12 au 18 octobre 2026");
    expect(pages[1].caption).toBeUndefined();
    expect(pages[1].sections.map((s) => s.heading)).toEqual(["Mardi 13 octobre"]);
  });

  it("gives one page with two sections without onePagePerDay", () => {
    const pages = weekPrintPages(input({ events: [tuesday, monday], onePagePerDay: false }));
    expect(pages).toHaveLength(1);
    expect(pages[0].sections.map((s) => s.heading)).toEqual(["Lundi 12 octobre", "Mardi 13 octobre"]);
    expect(pages[0].sections[0].caption).toBe("1 événement · 30 convives · 1 préparation");
  });

  it("builds the event heading from name, guests, prestation and initials", () => {
    const [page] = weekPrintPages(input({ events: [monday] }));
    expect(page.sections[0].blocks[0].heading).toBe("Hoona · 30 convives · Menu à emporter · AM, KR");
    expect(page.sections[0].blocks[0].movedIn).toBe(false);
  });

  it("orders rows by course with the bucket name", () => {
    const ev = event({
      eventId: "Dîner",
      date: "2026-10-14",
      recipes: [line("tarte"), line("poulet"), line("quiche", { course: "Fromage" }), line("sables")],
    });
    const [page] = weekPrintPages(input({ events: [ev] }));
    const rows = page.sections[0].blocks[0].rows;
    expect(rows.map((r) => [r.label, r.course])).toEqual([
      ["Poulet basquaise", "Plat"],
      ["Tarte citron", "Dessert"],
      ["Mini quiches", "Autre"],
      ["Sablés bretons", "Autre"],
    ]);
    expect(rows[0]).toMatchObject({ kind: "recipe", done: false, portions: 10, initials: [] });
    const withMignardises = weekPrintPages(input({ events: [ev], courses: [...DEFAULT_COURSES, "Mignardises"] }));
    expect(withMignardises[0].sections[0].blocks[0].rows.map((r) => r.course)).toEqual(["Plat", "Dessert", "Mignardises", "Autre"]);
  });

  it("captions an event-day block with the delivery time and address", () => {
    const delivered = event({
      eventId: "Mariage Dupont",
      date: "2026-10-14",
      deliveryTime: "11:30",
      deliveryAddress: "Rue des Lilas 4",
      recipes: [line("poulet")],
    });
    const plain = event({ eventId: "Zèbre", date: "2026-10-14", recipes: [line("tarte")] });
    const [page] = weekPrintPages(input({ events: [plain, delivered] }));
    const blocks = page.sections[0].blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[0].delivery).toBe("Livraison 11h30 · Rue des Lilas 4");
    expect(blocks[1].delivery).toBeUndefined();
    expect("delivery" in blocks[1]).toBe(false);
  });

  it("prints either delivery part alone and none on a moved-in block", () => {
    const timeOnly = event({ eventId: "A", date: "2026-10-14", deliveryTime: "09:05", recipes: [line("poulet")] });
    const addressOnly = event({ eventId: "B", date: "2026-10-14", deliveryAddress: "  Grand-Place 1 ", recipes: [line("poulet")] });
    const badTime = event({ eventId: "C", date: "2026-10-14", deliveryTime: "9h30", recipes: [line("poulet")] });
    const [page] = weekPrintPages(input({ events: [timeOnly, addressOnly, badTime] }));
    expect(page.sections[0].blocks.map((b) => b.delivery)).toEqual(["Livraison 9h05", "Livraison Grand-Place 1", undefined]);
    const moved = event({
      eventId: "Mariage Dupont",
      date: "2026-10-17",
      deliveryTime: "11:30",
      recipes: [line("sables", { prepDate: "2026-10-15" })],
    });
    const pages = weekPrintPages(input({ events: [moved] }));
    expect(pages[0].sections[0].blocks[0].movedIn).toBe(true);
    expect(pages[0].sections[0].blocks[0].delivery).toBeUndefined();
  });

  it("prints a moved line under its event on the prep day, with a note on the event day", () => {
    const wedding = event({
      eventId: "Mariage Dupont",
      date: "2026-10-17",
      guestCount: 60,
      recipes: [line("poulet", { portions: 60 }), line("sables", { portions: 60, prepDate: "2026-10-15" })],
    });
    const pages = weekPrintPages(input({ events: [wedding] }));
    expect(pages).toHaveLength(2);
    const thursday = pages[0].sections[0];
    expect(thursday.heading).toBe("Jeudi 15 octobre");
    expect(thursday.caption).toBe("1 préparation");
    expect(thursday.blocks).toHaveLength(1);
    expect(thursday.blocks[0].heading).toBe("Pour samedi 17 octobre · Mariage Dupont");
    expect(thursday.blocks[0].movedIn).toBe(true);
    expect(thursday.blocks[0].rows.map((r) => r.label)).toEqual(["Sablés bretons"]);
    const saturday = pages[1].sections[0];
    expect(saturday.heading).toBe("Samedi 17 octobre");
    expect(saturday.blocks[0].movedOutNote).toBe("1 préparation prévue jeu. 15");
    expect(saturday.blocks[0].rows.map((r) => r.label)).toEqual(["Poulet basquaise"]);
  });

  it("lists several moved-out days in the note", () => {
    const wedding = event({
      eventId: "Mariage Dupont",
      date: "2026-10-17",
      recipes: [line("poulet"), line("sables", { prepDate: "2026-10-15" }), line("tarte", { prepDate: "2026-10-16" })],
    });
    const pages = weekPrintPages(input({ events: [wedding], onePagePerDay: false }));
    const saturday = pages[0].sections.find((s) => s.heading === "Samedi 17 octobre");
    expect(saturday?.blocks[0].movedOutNote).toBe("2 préparations prévues jeu. 15, ven. 16");
  });

  it("prints a task with course Tâche and no portions, after the lines", () => {
    const wedding = event({
      eventId: "Mariage Dupont",
      date: "2026-10-17",
      recipes: [line("poulet")],
      tasks: [
        { taskId: "t1", label: "Dégeler le poisson", date: "2026-10-15" },
        { taskId: "t2", label: "Dresser la salle", date: "2026-10-17", assignedTo: ["kristoff"], notes: "Avant 10 h" },
      ],
    });
    const pages = weekPrintPages(input({ events: [wedding] }));
    const thursdayRows = pages[0].sections[0].blocks[0].rows;
    expect(thursdayRows).toEqual([{ kind: "task", done: false, label: "Dégeler le poisson", course: "Tâche", initials: [] }]);
    expect(thursdayRows[0].portions).toBeUndefined();
    const saturdayRows = pages[1].sections[0].blocks[0].rows;
    expect(saturdayRows.map((r) => r.label)).toEqual(["Poulet basquaise", "Dresser la salle"]);
    expect(saturdayRows[1]).toMatchObject({ course: "Tâche", initials: ["KR"], note: "Avant 10 h" });
    expect(pages[1].sections[0].caption).toBe("1 événement · 10 convives · 1 préparation · 1 tâche");
  });

  it("marks done rows", () => {
    const ev = event({
      eventId: "Dîner",
      date: "2026-10-14",
      recipes: [line("poulet", { prepStatus: "done" }), line("tarte")],
      tasks: [{ taskId: "t1", label: "Ranger", date: "2026-10-14", prepStatus: "done" }],
    });
    const [page] = weekPrintPages(input({ events: [ev] }));
    expect(page.sections[0].blocks[0].rows.map((r) => r.done)).toEqual([true, false, true]);
  });

  it("labels an unknown recipe and gives it no ingredients", () => {
    const ev = event({ eventId: "Dîner", date: "2026-10-14", recipes: [line("ghost")] });
    const [page] = weekPrintPages(input({ events: [ev], withIngredients: true }));
    expect(page.sections[0].blocks[0].rows[0]).toMatchObject({ label: "Recette inconnue", course: "Autre" });
    expect(page.sections[0].blocks[0].rows[0].ingredients).toBeUndefined();
  });

  it("scales ingredients per row when asked", () => {
    const ev = event({ eventId: "Dîner", date: "2026-10-14", recipes: [line("sables", { portions: 60 })] });
    const without = weekPrintPages(input({ events: [ev] }));
    expect(without[0].sections[0].blocks[0].rows[0].ingredients).toBeUndefined();
    const [page] = weekPrintPages(input({ events: [ev], withIngredients: true }));
    expect(page.sections[0].blocks[0].rows[0].ingredients).toEqual([{ name: "Beurre", qty: 750, unit: "g" }]);
  });

  it("drops days without rows and gives [] for an empty week", () => {
    expect(weekPrintPages(input())).toEqual([]);
    const empty = event({ eventId: "Vide", date: "2026-10-14" });
    expect(weekPrintPages(input({ events: [empty] }))).toEqual([]);
    expect(weekPrintPages(input({ events: [empty, monday] }))).toHaveLength(1);
  });

  it("keeps both years in the title when the week straddles a year end", () => {
    const week = ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"];
    const ev = event({ eventId: "Réveillon", date: "2026-12-31", recipes: [line("poulet")] });
    const [page] = weekPrintPages(input({ events: [ev], weekDates: week }));
    expect(page.title).toBe("Semaine 53 · 28 décembre 2026 au 3 janvier 2027");
  });

  it("uses the client name for a generated event name", () => {
    const ev = event({ eventId: "e1", name: "Hoona · lundi 12 oct.", date: "2026-10-12", clientId: "c1", recipes: [line("poulet")] });
    const [page] = weekPrintPages(input({ events: [ev], clientById: new Map([["c1", { name: "Hoona" }]]) }));
    expect(page.sections[0].blocks[0].heading).toBe("Hoona · 10 convives");
  });
});

describe("weekPrintPages, by person", () => {
  const shared = event({
    eventId: "Mariage Dupont",
    date: "2026-10-17",
    recipes: [line("poulet", { assignedTo: ["amelie", "kristoff"] }), line("tarte", { assignedTo: ["kristoff"] }), line("sables")],
    tasks: [{ taskId: "t1", label: "Dégeler le poisson", date: "2026-10-15", assignedTo: ["amelie"] }],
  });

  it("gives one page per active person in settings order, then Sans personne", () => {
    const pages = weekPrintPages(input({ events: [shared], byPerson: true }));
    expect(pages.map((p) => p.title)).toEqual(["Amélie · semaine 42", "Kristoff · semaine 42", "Sans personne · semaine 42"]);
    const amelie = pages[0];
    expect(amelie.sections.map((s) => s.heading)).toEqual(["Jeudi 15 octobre", "Samedi 17 octobre"]);
    expect(amelie.sections[0].blocks[0].heading).toBe("Pour samedi 17 octobre · Mariage Dupont");
    expect(amelie.sections[1].blocks[0].heading).toBe("Mariage Dupont · 10 convives");
    expect(amelie.sections[1].blocks[0].rows).toEqual([
      { kind: "recipe", done: false, label: "Poulet basquaise", course: "Plat", portions: 10, initials: ["AM", "KR"], with: ["Kristoff"] },
    ]);
    const kristoff = pages[1];
    expect(kristoff.sections.map((s) => s.heading)).toEqual(["Samedi 17 octobre"]);
    expect(kristoff.sections[0].blocks[0].rows.map((r) => [r.label, r.with])).toEqual([
      ["Poulet basquaise", ["Amélie"]],
      ["Tarte citron", undefined],
    ]);
    const nobody = pages[2];
    expect(nobody.sections[0].blocks[0].rows.map((r) => r.label)).toEqual(["Sablés bretons"]);
  });

  it("omits Sans personne when every row has a person", () => {
    const ev = event({ eventId: "Dîner", date: "2026-10-14", assignedTo: ["amelie"], recipes: [line("poulet")] });
    const pages = weekPrintPages(input({ events: [ev], byPerson: true }));
    expect(pages.map((p) => p.title)).toEqual(["Amélie · semaine 42"]);
    expect(pages[0].sections[0].blocks[0].rows[0].with).toBeUndefined();
  });

  it("ignores onePagePerDay and the week caption", () => {
    const pages = weekPrintPages(input({ events: [shared], byPerson: true, onePagePerDay: true }));
    expect(pages[0].sections).toHaveLength(2);
    expect(pages[0].caption).toBeUndefined();
  });

  it("prints rows of an inactive person on their own page", () => {
    const ev = event({ eventId: "Dîner", date: "2026-10-14", recipes: [line("poulet", { lineId: "a", portions: 1, assignedTo: ["old"] }), line("poulet", { lineId: "b", portions: 1 })] });
    const pages = weekPrintPages(input({ events: [ev], byPerson: true }));
    expect(pages.map((p) => p.title)).toEqual(["Ancien · semaine 42", "Sans personne · semaine 42"]);
    expect(pages[0].sections[0].blocks[0].rows).toEqual([
      { kind: "recipe", done: false, label: "Poulet basquaise", course: "Plat", portions: 1, initials: ["AN"] },
    ]);
    expect(pages[1].sections[0].blocks[0].rows).toHaveLength(1);
  });

  it("names a deleted person by id on their page", () => {
    const ev = event({ eventId: "Dîner", date: "2026-10-14", recipes: [line("poulet", { assignedTo: ["ghost"] })] });
    expect(weekPrintPages(input({ events: [ev], byPerson: true })).map((p) => p.title)).toEqual(["ghost · semaine 42"]);
  });

  it("gives only that person's page with personId", () => {
    const pages = weekPrintPages(input({ events: [shared], byPerson: true, personId: "kristoff" }));
    expect(pages.map((p) => p.title)).toEqual(["Kristoff · semaine 42"]);
    expect(weekPrintPages(input({ events: [shared], byPerson: true, personId: "old" }))).toEqual([]);
  });
});
