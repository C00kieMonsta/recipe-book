import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { Pencil, Trash2, Save, FileDown, ChefHat, Plus, X, Check, Copy, Users, Scale, Calculator } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Recipe, Ingredient, RecipePricing, RecipeIngredient } from "@packages/types";
import { UNITS_QTY, PRICE_TO_QTY_UNIT, DEFAULT_SUPPLIERS, DEFAULT_RECIPE_CATEGORIES, VAT_RATES, fmtEur } from "@packages/types";
import { api, getToken, API_BASE } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { calcRecipeCost, calcIngredientLineCost, fmt, supplierColor } from "@/lib/recipe-helpers";
import { useBackLink, useTopTitle } from "@/components/admin/AdminLayout";
import {
  ActionMenu,
  NumericInput,
  SearchSelect,
  IngredientFormModal,
  PageHeader,
  Section,
  SectionToggle,
  RecipeReader,
  EditableNum,
  EditableText,
  EditableInlineNum,
  Button,
  IconButton,
  Dialog,
  PropertyList,
  Property,
  SelectPill,
} from "@/components/ui";

const DEFAULT_PRICING: RecipePricing = {
  surPlace: { coef: 4, tva: 12 },
  takeAway: { coef: 3, tva: 6 },
  chosenPrice: { surPlace: 0, takeAway: 0 },
};

type ReaderSize = "lead" | "xl";

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
  const token = getToken();
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
  const [supplierNames, setSupplierNames] = useState(() => DEFAULT_SUPPLIERS.map((s) => s.name));
  const [portions, setPortions] = useState(0);
  const [readerSize, setReaderSize] = useLocalStorage<ReaderSize>("recipe-book:reader-size", "lead");
  const newStepRef = useRef<HTMLTextAreaElement>(null);

  useBackLink({ to: "/recipes", label: "Recettes" });
  useTopTitle(recipe?.name ?? "");

  useEffect(() => {
    if (!id) return;
    Promise.all([api.recipes.get(id), api.ingredients.list(), api.settings.get().catch(() => null)])
      .then(([r, i, s]) => {
        setRecipe(r);
        setIngredients(i);
        setPortions(r.portions);
        if (s?.recipeCategories?.length) setCategories(s.recipeCategories);
        if (s?.suppliers?.length) setSupplierNames(s.suppliers.map((x) => x.name));
      })
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
      if (patch.portions !== undefined) setPortions(updated.portions);
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
      throw new Error("save failed");
    }
  };
  const save = (patch: Partial<Recipe>) => saveRecipeField(patch).catch(() => undefined);

  const handleSaveStep = async (index: number) => {
    if (!recipe || !editStepValue.trim()) return;
    const techniques = [...recipe.techniques];
    techniques[index] = editStepValue.trim();
    await save({ techniques });
    setEditingStep(null);
  };

  const handleAddStep = async () => {
    if (!recipe || !newStep.trim()) return;
    const techniques = [...recipe.techniques, newStep.trim()];
    await save({ techniques });
    setNewStep("");
    setAddingStep(false);
  };

  const handleDeleteStep = async (index: number) => {
    if (!recipe) return;
    const techniques = recipe.techniques.filter((_, i) => i !== index);
    await save({ techniques });
  };

  const handleAddIngredient = async () => {
    if (!recipe || !newIng.ingredientId || newIng.qty <= 0) return;
    const ingList = [...recipe.ingredients, newIng];
    await save({ ingredients: ingList });
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
      navigate(`/recipes/${created.recipeId}?mode=edit`);
    } catch {
      toast({ title: "Erreur lors de la duplication", variant: "destructive" });
    }
  };

  const handleRemoveIngredient = async (index: number) => {
    if (!recipe) return;
    const ingList = recipe.ingredients.filter((_, i) => i !== index);
    await save({ ingredients: ingList });
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
  const costPerPortion = totalCost / (recipe.portions || 1);
  const readPortions = portions || recipe.portions;
  const cookHref = `/recipes/${id}/cook${readPortions !== recipe.portions ? `?portions=${readPortions}` : ""}`;
  const firstPhoto = recipe.photos?.[0];

  const menuItems = [
    { kind: "check" as const, label: "Texte plus grand", checked: readerSize === "xl", onClick: toggleReaderSize },
    { kind: "separator" as const },
    { label: "Dupliquer", icon: <Copy />, onClick: handleDuplicateRecipe },
    { label: "Exporter PDF", icon: <FileDown />, onClick: () => exportPdf(recipe, ingredients) },
    { kind: "separator" as const },
    { label: "Supprimer", icon: <Trash2 />, onClick: () => setDeleteConfirm(true), variant: "danger" as const },
  ];

  const properties = (
    <PropertyList>
      <Property icon="🏷" label="Format" kind="select" value={recipe.type} options={recipe.type && !categories.includes(recipe.type) ? [recipe.type, ...categories] : categories} colour="gray" onSave={(v) => saveRecipeField({ type: v })} />
      <Property icon={Users} label="Portions" kind="number" value={recipe.portions} min={1} decimals={0} onSave={(v) => saveRecipeField({ portions: Math.max(1, Math.round(v)) })} />
      <Property icon={Scale} label="Poids/pers" kind="number" value={recipe.portionWeight} min={0} decimals={0} suffix="g" onSave={(v) => saveRecipeField({ portionWeight: Math.max(0, Math.round(v)) })} />
      <Property icon={Calculator} label="Coût" kind="computed" value={`${fmtEur(costPerPortion)} / portion`} sub={`${fmtEur(totalCost)} pour ${recipe.portions}`} />
    </PropertyList>
  );

  const modals = (
    <>
      {creatingIngredient !== null && (
        <IngredientFormModal
          ingredient={{ name: creatingIngredient, price: 0, unit: "€/kg", supplier: supplierNames[0] || "" }}
          supplierNames={supplierNames}
          existing={ingredients}
          onUseExisting={(ing) => {
            setNewIng((p) => ({ ...p, ingredientId: ing.ingredientId, unit: PRICE_TO_QTY_UNIT[ing.unit] || "g" }));
            setCreatingIngredient(null);
          }}
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

      <Dialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        title="Confirmer la suppression"
        size="sm"
        footer={
          <>
            <Button variant="default" size="md" onClick={() => setDeleteConfirm(false)}>Annuler</Button>
            <Button variant="danger" size="md" onClick={handleDelete}>Supprimer</Button>
          </>
        }
      >
        <p className="text-muted-foreground">Cette action est irréversible.</p>
      </Dialog>
    </>
  );

  if (!editMode) {
    return (
      <div className="mx-auto max-w-doc pb-24 md:pb-0">
        {firstPhoto?.url && (
          <img src={firstPhoto.url} alt={firstPhoto.label || recipe.name} className="mb-4 aspect-[3/2] w-full rounded-lg object-cover" />
        )}
        <PageHeader
          breadcrumb={[{ label: "Recettes", to: "/recipes" }, { label: recipe.name }]}
          iconKey="recette"
          title={recipe.name}
          onTitleChange={(v) => save({ name: v })}
          actions={
            <>
              <Button variant="default" size="md" icon={<Pencil />} onClick={() => setMode(true)} className="hidden md:inline-flex">Modifier</Button>
              <ActionMenu items={menuItems} title={recipe.name} />
              <Button as={Link} to={cookHref} variant="primary" size="lg" icon={<ChefHat />} className="hidden md:inline-flex">Cuisiner</Button>
            </>
          }
          properties={properties}
        />

        <EditableText
          value={recipe.description || ""}
          onSave={(v) => save({ description: v })}
          className="text-base leading-relaxed"
          placeholder="Ajouter une description…"
          multiline
        />

        <RecipeReader
          recipe={recipe}
          ingredientById={ingredientById}
          portions={readPortions}
          onPortionsChange={setPortions}
          size={readerSize}
          showCost
          className="mt-block"
        />

        <SectionToggle title="Simulation de prix">
          <PricingSimulation recipe={recipe} totalCost={totalCost} />
        </SectionToggle>

        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 bg-background p-3 shadow-[0_-1px_0_0_var(--border)] md:hidden">
          <Button as={Link} to={cookHref} variant="primary" size="lg" icon={<ChefHat />} className="flex-1">Cuisiner</Button>
          <Button variant="default" size="lg" icon={<Pencil />} onClick={() => setMode(true)} className="flex-1">Modifier</Button>
        </div>

        {modals}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-doc">
      <PageHeader
        breadcrumb={[{ label: "Recettes", to: "/recipes" }, { label: recipe.name, to: `/recipes/${id}` }, { label: "Modification" }]}
        iconKey="recette"
        title={recipe.name}
        onTitleChange={(v) => save({ name: v })}
        actions={
          <>
            <ActionMenu items={menuItems} title={recipe.name} />
            <Button variant="primary" size="md" icon={<Check />} onClick={() => setMode(false)}>Terminé</Button>
          </>
        }
        properties={properties}
      />

      <EditableText
        value={recipe.description || ""}
        onSave={(v) => save({ description: v })}
        className="text-base leading-relaxed"
        placeholder="Ajouter une description…"
        multiline
      />
      {recipe.photos?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          {recipe.photos.map((photo, idx) => (
            <div key={idx}>
              <img src={photo.url} alt={photo.label} className="h-24 w-36 rounded-lg object-cover shadow-card" />
              {photo.label && <div className="mt-1 text-center text-caption text-muted-foreground">{photo.label}</div>}
            </div>
          ))}
        </div>
      )}

      <Section
        title="Préparation"
        action={<Button variant="ghost" size="sm" icon={<Plus />} onClick={() => { setAddingStep(true); setTimeout(() => newStepRef.current?.focus(), 50); }}>Étape</Button>}
      >
        {recipe.techniques.length > 0 ? (
          <ol className="space-y-2">
            {recipe.techniques.map((t, i) => (
              <li key={i} className="group flex items-start gap-3 text-base">
                <span className="w-6 shrink-0 text-right leading-6 text-muted-foreground tabular-nums">{i + 1}</span>
                {editingStep === i ? (
                  <div className="flex flex-1 flex-col gap-2">
                    <textarea
                      className="input-field resize-y"
                      rows={Math.max(2, editStepValue.split("\n").length)}
                      value={editStepValue}
                      onChange={(e) => setEditStepValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveStep(i); } if (e.key === "Escape") setEditingStep(null); }}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm" icon={<Check />} onClick={() => handleSaveStep(i)}>OK</Button>
                      <Button variant="subtle" size="sm" onClick={() => setEditingStep(null)}>Annuler</Button>
                    </div>
                  </div>
                ) : (
                  <span
                    role="button"
                    tabIndex={0}
                    className="prop-value min-w-0 flex-1 whitespace-pre-wrap leading-6"
                    onClick={() => { setEditingStep(i); setEditStepValue(t); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditingStep(i); setEditStepValue(t); } }}
                  >
                    {t}
                  </span>
                )}
                {editingStep !== i && (
                  <IconButton size="sm" aria-label="Supprimer l'étape" onClick={() => handleDeleteStep(i)} icon={<X />} className="reveal" />
                )}
              </li>
            ))}
          </ol>
        ) : !addingStep ? (
          <Button variant="subtle" size="sm" icon={<Plus />} onClick={() => { setAddingStep(true); setTimeout(() => newStepRef.current?.focus(), 50); }} className="-mx-1">
            Ajouter la première étape
          </Button>
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
              <Button variant="primary" size="sm" icon={<Plus />} onClick={handleAddStep} disabled={!newStep.trim()}>Ajouter</Button>
              <Button variant="subtle" size="sm" onClick={() => { setAddingStep(false); setNewStep(""); }}>Annuler</Button>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Ingrédients"
        action={<Button variant="ghost" size="sm" icon={<Plus />} onClick={() => { setAddingIngredient(true); setNewIng({ ingredientId: "", qty: 0, unit: "g", lossPct: 0 }); }}>Ingrédient</Button>}
      >
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="table min-w-[400px]">
            <thead>
              <tr>
                <th>Produit</th>
                <th className="text-right">Qté</th>
                <th className="hidden text-right sm:table-cell">Perte</th>
                <th className="hidden text-right sm:table-cell">Prix/unité</th>
                <th className="text-right">Coût</th>
                <th className="w-9" />
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
                  save({ ingredients: ingList });
                };
                return (
                  <tr key={idx} className="group">
                    <td>
                      <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: supplierColor(ing.supplier) }} />
                      <button type="button" onClick={() => setViewingIngredient(ing)} className="text-left hover:underline">{ing.name}</button>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <EditableInlineNum value={ri.qty} onSave={(v) => updateIngField("qty", v)} /> <span className="text-muted-foreground">{ri.unit}</span>
                    </td>
                    <td className="hidden text-right sm:table-cell">
                      <EditableInlineNum value={ri.lossPct || 0} onSave={(v) => updateIngField("lossPct", v)} suffix=" %" />
                    </td>
                    <td className="hidden text-right sm:table-cell">{fmt(ing.price)}</td>
                    <td className="text-right font-medium">{fmt(lineCost)}</td>
                    <td className="!px-0 text-center">
                      <IconButton size="sm" aria-label="Retirer l'ingrédient" onClick={() => handleRemoveIngredient(idx)} icon={<X />} className="reveal" />
                    </td>
                  </tr>
                );
              })}
              {addingIngredient && (
                <tr className="bg-surface">
                  <td>
                    <SearchSelect
                      options={ingredients.map((ig) => ({ value: ig.ingredientId, label: ig.name, detail: `${fmt(ig.price)} ${ig.unit.replace("€/", "/")}` }))}
                      value={newIng.ingredientId}
                      onChange={(v) => {
                        const ing = ingredients.find((i) => i.ingredientId === v);
                        const unit = (ing && PRICE_TO_QTY_UNIT[ing.unit]) || "g";
                        setNewIng((p) => ({ ...p, ingredientId: v, unit }));
                      }}
                      placeholder="Rechercher un ingrédient…"
                      onCreateNew={(name) => setCreatingIngredient(name)}
                      autoFocus
                    />
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <NumericInput
                        className="input-field w-20 text-right"
                        value={newIng.qty}
                        onChange={(v) => setNewIng((p) => ({ ...p, qty: v }))}
                        placeholder="Qté"
                        aria-label="Quantité"
                      />
                      <SelectPill
                        value={newIng.unit}
                        options={UNITS_QTY.map((u) => ({ value: u, label: u }))}
                        onChange={(u) => setNewIng((p) => ({ ...p, unit: u as typeof p.unit }))}
                        colour="gray"
                        aria-label="Unité"
                      />
                    </div>
                  </td>
                  <td className="hidden sm:table-cell" />
                  <td className="hidden sm:table-cell" />
                  <td colSpan={2}>
                    <div className="flex justify-end gap-1">
                      <IconButton size="sm" variant="primary" aria-label="Ajouter" onClick={handleAddIngredient} disabled={!newIng.ingredientId || newIng.qty <= 0} icon={<Check />} className="text-primary-foreground hover:text-primary-foreground" />
                      <IconButton size="sm" aria-label="Annuler" onClick={() => setAddingIngredient(false)} icon={<X />} />
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
      </Section>

      <Section title="Simulation de prix">
        <PricingSimulation recipe={recipe} totalCost={totalCost} />
      </Section>

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
          <Button variant="primary" size="md" icon={<Save />} onClick={handleSave} disabled={saving}>{saving ? "…" : "Enregistrer"}</Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="table min-w-[360px]">
          <thead>
            <tr>
              <th />
              <th className="text-right">Sur place</th>
              <th className="text-right">Take away</th>
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
          </tbody>
          <tbody className="[&>tr:first-child>td]:border-t [&>tr:first-child>td]:border-divider">
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
  const rates = VAT_RATES.includes(value as (typeof VAT_RATES)[number]) ? [...VAT_RATES] : [value, ...VAT_RATES];
  return (
    <SelectPill
      value={String(value)}
      options={rates.map((r) => ({ value: String(r), label: `${r} %` }))}
      onChange={(v) => onChange(Number(v))}
      colour="gray"
      align="right"
      aria-label="TVA"
    />
  );
}

function CalcRow({ label, sp, ta, bold, positive }: { label: string; sp: string; ta: string; bold?: boolean; positive?: boolean }) {
  return (
    <tr>
      <td className={bold ? "font-semibold" : "text-muted-foreground"}>{label}</td>
      <td className={`text-right tabular-nums ${bold ? "font-semibold" : ""} ${positive ? "text-success" : ""}`}>{sp}</td>
      <td className={`text-right tabular-nums ${bold ? "font-semibold" : ""} ${positive ? "text-success" : ""}`}>{ta}</td>
    </tr>
  );
}

function EditRow({ label, sp, ta, bold }: { label: string; sp: React.ReactNode; ta: React.ReactNode; bold?: boolean }) {
  return (
    <tr>
      <td className={bold ? "font-semibold" : "text-muted-foreground"}>{label}</td>
      <td className="text-right"><div className="flex justify-end">{sp}</div></td>
      <td className="text-right"><div className="flex justify-end">{ta}</div></td>
    </tr>
  );
}
