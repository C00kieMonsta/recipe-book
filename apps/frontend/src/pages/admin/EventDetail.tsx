import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, Copy, FileDown } from "lucide-react";
import type { AppEvent, Recipe, Ingredient } from "@packages/types";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { calcRecipeCost, fmt } from "@/lib/recipe-helpers";
import ActionMenu from "@/components/ui/ActionMenu";
import NumericInput from "@/components/ui/NumericInput";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [event, setEvent] = useState<AppEvent | null>(null);
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.events.get(id), api.recipes.list(), api.ingredients.list()])
      .then(([ev, recs, ings]) => { setEvent(ev); setAllRecipes(recs); setAllIngredients(ings); })
      .catch(() => toast({ title: "Erreur de chargement", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id]);

  const saveField = async (patch: Partial<AppEvent>) => {
    if (!id || !event) return;
    try {
      const updated = await api.events.update(id, patch);
      setEvent(updated);
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    }
  };

  const recipeCostMap = useMemo(() => {
    const map: Record<string, number> = {};
    allRecipes.forEach((r) => { map[r.recipeId] = calcRecipeCost(r, allIngredients); });
    return map;
  }, [allRecipes, allIngredients]);

  const recipePortionMap = useMemo(() => {
    const map: Record<string, number> = {};
    allRecipes.forEach((r) => { map[r.recipeId] = r.portions || 1; });
    return map;
  }, [allRecipes]);

  if (loading || !event) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  const totalRecipeCost = event.recipes.reduce((sum, rl) => {
    const totalCost = recipeCostMap[rl.recipeId] || 0;
    const portions = recipePortionMap[rl.recipeId] || 1;
    return sum + (totalCost / portions) * rl.portions;
  }, 0);
  const totalExtraCosts = event.extraCosts.reduce((s, c) => s + c.amount, 0);
  const calculatedCost = totalRecipeCost + totalExtraCosts;
  const totalCost = event.actualCost != null ? event.actualCost + totalExtraCosts : calculatedCost;
  const totalRevenue = event.sellingPricePerGuest * event.guestCount;
  const margin = totalRevenue - totalCost;
  const marginPct = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;

  const handleDelete = async () => {
    try {
      await api.events.delete(event.eventId);
      toast({ title: "Événement supprimé" });
      navigate("/events");
    } catch {
      toast({ title: "Erreur lors de la suppression", variant: "destructive" });
    }
  };

  const handleDuplicate = async () => {
    try {
      const data = {
        name: `${event.name} (copie)`,
        date: new Date().toISOString().split("T")[0],
        guestCount: event.guestCount,
        recipes: event.recipes,
        extraCosts: event.extraCosts,
        sellingPricePerGuest: event.sellingPricePerGuest,
        notes: event.notes,
        contactName: event.contactName,
        contactPhone: event.contactPhone,
        contactEmail: event.contactEmail,
        status: "upcoming" as const,
      };
      const created = await api.events.create(data);
      toast({ title: "Événement dupliqué" });
      navigate(`/events/${created.eventId}/edit`);
    } catch {
      toast({ title: "Erreur lors de la duplication", variant: "destructive" });
    }
  };

  const exportRecipesPdf = () => {
    const doc = new jsPDF();
    const m = 15;
    const dateStr = new Date(event.date).toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(event.name, m, m + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${dateStr} · ${event.guestCount} convives`, m, m + 14);

    let startY = m + 22;

    event.recipes.forEach((rl) => {
      const recipe = allRecipes.find((r) => r.recipeId === rl.recipeId);
      if (!recipe) return;
      const scale = rl.portions / (recipe.portions || 1);

      if (startY > 250) { doc.addPage(); startY = m; }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`${recipe.name} — ${rl.portions} portion${rl.portions > 1 ? "s" : ""}`, m, startY + 6);
      startY += 10;

      autoTable(doc, {
        startY,
        head: [["", "Ingrédient", "Quantité", "Unité"]],
        body: recipe.ingredients.map((ri) => {
          const ing = allIngredients.find((i) => i.ingredientId === ri.ingredientId);
          return ["", ing?.name || ri.ingredientId, Number((ri.qty * scale).toFixed(2)).toString(), ri.unit];
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
        if (startY > 250) { doc.addPage(); startY = m; }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("Préparation", m, startY + 4);
        startY += 8;

        recipe.techniques.forEach((step, i) => {
          const sz = 3.5;
          const lines = doc.splitTextToSize(`${i + 1}. ${step}`, 170);
          if (startY + lines.length * 4.5 > 280) { doc.addPage(); startY = m; }
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
    });

    doc.save(`recettes-${event.name.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç\s-]/g, "")}.pdf`);
  };

  const updateRecipePortions = (recipeId: string, portions: number) => {
    const recipes = event.recipes.map((rl) => rl.recipeId === recipeId ? { ...rl, portions } : rl);
    saveField({ recipes });
  };

  const updateExtraCost = (idx: number, field: "label" | "amount", value: string | number) => {
    const extraCosts = [...event.extraCosts];
    extraCosts[idx] = { ...extraCosts[idx], [field]: value };
    saveField({ extraCosts });
  };

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="flex justify-between items-center mb-5">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={exportRecipesPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
          >
            <FileDown className="h-4 w-4" /> PDF recettes
          </button>
          <ActionMenu items={[
            { label: "Modifier", icon: <Pencil className="h-4 w-4" />, onClick: () => navigate(`/events/${id}/edit`) },
            { label: "Dupliquer", icon: <Copy className="h-4 w-4" />, onClick: handleDuplicate },
            { label: "Supprimer", icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleteConfirm(true), variant: "danger" },
          ]} />
        </div>
      </div>

      <div className="flex gap-4 items-start mb-6 flex-wrap">
        <div className="flex-1">
          <EditableStatus value={event.status} onSave={(v) => saveField({ status: v })} />
          <EditableText
            value={event.name}
            onSave={(v) => saveField({ name: v })}
            className="text-3xl font-bold tracking-tight mb-1"
            inputClassName="text-3xl font-bold tracking-tight mb-1 w-full border-b-2 border-primary bg-transparent outline-none"
          />
          <div className="flex gap-2 items-center text-muted-foreground text-sm mb-1">
            <span>{new Date(event.date).toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
            <span>·</span>
            <EditableInlineNum value={event.guestCount} onSave={(v) => saveField({ guestCount: v })} min={1} suffix=" convives" />
          </div>
          <EditableText
            value={event.notes || ""}
            onSave={(v) => saveField({ notes: v })}
            className="text-muted-foreground text-sm mt-2 italic"
            inputClassName="text-muted-foreground text-sm mt-2 w-full border-b border-primary/50 bg-transparent outline-none"
            placeholder="Ajouter des notes…"
            multiline
          />
          <div className="flex gap-4 mt-3 text-sm text-muted-foreground flex-wrap">
            <span>Contact: <EditableInlineText value={event.contactName || ""} onSave={(v) => saveField({ contactName: v })} placeholder="Nom…" /></span>
            <EditableInlineText value={event.contactPhone || ""} onSave={(v) => saveField({ contactPhone: v })} placeholder="Téléphone…" />
            <EditableInlineText value={event.contactEmail || ""} onSave={(v) => saveField({ contactEmail: v })} placeholder="Email…" />
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            PV/pers HTVA: <EditableInlineNum value={event.sellingPricePerGuest} onSave={(v) => saveField({ sellingPricePerGuest: v })} suffix="€" />
          </div>
        </div>
      </div>

      {event.actualCost != null && (
        <div className="mb-4 px-4 py-2.5 bg-muted/30 rounded-lg text-sm flex gap-4 items-center flex-wrap">
          <span className="text-muted-foreground">Coût calculé : <span className="line-through tabular-nums">{fmt(calculatedCost)}</span></span>
          <span className="font-semibold">Coût réel recettes : <span className="tabular-nums">{fmt(event.actualCost)}</span></span>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Coût total HTVA" value={fmt(totalCost)} />
        <StatCard label="Revenu total HTVA" value={fmt(totalRevenue)} />
        <StatCard label="Marge HTVA" value={fmt(margin)} className={margin >= 0 ? "text-green-600" : "text-destructive"} />
        <StatCard label="Marge %" value={`${marginPct.toFixed(1)}%`} className={marginPct >= 0 ? "text-green-600" : "text-destructive"} />
      </div>

      <section className="card-elevated p-5 mb-5">
        <h2 className="font-serif text-lg font-bold mb-3">Recettes</h2>
        <table className="w-full text-sm">
          <thead><tr className="border-b-2">
            <th className="px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">Recette</th>
            <th className="px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Portions</th>
            <th className="px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Coût unit. HT</th>
            <th className="px-3 py-2 text-right text-xs font-bold uppercase text-muted-foreground">Coût total HT</th>
          </tr></thead>
          <tbody>
            {event.recipes.map((rl) => {
              const rec = allRecipes.find((r) => r.recipeId === rl.recipeId);
              const totalRecCost = recipeCostMap[rl.recipeId] || 0;
              const recPortions = recipePortionMap[rl.recipeId] || 1;
              const cpp = totalRecCost / recPortions;
              return (
                <tr key={rl.recipeId} className="border-b border-border/30">
                  <td className="px-3 py-2 font-semibold"><a href={`/recipes/${rl.recipeId}`} className="hover:underline hover:text-primary transition-colors">{rec?.name || "—"}</a></td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <EditableInlineNum value={rl.portions} onSave={(v) => updateRecipePortions(rl.recipeId, v)} min={1} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(cpp)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(cpp * rl.portions)}</td>
                </tr>
              );
            })}
            <tr className="font-bold border-t-2">
              <td className="px-3 py-2" colSpan={3}>Sous-total recettes</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(totalRecipeCost)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {event.extraCosts.length > 0 && (
        <section className="card-elevated p-5 mb-5">
          <h2 className="font-serif text-lg font-bold mb-3">Coûts supplémentaires</h2>
          <table className="w-full text-sm">
            <tbody>
              {event.extraCosts.map((ec, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="px-3 py-2 font-medium">
                    <EditableInlineText value={ec.label} onSave={(v) => updateExtraCost(i, "label", v)} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <EditableInlineNum value={ec.amount} onSave={(v) => updateExtraCost(i, "amount", v)} suffix="€" />
                  </td>
                </tr>
              ))}
              <tr className="font-bold border-t-2">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totalExtraCosts)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setDeleteConfirm(false)}>
          <div className="bg-card rounded-2xl p-7 max-w-sm w-[92%] shadow-xl animate-fade-up text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-lg font-bold mb-2">Confirmer la suppression</h3>
            <p className="text-muted-foreground text-sm mb-6">Cette action est irréversible.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2 border rounded-lg text-sm font-medium">Annuler</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="card-elevated p-4 text-center">
      <div className="text-xs text-muted-foreground font-medium mb-1">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${className}`}>{value}</div>
    </div>
  );
}

function EditableText({ value, onSave, className, inputClassName, placeholder, multiline }: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  useEffect(() => { setText(value); }, [value]);

  const commit = () => {
    setEditing(false);
    if (text !== value) onSave(text);
  };

  if (editing) {
    if (multiline) {
      return (
        <textarea
          className={inputClassName}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Escape") { setText(value); setEditing(false); } }}
          autoFocus
          rows={2}
        />
      );
    }
    return (
      <input
        className={inputClassName}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setText(value); setEditing(false); } }}
        autoFocus
      />
    );
  }

  return (
    <div
      className={`${className} cursor-pointer rounded px-1 -mx-1 hover:bg-muted/50 transition-colors ${!value && placeholder ? "text-muted-foreground/50 italic" : ""}`}
      onClick={() => setEditing(true)}
    >
      {value || placeholder || "—"}
    </div>
  );
}

function EditableInlineText({ value, onSave, placeholder }: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  useEffect(() => { setText(value); }, [value]);

  const commit = () => {
    setEditing(false);
    if (text !== value) onSave(text);
  };

  if (editing) {
    return (
      <input
        className="border-b border-primary bg-transparent text-foreground font-semibold outline-none text-sm w-32"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setText(value); setEditing(false); } }}
        autoFocus
      />
    );
  }

  return (
    <strong
      className="text-foreground cursor-pointer hover:bg-muted/50 rounded px-0.5 transition-colors"
      onClick={() => setEditing(true)}
    >
      {value || <span className="text-muted-foreground/50 font-normal italic">{placeholder || "—"}</span>}
    </strong>
  );
}

function EditableInlineNum({ value, onSave, suffix, min }: {
  value: number;
  onSave: (v: number) => void;
  suffix?: string;
  min?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));

  useEffect(() => { setText(String(value)); }, [value]);

  const commit = () => {
    setEditing(false);
    const cleaned = text.replace(",", ".");
    const parsed = parseFloat(cleaned);
    const final = isNaN(parsed) ? 0 : (min !== undefined ? Math.max(min, parsed) : parsed);
    if (final !== value) onSave(final);
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <input
          className="w-16 text-right px-1 py-0 border-b border-primary bg-transparent text-foreground font-semibold tabular-nums outline-none text-sm"
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => { if (e.target.value === "" || /^-?\d*[.,]?\d*$/.test(e.target.value)) setText(e.target.value); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setText(String(value)); setEditing(false); } }}
          autoFocus
        />
        {suffix && <span>{suffix}</span>}
      </span>
    );
  }

  return (
    <strong
      className="text-foreground cursor-pointer hover:bg-muted/50 rounded px-0.5 transition-colors tabular-nums"
      onClick={() => setEditing(true)}
    >
      {value}{suffix || ""}
    </strong>
  );
}

function EditableStatus({ value, onSave }: { value: "upcoming" | "completed"; onSave: (v: "upcoming" | "completed") => void }) {
  const toggle = () => onSave(value === "upcoming" ? "completed" : "upcoming");
  return (
    <button
      onClick={toggle}
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold mb-2 cursor-pointer hover:opacity-80 transition-opacity ${value === "upcoming" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}
    >
      {value === "upcoming" ? "À venir" : "Terminé"}
    </button>
  );
}
