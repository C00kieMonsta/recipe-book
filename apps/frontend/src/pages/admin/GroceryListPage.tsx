import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, X, Copy, FileDown, FileSpreadsheet, GripVertical, Trash2, Printer, Calendar, ShoppingCart, Store } from "lucide-react";
import type { GroceryList, GroceryListItem, Ingredient } from "@packages/types";
import { UNITS_QTY, PRICE_TO_QTY_UNIT, fmtQtyText, isoWeekOf, parseIsoWeek } from "@packages/types";
import { useToast } from "@/hooks/use-toast";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { api } from "@/lib/api";
import { rangeLabel, todayIso } from "@/lib/dates";
import { useBackLink, useTopTitle } from "@/components/admin/AdminLayout";
import {
  SupplierTag,
  ActionMenu,
  NumericInput,
  SearchSelect,
  IngredientFormModal,
  PageHeader,
  Button,
  IconButton,
  Checkbox,
  PropertyList,
  Property,
  SelectPill,
  Table,
  EmptyState,
  Tag,
} from "@/components/ui";
import { fmt, fmtUnitPrice } from "@/lib/recipe-helpers";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const itemKey = (g: GroceryListItem) => `${g.ingredientId}:${g.unit}`;

const ROW = "group flex min-h-8 items-center gap-2 rounded px-1 hover:bg-hover touch:min-h-11";

export default function GroceryListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const isTouch = useTouchScreen();

  const [list, setList] = useState<GroceryList | null>(null);
  const [title, setTitle] = useState("Liste de courses");
  const [items, setItems] = useState<GroceryListItem[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [savedLists, setSavedLists] = useState<GroceryList[]>([]);
  const [settingsSuppliers, setSettingsSuppliers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addingIng, setAddingIng] = useState(false);
  const [newIngId, setNewIngId] = useState("");
  const [newIngQty, setNewIngQty] = useState(0);
  const [newIngUnit, setNewIngUnit] = useState<string>("g");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropSupplier, setDropSupplier] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [hideChecked, setHideChecked] = useState(false);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [creatingIngredient, setCreatingIngredient] = useState<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const initialized = useRef(false);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const listId = list?.listId ?? null;
  const idParam = searchParams.get("id");

  const weekOfList = list?.range ? isoWeekOf(list.range.from) : null;
  useBackLink(editing ? { to: "/grocery-list", label: "Courses" } : null);
  useTopTitle(editing ? title : "Courses");

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

      const id = searchParams.get("id");
      if (id) {
        const found = lists.find((l) => l.listId === id);
        if (found) { setList(found); setTitle(found.title); setItems(found.items); setEditing(true); }
      }
      setLoading(false);
      setTimeout(() => { initialized.current = true; }, 100);
    };
    init();
  }, []);

  // Back navigation to /grocery-list without an id shows the index again.
  useEffect(() => {
    if (!initialized.current) return;
    if (!idParam && list) {
      clearTimeout(autoSaveTimer.current);
      dirtyRef.current = false;
      setList(null); setItems([]); setTitle("Liste de courses"); setEditing(false); setOpenRows(new Set());
    } else if (idParam && list?.listId !== idParam) {
      const found = savedLists.find((l) => l.listId === idParam);
      if (found) { setList(found); setTitle(found.title); setItems(found.items); setEditing(true); setOpenRows(new Set()); }
    }
  }, [idParam]);

  const visibleItems = useMemo(() => hideChecked ? items.filter((g) => !g.checked) : items, [items, hideChecked]);
  const suppliers = useMemo(() => [...new Set(visibleItems.map((g) => g.supplier))].sort(), [visibleItems]);
  const allSuppliers = useMemo(() => [...new Set(items.map((g) => g.supplier))].sort(), [items]);
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

  const uncheckAll = () => {
    dirtyRef.current = true;
    setItems(items.map((g) => ({ ...g, checked: false })));
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
    setEditing(true); setOpenRows(new Set());
  };

  const startNewList = () => {
    clearTimeout(autoSaveTimer.current);
    dirtyRef.current = false;
    setList(null); setTitle("Nouvelle liste"); setItems([]);
    setSearchParams({}, { replace: true });
    setEditing(true); setOpenRows(new Set());
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
    allSuppliers.forEach((supplier) => {
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

  if (!editing) {
    return (
      <div className="mx-auto max-w-wide">
        <PageHeader
          iconKey="courses"
          title="Courses"
          meta={`${savedLists.length} liste${savedLists.length > 1 ? "s" : ""}`}
          actions={<Button variant="primary" size="lg" icon={<Plus />} onClick={startNewList}>Nouvelle liste</Button>}
        />
        <Table<GroceryList>
          rows={savedLists}
          rowKey={(l) => l.listId}
          onRowClick={selectList}
          empty={<EmptyState message={<>Aucune liste de courses. <Link to={`/semaine/${isoWeekOf(todayIso())}`} className="text-primary hover:underline">Créer la liste de la semaine</Link> depuis la case « Ce qui manque pour la semaine », ou créez-en une à la main.</>} action={{ label: "+ Nouvelle liste", onClick: startNewList }} />}
          columns={[
            { key: "title", label: "Titre", render: (l) => <span className="font-medium">{l.title}</span> },
            { key: "range", label: "Période", width: "200px", render: (l) => (l.range ? rangeLabel(l.range.from, l.range.to) : "") },
            { key: "count", label: "Ingrédients", width: "110px", align: "right", render: (l) => `${l.items.length}` },
            { key: "checked", label: "Cochés", width: "100px", align: "right", trailing: true, render: (l) => { const n = l.items.filter((i) => i.checked).length; return n > 0 ? <Tag colour="green">{n} cochés</Tag> : ""; } },
            { key: "updated", label: "Maj", width: "110px", render: (l) => new Date(l.updatedAt).toLocaleDateString("fr-BE", { day: "numeric", month: "short" }) },
          ]}
        />
      </div>
    );
  }

  const menuItems = [
    ...(isTouch ? [{ label: "Imprimer", icon: <Printer />, onClick: () => window.print() }] : []),
    { kind: "check" as const, label: "Masquer les cochés", checked: hideChecked, onClick: () => setHideChecked((v) => !v) },
    { label: "Tout décocher", onClick: uncheckAll, disabled: items.every((g) => !g.checked) },
    { kind: "separator" as const },
    { label: "Partager (copier la liste)", icon: <Copy />, onClick: copyList },
    { label: "Exporter en PDF", icon: <FileDown />, onClick: exportPdf },
    { label: "Exporter en CSV", icon: <FileSpreadsheet />, onClick: exportCsv },
    ...(list ? [{ kind: "separator" as const }, { label: "Supprimer la liste", icon: <Trash2 />, onClick: deleteCurrent, variant: "danger" as const }] : []),
  ];

  const weekNumber = weekOfList ? parseIsoWeek(weekOfList).week : null;

  return (
    <div className="mx-auto max-w-doc">
      <PageHeader
        breadcrumb={[
          ...(weekOfList ? [{ label: `Semaine ${weekNumber}`, to: `/semaine/${weekOfList}` }] : []),
          { label: "Courses", to: "/grocery-list" },
          { label: title },
        ]}
        iconKey="courses"
        title={title}
        onTitleChange={(v) => { dirtyRef.current = true; setTitle(v); }}
        meta={saving ? "Sauvegarde…" : undefined}
        actions={
          <>
            <ActionMenu items={menuItems} title={title} />
            <Button variant="default" size="md" icon={<Printer />} onClick={() => window.print()} className="hidden md:inline-flex">Imprimer</Button>
          </>
        }
        properties={
          <PropertyList>
            <Property icon={Calendar} label="Période" kind="computed" value={list?.range ? rangeLabel(list.range.from, list.range.to) : undefined} placeholder="Liste manuelle" />
            <Property icon="🎉" label="Événements" kind="computed" value={list?.eventIds?.length ? `${list.eventIds.length}` : undefined} placeholder="Aucun" />
            <Property icon={Store} label="Fournisseurs" kind="computed" value={allSuppliers.length ? `${allSuppliers.length}` : undefined} placeholder="Aucun" />
            <Property icon={ShoppingCart} label="À acheter" kind="computed" value={items.length ? `${uncheckedCount} · ${items.length - uncheckedCount} cochés` : undefined} placeholder="Aucun ingrédient" />
          </PropertyList>
        }
      />

      {items.length === 0 && !addingIng && (
        <EmptyState message="Aucun ingrédient. Les événements de cette période n'ont pas de recette au menu, ou ajoutez des ingrédients à la main." action={{ label: "+ Ajouter un ingrédient", onClick: () => setAddingIng(true) }} />
      )}

      {suppliers.map((supplier) => (
        <section
          key={supplier}
          className={`mt-6 rounded transition-colors ${dropSupplier === supplier ? "bg-selected" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDropSupplier(supplier); }}
          onDragLeave={() => setDropSupplier(null)}
          onDrop={(e) => { e.preventDefault(); handleDrop(supplier); }}
        >
          <h3 className="flex h-7 items-center gap-2 text-base font-semibold">
            {supplier && supplier !== "Autre" ? <SupplierTag name={supplier} /> : <span>Sans fournisseur</span>}
            <span className="text-caption font-normal text-muted-foreground">{grouped[supplier]?.length || 0}</span>
          </h3>
          <div className="mt-1">
            {(grouped[supplier] || []).map((g) => {
              const gIdx = getIdx(g);
              const key = itemKey(g);
              const need = needQty(g);
              const open = openRows.has(key);
              return (
                <div
                  key={key}
                  draggable={!isTouch}
                  onDragStart={() => setDragIdx(gIdx)}
                  onDragEnd={() => { setDragIdx(null); setDropSupplier(null); }}
                  className={dragIdx === gIdx ? "opacity-40" : ""}
                >
                  <div className={ROW}>
                    {!isTouch && (
                      <span className="reveal flex h-7 w-4 shrink-0 cursor-grab items-center justify-center text-icon" aria-hidden="true">
                        <GripVertical className="h-4 w-4" />
                      </span>
                    )}
                    <Checkbox checked={g.checked} onChange={(c) => patchItem(gIdx, { checked: c })} aria-label={g.name} className="-ml-1" />
                    <button
                      type="button"
                      onClick={() => patchItem(gIdx, { checked: !g.checked })}
                      className={`min-w-0 flex-1 truncate text-left text-base ${g.checked ? "text-muted-foreground line-through" : ""}`}
                    >
                      {g.name}
                    </button>
                    <span className={`shrink-0 text-base tabular-nums ${g.checked ? "text-muted-foreground" : need > 0 ? "font-medium" : "text-success"}`}>
                      {need > 0 ? fmtQtyText(need, g.unit) : "✓"}
                    </span>
                    <ActionMenu
                      className="reveal"
                      title={g.name}
                      items={[
                        { kind: "check", label: "Stock", checked: open, onClick: () => toggleRow(key) },
                        { kind: "separator" },
                        { kind: "section", label: "Déplacer vers" },
                        ...moveTargets.map((s) => ({ kind: "check" as const, label: s, checked: s === g.supplier, onClick: () => { if (s !== g.supplier) patchItem(gIdx, { supplier: s }); } })),
                        { kind: "separator" },
                        { label: "Retirer", icon: <X />, onClick: () => removeItem(gIdx), variant: "danger" },
                      ]}
                    />
                  </div>

                  {open && (
                    <div className="ml-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded bg-surface px-3 py-2">
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
                      <IconButton size="sm" aria-label="Fermer" onClick={() => toggleRow(key)} icon={<X />} className="ml-auto" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="mt-4">
        {addingIng ? (
          <div className="flex flex-wrap items-center gap-2">
            <SearchSelect
              options={availableIngs.map((ig) => ({ value: ig.ingredientId, label: ig.name, detail: fmtUnitPrice(ig.price, ig.unit) }))}
              value={newIngId}
              onChange={(v) => {
                setNewIngId(v);
                const ing = allIngredients.find((i) => i.ingredientId === v);
                if (ing) setNewIngUnit(PRICE_TO_QTY_UNIT[ing.unit] || "g");
              }}
              placeholder="Rechercher un ingrédient…"
              className="min-w-[160px] flex-1"
              onCreateNew={(name) => setCreatingIngredient(name)}
              autoFocus
            />
            <NumericInput className="input-field w-24 text-right tabular-nums" value={newIngQty} onChange={setNewIngQty} placeholder="Qté" aria-label="Quantité" />
            <SelectPill value={newIngUnit} options={UNITS_QTY.map((u) => ({ value: u, label: u }))} onChange={setNewIngUnit} colour="gray" aria-label="Unité" />
            <Button variant="primary" size="md" onClick={addItem} disabled={!newIngId || newIngQty <= 0}>Ajouter</Button>
            <IconButton size="md" aria-label="Annuler" onClick={() => setAddingIng(false)} icon={<X />} />
          </div>
        ) : (
          <Button variant="subtle" size="sm" icon={<Plus />} onClick={() => setAddingIng(true)} className="-mx-1">Ajouter un ingrédient</Button>
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
