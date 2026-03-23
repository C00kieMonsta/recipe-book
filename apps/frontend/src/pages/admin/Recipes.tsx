import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Upload, Check, Download, AlertTriangle, FileSpreadsheet } from "lucide-react";
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

function downloadTemplate() {
  const rows = [CSV_HEADERS, ...CSV_SAMPLE];
  const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
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
      .then(([r, i, s]) => { setRecipes(r); setIngredients(i); setCategories(s?.recipeCategories?.length ? s.recipeCategories : DEFAULT_RECIPE_CATEGORIES); })
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

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Recettes</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{recipes.length} recettes au total</p>
        </div>
        <div className="flex gap-1.5 sm:gap-2">
          <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-2 sm:px-4 border rounded-lg text-xs sm:text-sm font-medium hover:bg-muted transition-colors">
            <FileSpreadsheet className="h-4 w-4" /> <span className="hidden sm:inline">Excel</span>
          </button>
          <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-2 sm:px-4 border rounded-lg text-xs sm:text-sm font-medium hover:bg-muted transition-colors">
            <Upload className="h-4 w-4" /> <span className="hidden sm:inline">Importer</span>
          </button>
          <button onClick={() => navigate("/recipes/new")} className="flex items-center gap-1.5 px-3 py-2 sm:px-4 bg-primary text-primary-foreground rounded-lg text-xs sm:text-sm font-medium shadow-sm hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Nouvelle recette</span><span className="sm:hidden">Nouveau</span>
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-6 flex-wrap items-center">
        <div className="flex items-center gap-2 px-3 py-2 bg-card border rounded-lg flex-1 max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input className="flex-1 bg-transparent outline-none text-sm" placeholder="Rechercher une recette…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <PillBtn active={filterType === "all"} onClick={() => { setFilterType("all"); setPage(1); }}>Tous</PillBtn>
          {types.map((t) => <PillBtn key={t} active={filterType === t} onClick={() => { setFilterType(t); setPage(1); }}>{t}</PillBtn>)}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {paginatedItems.map((r) => {
          const cost = calcRecipeCost(r, ingredients);
          return (
            <button key={r.recipeId} onClick={() => navigate(`/recipes/${r.recipeId}`)} className="text-left border rounded-xl bg-card overflow-hidden hover:shadow-md transition-shadow group">
              {r.photos?.length ? (
                <img src={r.photos[0].url} alt={r.name} className="w-full h-40 object-cover" />
              ) : (
                <div className="h-1.5 bg-gradient-to-r from-primary to-accent" />
              )}
              <div className="p-4">
                <div className="inline-block px-2.5 py-0.5 rounded-full bg-muted text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{r.type}</div>
                <h3 className="font-serif text-lg font-bold mb-1 tracking-tight">{r.name}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{r.description}</p>
                <div className="flex gap-4 pt-3 border-t border-border/50 text-xs text-muted-foreground font-medium">
                  <span>{r.ingredients.length} ing.</span>
                  <span>Coût HT: {fmt(cost)}</span>
                  {r.pricing?.chosenPrice?.surPlace > 0 && <span>PV TVAC: {fmt(r.pricing.chosenPrice.surPlace)}</span>}
                </div>
              </div>
            </button>
          );
        })}
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
                  msg += ` — ${result.unmatchedIngredients.length} ingrédients non trouvés`;
                }
                toast({ title: `Import terminé — ${msg}` });
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

function PillBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${active ? "bg-foreground text-background border-foreground" : "bg-card hover:bg-muted"}`}>
      {children}
    </button>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
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
      <h2 className="font-serif text-xl font-bold mb-1">Importer des recettes</h2>
      <p className="text-xs text-muted-foreground mb-5">Formats supportés : <strong>CSV</strong> ou <strong>JSON</strong>. Les recettes existantes sont ignorées.</p>

      {step === "upload" && (
        <>
          <div className="flex flex-col items-center justify-center gap-2 p-10 border-2 border-dashed rounded-xl cursor-pointer text-muted-foreground hover:border-primary/40 transition-colors" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }} onClick={() => fileRef.current?.click()}>
            <Upload className="h-8 w-8" />
            <span className="text-sm font-medium">Glisser-déposer votre fichier CSV ou JSON</span>
            <span className="text-xs">ou cliquer pour parcourir</span>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.json" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          <div className="flex justify-between mt-5">
            <button onClick={downloadTemplate} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-muted"><Download className="h-4 w-4" /> Modèle CSV</button>
            <button onClick={onCancel} className="px-4 py-2 border rounded-lg text-sm font-medium">Annuler</button>
          </div>
        </>
      )}

      {step === "preview" && (
        <>
          <div className="flex justify-between items-center px-4 py-2.5 bg-muted rounded-lg mb-4">
            <span className="font-semibold text-sm">{fileName}</span>
            <div className="flex gap-2">
              <span className="px-2.5 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">{newCount} nouvelles</span>
              {dupCount > 0 && <span className="px-2.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">{dupCount} existantes</span>}
            </div>
          </div>
          {unmapped.length > 0 && (
            <div className="flex gap-2 items-start p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Colonnes non reconnues : {unmapped.map((c) => <code key={c} className="bg-amber-100 px-1 rounded mx-0.5">{c}</code>)}</span>
            </div>
          )}
          <div className="max-h-[340px] overflow-y-auto border rounded-xl">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b-2 border-border">
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Recette</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Type</th>
                  <th className="px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Portions</th>
                  <th className="px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Poids</th>
                  {hasIngredients && <th className="px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Ing.</th>}
                  <th className="px-3 py-2 w-6" />
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i} className={`border-b border-border/30 ${r.isDup ? "opacity-40" : ""}`}>
                    <td className="px-3 py-2 font-semibold">{r.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.type}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.portions}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.portionWeight}g</td>
                    {hasIngredients && <td className="px-3 py-2 text-right tabular-nums">{r.ingredientCount}</td>}
                    <td className="px-3 py-2 text-center">{r.isDup && <span title="Déjà existante" className="text-amber-500 text-xs">⚠</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between mt-5">
            <button onClick={() => setStep("upload")} disabled={importing} className="px-4 py-2 border rounded-lg text-sm font-medium disabled:opacity-50">Changer de fichier</button>
            <div className="flex gap-2">
              <button onClick={onCancel} disabled={importing} className="px-4 py-2 border rounded-lg text-sm font-medium disabled:opacity-50">Annuler</button>
              <button onClick={async () => { setImporting(true); await onImport(apiPayload); setImporting(false); }} disabled={newCount === 0 || importing} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium shadow-sm disabled:opacity-50">
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
