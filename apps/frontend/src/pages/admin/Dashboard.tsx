import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, TrendingUp, Euro, BarChart3, ChevronRight } from "lucide-react";
import type { AppEvent, Recipe, Ingredient } from "@packages/types";
import { api } from "@/lib/api";
import { calcRecipeCost, fmt } from "@/lib/recipe-helpers";

export default function Dashboard() {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.events.list(), api.recipes.list(), api.ingredients.list()])
      .then(([ev, r, i]) => { setEvents(ev); setRecipes(r); setIngredients(i); })
      .finally(() => setLoading(false));
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
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
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
