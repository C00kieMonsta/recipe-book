import { Fragment, useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Plus, Upload, Check, FileSpreadsheet, Copy, ArrowUpDown, X, RefreshCw } from "lucide-react";
import type { Ingredient, Recipe } from "@packages/types";
import { DEFAULT_SUPPLIERS, dayMonthLabel, normalizeIngredientName, todayYmd } from "@packages/types";
import { api, ApiError, type ImportIngredientsResponse } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { fmt } from "@/lib/recipe-helpers";
import { cn } from "@/lib/utils";
import { usePagination } from "@/hooks/use-pagination";
import { isStalePrice, lastPriceUpdate, priceSheetHref, verifiedTitle } from "@/pages/admin/IngredientPrices";
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
  Checkbox,
  FieldLabel,
  Menu,
  MenuRadio,
  useMenu,
  type TableColumn,
} from "@/components/ui";
import Papa from "papaparse";
import * as XLSX from "xlsx";

type SortKey = "name" | "price";
type View = "all" | "supplier";
type ImportOptions = { mode: "all" | "prices"; supplier?: string };

const STALE_DISMISS_KEY = "recipe-book:stale-prices-dismissed";
// api.ts types the import with one argument (withInvalidate overload); the runtime forwards the options.
const importIngredients = api.ingredients.import as unknown as (rows: unknown[], options?: ImportOptions) => Promise<ImportIngredientsResponse>;
const NO_SUPPLIER = "Sans fournisseur";

// Same match as the server's IngredientLookup: exact lower-cased name, then normalised name, then aliases.
function buildLookup(list: Ingredient[]): (name: string) => Ingredient | undefined {
  const exact = new Map<string, Ingredient>();
  const live = new Map<string, Ingredient>();
  const alias = new Map<string, Ingredient>();
  for (const ing of list) {
    exact.set(ing.nameLower || ing.name.toLowerCase(), ing);
    const key = normalizeIngredientName(ing.name);
    if (key && !live.has(key)) live.set(key, ing);
    for (const a of ing.aliases ?? []) {
      const k = normalizeIngredientName(a);
      if (k && !alias.has(k)) alias.set(k, ing);
    }
  }
  return (name) => {
    const trimmed = name.trim();
    const hit = exact.get(trimmed.toLowerCase());
    if (hit) return hit;
    const key = normalizeIngredientName(trimmed);
    return key ? live.get(key) ?? alias.get(key) : undefined;
  };
}

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
  const [staleDismissed, setStaleDismissed] = useState(() => sessionStorage.getItem(STALE_DISMISS_KEY) === "1");
  const sortMenu = useMenu();
  const { toast } = useToast();
  const today = todayYmd();

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

  const staleCount = useMemo(() => ingredients.filter((i) => isStalePrice(i, today)).length, [ingredients, today]);
  const firstSupplier = supplierNames[0] ?? "";
  const dismissStale = () => { sessionStorage.setItem(STALE_DISMISS_KEY, "1"); setStaleDismissed(true); };

  // Supplier view: one block per supplier with its own header (last update, link to the sheet).
  const supplierGroups = useMemo(() => {
    if (view !== "supplier") return [];
    const groups: { supplier: string; rows: Ingredient[] }[] = [];
    for (const row of paginatedItems) {
      const last = groups[groups.length - 1];
      if (last && last.supplier === (row.supplier || "")) last.rows.push(row);
      else groups.push({ supplier: row.supplier || "", rows: [row] });
    }
    return groups;
  }, [view, paginatedItems]);

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
        { label: "Mettre à jour les prix…", icon: <RefreshCw />, onClick: () => navigate(priceSheetHref(firstSupplier)) },
        { label: "Importer une liste de prix (CSV)", icon: <Upload />, onClick: () => setShowImport(true) },
        { label: "Exporter Excel", icon: <FileSpreadsheet />, onClick: exportExcel },
      ]}
    />
  );

  const columns: TableColumn<Ingredient>[] = [
    { key: "name", label: "Nom", render: (i) => <span className="font-medium">{i.name}</span> },
    { key: "unit", label: "Unité", width: "90px", render: (i) => i.unit.replace("€/", "") },
    {
      key: "price", label: "Prix", width: "100px", align: "right",
      render: (i) => <span title={verifiedTitle(i)} className={cn(isStalePrice(i, today) && "text-danger")}>{fmt(i.price)}</span>,
    },
    { key: "supplier", label: "Fournisseur", width: "180px", render: (i) => <SupplierTag name={i.supplier} /> },
    { key: "comment", label: "Commentaire", render: (i) => <span className="text-muted-foreground">{i.comment ?? ""}</span> },
    { key: "recipes", label: "Recettes", width: "90px", align: "right", trailing: true, render: (i) => `${recipeCount.get(i.ingredientId) ?? 0}` },
  ];
  const emptyState = <EmptyState message="Aucun ingrédient." action={{ label: "+ Nouvel ingrédient", onClick: newIngredient }} />;

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

      {staleCount > 0 && !staleDismissed && (
        <div className="mt-3">
          <Callout emoji="💶" tone="warning">
            <div className="flex min-h-7 flex-wrap items-center gap-x-2 touch:min-h-11">
              <span className="font-medium">{staleCount} prix non vérifié{staleCount > 1 ? "s" : ""} depuis 6 mois.</span>
              <Button as={Link} to={priceSheetHref(firstSupplier)} variant="link" size="sm" className="-mx-2">Mettre à jour les prix</Button>
              <IconButton size="sm" aria-label="Masquer" icon={<X />} onClick={dismissStale} className="ml-auto" />
            </div>
          </Callout>
        </div>
      )}

      <div className="mt-2">
        {view === "supplier" ? (
          paginatedItems.length === 0 ? emptyState : (
            <>
              <Table<Ingredient> rows={[]} rowKey={(i) => i.ingredientId} columns={columns} className="[&_table]:table-fixed" />
              {supplierGroups.map((g) => {
                const last = lastPriceUpdate(g.rows);
                return (
                  <Fragment key={g.supplier || NO_SUPPLIER}>
                    <div className="flex flex-wrap items-center gap-x-2 pt-3 text-sm text-muted-foreground">
                      <span className="font-medium">{g.supplier || NO_SUPPLIER}</span>
                      <span>· {last ? `dernière mise à jour ${dayMonthLabel(last.slice(0, 10))}` : "jamais vérifié"}</span>
                      <Button as={Link} to={priceSheetHref(g.supplier)} variant="link" size="sm" className="-mx-2">Mettre à jour</Button>
                    </div>
                    <Table<Ingredient>
                      rows={g.rows}
                      rowKey={(i) => i.ingredientId}
                      onRowClick={(i) => setEditing(i)}
                      columns={columns}
                      className="[&_table]:table-fixed [&_thead]:collapse"
                    />
                  </Fragment>
                );
              })}
            </>
          )
        ) : (
          <Table<Ingredient>
            rows={paginatedItems}
            rowKey={(i) => i.ingredientId}
            onRowClick={(i) => setEditing(i)}
            empty={emptyState}
            columns={columns}
          />
        )}
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

      <Dialog open={showImport} onClose={() => setShowImport(false)} title="Importer une liste de prix" size="lg">
        <CsvImport existingIngredients={ingredients} suppliers={supplierNames} onImport={async (rows, options) => {
          try {
            const result = await importIngredients(rows, options);
            setShowImport(false);
            load();
            if (options.mode === "prices") {
              const nf = result.notFound;
              const names = nf.slice(0, 5).join(", ") + (nf.length > 5 ? ", …" : "");
              toast({ title: `${result.updated} prix mis à jour${nf.length ? ` · ${nf.length} non trouvé${nf.length > 1 ? "s" : ""} : ${names}` : ""}` });
            } else {
              toast({ title: `Import terminé · ${result.created} créés, ${result.updated} mis à jour` });
            }
          }
          catch (e) { toast({ title: (e as Error).message || "Erreur lors de l'import", variant: "destructive" }); }
        }} onCancel={() => setShowImport(false)} />
      </Dialog>
    </div>
  );
}

type ParsedRow = { nom: string; prix_htva: number; unite: string; fournisseur: string; commentaire: string; _status: "new" | "update" };

function CsvImport({ existingIngredients, suppliers, onImport, onCancel }: {
  existingIngredients: Ingredient[];
  suppliers: string[];
  onImport: (rows: unknown[], options: ImportOptions) => Promise<void>;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [supplier, setSupplier] = useState("");
  // Prices-only follows the supplier choice until the box is touched.
  const [pricesOnlyOverride, setPricesOnlyOverride] = useState<boolean | null>(null);
  const pricesOnly = pricesOnlyOverride ?? supplier !== "";
  const fileRef = useRef<HTMLInputElement>(null);
  const lookup = useMemo(() => buildLookup(existingIngredients), [existingIngredients]);

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
    const rows = data.map((row): ParsedRow => {
      const name = (row.nom || row.name || row.Nom || "").trim();
      const price = parseNum(row.prix_htva || row.price || row.prix || 0);
      const unit = (row.unite || row.unit || "€/kg").trim();
      const rowSupplier = (row.fournisseur || row.supplier || "").trim();
      const comment = (row.commentaire || row.comment || "").trim();
      return { nom: name, prix_htva: price, unite: unit, fournisseur: rowSupplier, commentaire: comment, _status: lookup(name) ? "update" : "new" };
    }).filter((r) => r.nom);
    setParsed(rows); setStep("preview");
  };

  // The chosen supplier fills rows whose column is empty, never a row's own value.
  const rows = useMemo(() => (supplier ? parsed.map((r) => ({ ...r, fournisseur: r.fournisseur || supplier })) : parsed), [parsed, supplier]);
  const newCount = rows.filter((r) => r._status === "new").length;
  const updateCount = rows.filter((r) => r._status === "update").length;
  const total = pricesOnly ? updateCount : rows.length;
  const submitLabel = pricesOnly ? `Mettre à jour ${updateCount} prix` : `Importer ${rows.length} ligne${rows.length > 1 ? "s" : ""}`;

  const submit = async () => {
    setImporting(true);
    await onImport(rows, { mode: pricesOnly ? "prices" : "all", supplier: supplier || undefined });
    setImporting(false);
  };

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
          <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3">
            <div>
              <FieldLabel htmlFor="import-supplier">Fournisseur</FieldLabel>
              <select id="import-supplier" className="input-field w-56" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                <option value="">Comme dans le fichier</option>
                {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <Checkbox
              checked={pricesOnly}
              onChange={setPricesOnlyOverride}
              label="Mettre à jour les prix seulement (ne crée pas de nouveaux ingrédients)"
              className="h-auto min-h-8 touch:h-auto touch:min-h-11 [&>span:last-child]:whitespace-normal"
            />
          </div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-4 py-2.5">
            <span className="text-sm font-medium">{fileName}</span>
            <div className="flex gap-2">
              {pricesOnly
                ? <Tag colour="gray">{newCount} non trouvé{newCount > 1 ? "s" : ""}</Tag>
                : <Tag colour="green">{newCount} nouveau{newCount > 1 ? "x" : ""}</Tag>}
              <Tag colour="blue">{updateCount} mise{updateCount > 1 ? "s" : ""} à jour</Tag>
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
                {rows.slice(0, 50).map((row, i) => (
                  <tr key={i}>
                    <td>
                      {row._status === "update"
                        ? <Tag colour="blue">Maj</Tag>
                        : pricesOnly ? <Tag colour="gray">Non trouvé</Tag> : <Tag colour="green">Nouveau</Tag>}
                    </td>
                    <td className="font-medium">{row.nom}</td>
                    <td className="text-right">{fmt(row.prix_htva)}</td>
                    <td>{row.fournisseur}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex flex-wrap justify-between gap-2">
            <Button variant="default" size="md" onClick={() => setStep("upload")}>Changer de fichier</Button>
            <div className="flex gap-2">
              <Button variant="default" size="md" onClick={onCancel} disabled={importing}>Annuler</Button>
              <Button variant="primary" size="md" icon={<Check />} onClick={submit} disabled={importing || total === 0}>
                {importing ? "Import en cours…" : submitLabel}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
