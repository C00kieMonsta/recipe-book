import { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import type { Ingredient } from "@packages/types";
import { UNITS_PRICE } from "@packages/types";
import NumericInput from "@/components/ui/NumericInput";

interface IngredientFormModalProps {
  ingredient: Partial<Ingredient>;
  supplierNames: string[];
  onSave: (data: Partial<Ingredient>) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export default function IngredientFormModal({ ingredient, supplierNames, onSave, onCancel, onDelete }: IngredientFormModalProps) {
  const [form, setForm] = useState({ ...ingredient });
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState("");
  const [localSuppliers, setLocalSuppliers] = useState(supplierNames);
  const u = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const handleAddSupplier = () => {
    const trimmed = newSupplier.trim();
    if (!trimmed || localSuppliers.includes(trimmed)) return;
    setLocalSuppliers((prev) => [...prev, trimmed]);
    u("supplier", trimmed);
    setNewSupplier("");
    setAddingSupplier(false);
  };

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
        {addingSupplier ? (
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 border rounded-lg text-sm bg-muted/30 focus:border-primary outline-none"
              value={newSupplier}
              onChange={(e) => setNewSupplier(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddSupplier(); } if (e.key === "Escape") setAddingSupplier(false); }}
              placeholder="Nom du fournisseur…"
              autoFocus
            />
            <button onClick={handleAddSupplier} disabled={!newSupplier.trim()} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50">OK</button>
            <button onClick={() => setAddingSupplier(false)} className="px-3 py-2 border rounded-lg text-sm font-medium">Annuler</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <select className="flex-1 px-3 py-2 border rounded-lg text-sm bg-muted/30 focus:border-primary outline-none" value={form.supplier || localSuppliers[0] || ""} onChange={(e) => u("supplier", e.target.value)}>
              {localSuppliers.map((s) => <option key={s}>{s}</option>)}
            </select>
            <button onClick={() => setAddingSupplier(true)} className="flex items-center gap-1 px-2.5 py-2 border rounded-lg text-xs font-medium hover:bg-muted transition-colors shrink-0" title="Nouveau fournisseur">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
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
