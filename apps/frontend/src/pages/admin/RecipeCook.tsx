import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import type { Recipe, Ingredient, AppEvent } from "@packages/types";
import { fmtQty, scaleQtyNumber } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useMiseEnPlace } from "@/hooks/use-mise-en-place";
import { Button, Checkbox, IconButton, Sheet, Stepper } from "@/components/ui";
import { StepText } from "@/components/ui/RecipeReader";

const SWIPE_MIN_PX = 60;

export default function RecipeCook() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const portionsParam = searchParams.get("portions");
  const eventId = searchParams.get("event");
  const lineId = searchParams.get("line");
  const personne = searchParams.get("personne") ?? "";
  const personQuery = personne ? `?personne=${encodeURIComponent(personne)}` : "";
  const from = (location.state as { from?: string } | null)?.from;

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [event, setEvent] = useState<AppEvent | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cookPortions, setCookPortions] = useState(0);
  const [scaleSteps] = useLocalStorage<boolean>("recipe-book:scale-steps", true);
  const mep = useMiseEnPlace(lineId ?? undefined);
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
      .catch(() => { setError(true); toast({ title: "Recette introuvable", variant: "destructive" }); })
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

  const line = lineId && event ? event.recipes.find((l) => l.lineId === lineId) : undefined;
  const exitTo = from ?? (eventId && lineId
    ? `/events/${eventId}/lines/${lineId}${personQuery}`
    : event
      ? `/jour/${event.date.slice(0, 10)}${personQuery}`
      : `/recipes/${id}`);
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

  if (loading) {
    return <div className="fixed inset-0 flex items-center justify-center bg-background text-base text-muted-foreground">Chargement…</div>;
  }
  if (error || !recipe) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background p-6">
        <p className="text-base text-muted-foreground">Recette introuvable.</p>
        <Button variant="default" size="md" onClick={exit} icon={<ChevronLeft />}>Retour</Button>
      </div>
    );
  }

  const ratio = cookPortions / (recipe.portions || 1);
  const stepRatio = scaleSteps ? ratio : 1;
  const contextName = clientName || event?.contactName || event?.name || null;
  const subtitle = [`${cookPortions} portions`, contextName].filter(Boolean).join(" · ");

  const onTouchStart = (e: React.TouchEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest("textarea, input, select")) { touchStart.current = null; return; }
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
    if (window.getSelection()?.toString()) return;
    if (dx < 0) goNext(); else goPrev();
  };

  // The first tick moves a line still to do into "En cours".
  const toggleTick = (i: number) => {
    const first = mep.ticked.size === 0;
    mep.toggle(i);
    if (first && eventId && lineId && line && (line.prepStatus ?? "todo") === "todo") {
      api.events.lines.patch(eventId, lineId, { prepStatus: "doing" })
        .then((ev) => setEvent(ev))
        .catch(() => toast({ title: "Erreur lors de la mise à jour du statut", variant: "destructive" }));
    }
  };

  // "Terminer" on the last step: the line is done and the day (or the fiche) takes over.
  const finish = async () => {
    if (!eventId || !lineId || !event) { exit(); return; }
    setMarking(true);
    try {
      await api.events.lines.patch(eventId, lineId, { prepStatus: "done" });
      mep.clear();
      navigate(`/jour/${event.date.slice(0, 10)}?done=${lineId}${personne ? `&personne=${encodeURIComponent(personne)}` : ""}`);
    } catch {
      toast({ title: "Erreur lors de la mise à jour", variant: "destructive" });
      setMarking(false);
    }
  };

  const ingredientList = (
    <ul>
      {recipe.ingredients.map((ri, i) => {
        const ing = ingredientById.get(ri.ingredientId);
        const done = mep.ticked.has(i);
        const q = fmtQty(scaleQtyNumber(ri.qty, ratio), ri.unit);
        return (
          <li key={`${ri.ingredientId}-${i}`} className={`flex min-h-8 items-center gap-2 text-base touch:min-h-11 ${done ? "text-muted-foreground" : "text-foreground"}`}>
            <Checkbox shape="circle" checked={done} onChange={() => toggleTick(i)} aria-label={`${ing?.name ?? "Ingrédient"} : ${done ? "coché" : "à cocher"}`} className="-ml-1.5" />
            <span className="min-w-0 flex-1">{ing?.name ?? "Ingrédient inconnu"}</span>
            <span className="shrink-0 whitespace-nowrap font-medium tabular-nums">
              {q.value} <span className="font-normal text-muted-foreground">{q.unit}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );

  const prevStep = step > 0 ? recipe.techniques[step - 1] : null;
  const nextStep = step < totalSteps - 1 ? recipe.techniques[step + 1] : null;
  const scaledNote = ratio !== 1 && (
    <p className="mb-3 text-caption text-muted-foreground">
      {scaleSteps
        ? `Quantités adaptées pour ${cookPortions} portions (recette de base : ${recipe.portions})`
        : `Quantités de la recette de base (${recipe.portions} portions)`}
    </p>
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-background select-text">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-1 md:px-3">
        <IconButton size="md" aria-label="Fermer" onClick={exit} icon={<X />} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold leading-tight">{recipe.name}</h1>
          {(contextName || cookPortions !== recipe.portions) && (
            <p className="truncate text-sm leading-tight text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {!lineId && (
          <div className="hidden md:block">
            <Stepper value={cookPortions} onChange={setCookPortions} min={1} label="portions" />
          </div>
        )}
        {totalSteps > 0 && (
          <div className="shrink-0 pr-2 text-sm tabular-nums text-muted-foreground">
            Étape {step + 1} / {totalSteps}
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 md:grid md:grid-cols-[320px_1fr]">
        <aside className="hidden min-h-0 overflow-y-auto bg-surface px-4 py-4 md:block">
          <h2 className="text-h3">Ingrédients</h2>
          <p className="mb-2 text-sm text-muted-foreground">pour {cookPortions} portions</p>
          {ingredientList}
        </aside>

        <main
          className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-8"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {totalSteps === 0 ? (
            <div className="mx-auto max-w-doc">
              <p className="text-cook">Pas d'étapes</p>
              <p className="mt-2 text-base text-muted-foreground">Cette recette n'a pas encore d'étapes de préparation.</p>
            </div>
          ) : (
            <>
              <div className="mx-auto max-w-doc md:hidden">
                {scaledNote}
                {prevStep && (
                  <p className="mb-4 whitespace-pre-wrap text-base text-muted-foreground">
                    <span className="mr-1 tabular-nums">{step}.</span>
                    <StepText step={prevStep} ratio={stepRatio} />
                  </p>
                )}
                <p className="whitespace-pre-wrap text-cook text-foreground">
                  <span className="mr-2 tabular-nums text-muted-foreground">{step + 1}.</span>
                  <StepText step={recipe.techniques[step]} ratio={stepRatio} />
                </p>
                {nextStep && (
                  <p className="mt-4 whitespace-pre-wrap text-base text-muted-foreground">
                    <span className="mr-1 tabular-nums">{step + 2}.</span>
                    <StepText step={nextStep} ratio={stepRatio} />
                  </p>
                )}
              </div>

              <div className="mx-auto hidden max-w-doc md:block">
                {scaledNote}
                <ol className="space-y-6">
                  {recipe.techniques.map((t, i) => {
                    const current = i === step;
                    return (
                      <li key={i} id={`cook-step-${i}`}>
                        <button
                          type="button"
                          onClick={() => setStep(i)}
                          aria-current={current ? "step" : undefined}
                          className={`flex w-full gap-4 rounded text-left transition-colors ${current ? "text-cook md:text-cook-lg text-foreground" : "text-base text-muted-foreground hover:text-foreground"}`}
                        >
                          <span className={`shrink-0 tabular-nums ${current ? "text-muted-foreground" : "pt-0.5"}`}>{i + 1}.</span>
                          <span className="min-w-0 flex-1 whitespace-pre-wrap"><StepText step={t} ratio={stepRatio} /></span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </>
          )}
        </main>
      </div>

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="flex h-11 shrink-0 items-center justify-between bg-surface px-4 text-sm font-medium md:hidden"
      >
        <span className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-icon" aria-hidden="true" /> Ingrédients ({recipe.ingredients.length})</span>
        <span className="text-sm font-normal text-muted-foreground">{cookPortions} portions</span>
      </button>

      <footer className="flex shrink-0 gap-2 border-t border-border px-3 py-2 md:px-6">
        <Button variant="default" size="lg" onClick={goPrev} disabled={step === 0} className="flex-1" icon={<ChevronLeft />}>Précédent</Button>
        {isLast ? (
          <Button variant="primary" size="lg" onClick={finish} disabled={marking} className="flex-1">
            {marking ? "Enregistrement…" : "Terminer"}
          </Button>
        ) : (
          <Button variant="primary" size="lg" onClick={goNext} className="flex-1">
            Suivant <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </footer>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={`Ingrédients (${recipe.ingredients.length})`} aria-label="Ingrédients">
        {!lineId && (
          <div className="px-4 pb-2">
            <Stepper value={cookPortions} onChange={setCookPortions} min={1} label="portions" />
          </div>
        )}
        <div className="px-4 pb-4">{ingredientList}</div>
      </Sheet>
    </div>
  );
}
