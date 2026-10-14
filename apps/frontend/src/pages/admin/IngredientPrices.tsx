import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Ingredient } from "@packages/types";
import { DEFAULT_SUPPLIERS, dayMonthLabel, daysBetween, todayYmd } from "@packages/types";
import { api, errorReason } from "@/lib/api";
import { fmt, fmtUnitPrice } from "@/lib/recipe-helpers";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useBackLink, useTopTitle } from "@/components/admin/AdminLayout";
import { Button, Dialog, EmptyState, PageHeader, SelectPill, Table, Tag, type TableColumn } from "@/components/ui";

export const STALE_DAYS = 180;
const NO_SUPPLIER = "Sans fournisseur";

export function priceSheetHref(supplier: string): string {
  return `/ingredients/prix?fournisseur=${encodeURIComponent(supplier)}`;
}

// Stale when never confirmed or confirmed more than 180 days before today.
export function isStalePrice(i: Pick<Ingredient, "priceUpdatedAt">, today: string = todayYmd()): boolean {
  if (!i.priceUpdatedAt) return true;
  return daysBetween(i.priceUpdatedAt.slice(0, 10), today) > STALE_DAYS;
}

// « Vérifié le 12 mars » or « Jamais vérifié », for a title attribute.
export function verifiedTitle(i: Pick<Ingredient, "priceUpdatedAt">): string {
  return i.priceUpdatedAt ? `Vérifié le ${dayMonthLabel(i.priceUpdatedAt.slice(0, 10))}` : "Jamais vérifié";
}

// « à l'instant », « il y a 12 jours », « il y a 3 mois », « il y a plus d'un an », « jamais ».
export function verifiedLabel(iso: string | undefined, today: string = todayYmd()): string {
  if (!iso) return "jamais";
  const days = daysBetween(iso.slice(0, 10), today);
  if (days < 1) return "à l'instant";
  if (days < 31) return `il y a ${days} jour${days > 1 ? "s" : ""}`;
  if (days < 365) return `il y a ${Math.max(1, Math.round(days / 30.44))} mois`;
  return "il y a plus d'un an";
}

// Max priceUpdatedAt of a list, undefined when none is dated.
export function lastPriceUpdate(list: Pick<Ingredient, "priceUpdatedAt">[]): string | undefined {
  let max: string | undefined;
  for (const i of list) if (i.priceUpdatedAt && (!max || i.priceUpdatedAt > max)) max = i.priceUpdatedAt;
  return max;
}

// A typed cell: null when empty or not a non-negative number.
function parseDraft(raw: string | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

export default function IngredientPrices() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const md = useMediaQuery("(min-width: 768px)");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [settingsSuppliers, setSettingsSuppliers] = useState<string[]>(DEFAULT_SUPPLIERS.map((s) => s.name));
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "leave" } | { kind: "supplier"; value: string } | null>(null);
  // Both Table layouts render an input per row; the visible one gets the focus.
  const inputs = useRef(new Map<string, Set<HTMLInputElement>>());
  const refCallbacks = useRef(new Map<string, (el: HTMLInputElement | null) => void>());
  const today = todayYmd();

  useEffect(() => {
    let alive = true;
    Promise.all([api.ingredients.list(), api.settings.get().catch(() => null)])
      .then(([ings, settings]) => {
        if (!alive) return;
        setIngredients(ings);
        if (settings?.suppliers?.length) setSettingsSuppliers(settings.suppliers.map((s) => s.name));
      })
      .catch(() => { if (alive) toast({ title: "Erreur de chargement", variant: "destructive" }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const supplier = searchParams.has("fournisseur") ? (searchParams.get("fournisseur") ?? "") : (settingsSuppliers[0] ?? "");
  const title = supplier ? `Prix ${supplier}` : "Prix";
  useBackLink({ to: "/ingredients", label: "Ingrédients" });
  useTopTitle(title);

  const supplierOptions = useMemo(() => {
    const names = [...settingsSuppliers];
    const inUse = [...new Set(ingredients.map((i) => i.supplier).filter(Boolean))].filter((n) => !names.includes(n)).sort((a, b) => a.localeCompare(b, "fr"));
    names.push(...inUse);
    if (supplier && !names.includes(supplier)) names.push(supplier);
    return [...names.map((n) => ({ value: n, label: n })), { value: "", label: NO_SUPPLIER }];
  }, [settingsSuppliers, ingredients, supplier]);

  const rows = useMemo(
    () => ingredients.filter((i) => (i.supplier || "") === supplier).sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [ingredients, supplier],
  );
  const indexById = useMemo(() => new Map(rows.map((r, i) => [r.ingredientId, i])), [rows]);
  const pending = useMemo(() => rows.filter((r) => parseDraft(drafts[r.ingredientId]) !== null), [rows, drafts]);
  const count = pending.length;
  const saving = progress !== null;

  useEffect(() => {
    if (!saving && count === 0) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saving, count]);

  const setDraft = (id: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };

  const registerInput = (id: string) => {
    let cb = refCallbacks.current.get(id);
    if (!cb) {
      cb = (el) => {
        const set = inputs.current.get(id) ?? new Set<HTMLInputElement>();
        if (el) set.add(el);
        inputs.current.set(id, set);
      };
      refCallbacks.current.set(id, cb);
    }
    return cb;
  };

  const focusRow = (index: number): boolean => {
    const row = rows[index];
    if (!row) return false;
    const el = [...(inputs.current.get(row.ingredientId) ?? [])].find((e) => e.isConnected && e.offsetParent !== null);
    if (!el) return false;
    el.focus();
    el.select();
    return true;
  };

  const onKey = (id: string, index: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { e.preventDefault(); setDraft(id, ""); return; }
    if (e.key === "Enter") { e.preventDefault(); focusRow(e.shiftKey ? index - 1 : index + 1); return; }
    if (e.key === "Tab") {
      // The first and last rows let Tab leave the sheet.
      if (focusRow(e.shiftKey ? index - 1 : index + 1)) e.preventDefault();
    }
  };

  const applySupplier = (value: string) => {
    setDrafts({});
    setErrors({});
    setSearchParams({ fournisseur: value }, { replace: true });
  };
  const onSupplierChange = (value: string) => {
    if (count > 0) setConfirm({ kind: "supplier", value });
    else applySupplier(value);
  };
  const onCancel = () => {
    if (count > 0) setConfirm({ kind: "leave" });
    else navigate("/ingredients");
  };
  const onConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === "leave") navigate("/ingredients");
    else applySupplier(confirm.value);
    setConfirm(null);
  };

  const save = async () => {
    if (count === 0 || saving) return;
    const ids = pending.map((r) => r.ingredientId);
    const failed: Record<string, string> = {};
    let ok = 0;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const price = parseDraft(drafts[id]);
      if (price === null) continue;
      setProgress({ done: i + 1, total: ids.length });
      try {
        const updated = await api.ingredients.update(id, { price });
        setIngredients((prev) => prev.map((x) => (x.ingredientId === id ? { ...x, ...updated } : x)));
        setDrafts((prev) => { const next = { ...prev }; delete next[id]; return next; });
        ok++;
      } catch (e) {
        failed[id] = errorReason(e) || "Erreur lors de la sauvegarde";
      }
    }
    setErrors(failed);
    setProgress(null);
    const failures = Object.keys(failed).length;
    const saved = `${ok} prix enregistré${ok > 1 ? "s" : ""}`;
    toast({ title: failures ? `${saved} · ${plural(failures, "erreur")}` : saved, variant: failures ? "destructive" : "default" });
  };

  const priceInput = (i: Ingredient): ReactNode => {
    const id = i.ingredientId;
    const error = errors[id];
    return (
      <div className="flex items-center justify-end gap-1">
        <input
          ref={registerInput(id)}
          type="text"
          inputMode="decimal"
          enterKeyHint="next"
          value={drafts[id] ?? ""}
          aria-label={`Nouveau prix de ${i.name}`}
          aria-invalid={error ? true : undefined}
          disabled={saving}
          onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*[.,]?\d*$/.test(v)) setDraft(id, v); }}
          onKeyDown={onKey(id, indexById.get(id) ?? 0)}
          className={cn("input-field w-24 text-right text-foreground tabular-nums", error && "shadow-[0_0_0_1px_var(--danger)]")}
        />
        {error && <span className="w-3 text-center font-semibold text-danger" title={error} aria-label={error} role="img">!</span>}
      </div>
    );
  };

  const gapTag = (i: Ingredient): ReactNode => {
    const next = parseDraft(drafts[i.ingredientId]);
    if (next === null) return "";
    if (Math.abs(next - i.price) < 0.005) return <Tag colour="gray">=</Tag>;
    if (i.price <= 0) return "";
    const pct = Math.round(((next - i.price) / i.price) * 100);
    return <Tag colour={pct < 0 ? "green" : "red"}>{`${pct < 0 ? "−" : "+"}${Math.abs(pct)} %`}</Tag>;
  };

  const verified = (i: Ingredient): ReactNode => (
    <span className={cn(isStalePrice(i, today) && "text-danger")} title={verifiedTitle(i)}>{verifiedLabel(i.priceUpdatedAt, today)}</span>
  );

  const name: TableColumn<Ingredient> = { key: "name", label: "Produit", render: (i) => <span className="font-medium">{i.name}</span> };
  const columns: TableColumn<Ingredient>[] = md
    ? [
      name,
      { key: "unit", label: "Unité", width: "80px", render: (i) => i.unit },
      { key: "price", label: "Prix actuel", width: "110px", align: "right", render: (i) => fmt(i.price) },
      { key: "next", label: "Nouveau prix", width: "140px", align: "right", render: priceInput },
      { key: "gap", label: "Écart", width: "80px", render: gapTag },
      { key: "verified", label: "Vérifié", width: "150px", render: verified },
    ]
    : [
      name,
      { key: "price", render: (i) => fmtUnitPrice(i.price, i.unit) },
      { key: "verified", render: verified },
      { key: "gap", trailing: true, render: gapTag },
      { key: "next", trailing: true, render: priceInput },
    ];

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  const last = lastPriceUpdate(rows);
  const meta = `${plural(rows.length, "produit")} · ${last ? `dernière mise à jour ${dayMonthLabel(last.slice(0, 10))}` : "jamais vérifié"}`;
  const primaryLabel = progress ? `Enregistrement ${progress.done} / ${progress.total}…` : `Enregistrer ${count} prix`;
  const buttons = (size: "md" | "lg", className?: string) => (
    <>
      <Button variant="default" size={size} onClick={onCancel} disabled={saving} className={className}>Annuler</Button>
      <Button variant="primary" size={size} onClick={save} disabled={count === 0 || saving} className={className}>{primaryLabel}</Button>
    </>
  );

  return (
    <div className="mx-auto max-w-doc pb-20 md:pb-0">
      <PageHeader
        breadcrumb={[{ label: "Ingrédients", to: "/ingredients" }, { label: title }]}
        iconKey="ingredients"
        title={title}
        meta={meta}
        properties={<p className="mt-1 text-caption text-muted-foreground touch:text-sm">Tapez le nouveau prix, Entrée passe au suivant. Les lignes vides ne changent pas.</p>}
        actions={<SelectPill value={supplier} options={supplierOptions} onChange={onSupplierChange} align="right" aria-label="Fournisseur" />}
      />

      <Table<Ingredient>
        rows={rows}
        rowKey={(i) => i.ingredientId}
        columns={columns}
        empty={<EmptyState message="Aucun ingrédient." />}
      />

      {rows.length > 0 && <div className="mt-4 hidden justify-end gap-2 md:flex">{buttons("lg")}</div>}
      {rows.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 bg-background p-3 shadow-[0_-1px_0_0_var(--border)] md:hidden">{buttons("lg", "flex-1")}</div>
      )}

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={`Abandonner ${count} prix non enregistrés ?`}
        size="sm"
        footer={
          <>
            <Button variant="default" size="md" onClick={() => setConfirm(null)}>Annuler</Button>
            <Button variant="danger" size="md" onClick={onConfirm}>Abandonner</Button>
          </>
        }
      >
        {null}
      </Dialog>
    </div>
  );
}
