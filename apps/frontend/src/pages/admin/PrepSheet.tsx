import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChefHat, ChevronLeft, ChevronRight, Pencil, CalendarDays } from "lucide-react";
import type { PrepStatus } from "@packages/types";
import { courseBucket, courseOf, dayLabel, prepLinesForDate } from "@packages/types";
import { usePlanningData } from "@/lib/use-planning-data";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useToast } from "@/hooks/use-toast";
import { useFullBleed, useHideChrome } from "@/components/admin/AdminLayout";
import { ActionMenu, RecipeReader, StatusControl } from "@/components/ui";

type ReaderSize = "lead" | "xl";

const ICON_BTN = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-foreground hover:bg-hover disabled:opacity-30 disabled:hover:bg-transparent";
const SWIPE_PX = 60;

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
  const { toast } = useToast();
  useHideChrome(true);
  useFullBleed(true);

  const { events, recipeById, clientById, ingredientById, courses, loading, error, patchLine } = usePlanningData();

  const event = events.find((e) => e.eventId === eventId);
  const line = event?.recipes.find((l) => l.lineId === lineId);
  const recipe = line ? recipeById.get(line.recipeId) : undefined;
  const date = event?.date.slice(0, 10) ?? "";

  const [portions, setPortions] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [size, setSize] = useLocalStorage<ReaderSize>("recipe-book:reader-size", "lead");
  const [saving, setSaving] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const linePortions = line?.portions;
  const lineNotes = line?.notes ?? "";
  useEffect(() => { if (linePortions !== undefined) setPortions(linePortions); }, [lineId, linePortions]);
  useEffect(() => { setNotes(lineNotes); }, [lineId, lineNotes]);

  const dayLines = useMemo(
    () => (date ? prepLinesForDate(events, recipeById, clientById, courses, date) : []),
    [events, recipeById, clientById, courses, date],
  );
  const index = dayLines.findIndex((l) => l.lineId === lineId);
  const prev = index > 0 ? dayLines[index - 1] : undefined;
  const next = index >= 0 && index < dayLines.length - 1 ? dayLines[index + 1] : undefined;
  const lineUrl = (l: { eventId: string; lineId: string }) => `/events/${l.eventId}/lines/${l.lineId}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e)) return;
      if (e.key === "ArrowLeft" && prev) navigate(lineUrl(prev));
      if (e.key === "ArrowRight" && next) navigate(lineUrl(next));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, prev, next]);

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
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dy) > Math.abs(dx) / 2) return;
    const target = dx < 0 ? next : prev;
    if (target) navigate(lineUrl(target));
  };

  const fail = (title: string) => toast({ title, variant: "destructive" });

  const setStatus = async (status: PrepStatus) => {
    if (!line) return;
    setSaving(true);
    try {
      await patchLine(eventId, lineId, { prepStatus: status });
      if (status === "done") navigate(`/jour/${date}?done=${lineId}`);
    } catch {
      fail("Erreur lors de la mise à jour du statut");
    } finally {
      setSaving(false);
    }
  };

  const savePortions = async () => {
    if (!line || portions === null || portions === line.portions) return;
    setSaving(true);
    try {
      await patchLine(eventId, lineId, { portions });
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
  const course = courseBucket(courseOf(line, recipe), courses);
  const photo = recipe.photos?.[0]?.url;
  const status: PrepStatus = line.prepStatus ?? "todo";
  const shown = portions ?? line.portions;
  const cookUrl = `/recipes/${recipe.recipeId}/cook?portions=${shown}&event=${eventId}&line=${lineId}`;

  return (
    <div className="flex h-dvh flex-col overflow-hidden print:h-auto print:overflow-visible" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
        <div className="mx-auto max-w-doc px-4 pb-8 pt-2 md:px-6">
          <div className="no-print flex items-center gap-1">
            <Link to={`/jour/${date}`} aria-label="Retour au jour" className={`${ICON_BTN} -ml-3`}><ChevronLeft className="h-6 w-6" /></Link>
            <Link to={`/jour/${date}`} className="inline-flex min-h-11 min-w-0 items-center text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4">
              <span className="truncate">{dayLabel(date)} / {who}</span>
            </Link>
            <div className="ml-auto flex items-center gap-1">
              {prev ? (
                <Link to={lineUrl(prev)} aria-label="Ligne précédente" className={ICON_BTN}><ChevronLeft className="h-5 w-5" /></Link>
              ) : (
                <span className={ICON_BTN} aria-hidden="true"><ChevronLeft className="h-5 w-5 opacity-30" /></span>
              )}
              <span className="text-sm tabular-nums text-muted-foreground">{index + 1}/{dayLines.length}</span>
              {next ? (
                <Link to={lineUrl(next)} aria-label="Ligne suivante" className={ICON_BTN}><ChevronRight className="h-5 w-5" /></Link>
              ) : (
                <span className={ICON_BTN} aria-hidden="true"><ChevronRight className="h-5 w-5 opacity-30" /></span>
              )}
              <button
                type="button"
                aria-pressed={size === "xl"}
                aria-label="Taille du texte"
                title={size === "xl" ? "Texte normal" : "Texte plus grand"}
                onClick={() => setSize(size === "xl" ? "lead" : "xl")}
                className={`${ICON_BTN} font-serif ${size === "xl" ? "bg-muted" : ""}`}
              >
                <span className="text-lead font-semibold">Aa</span>
              </button>
              <ActionMenu
                items={[
                  { label: "Modifier la recette", icon: <Pencil className="h-4 w-4" />, onClick: () => navigate(`/recipes/${recipe.recipeId}?mode=edit`) },
                  { label: "Voir l'événement", icon: <CalendarDays className="h-4 w-4" />, onClick: () => navigate(`/events/${eventId}`) },
                ]}
              />
            </div>
          </div>

          <div className="mt-2 flex items-center gap-3">
            {photo ? (
              <img src={photo} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="h-16 w-16 shrink-0 rounded-lg bg-muted" aria-hidden="true" />
            )}
            <h1 className="min-w-0 font-serif text-h1">{recipe.name}</h1>
          </div>

          <p className="mt-2 text-lead">
            <b>{line.portions} portions</b> pour {who} · {course}{" "}
            <span className="whitespace-nowrap text-sm text-muted-foreground">(recette de base : {recipe.portions})</span>
          </p>

          {portions !== null && portions !== line.portions && (
            <div className="no-print mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={savePortions}
                disabled={saving}
                className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Enregistrer {portions} portions
              </button>
              <button type="button" onClick={() => setPortions(line.portions)} className="inline-flex min-h-11 items-center rounded-lg px-3 text-base text-muted-foreground hover:bg-hover">
                Revenir à {line.portions}
              </button>
            </div>
          )}

          <RecipeReader
            className="mt-6"
            recipe={recipe}
            ingredientById={ingredientById}
            portions={shown}
            onPortionsChange={setPortions}
            size={size}
            showCost
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

      <div className="no-print shrink-0 border-t border-border bg-background">
        <div className="mx-auto flex min-h-16 max-w-doc items-center gap-3 px-4 py-2 md:px-6">
          <StatusControl size="lg" value={status} onChange={setStatus} className="flex-1" />
          <Link to={cookUrl} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground hover:opacity-90">
            <ChefHat className="h-5 w-5" /> Cuisiner
          </Link>
        </div>
      </div>
    </div>
  );
}
