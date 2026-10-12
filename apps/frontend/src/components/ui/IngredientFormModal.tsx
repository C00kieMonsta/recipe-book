import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Ingredient } from "@packages/types";
import { UNITS_PRICE, normalizeIngredientName } from "@packages/types";
import NumericInput from "@/components/ui/NumericInput";
import SearchSelect from "@/components/ui/SearchSelect";
import FieldLabel from "@/components/ui/FieldLabel";

interface IngredientFormModalProps {
  ingredient: Partial<Ingredient>;
  supplierNames: string[];
  onSave: (data: Partial<Ingredient>) => void;
  onCancel: () => void;
  onDelete?: () => void;
  existing?: Ingredient[];
  onUseExisting?: (ingredient: Ingredient) => void;
}

export default function IngredientFormModal({ ingredient, supplierNames, onSave, onCancel, onDelete, existing, onUseExisting }: IngredientFormModalProps) {
  const [form, setForm] = useState({ ...ingredient });
  const [localSuppliers, setLocalSuppliers] = useState(supplierNames);
  const u = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const supplierOptions = localSuppliers.map((s) => ({ value: s, label: s }));
  const isCreate = !ingredient.ingredientId;

  const existingKeys = useMemo(
    () => (existing ?? []).map((e) => ({ ingredient: e, key: normalizeIngredientName(e.name) })),
    [existing],
  );

  const similar = useMemo(() => {
    if (!isCreate || !form.name?.trim()) return null;
    const key = normalizeIngredientName(form.name);
    if (!key) return null;
    return existingKeys.find((e) => e.key === key)?.ingredient ?? null;
  }, [isCreate, form.name, existingKeys]);

  return (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-card rounded-2xl p-7 max-w-lg w-[92%] max-h-[90vh] overflow-auto shadow-xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-h2 mb-4">{isCreate ? "Nouvel ingrédient" : "Modifier l'ingrédient"}</h2>

        <FieldLabel htmlFor="ingredient-name" className="mt-3">Nom</FieldLabel>
        <input id="ingredient-name" className="input-field" value={form.name || ""} onChange={(e) => u("name", e.target.value)} autoFocus />
        {similar && (
          <p className="mt-2 text-sm text-warning">
            Semblable à : <span className="font-medium">{similar.name}</span>
            {onUseExisting && (
              <>
                {" · "}
                <button type="button" onClick={() => onUseExisting(similar)} className="underline font-medium min-h-11 inline-flex items-center">Utiliser</button>
              </>
            )}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel htmlFor="ingredient-price" className="mt-3">Prix HTVA</FieldLabel>
            <NumericInput className="input-field" value={form.price ?? 0} onChange={(v) => u("price", v)} />
          </div>
          <div>
            <FieldLabel htmlFor="ingredient-unit" className="mt-3">Unité</FieldLabel>
            <select id="ingredient-unit" className="input-field" value={form.unit || "€/kg"} onChange={(e) => u("unit", e.target.value)}>
              {UNITS_PRICE.map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <FieldLabel className="mt-3">Fournisseur</FieldLabel>
        <SearchSelect
          options={supplierOptions}
          value={form.supplier || localSuppliers[0] || ""}
          onChange={(v) => u("supplier", v)}
          placeholder="Rechercher un fournisseur…"
          onCreateNew={(name) => {
            setLocalSuppliers((prev) => [...prev, name]);
            u("supplier", name);
          }}
        />

        <FieldLabel htmlFor="ingredient-comment" className="mt-3">Commentaire</FieldLabel>
        <textarea id="ingredient-comment" className="input-field min-h-[72px]" value={form.comment || ""} onChange={(e) => u("comment", e.target.value)} />

        <div className="flex justify-between mt-6 gap-2 flex-wrap">
          <div>
            {onDelete && (
              <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 min-h-11 px-3 border shadow-outline text-danger text-destructive rounded-lg text-sm font-medium">
                <Trash2 className="h-4 w-4" /> Supprimer
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="min-h-11 px-4 border rounded-lg text-sm font-medium">Annuler</button>
            <button type="button" onClick={() => onSave(form)} className="min-h-11 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium shadow-sm">Enregistrer</button>
          </div>
        </div>
      </div>
    </div>
  );
}
