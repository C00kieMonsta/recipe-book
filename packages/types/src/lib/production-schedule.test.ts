import {
  productionSchedule,
  type ScheduleOptions,
} from "./production-schedule";
import type { AppEvent, Recipe } from "../entities";
const options: ScheduleOptions = {
  from: "2026-01-02",
  to: "2026-01-02",
  start: "08:00",
  end: "12:00",
  workers: 2,
  ovens: 1,
  stoves: 1,
};
function fixture() {
  const recipe = {
    recipeId: "r",
    portions: 10,
    preparations: [
      {
        preparationId: "bake",
        name: "Sablés",
        daysBefore: 2,
        durationMinutes: 60,
        resource: "oven",
      },
      {
        preparationId: "mousse",
        name: "Mousse",
        daysBefore: 2,
        durationMinutes: 30,
        resource: "bench",
      },
      {
        preparationId: "plate",
        name: "Dressage",
        daysBefore: 0,
        durationMinutes: 15,
        resource: "bench",
        dependsOn: ["bake", "mousse"],
      },
    ],
  } as Recipe;
  const event = {
    eventId: "e",
    date: "2026-01-02",
    recipes: [{ lineId: "l", recipeId: "r", portions: 10 }],
    tasks: recipe.preparations!.map((p) => ({
      taskId: p.preparationId,
      label: p.name,
      date: "2026-01-02",
      recipeId: "r",
      recipeLineId: "l",
      preparationId: p.preparationId,
    })),
    status: "upcoming",
  } as AppEvent;
  return { recipe, event };
}
it("starts equipment work first, overlaps independent work and waits for dependencies", () => {
  const { event, recipe } = fixture();
  const plan = productionSchedule([event], [recipe], options);
  expect(plan.issues).toEqual([]);
  expect(plan.slots.map((s) => [s.taskId, s.start, s.end])).toEqual([
    ["bake", "08:00", "09:00"],
    ["mousse", "08:00", "08:30"],
    ["plate", "09:00", "09:15"],
  ]);
});
it("respects equipment and worker capacity across events", () => {
  const { event, recipe } = fixture();
  const second = { ...event, eventId: "e2" };
  const plan = productionSchedule([event, second], [recipe], {
    ...options,
    workers: 1,
  });
  const intervals = plan.slots
    .map((s) => [
      Date.parse(`${s.date}T${s.start}`),
      Date.parse(`${s.date}T${s.end}`),
    ])
    .sort((a, b) => a[0] - b[0]);
  expect(
    intervals.every((s, i) => i === 0 || s[0] >= intervals[i - 1][1]),
  ).toBe(true);
  const ovens = productionSchedule(
    [event, second],
    [recipe],
    options,
  ).slots.filter((s) => s.resource === "oven");
  expect(ovens.map((s) => s.start)).toEqual(["08:00", "09:00"]);
});
it("does not invent duration, ignore delivery or move tasks outside their configured dates", () => {
  const { event, recipe } = fixture();
  recipe.preparations![1].durationMinutes = undefined;
  event.deliveryTime = "08:45";
  const plan = productionSchedule([event], [recipe], options);
  expect(plan.slots).toEqual([]);
  expect(plan.issues).toHaveLength(3);
  event.tasks![0].date = "2026-01-01";
  const earlier = productionSchedule([event], [recipe], {
    ...options,
    from: "2026-01-01",
  });
  expect(earlier.slots[0].date).toBe("2026-01-01");
});
it("scales batches, reports unavailable equipment, and blocks an in-progress period", () => {
  const { event, recipe } = fixture();
  event.recipes[0].portions = 15;
  expect(
    productionSchedule([event], [recipe], options).slots.find(
      (s) => s.taskId === "bake",
    )?.minutes,
  ).toBe(120);
  expect(
    productionSchedule([event], [recipe], { ...options, ovens: 0 }).issues.some(
      (i) => i.taskId === "bake",
    ),
  ).toBe(true);
  event.tasks![0].prepStatus = "doing";
  expect(productionSchedule([event], [recipe], options).slots).toEqual([]);
});
it("rejects unsafe preservation dates and cyclic dependencies", () => {
  const { event, recipe } = fixture();
  recipe.preparations![0].dependsOn = ["plate"];
  const plan = productionSchedule([event], [recipe], options);
  expect(plan.slots.map((s) => s.taskId)).toEqual(["mousse"]);
  expect(plan.issues).toHaveLength(2);
  event.tasks![2].date = "2026-01-01";
  expect(
    productionSchedule([event], [recipe], {
      ...options,
      from: "2026-01-01",
    }).issues.some((i) => i.reason.includes("fenêtre")),
  ).toBe(true);
});
