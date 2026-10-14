import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Upload, Check, Download, AlertTriangle, FileSpreadsheet, Copy, ArrowUpDown, X, LayoutGrid, List } from "lucide-react";
import type { Recipe, Ingredient } from "@packages/types";
import { DEFAULT_COURSES, categoryOptions, fmtEur, recipeCategoryOf } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { calcRecipeCost } from "@/lib/recipe-helpers";
import { usePagination } from "@/hooks/use-pagination";
import { PAGE_ICONS } from "@/lib/page-icons";
import {
  PageHeader,
  Tag,
  Pagination,
  ActionMenu,
  FieldLabel,
  Button,
  IconButton,
  Toolbar,
  ViewTabs,
  Table,
  EmptyState,
  Dialog,
  Menu,
  MenuRadio,
  useMenu,
} from "@/components/ui";
import Papa from "papaparse";
import * as XLSX from "xlsx";

const CSV_HEADERS = [
  "recette", "categorie", "portions", "poids_portion_g",
  "coeff_sur_place", "coeff_take_away",
  "tva_sp", "tva_ta",
  "prix_tvac_sp", "prix_tvac_ta",
  "description",
];

const CSV_SAMPLE = [
  ["Pâtes pesto", "Buffet", "1", "150", "4", "3", "12", "6", "10.00", "10.00", "Fusilis au pesto, edamame, parmesan"],
];

function downloadTemplate() {
  const rows = [CSV_HEADERS, ...CSV_SAMPLE];
  const csv = "﻿" + rows.map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "recettes_template.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

const COL_ALIASES: Record<string, string> = {
  recette: "recette", nom_recette: "recette", nom: "recette", name: "recette",
  type: "type", categorie: "categorie", "catégorie": "categorie", category: "categorie", portions: "portions",
  poids_portion_g: "poids_portion", poids_portion: "poids_portion", poids: "poids_portion",
  coeff_sur_place: "coeff_sp", coeffsp: "coeff_sp", coeff_sp: "coeff_sp",
  coeff_take_away: "coeff_ta", coeffta: "coeff_ta", coeff_ta: "coeff_ta",
  tva_sp: "tva_sp", tvasp: "tva_sp", "tva sur place": "tva_sp",
  tva_ta: "tva_ta", tvata: "tva_ta", "tva take away": "tva_ta",
  prix_tvac_sp: "prix_tvac_sp", prixtvacsp: "prix_tvac_sp",
  prix_tvac_ta: "prix_tvac_ta", prixtvacta: "prix_tvac_ta",
  description: "description",
};

function normaliseKey(raw: string): string {
  const k = raw.trim().toLowerCase().replace(/[\s/]+/g, "_");
  return COL_ALIASES[k] ?? k;
}

interface PreviewRow {
  name: string;
  category: string;
  portions: number;
  portionWeight: number;
  ingredientCount: number;
  isDup: boolean;
  raw: unknown;
}

type View = "list" | "gallery";
type SortKey = "name" | "category" | "portions";

export default function Recipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [courses, setCourses] = useState<string[]>(DEFAULT_COURSES);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [view, setView] = useLocalStorage<View>("recipe-book:recipes-view", "gallery");
  const [showImport, setShowImport] = useState(false);
  const sortMenu = useMenu();
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = () =>
    Promise.all([api.recipes.list(), api.ingredients.list(), api.settings.get().catch(() => null)])
      .then(([r, i, s]) => { setRecipes(r.sort((a, b) => a.name.localeCompare(b.name))); setIngredients(i); setCourses(s?.courses?.length ? s.courses : DEFAULT_COURSES); })
      .catch(() => toast({ title: "Erreur de chargement", variant: "destructive" }))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const categories = useMemo(() => categoryOptions(courses, recipes), [recipes, courses]);

  const duplicateNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of recipes) seen.set(r.nameLower, (seen.get(r.nameLower) ?? 0) + 1);
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [recipes]);

  const shown = useMemo(() => {
    let arr = recipes;
    if (search) arr = arr.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
    if (filterType !== "all") arr = arr.filter((r) => recipeCategoryOf(r) === filterType);
    return [...arr].sort((a, b) => {
      if (sortKey === "category") return recipeCategoryOf(a).localeCompare(recipeCategoryOf(b), "fr") || a.name.localeCompare(b.name, "fr");
      if (sortKey === "portions") return b.portions - a.portions;
      return a.name.localeCompare(b.name, "fr");
    });
  }, [recipes, search, filterType, sortKey]);

  const { page, totalPages, paginatedItems, setPage, next, prev, total } = usePagination(shown, 24);

  const exportExcel = () => {
    const rows = recipes.map((r) => {
      const cost = calcRecipeCost(r, ingredients);
      return {
        Nom: r.name,
        Catégorie: recipeCategoryOf(r),
        Portions: r.portions,
        "Poids (g)": r.portionWeight,
        "Coût total": +cost.toFixed(2),
        "Prix SP TVAC": r.pricing?.chosenPrice?.surPlace || 0,
        "Prix TA TVAC": r.pricing?.chosenPrice?.takeAway || 0,
        "Nb ingrédients": r.ingredients.length,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Recettes");
    XLSX.writeFile(wb, "recettes.xlsx");
  };

  const createRecipe = async () => {
    try {
      const category = courses[0] || DEFAULT_COURSES[0];
      const created = await api.recipes.create({ name: "Nouvelle recette", category, type: category, portions: 1, portionWeight: 150, techniques: [], ingredients: [], photos: [] });
      navigate(`/recipes/${created.recipeId}?mode=edit`);
    } catch { toast({ title: "Erreur lors de la création", variant: "destructive" }); }
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  const searchField = (
    <input
      className="input-field input-compact w-[220px] touch:w-full"
      placeholder="Rechercher une recette…"
      value={search}
      autoFocus
      onChange={(e) => { setSearch(e.target.value); setPage(1); }}
      onKeyDown={(e) => { if (e.key === "Escape") { setSearch(""); setSearchOpen(false); } }}
      onBlur={() => { if (!search) setSearchOpen(false); }}
    />
  );

  const more = (
    <ActionMenu
      title="Recettes"
      items={[
        { label: "Exporter Excel", icon: <FileSpreadsheet />, onClick: exportExcel },
        { label: "Importer", icon: <Upload />, onClick: () => setShowImport(true) },
        { label: "Doublons d'ingrédients", icon: <Copy />, onClick: () => navigate("/ingredients/doublons") },
      ]}
    />
  );

  const nameCell = (r: Recipe) => (
    <span className="inline-flex min-w-0 items-center gap-2 font-medium">
      <Thumb recipe={r} className="md:hidden" />
      <span aria-hidden="true" className="hidden text-base leading-none md:inline">{PAGE_ICONS.recette}</span>
      {duplicateNames.has(r.nameLower) && <AlertTriangle className="h-4 w-4 shrink-0 text-tag-orange-fg" aria-label="Doublon probable" />}
      <span className="truncate">{r.name}</span>
    </span>
  );

  const empty = <EmptyState message="Aucune recette." action={{ label: "+ Nouvelle recette", onClick: createRecipe }} />;

  return (
    <div className="mx-auto max-w-wide">
      <PageHeader
        iconKey="recettes"
        title="Recettes"
        meta={`${recipes.length} recette${recipes.length > 1 ? "s" : ""}`}
        actions={
          <Button variant="primary" size="lg" icon={<Plus />} onClick={createRecipe}>
            <span className="hidden sm:inline">Nouvelle recette</span><span className="sm:hidden">Nouvelle</span>
          </Button>
        }
      />

      <Toolbar
        left={
          <>
            <ViewTabs
              items={[{ key: "all", label: "Toutes" }, ...categories.map((c) => ({ key: c, label: c }))]}
              value={filterType}
              onChange={(k) => { setFilterType(k); setPage(1); }}
              aria-label="Catégorie"
            />
            <span aria-hidden="true" className="hidden px-1 text-icon md:inline">·</span>
            <ViewTabs
              className="hidden md:flex"
              items={[{ key: "list", label: <><List className="h-4 w-4" /> Liste</> }, { key: "gallery", label: <><LayoutGrid className="h-4 w-4" /> Galerie</> }]}
              value={view}
              onChange={(k) => setView(k as View)}
              aria-label="Affichage"
            />
          </>
        }
        right={
          <>
            {searchOpen ? searchField : <IconButton size="sm" aria-label="Rechercher" icon={<Search />} onClick={() => setSearchOpen(true)} />}
            <div ref={sortMenu.ref} className="relative inline-flex">
              <Button variant="subtle" size="sm" icon={<ArrowUpDown />} onClick={sortMenu.toggle} aria-haspopup="menu" aria-expanded={sortMenu.open}>Trier</Button>
              <Menu {...sortMenu.props} align="right" title="Trier">
                <MenuRadio checked={sortKey === "name"} onSelect={() => setSortKey("name")}>Nom</MenuRadio>
                <MenuRadio checked={sortKey === "category"} onSelect={() => setSortKey("category")}>Catégorie</MenuRadio>
                <MenuRadio checked={sortKey === "portions"} onSelect={() => setSortKey("portions")}>Portions</MenuRadio>
              </Menu>
            </div>
            {more}
          </>
        }
        rightTouch={
          <>
            <IconButton size="sm" aria-label="Rechercher" icon={<Search />} onClick={() => setSearchOpen((o) => !o)} className={searchOpen ? "bg-active" : ""} />
            {more}
          </>
        }
      />
      {searchOpen && (
        <div className="hidden items-center gap-1 py-2 touch:flex">
          {searchField}
          <IconButton size="sm" aria-label="Fermer la recherche" icon={<X />} onClick={() => { setSearch(""); setSearchOpen(false); }} />
        </div>
      )}

      {view === "gallery" ? (
        <>
          <div className="mt-2 md:hidden">
            <Table<Recipe>
              rows={paginatedItems}
              rowKey={(r) => r.recipeId}
              rowHref={(r) => `/recipes/${r.recipeId}`}
              empty={empty}
              columns={[
                { key: "name", label: "Nom", render: nameCell },
                { key: "category", label: "Catégorie", render: (r) => recipeCategoryOf(r) },
                { key: "portions", label: "Portions", render: (r) => `${r.portions} portions` },
              ]}
            />
          </div>
          <div className="mt-4 hidden md:block">
            {paginatedItems.length === 0 ? empty : (
              <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
                {paginatedItems.map((r) => (
                  <button
                    key={r.recipeId}
                    type="button"
                    onClick={() => navigate(`/recipes/${r.recipeId}`)}
                    className="overflow-hidden rounded-lg text-left shadow-card transition-colors hover:bg-hover focus-visible:outline-none focus-visible:shadow-ring"
                  >
                    {r.photos?.[0]?.url ? (
                      <img src={r.photos[0].url} alt="" className="aspect-[3/2] w-full object-cover" />
                    ) : (
                      <div className="flex aspect-[3/2] w-full items-center justify-center bg-muted text-[32px] leading-none" aria-hidden="true">{PAGE_ICONS.recette}</div>
                    )}
                    <div className="p-2.5">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        {duplicateNames.has(r.nameLower) && <AlertTriangle className="h-4 w-4 shrink-0 text-tag-orange-fg" aria-label="Doublon probable" />}
                        <span className="truncate">{r.name}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-caption text-muted-foreground">
                        <Tag colour="gray">{recipeCategoryOf(r)}</Tag>
                        <span className="truncate">{r.portions} p · {fmtEur(calcRecipeCost(r, ingredients) / (r.portions || 1))}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="mt-2">
          <Table<Recipe>
            rows={paginatedItems}
            rowKey={(r) => r.recipeId}
            rowHref={(r) => `/recipes/${r.recipeId}`}
            empty={empty}
            columns={[
              { key: "name", label: "Nom", render: nameCell },
              { key: "category", label: "Catégorie", width: "130px", render: (r) => <Tag colour="gray">{recipeCategoryOf(r)}</Tag> },
              { key: "portions", label: "Portions", width: "100px", align: "right", render: (r) => `${r.portions}` },
              { key: "cost", label: "Coût / port.", width: "120px", align: "right", render: (r) => fmtEur(calcRecipeCost(r, ingredients) / (r.portions || 1)) },
              { key: "weight", label: "Poids", width: "90px", align: "right", render: (r) => `${r.portionWeight} g` },
            ]}
          />
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} onPrev={prev} onNext={next} />

      <Dialog open={showImport} onClose={() => setShowImport(false)} title="Importer des recettes" size="lg">
        <RecipeImport
          existingNames={recipes.map((r) => r.nameLower)}
          onImport={async (rows) => {
            try {
              const result = await api.recipes.import(rows);
              setShowImport(false);
              load();
              let msg = `${result.created} créées, ${result.skipped} ignorées`;
              if (result.unmatchedIngredients?.length > 0) {
                msg += `, ${result.unmatchedIngredients.length} ingrédients non trouvés`;
              }
              toast({ title: `Import terminé : ${msg}` });
            } catch (e) {
              toast({ title: (e as Error).message || "Erreur lors de l'import", variant: "destructive" });
            }
          }}
          onCancel={() => setShowImport(false)}
        />
      </Dialog>
    </div>
  );
}

function Thumb({ recipe, className = "" }: { recipe: Recipe; className?: string }) {
  const url = recipe.photos?.[0]?.url;
  if (url) return <img src={url} alt="" className={`h-10 w-10 shrink-0 rounded object-cover ${className}`} />;
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted text-base leading-none ${className}`} aria-hidden="true">
      {PAGE_ICONS.recette}
    </span>
  );
}

function RecipeImport({ existingNames, onImport, onCancel }: {
  existingNames: string[];
  onImport: (rows: unknown[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [apiPayload, setApiPayload] = useState<unknown[]>([]);
  const [fileName, setFileName] = useState("");
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const existingSet = useMemo(() => new Set(existingNames), [existingNames]);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);

    if (file.name.endsWith(".json")) {
      file.text().then((text) => {
        try {
          const data = JSON.parse(text);
          if (!Array.isArray(data)) throw new Error("Expected array");
          processJson(data);
        } catch {
          setUnmapped(["Format JSON invalide"]);
        }
      });
    } else {
      Papa.parse(file, {
        header: true, delimiter: ";", skipEmptyLines: true,
        complete: (res) => {
          if (res.data.length > 0 && Object.keys(res.data[0] as object).length <= 1) {
            Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r2) => processCsv(r2.data as Record<string, string>[]) });
          } else {
            processCsv(res.data as Record<string, string>[]);
          }
        },
      });
    }
  };

  const processJson = (data: Array<Record<string, unknown>>) => {
    const rows: PreviewRow[] = [];
    const payload: unknown[] = [];
    for (const item of data) {
      const name = String(item.name || "").trim();
      if (!name) continue;
      const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
      const category = String(item.category || "") || recipeCategoryOf({ type: String(item.type || "Buffet") });
      rows.push({ name, category, portions: Number(item.portions) || 1, portionWeight: Number(item.portionWeight) || 150, ingredientCount: ingredients.length, isDup: existingSet.has(name.toLowerCase()), raw: item });
      payload.push(item);
    }
    setPreview(rows); setApiPayload(payload); setUnmapped([]); setStep("preview");
  };

  const processCsv = (data: Record<string, string>[]) => {
    if (!data.length) return;
    const rawKeys = Object.keys(data[0]);
    const unknown = rawKeys.filter((k) => { const norm = k.trim().toLowerCase().replace(/[\s/]+/g, "_"); return !COL_ALIASES[norm]; });
    setUnmapped(unknown);
    const rows: PreviewRow[] = [];
    const payload: unknown[] = [];
    for (const raw of data) {
      const norm: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) norm[normaliseKey(k)] = v;
      const name = (norm.recette || "").trim();
      if (!name) continue;
      const categorie = (norm.categorie || "").trim();
      const category = categorie || recipeCategoryOf({ type: (norm.type || "Buffet").trim() });
      rows.push({ name, category, portions: Number(norm.portions) || 1, portionWeight: Number(norm.poids_portion) || 150, ingredientCount: 0, isDup: existingSet.has(name.toLowerCase()), raw });
      payload.push({ recette: name, type: norm.type || "Buffet", ...(categorie ? { categorie } : {}), portions: norm.portions, poids_portion: norm.poids_portion, coeff_sur_place: norm.coeff_sp, coeff_take_away: norm.coeff_ta, tva_sp: norm.tva_sp, tva_ta: norm.tva_ta, prix_tvac_sp: norm.prix_tvac_sp, prix_tvac_ta: norm.prix_tvac_ta, description: norm.description });
    }
    setPreview(rows); setApiPayload(payload); setStep("preview");
  };

  const newCount = preview.filter((r) => !r.isDup).length;
  const dupCount = preview.filter((r) => r.isDup).length;
  const hasIngredients = preview.some((r) => r.ingredientCount > 0);

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">Formats acceptés : CSV ou JSON. Les recettes existantes sont ignorées.</p>

      {step === "upload" && (
        <>
          <FieldLabel htmlFor="recipe-import-file">Fichier</FieldLabel>
          <div className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg bg-surface p-10 text-muted-foreground hover:bg-hover" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }} onClick={() => fileRef.current?.click()}>
            <Upload className="h-8 w-8" />
            <span className="text-base font-medium">Glisser-déposer votre fichier CSV ou JSON</span>
            <span className="text-sm">ou cliquer pour parcourir</span>
          </div>
          <input id="recipe-import-file" ref={fileRef} type="file" accept=".csv,.tsv,.txt,.json" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          <div className="mt-5 flex justify-between">
            <Button variant="default" size="md" icon={<Download />} onClick={downloadTemplate}>Modèle CSV</Button>
            <Button variant="default" size="md" onClick={onCancel}>Annuler</Button>
          </div>
        </>
      )}

      {step === "preview" && (
        <>
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-surface px-4 py-2.5">
            <span className="truncate text-sm font-medium">{fileName}</span>
            <div className="flex shrink-0 gap-2">
              <Tag colour="green">{newCount} nouvelles</Tag>
              {dupCount > 0 && <Tag colour="yellow">{dupCount} existantes</Tag>}
            </div>
          </div>
          {unmapped.length > 0 && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Colonnes non reconnues : {unmapped.map((c) => <code key={c} className="mx-0.5 rounded-sm bg-background px-1">{c}</code>)}</span>
            </div>
          )}
          <div className="max-h-[340px] overflow-y-auto">
            <table className="table">
              <thead className="sticky top-0 bg-background">
                <tr>
                  <th>Recette</th>
                  <th>Catégorie</th>
                  <th className="text-right">Portions</th>
                  <th className="text-right">Poids</th>
                  {hasIngredients && <th className="text-right">Ing.</th>}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className={r.isDup ? "opacity-50" : ""}>
                    <td className="font-medium">{r.name}</td>
                    <td className="text-muted-foreground">{r.category}</td>
                    <td className="text-right">{r.portions}</td>
                    <td className="text-right">{r.portionWeight} g</td>
                    {hasIngredients && <td className="text-right">{r.ingredientCount}</td>}
                    <td className="text-center">{r.isDup && <AlertTriangle aria-label="Déjà existante" className="inline h-4 w-4 text-warning" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex flex-wrap justify-between gap-2">
            <Button variant="default" size="md" onClick={() => setStep("upload")} disabled={importing}>Changer de fichier</Button>
            <div className="flex gap-2">
              <Button variant="default" size="md" onClick={onCancel} disabled={importing}>Annuler</Button>
              <Button variant="primary" size="md" icon={<Check />} onClick={async () => { setImporting(true); await onImport(apiPayload); setImporting(false); }} disabled={newCount === 0 || importing}>
                {importing ? "Import en cours…" : `Importer ${newCount} recette${newCount > 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
