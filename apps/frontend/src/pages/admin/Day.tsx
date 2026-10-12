import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Printer, ShoppingCart, X } from "lucide-react";
import type { Ingredient, PrepLine, PrepStatus, Recipe } from "@packages/types";
import { addDays, groupByRecipe, isoWeekOf, longDayLabel, parseIsoWeek, prepLinesForDate, scaleQty } from "@packages/types";
import { api } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { buildGroceryItems, groceryTitleFor } from "@/lib/grocery";
import { NEXT_STATUS, plural, usePlanningData } from "@/lib/use-planning-data";
import { useToast } from "@/hooks/use-toast";
import { useFullBleed } from "@/components/admin/AdminLayout";
import { Dot, StatusDot, STATUS_LABEL } from "@/components/admin/StatusDot";
import { PageHeader, SectionToggle, StatusControl } from "@/components/ui";

type Mode = "event" | "course" | "recipe";

const MODES: { value: Mode; label: string }[] = [
  { value: "event", label: "Par événement" },
  { value: "course", label: "Par catégorie" },
  { value: "recipe", label: "Par recette" },
];

const ICON_BTN = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-foreground hover:bg-hover";
const TEXT_BTN = "inline-flex min-h-11 items-center gap-2 rounded-lg border border-input bg-card px-3 text-base font-medium hover:bg-hover disabled:opacity-50";
const SWIPE_PX = 60;

interface Group {
  key: string;
  title: string;
  count: string;
  subtitle?: string;
  lines: PrepLine[];
  recipe?: Recipe;
  total?: number;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  useFullBleed(true);

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const safeDate = valid ? date : "2000-01-01";
  const week = isoWeekOf(safeDate);

  const data = usePlanningData();
  const { events, recipeById, clientById, ingredientById, courses, loading, error, patchLine } = data;

  const [mode, setMode] = useState<Mode>("event");
  const [hideDone, setHideDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ name: string; next?: PrepLine } | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const dayEvents = useMemo(() => events.filter((e) => e.date.slice(0, 10) === safeDate), [events, safeDate]);
  const lines = useMemo(
    () => prepLinesForDate(events, recipeById, clientById, courses, safeDate),
    [events, recipeById, clientById, courses, safeDate],
  );
  const guests = dayEvents.reduce((n, e) => n + e.guestCount, 0);
  const done = lines.filter((l) => l.prepStatus === "done").length;

  const groups = useMemo<Group[]>(() => {
    const visible = (ls: PrepLine[]) => doneLast(hideDone ? ls.filter((l) => l.prepStatus !== "done") : ls);
    if (mode === "event") {
      return dayEvents.map((ev) => {
        const evLines = lines.filter((l) => l.eventId === ev.eventId);
        const client = ev.clientId ? clientById.get(ev.clientId)?.name : undefined;
        return {
          key: ev.eventId,
          title: ev.name,
          subtitle: [client, `${ev.guestCount} convives`].filter(Boolean).join(" · "),
          count: plural(evLines.length, "ligne"),
          lines: visible(evLines),
        };
      });
    }
    if (mode === "course") {
      const order: string[] = [];
      for (const l of lines) if (!order.includes(l.course)) order.push(l.course);
      return order.map((course) => {
        const cLines = lines.filter((l) => l.course === course);
        return { key: course, title: course, count: plural(cLines.length, "ligne"), lines: visible(cLines) };
      });
    }
    return groupByRecipe(lines).map((g) => {
      const rLines = lines.filter((l) => l.recipeId === g.recipeId);
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
  }, [mode, hideDone, dayEvents, lines, clientById, recipeById]);

  const shownGroups = groups.filter((g) => g.lines.length > 0);

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
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e)) return;
      if (e.key === "ArrowLeft") navigate(`/jour/${addDays(safeDate, -1)}`);
      if (e.key === "ArrowRight") navigate(`/jour/${addDays(safeDate, 1)}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, safeDate]);

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
    navigate(`/jour/${addDays(safeDate, dx < 0 ? 1 : -1)}`);
  };

  const setStatus = useCallback(async (line: PrepLine, status: PrepStatus) => {
    try {
      await patchLine(line.eventId, line.lineId, { prepStatus: status });
    } catch {
      toast({ title: "Erreur lors de la mise à jour du statut", variant: "destructive" });
    }
  }, [patchLine, toast]);

  const setAllStatus = async (ls: PrepLine[], status: PrepStatus) => {
    for (const l of ls) if (l.prepStatus !== status) await setStatus(l, status);
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

  if (!valid) return <Navigate to={`/semaine/${isoWeekOf(todayIso())}`} replace />;

  const prepUrl = (l: PrepLine) => `/events/${l.eventId}/lines/${l.lineId}`;

  return (
    <div
      className="h-[calc(100dvh-68px)] overflow-y-auto px-4 pb-24 pt-4 md:h-dvh md:px-8 md:pt-8 print:h-auto print:overflow-visible"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="mx-auto max-w-doc">
        <PageHeader
          breadcrumb={[{ label: `Semaine ${parseIsoWeek(week).week}`, to: `/semaine/${week}` }]}
          title={longDayLabel(safeDate)}
          meta={`${plural(dayEvents.length, "événement")} · ${plural(guests, "convive")} · ${plural(lines.length, "ligne")} · ${done} ${done === 1 ? "faite" : "faites"}`}
          actions={
            <div className="no-print flex flex-wrap items-center gap-2">
              <Link to={`/jour/${addDays(safeDate, -1)}`} aria-label="Jour précédent" className={ICON_BTN}><ChevronLeft className="h-6 w-6" /></Link>
              <Link to={`/jour/${addDays(safeDate, 1)}`} aria-label="Jour suivant" className={ICON_BTN}><ChevronRight className="h-6 w-6" /></Link>
              <button type="button" onClick={createGrocery} disabled={busy || loading} className={TEXT_BTN}>
                <ShoppingCart className="h-5 w-5" /> Courses du jour
              </button>
              <button type="button" onClick={() => window.print()} className={TEXT_BTN}>
                <Printer className="h-5 w-5" /> Imprimer
              </button>
            </div>
          }
        />

        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Regroupement" className="hidden md:inline-flex rounded-lg border border-border bg-card p-0.5">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={mode === m.value}
                onClick={() => setMode(m.value)}
                className={`min-h-10 rounded-md px-3 text-base font-medium ${mode === m.value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-hover"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <select aria-label="Regroupement" value={mode} onChange={(e) => setMode(e.target.value as Mode)} className="input-field w-auto min-h-11 md:hidden">
            {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-base">
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="h-5 w-5 accent-primary" />
            Masquer les lignes faites
          </label>
        </div>

        {error && <p className="mt-4 text-base text-destructive">{error}</p>}
        {loading && <p className="mt-6 text-base text-muted-foreground">Chargement…</p>}
        {!loading && lines.length === 0 && (
          <p className="mt-6 text-base text-muted-foreground">
            Aucune ligne à préparer ce jour. <Link to={`/events/new?date=${safeDate}`} className="text-primary underline-offset-4 hover:underline">Créer un événement</Link>
          </p>
        )}
        {!loading && lines.length > 0 && shownGroups.length === 0 && (
          <p className="mt-6 text-base text-muted-foreground">Tout est fait.</p>
        )}

        {shownGroups.map((group, i) => (
          <section key={group.key} className={`mt-6 ${i > 0 ? "print-break" : ""}`}>
            <header className="sticky top-0 z-10 bg-background py-2">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-h3 min-w-0">{group.title}</h2>
                <span className="shrink-0 text-base text-muted-foreground tabular-nums">{group.count}</span>
              </div>
              {group.subtitle && <p className="text-sm text-muted-foreground">{group.subtitle}</p>}
            </header>

            {mode !== "recipe" ? (
              <ul className="divide-y divide-border">
                {group.lines.map((line) => {
                  const isDone = line.prepStatus === "done";
                  const second = mode === "event"
                    ? [line.course, line.notes].filter(Boolean).join(" · ")
                    : [line.clientName ?? line.eventName, line.notes].filter(Boolean).join(" · ");
                  return (
                    <li key={line.lineId} className={`flex min-h-14 items-center gap-2 ${isDone ? "opacity-60" : ""}`}>
                      <div className="no-print hidden w-72 shrink-0 md:block">
                        <StatusControl value={line.prepStatus} onChange={(s) => setStatus(line, s)} />
                      </div>
                      <StatusDot className="no-print md:hidden" target="always" value={line.prepStatus} onCycle={() => setStatus(line, NEXT_STATUS[line.prepStatus])} />
                      <span className="hidden print:inline-block"><Dot status={line.prepStatus} /></span>
                      <Link to={prepUrl(line)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 hover:bg-hover">
                        <span className="min-w-0 flex-1">
                          <span className="block text-lead">{line.recipeName}</span>
                          {second && <span className="block text-sm text-muted-foreground">{second}</span>}
                        </span>
                        <span className="shrink-0 text-lead font-semibold tabular-nums">{line.portions}</span>
                        <ChevronRight className="no-print h-5 w-5 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <RecipeGroupBody group={group} ingredientById={ingredientById} prepUrl={prepUrl} onStatus={(s) => setAllStatus(group.lines, s)} />
            )}
          </section>
        ))}
      </div>

      {notice && (
        <div role="status" className="no-print fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 card-elevated px-4 py-3 shadow-xl">
          <span className="min-w-0 flex-1 text-base font-medium">{notice.name} faite</span>
          {notice.next ? (
            <Link to={prepUrl(notice.next)} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground hover:opacity-90">
              Suivante
            </Link>
          ) : (
            <span className="text-base text-muted-foreground">Tout est fait</span>
          )}
          <button type="button" onClick={() => setNotice(null)} aria-label="Fermer" className={ICON_BTN}><X className="h-5 w-5" /></button>
        </div>
      )}
    </div>
  );
}

interface RecipeGroupBodyProps {
  group: Group;
  ingredientById: Map<string, Ingredient>;
  prepUrl: (l: PrepLine) => string;
  onStatus: (s: PrepStatus) => void;
}

function RecipeGroupBody({ group, ingredientById, prepUrl, onStatus }: RecipeGroupBodyProps) {
  const merged = mergedStatus(group.lines);
  const scaled = group.recipe ? scaledIngredients(group.recipe, group.lines, ingredientById) : [];
  const total = group.total ?? group.lines.reduce((n, l) => n + l.portions, 0);
  const isDone = merged === "done";

  return (
    <div className={isDone ? "opacity-60" : ""}>
      <div className="no-print mt-2 max-w-sm">
        <StatusControl value={merged} onChange={onStatus} />
      </div>
      <ul className="mt-2 divide-y divide-border">
        {group.lines.map((line) => (
          <li key={line.lineId}>
            <Link to={prepUrl(line)} className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-base hover:bg-hover">
              <Dot status={line.prepStatus} />
              <span className="min-w-0 flex-1">
                {line.clientName ?? line.eventName}
                <span className="text-muted-foreground"> · {STATUS_LABEL[line.prepStatus]}</span>
                {line.notes && <span className="block text-sm text-muted-foreground">{line.notes}</span>}
              </span>
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
      {items.map((it, i) => (
        <li key={`${it.name}-${it.unit}-${i}`} className="flex min-h-11 items-center justify-between gap-4 py-1">
          <span className="min-w-0">{it.name}</span>
          <span className="shrink-0 font-semibold tabular-nums">
            {scaleQty(it.qty, 1)} <span className="font-normal text-muted-foreground">{it.unit}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
