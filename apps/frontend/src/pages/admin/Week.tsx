import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronRight, MoreHorizontal, Plus, Printer, Share2, ShoppingCart, UserPlus } from "lucide-react";
import type { AppEvent, Client, EventRecipeLine, Person, PrepStatus, PrestationTypeSetting, WeekDay } from "@packages/types";
import {
  addDays,
  assigneesOf,
  buildCostSnapshot,
  calcRecipeCost,
  datesOfIsoWeek,
  dayLabel,
  DEFAULT_PRESTATION_TYPES,
  isoWeekOf,
  longDayLabel,
  monthSignedRevenue,
  objectifMensuel,
  parseIsoWeek,
  parseYmd,
  personName,
  shortEventName,
  sortEventLines,
  weekChecklist,
  rangeLabel,
  weekdayOf,
  weekGroceryList,
  weekPlan,
  ymOf,
} from "@packages/types";
import { api } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { buildGroceryItems, groceryTitleFor } from "@/lib/grocery";
import { fmtEur0, NEXT_STATUS, plural, usePlanningData } from "@/lib/use-planning-data";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useToast } from "@/hooks/use-toast";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { useFullBleed, useTopTitle } from "@/components/admin/AdminLayout";
import { StatusDot } from "@/components/admin/StatusDot";
import PersonChips, { PersonChip } from "@/components/admin/PersonChips";
import PersonPicker from "@/components/admin/PersonPicker";
import WeekChecklist from "@/components/admin/WeekChecklist";
import AssignSheet from "@/components/admin/AssignSheet";
import PlanningBar from "@/components/admin/PlanningBar";
import FirstRunCallout from "@/components/admin/FirstRunCallout";
import { OPEN_CHECKLIST_EVENT } from "@/components/admin/tour-steps";
import {
  Button, Dialog, FieldLabel, FilterButton, FilterChip, FilterGroup, IconButton,
  Menu, MenuCheck, MenuItem, MenuRadio, MenuSection, MenuSeparator, PageHeader, useMenu,
} from "@/components/ui";

const SWIPE_PX = 60;
const LAST_WEEK_KEY = "recipe-book:last-week";

type WeekView = "lines" | "events";
type PrintMode = "week" | "person";

const num0 = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 0 });
const dayMonthShort = new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "short", timeZone: "UTC" });

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

function lineStatus(line: EventRecipeLine): PrepStatus {
  return line.prepStatus ?? "todo";
}

function doneCount(ev: AppEvent): number {
  return ev.recipes.filter((l) => l.prepStatus === "done").length;
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
  const thursday = dates[3];
  const ym = ymOf(thursday);
  const year = thursday.slice(0, 4);
  const weekNo = parseIsoWeek(safeWeek).week;
  const prevWeek = isoWeekOf(addDays(monday, -7));
  const nextWeek = isoWeekOf(addDays(monday, 7));
  const todayWeek = isoWeekOf(today);
  const started = monday <= today;
  const todayInWeek = dates.includes(today);
  const from = location.pathname + location.search;
  const search = location.search;
  useTopTitle(`Semaine ${weekNo}`);

  const data = usePlanningData(year, { withLists: true });
  const {
    events, clients, clientsConfigured, settings, entries, ledgerConfigured, groceryLists, people,
    recipeById, clientById, ingredientById, recipes, courses, loading, error, patchLine, patchEvent, reload,
  } = data;

  const selectedClient = searchParams.get("client") ?? "";
  const selectedPerson = searchParams.get("personne") ?? "";
  const setParam = (key: "client" | "personne", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  };
  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("client");
    next.delete("personne");
    setSearchParams(next, { replace: true });
  };

  const [view, setView] = useLocalStorage<WeekView>("recipe-book:week-view", "lines");
  const [checklistOpen, setChecklistOpen] = useLocalStorage<boolean>("recipe-book:checklist-open", true);
  const [sheet, setSheet] = useState<{ client: Client; guestCount: number } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode>("week");
  const [printTick, setPrintTick] = useState(0);
  const touch = useTouchScreen();
  const menu = useMenu();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const dayRefs = useRef<Record<string, HTMLElement | null>>({});

  const activePeople = useMemo(() => people.filter((p) => p.active), [people]);
  const firstRun = !loading && recipes.length === 0 && events.length === 0 && activePeople.length === 0;
  const prestationTypes: PrestationTypeSetting[] = settings?.prestationTypes?.length ? settings.prestationTypes : DEFAULT_PRESTATION_TYPES;

  const weekEvents = useMemo(
    () => events.filter((e) => e.date.slice(0, 10) >= dates[0] && e.date.slice(0, 10) <= dates[6]),
    [events, dates],
  );
  const clientsThisWeek = useMemo(
    () => clients.filter((c) => weekEvents.some((e) => e.clientId === c.clientId)),
    [clients, weekEvents],
  );
  const filteredEvents = useMemo(
    () => (selectedClient ? weekEvents.filter((e) => e.clientId === selectedClient) : weekEvents),
    [weekEvents, selectedClient],
  );
  const plan = useMemo(() => weekPlan(filteredEvents, monday, people), [filteredEvents, monday, people]);
  // The money line always describes the whole week whatever the filters.
  const weekTotals = useMemo(() => weekPlan(weekEvents, monday), [weekEvents, monday]);
  const monthSigned = useMemo(() => monthSignedRevenue(events, ym), [events, ym]);
  const objective = objectifMensuel(settings?.objectives?.[year], ym);
  const recipeCostById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, calcRecipeCost(r, ingredientById)])), [recipes, ingredientById]);
  const recipePortionsById = useMemo(() => new Map(recipes.map((r) => [r.recipeId, r.portions || 1])), [recipes]);

  const checklist = useMemo(
    () => weekChecklist({ weekDates: dates, today, events, clients, clientsConfigured, groceryLists, entries, ledgerConfigured, people }),
    [dates, today, events, clients, clientsConfigured, groceryLists, entries, ledgerConfigured, people],
  );
  const coveringList = useMemo(() => weekGroceryList(weekEvents.map((e) => e.eventId), groceryLists), [weekEvents, groceryLists]);

  // The sidebar "Semaine" link returns here.
  useEffect(() => {
    if (valid) sessionStorage.setItem(LAST_WEEK_KEY, from);
  }, [valid, from]);

  const weekUrl = useCallback((w: string) => `/semaine/${w}${search}`, [search]);
  const retour = encodeURIComponent(`/semaine/${safeWeek}`);
  const newEventUrl = (date: string) => `/events/new?date=${date}${selectedClient ? `&client=${selectedClient}` : ""}&retour=${retour}`;
  const personQuery = selectedPerson ? `?personne=${encodeURIComponent(selectedPerson)}` : "";
  const dayUrl = (date: string) => `/jour/${date}${personQuery}`;
  const prepUrl = (eventId: string, lineId: string) => `/events/${eventId}/lines/${lineId}${personQuery}`;
  const state = { from };
  const anchorDay = todayInWeek ? today : monday;

  const modalOpen = Boolean(sheet) || assignOpen || menu.open;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e) || modalOpen) return;
      if (e.key === "ArrowLeft") navigate(weekUrl(prevWeek));
      if (e.key === "ArrowRight") navigate(weekUrl(nextWeek));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, weekUrl, prevWeek, nextWeek, modalOpen]);

  useEffect(() => {
    if (printTick > 0) window.print();
  }, [printTick]);

  // The guided tour opens the checklist for its second step.
  useEffect(() => {
    const open = () => setChecklistOpen(true);
    window.addEventListener(OPEN_CHECKLIST_EVENT, open);
    return () => window.removeEventListener(OPEN_CHECKLIST_EVENT, open);
  }, [setChecklistOpen]);

  const scrollToDay = useCallback((date: string) => {
    dayRefs.current[date]?.scrollIntoView({ block: "start" });
  }, []);

  // Phone: today is brought into view once loaded; on a Sunday looking at next week, the first day with events.
  useEffect(() => {
    if (loading || window.innerWidth >= 1280) return;
    const target = todayInWeek ? today : weekdayOf(today) === 7 ? plan.days.find((d) => d.events.length > 0)?.date : undefined;
    if (target && target !== dates[0]) scrollToDay(target);
  }, [safeWeek, loading]);

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
    navigate(weekUrl(dx < 0 ? nextWeek : prevWeek));
  };

  const fail = (title: string) => toast({ title, variant: "destructive" });

  const cycle = useCallback(async (ev: AppEvent, line: EventRecipeLine) => {
    try { await patchLine(ev.eventId, line.lineId, { prepStatus: NEXT_STATUS[lineStatus(line)] }); }
    catch { fail("Erreur lors de la mise à jour du statut"); }
  }, [patchLine]);

  const assignEvent = useCallback(async (eventId: string, assignedTo: string[]) => {
    try { await patchEvent(eventId, { assignedTo }); }
    catch { fail("Erreur lors de l'assignation"); }
  }, [patchEvent]);

  const assignLine = useCallback(async (eventId: string, lineId: string, assignedTo: string[]) => {
    try { await patchLine(eventId, lineId, { assignedTo }); }
    catch { fail("Erreur lors de l'assignation"); }
  }, [patchLine]);

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
      const costSnapshot = { ...buildCostSnapshot(ev, recipeCostById, recipePortionsById), takenAt: new Date().toISOString() };
      await patchEvent(eventId, { status: "completed", costSnapshot });
      toast({ title: "Événement terminé" });
      reload();
    } catch {
      fail("Erreur lors de la clôture");
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

  const print = (mode: PrintMode) => { setPrintMode(mode); setPrintTick((t) => t + 1); };

  if (!valid) return <Navigate to={`/semaine/${isoWeekOf(today)}${search}`} replace />;

  const dayMeta = (d: WeekDay, short = false) => {
    if (d.events.length === 0) return "aucun événement";
    const base = `${d.events.length} évén. · ${d.guests} conv.`;
    return started && d.linesTotal > 0 ? `${base} · ${d.linesDone}/${d.linesTotal} faites` : base;
  };
  const dayTitle = (d: WeekDay) => `${plural(d.events.length, "événement")} · ${plural(d.guests, "convive")}${started && d.linesTotal ? ` · ${d.linesDone} ${d.linesDone === 1 ? "ligne faite" : "lignes faites"} sur ${d.linesTotal}` : ""}`;
  const clientOf = (ev: AppEvent) => (ev.clientId ? clientById.get(ev.clientId) : undefined);
  const recipeName = (id: string) => recipeById.get(id)?.name ?? id;
  const hasPersonLine = (ev: AppEvent) => !selectedPerson || ev.recipes.some((l) => assigneesOf(l, ev).includes(selectedPerson));
  const isOtherPerson = (ev: AppEvent, line: EventRecipeLine) => Boolean(selectedPerson) && !assigneesOf(line, ev).includes(selectedPerson);
  const canAssign = !touch && activePeople.length > 0;
  const counts = Object.fromEntries(plan.days.map((d) => [d.date, d.events.length]));
  // The tour spotlights the chips of this card only.
  const firstEventId = plan.days.find((d) => d.events.length > 0)?.events[0]?.eventId;
  const filterCount = (selectedClient ? 1 : 0) + (selectedPerson ? 1 : 0);
  const showClientFilter = clientsConfigured && clientsThisWeek.length > 0;
  const showPersonFilter = activePeople.length > 0;

  const { linesDone, linesTotal } = weekTotals;
  const doneFragment = started && linesTotal > 0 ? (
    <>
      <span className="hidden md:inline"> · {linesDone} {linesDone === 1 ? "ligne de préparation faite" : "lignes de préparation faites"} sur {linesTotal}</span>
      <span className="md:hidden"> · {linesDone}/{linesTotal} lignes faites</span>
    </>
  ) : null;
  const monthLink = objective !== undefined
    ? { to: `/comptes/apercu?year=${year}`, text: `Objectif du mois ${fmtEur0(monthSigned)} / ${fmtEur0(objective)}`, short: `Objectif ${num0.format(monthSigned)} / ${fmtEur0(objective)}` }
    : { to: `/comptes/previsionnel?year=${year}`, text: "Définir l'objectif du mois", short: "Définir l'objectif du mois" };

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
    </>
  );

  const actionItems = (
    <>
      <MenuSection label="Afficher">
        <MenuCheck checked={view === "lines"} onChange={() => setView("lines")}>Afficher les lignes</MenuCheck>
        <MenuCheck checked={view === "events"} onChange={() => setView("events")}>Afficher les événements</MenuCheck>
      </MenuSection>
      <MenuSeparator />
      <MenuItem icon={<ShoppingCart />} disabled={busy || loading} onSelect={() => createGrocery(filteredEvents)}>Créer les courses de la semaine</MenuItem>
      <MenuItem icon={<Printer />} onSelect={() => print("week")}>Imprimer</MenuItem>
      <MenuItem icon={<Printer />} onSelect={() => print("person")}>Imprimer par personne</MenuItem>
      {activePeople.map((p) => (
        <MenuItem key={p.personId} icon={<Share2 />} onSelect={() => share(p)}>Partager avec {p.name}</MenuItem>
      ))}
    </>
  );

  // On touch the ⋯ sheet also carries the two filters.
  const touchFilterItems = (showClientFilter || showPersonFilter) && (
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
      <MenuSeparator />
    </>
  );

  const moreMenu = (
    <div ref={menu.ref} className="relative inline-flex">
      <IconButton size="sm" aria-label="Plus d'actions" aria-haspopup="menu" aria-expanded={menu.open} onClick={menu.toggle} icon={<MoreHorizontal />} />
      <Menu {...menu.props} align="right" title={`Semaine ${weekNo}`} aria-label="Plus d'actions">
        {touch && touchFilterItems}
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
    </>
  ) : undefined;

  return (
    <div className="mx-auto max-w-wide print:max-w-none">
      <PageHeader
        iconKey="semaine"
        title={`Semaine ${weekNo}`}
        className="no-print"
        meta={(
          <span className="tabular-nums" data-tour="week-stats">
            <abbr title="Chiffre d'affaires HTVA des événements confirmés" className="no-underline">Signé</abbr> {fmtEur0(weekTotals.signedRevenue)} HTVA · {weekTotals.guests} <span className="hidden md:inline">convives</span><span className="md:hidden">conv.</span>{doneFragment}
            {/* The separator travels with the link so a wrapped line never ends on a lone dot. */}
            <span className="whitespace-nowrap">
              {" · "}
              <Link to={monthLink.to} state={state} className="inline-flex items-center gap-0.5 rounded text-primary hover:bg-hover touch:min-h-11">
                <span className="hidden md:inline">{monthLink.text}</span>
                <span className="md:hidden">{monthLink.short}</span>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </span>
          </span>
        )}
      />

      {/* Navigation and strip, shared with the day page; swipe changes the week on the phone */}
      <PlanningBar
        view="week"
        weekHref={weekUrl(safeWeek)}
        dayHref={`/jour/${anchorDay}${personQuery}`}
        dayTabLabel={anchorDay === today ? "Aujourd'hui" : dayLabel(anchorDay)}
        personHref={activePeople.length > 0 ? `/jour/${anchorDay}?mode=personne` : undefined}
        dateLabel={<><span className="hidden md:inline">Semaine {weekNo} · </span>{shortRange(dates[0], dates[6])}</>}
        onPrev={() => navigate(weekUrl(prevWeek))}
        onNext={() => navigate(weekUrl(nextWeek))}
        onPick={(d) => navigate(weekUrl(isoWeekOf(d)))}
        pickValue={monday}
        isToday={safeWeek === todayWeek}
        onToday={() => navigate(weekUrl(todayWeek))}
        right={(
          <>
            {(showClientFilter || showPersonFilter) && (
              <FilterButton count={filterCount} onClear={clearFilters}>{filterGroups}</FilterButton>
            )}
            {moreMenu}
            {newButton}
          </>
        )}
        rightTouch={<>{moreMenu}{newButtonTouch}</>}
        filters={filterChips}
        dates={dates}
        counts={counts}
        today={today}
        stripHref={dayUrl}
        linkState={state}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      />
      {error && <p className="no-print mt-3 text-sm text-danger">{error}</p>}

      {/* Checklist */}
      {!loading && (
        <div className="no-print mt-3" data-tour="week-checklist">
          <FirstRunCallout hidden={Boolean(selectedPerson)} />
          <WeekChecklist
            items={checklist}
            firstRun={firstRun}
            open={checklistOpen}
            onToggle={() => setChecklistOpen((o) => !o)}
            from={from}
            monday={monday}
            prestationTypes={prestationTypes}
            coveringList={coveringList}
            busy={busy}
            onCreateClientWeek={openClientSheet}
            onSetType={setType}
            onAssign={() => setAssignOpen(true)}
            onCreateGroceries={(ids) => createGrocery(weekEvents.filter((e) => ids.includes(e.eventId)))}
            onCloseEvent={closeEvent}
          />
        </div>
      )}

      {loading && <p className="mt-6 text-sm text-muted-foreground">Chargement…</p>}

      {/* Laptop: seven columns */}
      {!loading && (
        <div className="mt-4 hidden grid-cols-[repeat(7,minmax(0,1fr))] gap-2 xl:grid print:hidden">
          {plan.days.map((day, i) => {
            const isToday = day.date === today;
            const past = day.date < today;
            const dayPeople = plan.peopleByDay[day.date] ?? [];
            const [dayName, dayNum] = dayLabel(day.date).split(" ");
            return (
              <div key={day.date} className={`group min-w-0 ${past ? "opacity-60" : ""}`}>
                <div className="sticky top-0 z-10 bg-background pb-1">
                  <div className="flex items-start gap-1">
                    <Link to={dayUrl(day.date)} state={state} title={dayTitle(day)} data-tour={i === 0 ? "week-day" : undefined} className="min-w-0 flex-1 rounded px-1 hover:bg-hover">
                      <div className="flex h-7 items-center gap-1 text-sm font-semibold">
                        <span>{dayName}</span>
                        <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 tabular-nums ${isToday ? "bg-danger-solid text-white" : ""}`}>{dayNum}</span>
                      </div>
                      <div className="truncate text-caption text-muted-foreground">{dayMeta(day, true)}</div>
                    </Link>
                    <IconButton size="sm" as={Link} to={newEventUrl(day.date)} aria-label={`Nouvel événement le ${longDayLabel(day.date)}`} className="reveal mt-1" icon={<Plus />} />
                  </div>
                  {dayPeople.length > 0 && (
                    <div className="flex h-7 items-center gap-0.5 px-1">
                      <span className="mr-1 text-caption text-muted-foreground">Équipe</span>
                      {dayPeople.slice(0, 4).map((id) => (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={selectedPerson === id}
                          aria-label={personName(people, id)}
                          title={`Filtrer sur ${personName(people, id)}`}
                          onClick={() => setParam("personne", selectedPerson === id ? "" : id)}
                          className={`rounded-full ${selectedPerson === id ? "shadow-[0_0_0_2px_#2383e2]" : ""}`}
                        >
                          <PersonChip personId={id} people={people} size="sm" />
                        </button>
                      ))}
                      {dayPeople.length > 4 && <span className="text-caption text-muted-foreground">+{dayPeople.length - 4}</span>}
                    </div>
                  )}
                </div>
                <div className="space-y-2 px-0.5 pb-2">
                  {day.events.map((ev) => {
                    const client = clientOf(ev);
                    const title = shortEventName(ev, client);
                    const total = ev.recipes.length;
                    const done = doneCount(ev);
                    // The "Assigner" button takes its own row; the column is too narrow for it next to the title.
                    const unassigned = (ev.assignedTo ?? []).length === 0;
                    if (!hasPersonLine(ev)) {
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
                            <div className="mt-0.5 text-caption text-muted-foreground">
                              {ev.guestCount} conv. · {plural(total, "ligne")}{view === "events" && total > 0 ? ` · ${plural(done, "faite")}` : ""}
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
                        {view === "lines" && total > 0 && (
                          <ul className="mt-1">
                            {sortEventLines(ev.recipes, courses, recipeById).map((line) => {
                              const status = lineStatus(line);
                              const own = Boolean(line.assignedTo?.length);
                              const ids = assigneesOf(line, ev);
                              const dim = isOtherPerson(ev, line);
                              return (
                                <li key={line.lineId} className={`flex h-7 items-center gap-0.5 rounded text-sm hover:bg-hover ${dim ? "opacity-40" : ""}`}>
                                  <StatusDot value={status} onCycle={() => cycle(ev, line)} />
                                  <Link to={prepUrl(ev.eventId, line.lineId)} state={state} title={recipeName(line.recipeId)} className={`min-w-0 flex-1 truncate rounded px-0.5 ${status === "done" ? "text-muted-foreground" : ""}`}>
                                    {recipeName(line.recipeId)}
                                  </Link>
                                  {/* Inherited people are shown dimmed so every line has a click target. */}
                                  {(own || ids.length > 0) && (
                                    <AssignChips value={ids} picked={own ? ids : []} options={people} enabled={canAssign} inherited={!own} allowInherit max={2} onChange={(next) => assignLine(ev.eventId, line.lineId, next)} title="Assigner la ligne" label={`Assigner ${recipeName(line.recipeId)}`} />
                                  )}
                                  <span className={`pl-0.5 pr-1 tabular-nums ${status === "done" ? "text-muted-foreground" : "text-muted-foreground"}`}>{line.portions}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                  <Button variant="ghost" size="sm" as={Link} to={newEventUrl(day.date)} icon={<Plus />} className="w-full justify-start text-muted-foreground">Nouvel événement</Button>
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
            return (
              <section key={day.date} ref={(el) => { dayRefs.current[day.date] = el; }} className={`scroll-mt-24 md:scroll-mt-0 ${past ? "opacity-60" : ""}`}>
                <div className="sticky top-[96px] z-10 -mx-4 flex min-h-11 items-center gap-1 bg-background px-4 md:static md:mx-0 md:px-0">
                  <Link to={dayUrl(day.date)} state={state} data-tour={i === 0 ? "week-day" : undefined} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded hover:bg-hover">
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold">
                      {dayName}
                      <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 tabular-nums ${isToday ? "bg-danger-solid text-white" : ""}`}>{dayNum}</span>
                    </span>
                    <span className="min-w-0 truncate text-sm text-muted-foreground">{empty ? "aucun événement" : dayMeta(day)}</span>
                    {!empty && <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-icon" aria-hidden="true" />}
                  </Link>
                  {empty && (
                    <IconButton size="sm" as={Link} to={newEventUrl(day.date)} aria-label={`Nouvel événement le ${longDayLabel(day.date)}`} icon={<Plus />} />
                  )}
                </div>
                {day.events.map((ev) => {
                  const client = clientOf(ev);
                  const title = shortEventName(ev, client);
                  const collapsed = !hasPersonLine(ev);
                  return (
                    <div key={ev.eventId} className="mt-1">
                      <Link to={`/events/${ev.eventId}`} state={state} className={`flex min-h-11 items-center gap-2 rounded-lg bg-background px-3 shadow-card hover:bg-hover ${collapsed ? "text-muted-foreground" : ""}`}>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium touch:text-base">{title}</span>
                        {!collapsed && <span className="shrink-0 text-sm text-muted-foreground">{ev.guestCount} conv.</span>}
                        <PersonChips personIds={ev.assignedTo ?? []} people={people} size="sm" />
                      </Link>
                      {!collapsed && (
                        <ul className="mt-1">
                          {sortEventLines(ev.recipes, courses, recipeById).map((line) => {
                            const status = lineStatus(line);
                            const own = Boolean(line.assignedTo?.length);
                            const ids = assigneesOf(line, ev);
                            return (
                              <li key={line.lineId} className={`flex min-h-11 items-center ${isOtherPerson(ev, line) ? "opacity-40" : ""}`}>
                                <StatusDot value={status} onCycle={() => cycle(ev, line)} />
                                <Link to={prepUrl(ev.eventId, line.lineId)} state={state} className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded px-1 text-sm hover:bg-hover touch:text-base ${status === "done" ? "text-muted-foreground" : ""}`}>
                                  <span className="min-w-0 flex-1 truncate">{recipeName(line.recipeId)}</span>
                                  <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{line.portions}</span>
                                  <PersonChips personIds={ids} people={people} size="sm" inherited={!own && ids.length > 0} />
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
                {!empty && (
                  <Button variant="ghost" size="sm" as={Link} to={newEventUrl(day.date)} icon={<Plus />} className="mt-1 w-full justify-start text-muted-foreground">Nouvel événement</Button>
                )}
                <div className="my-2 h-px bg-border" aria-hidden="true" />
              </section>
            );
          })}
        </div>
      )}

      {/* Print */}
      <div className="hidden print:block">
        <h1 className="text-h1">Semaine {weekNo} · {rangeLabel(dates[0], dates[6])}</h1>
        {printMode === "week" ? (
          <WeekPrint days={plan.days} people={people} courses={courses} recipeById={recipeById} clientOf={clientOf} dayMeta={dayMeta} />
        ) : (
          <PersonPrint days={plan.days} people={activePeople} courses={courses} recipeById={recipeById} clientOf={clientOf} />
        )}
      </div>

      {assignOpen && (
        <AssignSheet
          days={plan.days}
          people={people}
          clientById={clientById}
          recipeById={recipeById}
          courses={courses}
          onEvent={assignEvent}
          onLine={assignLine}
          onClose={() => setAssignOpen(false)}
        />
      )}

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
    </div>
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
}

// Chips that open the picker in a fixed box, so the column does not clip it.
// With nobody assigned and assignment allowed, a ghost "Assigner" button replaces the chips.
function AssignChips({ value, options, enabled, inherited = false, allowInherit = false, max, className, onChange, title, label, picked = value }: AssignChipsProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; right: number } | null>(null);
  const close = useCallback(() => setRect(null), []);
  const open = () => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    setRect(rect ? null : { top: r.bottom, left: r.left, right: r.right });
  };
  const alignRight = rect ? rect.left > window.innerWidth - 280 : false;
  const showButton = enabled && value.length === 0 && !allowInherit;
  return (
    <span ref={anchor} className="inline-flex">
      {showButton ? (
        <Button variant="ghost" size="sm" icon={<UserPlus />} onClick={open} aria-label={label} aria-haspopup="dialog" className={cn("text-muted-foreground", className)}>Assigner</Button>
      ) : (
        <PersonChips personIds={value} people={options} size="sm" inherited={inherited} max={max} label={value.length === 0 ? label : undefined} className={className} onClick={enabled ? open : undefined} />
      )}
      {rect && (
        <div style={{ position: "fixed", top: rect.top, left: alignRight ? rect.right : rect.left, width: 0, height: 0 }} className="z-50">
          <PersonPicker value={picked} options={options} onChange={onChange} allowInherit={allowInherit} onClose={close} title={title} align={alignRight ? "right" : "left"} />
        </div>
      )}
    </span>
  );
}

interface PrintProps {
  days: WeekDay[];
  people: Person[];
  courses: string[];
  recipeById: Map<string, { name: string; defaultCourse?: string }>;
  clientOf: (ev: AppEvent) => Pick<Client, "name"> | undefined;
}

function initialsOf(people: Person[], ids: string[]): string {
  if (!ids.length) return "";
  return ` (${ids.map((id) => {
    const p = people.find((x) => x.personId === id);
    return p ? (p.initials?.trim() || p.name.slice(0, 2)).toUpperCase() : id.slice(0, 2).toUpperCase();
  }).join(", ")})`;
}

// Default print: every day with its events and lines, initials after each line.
function WeekPrint({ days, people, courses, recipeById, clientOf, dayMeta }: PrintProps & { dayMeta: (d: WeekDay) => string }) {
  return (
    <>
      {days.filter((d) => d.events.length > 0).map((day, i) => (
        <section key={day.date} className={i > 0 ? "print-break" : "mt-6"}>
          <h2 className="text-h2">{longDayLabel(day.date)}</h2>
          <p className="text-base text-muted-foreground">{dayMeta(day)}</p>
          {day.events.map((ev) => (
            <div key={ev.eventId} className="mt-4">
              <h3 className="text-h3">{shortEventName(ev, clientOf(ev))} · {ev.guestCount} conv.{initialsOf(people, ev.assignedTo ?? [])}</h3>
              <ul className="mt-1">
                {sortEventLines(ev.recipes, courses, recipeById).map((line) => (
                  <li key={line.lineId} className="flex justify-between gap-4 py-1 text-base">
                    <span>{lineStatus(line) === "done" ? "☑" : "☐"} {recipeById.get(line.recipeId)?.name ?? line.recipeId}{initialsOf(people, assigneesOf(line, ev))}</span>
                    <span className="font-semibold tabular-nums">{line.portions}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

// One page per active person with their lines by day, then "Sans personne" when needed.
function PersonPrint({ days, people, courses, recipeById, clientOf }: PrintProps) {
  const pages: { key: string; title: string; match: (ids: string[]) => boolean }[] = [
    ...people.map((p) => ({ key: p.personId, title: p.name, match: (ids: string[]) => ids.includes(p.personId) })),
    { key: "", title: "Sans personne", match: (ids: string[]) => ids.length === 0 },
  ];
  const rows = days.flatMap((day) =>
    day.events.flatMap((ev) =>
      sortEventLines(ev.recipes, courses, recipeById).map((line) => ({ day, ev, line, ids: assigneesOf(line, ev) })),
    ),
  );
  let first = true;
  return (
    <>
      {pages.map((page) => {
        const mine = rows.filter((r) => page.match(r.ids));
        if (mine.length === 0) return null;
        const cls = first ? "mt-6" : "print-break";
        first = false;
        const byDay = days.filter((d) => mine.some((r) => r.day.date === d.date));
        return (
          <section key={page.key} className={cls}>
            <h2 className="text-h2">{page.title}</h2>
            {byDay.map((day) => (
              <div key={day.date} className="mt-4">
                <h3 className="text-h3">{longDayLabel(day.date)}</h3>
                <ul className="mt-1">
                  {mine.filter((r) => r.day.date === day.date).map(({ ev, line, ids }) => {
                    const others = ids.filter((id) => id !== page.key);
                    const recipe = recipeById.get(line.recipeId);
                    return (
                      <li key={line.lineId} className="py-1 text-base">
                        {lineStatus(line) === "done" ? "☑" : "☐"} {recipe?.name ?? line.recipeId}
                        {page.key && others.length > 0 ? ` avec ${others.map((id) => personName(people, id)).join(", ")}` : ""}
                        {" · "}{shortEventName(ev, clientOf(ev))} · {line.portions}{line.course ?? recipe?.defaultCourse ? ` · ${line.course ?? recipe?.defaultCourse}` : ""}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}
