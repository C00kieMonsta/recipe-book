import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, Check, Circle, CheckCircle2, ListChecks } from "lucide-react";
import type { Recipe, Ingredient, AppEvent } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { scaleQty } from "@/lib/recipe-helpers";
import Stepper from "@/components/ui/Stepper";

const SWIPE_MIN_PX = 60;

const FOOTER_BTN = "flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl text-lead font-medium transition-colors";

export default function RecipeCook() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const portionsParam = searchParams.get("portions");
  const eventId = searchParams.get("event");
  const lineId = searchParams.get("line");

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [event, setEvent] = useState<AppEvent | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cookPortions, setCookPortions] = useState(0);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.recipes.get(id), api.ingredients.list()])
      .then(([r, i]) => {
        setRecipe(r);
        setIngredients(i);
        setCookPortions(Number(portionsParam) || r.portions);
      })
      .catch(() => toast({ title: "Recette introuvable", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!eventId) return;
    api.events.get(eventId)
      .then(async (ev) => {
        setEvent(ev);
        if (ev.clientId) {
          try {
            const client = await api.clients.get(ev.clientId);
            setClientName(client.name);
          } catch { /* fall back to the event name */ }
        }
      })
      .catch(() => { /* cook mode still works without the event */ });
  }, [eventId]);

  // Keep the screen on while cooking; the lock drops when the tab is hidden, so re-request on return.
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let active = true;
    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (!active) await sentinel.release();
      } catch { /* wake lock refused, nothing to do */ }
    };
    const onVisibility = () => { if (document.visibilityState === "visible") acquire(); };
    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinel?.release().catch(() => undefined);
    };
  }, []);

  const totalSteps = recipe ? recipe.techniques.length : 0;
  const isLast = totalSteps === 0 || step === totalSteps - 1;

  const goNext = useCallback(() => setStep((s) => Math.min(s + 1, Math.max(0, totalSteps - 1))), [totalSteps]);
  const goPrev = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  const exitTo = event ? `/jour/${event.date}` : `/recipes/${id}`;
  const exit = useCallback(() => navigate(exitTo), [navigate, exitTo]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
      if (e.key === "Escape") { if (sheetOpen) setSheetOpen(false); else exit(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goNext, goPrev, exit, sheetOpen]);

  useEffect(() => {
    document.getElementById(`cook-step-${step}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [step]);

  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.ingredientId, i])), [ingredients]);

  if (loading || !recipe) {
    return <div className="fixed inset-0 bg-background flex items-center justify-center text-h2 font-serif text-muted-foreground">Chargement…</div>;
  }

  const ratio = cookPortions / (recipe.portions || 1);
  const contextName = clientName || event?.contactName || event?.name || null;

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) goNext(); else goPrev();
  };

  const toggleTick = (i: number) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const markDone = async () => {
    if (!eventId || !lineId || !event) return;
    setMarking(true);
    try {
      await api.events.lines.patch(eventId, lineId, { prepStatus: "done" });
      toast({ title: "Préparation marquée faite" });
      navigate(`/jour/${event.date}`);
    } catch {
      toast({ title: "Erreur lors de la mise à jour", variant: "destructive" });
      setMarking(false);
    }
  };

  const ingredientList = (
    <ul className="divide-y divide-border">
      {recipe.ingredients.map((ri, i) => {
        const ing = ingredientById.get(ri.ingredientId);
        const done = ticked.has(i);
        return (
          <li key={`${ri.ingredientId}-${i}`}>
            <button
              type="button"
              onClick={() => toggleTick(i)}
              aria-pressed={done}
              className={`flex w-full min-h-12 items-center gap-3 py-2 text-left text-lead transition-colors ${done ? "text-muted-foreground line-through" : "text-foreground"}`}
            >
              {done ? <CheckCircle2 className="h-6 w-6 shrink-0 text-success" /> : <Circle className="h-6 w-6 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1">{ing?.name ?? "Ingrédient inconnu"}</span>
              <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums">
                {scaleQty(ri.qty, ratio)} <span className="font-normal text-muted-foreground">{ri.unit}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const prevStep = step > 0 ? recipe.techniques[step - 1] : null;

  return (
    <div className="fixed inset-0 flex flex-col bg-background select-text">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card px-3 md:px-6">
        <button
          type="button"
          onClick={exit}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2 text-base font-medium hover:bg-hover"
        >
          <X className="h-5 w-5" /> <span className="hidden sm:inline">Quitter</span>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-h2 leading-tight">{recipe.name}</h1>
          {(contextName || cookPortions !== recipe.portions) && (
            <p className="truncate text-sm text-muted-foreground">
              {contextName ? `pour ${contextName} · ` : ""}{cookPortions} portions
            </p>
          )}
        </div>
        <div className="hidden md:block">
          <Stepper value={cookPortions} onChange={setCookPortions} min={1} label="portions" />
        </div>
        {totalSteps > 0 && (
          <div className="shrink-0 text-base tabular-nums text-muted-foreground">
            Étape {step + 1} / {totalSteps}
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 md:grid md:grid-cols-[320px_1fr]">
        <aside className="hidden min-h-0 overflow-y-auto border-r bg-surface px-4 py-4 md:block">
          <h2 className="text-h3">Ingrédients</h2>
          <p className="mb-2 text-sm text-muted-foreground">pour {cookPortions} portions</p>
          {ingredientList}
        </aside>

        <main
          className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {totalSteps === 0 ? (
            <div className="mx-auto max-w-doc">
              <p className="font-serif text-cook">Pas d'étapes</p>
              <p className="mt-2 text-lead text-muted-foreground">Cette recette n'a pas encore d'étapes de préparation.</p>
            </div>
          ) : (
            <>
              <div className="mx-auto max-w-doc md:hidden">
                {prevStep && (
                  <p className="mb-4 whitespace-pre-wrap text-base text-muted-foreground">
                    <span className="font-semibold">{step}.</span> {prevStep}
                  </p>
                )}
                <p className="whitespace-pre-wrap font-serif text-cook text-foreground">
                  <span className="mr-2 text-muted-foreground">{step + 1}.</span>
                  {recipe.techniques[step]}
                </p>
              </div>

              <ol className="mx-auto hidden max-w-doc space-y-6 md:block">
                {recipe.techniques.map((t, i) => {
                  const current = i === step;
                  return (
                    <li key={i} id={`cook-step-${i}`}>
                      <button
                        type="button"
                        onClick={() => setStep(i)}
                        aria-current={current ? "step" : undefined}
                        className={`flex w-full gap-4 rounded-lg text-left transition-colors ${current ? "font-serif text-cook md:text-cook-lg text-foreground" : "text-lead text-muted-foreground hover:text-foreground"}`}
                      >
                        <span className={`shrink-0 tabular-nums ${current ? "" : "pt-0.5"}`}>{i + 1}.</span>
                        <span className="min-w-0 flex-1 whitespace-pre-wrap">{t}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </main>
      </div>

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="flex min-h-14 shrink-0 items-center justify-between border-t bg-surface px-4 text-lead font-medium md:hidden"
      >
        <span className="flex items-center gap-2"><ListChecks className="h-5 w-5" /> Ingrédients ({recipe.ingredients.length})</span>
        <span className="text-base text-muted-foreground">{cookPortions} portions</span>
      </button>

      <footer className="flex shrink-0 gap-3 border-t bg-card px-3 py-3 md:px-6">
        <button type="button" onClick={goPrev} disabled={step === 0} className={`${FOOTER_BTN} border hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent`}>
          <ChevronLeft className="h-6 w-6" /> Précédent
        </button>
        {isLast ? (
          lineId && event ? (
            <button type="button" onClick={markDone} disabled={marking} className={`${FOOTER_BTN} bg-success text-primary-foreground hover:opacity-90 disabled:opacity-50`}>
              <Check className="h-6 w-6" /> {marking ? "Enregistrement…" : "Marquer fait"}
            </button>
          ) : (
            <button type="button" onClick={() => navigate(`/recipes/${id}`)} className={`${FOOTER_BTN} bg-primary text-primary-foreground hover:opacity-90`}>
              <Check className="h-6 w-6" /> Terminer
            </button>
          )
        ) : (
          <button type="button" onClick={goNext} className={`${FOOTER_BTN} bg-primary text-primary-foreground hover:opacity-90`}>
            Suivant <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </footer>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-foreground/30 md:hidden" onClick={() => setSheetOpen(false)}>
          <div
            role="dialog"
            aria-label="Ingrédients"
            className="flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-2">
              <h2 className="text-h3">Ingrédients ({recipe.ingredients.length})</h2>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Fermer" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-hover">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-b px-4 py-3">
              <Stepper value={cookPortions} onChange={setCookPortions} min={1} label="portions" />
            </div>
            <div className="overflow-y-auto px-4 pb-6">{ingredientList}</div>
          </div>
        </div>
      )}
    </div>
  );
}
