import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, Save, FileDown, ChefHat, Plus, X, Check } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Recipe, Ingredient, RecipePricing, RecipeIngredient } from "@packages/types";
import { UNITS_QTY } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { calcRecipeCost, calcIngredientLineCost, fmt, supplierColor } from "@/lib/recipe-helpers";
import ActionMenu from "@/components/ui/ActionMenu";
import NumericInput from "@/components/ui/NumericInput";
import SearchSelect from "@/components/ui/SearchSelect";

const DEFAULT_PRICING: RecipePricing = {
  surPlace: { coef: 4, tva: 12 },
  takeAway: { coef: 3, tva: 6 },
  chosenPrice: { surPlace: 0, takeAway: 0 },
};

async function exportPdf(recipe: Recipe, ingredients: Ingredient[]) {
  const doc = new jsPDF();
  const m = 15;
  let y = m;

  if (recipe.photos?.length > 0 && recipe.photos[0].key) {
    try {
      const { dataUrl, width, height } = await loadPhotoForPdf(recipe.photos[0].key);
      const maxW = 180;
      const maxH = 60;
      const ratio = Math.min(maxW / width, maxH / height);
      doc.addImage(dataUrl, "JPEG", m, y, width * ratio, height * ratio);
      y += height * ratio + 6;
    } catch { /* skip photo on error */ }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(recipe.name, m, y + 7);
  y += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${recipe.type} | ${recipe.portions} portions | ${recipe.portionWeight}g/pers`, m, y + 4);
  y += 8;

  if (recipe.description) {
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(recipe.description, 180);
    doc.text(lines, m, y + 4);
    y += lines.length * 4 + 4;
  }

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Ingrédients", m, y + 4);
  y += 8;

  const ingRows = recipe.ingredients.map((ri) => {
    const ing = ingredients.find((i) => i.ingredientId === ri.ingredientId);
    if (!ing) return ["-", "-"];
    return [ing.name, `${ri.qty} ${ri.unit}`];
  });

  autoTable(doc, {
    startY: y,
    head: [["Produit", "Quantité"]],
    body: ingRows,
    margin: { left: m },
    styles: { fontSize: 8 },
    headStyles: { fillColor: [60, 60, 60] },
  });

  y = ((doc as unknown as Record<string, unknown>).lastAutoTable as { finalY: number })?.finalY ?? y + 40;
  y += 8;

  if (recipe.techniques.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Étapes de préparation", m, y + 4);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    recipe.techniques.forEach((t, i) => {
      if (y > 270) { doc.addPage(); y = m; }
      const text = `${i + 1}. ${t}`;
      const lines = doc.splitTextToSize(text, 180);
      doc.text(lines, m, y + 4);
      y += lines.length * 4 + 3;
    });
  }

  doc.save(`${recipe.name.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\s-]/g, "")}.pdf`);
}

async function loadPhotoForPdf(key: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
  const token = sessionStorage.getItem("admin_token");
  const res = await fetch(`${API_BASE}/admin/recipes/photo?key=${encodeURIComponent(key)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to load photo");
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = reject;
    img.src = dataUrl;
  });
  return { dataUrl, width, height };
}

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [editStepValue, setEditStepValue] = useState("");
  const [newStep, setNewStep] = useState("");
  const [addingStep, setAddingStep] = useState(false);
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [newIng, setNewIng] = useState<RecipeIngredient>({ ingredientId: "", qty: 0, unit: "g", lossPct: 0 });
  const newStepRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.recipes.get(id), api.ingredients.list()])
      .then(([r, i]) => { setRecipe(r); setIngredients(i); })
      .catch(() => toast({ title: "Recette introuvable", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id]);

  const saveRecipeField = async (patch: Partial<Recipe>) => {
    if (!id || !recipe) return;
    try {
      const updated = await api.recipes.update(id, patch);
      setRecipe(updated);
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    }
  };

  const handleSaveStep = async (index: number) => {
    if (!recipe || !editStepValue.trim()) return;
    const techniques = [...recipe.techniques];
    techniques[index] = editStepValue.trim();
    await saveRecipeField({ techniques });
    setEditingStep(null);
  };

  const handleAddStep = async () => {
    if (!recipe || !newStep.trim()) return;
    const techniques = [...recipe.techniques, newStep.trim()];
    await saveRecipeField({ techniques });
    setNewStep("");
    setAddingStep(false);
  };

  const handleDeleteStep = async (index: number) => {
    if (!recipe) return;
    const techniques = recipe.techniques.filter((_, i) => i !== index);
    await saveRecipeField({ techniques });
  };

  const handleAddIngredient = async () => {
    if (!recipe || !newIng.ingredientId || newIng.qty <= 0) return;
    const ingList = [...recipe.ingredients, newIng];
    await saveRecipeField({ ingredients: ingList });
    setNewIng({ ingredientId: "", qty: 0, unit: "g", lossPct: 0 });
    setAddingIngredient(false);
  };

  const handleRemoveIngredient = async (index: number) => {
    if (!recipe) return;
    const ingList = recipe.ingredients.filter((_, i) => i !== index);
    await saveRecipeField({ ingredients: ingList });
  };

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

  const usedIngredientIds = new Set(recipe?.ingredients.map((ri) => ri.ingredientId) ?? []);
  const availableIngredients = ingredients.filter((i) => !usedIngredientIds.has(i.ingredientId));

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;
  if (!recipe) return <div className="p-8 text-muted-foreground">Recette introuvable</div>;

  const totalCost = calcRecipeCost(recipe, ingredients);

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="flex justify-between items-center mb-5 gap-2">
        <button onClick={() => navigate("/recipes")} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Retour</span>
        </button>
        <div className="flex gap-1.5 sm:gap-2 items-center">
          <button onClick={() => navigate(`/recipes/${id}/cook`)} className="flex items-center gap-1.5 px-3 py-2 sm:px-4 border rounded-lg text-xs sm:text-sm font-medium hover:bg-muted transition-colors">
            <ChefHat className="h-4 w-4" /> <span className="hidden sm:inline">Mode recette</span><span className="sm:hidden">Cuisiner</span>
          </button>
          <ActionMenu items={[
            { label: "Exporter PDF", icon: <FileDown className="h-4 w-4" />, onClick: () => exportPdf(recipe, ingredients) },
            { label: "Modifier", icon: <Pencil className="h-4 w-4" />, onClick: () => navigate(`/recipes/${id}/edit`) },
            { label: "Supprimer", icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleteConfirm(true), variant: "danger" },
          ]} />
        </div>
      </div>

      <div className="flex gap-6 mb-7 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="inline-block px-3 py-1 rounded-full bg-foreground text-background text-xs font-semibold uppercase tracking-wider mb-3">{recipe.type}</div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">{recipe.name}</h1>
          <p className="text-muted-foreground leading-relaxed mb-4 text-sm sm:text-base">{recipe.description}</p>
          <div className="flex gap-4 sm:gap-6 text-xs sm:text-sm text-muted-foreground flex-wrap">
            <span>Portions: <strong className="text-foreground">{recipe.portions}</strong></span>
            <span>Poids/pers: <strong className="text-foreground">{recipe.portionWeight}g</strong></span>
            <span className="hidden sm:inline">Créé le: <strong className="text-foreground">{new Date(recipe.createdAt).toLocaleDateString("fr-BE")}</strong></span>
          </div>
        </div>
        {recipe.photos?.length > 0 && (
          <div className="flex gap-3 shrink-0">
            {recipe.photos.map((photo, idx) => (
              <div key={idx} className="relative">
                <img src={photo.url} alt={photo.label} className="w-28 h-22 sm:w-36 sm:h-28 object-cover rounded-lg border" />
                {photo.label && <div className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">{photo.label}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-5">
        <section className="card-elevated p-4 sm:p-5">
          <div className="flex justify-between items-center mb-4 gap-2">
            <h2 className="font-serif text-lg font-bold">Étapes de préparation</h2>
            <button
              onClick={() => { setAddingStep(true); setTimeout(() => newStepRef.current?.focus(), 50); }}
              className="flex items-center gap-1 px-2.5 py-1 border rounded-lg text-xs font-medium hover:bg-muted transition-colors shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> Étape
            </button>
          </div>
          {recipe.techniques.length > 0 ? (
            <ol className="space-y-2">
              {recipe.techniques.map((t, i) => (
                <li key={i} className="group flex gap-2 sm:gap-3 items-start text-sm leading-relaxed">
                  <span className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>
                  {editingStep === i ? (
                    <div className="flex-1 flex flex-col gap-2">
                      <textarea
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:border-primary outline-none resize-none"
                        rows={2}
                        value={editStepValue}
                        onChange={(e) => setEditStepValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveStep(i); } if (e.key === "Escape") setEditingStep(null); }}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button onClick={() => handleSaveStep(i)} className="flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground rounded-md text-xs font-medium"><Check className="h-3 w-3" /> OK</button>
                        <button onClick={() => setEditingStep(null)} className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <span
                      className="text-muted-foreground pt-0.5 flex-1 cursor-pointer hover:text-foreground transition-colors rounded px-1 -mx-1 hover:bg-muted/50"
                      onClick={() => { setEditingStep(i); setEditStepValue(t); }}
                    >
                      {t}
                    </span>
                  )}
                  {editingStep !== i && (
                    <button
                      onClick={() => handleDeleteStep(i)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ol>
          ) : !addingStep ? (
            <button
              onClick={() => { setAddingStep(true); setTimeout(() => newStepRef.current?.focus(), 50); }}
              className="w-full py-5 border-2 border-dashed rounded-xl text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors text-sm font-medium"
            >
              + Ajouter la première étape
            </button>
          ) : null}
          {addingStep && (
            <div className="mt-3 flex flex-col gap-2">
              <textarea
                ref={newStepRef}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:border-primary outline-none resize-none"
                rows={2}
                placeholder="Décrivez l'étape…"
                value={newStep}
                onChange={(e) => setNewStep(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddStep(); } if (e.key === "Escape") { setAddingStep(false); setNewStep(""); } }}
              />
              <div className="flex gap-2">
                <button onClick={handleAddStep} disabled={!newStep.trim()} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium disabled:opacity-50"><Plus className="h-3 w-3" /> Ajouter</button>
                <button onClick={() => { setAddingStep(false); setNewStep(""); }} className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">Annuler</button>
              </div>
            </div>
          )}
        </section>

        <section className="card-elevated p-4 sm:p-5">
          <div className="flex justify-between items-center mb-4 gap-2">
            <h2 className="font-serif text-lg font-bold">Ingrédients</h2>
            {availableIngredients.length > 0 && (
              <button
                onClick={() => { setAddingIngredient(true); setNewIng({ ingredientId: availableIngredients[0].ingredientId, qty: 0, unit: "g", lossPct: 0 }); }}
                className="flex items-center gap-1 px-2.5 py-1 border rounded-lg text-xs font-medium hover:bg-muted transition-colors shrink-0"
              >
                <Plus className="h-3.5 w-3.5" /> Ingrédient
              </button>
            )}
          </div>
          <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
            <table className="w-full text-sm min-w-[400px]">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="px-2 sm:px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Produit</th>
                  <th className="px-2 sm:px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Qté</th>
                  <th className="px-2 sm:px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground hidden sm:table-cell">Perte</th>
                  <th className="px-2 sm:px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground hidden sm:table-cell">Prix/unité</th>
                  <th className="px-2 sm:px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Coût</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {recipe.ingredients.map((ri, idx) => {
                  const ing = ingredients.find((i) => i.ingredientId === ri.ingredientId);
                  if (!ing) return null;
                  const lineCost = calcIngredientLineCost(ri, ing);
                  return (
                    <tr key={idx} className="border-b border-border/30 group">
                      <td className="px-2 sm:px-3 py-2">
                        <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: supplierColor(ing.supplier) }} />
                        <button onClick={() => navigate("/ingredients")} className="hover:underline hover:text-primary transition-colors text-left">{ing.name}</button>
                      </td>
                      <td className="px-2 sm:px-3 py-2 text-right tabular-nums whitespace-nowrap">{ri.qty} {ri.unit}</td>
                      <td className="px-2 sm:px-3 py-2 text-right tabular-nums hidden sm:table-cell">{ri.lossPct || 0}%</td>
                      <td className="px-2 sm:px-3 py-2 text-right tabular-nums hidden sm:table-cell">{fmt(ing.price)}</td>
                      <td className="px-2 sm:px-3 py-2 text-right tabular-nums font-semibold">{fmt(lineCost)}</td>
                      <td className="px-1 py-2">
                        <button onClick={() => handleRemoveIngredient(idx)} className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-all">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {addingIngredient && (
                  <tr className="border-b border-primary/30 bg-muted/30">
                    <td className="px-2 sm:px-3 py-1.5">
                      <SearchSelect
                        options={availableIngredients.map((ig) => ({ value: ig.ingredientId, label: ig.name, detail: `${fmt(ig.price)} ${ig.unit}` }))}
                        value={newIng.ingredientId}
                        onChange={(v) => setNewIng((p) => ({ ...p, ingredientId: v }))}
                        placeholder="Rechercher un ingrédient…"
                      />
                    </td>
                    <td className="px-2 sm:px-3 py-1.5">
                      <div className="flex gap-1 justify-end">
                        <NumericInput
                          className="w-16 border rounded-md px-2 py-1 text-xs text-right bg-background focus:border-primary outline-none"
                          value={newIng.qty}
                          onChange={(v) => setNewIng((p) => ({ ...p, qty: v }))}
                          placeholder="Qté"
                          autoFocus
                        />
                        <select
                          className="border rounded-md px-1 py-1 text-xs bg-background focus:border-primary outline-none"
                          value={newIng.unit}
                          onChange={(e) => setNewIng((p) => ({ ...p, unit: e.target.value as typeof p.unit }))}
                        >
                          {UNITS_QTY.map((u) => <option key={u}>{u}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell" />
                    <td className="hidden sm:table-cell" />
                    <td className="px-2 sm:px-3 py-1.5" colSpan={2}>
                      <div className="flex gap-1 justify-end">
                        <button onClick={handleAddIngredient} disabled={!newIng.ingredientId || newIng.qty <= 0} className="p-1 bg-primary text-primary-foreground rounded-md disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setAddingIngredient(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <td colSpan={2} className="px-2 sm:px-3 py-2 font-bold sm:hidden">Total HTVA</td>
                  <td colSpan={4} className="px-2 sm:px-3 py-2 font-bold hidden sm:table-cell">Total matières HTVA</td>
                  <td className="px-2 sm:px-3 py-2 text-right font-bold tabular-nums" colSpan={2}>{fmt(totalCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
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
    <section className="card-elevated p-4 sm:p-5 bg-gradient-to-br from-card to-muted/30">
      <div className="flex justify-between items-center mb-4 gap-2">
        <h2 className="font-serif text-lg font-bold">Simulation de prix</h2>
        {dirty && (
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium shadow-sm disabled:opacity-50 shrink-0">
            <Save className="h-3.5 w-3.5" /> {saving ? "…" : "Enregistrer"}
          </button>
        )}
      </div>

      <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
      <table className="w-full text-sm border-collapse min-w-[360px]">
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
            sp={<EditableNum value={pricing.surPlace.coef} onChange={(v) => set("surPlace.coef", v)} />}
            ta={<EditableNum value={pricing.takeAway.coef} onChange={(v) => set("takeAway.coef", v)} />}
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
            sp={<EditableNum value={spChosen} onChange={(v) => set("chosenPrice.surPlace", v)} placeholder="—" />}
            ta={<EditableNum value={taChosen} onChange={(v) => set("chosenPrice.takeAway", v)} placeholder="—" />}
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
      </div>
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

function EditableNum({ value, onChange, suffix, placeholder }: {
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <NumericInput
      value={value}
      onChange={onChange}
      suffix={suffix}
      placeholder={placeholder}
      className="w-20 text-right px-2 py-0.5 border rounded-md bg-background text-sm font-semibold tabular-nums focus:border-primary outline-none"
    />
  );
}
