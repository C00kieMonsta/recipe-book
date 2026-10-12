import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Upload, Check, Download, AlertTriangle, FileSpreadsheet, BookOpen } from "lucide-react";
import ActionMenu from "@/components/ui/ActionMenu";
import PageHeader from "@/components/ui/PageHeader";
import Tag from "@/components/ui/Tag";
import ListRow from "@/components/ui/ListRow";
import FieldLabel from "@/components/ui/FieldLabel";
import type { Recipe, Ingredient } from "@packages/types";
import { DEFAULT_RECIPE_CATEGORIES } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { calcRecipeCost, fmt } from "@/lib/recipe-helpers";
import { usePagination } from "@/hooks/use-pagination";
import Pagination from "@/components/ui/Pagination";
import Papa from "papaparse";
import * as XLSX from "xlsx";

const CSV_HEADERS = [
  "recette", "type", "portions", "poids_portion_g",
  "coeff_sur_place", "coeff_take_away",
  "tva_sp", "tva_ta",
  "prix_tvac_sp", "prix_tvac_ta",
  "description",
];

const CSV_SAMPLE = [
  ["Pâtes pesto", "Buffet", "1", "150", "4", "3", "12", "6", "10.00", "10.00", "Fusilis au pesto, edamame, parmesan"],
];

const BTN = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-base font-medium transition-colors";
const BTN_PRIMARY = `${BTN} bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50`;
const BTN_OUTLINE = `${BTN} border bg-card hover:bg-hover disabled:opacity-50`;

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
  type: "type", portions: "portions",
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
  type: string;
  portions: number;
  portionWeight: number;
  ingredientCount: number;
  isDup: boolean;
  raw: unknown;
}

export default function Recipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [showImport, setShowImport] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = () =>
    Promise.all([api.recipes.list(), api.ingredients.list(), api.settings.get().catch(() => null)])
      .then(([r, i, s]) => { setRecipes(r.sort((a, b) => a.name.localeCompare(b.name))); setIngredients(i); setCategories(s?.recipeCategories?.length ? s.recipeCategories : DEFAULT_RECIPE_CATEGORIES); })
      .catch(() => toast({ title: "Erreur de chargement", variant: "destructive" }))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const types = useMemo(() => {
    const fromRecipes = [...new Set(recipes.map((r) => r.type))];
    const all = [...new Set([...categories, ...fromRecipes])];
    return all;
  }, [recipes, categories]);

  const shown = useMemo(() => {
    let arr = recipes;
    if (search) arr = arr.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
    if (filterType !== "all") arr = arr.filter((r) => r.type === filterType);
    return arr;
  }, [recipes, search, filterType]);

  const { page, totalPages, paginatedItems, setPage, next, prev, total } = usePagination(shown, 24);

  const exportExcel = () => {
    const rows = recipes.map((r) => {
      const cost = calcRecipeCost(r, ingredients);
      return {
        Nom: r.name,
        Type: r.type,
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
      const created = await api.recipes.create({ name: "Nouvelle recette", type: categories[0] || "Buffet", portions: 1, portionWeight: 150, techniques: [], ingredients: [], photos: [] });
      navigate(`/recipes/${created.recipeId}?mode=edit`);
    } catch { toast({ title: "Erreur lors de la création", variant: "destructive" }); }
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  return (
    <div className="mx-auto max-w-wide">
      <PageHeader
        title="Recettes"
        meta={`${recipes.length} recettes`}
        actions={
          <>
            <button onClick={createRecipe} className={BTN_PRIMARY}>
              <Plus className="h-5 w-5" /> <span className="hidden sm:inline">Nouvelle recette</span><span className="sm:hidden">Nouvelle</span>
            </button>
            <ActionMenu items={[
              { label: "Exporter Excel", icon: <FileSpreadsheet className="h-4 w-4" />, onClick: exportExcel },
              { label: "Importer", icon: <Upload className="h-4 w-4" />, onClick: () => setShowImport(true) },
            ]} />
          </>
        }
      />

      <div className="sticky top-[68px] z-30 -mx-4 bg-background px-4 py-2 md:static md:mx-0 md:px-0 md:py-0">
        <label className="flex min-h-11 w-full items-center gap-2 rounded-lg border bg-card px-3 md:max-w-sm">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input className="min-w-0 flex-1 bg-transparent text-base outline-none" placeholder="Rechercher une recette…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </label>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 md:flex-wrap">
        <ChipBtn active={filterType === "all"} onClick={() => { setFilterType("all"); setPage(1); }}>Tous</ChipBtn>
        {types.map((t) => <ChipBtn key={t} active={filterType === t} onClick={() => { setFilterType(t); setPage(1); }}>{t}</ChipBtn>)}
      </div>

      <div className="mt-4 divide-y divide-border md:hidden">
        {paginatedItems.map((r) => (
          <ListRow
            key={r.recipeId}
            to={`/recipes/${r.recipeId}`}
            leading={<Thumb recipe={r} />}
            title={r.name}
            subtitle={`${r.type} · ${r.portions} portions · ${r.ingredients.length} ingrédients`}
          />
        ))}
        {paginatedItems.length === 0 && <p className="py-8 text-center text-base text-muted-foreground">Aucune recette.</p>}
      </div>

      <div className="mt-6 hidden gap-5 md:grid md:grid-cols-2 lg:grid-cols-3">
        {paginatedItems.map((r) => {
          const cost = calcRecipeCost(r, ingredients);
          return (
            <button key={r.recipeId} onClick={() => navigate(`/recipes/${r.recipeId}`)} className="card-elevated overflow-hidden text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:shadow-ring">
              {r.photos?.[0]?.url ? (
                <img src={r.photos[0].url} alt={r.name} className="aspect-[3/2] w-full object-cover" />
              ) : (
                <div className="flex h-40 items-center justify-center bg-muted">
                  <BookOpen className="h-12 w-12 text-primary" />
                </div>
              )}
              <div className="p-4">
                <Tag variant="primary">{r.type}</Tag>
                <h3 className="mt-2 text-h2">{r.name}</h3>
                {r.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
                  <span>{r.portions} portions</span>
                  <span>{r.ingredients.length} ingrédients</span>
                  <span>Coût HT {fmt(cost)}</span>
                  {r.pricing?.chosenPrice?.surPlace > 0 && <span>PV TVAC {fmt(r.pricing.chosenPrice.surPlace)}</span>}
                </div>
              </div>
            </button>
          );
        })}
        {paginatedItems.length === 0 && <p className="col-span-full py-8 text-center text-base text-muted-foreground">Aucune recette.</p>}
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} onPrev={prev} onNext={next} />

      {showImport && (
        <Modal onClose={() => setShowImport(false)}>
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
        </Modal>
      )}
    </div>
  );
}

function Thumb({ recipe }: { recipe: Recipe }) {
  const url = recipe.photos?.[0]?.url;
  if (url) return <img src={url} alt="" className="h-16 w-16 rounded-lg object-cover" />;
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
      <BookOpen className="h-7 w-7 text-primary" />
    </div>
  );
}

function ChipBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-sm border px-4 text-sm font-medium transition-colors ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-hover"}`}
    >
      {children}
    </button>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-2xl p-7 max-w-2xl w-[94%] max-h-[90vh] overflow-auto shadow-xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
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
      rows.push({ name, type: String(item.type || "Buffet"), portions: Number(item.portions) || 1, portionWeight: Number(item.portionWeight) || 150, ingredientCount: ingredients.length, isDup: existingSet.has(name.toLowerCase()), raw: item });
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
      rows.push({ name, type: (norm.type || "Buffet").trim(), portions: Number(norm.portions) || 1, portionWeight: Number(norm.poids_portion) || 150, ingredientCount: 0, isDup: existingSet.has(name.toLowerCase()), raw });
      payload.push({ recette: name, type: norm.type || "Buffet", portions: norm.portions, poids_portion: norm.poids_portion, coeff_sur_place: norm.coeff_sp, coeff_take_away: norm.coeff_ta, tva_sp: norm.tva_sp, tva_ta: norm.tva_ta, prix_tvac_sp: norm.prix_tvac_sp, prix_tvac_ta: norm.prix_tvac_ta, description: norm.description });
    }
    setPreview(rows); setApiPayload(payload); setStep("preview");
  };

  const newCount = preview.filter((r) => !r.isDup).length;
  const dupCount = preview.filter((r) => r.isDup).length;
  const hasIngredients = preview.some((r) => r.ingredientCount > 0);

  return (
    <div>
      <h2 className="text-h2 mb-1">Importer des recettes</h2>
      <p className="text-base text-muted-foreground mb-5">Formats acceptés : CSV ou JSON. Les recettes existantes sont ignorées.</p>

      {step === "upload" && (
        <>
          <FieldLabel htmlFor="recipe-import-file">Fichier</FieldLabel>
          <div className="flex flex-col items-center justify-center gap-2 p-10 border-2 border-dashed rounded-xl cursor-pointer text-muted-foreground hover:border-primary/40 transition-colors" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }} onClick={() => fileRef.current?.click()}>
            <Upload className="h-8 w-8" />
            <span className="text-base font-medium">Glisser-déposer votre fichier CSV ou JSON</span>
            <span className="text-sm">ou cliquer pour parcourir</span>
          </div>
          <input id="recipe-import-file" ref={fileRef} type="file" accept=".csv,.tsv,.txt,.json" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          <div className="flex justify-between mt-5">
            <button onClick={downloadTemplate} className={BTN_OUTLINE}><Download className="h-4 w-4" /> Modèle CSV</button>
            <button onClick={onCancel} className={BTN_OUTLINE}>Annuler</button>
          </div>
        </>
      )}

      {step === "preview" && (
        <>
          <div className="flex justify-between items-center gap-3 px-4 py-2.5 bg-muted rounded-lg mb-4">
            <span className="truncate font-semibold text-base">{fileName}</span>
            <div className="flex shrink-0 gap-2">
              <Tag variant="success">{newCount} nouvelles</Tag>
              {dupCount > 0 && <Tag variant="warning">{dupCount} existantes</Tag>}
            </div>
          </div>
          {unmapped.length > 0 && (
            <div className="flex gap-2 items-start p-3 bg-warning-soft rounded-lg mb-4 text-sm text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Colonnes non reconnues : {unmapped.map((c) => <code key={c} className="rounded bg-card px-1 mx-0.5">{c}</code>)}</span>
            </div>
          )}
          <div className="max-h-[340px] overflow-y-auto border rounded-xl">
            <table className="table">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b-2 border-border text-muted-foreground">
                  <th>Recette</th>
                  <th>Type</th>
                  <th className="text-right">Portions</th>
                  <th className="text-right">Poids</th>
                  {hasIngredients && <th className="text-right">Ing.</th>}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className={`border-b border-border/30 ${r.isDup ? "opacity-50" : ""}`}>
                    <td className="font-semibold">{r.name}</td>
                    <td className="text-muted-foreground">{r.type}</td>
                    <td className="text-right">{r.portions}</td>
                    <td className="text-right">{r.portionWeight} g</td>
                    {hasIngredients && <td className="text-right">{r.ingredientCount}</td>}
                    <td className="text-center">{r.isDup && <AlertTriangle aria-label="Déjà existante" className="inline h-4 w-4 text-warning" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between flex-wrap gap-2 mt-5">
            <button onClick={() => setStep("upload")} disabled={importing} className={BTN_OUTLINE}>Changer de fichier</button>
            <div className="flex gap-2">
              <button onClick={onCancel} disabled={importing} className={BTN_OUTLINE}>Annuler</button>
              <button onClick={async () => { setImporting(true); await onImport(apiPayload); setImporting(false); }} disabled={newCount === 0 || importing} className={BTN_PRIMARY}>
                <Check className="h-4 w-4" />
                {importing ? "Import en cours…" : `Importer ${newCount} recette${newCount > 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
