import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, X, Copy, FileDown, FileSpreadsheet, GripVertical, Check, Pencil, ShoppingCart, Trash2, ArrowLeft } from "lucide-react";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const [list, setList] = useState<GroceryList | null>(null);
  const [title, setTitle] = useState("Liste de courses");
  const [items, setItems] = useState<GroceryListItem[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [savedLists, setSavedLists] = useState<GroceryList[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [addingIng, setAddingIng] = useState(false);
  const [newIngId, setNewIngId] = useState("");
  const [newIngQty, setNewIngQty] = useState(0);
  const [newIngUnit, setNewIngUnit] = useState<string>("g");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropSupplier, setDropSupplier] = useState<string | null>(null);
  const [mobileShowList, setMobileShowList] = useState(false);
  const [editing, setEditing] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const initialized = useRef(false);
  const savingRef = useRef(false);

  const autoSave = useCallback(async (listId: string, t: string, i: GroceryListItem[]) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const updated = await api.groceryLists.update(listId, { title: t, items: i });
      setList(updated);
      setSavedLists((prev) => prev.map((l) => l.listId === updated.listId ? updated : l));
    } catch { /* silent */ }
    finally { savingRef.current = false; setSaving(false); }
  }, []);

  const createAndSave = useCallback(async (t: string, i: GroceryListItem[]) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const created = await api.groceryLists.create({ title: t, items: i });
      setList(created);
      setSavedLists((prev) => [created, ...prev]);
      setSearchParams({ id: created.listId }, { replace: true });
    } catch { /* silent */ }
    finally { savingRef.current = false; setSaving(false); }
  }, [setSearchParams]);

  useEffect(() => {
    if (!initialized.current) return;
    if (!editing) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (list) {
        autoSave(list.listId, title, items);
      } else {
        createAndSave(title, items);
      }
    }, 800);
    return () => clearTimeout(autoSaveTimer.current);
  }, [title, items, list, editing, autoSave, createAndSave]);

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
        if (found) { setList(found); setTitle(found.title); setItems(found.items); setEditing(true); }
      } else {
        const pendingRaw = localStorage.getItem(PENDING_KEY);
        if (pendingRaw) {
          try {
            const pending: PendingGroceryData = JSON.parse(pendingRaw);
            setTitle(pending.title);
            setItems(pending.items.map((i) => ({ ...i, checked: false })));
            localStorage.removeItem(PENDING_KEY);
            setEditing(true);
          } catch { /* ignore */ }
        }
      }
      setLoading(false);
      setTimeout(() => { initialized.current = true; }, 100);
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

  const selectList = (l: GroceryList) => {
    setList(l); setTitle(l.title); setItems(l.items);
    setSearchParams({ id: l.listId }, { replace: true });
    setEditing(true); setMobileShowList(false);
  };

  const startNewList = () => {
    setList(null); setTitle("Nouvelle liste"); setItems([]);
    setSearchParams({}, { replace: true });
    setEditing(true); setMobileShowList(false);
  };

  const deleteSaved = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const target = savedLists.find((l) => l.listId === id);
    if (!confirm(`Supprimer « ${target?.title ?? "cette liste"} » ?`)) return;
    await api.groceryLists.delete(id).catch(() => {});
    setSavedLists((prev) => prev.filter((l) => l.listId !== id));
    if (list?.listId === id) startNewList();
  };

  const needQty = (g: GroceryListItem) => Math.max(0, g.totalQty - (g.haveQty ?? 0));

  const copyList = () => {
    const lines = items.map((g) => {
      const need = needQty(g);
      return `${g.checked ? "[✓]" : "[ ]"} ${g.name}\t${need} ${g.unit}\t${g.supplier}`;
    });
    navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: "Liste copiée dans le presse-papier" });
  };

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

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <button
          onClick={startNewList}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-3.5 w-3.5" /> Nouvelle liste
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {savedLists.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Aucune liste sauvegardée
          </div>
        ) : (
          savedLists.map((l) => {
            const isActive = list?.listId === l.listId;
            const checkedCount = l.items.filter((i) => i.checked).length;
            return (
              <div
                key={l.listId}
                onClick={() => selectList(l)}
                className={`w-full text-left px-3 py-2.5 border-b border-border/20 transition-colors group cursor-pointer ${isActive ? "bg-primary/8 border-l-2 border-l-primary" : "hover:bg-muted/50"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm truncate ${isActive ? "font-semibold" : "font-medium"}`}>{l.title}</span>
                  <button
                    onClick={(e) => deleteSaved(l.listId, e)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-all shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                  <span>{l.items.length} ingr.</span>
                  {checkedCount > 0 && <span>· {checkedCount} cochés</span>}
                  <span className="ml-auto">{new Date(l.updatedAt).toLocaleDateString("fr-BE", { day: "numeric", month: "short" })}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const detail = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Detail header */}
      <div className="shrink-0 px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-3 mb-1">
          {/* Mobile back button */}
          <button onClick={() => setMobileShowList(true)} className="md:hidden p-1 -ml-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                className="text-lg font-bold tracking-tight bg-transparent border-b-2 border-primary outline-none w-full"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingTitle(false); }}
                autoFocus
              />
            ) : (
              <h2 className="text-lg font-bold tracking-tight flex items-center gap-2 cursor-pointer group" onClick={() => setEditingTitle(true)}>
                <span className="truncate">{title}</span>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </h2>
            )}
            <p className="text-xs text-muted-foreground">
              {uncheckedCount} à acheter · {items.length - uncheckedCount} cochés · {suppliers.length} fournisseur{suppliers.length > 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`text-[10px] text-muted-foreground tabular-nums transition-opacity ${saving ? "opacity-100" : "opacity-0"}`}>
              Sauvegarde…
            </span>
            <button onClick={exportPdf} className="p-1.5 border rounded-lg text-xs hover:bg-muted transition-colors" title="PDF">
              <FileDown className="h-3.5 w-3.5" />
            </button>
            <button onClick={exportCsv} className="p-1.5 border rounded-lg text-xs hover:bg-muted transition-colors" title="CSV">
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </button>
            <button onClick={copyList} className="p-1.5 border rounded-lg text-xs hover:bg-muted transition-colors" title="Copier">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Detail body */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Add ingredient */}
        {addingIng ? (
          <div className="mb-3 flex items-center gap-2 flex-wrap border rounded-lg p-3 bg-muted/20">
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
          <button onClick={() => setAddingIng(true)} className="mb-3 flex items-center gap-1.5 px-3 py-1.5 border border-dashed rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors w-full justify-center">
            <Plus className="h-3.5 w-3.5" /> Ajouter un ingrédient
          </button>
        )}

        {items.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <ShoppingCart className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-sm">Aucun ingrédient</p>
            <p className="text-xs mt-1">Générez une liste depuis les événements ou ajoutez manuellement</p>
          </div>
        )}

        {items.length > 0 && (
          <p className="text-xs text-muted-foreground mb-2">
            Glissez un ingrédient vers un fournisseur pour le déplacer
          </p>
        )}

        {suppliers.map((supplier) => (
          <div
            key={supplier}
            className={`mb-3 rounded-lg border transition-colors ${dropSupplier === supplier ? "border-primary bg-primary/5" : "border-border/40"}`}
            onDragOver={(e) => { e.preventDefault(); setDropSupplier(supplier); }}
            onDragLeave={() => setDropSupplier(null)}
            onDrop={(e) => { e.preventDefault(); handleDrop(supplier); }}
          >
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: supplierColor(supplier) }} />
              <span className="text-xs font-bold">{supplier}</span>
              <span className="text-[10px] text-muted-foreground">({grouped[supplier]?.length || 0})</span>
            </div>

            {/* Desktop table */}
            <table className="w-full text-sm hidden lg:table">
              <thead>
                <tr className="border-b border-border/20 text-xs text-muted-foreground">
                  <th className="w-5 pl-2 py-1" />
                  <th className="w-7 py-1" />
                  <th className="px-2 py-1 text-left">Ingrédient</th>
                  <th className="px-2 py-1 text-right">Besoin</th>
                  <th className="px-2 py-1 text-right w-32">En stock</th>
                  <th className="px-2 py-1 text-right font-semibold">À acheter</th>
                  <th className="px-2 py-1 text-right text-muted-foreground">Prix/u</th>
                  <th className="w-7 pr-2 py-1" />
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
                      <td className="pl-2 py-1.5 w-5 text-muted-foreground/40 cursor-grab"><GripVertical className="h-3 w-3" /></td>
                      <td className="py-1.5 w-7">
                        <button
                          onClick={() => patchItem(gIdx, { checked: !g.checked })}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${g.checked ? "bg-primary border-primary text-primary-foreground" : "border-border hover:border-primary"}`}
                        >
                          {g.checked && <Check className="h-3 w-3" />}
                        </button>
                      </td>
                      <td className={`px-2 py-1.5 text-xs font-medium ${g.checked ? "line-through text-muted-foreground" : ""}`}>{g.name}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground text-xs whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <NumericInput className="w-14 text-right px-1 py-0.5 border rounded bg-background text-xs tabular-nums focus:border-primary outline-none" value={g.totalQty} onChange={(v) => patchItem(gIdx, { totalQty: v })} />
                          <span className="w-6 text-left text-[10px]">{g.unit}</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 w-32">
                        <div className="flex items-center justify-end gap-1">
                          <NumericInput className="w-14 text-right px-1 py-0.5 border rounded bg-background text-xs tabular-nums focus:border-primary outline-none" value={g.haveQty ?? 0} onChange={(v) => patchItem(gIdx, { haveQty: v > 0 ? v : undefined })} placeholder="0" />
                          <span className="w-6 text-left text-[10px] text-muted-foreground">{g.unit}</span>
                        </div>
                      </td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-semibold whitespace-nowrap text-xs ${need > 0 ? "" : "text-green-600"}`}>
                        {need > 0 ? `${Number(need.toFixed(2))} ${g.unit}` : "✓"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground text-[10px] whitespace-nowrap">{fmt(g.pricePerUnit)} {g.priceUnit}</td>
                      <td className="pr-2 py-1.5 w-7">
                        <button onClick={() => removeItem(gIdx)} className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"><X className="h-3 w-3" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile / tablet cards */}
            <div className="lg:hidden divide-y divide-border/20">
              {(grouped[supplier] || []).map((g) => {
                const gIdx = getIdx(g);
                const need = needQty(g);
                return (
                  <div key={`${g.ingredientId}:${g.unit}`} className={`px-3 py-2 ${g.checked ? "opacity-50" : ""}`}>
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => patchItem(gIdx, { checked: !g.checked })}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${g.checked ? "bg-primary border-primary text-primary-foreground" : "border-border hover:border-primary"}`}
                      >
                        {g.checked && <Check className="h-3 w-3" />}
                      </button>
                      <span className={`text-sm font-medium flex-1 min-w-0 truncate ${g.checked ? "line-through text-muted-foreground" : ""}`}>{g.name}</span>
                      <span className={`text-xs font-semibold tabular-nums shrink-0 ${need > 0 ? "" : "text-green-600"}`}>
                        {need > 0 ? `${Number(need.toFixed(2))} ${g.unit}` : "✓"}
                      </span>
                      <button onClick={() => removeItem(gIdx)} className="p-0.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"><X className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="flex items-center gap-3 ml-[30px] mt-1 text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <span>Besoin:</span>
                        <NumericInput className="w-12 text-right px-1 py-0.5 border rounded bg-background tabular-nums focus:border-primary outline-none" value={g.totalQty} onChange={(v) => patchItem(gIdx, { totalQty: v })} />
                        <span>{g.unit}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span>Stock:</span>
                        <NumericInput className="w-12 text-right px-1 py-0.5 border rounded bg-background tabular-nums focus:border-primary outline-none" value={g.haveQty ?? 0} onChange={(v) => patchItem(gIdx, { haveQty: v > 0 ? v : undefined })} placeholder="0" />
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
    </div>
  );

  const emptyState = (
    <div className="flex-1 flex items-center justify-center text-muted-foreground">
      <div className="text-center">
        <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-20" />
        <p className="font-medium text-sm">Sélectionnez une liste</p>
        <p className="text-xs mt-1">ou créez-en une nouvelle</p>
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col -m-6">
      {/* Desktop: side-by-side */}
      <div className="hidden md:flex flex-1 min-h-0">
        {/* Left sidebar */}
        <div className="w-64 xl:w-72 border-r bg-muted/20 shrink-0 flex flex-col overflow-hidden">
          {sidebar}
        </div>
        {/* Right detail */}
        <div className="flex-1 min-w-0 flex flex-col">
          {editing ? detail : emptyState}
        </div>
      </div>

      {/* Mobile: toggle between list and detail */}
      <div className="flex flex-col flex-1 min-h-0 md:hidden">
        {mobileShowList || !editing ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b">
              <h1 className="text-lg font-bold">Listes de courses</h1>
            </div>
            {sidebar}
          </div>
        ) : (
          detail
        )}
      </div>
    </div>
  );
}
