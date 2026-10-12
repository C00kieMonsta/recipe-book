import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Printer, Share2, ShoppingCart, X } from "lucide-react";
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
  personName,
  shortEventName,
  sortEventLines,
  weekChecklist,
  weekdayOf,
  weekGroceryList,
  weekPlan,
  ymOf,
} from "@packages/types";
import { api } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { buildGroceryItems, groceryTitleFor } from "@/lib/grocery";
import { fmtEur0, NEXT_STATUS, plural, usePlanningData } from "@/lib/use-planning-data";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useToast } from "@/hooks/use-toast";
import { useFullBleed } from "@/components/admin/AdminLayout";
import { StatusDot, StatusDots } from "@/components/admin/StatusDot";
import PersonChips from "@/components/admin/PersonChips";
import PersonPicker from "@/components/admin/PersonPicker";
import WeekChecklist from "@/components/admin/WeekChecklist";
import AssignSheet from "@/components/admin/AssignSheet";
import DayStrip from "@/components/admin/DayStrip";
import WeekPicker from "@/components/admin/WeekPicker";
import { ActionMenu } from "@/components/ui";

const ICON_BTN = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-foreground hover:bg-hover";
const TEXT_BTN = "inline-flex min-h-11 items-center gap-2 rounded-lg border border-input bg-card px-3 text-base font-medium hover:bg-hover disabled:opacity-50";
const SELECT = "min-h-11 rounded-lg border border-input bg-card px-2 text-base";
const SWIPE_PX = 60;
const LAST_WEEK_KEY = "recipe-book:last-week";

type WeekView = "lines" | "events";
type PrintMode = "week" | "person";

const num0 = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 0 });

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

function useHoverPointer(): boolean {
  const [hover, setHover] = useState(() => typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches);
  useEffect(() => {
    const mql = window.matchMedia("(hover: hover)");
    const onChange = () => setHover(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return hover;
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

  const [view, setView] = useLocalStorage<WeekView>("recipe-book:week-view", "lines");
  const [checklistOpen, setChecklistOpen] = useLocalStorage<boolean>("recipe-book:checklist-open", typeof window !== "undefined" && window.innerWidth >= 1280);
  const [sheet, setSheet] = useState<{ client: Client; guestCount: number } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode>("week");
  const [printTick, setPrintTick] = useState(0);
  const hoverPointer = useHoverPointer();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const dayRefs = useRef<Record<string, HTMLElement | null>>({});

  const activePeople = useMemo(() => people.filter((p) => p.active), [people]);
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

  const modalOpen = Boolean(sheet) || assignOpen || menuOpen;
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

  const scrollToDay = useCallback((date: string) => {
    dayRefs.current[date]?.scrollIntoView({ block: "start" });
  }, []);

  // Phone: today, else the first day with events, is brought into view once loaded.
  useEffect(() => {
    if (loading || window.innerWidth >= 1280) return;
    const target = todayInWeek ? today : plan.days.find((d) => d.events.length > 0)?.date;
    if (target) scrollToDay(target);
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

  const setStatus = useCallback(async (ev: AppEvent, line: EventRecipeLine, status: PrepStatus) => {
    try { await patchLine(ev.eventId, line.lineId, { prepStatus: status }); }
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
    const date = todayInWeek ? today : monday;
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
    if (d.events.length === 0) return short ? "aucun" : "aucun événement";
    const base = `${d.events.length} évén. · ${d.guests} conv.`;
    return started && d.linesTotal > 0 ? `${base} · ${d.linesDone}/${d.linesTotal}` : base;
  };
  const clientOf = (ev: AppEvent) => (ev.clientId ? clientById.get(ev.clientId) : undefined);
  const recipeName = (id: string) => recipeById.get(id)?.name ?? id;
  const hasPersonLine = (ev: AppEvent) => !selectedPerson || ev.recipes.some((l) => assigneesOf(l, ev).includes(selectedPerson));
  const isOtherPerson = (ev: AppEvent, line: EventRecipeLine) => Boolean(selectedPerson) && !assigneesOf(line, ev).includes(selectedPerson);
  const canAssign = hoverPointer && activePeople.length > 0;
  const counts = Object.fromEntries(plan.days.map((d) => [d.date, d.events.length]));

  const menuItems = [
    { label: "Imprimer", icon: <Printer className="h-5 w-5" />, onClick: () => print("week") },
    { label: "Imprimer par personne", icon: <Printer className="h-5 w-5" />, onClick: () => print("person") },
    ...activePeople.map((p) => ({ label: `Partager avec ${p.name}`, icon: <Share2 className="h-5 w-5" />, onClick: () => share(p) })),
  ];

  const doneFragment = started && weekTotals.linesTotal > 0
    ? ` · ${weekTotals.linesDone} / ${plural(weekTotals.linesTotal, "ligne")} ${weekTotals.linesTotal === 1 ? "faite" : "faites"}`
    : "";
  const monthLink = objective !== undefined
    ? { to: `/comptes/apercu?year=${year}`, text: `Mois ${fmtEur0(monthSigned)} / ${fmtEur0(objective)}`, short: `Mois ${num0.format(monthSigned)} / ${fmtEur0(objective)}` }
    : { to: "/settings#objectifs", text: `Mois ${fmtEur0(monthSigned)} · Définir l'objectif`, short: `Mois ${fmtEur0(monthSigned)} · Définir l'objectif` };

  const clientSelect = clientsConfigured && (
    <select aria-label="Client" value={selectedClient} onChange={(e) => setParam("client", e.target.value)} className={SELECT}>
      <option value="">Tous les clients</option>
      {clientsThisWeek.map((c) => <option key={c.clientId} value={c.clientId}>{c.name}</option>)}
    </select>
  );
  const personSelect = activePeople.length > 0 && (
    <select aria-label="Personne" value={selectedPerson} onChange={(e) => setParam("personne", e.target.value)} className={SELECT}>
      <option value="">Toutes les personnes</option>
      {activePeople.map((p) => <option key={p.personId} value={p.personId}>{p.name}</option>)}
    </select>
  );

  return (
    <div className="h-[calc(100dvh-68px)] overflow-y-auto px-4 py-2 md:h-dvh xl:px-6 xl:py-4 print:h-auto print:overflow-visible">
      {/* Header zone: nav, range and money; swipe changes the week on the phone */}
      <div className="no-print" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="flex items-center gap-1 xl:min-h-14 xl:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-1 xl:flex-none">
            <Link to={weekUrl(prevWeek)} aria-label="Semaine précédente" className={ICON_BTN}><ChevronLeft className="h-6 w-6" /></Link>
            <h1 className="min-w-0 flex-1 truncate text-center font-serif text-h2 xl:flex-none xl:text-h1">Semaine {weekNo}</h1>
            <Link to={weekUrl(nextWeek)} aria-label="Semaine suivante" className={ICON_BTN}><ChevronRight className="h-6 w-6" /></Link>
          </div>
          <div className="hidden items-center gap-2 xl:flex">
            <WeekPicker from={dates[0]} to={dates[6]} value={thursday} onChange={(d) => navigate(weekUrl(isoWeekOf(d)))} />
            {safeWeek !== todayWeek && (
              <Link to={weekUrl(todayWeek)} className="inline-flex min-h-11 items-center rounded-lg px-1 text-base text-primary hover:bg-hover">Aujourd'hui</Link>
            )}
          </div>
          <div className="ml-auto hidden text-right text-sm xl:block">
            <div className="font-semibold tabular-nums">Signé {fmtEur0(weekTotals.signedRevenue)} · {weekTotals.guests} conv.{doneFragment}</div>
            <Link to={monthLink.to} state={state} className="inline-flex items-center gap-0.5 tabular-nums text-muted-foreground hover:underline underline-offset-4">
              {monthLink.text} <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Actions" aria-haspopup="dialog" className={`${ICON_BTN} xl:hidden`}>
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-8 items-center gap-2 xl:hidden">
          <WeekPicker from={dates[0]} to={dates[6]} value={thursday} onChange={(d) => navigate(weekUrl(isoWeekOf(d)))} />
          {safeWeek !== todayWeek && (
            <Link to={weekUrl(todayWeek)} onClick={() => todayInWeek && scrollToDay(today)} className="inline-flex min-h-11 items-center rounded-lg px-1 text-base text-primary hover:bg-hover">Aujourd'hui</Link>
          )}
        </div>
        <div className="min-h-7 overflow-x-auto whitespace-nowrap text-sm tabular-nums xl:hidden">
          <span className="font-semibold">Signé {fmtEur0(weekTotals.signedRevenue)} · {weekTotals.guests} conv.{doneFragment}</span>
          <span className="text-muted-foreground"> · </span>
          <Link to={monthLink.to} state={state} className="text-muted-foreground">{monthLink.short} ›</Link>
        </div>
      </div>

      {/* Controls row */}
      <div className="no-print hidden min-h-11 flex-wrap items-center justify-end gap-2 xl:flex">
        {clientSelect}
        {personSelect}
        <div role="group" aria-label="Affichage" className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {(["lines", "events"] as WeekView[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`min-h-10 rounded-md px-3 text-base font-medium ${view === v ? "bg-foreground text-background" : "text-muted-foreground hover:bg-hover"}`}
            >
              {v === "lines" ? "Lignes" : "Événements"}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => createGrocery(filteredEvents)} disabled={busy || loading} className={TEXT_BTN}>
          <ShoppingCart className="h-5 w-5" /> Courses de la semaine
        </button>
        <ActionMenu items={menuItems} />
      </div>
      {error && <p className="no-print mt-2 text-base text-destructive">{error}</p>}

      {/* Checklist */}
      {!loading && (
        <div className="no-print mt-2 xl:mt-3">
          <WeekChecklist
            items={checklist}
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

      {loading && <p className="mt-6 text-base text-muted-foreground">Chargement…</p>}

      {/* Laptop: seven columns */}
      {!loading && (
        <div className="mt-3 hidden grid-cols-[repeat(7,minmax(0,1fr))] gap-2 xl:grid print:hidden">
          {plan.days.map((day) => {
            const isToday = day.date === today;
            const dayPeople = plan.peopleByDay[day.date] ?? [];
            return (
              <div key={day.date} className="min-w-0 max-h-[calc(100dvh-300px)] overflow-y-auto rounded-lg">
                <div className={`sticky top-0 z-10 min-h-[72px] rounded-lg px-2 py-1.5 ${isToday ? "bg-primary-soft" : "bg-background"}`}>
                  <div className="flex items-start justify-between gap-1">
                    <Link to={dayUrl(day.date)} state={state} className="min-w-0 rounded hover:underline underline-offset-4">
                      <div className="text-h3">{dayLabel(day.date)}</div>
                      <div className={`text-sm ${isToday ? "" : "text-muted-foreground"}`}>{dayMeta(day, true)}</div>
                    </Link>
                    <Link to={newEventUrl(day.date)} aria-label={`Nouvel événement le ${longDayLabel(day.date)}`} className={`${ICON_BTN} -mr-2 -mt-1 text-muted-foreground`}>
                      <Plus className="h-5 w-5" />
                    </Link>
                  </div>
                  {dayPeople.length > 0 && (
                    <div className="flex min-h-5 items-center gap-0.5">
                      {dayPeople.slice(0, 4).map((id) => (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={selectedPerson === id}
                          aria-label={personName(people, id)}
                          onClick={() => setParam("personne", selectedPerson === id ? "" : id)}
                          className={`rounded-full ${selectedPerson === id ? "ring-2 ring-primary" : ""}`}
                        >
                          <PersonChips personIds={[id]} people={people} size="sm" />
                        </button>
                      ))}
                      {dayPeople.length > 4 && <span className="text-caption text-muted-foreground">+{dayPeople.length - 4}</span>}
                    </div>
                  )}
                </div>
                <div className="space-y-2 px-0.5 pb-2 pt-1">
                  {day.events.map((ev) => {
                    const client = clientOf(ev);
                    const title = shortEventName(ev, client);
                    const total = ev.recipes.length;
                    const done = doneCount(ev);
                    if (!hasPersonLine(ev)) {
                      return (
                        <Link key={ev.eventId} to={`/events/${ev.eventId}`} state={state} className="flex min-h-9 items-center rounded-lg px-2 text-sm text-muted-foreground hover:bg-hover">
                          <span className="truncate">{title}</span>
                        </Link>
                      );
                    }
                    return (
                      <div key={ev.eventId}>
                        <div className="card-elevated flex min-h-16 hover:bg-hover">
                          <Link to={`/events/${ev.eventId}`} state={state} className="min-w-0 flex-1 p-2.5">
                            <div className="text-base font-medium line-clamp-2">{title}</div>
                            <div className="mt-0.5 text-sm text-muted-foreground">
                              {ev.guestCount} conv. · {plural(total, "ligne")}{view === "events" && total > 0 ? ` · ${plural(done, "faite")}` : ""}
                            </div>
                            {started && total > 0 && (
                              <div className="mt-2 h-1 w-full rounded-full bg-muted">
                                <div className="h-1 rounded-full bg-success" style={{ width: `${Math.round((done / total) * 100)}%` }} />
                              </div>
                            )}
                          </Link>
                          {(ev.assignedTo?.length || canAssign) ? (
                            <div className="pr-1.5 pt-1.5">
                              <AssignChips value={ev.assignedTo ?? []} options={people} enabled={canAssign} onChange={(ids) => assignEvent(ev.eventId, ids)} title={title} />
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
                                <li key={line.lineId} className={`group grid min-h-9 grid-cols-[36px_minmax(0,1fr)_auto_auto] items-center text-sm touch:min-h-11 ${dim ? "opacity-40" : ""}`}>
                                  <StatusDot value={status} onCycle={() => cycle(ev, line)} />
                                  <Link to={prepUrl(ev.eventId, line.lineId)} state={state} className={`min-w-0 rounded px-1 py-1 hover:bg-hover ${status === "done" ? "text-muted-foreground" : ""}`}>
                                    <span className="line-clamp-2">{recipeName(line.recipeId)}</span>
                                  </Link>
                                  <span className={`px-1 font-semibold tabular-nums ${status === "done" ? "text-muted-foreground" : ""}`}>{line.portions}</span>
                                  <span className="inline-flex items-center">
                                    {(ids.length || canAssign) ? (
                                      <AssignChips value={own ? line.assignedTo ?? [] : ids} options={people} enabled={canAssign} inherited={!own && ids.length > 0} allowInherit onChange={(next) => assignLine(ev.eventId, line.lineId, next)} title={recipeName(line.recipeId)} />
                                    ) : null}
                                  </span>
                                  <div className="col-span-full hidden pl-9 pb-1 pointer:group-hover:block">
                                    <StatusDots value={status} onChange={(s) => setStatus(ev, line, s)} />
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Phone and tablet: the strip, then every day stacked */}
      {!loading && (
        <div className="xl:hidden print:hidden">
          <div className="sticky top-0 z-20 -mx-4 bg-background px-4 py-1.5">
            <DayStrip dates={dates} counts={counts} today={today} onPick={scrollToDay} />
          </div>
          <div className="divide-y divide-border">
            {plan.days.map((day) => {
              const isToday = day.date === today;
              const empty = day.events.length === 0;
              return (
                <section key={day.date} ref={(el) => { dayRefs.current[day.date] = el; }} className="scroll-mt-16">
                  <div className={`sticky top-[60px] z-10 -mx-4 flex min-h-12 items-center gap-2 px-4 ${isToday ? "bg-primary-soft" : "bg-background"}`}>
                    <Link to={dayUrl(day.date)} state={state} className="flex min-h-12 min-w-0 flex-1 items-center gap-2">
                      <span className="w-16 shrink-0 text-base font-medium">{dayLabel(day.date)}</span>
                      <span className={`min-w-0 truncate text-sm ${empty ? "text-muted-foreground" : isToday ? "" : "text-muted-foreground"}`}>
                        {empty ? "aucun événement" : dayMeta(day)}
                      </span>
                      {!empty && <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    </Link>
                    {empty && (
                      <Link to={newEventUrl(day.date)} aria-label={`Nouvel événement le ${longDayLabel(day.date)}`} className={`${ICON_BTN} -mr-2 text-muted-foreground`}>
                        <Plus className="h-5 w-5" />
                      </Link>
                    )}
                  </div>
                  {day.events.map((ev) => {
                    const client = clientOf(ev);
                    const title = shortEventName(ev, client);
                    const collapsed = !hasPersonLine(ev);
                    return (
                      <div key={ev.eventId}>
                        <Link to={`/events/${ev.eventId}`} state={state} className={`flex min-h-12 items-center gap-2 rounded-lg px-1 hover:bg-hover ${collapsed ? "text-muted-foreground" : ""}`}>
                          <span className="min-w-0 flex-1 truncate text-base font-medium">{title}</span>
                          {!collapsed && <span className="shrink-0 text-sm text-muted-foreground">{ev.guestCount} conv.</span>}
                          <PersonChips personIds={ev.assignedTo ?? []} people={people} size="sm" />
                          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        </Link>
                        {!collapsed && (
                          <ul>
                            {sortEventLines(ev.recipes, courses, recipeById).map((line) => {
                              const status = lineStatus(line);
                              const own = Boolean(line.assignedTo?.length);
                              const ids = assigneesOf(line, ev);
                              return (
                                <li key={line.lineId} className={`flex min-h-12 items-center ${isOtherPerson(ev, line) ? "opacity-40" : ""}`}>
                                  <StatusDot value={status} target="always" onCycle={() => cycle(ev, line)} />
                                  <Link to={prepUrl(ev.eventId, line.lineId)} state={state} className={`flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-base hover:bg-hover ${status === "done" ? "text-muted-foreground" : ""}`}>
                                    <span className="min-w-0 flex-1 truncate">{recipeName(line.recipeId)}</span>
                                    <span className="shrink-0 font-semibold tabular-nums">{line.portions}</span>
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
                    <Link to={newEventUrl(day.date)} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-base text-muted-foreground hover:bg-hover">
                      <Plus className="h-5 w-5" aria-hidden="true" /> Nouvel événement
                    </Link>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* Print */}
      <div className="hidden print:block">
        <h1 className="font-serif text-h1">Semaine {weekNo} · {dates[0].slice(8, 10)}/{dates[0].slice(5, 7)} au {dates[6].slice(8, 10)}/{dates[6].slice(5, 7)}</h1>
        {printMode === "week" ? (
          <WeekPrint days={plan.days} people={people} courses={courses} recipeById={recipeById} clientOf={clientOf} dayMeta={dayMeta} />
        ) : (
          <PersonPrint days={plan.days} people={activePeople} courses={courses} recipeById={recipeById} clientOf={clientOf} />
        )}
      </div>

      {/* Phone menu sheet */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-foreground/30 xl:hidden" role="presentation" onClick={() => setMenuOpen(false)}>
          <div role="dialog" aria-label="Actions" onClick={(e) => e.stopPropagation()} className="w-full rounded-t-2xl bg-card p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-xl animate-fade-up">
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-base font-semibold">Semaine {weekNo}</span>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Fermer" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-hover"><X className="h-5 w-5" /></button>
            </div>
            {(clientSelect || personSelect) && (
              <div className="flex flex-col gap-2 px-3 py-1">
                {clientSelect}
                {personSelect}
              </div>
            )}
            <button type="button" disabled={busy} onClick={() => { setMenuOpen(false); createGrocery(filteredEvents); }} className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-base font-medium hover:bg-hover disabled:opacity-50">
              <ShoppingCart className="h-5 w-5" /> Courses de la semaine
            </button>
            {menuItems.map((item) => (
              <button key={item.label} type="button" onClick={() => { setMenuOpen(false); item.onClick(); }} className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-base font-medium hover:bg-hover">
                {item.icon} {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

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

      {/* Create week sheet */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-4 md:items-center" onClick={() => !busy && setSheet(null)}>
          <form
            className="card-elevated w-full max-w-md p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); createClientWeek(); }}
          >
            <h2 className="text-h3">Créer la semaine {sheet.client.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{dates[0].slice(8, 10)}/{dates[0].slice(5, 7)} au {dates[6].slice(8, 10)}/{dates[6].slice(5, 7)} · un événement par jour de modèle</p>
            <label className="mt-4 block text-base">
              Convives
              <input
                type="number"
                inputMode="numeric"
                min={1}
                autoFocus
                value={sheet.guestCount}
                onChange={(e) => setSheet({ ...sheet, guestCount: Math.max(1, Number(e.target.value) || 1) })}
                className="input-field mt-1"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={TEXT_BTN} onClick={() => setSheet(null)} disabled={busy}>Annuler</button>
              <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                Créer la semaine
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

interface AssignChipsProps {
  value: string[];
  options: Person[];
  enabled: boolean;
  inherited?: boolean;
  allowInherit?: boolean;
  onChange: (next: string[]) => void;
  title: string;
}

// Chips that open the picker in a fixed box, so the scrolling column does not clip it.
function AssignChips({ value, options, enabled, inherited = false, allowInherit = false, onChange, title }: AssignChipsProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; right: number } | null>(null);
  const close = useCallback(() => setRect(null), []);
  const open = () => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    setRect(rect ? null : { top: r.bottom, left: r.left, right: r.right });
  };
  const alignRight = rect ? rect.left > window.innerWidth - 280 : false;
  return (
    <span ref={anchor} className="inline-flex">
      <PersonChips personIds={value} people={options} size="sm" inherited={inherited} onClick={enabled ? open : undefined} />
      {rect && (
        <div style={{ position: "fixed", top: rect.top, left: alignRight ? rect.right : rect.left, width: 0, height: 0 }} className="z-50">
          <PersonPicker value={value} options={options} onChange={onChange} allowInherit={allowInherit} onClose={close} title={title} align={alignRight ? "right" : "left"} />
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
          <h2 className="text-h2 font-semibold">{longDayLabel(day.date)}</h2>
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
            <h2 className="text-h2 font-semibold">{page.title}</h2>
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
