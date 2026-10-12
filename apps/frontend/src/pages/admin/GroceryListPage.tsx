import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, X, Copy, FileDown, FileSpreadsheet, GripVertical, Check, Pencil, ShoppingCart, Trash2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import type { GroceryList, GroceryListItem, Ingredient } from "@packages/types";
import { UNITS_QTY, PRICE_TO_QTY_UNIT, fmtQtyText, isoWeekOf, parseIsoWeek } from "@packages/types";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useFullBleed } from "@/components/admin/AdminLayout";
import { ListRow, SupplierTag, ActionMenu, NumericInput, SearchSelect, IngredientFormModal } from "@/components/ui";
import { fmt } from "@/lib/recipe-helpers";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const itemKey = (g: GroceryListItem) => `${g.ingredientId}:${g.unit}`;

export default function GroceryListPage() {
  useFullBleed(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const [list, setList] = useState<GroceryList | null>(null);
  const [title, setTitle] = useState("Liste de courses");
  const [items, setItems] = useState<GroceryListItem[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [savedLists, setSavedLists] = useState<GroceryList[]>([]);
  const [settingsSuppliers, setSettingsSuppliers] = useState<string[]>([]);
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
  const [hideChecked, setHideChecked] = useState(false);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [creatingIngredient, setCreatingIngredient] = useState<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const initialized = useRef(false);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const listId = list?.listId ?? null;

  const autoSave = useCallback(async (listId: string, t: string, i: GroceryListItem[]) => {
    if (savingRef.current) return;
    savingRef.current = true;
    dirtyRef.current = false;
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
    dirtyRef.current = false;
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
    if (!editing || !dirtyRef.current || saving) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (listId) autoSave(listId, title, items);
      else createAndSave(title, items);
    }, 800);
    return () => clearTimeout(autoSaveTimer.current);
  }, [title, items, listId, editing, saving, autoSave, createAndSave]);

  useEffect(() => {
    const init = async () => {
      const [lists, ings, settings] = await Promise.all([
        api.groceryLists.list().catch(() => [] as GroceryList[]),
        api.ingredients.list().catch(() => [] as Ingredient[]),
        api.settings.get().catch(() => null),
      ]);
      setSavedLists(lists);
      setAllIngredients(ings);
      setSettingsSuppliers((settings?.suppliers ?? []).map((s) => s.name));

      const idParam = searchParams.get("id");
      if (idParam) {
        const found = lists.find((l) => l.listId === idParam);
        if (found) { setList(found); setTitle(found.title); setItems(found.items); setEditing(true); }
      }
      setLoading(false);
      setTimeout(() => { initialized.current = true; }, 100);
    };
    init();
  }, []);

  const visibleItems = useMemo(() => hideChecked ? items.filter((g) => !g.checked) : items, [items, hideChecked]);
  const suppliers = useMemo(() => [...new Set(visibleItems.map((g) => g.supplier))].sort(), [visibleItems]);
  const grouped = useMemo(() => {
    const map: Record<string, GroceryListItem[]> = {};
    suppliers.forEach((s) => { map[s] = []; });
    visibleItems.forEach((g) => { map[g.supplier]?.push(g); });
    return map;
  }, [visibleItems, suppliers]);
  const moveTargets = useMemo(
    () => [...new Set([...settingsSuppliers, ...items.map((g) => g.supplier)])].filter(Boolean).sort(),
    [settingsSuppliers, items],
  );

  const usedIngIds = new Set(items.map((g) => g.ingredientId));
  const availableIngs = allIngredients.filter((i) => !usedIngIds.has(i.ingredientId));

  const getIdx = (item: GroceryListItem) =>
    items.findIndex((g) => g.ingredientId === item.ingredientId && g.unit === item.unit);

  const patchItem = (idx: number, patch: Partial<GroceryListItem>) => {
    dirtyRef.current = true;
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    setItems(next);
  };

  const removeItem = (idx: number) => {
    dirtyRef.current = true;
    setItems(items.filter((_, i) => i !== idx));
  };

  const toggleRow = (key: string) => {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleDrop = (targetSupplier: string) => {
    if (dragIdx === null) return;
    patchItem(dragIdx, { supplier: targetSupplier });
    setDragIdx(null);
    setDropSupplier(null);
  };

  const addItemFromIngredient = (ing: Ingredient, q: number, unit: string) => {
    dirtyRef.current = true;
    setItems((prev) => [...prev, {
      ingredientId: ing.ingredientId,
      name: ing.name,
      totalQty: q,
      unit,
      supplier: ing.supplier || "Autre",
      pricePerUnit: ing.price,
      priceUnit: ing.unit,
      checked: false,
    }]);
  };

  const addItem = () => {
    const ing = allIngredients.find((i) => i.ingredientId === newIngId);
    if (!ing || newIngQty <= 0) return;
    addItemFromIngredient(ing, newIngQty, newIngUnit);
    setNewIngId(""); setNewIngQty(0); setNewIngUnit("g");
    setAddingIng(false);
  };

  const handleCreateIngredient = async (data: Partial<Ingredient>) => {
    try {
      const created = await api.ingredients.create(data);
      setAllIngredients((prev) => [...prev, created]);
      setNewIngId(created.ingredientId);
      setNewIngUnit(PRICE_TO_QTY_UNIT[created.unit] || "g");
      setCreatingIngredient(null);
      toast({ title: "Ingrédient créé" });
    } catch {
      toast({ title: "Erreur lors de la création", variant: "destructive" });
    }
  };

  const selectList = (l: GroceryList) => {
    clearTimeout(autoSaveTimer.current);
    dirtyRef.current = false;
    setList(l); setTitle(l.title); setItems(l.items);
    setSearchParams({ id: l.listId }, { replace: true });
    setEditing(true); setMobileShowList(false); setOpenRows(new Set());
  };

  const startNewList = () => {
    clearTimeout(autoSaveTimer.current);
    dirtyRef.current = false;
    setList(null); setTitle("Nouvelle liste"); setItems([]);
    setSearchParams({}, { replace: true });
    setEditing(true); setMobileShowList(false); setOpenRows(new Set());
  };

  const deleteCurrent = async () => {
    if (!list) return;
    const id = list.listId;
    if (!confirm(`Supprimer « ${list.title} » ?`)) return;
    // Cancel the pending autosave so it cannot resurrect the deleted list.
    clearTimeout(autoSaveTimer.current);
    dirtyRef.current = false;
    setEditing(false);
    setList(null);
    setItems([]);
    setTitle("Liste de courses");
    setSearchParams({}, { replace: true });
    setMobileShowList(true);
    try {
      await api.groceryLists.delete(id);
      setSavedLists((prev) => prev.filter((l) => l.listId !== id));
    } catch {
      toast({ title: "Échec de la suppression de la liste", variant: "destructive" });
    }
  };

  const needQty = (g: GroceryListItem) => Math.max(0, g.totalQty - (g.haveQty ?? 0));

  const copyList = () => {
    const lines = items.map((g) => {
      const need = needQty(g);
      return `${g.checked ? "[✓]" : "[ ]"} ${g.name}\t${fmtQtyText(need, g.unit)}\t${g.supplier}`;
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
          fmtQtyText(g.totalQty, g.unit),
          g.haveQty != null ? fmtQtyText(g.haveQty, g.unit) : "-",
          fmtQtyText(needQty(g), g.unit),
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
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\s-]/g, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  const uncheckedCount = items.filter((g) => !g.checked).length;
  const weekOfList = list?.range ? isoWeekOf(list.range.from) : null;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <button
          type="button"
          onClick={startNewList}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-base font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-5 w-5" /> Nouvelle liste
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {savedLists.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">Aucune liste sauvegardée</p>
        ) : (
          savedLists.map((l) => {
            const isActive = list?.listId === l.listId;
            const checkedCount = l.items.filter((i) => i.checked).length;
            const date = new Date(l.updatedAt).toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
            return (
              <ListRow
                key={l.listId}
                onClick={() => selectList(l)}
                title={l.title}
                subtitle={[`${l.items.length} ingr.`, checkedCount > 0 ? `${checkedCount} cochés` : null, date].filter(Boolean).join(" · ")}
                className={isActive ? "bg-primary-soft hover:bg-primary-soft" : ""}
              />
            );
          })
        )}
      </div>
    </div>
  );

  const menuItems = [
    { label: "Exporter en PDF", icon: <FileDown className="h-4 w-4" />, onClick: exportPdf },
    { label: "Exporter en CSV", icon: <FileSpreadsheet className="h-4 w-4" />, onClick: exportCsv },
    { label: "Copier la liste", icon: <Copy className="h-4 w-4" />, onClick: copyList },
    ...(list ? [{ label: "Supprimer la liste", icon: <Trash2 className="h-4 w-4" />, onClick: deleteCurrent, variant: "danger" as const }] : []),
  ];

  const detail = (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b bg-background px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileShowList(true)}
            aria-label="Retour aux listes"
            className="-ml-2 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            {weekOfList && (
              <Link to={`/semaine/${weekOfList}`} className="inline-flex min-h-6 items-center text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4">
                Semaine {parseIsoWeek(weekOfList).week}
              </Link>
            )}
            {editingTitle ? (
              <input
                className="w-full border-b-2 border-primary bg-transparent text-h3 outline-none"
                value={title}
                onChange={(e) => { dirtyRef.current = true; setTitle(e.target.value); }}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingTitle(false); }}
                autoFocus
              />
            ) : (
              <button type="button" onClick={() => setEditingTitle(true)} className="group flex min-h-11 max-w-full items-center gap-2 text-left">
                <h2 className="truncate text-h3">{title}</h2>
                <Pencil className="reveal h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            )}
            <p className="text-sm text-muted-foreground">
              {uncheckedCount} à acheter · {items.length - uncheckedCount} cochés · {suppliers.length} fournisseur{suppliers.length > 1 ? "s" : ""}
              {saving && <span className="ml-2 text-caption">Sauvegarde…</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setHideChecked((v) => !v)}
              aria-pressed={hideChecked}
              className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${hideChecked ? "border-primary bg-primary text-primary-foreground" : "hover:bg-hover"}`}
            >
              {hideChecked ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="hidden sm:inline">{hideChecked ? "Afficher cochés" : "Masquer cochés"}</span>
            </button>
            <ActionMenu items={menuItems} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-doc">
          {addingIng ? (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-surface p-3">
              <SearchSelect
                options={availableIngs.map((ig) => ({ value: ig.ingredientId, label: ig.name, detail: `${fmt(ig.price)} ${ig.unit}` }))}
                value={newIngId}
                onChange={(v) => {
                  setNewIngId(v);
                  const ing = allIngredients.find((i) => i.ingredientId === v);
                  if (ing) setNewIngUnit(PRICE_TO_QTY_UNIT[ing.unit] || "g");
                }}
                placeholder="Rechercher un ingrédient…"
                className="min-w-[160px] flex-1"
                onCreateNew={(name) => setCreatingIngredient(name)}
              />
              <NumericInput className="input-field w-24 text-right tabular-nums" value={newIngQty} onChange={setNewIngQty} placeholder="Qté" />
              <select className="input-field w-auto" value={newIngUnit} onChange={(e) => setNewIngUnit(e.target.value)}>
                {UNITS_QTY.map((u) => <option key={u}>{u}</option>)}
              </select>
              <button type="button" onClick={addItem} disabled={!newIngId || newIngQty <= 0} className="min-h-11 rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground disabled:opacity-50">Ajouter</button>
              <button type="button" onClick={() => setAddingIng(false)} aria-label="Annuler" className="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingIng(true)}
              className="mb-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed text-base font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Plus className="h-5 w-5" /> Ajouter un ingrédient
            </button>
          )}

          {items.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              <ShoppingCart className="mx-auto mb-3 h-8 w-8 opacity-30" />
              <p className="text-base font-medium">Aucun ingrédient</p>
              <p className="mt-1 text-sm">Générez une liste depuis la semaine ou le jour, ou ajoutez manuellement</p>
            </div>
          )}

          {items.length > 0 && (
            <p className="pointer:block mb-3 hidden text-sm text-muted-foreground">
              Glissez un ingrédient vers un fournisseur pour le déplacer
            </p>
          )}

          {suppliers.map((supplier) => (
            <section
              key={supplier}
              className={`mb-4 rounded-lg border transition-colors ${dropSupplier === supplier ? "border-primary bg-primary-soft/40" : "border-border/60"}`}
              onDragOver={(e) => { e.preventDefault(); setDropSupplier(supplier); }}
              onDragLeave={() => setDropSupplier(null)}
              onDrop={(e) => { e.preventDefault(); handleDrop(supplier); }}
            >
              <header className="flex min-h-11 items-center gap-2 border-b border-border/40 px-3">
                <SupplierTag name={supplier} />
                <span className="text-sm text-muted-foreground">{grouped[supplier]?.length || 0}</span>
              </header>

              <div className="divide-y divide-border/40">
                {(grouped[supplier] || []).map((g) => {
                  const gIdx = getIdx(g);
                  const key = itemKey(g);
                  const need = needQty(g);
                  const open = openRows.has(key);
                  return (
                    <div
                      key={key}
                      draggable
                      onDragStart={() => setDragIdx(gIdx)}
                      onDragEnd={() => { setDragIdx(null); setDropSupplier(null); }}
                      className={`${dragIdx === gIdx ? "opacity-40" : ""} ${g.checked ? "opacity-60" : ""}`}
                    >
                      <div className="flex min-h-12 items-center gap-2 pr-2">
                        <span className="pointer:flex hidden w-6 shrink-0 cursor-grab items-center justify-center self-stretch text-muted-foreground/50" aria-hidden="true">
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <button
                          type="button"
                          onClick={() => patchItem(gIdx, { checked: !g.checked })}
                          aria-pressed={g.checked}
                          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-1 pl-2 text-left pointer:pl-0 hover:bg-hover"
                        >
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 ${g.checked ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>
                            {g.checked && <Check className="h-4 w-4" />}
                          </span>
                          <span className={`min-w-0 flex-1 truncate text-base ${g.checked ? "line-through text-muted-foreground" : ""}`}>{g.name}</span>
                          <span className={`shrink-0 text-base font-bold tabular-nums ${need > 0 ? "" : "text-success"}`}>
                            {need > 0 ? fmtQtyText(need, g.unit) : "✓"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleRow(key)}
                          aria-expanded={open}
                          className={`min-h-11 shrink-0 rounded-lg border px-3 text-sm font-medium transition-colors ${open ? "border-primary bg-primary-soft" : "hover:bg-hover"}`}
                        >
                          Stock
                        </button>
                      </div>

                      {open && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/40 bg-surface px-3 py-2">
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            Besoin
                            <NumericInput className="input-field input-compact w-20 text-right tabular-nums" value={g.totalQty} onChange={(v) => patchItem(gIdx, { totalQty: v })} />
                            <span>{g.unit}</span>
                          </label>
                          <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            En stock
                            <NumericInput className="input-field input-compact w-20 text-right tabular-nums" value={g.haveQty ?? 0} onChange={(v) => patchItem(gIdx, { haveQty: v > 0 ? v : undefined })} placeholder="0" autoFocus />
                            <span>{g.unit}</span>
                          </label>
                          <span className="text-sm text-muted-foreground tabular-nums">{fmt(g.pricePerUnit)} {g.priceUnit}</span>
                          <label className="pointer:hidden flex items-center gap-2 text-sm text-muted-foreground">
                            Déplacer vers
                            <select
                              className="input-field input-compact w-auto"
                              value={g.supplier}
                              onChange={(e) => patchItem(gIdx, { supplier: e.target.value })}
                            >
                              {moveTargets.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => removeItem(gIdx)}
                            className="ml-auto flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-destructive hover:bg-destructive-soft"
                          >
                            <X className="h-4 w-4" /> Retirer
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );

  const emptyState = (
    <div className="flex flex-1 items-center justify-center text-muted-foreground">
      <div className="text-center">
        <ShoppingCart className="mx-auto mb-3 h-10 w-10 opacity-20" />
        <p className="text-base font-medium">Sélectionnez une liste</p>
        <p className="mt-1 text-sm">ou créez-en une nouvelle</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-68px)] flex-col md:h-[100dvh]">
      <div className="hidden min-h-0 flex-1 md:flex">
        <div className="flex w-72 shrink-0 flex-col overflow-hidden border-r bg-surface">
          {sidebar}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {editing ? detail : emptyState}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {mobileShowList || !editing ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="border-b px-4 py-3">
              <h1 className="font-serif text-h2">Listes de courses</h1>
            </div>
            {sidebar}
          </div>
        ) : (
          detail
        )}
      </div>

      {creatingIngredient !== null && (
        <IngredientFormModal
          ingredient={{ name: creatingIngredient, price: 0, unit: "€/kg", supplier: settingsSuppliers[0] || "" }}
          supplierNames={settingsSuppliers}
          existing={allIngredients}
          onUseExisting={(ing) => {
            setNewIngId(ing.ingredientId);
            setNewIngUnit(PRICE_TO_QTY_UNIT[ing.unit] || "g");
            setCreatingIngredient(null);
          }}
          onSave={handleCreateIngredient}
          onCancel={() => setCreatingIngredient(null)}
        />
      )}
    </div>
  );
}
