import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Save, Plus, X, ImagePlus } from "lucide-react";
import type { Recipe, RecipeIngredient, RecipePricing, RecipePhoto, Ingredient } from "@packages/types";
import { UNITS_QTY, DEFAULT_RECIPE_CATEGORIES, PRICE_TO_QTY_UNIT, DEFAULT_SUPPLIERS } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useBackLink, useTopTitle } from "@/components/admin/AdminLayout";
import { NumericInput, SearchSelect, IngredientFormModal, FieldLabel, Section, PageHeader, Button, IconButton } from "@/components/ui";
import { fmt, fmtUnitPrice } from "@/lib/recipe-helpers";

const DEFAULT_PRICING: RecipePricing = {
  surPlace: { coef: 4, tva: 12 },
  takeAway: { coef: 3, tva: 6 },
  chosenPrice: { surPlace: 0, takeAway: 0 },
};

interface FormState {
  name: string;
  type: string;
  portions: number;
  portionWeight: number;
  description: string;
  techniques: string[];
  ingredients: RecipeIngredient[];
  photos: RecipePhoto[];
  pricing: RecipePricing;
}

export default function RecipeEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { toast } = useToast();
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingIngredient, setCreatingIngredient] = useState<{ name: string; row: number } | null>(null);
  const [supplierNames, setSupplierNames] = useState(() => DEFAULT_SUPPLIERS.map((s) => s.name));

  const [form, setForm] = useState<FormState>({
    name: "", type: "Buffet", portions: 1, portionWeight: 150, description: "",
    techniques: [""], ingredients: [], photos: [], pricing: DEFAULT_PRICING,
  });

  const title = isNew ? "Nouvelle recette" : "Modifier la recette";
  useBackLink({ to: isNew ? "/recipes" : `/recipes/${id}`, label: "Recettes" });
  useTopTitle(title);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [ings, settings] = await Promise.all([
          api.ingredients.list(),
          api.settings.get().catch(() => null),
        ]);
        setAllIngredients(ings);
        setCategories(settings?.recipeCategories?.length ? settings.recipeCategories : DEFAULT_RECIPE_CATEGORIES);
        if (settings?.suppliers?.length) setSupplierNames(settings.suppliers.map((x) => x.name));
        if (!isNew && id) {
          const recipe = await api.recipes.get(id);
          setForm({
            name: recipe.name, type: recipe.type, portions: recipe.portions,
            portionWeight: recipe.portionWeight, description: recipe.description || "",
            techniques: recipe.techniques.length ? recipe.techniques : [""],
            ingredients: recipe.ingredients, photos: recipe.photos || [],
            pricing: recipe.pricing || DEFAULT_PRICING,
          });
        }
      } catch {
        toast({ title: "Erreur de chargement", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id]);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }));

  const addTechnique = () => update("techniques", [...form.techniques, ""]);
  const updateTechnique = (i: number, v: string) => { const t = [...form.techniques]; t[i] = v; update("techniques", t); };
  const removeTechnique = (i: number) => update("techniques", form.techniques.filter((_, idx) => idx !== i));

  const addIngLine = () => update("ingredients", [...form.ingredients, { ingredientId: allIngredients[0]?.ingredientId || "", qty: 0, unit: "g" as const, lossPct: 0 }]);
  const updateIngLine = (i: number, k: keyof RecipeIngredient, v: unknown) => { const a = [...form.ingredients]; a[i] = { ...a[i], [k]: v }; update("ingredients", a); };
  const removeIngLine = (i: number) => update("ingredients", form.ingredients.filter((_, idx) => idx !== i));

  const updatePricing = (path: string, v: number) => {
    setForm((p) => {
      const pricing = structuredClone(p.pricing);
      const parts = path.split(".");
      let obj: Record<string, unknown> = pricing as unknown as Record<string, unknown>;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]] as Record<string, unknown>;
      obj[parts[parts.length - 1]] = v;
      return { ...p, pricing };
    });
  };

  const assignToRow = (row: number, ing: Ingredient) =>
    setForm((p) => {
      if (!p.ingredients[row]) return p;
      const a = [...p.ingredients];
      a[row] = { ...a[row], ingredientId: ing.ingredientId, unit: PRICE_TO_QTY_UNIT[ing.unit] || "g" };
      return { ...p, ingredients: a };
    });

  const handleCreateIngredient = async (data: Partial<Ingredient>) => {
    try {
      const created = await api.ingredients.create(data);
      setAllIngredients((prev) => [...prev, created]);
      if (creatingIngredient) assignToRow(creatingIngredient.row, created);
      setCreatingIngredient(null);
      toast({ title: "Ingrédient créé" });
    } catch {
      toast({ title: "Erreur lors de la création", variant: "destructive" });
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Le nom est requis", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const data = {
        name: form.name, type: form.type, portions: form.portions,
        portionWeight: form.portionWeight, description: form.description,
        techniques: form.techniques.filter(Boolean),
        ingredients: form.ingredients, photos: form.photos, pricing: form.pricing,
      };
      if (isNew) {
        const created = await api.recipes.create(data);
        toast({ title: "Recette créée" });
        navigate(`/recipes/${created.recipeId}`);
      } else {
        await api.recipes.update(id!, data);
        toast({ title: "Recette modifiée" });
        navigate(`/recipes/${id}`);
      }
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    try {
      const result = await api.recipes.uploadPhoto(file);
      update("photos", [...form.photos, { key: result.key, label: "", url: result.url }]);
    } catch {
      toast({ title: "Erreur lors de l'upload", variant: "destructive" });
    }
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  const cancel = () => navigate(isNew ? "/recipes" : `/recipes/${id}`);
  const footer = (
    <>
      <Button variant="default" size="md" onClick={cancel}>Annuler</Button>
      <Button variant="primary" size="md" icon={<Save />} onClick={handleSave} disabled={saving}>{saving ? "Sauvegarde…" : "Enregistrer"}</Button>
    </>
  );

  return (
    <div className="mx-auto max-w-doc">
      <PageHeader
        breadcrumb={[{ label: "Recettes", to: "/recipes" }, ...(isNew ? [] : [{ label: form.name || "Recette", to: `/recipes/${id}` }]), { label: isNew ? "Nouvelle" : "Modification" }]}
        iconKey="recette"
        title={title}
        actions={<div className="hidden items-center gap-1 md:flex">{footer}</div>}
      />

      <Section title="Informations" className="!mt-0">
        <FieldLabel htmlFor="recipe-name">Nom</FieldLabel>
        <input id="recipe-name" className="input-field" value={form.name} onChange={(e) => update("name", e.target.value)} />
        <FieldLabel htmlFor="recipe-description" className="mt-3">Description</FieldLabel>
        <textarea id="recipe-description" className="input-field" value={form.description} onChange={(e) => update("description", e.target.value)} />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <FieldLabel htmlFor="recipe-type">Format</FieldLabel>
            <select id="recipe-type" className="input-field" value={form.type} onChange={(e) => update("type", e.target.value)}>
              {categories.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="recipe-portions">Portions</FieldLabel>
            <NumericInput id="recipe-portions" className="input-field" value={form.portions} onChange={(v) => update("portions", v)} min={1} />
          </div>
          <div>
            <FieldLabel htmlFor="recipe-weight">Poids par personne (g)</FieldLabel>
            <NumericInput id="recipe-weight" className="input-field" value={form.portionWeight} onChange={(v) => update("portionWeight", v)} />
          </div>
        </div>
      </Section>

      <Section title="Photos">
        <div className="flex flex-wrap gap-3">
          {form.photos.map((photo, idx) => (
            <div key={idx} className="relative w-40 overflow-hidden rounded-lg shadow-card">
              <img src={photo.url} alt={photo.label} className="h-28 w-full object-cover" />
              <IconButton size="sm" aria-label="Retirer la photo" onClick={() => update("photos", form.photos.filter((_, i) => i !== idx))} icon={<X />} className="absolute right-1 top-1 bg-background/90 text-foreground" />
              <input className="w-full border-t border-border bg-transparent px-2 py-1.5 text-center text-sm outline-none placeholder:text-placeholder" value={photo.label} onChange={(e) => { const u = [...form.photos]; u[idx] = { ...u[idx], label: e.target.value }; update("photos", u); }} placeholder="Légende…" />
            </div>
          ))}
          {form.photos.length < 3 && (
            <label className="flex h-36 w-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg bg-surface text-muted-foreground hover:bg-hover">
              <ImagePlus className="h-6 w-6" /><span className="text-sm font-medium">Ajouter une photo</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handlePhotoUpload(e.target.files[0]); e.target.value = ""; }} />
            </label>
          )}
        </div>
      </Section>

      <Section
        title="Étapes de préparation"
        action={<Button variant="ghost" size="sm" icon={<Plus />} onClick={addTechnique}>Étape</Button>}
      >
        <p className="mb-3 text-sm text-muted-foreground">Décrivez chaque étape de la recette. Entrée passe à l'étape suivante.</p>
        {form.techniques.length === 0 && (
          <Button variant="subtle" size="sm" icon={<Plus />} onClick={addTechnique} className="-mx-1">Ajouter la première étape</Button>
        )}
        {form.techniques.map((t, i) => (
          <div key={i} className="mb-2 flex items-start gap-2">
            <span className="w-6 shrink-0 pt-1.5 text-right text-sm text-muted-foreground tabular-nums">{i + 1}</span>
            <textarea
              className="input-field min-h-[50px] flex-1"
              value={t}
              onChange={(e) => updateTechnique(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (i === form.techniques.length - 1) addTechnique();
                  const next = e.currentTarget.closest("section")?.querySelectorAll("textarea")[i + 1];
                  if (next) (next as HTMLTextAreaElement).focus();
                }
              }}
              placeholder={
                i === 0 ? "Ex : préchauffer le four à 180 °C…"
                : i === 1 ? "Ex : mélanger les ingrédients secs…"
                : "Étape suivante…"
              }
            />
            <IconButton size="md" aria-label="Supprimer l'étape" onClick={() => removeTechnique(i)} icon={<X />} />
          </div>
        ))}
      </Section>

      <Section
        title="Ingrédients"
        action={
          <>
            <Button
              variant="subtle"
              size="sm"
              title="Ajouter plusieurs lignes vides d'un coup pour saisie au clavier"
              onClick={() => {
                const raw = prompt("Nombre de lignes à ajouter (1 à 40) ?", "5");
                const n = parseInt(raw || "0", 10);
                if (Number.isNaN(n) || n < 1 || n > 40) return;
                const blank: RecipeIngredient = {
                  ingredientId: allIngredients[0]?.ingredientId || "",
                  qty: 0,
                  unit: "g",
                  lossPct: 0,
                };
                update("ingredients", [...form.ingredients, ...Array.from({ length: n }, () => ({ ...blank }))]);
              }}
            >
              Plusieurs lignes…
            </Button>
            <Button variant="ghost" size="sm" icon={<Plus />} onClick={addIngLine}>Ajouter</Button>
          </>
        }
      >
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="table table-fixed min-w-[560px]">
            <colgroup>
              <col className="w-[42%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead><tr>
              <th>Produit</th>
              <th className="text-right">Quantité</th>
              <th>Unité</th>
              <th className="text-right">Perte %</th>
              <th />
            </tr></thead>
            <tbody>
              {form.ingredients.map((ri, i) => (
                <tr key={i}>
                  <td className="!px-1"><SearchSelect options={allIngredients.map((ig) => ({ value: ig.ingredientId, label: ig.name, detail: fmtUnitPrice(ig.price, ig.unit) }))} value={ri.ingredientId} onChange={(v) => { const ing = allIngredients.find((ig) => ig.ingredientId === v); const updates: Partial<RecipeIngredient> = { ingredientId: v }; if (ing) updates.unit = PRICE_TO_QTY_UNIT[ing.unit] || "g"; const a = [...form.ingredients]; a[i] = { ...a[i], ...updates }; update("ingredients", a); }} placeholder="Rechercher…" onCreateNew={(name) => setCreatingIngredient({ name, row: i })} /></td>
                  <td className="!px-1"><NumericInput className="input-field w-full text-right" value={ri.qty} onChange={(v) => updateIngLine(i, "qty", v)} aria-label="Quantité" /></td>
                  <td className="!px-1"><select className="input-field w-full" aria-label="Unité" value={ri.unit} onChange={(e) => updateIngLine(i, "unit", e.target.value)}>{UNITS_QTY.map((u) => <option key={u}>{u}</option>)}</select></td>
                  <td className="!px-1"><NumericInput className="input-field w-full text-right" value={ri.lossPct} onChange={(v) => updateIngLine(i, "lossPct", v)} aria-label="Perte" /></td>
                  <td className="!px-0 text-center"><IconButton size="md" aria-label="Retirer la ligne" onClick={() => removeIngLine(i)} icon={<X />} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Tarification">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-3 text-base font-semibold">Sur place</h3>
            <FieldLabel htmlFor="sp-coef">Coefficient</FieldLabel>
            <NumericInput id="sp-coef" className="input-field" value={form.pricing.surPlace.coef} onChange={(v) => updatePricing("surPlace.coef", v)} />
            <FieldLabel htmlFor="sp-tva" className="mt-3">TVA %</FieldLabel>
            <NumericInput id="sp-tva" className="input-field" value={form.pricing.surPlace.tva} onChange={(v) => updatePricing("surPlace.tva", v)} />
            <FieldLabel htmlFor="sp-price" className="mt-3">Prix choisi TVAC</FieldLabel>
            <NumericInput id="sp-price" className="input-field" value={form.pricing.chosenPrice.surPlace} onChange={(v) => updatePricing("chosenPrice.surPlace", v)} />
          </div>
          <div>
            <h3 className="mb-3 text-base font-semibold">Take away</h3>
            <FieldLabel htmlFor="ta-coef">Coefficient</FieldLabel>
            <NumericInput id="ta-coef" className="input-field" value={form.pricing.takeAway.coef} onChange={(v) => updatePricing("takeAway.coef", v)} />
            <FieldLabel htmlFor="ta-tva" className="mt-3">TVA %</FieldLabel>
            <NumericInput id="ta-tva" className="input-field" value={form.pricing.takeAway.tva} onChange={(v) => updatePricing("takeAway.tva", v)} />
            <FieldLabel htmlFor="ta-price" className="mt-3">Prix choisi TVAC</FieldLabel>
            <NumericInput id="ta-price" className="input-field" value={form.pricing.chosenPrice.takeAway} onChange={(v) => updatePricing("chosenPrice.takeAway", v)} />
          </div>
        </div>
      </Section>

      <div className="mt-block flex justify-end gap-2 border-t border-border pt-4">{footer}</div>

      {creatingIngredient !== null && (
        <IngredientFormModal
          ingredient={{ name: creatingIngredient.name, price: 0, unit: "€/kg", supplier: supplierNames[0] || "" }}
          supplierNames={supplierNames}
          existing={allIngredients}
          onUseExisting={(ing) => { assignToRow(creatingIngredient.row, ing); setCreatingIngredient(null); }}
          onSave={handleCreateIngredient}
          onCancel={() => setCreatingIngredient(null)}
        />
      )}
    </div>
  );
}
