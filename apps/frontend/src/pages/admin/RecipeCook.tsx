import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, X, CheckCircle, Minus, Plus } from "lucide-react";
import type { Recipe, Ingredient } from "@packages/types";
import { api } from "@/lib/api";

export default function RecipeCook() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cookPortions, setCookPortions] = useState(0);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.recipes.get(id), api.ingredients.list()])
      .then(([r, i]) => { setRecipe(r); setIngredients(i); setCookPortions(r.portions); })
      .finally(() => setLoading(false));
  }, [id]);

  const hasSteps = recipe ? recipe.techniques.length > 0 : false;
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
  const portionRatio = cookPortions / (recipe.portions || 1);

  const scaleQty = (qty: number) => {
    const scaled = qty * portionRatio;
    return scaled % 1 === 0 ? String(scaled) : scaled.toFixed(1);
  };

  return (
    <div className="fixed inset-0 bg-background flex flex-col select-none">
      <header className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b bg-card/80 backdrop-blur-sm gap-2">
        <button onClick={() => navigate(`/recipes/${id}`)} className="flex items-center gap-1 sm:gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <ArrowLeft className="h-5 w-5" /> <span className="hidden sm:inline">Quitter</span>
        </button>
        <div className="text-center min-w-0 flex-1">
          <h1 className="font-serif text-base sm:text-xl font-bold truncate">{recipe.name}</h1>
          <div className="flex items-center justify-center gap-2 sm:gap-3 mt-1">
            <span className="text-xs text-muted-foreground hidden sm:inline">{recipe.type}</span>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button onClick={() => setCookPortions((p) => Math.max(1, p - 1))} className="w-7 h-7 rounded-full border flex items-center justify-center hover:bg-muted transition-colors">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="text-sm font-bold tabular-nums min-w-[3ch] text-center">{cookPortions}</span>
              <button onClick={() => setCookPortions((p) => p + 1)} className="w-7 h-7 rounded-full border flex items-center justify-center hover:bg-muted transition-colors">
                <Plus className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs text-muted-foreground">portions</span>
            </div>
          </div>
        </div>
        <div className="text-xs sm:text-sm text-muted-foreground font-mono shrink-0">
          {step + 1}/{totalSteps}
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {isIngredients ? (
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            <h2 className="font-serif text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 text-center">Ingrédients</h2>
            {cookPortions !== recipe.portions && (
              <p className="text-center text-sm text-muted-foreground mb-4">
                Quantités adaptées pour <strong>{cookPortions}</strong> portions (recette de base : {recipe.portions})
              </p>
            )}
            <div className="space-y-3">
              {recipe.ingredients.map((ri, i) => {
                const ing = ingredients.find((ig) => ig.ingredientId === ri.ingredientId);
                return (
                  <div key={i} className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 bg-card border rounded-xl text-base sm:text-lg gap-3">
                    <span className="font-semibold min-w-0 truncate">{ing?.name || "—"}</span>
                    <span className="font-mono text-primary font-bold whitespace-nowrap shrink-0">{scaleQty(ri.qty)} {ri.unit}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : hasSteps ? (
          <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col items-center justify-center min-h-[calc(100vh-160px)]">
            <p className="text-sm text-muted-foreground mb-3 uppercase tracking-wider font-semibold">Étape {techniqueIndex + 1} sur {recipe.techniques.length}</p>
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
        ) : (
          <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col items-center justify-center min-h-[calc(100vh-160px)] text-center">
            <CheckCircle className="h-12 w-12 mb-4 text-green-600" />
            <p className="text-2xl font-serif font-bold mb-2">C'est tout !</p>
            <p className="text-muted-foreground">Cette recette n'a pas encore d'étapes de préparation.</p>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-t bg-card/80 backdrop-blur-sm">
        <button onClick={goPrev} disabled={step === 0} className="flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-2.5 sm:py-3 rounded-xl text-sm sm:text-lg font-medium border disabled:opacity-20 hover:bg-muted transition-colors">
          <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" /> <span className="hidden sm:inline">Précédent</span>
        </button>

        <div className="flex gap-1 sm:gap-1.5 flex-wrap justify-center max-w-[40%]">
          {Array.from({ length: totalSteps }, (_, i) => (
            <button key={i} onClick={() => setStep(i)} className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full transition-colors ${i === step ? "bg-primary scale-125" : i < step ? "bg-primary/40" : "bg-muted-foreground/20"}`} />
          ))}
        </div>

        {isLast ? (
          <button onClick={() => navigate(`/recipes/${id}`)} className="flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-2.5 sm:py-3 rounded-xl text-sm sm:text-lg font-medium bg-primary text-primary-foreground shadow-sm hover:opacity-90 transition-opacity">
            <span className="hidden sm:inline">Terminer</span><span className="sm:hidden">Fin</span> <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        ) : (
          <button onClick={goNext} className="flex items-center gap-1 sm:gap-2 px-3 sm:px-6 py-2.5 sm:py-3 rounded-xl text-sm sm:text-lg font-medium bg-primary text-primary-foreground shadow-sm hover:opacity-90 transition-opacity">
            <span className="hidden sm:inline">Suivant</span><span className="sm:hidden">Suite</span> <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        )}
      </footer>
    </div>
  );
}
