import { PlanningController } from "./planning.module";
import type { AppEvent, Recipe } from "@packages/types";
const options = {
  from: "2026-01-02",
  to: "2026-01-02",
  start: "08:00",
  end: "18:00",
  workers: 1,
  ovens: 1,
  stoves: 1,
};
function harness() {
  const event = {
    eventId: "e",
    updatedAt: "v1",
    date: "2026-01-02",
    status: "upcoming",
    recipes: [{ lineId: "l", recipeId: "r", portions: 10 }],
    tasks: [
      {
        taskId: "t",
        label: "Cuire",
        date: "2026-01-02",
        recipeLineId: "l",
        preparationId: "p",
      },
    ],
  } as AppEvent;
  const recipe = {
    recipeId: "r",
    portions: 10,
    preparations: [
      {
        preparationId: "p",
        name: "Cuire",
        daysBefore: 0,
        durationMinutes: 30,
        resource: "oven",
      },
    ],
  } as Recipe;
  const events = {
    getAll: async () => [structuredClone(event)],
    applySchedule: jest.fn(async () => event),
  };
  return {
    event,
    recipe,
    events,
    controller: new PlanningController(
      events as any,
      { getAll: async () => [structuredClone(recipe)] } as any,
    ),
  };
}
it("recalculates the proposal on apply and checks the event revision", async () => {
  const { controller, events } = harness();
  const plan = await controller.preview(options);
  expect(plan.slots).toHaveLength(1);
  expect(
    (await controller.apply({ options, fingerprint: plan.fingerprint }))
      .results,
  ).toEqual([{ eventId: "e", ok: true }]);
  expect(events.applySchedule).toHaveBeenCalledWith("e", "v1", [
    expect.objectContaining({ taskId: "t", start: "08:00", end: "08:30" }),
  ]);
});
it("rejects a stale preview before writing and validates its input", async () => {
  const { controller, events, recipe } = harness();
  const plan = await controller.preview(options);
  recipe.preparations![0].durationMinutes = 60;
  await expect(
    controller.apply({ options, fingerprint: plan.fingerprint }),
  ).rejects.toThrow("données ont changé");
  expect(events.applySchedule).not.toHaveBeenCalled();
  await expect(
    controller.preview({ ...options, workers: 0 }),
  ).rejects.toThrow();
});
it("returns partial conflicts explicitly without hiding successfully applied events", async () => {
  const { controller, events } = harness();
  const plan = await controller.preview(options);
  events.applySchedule.mockRejectedValueOnce(new Error("Le planning a changé"));
  expect(
    (await controller.apply({ options, fingerprint: plan.fingerprint }))
      .results,
  ).toEqual([{ eventId: "e", ok: false, error: "Le planning a changé" }]);
});
