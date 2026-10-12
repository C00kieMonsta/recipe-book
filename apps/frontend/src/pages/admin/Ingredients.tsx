import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { Search, Plus, Upload, ArrowUpDown, Check, FileSpreadsheet, ChevronRight, Copy } from "lucide-react";
import type { Ingredient } from "@packages/types";
import { DEFAULT_SUPPLIERS } from "@packages/types";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { fmt, supplierColor } from "@/lib/recipe-helpers";
import { usePagination } from "@/hooks/use-pagination";
import { PageHeader, Tag, ListRow, ActionMenu, Pagination, IngredientFormModal, SupplierTag } from "@/components/ui";
import Papa from "papaparse";
import * as XLSX from "xlsx";

type SortKey = "name" | "price" | "supplier";

export default function Ingredients() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [supplierNames, setSupplierNames] = useState<string[]>(DEFAULT_SUPPLIERS.map((s) => s.name));
  const [loading, setLoading] = useState(true);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [search, setSearch] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [editing, setEditing] = useState<Partial<Ingredient> | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    try {
      const [ings, settings] = await Promise.all([api.ingredients.list(), api.settings.get().catch(() => null)]);
      setIngredients(ings.sort((a, b) => a.name.localeCompare(b.name)));
      if (settings?.suppliers?.length) setSupplierNames(settings.suppliers.map((s) => s.name));
    }
    catch { toast({ title: "Erreur de chargement", variant: "destructive" }); }
    finally { setLoading(false); }
    api.ingredients.duplicates().then((r) => setDuplicateCount(r.groups.length)).catch(() => setDuplicateCount(0));
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

  const { page, totalPages, paginatedItems, setPage, next, prev, total } = usePagination(sorted, 25);

  const toggleSort = (col: SortKey) => {
    if (sortBy === col) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortBy(col); setSortDir(1); }
  };

  const saveIngredient = async (data: Partial<Ingredient>) => {
    try {
      if (data.ingredientId) await api.ingredients.update(data.ingredientId, data);
      else await api.ingredients.create(data);
      setEditing(null); load();
      toast({ title: data.ingredientId ? "Ingrédient modifié" : "Ingrédient créé" });
    } catch (e) { toast({ title: (e as Error).message || "Erreur lors de la sauvegarde", variant: "destructive" }); }
  };

  const deleteIngredient = async (id: string) => {
    try { await api.ingredients.delete(id); setDeleteConfirm(null); setEditing(null); load(); toast({ title: "Ingrédient supprimé" }); }
    catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const names = (e.body as { recipes?: string[] } | null)?.recipes ?? [];
        const shown = names.slice(0, 5).join(", ") + (names.length > 5 ? "…" : "");
        toast({ title: `Utilisé dans ${names.length} recette${names.length > 1 ? "s" : ""} : ${shown}`, variant: "destructive" });
      } else {
        toast({ title: (e as Error).message || "Erreur lors de la suppression", variant: "destructive" });
      }
    }
  };

  const exportExcel = () => {
    const rows = ingredients.map((i) => ({
      Nom: i.name, "Prix HTVA": i.price, Unité: i.unit, Fournisseur: i.supplier, Commentaire: i.comment || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ingrédients");
    XLSX.writeFile(wb, "ingredients.xlsx");
  };

  const newIngredient = () => setEditing({ name: "", price: 0, unit: "€/kg", supplier: supplierNames[0] || "", comment: "" });
  const updatedLabel = (ing: Ingredient) => (ing.updatedAt ? new Date(ing.updatedAt).toLocaleDateString("fr-BE") : "");

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  return (
    <div className="max-w-wide mx-auto">
      <PageHeader
        title="Ingrédients"
        meta={`${ingredients.length} ingrédients référencés`}
        actions={
          <>
            <button onClick={newIngredient} className="inline-flex items-center gap-1.5 min-h-11 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium shadow-sm hover:opacity-90 transition-opacity">
              <Plus className="h-4 w-4" /> Nouvel ingrédient
            </button>
            <ActionMenu items={[
              { label: "Exporter Excel", icon: <FileSpreadsheet className="h-4 w-4" />, onClick: exportExcel },
              { label: "Importer CSV", icon: <Upload className="h-4 w-4" />, onClick: () => setShowImport(true) },
            ]} />
          </>
        }
      />

      {duplicateCount > 0 && (
        <Link to="/ingredients/doublons" className="mb-6 flex items-center gap-3 rounded-lg bg-warning-soft px-4 py-3 text-base text-foreground hover:opacity-90">
          <Copy className="h-5 w-5 text-warning shrink-0" />
          <span className="flex-1">
            {duplicateCount} doublon{duplicateCount > 1 ? "s" : ""} probable{duplicateCount > 1 ? "s" : ""} · <span className="font-medium underline">Fusionner</span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>
      )}

      <div className="flex gap-4 mb-6 flex-wrap items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input className="input-field pl-9" placeholder="Rechercher un ingrédient…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <FilterChip active={filterSupplier === "all"} onClick={() => { setFilterSupplier("all"); setPage(1); }}>Tous</FilterChip>
          {suppliers.map((s) => (
            <FilterChip key={s} active={filterSupplier === s} onClick={() => { setFilterSupplier(s); setPage(1); }} color={supplierColor(s)}>{s}</FilterChip>
          ))}
        </div>
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="table">
          <thead>
            <tr className="border-b border-border">
              <Th onClick={() => toggleSort("name")} active={sortBy === "name"} dir={sortDir}>Ingrédient</Th>
              <Th onClick={() => toggleSort("price")} active={sortBy === "price"} dir={sortDir} className="text-right">Prix HTVA</Th>
              <th className="text-sm font-medium text-muted-foreground">Unité</th>
              <Th onClick={() => toggleSort("supplier")} active={sortBy === "supplier"} dir={sortDir}>Fournisseur</Th>
              <th className="text-sm font-medium text-muted-foreground">Commentaire</th>
              <th className="text-sm font-medium text-muted-foreground">Maj</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.map((ing) => (
              <tr key={ing.ingredientId} onClick={() => setEditing(ing)} className="border-b border-border/50 hover:bg-hover cursor-pointer transition-colors">
                <td className="text-base font-medium">{ing.name}</td>
                <td className="text-right">{fmt(ing.price)}</td>
                <td>{ing.unit}</td>
                <td><SupplierTag name={ing.supplier} /></td>
                <td className="text-muted-foreground">{ing.comment}</td>
                <td className="text-muted-foreground whitespace-nowrap">{updatedLabel(ing)}</td>
              </tr>
            ))}
            {paginatedItems.length === 0 && (
              <tr><td colSpan={6} className="text-muted-foreground">Aucun ingrédient.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden divide-y divide-border/50">
        {paginatedItems.map((ing) => (
          <ListRow
            key={ing.ingredientId}
            title={ing.name}
            subtitle={`${fmt(ing.price)} · ${ing.unit} · ${ing.supplier || "Sans fournisseur"}`}
            trailing={<ChevronRight className="h-5 w-5 text-muted-foreground" />}
            onClick={() => setEditing(ing)}
          />
        ))}
        {paginatedItems.length === 0 && <p className="py-3 text-muted-foreground">Aucun ingrédient.</p>}
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} onPrev={prev} onNext={next} />

      {editing && (
        <IngredientFormModal
          key={editing.ingredientId ?? "new"}
          ingredient={editing}
          supplierNames={supplierNames}
          existing={editing.ingredientId ? undefined : ingredients}
          onUseExisting={(ing) => setEditing(ing)}
          onSave={saveIngredient}
          onCancel={() => setEditing(null)}
          onDelete={editing.ingredientId ? () => setDeleteConfirm(editing.ingredientId!) : undefined}
        />
      )}

      {deleteConfirm && (
        <Modal onClose={() => setDeleteConfirm(null)}>
          <div className="text-center py-2">
            <h3 className="font-serif text-h3 mb-2">Confirmer la suppression</h3>
            <p className="text-muted-foreground text-base mb-6">Cette action est irréversible.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteConfirm(null)} className="min-h-11 px-4 border rounded-lg text-sm font-medium">Annuler</button>
              <button onClick={() => deleteIngredient(deleteConfirm)} className="min-h-11 px-4 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium">Supprimer</button>
            </div>
          </div>
        </Modal>
      )}

      {showImport && (
        <Modal onClose={() => setShowImport(false)}>
          <CsvImport existingIngredients={ingredients} onImport={async (rows) => {
            try { const result = await api.ingredients.import(rows); setShowImport(false); load(); toast({ title: `Import terminé · ${result.created} créés, ${result.updated} mis à jour` }); }
            catch (e) { toast({ title: (e as Error).message || "Erreur lors de l'import", variant: "destructive" }); }
          }} onCancel={() => setShowImport(false)} />
        </Modal>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`min-h-10 px-3 rounded-full text-sm font-medium border transition-colors ${active ? "bg-foreground text-background border-foreground" : "bg-card hover:bg-hover"}`}
      style={!active && color ? { borderLeftColor: color, borderLeftWidth: 3 } : undefined}
    >
      {children}
    </button>
  );
}

function Th({ children, onClick, active, dir, className = "" }: { children: React.ReactNode; onClick: () => void; active: boolean; dir: number; className?: string }) {
  return (
    <th onClick={onClick} aria-sort={active ? (dir === 1 ? "ascending" : "descending") : "none"} className={`text-sm font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground ${className}`}>
      <span className="inline-flex items-center gap-1">{children}{active && <ArrowUpDown className="h-3.5 w-3.5" />}</span>
    </th>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-2xl p-7 max-w-lg w-[92%] max-h-[90vh] overflow-auto shadow-xl animate-fade-up" onClick={(e) => e.stopPropagation()}>{children}</div>
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
        } else { processResults(results.data as Record<string, string>[]); }
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
    setParsed(rows); setStep("preview");
  };

  const newCount = parsed.filter((r) => r._status === "new").length;
  const updateCount = parsed.filter((r) => r._status === "update").length;

  return (
    <div className="sm:min-w-[480px]">
      <h2 className="font-serif text-h2 mb-1">Importer des ingrédients</h2>
      <p className="text-sm text-muted-foreground mb-5">Format CSV : <code className="bg-muted px-1.5 py-0.5 rounded text-caption">nom ; prix_htva ; unite ; fournisseur ; commentaire</code></p>
      {step === "upload" && (
        <>
          <div className="flex flex-col items-center justify-center gap-2 p-10 border-2 border-dashed rounded-xl cursor-pointer text-muted-foreground hover:border-primary/40 transition-colors" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }} onClick={() => fileRef.current?.click()}>
            <Upload className="h-8 w-8" /><span className="text-base font-medium">Glisser-déposer votre fichier CSV</span><span className="text-sm">ou cliquer pour parcourir</span>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          <div className="flex justify-end mt-5"><button onClick={onCancel} className="min-h-11 px-4 border rounded-lg text-sm font-medium">Annuler</button></div>
        </>
      )}
      {step === "preview" && (
        <>
          <div className="flex justify-between items-center gap-2 flex-wrap px-4 py-2.5 bg-muted rounded-lg mb-4">
            <span className="font-medium text-sm">{fileName}</span>
            <div className="flex gap-2">
              <Tag variant="success">{newCount} nouveaux</Tag>
              <Tag variant="info">{updateCount} mises à jour</Tag>
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto border rounded-lg">
            <table className="table">
              <thead>
                <tr className="border-b">
                  <th className="text-sm font-medium text-muted-foreground">Statut</th>
                  <th className="text-sm font-medium text-muted-foreground">Nom</th>
                  <th className="text-sm font-medium text-muted-foreground text-right">Prix</th>
                  <th className="text-sm font-medium text-muted-foreground">Fournisseur</th>
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 50).map((row, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td><Tag variant={row._status === "new" ? "success" : "info"}>{row._status === "new" ? "Nouveau" : "Maj"}</Tag></td>
                    <td className="font-medium">{row.nom as string}</td>
                    <td className="text-right">{fmt(row.prix_htva as number)}</td>
                    <td>{row.fournisseur as string}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between mt-5 gap-2 flex-wrap">
            <button onClick={() => setStep("upload")} className="min-h-11 px-4 border rounded-lg text-sm font-medium">Changer de fichier</button>
            <div className="flex gap-2">
              <button onClick={onCancel} disabled={importing} className="min-h-11 px-4 border rounded-lg text-sm font-medium disabled:opacity-50">Annuler</button>
              <button onClick={async () => { setImporting(true); await onImport(parsed); setImporting(false); }} disabled={importing} className="inline-flex items-center gap-2 min-h-11 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium shadow-sm disabled:opacity-60">
                <Check className="h-4 w-4" />{importing ? "Import en cours…" : `Importer ${parsed.length} ingrédients`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
