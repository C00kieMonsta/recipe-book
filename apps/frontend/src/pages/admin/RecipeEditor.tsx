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
import FieldLabel from "@/components/ui/FieldLabel";
import Section from "@/components/ui/Section";
import { fmt } from "@/lib/recipe-helpers";

const DEFAULT_PRICING: RecipePricing = {
  surPlace: { coef: 4, tva: 12 },
  takeAway: { coef: 3, tva: 6 },
  chosenPrice: { surPlace: 0, takeAway: 0 },
};

const BTN = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-base font-medium transition-colors";
const BTN_PRIMARY = `${BTN} bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50`;
const BTN_OUTLINE = `${BTN} border bg-card hover:bg-hover`;

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
    <div className="mx-auto max-w-doc">
      <div className="mb-5 flex items-center justify-between gap-2">
        <button onClick={() => navigate(isNew ? "/recipes" : `/recipes/${id}`)} className="flex min-h-11 items-center gap-2 text-base font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Annuler
        </button>
        <button onClick={handleSave} disabled={saving} className={BTN_PRIMARY}>
          <Save className="h-4 w-4" /> {saving ? "Sauvegarde…" : "Enregistrer"}
        </button>
      </div>

      <h1 className="font-serif text-h1 md:text-h1-lg">{isNew ? "Nouvelle recette" : "Modifier la recette"}</h1>

      <Section title="Informations">
        <FieldLabel htmlFor="recipe-name">Nom</FieldLabel>
        <input id="recipe-name" className="input-field" value={form.name} onChange={(e) => update("name", e.target.value)} />
        <FieldLabel htmlFor="recipe-description" className="mt-3">Description</FieldLabel>
        <textarea id="recipe-description" className="input-field min-h-[80px]" value={form.description} onChange={(e) => update("description", e.target.value)} />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <FieldLabel htmlFor="recipe-type">Format</FieldLabel>
            <select id="recipe-type" className="input-field" value={form.type} onChange={(e) => update("type", e.target.value)}>
              {categories.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>Portions</FieldLabel>
            <NumericInput className="input-field" value={form.portions} onChange={(v) => update("portions", v)} min={1} />
          </div>
          <div>
            <FieldLabel>Poids par personne (g)</FieldLabel>
            <NumericInput className="input-field" value={form.portionWeight} onChange={(v) => update("portionWeight", v)} />
          </div>
        </div>
      </Section>

      <Section title="Photos">
        <div className="flex gap-3 flex-wrap">
          {form.photos.map((photo, idx) => (
            <div key={idx} className="relative w-40 rounded-lg overflow-hidden border">
              <img src={photo.url} alt={photo.label} className="w-full h-28 object-cover" />
              <button onClick={() => update("photos", form.photos.filter((_, i) => i !== idx))} aria-label="Retirer la photo" className="absolute top-1 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-foreground/70 text-background"><X className="h-4 w-4" /></button>
              <input className="w-full border-t px-2 py-1.5 text-sm text-center bg-transparent outline-none" value={photo.label} onChange={(e) => { const u = [...form.photos]; u[idx] = { ...u[idx], label: e.target.value }; update("photos", u); }} placeholder="Légende…" />
            </div>
          ))}
          {form.photos.length < 3 && (
            <label className="w-40 h-36 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer text-muted-foreground hover:border-primary/40 transition-colors">
              <ImagePlus className="h-7 w-7" /><span className="text-sm font-medium">Ajouter une photo</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handlePhotoUpload(e.target.files[0]); e.target.value = ""; }} />
            </label>
          )}
        </div>
      </Section>

      <Section
        title="Étapes de préparation"
        action={<button onClick={addTechnique} className={`${BTN_OUTLINE} px-3`}><Plus className="h-4 w-4" /> Ajouter une étape</button>}
      >
        <p className="text-sm text-muted-foreground mb-3">Décrivez chaque étape de la recette. Entrée passe à l'étape suivante.</p>
        {form.techniques.length === 0 && (
          <button onClick={addTechnique} className="w-full py-6 border-2 border-dashed rounded-xl text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors text-base font-medium">
            + Ajouter la première étape
          </button>
        )}
        {form.techniques.map((t, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <span className="w-7 h-7 rounded-full bg-primary-soft text-foreground flex items-center justify-center text-sm font-semibold shrink-0 mt-2">{i + 1}</span>
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
                i === 0 ? "Ex : préchauffer le four à 180 °C…"
                : i === 1 ? "Ex : mélanger les ingrédients secs…"
                : "Étape suivante…"
              }
            />
            <button onClick={() => removeTechnique(i)} aria-label="Supprimer l'étape" className="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </Section>

      <Section
        title="Ingrédients"
        action={
          <>
            <button
              type="button"
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
              className={`${BTN_OUTLINE} px-3`}
            >
              <Plus className="h-4 w-4" /> Plusieurs lignes…
            </button>
            <button onClick={addIngLine} className={`${BTN_OUTLINE} px-3`}><Plus className="h-4 w-4" /> Ajouter</button>
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="table table-fixed min-w-[560px]">
            <colgroup>
              <col className="w-[42%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead><tr className="border-b text-muted-foreground">
              <th>Produit</th>
              <th className="text-right">Quantité</th>
              <th>Unité</th>
              <th className="text-right">Perte %</th>
              <th />
            </tr></thead>
            <tbody>
              {form.ingredients.map((ri, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="!px-1"><SearchSelect options={allIngredients.map((ig) => ({ value: ig.ingredientId, label: ig.name, detail: `${fmt(ig.price)} ${ig.unit}` }))} value={ri.ingredientId} onChange={(v) => { const ing = allIngredients.find((ig) => ig.ingredientId === v); const updates: Partial<RecipeIngredient> = { ingredientId: v }; if (ing) updates.unit = PRICE_TO_QTY_UNIT[ing.unit]; const a = [...form.ingredients]; a[i] = { ...a[i], ...updates }; update("ingredients", a); }} placeholder="Rechercher…" onCreateNew={(name) => setCreatingIngredient(name)} /></td>
                  <td className="!px-1"><NumericInput className="input-field text-right w-full" value={ri.qty} onChange={(v) => updateIngLine(i, "qty", v)} /></td>
                  <td className="!px-1"><select className="input-field w-full" value={ri.unit} onChange={(e) => updateIngLine(i, "unit", e.target.value)}>{UNITS_QTY.map((u) => <option key={u}>{u}</option>)}</select></td>
                  <td className="!px-1"><NumericInput className="input-field text-right w-full" value={ri.lossPct} onChange={(v) => updateIngLine(i, "lossPct", v)} /></td>
                  <td className="!px-0 text-center"><button onClick={() => removeIngLine(i)} aria-label="Retirer la ligne" className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Tarification">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-base font-semibold mb-3">Sur place</h3>
            <FieldLabel>Coefficient</FieldLabel>
            <NumericInput className="input-field" value={form.pricing.surPlace.coef} onChange={(v) => updatePricing("surPlace.coef", v)} />
            <FieldLabel className="mt-3">TVA %</FieldLabel>
            <NumericInput className="input-field" value={form.pricing.surPlace.tva} onChange={(v) => updatePricing("surPlace.tva", v)} />
            <FieldLabel className="mt-3">Prix choisi TVAC</FieldLabel>
            <NumericInput className="input-field" value={form.pricing.chosenPrice.surPlace} onChange={(v) => updatePricing("chosenPrice.surPlace", v)} />
          </div>
          <div>
            <h3 className="text-base font-semibold mb-3">Take away</h3>
            <FieldLabel>Coefficient</FieldLabel>
            <NumericInput className="input-field" value={form.pricing.takeAway.coef} onChange={(v) => updatePricing("takeAway.coef", v)} />
            <FieldLabel className="mt-3">TVA %</FieldLabel>
            <NumericInput className="input-field" value={form.pricing.takeAway.tva} onChange={(v) => updatePricing("takeAway.tva", v)} />
            <FieldLabel className="mt-3">Prix choisi TVAC</FieldLabel>
            <NumericInput className="input-field" value={form.pricing.chosenPrice.takeAway} onChange={(v) => updatePricing("chosenPrice.takeAway", v)} />
          </div>
        </div>
      </Section>

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
