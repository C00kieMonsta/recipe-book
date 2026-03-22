import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, X, CheckCircle } from "lucide-react";
import type { Recipe, Ingredient } from "@packages/types";
import { api } from "@/lib/api";
import { calcIngredientLineCost, fmt } from "@/lib/recipe-helpers";

export default function RecipeCook() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.recipes.get(id), api.ingredients.list()])
      .then(([r, i]) => { setRecipe(r); setIngredients(i); })
      .finally(() => setLoading(false));
  }, [id]);

  const totalSteps = recipe ? recipe.techniques.length + 1 : 0;

  const goNext = useCallback(() => setStep((s) => Math.min(s + 1, totalSteps - 1)), [totalSteps]);
  const goPrev = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      if (e.key === "Escape") navigate(`/recipes/${id}`);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, navigate, id]);

  if (loading || !recipe) return <div className="fixed inset-0 bg-background flex items-center justify-center text-2xl font-serif text-muted-foreground">Chargement…</div>;

  const isIngredients = step === 0;
  const techniqueIndex = step - 1;
  const isLast = step === totalSteps - 1;

  return (
    <div className="fixed inset-0 bg-background flex flex-col select-none">
      <header className="flex items-center justify-between px-6 py-4 border-b bg-card/80 backdrop-blur-sm">
        <button onClick={() => navigate(`/recipes/${id}`)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" /> Quitter
        </button>
        <div className="text-center">
          <h1 className="font-serif text-xl font-bold">{recipe.name}</h1>
          <p className="text-xs text-muted-foreground">{recipe.type} · {recipe.portions} portions</p>
        </div>
        <div className="text-sm text-muted-foreground font-mono">
          {step + 1} / {totalSteps}
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {isIngredients ? (
          <div className="max-w-2xl mx-auto px-6 py-8">
            <h2 className="font-serif text-3xl font-bold mb-6 text-center">Ingrédients</h2>
            <div className="space-y-3">
              {recipe.ingredients.map((ri, i) => {
                const ing = ingredients.find((ig) => ig.ingredientId === ri.ingredientId);
                return (
                  <div key={i} className="flex items-center justify-between px-5 py-4 bg-card border rounded-xl text-lg">
                    <span className="font-semibold">{ing?.name || "—"}</span>
                    <span className="font-mono text-primary font-bold">{ri.qty} {ri.unit}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col items-center justify-center min-h-[calc(100vh-160px)]">
            <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mb-6">
              {techniqueIndex + 1}
            </div>
            <p className="text-2xl md:text-3xl text-center leading-relaxed font-serif">
              {recipe.techniques[techniqueIndex]}
            </p>
            {isLast && (
              <div className="mt-10 flex flex-col items-center text-green-600">
                <CheckCircle className="h-12 w-12 mb-2" />
                <span className="text-lg font-serif font-bold">Terminé !</span>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between px-6 py-4 border-t bg-card/80 backdrop-blur-sm">
        <button onClick={goPrev} disabled={step === 0} className="flex items-center gap-2 px-6 py-3 rounded-xl text-lg font-medium border disabled:opacity-20 hover:bg-muted transition-colors">
          <ChevronLeft className="h-6 w-6" /> Précédent
        </button>

        <div className="flex gap-1.5">
          {Array.from({ length: totalSteps }, (_, i) => (
            <button key={i} onClick={() => setStep(i)} className={`w-3 h-3 rounded-full transition-colors ${i === step ? "bg-primary scale-125" : i < step ? "bg-primary/40" : "bg-muted-foreground/20"}`} />
          ))}
        </div>

        {isLast ? (
          <button onClick={() => navigate(`/recipes/${id}`)} className="flex items-center gap-2 px-6 py-3 rounded-xl text-lg font-medium bg-primary text-primary-foreground shadow-sm hover:opacity-90 transition-opacity">
            Terminer <X className="h-5 w-5" />
          </button>
        ) : (
          <button onClick={goNext} className="flex items-center gap-2 px-6 py-3 rounded-xl text-lg font-medium bg-primary text-primary-foreground shadow-sm hover:opacity-90 transition-opacity">
            Suivant <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </footer>
    </div>
  );
}
