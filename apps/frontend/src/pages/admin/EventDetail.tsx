import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams, useLocation, Link } from "react-router-dom";
import { Calendar, Users, Building2, Euro, Phone, Circle, Clock, GripVertical, Plus, X, Check } from "lucide-react";
import type {
  AppEvent,
  AppSettings,
  Client,
  ClientTemplateRequest,
  EventCostSnapshot,
  EventExtraCost,
  EventRecipeLine,
  EventTask,
  ExtraCostKind,
  Ingredient,
  LedgerEntry,
  PatchEventTaskRequest,
  Person,
  PrepStatus,
  Recipe,
} from "@packages/types";
import {
  DEFAULT_COURSES,
  DEFAULT_PRESTATION_TYPES,
  calcRecipeCost,
  calcEventCost,
  sumExtraCosts,
  signedRevenue,
  courseOf,
  courseBucket,
  groupByCourse,
  sortEventLines,
  entriesForEvent,
  eventBillingStatus,
  prefillFromEvent,
  isInvoiceEntry,
  round2,
  fmtEur,
  buildCostSnapshot,
  assigneesOf,
  isoWeekOf,
  personName,
  addDays,
  shortDayLabel,
  tasksOf,
  isMoved,
  prepDateOf,
  shiftPrepDates,
} from "@packages/types";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { dayMonthShortLabel, longDayLabel, dayMonthLabel, weekdayOf, todayIso } from "@/lib/dates";
import { plural } from "@/lib/use-planning-data";
import {
  PageHeader,
  Section,
  Tag,
  StatusTag,
  ListRow,
  MoneyTile,
  FieldLabel,
  ActionMenu,
  SearchSelect,
  EditableText,
  EditableInlineText,
  EditableInlineNum,
  EditableStatus,
  Button,
  IconButton,
  Dialog,
  PropertyList,
  Property,
  SelectPill,
  Menu,
  MenuRadio,
  useMenu,
  PillTag,
  EmptyState,
  Callout,
} from "@/components/ui";
import { PREP_STATUS_OPTIONS } from "@/components/ui/StatusControl";
import LedgerEntryForm from "@/components/comptes/LedgerEntryForm";
import PersonChips, { PersonChip } from "@/components/admin/PersonChips";
import PersonPicker from "@/components/admin/PersonPicker";
import NewClientDialog from "@/components/admin/NewClientDialog";
import TaskDialog, { type TaskDialogValue } from "@/components/admin/TaskDialog";
import MoveToDayMenu from "@/components/admin/MoveToDayMenu";
import { useBackLink, useTopTitle } from "@/components/admin/AdminLayout";
import { PaidPopover } from "@/pages/admin/comptes/Journal";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const NOT_CONFIGURED = "Comptabilité non configurée : la table ta-ledger n'existe pas encore";

const EXTRA_KINDS: { value: ExtraCostKind; label: string }[] = [
  { value: "matiere", label: "Matière" },
  { value: "personnel", label: "Personnel" },
  { value: "location", label: "Location" },
  { value: "transport", label: "Transport" },
  { value: "autre", label: "Autre" },
];

const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const ENTRY_KIND_LABEL: Record<string, string> = {
  facture: "Facture",
  acompte: "Acompte",
  comptoir: "Comptoir",
  bon_cadeau: "Bon cadeau",
  note_de_credit: "Note de crédit",
  commission: "Commission",
  autre: "Autre",
};

const NEXT_STATUS: Record<PrepStatus, PrepStatus> = { todo: "doing", doing: "done", done: "todo" };
const STATUS_LABEL: Record<PrepStatus, string> = { todo: "À préparer", doing: "En cours", done: "Fait" };

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\s-]/g, "").trim() || "evenement";
}

// "jeudi 15 octobre", for use after "le".
function dayPhrase(date: string): string {
  const s = longDayLabel(date);
  return s.charAt(0).toLowerCase() + s.slice(1);
}

type DropTarget = { course: string; lineId: string | null };
type MoveTarget = { kind: "line" | "task"; id: string };
type TaskDialogState = { mode: "create" | "edit"; taskId?: string; initial: TaskDialogValue };

const ROW = "group flex min-h-9 items-center gap-1 rounded px-1 hover:bg-hover touch:min-h-11";

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const isTouch = useTouchScreen();

  const [event, setEvent] = useState<AppEvent | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsConfigured, setClientsConfigured] = useState(true);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [ledgerNotConfigured, setLedgerNotConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [dialog, setDialog] = useState<
    | { kind: "delete" }
    | { kind: "removeLine"; lineId: string }
    | { kind: "removeTask"; taskId: string }
    | { kind: "adjust" }
    | { kind: "duplicate" }
    | { kind: "template" }
    | null
  >(null);
  const [newClient, setNewClient] = useState<{ name: string } | null>(null);
  const [taskDialog, setTaskDialog] = useState<TaskDialogState | null>(null);
  const [pickerTaskId, setPickerTaskId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const moveAnchorRef = useRef<HTMLSpanElement>(null);
  const [busy, setBusy] = useState(false);
  const [adjustGuests, setAdjustGuests] = useState("");
  const [duplicateDate, setDuplicateDate] = useState(todayIso());
  const [templateWeekday, setTemplateWeekday] = useState(1);

  const [addingRecipe, setAddingRecipe] = useState(false);
  const [noteLineId, setNoteLineId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [billingForm, setBillingForm] = useState<"facture" | "acompte" | null>(null);
  const [pickerLineId, setPickerLineId] = useState<string | null>(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const teamRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.events.get(id),
      api.recipes.list(),
      api.ingredients.list(),
      api.settings.get(),
      api.clients.list().catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 503) { setClientsConfigured(false); return [] as Client[]; }
        throw e;
      }),
    ])
      .then(([ev, recs, ings, se, cl]) => {
        if (cancelled) return;
        setEvent(ev); setRecipes(recs); setIngredients(ings); setSettings(se); setClients(cl);
      })
      .catch(() => { if (!cancelled) { setLoadError(true); toast({ title: "Erreur de chargement", variant: "destructive" }); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const eventYear = event?.date.slice(0, 4);
  const loadEntries = useCallback(() => {
    if (!eventYear) return;
    api.ledger.list(eventYear)
      .then((list) => { setEntries(list); setLedgerNotConfigured(false); })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 503) { setLedgerNotConfigured(true); setEntries([]); return; }
        toast({ title: "Erreur de chargement des écritures", variant: "destructive" });
      });
  }, [eventYear]);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r])), [recipes]);
  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.ingredientId, i])), [ingredients]);
  const recipeCostById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, calcRecipeCost(r, ingredientById)])), [recipes, ingredientById]);
  const recipePortionsById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r.portions || 1])), [recipes]);

  const courses = useMemo(() => {
    const list = settings?.courses?.length ? settings.courses : DEFAULT_COURSES;
    return list.includes("Autre") ? list : [...list, "Autre"];
  }, [settings]);
  const prestationTypes = settings?.prestationTypes?.length ? settings.prestationTypes : DEFAULT_PRESTATION_TYPES;

  const grouped = useMemo(() => (event ? groupByCourse(event.recipes, courses, recipeById) : []), [event, courses, recipeById]);
  const people: Person[] = useMemo(() => settings?.people ?? [], [settings]);

  // "‹ Sam 17" in the phone top bar.
  const backLabel = event ? dayMonthShortLabel(event.date).split(" ").slice(0, 2).join(" ") : "";
  useBackLink(event ? { to: `/jour/${event.date}`, label: backLabel } : null);
  useTopTitle(event?.name ?? "");

  // One-shot URL params from the week and À facturer: open a form, focus a field, then drop the param.
  const loaded = Boolean(event);
  useEffect(() => {
    if (!loaded) return;
    const facturer = searchParams.get("facturer");
    const focus = searchParams.get("focus");
    const ajouter = searchParams.get("ajouter");
    if (!facturer && !focus && !ajouter) return;
    if (facturer === "1" || facturer === "acompte") {
      setBillingForm(facturer === "acompte" ? "acompte" : "facture");
      setTimeout(() => document.getElementById("facturation")?.scrollIntoView({ block: "start" }), 50);
    }
    if (focus === "prix") priceRef.current?.querySelector<HTMLElement>("[role=button]")?.click();
    if (ajouter === "1") {
      setAddingRecipe(true);
      setTimeout(() => addRef.current?.querySelector("input")?.focus(), 50);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("facturer"); next.delete("focus"); next.delete("ajouter");
    setSearchParams(next, { replace: true });
  }, [loaded, searchParams, setSearchParams]);

  // The router does not scroll to #menu or #facturation on its own.
  useEffect(() => {
    if (!loaded || !location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [loaded, location.hash]);

  const saveField = async (patch: Partial<AppEvent>, okTitle?: string) => {
    if (!id) return;
    try {
      const updated = await api.events.update(id, patch);
      setEvent(updated);
      if (okTitle) toast({ title: okTitle });
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
      throw new Error("save failed");
    }
  };
  const save = (patch: Partial<AppEvent>) => saveField(patch).catch(() => undefined);

  // Every line call returns the whole event, which replaces the local copy.
  const runLines = async (call: Promise<AppEvent>) => {
    try {
      setEvent(await call);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && id) {
        toast({ title: "Le menu a changé ailleurs, il a été rechargé", variant: "destructive" });
        api.events.get(id).then(setEvent).catch(() => undefined);
        return;
      }
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    }
  };

  // Same as runLines but rethrows, so TaskDialog stays open on failure.
  const runTask = async (call: Promise<AppEvent>, okTitle: string) => {
    try {
      setEvent(await call);
      toast({ title: okTitle });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && id) {
        toast({ title: "Le menu a changé ailleurs, il a été rechargé", variant: "destructive" });
        api.events.get(id).then(setEvent).catch(() => undefined);
      } else {
        toast({ title: "Erreur lors de l'enregistrement de la tâche", variant: "destructive" });
      }
      throw e;
    }
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;
  if (loadError || !event || !id) return <div className="p-8 text-muted-foreground">Événement introuvable.</div>;

  const client = event.clientId ? clients.find((c) => c.clientId === event.clientId) : undefined;
  const weekUrl = `/semaine/${isoWeekOf(event.date)}`;
  const weekNumber = Number(isoWeekOf(event.date).slice(-2));
  const cost = calcEventCost(event, recipeCostById, recipePortionsById);
  const matieres = cost.rawMaterial + cost.extras.matiere;
  const revenue = signedRevenue(event);
  const margin = revenue - cost.total;
  const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
  const costSub = event.actualCost != null ? "réel" : event.costSnapshot ? `figé le ${dayMonthLabel(event.costSnapshot.takenAt)}` : "estimé";
  const isPast = event.date < todayIso();

  const linkedEntries = entriesForEvent(event.eventId, entries);
  const billing = eventBillingStatus(event.eventId, entries);
  const invoiceNumber = linkedEntries.find((e) => isInvoiceEntry(e) && e.number)?.number;
  const lastPaidAt = linkedEntries.map((e) => e.paidAt).filter((d): d is string => !!d).sort().pop();

  const snapshot = () => buildCostSnapshot(event, recipeCostById, recipePortionsById) as EventCostSnapshot;
  const complete = () => saveField({ status: "completed", costSnapshot: snapshot() }, "Événement terminé").catch(() => undefined);
  const reopen = () => saveField({ status: "upcoming" }, "Événement rouvert").catch(() => undefined);
  const retakeCost = () => saveField({ costSnapshot: snapshot() }, "Coût repris").catch(() => undefined);

  // ── Menu lines ────────────────────────────────────────────────────────────
  const orderedPut = (groups: { course: string; lines: EventRecipeLine[] }[], changed?: { lineId: string; course: string }) =>
    runLines(api.events.lines.put(id, groups.flatMap((g) => g.lines.map((l) => (
      changed && l.lineId === changed.lineId ? { lineId: l.lineId, course: changed.course } : { lineId: l.lineId }
    )))));

  const allGroups = () => courses.map((c) => ({ course: c, lines: [...(grouped.find((g) => g.course === c)?.lines ?? [])] }));

  const moveLine = (course: string, index: number, dir: -1 | 1) => {
    const groups = allGroups();
    const g = groups.find((x) => x.course === course);
    if (!g) return;
    const j = index + dir;
    if (j < 0 || j >= g.lines.length) return;
    [g.lines[index], g.lines[j]] = [g.lines[j], g.lines[index]];
    orderedPut(groups);
  };

  const changeCourse = (line: EventRecipeLine, course: string) => {
    const groups = allGroups().map((g) => ({ ...g, lines: g.lines.filter((l) => l.lineId !== line.lineId) }));
    groups.find((g) => g.course === course)?.lines.push(line);
    orderedPut(groups, { lineId: line.lineId, course });
  };

  const handleDrop = (target: DropTarget) => {
    setDropTarget(null);
    if (!dragId || dragId === target.lineId) { setDragId(null); return; }
    const dragged = event.recipes.find((l) => l.lineId === dragId);
    setDragId(null);
    if (!dragged) return;
    const sourceCourse = courseBucket(courseOf(dragged, recipeById.get(dragged.recipeId)), courses);
    const groups = allGroups().map((g) => ({ ...g, lines: g.lines.filter((l) => l.lineId !== dragId) }));
    const g = groups.find((x) => x.course === target.course);
    if (!g) return;
    const at = target.lineId ? g.lines.findIndex((l) => l.lineId === target.lineId) : -1;
    g.lines.splice(at < 0 ? g.lines.length : at, 0, dragged);
    orderedPut(groups, target.course !== sourceCourse ? { lineId: dragged.lineId, course: target.course } : undefined);
  };

  const patchLine = (lineId: string, patch: { portions?: number; prepStatus?: PrepStatus; notes?: string; assignedTo?: string[]; prepDate?: string | null }) =>
    runLines(api.events.lines.patch(id, lineId, patch));

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const tasks = tasksOf(event);
  // The seven days ending on the event day, for « Déplacer au… ».
  const moveDays = Array.from({ length: 7 }, (_, i) => addDays(event.date, i - 6));

  const patchTask = (taskId: string, patch: PatchEventTaskRequest) => runLines(api.events.tasks.patch(id, taskId, patch));

  const openTaskCreate = () =>
    setTaskDialog({ mode: "create", initial: { label: "", date: event.date, eventId: event.eventId, assignedTo: [], notes: "" } });
  const openTaskEdit = (task: EventTask) =>
    setTaskDialog({ mode: "edit", taskId: task.taskId, initial: { label: task.label, date: task.date, eventId: event.eventId, assignedTo: task.assignedTo ?? [], notes: task.notes ?? "" } });

  const submitTask = async (v: TaskDialogValue) => {
    if (taskDialog?.mode === "edit" && taskDialog.taskId) {
      await runTask(api.events.tasks.patch(id, taskDialog.taskId, { label: v.label, date: v.date, notes: v.notes, assignedTo: v.assignedTo }), "Tâche enregistrée");
      return;
    }
    await runTask(api.events.tasks.add(id, {
      label: v.label,
      date: v.date,
      ...(v.notes ? { notes: v.notes } : {}),
      ...(v.assignedTo.length ? { assignedTo: v.assignedTo } : {}),
    }), "Tâche ajoutée");
  };

  const deleteTask = (taskId: string) => runTask(api.events.tasks.remove(id, taskId), "Tâche supprimée");

  const moveTo = (target: MoveTarget, date: string) => {
    setMoveTarget(null);
    if (target.kind === "line") patchLine(target.id, { prepDate: date === event.date ? null : date });
    else patchTask(target.id, { date });
  };

  const changeDate = (date: string) => {
    if (date === event.date) return;
    const shifted = event.recipes.filter((l) => l.prepDate).length + tasks.length;
    const title = shifted > 0 ? `Date modifiée · ${plural(shifted, "préparation déplacée", "préparations déplacées")} avec l'événement` : undefined;
    return saveField({ date }, title);
  };

  const addRecipe = (recipeId: string) => {
    const recipe = recipeById.get(recipeId);
    if (!recipe) return;
    setAddingRecipe(false);
    runLines(api.events.lines.add(id, {
      recipeId,
      portions: Math.max(1, Math.round(event.guestCount)),
      ...(recipe.defaultCourse ? { course: recipe.defaultCourse } : {}),
    }));
  };

  const removeLine = async (lineId: string) => {
    setDialog(null);
    await runLines(api.events.lines.remove(id, lineId));
  };

  // ── Extra costs ───────────────────────────────────────────────────────────
  const updateExtraCost = (idx: number, patch: Partial<EventExtraCost>) => {
    const extraCosts = event.extraCosts.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    save({ extraCosts });
  };
  const addExtraCost = () => save({ extraCosts: [...event.extraCosts, { label: "Nouveau coût", amount: 0, kind: "autre" }] });
  const removeExtraCost = (idx: number) => save({ extraCosts: event.extraCosts.filter((_, i) => i !== idx) });

  // ── Overflow actions ──────────────────────────────────────────────────────
  const handleDelete = async () => {
    setBusy(true);
    try {
      await api.events.delete(event.eventId);
      toast({ title: "Événement supprimé" });
      navigate("/events");
    } catch {
      toast({ title: "Erreur lors de la suppression", variant: "destructive" });
      setBusy(false);
    }
  };

  const adjustPortions = async () => {
    const next = Math.round(Number(adjustGuests));
    const old = event.guestCount;
    if (!next || next < 1 || old < 1) return;
    setBusy(true);
    try {
      let latest = event;
      for (const line of event.recipes) {
        const portions = Math.max(1, Math.round((line.portions * next) / old));
        if (portions !== line.portions) latest = await api.events.lines.patch(id, line.lineId, { portions });
      }
      setEvent(latest);
      await saveField({ guestCount: next }, "Portions ajustées");
      setDialog(null);
    } catch {
      toast({ title: "Erreur lors de l'ajustement", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(duplicateDate)) return;
    setBusy(true);
    try {
      const shifted = shiftPrepDates(event, duplicateDate);
      const payload = {
        name: `${event.name} (copie)`,
        date: duplicateDate,
        guestCount: event.guestCount,
        recipes: shifted.recipes.map((l) => ({
          recipeId: l.recipeId,
          portions: l.portions,
          ...(l.course ? { course: l.course } : {}),
          ...(l.notes ? { notes: l.notes } : {}),
          ...(l.prepDate ? { prepDate: l.prepDate } : {}),
        })),
        tasks: shifted.tasks.map((t) => ({ label: t.label, date: t.date, ...(t.notes ? { notes: t.notes } : {}) })),
        extraCosts: event.extraCosts,
        sellingPricePerGuest: event.sellingPricePerGuest,
        notes: event.notes,
        contactName: event.contactName,
        contactPhone: event.contactPhone,
        contactEmail: event.contactEmail,
        clientId: event.clientId,
        prestationType: event.prestationType,
        vatRate: event.vatRate,
        status: "upcoming" as const,
      };
      const created = await api.events.create(payload);
      toast({ title: "Événement dupliqué" });
      setDialog(null);
      navigate(`/events/${created.eventId}`);
    } catch {
      toast({ title: "Erreur lors de la duplication", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const templateCopy = (): Omit<ClientTemplateRequest, "name" | "weekday" | "templateId"> => ({
    guestCount: event.guestCount,
    sellingPricePerGuest: round2(event.sellingPricePerGuest),
    prestationType: event.prestationType,
    vatRate: event.vatRate,
    recipes: event.recipes.map((l) => ({
      recipeId: l.recipeId,
      portions: l.portions,
      ...(l.course ? { course: l.course } : {}),
      ...(l.notes ? { notes: l.notes } : {}),
    })),
    extraCosts: event.extraCosts.map((c) => ({ label: c.label, amount: c.amount, ...(c.kind ? { kind: c.kind } : {}) })),
    notes: event.notes,
  });

  const saveAsTemplate = async () => {
    if (!event.clientId) return;
    setBusy(true);
    try {
      const c = await api.clients.get(event.clientId);
      const copy = templateCopy();
      const templates: ClientTemplateRequest[] = c.templates.map((t) => ({ ...t }));
      const existing = templates.findIndex((t) => t.weekday === templateWeekday);
      if (existing >= 0) templates[existing] = { ...templates[existing], ...copy };
      else templates.push({ name: `${c.name} · ${WEEKDAYS[templateWeekday - 1]}`, weekday: templateWeekday, ...copy });
      await api.clients.update(c.clientId, { templates });
      toast({ title: `Modèle du ${WEEKDAYS[templateWeekday - 1].toLowerCase()} enregistré` });
      setDialog(null);
    } catch {
      toast({ title: "Erreur lors de l'enregistrement du modèle", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const updateTemplate = async () => {
    if (!event.clientId || !event.templateId) return;
    try {
      const c = await api.clients.get(event.clientId);
      const idx = c.templates.findIndex((t) => t.templateId === event.templateId);
      if (idx < 0) { toast({ title: "Modèle introuvable", variant: "destructive" }); return; }
      const templates: ClientTemplateRequest[] = c.templates.map((t) => ({ ...t }));
      templates[idx] = { ...templates[idx], ...templateCopy() };
      await api.clients.update(c.clientId, { templates });
      toast({ title: "Modèle mis à jour" });
    } catch {
      toast({ title: "Erreur lors de la mise à jour du modèle", variant: "destructive" });
    }
  };

  const prestationLabel = event.prestationType ? prestationTypes.find((t) => t.key === event.prestationType)?.label ?? event.prestationType : undefined;

  const exportMenuPdf = () => {
    const doc = new jsPDF();
    const m = 15;
    let y = m + 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(event.name, m, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`${longDayLabel(event.date)} ${event.date.slice(0, 4)}`, m, y);
    y += 6;
    const priceLine = [`${event.guestCount} convives`, `${fmtEur(event.sellingPricePerGuest)} par convive HTVA`];
    if (prestationLabel) priceLine.push(prestationLabel);
    doc.text(priceLine.join(" · "), m, y);
    y += 12;

    for (const group of grouped) {
      if (y > 260) { doc.addPage(); y = m; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(group.course, m, y);
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      for (const line of group.lines) {
        if (y > 275) { doc.addPage(); y = m; }
        doc.text(recipeById.get(line.recipeId)?.name ?? line.recipeId, m + 4, y);
        y += 6;
      }
      y += 4;
    }

    const contact = [client?.name ?? event.contactName, event.contactPhone, event.contactEmail].filter(Boolean);
    if (contact.length > 0) {
      if (y > 270) { doc.addPage(); y = m; }
      y += 4;
      doc.setFontSize(11);
      doc.text(`Contact : ${contact.join(" · ")}`, m, y);
      y += 6;
    }
    if (settings?.company?.name) {
      doc.setFontSize(11);
      doc.text(settings.company.name, m, y + 4);
    }
    doc.save(`menu-${safeFileName(event.name)}.pdf`);
  };

  const exportRecipesPdf = () => {
    const doc = new jsPDF();
    const m = 15;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(event.name, m, m + 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`${longDayLabel(event.date)} ${event.date.slice(0, 4)} · ${event.guestCount} convives`, m, m + 14);
    let startY = m + 24;

    sortEventLines(event.recipes, courses, recipeById).forEach((rl) => {
      const recipe = recipeById.get(rl.recipeId);
      if (!recipe) return;
      const scale = rl.portions / (recipe.portions || 1);
      if (startY > 250) { doc.addPage(); startY = m; }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(`${recipe.name} · ${rl.portions} portion${rl.portions > 1 ? "s" : ""}`, m, startY + 6);
      startY += 10;

      autoTable(doc, {
        startY,
        head: [["", "Ingrédient", "Quantité", "Unité"]],
        body: recipe.ingredients.map((ri) => {
          const ing = ingredientById.get(ri.ingredientId);
          return ["", ing?.name || ri.ingredientId, Number((ri.qty * scale).toFixed(2)).toString(), ri.unit];
        }),
        margin: { left: m },
        styles: { fontSize: 11, cellPadding: 2 },
        headStyles: { fillColor: [60, 60, 60] },
        columnStyles: { 0: { cellWidth: 8 }, 2: { halign: "right" } },
        didDrawCell: (data) => {
          if (data.column.index === 0 && data.row.section === "body") {
            const sz = 3;
            doc.setDrawColor(100, 100, 100);
            doc.rect(data.cell.x + (data.cell.width - sz) / 2, data.cell.y + (data.cell.height - sz) / 2, sz, sz);
          }
        },
      });

      const lastTable = (doc as unknown as Record<string, unknown>).lastAutoTable as { finalY: number } | undefined;
      startY = (lastTable?.finalY ?? startY + 30) + 8;

      if (recipe.techniques.length > 0) {
        if (startY > 250) { doc.addPage(); startY = m; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Préparation", m, startY + 4);
        startY += 9;

        recipe.techniques.forEach((step, i) => {
          const sz = 3.5;
          const lines = doc.splitTextToSize(`${i + 1}. ${step}`, 170);
          if (startY + lines.length * 5.5 > 280) { doc.addPage(); startY = m; }
          doc.setFont("helvetica", "normal");
          doc.setFontSize(11);
          doc.setDrawColor(100, 100, 100);
          doc.rect(m, startY - sz + 0.5, sz, sz);
          doc.text(lines, m + sz + 2, startY);
          startY += lines.length * 5.5 + 2;
        });
        startY += 6;
      } else {
        startY += 2;
      }
    });

    doc.save(`recettes-${safeFileName(event.name)}.pdf`);
  };

  const terminerLabel = event.status === "upcoming" ? "Terminer l'événement" : "Rouvrir";
  const terminer = event.status === "upcoming" ? complete : reopen;

  const menuItems = [
    ...(isTouch ? [{ label: terminerLabel, onClick: terminer }, { kind: "separator" as const }] : []),
    { label: "Modifier", onClick: () => navigate(`/events/${id}/edit`) },
    { label: "Reprendre le coût", onClick: retakeCost },
    { label: "Ajuster les portions aux convives", onClick: () => { setAdjustGuests(String(event.guestCount)); setDialog({ kind: "adjust" }); } },
    { label: "Dupliquer", onClick: () => { setDuplicateDate(addDays(event.date, 7)); setDialog({ kind: "duplicate" }); } },
    ...(event.clientId
      ? [{ label: "Enregistrer comme modèle", onClick: () => { setTemplateWeekday(weekdayOf(event.date)); setDialog({ kind: "template" }); } }]
      : []),
    ...(event.clientId && event.templateId ? [{ label: "Mettre à jour le modèle", onClick: updateTemplate }] : []),
    { label: "Proposition de menu (PDF)", onClick: exportMenuPdf },
    { label: "Exporter les recettes (PDF)", onClick: exportRecipesPdf },
    { kind: "separator" as const },
    { label: "Supprimer", onClick: () => setDialog({ kind: "delete" }), variant: "danger" as const },
  ];

  const canDrag = !isTouch;
  const prefill = billingForm ? prefillFromEvent(event, client, entries, settings ?? { prestationTypes: undefined }, billingForm) : null;
  const recipeOptions = [...recipes]
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .map((r) => ({ value: r.recipeId, label: r.name, detail: r.type }));
  const clientOptions = [...clients]
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .map((c) => ({ value: c.clientId, label: c.name, detail: c.kind === "particulier" ? "Particulier" : c.kind === "entreprise" ? "Entreprise" : undefined }));
  const prestationOptions = prestationTypes.map((t) => ({ value: t.key, label: t.label }));

  const focusPortions = (lineId: string) => {
    lineRefs.current.get(lineId)?.querySelector<HTMLElement>("[data-portions] [role=button]")?.click();
  };

  const renderLine = (group: { course: string; lines: EventRecipeLine[] }, line: EventRecipeLine, index: number) => {
    const recipe = recipeById.get(line.recipeId);
    const status: PrepStatus = line.prepStatus ?? "todo";
    const isDropBefore = dropTarget?.course === group.course && dropTarget.lineId === line.lineId;
    const isMoveOpen = moveTarget?.kind === "line" && moveTarget.id === line.lineId;
    return (
      <div
        key={line.lineId}
        ref={(el) => { if (el) lineRefs.current.set(line.lineId, el); else lineRefs.current.delete(line.lineId); }}
        className={`${dragId === line.lineId ? "opacity-40" : ""} ${isDropBefore ? "shadow-[0_-2px_0_0_var(--primary)]" : ""}`}
        onDragOver={canDrag ? (e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({ course: group.course, lineId: line.lineId }); } : undefined}
        onDrop={canDrag ? (e) => { e.preventDefault(); e.stopPropagation(); handleDrop({ course: group.course, lineId: line.lineId }); } : undefined}
      >
        <div className={ROW}>
          {canDrag && (
            <span
              draggable
              onDragStart={() => setDragId(line.lineId)}
              onDragEnd={() => { setDragId(null); setDropTarget(null); }}
              className="reveal flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-icon active:cursor-grabbing"
              aria-label="Glisser pour réordonner"
            >
              <GripVertical className="h-4 w-4" />
            </span>
          )}
          <LineStatus value={status} isTouch={isTouch} onChange={(v) => patchLine(line.lineId, { prepStatus: v })} />
          <div className="min-w-0 flex-1 px-1">
            <Link to={`/recipes/${line.recipeId}`} title={recipe?.name} className="text-sm text-foreground hover:underline touch:text-base">
              {recipe?.name ?? "Recette supprimée"}
            </Link>
            {line.notes && noteLineId !== line.lineId && <span className="block text-sm text-muted-foreground md:inline"><span className="hidden md:inline"> · </span>{line.notes}</span>}
            {isMoved(line, event) && (
              <Tag colour="gray" className="mt-0.5 md:hidden" title={`Préparée le ${dayPhrase(prepDateOf(line, event))}`}>{shortDayLabel(prepDateOf(line, event))}</Tag>
            )}
          </div>
          <span className="shrink-0 whitespace-nowrap text-sm tabular-nums touch:text-base" data-portions>
            <EditableInlineNum value={line.portions} min={1} onSave={(v) => patchLine(line.lineId, { portions: Math.max(1, Math.round(v)) })} suffix=" port." />
          </span>
          {isMoved(line, event) && (
            <Tag colour="gray" className="hidden shrink-0 md:inline-flex" title={`Préparée le ${dayPhrase(prepDateOf(line, event))}`}>{shortDayLabel(prepDateOf(line, event))}</Tag>
          )}
          <span className="relative inline-flex shrink-0">
            <PersonChips
              personIds={assigneesOf(line, event)}
              people={people}
              size="sm"
              inherited={!line.assignedTo?.length}
              onClick={() => setPickerLineId(line.lineId)}
            />
            {pickerLineId === line.lineId && (
              <PersonPicker
                value={line.assignedTo ?? []}
                options={people}
                onChange={(next) => patchLine(line.lineId, { assignedTo: next })}
                allowInherit
                align="right"
                title={recipe?.name ?? "Assigner"}
                onClose={() => setPickerLineId(null)}
              />
            )}
          </span>
          <span ref={isMoveOpen ? moveAnchorRef : undefined} className="relative inline-flex shrink-0">
            <ActionMenu
              className="reveal"
              title={recipe?.name}
              items={[
                { kind: "section", label: "Changer de catégorie" },
                ...courses.map((c) => ({ kind: "check" as const, label: c, checked: c === group.course, onClick: () => { if (c !== group.course) changeCourse(line, c); } })),
                { kind: "separator" },
                { label: "Monter", onClick: () => moveLine(group.course, index, -1), disabled: index === 0 },
                { label: "Descendre", onClick: () => moveLine(group.course, index, 1), disabled: index === group.lines.length - 1 },
                { label: "Modifier les portions", onClick: () => focusPortions(line.lineId) },
                { label: "Assigner", onClick: () => setPickerLineId(line.lineId) },
                { label: "Note", onClick: () => setNoteLineId(line.lineId) },
                { label: "Déplacer au…", onClick: () => setMoveTarget({ kind: "line", id: line.lineId }) },
                { kind: "separator" },
                { label: "Ouvrir la fiche", onClick: () => navigate(`/events/${id}/lines/${line.lineId}`) },
                { label: "Cuisiner", onClick: () => navigate(`/recipes/${line.recipeId}/cook?portions=${line.portions}&event=${id}&line=${line.lineId}`) },
                { kind: "separator" },
                { label: "Retirer", onClick: () => setDialog({ kind: "removeLine", lineId: line.lineId }), variant: "danger" },
              ]}
            />
            {isMoveOpen && (
              <MoveToDayMenu
                open
                onClose={() => setMoveTarget(null)}
                anchorRef={moveAnchorRef}
                align="right"
                title={`Déplacer « ${recipe?.name ?? "Recette supprimée"} »`}
                eventDate={event.date}
                current={prepDateOf(line, event)}
                days={moveDays}
                onPick={(d) => moveTo({ kind: "line", id: line.lineId }, d)}
              />
            )}
          </span>
        </div>
        {noteLineId === line.lineId && (
          <LineNote
            value={line.notes ?? ""}
            onSave={(v) => { setNoteLineId(null); if (v !== (line.notes ?? "")) patchLine(line.lineId, { notes: v }); }}
            onCancel={() => setNoteLineId(null)}
          />
        )}
      </div>
    );
  };

  const renderTask = (task: EventTask) => {
    const isMoveOpen = moveTarget?.kind === "task" && moveTarget.id === task.taskId;
    return (
      <div key={task.taskId} className={ROW}>
        <LineStatus value={task.prepStatus ?? "todo"} isTouch={isTouch} onChange={(v) => patchTask(task.taskId, { prepStatus: v })} />
        <div className="min-w-0 flex-1 px-1">
          <button type="button" onClick={() => openTaskEdit(task)} title={task.label} className="text-left text-sm text-foreground hover:underline touch:text-base">
            {task.label}
          </button>
          {task.notes && <span className="block text-sm text-muted-foreground md:inline"><span className="hidden md:inline"> · </span>{task.notes}</span>}
          <Tag colour="gray" className="mt-0.5 md:hidden" title={`Le ${dayPhrase(task.date)}`}>{shortDayLabel(task.date)}</Tag>
        </div>
        <Tag colour="gray" className="hidden shrink-0 md:inline-flex" title={`Le ${dayPhrase(task.date)}`}>{shortDayLabel(task.date)}</Tag>
        <span className="relative inline-flex shrink-0">
          <PersonChips
            personIds={assigneesOf(task, event)}
            people={people}
            size="sm"
            inherited={!task.assignedTo?.length}
            onClick={() => setPickerTaskId(task.taskId)}
          />
          {pickerTaskId === task.taskId && (
            <PersonPicker
              value={task.assignedTo ?? []}
              options={people}
              onChange={(next) => patchTask(task.taskId, { assignedTo: next })}
              allowInherit
              align="right"
              title={task.label}
              onClose={() => setPickerTaskId(null)}
            />
          )}
        </span>
        <span ref={isMoveOpen ? moveAnchorRef : undefined} className="relative inline-flex shrink-0">
          <ActionMenu
            className="reveal"
            title={task.label}
            items={[
              { label: "Modifier…", onClick: () => openTaskEdit(task) },
              { label: "Déplacer au…", onClick: () => setMoveTarget({ kind: "task", id: task.taskId }) },
              { label: "Assigner", onClick: () => setPickerTaskId(task.taskId) },
              { kind: "separator" },
              { label: "Supprimer", onClick: () => setDialog({ kind: "removeTask", taskId: task.taskId }), variant: "danger" },
            ]}
          />
          {isMoveOpen && (
            <MoveToDayMenu
              open
              onClose={() => setMoveTarget(null)}
              anchorRef={moveAnchorRef}
              align="right"
              title={`Déplacer « ${task.label} »`}
              eventDate={event.date}
              current={task.date}
              days={moveDays}
              onPick={(d) => moveTo({ kind: "task", id: task.taskId }, d)}
            />
          )}
        </span>
      </div>
    );
  };

  const renderCourseBlock = (group: { course: string; lines: EventRecipeLine[] }) => {
    const isDropHere = dropTarget?.course === group.course && dropTarget.lineId === null;
    return (
      <div key={group.course} className="mt-4 first:mt-0">
        <h3 className="text-base font-semibold">{group.course}</h3>
        <div
          className={`mt-1 rounded transition-colors ${isDropHere ? "bg-selected" : ""}`}
          onDragOver={canDrag ? (e) => { e.preventDefault(); setDropTarget({ course: group.course, lineId: null }); } : undefined}
          onDrop={canDrag ? (e) => { e.preventDefault(); handleDrop({ course: group.course, lineId: null }); } : undefined}
        >
          {group.lines.map((line, index) => renderLine(group, line, index))}
        </div>
      </div>
    );
  };

  const billingButtons = (size: "md" | "lg") => (
    <>
      <Button variant="default" size={size} onClick={() => setBillingForm("acompte")}>Enregistrer un acompte</Button>
      <Button variant="primary" size={size} icon={<Plus />} onClick={() => setBillingForm("facture")}>Créer la facture</Button>
    </>
  );

  const terminerButton = (className: string, size: "md" | "lg") => (
    <Button variant={event.status === "upcoming" && isPast ? "primary" : "default"} size={size} onClick={terminer} className={className}>
      {terminerLabel}
    </Button>
  );

  return (
    <div className="mx-auto max-w-doc">
      <PageHeader
        breadcrumb={[
          { label: `Semaine ${weekNumber}`, to: weekUrl },
          { label: dayMonthShortLabel(event.date), to: `/jour/${event.date}` },
          { label: event.name },
        ]}
        iconKey="evenement"
        title={event.name}
        onTitleChange={(v) => save({ name: v })}
        actions={
          <>
            {terminerButton("hidden md:inline-flex", "md")}
            <ActionMenu items={menuItems} title={event.name} />
          </>
        }
        properties={
          <PropertyList>
            <Property icon={Calendar} label="Date" kind="date" value={event.date} format={longDayLabel} onSave={changeDate} />
            <Property icon={Users} label="Convives" kind="number" value={event.guestCount} min={1} decimals={0} onSave={(v) => saveField({ guestCount: Math.max(1, Math.round(v)) })} />
            <Property icon="🍽" label="Prestation" kind="select" value={event.prestationType ?? ""} options={prestationOptions} colour="gray" placeholder="Choisir une prestation" onSave={(v) => saveField({ prestationType: v })} />
            {clientsConfigured ? (
              <Property
                icon={Building2}
                label="Client"
                kind="relation"
                value={event.clientId ?? ""}
                options={clientOptions}
                href={(cid) => `/clients/${cid}`}
                allowEmpty
                placeholder="Aucun client"
                createLabel="+ Nouveau client"
                onCreateNew={(q) => setNewClient({ name: q })}
                onSave={(v) => saveField({ clientId: v || undefined })}
              />
            ) : (
              <Property icon={Building2} label="Client" kind="computed" value={<Link to="/settings#apropos" className="text-primary hover:underline">Clients non configurés</Link>} />
            )}
            <Property icon={Euro} label="Prix / convive" kind="custom">
              <div ref={priceRef} className="flex items-center gap-1">
                <EditableInlineNum value={event.sellingPricePerGuest} onSave={(v) => save({ sellingPricePerGuest: round2(Math.max(0, v)) })} min={0} suffix=" €" />
                <span className="text-sm text-muted-foreground">HTVA</span>
              </div>
            </Property>
            <Property icon={Phone} label="Contact" kind="custom">
              <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0 md:flex-nowrap">
                <InlineContact value={event.contactName || ""} onSave={(v) => save({ contactName: v })} placeholder="Ajouter un nom" inputMode="text" />
                <Dot className="hidden md:inline" />
                <InlineContact value={event.contactPhone || ""} onSave={(v) => save({ contactPhone: v })} placeholder="Ajouter un téléphone" inputMode="tel" />
                <Dot className="hidden md:inline" />
                <InlineContact value={event.contactEmail || ""} onSave={(v) => save({ contactEmail: v })} placeholder="Ajouter un e-mail" inputMode="email" />
              </div>
            </Property>
            <Property icon={Circle} label="Statut" kind="custom">
              <EditableStatus value={event.status} onSave={(v) => { if (v === "completed") complete(); else reopen(); }} />
              {billing === "facture" && <StatusTag status="invoiced" label={invoiceNumber ? `Facturé n° ${invoiceNumber}` : "Facturé"} />}
              {billing === "acompte_recu" && <StatusTag status="deposit" />}
              {billing === "paye" && <StatusTag status="paid" label={lastPaidAt ? `Payé le ${dayMonthLabel(lastPaidAt)}` : "Payé"} />}
              {!event.prestationType && <Tag colour="red">Type de prestation manquant</Tag>}
            </Property>
            <Property icon="👩‍🍳" label="Équipe" kind="custom">
              <div ref={teamRef} className="relative flex flex-wrap items-center gap-1">
                {(event.assignedTo ?? []).map((pid) => (
                  <button key={pid} type="button" onClick={() => setTeamOpen((o) => !o)} className="inline-flex h-7 items-center gap-1.5 rounded pl-0.5 pr-1.5 text-base hover:bg-hover touch:h-11">
                    <PersonChip personId={pid} people={people} size="sm" />
                    {personName(people, pid)}
                  </button>
                ))}
                <IconButton size="sm" aria-label="Modifier l'équipe" icon={<Plus />} onClick={() => setTeamOpen((o) => !o)} />
                {teamOpen && (
                  <PersonPicker value={event.assignedTo ?? []} options={people} onChange={(ids) => save({ assignedTo: ids })} onClose={() => setTeamOpen(false)} title="Équipe" />
                )}
              </div>
            </Property>
            <Property icon={Clock} label="Heures passées" kind="number" value={event.hoursSpent ?? 0} min={0} suffix="h" onSave={(v) => saveField({ hoursSpent: round2(Math.max(0, v)) })} />
          </PropertyList>
        }
      />

      {terminerButton("mb-4 w-full md:hidden", "lg")}

      <div className="grid grid-cols-2 overflow-hidden rounded-lg bg-surface md:grid-cols-4 md:divide-x md:divide-border">
        <MoneyTile flat label="Coût matières" value={fmtEur(matieres)} sub={costSub} />
        <MoneyTile flat label="Revenu HTVA" value={fmtEur(revenue)} />
        <MoneyTile flat label="Marge" value={fmtEur(margin)} sub={margin < 0 ? "négative" : undefined} />
        <MoneyTile flat label="Marge %" value={`${marginPct.toFixed(1).replace(".", ",")} %`} />
      </div>

      <div id="menu" className="scroll-mt-20">
        <Section
          title="Menu"
          meta={`${event.recipes.length} ligne${event.recipes.length > 1 ? "s" : ""}`}
          action={
            recipeOptions.length > 0 ? (
              <Button variant="ghost" size="sm" icon={<Plus />} onClick={() => { setAddingRecipe((o) => !o); setTimeout(() => addRef.current?.querySelector("input")?.focus(), 50); }}>
                Recette
              </Button>
            ) : undefined
          }
        >
          {recipeOptions.length === 0 ? (
            <EmptyState message="Aucune recette dans le catalogue pour l'instant." action={{ label: "+ Créer une recette", to: "/recipes" }} />
          ) : (
            <>
              {grouped.length === 0 && !addingRecipe && <EmptyState message="Aucune recette au menu." action={{ label: "+ Ajouter une recette", onClick: () => setAddingRecipe(true) }} />}
              <div>{grouped.map(renderCourseBlock)}</div>
              <div className="mt-2" ref={addRef}>
                {addingRecipe ? (
                  <SearchSelect options={recipeOptions} value="" onChange={addRecipe} placeholder="Rechercher une recette…" autoFocus />
                ) : (
                  <Button variant="subtle" size="sm" icon={<Plus />} onClick={() => setAddingRecipe(true)} className="-mx-1">
                    Ajouter une recette
                  </Button>
                )}
              </div>
            </>
          )}
        </Section>
      </div>

      <Section
        title="Tâches"
        meta={plural(tasks.length, "tâche")}
        action={<Button variant="ghost" size="sm" icon={<Plus />} onClick={openTaskCreate}>Tâche</Button>}
      >
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune tâche. Une tâche est un travail sans recette : cuire les sablés, dégeler le poisson.</p>
        ) : (
          <div>{tasks.map(renderTask)}</div>
        )}
      </Section>

      <Section
        title="Coûts supplémentaires"
        meta={event.extraCosts.length > 0 ? fmtEur(sumExtraCosts(event.extraCosts)) : undefined}
        action={<Button variant="ghost" size="sm" icon={<Plus />} onClick={addExtraCost}>Ajouter</Button>}
      >
        {event.extraCosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun coût supplémentaire.</p>
        ) : (
          <div>
            {event.extraCosts.map((ec, i) => (
              <div key={i} className={`${ROW} gap-2`}>
                <span className="min-w-0 flex-1 text-sm touch:text-base">
                  <EditableInlineText value={ec.label} onSave={(v) => { if (v.trim()) updateExtraCost(i, { label: v.trim() }); }} />
                </span>
                <SelectPill
                  value={ec.kind ?? "autre"}
                  options={EXTRA_KINDS}
                  colour="gray"
                  align="right"
                  aria-label="Nature du coût"
                  title="Nature du coût"
                  onChange={(v) => updateExtraCost(i, { kind: v as ExtraCostKind })}
                />
                <span className="w-20 text-right text-sm tabular-nums touch:text-base">
                  <EditableInlineNum value={ec.amount} min={0} onSave={(v) => updateExtraCost(i, { amount: round2(Math.max(0, v)) })} suffix=" €" />
                </span>
                <IconButton size="sm" aria-label="Retirer ce coût" onClick={() => removeExtraCost(i)} icon={<X />} className="reveal" />
              </div>
            ))}
          </div>
        )}
      </Section>

      <div id="facturation" className="scroll-mt-20">
        <Section
          title="Facturation"
          action={!ledgerNotConfigured && !billingForm ? <div className="hidden items-center gap-1 md:flex">{billingButtons("md")}</div> : undefined}
        >
          {!ledgerNotConfigured && !billingForm && <div className="mb-3 flex flex-col gap-2 md:hidden">{billingButtons("lg")}</div>}
          {ledgerNotConfigured ? (
            <Callout emoji="💶" tone="warning">{NOT_CONFIGURED}</Callout>
          ) : (
            <>
              {linkedEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune écriture liée à cet événement.</p>
              ) : (
                <div className="divide-y divide-border">
                  {linkedEntries.map((e) => (
                    <ListRow
                      key={e.entryId}
                      title={`${ENTRY_KIND_LABEL[e.kind] ?? e.kind}${e.number ? ` n° ${e.number}` : ""} · ${e.label} · ${dayMonthLabel(e.date)} · ${fmtEur(e.htva)} HTVA`}
                      trailing={
                        e.paid ? (
                          <StatusTag status="paid" label={e.paidAt ? `Payé le ${dayMonthLabel(e.paidAt)}` : "Payé"} />
                        ) : (
                          <PaidPopover entry={e} onSaved={loadEntries} align="right" trigger={<Tag colour="yellow">À encaisser ▾</Tag>} />
                        )
                      }
                    />
                  ))}
                </div>
              )}
              {billingForm && prefill && (
                <div className="mt-6">
                  <h3 className="text-base font-semibold">{billingForm === "facture" ? "Créer la facture" : "Enregistrer un acompte"}</h3>
                  <dl className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-sm text-muted-foreground">Revenu prévu</dt>
                      <dd className="text-base font-medium tabular-nums">{fmtEur(prefill.revenuePrevu)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-muted-foreground">Acomptes déjà reçus</dt>
                      <dd className="text-base font-medium tabular-nums">{fmtEur(prefill.acomptesRecus)}</dd>
                    </div>
                  </dl>
                  <div className="mt-4">
                    <LedgerEntryForm
                      key={billingForm}
                      initial={prefill.entry}
                      kind={billingForm}
                      eventOptions={[{ eventId: event.eventId, label: `${event.name} · ${dayMonthShortLabel(event.date)}` }]}
                      clientOptions={clients.map((c) => ({ clientId: c.clientId, name: c.name }))}
                      onSaved={() => {
                        setBillingForm(null);
                        loadEntries();
                        toast({ title: billingForm === "facture" ? "Facture enregistrée" : "Acompte enregistré" });
                      }}
                      onCancel={() => setBillingForm(null)}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </Section>
      </div>

      <Section title="Notes">
        <EditableText
          value={event.notes || ""}
          onSave={(v) => save({ notes: v })}
          className="min-h-8 whitespace-pre-wrap text-base leading-relaxed text-foreground"
          placeholder="Ajouter une note…"
          multiline
        />
      </Section>

      <Dialog
        open={dialog?.kind === "delete"}
        onClose={() => setDialog(null)}
        title="Confirmer la suppression"
        size="sm"
        footer={<DialogActions onCancel={() => setDialog(null)} onConfirm={handleDelete} confirmLabel="Supprimer" danger busy={busy} />}
      >
        <p className="text-muted-foreground">Cette action est irréversible.</p>
      </Dialog>

      <Dialog
        open={dialog?.kind === "removeLine"}
        onClose={() => setDialog(null)}
        title="Retirer cette recette du menu ?"
        size="sm"
        footer={<DialogActions onCancel={() => setDialog(null)} onConfirm={() => { if (dialog?.kind === "removeLine") removeLine(dialog.lineId); }} confirmLabel="Retirer" danger />}
      >
        <p className="text-muted-foreground">
          {dialog?.kind === "removeLine" ? recipeById.get(event.recipes.find((l) => l.lineId === dialog.lineId)?.recipeId ?? "")?.name ?? "Cette ligne" : ""} sera retirée de l'événement.
        </p>
      </Dialog>

      <Dialog
        open={dialog?.kind === "removeTask"}
        onClose={() => setDialog(null)}
        title={`Supprimer la tâche « ${dialog?.kind === "removeTask" ? tasks.find((t) => t.taskId === dialog.taskId)?.label ?? "" : ""} » ?`}
        size="sm"
        footer={
          <DialogActions
            onCancel={() => setDialog(null)}
            onConfirm={() => { if (dialog?.kind === "removeTask") { deleteTask(dialog.taskId).catch(() => undefined); setDialog(null); } }}
            confirmLabel="Supprimer"
            danger
          />
        }
      >
        <p className="text-muted-foreground">Cette action est irréversible.</p>
      </Dialog>

      <TaskDialog
        open={taskDialog !== null}
        onClose={() => setTaskDialog(null)}
        mode={taskDialog?.mode ?? "create"}
        initial={taskDialog?.initial ?? { label: "", date: event.date, eventId: event.eventId, assignedTo: [], notes: "" }}
        events={[]}
        people={people}
        onSubmit={submitTask}
        onDelete={taskDialog?.mode === "edit" && taskDialog.taskId ? () => deleteTask(taskDialog.taskId as string) : undefined}
      />

      <NewClientDialog
        open={newClient !== null}
        onClose={() => setNewClient(null)}
        initial={{
          name: newClient?.name || event.contactName,
          kind: "particulier",
          contactName: event.contactName,
          phone: event.contactPhone,
          email: event.contactEmail,
        }}
        existing={clients}
        onCreated={async (c) => {
          setClients([...clients, c]);
          // The client exists now, so the dialog closes even when linking fails.
          await saveField({ clientId: c.clientId }, "Client créé et lié").catch(() => undefined);
        }}
        onLinkExisting={(cid) => saveField({ clientId: cid }, "Client lié").catch(() => undefined)}
      />

      <Dialog
        open={dialog?.kind === "adjust"}
        onClose={() => setDialog(null)}
        title="Ajuster les portions aux convives"
        size="sm"
        footer={<DialogActions onCancel={() => setDialog(null)} onConfirm={adjustPortions} confirmLabel="Ajuster" busy={busy} />}
      >
        <p className="text-muted-foreground">Chaque ligne sera rescalée par le rapport nouveau / ancien nombre de convives ({event.guestCount} aujourd'hui).</p>
        <div className="mt-4">
          <FieldLabel htmlFor="adjust-guests">Nouveau nombre de convives</FieldLabel>
          <input id="adjust-guests" type="number" min={1} inputMode="numeric" value={adjustGuests} onChange={(e) => setAdjustGuests(e.target.value)} className="input-field" />
        </div>
      </Dialog>

      <Dialog
        open={dialog?.kind === "duplicate"}
        onClose={() => setDialog(null)}
        title="Dupliquer l'événement"
        size="sm"
        footer={<DialogActions onCancel={() => setDialog(null)} onConfirm={duplicate} confirmLabel="Dupliquer" busy={busy} />}
      >
        <FieldLabel htmlFor="duplicate-date">Date du nouvel événement (même jour, semaine suivante par défaut)</FieldLabel>
        <input id="duplicate-date" type="date" value={duplicateDate} onChange={(e) => setDuplicateDate(e.target.value)} className="input-field" />
      </Dialog>

      <Dialog
        open={dialog?.kind === "template"}
        onClose={() => setDialog(null)}
        title="Enregistrer comme modèle"
        size="sm"
        footer={<DialogActions onCancel={() => setDialog(null)} onConfirm={saveAsTemplate} confirmLabel="Enregistrer" busy={busy} />}
      >
        <p className="text-muted-foreground">Le menu, les convives, le prix et les coûts de cet événement deviennent le modèle de {client?.name ?? "ce client"} pour le jour choisi.</p>
        <div className="mt-4">
          <FieldLabel htmlFor="template-weekday">Jour de la semaine</FieldLabel>
          <select id="template-weekday" value={templateWeekday} onChange={(e) => setTemplateWeekday(Number(e.target.value))} className="input-field">
            {WEEKDAYS.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}
          </select>
        </div>
      </Dialog>
    </div>
  );
}

function Dot({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`text-icon ${className}`}>·</span>;
}

// 16px status dot in a 28px hit area; a tap cycles on touch, a click opens the three options on pointer screens.
function LineStatus({ value, isTouch, onChange }: { value: PrepStatus; isTouch: boolean; onChange: (v: PrepStatus) => void }) {
  const menu = useMenu();
  const dot = value === "done"
    ? "bg-status-done text-white"
    : value === "doing"
      ? "bg-status-doing"
      : "border-[1.5px] border-[rgba(55,53,47,0.45)]";
  return (
    <div ref={menu.ref} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={`Statut : ${STATUS_LABEL[value]}`}
        aria-haspopup={isTouch ? undefined : "menu"}
        onClick={() => { if (isTouch) onChange(NEXT_STATUS[value]); else menu.toggle(); }}
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-hover touch:h-11 touch:w-11"
      >
        <span className={`flex h-4 w-4 items-center justify-center rounded-full ${dot}`}>
          {value === "done" && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
      </button>
      <Menu {...menu.props} aria-label="Statut de préparation">
        {PREP_STATUS_OPTIONS.map((o) => (
          <MenuRadio key={o.value} checked={o.value === value} onSelect={() => { if (o.value !== value) onChange(o.value); }}>
            <PillTag option={o} />
          </MenuRadio>
        ))}
      </Menu>
    </div>
  );
}

// Inline contact value with a placeholder; the placeholder is not printed.
function InlineContact({ value, onSave, placeholder, inputMode }: { value: string; onSave: (v: string) => void; placeholder: string; inputMode: "tel" | "email" | "text" }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  useEffect(() => { if (!editing) setText(value); }, [value, editing]);
  const commit = () => { setEditing(false); if (text !== value) onSave(text.trim()); };
  if (editing) {
    return (
      <input
        autoFocus
        inputMode={inputMode}
        className="-mx-1 w-44 rounded bg-input-bg px-1 text-base shadow-ring outline-none"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { e.preventDefault(); setText(value); setEditing(false); } }}
      />
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditing(true); } }}
      className={`prop-value inline-flex min-h-6 shrink-0 items-center whitespace-nowrap text-base ${value ? "" : "no-print text-placeholder"}`}
    >
      {value || placeholder}
    </span>
  );
}

function LineNote({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(value);
  return (
    <div className="px-1 pb-2 pl-8">
      <textarea
        autoFocus
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onSave(text.trim())}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        placeholder="Note pour cette ligne…"
        className="input-field"
      />
    </div>
  );
}

function DialogActions({ onCancel, onConfirm, confirmLabel, danger, busy }: { onCancel: () => void; onConfirm: () => void; confirmLabel: string; danger?: boolean; busy?: boolean }) {
  return (
    <>
      <Button variant="default" size="md" onClick={onCancel}>Annuler</Button>
      <Button variant={danger ? "danger" : "primary"} size="md" onClick={onConfirm} disabled={busy}>{confirmLabel}</Button>
    </>
  );
}
