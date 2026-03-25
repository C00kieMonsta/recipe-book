import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Calendar, Search, Trash2, ShoppingCart, X, Copy, FileDown, FileSpreadsheet } from "lucide-react";
import type { AppEvent, Recipe, Ingredient } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/use-pagination";
import Pagination from "@/components/ui/Pagination";
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

export default function Events() {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "upcoming" | "completed">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groceryList, setGroceryList] = useState<GroceryItem[] | null>(null);
  const [groceryLoading, setGroceryLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const load = () => api.events.list()
    .then(setEvents)
    .catch(() => toast({ title: "Erreur de chargement", variant: "destructive" }))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let arr = [...events];
    if (search) arr = arr.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));
    if (filterStatus !== "all") arr = arr.filter((e) => e.status === filterStatus);
    arr.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return arr;
  }, [events, search, filterStatus]);

  const { page, totalPages, paginatedItems, setPage, next, prev, total } = usePagination(filtered, 20);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const allIds = paginatedItems.map((e) => e.eventId);
    const allSelected = allIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      allIds.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const generateGroceryList = async () => {
    setGroceryLoading(true);
    try {
      const [allRecipes, allIngredients] = await Promise.all([api.recipes.list(), api.ingredients.list()]);
      const recipeMap = new Map<string, Recipe>();
      allRecipes.forEach((r) => recipeMap.set(r.recipeId, r));
      const ingMap = new Map<string, Ingredient>();
      allIngredients.forEach((i) => ingMap.set(i.ingredientId, i));

      const agg: Record<string, GroceryItem> = {};

      events
        .filter((ev) => selected.has(ev.eventId))
        .forEach((ev) => {
          ev.recipes.forEach((rl) => {
            const recipe = recipeMap.get(rl.recipeId);
            if (!recipe) return;
            const scale = rl.portions / (recipe.portions || 1);
            recipe.ingredients.forEach((ri) => {
              const ing = ingMap.get(ri.ingredientId);
              if (!ing) return;
              const key = `${ri.ingredientId}:${ri.unit}`;
              const scaledQty = ri.qty * scale;
              if (agg[key]) {
                agg[key].totalQty += scaledQty;
              } else {
                agg[key] = {
                  ingredientId: ri.ingredientId,
                  name: ing.name,
                  totalQty: scaledQty,
                  unit: ri.unit,
                  supplier: ing.supplier,
                  pricePerUnit: ing.price,
                  priceUnit: ing.unit,
                };
              }
            });
          });
        });

      const items = Object.values(agg).sort((a, b) => a.supplier.localeCompare(b.supplier) || a.name.localeCompare(b.name));
      setGroceryList(items);
    } catch {
      toast({ title: "Erreur lors de la génération", variant: "destructive" });
    } finally {
      setGroceryLoading(false);
    }
  };

  const copyGroceryList = () => {
    if (!groceryList) return;
    const lines = groceryList.map((g) => `${g.name}\t${Number(g.totalQty.toFixed(2))} ${g.unit}\t${g.supplier}`);
    navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: "Liste copiée dans le presse-papier" });
  };

  const exportGroceryPdf = () => {
    if (!groceryList) return;
    const doc = new jsPDF();
    const m = 15;

    const selectedEvents = events.filter((ev) => selected.has(ev.eventId));
    const eventNames = selectedEvents.map((ev) => ev.name).join(", ");
    const today = new Date().toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Liste de courses", m, m + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${today} · ${selectedEvents.length} événement${selectedEvents.length > 1 ? "s" : ""}`, m, m + 14);
    doc.setFontSize(8);
    const nameLines = doc.splitTextToSize(`Événements : ${eventNames}`, 180);
    doc.text(nameLines, m, m + 20);

    const suppliers = [...new Set(groceryList.map((g) => g.supplier))].sort();
    let startY = m + 20 + nameLines.length * 4 + 4;

    suppliers.forEach((supplier) => {
      const items = groceryList.filter((g) => g.supplier === supplier);
      if (startY > 260) { doc.addPage(); startY = m; }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(supplier, m, startY + 5);
      startY += 8;

      autoTable(doc, {
        startY,
        head: [["Ingrédient", "Quantité", "Unité", "Prix/u"]],
        body: items.map((g) => [
          g.name,
          Number(g.totalQty.toFixed(2)).toString(),
          g.unit,
          `${fmt(g.pricePerUnit)} ${g.priceUnit}`,
        ]),
        margin: { left: m },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [60, 60, 60] },
        columnStyles: {
          1: { halign: "right" },
          3: { halign: "right" },
        },
      });

      const lastTable = (doc as unknown as Record<string, unknown>).lastAutoTable as { finalY: number } | undefined;
      startY = (lastTable?.finalY ?? startY + 34) + 6;
    });

    const fileName = selectedEvents.length === 1
      ? `courses-${selectedEvents[0].name.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\s-]/g, "")}.pdf`
      : `courses-${selectedEvents.length}-evenements.pdf`;
    doc.save(fileName);
  };

  const exportGroceryCsv = () => {
    if (!groceryList) return;
    const sep = ";";
    const header = ["Ingrédient", "Quantité", "Unité", "Fournisseur", "Prix/u", "Unité prix"].join(sep);
    const rows = groceryList.map((g) =>
      [g.name, Number(g.totalQty.toFixed(2)), g.unit, g.supplier, g.pricePerUnit, g.priceUnit].join(sep)
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const selectedEvents = events.filter((ev) => selected.has(ev.eventId));
    a.download = selectedEvents.length === 1
      ? `courses-${selectedEvents[0].name.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\s-]/g, "")}.csv`
      : `courses-${selectedEvents.length}-evenements.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Événements</h1>
          <p className="text-sm text-muted-foreground mt-1">{events.length} événements</p>
        </div>
        <div className="flex gap-2 items-center">
          {selected.size > 0 && (
            <button
              onClick={generateGroceryList}
              disabled={groceryLoading}
              className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              <ShoppingCart className="h-4 w-4" />
              {groceryLoading ? "Chargement…" : `Liste de courses (${selected.size})`}
            </button>
          )}
          <button onClick={() => navigate("/events/new")} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium shadow-sm hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" /> Nouvel événement
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-6 flex-wrap items-center">
        <div className="flex items-center gap-2 px-3 py-2 bg-card border rounded-lg flex-1 max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input className="flex-1 bg-transparent outline-none text-sm" placeholder="Rechercher un événement…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex gap-1.5">
          {(["all", "upcoming", "completed"] as const).map((s) => (
            <button key={s} onClick={() => { setFilterStatus(s); setPage(1); }} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${filterStatus === s ? "bg-foreground text-background border-foreground" : "bg-card hover:bg-muted"}`}>
              {s === "all" ? "Tous" : s === "upcoming" ? "À venir" : "Terminés"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto card-elevated">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="px-3 py-2.5 w-10">
                <input
                  type="checkbox"
                  checked={paginatedItems.length > 0 && paginatedItems.every((e) => selected.has(e.eventId))}
                  onChange={toggleAll}
                  className="rounded border-border accent-primary"
                />
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Événement</th>
              <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Date</th>
              <th className="px-3 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Convives</th>
              <th className="px-3 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Recettes</th>
              <th className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">Statut</th>
              <th className="px-3 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">PV/pers</th>
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody>
            {paginatedItems.map((ev) => (
              <tr key={ev.eventId} onClick={() => navigate(`/events/${ev.eventId}`)} className={`border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors ${selected.has(ev.eventId) ? "bg-primary/5" : ""}`}>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(ev.eventId)}
                    onChange={() => toggleSelect(ev.eventId)}
                    className="rounded border-border accent-primary"
                  />
                </td>
                <td className="px-3 py-2.5 font-semibold">{ev.name}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    {new Date(ev.date).toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{ev.guestCount}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{ev.recipes.length}</td>
                <td className="px-3 py-2.5">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${ev.status === "upcoming" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                    {ev.status === "upcoming" ? "À venir" : "Terminé"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium">{ev.sellingPricePerGuest.toFixed(2)}€</td>
                <td className="px-3 py-2.5">
                  <button onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Supprimer cet événement ?")) {
                      api.events.delete(ev.eventId).then(() => { load(); toast({ title: "Événement supprimé" }); });
                    }
                  }} className="p-1 rounded hover:bg-destructive/10 text-destructive/70 hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} onPrev={prev} onNext={next} />

      {groceryList && (
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setGroceryList(null)}>
          <div className="bg-card rounded-2xl p-6 max-w-2xl w-[95%] max-h-[85vh] overflow-auto shadow-xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-serif text-xl font-bold">Liste de courses</h2>
              <div className="flex gap-2">
                <button onClick={exportGroceryPdf} className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs font-medium hover:bg-muted transition-colors">
                  <FileDown className="h-3.5 w-3.5" /> PDF
                </button>
                <button onClick={exportGroceryCsv} className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs font-medium hover:bg-muted transition-colors">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
                </button>
                <button onClick={copyGroceryList} className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs font-medium hover:bg-muted transition-colors">
                  <Copy className="h-3.5 w-3.5" /> Copier
                </button>
                <button onClick={() => setGroceryList(null)} className="p-1.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {selected.size} événement{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""} · {groceryList.length} ingrédient{groceryList.length > 1 ? "s" : ""}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-border">
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Ingrédient</th>
                  <th className="px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Quantité</th>
                  <th className="px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Fournisseur</th>
                  <th className="px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Prix/u</th>
                </tr>
              </thead>
              <tbody>
                {groceryList.map((g) => (
                  <tr key={`${g.ingredientId}:${g.unit}`} className="border-b border-border/30">
                    <td className="px-3 py-2 font-medium">{g.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{Number(g.totalQty.toFixed(2))} {g.unit}</td>
                    <td className="px-3 py-2">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold border" style={{ color: supplierColor(g.supplier), borderColor: supplierColor(g.supplier) + "55", background: supplierColor(g.supplier) + "12" }}>{g.supplier}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(g.pricePerUnit)} {g.priceUnit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
