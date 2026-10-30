import type { AppEvent, Recipe } from "../entities";
import { addDays } from "./dates";

export interface ScheduleOptions {
  from: string;
  to: string;
  start: string;
  end: string;
  workers: number;
  ovens: number;
  stoves: number;
}
export interface ScheduleSlot {
  eventId: string;
  taskId: string;
  recipeId: string;
  label: string;
  date: string;
  start: string;
  end: string;
  resource: string;
  minutes: number;
}
export interface ScheduleIssue {
  eventId: string;
  taskId: string;
  recipeId?: string;
  label: string;
  reason: string;
}
export interface ProductionSchedule {
  slots: ScheduleSlot[];
  issues: ScheduleIssue[];
  note: string;
}
const minutesOf = (clock: string) =>
  Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
const clockOf = (minutes: number) =>
  `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;

/** Conservative schedule: one worker and one equipment slot reserved for the whole batch. Existing task dates stay fixed. */
export function productionSchedule(
  events: AppEvent[],
  recipes: Recipe[],
  options: ScheduleOptions,
): ProductionSchedule {
  const result: ProductionSchedule = {
    slots: [],
    issues: [],
    note: "Dates conservées. Une personne est réservée pendant toute la durée. Durée par lot × nombre de lots arrondi vers le haut. Vérifiez les pauses, déplacements et capacités avant application.",
  };
  const byRecipe = new Map(recipes.map((r) => [r.recipeId, r]));
  const pending: {
    event: AppEvent;
    task: NonNullable<AppEvent["tasks"]>[number];
    recipe: Recipe;
    duration: number;
    resource: "bench" | "oven" | "stove";
    deps: string[];
    deadline: number;
  }[] = [];
  const completed = new Map<string, string>();
  const key = (eventId: string, taskId: string) => `${eventId}:${taskId}`;
  const issue = (
    event: AppEvent,
    task: NonNullable<AppEvent["tasks"]>[number],
    reason: string,
  ) =>
    result.issues.push({
      eventId: event.eventId,
      taskId: task.taskId,
      recipeId: task.recipeId,
      label: task.label,
      reason,
    });
  let active = false;
  for (const event of events) {
    if (event.status === "completed") continue;
    for (const task of event.tasks ?? []) {
      if (task.prepStatus === "done") {
        completed.set(key(event.eventId, task.taskId), `${task.date}T00:00`);
        continue;
      }
      if (task.date < options.from || task.date > options.to) continue;
      if (task.prepStatus === "doing") {
        issue(
          event,
          task,
          "Préparation en cours. Terminez-la avant de recalculer cette période.",
        );
        active = true;
        continue;
      }
      const line = event.recipes.find((l) => l.lineId === task.recipeLineId);
      const recipe = line && byRecipe.get(line.recipeId);
      const part = recipe?.preparations?.find(
        (p) => p.preparationId === task.preparationId,
      );
      if (!recipe || !part?.durationMinutes || !part.resource) {
        issue(
          event,
          task,
          "Renseignez la durée et le matériel dans la recette.",
        );
        continue;
      }
      const eventDate = event.date.slice(0, 10);
      if (
        task.date < addDays(eventDate, -part.daysBefore) ||
        task.date > eventDate
      ) {
        issue(
          event,
          task,
          "Date hors de la fenêtre définie par « Jours avant » dans la recette.",
        );
        continue;
      }
      const deps: string[] = [];
      let missing = false;
      for (const id of part.dependsOn ?? []) {
        const dep = event.tasks?.find(
          (t) => t.recipeLineId === line!.lineId && t.preparationId === id,
        );
        if (!dep) {
          missing = true;
          break;
        }
        deps.push(key(event.eventId, dep.taskId));
      }
      if (missing) {
        issue(event, task, "Une préparation requise manque dans l'événement.");
        continue;
      }
      const duration =
        part.durationMinutes * Math.ceil(line!.portions / recipe.portions);
      pending.push({
        event,
        task,
        recipe,
        duration,
        resource: part.resource,
        deps,
        deadline:
          task.date === eventDate && event.deliveryTime
            ? minutesOf(event.deliveryTime)
            : 1440,
      });
    }
    for (const line of event.recipes) {
      const date = line.prepDate ?? event.date.slice(0, 10);
      if (
        date >= options.from &&
        date <= options.to &&
        line.prepStatus !== "done" &&
        !(event.tasks ?? []).some((t) => t.recipeLineId === line.lineId)
      ) {
        result.issues.push({
          eventId: event.eventId,
          taskId: line.lineId,
          recipeId: line.recipeId,
          label: byRecipe.get(line.recipeId)?.name ?? "Recette",
          reason:
            "Ajoutez les préparations, durées et matériel dans la recette puis dans l'événement.",
        });
      }
    }
  }
  if (active) return result;
  const occupancy = new Map<
    string,
    { workers: number[]; oven: number[]; stove: number[] }
  >();
  const start = minutesOf(options.start),
    end = minutesOf(options.end);
  // Equipment work first when multiple independent preparations are ready.
  pending.sort(
    (a, b) =>
      a.task.date.localeCompare(b.task.date) ||
      Number(b.resource !== "bench") - Number(a.resource !== "bench") ||
      b.duration - a.duration ||
      a.task.label.localeCompare(b.task.label),
  );
  while (pending.length) {
    const index = pending.findIndex((p) =>
      p.deps.every((dep) => completed.has(dep)),
    );
    if (index < 0) {
      for (const p of pending)
        issue(
          p.event,
          p.task,
          "Dépendance non planifiée, hors période ou circulaire.",
        );
      break;
    }
    const p = pending.splice(index, 1)[0];
    const day = occupancy.get(p.task.date) ?? {
      workers: Array(1440).fill(0),
      oven: Array(1440).fill(0),
      stove: Array(1440).fill(0),
    };
    occupancy.set(p.task.date, day);
    let earliest = start;
    let dependencyLater = false;
    for (const dep of p.deps) {
      const finish = completed.get(dep)!;
      if (finish.slice(0, 10) > p.task.date) dependencyLater = true;
      if (finish.slice(0, 10) === p.task.date)
        earliest = Math.max(earliest, minutesOf(finish.slice(11)));
    }
    let chosen = -1;
    const limit = Math.min(end, p.deadline);
    if (!dependencyLater)
      for (let minute = earliest; minute + p.duration <= limit; minute++) {
        let fits = true;
        for (let t = minute; t < minute + p.duration; t++) {
          if (
            day.workers[t] >= options.workers ||
            (p.resource !== "bench" &&
              day[p.resource][t] >=
                (p.resource === "oven" ? options.ovens : options.stoves))
          ) {
            fits = false;
            break;
          }
        }
        if (fits) {
          chosen = minute;
          break;
        }
      }
    if (chosen < 0) {
      issue(
        p.event,
        p.task,
        dependencyLater
          ? "Dépendance prévue un jour ultérieur."
          : "Aucun créneau avec les horaires, effectifs, matériel et livraison indiqués.",
      );
      continue;
    }
    for (let t = chosen; t < chosen + p.duration; t++) {
      day.workers[t]++;
      if (p.resource !== "bench") day[p.resource][t]++;
    }
    const finish = clockOf(chosen + p.duration);
    result.slots.push({
      eventId: p.event.eventId,
      taskId: p.task.taskId,
      recipeId: p.recipe.recipeId,
      label: p.task.label,
      date: p.task.date,
      start: clockOf(chosen),
      end: finish,
      resource: p.resource,
      minutes: p.duration,
    });
    completed.set(
      key(p.event.eventId, p.task.taskId),
      `${p.task.date}T${finish}`,
    );
  }
  result.slots.sort(
    (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
  );
  return result;
}
