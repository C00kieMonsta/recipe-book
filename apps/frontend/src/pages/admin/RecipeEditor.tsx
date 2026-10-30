import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Save, Plus, X, ImagePlus } from "lucide-react";
import type { RecipeIngredient, RecipePricing, RecipePhoto, RecipePreparation, Ingredient } from "@packages/types";
import { UNITS_QTY, DEFAULT_COURSES, PRICE_TO_QTY_UNIT, DEFAULT_SUPPLIERS, recipeCategoryOf } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useBackLink, useTopTitle } from "@/components/admin/AdminLayout";
import StepToolbar, { useStepShortcuts } from "@/components/admin/StepToolbar";
import { NumericInput, SearchSelect, IngredientFormModal, FieldLabel, Section, PageHeader, Button, IconButton } from "@/components/ui";
import { fmt, fmtUnitPrice } from "@/lib/recipe-helpers";

const DEFAULT_PRICING: RecipePricing = {
  surPlace: { coef: 4, tva: 12 },
  takeAway: { coef: 3, tva: 6 },
  chosenPrice: { surPlace: 0, takeAway: 0 },
};

interface FormState {
  name: string;
  category: string;
  portions: number;
  portionWeight: number;
  description: string;
  techniques: string[];
  preparations: RecipePreparation[];
  ingredients: RecipeIngredient[];
  photos: RecipePhoto[];
  pricing: RecipePricing;
}

export default function RecipeEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const retour = searchParams.get("retour");
  // « Compléter la recette » from an event comes back to that event.
  const backTo = retour && retour.startsWith("/") ? retour : `/recipes/${id}`;
  const { toast } = useToast();
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingIngredient, setCreatingIngredient] = useState<{ name: string; row: number;
  } | null>(null);
  const [supplierNames, setSupplierNames] = useState(() => DEFAULT_SUPPLIERS.map((s) => s.name));

  const [form, setForm] = useState<FormState>({
    name: "", category: DEFAULT_COURSES[0], portions: 1, portionWeight: 150, description: "",
    techniques: [""], preparations: [], ingredients: [], photos: [], pricing: DEFAULT_PRICING,
  });
  const ingredientsBody = useRef<HTMLTableSectionElement>(null);
  const stepsList = useRef<HTMLDivElement>(null);
  // Row or step to focus once the list has grown.
  const focusRow = useRef<number | null>(null);
  const focusStep = useRef<number | null>(null);

  const title = isNew ? "Nouvelle recette" : "Modifier la recette";
  useBackLink({ to: isNew ? "/recipes" : backTo, label: retour ? "Retour" : "Recettes" });
  useTopTitle(title);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [ings, settings] = await Promise.all([
          api.ingredients.list(),
          api.settings.get().catch(() => null),
        ]);
        setAllIngredients(ings);
        const courses = settings?.courses?.length ? settings.courses : DEFAULT_COURSES;
        setCategories(courses);
        if (settings?.suppliers?.length) setSupplierNames(settings.suppliers.map((x) => x.name));
        if (isNew) {
          setForm((p) => ({ ...p, category: courses[0] }));
        } else if (id) {
          const recipe = await api.recipes.get(id);
          setForm({
            name: recipe.name, category: recipeCategoryOf(recipe), portions: recipe.portions,
            portionWeight: recipe.portionWeight, description: recipe.description || "",
            techniques: recipe.techniques.length ? recipe.techniques : [""],
            preparations: recipe.preparations ?? [],
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

  const addTechnique = () => {
    focusStep.current = form.techniques.length;
    update("techniques", [...form.techniques, ""]);
  };
  const updateTechnique = (i: number, v: string) => { const t = [...form.techniques]; t[i] = v; update("techniques", t); };
  const removeTechnique = (i: number) => update("techniques", form.techniques.filter((_, idx) => idx !== i));
  const addPreparation = () => update("preparations", [...form.preparations, { preparationId: crypto.randomUUID(), name: "", daysBefore: 0 }]);
  const updatePreparation = (i: number, patch: Partial<RecipePreparation>) => update("preparations", form.preparations.map((item, index) => index === i ? { ...item, ...patch } : item));
  const removePreparation = (i: number) => update("preparations", form.preparations.filter((_, index) => index !== i)
        .map((p) => ({
          ...p,
          dependsOn: p.dependsOn?.filter(
            (id) => id !== form.preparations[i].preparationId,
          ),
        })));

  const addIngLine = () => {
    focusRow.current = form.ingredients.length;
    update("ingredients", [...form.ingredients, { ingredientId: "", qty: 0, unit: "g" as const, lossPct: 0 }]);
  };
  const updateIngLine = (i: number, k: keyof RecipeIngredient, v: unknown) => { const a = [...form.ingredients]; a[i] = { ...a[i], [k]: v }; update("ingredients", a); };
  const removeIngLine = (i: number) => update("ingredients", form.ingredients.filter((_, idx) => idx !== i));

  const focusCell = (row: number, cell: "search" | "qty" | "unit" | "loss") => {
    const tr = ingredientsBody.current?.querySelectorAll("tr")[row];
    const selector = { search: 'input[role="combobox"]', qty: 'input[aria-label="Quantité"]', unit: 'select[aria-label="Unité"]', loss: 'input[aria-label="Perte"]' }[cell];
    tr?.querySelector<HTMLElement>(selector)?.focus();
  };
  useEffect(() => {
    if (focusRow.current === null) return;
    focusCell(focusRow.current, "search");
    focusRow.current = null;
  }, [form.ingredients.length]);
  useEffect(() => {
    if (focusStep.current === null) return;
    stepsList.current?.querySelectorAll("textarea")[focusStep.current]?.focus();
    focusStep.current = null;
  }, [form.techniques.length]);

  // Enter walks the row: quantity, unit, loss; on the last cell of the last row it adds a row.
  const onEnterTo = (next: () => void) => (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    next();
  };

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
        name: form.name, category: form.category, type: form.category, portions: form.portions,
        portionWeight: form.portionWeight, description: form.description,
        techniques: form.techniques.filter(Boolean),
        preparations: form.preparations.filter((p) => p.name.trim()).map((p) => ({ ...p, name: p.name.trim() })),
        ingredients: form.ingredients.filter((ri) => ri.ingredientId), photos: form.photos, pricing: form.pricing,
      };
      if (isNew) {
        const created = await api.recipes.create(data);
        toast({ title: "Recette créée" });
        navigate(`/recipes/${created.recipeId}`);
      } else {
        await api.recipes.update(id!, data);
        toast({ title: "Recette modifiée" });
        navigate(backTo);
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

  const cancel = () => navigate(isNew ? "/recipes" : backTo);
  const footer = (
    <>
      <Button variant="default" size="md" onClick={cancel}>
        Annuler
      </Button>
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
        <FieldLabel htmlFor="recipe-description" className="mt-3">
          Description
        </FieldLabel>
        <textarea id="recipe-description" className="input-field" value={form.description} onChange={(e) => update("description", e.target.value)} />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <FieldLabel htmlFor="recipe-category">Catégorie</FieldLabel>
            <select id="recipe-category" className="input-field" value={form.category} onChange={(e) => update("category", e.target.value)}>
              {(form.category && !categories.includes(form.category) ? [form.category, ...categories] : categories).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="recipe-portions">Portions</FieldLabel>
            <NumericInput id="recipe-portions" className="input-field" value={form.portions} onChange={(v) => update("portions", v)} min={1} />
          </div>
          <div>
            <FieldLabel htmlFor="recipe-weight">
              Poids par personne (g)
            </FieldLabel>
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

      <Section title="Préparations à planifier" action={<Button variant="ghost" size="sm" icon={<Plus />} onClick={addPreparation}>
            Ajouter
          </Button>}>
        <p className="mb-3 text-sm text-muted-foreground">
          Chaque élément devient une tâche à planifier dans l'événement.
          Indiquez le nombre de jours avant l'événement.
        </p>
        {form.preparations.map((preparation, i) => (
          <div key={preparation.preparationId} className="mb-3 grid grid-cols-1 items-end gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
            <div>
              <FieldLabel htmlFor={`preparation-name-${i}`}>
                Préparation
              </FieldLabel>
              <input id={`preparation-name-${i}`} className="input-field" value={preparation.name} placeholder="Ex. Mousse de chèvre" onChange={(e) => updatePreparation(i, { name: e.target.value })} />
              <input className="input-field mt-2" aria-label={`Détails de ${preparation.name || "la préparation"}`} value={preparation.description ?? ""} placeholder="Consigne (facultatif)" onChange={(e) => updatePreparation(i, { description: e.target.value })} />
            </div>
            <div>
              <FieldLabel htmlFor={`preparation-days-${i}`}>
                Jours avant
              </FieldLabel>
              <NumericInput id={`preparation-days-${i}`} className="input-field" value={preparation.daysBefore} min={0} onChange={(v) => updatePreparation(i, { daysBefore: Math.max(0, Math.min(60, Math.round(v))) })} />
            </div>
            <div className="flex flex-wrap gap-3 sm:col-span-3">
              <label className="text-sm">
                Minutes par lot ({form.portions} portions)
                <input
                  aria-label={`Durée de ${preparation.name}`}
                  type="number"
                  min="1"
                  max="1440"
                  className="input-field"
                  value={preparation.durationMinutes ?? ""}
                  onChange={(e) =>
                    updatePreparation(i, {
                      durationMinutes: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                />
              </label>
              <label className="text-sm">
                Matériel
                <select
                  aria-label={`Matériel de ${preparation.name}`}
                  className="input-field"
                  value={preparation.resource ?? ""}
                  onChange={(e) =>
                    updatePreparation(i, {
                      resource:
                        (e.target.value as RecipePreparation["resource"]) ||
                        undefined,
                    })
                  }
                >
                  <option value="">À préciser</option>
                  <option value="bench">Plan de travail</option>
                  <option value="oven">Four</option>
                  <option value="stove">Feu</option>
                </select>
              </label>
              <fieldset className="text-sm">
                <legend>Après</legend>
                {form.preparations
                  .filter((p) => p.preparationId !== preparation.preparationId)
                  .map((p) => (
                    <label
                      key={p.preparationId}
                      className="mr-3 inline-flex gap-1"
                    >
                      <input
                        type="checkbox"
                        checked={
                          preparation.dependsOn?.includes(p.preparationId) ??
                          false
                        }
                        onChange={(e) =>
                          updatePreparation(i, {
                            dependsOn: e.target.checked
                              ? [
                                  ...(preparation.dependsOn ?? []),
                                  p.preparationId,
                                ]
                              : (preparation.dependsOn ?? []).filter(
                                  (id) => id !== p.preparationId,
                                ),
                          })
                        }
                      />
                      {p.name || "Préparation sans nom"}
                    </label>
                  ))}
              </fieldset>
            </div>
            <details className="text-sm sm:col-span-3">
              <summary>Répartition des ingrédients (%)</summary>
              <p className="my-2 text-muted-foreground">
                Répartissez 100 % de chaque ingrédient entre les préparations
                pour obtenir des totaux précis par jour.
              </p>
              {form.ingredients.map((ingredient) => (
                <label
                  className="mb-2 flex items-center gap-2"
                  key={ingredient.ingredientId}
                >
                  {allIngredients.find(
                    (item) => item.ingredientId === ingredient.ingredientId,
                  )?.name ?? ingredient.ingredientId}
                  <input
                    aria-label={`Part ${ingredient.ingredientId} dans ${preparation.name}`}
                    type="number"
                    min="0"
                    max="100"
                    className="input-field w-24"
                    value={
                      preparation.ingredientShares?.[ingredient.ingredientId] ??
                      ""
                    }
                    onChange={(e) => {
                      const shares = { ...preparation.ingredientShares };
                      if (e.target.value === "")
                        delete shares[ingredient.ingredientId];
                      else
                        shares[ingredient.ingredientId] = Number(
                          e.target.value,
                        );
                      updatePreparation(i, { ingredientShares: shares });
                    }}
                  />{" "}
                  %
                </label>
              ))}
            </details>
            <IconButton size="md" aria-label={`Retirer ${preparation.name || "la préparation"}`} onClick={() => removePreparation(i)} icon={<X />} />
          </div>
        ))}
        {form.preparations.length === 0 && (
          <Button variant="subtle" size="sm" icon={<Plus />} onClick={addPreparation}>
            Ajouter la première préparation
          </Button>
        )}
      </Section>

      <Section
        title="Étapes de préparation"
        action={<Button variant="ghost" size="sm" icon={<Plus />} onClick={addTechnique}>
            Étape
          </Button>}
      >
        <p className="mb-3 text-sm text-muted-foreground">
          Décrivez chaque étape de la recette. Entrée passe à l'étape suivante.
        </p>
        {form.techniques.length === 0 && (
          <Button variant="subtle" size="sm" icon={<Plus />} onClick={addTechnique} className="-mx-1">
            Ajouter la première étape
          </Button>
        )}
        <div ref={stepsList}>
          {form.techniques.map((t, i) => (
            <EditorStep
              key={i}
              index={i}
              value={t}
              onChange={(v) => updateTechnique(i, v)}
              onEnter={() => {
                if (i === form.techniques.length - 1) addTechnique();
                else stepsList.current?.querySelectorAll("textarea")[i + 1]?.focus();
              }}
              onRemove={() => removeTechnique(i)}
              placeholder={
                i === 0 ? "Ex : préchauffer le four à 180 °C…"
                : i === 1 ? "Ex : mélanger les ingrédients secs…"
                : "Étape suivante…"
              }
            />
          ))}
        </div>
        <p className="mt-1 text-caption text-muted-foreground">
          Sélectionnez un mot puis Gras ou Surligner.
        </p>
      </Section>

      <Section
        title="Ingrédients"
        action={<Button variant="ghost" size="sm" icon={<Plus />} onClick={addIngLine}>
            Ajouter
          </Button>}
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
            <tbody ref={ingredientsBody}>
              {form.ingredients.map((ri, i) => (
                <tr key={i}>
                  <td className="!px-1"><SearchSelect options={allIngredients.map((ig) => ({ value: ig.ingredientId, label: ig.name, detail: fmtUnitPrice(ig.price, ig.unit) }))} value={ri.ingredientId} onChange={(v) => { const ing = allIngredients.find((ig) => ig.ingredientId === v); const updates: Partial<RecipeIngredient> = { ingredientId: v }; if (ing) updates.unit = PRICE_TO_QTY_UNIT[ing.unit] || "g"; const a = [...form.ingredients]; a[i] = { ...a[i], ...updates }; update("ingredients", a); }} onCommit={() => focusCell(i, "qty")} placeholder="Produit…" onCreateNew={(name) => setCreatingIngredient({ name, row: i })} /></td>
                  <td className="!px-1" onKeyDown={onEnterTo(() => focusCell(i, "unit"))}><NumericInput className="input-field w-full text-right" value={ri.qty} onChange={(v) => updateIngLine(i, "qty", v)} aria-label="Quantité" /></td>
                  <td className="!px-1"><select className="input-field w-full" aria-label="Unité" value={ri.unit} onChange={(e) => updateIngLine(i, "unit", e.target.value)} onKeyDown={onEnterTo(() => focusCell(i, "loss"))}>{UNITS_QTY.map((u) => (
                        <option key={u}>{u}</option>
                      ))}</select></td>
                  <td className="!px-1" onKeyDown={onEnterTo(() => { if (i === form.ingredients.length - 1) addIngLine(); else focusCell(i + 1, "search"); })}><NumericInput className="input-field w-full text-right" value={ri.lossPct} onChange={(v) => updateIngLine(i, "lossPct", v)} aria-label="Perte" /></td>
                  <td className="!px-0 text-center"><IconButton size="md" aria-label="Retirer la ligne" onClick={() => removeIngLine(i)} icon={<X />} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-caption text-muted-foreground touch:hidden">
          Entrée choisit le premier produit et passe à la quantité ; Entrée sur
          la dernière case ajoute une ligne.
        </p>
      </Section>

      <Section title="Tarification">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-3 text-base font-semibold">Sur place</h3>
            <FieldLabel htmlFor="sp-coef">Coefficient</FieldLabel>
            <NumericInput id="sp-coef" className="input-field" value={form.pricing.surPlace.coef} onChange={(v) => updatePricing("surPlace.coef", v)} />
            <FieldLabel htmlFor="sp-tva" className="mt-3">
              TVA %
            </FieldLabel>
            <NumericInput id="sp-tva" className="input-field" value={form.pricing.surPlace.tva} onChange={(v) => updatePricing("surPlace.tva", v)} />
            <FieldLabel htmlFor="sp-price" className="mt-3">
              Prix choisi TVAC
            </FieldLabel>
            <NumericInput id="sp-price" className="input-field" value={form.pricing.chosenPrice.surPlace} onChange={(v) => updatePricing("chosenPrice.surPlace", v)} />
          </div>
          <div>
            <h3 className="mb-3 text-base font-semibold">Take away</h3>
            <FieldLabel htmlFor="ta-coef">Coefficient</FieldLabel>
            <NumericInput id="ta-coef" className="input-field" value={form.pricing.takeAway.coef} onChange={(v) => updatePricing("takeAway.coef", v)} />
            <FieldLabel htmlFor="ta-tva" className="mt-3">
              TVA %
            </FieldLabel>
            <NumericInput id="ta-tva" className="input-field" value={form.pricing.takeAway.tva} onChange={(v) => updatePricing("takeAway.tva", v)} />
            <FieldLabel htmlFor="ta-price" className="mt-3">
              Prix choisi TVAC
            </FieldLabel>
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

function EditorStep({ index, value, placeholder, onChange, onEnter, onRemove }: {
  index: number;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const onShortcut = useStepShortcuts(ref, value, onChange);
  return (
    <div className="mb-2 flex items-start gap-2">
      <span className="w-6 shrink-0 pt-1.5 text-right text-sm text-muted-foreground tabular-nums">{index + 1}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <StepToolbar textareaRef={ref} value={value} onChange={onChange} className="touch:order-2" />
        <textarea
          ref={ref}
          className="input-field min-h-[50px] touch:order-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (onShortcut(e)) return;
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEnter(); }
          }}
          placeholder={placeholder}
        />
      </div>
      <IconButton size="md" aria-label="Supprimer l'étape" onClick={onRemove} icon={<X />} />
    </div>
  );
}
