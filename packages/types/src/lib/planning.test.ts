import type { AppEvent, EventRecipeLine } from "../entities/event";
import type { Person } from "../entities/settings";
import { DEFAULT_COURSES } from "../entities/settings";
import {
  assigneesOf,
  courseIndex,
  filterByPerson,
  groupByCourse,
  groupByPerson,
  groupByRecipe,
  isWeekdayLabel,
  monthSignedRevenue,
  personInitials,
  personName,
  prepLinesForDate,
  shortEventName,
  signedRevenue,
  slugifyPersonId,
  sortEventLines,
  weekPlan,
  type RecipeLookup,
} from "./planning";

const recipeById: RecipeLookup = new Map([
  ["quiche", { name: "Mini quiches", defaultCourse: "Apéritif" }],
  ["tarte", { name: "Tarte citron", defaultCourse: "Dessert" }],
  ["poulet", { name: "Poulet rôti" }],
]);

function line(recipeId: string, extra: Partial<EventRecipeLine> = {}): EventRecipeLine {
  return { lineId: `l-${recipeId}-${extra.course ?? ""}`, recipeId, portions: 10, ...extra };
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

describe("courseIndex", () => {
  it("returns the position in the list", () => {
    expect(courseIndex("Plat", DEFAULT_COURSES)).toBe(2);
  });
  it("sends undefined and unknown values under Autre", () => {
    expect(courseIndex(undefined, DEFAULT_COURSES)).toBe(4);
    expect(courseIndex("Fromage", DEFAULT_COURSES)).toBe(4);
  });
  it("sorts unknown values last when Autre is not in the list", () => {
    expect(courseIndex("Fromage", ["Entrée", "Plat"])).toBe(2);
  });
});

describe("sortEventLines", () => {
  it("orders by course index then array order, keeping unknown courses under Autre", () => {
    const lines = [
      line("poulet", { lineId: "a" }),
      line("tarte", { lineId: "b" }),
      line("quiche", { lineId: "c", course: "Plat" }),
      line("quiche", { lineId: "d" }),
      line("poulet", { lineId: "e", course: "Fromage" }),
      line("poulet", { lineId: "f", course: "Entrée" }),
    ];
    const sorted = sortEventLines(lines, DEFAULT_COURSES, recipeById);
    expect(sorted.map((l) => l.lineId)).toEqual(["d", "f", "c", "b", "a", "e"]);
    expect(lines.map((l) => l.lineId)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
});

describe("groupByCourse", () => {
  it("groups in settings order and labels unknown courses Autre", () => {
    const lines = [line("poulet", { lineId: "a" }), line("quiche", { lineId: "b" }), line("tarte", { lineId: "c" })];
    const groups = groupByCourse(lines, DEFAULT_COURSES, recipeById);
    expect(groups.map((g) => [g.course, g.lines.map((l) => l.lineId)])).toEqual([
      ["Apéritif", ["b"]],
      ["Dessert", ["c"]],
      ["Autre", ["a"]],
    ]);
  });
});

describe("prepLinesForDate", () => {
  const events = [
    event({
      eventId: "mariage",
      name: "Mariage Dupont",
      date: "2026-10-13",
      contactName: "Mme Dupont",
      recipes: [line("tarte", { lineId: "m1", portions: 50 }), line("quiche", { lineId: "m2", portions: 50, prepStatus: "done" })],
    }),
    event({
      eventId: "hoona-mardi",
      name: "Hoona · mardi 13 oct",
      date: "2026-10-13",
      clientId: "hoona",
      prestationType: "menu_a_emporter",
      recipes: [line("quiche", { lineId: "h1", portions: 30, notes: "sans oignon" })],
    }),
    event({ eventId: "other-day", date: "2026-10-14", recipes: [line("poulet", { lineId: "x" })] }),
  ];
  const clientById = new Map([["hoona", { name: "Hoona" }]]);

  it("lists only the day's lines, in course order across events", () => {
    const lines = prepLinesForDate(events, recipeById, clientById, DEFAULT_COURSES, "2026-10-13");
    expect(lines.map((l) => l.lineId)).toEqual(["m2", "h1", "m1"]);
    expect(lines[0]).toMatchObject({ course: "Apéritif", prepStatus: "done", clientName: "Mme Dupont", recipeName: "Mini quiches" });
    expect(lines[1]).toMatchObject({ clientName: "Hoona", prestationType: "menu_a_emporter", notes: "sans oignon", prepStatus: "todo" });
    expect(lines[2]).toMatchObject({ course: "Dessert", date: "2026-10-13", eventName: "Mariage Dupont" });
  });

  it("falls back to the recipe id as name when the recipe is unknown", () => {
    const lines = prepLinesForDate(events, new Map(), clientById, DEFAULT_COURSES, "2026-10-14");
    expect(lines[0]).toMatchObject({ recipeName: "poulet", course: "Autre", clientName: undefined });
  });

  it("sums portions per recipe with one part per event", () => {
    const groups = groupByRecipe(prepLinesForDate(events, recipeById, clientById, DEFAULT_COURSES, "2026-10-13"));
    expect(groups).toEqual([
      {
        recipeId: "quiche",
        recipeName: "Mini quiches",
        total: 80,
        parts: [
          { label: "Mme Dupont", portions: 50 },
          { label: "Hoona", portions: 30 },
        ],
      },
      { recipeId: "tarte", recipeName: "Tarte citron", total: 50, parts: [{ label: "Mme Dupont", portions: 50 }] },
    ]);
  });
});

describe("signedRevenue and weekPlan", () => {
  it("rounds price × guests to cents", () => {
    expect(signedRevenue({ sellingPricePerGuest: 19.99, guestCount: 3 })).toBe(59.97);
  });

  it("builds seven days from the Monday with guests, revenue and line counts", () => {
    const events = [
      event({ eventId: "a", date: "2026-10-12", guestCount: 30, sellingPricePerGuest: 12.5, recipes: [line("quiche", { prepStatus: "done" }), line("tarte")] }),
      event({ eventId: "b", date: "2026-10-18", guestCount: 50, sellingPricePerGuest: 45 }),
      event({ eventId: "c", date: "2026-10-19", guestCount: 99 }),
      event({ eventId: "d", date: "2026-10-11", guestCount: 99 }),
    ];
    const plan = weekPlan(events, "2026-10-12");
    expect(plan.days.map((d) => d.date)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    expect(plan.days[0]).toMatchObject({ guests: 30, signedRevenue: 375, linesDone: 1, linesTotal: 2 });
    expect(plan.days[0].events.map((e) => e.eventId)).toEqual(["a"]);
    expect(plan.days[6]).toMatchObject({ guests: 50, signedRevenue: 2250, linesDone: 0, linesTotal: 0 });
    expect(plan.days[1].events).toEqual([]);
    expect(plan).toMatchObject({ guests: 80, signedRevenue: 2625, linesDone: 1, linesTotal: 2 });
  });

  it("crosses a month boundary", () => {
    const plan = weekPlan([], "2026-10-26");
    expect(plan.days[6].date).toBe("2026-11-01");
  });

  it("sums signed revenue of a calendar month", () => {
    const events = [
      event({ eventId: "a", date: "2026-10-01", guestCount: 10, sellingPricePerGuest: 0.1 }),
      event({ eventId: "b", date: "2026-10-31", guestCount: 10, sellingPricePerGuest: 0.2 }),
      event({ eventId: "c", date: "2026-11-01", guestCount: 10, sellingPricePerGuest: 100 }),
    ];
    expect(monthSignedRevenue(events, "2026-10")).toBe(3);
    expect(monthSignedRevenue(events, "2026-09")).toBe(0);
  });
});

const people: Person[] = [
  { personId: "amelie", name: "Amélie", active: true },
  { personId: "kristoff", name: "Kristoff", initials: "KR", active: true },
  { personId: "jo", name: "Jo", active: false },
];

describe("assigneesOf", () => {
  it("uses the line list when set, else the event list, else nothing", () => {
    expect(assigneesOf({ assignedTo: ["jo"] }, { assignedTo: ["amelie"] })).toEqual(["jo"]);
    expect(assigneesOf({ assignedTo: [] }, { assignedTo: ["amelie"] })).toEqual(["amelie"]);
    expect(assigneesOf({}, { assignedTo: ["amelie"] })).toEqual(["amelie"]);
    expect(assigneesOf({}, {})).toEqual([]);
  });
});

describe("person helpers", () => {
  it("personName falls back to the id", () => {
    expect(personName(people, "kristoff")).toBe("Kristoff");
    expect(personName(people, "ghost")).toBe("ghost");
  });
  it("personInitials uses the given initials or the first two letters", () => {
    expect(personInitials(people[0])).toBe("AM");
    expect(personInitials(people[1])).toBe("KR");
    expect(personInitials({ name: "élodie", initials: "  " })).toBe("ÉL");
  });
  it("slugifyPersonId strips accents, replaces symbols and suffixes on collision", () => {
    expect(slugifyPersonId("Kristoff", [])).toBe("kristoff");
    expect(slugifyPersonId("Amélie Van Acker", [])).toBe("amelie-van-acker");
    expect(slugifyPersonId("Jo", ["jo"])).toBe("jo-2");
    expect(slugifyPersonId("Jo", ["jo", "jo-2"])).toBe("jo-3");
    expect(slugifyPersonId("!!!", [])).toBe("personne");
    expect(slugifyPersonId("a".repeat(50), [])).toHaveLength(40);
  });
  it("isWeekdayLabel matches the French weekday names", () => {
    expect(isWeekdayLabel("Mardi")).toBe(true);
    expect(isWeekdayLabel(" lundi ")).toBe(true);
    expect(isWeekdayLabel("Lunch")).toBe(false);
  });
});

describe("shortEventName", () => {
  const hoona = { name: "Hoona" };
  it("returns the client name for a template event", () => {
    expect(shortEventName({ name: "Hoona · Lunch", templateId: "t" }, hoona)).toBe("Hoona");
  });
  it("returns the client name for the generated date name", () => {
    expect(shortEventName({ name: "Hoona · mardi 13 oct." }, hoona)).toBe("Hoona");
    expect(shortEventName({ name: "Hoona · mardi 13 octobre" }, hoona)).toBe("Hoona");
  });
  it("keeps a hand-written name or one without a client", () => {
    expect(shortEventName({ name: "Hoona · Lunch" }, hoona)).toBe("Hoona · Lunch");
    expect(shortEventName({ name: "Mariage Dupont" }, hoona)).toBe("Mariage Dupont");
    expect(shortEventName({ name: "Hoona · mardi 13 oct.", templateId: "t" })).toBe("Hoona · mardi 13 oct.");
  });
});

describe("groupByPerson and filterByPerson", () => {
  const events = [
    event({ eventId: "a", date: "2026-10-13", assignedTo: ["kristoff"], recipes: [line("quiche"), line("tarte", { assignedTo: ["amelie", "kristoff"] })] }),
    event({ eventId: "b", date: "2026-10-13", recipes: [line("poulet"), line("quiche", { assignedTo: ["ghost"] })] }),
  ];
  const lines = prepLinesForDate(events, recipeById, new Map(), DEFAULT_COURSES, "2026-10-13");

  it("prep lines carry the effective assignees and whether they own them", () => {
    const quicheA = lines.find((l) => l.eventId === "a" && l.recipeId === "quiche");
    const tarte = lines.find((l) => l.recipeId === "tarte");
    const poulet = lines.find((l) => l.recipeId === "poulet");
    expect(quicheA).toMatchObject({ assignedTo: ["kristoff"], ownAssignment: false });
    expect(tarte).toMatchObject({ assignedTo: ["amelie", "kristoff"], ownAssignment: true });
    expect(poulet).toMatchObject({ assignedTo: [], ownAssignment: false });
  });

  it("groups in settings order, unknown ids after, Sans personne last, a shared line in both", () => {
    const groups = groupByPerson(lines, people);
    expect(groups.map((g) => [g.personId, g.name, g.lines.map((l) => l.recipeId)])).toEqual([
      ["amelie", "Amélie", ["tarte"]],
      ["kristoff", "Kristoff", ["quiche", "tarte"]],
      ["ghost", "ghost", ["quiche"]],
      [null, "Sans personne", ["poulet"]],
    ]);
  });

  it("drops empty groups", () => {
    expect(groupByPerson([], people)).toEqual([]);
  });

  it("filterByPerson keeps the lines of one person", () => {
    expect(filterByPerson(lines, "amelie").map((l) => l.recipeId)).toEqual(["tarte"]);
    expect(filterByPerson(lines, "nobody")).toEqual([]);
  });
});

describe("weekPlan.peopleByDay", () => {
  it("lists distinct effective assignees per day in settings order", () => {
    const events = [
      event({ eventId: "a", date: "2026-10-13", assignedTo: ["kristoff"], recipes: [line("quiche"), line("tarte", { assignedTo: ["amelie"] })] }),
      event({ eventId: "b", date: "2026-10-13", recipes: [line("poulet", { assignedTo: ["zed", "kristoff"] })] }),
      event({ eventId: "c", date: "2026-10-14", assignedTo: ["jo"], recipes: [] }),
    ];
    const plan = weekPlan(events, "2026-10-12", people);
    expect(plan.peopleByDay["2026-10-13"]).toEqual(["amelie", "kristoff", "zed"]);
    expect(plan.peopleByDay["2026-10-14"]).toEqual(["jo"]);
    expect(plan.peopleByDay["2026-10-12"]).toEqual([]);
    expect(Object.keys(plan.peopleByDay)).toHaveLength(7);
  });
});
