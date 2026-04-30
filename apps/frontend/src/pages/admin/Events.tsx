import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Calendar, Search, Trash2, ShoppingCart, FileDown, X } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AppEvent, Recipe, Ingredient } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/use-pagination";
import Pagination from "@/components/ui/Pagination";

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
  const [groceryLoading, setGroceryLoading] = useState(false);
  const [plannerPdfLoading, setPlannerPdfLoading] = useState(false);
  const [showWeekPlanner, setShowWeekPlanner] = useState(false);
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
    arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
      const selectedEvents = events.filter((ev) => selected.has(ev.eventId));
      const defaultTitle = selectedEvents.length === 1
        ? `Courses – ${selectedEvents[0].name}`
        : `Courses – ${selectedEvents.length} événements`;

      localStorage.setItem("recipe-book:grocery-list-pending", JSON.stringify({
        title: defaultTitle,
        items,
        allIngredients,
      }));
      navigate("/grocery-list");
    } catch {
      toast({ title: "Erreur lors de la génération", variant: "destructive" });
    } finally {
      setGroceryLoading(false);
    }
  };

  const generateAggregatedPdf = async (eventsToExport: AppEvent[], titlePrefix: string) => {
    if (eventsToExport.length === 0) {
      toast({ title: "Aucun événement à exporter", variant: "destructive" });
      return;
    }

    try {
      const [allRecipes, allIngredients] = await Promise.all([api.recipes.list(), api.ingredients.list()]);
      const recipeMap = new Map(allRecipes.map((r) => [r.recipeId, r]));

      /** Sum of rl.portions / recipe.portions for each recipe across all selected events (and duplicate lines within an event). */
      const aggregatedScale = new Map<string, number>();
      for (const ev of eventsToExport) {
        for (const rl of ev.recipes) {
          const recipe = recipeMap.get(rl.recipeId);
          if (!recipe) continue;
          const lineScale = rl.portions / (recipe.portions || 1);
          aggregatedScale.set(rl.recipeId, (aggregatedScale.get(rl.recipeId) ?? 0) + lineScale);
        }
      }

      const mergedRecipes = [...aggregatedScale.entries()]
        .map(([recipeId, totalScale]) => {
          const recipe = recipeMap.get(recipeId);
          if (!recipe) return null;
          const portionsCommandees = totalScale * (recipe.portions || 1);
          return { recipe, totalScale, portionsCommandees };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => a.recipe.name.localeCompare(b.recipe.name, "fr"));

      if (mergedRecipes.length === 0) {
        toast({ title: "Aucune recette dans la sélection", variant: "destructive" });
        return;
      }

      const doc = new jsPDF();
      const m = 15;
      let startY = m;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(`Recettes agrégées — ${eventsToExport.length} événement${eventsToExport.length > 1 ? "s" : ""}`, m, startY + 6);
      startY += 12;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Événements inclus", m, startY + 6);
      startY += 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      eventsToExport.forEach((ev) => {
        const dateStr = new Date(ev.date).toLocaleDateString("fr-BE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
        const line = `• ${ev.name} — ${dateStr} (${ev.guestCount} conv.)`;
        const wrapped = doc.splitTextToSize(line, 175);
        if (startY + wrapped.length * 4 > 270) {
          doc.addPage();
          startY = m;
        }
        doc.text(wrapped, m, startY + 6);
        startY += wrapped.length * 4 + 1;
      });
      startY += 6;

      for (const { recipe, totalScale, portionsCommandees } of mergedRecipes) {
        const portionsLabel = Number.isInteger(portionsCommandees)
          ? String(portionsCommandees)
          : portionsCommandees.toFixed(2).replace(/\.?0+$/, "");
        const portionPlural = Math.abs(portionsCommandees - 1) > 1e-6;

        if (startY > 240) {
          doc.addPage();
          startY = m;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(`${recipe.name} — ${portionsLabel} portion${portionPlural ? "s" : ""} (total sélection)`, m, startY + 6);
        startY += 10;

        autoTable(doc, {
          startY,
          head: [["", "Ingrédient", "Quantité", "Unité"]],
          body: recipe.ingredients.map((ri) => {
            const ing = allIngredients.find((i) => i.ingredientId === ri.ingredientId);
            return ["", ing?.name || ri.ingredientId, Number((ri.qty * totalScale).toFixed(2)).toString(), ri.unit];
          }),
          margin: { left: m },
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [60, 60, 60] },
          columnStyles: { 0: { cellWidth: 8 }, 2: { halign: "right" } },
          didDrawCell: (data) => {
            if (data.column.index === 0 && data.row.section === "body") {
              const sz = 3;
              doc.setDrawColor(100, 100, 100);
              doc.rect(data.cell.x + (data.cell.width - sz) / 2, data.cell.y + (data.cell.height - sz) / 2, sz, sz);
            }
          },
        });

        const lastTable = (doc as unknown as Record<string, unknown>).lastAutoTable as { finalY: number } | undefined;
        startY = (lastTable?.finalY ?? startY + 30) + 8;

        if (recipe.techniques.length > 0) {
          if (startY > 250) {
            doc.addPage();
            startY = m;
          }
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.text("Préparation", m, startY + 4);
          startY += 8;

          recipe.techniques.forEach((step, i) => {
            const sz = 3.5;
            const lines = doc.splitTextToSize(`${i + 1}. ${step}`, 170);
            if (startY + lines.length * 4.5 > 280) {
              doc.addPage();
              startY = m;
            }
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setDrawColor(100, 100, 100);
            doc.rect(m, startY - sz + 0.5, sz, sz);
            doc.text(lines, m + sz + 2, startY);
            startY += lines.length * 4.5 + 2;
          });

          startY += 6;
        } else {
          startY += 2;
        }
      }

      const filename = eventsToExport.length === 1
        ? `${titlePrefix}-${eventsToExport[0].date}-${eventsToExport[0].name}`
        : `${titlePrefix}-${eventsToExport.length}-evenements`;
      doc.save(`${filename.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\s-]/g, "")}.pdf`);
      toast({ title: `PDF créé (${eventsToExport.length} événement${eventsToExport.length > 1 ? "s" : ""})` });
    } catch {
      toast({ title: "Erreur lors de l'export PDF", variant: "destructive" });
    }
  };

  const exportSelectedPlannerPdf = async () => {
    const selectedEvents = events
      .filter((e) => selected.has(e.eventId))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (selectedEvents.length === 0) {
      toast({ title: "Sélectionnez au moins un événement", variant: "destructive" });
      return;
    }

    setPlannerPdfLoading(true);
    await generateAggregatedPdf(selectedEvents, "planner");
    setPlannerPdfLoading(false);
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
            <>
              <button
                type="button"
                onClick={exportSelectedPlannerPdf}
                disabled={plannerPdfLoading}
                className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                <FileDown className="h-4 w-4" />
                {plannerPdfLoading ? "PDF…" : `PDF recettes (${selected.size})`}
              </button>
              <button
                onClick={generateGroceryList}
                disabled={groceryLoading}
                className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                <ShoppingCart className="h-4 w-4" />
                {groceryLoading ? "Chargement…" : `Liste de courses (${selected.size})`}
              </button>
            </>
          )}
          <button onClick={() => setShowWeekPlanner(true)} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-muted transition-colors">
            <Calendar className="h-4 w-4" /> Planning semaine
          </button>
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

      {showWeekPlanner && (
        <WeekPlannerModal
          events={events}
          onClose={() => setShowWeekPlanner(false)}
          onDownload={async (weekEvents) => {
            await generateAggregatedPdf(weekEvents, "semaine");
          }}
        />
      )}
    </div>
  );
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + delta);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeekSunday(d: Date): Date {
  const s = startOfWeekMonday(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

function WeekPlannerModal({ events, onClose, onDownload }: { events: AppEvent[]; onClose: () => void; onDownload: (events: AppEvent[]) => Promise<void> }) {
  const [downloading, setDownloading] = useState(false);
  
  const ref = new Date();
  const start = startOfWeekMonday(ref);
  const end = endOfWeekSunday(ref);

  const weekEvents = useMemo(() => {
    return events
      .filter((e) => {
        const t = new Date(`${e.date}T12:00:00`).getTime();
        return t >= start.getTime() && t <= end.getTime();
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events, start, end]);

  const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  
  const eventsByDay = useMemo(() => {
    const grouped: Record<number, AppEvent[]> = {};
    for (let i = 0; i < 7; i++) grouped[i] = [];
    
    weekEvents.forEach(ev => {
      const d = new Date(`${ev.date}T12:00:00`);
      let dayIdx = d.getDay() - 1;
      if (dayIdx === -1) dayIdx = 6; // Sunday
      grouped[dayIdx].push(ev);
    });
    return grouped;
  }, [weekEvents]);

  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-2xl p-7 max-w-2xl w-[92%] max-h-[90vh] flex flex-col shadow-xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="font-serif text-xl font-bold">Planning de la semaine</h2>
            <p className="text-sm text-muted-foreground mt-1">Du {start.toLocaleDateString("fr-BE")} au {end.toLocaleDateString("fr-BE")}</p>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-4">
          {days.map((dayName, idx) => {
            const dayEvents = eventsByDay[idx];
            const date = new Date(start);
            date.setDate(date.getDate() + idx);
            
            return (
              <div key={idx} className="border rounded-xl overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 border-b flex justify-between items-center">
                  <span className="font-semibold text-sm">{dayName} {date.toLocaleDateString("fr-BE", { day: "numeric", month: "short" })}</span>
                  <span className="text-xs text-muted-foreground font-medium">{dayEvents.length} événement{dayEvents.length > 1 ? "s" : ""}</span>
                </div>
                <div className="p-4">
                  {dayEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Aucun événement</p>
                  ) : (
                    <div className="space-y-3">
                      {dayEvents.map(ev => (
                        <div key={ev.eventId} className="flex flex-col gap-1">
                          <div className="flex justify-between items-start">
                            <span className="font-medium text-sm">{ev.name}</span>
                            <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{ev.guestCount} conv.</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{ev.recipes.length} recette{ev.recipes.length > 1 ? "s" : ""}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-muted transition-colors">Annuler</button>
          <button 
            onClick={async () => {
              setDownloading(true);
              await onDownload(weekEvents);
              setDownloading(false);
              onClose();
            }} 
            disabled={downloading || weekEvents.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" />
            {downloading ? "Génération..." : "Télécharger PDF agrégé"}
          </button>
        </div>
      </div>
    </div>
  );
}
