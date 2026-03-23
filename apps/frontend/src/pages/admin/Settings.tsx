import { useState, useEffect } from "react";
import { Plus, X, GripVertical, Save } from "lucide-react";
import type { AppSettings, SettingsSupplier } from "@packages/types";
import { DEFAULT_RECIPE_CATEGORIES, DEFAULT_SUPPLIERS } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const [categories, setCategories] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<SettingsSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "category" | "supplier"; index: number } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    api.settings.get()
      .then((s: AppSettings) => {
        setCategories(s.recipeCategories?.length ? s.recipeCategories : DEFAULT_RECIPE_CATEGORIES);
        setSuppliers(s.suppliers?.length ? s.suppliers : DEFAULT_SUPPLIERS);
      })
      .catch(() => {
        setCategories(DEFAULT_RECIPE_CATEGORIES);
        setSuppliers(DEFAULT_SUPPLIERS);
      })
      .finally(() => setLoading(false));
  }, []);

  const markDirty = () => setDirty(true);

  const addCategory = () => { setCategories([...categories, ""]); markDirty(); };
  const updateCategory = (i: number, value: string) => { const next = [...categories]; next[i] = value; setCategories(next); markDirty(); };
  const removeCategory = (i: number) => { setCategories(categories.filter((_, idx) => idx !== i)); markDirty(); };
  const moveCategory = (from: number, to: number) => {
    if (to < 0 || to >= categories.length) return;
    const next = [...categories];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setCategories(next);
    markDirty();
  };

  const addSupplier = () => { setSuppliers([...suppliers, { name: "" }]); markDirty(); };
  const updateSupplier = (i: number, field: keyof SettingsSupplier, value: string) => {
    const next = [...suppliers];
    next[i] = { ...next[i], [field]: value };
    setSuppliers(next);
    markDirty();
  };
  const removeSupplier = (i: number) => { setSuppliers(suppliers.filter((_, idx) => idx !== i)); markDirty(); };

  const handleSave = async () => {
    const filteredCats = categories.map((c) => c.trim()).filter(Boolean);
    const filteredSuppliers = suppliers.filter((s) => s.name.trim());
    if (filteredCats.length === 0) {
      toast({ title: "Au moins une catégorie est requise", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const updated = await api.settings.update({ recipeCategories: filteredCats, suppliers: filteredSuppliers });
      setCategories(updated.recipeCategories);
      setSuppliers(updated.suppliers || []);
      setDirty(false);
      toast({ title: "Paramètres sauvegardés" });
    } catch (e) {
      toast({ title: (e as Error).message || "Erreur", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  return (
    <div className="max-w-[700px] mx-auto">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Paramètres</h1>
          <p className="text-sm text-muted-foreground mt-1">Configuration de l'application</p>
        </div>
        {dirty && (
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium shadow-sm disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? "Sauvegarde…" : "Enregistrer"}
          </button>
        )}
      </div>

      <div className="grid gap-5">
        <section className="card-elevated p-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="font-serif text-lg font-bold">Catégories de recettes</h2>
              <p className="text-xs text-muted-foreground mt-1">Définissez les types de recettes disponibles</p>
            </div>
            <button onClick={addCategory} className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium hover:bg-muted transition-colors">
              <Plus className="h-3.5 w-3.5" /> Ajouter
            </button>
          </div>
          <div className="space-y-2">
            {categories.map((cat, i) => (
              <div key={i} className="flex items-center gap-2 group">
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveCategory(i, i - 1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                    <GripVertical className="h-4 w-4" />
                  </button>
                </div>
                <span className="w-6 text-center text-xs text-muted-foreground font-mono">{i + 1}</span>
                <input
                  className="flex-1 px-3 py-2 border rounded-lg text-sm bg-muted/30 focus:border-primary outline-none"
                  value={cat}
                  onChange={(e) => updateCategory(i, e.target.value)}
                  placeholder="Nom de la catégorie…"
                />
                <button
                  onClick={() => setDeleteConfirm({ type: "category", index: i })}
                  disabled={categories.length <= 1}
                  className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-20"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="card-elevated p-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="font-serif text-lg font-bold">Fournisseurs</h2>
              <p className="text-xs text-muted-foreground mt-1">Gérez vos fournisseurs d'ingrédients</p>
            </div>
            <button onClick={addSupplier} className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium hover:bg-muted transition-colors">
              <Plus className="h-3.5 w-3.5" /> Ajouter
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-border">
                <th className="px-2 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Nom</th>
                <th className="px-2 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Adresse</th>
                <th className="px-2 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Téléphone</th>
                <th className="px-2 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="px-2 py-1.5">
                    <input
                      className="w-full px-2 py-1.5 border rounded-lg text-sm bg-muted/30 focus:border-primary outline-none"
                      value={s.name}
                      onChange={(e) => updateSupplier(i, "name", e.target.value)}
                      placeholder="Nom…"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className="w-full px-2 py-1.5 border rounded-lg text-sm bg-muted/30 focus:border-primary outline-none"
                      value={s.address || ""}
                      onChange={(e) => updateSupplier(i, "address", e.target.value)}
                      placeholder="Adresse…"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className="w-full px-2 py-1.5 border rounded-lg text-sm bg-muted/30 focus:border-primary outline-none"
                      value={s.phone || ""}
                      onChange={(e) => updateSupplier(i, "phone", e.target.value)}
                      placeholder="Téléphone…"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => setDeleteConfirm({ type: "supplier", index: i })}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr><td colSpan={4} className="px-2 py-6 text-center text-muted-foreground text-sm italic">Aucun fournisseur</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-card rounded-2xl p-7 max-w-sm w-[92%] shadow-xl animate-fade-up text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-lg font-bold mb-2">Confirmer la suppression</h3>
            <p className="text-muted-foreground text-sm mb-6">
              {deleteConfirm.type === "category"
                ? `Supprimer la catégorie « ${categories[deleteConfirm.index]} » ?`
                : `Supprimer le fournisseur « ${suppliers[deleteConfirm.index]?.name} » ?`}
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 border rounded-lg text-sm font-medium">Annuler</button>
              <button
                onClick={() => {
                  if (deleteConfirm.type === "category") removeCategory(deleteConfirm.index);
                  else removeSupplier(deleteConfirm.index);
                  setDeleteConfirm(null);
                }}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
