import type { AppEvent, EventRecipeLine } from "../entities/event";
import type { Person } from "../entities/settings";
import {
  DEFAULT_COURSES,
  LEGACY_CATEGORY_ALIASES,
  LEGACY_DEFAULT_COURSES,
  LEGACY_DEFAULT_COURSES_V2,
  LEGACY_TYPE_TO_CATEGORY,
  aliasCategory,
  isLegacyCategory,
} from "../entities/settings";
import { sumMoney } from "./money";
import {
  assigneesOf,
  billingFromClient,
  categoryOptions,
  courseIndex,
  courseOf,
  dayItems,
  filterByPerson,
  foodRevenue,
  groupByCourse,
  groupByPerson,
  groupByRecipe,
  incompleteCount,
  isIncompleteRecipe,
  isMoved,
  isWeekdayLabel,
  monthSignedRevenue,
  movedOutLines,
  ownDayLines,
  personInitials,
  personName,
  prepDateOf,
  recipePreparationTasks,
  scheduledRecipeLines,
  prepLinesForDate,
  prepTasksForDate,
  pricePerGuestOf,
  recipeCategoryOf,
  revenueLinesTotal,
  revenueTvac,
  shiftPrepDates,
  shortEventName,
  signedRevenue,
  slugifyPersonId,
  sortEventLines,
  tasksOf,
  tasksOn,
  upgradeCourses,
  vatBreakdown,
  weekPlan,
  type DayItem,
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

// A list an earlier install may still store; upgradeCourses strips the alias, the libs read it as Dessert.
const SEVEN = [...DEFAULT_COURSES, "Mignardises"];

describe("courseIndex", () => {
  it("returns the position in the six-value list", () => {
    expect(DEFAULT_COURSES).toEqual(["Apéritif", "Entrée", "Plat", "Walking dinner", "Buffet", "Dessert"]);
    expect(courseIndex("Plat", DEFAULT_COURSES)).toBe(2);
    expect(courseIndex("Dessert", DEFAULT_COURSES)).toBe(5);
  });
  it("sends undefined, unknown values and Autre last when Autre is not in the list", () => {
    expect(courseIndex(undefined, DEFAULT_COURSES)).toBe(6);
    expect(courseIndex("Fromage", DEFAULT_COURSES)).toBe(6);
    expect(courseIndex("Mignardises", DEFAULT_COURSES)).toBe(6);
    expect(courseIndex("Autre", DEFAULT_COURSES)).toBe(6);
    expect(courseIndex("Fromage", ["Entrée", "Plat"])).toBe(2);
  });
  it("reads the raw list: a value still present sorts at its position, unknown values with Autre", () => {
    expect(courseIndex("Mignardises", SEVEN)).toBe(6);
    expect(courseIndex("Fromage", [...DEFAULT_COURSES, "Autre"])).toBe(6);
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
  it("sorts a Mignardises line under Dessert whether or not the list still carries it", () => {
    const lines = [
      line("poulet", { lineId: "autre" }),
      line("tarte", { lineId: "mign", course: "Mignardises" }),
      line("tarte", { lineId: "dessert" }),
    ];
    expect(sortEventLines(lines, SEVEN, recipeById).map((l) => l.lineId)).toEqual(["mign", "dessert", "autre"]);
    expect(sortEventLines(lines, DEFAULT_COURSES, recipeById).map((l) => l.lineId)).toEqual(["mign", "dessert", "autre"]);
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
  it("follows the six-value list and buckets a Mignardises line under Dessert in both lists", () => {
    const lines = [
      line("tarte", { lineId: "mign", course: "Mignardises" }),
      line("poulet", { lineId: "buffet", course: "Buffet" }),
      line("tarte", { lineId: "dessert" }),
      line("quiche", { lineId: "walking", course: "Walking dinner" }),
    ];
    const expected = [
      ["Walking dinner", ["walking"]],
      ["Buffet", ["buffet"]],
      ["Dessert", ["mign", "dessert"]],
    ];
    expect(groupByCourse(lines, DEFAULT_COURSES, recipeById).map((g) => [g.course, g.lines.map((l) => l.lineId)])).toEqual(expected);
    expect(groupByCourse(lines, SEVEN, recipeById).map((g) => [g.course, g.lines.map((l) => l.lineId)])).toEqual(expected);
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

  it("omits a recipe card when its linked preparation tasks are in the planning", () => {
    const decomposed = event({
      eventId: "decomposed",
      date: "2026-10-17",
      recipes: [line("quiche", { lineId: "line-quiche" })],
      tasks: [
        { taskId: "prep-dough", label: "Mini quiches · Pâte", date: "2026-10-15", recipeLineId: "line-quiche", recipeId: "quiche", preparationId: "dough" },
        { taskId: "prep-finish", label: "Mini quiches · Dressage", date: "2026-10-17", recipeLineId: "line-quiche", recipeId: "quiche", preparationId: "finish" },
      ],
    });
    expect(prepLinesForDate([decomposed], recipeById, clientById, DEFAULT_COURSES, "2026-10-17")).toEqual([]);
    expect(prepTasksForDate([decomposed], clientById, "2026-10-17").map((task) => task.taskId)).toEqual(["prep-finish"]);
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
  it("personInitials uses explicit initials, then first and last initials for full names", () => {
    expect(personInitials(people[0])).toBe("AM");
    expect(personInitials(people[1])).toBe("KR");
    expect(personInitials({ name: "élodie", initials: "  " })).toBe("ÉL");
    expect(personInitials({ name: "Margaux Dupont" })).toBe("MD");
    expect(personInitials({ name: "Maxime Martin" })).toBe("MM");
  });
  it("distinguishes Margaux and Maxime even when stored initials collide", () => {
    const team = [{ personId: "margaux", name: "Margaux", initials: "M" }, { personId: "maxime", name: "Maxime", initials: "M" }];
    expect(team.map(p => personInitials(p, team))).toEqual(["MAR", "MAX"]);
    const duplicates = [{ personId: "a", name: "Marie" }, { personId: "b", name: "Marie" }];
    expect(new Set(duplicates.map(p => personInitials(p, duplicates))).size).toBe(2);
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

describe("upgradeCourses", () => {
  it("serves the six defaults for undefined and []", () => {
    expect(upgradeCourses(undefined)).toBe(DEFAULT_COURSES);
    expect(upgradeCourses([])).toBe(DEFAULT_COURSES);
  });
  it("serves the six defaults for the legacy five and for the V2 six", () => {
    expect(upgradeCourses([...LEGACY_DEFAULT_COURSES])).toBe(DEFAULT_COURSES);
    expect(upgradeCourses([...LEGACY_DEFAULT_COURSES_V2])).toBe(DEFAULT_COURSES);
    expect(upgradeCourses([...LEGACY_DEFAULT_COURSES])).toEqual(["Apéritif", "Entrée", "Plat", "Walking dinner", "Buffet", "Dessert"]);
  });
  it("keeps a custom list as is", () => {
    const custom = ["Plat", "Dessert"];
    expect(upgradeCourses(custom)).toBe(custom);
    expect(upgradeCourses(custom)).toEqual(["Plat", "Dessert"]);
  });
  it("strips the alias keys from a custom list, case-insensitively", () => {
    expect(upgradeCourses(["Apéritif", "Mignardises", "Plat"])).toEqual(["Apéritif", "Plat"]);
    expect(upgradeCourses(["Apéritif", "mignardise", "Plat", "ZAKOUSKIS"])).toEqual(["Apéritif", "Plat"]);
  });
  it("serves the six defaults when the filter empties the list", () => {
    expect(upgradeCourses(["Mignardises"])).toBe(DEFAULT_COURSES);
    expect(upgradeCourses(["Zakouskis", "Mignardises"])).toBe(DEFAULT_COURSES);
  });
  it("keeps the legacy list in another order", () => {
    const reordered = ["Entrée", "Apéritif", "Plat", "Dessert", "Autre"];
    expect(upgradeCourses(reordered)).toBe(reordered);
  });
});

describe("prep day helpers", () => {
  const sat = { date: "2026-10-17" };
  it("prepDateOf falls back to the event day", () => {
    expect(prepDateOf({}, sat)).toBe("2026-10-17");
    expect(prepDateOf({ prepDate: "2026-10-15" }, sat)).toBe("2026-10-15");
    expect(prepDateOf({}, { date: "2026-10-17T18:00:00.000Z" })).toBe("2026-10-17");
  });
  it("isMoved is false without prepDate and true with a different date", () => {
    expect(isMoved({}, sat)).toBe(false);
    expect(isMoved({ prepDate: "2026-10-17" }, sat)).toBe(false);
    expect(isMoved({ prepDate: "2026-10-15" }, sat)).toBe(true);
  });
  it("tasksOf and tasksOn", () => {
    const tasks = [
      { taskId: "t1", label: "Dégeler le poisson", date: "2026-10-15" },
      { taskId: "t2", label: "Cuire les sablés", date: "2026-10-16" },
    ];
    expect(tasksOf({})).toEqual([]);
    expect(tasksOf({ tasks })).toBe(tasks);
    expect(tasksOn({ tasks }, "2026-10-16").map((t) => t.taskId)).toEqual(["t2"]);
    expect(tasksOn({}, "2026-10-16")).toEqual([]);
  });
  it("ownDayLines and movedOutLines split the recipes", () => {
    const ev = { date: "2026-10-17", recipes: [line("poulet", { lineId: "own" }), line("tarte", { lineId: "moved", prepDate: "2026-10-15" })] };
    expect(ownDayLines(ev).map((l) => l.lineId)).toEqual(["own"]);
    expect(movedOutLines(ev).map((l) => l.lineId)).toEqual(["moved"]);
  });
  it("removes a decomposed recipe root from the own-day and moved-out schedule", () => {
    const ev = event({
      eventId: "components",
      date: "2026-10-17",
      recipes: [line("quiche", { lineId: "root", prepDate: "2026-10-15" })],
      tasks: [
        { taskId: "dough", label: "Mini quiches · Pâte", date: "2026-10-15", recipeLineId: "root", recipeId: "quiche", preparationId: "dough" },
        { taskId: "filling", label: "Mini quiches · Farce", date: "2026-10-15", recipeLineId: "root", recipeId: "quiche", preparationId: "filling" },
        { taskId: "finish", label: "Mini quiches · Dressage", date: "2026-10-17", recipeLineId: "root", recipeId: "quiche", preparationId: "finish" },
      ],
    });
    expect(scheduledRecipeLines(ev)).toEqual([]);
    expect(ownDayLines(ev)).toEqual([]);
    expect(movedOutLines(ev)).toEqual([]);

    const plan = weekPlan([ev], "2026-10-12");
    expect(plan.days.reduce((total, day) => total + day.linesTotal, 0)).toBe(3);
    expect(plan.days[3].movedIn[0].lines).toEqual([]);
    expect(plan.days[3].movedIn[0].tasks.map((task) => task.taskId)).toEqual(["dough", "filling"]);
    expect(plan.days[5].events[0].recipes).toHaveLength(1);
    expect(plan.days[5].linesTotal).toBe(1);
  });
});

describe("shiftPrepDates", () => {
  const ev = {
    date: "2026-10-17",
    recipes: [line("tarte", { lineId: "moved", prepDate: "2026-10-15" }), line("poulet", { lineId: "own" })],
    tasks: [{ taskId: "t1", label: "Cuire les sablés", date: "2026-10-16" }],
  };
  it("moves explicit prep dates and task dates by the same number of days", () => {
    const r = shiftPrepDates(ev, "2026-10-24");
    expect(r.recipes[0].prepDate).toBe("2026-10-22");
    expect(r.tasks[0].date).toBe("2026-10-23");
  });
  it("leaves a line without prepDate without one", () => {
    const r = shiftPrepDates(ev, "2026-10-24");
    expect(r.recipes[1]).not.toHaveProperty("prepDate");
    expect(r.recipes[1]).toEqual(line("poulet", { lineId: "own" }));
  });
  it("moves backwards", () => {
    const r = shiftPrepDates(ev, "2026-10-10");
    expect(r.recipes[0].prepDate).toBe("2026-10-08");
    expect(r.tasks[0].date).toBe("2026-10-09");
  });
  it("returns equal arrays for the same date", () => {
    const r = shiftPrepDates(ev, "2026-10-17");
    expect(r.recipes).toEqual(ev.recipes);
    expect(r.tasks).toEqual(ev.tasks);
  });
  it("treats a missing tasks array as empty", () => {
    expect(shiftPrepDates({ date: "2026-10-17", recipes: [] }, "2026-10-24")).toEqual({ recipes: [], tasks: [] });
  });
});

describe("moved lines and tasks on a day", () => {
  const clientById = new Map([["dupont", { name: "Dupont" }]]);
  const mariage = event({
    eventId: "mariage",
    name: "Mariage Dupont",
    date: "2026-10-17",
    clientId: "dupont",
    assignedTo: ["amelie"],
    recipes: [
      line("poulet", { lineId: "poulet-sat" }),
      line("tarte", { lineId: "sables", course: "Mignardises", prepDate: "2026-10-15", assignedTo: ["kristoff"] }),
      line("quiche", { lineId: "quiche-thu", prepDate: "2026-10-15" }),
    ],
    tasks: [
      { taskId: "t-poisson", label: "Dégeler le poisson", date: "2026-10-15" },
      { taskId: "t-sables", label: "Cuire les sablés", date: "2026-10-16", assignedTo: ["kristoff"] },
    ],
  });
  const lunch = event({
    eventId: "lunch",
    name: "Lunch Delen",
    date: "2026-10-15",
    recipes: [line("tarte", { lineId: "lunch-dessert" })],
    tasks: [{ taskId: "t-pain", label: "Commander le pain", date: "2026-10-15" }],
  });
  const brunch = event({
    eventId: "brunch",
    name: "Brunch Martin",
    date: "2026-10-18",
    recipes: [line("quiche", { lineId: "brunch-quiche", prepDate: "2026-10-15" })],
  });
  const events = [brunch, mariage, lunch];

  it("prepLinesForDate returns a moved line on its prep day with moved, date and eventDate", () => {
    const thu = prepLinesForDate(events, recipeById, clientById, DEFAULT_COURSES, "2026-10-15");
    const sables = thu.find((l) => l.lineId === "sables");
    expect(sables).toMatchObject({
      kind: "recipe",
      moved: true,
      date: "2026-10-15",
      eventDate: "2026-10-17",
      course: "Dessert",
      clientName: "Dupont",
      assignedTo: ["kristoff"],
      ownAssignment: true,
    });
    const sat = prepLinesForDate(events, recipeById, clientById, DEFAULT_COURSES, "2026-10-17");
    expect(sat.map((l) => l.lineId)).toEqual(["poulet-sat"]);
    expect(sat[0]).toMatchObject({ moved: false, date: "2026-10-17", eventDate: "2026-10-17", assignedTo: ["amelie"], ownAssignment: false });
  });

  it("puts own-day lines first, then moved-in lines grouped by event date, each group in course order", () => {
    const thu = prepLinesForDate(events, recipeById, clientById, DEFAULT_COURSES, "2026-10-15");
    expect(thu.map((l) => l.lineId)).toEqual(["lunch-dessert", "quiche-thu", "sables", "brunch-quiche"]);
    expect(thu.map((l) => l.moved)).toEqual([false, true, true, true]);
  });

  it("prepTasksForDate returns the day's tasks, own events first, with inherited assignees", () => {
    const thu = prepTasksForDate(events, clientById, "2026-10-15");
    expect(thu.map((t) => t.taskId)).toEqual(["t-pain", "t-poisson"]);
    expect(thu[1]).toMatchObject({
      kind: "task",
      label: "Dégeler le poisson",
      moved: true,
      date: "2026-10-15",
      eventDate: "2026-10-17",
      eventName: "Mariage Dupont",
      clientName: "Dupont",
      prepStatus: "todo",
      assignedTo: ["amelie"],
      ownAssignment: false,
    });
    expect(thu[0]).toMatchObject({ moved: false, assignedTo: [], ownAssignment: false });
    const fri = prepTasksForDate(events, clientById, "2026-10-16");
    expect(fri).toHaveLength(1);
    expect(fri[0]).toMatchObject({ taskId: "t-sables", assignedTo: ["kristoff"], ownAssignment: true });
    expect(prepTasksForDate(events, clientById, "2026-10-17")).toEqual([]);
  });

  it("dayItems lists lines then tasks", () => {
    const items = dayItems(events, recipeById, clientById, DEFAULT_COURSES, "2026-10-15");
    expect(items.map((i) => i.kind)).toEqual(["recipe", "recipe", "recipe", "recipe", "task", "task"]);
    expect(items.map((i) => (i.kind === "recipe" ? i.lineId : i.taskId))).toEqual([
      "lunch-dessert", "quiche-thu", "sables", "brunch-quiche", "t-pain", "t-poisson",
    ]);
  });

  it("groupByPerson and filterByPerson work on mixed items", () => {
    const items: DayItem[] = dayItems(events, recipeById, clientById, DEFAULT_COURSES, "2026-10-15");
    const groups = groupByPerson(items, people);
    expect(groups.map((g) => [g.personId, g.lines.map((i) => (i.kind === "recipe" ? i.lineId : i.taskId))])).toEqual([
      ["amelie", ["quiche-thu", "t-poisson"]],
      ["kristoff", ["sables"]],
      [null, ["lunch-dessert", "brunch-quiche", "t-pain"]],
    ]);
    expect(filterByPerson(items, "amelie").map((i) => i.kind)).toEqual(["recipe", "task"]);
    expect(filterByPerson(items, "nobody")).toEqual([]);
  });

  it("groupByRecipe on a day with tasks groups the lines the same as without", () => {
    const withTasks = prepLinesForDate(events, recipeById, clientById, DEFAULT_COURSES, "2026-10-15");
    const withoutTasks = prepLinesForDate(events.map((e) => ({ ...e, tasks: [] })), recipeById, clientById, DEFAULT_COURSES, "2026-10-15");
    expect(groupByRecipe(withTasks)).toEqual(groupByRecipe(withoutTasks));
    expect(groupByRecipe(withTasks).map((g) => [g.recipeId, g.total])).toEqual([
      ["tarte", 20],
      ["quiche", 20],
    ]);
  });

  it("weekPlan lists moved-in events, counts by prep day and keeps guests by event date", () => {
    const nextWeek = event({
      eventId: "next",
      name: "Hoona lundi",
      date: "2026-10-19",
      guestCount: 40,
      recipes: [line("quiche", { lineId: "next-quiche", prepDate: "2026-10-15", assignedTo: ["zed"] })],
    });
    const plan = weekPlan([...events, nextWeek], "2026-10-12", people);
    const thu = plan.days[3];
    const sat = plan.days[5];
    expect(thu.date).toBe("2026-10-15");
    expect(thu.events.map((e) => e.eventId)).toEqual(["lunch"]);
    expect(thu.movedIn.map((m) => [m.event.eventId, m.lines.map((l) => l.lineId), m.tasks.map((t) => t.taskId)])).toEqual([
      ["mariage", ["sables", "quiche-thu"], ["t-poisson"]],
      ["brunch", ["brunch-quiche"], []],
      ["next", ["next-quiche"], []],
    ]);
    expect(thu.guests).toBe(10);
    expect(thu).toMatchObject({ linesTotal: 7, linesDone: 0 });
    expect(plan.peopleByDay["2026-10-15"]).toEqual(["amelie", "kristoff", "zed"]);
    expect(sat.events.map((e) => e.eventId)).toEqual(["mariage"]);
    expect(sat.movedIn).toEqual([]);
    expect(sat).toMatchObject({ linesTotal: 1, guests: 10 });
    expect(plan.days[4]).toMatchObject({ date: "2026-10-16", linesTotal: 1, events: [] });
    expect(plan.days[4].movedIn.map((m) => [m.event.eventId, m.tasks.map((t) => t.taskId)])).toEqual([["mariage", ["t-sables"]]]);
    expect(plan.peopleByDay["2026-10-16"]).toEqual(["kristoff"]);
    expect(plan.days[0].events).toEqual([]);
    expect(plan.linesTotal).toBe(9);
    expect(plan.guests).toBe(30);
  });

  it("weekPlan counts done items over the same set", () => {
    const ev = event({
      eventId: "e",
      date: "2026-10-17",
      recipes: [line("poulet", { lineId: "a", prepStatus: "done" }), line("tarte", { lineId: "b", prepDate: "2026-10-15", prepStatus: "done" })],
      tasks: [{ taskId: "t", label: "x", date: "2026-10-15", prepStatus: "done" }],
    });
    const plan = weekPlan([ev], "2026-10-12");
    expect(plan.days[3]).toMatchObject({ linesTotal: 2, linesDone: 2 });
    expect(plan.days[5]).toMatchObject({ linesTotal: 1, linesDone: 1 });
    expect(plan).toMatchObject({ linesTotal: 3, linesDone: 3 });
  });
});

describe("foodRevenue, signedRevenue and pricePerGuestOf", () => {
  it("returns the typed total in total mode, not price × guests", () => {
    const e = { pricingMode: "total" as const, sellingTotal: 1000, sellingPricePerGuest: 333.33, guestCount: 3 };
    expect(foodRevenue(e)).toBe(1000);
    expect(foodRevenue(e)).not.toBe(333.33 * 3);
    expect(pricePerGuestOf(e)).toBe(333.33);
  });
  it("behaves as today when pricingMode is absent", () => {
    expect(foodRevenue({ sellingPricePerGuest: 19.99, guestCount: 3 })).toBe(59.97);
    expect(signedRevenue({ sellingPricePerGuest: 19.99, guestCount: 3 })).toBe(59.97);
    expect(pricePerGuestOf({ sellingPricePerGuest: 19.99, guestCount: 3 })).toBe(19.99);
  });
  it("never returns NaN and gives 0 per guest without guests", () => {
    expect(foodRevenue({ pricingMode: "total", sellingPricePerGuest: 0, guestCount: 3 })).toBe(0);
    expect(foodRevenue({ sellingPricePerGuest: Number.NaN, guestCount: 3 })).toBe(0);
    expect(pricePerGuestOf({ sellingPricePerGuest: 20, guestCount: 0 })).toBe(0);
    expect(pricePerGuestOf({ pricingMode: "total", sellingTotal: 500, sellingPricePerGuest: 0, guestCount: 0 })).toBe(0);
  });
  it("signedRevenue adds the billed lines at 21 % and 6 %", () => {
    const e = {
      sellingPricePerGuest: 20,
      guestCount: 10,
      revenueLines: [
        { label: "Service", amount: 150.5, vatRate: 21 as const },
        { label: "Livraison", amount: 30, vatRate: 6 as const },
      ],
    };
    expect(revenueLinesTotal(e)).toBe(180.5);
    expect(signedRevenue(e)).toBe(380.5);
    expect(revenueLinesTotal({})).toBe(0);
  });
  it("weekPlan and monthSignedRevenue include the billed lines", () => {
    const ev = event({
      eventId: "a",
      date: "2026-10-12",
      guestCount: 10,
      sellingPricePerGuest: 20,
      revenueLines: [{ label: "Service", amount: 50, vatRate: 21 }],
    });
    expect(weekPlan([ev], "2026-10-12").signedRevenue).toBe(250);
    expect(monthSignedRevenue([ev], "2026-10")).toBe(250);
  });
});

describe("vatBreakdown and revenueTvac", () => {
  const e = {
    sellingPricePerGuest: 50,
    guestCount: 10,
    vatRate: 12 as const,
    revenueLines: [
      { label: "Service", amount: 100, vatRate: 21 as const },
      { label: "Livraison", amount: 50.5, vatRate: 21 as const },
    ],
  };
  it("gives one bucket per rate, ascending, with tvac equal to htva + tva", () => {
    const buckets = vatBreakdown(e);
    expect(buckets).toEqual([
      { rate: 12, htva: 500, tva: 60, tvac: 560 },
      { rate: 21, htva: 150.5, tva: 31.61, tvac: 182.11 },
    ]);
    for (const b of buckets) expect(b.tvac).toBe(sumMoney([b.htva, b.tva]));
  });
  it("revenueTvac equals the sum of the buckets", () => {
    expect(revenueTvac(e)).toBe(742.11);
  });
  it("puts the food at 0 % when the event has no rate and drops empty buckets", () => {
    expect(vatBreakdown({ sellingPricePerGuest: 10, guestCount: 2, vatRate: undefined })).toEqual([{ rate: 0, htva: 20, tva: 0, tvac: 20 }]);
    expect(vatBreakdown({ sellingPricePerGuest: 0, guestCount: 2, vatRate: 12, revenueLines: [{ label: "x", amount: 0, vatRate: 21 }] })).toEqual([]);
  });
});

describe("recipeCategoryOf and courseOf", () => {
  it("prefers category, then defaultCourse", () => {
    expect(recipeCategoryOf({ category: "Buffet", defaultCourse: "Plat", type: "Lunch" })).toBe("Buffet");
    expect(recipeCategoryOf({ defaultCourse: "Dessert", type: "Lunch" })).toBe("Dessert");
  });
  it("skips defaultCourse Autre and maps the legacy type", () => {
    expect(recipeCategoryOf({ defaultCourse: "Autre", type: "Lunch" })).toBe("Plat");
    expect(recipeCategoryOf({ type: "Menu semaine" })).toBe("Plat");
    expect(recipeCategoryOf({ type: "Walking dinner" })).toBe("Walking dinner");
  });
  it("keeps an unknown custom type and falls back to Autre", () => {
    expect(recipeCategoryOf({ type: "Fromage" })).toBe("Fromage");
    expect(recipeCategoryOf({})).toBe("Autre");
    expect(recipeCategoryOf({ type: "", defaultCourse: "Autre" })).toBe("Autre");
  });
  it("reads Zakouskis as Apéritif and Mignardises as Dessert from every source", () => {
    expect(recipeCategoryOf({ type: "Zakouskis" })).toBe("Apéritif");
    expect(recipeCategoryOf({ defaultCourse: "Mignardises" })).toBe("Dessert");
    expect(recipeCategoryOf({ category: "Mignardises" })).toBe("Dessert");
    expect(recipeCategoryOf({ category: "mignardise" })).toBe("Dessert");
    expect(recipeCategoryOf({ category: "ZAKOUSKIS", type: "Buffet" })).toBe("Apéritif");
    expect(recipeCategoryOf({ type: "Buffet" })).toBe("Buffet");
  });
  it("courseOf: the line override wins, then the recipe category, then Autre", () => {
    expect(courseOf({ course: "Entrée" }, { category: "Plat" })).toBe("Entrée");
    expect(courseOf({}, { category: "Plat" })).toBe("Plat");
    expect(courseOf({}, { type: "Lunch" })).toBe("Plat");
    expect(courseOf({}, { defaultCourse: "Apéritif" })).toBe("Apéritif");
    expect(courseOf({})).toBe("Autre");
  });
  it("courseOf applies the alias to the line's own course", () => {
    expect(courseOf({ course: "Mignardises" }, { category: "Apéritif" })).toBe("Dessert");
    expect(courseOf({ course: "zakouski" })).toBe("Apéritif");
    expect(courseOf({}, { defaultCourse: "Mignardises" })).toBe("Dessert");
  });
});

describe("aliasCategory and isLegacyCategory", () => {
  it("maps the two old values in any case, singular or plural, and keeps the rest", () => {
    expect(aliasCategory("Mignardise")).toBe("Dessert");
    expect(aliasCategory("ZAKOUSKIS")).toBe("Apéritif");
    expect(aliasCategory(" mignardises ")).toBe("Dessert");
    expect(aliasCategory("Dessert")).toBe("Dessert");
    expect(aliasCategory("Fromage")).toBe("Fromage");
    expect(LEGACY_TYPE_TO_CATEGORY).toEqual({ Lunch: "Plat", "Menu semaine": "Plat", Zakouskis: "Apéritif", Mignardises: "Dessert" });
    expect(LEGACY_CATEGORY_ALIASES).toEqual({ zakouskis: "Apéritif", mignardises: "Dessert" });
  });
  it("isLegacyCategory is true for the aliases only", () => {
    expect(isLegacyCategory("Mignardises")).toBe(true);
    expect(isLegacyCategory("zakouski")).toBe(true);
    expect(isLegacyCategory("Dessert")).toBe(false);
    expect(isLegacyCategory("constructor")).toBe(false);
    expect(isLegacyCategory(undefined)).toBe(false);
  });
});

describe("categoryOptions", () => {
  it("appends the values used by recipes that are not in the list, alphabetical, never an alias", () => {
    const recipes = [
      { category: "Mignardises", type: "Mignardises" },
      { type: "Plat" },
      { type: "Fromage" },
      { category: "Mignardises", type: "Buffet" },
      { type: "Zakouskis" },
    ];
    expect(categoryOptions(DEFAULT_COURSES, recipes)).toEqual([...DEFAULT_COURSES, "Fromage"]);
  });
  it("returns the list as is when every recipe is in it", () => {
    expect(categoryOptions(DEFAULT_COURSES, [{ type: "Lunch" }, { category: "Dessert", type: "Buffet" }])).toEqual(DEFAULT_COURSES);
    expect(categoryOptions(DEFAULT_COURSES, [])).toEqual(DEFAULT_COURSES);
  });
});

describe("isIncompleteRecipe and incompleteCount", () => {
  const lookup: RecipeLookup = new Map([
    ["empty", { name: "Houmous maison", ingredients: [] }],
    ["full", { name: "Mini quiches", ingredients: [{ ingredientId: "oeuf", qty: 2, unit: "pièce", lossPct: 0 }] }],
  ]);
  it("isIncompleteRecipe is true without ingredients", () => {
    expect(isIncompleteRecipe({ ingredients: [] })).toBe(true);
    expect(isIncompleteRecipe({ ingredients: [{ ingredientId: "oeuf", qty: 2, unit: "pièce", lossPct: 0 }] })).toBe(false);
  });
  it("incompleteCount counts known recipes without ingredients and ignores unknown ids", () => {
    const lines = [{ recipeId: "empty" }, { recipeId: "full" }, { recipeId: "ghost" }, { recipeId: "empty" }];
    expect(incompleteCount(lines, lookup)).toBe(2);
    expect(incompleteCount([{ recipeId: "ghost" }], lookup)).toBe(0);
    expect(incompleteCount([], lookup)).toBe(0);
  });
});

describe("recipePreparationTasks", () => {
  it("creates separately dated tasks and skips components already added to an event", () => {
    const tasks = recipePreparationTasks(
      {
        recipeId: "sable-chevre",
        name: "Sablé au comté · mousse de chèvre",
        preparations: [
          { preparationId: "pate", name: "Pâte à sablés", daysBefore: 2 },
          { preparationId: "mousse", name: "Mousse de chèvre", daysBefore: 2, description: "Garder au frais" },
          { preparationId: "dressage", name: "Dressage", daysBefore: 0 },
        ],
      },
      { lineId: "line-1" },
      "2026-10-17",
      ["pate"],
    );

    expect(tasks).toEqual([
      {
        label: "Sablé au comté · mousse de chèvre · Mousse de chèvre",
        date: "2026-10-15",
        notes: "Garder au frais",
        recipeLineId: "line-1",
        recipeId: "sable-chevre",
        preparationId: "mousse",
      },
      {
        label: "Sablé au comté · mousse de chèvre · Dressage",
        date: "2026-10-17",
        recipeLineId: "line-1",
        recipeId: "sable-chevre",
        preparationId: "dressage",
      },
    ]);
  });
});

describe("billingFromClient", () => {
  it("joins name, address and VAT number with newlines", () => {
    expect(billingFromClient({ name: "Dupont SA", address: "Rue des Lilas 4, 1050 Ixelles", vatNumber: "BE 0123.456.789" })).toBe(
      "Dupont SA\nRue des Lilas 4, 1050 Ixelles\nBE 0123.456.789",
    );
  });
  it("gives two lines without a VAT number and drops blank parts", () => {
    expect(billingFromClient({ name: "Dupont SA", address: "Rue des Lilas 4, 1050 Ixelles" })).toBe("Dupont SA\nRue des Lilas 4, 1050 Ixelles");
    expect(billingFromClient({ name: " Dupont SA ", address: "  ", vatNumber: "BE 0123.456.789" })).toBe("Dupont SA\nBE 0123.456.789");
    expect(billingFromClient({ name: "Dupont SA" })).toBe("Dupont SA");
  });
});
