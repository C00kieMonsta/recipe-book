import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, X, Copy, FileDown, FileSpreadsheet, GripVertical, Save, ChevronDown } from "lucide-react";
import type { Ingredient } from "@packages/types";
import { UNITS_QTY, PRICE_TO_QTY_UNIT } from "@packages/types";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import NumericInput from "@/components/ui/NumericInput";
import SearchSelect from "@/components/ui/SearchSelect";
import { fmt, supplierColor } from "@/lib/recipe-helpers";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface GroceryItem {
  ingredientId: string;
  name: string;
  totalQty: number;
  unit: string;
  supplier: string;
  pricePerUnit: number;
  priceUnit: string;
}

interface SavedGroceryList {
  id: string;
  title: string;
  items: GroceryItem[];
  savedAt: string;
}

interface PendingGroceryData {
  title: string;
  items: GroceryItem[];
  allIngredients: Ingredient[];
}

const STORAGE_KEY = "recipe-book:grocery-lists";
const PENDING_KEY = "recipe-book:grocery-list-pending";

function loadSavedLists(): SavedGroceryList[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function persistLists(lists: SavedGroceryList[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

export default function GroceryListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [title, setTitle] = useState("Liste de courses");
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [savedLists, setSavedLists] = useState<SavedGroceryList[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [addingIng, setAddingIng] = useState(false);
  const [newIngId, setNewIngId] = useState("");
  const [newIngQty, setNewIngQty] = useState(0);
  const [newIngUnit, setNewIngUnit] = useState<string>("g");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropSupplier, setDropSupplier] = useState<string | null>(null);

  useEffect(() => {
    const lists = loadSavedLists();
    setSavedLists(lists);

    const idParam = searchParams.get("id");
    if (idParam) {
      const saved = lists.find((l) => l.id === idParam);
      if (saved) {
        setTitle(saved.title);
        setItems(saved.items);
        setSavedId(saved.id);
      }
    } else {
      const pendingRaw = localStorage.getItem(PENDING_KEY);
      if (pendingRaw) {
        try {
          const pending: PendingGroceryData = JSON.parse(pendingRaw);
          setTitle(pending.title);
          setItems(pending.items);
          setAllIngredients(pending.allIngredients);
          localStorage.removeItem(PENDING_KEY);
          return;
        } catch {
          // ignore malformed data
        }
      }
    }

    api.ingredients.list().then(setAllIngredients).catch(() => {});
  }, []);

  const suppliers = useMemo(() => {
    const seen = new Set<string>();
    items.forEach((g) => seen.add(g.supplier));
    return [...seen].sort();
  }, [items]);

  const grouped = useMemo(() => {
    const map: Record<string, GroceryItem[]> = {};
    suppliers.forEach((s) => { map[s] = []; });
    items.forEach((g) => { map[g.supplier]?.push(g); });
    return map;
  }, [items, suppliers]);

  const usedIngIds = new Set(items.map((g) => g.ingredientId));
  const availableIngs = allIngredients.filter((i) => !usedIngIds.has(i.ingredientId));

  const getGlobalIdx = (item: GroceryItem) =>
    items.findIndex((g) => g.ingredientId === item.ingredientId && g.unit === item.unit);

  const updateQty = (idx: number, qty: number) => {
    const next = [...items];
    next[idx] = { ...next[idx], totalQty: qty };
    setItems(next);
  };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const handleDrop = (targetSupplier: string) => {
    if (dragIdx === null) return;
    const next = [...items];
    next[dragIdx] = { ...next[dragIdx], supplier: targetSupplier };
    setItems(next);
    setDragIdx(null);
    setDropSupplier(null);
  };

  const addItem = () => {
    const ing = allIngredients.find((i) => i.ingredientId === newIngId);
    if (!ing || newIngQty <= 0) return;
    setItems([...items, {
      ingredientId: ing.ingredientId,
      name: ing.name,
      totalQty: newIngQty,
      unit: newIngUnit,
      supplier: ing.supplier,
      pricePerUnit: ing.price,
      priceUnit: ing.unit,
    }]);
    setNewIngId("");
    setNewIngQty(0);
    setNewIngUnit("g");
    setAddingIng(false);
  };

  const saveList = () => {
    const lists = loadSavedLists();
    let updated: SavedGroceryList[];
    let currentId = savedId;

    if (savedId) {
      updated = lists.map((l) => l.id === savedId ? { ...l, title, items, savedAt: new Date().toISOString() } : l);
    } else {
      currentId = crypto.randomUUID();
      updated = [{ id: currentId, title, items, savedAt: new Date().toISOString() }, ...lists];
      setSavedId(currentId);
    }

    persistLists(updated);
    setSavedLists(updated);
    toast({ title: "Liste sauvegardée" });
  };

  const loadSaved = (list: SavedGroceryList) => {
    setTitle(list.title);
    setItems(list.items);
    setSavedId(list.id);
    setShowSaved(false);
  };

  const deleteSaved = (id: string) => {
    const updated = savedLists.filter((l) => l.id !== id);
    persistLists(updated);
    setSavedLists(updated);
    if (savedId === id) setSavedId(null);
  };

  const copyList = () => {
    const lines = items.map((g) => `${g.name}\t${Number(g.totalQty.toFixed(2))} ${g.unit}\t${g.supplier}`);
    navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: "Liste copiée dans le presse-papier" });
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    const m = 15;
    const today = new Date().toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(title, m, m + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(today, m, m + 14);

    let startY = m + 22;

    suppliers.forEach((supplier) => {
      const supplierItems = items.filter((g) => g.supplier === supplier);
      if (startY > 260) { doc.addPage(); startY = m; }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(supplier, m, startY + 5);
      startY += 8;

      autoTable(doc, {
        startY,
        head: [["", "Ingrédient", "Quantité", "Unité", "Prix/u"]],
        body: supplierItems.map((g) => [
          "",
          g.name,
          Number(g.totalQty.toFixed(2)).toString(),
          g.unit,
          `${fmt(g.pricePerUnit)} ${g.priceUnit}`,
        ]),
        margin: { left: m },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [60, 60, 60] },
        columnStyles: { 0: { cellWidth: 8 }, 2: { halign: "right" }, 4: { halign: "right" } },
        didDrawCell: (data) => {
          if (data.column.index === 0 && data.row.section === "body") {
            const sz = 3;
            doc.setDrawColor(100, 100, 100);
            doc.rect(data.cell.x + (data.cell.width - sz) / 2, data.cell.y + (data.cell.height - sz) / 2, sz, sz);
          }
        },
      });

      const lastTable = (doc as unknown as Record<string, unknown>).lastAutoTable as { finalY: number } | undefined;
      startY = (lastTable?.finalY ?? startY + 34) + 6;
    });

    doc.save(`${title.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\s-]/g, "")}.pdf`);
  };

  const exportCsv = () => {
    const sep = ";";
    const header = ["Ingrédient", "Quantité", "Unité", "Fournisseur", "Prix/u", "Unité prix"].join(sep);
    const rows = items.map((g) =>
      [g.name, Number(g.totalQty.toFixed(2)), g.unit, g.supplier, g.pricePerUnit, g.priceUnit].join(sep)
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\s-]/g, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-[1100px] mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-5">
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              className="text-3xl font-bold tracking-tight bg-transparent border-b-2 border-primary outline-none w-full"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingTitle(false); }}
              autoFocus
            />
          ) : (
            <h1
              className="text-3xl font-bold tracking-tight cursor-pointer hover:text-primary transition-colors truncate"
              onClick={() => setEditingTitle(true)}
              title="Cliquez pour modifier le titre"
            >
              {title}
            </h1>
          )}
          <p className="text-sm text-muted-foreground mt-1">
            {items.length} ingrédient{items.length > 1 ? "s" : ""} · {suppliers.length} fournisseur{suppliers.length > 1 ? "s" : ""}
            {savedId && <span className="ml-2 text-green-600">· Sauvegardée</span>}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {savedLists.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowSaved(!showSaved)}
                  className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs font-medium hover:bg-muted transition-colors"
                >
                  Mes listes <ChevronDown className="h-3 w-3" />
                </button>
                {showSaved && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSaved(false)} />
                    <div className="absolute right-0 top-full mt-1 w-72 bg-card border rounded-lg shadow-lg z-20 overflow-hidden">
                      {savedLists.map((l) => (
                        <div key={l.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/50 border-b border-border/30 last:border-0">
                          <button className="flex-1 text-left text-sm truncate" onClick={() => loadSaved(l)}>
                            <span className="block truncate">{l.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(l.savedAt).toLocaleDateString("fr-BE", { day: "numeric", month: "short" })}
                            </span>
                          </button>
                          <button onClick={() => deleteSaved(l.id)} className="text-muted-foreground hover:text-destructive shrink-0 p-0.5">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              onClick={saveList}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <Save className="h-3.5 w-3.5" /> Sauvegarder
            </button>
            <button onClick={exportPdf} className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs font-medium hover:bg-muted transition-colors">
              <FileDown className="h-3.5 w-3.5" /> PDF
            </button>
            <button onClick={exportCsv} className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs font-medium hover:bg-muted transition-colors">
              <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
            </button>
            <button onClick={copyList} className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs font-medium hover:bg-muted transition-colors">
              <Copy className="h-3.5 w-3.5" /> Copier
            </button>
          </div>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        <span className="text-muted-foreground/60">Glissez un ingrédient vers un fournisseur pour le déplacer</span>
      </p>

        {addingIng ? (
          <div className="mb-4 flex items-center gap-2 flex-wrap border rounded-lg p-3 bg-muted/20">
            <SearchSelect
              options={availableIngs.map((ig) => ({ value: ig.ingredientId, label: ig.name, detail: `${fmt(ig.price)} ${ig.unit}` }))}
              value={newIngId}
              onChange={(v) => {
                setNewIngId(v);
                const ing = allIngredients.find((i) => i.ingredientId === v);
                if (ing) setNewIngUnit(PRICE_TO_QTY_UNIT[ing.unit] || "g");
              }}
              placeholder="Rechercher un ingrédient…"
              className="flex-1 min-w-[160px]"
            />
            <NumericInput
              className="w-20 text-right px-2 py-1 border rounded-md bg-background text-xs tabular-nums focus:border-primary outline-none"
              value={newIngQty}
              onChange={setNewIngQty}
              placeholder="Qté"
            />
            <select
              className="border rounded-md px-1 py-1 text-xs bg-background focus:border-primary outline-none"
              value={newIngUnit}
              onChange={(e) => setNewIngUnit(e.target.value)}
            >
              {UNITS_QTY.map((u) => <option key={u}>{u}</option>)}
            </select>
            <button onClick={addItem} disabled={!newIngId || newIngQty <= 0} className="px-3 py-1 bg-primary text-primary-foreground rounded-md text-xs font-medium disabled:opacity-50">
              Ajouter
            </button>
            <button onClick={() => setAddingIng(false)} className="p-1 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          allIngredients.length > 0 && (
            <button
              onClick={() => setAddingIng(true)}
              className="mb-4 flex items-center gap-1.5 px-3 py-2 border border-dashed rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors w-full justify-center"
            >
              <Plus className="h-3.5 w-3.5" /> Ajouter un ingrédient
            </button>
          )
        )}

        {items.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="font-medium">Aucune liste de courses</p>
            <p className="text-xs mt-1">Générez une liste depuis la page événements</p>
          </div>
        )}

        {suppliers.map((supplier) => (
          <div
            key={supplier}
            className={`mb-4 rounded-lg border transition-colors ${dropSupplier === supplier ? "border-primary bg-primary/5" : "border-border/40"}`}
            onDragOver={(e) => { e.preventDefault(); setDropSupplier(supplier); }}
            onDragLeave={() => setDropSupplier(null)}
            onDrop={(e) => { e.preventDefault(); handleDrop(supplier); }}
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: supplierColor(supplier) }} />
              <span className="text-sm font-bold">{supplier}</span>
              <span className="text-xs text-muted-foreground">({grouped[supplier]?.length || 0})</span>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {(grouped[supplier] || []).map((g) => {
                  const gIdx = getGlobalIdx(g);
                  return (
                    <tr
                      key={`${g.ingredientId}:${g.unit}`}
                      draggable
                      onDragStart={() => setDragIdx(gIdx)}
                      onDragEnd={() => { setDragIdx(null); setDropSupplier(null); }}
                      className={`border-b border-border/20 last:border-0 hover:bg-muted/30 cursor-grab active:cursor-grabbing ${dragIdx === gIdx ? "opacity-40" : ""}`}
                    >
                      <td className="pl-3 py-1.5 w-6 text-muted-foreground/40"><GripVertical className="h-3.5 w-3.5" /></td>
                      <td className="px-2 py-1.5 font-medium">{g.name}</td>
                      <td className="px-2 py-1.5 w-36">
                        <div className="flex items-center justify-end gap-1">
                          <NumericInput
                            className="w-20 text-right px-2 py-0.5 border rounded-md bg-background text-xs tabular-nums focus:border-primary outline-none"
                            value={g.totalQty}
                            onChange={(v) => updateQty(gIdx, v)}
                          />
                          <span className="text-xs text-muted-foreground w-8">{g.unit}</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground text-xs w-24">
                        {fmt(g.pricePerUnit)} {g.priceUnit}
                      </td>
                      <td className="pr-2 py-1.5 w-8">
                        <button onClick={() => removeItem(gIdx)} className="p-0.5 text-muted-foreground hover:text-destructive transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
