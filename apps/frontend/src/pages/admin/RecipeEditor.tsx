import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Plus, X, ImagePlus } from "lucide-react";
import type { Recipe, RecipeIngredient, RecipePricing, RecipePhoto, Ingredient } from "@packages/types";
import { UNITS_QTY, DEFAULT_RECIPE_CATEGORIES, PRICE_TO_QTY_UNIT, DEFAULT_SUPPLIERS } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import NumericInput from "@/components/ui/NumericInput";
import SearchSelect from "@/components/ui/SearchSelect";
import IngredientFormModal from "@/components/ui/IngredientFormModal";
import { fmt } from "@/lib/recipe-helpers";

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
  const [creatingIngredient, setCreatingIngredient] = useState<string | null>(null);
  const [supplierNames] = useState(() => DEFAULT_SUPPLIERS.map((s) => s.name));

  const [form, setForm] = useState<FormState>({
    name: "", type: "Buffet", portions: 1, portionWeight: 150, description: "",
    techniques: [""], ingredients: [], photos: [], pricing: DEFAULT_PRICING,
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [ings, settings] = await Promise.all([
          api.ingredients.list(),
          api.settings.get().catch(() => null),
        ]);
        setAllIngredients(ings);
        setCategories(settings?.recipeCategories?.length ? settings.recipeCategories : DEFAULT_RECIPE_CATEGORIES);
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

  const handleCreateIngredient = async (data: Partial<Ingredient>) => {
    try {
      const created = await api.ingredients.create(data);
      setAllIngredients((prev) => [...prev, created]);
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

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="flex justify-between items-center mb-5">
        <button onClick={() => navigate(isNew ? "/recipes" : `/recipes/${id}`)} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Annuler
        </button>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50">
          <Save className="h-4 w-4" /> {saving ? "Sauvegarde…" : "Enregistrer"}
        </button>
      </div>

      <h1 className="text-3xl font-bold tracking-tight mb-6">{isNew ? "Nouvelle recette" : "Modifier la recette"}</h1>

      <div className="grid gap-5">
        <section className="card-elevated p-5">
          <h2 className="font-serif text-lg font-bold mb-4">Informations</h2>
          <FieldLabel>Nom</FieldLabel>
          <input className="input-field" value={form.name} onChange={(e) => update("name", e.target.value)} />
          <FieldLabel>Description</FieldLabel>
          <textarea className="input-field min-h-[80px]" value={form.description} onChange={(e) => update("description", e.target.value)} />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel>Type</FieldLabel>
              <select className="input-field" value={form.type} onChange={(e) => update("type", e.target.value)}>
                {categories.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>Portions</FieldLabel>
              <NumericInput className="input-field" value={form.portions} onChange={(v) => update("portions", v)} min={1} />
            </div>
            <div>
              <FieldLabel>Poids/pers (g)</FieldLabel>
              <NumericInput className="input-field" value={form.portionWeight} onChange={(v) => update("portionWeight", v)} />
            </div>
          </div>
        </section>

        <section className="card-elevated p-5">
          <h2 className="font-serif text-lg font-bold mb-3">Photos</h2>
          <div className="flex gap-3 flex-wrap">
            {form.photos.map((photo, idx) => (
              <div key={idx} className="relative w-40 rounded-lg overflow-hidden border">
                <img src={photo.url} alt={photo.label} className="w-full h-28 object-cover" />
                <button onClick={() => update("photos", form.photos.filter((_, i) => i !== idx))} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-foreground/70 text-background flex items-center justify-center"><X className="h-3 w-3" /></button>
                <input className="w-full border-t px-2 py-1 text-xs text-center bg-transparent outline-none" value={photo.label} onChange={(e) => { const u = [...form.photos]; u[idx] = { ...u[idx], label: e.target.value }; update("photos", u); }} placeholder="Label…" />
              </div>
            ))}
            {form.photos.length < 3 && (
              <label className="w-40 h-36 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer text-muted-foreground hover:border-primary/40 transition-colors">
                <ImagePlus className="h-7 w-7" /><span className="text-xs font-medium">Ajouter photo</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handlePhotoUpload(e.target.files[0]); e.target.value = ""; }} />
              </label>
            )}
          </div>
        </section>

        <section className="card-elevated p-5">
          <div className="flex justify-between items-center mb-1">
            <h2 className="font-serif text-lg font-bold">Étapes de préparation</h2>
            <button onClick={addTechnique} className="flex items-center gap-1 px-3 py-1 border rounded-md text-xs font-medium hover:bg-muted"><Plus className="h-3.5 w-3.5" /> Ajouter une étape</button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Décrivez chaque étape de la recette. Appuyez sur Entrée pour passer à l'étape suivante.</p>
          {form.techniques.length === 0 && (
            <button onClick={addTechnique} className="w-full py-6 border-2 border-dashed rounded-xl text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors text-sm font-medium">
              + Ajouter la première étape
            </button>
          )}
          {form.techniques.map((t, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold shrink-0 mt-2">{i + 1}</span>
              <textarea
                className="input-field flex-1 min-h-[50px]"
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
                  i === 0 ? "Ex: Préchauffer le four à 180°C…"
                  : i === 1 ? "Ex: Mélanger les ingrédients secs…"
                  : "Étape suivante…"
                }
              />
              <button onClick={() => removeTechnique(i)} className="p-1 mt-2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </section>

        <section className="card-elevated p-5">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-serif text-lg font-bold">Ingrédients</h2>
            <button onClick={addIngLine} className="flex items-center gap-1 px-3 py-1 border rounded-md text-xs font-medium hover:bg-muted"><Plus className="h-3.5 w-3.5" /> Ajouter</button>
          </div>
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[45%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[15%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead><tr className="border-b">
              <th className="px-2 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Produit</th>
              <th className="px-2 py-2 text-xs font-bold uppercase text-muted-foreground">Qté</th>
              <th className="px-2 py-2 text-xs font-bold uppercase text-muted-foreground">Unité</th>
              <th className="px-2 py-2 text-xs font-bold uppercase text-muted-foreground">Perte %</th>
              <th className="px-2 py-2" />
            </tr></thead>
            <tbody>
              {form.ingredients.map((ri, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="px-2 py-1"><SearchSelect options={allIngredients.map((ig) => ({ value: ig.ingredientId, label: ig.name, detail: `${fmt(ig.price)} ${ig.unit}` }))} value={ri.ingredientId} onChange={(v) => { const ing = allIngredients.find((ig) => ig.ingredientId === v); const updates: Partial<RecipeIngredient> = { ingredientId: v }; if (ing) updates.unit = PRICE_TO_QTY_UNIT[ing.unit]; const a = [...form.ingredients]; a[i] = { ...a[i], ...updates }; update("ingredients", a); }} placeholder="Rechercher…" onCreateNew={(name) => setCreatingIngredient(name)} /></td>
                  <td className="px-2 py-1"><NumericInput className="input-field !py-1 !text-xs text-right w-full" value={ri.qty} onChange={(v) => updateIngLine(i, "qty", v)} /></td>
                  <td className="px-2 py-1"><select className="input-field !py-1 !text-xs w-full" value={ri.unit} onChange={(e) => updateIngLine(i, "unit", e.target.value)}>{UNITS_QTY.map((u) => <option key={u}>{u}</option>)}</select></td>
                  <td className="px-2 py-1"><NumericInput className="input-field !py-1 !text-xs text-right w-full" value={ri.lossPct} onChange={(v) => updateIngLine(i, "lossPct", v)} /></td>
                  <td className="px-2 py-1 text-center"><button onClick={() => removeIngLine(i)} className="p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card-elevated p-5">
          <h2 className="font-serif text-lg font-bold mb-4">Tarification</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="font-serif text-sm font-bold mb-3">Sur place</h4>
              <FieldLabel>Coefficient</FieldLabel>
              <NumericInput className="input-field" value={form.pricing.surPlace.coef} onChange={(v) => updatePricing("surPlace.coef", v)} />
              <FieldLabel>TVA %</FieldLabel>
              <NumericInput className="input-field" value={form.pricing.surPlace.tva} onChange={(v) => updatePricing("surPlace.tva", v)} />
              <FieldLabel>Prix choisi TVAC</FieldLabel>
              <NumericInput className="input-field" value={form.pricing.chosenPrice.surPlace} onChange={(v) => updatePricing("chosenPrice.surPlace", v)} />
            </div>
            <div>
              <h4 className="font-serif text-sm font-bold mb-3">Take away</h4>
              <FieldLabel>Coefficient</FieldLabel>
              <NumericInput className="input-field" value={form.pricing.takeAway.coef} onChange={(v) => updatePricing("takeAway.coef", v)} />
              <FieldLabel>TVA %</FieldLabel>
              <NumericInput className="input-field" value={form.pricing.takeAway.tva} onChange={(v) => updatePricing("takeAway.tva", v)} />
              <FieldLabel>Prix choisi TVAC</FieldLabel>
              <NumericInput className="input-field" value={form.pricing.chosenPrice.takeAway} onChange={(v) => updatePricing("chosenPrice.takeAway", v)} />
            </div>
          </div>
        </section>
      </div>

      {creatingIngredient !== null && (
        <IngredientFormModal
          ingredient={{ name: creatingIngredient, price: 0, unit: "€/kg", supplier: supplierNames[0] || "" }}
          supplierNames={supplierNames}
          onSave={handleCreateIngredient}
          onCancel={() => setCreatingIngredient(null)}
        />
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">{children}</label>;
}
