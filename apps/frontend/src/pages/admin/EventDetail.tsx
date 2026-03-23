import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, Copy } from "lucide-react";
import type { AppEvent, Recipe, Ingredient } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { calcRecipeCost, fmt } from "@/lib/recipe-helpers";
import ActionMenu from "@/components/ui/ActionMenu";

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [event, setEvent] = useState<AppEvent | null>(null);
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.events.get(id), api.recipes.list(), api.ingredients.list()])
      .then(([ev, recs, ings]) => { setEvent(ev); setAllRecipes(recs); setAllIngredients(ings); })
      .catch(() => toast({ title: "Erreur de chargement", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id]);

  const recipeCostMap = useMemo(() => {
    const map: Record<string, number> = {};
    allRecipes.forEach((r) => { map[r.recipeId] = calcRecipeCost(r, allIngredients); });
    return map;
  }, [allRecipes, allIngredients]);

  const recipePortionMap = useMemo(() => {
    const map: Record<string, number> = {};
    allRecipes.forEach((r) => { map[r.recipeId] = r.portions || 1; });
    return map;
  }, [allRecipes]);

  if (loading || !event) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  const totalRecipeCost = event.recipes.reduce((sum, rl) => {
    const totalCost = recipeCostMap[rl.recipeId] || 0;
    const portions = recipePortionMap[rl.recipeId] || 1;
    return sum + (totalCost / portions) * rl.portions;
  }, 0);
  const totalExtraCosts = event.extraCosts.reduce((s, c) => s + c.amount, 0);
  const totalCost = totalRecipeCost + totalExtraCosts;
  const totalRevenue = event.sellingPricePerGuest * event.guestCount;
  const margin = totalRevenue - totalCost;
  const marginPct = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;

  const handleDelete = async () => {
    try {
      await api.events.delete(event.eventId);
      toast({ title: "Événement supprimé" });
      navigate("/events");
    } catch {
      toast({ title: "Erreur lors de la suppression", variant: "destructive" });
    }
  };

  const handleDuplicate = async () => {
    try {
      const data = {
        name: `${event.name} (copie)`,
        date: new Date().toISOString().split("T")[0],
        guestCount: event.guestCount,
        recipes: event.recipes,
        extraCosts: event.extraCosts,
        sellingPricePerGuest: event.sellingPricePerGuest,
        notes: event.notes,
        contactName: event.contactName,
        contactPhone: event.contactPhone,
        contactEmail: event.contactEmail,
        status: "upcoming" as const,
      };
      const created = await api.events.create(data);
      toast({ title: "Événement dupliqué" });
      navigate(`/events/${created.eventId}/edit`);
    } catch {
      toast({ title: "Erreur lors de la duplication", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="flex justify-between items-center mb-5">
        <button onClick={() => navigate("/events")} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <ActionMenu items={[
          { label: "Modifier", icon: <Pencil className="h-4 w-4" />, onClick: () => navigate(`/events/${id}/edit`) },
          { label: "Dupliquer", icon: <Copy className="h-4 w-4" />, onClick: handleDuplicate },
          { label: "Supprimer", icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleteConfirm(true), variant: "danger" },
        ]} />
      </div>

      <div className="flex gap-4 items-start mb-6 flex-wrap">
        <div className="flex-1">
          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold mb-2 ${event.status === "upcoming" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
            {event.status === "upcoming" ? "À venir" : "Terminé"}
          </span>
          <h1 className="text-3xl font-bold tracking-tight mb-1">{event.name}</h1>
          <p className="text-muted-foreground text-sm">
            {new Date(event.date).toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {event.guestCount} convives
          </p>
          {event.notes && <p className="text-muted-foreground text-sm mt-2 italic">{event.notes}</p>}
          {(event.contactName || event.contactPhone || event.contactEmail) && (
            <div className="flex gap-4 mt-3 text-sm text-muted-foreground flex-wrap">
              {event.contactName && <span>Contact: <strong className="text-foreground">{event.contactName}</strong></span>}
              {event.contactPhone && <a href={`tel:${event.contactPhone}`} className="hover:text-foreground transition-colors">{event.contactPhone}</a>}
              {event.contactEmail && <a href={`mailto:${event.contactEmail}`} className="hover:text-foreground transition-colors">{event.contactEmail}</a>}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Coût total HTVA" value={fmt(totalCost)} />
        <StatCard label="Revenu total HTVA" value={fmt(totalRevenue)} />
        <StatCard label="Marge HTVA" value={fmt(margin)} className={margin >= 0 ? "text-green-600" : "text-destructive"} />
        <StatCard label="Marge %" value={`${marginPct.toFixed(1)}%`} className={marginPct >= 0 ? "text-green-600" : "text-destructive"} />
      </div>

      <section className="card-elevated p-5 mb-5">
        <h2 className="font-serif text-lg font-bold mb-3">Recettes</h2>
        <table className="w-full text-sm">
          <thead><tr className="border-b-2">
            <th className="px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Recette</th>
            <th className="px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Portions</th>
            <th className="px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Coût unit. HT</th>
            <th className="px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Coût total HT</th>
          </tr></thead>
          <tbody>
            {event.recipes.map((rl) => {
              const rec = allRecipes.find((r) => r.recipeId === rl.recipeId);
              const totalRecCost = recipeCostMap[rl.recipeId] || 0;
              const recPortions = recipePortionMap[rl.recipeId] || 1;
              const cpp = totalRecCost / recPortions;
              return (
                <tr key={rl.recipeId} className="border-b border-border/30">
                  <td className="px-3 py-2 font-semibold">{rec?.name || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{rl.portions}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(cpp)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(cpp * rl.portions)}</td>
                </tr>
              );
            })}
            <tr className="font-bold border-t-2">
              <td className="px-3 py-2" colSpan={3}>Sous-total recettes</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(totalRecipeCost)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {event.extraCosts.length > 0 && (
        <section className="card-elevated p-5 mb-5">
          <h2 className="font-serif text-lg font-bold mb-3">Coûts supplémentaires</h2>
          <table className="w-full text-sm">
            <tbody>
              {event.extraCosts.map((ec, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="px-3 py-2 font-medium">{ec.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(ec.amount)}</td>
                </tr>
              ))}
              <tr className="font-bold border-t-2">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totalExtraCosts)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setDeleteConfirm(false)}>
          <div className="bg-card rounded-2xl p-7 max-w-sm w-[92%] shadow-xl animate-fade-up text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-lg font-bold mb-2">Confirmer la suppression</h3>
            <p className="text-muted-foreground text-sm mb-6">Cette action est irréversible.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2 border rounded-lg text-sm font-medium">Annuler</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="card-elevated p-4 text-center">
      <div className="text-xs text-muted-foreground font-medium mb-1">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${className}`}>{value}</div>
    </div>
  );
}
