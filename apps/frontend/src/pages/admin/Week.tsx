import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronRight, EyeOff, FileText, GripVertical, MessageSquare, MoreHorizontal, Pencil, Plus, Printer, Share2, ShoppingCart, Trash2, UserPlus, X } from "lucide-react";
import type { AppEvent, Client, EventRecipeLine, EventTask, Person, PrepStatus, PrestationTypeSetting, WeekMovedIn } from "@packages/types";
import {
  addDays,
  assigneesOf,
  buildCostSnapshot,
  calcRecipeCost,
  datesOfIsoWeek,
  dayLabel,
  DEFAULT_PRESTATION_TYPES,
  fmtTime,
  isoWeekOf,
  longDayLabel,
  movedOutLines,
  ownDayLines,
  parseIsoWeek,
  parseYmd,
  personName,
  prepDateOf,
  shortDayLabel,
  shortEventName,
  sortEventLines,
  tasksOf,
  tasksOn,
  rangeLabel,
  weekdayOf,
  weekPlan,
} from "@packages/types";
import { api, ApiError, invalidate, errorReason } from "@/lib/api";
import { openAssistant } from "@/lib/assistant-compose";
import { publishAssistantSelection } from "@/lib/assistant-context";
import { todayIso } from "@/lib/dates";
import { buildGroceryItems, groceryTitleFor } from "@/lib/grocery";
import { defaultTaskEventId } from "@/lib/tasks";
import { readTour, writeTour } from "@/lib/tour-storage";
import { dayHeaderMeta, NEXT_STATUS, plural, usePlanningData } from "@/lib/use-planning-data";
import { weekSummary, type ChecklistIntent, type WeekLinkState } from "@/lib/week-summary";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useLongPressDrag, type LongPressDrag, type LongPressDragHandlers } from "@/hooks/use-long-press-drag";
import { useToast } from "@/hooks/use-toast";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useAssistantEnabled, useFullBleed, useTopTitle } from "@/components/admin/AdminLayout";
import { StatusDot } from "@/components/admin/StatusDot";
import PersonChips, { PersonChip } from "@/components/admin/PersonChips";
import PersonPicker from "@/components/admin/PersonPicker";
import WeekChecklist from "@/components/admin/WeekChecklist";
import AssignSheet from "@/components/admin/AssignSheet";
import PlanningBar from "@/components/admin/PlanningBar";
import PlanningFrame from "@/components/admin/PlanningFrame";
import DayHeads from "@/components/admin/DayHeads";
import DragGhost from "@/components/admin/DragGhost";
import WeekMeta from "@/components/admin/WeekMeta";
import FirstRunCallout from "@/components/admin/FirstRunCallout";
import MoveToDayMenu from "@/components/admin/MoveToDayMenu";
import TaskComposer from "@/components/admin/TaskComposer";
import TaskDialog, { type TaskDialogValue } from "@/components/admin/TaskDialog";
import { OPEN_CHECKLIST_EVENT } from "@/components/admin/tour-steps";
import { useTour } from "@/components/admin/TourProvider";
import {
  ActionMenu, Button, Dialog, FieldLabel, FilterButton, FilterChip, FilterGroup, IconButton,
  Menu, MenuCheck, MenuItem, MenuRadio, MenuSection, MenuSeparator, useMenu,
  type ActionMenuItem,
} from "@/components/ui";

const SWIPE_PX = 60;
const LAST_WEEK_KEY = "recipe-book:last-week";

type WeekView = "lines" | "events";

// A line or a task being dragged or moved; `current` is its prep day today.
type DragItem = { kind: "recipe" | "task"; eventId: string; id: string; eventDate: string; current: string; label: string; status: PrepStatus };

// The row whose « Déplacer au… » Sheet opens after a touch release off every day cell.
type MoveRequest = { kind: DragItem["kind"]; id: string };

const DRAG_HINT = "Maintenez une préparation pour la glisser vers un autre jour. Déplacer au… reste dans le menu ⋯.";

type TaskDialogState = { mode: "create" | "edit"; eventId: string; taskId?: string; initial: TaskDialogValue };

const dayMonthShort = new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "short", timeZone: "UTC" });

// Row actions of the seven-column grid reveal on the row, not on the column, so the column `group` is not reused.
const ROW_REVEAL = "pointer:opacity-0 pointer:group-hover/row:opacity-100 pointer:group-focus-within/row:opacity-100 touch:opacity-100";
const CAPTION_ROW = "flex h-7 items-center px-1 text-caption text-muted-foreground";

// "19 au 25 oct.", "28 sept. au 4 oct."
function shortRange(from: string, to: string): string {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${dayMonthShort.format(a)} au ${dayMonthShort.format(b)}`;
  return `${a.getUTCDate()} au ${dayMonthShort.format(b)}`;
}

function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
}

// The tap's click lands after pointerup, on the Sheet backdrop by then, so it is dropped before React sees it.
function swallowNextClick(ms = 400) {
  const stop = () => { document.removeEventListener("click", swallow, true); window.clearTimeout(timer); };
  const swallow = (e: Event) => { e.preventDefault(); e.stopPropagation(); stop(); };
  const timer = window.setTimeout(stop, ms);
  document.addEventListener("click", swallow, true);
}

function lineStatus(line: EventRecipeLine): PrepStatus {
  return line.prepStatus ?? "todo";
}

function doneCount(ev: AppEvent): number {
  return ev.recipes.filter((l) => l.prepStatus === "done").length;
}

function byDateThenName(a: AppEvent, b: AppEvent): number {
  return a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "fr");
}

// Moved-out lines and tasks that fall outside the displayed week, counted per day.
function outsideDays(ev: AppEvent, dates: string[]): { date: string; count: number }[] {
  const byDate = new Map<string, number>();
  for (const l of movedOutLines(ev)) {
    const d = prepDateOf(l, ev);
    if (!dates.includes(d)) byDate.set(d, (byDate.get(d) ?? 0) + 1);
  }
  for (const t of tasksOf(ev)) {
    if (!dates.includes(t.date)) byDate.set(t.date, (byDate.get(t.date) ?? 0) + 1);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
}

export default function Week() {
  const { isoWeek = "" } = useParams<{ isoWeek: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  useFullBleed(true);

  const valid = /^\d{4}-W\d{2}$/.test(isoWeek);
  const today = todayIso();
  const safeWeek = valid ? isoWeek : isoWeekOf(today);
  const dates = useMemo(() => datesOfIsoWeek(safeWeek), [safeWeek]);
  const monday = dates[0];
  const year = dates[3].slice(0, 4);
  const weekNo = parseIsoWeek(safeWeek).week;
  const prevWeek = isoWeekOf(addDays(monday, -7));
  const nextWeek = isoWeekOf(addDays(monday, 7));
  const todayWeek = isoWeekOf(today);
  const started = monday <= today;
  const todayInWeek = dates.includes(today);
  const from = location.pathname + location.search;
  const search = location.search;
  useTopTitle(`Semaine ${weekNo}`);
  const assistant = useAssistantEnabled();

  // The Monday stands for the week in the assistant's context.
  useEffect(() => {
    publishAssistantSelection({ date: monday, label: `Semaine ${weekNo}` });
  }, [monday, weekNo]);

  const data = usePlanningData(year, { withLists: true });
  const {
    events, clients, clientsConfigured, settings, entries, ledgerConfigured, groceryLists, people,
    recipeById, clientById, ingredientById, recipes, courses, loading, error,
    patchLine, patchEvent, addTask, patchTask, removeTask, reload,
  } = data;

  const selectedClient = searchParams.get("client") ?? "";
  const selectedPerson = searchParams.get("personne") ?? "";
  const hideDone = searchParams.get("masquer") === "faites";
  const setParam = (key: "client" | "personne" | "masquer", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  };
  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("client");
    next.delete("personne");
    next.delete("masquer");
    setSearchParams(next, { replace: true });
  };

  const [view, setView] = useLocalStorage<WeekView>("recipe-book:week-view", "lines");
  const [checklistOpen, setChecklistOpen] = useLocalStorage<boolean>("recipe-book:checklist-open", true);
  const [sheet, setSheet] = useState<{ client: Client; guestCount: number } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [taskDialog, setTaskDialog] = useState<TaskDialogState | null>(null);
  const [confirmTask, setConfirmTask] = useState<{ eventId: string; taskId: string; label: string } | null>(null);
  const [composerDay, setComposerDay] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragItem | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null);
  const [dragHint, setDragHint] = useState(false);
  const touch = useTouchScreen();
  // Under md the full right group wraps and overflows, so narrow pointer windows get the touch group.
  const narrow = useMediaQuery("(max-width: 767px)");
  const compact = touch || narrow;
  const { active: tourActive, seenAt, dismissedOffer } = useTour();
  const menu = useMenu();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const dayRefs = useRef<Record<string, HTMLElement | null>>({});

  const activePeople = useMemo(() => people.filter((p) => p.active), [people]);
  const firstRun = !loading && recipes.length === 0 && events.length === 0 && activePeople.length === 0;
  const prestationTypes: PrestationTypeSetting[] = settings?.prestationTypes?.length ? settings.prestationTypes : DEFAULT_PRESTATION_TYPES;
  const clientOf = (ev: AppEvent) => (ev.clientId ? clientById.get(ev.clientId) : undefined);

  const weekEvents = useMemo(
    () => events.filter((e) => e.date.slice(0, 10) >= dates[0] && e.date.slice(0, 10) <= dates[6]),
    [events, dates],
  );
  const weekEventsSorted = useMemo(() => [...weekEvents].sort(byDateThenName), [weekEvents]);
  const clientsThisWeek = useMemo(
    () => clients.filter((c) => weekEvents.some((e) => e.clientId === c.clientId)),
    [clients, weekEvents],
  );
  // Every event, so a line moved into this week from another week renders; the plan keeps the week's days.
  const filteredEvents = useMemo(
    () => (selectedClient ? events.filter((e) => e.clientId === selectedClient) : events),
    [events, selectedClient],
  );
  const weekFilteredEvents = useMemo(
    () => (selectedClient ? weekEvents.filter((e) => e.clientId === selectedClient) : weekEvents),
    [weekEvents, selectedClient],
  );
  const plan = useMemo(() => weekPlan(filteredEvents, monday, people), [filteredEvents, monday, people]);
  const summary = useMemo(
    () => weekSummary({ isoWeek: safeWeek, today, events, clients, clientsConfigured, groceryLists, entries, ledgerConfigured, people, settings }),
    [safeWeek, today, events, clients, clientsConfigured, groceryLists, entries, ledgerConfigured, people, settings],
  );
  const { weekTotals, monthLink, checklist, coveringList } = summary;
  const recipeCostById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, calcRecipeCost(r, ingredientById)])), [recipes, ingredientById]);
  const recipePortionsById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r.portions || 1])), [recipes]);

  // The sidebar "Semaine" link returns here.
  useEffect(() => {
    if (valid) sessionStorage.setItem(LAST_WEEK_KEY, from);
  }, [valid, from]);

  const weekUrl = useCallback((w: string) => `/semaine/${w}${search}`, [search]);
  const retour = encodeURIComponent(`/semaine/${safeWeek}`);
  const newEventUrl = (date: string) => `/events/new?date=${date}${selectedClient ? `&client=${selectedClient}` : ""}&retour=${retour}`;
  const personQuery = selectedPerson ? `?personne=${encodeURIComponent(selectedPerson)}` : "";
  // The day page reads the same person and « masquer » filters.
  const dayParams = new URLSearchParams(personQuery);
  if (hideDone) dayParams.set("masquer", "faites");
  const dayQuery = dayParams.toString() ? `?${dayParams}` : "";
  const dayUrl = (date: string) => `/jour/${date}${dayQuery}`;
  const prepUrl = (eventId: string, lineId: string) => `/events/${eventId}/lines/${lineId}${personQuery}`;
  const printUrl = `/semaine/${safeWeek}/imprimer${search}`;
  const state = { from };
  const anchorDay = todayInWeek ? today : monday;
  const linkState = location.state as WeekLinkState | null;

  // The day page sends its checklist actions here.
  useEffect(() => {
    if (linkState?.openChecklist) setChecklistOpen(true);
  }, [linkState?.openChecklist, setChecklistOpen]);

  const modalOpen = Boolean(sheet) || assignOpen || menu.open || Boolean(taskDialog) || Boolean(confirmTask);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e) || modalOpen) return;
      // Keys pressed inside the assistant sheet stay there.
      if ((e.target as Element | null)?.closest?.('[role="dialog"]')) return;
      if (e.key === "ArrowLeft") navigate(weekUrl(prevWeek));
      if (e.key === "ArrowRight") navigate(weekUrl(nextWeek));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, weekUrl, prevWeek, nextWeek, modalOpen]);

  // The guided tour opens the checklist for its second step.
  useEffect(() => {
    const open = () => setChecklistOpen(true);
    window.addEventListener(OPEN_CHECKLIST_EVENT, open);
    return () => window.removeEventListener(OPEN_CHECKLIST_EVENT, open);
  }, [setChecklistOpen]);

  // Changing week closes the composer.
  useEffect(() => { setComposerDay(null); }, [safeWeek]);

  const scrollToDay = useCallback((date: string) => {
    dayRefs.current[date]?.scrollIntoView({ block: "start" });
  }, []);

  // Phone: today is brought into view once loaded; on a Sunday looking at next week, the first day with events.
  // The tour scrolls to its own anchor, so this waits until it ends.
  // While the first-visit callout is still offered the page stays at the top so it can be seen.
  useEffect(() => {
    if (loading || tourActive || window.innerWidth >= 1280) return;
    if (!seenAt && !dismissedOffer) return;
    const target = todayInWeek ? today : weekdayOf(today) === 7 ? plan.days.find((d) => d.events.length > 0)?.date : undefined;
    if (target && target !== dates[0]) scrollToDay(target);
  }, [safeWeek, loading, tourActive]);

  const fail = (title: string) => toast({ title, variant: "destructive" });

  // A 409 means the event changed elsewhere; the list is reloaded and the caller skips its own toast.
  const conflict = (e: unknown): boolean => {
    if (!(e instanceof ApiError) || e.status !== 409) return false;
    toast({ title: "Le menu a changé ailleurs, il a été rechargé", variant: "destructive" });
    invalidate("events");
    reload();
    return true;
  };

  const cycleLine = useCallback(async (ev: AppEvent, line: EventRecipeLine) => {
    try { await patchLine(ev.eventId, line.lineId, { prepStatus: NEXT_STATUS[lineStatus(line)] }); }
    catch { fail("Erreur lors de la mise à jour du statut"); }
  }, [patchLine]);

  const cycleTask = useCallback(async (ev: AppEvent, task: EventTask) => {
    try { await patchTask(ev.eventId, task.taskId, { prepStatus: NEXT_STATUS[task.prepStatus ?? "todo"] }); }
    catch { fail("Erreur lors de la mise à jour du statut"); }
  }, [patchTask]);

  const assignEvent = useCallback(async (eventId: string, assignedTo: string[]) => {
    try { await patchEvent(eventId, { assignedTo }); }
    catch { fail("Erreur lors de l'assignation"); }
  }, [patchEvent]);

  const assignLine = useCallback(async (eventId: string, lineId: string, assignedTo: string[]) => {
    try { await patchLine(eventId, lineId, { assignedTo }); }
    catch { fail("Erreur lors de l'assignation"); }
  }, [patchLine]);

  const assignTask = useCallback(async (eventId: string, taskId: string, assignedTo: string[]) => {
    try { await patchTask(eventId, taskId, { assignedTo }); }
    catch { fail("Erreur lors de l'assignation"); }
  }, [patchTask]);

  // Same write for « Déplacer au… » and for a drop; the event day clears a line's prepDate.
  const moveItem = async (item: DragItem, date: string) => {
    if (date === item.current) return;
    try {
      if (item.kind === "recipe") await patchLine(item.eventId, item.id, { prepDate: date === item.eventDate ? null : date });
      else await patchTask(item.eventId, item.id, { date });
    } catch (e) {
      if (!conflict(e)) fail("Erreur lors du déplacement");
    }
  };

  const dropOn = (date: string) => {
    const item = drag;
    setDrag(null);
    setDropDay(null);
    if (item) void moveItem(item, date);
  };

  // Touch: a held row lifts and drops on a [data-drop-day] cell; a release elsewhere opens its « Déplacer au… » Sheet.
  const lift = useLongPressDrag<DragItem>({
    enabled: touch,
    onStart: () => {
      touchStart.current = null;
      if (!readTour().touchDragHintSeen) setDragHint(true);
    },
    onEnd: (date, item) => {
      if (date === null) { swallowNextClick(); setMoveRequest({ kind: item.kind, id: item.id }); }
      else if (date !== item.current) void moveItem(item, date);
    },
  });
  const clearMoveRequest = useCallback(() => setMoveRequest(null), []);
  const dismissDragHint = () => {
    writeTour({ touchDragHintSeen: true });
    setDragHint(false);
  };

  // The week swipe is off while a row is lifted.
  const onTouchStart = (e: React.TouchEvent) => {
    if (lift.dragging) { touchStart.current = null; return; }
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || lift.dragging) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dy) > Math.abs(dx) / 2) return;
    navigate(weekUrl(dx < 0 ? nextWeek : prevWeek));
  };

  const openTaskCreate = (date: string) => {
    setTaskDialog({
      mode: "create",
      eventId: "",
      initial: { label: "", date, eventId: defaultTaskEventId(weekEventsSorted, date), assignedTo: [], notes: "" },
    });
  };

  const openTaskEdit = (ev: AppEvent, task: EventTask) => {
    setTaskDialog({
      mode: "edit",
      eventId: ev.eventId,
      taskId: task.taskId,
      initial: { label: task.label, date: task.date, eventId: ev.eventId, assignedTo: task.assignedTo ?? [], notes: task.notes ?? "" },
    });
  };

  const submitTask = async (value: TaskDialogValue) => {
    const td = taskDialog;
    if (!td) return;
    try {
      if (td.mode === "create") {
        await addTask(value.eventId, { label: value.label, date: value.date, assignedTo: value.assignedTo, ...(value.notes ? { notes: value.notes } : {}) });
        toast({ title: "Tâche ajoutée" });
      } else if (value.eventId === td.eventId && td.taskId) {
        await patchTask(td.eventId, td.taskId, { label: value.label, date: value.date, assignedTo: value.assignedTo, notes: value.notes });
        toast({ title: "Tâche enregistrée" });
      } else if (td.taskId) {
        // Another event was picked: the task is recreated there with its status and removed from the old one.
        const old = events.find((e) => e.eventId === td.eventId)?.tasks?.find((t) => t.taskId === td.taskId);
        await addTask(value.eventId, { label: value.label, date: value.date, assignedTo: value.assignedTo, ...(value.notes ? { notes: value.notes } : {}), ...(old?.prepStatus ? { prepStatus: old.prepStatus } : {}) });
        await removeTask(td.eventId, td.taskId);
        toast({ title: "Tâche enregistrée" });
      }
    } catch (e) {
      if (!conflict(e)) fail("Erreur lors de l'enregistrement de la tâche");
      throw e;
    }
  };

  const deleteTask = async (eventId: string, taskId: string) => {
    try {
      await removeTask(eventId, taskId);
      toast({ title: "Tâche supprimée" });
    } catch (e) {
      if (!conflict(e)) fail("Erreur lors de l'enregistrement de la tâche");
      throw e;
    }
  };

  const confirmDelete = async () => {
    const c = confirmTask;
    if (!c) return;
    setBusy(true);
    try { await deleteTask(c.eventId, c.taskId); setConfirmTask(null); }
    catch { /* toasted in deleteTask */ }
    finally { setBusy(false); }
  };

  const composerAdd = async (date: string, eventId: string, label: string) => {
    try { await addTask(eventId, { label, date }); }
    catch (e) { conflict(e); throw e; }
  };

  const createGrocery = async (source: AppEvent[]) => {
    if (source.length === 0) { toast({ title: "Aucun événement cette semaine" }); return; }
    const range = { from: dates[0], to: dates[6] };
    setBusy(true);
    try {
      const items = buildGroceryItems(source, recipeById, ingredientById, range).map((i) => ({ ...i, checked: false }));
      const list = await api.groceryLists.create({ title: groceryTitleFor(range), items, eventIds: source.map((e) => e.eventId), range });
      navigate(`/grocery-list?id=${list.listId}`, { state });
    } catch {
      fail("Erreur lors de la création de la liste");
    } finally {
      setBusy(false);
    }
  };

  const createClientWeek = async () => {
    if (!sheet) return;
    setBusy(true);
    try {
      const res = await api.clients.instantiate(sheet.client.clientId, { dates, guestCount: sheet.guestCount });
      toast({ title: `${res.created.length} ${res.created.length === 1 ? "événement créé" : "événements créés"}` });
      setSheet(null);
      reload();
    } catch {
      fail("Erreur lors de la création des événements");
    } finally {
      setBusy(false);
    }
  };

  const openClientSheet = (clientId: string, guestCount: number) => {
    const client = clientById.get(clientId);
    if (client) setSheet({ client, guestCount: guestCount || client.defaultGuestCount || 1 });
  };

  // Runs once per arrival, then the history entry loses the intent so a reload does not repeat it.
  const intentRan = useRef<ChecklistIntent | null>(null);
  useEffect(() => {
    const intent = linkState?.checklistIntent;
    if (!intent || loading || intentRan.current === intent) return;
    intentRan.current = intent;
    if (intent.kind === "assign") setAssignOpen(true);
    else if (intent.kind === "client_week") openClientSheet(intent.clientId, intent.guestCount);
    else void createGrocery(weekEvents.filter((e) => intent.eventIds.includes(e.eventId)));
    navigate(location.pathname + location.search, { replace: true, state: { from: linkState?.from } });
  }, [linkState, loading]);

  const setType = async (eventId: string, type: PrestationTypeSetting) => {
    setBusy(true);
    try { await patchEvent(eventId, { prestationType: type.key, vatRate: type.defaultVatRate }); reload(); }
    catch { fail("Erreur lors de l'enregistrement du type"); }
    finally { setBusy(false); }
  };

  const closeEvent = async (eventId: string) => {
    const ev = events.find((e) => e.eventId === eventId);
    if (!ev) return;
    try {
      const costSnapshot = buildCostSnapshot(ev, recipeCostById, recipePortionsById);
      await patchEvent(eventId, { status: "completed", costSnapshot });
      toast({ title: "Événement terminé" });
      reload();
    } catch (e) {
      const why = errorReason(e);
      fail(why ? `Erreur lors de la clôture · ${why}` : "Erreur lors de la clôture");
    }
  };

  const share = async (person: Person) => {
    const date = anchorDay;
    const url = `${window.location.origin}/jour/${date}?personne=${encodeURIComponent(person.personId)}`;
    const title = `${longDayLabel(date)} · ${person.name}`;
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      toast({ title: "Lien copié" });
    } catch {
      /* the share sheet was dismissed */
    }
  };

  if (!valid) return <Navigate to={`/semaine/${isoWeekOf(today)}${search}`} replace />;

  const recipeName = (id: string) => recipeById.get(id)?.name ?? id;
  const matchesPerson = (item: { assignedTo?: string[] }, ev: AppEvent) => assigneesOf(item, ev).includes(selectedPerson);
  // Own-day lines and tasks of the day decide whether the card is shown in full under the person filter.
  const hasPersonLine = (ev: AppEvent, date: string) =>
    !selectedPerson || ownDayLines(ev).some((l) => matchesPerson(l, ev)) || tasksOn(ev, date).some((t) => matchesPerson(t, ev));
  const isOtherPerson = (ev: AppEvent, item: { assignedTo?: string[] }) => Boolean(selectedPerson) && !matchesPerson(item, ev);
  // A moved-in group only keeps the items of the filtered person.
  const visibleMovedIn = (m: WeekMovedIn): WeekMovedIn | null => {
    if (!selectedPerson) return m;
    const lines = m.lines.filter((l) => matchesPerson(l, m.event));
    const tasks = m.tasks.filter((t) => matchesPerson(t, m.event));
    return lines.length || tasks.length ? { event: m.event, lines, tasks } : null;
  };
  const canAssign = !touch && activePeople.length > 0;
  const canDrag = !touch;
  const counts = Object.fromEntries(plan.days.map((d) => [d.date, d.events.length]));
  // The tour spotlights the chips of this card only.
  const firstEventId = plan.days.find((d) => d.events.length > 0)?.events[0]?.eventId;
  const filterCount = (selectedClient ? 1 : 0) + (selectedPerson ? 1 : 0) + (hideDone ? 1 : 0);
  const showClientFilter = clientsConfigured && clientsThisWeek.length > 0;
  const showPersonFilter = activePeople.length > 0;
  const taskEventFor = (date: string) => defaultTaskEventId(weekEventsSorted, date);
  const eventLabel = (ev: AppEvent) => `${shortEventName(ev, clientOf(ev))} · ${shortDayLabel(ev.date)}`;
  const movedInTitle = (ev: AppEvent) => `Pour ${longDayLabel(ev.date).toLowerCase()} · ${shortEventName(ev, clientOf(ev))}`;
  const movedInLabel = (ev: AppEvent) => `pour ${shortDayLabel(ev.date)} · ${shortEventName(ev, clientOf(ev))}`;

  // The dialog lists the week's events; a task of an outside event keeps its own event in the list.
  const dialogEvents = (() => {
    const list = [...weekEventsSorted];
    if (taskDialog?.mode === "edit" && !list.some((e) => e.eventId === taskDialog.eventId)) {
      const own = events.find((e) => e.eventId === taskDialog.eventId);
      if (own) list.push(own);
      list.sort(byDateThenName);
    }
    return list.map((ev) => ({ eventId: ev.eventId, label: eventLabel(ev) }));
  })();

  const rowShared = (stacked: boolean, align: "left" | "right"): RowShared => ({
    stacked,
    people,
    canAssign,
    canDrag: canDrag && !stacked,
    days: dates,
    align,
    state,
    drag,
    setDrag: (d) => { setDrag(d); if (!d) setDropDay(null); },
    lift,
    moveRequest,
    clearMoveRequest,
    onMove: moveItem,
    cycleLine,
    cycleTask,
    assignLine,
    assignTask,
    editTask: openTaskEdit,
    deleteTask: (ev, task) => setConfirmTask({ eventId: ev.eventId, taskId: task.taskId, label: task.label }),
    openSheet: (href) => navigate(href, { state }),
  });

  const filterGroups = (
    <>
      {showClientFilter && (
        <FilterGroup
          label="Client"
          name="client"
          kind="radio"
          value={selectedClient}
          onChange={(v) => setParam("client", v)}
          options={[{ value: "", label: "Tous les clients" }, ...clientsThisWeek.map((c) => ({ value: c.clientId, label: c.name }))]}
        />
      )}
      {showPersonFilter && (
        <FilterGroup
          label="Personne"
          name="personne"
          kind="radio"
          value={selectedPerson}
          onChange={(v) => setParam("personne", v)}
          options={[{ value: "", label: "Toutes les personnes" }, ...activePeople.map((p) => ({ value: p.personId, label: p.name }))]}
          renderOption={(o) => o.value ? <span className="inline-flex items-center gap-2"><PersonChip personId={o.value} people={people} size="sm" />{o.label}</span> : o.label}
        />
      )}
      <FilterGroup
        name="masquer"
        kind="check"
        value={hideDone ? ["faites"] : []}
        onChange={(v) => setParam("masquer", v.includes("faites") ? "faites" : "")}
        options={[{ value: "faites", label: "Masquer les lignes faites" }]}
      />
    </>
  );

  const actionItems = (
    <>
      <MenuSection label="Afficher">
        <MenuCheck checked={view === "lines"} onChange={() => setView("lines")}>Afficher les lignes</MenuCheck>
        <MenuCheck checked={view === "events"} onChange={() => setView("events")}>Afficher les événements</MenuCheck>
      </MenuSection>
      <MenuSeparator />
      <MenuItem icon={<ShoppingCart />} disabled={busy || loading} onSelect={() => createGrocery(weekFilteredEvents)}>Créer les courses de la semaine</MenuItem>
      <MenuItem icon={<Printer />} to={printUrl}>Imprimer la semaine…</MenuItem>
      {activePeople.map((p) => (
        <MenuItem key={p.personId} icon={<Share2 />} onSelect={() => share(p)}>Partager avec {p.name}</MenuItem>
      ))}
      {assistant && <MenuItem icon={<MessageSquare />} onSelect={openAssistant}>Demander à l'assistant</MenuItem>}
    </>
  );

  // Compact (touch or under md): the ⋯ menu also carries the filters.
  const touchFilterItems = (
    <>
      {showClientFilter && (
        <MenuSection label="Client">
          <MenuRadio checked={!selectedClient} onSelect={() => setParam("client", "")}>Tous les clients</MenuRadio>
          {clientsThisWeek.map((c) => (
            <MenuRadio key={c.clientId} checked={selectedClient === c.clientId} onSelect={() => setParam("client", c.clientId)}>{c.name}</MenuRadio>
          ))}
        </MenuSection>
      )}
      {showPersonFilter && (
        <MenuSection label="Personne">
          <MenuRadio checked={!selectedPerson} onSelect={() => setParam("personne", "")}>Toutes les personnes</MenuRadio>
          {activePeople.map((p) => (
            <MenuRadio key={p.personId} checked={selectedPerson === p.personId} onSelect={() => setParam("personne", p.personId)}>{p.name}</MenuRadio>
          ))}
        </MenuSection>
      )}
      <MenuCheck icon={<EyeOff />} checked={hideDone} onChange={(v) => setParam("masquer", v ? "faites" : "")}>Masquer les lignes faites</MenuCheck>
      <MenuSeparator />
    </>
  );

  // Rendered in one slot only: two Menu instances on one useMenu would close each other on mousedown.
  const moreMenu = (
    <div ref={menu.ref} className="relative inline-flex">
      <IconButton size="sm" aria-label="Plus d'actions" aria-haspopup="menu" aria-expanded={menu.open} onClick={menu.toggle} icon={<MoreHorizontal />} />
      <Menu {...menu.props} align="right" title={`Semaine ${weekNo}`} aria-label="Plus d'actions">
        {compact && touchFilterItems}
        {actionItems}
      </Menu>
    </div>
  );

  const newButton = (
    <Button variant="primary" size="sm" as={Link} to={newEventUrl(anchorDay)} icon={<Plus />}>Nouvel événement</Button>
  );
  // The 44px tabs leave no room for the label on a phone.
  const newButtonTouch = (
    <IconButton variant="primary" size="sm" as={Link} to={newEventUrl(anchorDay)} aria-label="Nouvel événement" title="Nouvel événement" icon={<Plus />} />
  );

  const filterChips = filterCount > 0 ? (
    <>
      {selectedClient && <FilterChip onRemove={() => setParam("client", "")}>{clientById.get(selectedClient)?.name ?? selectedClient}</FilterChip>}
      {selectedPerson && <FilterChip onRemove={() => setParam("personne", "")}>{personName(people, selectedPerson)}</FilterChip>}
      {hideDone && <FilterChip onRemove={() => setParam("masquer", "")}>Lignes faites masquées</FilterChip>}
    </>
  ) : undefined;

  // Caption rows under a card: moved-out items that land outside the displayed week, one per day.
  const outsideRows = (ev: AppEvent) => outsideDays(ev, dates).map(({ date, count }) => (
    <Link key={date} to={dayUrl(date)} state={state} className={`${CAPTION_ROW} truncate rounded hover:bg-hover`}>
      {plural(count, "préparation")} le {shortDayLabel(date)}
    </Link>
  ));

  const movedInHeader = (m: WeekMovedIn, stacked: boolean) => (
    <div className={`${CAPTION_ROW} ${stacked ? "min-h-11" : ""}`}>
      <Link to={`/events/${m.event.eventId}`} state={state} title={movedInTitle(m.event)} className="min-w-0 truncate rounded hover:bg-hover">
        {movedInLabel(m.event)}{view === "events" && !stacked ? ` · ${m.lines.length + m.tasks.length}` : ""}
      </Link>
    </div>
  );

  const lineRows = (ev: AppEvent, lines: EventRecipeLine[], shared: RowShared) =>
    sortEventLines(hideDone ? lines.filter((l) => lineStatus(l) !== "done") : lines, courses, recipeById).map((line) => (
      <ItemRow
        key={line.lineId}
        shared={shared}
        dim={isOtherPerson(ev, line)}
        item={{ kind: "recipe", ev, line, name: recipeName(line.recipeId), href: prepUrl(ev.eventId, line.lineId) }}
      />
    ));

  const taskRows = (ev: AppEvent, tasks: EventTask[], shared: RowShared) =>
    (hideDone ? tasks.filter((t) => t.prepStatus !== "done") : tasks).map((task) => <ItemRow key={task.taskId} shared={shared} dim={isOtherPerson(ev, task)} item={{ kind: "task", ev, task }} />);

  // Navigation and strip, shared with the day page.
  const bar = (
    <PlanningBar
      view="week"
      weekHref={weekUrl(safeWeek)}
      dayHref={dayUrl(anchorDay)}
      personHref={activePeople.length > 0 ? `/jour/${anchorDay}?mode=personne${hideDone ? "&masquer=faites" : ""}` : undefined}
      dateLabel={<><span className="hidden md:inline">Semaine {weekNo} · </span>{shortRange(dates[0], dates[6])}</>}
      onPrev={() => navigate(weekUrl(prevWeek))}
      onNext={() => navigate(weekUrl(nextWeek))}
      onPick={(d) => navigate(weekUrl(isoWeekOf(d)))}
      pickValue={monday}
      isToday={safeWeek === todayWeek}
      onToday={() => navigate(weekUrl(todayWeek))}
      right={compact ? (
        <span className="flex items-center gap-0.5 touch:-mr-1">{moreMenu}{newButtonTouch}</span>
      ) : (
        <>
          <FilterButton count={filterCount} onClear={clearFilters}>{filterGroups}</FilterButton>
          {moreMenu}
          {newButton}
        </>
      )}
      filters={filterChips}
      dates={dates}
      counts={counts}
      today={today}
      stripHref={dayUrl}
      linkState={state}
      dropDay={lift.target}
      dragging={lift.dragging}
    />
  );

  const callouts = !loading ? (
    <>
      <FirstRunCallout hidden={Boolean(selectedPerson)} />
      {dragHint && (
        <div className="mb-3 flex items-start gap-2">
          <p className="min-w-0 flex-1 py-1 text-caption text-muted-foreground">{DRAG_HINT}</p>
          <IconButton size="sm" aria-label="Fermer" icon={<X />} onClick={dismissDragHint} />
        </div>
      )}
      <WeekChecklist
        items={checklist}
        firstRun={firstRun}
        open={checklistOpen}
        onToggle={() => setChecklistOpen((o) => !o)}
        from={from}
        monday={monday}
        weekNo={weekNo}
        prestationTypes={prestationTypes}
        coveringList={coveringList}
        busy={busy}
        invoicing={settings?.invoicing}
        onCreateClientWeek={openClientSheet}
        onSetType={setType}
        onAssign={() => setAssignOpen(true)}
        onCreateGroceries={(ids) => createGrocery(weekEvents.filter((e) => ids.includes(e.eventId)))}
        onCloseEvent={closeEvent}
      />
    </>
  ) : undefined;

  // The seven heads of the laptop columns, one sticky row shared with the day page.
  const heads = (
    <DayHeads
      dates={dates}
      plan={loading ? undefined : plan}
      started={started}
      today={today}
      href={dayUrl}
      state={state}
      newEventHref={newEventUrl}
      people={people}
      selectedPerson={selectedPerson}
      onPersonFilter={(id) => setParam("personne", selectedPerson === id ? "" : id)}
      dropDay={lift.target}
      dragging={lift.dragging}
    />
  );

  return (
    <PlanningFrame
      weekNo={weekNo}
      meta={<WeekMeta weekTotals={weekTotals} started={started} monthLink={monthLink} state={state} />}
      bar={bar}
      error={error}
      callouts={callouts}
      heads={heads}
      stickyHeads
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {loading && <p className="mt-6 text-sm text-muted-foreground">Chargement…</p>}

      {/* Laptop: seven column bodies under the heads row */}
      {!loading && (
        <div className="hidden grid-cols-[repeat(7,minmax(0,1fr))] gap-2 xl:grid print:hidden">
          {plan.days.map((day, i) => {
            const past = day.date < today;
            const shared = rowShared(false, i >= 4 ? "right" : "left");
            const taskEventId = taskEventFor(day.date);
            const dropHere = Boolean(drag) && dropDay === day.date;
            return (
              <div key={day.date} className={`group min-w-0 ${past ? "opacity-60 hover:opacity-100 focus-within:opacity-100" : ""}`}>
                <div
                  data-drop-day={day.date}
                  className={cn("space-y-2 rounded-lg px-0.5 pb-2", (dropHere || lift.dragging) && "bg-selected", lift.target === day.date && "ring-2 ring-inset ring-primary")}
                  onDragOver={canDrag && drag ? (e) => { e.preventDefault(); setDropDay(day.date); } : undefined}
                  onDrop={canDrag && drag ? (e) => { e.preventDefault(); dropOn(day.date); } : undefined}
                >
                  {day.events.map((ev) => {
                    const client = clientOf(ev);
                    const title = shortEventName(ev, client);
                    const total = ev.recipes.length;
                    const done = doneCount(ev);
                    const movedOut = movedOutLines(ev);
                    const movedTitle = movedOut.length ? `Préparées le ${[...new Set(movedOut.map((l) => prepDateOf(l, ev)))].sort().map(shortDayLabel).join(", ")}` : undefined;
                    const time = fmtTime(ev.deliveryTime ?? "");
                    const meta = `${ev.guestCount} conv.${time ? ` · ${time}` : ""} · ${plural(total, "ligne")}${view === "events" && total > 0 ? ` · ${plural(done, "faite")}` : ""}`;
                    // The "Assigner" button takes its own row; the column is too narrow for it next to the title.
                    const unassigned = (ev.assignedTo ?? []).length === 0;
                    if (!hasPersonLine(ev, day.date)) {
                      return (
                        <Link key={ev.eventId} to={`/events/${ev.eventId}`} state={state} className="flex h-7 items-center rounded px-2 text-sm text-muted-foreground hover:bg-hover">
                          <span className="truncate">{title}</span>
                        </Link>
                      );
                    }
                    return (
                      <div key={ev.eventId}>
                        <div className="flex flex-wrap rounded-lg bg-background shadow-card hover:bg-hover">
                          <Link to={`/events/${ev.eventId}`} state={state} className="min-w-0 flex-1 p-2">
                            <div className="text-sm font-medium line-clamp-2">{title}</div>
                            <div className="mt-0.5 truncate text-caption text-muted-foreground" title={meta + (movedOut.length > 0 ? ` · ${movedOut.length} un autre jour (${movedTitle})` : "")}>
                              {meta}
                              {movedOut.length > 0 && <span> · {movedOut.length} un autre jour</span>}
                            </div>
                            {started && total > 0 && (
                              <div className="mt-2 h-1 w-full rounded-full bg-divider">
                                <div className="h-1 rounded-full bg-success" style={{ width: `${Math.round((done / total) * 100)}%` }} />
                              </div>
                            )}
                          </Link>
                          {(ev.assignedTo?.length || canAssign) ? (
                            <div className={unassigned ? "w-full px-1 pb-1" : "pr-1 pt-0.5"} data-tour={ev.eventId === firstEventId ? "assign" : undefined}>
                              <AssignChips value={ev.assignedTo ?? []} options={people} enabled={canAssign} onChange={(ids) => assignEvent(ev.eventId, ids)} title="Assigner l'événement" label={`Assigner ${title}`} />
                            </div>
                          ) : null}
                        </div>
                        {outsideRows(ev)}
                        {view === "lines" && (
                          <ul className="mt-1">
                            {lineRows(ev, ownDayLines(ev), shared)}
                            {taskRows(ev, tasksOn(ev, day.date), shared)}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                  {day.movedIn.map((group) => {
                    const m = visibleMovedIn(group);
                    if (!m) return null;
                    return (
                      <div key={m.event.eventId}>
                        {movedInHeader(m, false)}
                        {view === "lines" && (
                          <ul>
                            {lineRows(m.event, m.lines, shared)}
                            {taskRows(m.event, m.tasks, shared)}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                  <Button variant="ghost" size="sm" as={Link} to={newEventUrl(day.date)} icon={<Plus />} className="w-full min-w-0 justify-start overflow-hidden text-muted-foreground"><span className="truncate">Nouvel événement</span></Button>
                  {taskEventId && (composerDay === day.date && !touch ? (
                    <TaskComposer
                      date={day.date}
                      events={weekEventsSorted}
                      clientById={clientById}
                      defaultEventId={taskEventId}
                      onAdd={(eventId, label) => composerAdd(day.date, eventId, label)}
                      onClose={() => setComposerDay(null)}
                    />
                  ) : (
                    <Button variant="ghost" size="sm" icon={<Plus />} className="w-full min-w-0 justify-start overflow-hidden text-muted-foreground" onClick={() => (touch ? openTaskCreate(day.date) : setComposerDay(day.date))}><span className="truncate">Tâche</span></Button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Phone and tablet: every day stacked under the strip of the bar */}
      {!loading && (
        <div className="mt-2 xl:hidden print:hidden">
          {plan.days.map((day, i) => {
            const isToday = day.date === today;
            const past = day.date < today;
            const empty = day.events.length === 0;
            const [dayName, dayNum] = dayLabel(day.date).split(" ");
            const shared = rowShared(true, "right");
            const taskEventId = taskEventFor(day.date);
            return (
              <section key={day.date} ref={(el) => { dayRefs.current[day.date] = el; }} className={`scroll-mt-24 md:scroll-mt-0 ${past ? "opacity-60 hover:opacity-100 focus-within:opacity-100" : ""}`}>
                <div
                  data-drop-day={day.date}
                  className={cn("sticky top-[96px] z-10 -mx-4 flex min-h-11 items-center gap-1 bg-background px-4 md:static md:mx-0 md:px-0", lift.dragging && "bg-selected", lift.target === day.date && "ring-2 ring-inset ring-primary")}
                >
                  <Link to={dayUrl(day.date)} state={state} data-tour={i === 0 ? "week-day" : undefined} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded hover:bg-hover">
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold">
                      {dayName}
                      <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 tabular-nums ${isToday ? "bg-danger-solid text-white" : ""}`}>{dayNum}</span>
                    </span>
                    <span className="min-w-0 truncate text-sm text-muted-foreground">{dayHeaderMeta(day, started)}</span>
                    {!empty && <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-icon" aria-hidden="true" />}
                  </Link>
                  {empty && (
                    <IconButton size="sm" as={Link} to={newEventUrl(day.date)} aria-label={`Nouvel événement le ${longDayLabel(day.date)}`} icon={<Plus />} />
                  )}
                </div>
                {day.events.map((ev) => {
                  const client = clientOf(ev);
                  const title = shortEventName(ev, client);
                  const collapsed = !hasPersonLine(ev, day.date);
                  const time = fmtTime(ev.deliveryTime ?? "");
                  return (
                    <div key={ev.eventId} className="mt-1">
                      <Link to={`/events/${ev.eventId}`} state={state} className={`flex min-h-11 items-center gap-2 rounded-lg bg-background px-3 shadow-card hover:bg-hover ${collapsed ? "text-muted-foreground" : ""}`}>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium touch:text-base">{title}</span>
                        {!collapsed && <span className="shrink-0 text-sm text-muted-foreground">{ev.guestCount} conv.{time ? ` · ${time}` : ""}</span>}
                        <PersonChips personIds={ev.assignedTo ?? []} people={people} size="sm" />
                      </Link>
                      {!collapsed && outsideRows(ev)}
                      {!collapsed && (
                        <ul className="mt-1">
                          {lineRows(ev, ownDayLines(ev), shared)}
                          {taskRows(ev, tasksOn(ev, day.date), shared)}
                        </ul>
                      )}
                    </div>
                  );
                })}
                {day.movedIn.map((group) => {
                  const m = visibleMovedIn(group);
                  if (!m) return null;
                  return (
                    <div key={m.event.eventId} className="mt-1">
                      {movedInHeader(m, true)}
                      <ul>
                        {lineRows(m.event, m.lines, shared)}
                        {taskRows(m.event, m.tasks, shared)}
                      </ul>
                    </div>
                  );
                })}
                {!empty && (
                  <Button variant="ghost" size="sm" as={Link} to={newEventUrl(day.date)} icon={<Plus />} className="mt-1 w-full min-w-0 justify-start overflow-hidden text-muted-foreground"><span className="truncate">Nouvel événement</span></Button>
                )}
                {taskEventId && (
                  <Button variant="ghost" size="sm" icon={<Plus />} className="mt-1 w-full min-w-0 justify-start overflow-hidden text-muted-foreground" onClick={() => openTaskCreate(day.date)}><span className="truncate">Tâche</span></Button>
                )}
                <div className="my-2 h-px bg-border" aria-hidden="true" />
              </section>
            );
          })}
        </div>
      )}

      {lift.item && <DragGhost point={lift.ghost} status={lift.item.status} label={lift.item.label} target={lift.target} />}

      {assignOpen && (
        <AssignSheet
          days={plan.days}
          people={people}
          clientById={clientById}
          recipeById={recipeById}
          courses={courses}
          onEvent={assignEvent}
          onLine={assignLine}
          onTask={assignTask}
          onClose={() => setAssignOpen(false)}
        />
      )}

      <TaskDialog
        open={Boolean(taskDialog)}
        onClose={() => setTaskDialog(null)}
        mode={taskDialog?.mode ?? "create"}
        initial={taskDialog?.initial ?? { label: "", date: monday, eventId: "", assignedTo: [], notes: "" }}
        events={dialogEvents}
        people={people}
        onSubmit={submitTask}
        onDelete={taskDialog?.mode === "edit" && taskDialog.taskId ? () => deleteTask(taskDialog.eventId, taskDialog.taskId as string) : undefined}
      />

      {/* Delete confirmation reached from a row's ⋯ */}
      <Dialog
        open={Boolean(confirmTask)}
        onClose={() => { if (!busy) setConfirmTask(null); }}
        title={confirmTask ? `Supprimer la tâche « ${confirmTask.label} » ?` : ""}
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

      {/* Create week dialog */}
      <Dialog
        open={Boolean(sheet)}
        onClose={() => { if (!busy) setSheet(null); }}
        title={sheet ? `Créer la semaine ${sheet.client.name}` : ""}
        size="sm"
        footer={(
          <>
            <Button variant="default" size="md" onClick={() => setSheet(null)} disabled={busy}>Annuler</Button>
            <Button variant="primary" size="md" form="create-week" type="submit" disabled={busy}>Créer la semaine</Button>
          </>
        )}
      >
        {sheet && (
          <form id="create-week" onSubmit={(e) => { e.preventDefault(); createClientWeek(); }}>
            <p className="text-sm text-muted-foreground">{rangeLabel(dates[0], dates[6])} · un événement par jour de modèle</p>
            <div className="mt-4">
              <FieldLabel htmlFor="create-week-guests">Convives</FieldLabel>
              <input
                id="create-week-guests"
                type="number"
                inputMode="numeric"
                min={1}
                autoFocus
                value={sheet.guestCount}
                onChange={(e) => setSheet({ ...sheet, guestCount: Math.max(1, Number(e.target.value) || 1) })}
                className="input-field"
              />
            </div>
          </form>
        )}
      </Dialog>
    </PlanningFrame>
  );
}

// ── Rows ──────────────────────────────────────────────────────────────────────

type RowItem =
  | { kind: "recipe"; ev: AppEvent; line: EventRecipeLine; name: string; href: string }
  | { kind: "task"; ev: AppEvent; task: EventTask };

interface RowShared {
  stacked: boolean;
  people: Person[];
  canAssign: boolean;
  canDrag: boolean;
  days: string[];
  align: "left" | "right";
  state: { from: string };
  drag: DragItem | null;
  setDrag: (d: DragItem | null) => void;
  lift: LongPressDrag<DragItem>;
  moveRequest: MoveRequest | null;
  clearMoveRequest: () => void;
  onMove: (item: DragItem, date: string) => void;
  cycleLine: (ev: AppEvent, line: EventRecipeLine) => void;
  cycleTask: (ev: AppEvent, task: EventTask) => void;
  assignLine: (eventId: string, lineId: string, ids: string[]) => void;
  assignTask: (eventId: string, taskId: string, ids: string[]) => void;
  editTask: (ev: AppEvent, task: EventTask) => void;
  deleteTask: (ev: AppEvent, task: EventTask) => void;
  openSheet: (href: string) => void;
}

// A hold inside an open Sheet or picker must not lift the row behind it.
function guardLift(h: LongPressDragHandlers): LongPressDragHandlers {
  return {
    ...h,
    onPointerDown: (e) => {
      if ((e.target as HTMLElement).closest('[role="dialog"]')) return;
      h.onPointerDown(e);
    },
  };
}

// One line or task row of the week; `stacked` is the phone and tablet shape.
function ItemRow({ item, shared, dim }: { item: RowItem; shared: RowShared; dim: boolean }) {
  const { stacked, people, canAssign, canDrag, days, align, state, drag, lift, moveRequest, clearMoveRequest } = shared;
  const rowRef = useRef<HTMLLIElement>(null);
  const [moveOpenLocal, setMoveOpenLocal] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const closeMove = useCallback(() => { setMoveOpenLocal(false); clearMoveRequest(); }, [clearMoveRequest]);
  const closeAssign = useCallback(() => setAssignOpen(false), []);

  const ev = item.ev;
  const status: PrepStatus = (item.kind === "recipe" ? item.line.prepStatus : item.task.prepStatus) ?? "todo";
  const label = item.kind === "recipe" ? item.name : item.task.label;
  const assignedTo = item.kind === "recipe" ? item.line.assignedTo : item.task.assignedTo;
  const own = Boolean(assignedTo?.length);
  const ids = assigneesOf({ assignedTo }, ev);
  const id = item.kind === "recipe" ? item.line.lineId : item.task.taskId;
  const current = item.kind === "recipe" ? prepDateOf(item.line, ev) : item.task.date;
  const dragItem: DragItem = { kind: item.kind, eventId: ev.eventId, id, eventDate: ev.date, current, label, status };
  const dragging = drag?.kind === item.kind && drag.id === id;
  const lifted = lift.item?.kind === item.kind && lift.item.id === id;
  const liftHandlers = guardLift(lift.handlers(dragItem));
  const moveOpen = moveOpenLocal || (moveRequest?.kind === item.kind && moveRequest.id === id);
  const done = status === "done";

  const cycle = () => (item.kind === "recipe" ? shared.cycleLine(ev, item.line) : shared.cycleTask(ev, item.task));
  const assign = (next: string[]) => (item.kind === "recipe" ? shared.assignLine(ev.eventId, item.line.lineId, next) : shared.assignTask(ev.eventId, item.task.taskId, next));
  const edit = () => { if (item.kind === "task") shared.editTask(ev, item.task); };

  const menuItems: ActionMenuItem[] = item.kind === "recipe"
    ? [
        { label: "Déplacer au…", icon: <CalendarDays />, onClick: () => setMoveOpenLocal(true) },
        { label: "Assigner", icon: <UserPlus />, onClick: () => setAssignOpen(true) },
        { label: "Ouvrir la fiche", icon: <FileText />, onClick: () => shared.openSheet(item.href) },
      ]
    : [
        { label: "Modifier…", icon: <Pencil />, onClick: edit },
        { label: "Déplacer au…", icon: <CalendarDays />, onClick: () => setMoveOpenLocal(true) },
        { label: "Assigner", icon: <UserPlus />, onClick: () => setAssignOpen(true) },
        { kind: "separator" },
        { label: "Supprimer", icon: <Trash2 />, variant: "danger", onClick: () => shared.deleteTask(ev, item.task) },
      ];

  const moveMenu = (
    <MoveToDayMenu
      open={moveOpen}
      onClose={closeMove}
      anchorRef={rowRef}
      align={align}
      title={`Déplacer « ${label} »`}
      eventDate={ev.date}
      current={current}
      days={days}
      onPick={(d) => { closeMove(); shared.onMove(dragItem, d); }}
    />
  );
  const assignTitle = item.kind === "recipe" ? "Assigner la ligne" : "Assigner la tâche";
  const assignLabel = `Assigner ${label}`;

  if (stacked) {
    const body = (
      <>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {item.kind === "recipe" && <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{item.line.portions}</span>}
        <PersonChips personIds={ids} people={people} size="sm" inherited={!own && ids.length > 0} />
      </>
    );
    const bodyClass = cn("flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded px-1 text-sm hover:bg-hover touch:text-base", done && "text-muted-foreground");
    return (
      <li ref={rowRef} {...liftHandlers} className={cn("relative flex min-h-11 items-center", (dim || lifted) && "opacity-40")}>
        <StatusDot value={status} onCycle={cycle} />
        {item.kind === "recipe" ? (
          <Link to={item.href} state={state} className={bodyClass}>{body}</Link>
        ) : (
          <button type="button" onClick={edit} title={label} className={cn(bodyClass, "text-left")}>{body}</button>
        )}
        <ActionMenu items={menuItems} align="right" title={label} aria-label={`Actions pour ${label}`} />
        {assignOpen && (
          <PersonPicker value={own ? ids : []} options={people} onChange={assign} allowInherit onClose={closeAssign} title={assignTitle} align="right" />
        )}
        {moveMenu}
      </li>
    );
  }

  // Recipe rows keep the ⋯ over the portions slot; task rows make room for it on hover only.
  const rowClass = item.kind === "recipe"
    ? "group/row relative flex h-7 items-center gap-0.5 rounded text-sm hover:bg-hover"
    : "group/row relative flex h-7 items-center gap-0.5 rounded text-sm hover:bg-hover pointer:group-hover/row:pr-7 pointer:group-focus-within/row:pr-7";
  // The whole row drags on a laptop; the grip only says so.
  return (
    <li
      ref={rowRef}
      {...liftHandlers}
      draggable={canDrag || undefined}
      onDragStart={canDrag ? (e) => { e.dataTransfer.setData("text/plain", label); e.dataTransfer.effectAllowed = "move"; shared.setDrag(dragItem); } : undefined}
      onDragEnd={canDrag ? () => shared.setDrag(null) : undefined}
      className={cn(rowClass, canDrag && (dragging ? "cursor-grabbing" : "cursor-grab"), (dim || dragging || lifted) && "opacity-40")}
    >
      {canDrag && (
        <span
          title="Glisser vers un autre jour"
          aria-hidden="true"
          className={cn("absolute -left-4 top-0 flex h-7 w-4 items-center justify-center text-icon", ROW_REVEAL)}
        >
          <GripVertical className="h-4 w-4" />
        </span>
      )}
      <StatusDot value={status} onCycle={cycle} />
      {item.kind === "recipe" ? (
        <Link to={item.href} state={state} title={label} draggable={false} className={cn("min-w-0 flex-1 truncate rounded px-0.5", done && "text-muted-foreground")}>
          {label}
        </Link>
      ) : (
        <button type="button" onClick={edit} title={label} draggable={false} className={cn("min-w-0 flex-1 truncate rounded px-0.5 text-left", done && "text-muted-foreground")}>
          {label}
        </button>
      )}
      {/* Inherited people are shown dimmed so every row has a click target. */}
      {(own || ids.length > 0 || assignOpen) && (
        <AssignChips value={ids} picked={own ? ids : []} options={people} enabled={canAssign} inherited={!own} allowInherit max={2} open={assignOpen} onOpenChange={setAssignOpen} onChange={assign} title={assignTitle} label={assignLabel} />
      )}
      {/* The ⋯ sits over the portions while the row is hovered, so the name keeps its width. */}
      {item.kind === "recipe" && (
        <span className="min-w-7 shrink-0 pl-0.5 pr-1 text-right tabular-nums text-muted-foreground pointer:group-hover/row:invisible pointer:group-focus-within/row:invisible">
          {item.line.portions}
        </span>
      )}
      <span className={cn("absolute right-0 top-0", ROW_REVEAL)}>
        <ActionMenu items={menuItems} align={align} title={label} aria-label={`Actions pour ${label}`} />
      </span>
      {moveMenu}
    </li>
  );
}

interface AssignChipsProps {
  value: string[];
  options: Person[];
  enabled: boolean;
  inherited?: boolean;
  allowInherit?: boolean;
  max?: number;
  className?: string;
  onChange: (next: string[]) => void;
  title: string;
  label?: string;
  // Ids ticked in the picker when they differ from the chips (inherited lines start from "Comme l'événement").
  picked?: string[];
  // Controlled picker state, used when a row menu opens the picker.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type PickerRect = { top: number; left: number; right: number };

// Chips that open the picker in a fixed box, so the column does not clip it.
// With nobody assigned and assignment allowed, a ghost "Assigner" button replaces the chips.
function AssignChips({ value, options, enabled, inherited = false, allowInherit = false, max, className, onChange, title, label, picked = value, open, onOpenChange }: AssignChipsProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<PickerRect | null>(null);
  const controlled = open !== undefined;
  const measure = (): PickerRect | null => {
    const r = anchor.current?.getBoundingClientRect();
    return r ? { top: r.bottom, left: r.left, right: r.right } : null;
  };
  useEffect(() => {
    if (controlled) setRect(open ? measure() : null);
  }, [controlled, open]);
  const close = useCallback(() => { setRect(null); onOpenChange?.(false); }, [onOpenChange]);
  const toggle = () => {
    if (controlled) { onOpenChange?.(!open); return; }
    setRect(rect ? null : measure());
  };
  const alignRight = rect ? rect.left > window.innerWidth - 280 : false;
  const showButton = enabled && value.length === 0 && !allowInherit;
  return (
    <span ref={anchor} className="inline-flex">
      {showButton ? (
        <Button variant="ghost" size="sm" icon={<UserPlus />} onClick={toggle} aria-label={label} aria-haspopup="dialog" className={cn("text-muted-foreground", className)}>Assigner</Button>
      ) : (
        <PersonChips personIds={value} people={options} size="sm" inherited={inherited} max={max} label={value.length === 0 ? label : undefined} className={className} onClick={enabled ? toggle : undefined} />
      )}
      {rect && (
        <div style={{ position: "fixed", top: rect.top, left: alignRight ? rect.right : rect.left, width: 0, height: 0 }} className="z-50">
          <PersonPicker value={picked} options={options} onChange={onChange} allowInherit={allowInherit} onClose={close} title={title} align={alignRight ? "right" : "left"} />
        </div>
      )}
    </span>
  );
}
