import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, EyeOff, MoreHorizontal, Plus, Printer, Share2, ShoppingCart, X } from "lucide-react";
import type { EventCostSnapshot, Ingredient, Person, PrepLine, PrepStatus, Recipe } from "@packages/types";
import {
  addDays, buildCostSnapshot, calcRecipeCost, datesOfIsoWeek, filterByPerson, fmtQty, groupByPerson, groupByRecipe, isoWeekOf, longDayLabel,
  parseIsoWeek, parseYmd, personName, prepLinesForDate, shortEventName,
} from "@packages/types";
import { api } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { buildGroceryItems, groceryTitleFor } from "@/lib/grocery";
import { NEXT_STATUS, plural, prestationLabel, usePlanningData } from "@/lib/use-planning-data";
import { useToast } from "@/hooks/use-toast";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { clearMiseEnPlace } from "@/hooks/use-mise-en-place";
import { useBackLink, useFullBleed, useTopTitle } from "@/components/admin/AdminLayout";
import PlanningBar from "@/components/admin/PlanningBar";
import PersonChips, { PersonChip } from "@/components/admin/PersonChips";
import PersonPicker from "@/components/admin/PersonPicker";
import { Dot, StatusDot, STATUS_LABEL } from "@/components/admin/StatusDot";
import {
  Button, EmptyState, FilterButton, FilterChip, FilterGroup, IconButton, Menu, MenuCheck, MenuItem, MenuRadio, MenuSection, MenuSeparator,
  PageHeader, SectionToggle, SelectPill, StatusControl, useMenu,
} from "@/components/ui";

type Mode = "evenement" | "categorie" | "recette" | "personne";

const MODES: Mode[] = ["evenement", "categorie", "recette", "personne"];
const GROUP_OPTIONS = [
  { value: "evenement", label: "Événement" },
  { value: "categorie", label: "Catégorie" },
  { value: "recette", label: "Recette" },
];

const SWIPE_PX = 60;
// Row content sits above the full-row link overlay; an open menu lifts its row above the next ones.
const ABOVE = "relative z-10 hover:z-30 focus-within:z-30";

const shortDate = new Intl.DateTimeFormat("fr-BE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// "Sam. 17 oct."
function navLabel(date: string): string {
  const s = shortDate.format(parseYmd(date));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "Sam 17 oct"
function crumbLabel(date: string): string {
  return navLabel(date).replace(/\./g, "");
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
  return MODES.some((m) => m === v);
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
  const touch = useTouchScreen();
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
  useBackLink({ to: weekUrl, label: `Semaine ${weekNumber}` });
  useTopTitle(title);
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
      // Every active person gets a heading, even with no line that day.
      const byPerson = groupByPerson(allLines, people);
      const found = new Map(byPerson.map((g) => [g.personId, g]));
      const base = activePeople.map((p) => found.get(p.personId) ?? { personId: p.personId, name: p.name, lines: [] as PrepLine[] });
      const rest = byPerson.filter((g) => !activePeople.some((p) => p.personId === g.personId));
      return [...base, ...rest].map((g) => ({
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
  }, [mode, visible, dayEvents, allLines, clientById, recipeById, settings, people, activePeople]);

  // "Par personne" keeps empty groups so each person sees their own heading.
  const shownGroups = mode === "personne" ? groups : groups.filter((g) => g.lines.length > 0);
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

  if (!valid) return <Navigate to={`/semaine/${isoWeekOf(todayIso())}`} replace />;

  const prepUrl = (l: PrepLine) => `/events/${l.eventId}/lines/${l.lineId}${personne ? `?personne=${encodeURIComponent(personne)}` : ""}`;
  const done = lines.filter((l) => l.prepStatus === "done").length;
  const meta = personne
    ? `${plural(lines.length, "ligne")} · ${done} ${done === 1 ? "faite" : "faites"}`
    : `${plural(dayEvents.length, "événement")} · ${plural(guests, "convive")} · ${plural(lines.length, "ligne")} · ${done} ${done === 1 ? "faite" : "faites"}`;
  const personOptions: Person[] = personne && !activePeople.some((p) => p.personId === personne)
    ? [...activePeople, { personId: personne, name: personName(people, personne), active: false }]
    : activePeople;
  const filterCount = (personne ? 1 : 0) + (hideDone ? 1 : 0);
  const canFinish = safeDate < today && upcoming.length > 0;
  const finishLabel = `Terminer ${upcoming.length === 1 ? "l'événement" : `les ${upcoming.length} événements`}`;
  const personQuery = personne ? `?personne=${encodeURIComponent(personne)}` : "";
  const newEventUrl = `/events/new?date=${safeDate}&retour=${encodeURIComponent(here)}`;

  const actionItems = (
    <>
      <MenuItem icon={<ShoppingCart />} disabled={busy} onSelect={createGrocery}>Courses du jour</MenuItem>
      <MenuItem icon={<Printer />} onSelect={() => window.print()}>Imprimer</MenuItem>
      {activePeople.length > 0 && !personne && (
        <MenuItem icon={<Printer />} onSelect={() => { setParam("mode", "personne"); setPrintPending(true); }}>Imprimer par personne</MenuItem>
      )}
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

  // On touch the ⋯ sheet also carries the grouping and the filters.
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
        {touch && touchFilterItems}
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

  const empty = !loading && !error && lines.length === 0;

  return (
    <div className="mx-auto max-w-wide pb-24 print:max-w-none" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <PageHeader
        iconKey="semaine"
        breadcrumb={[{ label: `Semaine ${weekNumber}`, to: weekUrl }, { label: crumbLabel(safeDate) }]}
        title={title}
        meta={meta}
        className="no-print"
      />
      <h1 className="hidden text-h1 print:block">{title}</h1>

      <PlanningBar
        view={mode === "personne" ? "personne" : "day"}
        weekHref={weekUrl}
        dayHref={`/jour/${safeDate}${personQuery}${hideDone ? `${personQuery ? "&" : "?"}masquer=faites` : ""}`}
        personHref={activePeople.length > 0 && !personne ? `/jour/${safeDate}?mode=personne${hideDone ? "&masquer=faites" : ""}` : undefined}
        dateLabel={navLabel(safeDate)}
        onPrev={() => navigate(dayUrl(addDays(safeDate, -1)), { state: location.state })}
        onNext={() => navigate(dayUrl(addDays(safeDate, 1)), { state: location.state })}
        onPick={(d) => navigate(dayUrl(d), { state: location.state })}
        pickValue={safeDate}
        isToday={safeDate === today}
        onToday={() => navigate(dayUrl(today), { state: location.state })}
        after={groupPill}
        right={(
          <>
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
        rightTouch={<>{moreMenu}<IconButton variant="primary" size="sm" as={Link} to={newEventUrl} aria-label="Nouvel événement" title="Nouvel événement" icon={<Plus />} /></>}
        filters={filterChips}
        dates={weekDates}
        counts={counts}
        today={today}
        selected={safeDate}
        stripHref={dayUrl}
        linkState={location.state}
      />

      <div className="max-w-doc">
        {error && <p className="mt-4 text-sm text-danger">{error}</p>}
        {loading && <p className="mt-6 text-sm text-muted-foreground">Chargement…</p>}
        {empty && !personne && (
          <EmptyState message="Aucune ligne à préparer ce jour." action={{ label: "+ Nouvel événement", to: newEventUrl }} />
        )}
        {empty && personne && serviceEvents.length === 0 && (
          <EmptyState message={`Aucune ligne pour ${personName(people, personne)} ce jour.`} action={{ label: "Toutes les personnes", to: `/jour/${safeDate}` }} />
        )}
        {!loading && !error && lines.length > 0 && (personne ? personLines.length === 0 : groups.every((g) => g.lines.length === 0)) && (
          <p className="mt-6 text-sm text-muted-foreground touch:text-base">Tout est fait.</p>
        )}

        {personne ? (
          <>
            {personLines.length > 0 && (
              <ul className="mt-4">
                {personLines.map((line) => (
                  <LineRow key={line.lineId} line={line} people={people} to={prepUrl(line)} from={here} onStatus={(s) => setStatus(line, s)} onCycle={() => setStatus(line, NEXT_STATUS[line.prepStatus])} second={[line.clientName ?? line.eventName, line.course, line.notes].filter(Boolean).join(" · ")} />
                ))}
              </ul>
            )}
            {serviceEvents.length > 0 && (
              <section className="mt-6">
                <h2 className="text-h3">Service</h2>
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
            <section key={group.key} className={i > 0 ? "mt-6 print-break" : "mt-4"}>
              <header className="sticky top-[96px] z-[15] bg-background py-2 md:top-0">
                <div className="flex min-h-7 items-center justify-between gap-3">
                  <h2 className="flex min-w-0 items-center gap-2 text-h3">
                    {mode === "personne" && group.personId && <PersonChip personId={group.personId} people={people} size="md" />}
                    <span className="min-w-0 truncate">{group.title}</span>
                  </h2>
                  <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{group.count}</span>
                  {mode === "personne" && group.personId && (
                    <>
                      <Button variant="ghost" size="sm" aria-label={`Partager la liste de ${group.title}`} className="no-print hidden md:inline-flex" onClick={() => share(group.personId ?? undefined)} icon={<Share2 />}>Partager</Button>
                      <IconButton variant="ghost" size="sm" aria-label={`Partager la liste de ${group.title}`} className="no-print md:hidden" onClick={() => share(group.personId ?? undefined)} icon={<Share2 />} />
                    </>
                  )}
                  {mode === "personne" && group.personId === null && (
                    <GroupAssign people={activePeople} onChange={(next) => assignAll(group.lines, next)} />
                  )}
                </div>
                {group.subtitle && <p className="text-sm text-muted-foreground">{group.subtitle}</p>}
              </header>

              {group.lines.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">Rien ce jour.</p>
              ) : mode !== "recette" ? (
                <ul>
                  {group.lines.map((line) => (
                    <LineRow
                      key={line.lineId}
                      line={line}
                      people={people}
                      to={prepUrl(line)}
                      from={here}
                      onStatus={(s) => setStatus(line, s)}
                      onCycle={() => setStatus(line, NEXT_STATUS[line.prepStatus])}
                      onAssign={activePeople.length > 0 ? (next) => assignLine(line, next) : undefined}
                      second={mode === "evenement"
                        ? [line.course, line.notes].filter(Boolean).join(" · ")
                        : [line.clientName ?? line.eventName, line.course, line.notes].filter(Boolean).join(" · ")}
                    />
                  ))}
                </ul>
              ) : (
                <RecipeGroupBody group={group} people={people} ingredientById={ingredientById} prepUrl={prepUrl} from={here} onStatus={(s) => setAllStatus(group.lines, s)} />
              )}
            </section>
          ))
        )}
      </div>

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
    </div>
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
}

// One prep line: the pill on pointer screens, the dot on touch; the whole row links to the fiche.
function LineRow({ line, people, to, from, second, onStatus, onCycle, onAssign }: LineRowProps) {
  const isDone = line.prepStatus === "done";
  return (
    <li className={`relative flex min-h-9 items-center gap-2 rounded px-2 hover:bg-hover touch:min-h-11 ${isDone ? "text-muted-foreground" : ""}`}>
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
        <LineAssign line={line} people={people} onChange={onAssign} />
      ) : (
        <PersonChips personIds={line.assignedTo} people={people} size="sm" inherited={!line.ownAssignment} className={ABOVE} />
      )}
      <span className={`${ABOVE} shrink-0 text-sm tabular-nums`}>{line.portions}</span>
    </li>
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
      <PersonChips personIds={line.assignedTo} people={people} size="sm" inherited={!line.ownAssignment} onClick={() => setOpen(true)} className="no-print" />
      <span className="hidden print:inline"><PersonChips personIds={line.assignedTo} people={people} size="sm" /></span>
      {open && (
        <PersonPicker
          value={line.ownAssignment ? line.assignedTo : []}
          options={people}
          onChange={onChange}
          allowInherit
          onClose={() => setOpen(false)}
          align="right"
          title="Assigner la ligne"
        />
      )}
    </span>
  );
}

// "Assigner tout" on the Sans personne heading; every toggle writes the whole group.
function GroupAssign({ people, onChange }: { people: Person[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string[]>([]);
  return (
    <span className={`no-print relative inline-flex shrink-0 ${open ? "z-20" : ""}`}>
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
      <div className="no-print mt-1 flex items-center gap-2 text-sm text-muted-foreground">
        <span>Statut</span>
        <StatusControl value={merged} onChange={onStatus} />
      </div>
      <ul className="mt-2">
        {group.lines.map((line) => (
          <li key={line.lineId}>
            <Link to={prepUrl(line)} state={{ from }} className="flex min-h-9 items-center gap-2 rounded px-2 text-sm hover:bg-hover touch:min-h-11 touch:text-base">
              <Dot status={line.prepStatus} />
              <span className="min-w-0 flex-1">
                {line.clientName ?? line.eventName}
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
