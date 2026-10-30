import type { AppEvent, Ingredient, Recipe } from "@packages/types";
import { round2, stripStepMarkup, tasksOf } from "@packages/types";

// Quantities come from recipe data. Ordering uses only explicit cooking words.
export function productionPlan(events: AppEvent[], recipes: Recipe[], ingredients: Ingredient[], from: string, to: string) {
  const recipeById = new Map(recipes.map((recipe) => [recipe.recipeId, recipe]));
  const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.ingredientId, ingredient]));
  const quantities = new Map<string, { ingredientId: string; name: string; unit: string; qty: number; purchaseQty: number;
    }>();
  const work: { eventId: string; eventName: string; lineId?: string; taskId?: string; recipeId?: string; label: string; date: string; cookingFirst: boolean; instructions: string;
  }[] = [];
  const warnings = new Set<string>();
  const inRange = (day: string) => day >= from && day <= to;
  const cooking = /\b(four|cuire|cuisson|rotir|r[oô]tissage|bouillir|mijoter|braiser|pocher|vapeur|frire|friture|chauffer|carameliser|caraméliser)\b/i;
  for (const event of events) {
    if (event.status === "completed") continue;
    const lines = new Map(event.recipes.map((line) => [line.lineId, line]));
    const includedLines = new Set<string>();
    const selectedParts = new Map<string, Set<string>>();
    const linkedLines = new Set<string>();
    for (const task of tasksOf(event)) {
      if (task.recipeLineId) linkedLines.add(task.recipeLineId);
      if (!inRange(task.date) || task.prepStatus === "done") continue;
      const line = task.recipeLineId ? lines.get(task.recipeLineId) : undefined;
      const recipe = line ? recipeById.get(line.recipeId) : undefined;
      const preparation = recipe?.preparations?.find((part) => part.preparationId === task.preparationId);
      const instructions = [preparation?.description, task.notes].filter(Boolean).join("\n");
      work.push({ eventId: event.eventId, eventName: event.name, taskId: task.taskId, lineId: line?.lineId, recipeId: line?.recipeId,
        label: task.label, date: task.date, cookingFirst: cooking.test(`${task.label} ${instructions}`), instructions });
      if (line) {
        includedLines.add(line.lineId);
        const selected = selectedParts.get(line.lineId) ?? new Set<string>();
        if (task.preparationId) selected.add(task.preparationId);
        selectedParts.set(line.lineId, selected);
      }
    }
    for (const line of event.recipes) {
      if (linkedLines.has(line.lineId) || line.prepStatus === "done") continue;
      const date = line.prepDate ?? event.date.slice(0, 10);
      if (!inRange(date)) continue;
      const recipe = recipeById.get(line.recipeId);
      const instructions = (recipe?.techniques ?? []).map(stripStepMarkup).join("\n");
      work.push({ eventId: event.eventId, eventName: event.name, lineId: line.lineId, recipeId: line.recipeId,
        label: recipe?.name ?? "Recette introuvable", date, cookingFirst: cooking.test(instructions), instructions });
      includedLines.add(line.lineId);
    }
    // Count each line once even when it has several preparations in the period.
    for (const lineId of includedLines) {
      const line = lines.get(lineId)!;
      const recipe = recipeById.get(line.recipeId);
      if (!recipe || recipe.portions <= 0) { warnings.add(`Quantités indisponibles pour la recette ${line.recipeId}.`); continue; }
      const ratio = line.portions / recipe.portions;
      const selected = selectedParts.get(lineId);
      const allocationsComplete = recipe.ingredients.every(
        (ingredient) =>
          Math.abs(
            (recipe.preparations ?? []).reduce(
              (sum, p) =>
                sum + (p.ingredientShares?.[ingredient.ingredientId] ?? 0),
              0,
            ) - 100,
          ) < 0.001,
      );
      if (selected && !allocationsComplete)
        warnings.add(
          "Les quantités sont celles de la recette entière. La répartition entre ses préparations reste à vérifier.",
        );
      for (const ingredient of recipe.ingredients) {
        const key = `${ingredient.ingredientId}:${ingredient.unit}`;
        const known = ingredientById.get(ingredient.ingredientId);
        if (!known) warnings.add(`Ingrédient introuvable : ${ingredient.ingredientId}.`);
        const share =
          selected && allocationsComplete
            ? (recipe.preparations ?? [])
                .filter((p) => selected.has(p.preparationId))
                .reduce(
                  (sum, p) =>
                    sum + (p.ingredientShares?.[ingredient.ingredientId] ?? 0),
                  0,
                ) / 100
            : 1;
        if (share === 0) continue;
        const qty = ingredient.qty * ratio * share;
        const purchaseQty = qty * (1 + (ingredient.lossPct ?? 0) / 100);
        const current = quantities.get(key);
        if (current) { current.qty += qty; current.purchaseQty += purchaseQty; }
        else quantities.set(key, { ingredientId: ingredient.ingredientId, name: known?.name ?? ingredient.ingredientId, unit: ingredient.unit, qty, purchaseQty });
      }
    }
  }
  work.sort((a, b) => a.date.localeCompare(b.date) || Number(b.cookingFirst) - Number(a.cookingFirst) || a.label.localeCompare(b.label, "fr"));
  return {
    from, to, work,
    ingredients: [...quantities.values()].map((item) => ({ ...item, qty: round2(item.qty), purchaseQty: round2(item.purchaseQty) })).sort((a, b) => a.name.localeCompare(b.name, "fr")),
    warnings: [...warnings],
    note: "qty = recette, purchaseQty = avec pertes, dans l'unité indiquée. L'ordre cuisson d'abord est une suggestion. Durées, matériel, dépendances et conservation restent à vérifier. Aucun stock réel n'est déduit.",
  };
}
