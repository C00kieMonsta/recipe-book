import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { Pencil, Trash2, Save, FileDown, ChefHat, Plus, X, Check, Copy } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Recipe, Ingredient, RecipePricing, RecipeIngredient } from "@packages/types";
import { UNITS_QTY, PRICE_TO_QTY_UNIT, DEFAULT_SUPPLIERS, DEFAULT_RECIPE_CATEGORIES, VAT_RATES } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { calcRecipeCost, calcIngredientLineCost, fmt, supplierColor } from "@/lib/recipe-helpers";
import ActionMenu from "@/components/ui/ActionMenu";
import NumericInput from "@/components/ui/NumericInput";
import SearchSelect from "@/components/ui/SearchSelect";
import IngredientFormModal from "@/components/ui/IngredientFormModal";
import PageHeader from "@/components/ui/PageHeader";
import Tag from "@/components/ui/Tag";
import FieldLabel from "@/components/ui/FieldLabel";
import SectionToggle from "@/components/ui/SectionToggle";
import RecipeReader from "@/components/ui/RecipeReader";
import { EditableNum, EditableText, EditableInlineNum, EditableType } from "@/components/ui/editable";

const DEFAULT_PRICING: RecipePricing = {
  surPlace: { coef: 4, tva: 12 },
  takeAway: { coef: 3, tva: 6 },
  chosenPrice: { surPlace: 0, takeAway: 0 },
};

type ReaderSize = "lead" | "xl";

const BTN = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-base font-medium transition-colors";
const BTN_PRIMARY = `${BTN} bg-primary text-primary-foreground hover:opacity-90`;
const BTN_OUTLINE = `${BTN} border bg-card hover:bg-hover`;

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
  doc.setFontSize(11);
  doc.text(`${recipe.type} | ${recipe.portions} portions | ${recipe.portionWeight}g/pers`, m, y + 4);
  y += 8;

  if (recipe.description) {
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(recipe.description, 180);
    doc.text(lines, m, y + 4);
    y += lines.length * 5 + 4;
  }

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
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
    styles: { fontSize: 11 },
    headStyles: { fillColor: [60, 60, 60] },
  });

  y = ((doc as unknown as Record<string, unknown>).lastAutoTable as { finalY: number })?.finalY ?? y + 40;
  y += 8;

  if (recipe.techniques.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Étapes de préparation", m, y + 4);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    recipe.techniques.forEach((t, i) => {
      if (y > 270) { doc.addPage(); y = m; }
      const text = `${i + 1}. ${t}`;
      const lines = doc.splitTextToSize(text, 180);
      doc.text(lines, m, y + 4);
      y += lines.length * 5 + 3;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const editMode = searchParams.get("mode") === "edit";
  const { toast } = useToast();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_RECIPE_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [editStepValue, setEditStepValue] = useState("");
  const [newStep, setNewStep] = useState("");
  const [addingStep, setAddingStep] = useState(false);
  const [addingIngredient, setAddingIngredient] = useState(false);
  const [newIng, setNewIng] = useState<RecipeIngredient>({ ingredientId: "", qty: 0, unit: "g", lossPct: 0 });
  const [creatingIngredient, setCreatingIngredient] = useState<string | null>(null);
  const [viewingIngredient, setViewingIngredient] = useState<Ingredient | null>(null);
  const [supplierNames] = useState(() => DEFAULT_SUPPLIERS.map((s) => s.name));
  const [portions, setPortions] = useState(0);
  const [readerSize, setReaderSize] = useLocalStorage<ReaderSize>("recipe-book:reader-size", "lead");
  const newStepRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.recipes.get(id), api.ingredients.list(), api.settings.get().catch(() => null)])
      .then(([r, i, s]) => { setRecipe(r); setIngredients(i); setPortions(r.portions); if (s?.recipeCategories?.length) setCategories(s.recipeCategories); })
      .catch(() => toast({ title: "Recette introuvable", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id]);

  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.ingredientId, i])), [ingredients]);

  const setMode = (edit: boolean) => {
    const next = new URLSearchParams(searchParams);
    if (edit) next.set("mode", "edit"); else next.delete("mode");
    setSearchParams(next, { replace: true });
  };

  const toggleReaderSize = () => setReaderSize((prev) => (prev === "xl" ? "lead" : "xl"));

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
  };

  const handleDuplicateRecipe = async () => {
    if (!recipe) return;
    try {
      const created = await api.recipes.create({
        name: `${recipe.name} (copie)`,
        type: recipe.type,
        portions: recipe.portions,
        portionWeight: recipe.portionWeight,
        description: recipe.description || "",
        techniques: [...recipe.techniques],
        ingredients: [...recipe.ingredients],
        photos: [...(recipe.photos?.map(({ key, label }) => ({ key, label })) || [])],
        pricing: structuredClone(recipe.pricing || DEFAULT_PRICING),
      });
      toast({ title: "Recette dupliquée" });
      navigate(`/recipes/${created.recipeId}/edit`);
    } catch {
      toast({ title: "Erreur lors de la duplication", variant: "destructive" });
    }
  };

  const handleRemoveIngredient = async (index: number) => {
    if (!recipe) return;
    const ingList = recipe.ingredients.filter((_, i) => i !== index);
    await saveRecipeField({ ingredients: ingList });
  };

  const handleCreateIngredient = async (data: Partial<Ingredient>) => {
    try {
      const created = await api.ingredients.create(data);
      setIngredients((prev) => [...prev, created]);
      setNewIng((p) => ({
        ...p,
        ingredientId: created.ingredientId,
        unit: PRICE_TO_QTY_UNIT[created.unit] || "g",
      }));
      setCreatingIngredient(null);
      toast({ title: "Ingrédient créé" });
    } catch {
      toast({ title: "Erreur lors de la création", variant: "destructive" });
    }
  };

  const handleUpdateIngredient = async (data: Partial<Ingredient>) => {
    if (!viewingIngredient) return;
    try {
      const updated = await api.ingredients.update(viewingIngredient.ingredientId, data);
      setIngredients((prev) => prev.map((i) => i.ingredientId === updated.ingredientId ? updated : i));
      setViewingIngredient(null);
      if (recipe) setRecipe({ ...recipe });
      toast({ title: "Ingrédient modifié" });
    } catch {
      toast({ title: "Erreur lors de la modification", variant: "destructive" });
    }
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

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;
  if (!recipe) return <div className="p-8 text-muted-foreground">Recette introuvable</div>;

  const totalCost = calcRecipeCost(recipe, ingredients);
  const readPortions = portions || recipe.portions;
  const cookHref = `/recipes/${id}/cook${readPortions !== recipe.portions ? `?portions=${readPortions}` : ""}`;
  const firstPhoto = recipe.photos?.[0];

  const menuItems = [
    { label: "Dupliquer", icon: <Copy className="h-4 w-4" />, onClick: handleDuplicateRecipe },
    { label: "Exporter PDF", icon: <FileDown className="h-4 w-4" />, onClick: () => exportPdf(recipe, ingredients) },
    { label: "Supprimer", icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleteConfirm(true), variant: "danger" as const },
  ];

  const modals = (
    <>
      {creatingIngredient !== null && (
        <IngredientFormModal
          ingredient={{ name: creatingIngredient, price: 0, unit: "€/kg", supplier: supplierNames[0] || "" }}
          supplierNames={supplierNames}
          onSave={handleCreateIngredient}
          onCancel={() => setCreatingIngredient(null)}
        />
      )}

      {viewingIngredient && (
        <IngredientFormModal
          ingredient={viewingIngredient}
          supplierNames={supplierNames}
          onSave={handleUpdateIngredient}
          onCancel={() => setViewingIngredient(null)}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setDeleteConfirm(false)}>
          <div className="bg-card rounded-2xl p-7 max-w-sm w-[92%] shadow-xl animate-fade-up text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-h3 mb-2">Confirmer la suppression</h3>
            <p className="text-muted-foreground text-base mb-6">Cette action est irréversible.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteConfirm(false)} className={BTN_OUTLINE}>Annuler</button>
              <button onClick={handleDelete} className={`${BTN} bg-destructive text-destructive-foreground hover:opacity-90`}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (!editMode) {
    return (
      <div className="mx-auto max-w-doc pb-24 md:pb-0">
        <PageHeader
          breadcrumb={[{ label: "Recettes", to: "/recipes" }, { label: recipe.name }]}
          title={recipe.name}
          actions={
            <>
              <Link to={cookHref} className={`${BTN_PRIMARY} hidden md:inline-flex`}>
                <ChefHat className="h-5 w-5" /> Cuisiner
              </Link>
              <button type="button" onClick={() => setMode(true)} className={`${BTN_OUTLINE} hidden md:inline-flex`}>
                <Pencil className="h-4 w-4" /> Modifier
              </button>
              <ActionMenu items={menuItems} />
            </>
          }
        />

        {firstPhoto?.url && (
          <img src={firstPhoto.url} alt={firstPhoto.label || recipe.name} className="aspect-[3/2] w-full rounded-xl object-cover" />
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Tag variant="primary">{recipe.type}</Tag>
          <Tag>{recipe.portions} portions</Tag>
          <Tag>{recipe.portionWeight} g/pers</Tag>
        </div>

        {recipe.description && (
          <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed">{recipe.description}</p>
        )}

        <div className="mt-block flex justify-end">
          <button
            type="button"
            onClick={toggleReaderSize}
            aria-pressed={readerSize === "xl"}
            aria-label="Agrandir le texte"
            title="Taille du texte"
            className={`${BTN_OUTLINE} min-w-11 px-3 font-serif ${readerSize === "xl" ? "bg-primary-soft" : ""}`}
          >
            Aa
          </button>
        </div>

        <RecipeReader
          recipe={recipe}
          ingredientById={ingredientById}
          portions={readPortions}
          onPortionsChange={setPortions}
          size={readerSize}
          showCost
          className="mt-3"
        />

        <SectionToggle title="Simulation de prix">
          <PricingSimulation recipe={recipe} totalCost={totalCost} />
        </SectionToggle>

        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t bg-card p-3 md:hidden">
          <Link to={cookHref} className={`${BTN_PRIMARY} flex-1`}>
            <ChefHat className="h-5 w-5" /> Cuisiner
          </Link>
          <button type="button" onClick={() => setMode(true)} className={`${BTN_OUTLINE} flex-1`}>
            <Pencil className="h-4 w-4" /> Modifier
          </button>
        </div>

        {modals}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-wide">
      <div className="mb-5 flex items-center justify-between gap-2">
        <nav aria-label="Fil d'Ariane" className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
          <Link to="/recipes" className="hover:text-foreground hover:underline">Recettes</Link>
          <span aria-hidden="true">/</span>
          <span className="truncate">{recipe.name}</span>
          <span aria-hidden="true">/</span>
          <span>Modification</span>
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setMode(false)} className={BTN_PRIMARY}>
            <Check className="h-5 w-5" /> Terminé
          </button>
          <ActionMenu items={menuItems} />
        </div>
      </div>

      <div className="flex gap-6 mb-7 flex-wrap">
        <div className="flex-1 min-w-0">
          <EditableType value={recipe.type} options={categories} onSave={(v) => saveRecipeField({ type: v })} />
          <EditableText
            value={recipe.name}
            onSave={(v) => saveRecipeField({ name: v })}
            className="font-serif text-h1 mb-2"
            inputClassName="font-serif text-h1 mb-2 w-full border-b-2 border-primary bg-transparent outline-none"
          />
          <EditableText
            value={recipe.description || ""}
            onSave={(v) => saveRecipeField({ description: v })}
            className="text-muted-foreground leading-relaxed mb-4 text-base"
            inputClassName="text-muted-foreground leading-relaxed mb-4 text-base w-full border-b border-primary/50 bg-transparent outline-none"
            placeholder="Ajouter une description…"
            multiline
          />
          <div className="flex gap-4 sm:gap-6 text-base text-muted-foreground flex-wrap">
            <span>Portions : <EditableInlineNum value={recipe.portions} onSave={(v) => saveRecipeField({ portions: v })} min={1} /></span>
            <span>Poids/pers : <EditableInlineNum value={recipe.portionWeight} onSave={(v) => saveRecipeField({ portionWeight: v })} suffix="g" /></span>
            <span className="hidden sm:inline">Créé le : <strong className="text-foreground">{new Date(recipe.createdAt).toLocaleDateString("fr-BE")}</strong></span>
          </div>
        </div>
        {recipe.photos?.length > 0 && (
          <div className="flex gap-3 shrink-0">
            {recipe.photos.map((photo, idx) => (
              <div key={idx} className="relative">
                <img src={photo.url} alt={photo.label} className="w-28 h-20 sm:w-36 sm:h-28 object-cover rounded-lg border" />
                {photo.label && <div className="text-center text-caption text-muted-foreground mt-1">{photo.label}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-5">
        <section className="card-elevated p-4 sm:p-5">
          <div className="flex justify-between items-center mb-4 gap-2">
            <h2 className="text-h3">Étapes de préparation</h2>
            <button
              onClick={() => { setAddingStep(true); setTimeout(() => newStepRef.current?.focus(), 50); }}
              className={`${BTN_OUTLINE} shrink-0 px-3`}
            >
              <Plus className="h-4 w-4" /> Étape
            </button>
          </div>
          {recipe.techniques.length > 0 ? (
            <ol className="space-y-2">
              {recipe.techniques.map((t, i) => (
                <li key={i} className="group flex gap-2 sm:gap-3 items-start text-base leading-relaxed">
                  <span className="w-7 h-7 rounded-full bg-primary-soft text-foreground flex items-center justify-center text-sm font-semibold shrink-0 mt-0.5">{i + 1}</span>
                  {editingStep === i ? (
                    <div className="flex-1 flex flex-col gap-2">
                      <textarea
                        className="input-field resize-y"
                        rows={Math.max(2, editStepValue.split("\n").length)}
                        value={editStepValue}
                        onChange={(e) => setEditStepValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveStep(i); } if (e.key === "Escape") setEditingStep(null); }}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button onClick={() => handleSaveStep(i)} className={`${BTN_PRIMARY} px-3`}><Check className="h-4 w-4" /> OK</button>
                        <button onClick={() => setEditingStep(null)} className={`${BTN} px-3 text-muted-foreground hover:text-foreground`}>Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <span
                      className="text-foreground pt-0.5 flex-1 cursor-pointer transition-colors rounded px-1 -mx-1 hover:bg-hover whitespace-pre-wrap"
                      onClick={() => { setEditingStep(i); setEditStepValue(t); }}
                    >
                      {t}
                    </span>
                  )}
                  {editingStep !== i && (
                    <button
                      onClick={() => handleDeleteStep(i)}
                      aria-label="Supprimer l'étape"
                      className="reveal flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-destructive transition-all shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ol>
          ) : !addingStep ? (
            <button
              onClick={() => { setAddingStep(true); setTimeout(() => newStepRef.current?.focus(), 50); }}
              className="w-full py-5 border-2 border-dashed rounded-xl text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors text-base font-medium"
            >
              + Ajouter la première étape
            </button>
          ) : null}
          {addingStep && (
            <div className="mt-3 flex flex-col gap-2">
              <textarea
                ref={newStepRef}
                className="input-field resize-y"
                rows={Math.max(2, newStep.split("\n").length)}
                placeholder="Décrivez l'étape…"
                value={newStep}
                onChange={(e) => setNewStep(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddStep(); } if (e.key === "Escape") { setAddingStep(false); setNewStep(""); } }}
              />
              <div className="flex gap-2">
                <button onClick={handleAddStep} disabled={!newStep.trim()} className={`${BTN_PRIMARY} px-3 disabled:opacity-50`}><Plus className="h-4 w-4" /> Ajouter</button>
                <button onClick={() => { setAddingStep(false); setNewStep(""); }} className={`${BTN} px-3 text-muted-foreground hover:text-foreground`}>Annuler</button>
              </div>
            </div>
          )}
        </section>

        <section className="card-elevated p-4 sm:p-5">
          <div className="flex justify-between items-center mb-4 gap-2">
            <h2 className="text-h3">Ingrédients</h2>
            <button
              onClick={() => { setAddingIngredient(true); setNewIng({ ingredientId: "", qty: 0, unit: "g", lossPct: 0 }); }}
              className={`${BTN_OUTLINE} shrink-0 px-3`}
            >
              <Plus className="h-4 w-4" /> Ingrédient
            </button>
          </div>
          <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5">
            <table className="table min-w-[400px]">
              <thead>
                <tr className="border-b-2 border-border text-muted-foreground">
                  <th>Produit</th>
                  <th className="text-right">Qté</th>
                  <th className="text-right hidden sm:table-cell">Perte</th>
                  <th className="text-right hidden sm:table-cell">Prix/unité</th>
                  <th className="text-right">Coût</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {recipe.ingredients.map((ri, idx) => {
                  const ing = ingredients.find((i) => i.ingredientId === ri.ingredientId);
                  if (!ing) return null;
                  const lineCost = calcIngredientLineCost(ri, ing);
                  const updateIngField = (field: keyof RecipeIngredient, value: unknown) => {
                    const ingList = [...recipe.ingredients];
                    ingList[idx] = { ...ingList[idx], [field]: value };
                    saveRecipeField({ ingredients: ingList });
                  };
                  return (
                    <tr key={idx} className="border-b border-border/30 group">
                      <td>
                        <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: supplierColor(ing.supplier) }} />
                        <button onClick={() => setViewingIngredient(ing)} className="hover:underline hover:text-primary transition-colors text-left">{ing.name}</button>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <EditableInlineNum value={ri.qty} onSave={(v) => updateIngField("qty", v)} /> {ri.unit}
                      </td>
                      <td className="text-right hidden sm:table-cell">
                        <EditableInlineNum value={ri.lossPct || 0} onSave={(v) => updateIngField("lossPct", v)} suffix="%" />
                      </td>
                      <td className="text-right hidden sm:table-cell">{fmt(ing.price)}</td>
                      <td className="text-right font-semibold">{fmt(lineCost)}</td>
                      <td className="!px-0">
                        <button onClick={() => handleRemoveIngredient(idx)} aria-label="Retirer l'ingrédient" className="reveal flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-destructive transition-all">
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {addingIngredient && (
                  <tr className="border-b border-primary/30 bg-muted/30">
                    <td>
                      <SearchSelect
                        options={ingredients.map((ig) => ({ value: ig.ingredientId, label: ig.name, detail: `${fmt(ig.price)} ${ig.unit}` }))}
                        value={newIng.ingredientId}
                        onChange={(v) => {
                          const ing = ingredients.find((i) => i.ingredientId === v);
                          const unit = ing ? PRICE_TO_QTY_UNIT[ing.unit] : "g";
                          setNewIng((p) => ({ ...p, ingredientId: v, unit }));
                        }}
                        placeholder="Rechercher un ingrédient…"
                        onCreateNew={(name) => setCreatingIngredient(name)}
                      />
                    </td>
                    <td>
                      <div className="flex gap-1 justify-end">
                        <NumericInput
                          className="input-field w-20 text-right"
                          value={newIng.qty}
                          onChange={(v) => setNewIng((p) => ({ ...p, qty: v }))}
                          placeholder="Qté"
                          autoFocus
                        />
                        <select
                          className="input-field w-auto"
                          value={newIng.unit}
                          onChange={(e) => setNewIng((p) => ({ ...p, unit: e.target.value as typeof p.unit }))}
                        >
                          {UNITS_QTY.map((u) => <option key={u}>{u}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell" />
                    <td className="hidden sm:table-cell" />
                    <td colSpan={2}>
                      <div className="flex gap-1 justify-end">
                        <button onClick={handleAddIngredient} disabled={!newIng.ingredientId || newIng.qty <= 0} aria-label="Ajouter" className="flex min-h-11 min-w-11 items-center justify-center bg-primary text-primary-foreground rounded-lg disabled:opacity-50"><Check className="h-4 w-4" /></button>
                        <button onClick={() => setAddingIngredient(false)} aria-label="Annuler" className="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="sm:hidden">Total HTVA</td>
                  <td colSpan={4} className="hidden sm:table-cell">Total matières HTVA</td>
                  <td className="text-right" colSpan={2}>{fmt(totalCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="card-elevated p-4 sm:p-5">
          <h2 className="text-h3 mb-4">Simulation de prix</h2>
          <PricingSimulation recipe={recipe} totalCost={totalCost} />
        </section>
      </div>

      {modals}
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
    <div>
      {dirty && (
        <div className="mb-3 flex justify-end">
          <button onClick={handleSave} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? "…" : "Enregistrer"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
      <table className="w-full text-base border-collapse min-w-[360px]">
        <thead>
          <tr>
            <th className="pb-2 text-left text-sm font-semibold text-muted-foreground" />
            <th className="pb-2 px-4 text-right text-sm font-semibold text-muted-foreground">Sur place</th>
            <th className="pb-2 px-4 text-right text-sm font-semibold text-muted-foreground">Take away</th>
          </tr>
        </thead>
        <tbody>
          <CalcRow label="Coût matières recette HTVA" sp={fmt(totalCost)} ta={fmt(totalCost)} />
          <CalcRow label={`Coût par portion HTVA (÷${portions})`} sp={fmt(cpP)} ta={fmt(cpP)} bold />

          <EditRow
            label="Coefficient"
            sp={<EditableNum value={pricing.surPlace.coef} onChange={(v) => set("surPlace.coef", v)} />}
            ta={<EditableNum value={pricing.takeAway.coef} onChange={(v) => set("takeAway.coef", v)} />}
          />
          <CalcRow label="Prix vente portion HTVA" sp={fmt(spHTVA)} ta={fmt(taHTVA)} />
          <EditRow
            label="TVA"
            sp={<VatSelect value={pricing.surPlace.tva} onChange={(v) => set("surPlace.tva", v)} />}
            ta={<VatSelect value={pricing.takeAway.tva} onChange={(v) => set("takeAway.tva", v)} />}
          />
          <CalcRow label="Prix TVAC" sp={fmt(spTVAC)} ta={fmt(taTVAC)} />
          <CalcRow label="Marge par portion" sp={fmt(spHTVA - cpP)} ta={fmt(taHTVA - cpP)} positive />

          <tr><td colSpan={3} className="pt-4 pb-1"><div className="border-t-2 border-border" /></td></tr>

          <EditRow
            label="Prix de vente choisi TVAC"
            sp={<EditableNum value={spChosen} onChange={(v) => set("chosenPrice.surPlace", v)} placeholder="–" />}
            ta={<EditableNum value={taChosen} onChange={(v) => set("chosenPrice.takeAway", v)} placeholder="–" />}
            bold
          />
          <CalcRow
            label="Coefficient calculé"
            sp={spChosen > 0 ? spChosenCoef.toFixed(2) : "–"}
            ta={taChosen > 0 ? taChosenCoef.toFixed(2) : "–"}
          />
          <CalcRow
            label="Marge par portion"
            sp={spChosen > 0 ? fmt(spChosenMarge) : "–"}
            ta={taChosen > 0 ? fmt(taChosenMarge) : "–"}
            positive={spChosenMarge > 0 || taChosenMarge > 0}
          />
        </tbody>
      </table>
      </div>
    </div>
  );
}

function VatSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select
      className="input-field input-compact w-auto min-h-11 text-right font-semibold tabular-nums"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="TVA"
    >
      {!VAT_RATES.includes(value as (typeof VAT_RATES)[number]) && <option value={value}>{value} %</option>}
      {VAT_RATES.map((r) => <option key={r} value={r}>{r} %</option>)}
    </select>
  );
}

function CalcRow({ label, sp, ta, bold, positive }: { label: string; sp: string; ta: string; bold?: boolean; positive?: boolean }) {
  return (
    <tr className="border-b border-border/20">
      <td className={`py-2 ${bold ? "font-bold text-foreground" : "font-medium text-muted-foreground"}`}>{label}</td>
      <td className={`py-2 px-4 text-right tabular-nums ${bold ? "font-bold" : "font-medium"} ${positive ? "text-success" : ""}`}>{sp}</td>
      <td className={`py-2 px-4 text-right tabular-nums ${bold ? "font-bold" : "font-medium"} ${positive ? "text-success" : ""}`}>{ta}</td>
    </tr>
  );
}

function EditRow({ label, sp, ta, bold }: { label: string; sp: React.ReactNode; ta: React.ReactNode; bold?: boolean }) {
  return (
    <tr className="border-b border-border/20 bg-muted/20">
      <td className={`py-1.5 ${bold ? "font-bold text-foreground" : "font-semibold text-foreground"}`}><FieldLabel className="mb-0">{label}</FieldLabel></td>
      <td className="py-1.5 px-3 text-right">{sp}</td>
      <td className="py-1.5 px-3 text-right">{ta}</td>
    </tr>
  );
}
