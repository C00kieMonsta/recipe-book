import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Calendar, ChefHat, ChevronDown, ChevronLeft, ChevronRight, Circle, Hash, Pencil, Printer, Scale, SlidersHorizontal, Square, Tag as TagIcon, Type, User } from "lucide-react";
import type { PrepStatus } from "@packages/types";
import { addDays, courseBucket, courseOf, dayLabel, filterByPerson, isoWeekOf, prepDateOf, prepLinesForDate, shortDayLabel } from "@packages/types";
import { api, ApiError } from "@/lib/api";
import { usePlanningData } from "@/lib/use-planning-data";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useMiseEnPlace } from "@/hooks/use-mise-en-place";
import { useToast } from "@/hooks/use-toast";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { useFullBleed, useHideChrome } from "@/components/admin/AdminLayout";
import MoveToDayMenu, { moveDayOptions, OTHER_DATE } from "@/components/admin/MoveToDayMenu";
import PersonChips from "@/components/admin/PersonChips";
import PersonPicker from "@/components/admin/PersonPicker";
import { cn } from "@/lib/utils";
import {
  ActionMenu, Button, BUTTON_BASE, BUTTON_SIZE, BUTTON_VARIANT, EditableText, ICON_BUTTON_SIZE, IconButton, PageHeader, Property, PropertyList,
  RecipeReader, SectionToggle, SelectPill, StatusControl, Tag,
} from "@/components/ui";
import type { ActionMenuItem } from "@/components/ui";

type ReaderSize = "lead" | "xl";

const SWIPE_PX = 60;
const CRUMB = "inline-flex h-6 items-center rounded px-1 hover:bg-hover hover:text-foreground";

function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
}

// The move list of the fiche: the six days before the event day, then the event day.
function sevenDaysEndingOn(date: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(date, i - 6));
}

export default function PrepSheet() {
  const { eventId = "", lineId = "" } = useParams<{ eventId: string; lineId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  useHideChrome(true);
  useFullBleed(true);
  const touch = useTouchScreen();

  const personne = searchParams.get("personne") ?? "";
  const personQuery = personne ? `?personne=${encodeURIComponent(personne)}` : "";
  const from = (location.state as { from?: string } | null)?.from;

  const { events, recipeById, clientById, ingredientById, courses, people, loading, error, patchLine, replaceEvent } = usePlanningData();

  const event = events.find((e) => e.eventId === eventId);
  const line = event?.recipes.find((l) => l.lineId === lineId);
  const recipe = line ? recipeById.get(line.recipeId) : undefined;
  const eventDate = event?.date.slice(0, 10) ?? "";
  // The prep day: the pager, the back link and the crumb follow it.
  const date = event && line ? prepDateOf(line, event) : eventDate;

  const [portions, setPortions] = useState<number | null>(null);
  const [editPortions, setEditPortions] = useState(false);
  const [size, setSize] = useLocalStorage<ReaderSize>("recipe-book:reader-size", "lead");
  const [scaleSteps, setScaleSteps] = useLocalStorage<boolean>("recipe-book:scale-steps", true);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const moveRef = useRef<HTMLSpanElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const [ingredientsOut, setIngredientsOut] = useState(false);
  const mep = useMiseEnPlace(lineId);

  const linePortions = line?.portions;
  useEffect(() => { if (linePortions !== undefined) setPortions(linePortions); }, [lineId, linePortions]);
  useEffect(() => { setEditPortions(false); setPickerOpen(false); setMoveOpen(false); }, [lineId]);

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
    if (!("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    navigator.wakeLock.request("screen").then((s) => {
      if (cancelled) s.release().catch(() => undefined);
      else sentinel = s;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      sentinel?.release().catch(() => undefined);
    };
  }, []);

  // Shows the "Ingrédients" pill once the ingredients section has scrolled above the viewport.
  useEffect(() => {
    const section = readerRef.current?.querySelector("section");
    if (!section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setIngredientsOut(!entry.isIntersecting && entry.boundingClientRect.bottom < 0),
      { threshold: 0 },
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

  const savePortions = async (value?: number) => {
    const target = value ?? portions;
    if (!line || target === null || target === line.portions) return;
    setSaving(true);
    try {
      await patchLine(eventId, lineId, { portions: target });
      setPortions(target);
      setEditPortions(false);
      toast({ title: `${target} portions enregistrées` });
    } catch {
      fail("Erreur lors de l'enregistrement des portions");
    } finally {
      setSaving(false);
    }
  };

  const saveNotes = async (value: string) => {
    if (!line || value.trim() === (line.notes ?? "").trim()) return;
    try {
      await patchLine(eventId, lineId, { notes: value.trim() });
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

  // Moves the line to another prep day, then reopens the fiche so the pager rebuilds on that day.
  const moveTo = async (d: string) => {
    if (!line || !d || d === date) return;
    setSaving(true);
    try {
      await patchLine(eventId, lineId, { prepDate: d === eventDate ? null : d });
      toast({ title: `Déplacée au ${shortDayLabel(d)}` });
      navigate(`/events/${eventId}/lines/${lineId}${personQuery}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        api.events.get(eventId).then(replaceEvent).catch(() => undefined);
        fail("Le menu a changé ailleurs, il a été rechargé");
      } else {
        fail("Erreur lors du déplacement");
      }
    } finally {
      setSaving(false);
    }
  };

  const openDatePicker = () => {
    const el = dateInput.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") el.showPicker();
      else el.focus();
    } catch {
      el.focus();
    }
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  if (error) return <div className="p-6 text-sm text-danger">{error}</div>;
  if (!event || !line || !recipe) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Ligne introuvable.</p>
        <Button variant="link" size="sm" as={Link} to="/" className="mt-3">Retour à la semaine</Button>
      </div>
    );
  }

  const client = event.clientId ? clientById.get(event.clientId) : undefined;
  const who = client?.name ?? event.name;
  const weekUrl = `/semaine/${isoWeekOf(date)}`;
  const weekNumber = Number(isoWeekOf(date).slice(-2));
  const course = courseBucket(courseOf(line, recipe), courses);
  const status: PrepStatus = line.prepStatus ?? "todo";
  const shown = portions ?? line.portions;
  const own = !!line.assignedTo?.length;
  const assignees = own ? line.assignedTo ?? [] : event.assignedTo ?? [];
  const activePeople = people.some((p) => p.active);
  const cookUrl = `/recipes/${recipe.recipeId}/cook?portions=${shown}&event=${eventId}&line=${lineId}${personne ? `&personne=${encodeURIComponent(personne)}` : ""}`;
  const cookState = { from: location.pathname + location.search };
  const moved = date !== eventDate;
  const moveDays = sevenDaysEndingOn(eventDate);
  // The current day joins the list when it is outside the seven days; the chosen one carries the event day.
  const dayOptions = moveDayOptions(eventDate, moveDays.includes(date) ? moveDays : [...moveDays, date].sort())
    .map((o) => (o.value === date && moved ? { ...o, label: `${shortDayLabel(date)} · pour ${shortDayLabel(eventDate)}` } : o));

  const menuItems: ActionMenuItem[] = [
    { kind: "check", label: "Texte plus grand", icon: <Type />, checked: size === "xl", onClick: () => setSize(size === "xl" ? "lead" : "xl") },
    { label: "Modifier les portions", icon: <SlidersHorizontal />, onClick: () => setEditPortions(true) },
    { label: "Déplacer au…", icon: <Calendar />, onClick: () => setMoveOpen(true) },
    { kind: "check", label: "Quantités de base", icon: <Scale />, checked: !scaleSteps, onClick: () => setScaleSteps((v) => !v) },
    { label: "Tout décocher", icon: <Square />, onClick: () => mep.clear() },
    { kind: "separator" },
    { label: "Modifier la recette", icon: <Pencil />, onClick: () => navigate(`/recipes/${recipe.recipeId}?mode=edit`) },
    { label: "Imprimer", icon: <Printer />, onClick: () => window.print() },
  ];

  const cookButton = (
    <Link to={cookUrl} state={cookState} className={cn(BUTTON_BASE, BUTTON_SIZE.lg, BUTTON_VARIANT.primary)}>
      <ChefHat className="h-4 w-4 touch:h-5 touch:w-5" aria-hidden="true" /> Cuisiner
    </Link>
  );
  const pagerLink = (to: string, label: string, icon: ReactNode) => (
    <Link to={to} state={{ from }} aria-label={label} className={cn(BUTTON_BASE, ICON_BUTTON_SIZE.sm, BUTTON_VARIANT.ghost, "p-0 text-icon hover:text-foreground [&>svg]:h-4 [&>svg]:w-4 touch:[&>svg]:h-5 touch:[&>svg]:w-5")}>
      {icon}
    </Link>
  );

  return (
    <div className="mx-auto max-w-doc print:max-w-none" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {ingredientsOut && (
        <Button variant="default" size="sm" onClick={scrollToIngredients} className="no-print fixed left-1/2 top-2 z-20 -translate-x-1/2 shadow-menu md:hidden" icon={<ChevronDown />}>
          Ingrédients
        </Button>
      )}

      {/* Header row: breadcrumb on the laptop, the back link on the phone; pager, ⋯ and Cuisiner on the right */}
      <div className="no-print flex min-h-11 items-center gap-1 pt-1 md:min-h-9 md:pt-0">
        <Button variant="ghost" size="sm" as={Link} to={backUrl} icon={<ChevronLeft />} className="-ml-2">{dayLabel(date)}</Button>
        <nav aria-label="Fil d'Ariane" className="hidden min-w-0 items-center gap-0.5 text-sm text-muted-foreground md:flex">
          <Link to={weekUrl} className={CRUMB}>Semaine {weekNumber}</Link>
          <span aria-hidden="true" className="px-0.5 text-icon">/</span>
          <Link to={backUrl} className={CRUMB}>{dayLabel(date)}</Link>
          <span aria-hidden="true" className="px-0.5 text-icon">/</span>
          <span className="inline-flex h-6 min-w-0 items-center truncate px-1">{recipe.name}</span>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {dayLines.length > 1 && (
            <>
              {prevUrl ? (
                pagerLink(prevUrl, "Ligne précédente", <ChevronLeft />)
              ) : (
                <IconButton size="sm" disabled aria-label="Ligne précédente" icon={<ChevronLeft />} />
              )}
              <span title="Lignes du jour" className="px-0.5 text-sm tabular-nums text-muted-foreground">Ligne {index + 1} / {dayLines.length}</span>
              {nextUrl ? (
                pagerLink(nextUrl, "Ligne suivante", <ChevronRight />)
              ) : (
                <IconButton size="sm" disabled aria-label="Ligne suivante" icon={<ChevronRight />} />
              )}
            </>
          )}
          <span ref={moveRef} className="relative inline-flex">
            <ActionMenu items={menuItems} title={recipe.name} />
            <MoveToDayMenu
              open={moveOpen}
              onClose={() => setMoveOpen(false)}
              anchorRef={moveRef}
              align="right"
              title={`Déplacer « ${recipe.name} »`}
              eventDate={eventDate}
              current={date}
              days={moveDays}
              onPick={(d) => { setMoveOpen(false); void moveTo(d); }}
            />
          </span>
          <span className="ml-1 touch:hidden">{cookButton}</span>
        </div>
      </div>

      <PageHeader
        iconKey="fiche"
        title={recipe.name}
        className="mt-2"
        properties={(
          <PropertyList>
            <Property icon={Hash} label="Portions" kind="number" value={shown} min={1} onSave={(v) => savePortions(v)} />
            <Property icon={TagIcon} label="Catégorie" kind="computed" value={<Tag colour="gray">{course}</Tag>} />
            <Property
              icon="🎉"
              label="Événement"
              kind="computed"
              value={<Link to={`/events/${eventId}`} state={cookState} className="inline-flex items-center text-primary underline-offset-2 hover:underline touch:min-h-11">{who} · {dayLabel(eventDate)}</Link>}
            />
            <Property icon={Calendar} label="Jour de préparation" kind="custom">
              <span className="relative inline-flex">
                <SelectPill
                  colour="gray"
                  value={date}
                  options={dayOptions}
                  onChange={(v) => { if (v === OTHER_DATE) openDatePicker(); else void moveTo(v); }}
                  aria-label="Jour de préparation"
                  title="Jour de préparation"
                />
                <input
                  ref={dateInput}
                  type="date"
                  value={date}
                  onChange={(e) => void moveTo(e.target.value)}
                  aria-label="Choisir une date"
                  tabIndex={-1}
                  className="sr-only absolute bottom-0 left-0"
                />
              </span>
            </Property>
            {activePeople && (
              <Property icon={User} label="Personne" kind="custom">
                <span className="relative inline-flex">
                  <PersonChips personIds={assignees} people={people} size="sm" inherited={!own} onClick={() => setPickerOpen((o) => !o)} label={assignees.length ? undefined : "Assigner"} className="-ml-0.5" />
                  {assignees.length > 0 && <span className="ml-1 self-center text-base">{assignees.map((id) => people.find((p) => p.personId === id)?.name ?? id).join(", ")}</span>}
                  {pickerOpen && (
                    <PersonPicker
                      value={own ? line.assignedTo ?? [] : []}
                      options={people}
                      onChange={assign}
                      allowInherit
                      onClose={() => setPickerOpen(false)}
                      title="Assigner la ligne"
                    />
                  )}
                </span>
              </Property>
            )}
            {!touch && (
              <Property icon={Circle} label="Statut" kind="custom">
                <StatusControl value={status} onChange={setStatus} />
              </Property>
            )}
          </PropertyList>
        )}
      />

      {editPortions && (
        <div className="no-print flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button variant="primary" size="sm" onClick={() => savePortions()} disabled={saving || portions === null || portions === line.portions}>
            Enregistrer {shown} portions
          </Button>
          <Button variant="subtle" size="sm" onClick={() => { setPortions(line.portions); setEditPortions(false); }}>
            Revenir à {line.portions}
          </Button>
        </div>
      )}

      {/* The reader is 18px here; "Texte plus grand" lifts its lists to 20px. */}
      <div ref={readerRef} className={`border-t border-border pt-4 ${size === "xl" ? "[&_ol]:text-[20px] [&_ul]:text-[20px]" : ""}`}>
        <RecipeReader
          recipe={recipe}
          ingredientById={ingredientById}
          portions={shown}
          onPortionsChange={editPortions ? setPortions : undefined}
          size="xl"
          ticks={mep.ticked}
          onTick={tick}
          tickHint="La ligne passe En cours au premier coche."
          scaleSteps={scaleSteps}
          showBase
          extra={(
            <SectionToggle title="Note pour cette fois" defaultOpen={Boolean(line.notes)}>
              <EditableText
                key={lineId}
                value={line.notes ?? ""}
                onSave={saveNotes}
                multiline
                placeholder="Ce qui change pour cet événement"
                className="block min-h-8 whitespace-pre-wrap text-base"
              />
            </SectionToggle>
          )}
        />
      </div>

      {/* Phone: the status and Cuisiner stay in reach at the bottom */}
      <div className="no-print sticky bottom-0 -mx-4 mt-6 hidden items-center gap-3 border-t border-border bg-background px-4 py-2 touch:flex">
        <div className="flex h-11 min-w-0 flex-1 items-center">
          <StatusControl value={status} onChange={setStatus} />
        </div>
        {cookButton}
      </div>
    </div>
  );
}
