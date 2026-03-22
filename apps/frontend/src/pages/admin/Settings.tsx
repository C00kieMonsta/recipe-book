import { useState, useEffect } from "react";
import { Plus, X, GripVertical, Save } from "lucide-react";
import type { AppSettings } from "@packages/types";
import { DEFAULT_RECIPE_CATEGORIES } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    api.settings.get()
      .then((s) => {
        setSettings(s);
        setCategories(s.recipeCategories?.length ? s.recipeCategories : DEFAULT_RECIPE_CATEGORIES);
      })
      .catch(() => {
        setCategories(DEFAULT_RECIPE_CATEGORIES);
      })
      .finally(() => setLoading(false));
  }, []);

  const addCategory = () => {
    setCategories([...categories, ""]);
    setDirty(true);
  };

  const updateCategory = (i: number, value: string) => {
    const next = [...categories];
    next[i] = value;
    setCategories(next);
    setDirty(true);
  };

  const removeCategory = (i: number) => {
    setCategories(categories.filter((_, idx) => idx !== i));
    setDirty(true);
  };

  const moveCategory = (from: number, to: number) => {
    if (to < 0 || to >= categories.length) return;
    const next = [...categories];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setCategories(next);
    setDirty(true);
  };

  const handleSave = async () => {
    const filtered = categories.map((c) => c.trim()).filter(Boolean);
    if (filtered.length === 0) {
      toast({ title: "Au moins une catégorie est requise", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const updated = await api.settings.update({ recipeCategories: filtered });
      setSettings(updated);
      setCategories(updated.recipeCategories);
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
                onClick={() => removeCategory(i)}
                disabled={categories.length <= 1}
                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
