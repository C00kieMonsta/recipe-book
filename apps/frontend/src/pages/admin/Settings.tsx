import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, GripVertical, Link2, Plus, Save, Trash2, X } from "lucide-react";
import type {
  AppEvent,
  AppSettings,
  CompanySettings,
  FixedCharge,
  FixedChargeCategory,
  InvoicingMode,
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
  DEFAULT_SUPPLIERS,
  VAT_RATES,
  fmtEur,
  personInitials,
  round2,
  slugifyPersonId,
  sumMoney,
} from "@packages/types";
import { api, ApiError, invalidate, type HealthResponse } from "@/lib/api";
import { supplierColor } from "@/lib/recipe-helpers";
import { useToast } from "@/hooks/use-toast";
import { useTopTitle } from "@/components/admin/AdminLayout";
import { useTour } from "@/components/admin/TourProvider";
import {
  ActionMenu,
  Button,
  Checkbox,
  Dialog,
  EditableInlineText,
  EditableText,
  FieldLabel,
  IconButton,
  ListRow,
  PageHeader,
  Property,
  PropertyList,
  Section,
  SectionToggle,
  SelectPill,
  Sheet,
  Tag,
  Toolbar,
  ViewTabs,
  type ActionMenuItem,
} from "@/components/ui";
import { PersonChip } from "@/components/admin/PersonChips";

// ── Local types and constants ────────────────────────────────────────────────

type DraftPrestationType = PrestationTypeSetting & { isNew?: boolean };

interface Draft {
  courses: string[];
  prestationTypes: DraftPrestationType[];
  suppliers: SettingsSupplier[];
  people: Person[];
  fixedCharges: FixedCharge[];
  objectives: Record<string, Partial<YearObjective>>;
  yearActuals: Record<string, YearActuals>;
  company: CompanySettings;
  invoicing: InvoicingMode;
  ledgerStartYm?: string;
  ignoredDuplicateGroups: string[];
  // Sent back on save so the backend can refuse a stale draft.
  updatedAt?: string;
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

type Tab = "general" | "catalogue" | "equipe" | "finances" | "societe";
const TABS: { key: Tab; label: string }[] = [
  { key: "general", label: "Général" },
  { key: "catalogue", label: "Catalogue" },
  { key: "equipe", label: "Équipe" },
  { key: "finances", label: "Finances" },
  { key: "societe", label: "Société" },
];

// Old anchors land on their new tab.
function tabFromHash(hash: string): Tab {
  const h = hash.replace(/^#/, "");
  if (h === "objectifs") return "finances";
  if (h === "apropos") return "societe";
  return TABS.some((t) => t.key === h) ? (h as Tab) : "general";
}

const VAT_OPTIONS = VAT_RATES.map((r) => ({ value: String(r), label: `${r} %` }));
const INVOICING_OPTIONS: { value: InvoicingMode; label: string }[] = [
  { value: "app", label: "Dans l'application" },
  { value: "externe", label: "Dans un autre outil (Odoo)" },
];
const longDate = new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "long", year: "numeric" });

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
    courses: s.courses?.length ? s.courses : DEFAULT_COURSES,
    prestationTypes: s.prestationTypes?.length ? s.prestationTypes : DEFAULT_PRESTATION_TYPES,
    suppliers: s.suppliers?.length ? s.suppliers : DEFAULT_SUPPLIERS,
    people: s.people ?? [],
    fixedCharges: s.fixedCharges ?? [],
    objectives: s.objectives ?? {},
    yearActuals: s.yearActuals ?? {},
    company: s.company ?? { name: "", vatNumber: "", address: "" },
    invoicing: s.invoicing ?? "app",
    ledgerStartYm: s.ledgerStartYm,
    ignoredDuplicateGroups: s.ignoredDuplicateGroups ?? [],
    updatedAt: s.updatedAt,
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

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function fmtMonth(ym: string): string {
  return /^\d{4}-\d{2}$/.test(ym) ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : ym;
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

// Compact bordered-looking number input for the monthly grids.
function NumInput({ id, value, onChange, step = "any", min, placeholder, className = "", ariaLabel }: NumInputProps) {
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      aria-label={ariaLabel}
      className={`input-field input-compact tabular-nums ${className}`}
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

const INLINE_EDIT = "-mx-1 rounded bg-input-bg px-1 shadow-ring outline-none";

// Inline optional number: click to edit, empty commits undefined.
function OptNumValue({ value, onChange, placeholder = "Vide", suffix, min, step, ariaLabel, className = "" }: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  suffix?: string;
  min?: number;
  step?: number;
  ariaLabel?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value === undefined ? "" : String(value));
  useEffect(() => { if (!editing) setText(value === undefined ? "" : String(value)); }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const cleaned = text.trim().replace(/\s/g, "").replace(",", ".");
    if (cleaned === "") { if (value !== undefined) onChange(undefined); return; }
    const parsed = parseFloat(cleaned);
    if (Number.isNaN(parsed)) return;
    let v = min !== undefined ? Math.max(min, parsed) : parsed;
    if (step === 1) v = Math.round(v);
    if (v !== value) onChange(v);
  };
  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          className={`${INLINE_EDIT} w-24 text-right tabular-nums ${className}`}
          inputMode="decimal"
          aria-label={ariaLabel}
          value={text}
          autoFocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { e.preventDefault(); setText(value === undefined ? "" : String(value)); setEditing(false); }
          }}
        />
        {suffix && <span className="text-muted-foreground">{suffix}</span>}
      </span>
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className={`prop-value inline-flex min-h-6 items-center tabular-nums touch:min-h-11 ${className}`}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(true); } }}
    >
      {value === undefined ? <span className="text-placeholder">{placeholder}</span> : <>{value.toLocaleString("fr-BE")}{suffix && <span className="text-muted-foreground">{"\u00a0"}{suffix}</span>}</>}
    </span>
  );
}

// Inline month: click opens the native month picker; × clears.
function MonthValue({ value, onChange, placeholder = "Vide", ariaLabel }: { value: string | undefined; onChange: (v: string | undefined) => void; placeholder?: string; ariaLabel?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const open = () => {
    const el = input.current;
    if (!el) return;
    try { if (typeof el.showPicker === "function") el.showPicker(); else el.focus(); } catch { el.focus(); }
  };
  return (
    <span className="group/month relative inline-flex items-center gap-0.5">
      <span
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        className="prop-value inline-flex min-h-6 items-center tabular-nums touch:min-h-11"
        onClick={open}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
      >
        {value ? fmtMonth(value) : <span className="text-placeholder">{placeholder}</span>}
      </span>
      {value && <IconButton size="sm" aria-label="Effacer" icon={<X />} className="reveal h-6 w-6" onClick={() => onChange(undefined)} />}
      <input
        ref={input}
        type="month"
        value={value ?? ""}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only absolute bottom-0 left-0"
        onChange={(e) => onChange(e.target.value || undefined)}
      />
    </span>
  );
}

function YearPill({ value, years, onChange, label }: { value: string; years: string[]; onChange: (y: string) => void; label: string }) {
  return <SelectPill value={value} options={years.map((y) => ({ value: y, label: y }))} colour="gray" align="right" aria-label={label} onChange={onChange} />;
}

const ROW = "group flex min-h-8 items-center gap-2 rounded px-2 hover:bg-hover touch:min-h-11";
const ROW_TEXT = "min-w-0 flex-1 text-sm touch:text-base";
const TH = "flex items-center gap-2 border-b border-divider px-2 text-sm text-muted-foreground h-9";

// One reorderable name row of the Général lists.
function NameRow({ value, placeholder, onSave, index, length, onMove, onDelete, deleteDisabled, ariaLabel }: {
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
  index: number;
  length: number;
  onMove: (from: number, to: number) => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
  ariaLabel: string;
}) {
  const items: ActionMenuItem[] = [
    { label: "Monter", icon: <ArrowUp />, onClick: () => onMove(index, index - 1), disabled: index === 0 },
    { label: "Descendre", icon: <ArrowDown />, onClick: () => onMove(index, index + 1), disabled: index >= length - 1 },
    { kind: "separator" },
    { label: "Supprimer", icon: <Trash2 />, onClick: onDelete, variant: "danger", disabled: deleteDisabled },
  ];
  return (
    <div className={ROW}>
      <GripVertical className="h-4 w-4 shrink-0 text-icon" aria-hidden="true" />
      <EditableText value={value} placeholder={placeholder} onSave={onSave} className={ROW_TEXT} />
      <ActionMenu items={items} className="reveal" aria-label={ariaLabel} />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Settings() {
  const location = useLocation();
  const navigate = useNavigate();
  useTopTitle("Paramètres");
  const tour = useTour();
  const tab = tabFromHash(location.hash);
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
  const [chargeSheet, setChargeSheet] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null | undefined>(undefined);
  const { toast } = useToast();

  useEffect(() => {
    api.settings.get()
      .then((s) => setDraft(fromSettings(s)))
      .catch(() => setLoadError("Impossible de charger les paramètres"))
      .finally(() => setLoading(false));
    api.health.get().then(setHealth).catch(() => setHealth(null));
  }, []);

  const setTab = (key: string) => navigate({ pathname: location.pathname, hash: `#${key}` }, { replace: true });

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
    const courses = draft.courses.map((c) => c.trim()).filter(Boolean);
    if (courses.length === 0) return toast({ title: "Au moins une catégorie est requise", variant: "destructive" });
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
        courses,
        prestationTypes,
        suppliers,
        people,
        fixedCharges,
        objectives,
        yearActuals,
        company,
        invoicing: draft.invoicing,
        ledgerStartYm: draft.ledgerStartYm || undefined,
        ignoredDuplicateGroups: draft.ignoredDuplicateGroups,
        updatedAt: draft.updatedAt,
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
      if (e instanceof ApiError && e.status === 409) {
        invalidate("settings");
        try {
          const fresh = await api.settings.get();
          setDraft(fromSettings(fresh));
          setDirty(false);
        } catch {
          // The toast below already tells the user to expect a reload.
        }
        toast({ title: "Modifié ailleurs, le formulaire a été rechargé", variant: "destructive" });
      } else {
        toast({ title: (e as Error).message || "Erreur", variant: "destructive" });
      }
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

  if (loading) return <div className="text-sm text-muted-foreground">Chargement…</div>;
  if (!draft) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-danger">
        {loadError ?? "Paramètres indisponibles"}
        <Button variant="default" size="md" onClick={() => window.location.reload()}>Recharger</Button>
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

  const setCharge = (id: string, p: Partial<FixedCharge>) =>
    patch((d) => ({ ...d, fixedCharges: d.fixedCharges.map((row) => (row.chargeId === id ? { ...row, ...p } : row)) }));
  const askDeleteCharge = (c: FixedCharge) =>
    setConfirm({
      message: `Supprimer la charge « ${c.label || "sans nom"} » ?`,
      onConfirm: () => { setChargeSheet(null); patch((d) => ({ ...d, fixedCharges: d.fixedCharges.filter((row) => row.chargeId !== c.chargeId) })); },
    });
  const addCharge = () =>
    patch((d) => ({ ...d, fixedCharges: [...d.fixedCharges, { chargeId: newId(), label: "", category: "autre", monthlyAmount: 0, inResult: true }] }));

  const addAction = (label: string, onClick: () => void) => (
    <Button variant="subtle" size="sm" icon={<Plus />} onClick={onClick}>{label}</Button>
  );

  const saveButton = (size: "md" | "lg", className?: string) => (
    <Button variant="primary" size={size} icon={<Save />} disabled={saving} onClick={handleSave} className={className}>
      {saving ? "Enregistrement…" : "Enregistrer"}
    </Button>
  );

  const categoryOptions = CHARGE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }));
  const chargeOpen = chargeSheet ? draft.fixedCharges.find((c) => c.chargeId === chargeSheet) : undefined;

  // ── Tabs ──
  const general = (
    <>
      <Section title="Visite guidée" meta={tour.seenAt ? `Vue le ${longDate.format(new Date(tour.seenAt))}` : undefined}>
        <p className="text-sm text-muted-foreground">Dix étapes pour voir comment planifier la semaine, préparer le jour même et facturer. Environ deux minutes.</p>
        <Button variant="default" size="md" className="mt-2" onClick={tour.start}>Démarrer la visite</Button>
      </Section>

    </>
  );

  const catalogue = (
    <>
      <Section
        title="Catégories"
        meta="Classent les recettes et groupent le menu d'un événement : apéritif, entrée, plat…"
        action={addAction("Ajouter une catégorie", () => patch((d) => ({ ...d, courses: [...d.courses, ""] })))}
      >
        <div>
          {draft.courses.map((course, i) => (
            <NameRow
              key={i}
              value={course}
              placeholder="Nom de la catégorie…"
              ariaLabel={`Actions de la catégorie ${course || i + 1}`}
              index={i}
              length={draft.courses.length}
              onSave={(v) => {
                courseFocusName.current = course.trim();
                queueCourseRename(v);
                patch((d) => ({ ...d, courses: d.courses.map((c, j) => (j === i ? v : c)) }));
              }}
              onMove={(from, to) => patch((d) => ({ ...d, courses: moveItem(d.courses, from, to) }))}
              deleteDisabled={draft.courses.length <= 1}
              onDelete={() =>
                setConfirm({
                  message: `Supprimer la catégorie « ${course || "sans nom"} » ? Les lignes d'événement qui l'utilisent gardent leur valeur.`,
                  onConfirm: () => patch((d) => ({ ...d, courses: d.courses.filter((_, j) => j !== i) })),
                })
              }
            />
          ))}
        </div>
      </Section>

      <Section
        title="Types de prestation"
        meta="Ce que vous vendez au client, avec sa TVA"
        action={addAction("Ajouter un type", () => patch((d) => ({ ...d, prestationTypes: [...d.prestationTypes, { key: "", label: "", defaultVatRate: 12, isNew: true }] })))}
      >
        <p className="mb-2 text-sm text-muted-foreground">La clé est générée depuis le libellé et ne change plus une fois enregistrée.</p>
        <div className={TH}>
          <span className="flex-1">Nom</span>
          <span className="hidden w-44 sm:block">Clé</span>
          <span className="w-16">TVA</span>
          <span className="w-7" />
        </div>
        <div>
          {draft.prestationTypes.map((t, i) => (
            <div key={i} className={ROW}>
              <EditableText
                value={t.label}
                placeholder="Libellé…"
                className={ROW_TEXT}
                onSave={(v) =>
                  patch((d) => ({
                    ...d,
                    prestationTypes: d.prestationTypes.map((row, j) => (j === i ? { ...row, label: v, key: row.isNew ? snakeKey(v) : row.key } : row)),
                  }))
                }
              />
              <span className="hidden w-44 truncate font-mono text-sm text-muted-foreground sm:block">{t.key || "clé"}</span>
              <span className="w-16">
                <SelectPill
                  value={String(t.defaultVatRate)}
                  options={VAT_OPTIONS}
                  colour="gray"
                  align="right"
                  aria-label="TVA par défaut"
                  onChange={(v) =>
                    patch((d) => ({
                      ...d,
                      prestationTypes: d.prestationTypes.map((row, j) => (j === i ? { ...row, defaultVatRate: Number(v) as VatRate } : row)),
                    }))
                  }
                />
              </span>
              <ActionMenu
                className="reveal"
                aria-label={`Actions du type ${t.label || i + 1}`}
                items={[
                  {
                    label: "Supprimer",
                    icon: <Trash2 />,
                    variant: "danger",
                    onClick: () =>
                      setConfirm({
                        message: `Supprimer le type « ${t.label || t.key || "sans nom"} » ? Les événements qui l'utilisent gardent leur valeur.`,
                        onConfirm: () => patch((d) => ({ ...d, prestationTypes: d.prestationTypes.filter((_, j) => j !== i) })),
                      }),
                  },
                ]}
              />
            </div>
          ))}
          {draft.prestationTypes.length === 0 && <p className="px-2 py-2 text-sm text-muted-foreground">Aucun type de prestation</p>}
        </div>
      </Section>

      <Section title="Fournisseurs" action={addAction("Ajouter un fournisseur", () => patch((d) => ({ ...d, suppliers: [...d.suppliers, { name: "" }] })))}>
        <div>
          {draft.suppliers.map((s, i) => {
            const set = (field: keyof SettingsSupplier, value: string) =>
              patch((d) => ({ ...d, suppliers: d.suppliers.map((row, j) => (j === i ? { ...row, [field]: value } : row)) }));
            return (
              <div key={i} className={`${ROW} flex-wrap sm:flex-nowrap`}>
                <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: supplierColor(s.name) }} />
                <EditableText value={s.name} placeholder="Nom…" onSave={(v) => set("name", v)} className="min-w-0 w-40 text-sm font-medium touch:text-base" />
                <EditableText value={s.address ?? ""} placeholder="Adresse…" onSave={(v) => set("address", v)} className={ROW_TEXT} />
                <EditableText value={s.phone ?? ""} placeholder="Téléphone…" onSave={(v) => set("phone", v)} className="w-36 text-sm tabular-nums touch:text-base" />
                <ActionMenu
                  className="reveal"
                  aria-label={`Actions du fournisseur ${s.name || i + 1}`}
                  items={[
                    {
                      label: "Supprimer",
                      icon: <Trash2 />,
                      variant: "danger",
                      onClick: () =>
                        setConfirm({
                          message: `Supprimer le fournisseur « ${s.name || "sans nom"} » ?`,
                          onConfirm: () => patch((d) => ({ ...d, suppliers: d.suppliers.filter((_, j) => j !== i) })),
                        }),
                    },
                  ]}
                />
              </div>
            );
          })}
          {draft.suppliers.length === 0 && <p className="px-2 py-2 text-sm text-muted-foreground">Aucun fournisseur</p>}
        </div>
      </Section>

      <Section title="Doublons ignorés">
        {draft.ignoredDuplicateGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun doublon ignoré</p>
        ) : (
          <div>
            {draft.ignoredDuplicateGroups.map((key) => (
              <div key={key} className={ROW}>
                <span className={`${ROW_TEXT} truncate`}>{key}</span>
                <ActionMenu
                  className="reveal"
                  aria-label={`Actions du doublon ${key}`}
                  items={[{ label: "Rétablir", onClick: () => patch((d) => ({ ...d, ignoredDuplicateGroups: d.ignoredDuplicateGroups.filter((k) => k !== key) })) }]}
                />
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );

  const equipe = (
    <Section title="Équipe" action={addAction("Ajouter une personne", () => setNewPersonName((v) => (v === null ? "" : v)))}>
      <p className="mb-2 text-sm text-muted-foreground">Les personnes de votre équipe. Pour leur envoyer leur liste, ouvrez un jour, puis Par personne, puis Partager.</p>
      <div>
        {draft.people.map((p, i) => {
          const duplicate = p.active && (activeInitialCounts.get(personInitials(p).toUpperCase()) ?? 0) > 1;
          return (
            <div key={p.personId} className={`${ROW} ${p.active ? "" : "text-muted-foreground"}`}>
              <PersonChip personId={p.personId} people={draft.people} size="sm" />
              <span className={ROW_TEXT}>
                <EditableInlineText value={p.name} placeholder="Nom" onSave={(v) => { if (v.trim()) setPerson(i, { name: v.trim() }); }} />
              </span>
              <span className="flex w-20 items-center gap-1 text-sm uppercase tabular-nums touch:text-base">
                <EditableInlineText
                  value={p.initials ?? ""}
                  placeholder={personInitials(p)}
                  onSave={(v) => setPerson(i, { initials: v.replace(/[^a-zA-ZÀ-ÿ]/g, "").toUpperCase().slice(0, 3) || undefined })}
                />
                {duplicate && <Tag colour="red">doublon</Tag>}
              </span>
              <Checkbox checked={p.active} onChange={(on) => setPerson(i, { active: on })} label="Actif" aria-label={`${p.name} actif`} />
              <ActionMenu
                className="reveal"
                aria-label={`Actions de ${p.name}`}
                items={[
                  { label: "Copier le lien de sa liste du jour", icon: <Link2 />, onClick: () => void copyDayLink(p) },
                  { label: "Monter", icon: <ArrowUp />, disabled: i === 0, onClick: () => patch((d) => ({ ...d, people: moveItem(d.people, i, i - 1) })) },
                  { label: "Descendre", icon: <ArrowDown />, disabled: i >= draft.people.length - 1, onClick: () => patch((d) => ({ ...d, people: moveItem(d.people, i, i + 1) })) },
                  { kind: "separator" },
                  { label: p.active ? "Désactiver" : "Réactiver", onClick: () => setPerson(i, { active: !p.active }), variant: p.active ? "danger" : "default" },
                ]}
              />
            </div>
          );
        })}
        {draft.people.length === 0 && newPersonName === null && <p className="px-2 py-2 text-sm text-muted-foreground">Aucune personne</p>}
        {newPersonName !== null && (
          <div className={ROW}>
            <input
              autoFocus
              aria-label="Nom de la personne"
              className={`${INLINE_EDIT} min-w-0 flex-1 text-sm touch:text-base`}
              value={newPersonName}
              placeholder="Prénom…"
              onChange={(e) => setNewPersonName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPerson(); } if (e.key === "Escape") setNewPersonName(null); }}
            />
            <Button variant="default" size="sm" disabled={!newPersonName.trim()} onClick={addPerson}>Ajouter</Button>
            <Button variant="subtle" size="sm" onClick={() => setNewPersonName(null)}>Annuler</Button>
          </div>
        )}
      </div>
    </Section>
  );

  const chargeCell = (c: FixedCharge) => ({
    label: <EditableText value={c.label} placeholder="Intitulé…" onSave={(v) => setCharge(c.chargeId, { label: v })} className="text-sm font-medium touch:text-base" />,
    category: <SelectPill value={c.category} options={categoryOptions} colour="gray" aria-label="Type" onChange={(v) => setCharge(c.chargeId, { category: v as FixedChargeCategory })} />,
    monthly: <OptNumValue value={c.monthlyAmount} min={0} placeholder="0" suffix="€" ariaLabel="Mensuel" onChange={(v) => setCharge(c.chargeId, { monthlyAmount: v ?? 0 })} />,
    solo: <OptNumValue value={c.monthlyAmountSolo} min={0} suffix="€" ariaLabel="Mensuel seule" onChange={(v) => setCharge(c.chargeId, { monthlyAmountSolo: v })} />,
    from: <MonthValue value={c.from} ariaLabel="Depuis" onChange={(v) => setCharge(c.chargeId, { from: v })} />,
    to: <MonthValue value={c.to} ariaLabel="Jusqu'au" onChange={(v) => setCharge(c.chargeId, { to: v })} />,
    inResult: <Checkbox checked={chargeInResult(c)} aria-label="Dans le résultat" onChange={(on) => setCharge(c.chargeId, { inResult: on })} />,
    note: <EditableText value={c.note ?? ""} placeholder="Vide" onSave={(v) => setCharge(c.chargeId, { note: v })} className="text-sm text-muted-foreground touch:text-base" />,
  });

  const finances = (
    <>
      <Section title="Charges fixes" action={addAction("Ajouter une charge", addCharge)}>
        <p className="mb-2 text-sm text-muted-foreground">Montants mensuels HTVA. Depuis et Jusqu'au sont facultatifs et bornent la période où la charge compte.</p>
        <div className="hidden md:block">
          <table className="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Type</th>
                <th className="text-right">Mensuel</th>
                <th className="text-right">Seule</th>
                <th>Depuis</th>
                <th>Jusqu'au</th>
                <th>Résultat</th>
                <th>Note</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {draft.fixedCharges.map((c) => {
                const cell = chargeCell(c);
                return (
                  <tr key={c.chargeId} className="group">
                    <td className="w-48">{cell.label}</td>
                    <td>{cell.category}</td>
                    <td className="text-right">{cell.monthly}</td>
                    <td className="text-right">{cell.solo}</td>
                    <td>{cell.from}</td>
                    <td>{cell.to}</td>
                    <td>{cell.inResult}</td>
                    <td className="max-w-[12rem]">{cell.note}</td>
                    <td className="w-9 text-right">
                      <ActionMenu className="reveal" aria-label={`Actions de la charge ${c.label || "sans nom"}`} items={[{ label: "Supprimer", icon: <Trash2 />, variant: "danger", onClick: () => askDeleteCharge(c) }]} />
                    </td>
                  </tr>
                );
              })}
              {draft.fixedCharges.length === 0 && (
                <tr><td colSpan={9} className="text-muted-foreground">Aucune charge fixe</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="divide-y divide-border md:hidden">
          {draft.fixedCharges.map((c) => (
            <ListRow
              key={c.chargeId}
              title={c.label || <span className="text-placeholder">Sans nom</span>}
              subtitle={`${CHARGE_CATEGORIES.find((k) => k.value === c.category)?.label ?? c.category} · ${fmtEur(c.monthlyAmount || 0)} par mois`}
              trailing={chargeInResult(c) ? undefined : <Tag colour="gray">hors résultat</Tag>}
              onClick={() => setChargeSheet(c.chargeId)}
            />
          ))}
          {draft.fixedCharges.length === 0 && <p className="px-2 py-2 text-sm text-muted-foreground">Aucune charge fixe</p>}
        </div>

        <dl className="mt-3 text-sm tabular-nums">
          <div className="flex h-8 items-center justify-between gap-3 border-t border-divider">
            <dt className="font-medium">Total charges mensuelles</dt>
            <dd className="text-right">
              {fmtEur(totalWithStaff)} <span className="text-muted-foreground">avec salarié</span> · {fmtEur(totalSolo)} <span className="text-muted-foreground">seule</span>
            </dd>
          </div>
          <div className="flex h-8 items-center justify-between gap-3">
            <dt className="text-muted-foreground">dont hors résultat</dt>
            <dd className="text-right">
              {fmtEur(outWithStaff)} <span className="text-muted-foreground">avec salarié</span> · {fmtEur(outSolo)} <span className="text-muted-foreground">seule</span>
            </dd>
          </div>
        </dl>

        <SectionToggle title="Coller une liste" storageKey="settings-paste-charges">
          <p className="mb-2 text-sm text-muted-foreground">Une ligne par charge, « Intitulé;montant » ou séparée par une tabulation. Catégorie Autre, dans le résultat.</p>
          <textarea
            id="paste-charges"
            aria-label="Liste à coller"
            className="input-field min-h-24"
            value={pasteText}
            placeholder={"Loyer;850\nAssurance RC\t45,50"}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <Button
            variant="default"
            size="md"
            icon={<Plus />}
            className="mt-2"
            disabled={!pasteText.trim()}
            onClick={() => {
              const rows = parsePastedCharges(pasteText);
              if (rows.length === 0) return toast({ title: "Aucune ligne reconnue", variant: "destructive" });
              patch((d) => ({ ...d, fixedCharges: [...d.fixedCharges, ...rows] }));
              setPasteText("");
              toast({ title: `${rows.length} charge${rows.length > 1 ? "s" : ""} ajoutée${rows.length > 1 ? "s" : ""}` });
            }}
          >
            Ajouter les lignes
          </Button>
        </SectionToggle>
      </Section>

      <Section
        title="Objectifs par année"
        action={
          <>
            <Button variant="subtle" size="sm" disabled={!prevObj} onClick={copyPrevObjective}>Copier l'objectif de {Number(objYear) - 1}</Button>
            <YearPill value={objYear} years={objYears} onChange={setObjYear} label="Année de l'objectif" />
          </>
        }
      >
        <PropertyList className="mt-0">
          <Property label="CA annuel HTVA" kind="custom"><OptNumValue value={obj.annualRevenue} min={0} placeholder="0" suffix="€" ariaLabel="CA annuel HTVA" onChange={(v) => setObj({ annualRevenue: v })} /></Property>
          <Property label="Mois actifs" kind="custom"><OptNumValue value={obj.monthsActive} min={1} step={1} placeholder={String(DEFAULT_MONTHS_ACTIVE)} ariaLabel="Mois actifs" onChange={(v) => setObj({ monthsActive: v })} /></Property>
          <Property label="Heures disponibles par mois" kind="custom"><OptNumValue value={obj.hoursAvailablePerMonth} min={0} suffix="h" ariaLabel="Heures disponibles par mois" onChange={(v) => setObj({ hoursAvailablePerMonth: v })} /></Property>
          <Property label="% matières premières" kind="custom">
            <OptNumValue
              value={obj.rawMaterialPct === undefined ? undefined : round2(obj.rawMaterialPct * 100)}
              placeholder={String(round2(DEFAULT_RAW_MATERIAL_PCT * 100))}
              min={0}
              suffix="%"
              ariaLabel="% matières premières"
              onChange={(v) => setObj({ rawMaterialPct: v === undefined ? undefined : Math.round(v * 100) / 10000 })}
            />
          </Property>
          <Property label="Taux ISoc" kind="custom">
            <OptNumValue
              value={obj.corporateTaxRate === undefined ? undefined : round2(obj.corporateTaxRate * 100)}
              placeholder={String(round2(DEFAULT_TAX_RATE * 100))}
              min={0}
              suffix="%"
              ariaLabel="Taux ISoc"
              onChange={(v) => setObj({ corporateTaxRate: v === undefined ? undefined : Math.round(v * 100) / 10000 })}
            />
          </Property>
          <Property label="Taux réduit PME" kind="custom" sub="20 % sur les premiers 100 000 €">
            <Checkbox checked={obj.smeReducedRate ?? false} onChange={(on) => setObj({ smeReducedRate: on })} label={obj.smeReducedRate ? "Activé" : "Désactivé"} className="-mx-1" />
          </Property>
          <Property label="ISoc réel (comptable)" kind="custom"><OptNumValue value={obj.corporateTaxActual} min={0} suffix="€" ariaLabel="ISoc réel" onChange={(v) => setObj({ corporateTaxActual: v })} /></Property>
          <Property label="Budget extras" kind="custom"><OptNumValue value={obj.extrasBudget} min={0} suffix="€" ariaLabel="Budget extras" onChange={(v) => setObj({ extrasBudget: v })} /></Property>
          <Property label="Mois de trésorerie" kind="custom"><OptNumValue value={obj.treasuryMonths} placeholder={String(DEFAULT_TREASURY_MONTHS)} min={0} ariaLabel="Mois de trésorerie" onChange={(v) => setObj({ treasuryMonths: v })} /></Property>
          <Property label="Épargne mensuelle" kind="custom"><OptNumValue value={obj.treasurySavingPerMonth} placeholder="0" min={0} suffix="€" ariaLabel="Épargne mensuelle" onChange={(v) => setObj({ treasurySavingPerMonth: v })} /></Property>
        </PropertyList>
        <p className="mt-2 text-sm text-muted-foreground">
          25 % par défaut. Le taux réduit de 20 % sur les premiers 100 000 € suppose une rémunération de dirigeant d'au moins 45 000 € (ou au moins égale au résultat imposable) et d'autres conditions PME; à confirmer avec le comptable. Le classeur utilisait 15 %, qui n'existe plus.
        </p>

        <SectionToggle title="Objectif par mois" storageKey="settings-obj-months">
          <p className="mb-2 text-sm text-muted-foreground">Laisser vide pour répartir le CA annuel sur les mois actifs.</p>
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
        </SectionToggle>

        <SectionToggle title="Objectif par prestation" storageKey="settings-obj-prestations">
          <div className="hidden grid-cols-[1fr_8rem_8rem_8rem] gap-2 border-b border-divider pb-1 text-sm text-muted-foreground md:grid">
            <span>Type</span><span>Montant</span><span>Événements</span><span>Convives / évén.</span>
          </div>
          <div className="divide-y divide-border">
            {draft.prestationTypes.filter((t) => t.key).map((t) => {
              const row = obj.byPrestation?.find((r) => r.type === t.key);
              return (
                <div key={t.key} className="grid grid-cols-1 items-center gap-2 py-2 md:grid-cols-[1fr_8rem_8rem_8rem] md:py-1">
                  <div className="text-sm font-medium">{t.label}</div>
                  <NumInput ariaLabel={`Montant ${t.label}`} placeholder="Montant" value={row?.amount} min={0} onChange={(v) => setByPrestation(t.key, { amount: v ?? 0 })} />
                  <NumInput ariaLabel={`Événements ${t.label}`} placeholder="Événements" value={row?.eventsNeeded} min={0} step={1} onChange={(v) => setByPrestation(t.key, { eventsNeeded: v })} />
                  <NumInput ariaLabel={`Convives par événement ${t.label}`} placeholder="Convives" value={row?.guestsPerEvent} min={0} onChange={(v) => setByPrestation(t.key, { guestsPerEvent: v })} />
                </div>
              );
            })}
          </div>
        </SectionToggle>

        <SectionToggle title="Heures disponibles par mois" storageKey="settings-obj-hours">
          <p className="mb-2 text-sm text-muted-foreground">Dérogations par mois, facultatives.</p>
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
        </SectionToggle>

        <SectionToggle title="Investissements" storageKey="settings-obj-invest">
          <div>
            {(obj.investments ?? []).map((inv, i) => (
              <div key={i} className={ROW}>
                <EditableText
                  value={inv.label}
                  placeholder="Intitulé…"
                  className={ROW_TEXT}
                  onSave={(v) => setObj({ investments: (obj.investments ?? []).map((r, j) => (j === i ? { ...r, label: v } : r)) })}
                />
                <OptNumValue
                  ariaLabel="Montant"
                  value={inv.amount}
                  min={0}
                  placeholder="0"
                  suffix="€"
                  onChange={(v) => setObj({ investments: (obj.investments ?? []).map((r, j) => (j === i ? { ...r, amount: v ?? 0 } : r)) })}
                />
                <IconButton size="sm" aria-label="Supprimer" icon={<X />} className="reveal" onClick={() => setObj({ investments: (obj.investments ?? []).filter((_, j) => j !== i) })} />
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="subtle" size="sm" icon={<Plus />} onClick={() => setObj({ investments: [...(obj.investments ?? []), { label: "", amount: 0 }] })}>Ajouter</Button>
              <span className="text-sm tabular-nums"><span className="text-muted-foreground">Total</span> {fmtEur(investTotal)}</span>
            </div>
          </div>
        </SectionToggle>
      </Section>

      <Section title="Années précédentes" action={<YearPill value={actYear} years={actYears} onChange={setActYear} label="Année de référence" />}>
        <p className="mb-2 text-sm text-muted-foreground">
          Valeurs de référence saisies à la main pour les comparaisons. Elles ne sont jamais des écritures du journal et n'entrent pas dans l'export.
        </p>
        <h3 className="text-base font-semibold">CA HTVA par mois</h3>
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
        <div className="mt-2 flex h-8 items-center justify-between border-t border-divider text-sm tabular-nums">
          <span className="font-medium">Total {actYear}</span>
          <span>{fmtEur(sumMoney(Object.values(act.monthly ?? {})))}</span>
        </div>

        <h3 className="mt-5 text-base font-semibold">CA HTVA par type de prestation</h3>
        <div className="mt-1">
          {draft.prestationTypes.filter((t) => t.key).map((t) => (
            <div key={t.key} className={ROW}>
              <span className={ROW_TEXT}>{t.label}</span>
              <OptNumValue
                ariaLabel={`CA ${t.label}`}
                value={act.byPrestation?.[t.key]}
                min={0}
                placeholder="inconnu"
                suffix="€"
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
          <h3 className="text-base font-semibold">Périodes</h3>
          <Button variant="subtle" size="sm" icon={<Plus />} onClick={() => setAct({ byPeriod: [...(act.byPeriod ?? []), { from: "01-01", to: "04-30", amount: 0 }] })}>Ajouter</Button>
        </div>
        <p className="mb-1 text-sm text-muted-foreground">Dates au format MM-JJ, par exemple 01-01 au 04-30.</p>
        <div>
          {(act.byPeriod ?? []).map((p, i) => {
            const set = (patchRow: Partial<{ from: string; to: string; amount: number }>) =>
              setAct({ byPeriod: (act.byPeriod ?? []).map((r, j) => (j === i ? { ...r, ...patchRow } : r)) });
            return (
              <div key={i} className={`${ROW} flex-wrap text-sm touch:text-base`}>
                <span className="text-muted-foreground">Du</span>
                <EditableInlineText value={p.from} placeholder="MM-JJ" onSave={(v) => set({ from: v })} />
                <span className="text-muted-foreground">au</span>
                <EditableInlineText value={p.to} placeholder="MM-JJ" onSave={(v) => set({ to: v })} />
                <span className="ml-auto">
                  <OptNumValue ariaLabel="Montant" value={p.amount} min={0} placeholder="0" suffix="€" onChange={(v) => set({ amount: v ?? 0 })} />
                </span>
                <IconButton size="sm" aria-label="Supprimer" icon={<X />} className="reveal" onClick={() => setAct({ byPeriod: (act.byPeriod ?? []).filter((_, j) => j !== i) })} />
              </div>
            );
          })}
        </div>

        <PropertyList>
          <Property label="Note" kind="multiline" value={act.note ?? ""} placeholder="Source des chiffres…" onSave={(v) => setAct({ note: v })} />
        </PropertyList>
      </Section>
    </>
  );

  const societe = (
    <>
      <Section title="Société">
        <p className="text-sm text-muted-foreground">Repris dans l'en-tête des exports comptables.</p>
        <PropertyList>
          <Property label="Nom" kind="text" value={draft.company.name} onSave={(v) => patch((d) => ({ ...d, company: { ...d.company, name: v } }))} />
          <Property label="Numéro de TVA" kind="text" value={draft.company.vatNumber} placeholder="BE 0123.456.789" onSave={(v) => patch((d) => ({ ...d, company: { ...d.company, vatNumber: v } }))} />
          <Property label="Adresse" kind="text" value={draft.company.address} onSave={(v) => patch((d) => ({ ...d, company: { ...d.company, address: v } }))} />
          <Property label="Date de constitution" kind="date" value={draft.company.constitutedOn ?? ""} onSave={(v) => patch((d) => ({ ...d, company: { ...d.company, constitutedOn: v || undefined } }))} />
          <Property label="Début du journal" kind="custom" sub="Les mois avant cette date lisent les Années précédentes.">
            <MonthValue value={draft.ledgerStartYm} ariaLabel="Début du journal" onChange={(v) => patch((d) => ({ ...d, ledgerStartYm: v }))} />
          </Property>
          <Property
            label="Factures"
            kind="select"
            value={draft.invoicing}
            options={INVOICING_OPTIONS}
            colour="gray"
            sub={draft.invoicing === "externe" ? "L'application ne propose plus de créer les factures ni les acomptes. Le chiffre d'affaires du mois se saisit ou s'importe dans le Journal." : undefined}
            onSave={(v) => patch((d) => ({ ...d, invoicing: v === "externe" ? "externe" : "app" }))}
          />
        </PropertyList>
      </Section>

      <Section title="À propos">
        <p className="text-sm text-muted-foreground">admin · v1.0</p>
        <SectionToggle title="Diagnostic" storageKey="settings-diagnostic">
          <dl className="text-sm">
            {([["ta-clients", health?.tables.clients], ["ta-ledger", health?.tables.ledger]] as const).map(([table, present]) => (
              <div key={table} className="flex h-8 items-center gap-3">
                <dt className="w-28 font-mono">{table}</dt>
                <dd>
                  {health === undefined ? (
                    <span className="text-muted-foreground">Vérification…</span>
                  ) : health === null ? (
                    <Tag colour="gray">État inconnu</Tag>
                  ) : present ? (
                    <Tag colour="green">Table présente</Tag>
                  ) : (
                    <Tag colour="red">Table absente</Tag>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {health && ([["clients", "ta-clients"], ["ledger", "ta-ledger"]] as const).filter(([key]) => !health.tables[key]).map(([key, table]) => (
            <p key={key} className="mt-2 text-sm text-muted-foreground">
              Créer la table {table}-&lt;stage&gt; puis renseigner le paramètre SSM (README, étape 4)
            </p>
          ))}
        </SectionToggle>
      </Section>
    </>
  );

  return (
    <div className={`mx-auto max-w-doc ${dirty ? "pb-20 md:pb-0" : ""}`}>
      <PageHeader iconKey="parametres" title="Paramètres" className="mb-2" actions={dirty ? <span className="hidden md:inline-flex">{saveButton("md")}</span> : undefined} />
      <Toolbar left={<div data-tour="settings-tabs" className="flex min-w-0"><ViewTabs aria-label="Paramètres" items={TABS} value={tab} onChange={setTab} /></div>} />

      {tab === "general" && general}
      {tab === "catalogue" && catalogue}
      {tab === "equipe" && equipe}
      {tab === "finances" && finances}
      {tab === "societe" && societe}

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background p-3 md:hidden">
          {saveButton("lg", "w-full")}
        </div>
      )}

      {/* ── Charge sheet (phones) ── */}
      {chargeOpen && (
        <Sheet open onClose={() => setChargeSheet(null)} title={chargeOpen.label || "Charge"}>
          <div className="px-4 pb-3">
            <PropertyList className="mt-0">
              <Property label="Nom" kind="custom">{chargeCell(chargeOpen).label}</Property>
              <Property label="Type" kind="custom">{chargeCell(chargeOpen).category}</Property>
              <Property label="Mensuel" kind="custom">{chargeCell(chargeOpen).monthly}</Property>
              <Property label="Seule" kind="custom">{chargeCell(chargeOpen).solo}</Property>
              <Property label="Depuis" kind="custom">{chargeCell(chargeOpen).from}</Property>
              <Property label="Jusqu'au" kind="custom">{chargeCell(chargeOpen).to}</Property>
              <Property label="Résultat" kind="custom">{chargeCell(chargeOpen).inResult}</Property>
              <Property label="Note" kind="custom">{chargeCell(chargeOpen).note}</Property>
            </PropertyList>
            <div className="mt-3 flex justify-between gap-2">
              <Button variant="danger" size="md" icon={<Trash2 />} onClick={() => askDeleteCharge(chargeOpen)}>Supprimer</Button>
              <Button variant="primary" size="md" onClick={() => setChargeSheet(null)}>Terminé</Button>
            </div>
          </div>
        </Sheet>
      )}

      {/* ── Dialogs ── */}
      {confirm && (
        <Dialog
          open
          onClose={() => setConfirm(null)}
          title="Confirmer la suppression"
          size="sm"
          footer={
            <>
              <Button variant="default" size="md" onClick={() => setConfirm(null)}>Annuler</Button>
              <Button variant="danger" size="md" onClick={() => { confirm.onConfirm(); setConfirm(null); }}>Supprimer</Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">{confirm.message}</p>
        </Dialog>
      )}

      {rename && (
        <Dialog
          open
          onClose={skipRename}
          title={`Renommer aussi sur ${rename.count} ligne${rename.count > 1 ? "s" : ""} d'événement ?`}
          size="sm"
          footer={
            <>
              <Button variant="default" size="md" disabled={renaming} onClick={skipRename}>Non</Button>
              <Button variant="primary" size="md" disabled={renaming} onClick={() => void applyRename()}>{renaming ? "Mise à jour…" : "Renommer"}</Button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">
            « {rename.from} » devient « {rename.to} » sur {rename.events.length} événement{rename.events.length > 1 ? "s" : ""}. Les événements sont mis à jour tout de suite.
          </p>
        </Dialog>
      )}
    </div>
  );
}

