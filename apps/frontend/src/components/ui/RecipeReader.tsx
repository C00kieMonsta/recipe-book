import type { ReactNode } from "react";
import type { Recipe, Ingredient } from "@packages/types";
import { scaleQty, calcIngredientLineCost, calcRecipeCost } from "@packages/types";
import { fmt } from "@/lib/recipe-helpers";
import Stepper from "./Stepper";
import SectionToggle from "./SectionToggle";

export interface RecipeReaderProps {
  recipe: Recipe;
  ingredientById: Map<string, Ingredient>;
  portions: number;
  onPortionsChange?: (portions: number) => void;
  size?: "lead" | "xl";
  showCost?: boolean;
  extra?: ReactNode;
  className?: string;
}

export default function RecipeReader({
  recipe,
  ingredientById,
  portions,
  onPortionsChange,
  size = "lead",
  showCost = false,
  extra,
  className = "",
}: RecipeReaderProps) {
  const ratio = portions / (recipe.portions || 1);
  const textSize = size === "xl" ? "text-xl" : "text-lead";
  const totalCost = calcRecipeCost(recipe, ingredientById);

  return (
    <div className={className}>
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-h3">Ingrédients</h2>
          {onPortionsChange ? (
            <Stepper value={portions} onChange={onPortionsChange} min={1} label="portions" />
          ) : (
            <span className="text-base text-muted-foreground">pour {portions} portions</span>
          )}
        </div>
        <ul className={`mt-3 divide-y divide-border ${textSize}`}>
          {recipe.ingredients.map((ri, i) => {
            const ing = ingredientById.get(ri.ingredientId);
            return (
              <li key={`${ri.ingredientId}-${i}`} className="flex min-h-12 items-baseline justify-between gap-4 py-2">
                <span className="min-w-0 flex-1">{ing?.name ?? "Ingrédient inconnu"}</span>
                <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums">
                  {scaleQty(ri.qty, ratio)} <span className="font-normal text-muted-foreground">{ri.unit}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-block">
        <h2 className="text-h3">Préparation</h2>
        {recipe.techniques.length === 0 ? (
          <p className="mt-3 text-base text-muted-foreground">Aucune étape.</p>
        ) : (
          <ol className={`mt-3 space-y-5 ${textSize} leading-relaxed`}>
            {recipe.techniques.map((step, i) => (
              <li key={i} className="flex gap-4 select-text">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-foreground">
                  {i + 1}
                </span>
                <p className="min-w-0 flex-1 whitespace-pre-wrap pt-0.5">{step}</p>
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
                <tr className="text-muted-foreground">
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
                    <tr key={`${ri.ingredientId}-${i}`} className="border-t border-border/60">
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
