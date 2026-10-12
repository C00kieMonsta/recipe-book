import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CalendarDays, Check, ChefHat, ChevronDown, ChevronLeft, ChevronRight, Pencil, Scale, SlidersHorizontal, Square } from "lucide-react";
import type { PrepStatus } from "@packages/types";
import { courseBucket, courseOf, filterByPerson, isoWeekOf, parseYmd, prepLinesForDate } from "@packages/types";
import { usePlanningData } from "@/lib/use-planning-data";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useMiseEnPlace } from "@/hooks/use-mise-en-place";
import { useToast } from "@/hooks/use-toast";
import { useFullBleed, useHideChrome } from "@/components/admin/AdminLayout";
import PersonChips from "@/components/admin/PersonChips";
import PersonPicker from "@/components/admin/PersonPicker";
import { ActionMenu, RecipeReader, StatusControl } from "@/components/ui";

type ReaderSize = "lead" | "xl";

const ICON_BTN = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-foreground hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent";
const BACK_BTN = "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-border bg-muted pl-2 pr-3 text-base font-medium text-foreground hover:border-primary";
const WEEK_LINK = "inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";
const SWIPE_PX = 60;

const shortDay = new Intl.DateTimeFormat("fr-BE", { weekday: "short", day: "numeric", timeZone: "UTC" });

// "Mar 13"
function dayShortLabel(date: string): string {
  const s = shortDay.format(parseYmd(date)).replace(/\./g, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface WakeLockSentinel {
  release: () => Promise<void>;
}

type NavigatorWithWakeLock = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> } };

function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
}

export default function PrepSheet() {
  const { eventId = "", lineId = "" } = useParams<{ eventId: string; lineId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  useHideChrome(true);
  useFullBleed(true);

  const personne = searchParams.get("personne") ?? "";
  const personQuery = personne ? `?personne=${encodeURIComponent(personne)}` : "";
  const from = (location.state as { from?: string } | null)?.from;

  const { events, recipeById, clientById, ingredientById, courses, people, loading, error, patchLine } = usePlanningData();

  const event = events.find((e) => e.eventId === eventId);
  const line = event?.recipes.find((l) => l.lineId === lineId);
  const recipe = line ? recipeById.get(line.recipeId) : undefined;
  const date = event?.date.slice(0, 10) ?? "";

  const [portions, setPortions] = useState<number | null>(null);
  const [editPortions, setEditPortions] = useState(false);
  const [notes, setNotes] = useState("");
  const [size, setSize] = useLocalStorage<ReaderSize>("recipe-book:reader-size", "lead");
  const [scaleSteps, setScaleSteps] = useLocalStorage<boolean>("recipe-book:scale-steps", true);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const [ingredientsOut, setIngredientsOut] = useState(false);
  const mep = useMiseEnPlace(lineId);

  const linePortions = line?.portions;
  const lineNotes = line?.notes ?? "";
  useEffect(() => { if (linePortions !== undefined) setPortions(linePortions); }, [lineId, linePortions]);
  useEffect(() => { setNotes(lineNotes); }, [lineId, lineNotes]);
  useEffect(() => { setEditPortions(false); setPickerOpen(false); }, [lineId]);

  const dayLines = useMemo(() => {
    const all = date ? prepLinesForDate(events, recipeById, clientById, courses, date) : [];
    return personne ? filterByPerson(all, personne) : all;
  }, [events, recipeById, clientById, courses, date, personne]);
  const index = dayLines.findIndex((l) => l.lineId === lineId);
  const prev = index > 0 ? dayLines[index - 1] : undefined;
  const next = index >= 0 && index < dayLines.length - 1 ? dayLines[index + 1] : undefined;
  const lineUrl = (l: { eventId: string; lineId: string }) => `/events/${l.eventId}/lines/${l.lineId}${personQuery}`;
  const prevUrl = prev ? lineUrl(prev) : undefined;
  const nextUrl = next ? lineUrl(next) : undefined;
  const backUrl = from ?? `/jour/${date}${personQuery}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e)) return;
      if (e.key === "ArrowLeft" && prevUrl) navigate(prevUrl, { state: { from } });
      if (e.key === "ArrowRight" && nextUrl) navigate(nextUrl, { state: { from } });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, prevUrl, nextUrl, from]);

  // Keeps the screen on while the sheet is open, when the browser allows it.
  useEffect(() => {
    const nav = navigator as NavigatorWithWakeLock;
    if (!nav.wakeLock) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    nav.wakeLock.request("screen").then((s) => {
      if (cancelled) s.release().catch(() => undefined);
      else sentinel = s;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      sentinel?.release().catch(() => undefined);
    };
  }, []);

  // Shows the "Ingrédients" pill once the ingredients section has scrolled above the top of the sheet.
  useEffect(() => {
    const root = scrollRef.current;
    const section = readerRef.current?.querySelector("section");
    if (!root || !section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setIngredientsOut(!entry.isIntersecting && entry.boundingClientRect.bottom < (entry.rootBounds?.top ?? 0)),
      { root, threshold: 0 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [loading, lineId]);

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
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dy) > Math.abs(dx) / 2) return;
    if (window.getSelection()?.toString()) return;
    const target = dx < 0 ? nextUrl : prevUrl;
    if (target) navigate(target, { state: { from } });
  };

  const scrollToIngredients = () => {
    readerRef.current?.querySelector("section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const fail = (title: string) => toast({ title, variant: "destructive" });

  const setStatus = async (status: PrepStatus) => {
    if (!line) return;
    setSaving(true);
    try {
      await patchLine(eventId, lineId, { prepStatus: status });
      if (status === "done") {
        mep.clear();
        navigate(`/jour/${date}?done=${lineId}${personne ? `&personne=${encodeURIComponent(personne)}` : ""}`);
      }
    } catch {
      fail("Erreur lors de la mise à jour du statut");
    } finally {
      setSaving(false);
    }
  };

  // The first tick moves a line still to do into "En cours" without a second gesture.
  const tick = (i: number) => {
    const first = mep.ticked.size === 0 && !mep.ticked.has(i);
    mep.toggle(i);
    if (first && line && (line.prepStatus ?? "todo") === "todo") {
      patchLine(eventId, lineId, { prepStatus: "doing" }).catch(() => fail("Erreur lors de la mise à jour du statut"));
    }
  };

  const savePortions = async () => {
    if (!line || portions === null || portions === line.portions) return;
    setSaving(true);
    try {
      await patchLine(eventId, lineId, { portions });
      setEditPortions(false);
      toast({ title: `${portions} portions enregistrées` });
    } catch {
      fail("Erreur lors de l'enregistrement des portions");
    } finally {
      setSaving(false);
    }
  };

  const saveNotes = async () => {
    if (!line || notes.trim() === (line.notes ?? "").trim()) return;
    try {
      await patchLine(eventId, lineId, { notes: notes.trim() });
    } catch {
      fail("Erreur lors de l'enregistrement de la note");
    }
  };

  const assign = async (next: string[]) => {
    try {
      await patchLine(eventId, lineId, { assignedTo: next });
    } catch {
      fail("Erreur lors de l'attribution");
    }
  };

  if (loading) return <div className="p-6 text-base text-muted-foreground">Chargement…</div>;
  if (error) return <div className="p-6 text-base text-destructive">{error}</div>;
  if (!event || !line || !recipe) {
    return (
      <div className="p-6">
        <p className="text-base text-muted-foreground">Ligne introuvable.</p>
        <Link to="/" className="mt-3 inline-flex min-h-11 items-center text-base text-primary underline-offset-4 hover:underline">Retour à la semaine</Link>
      </div>
    );
  }

  const client = event.clientId ? clientById.get(event.clientId) : undefined;
  const who = client?.name ?? event.name;
  const weekUrl = `/semaine/${isoWeekOf(date)}`;
  const weekNumber = Number(isoWeekOf(date).slice(-2));
  const course = courseBucket(courseOf(line, recipe), courses);
  const photo = recipe.photos?.[0]?.url;
  const status: PrepStatus = line.prepStatus ?? "todo";
  const shown = portions ?? line.portions;
  const own = !!line.assignedTo?.length;
  const assignees = own ? line.assignedTo ?? [] : event.assignedTo ?? [];
  const activePeople = people.some((p) => p.active);
  const cookUrl = `/recipes/${recipe.recipeId}/cook?portions=${shown}&event=${eventId}&line=${lineId}${personne ? `&personne=${encodeURIComponent(personne)}` : ""}`;
  const cookState = { from: location.pathname + location.search };
  const cookBtn = "inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground hover:opacity-90";

  const menuItems = [
    { label: "Modifier les portions", icon: <SlidersHorizontal className="h-4 w-4" />, onClick: () => setEditPortions(true) },
    { label: "Tout décocher", icon: <Square className="h-4 w-4" />, onClick: () => mep.clear() },
    {
      label: "Quantités de la recette de base",
      icon: scaleSteps ? <Scale className="h-4 w-4" /> : <Check className="h-4 w-4" />,
      onClick: () => setScaleSteps((v) => !v),
    },
    { label: "Modifier la recette", icon: <Pencil className="h-4 w-4" />, onClick: () => navigate(`/recipes/${recipe.recipeId}?mode=edit`) },
    { label: "Voir l'événement", icon: <CalendarDays className="h-4 w-4" />, onClick: () => navigate(`/events/${eventId}`, { state: cookState }) },
  ];

  return (
    <div className="flex h-dvh flex-col overflow-hidden print:h-auto print:overflow-visible" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {ingredientsOut && (
        <button
          type="button"
          onClick={scrollToIngredients}
          className="no-print fixed left-1/2 top-2 z-20 inline-flex min-h-11 -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-card px-4 text-base font-medium shadow-lg md:hidden"
        >
          Ingrédients <ChevronDown className="h-4 w-4" />
        </button>
      )}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
        <div className="mx-auto max-w-doc px-4 pb-8 pt-2 md:px-6 xl:grid xl:max-w-wide xl:grid-cols-[minmax(0,44rem)_280px] xl:justify-center xl:gap-10">
        <div className="min-w-0">
          <div className="no-print flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link to={backUrl} className={BACK_BTN}><ChevronLeft className="h-5 w-5" /> {dayShortLabel(date)}</Link>
            <Link to={weekUrl} className={`${WEEK_LINK} order-last basis-full md:order-none md:basis-auto`}>Semaine {weekNumber}</Link>
            <div className="ml-auto flex shrink-0 items-center">
              {prevUrl ? (
                <Link to={prevUrl} state={{ from }} aria-label="Ligne précédente" className={ICON_BTN}><ChevronLeft className="h-5 w-5" /></Link>
              ) : (
                <span className={ICON_BTN} aria-hidden="true"><ChevronLeft className="h-5 w-5 opacity-30" /></span>
              )}
              <span className="px-1 text-sm tabular-nums text-muted-foreground">{index + 1}/{dayLines.length}</span>
              {nextUrl ? (
                <Link to={nextUrl} state={{ from }} aria-label="Ligne suivante" className={ICON_BTN}><ChevronRight className="h-5 w-5" /></Link>
              ) : (
                <span className={ICON_BTN} aria-hidden="true"><ChevronRight className="h-5 w-5 opacity-30" /></span>
              )}
              <button
                type="button"
                aria-pressed={size === "xl"}
                aria-label="Taille du texte"
                title={size === "xl" ? "Texte normal" : "Texte plus grand"}
                onClick={() => setSize(size === "xl" ? "lead" : "xl")}
                className={`${ICON_BTN} ${size === "xl" ? "bg-muted" : ""}`}
              >
                <span className="text-lead font-semibold">Aa</span>
              </button>
              <ActionMenu items={menuItems} />
            </div>
          </div>

          <div className="mt-2 flex items-center gap-3">
            {photo && <img src={photo} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
            <h1 className="min-w-0 text-h1">{recipe.name}</h1>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-lead">
            <span><b>{line.portions} portions</b> · {course} · {who}</span>
            {activePeople && (
              <span className="relative inline-flex">
                <PersonChips personIds={assignees} people={people} size="md" inherited={!own} onClick={() => setPickerOpen((o) => !o)} label={assignees.length ? undefined : "Attribuer"} />
                {pickerOpen && (
                  <PersonPicker
                    value={own ? line.assignedTo ?? [] : []}
                    options={people}
                    onChange={assign}
                    allowInherit
                    onClose={() => setPickerOpen(false)}
                    title="Attribuer la ligne"
                  />
                )}
              </span>
            )}
          </div>

          {editPortions && (
            <div className="no-print mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={savePortions}
                disabled={saving || portions === null || portions === line.portions}
                className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Enregistrer {shown} portions
              </button>
              <button type="button" onClick={() => { setPortions(line.portions); setEditPortions(false); }} className="inline-flex min-h-11 items-center rounded-lg px-3 text-base text-muted-foreground hover:bg-hover">
                Revenir à {line.portions}
              </button>
            </div>
          )}

          <div ref={readerRef}>
          <RecipeReader
            className="mt-6"
            recipe={recipe}
            ingredientById={ingredientById}
            portions={shown}
            onPortionsChange={editPortions ? setPortions : undefined}
            size={size}
            ticks={mep.ticked}
            onTick={tick}
            scaleSteps={scaleSteps}
            showBase
            extra={
              <section className="mt-block">
                <h2 className="text-h3">Note pour cette fois</h2>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={saveNotes}
                  rows={3}
                  maxLength={500}
                  placeholder="Ce qui change pour cet événement"
                  className="input-field mt-3 resize-y text-base"
                />
              </section>
            }
          />
          </div>
        </div>

        <aside className="no-print hidden xl:block xl:sticky xl:top-4 xl:self-start">
          <div className="card-elevated flex flex-col gap-3 p-4">
            <StatusControl size="lg" value={status} onChange={setStatus} />
            <Link to={cookUrl} state={cookState} className={cookBtn}>
              <ChefHat className="h-5 w-5" /> Cuisiner
            </Link>
          </div>
        </aside>
        </div>
      </div>

      <div className="no-print shrink-0 border-t border-border bg-background xl:hidden">
        <div className="mx-auto flex min-h-16 max-w-doc items-center gap-3 px-4 py-2 md:px-6">
          <StatusControl size="lg" value={status} onChange={setStatus} className="min-w-0 flex-1" />
          <Link to={cookUrl} state={cookState} className={cookBtn}>
            <ChefHat className="h-5 w-5" /> Cuisiner
          </Link>
        </div>
      </div>
    </div>
  );
}
