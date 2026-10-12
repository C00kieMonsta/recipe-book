import { useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ChevronUp, ChevronDown, GripVertical, Plus, X } from "lucide-react";
import type {
  AppEvent,
  AppSettings,
  Client,
  ClientTemplateRequest,
  EventCostSnapshot,
  EventExtraCost,
  EventRecipeLine,
  ExtraCostKind,
  Ingredient,
  LedgerEntry,
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
} from "@packages/types";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { dayLabel, longDayLabel, dayMonthLabel, weekdayOf, todayIso } from "@/lib/dates";
import {
  PageHeader,
  Section,
  SectionToggle,
  Tag,
  StatusTag,
  ListRow,
  StatusControl,
  MoneyTile,
  FieldLabel,
  ActionMenu,
  SearchSelect,
  EditableText,
  EditableInlineText,
  EditableInlineNum,
} from "@/components/ui";
import LedgerEntryForm from "@/components/comptes/LedgerEntryForm";
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

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\s-]/g, "").trim() || "evenement";
}

type DropTarget = { course: string; lineId: string | null };

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isTouch = useMediaQuery("(hover: none)");
  const isPhone = useMediaQuery("(max-width: 767.98px)");

  const [event, setEvent] = useState<AppEvent | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [ledgerNotConfigured, setLedgerNotConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [dialog, setDialog] = useState<
    | { kind: "delete" }
    | { kind: "removeLine"; lineId: string }
    | { kind: "adjust" }
    | { kind: "duplicate" }
    | { kind: "template" }
    | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [adjustGuests, setAdjustGuests] = useState("");
  const [duplicateDate, setDuplicateDate] = useState(todayIso());
  const [templateWeekday, setTemplateWeekday] = useState(1);

  const [addingRecipe, setAddingRecipe] = useState(false);
  const [noteLineId, setNoteLineId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [billingForm, setBillingForm] = useState<"facture" | "acompte" | null>(null);

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
        if (e instanceof ApiError && e.status === 503) return [] as Client[];
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

  const saveField = async (patch: Partial<AppEvent>, okTitle?: string) => {
    if (!id) return;
    try {
      const updated = await api.events.update(id, patch);
      setEvent(updated);
      if (okTitle) toast({ title: okTitle });
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    }
  };

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

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;
  if (loadError || !event || !id) return <div className="p-8 text-muted-foreground">Événement introuvable.</div>;

  const client = event.clientId ? clients.find((c) => c.clientId === event.clientId) : undefined;
  const prestationLabel = event.prestationType ? prestationTypes.find((t) => t.key === event.prestationType)?.label ?? event.prestationType : undefined;
  const cost = calcEventCost(event, recipeCostById, recipePortionsById);
  const matieres = cost.rawMaterial + cost.extras.matiere;
  const revenue = signedRevenue(event);
  const margin = revenue - cost.total;
  const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
  const costSub = event.actualCost != null ? "réel" : event.costSnapshot ? `figé le ${dayMonthLabel(event.costSnapshot.takenAt)}` : "estimé";

  const linkedEntries = entriesForEvent(event.eventId, entries);
  const billing = eventBillingStatus(event.eventId, entries);
  const invoiceNumber = linkedEntries.find((e) => isInvoiceEntry(e) && e.number)?.number;
  const lastPaidAt = linkedEntries.map((e) => e.paidAt).filter((d): d is string => !!d).sort().pop();

  const buildSnapshot = (): Omit<EventCostSnapshot, "takenAt"> => {
    const lines = event.recipes.map((l) => {
      const unitCost = (recipeCostById.get(l.recipeId) ?? 0) / (recipePortionsById.get(l.recipeId) ?? 1);
      return { lineId: l.lineId, recipeId: l.recipeId, portions: l.portions, unitCost };
    });
    return {
      rawMaterial: round2(lines.reduce((s, l) => s + l.unitCost * l.portions, 0)),
      extrasTotal: round2(sumExtraCosts(event.extraCosts)),
      lines,
    };
  };

  const complete = () => saveField({ status: "completed", costSnapshot: buildSnapshot() as EventCostSnapshot }, "Événement terminé");
  const reopen = () => saveField({ status: "upcoming" }, "Événement rouvert");
  const retakeCost = () => saveField({ costSnapshot: buildSnapshot() as EventCostSnapshot }, "Coût repris");

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

  const patchLine = (lineId: string, patch: { portions?: number; prepStatus?: PrepStatus; notes?: string }) =>
    runLines(api.events.lines.patch(id, lineId, patch));

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

  // ── Extra costs and hours ─────────────────────────────────────────────────
  const updateExtraCost = (idx: number, patch: Partial<EventExtraCost>) => {
    const extraCosts = event.extraCosts.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    saveField({ extraCosts });
  };
  const addExtraCost = () => saveField({ extraCosts: [...event.extraCosts, { label: "Nouveau coût", amount: 0, kind: "autre" }] });
  const removeExtraCost = (idx: number) => saveField({ extraCosts: event.extraCosts.filter((_, i) => i !== idx) });

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
      const payload = {
        name: `${event.name} (copie)`,
        date: duplicateDate,
        guestCount: event.guestCount,
        recipes: event.recipes.map((l) => ({
          recipeId: l.recipeId,
          portions: l.portions,
          ...(l.course ? { course: l.course } : {}),
          ...(l.notes ? { notes: l.notes } : {}),
        })),
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

  const menuItems = [
    { label: "Modifier", onClick: () => navigate(`/events/${id}/edit`) },
    { label: "Reprendre le coût", onClick: retakeCost },
    { label: "Ajuster les portions aux convives", onClick: () => { setAdjustGuests(String(event.guestCount)); setDialog({ kind: "adjust" }); } },
    { label: "Dupliquer", onClick: () => { setDuplicateDate(todayIso()); setDialog({ kind: "duplicate" }); } },
    ...(event.clientId
      ? [{ label: "Enregistrer comme modèle", onClick: () => { setTemplateWeekday(weekdayOf(event.date)); setDialog({ kind: "template" }); } }]
      : []),
    ...(event.clientId && event.templateId ? [{ label: "Mettre à jour le modèle", onClick: updateTemplate }] : []),
    { label: "Proposition de menu (PDF)", onClick: exportMenuPdf },
    { label: "Exporter les recettes (PDF)", onClick: exportRecipesPdf },
    { label: "Supprimer", onClick: () => setDialog({ kind: "delete" }), variant: "danger" as const },
  ];

  const canDrag = !isTouch && !isPhone;
  const prefill = billingForm ? prefillFromEvent(event, client, entries, settings ?? { prestationTypes: undefined }, billingForm) : null;
  const recipeOptions = [...recipes]
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .map((r) => ({ value: r.recipeId, label: r.name, detail: r.type }));

  const renderCourseBlock = (group: { course: string; lines: EventRecipeLine[] }) => {
    const isDropHere = dropTarget?.course === group.course && dropTarget.lineId === null;
    const body = (
      <div
        className={`rounded-lg transition-colors ${isDropHere ? "bg-primary-soft/40" : ""}`}
        onDragOver={canDrag ? (e) => { e.preventDefault(); setDropTarget({ course: group.course, lineId: null }); } : undefined}
        onDrop={canDrag ? (e) => { e.preventDefault(); handleDrop({ course: group.course, lineId: null }); } : undefined}
      >
        {group.lines.map((line, index) => {
          const recipe = recipeById.get(line.recipeId);
          const status: PrepStatus = line.prepStatus ?? "todo";
          const isDropBefore = dropTarget?.course === group.course && dropTarget.lineId === line.lineId;
          return (
            <div
              key={line.lineId}
              className={`border-b border-border/60 last:border-b-0 ${dragId === line.lineId ? "opacity-40" : ""} ${isDropBefore ? "border-t-2 border-t-primary" : ""}`}
              onDragOver={canDrag ? (e) => { e.preventDefault(); e.stopPropagation(); setDropTarget({ course: group.course, lineId: line.lineId }); } : undefined}
              onDrop={canDrag ? (e) => { e.preventDefault(); e.stopPropagation(); handleDrop({ course: group.course, lineId: line.lineId }); } : undefined}
            >
              <div className="flex min-h-14 flex-wrap items-center gap-1 py-1">
                {canDrag && (
                  <span
                    draggable
                    onDragStart={() => setDragId(line.lineId)}
                    onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                    className="flex min-h-11 min-w-8 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
                    aria-label="Glisser pour réordonner"
                  >
                    <GripVertical className="h-5 w-5" />
                  </span>
                )}
                <div className="flex shrink-0">
                  <button type="button" aria-label="Monter" disabled={index === 0} onClick={() => moveLine(group.course, index, -1)} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-hover disabled:opacity-30">
                    <ChevronUp className="h-5 w-5" />
                  </button>
                  <button type="button" aria-label="Descendre" disabled={index === group.lines.length - 1} onClick={() => moveLine(group.course, index, 1)} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-hover disabled:opacity-30">
                    <ChevronDown className="h-5 w-5" />
                  </button>
                </div>
                <div className="min-w-[8rem] flex-1 px-1">
                  <Link to={`/recipes/${line.recipeId}`} className="text-base font-medium text-foreground hover:underline">
                    {recipe?.name ?? "Recette supprimée"}
                  </Link>
                  {line.notes && noteLineId !== line.lineId && <div className="text-sm text-muted-foreground">{line.notes}</div>}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-base tabular-nums">
                    <EditableInlineNum value={line.portions} min={1} onSave={(v) => patchLine(line.lineId, { portions: Math.max(1, Math.round(v)) })} suffix=" port." />
                  </span>
                  <StatusDot value={status} isTouch={isTouch} onChange={(v) => patchLine(line.lineId, { prepStatus: v })} />
                  <select
                    aria-label="Catégorie"
                    value={group.course}
                    onChange={(e) => changeCourse(line, e.target.value)}
                    className="input-field input-compact min-h-11 w-auto"
                  >
                    {courses.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ActionMenu items={[
                    { label: "Note", onClick: () => setNoteLineId(line.lineId) },
                    { label: "Cuisiner", onClick: () => navigate(`/recipes/${line.recipeId}/cook?portions=${line.portions}&event=${id}&line=${line.lineId}`) },
                    { label: "Retirer", onClick: () => setDialog({ kind: "removeLine", lineId: line.lineId }), variant: "danger" },
                  ]} />
                </div>
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
        })}
      </div>
    );
    if (isPhone) {
      return (
        <SectionToggle key={group.course} title={`${group.course} · ${group.lines.length}`} defaultOpen storageKey={`event-course-${group.course}`} className="mt-6">
          {body}
        </SectionToggle>
      );
    }
    return (
      <div key={group.course} className="mt-6">
        <h3 className="text-lead font-semibold">{group.course}</h3>
        <div className="mt-2">{body}</div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-doc">
      <PageHeader
        breadcrumb={[
          { label: "Événements", to: "/events" },
          { label: `${client?.name ?? event.name} · ${dayLabel(event.date)}` },
        ]}
        title={
          <EditableText
            value={event.name}
            onSave={(v) => { if (v.trim()) saveField({ name: v.trim() }); }}
            className="font-serif text-h1 md:text-h1-lg"
            inputClassName="w-full border-b-2 border-primary bg-transparent font-serif text-h1 outline-none md:text-h1-lg"
          />
        }
        meta={
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{longDayLabel(event.date)}</span>
              <span aria-hidden="true">·</span>
              <EditableInlineNum value={event.guestCount} onSave={(v) => saveField({ guestCount: Math.max(1, Math.round(v)) })} min={1} suffix=" convives" />
              {prestationLabel && (<><span aria-hidden="true">·</span><span>{prestationLabel}</span></>)}
              {client && (<><span aria-hidden="true">·</span><Link to={`/clients/${client.clientId}`} className="text-foreground hover:underline">{client.name}</Link></>)}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span>Prix par convive HTVA : <EditableInlineNum value={event.sellingPricePerGuest} onSave={(v) => saveField({ sellingPricePerGuest: round2(Math.max(0, v)) })} min={0} suffix=" €" /></span>
              <span aria-hidden="true">·</span>
              <span>Contact : <EditableInlineText value={event.contactName || ""} onSave={(v) => saveField({ contactName: v })} placeholder="Nom" /></span>
              <EditableInlineText value={event.contactPhone || ""} onSave={(v) => saveField({ contactPhone: v })} placeholder="Téléphone" />
              <EditableInlineText value={event.contactEmail || ""} onSave={(v) => saveField({ contactEmail: v })} placeholder="E-mail" />
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <StatusTag status={event.status} />
              {billing === "facture" && <StatusTag status="invoiced" label={invoiceNumber ? `Facturé n° ${invoiceNumber}` : "Facturé"} />}
              {billing === "acompte_recu" && <StatusTag status="deposit" />}
              {billing === "paye" && <StatusTag status="paid" label={lastPaidAt ? `Payé le ${dayMonthLabel(lastPaidAt)}` : "Payé"} />}
              {!event.prestationType && <Tag variant="warning">Type de prestation manquant</Tag>}
            </div>
          </div>
        }
        actions={
          <>
            {event.status === "upcoming" ? (
              <button type="button" onClick={complete} className="min-h-11 rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground hover:opacity-90">
                Terminer l'événement
              </button>
            ) : (
              <button type="button" onClick={reopen} className="min-h-11 rounded-lg border border-border px-4 text-base font-medium hover:bg-hover">
                Rouvrir
              </button>
            )}
            <ActionMenu items={menuItems} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MoneyTile label="Coût matières" value={fmtEur(matieres)} sub={costSub} />
        <MoneyTile label="Revenu HTVA" value={fmtEur(revenue)} />
        <MoneyTile label="Marge" value={fmtEur(margin)} sub={margin < 0 ? "négative" : undefined} />
        <MoneyTile label="Marge %" value={`${marginPct.toFixed(1)} %`} />
      </div>

      <Section
        title="Menu"
        meta={`${event.recipes.length} ligne${event.recipes.length > 1 ? "s" : ""}`}
        action={
          <button type="button" onClick={() => setAddingRecipe((o) => !o)} className="flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 text-base font-medium hover:bg-hover">
            <Plus className="h-4 w-4" /> Recette
          </button>
        }
      >
        {addingRecipe && (
          <div className="mb-4">
            <FieldLabel>Ajouter une recette</FieldLabel>
            <SearchSelect options={recipeOptions} value="" onChange={addRecipe} placeholder="Rechercher une recette…" />
          </div>
        )}
        {grouped.length === 0 && !addingRecipe && <p className="text-base text-muted-foreground">Aucune recette au menu.</p>}
        {grouped.map(renderCourseBlock)}
      </Section>

      <Section
        title="Coûts supplémentaires"
        meta={event.extraCosts.length > 0 ? fmtEur(sumExtraCosts(event.extraCosts)) : undefined}
        action={
          <button type="button" onClick={addExtraCost} className="flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 text-base font-medium hover:bg-hover">
            <Plus className="h-4 w-4" /> Ajouter
          </button>
        }
      >
        {event.extraCosts.length === 0 ? (
          <p className="text-base text-muted-foreground">Aucun coût supplémentaire.</p>
        ) : (
          <div>
            {event.extraCosts.map((ec, i) => (
              <div key={i} className="flex min-h-14 flex-wrap items-center gap-2 border-b border-border/60 py-1 last:border-b-0">
                <span className="min-w-[8rem] flex-1 text-base">
                  <EditableInlineText value={ec.label} onSave={(v) => { if (v.trim()) updateExtraCost(i, { label: v.trim() }); }} />
                </span>
                <select
                  aria-label="Nature du coût"
                  value={ec.kind ?? "autre"}
                  onChange={(e) => updateExtraCost(i, { kind: e.target.value as ExtraCostKind })}
                  className="input-field input-compact min-h-11 w-auto"
                >
                  {EXTRA_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
                <span className="text-base tabular-nums">
                  <EditableInlineNum value={ec.amount} min={0} onSave={(v) => updateExtraCost(i, { amount: round2(Math.max(0, v)) })} suffix=" €" />
                </span>
                <button type="button" aria-label="Retirer ce coût" onClick={() => removeExtraCost(i)} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-hover hover:text-destructive">
                  <X className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Heures">
        <p className="text-base">
          Heures passées : <EditableInlineNum value={event.hoursSpent ?? 0} min={0} onSave={(v) => saveField({ hoursSpent: round2(Math.max(0, v)) })} suffix=" h" />
        </p>
      </Section>

      <Section
        title="Facturation"
        action={!ledgerNotConfigured && !billingForm ? (
          <>
            <button type="button" onClick={() => setBillingForm("acompte")} className="min-h-11 rounded-lg border border-border px-3 text-base font-medium hover:bg-hover">
              Enregistrer un acompte
            </button>
            <button type="button" onClick={() => setBillingForm("facture")} className="min-h-11 rounded-lg bg-primary px-3 text-base font-medium text-primary-foreground hover:opacity-90">
              Créer la facture
            </button>
          </>
        ) : undefined}
      >
        {ledgerNotConfigured ? (
          <p className="text-base text-muted-foreground">{NOT_CONFIGURED}</p>
        ) : (
          <>
            {linkedEntries.length === 0 ? (
              <p className="text-base text-muted-foreground">Aucune écriture liée à cet événement.</p>
            ) : (
              <div>
                {linkedEntries.map((e) => (
                  <ListRow
                    key={e.entryId}
                    title={`${ENTRY_KIND_LABEL[e.kind] ?? e.kind}${e.number ? ` n° ${e.number}` : ""} · ${e.label}`}
                    subtitle={`${dayMonthLabel(e.date)} · ${fmtEur(e.htva)} HTVA`}
                    trailing={e.paid ? <StatusTag status="paid" label={e.paidAt ? `Payé le ${dayMonthLabel(e.paidAt)}` : "Payé"} /> : <Tag variant="warning">À encaisser</Tag>}
                    className="border-b border-border/60 last:border-b-0"
                  />
                ))}
              </div>
            )}
            {billingForm && prefill && (
              <div className="mt-6">
                <h3 className="text-lead font-semibold">{billingForm === "facture" ? "Créer la facture" : "Enregistrer un acompte"}</h3>
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
                    eventOptions={[{ eventId: event.eventId, label: `${event.name} · ${dayLabel(event.date)}` }]}
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

      <Section title="Notes">
        <EditableText
          value={event.notes || ""}
          onSave={(v) => saveField({ notes: v })}
          className="min-h-[2.5rem] whitespace-pre-wrap text-base leading-relaxed text-foreground"
          inputClassName="input-field min-h-[120px]"
          placeholder="Ajouter des notes visibles pour toute l'équipe…"
          multiline
        />
      </Section>

      {dialog?.kind === "delete" && (
        <Dialog title="Confirmer la suppression" onClose={() => setDialog(null)}>
          <p className="text-base text-muted-foreground">Cette action est irréversible.</p>
          <DialogActions onCancel={() => setDialog(null)} onConfirm={handleDelete} confirmLabel="Supprimer" danger busy={busy} />
        </Dialog>
      )}

      {dialog?.kind === "removeLine" && (
        <Dialog title="Retirer cette recette du menu ?" onClose={() => setDialog(null)}>
          <p className="text-base text-muted-foreground">{recipeById.get(event.recipes.find((l) => l.lineId === dialog.lineId)?.recipeId ?? "")?.name ?? "Cette ligne"} sera retirée de l'événement.</p>
          <DialogActions onCancel={() => setDialog(null)} onConfirm={() => removeLine(dialog.lineId)} confirmLabel="Retirer" danger />
        </Dialog>
      )}

      {dialog?.kind === "adjust" && (
        <Dialog title="Ajuster les portions aux convives" onClose={() => setDialog(null)}>
          <p className="text-base text-muted-foreground">Chaque ligne sera rescalée par le rapport nouveau / ancien nombre de convives ({event.guestCount} aujourd'hui).</p>
          <div className="mt-4 text-left">
            <FieldLabel htmlFor="adjust-guests">Nouveau nombre de convives</FieldLabel>
            <input id="adjust-guests" type="number" min={1} inputMode="numeric" value={adjustGuests} onChange={(e) => setAdjustGuests(e.target.value)} className="input-field" />
          </div>
          <DialogActions onCancel={() => setDialog(null)} onConfirm={adjustPortions} confirmLabel="Ajuster" busy={busy} />
        </Dialog>
      )}

      {dialog?.kind === "duplicate" && (
        <Dialog title="Dupliquer l'événement" onClose={() => setDialog(null)}>
          <div className="text-left">
            <FieldLabel htmlFor="duplicate-date">Date du nouvel événement</FieldLabel>
            <input id="duplicate-date" type="date" value={duplicateDate} onChange={(e) => setDuplicateDate(e.target.value)} className="input-field" />
          </div>
          <DialogActions onCancel={() => setDialog(null)} onConfirm={duplicate} confirmLabel="Dupliquer" busy={busy} />
        </Dialog>
      )}

      {dialog?.kind === "template" && (
        <Dialog title="Enregistrer comme modèle" onClose={() => setDialog(null)}>
          <p className="text-base text-muted-foreground">Le menu, les convives, le prix et les coûts de cet événement deviennent le modèle de {client?.name ?? "ce client"} pour le jour choisi.</p>
          <div className="mt-4 text-left">
            <FieldLabel htmlFor="template-weekday">Jour de la semaine</FieldLabel>
            <select id="template-weekday" value={templateWeekday} onChange={(e) => setTemplateWeekday(Number(e.target.value))} className="input-field">
              {WEEKDAYS.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}
            </select>
          </div>
          <DialogActions onCancel={() => setDialog(null)} onConfirm={saveAsTemplate} confirmLabel="Enregistrer" busy={busy} />
        </Dialog>
      )}
    </div>
  );
}

function StatusDot({ value, isTouch, onChange }: { value: PrepStatus; isTouch: boolean; onChange: (v: PrepStatus) => void }) {
  const [open, setOpen] = useState(false);
  const dot = value === "done" ? "bg-success" : value === "doing" ? "bg-warning" : "border-2 border-muted-foreground";
  return (
    <div
      className="relative"
      onMouseEnter={isTouch ? undefined : () => setOpen(true)}
      onMouseLeave={isTouch ? undefined : () => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`Statut : ${STATUS_LABEL[value]}`}
        onClick={() => { if (isTouch) onChange(NEXT_STATUS[value]); else setOpen((o) => !o); }}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-hover"
      >
        <span className={`block h-3.5 w-3.5 rounded-full ${dot}`} />
      </button>
      {open && !isTouch && (
        <div className="absolute right-0 top-full z-20 w-80 rounded-lg border border-border bg-card p-1 shadow-lg">
          <StatusControl value={value} onChange={(v) => { onChange(v); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

function LineNote({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(value);
  return (
    <div className="pb-3 pl-1 pr-1">
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

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="w-[92%] max-w-sm rounded-2xl bg-card p-6 text-center shadow-xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-serif text-h3">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function DialogActions({ onCancel, onConfirm, confirmLabel, danger, busy }: { onCancel: () => void; onConfirm: () => void; confirmLabel: string; danger?: boolean; busy?: boolean }) {
  return (
    <div className="mt-6 flex justify-center gap-3">
      <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-border px-4 text-base font-medium hover:bg-hover">Annuler</button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className={`min-h-11 rounded-lg px-4 text-base font-medium disabled:opacity-60 ${danger ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
