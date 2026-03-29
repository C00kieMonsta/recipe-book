import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, X, Copy, FileDown, FileSpreadsheet, GripVertical, Save, ChevronDown, Check, Pencil } from "lucide-react";
import type { GroceryList, GroceryListItem, Ingredient } from "@packages/types";
import { UNITS_QTY, PRICE_TO_QTY_UNIT } from "@packages/types";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import NumericInput from "@/components/ui/NumericInput";
import SearchSelect from "@/components/ui/SearchSelect";
import { fmt, supplierColor } from "@/lib/recipe-helpers";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface PendingGroceryData {
  title: string;
  items: Omit<GroceryListItem, "checked">[];
  allIngredients: Ingredient[];
}

const PENDING_KEY = "recipe-book:grocery-list-pending";

export default function GroceryListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [list, setList] = useState<GroceryList | null>(null);
  const [title, setTitle] = useState("Liste de courses");
  const [items, setItems] = useState<GroceryListItem[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [savedLists, setSavedLists] = useState<GroceryList[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSaved, setShowSaved] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [addingIng, setAddingIng] = useState(false);
  const [newIngId, setNewIngId] = useState("");
  const [newIngQty, setNewIngQty] = useState(0);
  const [newIngUnit, setNewIngUnit] = useState<string>("g");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropSupplier, setDropSupplier] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const [lists, ings] = await Promise.all([
        api.groceryLists.list().catch(() => [] as GroceryList[]),
        api.ingredients.list().catch(() => [] as Ingredient[]),
      ]);
      setSavedLists(lists);
      setAllIngredients(ings);

      const idParam = searchParams.get("id");
      if (idParam) {
        const found = lists.find((l) => l.listId === idParam);
        if (found) { setList(found); setTitle(found.title); setItems(found.items); }
      } else {
        const pendingRaw = localStorage.getItem(PENDING_KEY);
        if (pendingRaw) {
          try {
            const pending: PendingGroceryData = JSON.parse(pendingRaw);
            setTitle(pending.title);
            setItems(pending.items.map((i) => ({ ...i, checked: false })));
            localStorage.removeItem(PENDING_KEY);
          } catch { /* ignore */ }
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const suppliers = useMemo(() => [...new Set(items.map((g) => g.supplier))].sort(), [items]);
  const grouped = useMemo(() => {
    const map: Record<string, GroceryListItem[]> = {};
    suppliers.forEach((s) => { map[s] = []; });
    items.forEach((g) => { map[g.supplier]?.push(g); });
    return map;
  }, [items, suppliers]);

  const usedIngIds = new Set(items.map((g) => g.ingredientId));
  const availableIngs = allIngredients.filter((i) => !usedIngIds.has(i.ingredientId));

  const getIdx = (item: GroceryListItem) =>
    items.findIndex((g) => g.ingredientId === item.ingredientId && g.unit === item.unit);

  const patchItem = (idx: number, patch: Partial<GroceryListItem>) => {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    setItems(next);
  };

  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const handleDrop = (targetSupplier: string) => {
    if (dragIdx === null) return;
    patchItem(dragIdx, { supplier: targetSupplier });
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
      checked: false,
    }]);
    setNewIngId(""); setNewIngQty(0); setNewIngUnit("g");
    setAddingIng(false);
  };

  const saveList = async () => {
    setSaving(true);
    try {
      if (list) {
        const updated = await api.groceryLists.update(list.listId, { title, items });
        setList(updated);
        setSavedLists((prev) => prev.map((l) => l.listId === updated.listId ? updated : l));
      } else {
        const created = await api.groceryLists.create({ title, items });
        setList(created);
        setSavedLists((prev) => [created, ...prev]);
        navigate(`/grocery-list?id=${created.listId}`, { replace: true });
      }
      toast({ title: "Liste sauvegardée" });
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const loadSaved = (l: GroceryList) => {
    setList(l); setTitle(l.title); setItems(l.items);
    setShowSaved(false);
    navigate(`/grocery-list?id=${l.listId}`, { replace: true });
  };

  const deleteSaved = async (id: string) => {
    await api.groceryLists.delete(id).catch(() => {});
    setSavedLists((prev) => prev.filter((l) => l.listId !== id));
    if (list?.listId === id) { setList(null); setItems([]); setTitle("Liste de courses"); }
  };

  const copyList = () => {
    const lines = items.map((g) => {
      const need = needQty(g);
      return `${g.checked ? "[✓]" : "[ ]"} ${g.name}\t${need} ${g.unit}\t${g.supplier}`;
    });
    navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: "Liste copiée dans le presse-papier" });
  };

  const needQty = (g: GroceryListItem) => Math.max(0, g.totalQty - (g.haveQty ?? 0));

  const exportPdf = () => {
    const doc = new jsPDF();
    const m = 15;
    const today = new Date().toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(18);
    doc.text(title, m, m + 7);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(today, m, m + 14);
    let startY = m + 22;
    suppliers.forEach((supplier) => {
      const supplierItems = items.filter((g) => g.supplier === supplier);
      if (startY > 260) { doc.addPage(); startY = m; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.text(supplier, m, startY + 5);
      startY += 8;
      autoTable(doc, {
        startY,
        head: [["", "Ingrédient", "Besoin", "En stock", "À acheter", "Prix/u"]],
        body: supplierItems.map((g) => [
          g.checked ? "✓" : "",
          g.name,
          `${Number(g.totalQty.toFixed(2))} ${g.unit}`,
          g.haveQty != null ? `${Number(g.haveQty.toFixed(2))} ${g.unit}` : "—",
          `${Number(needQty(g).toFixed(2))} ${g.unit}`,
          `${fmt(g.pricePerUnit)} ${g.priceUnit}`,
        ]),
        margin: { left: m },
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [60, 60, 60] },
        columnStyles: {
          0: { cellWidth: 8, halign: "center" },
          2: { halign: "right" }, 3: { halign: "right" },
          4: { halign: "right" }, 5: { halign: "right" },
        },
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
    const header = ["Statut", "Ingrédient", "Besoin", "En stock", "À acheter", "Unité", "Fournisseur", "Prix/u", "Unité prix"].join(sep);
    const rows = items.map((g) => [
      g.checked ? "✓" : "",
      g.name,
      Number(g.totalQty.toFixed(2)),
      g.haveQty != null ? Number(g.haveQty.toFixed(2)) : "",
      Number(needQty(g).toFixed(2)),
      g.unit, g.supplier, g.pricePerUnit, g.priceUnit,
    ].join(sep));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\s-]/g, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  const uncheckedCount = items.filter((g) => !g.checked).length;

  return (
    <div className="max-w-[1100px] mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-5">
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>

      {/* Header */}
      <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
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
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 cursor-pointer group" onClick={() => setEditingTitle(true)}>
              {title}
              <Pencil className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </h1>
          )}
          <p className="text-sm text-muted-foreground mt-1">
            {uncheckedCount} à acheter · {items.length - uncheckedCount} cochés · {suppliers.length} fournisseur{suppliers.length > 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {savedLists.length > 0 && (
            <div className="relative">
              <button onClick={() => setShowSaved(!showSaved)} className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs font-medium hover:bg-muted transition-colors">
                Mes listes <ChevronDown className="h-3 w-3" />
              </button>
              {showSaved && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSaved(false)} />
                  <div className="absolute right-0 top-full mt-1 w-72 bg-card border rounded-lg shadow-lg z-20 overflow-hidden">
                    {savedLists.map((l) => (
                      <div key={l.listId} className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/50 border-b border-border/30 last:border-0">
                        <button className="flex-1 text-left min-w-0" onClick={() => loadSaved(l)}>
                          <span className="block text-sm truncate">{l.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {l.items.length} ingr. · {new Date(l.updatedAt).toLocaleDateString("fr-BE", { day: "numeric", month: "short" })}
                          </span>
                        </button>
                        <button onClick={() => deleteSaved(l.listId)} className="text-muted-foreground hover:text-destructive shrink-0 p-0.5">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button onClick={saveList} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            <Save className="h-3.5 w-3.5" /> {saving ? "…" : "Sauvegarder"}
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

      {/* Add ingredient */}
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
          <NumericInput className="w-20 text-right px-2 py-1 border rounded-md bg-background text-xs tabular-nums focus:border-primary outline-none" value={newIngQty} onChange={setNewIngQty} placeholder="Qté" />
          <select className="border rounded-md px-1 py-1 text-xs bg-background focus:border-primary outline-none" value={newIngUnit} onChange={(e) => setNewIngUnit(e.target.value)}>
            {UNITS_QTY.map((u) => <option key={u}>{u}</option>)}
          </select>
          <button onClick={addItem} disabled={!newIngId || newIngQty <= 0} className="px-3 py-1 bg-primary text-primary-foreground rounded-md text-xs font-medium disabled:opacity-50">Ajouter</button>
          <button onClick={() => setAddingIng(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <button onClick={() => setAddingIng(true)} className="mb-4 flex items-center gap-1.5 px-3 py-2 border border-dashed rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors w-full justify-center">
          <Plus className="h-3.5 w-3.5" /> Ajouter un ingrédient
        </button>
      )}

      {items.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="font-medium">Aucun ingrédient</p>
          <p className="text-xs mt-1">Générez une liste depuis la page événements ou ajoutez des ingrédients manuellement</p>
        </div>
      )}

      {/* Grouped by supplier */}
      <p className="text-xs text-muted-foreground mb-3">
        Glissez un ingrédient vers un fournisseur pour le déplacer
      </p>
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

          {/* Desktop table */}
          <table className="w-full text-sm hidden md:table">
            <thead>
              <tr className="border-b border-border/20 text-xs text-muted-foreground">
                <th className="w-6 pl-3 py-1" />
                <th className="w-8 py-1" />
                <th className="px-2 py-1 text-left">Ingrédient</th>
                <th className="px-2 py-1 text-right">Besoin total</th>
                <th className="px-2 py-1 text-right w-36">En stock</th>
                <th className="px-2 py-1 text-right font-semibold">À acheter</th>
                <th className="px-2 py-1 text-right text-muted-foreground">Prix/u</th>
                <th className="w-8 pr-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {(grouped[supplier] || []).map((g) => {
                const gIdx = getIdx(g);
                const need = needQty(g);
                return (
                  <tr
                    key={`${g.ingredientId}:${g.unit}`}
                    draggable
                    onDragStart={() => setDragIdx(gIdx)}
                    onDragEnd={() => { setDragIdx(null); setDropSupplier(null); }}
                    className={`border-b border-border/20 last:border-0 hover:bg-muted/30 transition-colors ${dragIdx === gIdx ? "opacity-40" : ""} ${g.checked ? "opacity-50" : ""}`}
                  >
                    <td className="pl-3 py-2 w-6 text-muted-foreground/40 cursor-grab"><GripVertical className="h-3.5 w-3.5" /></td>
                    <td className="py-2 w-8">
                      <button
                        onClick={() => patchItem(gIdx, { checked: !g.checked })}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${g.checked ? "bg-primary border-primary text-primary-foreground" : "border-border hover:border-primary"}`}
                      >
                        {g.checked && <Check className="h-3 w-3" />}
                      </button>
                    </td>
                    <td className={`px-2 py-2 font-medium ${g.checked ? "line-through text-muted-foreground" : ""}`}>{g.name}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground text-xs whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <NumericInput className="w-16 text-right px-1.5 py-0.5 border rounded bg-background text-xs tabular-nums focus:border-primary outline-none" value={g.totalQty} onChange={(v) => patchItem(gIdx, { totalQty: v })} />
                        <span className="w-8 text-left">{g.unit}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2 w-36">
                      <div className="flex items-center justify-end gap-1">
                        <NumericInput className="w-16 text-right px-1.5 py-0.5 border rounded bg-background text-xs tabular-nums focus:border-primary outline-none" value={g.haveQty ?? 0} onChange={(v) => patchItem(gIdx, { haveQty: v > 0 ? v : undefined })} placeholder="0" />
                        <span className="w-8 text-left text-xs text-muted-foreground">{g.unit}</span>
                      </div>
                    </td>
                    <td className={`px-2 py-2 text-right tabular-nums font-semibold whitespace-nowrap text-sm ${need > 0 ? "" : "text-green-600"}`}>
                      {need > 0 ? `${Number(need.toFixed(2))} ${g.unit}` : "✓ OK"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground text-xs whitespace-nowrap">{fmt(g.pricePerUnit)} {g.priceUnit}</td>
                    <td className="pr-2 py-2 w-8">
                      <button onClick={() => removeItem(gIdx)} className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"><X className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border/20">
            {(grouped[supplier] || []).map((g) => {
              const gIdx = getIdx(g);
              const need = needQty(g);
              return (
                <div key={`${g.ingredientId}:${g.unit}`} className={`p-3 ${g.checked ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <button
                      onClick={() => patchItem(gIdx, { checked: !g.checked })}
                      className={`w-6 h-6 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${g.checked ? "bg-primary border-primary text-primary-foreground" : "border-border hover:border-primary"}`}
                    >
                      {g.checked && <Check className="h-3.5 w-3.5" />}
                    </button>
                    <span className={`font-medium flex-1 ${g.checked ? "line-through text-muted-foreground" : ""}`}>{g.name}</span>
                    <span className={`text-sm font-semibold tabular-nums ${need > 0 ? "" : "text-green-600"}`}>
                      {need > 0 ? `${Number(need.toFixed(2))} ${g.unit}` : "✓ OK"}
                    </span>
                    <button onClick={() => removeItem(gIdx)} className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex items-center gap-4 ml-9 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <span>Besoin:</span>
                      <NumericInput className="w-14 text-right px-1.5 py-0.5 border rounded bg-background tabular-nums focus:border-primary outline-none" value={g.totalQty} onChange={(v) => patchItem(gIdx, { totalQty: v })} />
                      <span>{g.unit}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>En stock:</span>
                      <NumericInput className="w-14 text-right px-1.5 py-0.5 border rounded bg-background tabular-nums focus:border-primary outline-none" value={g.haveQty ?? 0} onChange={(v) => patchItem(gIdx, { haveQty: v > 0 ? v : undefined })} placeholder="0" />
                      <span>{g.unit}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
