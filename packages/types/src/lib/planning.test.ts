import type { AppEvent, EventRecipeLine } from "../entities/event";
import type { Person } from "../entities/settings";
import { DEFAULT_COURSES, LEGACY_DEFAULT_COURSES } from "../entities/settings";
import {
  assigneesOf,
  courseIndex,
  dayItems,
  filterByPerson,
  groupByCourse,
  groupByPerson,
  groupByRecipe,
  isMoved,
  isWeekdayLabel,
  monthSignedRevenue,
  movedOutLines,
  ownDayLines,
  personInitials,
  personName,
  prepDateOf,
  prepLinesForDate,
  prepTasksForDate,
  shiftPrepDates,
  shortEventName,
  signedRevenue,
  slugifyPersonId,
  sortEventLines,
  tasksOf,
  tasksOn,
  upgradeCourses,
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

describe("courseIndex", () => {
  it("returns the position in the list", () => {
    expect(courseIndex("Plat", DEFAULT_COURSES)).toBe(2);
  });
  it("sends undefined and unknown values under Autre", () => {
    expect(courseIndex(undefined, DEFAULT_COURSES)).toBe(5);
    expect(courseIndex("Fromage", DEFAULT_COURSES)).toBe(5);
  });
  it("places Mignardises between Dessert and Autre", () => {
    expect(courseIndex("Dessert", DEFAULT_COURSES)).toBe(3);
    expect(courseIndex("Mignardises", DEFAULT_COURSES)).toBe(4);
    expect(courseIndex("Autre", DEFAULT_COURSES)).toBe(5);
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
  it("puts a Mignardises line after Dessert and before Autre", () => {
    const lines = [
      line("poulet", { lineId: "autre" }),
      line("tarte", { lineId: "mign", course: "Mignardises" }),
      line("tarte", { lineId: "dessert" }),
    ];
    expect(sortEventLines(lines, DEFAULT_COURSES, recipeById).map((l) => l.lineId)).toEqual(["dessert", "mign", "autre"]);
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

describe("upgradeCourses", () => {
  it("serves the default list for undefined, [] and the legacy list", () => {
    expect(upgradeCourses(undefined)).toBe(DEFAULT_COURSES);
    expect(upgradeCourses([])).toBe(DEFAULT_COURSES);
    expect(upgradeCourses([...LEGACY_DEFAULT_COURSES])).toBe(DEFAULT_COURSES);
    expect(DEFAULT_COURSES).toEqual(["Apéritif", "Entrée", "Plat", "Dessert", "Mignardises", "Autre"]);
  });
  it("keeps a custom list as is", () => {
    const custom = ["Plat", "Dessert"];
    expect(upgradeCourses(custom)).toBe(custom);
    expect(upgradeCourses(custom)).toEqual(["Plat", "Dessert"]);
  });
  it("keeps a list that already has Mignardises", () => {
    const withMign = ["Apéritif", "Plat", "Mignardises"];
    expect(upgradeCourses(withMign)).toBe(withMign);
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
      course: "Mignardises",
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
