import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Check, CheckCircle2, ChevronRight, EyeOff, Printer, Share2, ShoppingCart, X } from "lucide-react";
import type { EventCostSnapshot, Ingredient, Person, PrepLine, PrepStatus, Recipe } from "@packages/types";
import {
  addDays, buildCostSnapshot, calcRecipeCost, datesOfIsoWeek, filterByPerson, fmtQty, groupByPerson, groupByRecipe, isoWeekOf, longDayLabel,
  parseIsoWeek, personName, prepLinesForDate, shortEventName,
} from "@packages/types";
import { api } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { buildGroceryItems, groceryTitleFor } from "@/lib/grocery";
import { NEXT_STATUS, plural, prestationLabel, usePlanningData } from "@/lib/use-planning-data";
import { useToast } from "@/hooks/use-toast";
import { clearMiseEnPlace } from "@/hooks/use-mise-en-place";
import { useBackLink, useFullBleed } from "@/components/admin/AdminLayout";
import PlanningBar from "@/components/admin/PlanningBar";
import PersonChips from "@/components/admin/PersonChips";
import PersonPicker from "@/components/admin/PersonPicker";
import { Dot, StatusDot, STATUS_LABEL } from "@/components/admin/StatusDot";
import { ActionMenu, PageHeader, SectionToggle, StatusControl } from "@/components/ui";

type Mode = "evenement" | "categorie" | "recette" | "personne";

const MODES: { value: Mode; label: string }[] = [
  { value: "evenement", label: "Par événement" },
  { value: "categorie", label: "Par catégorie" },
  { value: "recette", label: "Par recette" },
  { value: "personne", label: "Par personne" },
];

const ICON_BTN = "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-hover";
const SWIPE_PX = 60;

// A picker or menu is open; Escape belongs to it.
function overlayOpen(): boolean {
  return Boolean(document.querySelector('[role="dialog"], [role="menu"]'));
}

interface Group {
  key: string;
  title: string;
  count: string;
  subtitle?: string;
  lines: PrepLine[];
  recipe?: Recipe;
  total?: number;
  // Set in "Par personne"; null is the "Sans personne" group.
  personId?: string | null;
}

interface ScaledIngredient {
  name: string;
  qty: number;
  unit: string;
}

function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
}

function doneLast(lines: PrepLine[]): PrepLine[] {
  return [...lines].sort((a, b) => Number(a.prepStatus === "done") - Number(b.prepStatus === "done"));
}

function mergedStatus(lines: PrepLine[]): PrepStatus {
  if (lines.length > 0 && lines.every((l) => l.prepStatus === "done")) return "done";
  if (lines.some((l) => l.prepStatus !== "todo")) return "doing";
  return "todo";
}

function doneLabel(lines: PrepLine[]): string {
  const n = lines.filter((l) => l.prepStatus === "done").length;
  return `${n} ${n === 1 ? "faite" : "faites"}`;
}

function isMode(v: string | null): v is Mode {
  return MODES.some((m) => m.value === v);
}

// Sums the scaled quantity of every ingredient over the underlying lines, per unit.
function scaledIngredients(recipe: Recipe, lines: PrepLine[], ingredientById: Map<string, Ingredient>): ScaledIngredient[] {
  const agg = new Map<string, ScaledIngredient>();
  for (const line of lines) {
    const ratio = line.portions / (recipe.portions || 1);
    for (const ri of recipe.ingredients) {
      const key = `${ri.ingredientId}:${ri.unit}`;
      const existing = agg.get(key);
      if (existing) existing.qty += ri.qty * ratio;
      else agg.set(key, { name: ingredientById.get(ri.ingredientId)?.name ?? "Ingrédient inconnu", qty: ri.qty * ratio, unit: ri.unit });
    }
  }
  return [...agg.values()];
}

export default function Day() {
  const { date = "" } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  useFullBleed(true);

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const safeDate = valid ? date : "2000-01-01";
  const week = isoWeekOf(safeDate);
  const today = todayIso();
  const from = (location.state as { from?: string } | null)?.from;
  const here = location.pathname + location.search;

  const data = usePlanningData();
  const { events, recipes, settings, people, recipeById, clientById, ingredientById, courses, loading, error, patchLine, patchEvent } = data;
  const activePeople = useMemo(() => people.filter((p) => p.active), [people]);

  const personne = searchParams.get("personne") ?? "";
  const modeParam = searchParams.get("mode");
  const hideDone = searchParams.get("masquer") === "faites";
  const mode: Mode = isMode(modeParam) && (modeParam !== "personne" || activePeople.length > 0) ? modeParam : "evenement";

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ name: string; next?: PrepLine } | null>(null);
  const [printPending, setPrintPending] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // The query every link out of the day keeps.
  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (personne) sp.set("personne", personne);
    if (mode !== "evenement") sp.set("mode", mode);
    if (hideDone) sp.set("masquer", "faites");
    const s = sp.toString();
    return s ? `?${s}` : "";
  }, [personne, mode, hideDone]);
  const dayUrl = useCallback((d: string) => `/jour/${d}${query}`, [query]);
  const setParam = (key: string, value: string | null) => {
    const sp = new URLSearchParams(searchParams);
    if (value) sp.set(key, value);
    else sp.delete(key);
    setSearchParams(sp, { replace: true });
  };

  const weekNumber = parseIsoWeek(week).week;
  const weekUrl = from ?? `/semaine/${week}${personne ? `?personne=${encodeURIComponent(personne)}` : ""}`;
  useBackLink({ to: weekUrl, label: `Semaine ${weekNumber}` });
  const weekDates = useMemo(() => datesOfIsoWeek(week), [week]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) {
      const d = e.date.slice(0, 10);
      if (d >= weekDates[0] && d <= weekDates[6]) c[d] = (c[d] ?? 0) + 1;
    }
    return c;
  }, [events, weekDates]);

  const dayEvents = useMemo(() => events.filter((e) => e.date.slice(0, 10) === safeDate), [events, safeDate]);
  const allLines = useMemo(
    () => prepLinesForDate(events, recipeById, clientById, courses, safeDate),
    [events, recipeById, clientById, courses, safeDate],
  );
  const lines = useMemo(() => (personne ? filterByPerson(allLines, personne) : allLines), [allLines, personne]);
  const guests = dayEvents.reduce((n, e) => n + e.guestCount, 0);
  // Events the person is on without a line of theirs.
  const serviceEvents = useMemo(
    () => (personne ? dayEvents.filter((ev) => (ev.assignedTo ?? []).includes(personne) && !lines.some((l) => l.eventId === ev.eventId)) : []),
    [personne, dayEvents, lines],
  );

  const recipeCostById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, calcRecipeCost(r, ingredientById)])), [recipes, ingredientById]);
  const recipePortionsById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r.portions])), [recipes]);

  const visible = useCallback((ls: PrepLine[]) => doneLast(hideDone ? ls.filter((l) => l.prepStatus !== "done") : ls), [hideDone]);

  const groups = useMemo<Group[]>(() => {
    if (mode === "evenement") {
      return dayEvents.map((ev) => {
        const evLines = allLines.filter((l) => l.eventId === ev.eventId);
        const client = ev.clientId ? clientById.get(ev.clientId) : undefined;
        return {
          key: ev.eventId,
          title: shortEventName(ev, client),
          subtitle: [plural(ev.guestCount, "convive"), prestationLabel(settings, ev.prestationType)].filter(Boolean).join(" · "),
          count: plural(evLines.length, "ligne"),
          lines: visible(evLines),
        };
      });
    }
    if (mode === "categorie") {
      const order: string[] = [];
      for (const l of allLines) if (!order.includes(l.course)) order.push(l.course);
      return order.map((course) => {
        const cLines = allLines.filter((l) => l.course === course);
        return { key: course, title: course, count: plural(cLines.length, "ligne"), lines: visible(cLines) };
      });
    }
    if (mode === "personne") {
      return groupByPerson(allLines, people).map((g) => ({
        key: g.personId ?? "sans-personne",
        title: g.name,
        count: `${plural(g.lines.length, "ligne")} · ${doneLabel(g.lines)}`,
        lines: visible(g.lines),
        personId: g.personId,
      }));
    }
    return groupByRecipe(allLines).map((g) => {
      const rLines = allLines.filter((l) => l.recipeId === g.recipeId);
      return {
        key: g.recipeId,
        title: g.recipeName,
        count: `${g.total} portions`,
        subtitle: g.parts.map((p) => `${p.label} ${p.portions}`).join(" · "),
        lines: visible(rLines),
        recipe: recipeById.get(g.recipeId),
        total: g.total,
      };
    });
  }, [mode, visible, dayEvents, allLines, clientById, recipeById, settings, people]);

  const shownGroups = groups.filter((g) => g.lines.length > 0);
  const personLines = visible(lines);

  // The prep sheet lands here with ?done=<lineId> after a line was ticked.
  const doneParam = searchParams.get("done");
  useEffect(() => {
    if (!doneParam || loading) return;
    const idx = lines.findIndex((l) => l.lineId === doneParam);
    const after = idx >= 0 ? [...lines.slice(idx + 1), ...lines.slice(0, idx)] : lines;
    setNotice({ name: idx >= 0 ? lines[idx].recipeName : "Ligne", next: after.find((l) => l.prepStatus === "todo") });
    const sp = new URLSearchParams(searchParams);
    sp.delete("done");
    setSearchParams(sp, { replace: true });
  }, [doneParam, loading, lines, searchParams, setSearchParams]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!printPending || mode !== "personne") return;
    setPrintPending(false);
    const t = setTimeout(() => window.print(), 100);
    return () => clearTimeout(t);
  }, [printPending, mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e) || overlayOpen()) return;
      if (e.key === "ArrowLeft") navigate(dayUrl(addDays(safeDate, -1)), { state: location.state });
      if (e.key === "ArrowRight") navigate(dayUrl(addDays(safeDate, 1)), { state: location.state });
      if (e.key === "Escape") navigate(weekUrl);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, safeDate, dayUrl, weekUrl, location.state]);

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
    navigate(dayUrl(addDays(safeDate, dx < 0 ? 1 : -1)), { state: location.state });
  };

  const setStatus = useCallback(async (line: PrepLine, status: PrepStatus) => {
    try {
      await patchLine(line.eventId, line.lineId, { prepStatus: status });
      if (status === "done") clearMiseEnPlace(line.lineId);
    } catch {
      toast({ title: "Erreur lors de la mise à jour du statut", variant: "destructive" });
    }
  }, [patchLine, toast]);

  const setAllStatus = async (ls: PrepLine[], status: PrepStatus) => {
    for (const l of ls) if (l.prepStatus !== status) await setStatus(l, status);
  };

  const assignLine = useCallback(async (line: PrepLine, next: string[]) => {
    try {
      await patchLine(line.eventId, line.lineId, { assignedTo: next });
    } catch {
      toast({ title: "Erreur lors de l'attribution", variant: "destructive" });
    }
  }, [patchLine, toast]);

  const assignAll = async (ls: PrepLine[], next: string[]) => {
    for (const l of ls) await assignLine(l, next);
  };

  const createGrocery = async () => {
    if (dayEvents.length === 0) { toast({ title: "Aucun événement ce jour" }); return; }
    const range = { from: safeDate, to: safeDate };
    setBusy(true);
    try {
      const items = buildGroceryItems(dayEvents, recipeById, ingredientById, range).map((i) => ({ ...i, checked: false }));
      const list = await api.groceryLists.create({ title: groceryTitleFor(range), items, eventIds: dayEvents.map((e) => e.eventId), range });
      navigate(`/grocery-list?id=${list.listId}`);
    } catch {
      toast({ title: "Erreur lors de la création de la liste", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const share = async (personId?: string) => {
    const url = `${window.location.origin}/jour/${safeDate}${personId ? `?personne=${encodeURIComponent(personId)}` : ""}`;
    const title = personId ? `${longDayLabel(safeDate)} · ${personName(people, personId)}` : longDayLabel(safeDate);
    if (navigator.share) {
      try { await navigator.share({ title, url }); } catch { /* cancelled */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Lien copié" });
    } catch {
      toast({ title: "Impossible de copier le lien", variant: "destructive" });
    }
  };

  const upcoming = dayEvents.filter((e) => e.status === "upcoming");
  const finishEvents = async () => {
    setBusy(true);
    let n = 0;
    try {
      for (const ev of upcoming) {
        const costSnapshot = buildCostSnapshot(ev, recipeCostById, recipePortionsById) as EventCostSnapshot;
        await patchEvent(ev.eventId, { status: "completed", costSnapshot });
        n++;
      }
      toast({ title: plural(n, "événement terminé", "événements terminés") });
    } catch {
      toast({ title: n ? `${n} sur ${upcoming.length} terminés, puis une erreur` : "Erreur lors de la clôture", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!valid) return <Navigate to={`/semaine/${isoWeekOf(todayIso())}`} replace />;

  const prepUrl = (l: PrepLine) => `/events/${l.eventId}/lines/${l.lineId}${personne ? `?personne=${encodeURIComponent(personne)}` : ""}`;
  const done = lines.filter((l) => l.prepStatus === "done").length;
  const meta = personne
    ? `${plural(lines.length, "ligne")} · ${done} ${done === 1 ? "faite" : "faites"}`
    : `${plural(dayEvents.length, "événement")} · ${plural(guests, "convive")} · ${plural(lines.length, "ligne")} · ${done} ${done === 1 ? "faite" : "faites"}`;
  const title = personne ? `${personName(people, personne)} · ${longDayLabel(safeDate)}` : longDayLabel(safeDate);
  const modes = MODES.filter((m) => m.value !== "personne" || activePeople.length > 0);
  const personOptions: Person[] = personne && !activePeople.some((p) => p.personId === personne)
    ? [...activePeople, { personId: personne, name: personName(people, personne), active: false }]
    : activePeople;

  const menuItems = [
    { label: "Courses du jour", icon: <ShoppingCart className="h-4 w-4" />, onClick: createGrocery },
    { label: "Imprimer", icon: <Printer className="h-4 w-4" />, onClick: () => window.print() },
    ...(activePeople.length > 0 && !personne
      ? [{ label: "Imprimer par personne", icon: <Printer className="h-4 w-4" />, onClick: () => { setParam("mode", "personne"); setPrintPending(true); } }]
      : []),
    ...(personne
      ? [{ label: "Partager…", icon: <Share2 className="h-4 w-4" />, onClick: () => share(personne) }]
      : activePeople.length > 0
        ? activePeople.map((p) => ({ label: `Partager · ${p.name}`, icon: <Share2 className="h-4 w-4" />, onClick: () => share(p.personId) }))
        : [{ label: "Partager…", icon: <Share2 className="h-4 w-4" />, onClick: () => share() }]),
    {
      label: "Masquer les lignes faites",
      icon: hideDone ? <Check className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />,
      onClick: () => setParam("masquer", hideDone ? null : "faites"),
    },
    ...(safeDate < today && upcoming.length > 0
      ? [{ label: `Terminer ${upcoming.length === 1 ? "l'événement" : `les ${upcoming.length} événements`}`, icon: <CheckCircle2 className="h-4 w-4" />, onClick: finishEvents }]
      : []),
  ];

  const empty = !loading && !error && lines.length === 0;

  return (
    <div
      className="h-[calc(100dvh-68px)] overflow-y-auto px-4 py-1 pb-24 md:h-dvh xl:px-6 xl:py-4 xl:pb-24 print:h-auto print:overflow-visible"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <PlanningBar
        view="day"
        date={safeDate}
        dates={weekDates}
        counts={counts}
        today={today}
        weekNo={weekNumber}
        dayHref={dayUrl}
        linkState={location.state}
        weekHref={weekUrl}
        prevHref={dayUrl(addDays(safeDate, -1))}
        nextHref={dayUrl(addDays(safeDate, 1))}
        todayHref={safeDate !== today ? dayUrl(today) : undefined}
        right={<div className="text-right text-sm text-muted-foreground tabular-nums">{meta}</div>}
      />
      <div className="mx-auto mt-4 max-w-doc">
        <PageHeader
          title={title}
          meta={<span className="xl:hidden">{meta}</span>}
          actions={
            <div className="no-print flex w-full flex-nowrap items-center gap-2 md:w-auto">
              {!personne && (
                <>
                  <div role="group" aria-label="Regroupement" className="hidden shrink-0 rounded-lg border border-border bg-card p-0.5 md:inline-flex">
                    {modes.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        aria-pressed={mode === m.value}
                        onClick={() => setParam("mode", m.value === "evenement" ? null : m.value)}
                        className={`min-h-10 whitespace-nowrap rounded-md px-3 text-base font-medium ${mode === m.value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-hover"}`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <select
                    aria-label="Regroupement"
                    value={mode}
                    onChange={(e) => setParam("mode", e.target.value === "evenement" ? null : e.target.value)}
                    className="input-field min-h-11 min-w-0 flex-1 md:hidden"
                  >
                    {modes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </>
              )}
              {personOptions.length > 0 && (
                <select
                  aria-label="Personne"
                  value={personne}
                  onChange={(e) => setParam("personne", e.target.value || null)}
                  className="input-field min-h-11 min-w-0 flex-1 md:w-auto md:flex-none"
                >
                  <option value="">Toutes les personnes</option>
                  {personOptions.map((p) => <option key={p.personId} value={p.personId}>{p.name}</option>)}
                </select>
              )}
              <div className="ml-auto shrink-0 md:ml-0">
                <ActionMenu items={menuItems} />
              </div>
            </div>
          }
        />

        {error && <p className="mt-4 text-base text-destructive">{error}</p>}
        {loading && <p className="mt-6 text-base text-muted-foreground">Chargement…</p>}
        {empty && !personne && (
          <p className="mt-6 text-base text-muted-foreground">
            Aucune ligne à préparer ce jour. <Link to={`/events/new?date=${safeDate}&retour=${encodeURIComponent(here)}`} className="text-primary underline-offset-4 hover:underline">Créer un événement</Link>
          </p>
        )}
        {empty && personne && serviceEvents.length === 0 && (
          <p className="mt-6 text-base text-muted-foreground">Aucune ligne pour {personName(people, personne)} ce jour.</p>
        )}
        {!loading && !error && lines.length > 0 && (personne ? personLines.length === 0 : shownGroups.length === 0) && (
          <p className="mt-6 text-base text-muted-foreground">Tout est fait.</p>
        )}

        {personne ? (
          <>
            {personLines.length > 0 && (
              <ul className="mt-4 divide-y divide-border">
                {personLines.map((line) => {
                  const isDone = line.prepStatus === "done";
                  return (
                    <li key={line.lineId} className={`relative flex min-h-14 items-center gap-2 rounded-lg pointer:hover:bg-hover ${isDone ? "text-muted-foreground" : ""}`}>
                      <StatusDot className="no-print relative z-10" target="always" value={line.prepStatus} onCycle={() => setStatus(line, NEXT_STATUS[line.prepStatus])} />
                      <span className="hidden print:inline-block"><Dot status={line.prepStatus} /></span>
                      <Link to={prepUrl(line)} state={{ from: here }} className="flex min-h-14 min-w-0 flex-1 items-center py-1 before:absolute before:inset-0 before:rounded-lg">
                        <span className="min-w-0 flex-1">
                          <span className="block text-lead">{line.recipeName}</span>
                          <span className="block text-sm text-muted-foreground">{[line.clientName ?? line.eventName, line.course, line.notes].filter(Boolean).join(" · ")}</span>
                        </span>
                      </Link>
                      <span className="shrink-0 text-lead font-semibold tabular-nums">{line.portions}</span>
                      <ChevronRight className="no-print h-5 w-5 shrink-0 text-muted-foreground" />
                    </li>
                  );
                })}
              </ul>
            )}
            {serviceEvents.length > 0 && (
              <section className="mt-6">
                <h2 className="text-h3">Service</h2>
                <ul className="mt-2 divide-y divide-border">
                  {serviceEvents.map((ev) => (
                    <li key={ev.eventId}>
                      <Link to={`/events/${ev.eventId}`} state={{ from: here }} className="flex min-h-14 items-center gap-3 rounded-lg px-2 text-base hover:bg-hover">
                        <span className="min-w-0 flex-1">
                          {[shortEventName(ev, ev.clientId ? clientById.get(ev.clientId) : undefined), plural(ev.guestCount, "convive"), prestationLabel(settings, ev.prestationType)].filter(Boolean).join(" · ")}
                        </span>
                        <ChevronRight className="no-print h-5 w-5 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p className="no-print mt-6">
              <Link to={`/jour/${safeDate}${hideDone ? "?masquer=faites" : ""}`} className="inline-flex min-h-11 items-center text-base text-primary underline-offset-4 hover:underline">
                Toutes les personnes
              </Link>
            </p>
          </>
        ) : (
          shownGroups.map((group, i) => (
            <section key={group.key} className={i > 0 ? "mt-6 print-break" : "mt-4"}>
              <header className="sticky top-14 z-[15] bg-background py-2 md:top-0">
                <div className={`flex items-center justify-between gap-3 ${mode === "personne" ? "min-h-11" : ""}`}>
                  <h2 className="text-h3 min-w-0">{group.title}</h2>
                  <span className="shrink-0 text-base text-muted-foreground tabular-nums">{group.count}</span>
                  {mode === "personne" && group.personId && (
                    <button type="button" onClick={() => share(group.personId ?? undefined)} aria-label={`Partager la liste de ${group.title}`} className={`${ICON_BTN} no-print`}>
                      <Share2 className="h-5 w-5" />
                    </button>
                  )}
                  {mode === "personne" && group.personId === null && (
                    <GroupAssign people={activePeople} onChange={(next) => assignAll(group.lines, next)} />
                  )}
                </div>
                {group.subtitle && <p className="text-sm text-muted-foreground">{group.subtitle}</p>}
              </header>

              {mode !== "recette" ? (
                <ul className="divide-y divide-border">
                  {group.lines.map((line) => {
                    const isDone = line.prepStatus === "done";
                    const second = mode === "evenement"
                      ? [line.course, line.notes].filter(Boolean).join(" · ")
                      : [line.clientName ?? line.eventName, line.course, line.notes].filter(Boolean).join(" · ");
                    return (
                      <li key={line.lineId} className={`relative flex min-h-14 items-center gap-2 rounded-lg pointer:hover:bg-hover ${isDone ? "text-muted-foreground" : ""}`}>
                        <div className="no-print relative z-10 hidden w-60 shrink-0 md:block">
                          <StatusControl value={line.prepStatus} onChange={(s) => setStatus(line, s)} />
                        </div>
                        <StatusDot className="no-print relative z-10 md:hidden" target="always" value={line.prepStatus} onCycle={() => setStatus(line, NEXT_STATUS[line.prepStatus])} />
                        <span className="hidden print:inline-block"><Dot status={line.prepStatus} /></span>
                        <Link to={prepUrl(line)} state={{ from: here }} className="flex min-h-14 min-w-0 flex-1 items-center py-1 pl-2 before:absolute before:inset-0 before:rounded-lg">
                          <span className="min-w-0 flex-1">
                            <span className="block text-lead">{line.recipeName}</span>
                            {second && <span className="block text-sm text-muted-foreground">{second}</span>}
                          </span>
                        </Link>
                        {activePeople.length > 0 && <LineAssign line={line} people={people} onChange={(next) => assignLine(line, next)} />}
                        <span className="shrink-0 text-lead font-semibold tabular-nums">{line.portions}</span>
                        <ChevronRight className="no-print h-5 w-5 shrink-0 text-muted-foreground" />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <RecipeGroupBody group={group} people={people} ingredientById={ingredientById} prepUrl={prepUrl} from={here} onStatus={(s) => setAllStatus(group.lines, s)} />
              )}
            </section>
          ))
        )}
      </div>

      {notice && (
        <div role="status" className="no-print fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 card-elevated px-4 py-3 shadow-xl">
          <span className="min-w-0 flex-1 text-base font-medium">Fait : {notice.name}</span>
          {notice.next ? (
            <Link to={prepUrl(notice.next)} state={{ from: here }} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground hover:opacity-90">
              Suivante
            </Link>
          ) : (
            <span className="text-base text-muted-foreground">Tout est fait</span>
          )}
          <button type="button" onClick={() => setNotice(null)} aria-label="Fermer" className={ICON_BTN}><X className="h-5 w-5" /></button>
        </div>
      )}
      {busy && <span className="sr-only" aria-live="polite">Enregistrement…</span>}
    </div>
  );
}

interface LineAssignProps {
  line: PrepLine;
  people: Person[];
  onChange: (next: string[]) => void;
}

// Chips of a row; tap opens the line picker, "Comme l'événement" clears the override.
function LineAssign({ line, people, onChange }: LineAssignProps) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`relative inline-flex shrink-0 text-foreground ${open ? "z-20" : "z-10"}`}>
      <PersonChips personIds={line.assignedTo} people={people} size="md" inherited={!line.ownAssignment} onClick={() => setOpen(true)} className="no-print" />
      <span className="hidden print:inline"><PersonChips personIds={line.assignedTo} people={people} size="md" /></span>
      {open && (
        <PersonPicker
          value={line.ownAssignment ? line.assignedTo : []}
          options={people}
          onChange={onChange}
          allowInherit
          onClose={() => setOpen(false)}
          align="right"
          title="Attribuer la ligne"
        />
      )}
    </span>
  );
}

// "Attribuer…" on the Sans personne heading; every toggle writes the whole group.
function GroupAssign({ people, onChange }: { people: Person[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string[]>([]);
  return (
    <span className={`no-print relative inline-flex shrink-0 ${open ? "z-20" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 items-center rounded-lg px-3 text-base font-medium text-primary hover:bg-hover"
      >
        Attribuer…
      </button>
      {open && (
        <PersonPicker
          value={value}
          options={people}
          onChange={(next) => { setValue(next); onChange(next); }}
          onClose={() => setOpen(false)}
          align="right"
          title="Attribuer les lignes"
        />
      )}
    </span>
  );
}

interface RecipeGroupBodyProps {
  group: Group;
  people: Person[];
  ingredientById: Map<string, Ingredient>;
  prepUrl: (l: PrepLine) => string;
  from: string;
  onStatus: (s: PrepStatus) => void;
}

function RecipeGroupBody({ group, people, ingredientById, prepUrl, from, onStatus }: RecipeGroupBodyProps) {
  const merged = mergedStatus(group.lines);
  const scaled = group.recipe ? scaledIngredients(group.recipe, group.lines, ingredientById) : [];
  const total = group.total ?? group.lines.reduce((n, l) => n + l.portions, 0);
  const isDone = merged === "done";

  return (
    <div className={isDone ? "text-muted-foreground" : ""}>
      <div className="no-print mt-2 w-full md:w-60">
        <StatusControl value={merged} onChange={onStatus} />
      </div>
      <ul className="mt-2 divide-y divide-border">
        {group.lines.map((line) => (
          <li key={line.lineId}>
            <Link to={prepUrl(line)} state={{ from }} className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-base hover:bg-hover">
              <Dot status={line.prepStatus} />
              <span className="min-w-0 flex-1">
                {line.clientName ?? line.eventName}
                <span className="text-muted-foreground"> · {STATUS_LABEL[line.prepStatus]}</span>
                {line.notes && <span className="block text-sm text-muted-foreground">{line.notes}</span>}
              </span>
              <PersonChips personIds={line.assignedTo} people={people} size="md" inherited={!line.ownAssignment} />
              <span className="shrink-0 font-semibold tabular-nums">{line.portions}</span>
              <ChevronRight className="no-print h-5 w-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      {group.recipe && (
        <>
          <div className="no-print">
            <SectionToggle title={`Ingrédients pour ${total}`} className="!mt-4">
              <IngredientList items={scaled} />
            </SectionToggle>
          </div>
          <div className="mt-3 hidden print:block">
            <h3 className="text-h3">Ingrédients pour {total}</h3>
            <IngredientList items={scaled} />
          </div>
        </>
      )}
    </div>
  );
}

function IngredientList({ items }: { items: ScaledIngredient[] }) {
  if (items.length === 0) return <p className="text-base text-muted-foreground">Aucun ingrédient.</p>;
  return (
    <ul className="divide-y divide-border text-base">
      {items.map((it, i) => {
        const q = fmtQty(it.qty, it.unit);
        return (
          <li key={`${it.name}-${it.unit}-${i}`} className="flex min-h-11 items-center justify-between gap-4 py-1">
            <span className="min-w-0">{it.name}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {q.value} <span className="font-normal text-muted-foreground">{q.unit}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
