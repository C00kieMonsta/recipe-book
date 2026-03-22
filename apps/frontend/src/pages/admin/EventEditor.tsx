import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Plus, X, Search } from "lucide-react";
import type { AppEvent, Recipe, Ingredient, EventRecipeLine, EventExtraCost } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { calcRecipeCost, fmt } from "@/lib/recipe-helpers";

export default function EventEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { toast } = useToast();
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [guestCount, setGuestCount] = useState(10);
  const [recipes, setRecipes] = useState<EventRecipeLine[]>([]);
  const [extraCosts, setExtraCosts] = useState<EventExtraCost[]>([]);
  const [sellingPricePerGuest, setSellingPricePerGuest] = useState(0);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"upcoming" | "completed">("upcoming");
  const [recipeSearch, setRecipeSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [recs, ings] = await Promise.all([api.recipes.list(), api.ingredients.list()]);
        setAllRecipes(recs);
        setAllIngredients(ings);
        if (!isNew && id) {
          const ev = await api.events.get(id);
          setName(ev.name); setDate(ev.date); setGuestCount(ev.guestCount);
          setRecipes(ev.recipes); setExtraCosts(ev.extraCosts);
          setSellingPricePerGuest(ev.sellingPricePerGuest);
          setNotes(ev.notes || ""); setStatus(ev.status);
        }
      } catch {
        toast({ title: "Erreur de chargement", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
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

  const totalRecipeCost = useMemo(() =>
    recipes.reduce((sum, rl) => {
      const totalCost = recipeCostMap[rl.recipeId] || 0;
      const portions = recipePortionMap[rl.recipeId] || 1;
      const costPerPortion = totalCost / portions;
      return sum + costPerPortion * rl.portions;
    }, 0),
  [recipes, recipeCostMap, recipePortionMap]);

  const totalExtraCosts = useMemo(() => extraCosts.reduce((s, c) => s + c.amount, 0), [extraCosts]);
  const totalCost = totalRecipeCost + totalExtraCosts;
  const totalRevenue = sellingPricePerGuest * guestCount;
  const margin = totalRevenue - totalCost;
  const marginPct = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;

  const filteredRecipes = useMemo(() => {
    if (!recipeSearch) return allRecipes.slice(0, 10);
    return allRecipes.filter((r) => r.name.toLowerCase().includes(recipeSearch.toLowerCase())).slice(0, 10);
  }, [allRecipes, recipeSearch]);

  const addRecipe = (recipeId: string) => {
    if (recipes.some((r) => r.recipeId === recipeId)) return;
    setRecipes([...recipes, { recipeId, portions: guestCount }]);
    setRecipeSearch("");
  };

  const updateRecipeLine = (i: number, portions: number) => {
    const next = [...recipes];
    next[i] = { ...next[i], portions };
    setRecipes(next);
  };

  const removeRecipeLine = (i: number) => setRecipes(recipes.filter((_, idx) => idx !== i));

  const addExtraCost = () => setExtraCosts([...extraCosts, { label: "", amount: 0 }]);
  const updateExtraCost = (i: number, field: keyof EventExtraCost, v: string | number) => {
    const next = [...extraCosts];
    next[i] = { ...next[i], [field]: v };
    setExtraCosts(next);
  };
  const removeExtraCost = (i: number) => setExtraCosts(extraCosts.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!name.trim()) { toast({ title: "Le nom est requis", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const data = { name, date, guestCount, recipes, extraCosts, sellingPricePerGuest, notes: notes || undefined, status };
      if (isNew) {
        const created = await api.events.create(data);
        toast({ title: "Événement créé" });
        navigate(`/events/${created.eventId}`);
      } else {
        await api.events.update(id!, data);
        toast({ title: "Événement modifié" });
        navigate(`/events/${id}`);
      }
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="flex justify-between items-center mb-5">
        <button onClick={() => navigate(isNew ? "/events" : `/events/${id}`)} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Annuler
        </button>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium shadow-sm disabled:opacity-50">
          <Save className="h-4 w-4" /> {saving ? "Sauvegarde…" : "Enregistrer"}
        </button>
      </div>

      <h1 className="text-3xl font-bold tracking-tight mb-6">{isNew ? "Nouvel événement" : "Modifier l'événement"}</h1>

      <div className="grid gap-5">
        <section className="card-elevated p-5">
          <h2 className="font-serif text-lg font-bold mb-4">Informations</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <FieldLabel>Nom de l'événement</FieldLabel>
              <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <FieldLabel>Date</FieldLabel>
              <input className="input-field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <FieldLabel>Nombre de convives</FieldLabel>
              <input className="input-field" type="text" inputMode="numeric" value={guestCount} onChange={(e) => setGuestCount(+e.target.value)} />
            </div>
            <div>
              <FieldLabel>Prix de vente par convive HTVA (€)</FieldLabel>
              <input className="input-field" type="text" inputMode="decimal" value={sellingPricePerGuest} onChange={(e) => setSellingPricePerGuest(+e.target.value)} />
            </div>
            <div>
              <FieldLabel>Statut</FieldLabel>
              <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value as "upcoming" | "completed")}>
                <option value="upcoming">À venir</option>
                <option value="completed">Terminé</option>
              </select>
            </div>
          </div>
          <FieldLabel>Notes</FieldLabel>
          <textarea className="input-field min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </section>

        <section className="card-elevated p-5">
          <h2 className="font-serif text-lg font-bold mb-3">Recettes</h2>
          <div className="relative mb-4">
            <div className="flex items-center gap-2 px-3 py-2 border rounded-lg">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input className="flex-1 bg-transparent outline-none text-sm" placeholder="Ajouter une recette…" value={recipeSearch} onChange={(e) => setRecipeSearch(e.target.value)} />
            </div>
            {recipeSearch && filteredRecipes.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-card border rounded-lg shadow-lg max-h-48 overflow-auto">
                {filteredRecipes.map((r) => (
                  <button key={r.recipeId} onClick={() => addRecipe(r.recipeId)} className="w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors flex justify-between">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-muted-foreground">{r.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {recipes.length > 0 && (
            <table className="w-full text-sm mb-2">
              <thead><tr className="border-b">
                <th className="px-2 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Recette</th>
                <th className="px-2 py-2 text-right text-xs font-bold uppercase text-muted-foreground w-24">Portions</th>
                <th className="px-2 py-2 text-right text-xs font-bold uppercase text-muted-foreground w-24">Coût unit. HT</th>
                <th className="px-2 py-2 text-right text-xs font-bold uppercase text-muted-foreground w-24">Coût total HT</th>
                <th className="w-10" />
              </tr></thead>
              <tbody>
                {recipes.map((rl, i) => {
                  const rec = allRecipes.find((r) => r.recipeId === rl.recipeId);
                  const totalRecCost = recipeCostMap[rl.recipeId] || 0;
                  const recPortions = recipePortionMap[rl.recipeId] || 1;
                  const costPerPortion = totalRecCost / recPortions;
                  const lineCost = costPerPortion * rl.portions;
                  return (
                    <tr key={rl.recipeId} className="border-b border-border/30">
                      <td className="px-2 py-2 font-semibold">{rec?.name || "—"}</td>
                      <td className="px-2 py-2"><input className="input-field !py-1 !text-xs text-right w-full" type="text" inputMode="numeric" value={rl.portions} onChange={(e) => updateRecipeLine(i, +e.target.value)} /></td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{fmt(costPerPortion)}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium">{fmt(lineCost)}</td>
                      <td className="px-2 py-2"><button onClick={() => removeRecipeLine(i)} className="p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  );
                })}
                <tr className="font-bold">
                  <td className="px-2 py-2" colSpan={3}>Sous-total recettes</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(totalRecipeCost)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </section>

        <section className="card-elevated p-5">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-serif text-lg font-bold">Coûts supplémentaires</h2>
            <button onClick={addExtraCost} className="flex items-center gap-1 px-3 py-1 border rounded-md text-xs font-medium hover:bg-muted"><Plus className="h-3.5 w-3.5" /> Ajouter</button>
          </div>
          {extraCosts.map((ec, i) => (
            <div key={i} className="flex gap-3 mb-2 items-center">
              <input className="input-field flex-1 !py-1.5" placeholder="Description…" value={ec.label} onChange={(e) => updateExtraCost(i, "label", e.target.value)} />
              <input className="input-field w-28 !py-1.5 text-right" type="text" inputMode="decimal" value={ec.amount} onChange={(e) => updateExtraCost(i, "amount", +e.target.value)} />
              <button onClick={() => removeExtraCost(i)} className="p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {extraCosts.length > 0 && (
            <div className="flex justify-between px-2 py-2 font-bold text-sm border-t mt-2">
              <span>Sous-total</span>
              <span>{fmt(totalExtraCosts)}</span>
            </div>
          )}
        </section>

        <section className="card-elevated p-5">
          <h2 className="font-serif text-lg font-bold mb-4">Résumé financier</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard label="Coût total HTVA" value={fmt(totalCost)} />
            <SummaryCard label="Revenu total HTVA" value={fmt(totalRevenue)} />
            <SummaryCard label="Marge HTVA" value={fmt(margin)} className={margin >= 0 ? "text-green-600" : "text-destructive"} />
            <SummaryCard label="Marge %" value={`${marginPct.toFixed(1)}%`} className={marginPct >= 0 ? "text-green-600" : "text-destructive"} />
          </div>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <SummaryCard label="Coût/convive HTVA" value={fmt(guestCount > 0 ? totalCost / guestCount : 0)} />
            <SummaryCard label="Marge/convive HTVA" value={fmt(guestCount > 0 ? margin / guestCount : 0)} className={margin >= 0 ? "text-green-600" : "text-destructive"} />
          </div>
        </section>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">{children}</label>;
}

function SummaryCard({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3 text-center">
      <div className="text-xs text-muted-foreground font-medium mb-1">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${className}`}>{value}</div>
    </div>
  );
}
