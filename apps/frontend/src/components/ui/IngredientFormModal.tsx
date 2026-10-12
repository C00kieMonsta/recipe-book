import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Ingredient } from "@packages/types";
import { UNITS_PRICE, normalizeIngredientName } from "@packages/types";
import NumericInput from "./NumericInput";
import SearchSelect from "./SearchSelect";
import FieldLabel from "./FieldLabel";
import Button from "./Button";
import Dialog from "./Dialog";

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

  const footer = (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <div>
        {onDelete && (
          <Button variant="danger" size="md" onClick={onDelete} icon={<Trash2 />}>Supprimer</Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="default" size="md" onClick={onCancel}>Annuler</Button>
        <Button variant="primary" size="md" onClick={() => onSave(form)}>Enregistrer</Button>
      </div>
    </div>
  );

  return (
    <Dialog open onClose={onCancel} size="md" title={isCreate ? "Nouvel ingrédient" : "Modifier l'ingrédient"} footer={footer}>
      <FieldLabel htmlFor="ingredient-name">Nom</FieldLabel>
      <input id="ingredient-name" className="input-field" value={form.name || ""} onChange={(e) => u("name", e.target.value)} autoFocus />
      {similar && (
        <p className="mt-2 text-sm text-warning">
          Semblable à : <span className="font-medium">{similar.name}</span>
          {onUseExisting && (
            <>
              {" · "}
              <button type="button" onClick={() => onUseExisting(similar)} className="font-medium text-primary underline underline-offset-2">Utiliser</button>
            </>
          )}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel htmlFor="ingredient-price" className="mt-3">Prix HTVA</FieldLabel>
          <NumericInput id="ingredient-price" className="input-field" value={form.price ?? 0} onChange={(v) => u("price", v)} />
        </div>
        <div>
          <FieldLabel htmlFor="ingredient-unit" className="mt-3">Unité</FieldLabel>
          <select id="ingredient-unit" className="input-field" value={form.unit || "€/kg"} onChange={(e) => u("unit", e.target.value)}>
            {UNITS_PRICE.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
      </div>

      <FieldLabel htmlFor="ingredient-supplier" className="mt-3">Fournisseur</FieldLabel>
      <SearchSelect
        id="ingredient-supplier"
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
      <textarea id="ingredient-comment" className="input-field" value={form.comment || ""} onChange={(e) => u("comment", e.target.value)} />
    </Dialog>
  );
}
