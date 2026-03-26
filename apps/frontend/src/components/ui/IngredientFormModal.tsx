import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Ingredient } from "@packages/types";
import { UNITS_PRICE } from "@packages/types";
import NumericInput from "@/components/ui/NumericInput";
import SearchSelect from "@/components/ui/SearchSelect";

interface IngredientFormModalProps {
  ingredient: Partial<Ingredient>;
  supplierNames: string[];
  onSave: (data: Partial<Ingredient>) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export default function IngredientFormModal({ ingredient, supplierNames, onSave, onCancel, onDelete }: IngredientFormModalProps) {
  const [form, setForm] = useState({ ...ingredient });
  const [localSuppliers, setLocalSuppliers] = useState(supplierNames);
  const u = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const supplierOptions = localSuppliers.map((s) => ({ value: s, label: s }));

  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-card rounded-2xl p-7 max-w-lg w-[92%] max-h-[90vh] overflow-auto shadow-xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-serif text-xl font-bold mb-4">{ingredient.ingredientId ? "Modifier l'ingrédient" : "Nouvel ingrédient"}</h2>
        <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">Nom</label>
        <input className="w-full px-3 py-2 border rounded-lg text-sm bg-muted/30 focus:border-primary outline-none" value={form.name || ""} onChange={(e) => u("name", e.target.value)} autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">Prix HTVA</label>
            <NumericInput className="w-full px-3 py-2 border rounded-lg text-sm bg-muted/30 focus:border-primary outline-none" value={form.price ?? 0} onChange={(v) => u("price", v)} />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">Unité</label>
            <select className="w-full px-3 py-2 border rounded-lg text-sm bg-muted/30 focus:border-primary outline-none" value={form.unit || "€/kg"} onChange={(e) => u("unit", e.target.value)}>
              {UNITS_PRICE.map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">Fournisseur</label>
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
        <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">Commentaire</label>
        <textarea className="w-full px-3 py-2 border rounded-lg text-sm bg-muted/30 focus:border-primary outline-none min-h-[60px]" value={form.comment || ""} onChange={(e) => u("comment", e.target.value)} />
        <div className="flex justify-between mt-6">
          <div>{onDelete && <button onClick={onDelete} className="flex items-center gap-1 px-3 py-2 border border-destructive/40 text-destructive rounded-lg text-sm font-medium"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>}</div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-4 py-2 border rounded-lg text-sm font-medium">Annuler</button>
            <button onClick={() => onSave(form)} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium shadow-sm">Enregistrer</button>
          </div>
        </div>
      </div>
    </div>
  );
}
