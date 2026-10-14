import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Recipe } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button, Dialog, FieldLabel, NumericInput, SelectPill } from "@/components/ui";

export interface NewRecipeInitial { name: string; category?: string }

export interface NewRecipeDialogProps {
  open: boolean;
  onClose: () => void;
  initial: NewRecipeInitial;
  categories: string[];
  existing: Pick<Recipe, "recipeId" | "name">[];
  defaultPortions: number;
  onCreated: (recipe: Recipe) => void | Promise<void>;
  // Shown as « L'ajouter » when the name matches an existing recipe.
  onUseExisting?: (recipeId: string) => void | Promise<void>;
}

const FALLBACK_CATEGORY = "Plat";

export default function NewRecipeDialog({ open, onClose, initial, categories, existing, defaultPortions, onCreated, onUseExisting }: NewRecipeDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState(FALLBACK_CATEGORY);
  const [portions, setPortions] = useState(defaultPortions);
  const [busy, setBusy] = useState(false);

  // Fields reset when the dialog opens; a new initial object while open must not wipe typing.
  const initialRef = useRef({ initial, defaultPortions });
  initialRef.current = { initial, defaultPortions };
  useEffect(() => {
    if (!open) return;
    const init = initialRef.current;
    setName(init.initial.name ?? "");
    setCategory(init.initial.category || FALLBACK_CATEGORY);
    setPortions(init.defaultPortions);
    setBusy(false);
  }, [open]);

  const trimmed = name.trim();
  const duplicate = trimmed ? existing.find((r) => r.name.trim().toLowerCase() === trimmed.toLowerCase()) : undefined;
  const categoryOptions = (categories.includes(category) ? categories : [...categories, category]).map((c) => ({ value: c, label: c }));

  const submit = async (e?: FormEvent, portionsOverride?: number) => {
    e?.preventDefault();
    const base = Math.max(1, Math.round(portionsOverride ?? portions));
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const recipe = await api.recipes.create({
        name: trimmed,
        category,
        type: category,
        portions: base,
        portionWeight: 150,
        techniques: [],
        ingredients: [],
        photos: [],
      });
      await onCreated(recipe);
      onClose();
    } catch (err) {
      toast({ title: "Erreur lors de la création de la recette", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      setBusy(false);
    }
  };

  // NumericInput swallows Enter, so the portions field submits from its wrapper.
  const onPortionsKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter") return;
    const raw = (e.target as HTMLInputElement).value?.replace(",", ".");
    const parsed = parseFloat(raw);
    void submit(undefined, Number.isFinite(parsed) ? parsed : undefined);
  };

  const useExisting = async () => {
    if (!duplicate || !onUseExisting) return;
    await onUseExisting(duplicate.recipeId);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Nouvelle recette"
      footer={
        <>
          <Button variant="default" onClick={onClose}>Annuler</Button>
          <Button variant="primary" type="submit" form="new-recipe-form" disabled={!trimmed || busy}>
            {duplicate ? "Créer quand même" : "Créer et ajouter"}
          </Button>
        </>
      }
    >
      <form id="new-recipe-form" onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <FieldLabel htmlFor="new-recipe-name">Nom</FieldLabel>
          <input id="new-recipe-name" className="input-field" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Catégorie</FieldLabel>
          <SelectPill value={category} options={categoryOptions} onChange={setCategory} colour="gray" aria-label="Catégorie" />
        </div>
        <div onKeyDown={onPortionsKeyDown}>
          <FieldLabel htmlFor="new-recipe-portions">Portions de base</FieldLabel>
          <NumericInput id="new-recipe-portions" className="input-field w-24" value={portions} onChange={setPortions} min={1} />
          <p className="mt-1 text-caption text-muted-foreground">Le nombre de portions que la recette de base produit.</p>
        </div>
        <p className="text-caption text-muted-foreground">Les ingrédients et les étapes se complètent plus tard depuis la fiche.</p>
        {duplicate && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm">
            <span>Une recette « {duplicate.name} » existe déjà</span>
            {onUseExisting && (
              <span className="inline-flex items-center gap-x-2 whitespace-nowrap">
                <span className="text-muted-foreground" aria-hidden="true">·</span>
                <button type="button" onClick={useExisting} className="text-primary hover:underline touch:min-h-11">L'ajouter</button>
              </span>
            )}
          </p>
        )}
      </form>
    </Dialog>
  );
}
