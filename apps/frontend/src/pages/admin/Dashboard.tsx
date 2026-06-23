import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, TrendingUp, Euro, BarChart3, ChevronRight, ShoppingCart } from "lucide-react";
import type { AppEvent, Recipe, Ingredient, GroceryList } from "@packages/types";
import { api } from "@/lib/api";
import { calcRecipeCost, fmt } from "@/lib/recipe-helpers";

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];

interface MonthlyDatum {
  month: number;
  revenue: number;
  margin: number;
  count: number;
}

export default function Dashboard() {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [groceryLists, setGroceryLists] = useState<GroceryList[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.events.list(), api.recipes.list(), api.ingredients.list()])
      .then(([ev, r, i]) => { setEvents(ev); setRecipes(r); setIngredients(i); })
      .finally(() => setLoading(false));
    api.groceryLists.list().then(setGroceryLists).catch(() => {});
  }, []);

  const recipeCostMap = useMemo(() => {
    const map: Record<string, number> = {};
    recipes.forEach((r) => { map[r.recipeId] = calcRecipeCost(r, ingredients); });
    return map;
  }, [recipes, ingredients]);

  const recipePortionMap = useMemo(() => {
    const map: Record<string, number> = {};
    recipes.forEach((r) => { map[r.recipeId] = r.portions || 1; });
    return map;
  }, [recipes]);

  const eventRows = useMemo(() =>
    events
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((ev) => {
        const recipeCost = ev.recipes.reduce((s, rl) => {
          const total = recipeCostMap[rl.recipeId] || 0;
          const portions = recipePortionMap[rl.recipeId] || 1;
          return s + (total / portions) * rl.portions;
        }, 0);
        const extraCost = ev.extraCosts.reduce((s, c) => s + c.amount, 0);
        const totalCost = recipeCost + extraCost;
        const revenue = ev.sellingPricePerGuest * ev.guestCount;
        const margin = revenue - totalCost;
        const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
        return { ...ev, totalCost, revenue, margin, marginPct };
      }),
  [events, recipeCostMap, recipePortionMap]);

  const availableYears = useMemo(() => {
    const set = new Set(events.map((e) => new Date(e.date).getFullYear()));
    const arr = [...set].sort((a, b) => b - a);
    return arr.length ? arr : [new Date().getFullYear()];
  }, [events]);

  const [year, setYear] = useState(() => new Date().getFullYear());

  useEffect(() => {
    if (!availableYears.includes(year)) setYear(availableYears[0]);
  }, [availableYears]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthlyData = useMemo<MonthlyDatum[]>(() => {
    const months: MonthlyDatum[] = MONTH_LABELS.map((_, i) => ({ month: i, revenue: 0, margin: 0, count: 0 }));
    eventRows.forEach((ev) => {
      const d = new Date(ev.date);
      if (d.getFullYear() !== year) return;
      const m = d.getMonth();
      months[m].revenue += ev.revenue;
      months[m].margin += ev.margin;
      months[m].count += 1;
    });
    return months;
  }, [eventRows, year]);

  const yearRevenue = monthlyData.reduce((s, m) => s + m.revenue, 0);
  const yearMargin = monthlyData.reduce((s, m) => s + m.margin, 0);

  const totalEvents = events.length;
  const completedEvents = eventRows.filter((e) => e.status === "completed");
  const totalRevenue = completedEvents.reduce((s, e) => s + e.revenue, 0);
  const totalMargin = completedEvents.reduce((s, e) => s + e.margin, 0);
  const avgMarginPct = completedEvents.length > 0 ? (totalMargin / totalRevenue) * 100 : 0;

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground mt-1">Vue d'ensemble de l'activité</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard icon={Calendar} label="Événements" value={String(totalEvents)} sub={`${completedEvents.length} terminés`} />
        <KpiCard icon={Euro} label="Revenu total HTVA" value={fmt(totalRevenue)} sub="Événements terminés" />
        <KpiCard icon={TrendingUp} label="Marge totale HTVA" value={fmt(totalMargin)} sub="Événements terminés" className={totalMargin >= 0 ? "text-green-600" : "text-destructive"} />
        <KpiCard icon={BarChart3} label="Marge moyenne" value={`${isNaN(avgMarginPct) ? 0 : avgMarginPct.toFixed(1)}%`} sub="Événements terminés" className={avgMarginPct >= 0 ? "text-green-600" : "text-destructive"} />
      </div>

      <section className="card-elevated p-5 mb-6">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
          <div>
            <h2 className="font-serif text-lg font-bold">Performance mensuelle</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {year} · Revenu {fmt(yearRevenue)} · Marge <span className={yearMargin >= 0 ? "text-green-600" : "text-destructive"}>{fmt(yearMargin)}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Legend />
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="px-3 py-1.5 border rounded-lg text-sm font-medium bg-card focus:border-primary outline-none cursor-pointer"
            >
              {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <MonthlyChart data={monthlyData} />
      </section>

      <section className="card-elevated">
        <div className="flex justify-between items-center p-5 pb-3">
          <h2 className="font-serif text-lg font-bold">Événements récents</h2>
          <button onClick={() => navigate("/events")} className="flex items-center gap-1 text-xs text-primary font-medium hover:underline">
            Voir tout <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="px-5 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Nom</th>
              <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Date</th>
              <th className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Convives</th>
              <th className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Revenu HT</th>
              <th className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Coût HT</th>
              <th className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Marge HT</th>
              <th className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">%</th>
              <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Statut</th>
            </tr>
          </thead>
          <tbody>
            {eventRows.slice(0, 15).map((ev) => (
              <tr key={ev.eventId} onClick={() => navigate(`/events/${ev.eventId}`)} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors">
                <td className="px-5 py-2.5 font-semibold">{ev.name}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{new Date(ev.date).toLocaleDateString("fr-BE", { day: "numeric", month: "short" })}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{ev.guestCount}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(ev.revenue)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmt(ev.totalCost)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${ev.margin >= 0 ? "text-green-600" : "text-destructive"}`}>{fmt(ev.margin)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${ev.marginPct >= 0 ? "text-green-600" : "text-destructive"}`}>{ev.marginPct.toFixed(1)}%</td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${ev.status === "upcoming" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                    {ev.status === "upcoming" ? "À venir" : "Terminé"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {eventRows.length === 0 && <p className="px-5 py-10 text-center text-muted-foreground">Aucun événement pour le moment</p>}
      </section>

      {groceryLists.length > 0 && (
        <section className="card-elevated mt-6">
          <div className="flex justify-between items-center p-5 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-serif text-lg font-bold">Listes de courses</h2>
            </div>
            <button onClick={() => navigate("/grocery-list")} className="flex items-center gap-1 text-xs text-primary font-medium hover:underline">
              Nouvelle liste <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {groceryLists.map((list) => (
              <button
                key={list.listId}
                onClick={() => navigate(`/grocery-list?id=${list.listId}`)}
                className="text-left p-4 rounded-lg border border-border/60 hover:border-primary/40 hover:bg-muted/30 transition-colors"
              >
                <p className="font-semibold text-sm truncate">{list.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {list.items.length} ingrédient{list.items.length > 1 ? "s" : ""} · {new Date(list.updatedAt).toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const COLOR_REVENUE = "hsl(var(--primary))";
const COLOR_MARGIN = "#16a34a";
const COLOR_MARGIN_NEG = "hsl(var(--destructive))";
const COLOR_TREND = "#0f766e";

function compactEuro(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return `${(n / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

function linearRegression(points: { x: number; y: number }[]) {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of points) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLOR_REVENUE }} /> Revenu</span>
      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLOR_MARGIN }} /> Marge</span>
      <span className="flex items-center gap-1.5"><span className="w-4 h-0.5" style={{ background: COLOR_TREND }} /> Tendance</span>
    </div>
  );
}

function MonthlyChart({ data }: { data: MonthlyDatum[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 800, H = 320;
  const padL = 48, padR = 12, padT = 12, padB = 28;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const plotW = x1 - x0, plotH = y1 - y0;
  const groupW = plotW / 12;

  const maxVal = Math.max(0, ...data.map((d) => Math.max(d.revenue, d.margin)));
  const minVal = Math.min(0, ...data.map((d) => d.margin));
  const yMax = maxVal === 0 && minVal === 0 ? 100 : maxVal * 1.1;
  const yMin = minVal * 1.1;
  const span = yMax - yMin || 1;

  const yOf = (v: number) => y1 - ((v - yMin) / span) * plotH;
  const center = (m: number) => x0 + (m + 0.5) * groupW;
  const zeroY = yOf(0);
  const barW = Math.min(16, groupW * 0.32);

  const activePoints = data.filter((d) => d.count > 0).map((d) => ({ x: d.month, y: d.margin }));
  const reg = linearRegression(activePoints);
  let trend: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (reg && activePoints.length >= 2) {
    const first = activePoints[0].x, last = activePoints[activePoints.length - 1].x;
    trend = {
      x1: center(first), y1: yOf(reg.slope * first + reg.intercept),
      x2: center(last), y2: yOf(reg.slope * last + reg.intercept),
    };
  }

  const ticks = Array.from({ length: 5 }, (_, i) => yMin + (span * i) / 4);

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }} role="img">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={x0} y1={yOf(t)} x2={x1} y2={yOf(t)} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray={t === 0 ? "0" : "3 3"} opacity={t === 0 ? 0.9 : 0.5} />
            <text x={x0 - 8} y={yOf(t) + 3} textAnchor="end" fontSize={10} fill="hsl(var(--muted-foreground))">{compactEuro(t)}</text>
          </g>
        ))}

        {data.map((d) => {
          const c = center(d.month);
          const revH = Math.abs(zeroY - yOf(d.revenue));
          const marTop = d.margin >= 0 ? yOf(d.margin) : zeroY;
          const marH = Math.abs(yOf(d.margin) - zeroY);
          return (
            <g key={d.month} onMouseEnter={() => setHover(d.month)} onMouseLeave={() => setHover(null)}>
              {hover === d.month && <rect x={x0 + d.month * groupW} y={y0} width={groupW} height={plotH} fill="hsl(var(--muted))" opacity={0.4} />}
              <rect x={c - barW - 1} y={yOf(d.revenue)} width={barW} height={revH} rx={2} fill={COLOR_REVENUE} />
              <rect x={c + 1} y={marTop} width={barW} height={marH} rx={2} fill={d.margin >= 0 ? COLOR_MARGIN : COLOR_MARGIN_NEG} />
              <text x={c} y={H - 10} textAnchor="middle" fontSize={10} fill="hsl(var(--muted-foreground))">{MONTH_LABELS[d.month]}</text>
            </g>
          );
        })}

        {trend && (
          <line x1={trend.x1} y1={trend.y1} x2={trend.x2} y2={trend.y2} stroke={COLOR_TREND} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" />
        )}
      </svg>

      {hover !== null && data[hover].count > 0 && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-card border rounded-lg shadow-sm px-3 py-2 text-xs pointer-events-none">
          <p className="font-semibold mb-0.5">{MONTH_LABELS[hover]} · {data[hover].count} évén.</p>
          <p>Revenu : <span className="font-medium">{fmt(data[hover].revenue)}</span></p>
          <p>Marge : <span className={data[hover].margin >= 0 ? "text-green-600 font-medium" : "text-destructive font-medium"}>{fmt(data[hover].margin)}</span></p>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, className = "" }: { icon: React.ElementType; label: string; value: string; sub: string; className?: string }) {
  return (
    <div className="card-elevated p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${className}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}
