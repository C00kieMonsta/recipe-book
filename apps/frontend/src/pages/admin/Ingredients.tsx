import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Upload, Check, FileSpreadsheet, Copy, ArrowUpDown, X } from "lucide-react";
import type { Ingredient, Recipe } from "@packages/types";
import { DEFAULT_SUPPLIERS } from "@packages/types";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { fmt } from "@/lib/recipe-helpers";
import { usePagination } from "@/hooks/use-pagination";
import {
  PageHeader,
  Tag,
  ActionMenu,
  Pagination,
  IngredientFormModal,
  SupplierTag,
  Button,
  IconButton,
  Toolbar,
  ViewTabs,
  FilterButton,
  FilterGroup,
  FilterChip,
  Table,
  EmptyState,
  Dialog,
  Callout,
  Menu,
  MenuRadio,
  useMenu,
} from "@/components/ui";
import Papa from "papaparse";
import * as XLSX from "xlsx";

type SortKey = "name" | "price";
type View = "all" | "supplier";

export default function Ingredients() {
  const navigate = useNavigate();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [supplierNames, setSupplierNames] = useState<string[]>(DEFAULT_SUPPLIERS.map((s) => s.name));
  const [loading, setLoading] = useState(true);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [view, setView] = useState<View>("all");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [noPrice, setNoPrice] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [editing, setEditing] = useState<Partial<Ingredient> | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const sortMenu = useMenu();
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
    api.recipes.list().then(setRecipes).catch(() => setRecipes([]));
  };

  useEffect(() => { load(); }, []);

  const suppliers = useMemo(() => [...new Set(ingredients.map((i) => i.supplier).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [ingredients]);
  const recipeCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recipes) for (const id of new Set(r.ingredients.map((l) => l.ingredientId))) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [recipes]);

  const sorted = useMemo(() => {
    let arr = [...ingredients];
    if (search) arr = arr.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
    if (filterSupplier) arr = arr.filter((i) => i.supplier === filterSupplier);
    if (noPrice.includes("1")) arr = arr.filter((i) => !i.price);
    arr.sort((a, b) => {
      if (sortBy === "price") return a.price - b.price;
      return a.name.localeCompare(b.name);
    });
    if (view === "supplier") arr.sort((a, b) => (a.supplier || "zzz").localeCompare(b.supplier || "zzz", "fr"));
    return arr;
  }, [ingredients, search, sortBy, filterSupplier, noPrice, view]);

  const { page, totalPages, paginatedItems, setPage, next, prev, total } = usePagination(sorted, 25);

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

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  const filterCount = (filterSupplier ? 1 : 0) + noPrice.length;
  const clearFilters = () => { setFilterSupplier(""); setNoPrice([]); setPage(1); };

  const searchField = (
    <input
      className="input-field input-compact w-[220px] touch:w-full"
      placeholder="Rechercher un ingrédient…"
      value={search}
      autoFocus
      onChange={(e) => { setSearch(e.target.value); setPage(1); }}
      onKeyDown={(e) => { if (e.key === "Escape") { setSearch(""); setSearchOpen(false); } }}
      onBlur={() => { if (!search) setSearchOpen(false); }}
    />
  );

  const filters = (
    <FilterButton count={filterCount} onClear={clearFilters}>
      <FilterGroup
        label="Fournisseur"
        name="supplier"
        kind="radio"
        value={filterSupplier}
        onChange={(v) => { setFilterSupplier(v); setPage(1); }}
        options={[{ value: "", label: "Tous les fournisseurs" }, ...suppliers.map((s) => ({ value: s, label: s }))]}
        renderOption={(o) => (o.value ? <SupplierTag name={o.value} /> : o.label)}
      />
      <FilterGroup name="noprice" kind="check" value={noPrice} onChange={(v) => { setNoPrice(v); setPage(1); }} options={[{ value: "1", label: "Sans prix" }]} />
    </FilterButton>
  );

  const more = (
    <ActionMenu
      title="Ingrédients"
      items={[
        { label: duplicateCount ? `Doublons (${duplicateCount})` : "Doublons", icon: <Copy />, onClick: () => navigate("/ingredients/doublons") },
        { label: "Importer CSV", icon: <Upload />, onClick: () => setShowImport(true) },
        { label: "Exporter Excel", icon: <FileSpreadsheet />, onClick: exportExcel },
      ]}
    />
  );

  return (
    <div className="mx-auto max-w-wide">
      <PageHeader
        iconKey="ingredients"
        title="Ingrédients"
        meta={`${ingredients.length} ingrédient${ingredients.length > 1 ? "s" : ""}`}
        actions={
          <Button variant="primary" size="lg" icon={<Plus />} onClick={newIngredient}>
            <span className="hidden sm:inline">Nouvel ingrédient</span><span className="sm:hidden">Nouveau</span>
          </Button>
        }
      />

      <Toolbar
        left={<ViewTabs items={[{ key: "all", label: "Tous" }, { key: "supplier", label: "Par fournisseur" }]} value={view} onChange={(k) => setView(k as View)} aria-label="Vue" />}
        right={
          <>
            {searchOpen ? searchField : <IconButton size="sm" aria-label="Rechercher" icon={<Search />} onClick={() => setSearchOpen(true)} />}
            {filters}
            <div ref={sortMenu.ref} className="relative inline-flex">
              <Button variant="subtle" size="sm" icon={<ArrowUpDown />} onClick={sortMenu.toggle} aria-haspopup="menu" aria-expanded={sortMenu.open}>Trier</Button>
              <Menu {...sortMenu.props} align="right" title="Trier">
                <MenuRadio checked={sortBy === "name"} onSelect={() => setSortBy("name")}>Nom</MenuRadio>
                <MenuRadio checked={sortBy === "price"} onSelect={() => setSortBy("price")}>Prix</MenuRadio>
              </Menu>
            </div>
            {more}
          </>
        }
        rightTouch={
          <>
            <IconButton size="sm" aria-label="Rechercher" icon={<Search />} onClick={() => setSearchOpen((o) => !o)} className={searchOpen ? "bg-active" : ""} />
            {filters}
            {more}
          </>
        }
        filters={filterCount > 0 ? (
          <>
            {filterSupplier && <FilterChip onRemove={() => setFilterSupplier("")}>{filterSupplier}</FilterChip>}
            {noPrice.length > 0 && <FilterChip onRemove={() => setNoPrice([])}>Sans prix</FilterChip>}
          </>
        ) : undefined}
      />
      {searchOpen && (
        <div className="hidden items-center gap-1 py-2 touch:flex">
          {searchField}
          <IconButton size="sm" aria-label="Fermer la recherche" icon={<X />} onClick={() => { setSearch(""); setSearchOpen(false); }} />
        </div>
      )}

      {duplicateCount > 0 && (
        <div className="mt-3">
          <Callout emoji="🧅" tone="warning" title={`${duplicateCount} doublon${duplicateCount > 1 ? "s" : ""} probable${duplicateCount > 1 ? "s" : ""}`}>
            <Button variant="link" size="sm" className="-mx-2" onClick={() => navigate("/ingredients/doublons")}>Fusionner</Button>
          </Callout>
        </div>
      )}

      <div className="mt-2">
        <Table<Ingredient>
          rows={paginatedItems}
          rowKey={(i) => i.ingredientId}
          onRowClick={(i) => setEditing(i)}
          groupBy={view === "supplier" ? (i) => i.supplier || "Sans fournisseur" : undefined}
          empty={<EmptyState message="Aucun ingrédient." action={{ label: "+ Nouvel ingrédient", onClick: newIngredient }} />}
          columns={[
            { key: "name", label: "Nom", render: (i) => <span className="font-medium">{i.name}</span> },
            { key: "unit", label: "Unité", width: "90px", render: (i) => i.unit.replace("€/", "") },
            { key: "price", label: "Prix", width: "100px", align: "right", render: (i) => fmt(i.price) },
            { key: "supplier", label: "Fournisseur", width: "180px", render: (i) => <SupplierTag name={i.supplier} /> },
            { key: "comment", label: "Commentaire", render: (i) => <span className="text-muted-foreground">{i.comment ?? ""}</span> },
            { key: "recipes", label: "Recettes", width: "90px", align: "right", trailing: true, render: (i) => `${recipeCount.get(i.ingredientId) ?? 0}` },
          ]}
        />
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

      <Dialog
        open={Boolean(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
        title="Confirmer la suppression"
        size="sm"
        footer={
          <>
            <Button variant="default" size="md" onClick={() => setDeleteConfirm(null)}>Annuler</Button>
            <Button variant="danger" size="md" onClick={() => { if (deleteConfirm) deleteIngredient(deleteConfirm); }}>Supprimer</Button>
          </>
        }
      >
        <p className="text-muted-foreground">Cette action est irréversible.</p>
      </Dialog>

      <Dialog open={showImport} onClose={() => setShowImport(false)} title="Importer des ingrédients" size="lg">
        <CsvImport existingIngredients={ingredients} onImport={async (rows) => {
          try { const result = await api.ingredients.import(rows); setShowImport(false); load(); toast({ title: `Import terminé · ${result.created} créés, ${result.updated} mis à jour` }); }
          catch (e) { toast({ title: (e as Error).message || "Erreur lors de l'import", variant: "destructive" }); }
        }} onCancel={() => setShowImport(false)} />
      </Dialog>
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
    <div>
      <p className="mb-4 text-sm text-muted-foreground">Format CSV : <code className="rounded-sm bg-muted px-1.5 py-0.5 text-caption">nom ; prix_htva ; unite ; fournisseur ; commentaire</code></p>
      {step === "upload" && (
        <>
          <div className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg bg-surface p-10 text-muted-foreground hover:bg-hover" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }} onClick={() => fileRef.current?.click()}>
            <Upload className="h-8 w-8" /><span className="text-base font-medium">Glisser-déposer votre fichier CSV</span><span className="text-sm">ou cliquer pour parcourir</span>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          <div className="mt-5 flex justify-end"><Button variant="default" size="md" onClick={onCancel}>Annuler</Button></div>
        </>
      )}
      {step === "preview" && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-4 py-2.5">
            <span className="text-sm font-medium">{fileName}</span>
            <div className="flex gap-2">
              <Tag colour="green">{newCount} nouveaux</Tag>
              <Tag colour="blue">{updateCount} mises à jour</Tag>
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Statut</th>
                  <th>Nom</th>
                  <th className="text-right">Prix</th>
                  <th>Fournisseur</th>
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 50).map((row, i) => (
                  <tr key={i}>
                    <td><Tag colour={row._status === "new" ? "green" : "blue"}>{row._status === "new" ? "Nouveau" : "Maj"}</Tag></td>
                    <td className="font-medium">{row.nom as string}</td>
                    <td className="text-right">{fmt(row.prix_htva as number)}</td>
                    <td>{row.fournisseur as string}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex flex-wrap justify-between gap-2">
            <Button variant="default" size="md" onClick={() => setStep("upload")}>Changer de fichier</Button>
            <div className="flex gap-2">
              <Button variant="default" size="md" onClick={onCancel} disabled={importing}>Annuler</Button>
              <Button variant="primary" size="md" icon={<Check />} onClick={async () => { setImporting(true); await onImport(parsed); setImporting(false); }} disabled={importing}>
                {importing ? "Import en cours…" : `Importer ${parsed.length} ingrédients`}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
