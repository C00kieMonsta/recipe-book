import { useState, useEffect, useMemo, useRef } from "react";
import { Search, Plus, Upload, Pencil, Trash2, ArrowUpDown, X, Download, AlertTriangle, Check } from "lucide-react";
import type { Ingredient } from "@packages/types";
import { SUPPLIERS, UNITS_PRICE } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { fmt, supplierColor } from "@/lib/recipe-helpers";
import Papa from "papaparse";

type SortKey = "name" | "price" | "supplier";

export default function Ingredients() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [editing, setEditing] = useState<Partial<Ingredient> | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showDedup, setShowDedup] = useState(false);
  const [deduping, setDeduping] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    try {
      const data = await api.ingredients.list();
      setIngredients(data);
    } catch (e) {
      toast({ title: "Erreur de chargement", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const suppliers = useMemo(() => [...new Set(ingredients.map((i) => i.supplier).filter(Boolean))], [ingredients]);

  const sorted = useMemo(() => {
    let arr = [...ingredients];
    if (search) arr = arr.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
    if (filterSupplier !== "all") arr = arr.filter((i) => i.supplier === filterSupplier);
    arr.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name) * sortDir;
      if (sortBy === "price") return (a.price - b.price) * sortDir;
      if (sortBy === "supplier") return (a.supplier || "").localeCompare(b.supplier || "") * sortDir;
      return 0;
    });
    return arr;
  }, [ingredients, search, sortBy, sortDir, filterSupplier]);

  const toggleSort = (col: SortKey) => {
    if (sortBy === col) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortBy(col); setSortDir(1); }
  };

  const saveIngredient = async (data: Partial<Ingredient>) => {
    try {
      if (data.ingredientId) {
        await api.ingredients.update(data.ingredientId, data);
      } else {
        await api.ingredients.create(data);
      }
      setEditing(null);
      load();
      toast({ title: data.ingredientId ? "Ingrédient modifié" : "Ingrédient créé" });
    } catch (e) {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    }
  };

  const deleteIngredient = async (id: string) => {
    try {
      await api.ingredients.delete(id);
      setDeleteConfirm(null);
      setEditing(null);
      load();
      toast({ title: "Ingrédient supprimé" });
    } catch (e) {
      toast({ title: "Erreur lors de la suppression", variant: "destructive" });
    }
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ingrédients</h1>
          <p className="text-sm text-muted-foreground mt-1">{ingredients.length} ingrédients référencés</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowDedup(true)} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-muted transition-colors text-destructive border-destructive/30">
            Dédoublonner
          </button>
          <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-muted transition-colors">
            <Upload className="h-4 w-4" /> Importer CSV
          </button>
          <button onClick={() => setEditing({ name: "", price: 0, unit: "€/kg", supplier: "Barn", comment: "" })} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium shadow-sm hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" /> Nouvel ingrédient
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-6 flex-wrap items-center">
        <div className="flex items-center gap-2 px-3 py-2 bg-card border rounded-lg flex-1 max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input className="flex-1 bg-transparent outline-none text-sm" placeholder="Rechercher un ingrédient…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setFilterSupplier("all")} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filterSupplier === "all" ? "bg-foreground text-background border-foreground" : "bg-card hover:bg-muted"}`}>Tous</button>
          {suppliers.map((s) => (
            <button key={s} onClick={() => setFilterSupplier(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filterSupplier === s ? "bg-foreground text-background border-foreground" : "bg-card hover:bg-muted"}`} style={filterSupplier !== s ? { borderLeftColor: supplierColor(s), borderLeftWidth: 3 } : {}}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto card-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-border">
              <Th onClick={() => toggleSort("name")} active={sortBy === "name"} dir={sortDir}>Ingrédient</Th>
              <Th onClick={() => toggleSort("price")} active={sortBy === "price"} dir={sortDir} className="text-right">Prix HTVA</Th>
              <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Unité</th>
              <Th onClick={() => toggleSort("supplier")} active={sortBy === "supplier"} dir={sortDir}>Fournisseur</Th>
              <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Commentaire</th>
              <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Maj</th>
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((ing) => (
              <tr key={ing.ingredientId} onClick={() => setEditing(ing)} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors">
                <td className="px-3 py-2.5 font-semibold">{ing.name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(ing.price)}</td>
                <td className="px-3 py-2.5">{ing.unit}</td>
                <td className="px-3 py-2.5">
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border" style={{ color: supplierColor(ing.supplier), borderColor: supplierColor(ing.supplier) + "55", background: supplierColor(ing.supplier) + "12" }}>
                    {ing.supplier}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground text-xs">{ing.comment}</td>
                <td className="px-3 py-2.5 text-muted-foreground text-xs">{ing.updatedAt ? new Date(ing.updatedAt).toLocaleDateString("fr-BE") : ""}</td>
                <td className="px-3 py-2.5">
                  <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(ing.ingredientId); }} className="p-1 rounded hover:bg-destructive/10 text-destructive/70 hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <IngredientForm ingredient={editing} onSave={saveIngredient} onCancel={() => setEditing(null)} onDelete={editing.ingredientId ? () => setDeleteConfirm(editing.ingredientId!) : undefined} />
        </Modal>
      )}

      {deleteConfirm && (
        <Modal onClose={() => setDeleteConfirm(null)}>
          <div className="text-center py-2">
            <h3 className="font-serif text-lg font-bold mb-2">Confirmer la suppression</h3>
            <p className="text-muted-foreground text-sm mb-6">Cette action est irréversible.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 border rounded-lg text-sm font-medium">Annuler</button>
              <button onClick={() => deleteIngredient(deleteConfirm)} className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium">Supprimer</button>
            </div>
          </div>
        </Modal>
      )}

      {showDedup && (
        <Modal onClose={() => !deduping && setShowDedup(false)}>
          <div className="text-center py-2">
            <h3 className="font-serif text-lg font-bold mb-2">Supprimer les doublons</h3>
            <p className="text-muted-foreground text-sm mb-6">
              Les ingrédients portant le même nom seront fusionnés.<br />
              Seule la version la plus récente est conservée.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setShowDedup(false)} disabled={deduping} className="px-4 py-2 border rounded-lg text-sm font-medium disabled:opacity-50">Annuler</button>
              <button
                disabled={deduping}
                onClick={async () => {
                  setDeduping(true);
                  try {
                    const { removed } = await api.ingredients.deduplicate();
                    setShowDedup(false);
                    load();
                    toast({ title: removed > 0 ? `${removed} doublon${removed > 1 ? "s" : ""} supprimé${removed > 1 ? "s" : ""}` : "Aucun doublon trouvé" });
                  } catch (e) {
                    toast({ title: (e as Error).message || "Erreur", variant: "destructive" });
                  } finally {
                    setDeduping(false);
                  }
                }}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium disabled:opacity-60"
              >
                {deduping ? "Suppression…" : "Dédoublonner"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showImport && (
        <Modal onClose={() => setShowImport(false)}>
          <CsvImport
            existingIngredients={ingredients}
            onImport={async (rows) => {
              try {
                const result = await api.ingredients.import(rows);
                setShowImport(false);
                load();
                toast({ title: `Import terminé — ${result.created} créés, ${result.updated} mis à jour` });
              } catch (e) {
                toast({ title: (e as Error).message || "Erreur lors de l'import", variant: "destructive" });
              }
            }}
            onCancel={() => setShowImport(false)}
          />
        </Modal>
      )}
    </div>
  );
}

function Th({ children, onClick, active, dir, className = "" }: { children: React.ReactNode; onClick: () => void; active: boolean; dir: number; className?: string }) {
  return (
    <th onClick={onClick} className={`px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground ${className}`}>
      <span className="inline-flex items-center gap-1">
        {children}
        {active && <ArrowUpDown className="h-3 w-3" />}
      </span>
    </th>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-2xl p-7 max-w-lg w-[92%] max-h-[90vh] overflow-auto shadow-xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function IngredientForm({ ingredient, onSave, onCancel, onDelete }: { ingredient: Partial<Ingredient>; onSave: (d: Partial<Ingredient>) => void; onCancel: () => void; onDelete?: () => void }) {
  const [form, setForm] = useState({ ...ingredient });
  const u = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div>
      <h2 className="font-serif text-xl font-bold mb-4">{ingredient.ingredientId ? "Modifier l'ingrédient" : "Nouvel ingrédient"}</h2>
      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">Nom</label>
      <input className="w-full px-3 py-2 border rounded-lg text-sm bg-muted/30 focus:border-primary outline-none" value={form.name || ""} onChange={(e) => u("name", e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">Prix HTVA</label>
          <input className="w-full px-3 py-2 border rounded-lg text-sm bg-muted/30 focus:border-primary outline-none" type="number" step="0.01" value={form.price ?? 0} onChange={(e) => u("price", +e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">Unité</label>
          <select className="w-full px-3 py-2 border rounded-lg text-sm bg-muted/30 focus:border-primary outline-none" value={form.unit || "€/kg"} onChange={(e) => u("unit", e.target.value)}>
            {UNITS_PRICE.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">Fournisseur</label>
      <select className="w-full px-3 py-2 border rounded-lg text-sm bg-muted/30 focus:border-primary outline-none" value={form.supplier || "Barn"} onChange={(e) => u("supplier", e.target.value)}>
        {SUPPLIERS.map((s) => <option key={s}>{s}</option>)}
      </select>
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
  );
}

function CsvImport({ existingIngredients, onImport, onCancel }: { existingIngredients: Ingredient[]; onImport: (rows: unknown[]) => Promise<void>; onCancel: () => void }) {
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [parsed, setParsed] = useState<Array<Record<string, unknown>>>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseNum = (v: unknown) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? 0 : n; };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    Papa.parse(file, {
      header: true, delimiter: ";", skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length > 0 && Object.keys(results.data[0] as object).length <= 1) {
          Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r2) => processResults(r2.data as Record<string, string>[]) });
        } else {
          processResults(results.data as Record<string, string>[]);
        }
      },
    });
  };

  const processResults = (data: Record<string, string>[]) => {
    const rows = data.map((row) => {
      const name = (row.nom || row.name || row.Nom || "").trim();
      const price = parseNum(row.prix_htva || row.price || row.prix || 0);
      const unit = (row.unite || row.unit || "€/kg").trim();
      const supplier = (row.fournisseur || row.supplier || "").trim();
      const comment = (row.commentaire || row.comment || "").trim();
      const existing = existingIngredients.find((e) => e.name.toLowerCase() === name.toLowerCase());
      return { nom: name, prix_htva: price, unite: unit, fournisseur: supplier, commentaire: comment, _status: existing ? "update" : "new" };
    }).filter((r) => r.nom);
    setParsed(rows);
    setStep("preview");
  };

  const newCount = parsed.filter((r) => r._status === "new").length;
  const updateCount = parsed.filter((r) => r._status === "update").length;

  return (
    <div className="min-w-[480px]">
      <h2 className="font-serif text-xl font-bold mb-1">Importer des ingrédients</h2>
      <p className="text-xs text-muted-foreground mb-5">Format CSV : <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">nom ; prix_htva ; unite ; fournisseur ; commentaire</code></p>

      {step === "upload" && (
        <>
          <div className="flex flex-col items-center justify-center gap-2 p-10 border-2 border-dashed rounded-xl cursor-pointer text-muted-foreground hover:border-primary/40 transition-colors" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }} onClick={() => fileRef.current?.click()}>
            <Upload className="h-8 w-8" />
            <span className="text-sm font-medium">Glisser-déposer votre fichier CSV</span>
            <span className="text-xs">ou cliquer pour parcourir</span>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          <div className="flex justify-end mt-5"><button onClick={onCancel} className="px-4 py-2 border rounded-lg text-sm font-medium">Annuler</button></div>
        </>
      )}

      {step === "preview" && (
        <>
          <div className="flex justify-between items-center px-4 py-2.5 bg-muted rounded-lg mb-4">
            <span className="font-semibold text-sm">{fileName}</span>
            <div className="flex gap-2">
              <span className="px-2.5 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">{newCount} nouveaux</span>
              <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">{updateCount} mises à jour</span>
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead><tr className="border-b">
                <th className="px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Statut</th>
                <th className="px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Nom</th>
                <th className="px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Prix</th>
                <th className="px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Fournisseur</th>
              </tr></thead>
              <tbody>
                {parsed.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="px-3 py-1.5"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${row._status === "new" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{row._status === "new" ? "Nouveau" : "Maj"}</span></td>
                    <td className="px-3 py-1.5 font-semibold">{row.nom as string}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(row.prix_htva as number)}</td>
                    <td className="px-3 py-1.5">{row.fournisseur as string}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between mt-5">
            <button onClick={() => setStep("upload")} className="px-4 py-2 border rounded-lg text-sm font-medium">Changer de fichier</button>
            <div className="flex gap-2">
              <button onClick={onCancel} disabled={importing} className="px-4 py-2 border rounded-lg text-sm font-medium disabled:opacity-50">Annuler</button>
              <button
                onClick={async () => { setImporting(true); await onImport(parsed); setImporting(false); }}
                disabled={importing}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium shadow-sm disabled:opacity-60"
              >
                <Check className="h-4 w-4" />
                {importing ? `Import en cours…` : `Importer ${parsed.length} ingrédients`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
