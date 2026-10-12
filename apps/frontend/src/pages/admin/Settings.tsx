import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Link2, Plus, Save, X } from "lucide-react";
import type {
  AppEvent,
  AppSettings,
  CompanySettings,
  FixedCharge,
  FixedChargeCategory,
  Person,
  PrestationTypeSetting,
  SettingsSupplier,
  VatRate,
  YearActuals,
  YearObjective,
} from "@packages/types";
import {
  DEFAULT_COURSES,
  DEFAULT_PRESTATION_TYPES,
  DEFAULT_RECIPE_CATEGORIES,
  DEFAULT_SUPPLIERS,
  VAT_RATES,
  fmtEur,
  personInitials,
  round2,
  slugifyPersonId,
  sumMoney,
} from "@packages/types";
import { api, type HealthResponse } from "@/lib/api";
import { supplierColor } from "@/lib/recipe-helpers";
import { useToast } from "@/hooks/use-toast";
import { EditableInlineText, FieldLabel, PageHeader, Section, Tag } from "@/components/ui";
import { PersonChip } from "@/components/admin/PersonChips";

// ── Local types and constants ────────────────────────────────────────────────

type DraftPrestationType = PrestationTypeSetting & { isNew?: boolean };

interface Draft {
  recipeCategories: string[];
  courses: string[];
  prestationTypes: DraftPrestationType[];
  suppliers: SettingsSupplier[];
  people: Person[];
  fixedCharges: FixedCharge[];
  objectives: Record<string, Partial<YearObjective>>;
  yearActuals: Record<string, YearActuals>;
  company: CompanySettings;
  ledgerStartYm?: string;
  ignoredDuplicateGroups: string[];
}

const CHARGE_CATEGORIES: { value: FixedChargeCategory; label: string }[] = [
  { value: "social", label: "Social" },
  { value: "salaire", label: "Salaire" },
  { value: "assurance", label: "Assurance" },
  { value: "abonnement", label: "Abonnement" },
  { value: "frais", label: "Frais" },
  { value: "remboursement", label: "Remboursement" },
  { value: "autre", label: "Autre" },
];

const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const MONTH_KEYS = MONTHS.map((_, i) => String(i + 1).padStart(2, "0"));

const DEFAULT_RAW_MATERIAL_PCT = 0.38;
const DEFAULT_TAX_RATE = 0.25;
const DEFAULT_TREASURY_MONTHS = 3;
const DEFAULT_MONTHS_ACTIVE = 10;

const btnSecondary = "inline-flex items-center gap-1.5 min-h-11 px-3 rounded-lg border border-border bg-card text-base font-medium hover:bg-hover disabled:opacity-40";
const btnPrimary = "inline-flex items-center gap-2 min-h-11 px-4 rounded-lg bg-primary text-primary-foreground text-base font-medium shadow-sm disabled:opacity-50";
const btnIcon = "inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg text-muted-foreground hover:bg-hover hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";
const btnIconDanger = "inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg text-muted-foreground hover:bg-destructive-soft hover:text-destructive";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function snakeKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function chargeInResult(c: FixedCharge): boolean {
  return c.inResult ?? c.category !== "remboursement";
}

function fromSettings(s: AppSettings): Draft {
  return {
    recipeCategories: s.recipeCategories?.length ? s.recipeCategories : DEFAULT_RECIPE_CATEGORIES,
    courses: s.courses?.length ? s.courses : DEFAULT_COURSES,
    prestationTypes: s.prestationTypes?.length ? s.prestationTypes : DEFAULT_PRESTATION_TYPES,
    suppliers: s.suppliers?.length ? s.suppliers : DEFAULT_SUPPLIERS,
    people: s.people ?? [],
    fixedCharges: s.fixedCharges ?? [],
    objectives: s.objectives ?? {},
    yearActuals: s.yearActuals ?? {},
    company: s.company ?? { name: "", vatNumber: "", address: "" },
    ledgerStartYm: s.ledgerStartYm,
    ignoredDuplicateGroups: s.ignoredDuplicateGroups ?? [],
  };
}

function cleanRecord(rec: Record<string, number | undefined> | undefined): Record<string, number> | undefined {
  if (!rec) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec)) if (v !== undefined && Number.isFinite(v)) out[k] = round2(v);
  return out;
}

function cleanObjective(o: Partial<YearObjective>): YearObjective {
  const monthsActive = Math.min(12, Math.max(1, Math.round(o.monthsActive || DEFAULT_MONTHS_ACTIVE)));
  return {
    annualRevenue: round2(o.annualRevenue || 0),
    monthsActive,
    monthlyOverrides: cleanRecord(o.monthlyOverrides),
    byPrestation: o.byPrestation
      ?.filter((p) => p.type && p.amount !== undefined && Number.isFinite(p.amount))
      .map((p) => ({
        type: p.type,
        amount: round2(p.amount),
        eventsNeeded: p.eventsNeeded !== undefined ? Math.max(0, Math.round(p.eventsNeeded)) : undefined,
        guestsPerEvent: p.guestsPerEvent !== undefined && p.guestsPerEvent > 0 ? p.guestsPerEvent : undefined,
      })),
    hoursAvailablePerMonth: o.hoursAvailablePerMonth,
    hoursAvailableOverrides: o.hoursAvailableOverrides
      ? Object.fromEntries(Object.entries(o.hoursAvailableOverrides).filter(([, v]) => v !== undefined && Number.isFinite(v)))
      : undefined,
    rawMaterialPct: o.rawMaterialPct,
    corporateTaxRate: o.corporateTaxRate,
    smeReducedRate: o.smeReducedRate,
    corporateTaxActual: o.corporateTaxActual !== undefined ? round2(o.corporateTaxActual) : undefined,
    extrasBudget: o.extrasBudget !== undefined ? round2(o.extrasBudget) : undefined,
    treasuryMonths: o.treasuryMonths,
    treasurySavingPerMonth: o.treasurySavingPerMonth !== undefined ? round2(o.treasurySavingPerMonth) : undefined,
    investments: o.investments?.filter((i) => i.label.trim()).map((i) => ({ label: i.label.trim(), amount: round2(i.amount || 0) })),
  };
}

function cleanActuals(a: YearActuals): YearActuals | null {
  const monthly = cleanRecord(a.monthly);
  const byPrestation = cleanRecord(a.byPrestation);
  const byPeriod = a.byPeriod
    ?.filter((p) => /^\d{2}-\d{2}$/.test(p.from) && /^\d{2}-\d{2}$/.test(p.to) && Number.isFinite(p.amount))
    .map((p) => ({ from: p.from, to: p.to, amount: round2(p.amount) }));
  const note = a.note?.trim() || undefined;
  const empty = !Object.keys(monthly ?? {}).length && !Object.keys(byPrestation ?? {}).length && !byPeriod?.length && !note;
  if (empty) return null;
  return {
    monthly: monthly && Object.keys(monthly).length ? monthly : undefined,
    byPrestation: byPrestation && Object.keys(byPrestation).length ? byPrestation : undefined,
    byPeriod: byPeriod?.length ? byPeriod : undefined,
    note,
  };
}

function parsePastedCharges(text: string): FixedCharge[] {
  const rows: FixedCharge[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/;|\t/).map((s) => s.trim());
    const label = parts[0];
    const amount = Number((parts[1] ?? "").replace(/[\s€]/g, "").replace(",", "."));
    if (!label || !Number.isFinite(amount)) continue;
    rows.push({ chargeId: newId(), label, category: "autre", monthlyAmount: round2(amount), inResult: true });
  }
  return rows;
}

// ── Small inputs ─────────────────────────────────────────────────────────────

interface NumInputProps {
  id?: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: number | "any";
  min?: number;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

function NumInput({ id, value, onChange, step = "any", min, placeholder, className = "", ariaLabel }: NumInputProps) {
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      aria-label={ariaLabel}
      className={`input-field tabular-nums ${className}`}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "") return onChange(undefined);
        const n = Number(v);
        onChange(Number.isFinite(n) ? n : undefined);
      }}
    />
  );
}

function MoveButtons({ index, length, onMove }: { index: number; length: number; onMove: (from: number, to: number) => void }) {
  return (
    <>
      <button type="button" aria-label="Monter" className={btnIcon} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
        <ChevronUp className="h-5 w-5" />
      </button>
      <button type="button" aria-label="Descendre" className={btnIcon} disabled={index >= length - 1} onClick={() => onMove(index, index + 1)}>
        <ChevronDown className="h-5 w-5" />
      </button>
    </>
  );
}

function YearSelect({ id, value, years, onChange }: { id: string; value: string; years: string[]; onChange: (y: string) => void }) {
  return (
    <select id={id} className="input-field w-auto min-h-11" value={value} onChange={(e) => onChange(e.target.value)}>
      {years.map((y) => (
        <option key={y} value={y}>{y}</option>
      ))}
    </select>
  );
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Settings() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [rename, setRename] = useState<{ from: string; to: string; count: number; events: AppEvent[] } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [pendingRenames, setPendingRenames] = useState<{ from: string; to: string }[]>([]);
  const renameQueue = useRef<{ queue: { from: string; to: string }[]; events: AppEvent[] }>({ queue: [], events: [] });
  const [pasteText, setPasteText] = useState("");
  const currentYear = String(new Date().getFullYear());
  const [objYear, setObjYear] = useState(currentYear);
  const [actYear, setActYear] = useState(String(Number(currentYear) - 1));
  const courseFocusName = useRef<string>("");
  const [newPersonName, setNewPersonName] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null | undefined>(undefined);
  const { toast } = useToast();

  useEffect(() => {
    api.settings.get()
      .then((s) => setDraft(fromSettings(s)))
      .catch(() => setLoadError("Impossible de charger les paramètres"))
      .finally(() => setLoading(false));
    api.health.get().then(setHealth).catch(() => setHealth(null));
  }, []);

  // Scrolls to #objectifs or #apropos once the sections exist.
  useEffect(() => {
    if (loading || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [loading]);

  const patch = (fn: (d: Draft) => Draft) => {
    setDraft((d) => (d ? fn(d) : d));
    setDirty(true);
  };

  const objYears = useMemo(() => {
    const y = Number(currentYear);
    return [String(y - 1), currentYear, String(y + 1)];
  }, [currentYear]);

  const actYears = useMemo(() => {
    const y = Number(currentYear);
    const set = new Set<string>([String(y - 3), String(y - 2), String(y - 1), currentYear, ...Object.keys(draft?.yearActuals ?? {})]);
    return [...set].sort();
  }, [currentYear, draft?.yearActuals]);

  // ── Save ──
  const handleSave = async () => {
    if (!draft) return;
    const recipeCategories = draft.recipeCategories.map((c) => c.trim()).filter(Boolean);
    const courses = draft.courses.map((c) => c.trim()).filter(Boolean);
    if (recipeCategories.length === 0) return toast({ title: "Au moins un format de recette est requis", variant: "destructive" });
    if (courses.length === 0) return toast({ title: "Au moins une catégorie du menu est requise", variant: "destructive" });
    const prestationTypes = draft.prestationTypes
      .filter((t) => t.key.trim() && t.label.trim())
      .map((t) => ({ key: t.key.trim(), label: t.label.trim(), defaultVatRate: t.defaultVatRate }));
    if (new Set(prestationTypes.map((t) => t.key)).size !== prestationTypes.length) {
      return toast({ title: "Deux types de prestation ont la même clé", variant: "destructive" });
    }
    const suppliers = draft.suppliers
      .filter((s) => s.name.trim())
      .map((s) => ({ name: s.name.trim(), address: s.address?.trim() || undefined, phone: s.phone?.trim() || undefined }));
    const people = draft.people
      .filter((p) => p.name.trim())
      .map((p) => ({ personId: p.personId, name: p.name.trim(), initials: p.initials?.trim() || undefined, active: p.active }));
    const activeInitials = people.filter((p) => p.active).map((p) => personInitials(p).toUpperCase());
    if (new Set(activeInitials).size !== activeInitials.length) {
      return toast({ title: "Deux personnes actives ont les mêmes initiales", variant: "destructive" });
    }
    const fixedCharges = draft.fixedCharges
      .filter((c) => c.label.trim())
      .map((c) => ({
        chargeId: c.chargeId,
        label: c.label.trim(),
        category: c.category,
        monthlyAmount: round2(c.monthlyAmount || 0),
        monthlyAmountSolo: c.monthlyAmountSolo !== undefined ? round2(c.monthlyAmountSolo) : undefined,
        inResult: c.inResult,
        from: c.from || undefined,
        to: c.to || undefined,
        note: c.note?.trim() || undefined,
      }));
    const objectives: Record<string, YearObjective> = {};
    for (const [year, o] of Object.entries(draft.objectives)) objectives[year] = cleanObjective(o);
    const yearActuals: Record<string, YearActuals> = {};
    for (const [year, a] of Object.entries(draft.yearActuals)) {
      const cleaned = cleanActuals(a);
      if (cleaned) yearActuals[year] = cleaned;
    }
    const company: CompanySettings = {
      name: draft.company.name.trim(),
      vatNumber: draft.company.vatNumber.trim(),
      address: draft.company.address.trim(),
      constitutedOn: draft.company.constitutedOn || undefined,
    };

    setSaving(true);
    try {
      const updated = await api.settings.update({
        recipeCategories,
        courses,
        prestationTypes,
        suppliers,
        people,
        fixedCharges,
        objectives,
        yearActuals,
        company,
        ledgerStartYm: draft.ledgerStartYm || undefined,
        ignoredDuplicateGroups: draft.ignoredDuplicateGroups,
      });
      setDraft(fromSettings(updated));
      setDirty(false);
      toast({ title: "Paramètres enregistrés" });
      const pending = pendingRenames;
      setPendingRenames([]);
      if (pending.length > 0) {
        try {
          const events = await api.events.list();
          renameQueue.current = { queue: pending, events };
          offerNextRename();
        } catch {
          // The events list is only needed for the optional rename.
        }
      }
    } catch (e) {
      toast({ title: (e as Error).message || "Erreur", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Course rename on event lines, offered after the settings are saved ──
  const queueCourseRename = (to: string) => {
    const from = courseFocusName.current;
    courseFocusName.current = "";
    const target = to.trim();
    if (!from || !target || from === target) return;
    setPendingRenames((prev) => {
      const next = prev.map((p) => (p.to === from ? { ...p, to: target } : p)).filter((p) => p.from !== from);
      next.push({ from, to: target });
      return next.filter((p) => p.from !== p.to);
    });
  };

  const offerNextRename = () => {
    const q = renameQueue.current;
    while (q.queue.length > 0) {
      const { from, to } = q.queue.shift()!;
      const affected = q.events.filter((ev) => ev.recipes.some((l) => l.course === from));
      const count = affected.reduce((n, ev) => n + ev.recipes.filter((l) => l.course === from).length, 0);
      if (count > 0) {
        setRename({ from, to, count, events: affected });
        return;
      }
    }
    setRename(null);
  };

  const skipRename = () => {
    if (renaming) return;
    offerNextRename();
  };

  const applyRename = async () => {
    if (!rename) return;
    setRenaming(true);
    let done = 0;
    try {
      for (const ev of rename.events) {
        const lines = ev.recipes.map((l) => ({ lineId: l.lineId, course: l.course === rename.from ? rename.to : l.course }));
        await api.events.lines.put(ev.eventId, lines);
        done += 1;
      }
      toast({ title: `${rename.count} ligne${rename.count > 1 ? "s" : ""} renommée${rename.count > 1 ? "s" : ""} sur ${done} événement${done > 1 ? "s" : ""}` });
      renameQueue.current.events = renameQueue.current.events.map((ev) => ({
        ...ev,
        recipes: ev.recipes.map((l) => (l.course === rename.from ? { ...l, course: rename.to } : l)),
      }));
      offerNextRename();
    } catch (e) {
      toast({ title: `${(e as Error).message || "Erreur"} (${done}/${rename.events.length} événements mis à jour)`, variant: "destructive" });
    } finally {
      setRenaming(false);
    }
  };

  if (loading) return <div className="p-8 text-base text-muted-foreground">Chargement…</div>;
  if (!draft) {
    return (
      <div className="flex flex-wrap items-center gap-3 p-8 text-base text-destructive">
        {loadError ?? "Paramètres indisponibles"}
        <button type="button" className={btnSecondary} onClick={() => window.location.reload()}>Recharger</button>
      </div>
    );
  }

  // ── Derived values ──
  const obj: Partial<YearObjective> = draft.objectives[objYear] ?? {};
  const setObj = (p: Partial<YearObjective>) =>
    patch((d) => ({ ...d, objectives: { ...d.objectives, [objYear]: { ...(d.objectives[objYear] ?? {}), ...p } } }));
  const prevObj = draft.objectives[String(Number(objYear) - 1)];

  const act: YearActuals = draft.yearActuals[actYear] ?? {};
  const setAct = (p: Partial<YearActuals>) =>
    patch((d) => ({ ...d, yearActuals: { ...d.yearActuals, [actYear]: { ...(d.yearActuals[actYear] ?? {}), ...p } } }));

  const totalWithStaff = sumMoney(draft.fixedCharges.map((c) => c.monthlyAmount || 0));
  const totalSolo = sumMoney(draft.fixedCharges.map((c) => c.monthlyAmountSolo ?? c.monthlyAmount ?? 0));
  const outOfResult = draft.fixedCharges.filter((c) => !chargeInResult(c));
  const outWithStaff = sumMoney(outOfResult.map((c) => c.monthlyAmount || 0));
  const outSolo = sumMoney(outOfResult.map((c) => c.monthlyAmountSolo ?? c.monthlyAmount ?? 0));
  const investTotal = sumMoney((obj.investments ?? []).map((i) => i.amount || 0));

  const copyPrevObjective = () => {
    if (!prevObj) return;
    const prevYear = String(Number(objYear) - 1);
    const remap = (rec?: Record<string, number>) =>
      rec ? Object.fromEntries(Object.entries(rec).map(([k, v]) => [k.replace(prevYear, objYear), v])) : undefined;
    patch((d) => ({
      ...d,
      objectives: {
        ...d.objectives,
        [objYear]: {
          ...JSON.parse(JSON.stringify(prevObj)),
          monthlyOverrides: remap(prevObj.monthlyOverrides),
          hoursAvailableOverrides: remap(prevObj.hoursAvailableOverrides),
          corporateTaxActual: undefined,
        },
      },
    }));
  };

  const setPerson = (i: number, p: Partial<Person>) =>
    patch((d) => ({ ...d, people: d.people.map((row, j) => (j === i ? { ...row, ...p } : row)) }));
  const addPerson = () => {
    const name = (newPersonName ?? "").trim();
    if (!name) return;
    patch((d) => ({ ...d, people: [...d.people, { personId: slugifyPersonId(name, d.people.map((p) => p.personId)), name, active: true }] }));
    setNewPersonName(null);
  };
  const activeInitialCounts = new Map<string, number>();
  for (const p of draft.people) {
    if (!p.active) continue;
    const key = personInitials(p).toUpperCase();
    activeInitialCounts.set(key, (activeInitialCounts.get(key) ?? 0) + 1);
  }
  const copyDayLink = async (p: Person) => {
    const url = `${window.location.origin}/jour/aujourdhui?personne=${p.personId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Lien copié, à mettre sur l'écran d'accueil du téléphone" });
    } catch {
      window.prompt("Copier le lien", url);
    }
  };

  const setByPrestation = (type: string, p: Partial<{ amount: number; eventsNeeded: number | undefined; guestsPerEvent: number | undefined }>) => {
    const list = obj.byPrestation ?? [];
    const idx = list.findIndex((r) => r.type === type);
    const current = idx >= 0 ? list[idx] : { type, amount: 0 };
    const nextRow = { ...current, ...p };
    const next = idx >= 0 ? list.map((r, i) => (i === idx ? nextRow : r)) : [...list, nextRow];
    setObj({ byPrestation: next });
  };

  return (
    <div className="mx-auto max-w-doc">
      <PageHeader
        title="Paramètres"
        meta="Configuration de l'application"
        actions={
          dirty ? (
            <button type="button" onClick={handleSave} disabled={saving} className={btnPrimary}>
              <Save className="h-5 w-5" /> {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          ) : undefined
        }
      />

      {/* ── Formats de recette ── */}
      <Section
        title="Formats de recette"
        action={
          <button type="button" className={btnSecondary} onClick={() => patch((d) => ({ ...d, recipeCategories: [...d.recipeCategories, ""] }))}>
            <Plus className="h-5 w-5" /> Ajouter
          </button>
        }
      >
        <div className="space-y-1">
          {draft.recipeCategories.map((cat, i) => (
            <div key={i} className="flex items-center gap-1 min-h-11">
              <input
                aria-label={`Format ${i + 1}`}
                className="input-field flex-1"
                value={cat}
                placeholder="Nom du format…"
                onChange={(e) => patch((d) => ({ ...d, recipeCategories: d.recipeCategories.map((c, j) => (j === i ? e.target.value : c)) }))}
              />
              <MoveButtons index={i} length={draft.recipeCategories.length} onMove={(from, to) => patch((d) => ({ ...d, recipeCategories: moveItem(d.recipeCategories, from, to) }))} />
              <button
                type="button"
                aria-label="Supprimer"
                className={btnIconDanger}
                disabled={draft.recipeCategories.length <= 1}
                onClick={() =>
                  setConfirm({
                    message: `Supprimer le format « ${cat || "sans nom"} » ?`,
                    onConfirm: () => patch((d) => ({ ...d, recipeCategories: d.recipeCategories.filter((_, j) => j !== i) })),
                  })
                }
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Catégories du menu ── */}
      <Section
        title="Catégories du menu"
        action={
          <button type="button" className={btnSecondary} onClick={() => patch((d) => ({ ...d, courses: [...d.courses, ""] }))}>
            <Plus className="h-5 w-5" /> Ajouter
          </button>
        }
      >
        <p className="mb-3 text-base text-muted-foreground">Ordre des services sur les menus et les fiches de préparation.</p>
        <div className="space-y-1">
          {draft.courses.map((course, i) => (
            <div key={i} className="flex items-center gap-1 min-h-11">
              <input
                aria-label={`Catégorie ${i + 1}`}
                className="input-field flex-1"
                value={course}
                placeholder="Nom de la catégorie…"
                onFocus={() => { courseFocusName.current = course.trim(); }}
                onBlur={(e) => queueCourseRename(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                onChange={(e) => patch((d) => ({ ...d, courses: d.courses.map((c, j) => (j === i ? e.target.value : c)) }))}
              />
              <MoveButtons index={i} length={draft.courses.length} onMove={(from, to) => patch((d) => ({ ...d, courses: moveItem(d.courses, from, to) }))} />
              <button
                type="button"
                aria-label="Supprimer"
                className={btnIconDanger}
                disabled={draft.courses.length <= 1}
                onClick={() =>
                  setConfirm({
                    message: `Supprimer la catégorie « ${course || "sans nom"} » ? Les lignes d'événement qui l'utilisent gardent leur valeur.`,
                    onConfirm: () => patch((d) => ({ ...d, courses: d.courses.filter((_, j) => j !== i) })),
                  })
                }
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Types de prestation ── */}
      <Section
        title="Types de prestation"
        action={
          <button
            type="button"
            className={btnSecondary}
            onClick={() => patch((d) => ({ ...d, prestationTypes: [...d.prestationTypes, { key: "", label: "", defaultVatRate: 12, isNew: true }] }))}
          >
            <Plus className="h-5 w-5" /> Ajouter
          </button>
        }
      >
        <p className="mb-3 text-base text-muted-foreground">La clé est générée depuis le libellé et ne change plus une fois enregistrée.</p>
        <div className="space-y-2">
          {draft.prestationTypes.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 min-h-11">
              <input
                aria-label="Libellé"
                className="input-field flex-1 min-w-[12rem]"
                value={t.label}
                placeholder="Libellé…"
                onChange={(e) =>
                  patch((d) => ({
                    ...d,
                    prestationTypes: d.prestationTypes.map((row, j) =>
                      j === i ? { ...row, label: e.target.value, key: row.isNew ? snakeKey(e.target.value) : row.key } : row,
                    ),
                  }))
                }
              />
              <Tag variant="neutral" className="font-mono">{t.key || "clé"}</Tag>
              <label className="flex items-center gap-2 text-base">
                <span className="text-muted-foreground">TVA</span>
                <select
                  aria-label="TVA par défaut"
                  className="input-field w-auto"
                  value={t.defaultVatRate}
                  onChange={(e) =>
                    patch((d) => ({
                      ...d,
                      prestationTypes: d.prestationTypes.map((row, j) => (j === i ? { ...row, defaultVatRate: Number(e.target.value) as VatRate } : row)),
                    }))
                  }
                >
                  {VAT_RATES.map((r) => (
                    <option key={r} value={r}>{r} %</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                aria-label="Supprimer"
                className={btnIconDanger}
                onClick={() =>
                  setConfirm({
                    message: `Supprimer le type « ${t.label || t.key || "sans nom"} » ? Les événements qui l'utilisent gardent leur valeur.`,
                    onConfirm: () => patch((d) => ({ ...d, prestationTypes: d.prestationTypes.filter((_, j) => j !== i) })),
                  })
                }
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ))}
          {draft.prestationTypes.length === 0 && <p className="text-base text-muted-foreground">Aucun type de prestation</p>}
        </div>
      </Section>

      {/* ── Fournisseurs ── */}
      <Section
        title="Fournisseurs"
        action={
          <button type="button" className={btnSecondary} onClick={() => patch((d) => ({ ...d, suppliers: [...d.suppliers, { name: "" }] }))}>
            <Plus className="h-5 w-5" /> Ajouter
          </button>
        }
      >
        <div className="space-y-2">
          {draft.suppliers.map((s, i) => {
            const set = (field: keyof SettingsSupplier, value: string) =>
              patch((d) => ({ ...d, suppliers: d.suppliers.map((row, j) => (j === i ? { ...row, [field]: value } : row)) }));
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 min-h-11">
                <span aria-hidden="true" className="inline-block h-5 w-5 shrink-0 rounded-full" style={{ backgroundColor: supplierColor(s.name) }} />
                <input aria-label="Nom" className="input-field flex-1 min-w-[10rem]" value={s.name} placeholder="Nom…" onChange={(e) => set("name", e.target.value)} />
                <input aria-label="Adresse" className="input-field flex-1 min-w-[10rem]" value={s.address ?? ""} placeholder="Adresse…" onChange={(e) => set("address", e.target.value)} />
                <input aria-label="Téléphone" className="input-field w-40" value={s.phone ?? ""} placeholder="Téléphone…" onChange={(e) => set("phone", e.target.value)} />
                <button
                  type="button"
                  aria-label="Supprimer"
                  className={btnIconDanger}
                  onClick={() =>
                    setConfirm({
                      message: `Supprimer le fournisseur « ${s.name || "sans nom"} » ?`,
                      onConfirm: () => patch((d) => ({ ...d, suppliers: d.suppliers.filter((_, j) => j !== i) })),
                    })
                  }
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            );
          })}
          {draft.suppliers.length === 0 && <p className="text-base text-muted-foreground">Aucun fournisseur</p>}
        </div>
      </Section>

      {/* ── Équipe ── */}
      <Section
        title="Équipe"
        action={
          <button type="button" className={btnSecondary} onClick={() => setNewPersonName((v) => (v === null ? "" : v))}>
            <Plus className="h-5 w-5" /> Ajouter une personne
          </button>
        }
      >
        <p className="mb-3 text-base text-muted-foreground">Les personnes à qui les événements et les lignes sont assignés. Le lien du jour ouvre leur liste sur leur téléphone.</p>
        <div className="space-y-1">
          {draft.people.map((p, i) => {
            const duplicate = p.active && (activeInitialCounts.get(personInitials(p).toUpperCase()) ?? 0) > 1;
            return (
              <div key={p.personId} className={`flex flex-wrap items-center gap-2 min-h-11 ${p.active ? "" : "text-muted-foreground"}`}>
                <PersonChip personId={p.personId} people={draft.people} size="md" />
                <span className="min-w-[8rem] flex-1 text-base">
                  <EditableInlineText value={p.name} placeholder="Nom" onSave={(v) => { if (v.trim()) setPerson(i, { name: v.trim() }); }} />
                </span>
                <input
                  aria-label={`Initiales de ${p.name}`}
                  aria-invalid={duplicate || undefined}
                  className={`input-field w-20 text-center ${duplicate ? "border-destructive" : ""}`}
                  value={p.initials ?? ""}
                  placeholder={personInitials(p)}
                  maxLength={3}
                  onChange={(e) => setPerson(i, { initials: e.target.value.replace(/[^a-zA-ZÀ-ÿ]/g, "").toUpperCase().slice(0, 3) || undefined })}
                />
                <label className="flex min-h-11 items-center gap-2 text-base">
                  <input type="checkbox" className="h-5 w-5" checked={p.active} onChange={(e) => setPerson(i, { active: e.target.checked })} />
                  Actif
                </label>
                <button type="button" className={btnSecondary} onClick={() => void copyDayLink(p)}>
                  <Link2 className="h-5 w-5" /> Lien du jour
                </button>
                <MoveButtons index={i} length={draft.people.length} onMove={(from, to) => patch((d) => ({ ...d, people: moveItem(d.people, from, to) }))} />
                <button type="button" className={btnSecondary} onClick={() => setPerson(i, { active: !p.active })}>
                  {p.active ? "Désactiver" : "Réactiver"}
                </button>
              </div>
            );
          })}
          {draft.people.length === 0 && newPersonName === null && <p className="text-base text-muted-foreground">Aucune personne</p>}
          {newPersonName !== null && (
            <div className="flex flex-wrap items-center gap-2 min-h-11">
              <input
                autoFocus
                aria-label="Nom de la personne"
                className="input-field flex-1 min-w-[10rem]"
                value={newPersonName}
                placeholder="Prénom…"
                onChange={(e) => setNewPersonName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPerson(); } if (e.key === "Escape") setNewPersonName(null); }}
              />
              <button type="button" className={btnPrimary} disabled={!newPersonName.trim()} onClick={addPerson}>Ajouter</button>
              <button type="button" className={btnSecondary} onClick={() => setNewPersonName(null)}>Annuler</button>
            </div>
          )}
        </div>
      </Section>

      {/* ── Charges fixes ── */}
      <Section
        title="Charges fixes"
        action={
          <button
            type="button"
            className={btnSecondary}
            onClick={() =>
              patch((d) => ({
                ...d,
                fixedCharges: [...d.fixedCharges, { chargeId: newId(), label: "", category: "autre", monthlyAmount: 0, inResult: true }],
              }))
            }
          >
            <Plus className="h-5 w-5" /> Ajouter
          </button>
        }
      >
        <p className="mb-3 text-base text-muted-foreground">Montants mensuels HTVA. Depuis et Jusqu'au sont facultatifs et bornent la période où la charge compte.</p>
        <div className="space-y-3">
          {draft.fixedCharges.map((c, i) => {
            const set = (p: Partial<FixedCharge>) =>
              patch((d) => ({ ...d, fixedCharges: d.fixedCharges.map((row, j) => (j === i ? { ...row, ...p } : row)) }));
            const inResult = chargeInResult(c);
            return (
              <div key={c.chargeId} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input aria-label="Intitulé" className="input-field flex-1 min-w-[12rem]" value={c.label} placeholder="Intitulé…" onChange={(e) => set({ label: e.target.value })} />
                  <select aria-label="Catégorie" className="input-field w-auto" value={c.category} onChange={(e) => set({ category: e.target.value as FixedChargeCategory })}>
                    {CHARGE_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                  {!inResult && <Tag variant="warning">hors résultat</Tag>}
                  <button
                    type="button"
                    aria-label="Supprimer"
                    className={btnIconDanger}
                    onClick={() =>
                      setConfirm({
                        message: `Supprimer la charge « ${c.label || "sans nom"} » ?`,
                        onConfirm: () => patch((d) => ({ ...d, fixedCharges: d.fixedCharges.filter((_, j) => j !== i) })),
                      })
                    }
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                  <div>
                    <FieldLabel htmlFor={`ch-${c.chargeId}-m`}>Mensuel</FieldLabel>
                    <NumInput id={`ch-${c.chargeId}-m`} value={c.monthlyAmount} min={0} onChange={(v) => set({ monthlyAmount: v ?? 0 })} />
                  </div>
                  <div>
                    <FieldLabel htmlFor={`ch-${c.chargeId}-s`}>Mensuel seule</FieldLabel>
                    <NumInput id={`ch-${c.chargeId}-s`} value={c.monthlyAmountSolo} min={0} placeholder="idem" onChange={(v) => set({ monthlyAmountSolo: v })} />
                  </div>
                  <div>
                    <FieldLabel htmlFor={`ch-${c.chargeId}-f`}>Depuis</FieldLabel>
                    <input id={`ch-${c.chargeId}-f`} type="month" className="input-field" value={c.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} />
                  </div>
                  <div>
                    <FieldLabel htmlFor={`ch-${c.chargeId}-t`}>Jusqu'au</FieldLabel>
                    <input id={`ch-${c.chargeId}-t`} type="month" className="input-field" value={c.to ?? ""} onChange={(e) => set({ to: e.target.value || undefined })} />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="flex min-h-11 items-center gap-2 text-base">
                    <input type="checkbox" className="h-5 w-5" checked={inResult} onChange={(e) => set({ inResult: e.target.checked })} />
                    Dans le résultat
                  </label>
                  <input aria-label="Note" className="input-field flex-1 min-w-[10rem]" value={c.note ?? ""} placeholder="Note…" onChange={(e) => set({ note: e.target.value })} />
                </div>
              </div>
            );
          })}
          {draft.fixedCharges.length === 0 && <p className="text-base text-muted-foreground">Aucune charge fixe</p>}
        </div>

        <dl className="mt-4 space-y-1 text-base tabular-nums">
          <div className="flex min-h-11 items-center justify-between gap-3 border-t border-border">
            <dt className="font-medium">Total charges mensuelles</dt>
            <dd className="text-right">
              {fmtEur(totalWithStaff)} <span className="text-muted-foreground">avec salarié</span> · {fmtEur(totalSolo)} <span className="text-muted-foreground">seule</span>
            </dd>
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <dt className="text-muted-foreground">dont hors résultat</dt>
            <dd className="text-right">
              {fmtEur(outWithStaff)} <span className="text-muted-foreground">avec salarié</span> · {fmtEur(outSolo)} <span className="text-muted-foreground">seule</span>
            </dd>
          </div>
        </dl>

        <div className="mt-4">
          <FieldLabel htmlFor="paste-charges">Coller une liste</FieldLabel>
          <p className="mb-1 text-base text-muted-foreground">Une ligne par charge, « Intitulé;montant » ou séparée par une tabulation. Catégorie Autre, dans le résultat.</p>
          <textarea
            id="paste-charges"
            className="input-field min-h-24"
            value={pasteText}
            placeholder={"Loyer;850\nAssurance RC\t45,50"}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <button
            type="button"
            className={`${btnSecondary} mt-2`}
            disabled={!pasteText.trim()}
            onClick={() => {
              const rows = parsePastedCharges(pasteText);
              if (rows.length === 0) return toast({ title: "Aucune ligne reconnue", variant: "destructive" });
              patch((d) => ({ ...d, fixedCharges: [...d.fixedCharges, ...rows] }));
              setPasteText("");
              toast({ title: `${rows.length} charge${rows.length > 1 ? "s" : ""} ajoutée${rows.length > 1 ? "s" : ""}` });
            }}
          >
            <Plus className="h-5 w-5" /> Ajouter les lignes
          </button>
        </div>
      </Section>

      {/* ── Objectifs par année ── */}
      <div id="objectifs" className="scroll-mt-20">
      <Section
        title="Objectifs par année"
        action={
          <>
            <YearSelect id="obj-year" value={objYear} years={objYears} onChange={setObjYear} />
            <button type="button" className={btnSecondary} disabled={!prevObj} onClick={copyPrevObjective}>
              Copier l'objectif de {Number(objYear) - 1}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <FieldLabel htmlFor="obj-revenue">CA annuel HTVA</FieldLabel>
            <NumInput id="obj-revenue" value={obj.annualRevenue} min={0} placeholder="0" onChange={(v) => setObj({ annualRevenue: v })} />
          </div>
          <div>
            <FieldLabel htmlFor="obj-months">Mois actifs</FieldLabel>
            <NumInput id="obj-months" value={obj.monthsActive} min={1} step={1} placeholder={String(DEFAULT_MONTHS_ACTIVE)} onChange={(v) => setObj({ monthsActive: v })} />
          </div>
        </div>

        <h3 className="mt-5 text-base font-medium">Objectif par mois</h3>
        <p className="mb-2 text-base text-muted-foreground">Laisser vide pour répartir le CA annuel sur les mois actifs.</p>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {MONTH_KEYS.map((m, i) => {
            const ym = `${objYear}-${m}`;
            return (
              <div key={ym}>
                <FieldLabel htmlFor={`obj-mo-${ym}`}>{MONTHS[i]}</FieldLabel>
                <NumInput
                  id={`obj-mo-${ym}`}
                  value={obj.monthlyOverrides?.[ym]}
                  min={0}
                  onChange={(v) => {
                    const next = { ...(obj.monthlyOverrides ?? {}) };
                    if (v === undefined) delete next[ym]; else next[ym] = v;
                    setObj({ monthlyOverrides: next });
                  }}
                />
              </div>
            );
          })}
        </div>

        <h3 className="mt-5 text-base font-medium">Objectif par prestation</h3>
        <div className="mt-2 space-y-2">
          {draft.prestationTypes.filter((t) => t.key).map((t) => {
            const row = obj.byPrestation?.find((r) => r.type === t.key);
            return (
              <div key={t.key} className="grid grid-cols-1 items-end gap-2 md:grid-cols-[1fr_8rem_8rem_8rem]">
                <div className="min-h-11 flex items-center text-base">{t.label}</div>
                <div>
                  <FieldLabel htmlFor={`obj-bp-${t.key}-a`}>Montant</FieldLabel>
                  <NumInput id={`obj-bp-${t.key}-a`} value={row?.amount} min={0} onChange={(v) => setByPrestation(t.key, { amount: v ?? 0 })} />
                </div>
                <div>
                  <FieldLabel htmlFor={`obj-bp-${t.key}-e`}>Événements</FieldLabel>
                  <NumInput id={`obj-bp-${t.key}-e`} value={row?.eventsNeeded} min={0} step={1} onChange={(v) => setByPrestation(t.key, { eventsNeeded: v })} />
                </div>
                <div>
                  <FieldLabel htmlFor={`obj-bp-${t.key}-g`}>Convives / évén.</FieldLabel>
                  <NumInput id={`obj-bp-${t.key}-g`} value={row?.guestsPerEvent} min={0} onChange={(v) => setByPrestation(t.key, { guestsPerEvent: v })} />
                </div>
              </div>
            );
          })}
        </div>

        <h3 className="mt-5 text-base font-medium">Heures disponibles</h3>
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <FieldLabel htmlFor="obj-hours">Heures disponibles par mois</FieldLabel>
            <NumInput id="obj-hours" value={obj.hoursAvailablePerMonth} min={0} onChange={(v) => setObj({ hoursAvailablePerMonth: v })} />
          </div>
        </div>
        <p className="mb-2 mt-3 text-base text-muted-foreground">Dérogations par mois, facultatives.</p>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {MONTH_KEYS.map((m, i) => {
            const ym = `${objYear}-${m}`;
            return (
              <div key={ym}>
                <FieldLabel htmlFor={`obj-h-${ym}`}>{MONTHS[i]}</FieldLabel>
                <NumInput
                  id={`obj-h-${ym}`}
                  value={obj.hoursAvailableOverrides?.[ym]}
                  min={0}
                  onChange={(v) => {
                    const next = { ...(obj.hoursAvailableOverrides ?? {}) };
                    if (v === undefined) delete next[ym]; else next[ym] = v;
                    setObj({ hoursAvailableOverrides: next });
                  }}
                />
              </div>
            );
          })}
        </div>

        <h3 className="mt-5 text-base font-medium">Hypothèses</h3>
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <FieldLabel htmlFor="obj-mp">% matières premières</FieldLabel>
            <NumInput
              id="obj-mp"
              value={obj.rawMaterialPct === undefined ? undefined : round2(obj.rawMaterialPct * 100)}
              placeholder={String(round2(DEFAULT_RAW_MATERIAL_PCT * 100))}
              min={0}
              onChange={(v) => setObj({ rawMaterialPct: v === undefined ? undefined : Math.round(v * 100) / 10000 })}
            />
          </div>
          <div>
            <FieldLabel htmlFor="obj-isoc">Taux ISoc %</FieldLabel>
            <NumInput
              id="obj-isoc"
              value={obj.corporateTaxRate === undefined ? undefined : round2(obj.corporateTaxRate * 100)}
              placeholder={String(round2(DEFAULT_TAX_RATE * 100))}
              min={0}
              onChange={(v) => setObj({ corporateTaxRate: v === undefined ? undefined : Math.round(v * 100) / 10000 })}
            />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-base md:col-span-2">
            <input type="checkbox" className="h-5 w-5" checked={obj.smeReducedRate ?? false} onChange={(e) => setObj({ smeReducedRate: e.target.checked })} />
            Taux réduit PME (20 % sur les premiers 100 000 €)
          </label>
          <p className="text-base text-muted-foreground md:col-span-2">
            25 % par défaut. Le taux réduit de 20 % sur les premiers 100 000 € suppose une rémunération de dirigeant d'au moins 45 000 € (ou au moins égale au résultat imposable) et d'autres conditions PME; à confirmer avec le comptable. Le classeur utilisait 15 %, qui n'existe plus.
          </p>
          <div>
            <FieldLabel htmlFor="obj-isoc-actual">ISoc réel (comptable)</FieldLabel>
            <NumInput id="obj-isoc-actual" value={obj.corporateTaxActual} min={0} onChange={(v) => setObj({ corporateTaxActual: v })} />
          </div>
          <div>
            <FieldLabel htmlFor="obj-extras">Budget extras</FieldLabel>
            <NumInput id="obj-extras" value={obj.extrasBudget} min={0} onChange={(v) => setObj({ extrasBudget: v })} />
          </div>
          <div>
            <FieldLabel htmlFor="obj-treasury">Mois de trésorerie</FieldLabel>
            <NumInput id="obj-treasury" value={obj.treasuryMonths} placeholder={String(DEFAULT_TREASURY_MONTHS)} min={0} onChange={(v) => setObj({ treasuryMonths: v })} />
          </div>
          <div>
            <FieldLabel htmlFor="obj-saving">Épargne mensuelle</FieldLabel>
            <NumInput id="obj-saving" value={obj.treasurySavingPerMonth} placeholder="0" min={0} onChange={(v) => setObj({ treasurySavingPerMonth: v })} />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <h3 className="text-base font-medium">Investissements</h3>
          <button type="button" className={btnSecondary} onClick={() => setObj({ investments: [...(obj.investments ?? []), { label: "", amount: 0 }] })}>
            <Plus className="h-5 w-5" /> Ajouter
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {(obj.investments ?? []).map((inv, i) => (
            <div key={i} className="flex items-center gap-2 min-h-11">
              <input
                aria-label="Intitulé"
                className="input-field flex-1"
                value={inv.label}
                placeholder="Intitulé…"
                onChange={(e) => setObj({ investments: (obj.investments ?? []).map((r, j) => (j === i ? { ...r, label: e.target.value } : r)) })}
              />
              <NumInput
                ariaLabel="Montant"
                className="w-36"
                value={inv.amount}
                min={0}
                onChange={(v) => setObj({ investments: (obj.investments ?? []).map((r, j) => (j === i ? { ...r, amount: v ?? 0 } : r)) })}
              />
              <button type="button" aria-label="Supprimer" className={btnIconDanger} onClick={() => setObj({ investments: (obj.investments ?? []).filter((_, j) => j !== i) })}>
                <X className="h-5 w-5" />
              </button>
            </div>
          ))}
          <div className="flex min-h-11 items-center justify-between border-t border-border text-base tabular-nums">
            <span className="font-medium">Total investissements</span>
            <span>{fmtEur(investTotal)}</span>
          </div>
        </div>
      </Section>
      </div>

      {/* ── Années précédentes ── */}
      <Section title="Années précédentes" action={<YearSelect id="act-year" value={actYear} years={actYears} onChange={setActYear} />}>
        <p className="mb-3 text-base text-muted-foreground">
          Valeurs de référence saisies à la main pour les comparaisons. Elles ne sont jamais des écritures du journal et n'entrent pas dans l'export.
        </p>
        <h3 className="text-base font-medium">CA HTVA par mois</h3>
        <div className="mt-2 grid grid-cols-3 gap-2 md:grid-cols-6">
          {MONTH_KEYS.map((m, i) => (
            <div key={m}>
              <FieldLabel htmlFor={`act-m-${actYear}-${m}`}>{MONTHS[i]}</FieldLabel>
              <NumInput
                id={`act-m-${actYear}-${m}`}
                value={act.monthly?.[m]}
                min={0}
                onChange={(v) => {
                  const next = { ...(act.monthly ?? {}) };
                  if (v === undefined) delete next[m]; else next[m] = v;
                  setAct({ monthly: next });
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex min-h-11 items-center justify-between border-t border-border text-base tabular-nums">
          <span className="font-medium">Total {actYear}</span>
          <span>{fmtEur(sumMoney(Object.values(act.monthly ?? {})))}</span>
        </div>

        <h3 className="mt-5 text-base font-medium">CA HTVA par type de prestation</h3>
        <div className="mt-2 space-y-2">
          {draft.prestationTypes.filter((t) => t.key).map((t) => (
            <div key={t.key} className="flex items-center gap-2 min-h-11">
              <span className="flex-1 text-base">{t.label}</span>
              <NumInput
                ariaLabel={`CA ${t.label}`}
                className="w-40"
                value={act.byPrestation?.[t.key]}
                min={0}
                placeholder="inconnu"
                onChange={(v) => {
                  const next = { ...(act.byPrestation ?? {}) };
                  if (v === undefined) delete next[t.key]; else next[t.key] = v;
                  setAct({ byPrestation: next });
                }}
              />
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <h3 className="text-base font-medium">Périodes</h3>
          <button type="button" className={btnSecondary} onClick={() => setAct({ byPeriod: [...(act.byPeriod ?? []), { from: "01-01", to: "04-30", amount: 0 }] })}>
            <Plus className="h-5 w-5" /> Ajouter
          </button>
        </div>
        <p className="mb-2 text-base text-muted-foreground">Dates au format MM-JJ, par exemple 01-01 au 04-30.</p>
        <div className="space-y-2">
          {(act.byPeriod ?? []).map((p, i) => {
            const set = (patchRow: Partial<{ from: string; to: string; amount: number }>) =>
              setAct({ byPeriod: (act.byPeriod ?? []).map((r, j) => (j === i ? { ...r, ...patchRow } : r)) });
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 min-h-11">
                <FieldLabel htmlFor={`act-p-${i}-f`} className="mb-0">Du</FieldLabel>
                <input id={`act-p-${i}-f`} className="input-field w-24 tabular-nums" value={p.from} placeholder="MM-JJ" onChange={(e) => set({ from: e.target.value })} />
                <FieldLabel htmlFor={`act-p-${i}-t`} className="mb-0">au</FieldLabel>
                <input id={`act-p-${i}-t`} className="input-field w-24 tabular-nums" value={p.to} placeholder="MM-JJ" onChange={(e) => set({ to: e.target.value })} />
                <NumInput ariaLabel="Montant" className="w-36" value={p.amount} min={0} onChange={(v) => set({ amount: v ?? 0 })} />
                <button type="button" aria-label="Supprimer" className={btnIconDanger} onClick={() => setAct({ byPeriod: (act.byPeriod ?? []).filter((_, j) => j !== i) })}>
                  <X className="h-5 w-5" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-5">
          <FieldLabel htmlFor="act-note">Note</FieldLabel>
          <textarea id="act-note" className="input-field min-h-20" value={act.note ?? ""} placeholder="Source des chiffres…" onChange={(e) => setAct({ note: e.target.value })} />
        </div>
      </Section>

      {/* ── Société ── */}
      <Section title="Société">
        <p className="mb-3 text-base text-muted-foreground">Repris dans l'en-tête des exports comptables.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <FieldLabel htmlFor="co-name">Nom</FieldLabel>
            <input id="co-name" className="input-field" value={draft.company.name} onChange={(e) => patch((d) => ({ ...d, company: { ...d.company, name: e.target.value } }))} />
          </div>
          <div>
            <FieldLabel htmlFor="co-vat">Numéro de TVA</FieldLabel>
            <input id="co-vat" className="input-field" value={draft.company.vatNumber} placeholder="BE 0123.456.789" onChange={(e) => patch((d) => ({ ...d, company: { ...d.company, vatNumber: e.target.value } }))} />
          </div>
          <div className="md:col-span-2">
            <FieldLabel htmlFor="co-address">Adresse</FieldLabel>
            <input id="co-address" className="input-field" value={draft.company.address} onChange={(e) => patch((d) => ({ ...d, company: { ...d.company, address: e.target.value } }))} />
          </div>
          <div>
            <FieldLabel htmlFor="co-date">Date de constitution</FieldLabel>
            <input id="co-date" type="date" className="input-field" value={draft.company.constitutedOn ?? ""} onChange={(e) => patch((d) => ({ ...d, company: { ...d.company, constitutedOn: e.target.value || undefined } }))} />
          </div>
          <div>
            <FieldLabel htmlFor="co-ledger-start">Début du journal</FieldLabel>
            <input id="co-ledger-start" type="month" className="input-field" value={draft.ledgerStartYm ?? ""} onChange={(e) => patch((d) => ({ ...d, ledgerStartYm: e.target.value || undefined }))} />
            <p className="mt-1 text-sm text-muted-foreground">Les mois avant cette date lisent les Années précédentes.</p>
          </div>
        </div>
      </Section>

      {/* ── Doublons ignorés ── */}
      <Section title="Doublons ignorés">
        {draft.ignoredDuplicateGroups.length === 0 ? (
          <p className="text-base text-muted-foreground">Aucun doublon ignoré</p>
        ) : (
          <div className="space-y-1">
            {draft.ignoredDuplicateGroups.map((key) => (
              <div key={key} className="flex items-center justify-between gap-3 min-h-11">
                <span className="truncate text-base">{key}</span>
                <button type="button" className={btnSecondary} onClick={() => patch((d) => ({ ...d, ignoredDuplicateGroups: d.ignoredDuplicateGroups.filter((k) => k !== key) }))}>
                  Reprendre
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── À propos ── */}
      <div id="apropos" className="scroll-mt-20">
      <Section title="À propos">
        <p className="text-base text-muted-foreground">admin · v1.0</p>
        <dl className="mt-3 space-y-1 text-base">
          {([["ta-clients", health?.tables.clients], ["ta-ledger", health?.tables.ledger]] as const).map(([table, present]) => (
            <div key={table} className="flex min-h-11 items-center gap-3">
              <dt className="w-28 font-mono">{table}</dt>
              <dd>
                {health === undefined ? (
                  <span className="text-muted-foreground">Vérification…</span>
                ) : health === null ? (
                  <Tag variant="neutral">État inconnu</Tag>
                ) : present ? (
                  <Tag variant="success">Table présente</Tag>
                ) : (
                  <Tag variant="warning">Table absente</Tag>
                )}
              </dd>
            </div>
          ))}
        </dl>
        {health && ([["clients", "ta-clients"], ["ledger", "ta-ledger"]] as const).filter(([key]) => !health.tables[key]).map(([key, table]) => (
          <p key={key} className="mt-2 text-base text-muted-foreground">
            Créer la table {table}-&lt;stage&gt; puis renseigner le paramètre SSM (README, étape 4)
          </p>
        ))}
      </Section>
      </div>

      {/* ── Dialogs ── */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay" onClick={() => setConfirm(null)}>
          <div className="w-[92%] max-w-sm rounded-2xl bg-card p-7 text-center shadow-xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-h3">Confirmer la suppression</h3>
            <p className="mb-6 text-base text-muted-foreground">{confirm.message}</p>
            <div className="flex justify-center gap-3">
              <button type="button" onClick={() => setConfirm(null)} className={btnSecondary}>Annuler</button>
              <button
                type="button"
                onClick={() => { confirm.onConfirm(); setConfirm(null); }}
                className="inline-flex min-h-11 items-center rounded-lg bg-destructive px-4 text-base font-medium text-destructive-foreground"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {rename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay" onClick={skipRename}>
          <div className="w-[92%] max-w-sm rounded-2xl bg-card p-7 text-center shadow-xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-h3">Renommer aussi sur {rename.count} ligne{rename.count > 1 ? "s" : ""} d'événement ?</h3>
            <p className="mb-6 text-base text-muted-foreground">
              « {rename.from} » devient « {rename.to} » sur {rename.events.length} événement{rename.events.length > 1 ? "s" : ""}. Les événements sont mis à jour tout de suite.
            </p>
            <div className="flex justify-center gap-3">
              <button type="button" disabled={renaming} onClick={skipRename} className={btnSecondary}>Non</button>
              <button type="button" disabled={renaming} onClick={() => void applyRename()} className={btnPrimary}>
                {renaming ? "Mise à jour…" : "Renommer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
