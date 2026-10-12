import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus, Printer, ShoppingCart } from "lucide-react";
import type { AppEvent, Client, EventRecipeLine, PrepStatus } from "@packages/types";
import {
  addDays,
  datesOfIsoWeek,
  dayLabel,
  isoWeekOf,
  ledgerCaOfMonth,
  longDayLabel,
  mondayOfIsoWeek,
  monthSignedRevenue,
  objectifMensuel,
  parseIsoWeek,
  rangeLabel,
  sortEventLines,
  weekdayOf,
  weekPlan,
  ymOf,
} from "@packages/types";
import { api } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { buildGroceryItems, groceryTitleFor } from "@/lib/grocery";
import { fmtEur0, NEXT_STATUS, plural, prestationLabel, usePlanningData } from "@/lib/use-planning-data";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useToast } from "@/hooks/use-toast";
import { useFullBleed } from "@/components/admin/AdminLayout";
import { StatusDot, StatusDots } from "@/components/admin/StatusDot";
import { MoneyTile, Tag } from "@/components/ui";

const ICON_BTN = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-foreground hover:bg-hover";
const TEXT_BTN = "inline-flex min-h-11 items-center gap-2 rounded-lg border border-input bg-card px-3 text-base font-medium hover:bg-hover disabled:opacity-50";
const MAX_VISIBLE_LINES = 5;

type WeekView = "lines" | "events";

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

  const data = usePlanningData(year);
  const { events, clients, settings, entries, ledgerConfigured, recipeById, ingredientById, courses, loading, error, patchLine, reload } = data;

  const selectedClient = searchParams.get("client") ?? "";
  const setSelectedClient = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("client", id); else next.delete("client");
    setSearchParams(next, { replace: true });
  };

  const [view, setView] = useLocalStorage<WeekView>(
    "recipe-book:week-view",
    typeof window !== "undefined" && window.innerHeight < 800 ? "events" : "lines",
  );
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<{ client: Client; guestCount: number } | null>(null);
  const [busy, setBusy] = useState(false);

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
  const plan = useMemo(() => weekPlan(filteredEvents, monday), [filteredEvents, monday]);
  const monthSigned = useMemo(() => monthSignedRevenue(events, ym), [events, ym]);
  const objective = objectifMensuel(settings?.objectives?.[year], ym);
  const ledgerCa = entries.length ? ledgerCaOfMonth(entries, ym) : undefined;

  // Clients with a weekday template that has no event in this week.
  const missingWeeks = useMemo(() => {
    return clients
      .filter((c) => c.active !== false && c.templates?.length)
      .map((client) => {
        const missing = client.templates.filter(
          (t) => !weekEvents.some((e) => e.clientId === client.clientId && (e.templateId === t.templateId || weekdayOf(e.date) === t.weekday)),
        );
        return { client, missing };
      })
      .filter((x) => x.missing.length > 0);
  }, [clients, weekEvents]);

  // Today expanded on the phone layout, else the first day with events.
  useEffect(() => {
    const inWeek = dates.includes(today);
    const first = plan.days.find((d) => d.events.length > 0)?.date;
    setExpandedDays(new Set(inWeek ? [today] : first ? [first] : []));
  }, [safeWeek, loading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e) || sheet) return;
      if (e.key === "ArrowLeft") navigate(`/semaine/${prevWeek}${selectedClient ? `?client=${selectedClient}` : ""}`);
      if (e.key === "ArrowRight") navigate(`/semaine/${nextWeek}${selectedClient ? `?client=${selectedClient}` : ""}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, prevWeek, nextWeek, selectedClient, sheet]);

  const weekUrl = (w: string) => `/semaine/${w}${selectedClient ? `?client=${selectedClient}` : ""}`;
  const newEventUrl = (date: string) => `/events/new?date=${date}${selectedClient ? `&client=${selectedClient}` : ""}`;
  const prepUrl = (eventId: string, lineId: string) => `/events/${eventId}/lines/${lineId}`;

  const cycle = useCallback(async (ev: AppEvent, line: EventRecipeLine) => {
    try {
      await patchLine(ev.eventId, line.lineId, { prepStatus: NEXT_STATUS[lineStatus(line)] });
    } catch {
      toast({ title: "Erreur lors de la mise à jour du statut", variant: "destructive" });
    }
  }, [patchLine, toast]);

  const setStatus = useCallback(async (ev: AppEvent, line: EventRecipeLine, status: PrepStatus) => {
    try {
      await patchLine(ev.eventId, line.lineId, { prepStatus: status });
    } catch {
      toast({ title: "Erreur lors de la mise à jour du statut", variant: "destructive" });
    }
  }, [patchLine, toast]);

  const createGrocery = async () => {
    if (filteredEvents.length === 0) { toast({ title: "Aucun événement cette semaine" }); return; }
    const range = { from: dates[0], to: dates[6] };
    setBusy(true);
    try {
      const items = buildGroceryItems(filteredEvents, recipeById, ingredientById, range).map((i) => ({ ...i, checked: false }));
      const list = await api.groceryLists.create({ title: groceryTitleFor(range), items, eventIds: filteredEvents.map((e) => e.eventId), range });
      navigate(`/grocery-list?id=${list.listId}`);
    } catch {
      toast({ title: "Erreur lors de la création de la liste", variant: "destructive" });
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
      toast({ title: "Erreur lors de la création des événements", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggleDay = (date: string) => setExpandedDays((prev) => {
    const next = new Set(prev);
    if (next.has(date)) next.delete(date); else next.add(date);
    return next;
  });
  const expandEvent = (id: string) => setExpandedEvents((prev) => new Set(prev).add(id));

  if (!valid) return <Navigate to={`/semaine/${isoWeekOf(today)}`} replace />;

  const dayMeta = (d: typeof plan.days[number]) =>
    d.events.length === 0 ? "aucun événement" : `${d.events.length} évén. · ${d.guests} conv.`;

  return (
    <div className="h-[calc(100dvh-68px)] overflow-y-auto px-6 py-4 md:h-dvh md:py-6 print:h-auto print:overflow-visible">
      {/* Header */}
      <div className="no-print flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          <Link to={weekUrl(prevWeek)} aria-label="Semaine précédente" className={ICON_BTN}><ChevronLeft className="h-6 w-6" /></Link>
          <h1 className="font-serif text-h1 whitespace-nowrap">Semaine {weekNo}</h1>
          <Link to={weekUrl(nextWeek)} aria-label="Semaine suivante" className={ICON_BTN}><ChevronRight className="h-6 w-6" /></Link>
        </div>
        <span className="text-base text-muted-foreground">{rangeLabel(dates[0], dates[6])}</span>
        {safeWeek !== todayWeek && (
          <Link to={weekUrl(todayWeek)} className="inline-flex min-h-11 items-center text-base text-primary underline-offset-4 hover:underline">Aujourd'hui</Link>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Affichage" className="hidden xl:inline-flex rounded-lg border border-border bg-card p-0.5">
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
          <button type="button" onClick={createGrocery} disabled={busy || loading} className={TEXT_BTN}>
            <ShoppingCart className="h-5 w-5" /> Courses de la semaine
          </button>
          <button type="button" onClick={() => window.print()} className={TEXT_BTN}>
            <Printer className="h-5 w-5" /> Imprimer
          </button>
        </div>
      </div>
      <h1 className="hidden print:block font-serif text-h1">Semaine {weekNo} · {rangeLabel(dates[0], dates[6])}</h1>

      {/* Client chips */}
      {clientsThisWeek.length > 0 && (
        <div className="no-print mt-3 flex flex-wrap gap-2">
          {[{ clientId: "", name: "Tous" }, ...clientsThisWeek].map((c) => (
            <button
              key={c.clientId || "all"}
              type="button"
              aria-pressed={selectedClient === c.clientId}
              onClick={() => setSelectedClient(c.clientId)}
              className={`min-h-11 rounded-full px-4 text-base font-medium ${selectedClient === c.clientId ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-hover"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Money strip */}
      <div className="no-print mt-4 flex gap-3 overflow-x-auto pb-1 xl:grid xl:grid-cols-3 xl:overflow-visible">
        <MoneyTile className="min-w-[220px] flex-1" label="Signé cette semaine" value={fmtEur0(plan.signedRevenue)} sub={`${plan.guests} convives`} />
        <MoneyTile
          className="min-w-[220px] flex-1"
          label="Signé ce mois"
          value={fmtEur0(monthSigned)}
          sub={objective !== undefined
            ? `Objectif ${fmtEur0(objective)}`
            : <Link to="/settings" className="text-primary underline-offset-4 hover:underline">Définir l'objectif</Link>}
          progress={objective !== undefined
            ? { value: monthSigned, max: objective, ticks: ledgerCa !== undefined ? [{ label: "Facturé", value: ledgerCa }] : undefined }
            : undefined}
        />
        <MoneyTile className="min-w-[220px] flex-1" label="Préparation" value={`${plan.linesDone} / ${plan.linesTotal}`} sub="lignes faites" />
      </div>
      {!ledgerConfigured && (
        <p className="no-print mt-2 text-sm text-muted-foreground">Comptabilité non configurée : la table ta-ledger n'existe pas encore</p>
      )}
      {error && <p className="no-print mt-2 text-base text-destructive">{error}</p>}

      {/* Create week banners */}
      {missingWeeks.map(({ client, missing }) => (
        <div key={client.clientId} className="no-print mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary-soft px-4 py-3">
          <span className="text-base">
            {plural(missing.length, "jour")} de {client.name} sans événement cette semaine
          </span>
          <button
            type="button"
            className={TEXT_BTN}
            onClick={() => setSheet({ client, guestCount: missing[0].guestCount || client.defaultGuestCount || 1 })}
          >
            Créer la semaine {client.name}
          </button>
        </div>
      ))}

      {loading && <p className="mt-6 text-base text-muted-foreground">Chargement…</p>}

      {/* Laptop: seven columns */}
      {!loading && (
        <div className="mt-4 hidden xl:grid grid-cols-[repeat(7,minmax(0,1fr))] gap-2 2xl:gap-3 print:hidden">
          {plan.days.map((day) => {
            const isToday = day.date === today;
            return (
              <div key={day.date} className="min-w-0 max-h-[calc(100dvh-220px)] overflow-y-auto rounded-lg">
                <div className={`sticky top-0 z-10 rounded-lg px-2 py-2 ${isToday ? "bg-primary-soft text-foreground" : "bg-background"}`}>
                  <div className="flex items-start justify-between gap-1">
                    <Link to={`/jour/${day.date}`} className="min-w-0 rounded hover:underline underline-offset-4">
                      <div className="text-h3">{dayLabel(day.date)}</div>
                      <div className={`text-sm ${isToday ? "" : "text-muted-foreground"}`}>{dayMeta(day)}</div>
                      <div className="text-sm font-semibold tabular-nums">{fmtEur0(day.signedRevenue)}</div>
                    </Link>
                    <Link to={newEventUrl(day.date)} aria-label={`Nouvel événement le ${longDayLabel(day.date)}`} className={`${ICON_BTN} -mr-2 -mt-1 text-muted-foreground`}>
                      <Plus className="h-5 w-5" />
                    </Link>
                  </div>
                </div>
                <div className="space-y-2 px-0.5 pb-2 pt-1">
                  {day.events.map((ev) => (
                    <EventColumn
                      key={ev.eventId}
                      ev={ev}
                      prestation={prestationLabel(settings, ev.prestationType)}
                      lines={view === "lines" ? sortEventLines(ev.recipes, courses, recipeById) : []}
                      expanded={expandedEvents.has(ev.eventId)}
                      onExpand={() => expandEvent(ev.eventId)}
                      recipeName={(id) => recipeById.get(id)?.name ?? id}
                      prepUrl={prepUrl}
                      onCycle={(line) => cycle(ev, line)}
                      onStatus={(line, s) => setStatus(ev, line, s)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Phone and tablet: stacked days */}
      {!loading && (
        <div className="mt-4 divide-y divide-border xl:hidden print:hidden">
          {plan.days.map((day) => {
            const isToday = day.date === today;
            const open = expandedDays.has(day.date);
            const label = `${dayLabel(day.date)} · ${dayMeta(day)}${day.events.length ? ` · ${day.linesDone}/${day.linesTotal} faites` : ""}`;
            if (!open) {
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => toggleDay(day.date)}
                  className={`flex min-h-14 w-full items-center justify-between gap-2 px-2 text-left text-base ${isToday ? "bg-primary-soft rounded-lg" : "hover:bg-hover"}`}
                >
                  <span className={day.events.length ? "" : "text-muted-foreground"}>{label}</span>
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                </button>
              );
            }
            return (
              <div key={day.date}>
                <div className={`sticky top-0 z-10 flex min-h-14 items-center gap-1 border-b border-border px-2 ${isToday ? "bg-primary-soft" : "bg-background"}`}>
                  <button type="button" onClick={() => toggleDay(day.date)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-base font-medium">
                    <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">{label}</span>
                  </button>
                  <Link to={newEventUrl(day.date)} aria-label={`Nouvel événement le ${longDayLabel(day.date)}`} className={`${ICON_BTN} text-muted-foreground`}>
                    <Plus className="h-5 w-5" />
                  </Link>
                  <Link to={`/jour/${day.date}`} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-base text-primary hover:bg-hover">
                    Voir le jour <ChevronRight className="h-5 w-5" />
                  </Link>
                </div>
                {day.events.length === 0 && (
                  <p className="px-2 py-3 text-base text-muted-foreground">Aucun événement ce jour.</p>
                )}
                {day.events.map((ev) => {
                  const client = ev.clientId ? data.clientById.get(ev.clientId) : undefined;
                  const lines = sortEventLines(ev.recipes, courses, recipeById);
                  return (
                    <div key={ev.eventId} className="py-1">
                      <Link to={`/events/${ev.eventId}`} className="flex min-h-12 items-center gap-2 rounded-lg px-2 hover:bg-hover">
                        <span className="min-w-0 flex-1">
                          <span className="text-base font-medium">{ev.name}</span>
                          {client && <Tag variant="primary" className="ml-2">{client.name}</Tag>}
                          <span className="block text-sm text-muted-foreground">
                            {ev.guestCount} conv. · {doneCount(ev)}/{ev.recipes.length} faites
                          </span>
                        </span>
                        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                      </Link>
                      <ul className="pl-2">
                        {lines.map((line) => (
                          <li key={line.lineId} className="flex min-h-12 items-center gap-1">
                            <StatusDot value={lineStatus(line)} target="always" onCycle={() => cycle(ev, line)} />
                            <Link to={prepUrl(ev.eventId, line.lineId)} className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 text-base hover:bg-hover">
                              <span className="min-w-0">{recipeById.get(line.recipeId)?.name ?? line.recipeId}</span>
                              <span className="shrink-0 font-semibold tabular-nums">{line.portions}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Print: every day with its events and lines */}
      <div className="hidden print:block">
        {plan.days.filter((d) => d.events.length > 0).map((day, i) => (
          <section key={day.date} className={i > 0 ? "print-break" : "mt-6"}>
            <h2 className="text-h2 font-semibold">{longDayLabel(day.date)}</h2>
            <p className="text-base text-muted-foreground">{dayMeta(day)} · {day.linesDone}/{day.linesTotal} faites</p>
            {day.events.map((ev) => (
              <div key={ev.eventId} className="mt-4">
                <h3 className="text-h3">{ev.name} · {ev.guestCount} conv.</h3>
                <ul className="mt-1">
                  {sortEventLines(ev.recipes, courses, recipeById).map((line) => (
                    <li key={line.lineId} className="flex justify-between gap-4 py-1 text-base">
                      <span>{lineStatus(line) === "done" ? "☑" : "☐"} {recipeById.get(line.recipeId)?.name ?? line.recipeId}</span>
                      <span className="font-semibold tabular-nums">{line.portions}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>

      {/* Create week sheet */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-4 md:items-center" onClick={() => !busy && setSheet(null)}>
          <form
            className="card-elevated w-full max-w-md p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); createClientWeek(); }}
          >
            <h2 className="text-h3">Créer la semaine {sheet.client.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{rangeLabel(dates[0], dates[6])} · un événement par jour de modèle</p>
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

interface EventColumnProps {
  ev: AppEvent;
  prestation?: string;
  lines: EventRecipeLine[];
  expanded: boolean;
  onExpand: () => void;
  recipeName: (id: string) => string;
  prepUrl: (eventId: string, lineId: string) => string;
  onCycle: (line: EventRecipeLine) => void;
  onStatus: (line: EventRecipeLine, s: PrepStatus) => void;
}

function EventColumn({ ev, prestation, lines, expanded, onExpand, recipeName, prepUrl, onCycle, onStatus }: EventColumnProps) {
  const total = ev.recipes.length;
  const done = doneCount(ev);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const visible = expanded ? lines : lines.slice(0, MAX_VISIBLE_LINES);
  const hidden = lines.length - visible.length;

  return (
    <div>
      <Link to={`/events/${ev.eventId}`} title={prestation} className="card-elevated block min-h-[72px] p-2.5 hover:bg-hover">
        <div className="text-base font-medium line-clamp-2">{ev.name}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          {ev.guestCount} conv. · {total} lignes · {done} faites
        </div>
        {prestation && <Tag variant="neutral" className="mt-1 hidden 2xl:inline-flex">{prestation}</Tag>}
        <div className="mt-2 h-1 w-full rounded-full bg-muted">
          <div className="h-1 rounded-full bg-success" style={{ width: `${pct}%` }} />
        </div>
      </Link>
      {visible.length > 0 && (
        <ul className="mt-1">
          {visible.map((line) => {
            const status = lineStatus(line);
            return (
              <li key={line.lineId} className="group relative flex min-h-9 items-center gap-0.5 text-sm touch:min-h-11">
                <StatusDot value={status} onCycle={() => onCycle(line)} className="-ml-1" />
                <Link to={prepUrl(ev.eventId, line.lineId)} className={`flex min-h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded px-1 hover:bg-hover ${status === "done" ? "text-muted-foreground" : ""}`}>
                  <span className="min-w-0 line-clamp-2">{recipeName(line.recipeId)}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{line.portions}</span>
                </Link>
                <StatusDots
                  value={status}
                  onChange={(s) => onStatus(line, s)}
                  className="reveal invisible absolute right-0 top-1/2 z-20 -translate-y-1/2 shadow-md pointer:group-hover:visible"
                />
              </li>
            );
          })}
          {hidden > 0 && (
            <li>
              <button type="button" onClick={onExpand} className="min-h-9 w-full rounded px-1 text-left text-sm text-muted-foreground hover:bg-hover touch:min-h-11">
                + {plural(hidden, "ligne")}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
