import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, Save } from "lucide-react";
import type { Recipe, Ingredient, RecipePricing } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { calcRecipeCost, calcIngredientLineCost, fmt, supplierColor } from "@/lib/recipe-helpers";

const DEFAULT_PRICING: RecipePricing = {
  surPlace: { coef: 4, tva: 12 },
  takeAway: { coef: 3, tva: 6 },
  chosenPrice: { surPlace: 0, takeAway: 0 },
};

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.recipes.get(id), api.ingredients.list()])
      .then(([r, i]) => { setRecipe(r); setIngredients(i); })
      .catch(() => toast({ title: "Recette introuvable", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    try {
      await api.recipes.delete(id);
      toast({ title: "Recette supprimée" });
      navigate("/recipes");
    } catch {
      toast({ title: "Erreur lors de la suppression", variant: "destructive" });
    }
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;
  if (!recipe) return <div className="p-8 text-muted-foreground">Recette introuvable</div>;

  const totalCost = calcRecipeCost(recipe, ingredients);

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="flex justify-between items-center mb-5">
        <button onClick={() => navigate("/recipes")} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/recipes/${id}/edit`)} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-muted transition-colors">
            <Pencil className="h-4 w-4" /> Modifier
          </button>
          <button onClick={() => setDeleteConfirm(true)} className="p-2 border border-destructive/30 text-destructive rounded-lg hover:bg-destructive/5 transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-6 mb-7 flex-wrap">
        <div className="flex-1 min-w-[300px]">
          <div className="inline-block px-3 py-1 rounded-full bg-foreground text-background text-xs font-semibold uppercase tracking-wider mb-3">{recipe.type}</div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">{recipe.name}</h1>
          <p className="text-muted-foreground leading-relaxed mb-4">{recipe.description}</p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <span>Portions: <strong className="text-foreground">{recipe.portions}</strong></span>
            <span>Poids/pers: <strong className="text-foreground">{recipe.portionWeight}g</strong></span>
            <span>Créé le: <strong className="text-foreground">{new Date(recipe.createdAt).toLocaleDateString("fr-BE")}</strong></span>
          </div>
        </div>
        {recipe.photos?.length > 0 && (
          <div className="flex gap-3 shrink-0">
            {recipe.photos.map((photo, idx) => (
              <div key={idx} className="relative">
                <img src={photo.url} alt={photo.label} className="w-36 h-28 object-cover rounded-lg border" />
                {photo.label && <div className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">{photo.label}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-5">
        {recipe.techniques.length > 0 && (
          <section className="card-elevated p-5">
            <h2 className="font-serif text-lg font-bold mb-4">Techniques</h2>
            <ol className="space-y-2">
              {recipe.techniques.map((t, i) => (
                <li key={i} className="flex gap-3 items-start text-sm leading-relaxed">
                  <span className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                  <span className="text-muted-foreground pt-0.5">{t}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="card-elevated p-5">
          <h2 className="font-serif text-lg font-bold mb-4">Ingrédients</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-border">
                <th className="px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Produit</th>
                <th className="px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Qté</th>
                <th className="px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Perte</th>
                <th className="px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Prix/unité</th>
                <th className="px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Coût</th>
              </tr>
            </thead>
            <tbody>
              {recipe.ingredients.map((ri, idx) => {
                const ing = ingredients.find((i) => i.ingredientId === ri.ingredientId);
                if (!ing) return null;
                const lineCost = calcIngredientLineCost(ri, ing);
                return (
                  <tr key={idx} className="border-b border-border/30">
                    <td className="px-3 py-2">
                      <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: supplierColor(ing.supplier) }} />
                      {ing.name}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{ri.qty} {ri.unit}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{ri.lossPct || 0}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(ing.price)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(lineCost)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border">
                <td colSpan={4} className="px-3 py-2 font-bold">Total matières HTVA</td>
                <td className="px-3 py-2 text-right font-bold tabular-nums">{fmt(totalCost)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <PricingSimulation recipe={recipe} totalCost={totalCost} />
      </div>

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

function PricingSimulation({ recipe, totalCost }: { recipe: Recipe; totalCost: number }) {
  const [pricing, setPricing] = useState<RecipePricing>(recipe.pricing || DEFAULT_PRICING);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const set = (path: string, value: number) => {
    setPricing((prev) => {
      const next = structuredClone(prev);
      const parts = path.split(".");
      let obj = next as unknown as Record<string, unknown>;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]] as Record<string, unknown>;
      obj[parts[parts.length - 1]] = value;
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.recipes.update(recipe.recipeId, { pricing });
      setDirty(false);
      toast({ title: "Tarification sauvegardée" });
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const portions = recipe.portions || 1;
  const cpP = totalCost / portions;

  const spHTVA = cpP * pricing.surPlace.coef;
  const taHTVA = cpP * pricing.takeAway.coef;
  const spTVAC = spHTVA * (1 + pricing.surPlace.tva / 100);
  const taTVAC = taHTVA * (1 + pricing.takeAway.tva / 100);

  const spChosen = pricing.chosenPrice.surPlace;
  const taChosen = pricing.chosenPrice.takeAway;
  const spChosenCoef = spChosen > 0 && cpP > 0 ? spChosen / (1 + pricing.surPlace.tva / 100) / cpP : 0;
  const taChosenCoef = taChosen > 0 && cpP > 0 ? taChosen / (1 + pricing.takeAway.tva / 100) / cpP : 0;
  const spChosenMarge = spChosen > 0 ? spChosen / (1 + pricing.surPlace.tva / 100) - cpP : 0;
  const taChosenMarge = taChosen > 0 ? taChosen / (1 + pricing.takeAway.tva / 100) - cpP : 0;

  return (
    <section className="card-elevated p-5 bg-gradient-to-br from-card to-muted/30">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-serif text-lg font-bold">Simulation de prix</h2>
        {dirty && (
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium shadow-sm disabled:opacity-50">
            <Save className="h-3.5 w-3.5" /> {saving ? "Sauvegarde…" : "Enregistrer les prix"}
          </button>
        )}
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="pb-2 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground" />
            <th className="pb-2 px-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Sur place</th>
            <th className="pb-2 px-4 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Take away</th>
          </tr>
        </thead>
        <tbody>
          <CalcRow label="Coût matières recette HTVA" sp={fmt(totalCost)} ta={fmt(totalCost)} />
          <CalcRow label={`Coût par portion HTVA (÷${portions})`} sp={fmt(cpP)} ta={fmt(cpP)} bold />

          <EditRow
            label="COEF"
            sp={<EditableNum value={pricing.surPlace.coef} onChange={(v) => set("surPlace.coef", v)} step={0.1} />}
            ta={<EditableNum value={pricing.takeAway.coef} onChange={(v) => set("takeAway.coef", v)} step={0.1} />}
          />
          <CalcRow label="Prix vente portion HTVA" sp={fmt(spHTVA)} ta={fmt(taHTVA)} />
          <EditRow
            label="TVA"
            sp={<EditableNum value={pricing.surPlace.tva} onChange={(v) => set("surPlace.tva", v)} suffix="%" />}
            ta={<EditableNum value={pricing.takeAway.tva} onChange={(v) => set("takeAway.tva", v)} suffix="%" />}
          />
          <CalcRow label="Prix TVAC" sp={fmt(spTVAC)} ta={fmt(taTVAC)} />
          <CalcRow label="Marge par portion" sp={fmt(spHTVA - cpP)} ta={fmt(taHTVA - cpP)} positive />

          <tr><td colSpan={3} className="pt-4 pb-1"><div className="border-t-2 border-border" /></td></tr>

          <EditRow
            label="Prix de vente choisi TVAC"
            sp={<EditableNum value={spChosen} onChange={(v) => set("chosenPrice.surPlace", v)} step={0.5} placeholder="—" />}
            ta={<EditableNum value={taChosen} onChange={(v) => set("chosenPrice.takeAway", v)} step={0.5} placeholder="—" />}
            bold
          />
          <CalcRow
            label="COEF calculé"
            sp={spChosen > 0 ? spChosenCoef.toFixed(2) : "—"}
            ta={taChosen > 0 ? taChosenCoef.toFixed(2) : "—"}
          />
          <CalcRow
            label="Marge par portion"
            sp={spChosen > 0 ? fmt(spChosenMarge) : "—"}
            ta={taChosen > 0 ? fmt(taChosenMarge) : "—"}
            positive={spChosenMarge > 0 || taChosenMarge > 0}
          />
        </tbody>
      </table>
    </section>
  );
}

function CalcRow({ label, sp, ta, bold, positive }: { label: string; sp: string; ta: string; bold?: boolean; positive?: boolean }) {
  return (
    <tr className="border-b border-border/20">
      <td className={`py-2 ${bold ? "font-bold text-foreground" : "font-medium text-muted-foreground"}`}>{label}</td>
      <td className={`py-2 px-4 text-right tabular-nums ${bold ? "font-bold" : "font-medium"} ${positive ? "text-green-600" : ""}`}>{sp}</td>
      <td className={`py-2 px-4 text-right tabular-nums ${bold ? "font-bold" : "font-medium"} ${positive ? "text-green-600" : ""}`}>{ta}</td>
    </tr>
  );
}

function EditRow({ label, sp, ta, bold }: { label: string; sp: React.ReactNode; ta: React.ReactNode; bold?: boolean }) {
  return (
    <tr className="border-b border-border/20 bg-muted/20">
      <td className={`py-1.5 ${bold ? "font-bold text-foreground" : "font-semibold text-foreground"}`}>{label}</td>
      <td className="py-1.5 px-3 text-right">{sp}</td>
      <td className="py-1.5 px-3 text-right">{ta}</td>
    </tr>
  );
}

function EditableNum({ value, onChange, step = 1, suffix, placeholder }: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <input
        type="number"
        step={step}
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange(+e.target.value)}
        className="w-20 text-right px-2 py-0.5 border rounded-md bg-background text-sm font-semibold tabular-nums focus:border-primary outline-none"
      />
      {suffix && <span className="text-muted-foreground text-xs w-4">{suffix}</span>}
    </div>
  );
}
