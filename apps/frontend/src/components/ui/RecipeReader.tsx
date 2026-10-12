import type { ReactNode } from "react";
import type { Recipe, Ingredient } from "@packages/types";
import { calcIngredientLineCost, calcRecipeCost, fmtQty, scaleQtyNumber, scaleStepText } from "@packages/types";
import { fmt } from "@/lib/recipe-helpers";
import Stepper from "./Stepper";
import SectionToggle from "./SectionToggle";
import Checkbox from "./Checkbox";

export interface RecipeReaderProps {
  recipe: Recipe;
  ingredientById: Map<string, Ingredient>;
  portions: number;
  onPortionsChange?: (portions: number) => void;
  size?: "lead" | "xl";
  showCost?: boolean;
  // Mise en place: ticked ingredient indexes and the toggle; without them the rows have no checkbox.
  ticks?: Set<number>;
  onTick?: (index: number) => void;
  // Extra sentence appended to the mise en place caption.
  tickHint?: string;
  // Scales the numbers written in the steps; off shows the base recipe text.
  scaleSteps?: boolean;
  // Shows the base value in muted text after each scaled number.
  showBase?: boolean;
  extra?: ReactNode;
  className?: string;
}

export function StepText({ step, ratio, showBase }: { step: string; ratio: number; showBase?: boolean }) {
  const { parts } = scaleStepText(step, ratio);
  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <span key={i} className="whitespace-nowrap">
            <mark className="rounded-sm bg-tag-yellow-bg px-0.5 text-inherit">{part.to}</mark>
            {showBase && <span className="text-sm text-muted-foreground"> ({part.from})</span>}
          </span>
        ),
      )}
    </>
  );
}

export default function RecipeReader({
  recipe,
  ingredientById,
  portions,
  onPortionsChange,
  size = "lead",
  showCost = false,
  ticks,
  onTick,
  tickHint,
  scaleSteps = true,
  showBase = false,
  extra,
  className = "",
}: RecipeReaderProps) {
  const ratio = portions / (recipe.portions || 1);
  const textSize = size === "xl" ? "text-lead" : "text-base";
  const totalCost = calcRecipeCost(recipe, ingredientById);
  const stepRatio = scaleSteps ? ratio : 1;

  return (
    <div className={className}>
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-h3">{onPortionsChange ? "Ingrédients" : `Ingrédients pour ${portions}`}</h2>
          {onPortionsChange && <Stepper value={portions} onChange={onPortionsChange} min={1} label="portions" />}
        </div>
        {onTick && (
          <p className="mt-1 text-sm text-muted-foreground">
            Cochez les ingrédients pendant la mise en place{ratio !== 1 ? ` · quantités pour ${portions} portions (recette de base : ${recipe.portions})` : ""}.{tickHint ? ` ${tickHint}` : ""}
          </p>
        )}
        <ul className={`mt-2 ${textSize}`}>
          {recipe.ingredients.map((ri, i) => {
            const ing = ingredientById.get(ri.ingredientId);
            const q = fmtQty(scaleQtyNumber(ri.qty, ratio), ri.unit);
            const ticked = ticks?.has(i) ?? false;
            return (
              <li key={`${ri.ingredientId}-${i}`} className={`flex min-h-8 items-center gap-2 touch:min-h-11 ${ticked ? "text-muted-foreground" : ""}`}>
                {onTick && (
                  <Checkbox
                    shape="circle"
                    checked={ticked}
                    onChange={() => onTick(i)}
                    aria-label={`${ing?.name ?? "Ingrédient"} : ${ticked ? "coché" : "à cocher"}`}
                    className="no-print -ml-1.5"
                  />
                )}
                <span className="min-w-0 flex-1">{ing?.name ?? "Ingrédient inconnu"}</span>
                <span className="shrink-0 whitespace-nowrap font-medium tabular-nums">
                  {q.value} <span className="font-normal text-muted-foreground">{q.unit}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-block">
        <h2 className="text-h3">Préparation</h2>
        {ratio !== 1 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {scaleSteps
              ? `Quantités adaptées pour ${portions} portions (recette de base : ${recipe.portions})`
              : `Quantités de la recette de base (${recipe.portions} portions)`}
          </p>
        )}
        {recipe.techniques.length === 0 ? (
          <p className="mt-3 text-base text-muted-foreground">Aucune étape.</p>
        ) : (
          <ol className={`mt-3 space-y-3 ${textSize}`}>
            {recipe.techniques.map((step, i) => (
              <li key={i} className="flex gap-3 select-text">
                <span className="w-6 shrink-0 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                <p className="min-w-0 flex-1 whitespace-pre-wrap">
                  <StepText step={step} ratio={stepRatio} showBase={showBase} />
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {extra}

      {showCost && (
        <SectionToggle title="Coût matières">
          <p className="mb-2 text-caption text-muted-foreground">Recette de base : {recipe.portions} portions</p>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Ingrédient</th>
                  <th className="text-right">Quantité</th>
                  <th className="text-right">Perte %</th>
                  <th className="text-right">Prix / unité</th>
                  <th className="text-right">Coût</th>
                </tr>
              </thead>
              <tbody>
                {recipe.ingredients.map((ri, i) => {
                  const ing = ingredientById.get(ri.ingredientId);
                  return (
                    <tr key={`${ri.ingredientId}-${i}`}>
                      <td>{ing?.name ?? "Ingrédient inconnu"}</td>
                      <td className="text-right">{ri.qty} {ri.unit}</td>
                      <td className="text-right">{ri.lossPct || 0}</td>
                      <td className="text-right">{ing ? `${fmt(ing.price)} ${ing.unit.replace("€", "").trim()}` : "-"}</td>
                      <td className="text-right">{ing ? fmt(calcIngredientLineCost(ri, ing)) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Total</td>
                  <td className="text-right">{fmt(totalCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </SectionToggle>
      )}
    </div>
  );
}
