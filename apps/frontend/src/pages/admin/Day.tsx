import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CalendarDays, CheckCircle2, EyeOff, MoreHorizontal, Pencil, Plus, Printer, Share2, ShoppingCart, Trash2, UserPlus, X } from "lucide-react";
import type { AppEvent, DayItem, EventCostSnapshot, Ingredient, Person, PrepLine, PrepStatus, PrepTask, PrestationTypeSetting, Recipe, ScaledIngredient } from "@packages/types";
import {
  addDays, buildCostSnapshot, calcRecipeCost, courseIndex, datesOfIsoWeek, DEFAULT_PRESTATION_TYPES, filterByPerson, fmtQty, groupByPerson, groupByRecipe, isoWeekOf, longDayLabel,
  parseIsoWeek, parseYmd, personName, prepLinesForDate, prepTasksForDate, scaledIngredients, shortDayLabel, shortEventName, weekPlan,
} from "@packages/types";
import { api, ApiError } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { buildGroceryItems, groceryTitleFor } from "@/lib/grocery";
import { defaultTaskEventId } from "@/lib/tasks";
import { NEXT_STATUS, plural, prestationLabel, usePlanningData } from "@/lib/use-planning-data";
import { weekSummary, type ChecklistIntent } from "@/lib/week-summary";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useToast } from "@/hooks/use-toast";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { useMediaQuery } from "@/hooks/use-media-query";
import { clearMiseEnPlace } from "@/hooks/use-mise-en-place";
import { useBackLink, useFullBleed, useTopTitle } from "@/components/admin/AdminLayout";
import DayHeads from "@/components/admin/DayHeads";
import FirstRunCallout from "@/components/admin/FirstRunCallout";
import MoveToDayMenu from "@/components/admin/MoveToDayMenu";
import PlanningBar from "@/components/admin/PlanningBar";
import PlanningFrame from "@/components/admin/PlanningFrame";
import WeekChecklist from "@/components/admin/WeekChecklist";
import WeekMeta from "@/components/admin/WeekMeta";
import PersonChips, { PersonChip } from "@/components/admin/PersonChips";
import PersonPicker from "@/components/admin/PersonPicker";
import { Dot, StatusDot, STATUS_LABEL } from "@/components/admin/StatusDot";
import TaskComposer from "@/components/admin/TaskComposer";
import TaskDialog, { type TaskDialogValue } from "@/components/admin/TaskDialog";
import {
  ActionMenu, Button, Dialog, FilterButton, FilterChip, FilterGroup, IconButton, Menu, MenuCheck, MenuItem, MenuRadio, MenuSection, MenuSeparator,
  SectionToggle, SelectPill, StatusControl, Tag, useMenu,
} from "@/components/ui";
import type { ActionMenuItem } from "@/components/ui";

type Mode = "evenement" | "categorie" | "recette" | "personne";

const MODES: Mode[] = ["evenement", "categorie", "recette", "personne"];
const GROUP_OPTIONS = [
  { value: "evenement", label: "Événement" },
  { value: "categorie", label: "Catégorie" },
  { value: "recette", label: "Recette" },
];

const SWIPE_PX = 60;
const TASKS_KEY = "taches";
// Row content sits above the full-row link overlay; an open menu lifts its row above the next ones.
const ABOVE = "relative z-10 hover:z-30 focus-within:z-30";
const EMPTY_TASK: TaskDialogValue = { label: "", date: "", eventId: "", assignedTo: [], notes: "" };

const shortDate = new Intl.DateTimeFormat("fr-BE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// "Sam. 17 oct."
function navLabel(date: string): string {
  const s = shortDate.format(parseYmd(date));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "pour samedi 17 octobre"
function forDayLabel(date: string): string {
  const s = longDayLabel(date);
  return `pour ${s.charAt(0).toLowerCase()}${s.slice(1)}`;
}

// A picker or menu is open; Escape belongs to it.
function overlayOpen(): boolean {
  return Boolean(document.querySelector('[role="dialog"], [role="menu"]'));
}

interface Group {
  key: string;
  title: string;
  count: string;
  subtitle?: string;
  // "pour sam. 17" on a group prepared today for an event on another day.
  tag?: string;
  lines: DayItem[];
  recipe?: Recipe;
  total?: number;
  // Set in "Par personne"; null is the "Sans personne" group.
  personId?: string | null;
}

interface TaskDialogState {
  mode: "create" | "edit";
  eventId: string;
  taskId?: string;
  initial: TaskDialogValue;
}

function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
}

function isLine(item: DayItem): item is PrepLine {
  return item.kind === "recipe";
}

function doneLast<T extends { prepStatus: PrepStatus }>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(a.prepStatus === "done") - Number(b.prepStatus === "done"));
}

function mergedStatus(items: { prepStatus: PrepStatus }[]): PrepStatus {
  if (items.length > 0 && items.every((l) => l.prepStatus === "done")) return "done";
  if (items.some((l) => l.prepStatus !== "todo")) return "doing";
  return "todo";
}

function doneLabel(items: { prepStatus: PrepStatus }[]): string {
  const n = items.filter((l) => l.prepStatus === "done").length;
  return `${n} ${n === 1 ? "faite" : "faites"}`;
}

function isMode(v: string | null): v is Mode {
  return MODES.some((m) => m === v);
}

function byDateThenName(a: AppEvent, b: AppEvent): number {
  return a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)) || a.name.localeCompare(b.name, "fr");
}

const is409 = (e: unknown) => e instanceof ApiError && e.status === 409;

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

  const weekDates = useMemo(() => datesOfIsoWeek(week), [week]);
  // The Thursday decides the ledger year, as on the week page.
  const year = weekDates[3].slice(0, 4);
  const data = usePlanningData(year, { withLists: true });
  const {
    events, recipes, settings, people, clients, clientsConfigured, entries, ledgerConfigured, groceryLists,
    recipeById, clientById, ingredientById, courses, loading, error,
    reload, replaceEvent, patchLine, patchEvent, addTask, patchTask, removeTask,
  } = data;
  const activePeople = useMemo(() => people.filter((p) => p.active), [people]);
  const summary = useMemo(
    () => weekSummary({ isoWeek: week, today, events, clients, clientsConfigured, groceryLists, entries, ledgerConfigured, people, settings }),
    [week, today, events, clients, clientsConfigured, groceryLists, entries, ledgerConfigured, people, settings],
  );
  const plan = useMemo(() => weekPlan(events, weekDates[0], people), [events, weekDates, people]);
  const started = weekDates[0] <= today;
  const firstRun = !loading && recipes.length === 0 && events.length === 0 && activePeople.length === 0;
  const prestationTypes: PrestationTypeSetting[] = settings?.prestationTypes?.length ? settings.prestationTypes : DEFAULT_PRESTATION_TYPES;

  const personne = searchParams.get("personne") ?? "";
  const modeParam = searchParams.get("mode");
  const hideDone = searchParams.get("masquer") === "faites";
  const mode: Mode = isMode(modeParam) && (modeParam !== "personne" || activePeople.length > 0) ? modeParam : "evenement";

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ name: string; next?: PrepLine } | null>(null);
  const [printPending, setPrintPending] = useState(false);
  const [taskDialog, setTaskDialog] = useState<TaskDialogState | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [confirmTask, setConfirmTask] = useState<PrepTask | null>(null);
  // Same key as the week page, so the callouts keep their state between the two views.
  const [checklistOpen, setChecklistOpen] = useLocalStorage<boolean>("recipe-book:checklist-open", true);
  const touch = useTouchScreen();
  // Under md the full right group wraps and overflows, so narrow pointer windows get the touch group.
  const narrow = useMediaQuery("(max-width: 767px)");
  const compact = touch || narrow;
  const menu = useMenu();
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
  const setParams = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) { if (v) sp.set(k, v); else sp.delete(k); }
    setSearchParams(sp, { replace: true });
  };

  const weekNumber = parseIsoWeek(week).week;
  const weekUrl = from ?? `/semaine/${week}${personne ? `?personne=${encodeURIComponent(personne)}` : ""}`;
  const title = personne ? `${personName(people, personne)} · ${longDayLabel(safeDate)}` : longDayLabel(safeDate);
  useBackLink({ to: weekUrl, label: "Semaine" });
  useTopTitle(title);
  // The week's events by date then name, for the strip counts, the composer and the dialog.
  const weekEvents = useMemo(
    () => events.filter((e) => { const d = e.date.slice(0, 10); return d >= weekDates[0] && d <= weekDates[6]; }).sort(byDateThenName),
    [events, weekDates],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of weekEvents) {
      const d = e.date.slice(0, 10);
      c[d] = (c[d] ?? 0) + 1;
    }
    return c;
  }, [weekEvents]);
  const eventById = useMemo(() => new Map(events.map((e) => [e.eventId, e])), [events]);

  const dayEvents = useMemo(() => events.filter((e) => e.date.slice(0, 10) === safeDate), [events, safeDate]);
  const allLines = useMemo(
    () => prepLinesForDate(events, recipeById, clientById, courses, safeDate),
    [events, recipeById, clientById, courses, safeDate],
  );
  const allTasks = useMemo(() => prepTasksForDate(events, clientById, safeDate), [events, clientById, safeDate]);
  const allItems = useMemo<DayItem[]>(() => [...allLines, ...allTasks], [allLines, allTasks]);
  // Recipe lines only, for the ?done= notice.
  const lines = useMemo(() => (personne ? filterByPerson(allLines, personne) : allLines), [allLines, personne]);
  const items = useMemo(() => (personne ? filterByPerson(allItems, personne) : allItems), [allItems, personne]);
  const guests = dayEvents.reduce((n, e) => n + e.guestCount, 0);
  // Events the person is on without a line or a task of theirs.
  const serviceEvents = useMemo(
    () => (personne ? dayEvents.filter((ev) => (ev.assignedTo ?? []).includes(personne) && !items.some((i) => i.eventId === ev.eventId)) : []),
    [personne, dayEvents, items],
  );
  const defaultEventId = useMemo(() => defaultTaskEventId(weekEvents, safeDate), [weekEvents, safeDate]);
  const canAddTask = defaultEventId !== "";

  const recipeCostById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, calcRecipeCost(r, ingredientById)])), [recipes, ingredientById]);
  const recipePortionsById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r.portions || 1])), [recipes]);

  const visible = useCallback(
    <T extends { prepStatus: PrepStatus }>(ls: T[]): T[] => doneLast(hideDone ? ls.filter((l) => l.prepStatus !== "done") : ls),
    [hideDone],
  );

  const groups = useMemo<Group[]>(() => {
    const tasksGroup: Group[] = allTasks.length > 0
      ? [{ key: TASKS_KEY, title: "Tâches", count: plural(allTasks.length, "tâche"), lines: visible(allTasks) }]
      : [];
    if (mode === "evenement") {
      const own = dayEvents.map((ev) => {
        const evItems = allItems.filter((i) => i.eventId === ev.eventId);
        const client = ev.clientId ? clientById.get(ev.clientId) : undefined;
        return {
          key: ev.eventId,
          title: shortEventName(ev, client),
          subtitle: [plural(ev.guestCount, "convive"), prestationLabel(settings, ev.prestationType)].filter(Boolean).join(" · "),
          count: plural(evItems.length, "préparation"),
          lines: visible(evItems),
        };
      });
      const otherIds = [...new Set(allItems.filter((i) => i.eventDate !== safeDate).map((i) => i.eventId))];
      const others = otherIds.map((id) => eventById.get(id)).filter((ev): ev is AppEvent => !!ev).sort(byDateThenName);
      const movedIn = others.map((ev) => {
        const evItems = allItems.filter((i) => i.eventId === ev.eventId);
        const evDate = ev.date.slice(0, 10);
        const client = ev.clientId ? clientById.get(ev.clientId) : undefined;
        return {
          key: ev.eventId,
          title: shortEventName(ev, client),
          tag: `pour ${shortDayLabel(evDate)}`,
          subtitle: [forDayLabel(evDate), plural(ev.guestCount, "convive"), prestationLabel(settings, ev.prestationType)].filter(Boolean).join(" · "),
          count: plural(evItems.length, "préparation"),
          lines: visible(evItems),
        };
      });
      return [...own, ...movedIn];
    }
    if (mode === "categorie") {
      const order: string[] = [];
      for (const l of allLines) if (!order.includes(l.course)) order.push(l.course);
      order.sort((a, b) => courseIndex(a, courses) - courseIndex(b, courses));
      const byCourse = order.map((course) => {
        const cLines = allLines.filter((l) => l.course === course);
        return { key: course, title: course, count: plural(cLines.length, "préparation"), lines: visible(cLines) };
      });
      return [...byCourse, ...tasksGroup];
    }
    if (mode === "personne") {
      // Every active person gets a heading, even with no item that day.
      const byPerson = groupByPerson(allItems, people);
      const found = new Map(byPerson.map((g) => [g.personId, g]));
      const base = activePeople.map((p) => found.get(p.personId) ?? { personId: p.personId, name: p.name, lines: [] as DayItem[] });
      const rest = byPerson.filter((g) => !activePeople.some((p) => p.personId === g.personId));
      return [...base, ...rest].map((g) => ({
        key: g.personId ?? "sans-personne",
        title: g.name,
        count: `${plural(g.lines.length, "préparation")} · ${doneLabel(g.lines)}`,
        lines: visible(g.lines),
        personId: g.personId,
      }));
    }
    const byRecipe = groupByRecipe(allLines).map((g) => {
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
    return [...byRecipe, ...tasksGroup];
  }, [mode, visible, dayEvents, allLines, allTasks, allItems, eventById, safeDate, clientById, recipeById, settings, people, activePeople, courses]);

  // "Par personne" keeps empty groups so each person sees their own heading.
  const shownGroups = mode === "personne" ? groups : groups.filter((g) => g.lines.length > 0);
  const personItems = visible(items);

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

  useEffect(() => { setComposerOpen(false); }, [safeDate]);

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
    // Capture phase, so an open overlay is still in the DOM when overlayOpen() runs.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
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

  // A 409 means the event changed elsewhere; the local copy is refetched.
  const refetchOn409 = useCallback((e: unknown, eventId: string) => {
    if (is409(e)) api.events.get(eventId).then(replaceEvent).catch(() => undefined);
  }, [replaceEvent]);
  const writeError = useCallback((e: unknown, eventId: string, fallback: string) => {
    refetchOn409(e, eventId);
    toast({ title: is409(e) ? "Le menu a changé ailleurs, il a été rechargé" : fallback, variant: "destructive" });
  }, [refetchOn409, toast]);

  const setStatus = useCallback(async (item: DayItem, status: PrepStatus) => {
    try {
      if (item.kind === "recipe") {
        await patchLine(item.eventId, item.lineId, { prepStatus: status });
        if (status === "done") clearMiseEnPlace(item.lineId);
      } else {
        await patchTask(item.eventId, item.taskId, { prepStatus: status });
      }
    } catch (e) {
      writeError(e, item.eventId, "Erreur lors de la mise à jour du statut");
    }
  }, [patchLine, patchTask, writeError]);

  const setAllStatus = async (ls: DayItem[], status: PrepStatus) => {
    for (const l of ls) if (l.prepStatus !== status) await setStatus(l, status);
  };

  const assignItem = useCallback(async (item: DayItem, next: string[]) => {
    try {
      if (item.kind === "recipe") await patchLine(item.eventId, item.lineId, { assignedTo: next });
      else await patchTask(item.eventId, item.taskId, { assignedTo: next });
    } catch {
      toast({ title: "Erreur lors de l'attribution", variant: "destructive" });
    }
  }, [patchLine, patchTask, toast]);

  const assignAll = async (ls: DayItem[], next: string[]) => {
    for (const l of ls) await assignItem(l, next);
  };

  const moveItem = async (item: DayItem, d: string) => {
    if (d === item.date) return;
    try {
      if (item.kind === "recipe") await patchLine(item.eventId, item.lineId, { prepDate: d === item.eventDate ? null : d });
      else await patchTask(item.eventId, item.taskId, { date: d });
    } catch (e) {
      writeError(e, item.eventId, "Erreur lors du déplacement");
    }
  };

  const openCreateTask = () => {
    setTaskDialog({ mode: "create", eventId: defaultEventId, initial: { label: "", date: safeDate, eventId: defaultEventId, assignedTo: [], notes: "" } });
  };
  const openEditTask = (task: PrepTask) => {
    setTaskDialog({
      mode: "edit",
      eventId: task.eventId,
      taskId: task.taskId,
      initial: { label: task.label, date: task.date, eventId: task.eventId, assignedTo: task.ownAssignment ? task.assignedTo : [], notes: task.notes ?? "" },
    });
  };

  const submitTask = async (value: TaskDialogValue) => {
    if (!taskDialog) return;
    const eventId = taskDialog.mode === "create" ? value.eventId : taskDialog.eventId;
    try {
      if (taskDialog.mode === "create") {
        await addTask(eventId, {
          label: value.label,
          date: value.date,
          ...(value.assignedTo.length ? { assignedTo: value.assignedTo } : {}),
          ...(value.notes ? { notes: value.notes } : {}),
        });
        toast({ title: "Tâche ajoutée" });
      } else if (taskDialog.taskId) {
        await patchTask(eventId, taskDialog.taskId, { label: value.label, date: value.date, assignedTo: value.assignedTo, notes: value.notes });
        toast({ title: "Tâche enregistrée" });
      }
    } catch (e) {
      writeError(e, eventId, "Erreur lors de l'enregistrement de la tâche");
      throw e;
    }
  };

  const deleteTask = async (eventId: string, taskId: string) => {
    try {
      await removeTask(eventId, taskId);
      toast({ title: "Tâche supprimée" });
    } catch (e) {
      writeError(e, eventId, "Erreur lors de l'enregistrement de la tâche");
      throw e;
    }
  };

  const confirmDelete = async () => {
    if (!confirmTask) return;
    setBusy(true);
    try {
      await deleteTask(confirmTask.eventId, confirmTask.taskId);
      setConfirmTask(null);
    } catch {
      /* toasted */
    } finally {
      setBusy(false);
    }
  };

  // The composer toasts its own error; a 409 still refreshes the event.
  const composerAdd = async (eventId: string, label: string) => {
    try {
      await addTask(eventId, { label, date: safeDate });
    } catch (e) {
      refetchOn409(e, eventId);
      throw e;
    }
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
    const shareTitle = personId ? `${longDayLabel(safeDate)} · ${personName(people, personId)}` : longDayLabel(safeDate);
    if (navigator.share) {
      try { await navigator.share({ title: shareTitle, url }); } catch { /* cancelled */ }
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

  const setType = async (eventId: string, type: PrestationTypeSetting) => {
    setBusy(true);
    try {
      await patchEvent(eventId, { prestationType: type.key, vatRate: type.defaultVatRate });
      reload();
    } catch {
      toast({ title: "Erreur lors de l'enregistrement du type", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const closeEvent = async (eventId: string) => {
    const ev = events.find((e) => e.eventId === eventId);
    if (!ev) return;
    try {
      const costSnapshot = { ...buildCostSnapshot(ev, recipeCostById, recipePortionsById), takenAt: new Date().toISOString() };
      await patchEvent(eventId, { status: "completed", costSnapshot });
      toast({ title: "Événement terminé" });
      reload();
    } catch {
      toast({ title: "Erreur lors de la clôture", variant: "destructive" });
    }
  };

  // Checklist actions that need a sheet or a creation flow run on the week page.
  const toWeek = (checklistIntent: ChecklistIntent) => navigate(weekUrl, { state: { openChecklist: true, checklistIntent } });

  if (!valid) return <Navigate to={`/semaine/${isoWeekOf(todayIso())}`} replace />;

  const prepUrl = (l: PrepLine) => `/events/${l.eventId}/lines/${l.lineId}${personne ? `?personne=${encodeURIComponent(personne)}` : ""}`;
  const done = items.filter((l) => l.prepStatus === "done").length;
  const doneText = `${done} ${done === 1 ? "faite" : "faites"}`;
  const meta = personne
    ? `${plural(items.length, "préparation")} · ${doneText}`
    : `${plural(dayEvents.length, "événement")} · ${plural(guests, "convive")} · ${plural(items.length, "préparation")} · ${doneText}`;
  const personOptions: Person[] = personne && !activePeople.some((p) => p.personId === personne)
    ? [...activePeople, { personId: personne, name: personName(people, personne), active: false }]
    : activePeople;
  const filterCount = (personne ? 1 : 0) + (hideDone ? 1 : 0);
  const canFinish = safeDate < today && upcoming.length > 0;
  const finishLabel = `Terminer ${upcoming.length === 1 ? "l'événement" : `les ${upcoming.length} événements`}`;
  const personQuery = personne ? `?personne=${encodeURIComponent(personne)}` : "";
  const newEventUrl = `/events/new?date=${safeDate}&retour=${encodeURIComponent(here)}`;
  const printWeekUrl = `/semaine/${week}/imprimer${personQuery}`;

  const eventLabel = (ev: AppEvent) => `${shortEventName(ev, ev.clientId ? clientById.get(ev.clientId) : undefined)} · ${shortDayLabel(ev.date)}`;
  // Create offers the week's events; edit shows the task's own event, which a task cannot leave.
  const dialogEvents = taskDialog?.mode === "edit"
    ? [eventById.get(taskDialog.eventId)].filter((ev): ev is AppEvent => !!ev).map((ev) => ({ eventId: ev.eventId, label: eventLabel(ev) }))
    : weekEvents.map((ev) => ({ eventId: ev.eventId, label: eventLabel(ev) }));
  const dialogTaskId = taskDialog?.mode === "edit" ? taskDialog.taskId : undefined;
  const dialogEventId = taskDialog?.eventId ?? "";

  // Second line of a row: the category in "Événement" mode, the event first elsewhere.
  const secondOf = (item: DayItem, byEvent: boolean): string => {
    if (item.kind === "task") {
      return [byEvent ? "Tâche" : `${item.clientName ?? item.eventName} · tâche`, item.notes].filter(Boolean).join(" · ");
    }
    const parts = byEvent
      ? [item.course, item.notes]
      : [item.clientName ?? item.eventName, item.moved ? `pour ${shortDayLabel(item.eventDate)}` : null, item.course, item.notes];
    return parts.filter(Boolean).join(" · ");
  };

  const renderItem = (item: DayItem, second: string, assignable: boolean) => {
    const onAssign = assignable && activePeople.length > 0 ? (next: string[]) => assignItem(item, next) : undefined;
    if (item.kind === "recipe") {
      return (
        <LineRow
          key={item.lineId}
          line={item}
          people={people}
          to={prepUrl(item)}
          from={here}
          second={second}
          onStatus={(s) => setStatus(item, s)}
          onCycle={() => setStatus(item, NEXT_STATUS[item.prepStatus])}
          onAssign={onAssign}
          days={weekDates}
          onMove={(d) => moveItem(item, d)}
        />
      );
    }
    return (
      <TaskRow
        key={item.taskId}
        task={item}
        people={people}
        second={second}
        onStatus={(s) => setStatus(item, s)}
        onCycle={() => setStatus(item, NEXT_STATUS[item.prepStatus])}
        onAssign={onAssign}
        onEdit={() => openEditTask(item)}
        onDelete={() => setConfirmTask(item)}
        days={weekDates}
        onMove={(d) => moveItem(item, d)}
      />
    );
  };

  const actionItems = (
    <>
      {canAddTask && (
        <>
          <MenuItem icon={<Plus />} onSelect={openCreateTask}>Ajouter une tâche…</MenuItem>
          <MenuSeparator />
        </>
      )}
      <MenuItem icon={<ShoppingCart />} disabled={busy} onSelect={createGrocery}>Courses du jour</MenuItem>
      <MenuItem icon={<Printer />} onSelect={() => window.print()}>Imprimer</MenuItem>
      {activePeople.length > 0 && !personne && (
        <MenuItem icon={<Printer />} onSelect={() => { setParam("mode", "personne"); setPrintPending(true); }}>Imprimer par personne</MenuItem>
      )}
      <MenuItem icon={<Printer />} to={printWeekUrl}>Imprimer la semaine…</MenuItem>
      {personne ? (
        <MenuItem icon={<Share2 />} onSelect={() => share(personne)}>Partager…</MenuItem>
      ) : activePeople.length > 0 ? (
        activePeople.map((p) => <MenuItem key={p.personId} icon={<Share2 />} onSelect={() => share(p.personId)}>Partager · {p.name}</MenuItem>)
      ) : (
        <MenuItem icon={<Share2 />} onSelect={() => share()}>Partager…</MenuItem>
      )}
      {canFinish && (
        <>
          <MenuSeparator />
          <MenuItem icon={<CheckCircle2 />} disabled={busy} onSelect={finishEvents}>{finishLabel}</MenuItem>
        </>
      )}
    </>
  );

  // Compact (touch or under md): the ⋯ menu also carries the grouping and the filters.
  const touchFilterItems = (
    <>
      {!personne && mode !== "personne" && (
        <MenuSection label="Grouper">
          {GROUP_OPTIONS.map((o) => (
            <MenuRadio key={o.value} checked={mode === o.value} onSelect={() => setParam("mode", o.value === "evenement" ? null : o.value)}>{o.label}</MenuRadio>
          ))}
        </MenuSection>
      )}
      {personOptions.length > 0 && (
        <MenuSection label="Personne">
          <MenuRadio checked={!personne} onSelect={() => setParam("personne", null)}>Toutes les personnes</MenuRadio>
          {personOptions.map((p) => (
            <MenuRadio key={p.personId} checked={personne === p.personId} onSelect={() => setParam("personne", p.personId)}>{p.name}</MenuRadio>
          ))}
        </MenuSection>
      )}
      <MenuCheck icon={<EyeOff />} checked={hideDone} onChange={(v) => setParam("masquer", v ? "faites" : null)}>Masquer les lignes faites</MenuCheck>
      <MenuSeparator />
    </>
  );

  const moreMenu = (
    <div ref={menu.ref} className="relative inline-flex">
      <IconButton size="sm" aria-label="Plus d'actions" aria-haspopup="menu" aria-expanded={menu.open} onClick={menu.toggle} icon={<MoreHorizontal />} />
      <Menu {...menu.props} align="right" title={longDayLabel(safeDate)} aria-label="Plus d'actions">
        {compact && touchFilterItems}
        {actionItems}
      </Menu>
    </div>
  );

  const groupPill = !personne && mode !== "personne" && (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground touch:hidden">
      <span>Grouper :</span>
      <SelectPill
        value={mode}
        options={GROUP_OPTIONS}
        colour="gray"
        onChange={(v) => setParam("mode", v === "evenement" ? null : v)}
        aria-label="Regroupement"
        title="Grouper par"
      />
    </span>
  );

  const filterChips = filterCount > 0 ? (
    <>
      {personne && <FilterChip onRemove={() => setParam("personne", null)}>{personName(people, personne)}</FilterChip>}
      {hideDone && <FilterChip onRemove={() => setParam("masquer", null)}>Lignes faites masquées</FilterChip>}
    </>
  ) : undefined;

  const empty = !loading && !error && items.length === 0;
  const showAddTask = !loading && !error && !personne && canAddTask;

  const bar = (
    <PlanningBar
      view={mode === "personne" ? "personne" : "day"}
      weekHref={weekUrl}
      dayHref={`/jour/${safeDate}${personQuery}${hideDone ? `${personQuery ? "&" : "?"}masquer=faites` : ""}`}
      personHref={activePeople.length > 0 && !personne ? `/jour/${safeDate}?mode=personne${hideDone ? "&masquer=faites" : ""}` : undefined}
      dateLabel={<><span className="hidden md:inline">Semaine {weekNumber} · </span>{navLabel(safeDate)}</>}
      onPrev={() => navigate(dayUrl(addDays(safeDate, -1)), { state: location.state })}
      onNext={() => navigate(dayUrl(addDays(safeDate, 1)), { state: location.state })}
      onPick={(d) => navigate(dayUrl(d), { state: location.state })}
      pickValue={safeDate}
      isToday={safeDate === today}
      onToday={() => navigate(dayUrl(today), { state: location.state })}
      right={compact ? (
        <span className="flex items-center gap-0.5 touch:-mr-1">{moreMenu}<IconButton variant="primary" size="sm" as={Link} to={newEventUrl} aria-label="Nouvel événement" title="Nouvel événement" icon={<Plus />} /></span>
      ) : (
        <>
          {groupPill}
          <FilterButton count={filterCount} onClear={() => setParams({ personne: null, masquer: null })}>
            {personOptions.length > 0 && (
              <FilterGroup
                label="Personne"
                name="personne"
                kind="radio"
                value={personne}
                onChange={(v) => setParam("personne", v || null)}
                options={[{ value: "", label: "Toutes les personnes" }, ...personOptions.map((p) => ({ value: p.personId, label: p.name }))]}
                renderOption={(o) => o.value ? <span className="inline-flex items-center gap-2"><PersonChip personId={o.value} people={people} size="sm" />{o.label}</span> : o.label}
              />
            )}
            <FilterGroup
              name="masquer"
              kind="check"
              value={hideDone ? ["faites"] : []}
              onChange={(v) => setParam("masquer", v.includes("faites") ? "faites" : null)}
              options={[{ value: "faites", label: "Masquer les lignes faites" }]}
            />
          </FilterButton>
          {moreMenu}
          <Button variant="primary" size="sm" as={Link} to={newEventUrl} icon={<Plus />}>Nouvel événement</Button>
        </>
      )}
      filters={filterChips}
      dates={weekDates}
      counts={counts}
      today={today}
      selected={safeDate}
      stripHref={dayUrl}
      linkState={location.state}
    />
  );

  // The same callouts as the week; three actions need its sheets and run there.
  const callouts = !loading && (
    <>
      <FirstRunCallout hidden={Boolean(personne)} />
      <WeekChecklist
        items={summary.checklist}
        firstRun={firstRun}
        open={checklistOpen}
        onToggle={() => setChecklistOpen((o) => !o)}
        from={here}
        monday={weekDates[0]}
        weekNo={weekNumber}
        prestationTypes={prestationTypes}
        coveringList={summary.coveringList}
        busy={busy}
        onSetType={setType}
        onCloseEvent={closeEvent}
        onAssign={() => toWeek({ kind: "assign" })}
        onCreateClientWeek={(clientId, guestCount) => toWeek({ kind: "client_week", clientId, guestCount })}
        onCreateGroceries={(eventIds) => toWeek({ kind: "groceries", eventIds })}
      />
    </>
  );

  const heads = (
    <DayHeads
      dates={weekDates}
      plan={loading ? undefined : plan}
      started={started}
      today={today}
      selected={safeDate}
      href={dayUrl}
      closeHref={weekUrl}
      state={location.state}
      newEventHref={(d) => `/events/new?date=${d}&retour=${encodeURIComponent(here)}`}
      people={people}
      selectedPerson={personne}
      onPersonFilter={(id) => setParam("personne", personne === id ? null : id)}
    />
  );

  return (
    <PlanningFrame
      weekNo={weekNumber}
      titleSuffix={` · ${title}`}
      meta={personne ? `${personName(people, personne)} · ${meta}` : <WeekMeta weekTotals={summary.weekTotals} started={started} monthLink={summary.monthLink} state={{ from: here }} />}
      bar={bar}
      error={error}
      callouts={callouts}
      heads={heads}
      className="pb-24 print:max-w-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* A short day keeps the week scroll offset, so the heads row stays put on the way back. */}
      <div className="mt-3 max-w-doc xl:min-h-screen">
        <h2 className="text-h3 print:text-h1">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">{meta}</p>
        {loading && <p className="mt-6 text-sm text-muted-foreground">Chargement…</p>}
        {empty && !personne && (
          <>
            <p className="mt-4 text-sm text-muted-foreground touch:text-base">Aucune préparation ce jour.</p>
            <Button variant="ghost" size="sm" as={Link} to={newEventUrl} icon={<Plus />} className="mt-1 justify-start text-muted-foreground">Nouvel événement</Button>
          </>
        )}
        {empty && personne && serviceEvents.length === 0 && (
          <>
            <p className="mt-4 text-sm text-muted-foreground touch:text-base">Aucune préparation pour {personName(people, personne)} ce jour.</p>
            <p className="mt-1">
              <Button variant="link" size="sm" as={Link} to={`/jour/${safeDate}`}>Toutes les personnes</Button>
            </p>
          </>
        )}
        {!loading && !error && items.length > 0 && (personne ? personItems.length === 0 : groups.every((g) => g.lines.length === 0)) && (
          <p className="mt-6 text-sm text-muted-foreground touch:text-base">Tout est fait.</p>
        )}

        {personne ? (
          <>
            {personItems.length > 0 && (
              <ul className="mt-4">
                {personItems.map((item) => renderItem(item, secondOf(item, false), false))}
              </ul>
            )}
            {serviceEvents.length > 0 && (
              <section className="mt-6">
                <h3 className="text-h3">Service</h3>
                <ul className="mt-2">
                  {serviceEvents.map((ev) => (
                    <li key={ev.eventId}>
                      <Link to={`/events/${ev.eventId}`} state={{ from: here }} className="flex min-h-9 items-center gap-3 rounded px-2 text-sm hover:bg-hover touch:min-h-11 touch:text-base">
                        <span className="min-w-0 flex-1">
                          {[shortEventName(ev, ev.clientId ? clientById.get(ev.clientId) : undefined), plural(ev.guestCount, "convive"), prestationLabel(settings, ev.prestationType)].filter(Boolean).join(" · ")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {!(empty && serviceEvents.length === 0) && (
              <p className="no-print mt-6">
                <Button variant="link" size="sm" as={Link} to={`/jour/${safeDate}${hideDone ? "?masquer=faites" : ""}`}>Toutes les personnes</Button>
              </p>
            )}
          </>
        ) : (
          shownGroups.map((group, i) => (
            <section key={group.key} className={i > 0 ? "mt-6 print-break" : "mt-6"}>
              <header className="sticky top-[96px] z-[15] bg-background py-2 md:top-0">
                <div className="flex min-h-7 items-center gap-3">
                  <h3 className={`flex min-w-0 items-center gap-2 text-h3 ${group.tag ? "flex-wrap" : ""}`}>
                    {mode === "personne" && group.personId && <PersonChip personId={group.personId} people={people} size="md" />}
                    <span className="min-w-0 truncate">{group.title}</span>
                    {group.tag && <Tag colour="gray" className="shrink-0">{group.tag}</Tag>}
                  </h3>
                  <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{group.count}</span>
                  {mode === "personne" && group.personId && (
                    <>
                      <Button variant="ghost" size="sm" aria-label={`Partager la liste de ${group.title}`} className="no-print ml-auto hidden md:inline-flex" onClick={() => share(group.personId ?? undefined)} icon={<Share2 />}>Partager</Button>
                      <IconButton variant="ghost" size="sm" aria-label={`Partager la liste de ${group.title}`} className="no-print ml-auto md:hidden" onClick={() => share(group.personId ?? undefined)} icon={<Share2 />} />
                    </>
                  )}
                  {mode === "personne" && group.personId === null && (
                    <GroupAssign people={activePeople} onChange={(next) => assignAll(group.lines, next)} className="ml-auto" />
                  )}
                </div>
                {group.subtitle && <p className="text-sm text-muted-foreground">{group.subtitle}</p>}
              </header>

              {group.lines.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">Rien ce jour.</p>
              ) : mode === "recette" && group.key !== TASKS_KEY ? (
                <RecipeGroupBody group={group} lines={group.lines.filter(isLine)} people={people} ingredientById={ingredientById} prepUrl={prepUrl} from={here} onStatus={(s) => setAllStatus(group.lines, s)} />
              ) : (
                <ul>
                  {group.lines.map((item) => renderItem(item, secondOf(item, mode === "evenement"), true))}
                </ul>
              )}
            </section>
          ))
        )}

        {showAddTask && (
          <div className="no-print mt-4">
            {composerOpen && !touch ? (
              <TaskComposer
                date={safeDate}
                events={weekEvents}
                clientById={clientById}
                defaultEventId={defaultEventId}
                onAdd={composerAdd}
                onClose={() => setComposerOpen(false)}
              />
            ) : (
              <Button variant="ghost" size="sm" icon={<Plus />} className="text-muted-foreground" onClick={() => (touch ? openCreateTask() : setComposerOpen(true))}>
                Tâche
              </Button>
            )}
          </div>
        )}
      </div>

      <TaskDialog
        open={taskDialog !== null}
        onClose={() => setTaskDialog(null)}
        mode={taskDialog?.mode ?? "create"}
        initial={taskDialog?.initial ?? EMPTY_TASK}
        events={dialogEvents}
        people={people}
        onSubmit={submitTask}
        onDelete={dialogTaskId ? () => deleteTask(dialogEventId, dialogTaskId) : undefined}
      />

      <Dialog
        open={confirmTask !== null}
        onClose={() => setConfirmTask(null)}
        title={`Supprimer la tâche « ${confirmTask?.label ?? ""} » ?`}
        size="sm"
        aria-label="Supprimer la tâche"
        footer={(
          <>
            <Button variant="default" size="md" onClick={() => setConfirmTask(null)} disabled={busy}>Annuler</Button>
            <Button variant="danger" size="md" onClick={() => void confirmDelete()} disabled={busy}>Supprimer</Button>
          </>
        )}
      >
        <p className="text-muted-foreground">Cette action est irréversible.</p>
      </Dialog>

      {notice && (
        <div role="status" className="no-print fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-lg bg-background px-4 py-3 shadow-dialog">
          <span className="min-w-0 flex-1 text-sm font-medium touch:text-base">Fait : {notice.name}</span>
          {notice.next ? (
            <Button variant="primary" size="md" as={Link} to={prepUrl(notice.next)}>Suivante</Button>
          ) : (
            <span className="text-sm text-muted-foreground">Tout est fait</span>
          )}
          <IconButton size="sm" aria-label="Fermer" onClick={() => setNotice(null)} icon={<X />} />
        </div>
      )}
      {busy && <span className="sr-only" aria-live="polite">Enregistrement…</span>}
    </PlanningFrame>
  );
}

interface RowMenuProps {
  name: string;
  eventDate: string;
  current: string;
  days: string[];
  onMove: (date: string) => void;
  // Items placed before and after « Déplacer au… ».
  before?: ActionMenuItem[];
  after?: ActionMenuItem[];
}

// The row ⋯; « Déplacer au… » opens the day list under the same button.
function RowMenu({ name, eventDate, current, days, onMove, before = [], after = [] }: RowMenuProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const items: ActionMenuItem[] = [...before, { label: "Déplacer au…", icon: <CalendarDays />, onClick: () => setMoveOpen(true) }, ...after];
  return (
    <span ref={ref} className={`no-print relative inline-flex shrink-0 ${moveOpen ? "z-30" : "z-10 hover:z-30 focus-within:z-30"}`}>
      <ActionMenu items={items} className="reveal" aria-label={`Actions · ${name}`} title={name} />
      <MoveToDayMenu
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        anchorRef={ref}
        align="right"
        title={`Déplacer « ${name} »`}
        eventDate={eventDate}
        current={current}
        days={days}
        onPick={(d) => { setMoveOpen(false); onMove(d); }}
      />
    </span>
  );
}

interface ItemAssignProps {
  item: DayItem;
  people: Person[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (next: string[]) => void;
  title: string;
}

// Chips of a row; tap opens the picker, "Comme l'événement" clears the override.
function ItemAssign({ item, people, open, onOpen, onClose, onChange, title }: ItemAssignProps) {
  return (
    <span className={`relative inline-flex shrink-0 text-foreground ${open ? "z-20" : "z-10"}`}>
      <PersonChips personIds={item.assignedTo} people={people} size="sm" inherited={!item.ownAssignment} onClick={onOpen} className="no-print" />
      <span className="hidden print:inline"><PersonChips personIds={item.assignedTo} people={people} size="sm" /></span>
      {open && (
        <PersonPicker
          value={item.ownAssignment ? item.assignedTo : []}
          options={people}
          onChange={onChange}
          allowInherit
          onClose={onClose}
          align="right"
          title={title}
        />
      )}
    </span>
  );
}

interface LineRowProps {
  line: PrepLine;
  people: Person[];
  to: string;
  from: string;
  second: string;
  onStatus: (s: PrepStatus) => void;
  onCycle: () => void;
  onAssign?: (next: string[]) => void;
  days: string[];
  onMove: (date: string) => void;
}

// One prep line: the pill on pointer screens, the dot on touch; the whole row links to the fiche.
function LineRow({ line, people, to, from, second, onStatus, onCycle, onAssign, days, onMove }: LineRowProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isDone = line.prepStatus === "done";
  const assign: ActionMenuItem[] = onAssign ? [{ label: "Assigner", icon: <UserPlus />, onClick: () => setPickerOpen(true) }] : [];
  return (
    <li className={`group relative flex min-h-9 items-center gap-2 rounded px-2 hover:bg-hover touch:min-h-11 ${isDone ? "text-muted-foreground" : ""}`}>
      <div className={`no-print ${ABOVE} hidden w-[108px] shrink-0 pointer:block`}>
        <StatusControl value={line.prepStatus} onChange={onStatus} />
      </div>
      <StatusDot className={`no-print ${ABOVE} -ml-2 pointer:hidden`} value={line.prepStatus} onCycle={onCycle} />
      <span className="hidden print:inline-block"><Dot status={line.prepStatus} /></span>
      <Link to={to} state={{ from }} className="flex min-h-9 min-w-0 flex-1 items-center py-1 before:absolute before:inset-0 before:rounded touch:min-h-11">
        <span className="min-w-0 flex-1">
          <span className="block text-base">{line.recipeName}</span>
          {second && <span className="block text-sm text-muted-foreground">{second}</span>}
        </span>
      </Link>
      {onAssign ? (
        <ItemAssign item={line} people={people} open={pickerOpen} onOpen={() => setPickerOpen(true)} onClose={() => setPickerOpen(false)} onChange={onAssign} title="Assigner la ligne" />
      ) : (
        <PersonChips personIds={line.assignedTo} people={people} size="sm" inherited={!line.ownAssignment} className={ABOVE} />
      )}
      <span className={`${ABOVE} shrink-0 text-sm tabular-nums`}>{line.portions}</span>
      <RowMenu name={line.recipeName} eventDate={line.eventDate} current={line.date} days={days} onMove={onMove} after={assign} />
    </li>
  );
}

interface TaskRowProps {
  task: PrepTask;
  people: Person[];
  second: string;
  onStatus: (s: PrepStatus) => void;
  onCycle: () => void;
  onAssign?: (next: string[]) => void;
  onEdit: () => void;
  onDelete: () => void;
  days: string[];
  onMove: (date: string) => void;
}

// One task: same row as a line without portions; the whole row opens the edit dialog.
function TaskRow({ task, people, second, onStatus, onCycle, onAssign, onEdit, onDelete, days, onMove }: TaskRowProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isDone = task.prepStatus === "done";
  const after: ActionMenuItem[] = [
    ...(onAssign ? [{ label: "Assigner", icon: <UserPlus />, onClick: () => setPickerOpen(true) } as ActionMenuItem] : []),
    { kind: "separator" },
    { label: "Supprimer", icon: <Trash2 />, variant: "danger", onClick: onDelete },
  ];
  return (
    <li className={`group relative flex min-h-9 items-center gap-2 rounded px-2 hover:bg-hover touch:min-h-11 ${isDone ? "text-muted-foreground" : ""}`}>
      <div className={`no-print ${ABOVE} hidden w-[108px] shrink-0 pointer:block`}>
        <StatusControl value={task.prepStatus} onChange={onStatus} />
      </div>
      <StatusDot className={`no-print ${ABOVE} -ml-2 pointer:hidden`} value={task.prepStatus} onCycle={onCycle} />
      <span className="hidden print:inline-block"><Dot status={task.prepStatus} /></span>
      <button type="button" onClick={onEdit} title={task.label} className="flex min-h-9 min-w-0 flex-1 items-center py-1 text-left before:absolute before:inset-0 before:rounded touch:min-h-11">
        <span className="min-w-0 flex-1">
          <span className="block text-base">{task.label}</span>
          {second && <span className="block text-sm text-muted-foreground">{second}</span>}
        </span>
      </button>
      {onAssign ? (
        <ItemAssign item={task} people={people} open={pickerOpen} onOpen={() => setPickerOpen(true)} onClose={() => setPickerOpen(false)} onChange={onAssign} title="Assigner la tâche" />
      ) : (
        <PersonChips personIds={task.assignedTo} people={people} size="sm" inherited={!task.ownAssignment} className={ABOVE} />
      )}
      <RowMenu
        name={task.label}
        eventDate={task.eventDate}
        current={task.date}
        days={days}
        onMove={onMove}
        before={[{ label: "Modifier…", icon: <Pencil />, onClick: onEdit }]}
        after={after}
      />
    </li>
  );
}

// "Assigner tout" on the Sans personne heading; every toggle writes the whole group.
function GroupAssign({ people, onChange, className }: { people: Person[]; onChange: (next: string[]) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string[]>([]);
  return (
    <span className={`no-print relative inline-flex shrink-0 ${open ? "z-20" : ""} ${className ?? ""}`}>
      <Button variant="link" size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>Assigner tout</Button>
      {open && (
        <PersonPicker
          value={value}
          options={people}
          onChange={(next) => { setValue(next); onChange(next); }}
          onClose={() => setOpen(false)}
          align="right"
          title="Assigner les lignes"
        />
      )}
    </span>
  );
}

interface RecipeGroupBodyProps {
  group: Group;
  lines: PrepLine[];
  people: Person[];
  ingredientById: Map<string, Ingredient>;
  prepUrl: (l: PrepLine) => string;
  from: string;
  onStatus: (s: PrepStatus) => void;
}

function RecipeGroupBody({ group, lines, people, ingredientById, prepUrl, from, onStatus }: RecipeGroupBodyProps) {
  const merged = mergedStatus(lines);
  const scaled = group.recipe ? scaledIngredients(group.recipe, lines, ingredientById) : [];
  const total = group.total ?? lines.reduce((n, l) => n + l.portions, 0);
  const isDone = merged === "done";

  return (
    <div className={isDone ? "text-muted-foreground" : ""}>
      <div className="no-print mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        <span>Statut</span>
        <StatusControl value={merged} onChange={onStatus} />
      </div>
      <ul className="mt-2">
        {lines.map((line) => (
          <li key={line.lineId}>
            <Link to={prepUrl(line)} state={{ from }} className="flex min-h-9 items-center gap-2 rounded px-2 text-sm hover:bg-hover touch:min-h-11 touch:text-base">
              <Dot status={line.prepStatus} />
              <span className="min-w-0 flex-1">
                {line.clientName ?? line.eventName}
                {line.moved && <span className="text-muted-foreground"> · pour {shortDayLabel(line.eventDate)}</span>}
                <span className="text-muted-foreground"> · {STATUS_LABEL[line.prepStatus]}</span>
                {line.notes && <span className="block text-sm text-muted-foreground">{line.notes}</span>}
              </span>
              <PersonChips personIds={line.assignedTo} people={people} size="sm" inherited={!line.ownAssignment} />
              <span className="shrink-0 tabular-nums">{line.portions}</span>
            </Link>
          </li>
        ))}
      </ul>
      {group.recipe && (
        <>
          <div className="no-print">
            <SectionToggle title={`Ingrédients pour ${total}`} className="!mt-3">
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
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Aucun ingrédient.</p>;
  return (
    <ul className="text-base">
      {items.map((it, i) => {
        const q = fmtQty(it.qty, it.unit);
        return (
          <li key={`${it.name}-${it.unit}-${i}`} className="flex min-h-8 items-center justify-between gap-4 touch:min-h-11">
            <span className="min-w-0">{it.name}</span>
            <span className="shrink-0 font-medium tabular-nums">
              {q.value} <span className="font-normal text-muted-foreground">{q.unit}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
