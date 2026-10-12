import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import type { FixedCharge, FixedChargeCategory, Scenario, YearObjective } from "@packages/types";
import { DEFAULT_PRESTATION_TYPES, chargeActiveIn, chargeAmount, fmtEur, previsionnel, round2, yearMonths } from "@packages/types";
import { api } from "@/lib/api";
import { useReportInputs } from "@/lib/use-report-inputs";
import { useToast } from "@/hooks/use-toast";
import { Button, Callout, Checkbox, DateNav, FieldLabel, IconButton, MoneyTile, NumericInput, Section, SectionToggle, SelectPill, Tag, Toolbar } from "@/components/ui";

const SCENARIO_KEY = "recipe-book:scenario";
const NOT_CONFIGURED = "Comptabilité non configurée : la table ta-ledger n'existe pas encore";
const ISOC_HELP =
  "25 % par défaut. Le taux réduit de 20 % sur les premiers 100 000 € suppose une rémunération de dirigeant d'au moins 45 000 € (ou au moins égale au résultat imposable) et d'autres conditions PME; à confirmer avec le comptable. Le classeur utilisait 15 %, qui n'existe plus.";
const MONTH_SHORT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];

const CATEGORY_LABEL: Record<FixedChargeCategory, string> = {
  social: "Social",
  salaire: "Salaire",
  assurance: "Assurance",
  abonnement: "Abonnement",
  frais: "Frais",
  remboursement: "Remboursement",
  autre: "Autre",
};
const CATEGORIES = Object.keys(CATEGORY_LABEL) as FixedChargeCategory[];

const DEFAULT_OBJECTIVE: YearObjective = { annualRevenue: 0, monthsActive: 10 };

function readScenario(): Scenario {
  try { return localStorage.getItem(SCENARIO_KEY) === "seule" ? "seule" : "avec"; } catch { return "avec"; }
}

function writeScenario(s: Scenario) {
  try { localStorage.setItem(SCENARIO_KEY, s); } catch { /* storage unavailable */ }
}

function useYearParam(): [number, (y: number) => void] {
  const [params, setParams] = useSearchParams();
  const now = new Date().getFullYear();
  const raw = Number(params.get("year"));
  const year = Number.isInteger(raw) && raw >= 2000 && raw <= 2100 ? raw : now;
  const setYear = (y: number) => {
    const next = new URLSearchParams(params);
    next.set("year", String(y));
    setParams(next);
  };
  return [year, setYear];
}

function fmtPct(x: number | undefined, digits = 1): string {
  if (x === undefined || !Number.isFinite(x)) return "–";
  return `${(x * 100).toFixed(digits).replace(".", ",")} %`;
}

function fmtMoney(x: number | undefined): string {
  return x === undefined ? "–" : fmtEur(x);
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Optional number input: empty means undefined.
function OptNum({ value, onChange, id, className = "", suffix, placeholder, min, step }: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  id?: string;
  className?: string;
  suffix?: string;
  placeholder?: string;
  min?: number;
  step?: number;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  useEffect(() => { setText(value === undefined ? "" : String(value)); }, [value]);
  const commit = () => {
    const cleaned = text.trim().replace(",", ".");
    if (cleaned === "") { if (value !== undefined) onChange(undefined); return; }
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) { setText(value === undefined ? "" : String(value)); return; }
    let v = min !== undefined ? Math.max(min, parsed) : parsed;
    if (step === 1) v = Math.round(v);
    if (v !== value) onChange(v);
  };
  return (
    <span className="inline-flex items-center gap-1">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className={`input-field tabular-nums ${className}`}
        value={text}
        placeholder={placeholder}
        onChange={(e) => { if (e.target.value === "" || /^-?\d*[.,]?\d*$/.test(e.target.value)) setText(e.target.value); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { commit(); (e.target as HTMLInputElement).blur(); } }}
      />
      {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
    </span>
  );
}

function rekeyOverrides(rec: Record<string, number> | undefined, year: number): Record<string, number> | undefined {
  if (!rec) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec)) out[k.length === 2 ? `${year}-${k}` : `${year}-${k.slice(5, 7)}`] = v;
  return out;
}

function cleanRecord(rec: Record<string, number> | undefined): Record<string, number> | undefined {
  const entries = Object.entries(rec ?? {}).filter(([, v]) => v !== undefined && Number.isFinite(v)).map(([k, v]) => [k, round2(v)] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function cleanObjective(o: YearObjective): YearObjective {
  const out: YearObjective = {
    annualRevenue: round2(o.annualRevenue || 0),
    monthsActive: Math.min(12, Math.max(1, Math.round(o.monthsActive || 10))),
  };
  const monthlyOverrides = cleanRecord(o.monthlyOverrides);
  if (monthlyOverrides) out.monthlyOverrides = monthlyOverrides;
  const hours = cleanRecord(o.hoursAvailableOverrides);
  if (hours) out.hoursAvailableOverrides = hours;
  const byPrestation = (o.byPrestation ?? [])
    .filter((b) => b.amount > 0 || b.eventsNeeded !== undefined || b.guestsPerEvent !== undefined)
    .map((b) => {
      const row: NonNullable<YearObjective["byPrestation"]>[number] = { type: b.type, amount: round2(b.amount || 0) };
      if (b.eventsNeeded !== undefined) row.eventsNeeded = Math.max(0, Math.round(b.eventsNeeded));
      if (b.guestsPerEvent !== undefined && b.guestsPerEvent > 0) row.guestsPerEvent = b.guestsPerEvent;
      return row;
    });
  if (byPrestation.length) out.byPrestation = byPrestation;
  if (o.hoursAvailablePerMonth !== undefined) out.hoursAvailablePerMonth = Math.max(0, o.hoursAvailablePerMonth);
  if (o.rawMaterialPct !== undefined) out.rawMaterialPct = Math.min(1, Math.max(0, o.rawMaterialPct));
  if (o.corporateTaxRate !== undefined) out.corporateTaxRate = Math.min(1, Math.max(0, o.corporateTaxRate));
  if (o.smeReducedRate) out.smeReducedRate = true;
  if (o.corporateTaxActual !== undefined) out.corporateTaxActual = round2(Math.max(0, o.corporateTaxActual));
  if (o.extrasBudget !== undefined) out.extrasBudget = round2(Math.max(0, o.extrasBudget));
  if (o.treasuryMonths !== undefined) out.treasuryMonths = Math.max(0, o.treasuryMonths);
  if (o.treasurySavingPerMonth !== undefined) out.treasurySavingPerMonth = round2(Math.max(0, o.treasurySavingPerMonth));
  const investments = (o.investments ?? []).filter((i) => i.label.trim()).map((i) => ({ label: i.label.trim(), amount: round2(Math.max(0, i.amount || 0)) }));
  if (investments.length) out.investments = investments;
  return out;
}

function cleanCharges(charges: FixedCharge[]): FixedCharge[] {
  return charges.map((c) => {
    const out: FixedCharge = { chargeId: c.chargeId, label: c.label.trim(), category: c.category, monthlyAmount: round2(Math.max(0, c.monthlyAmount || 0)) };
    if (c.monthlyAmountSolo !== undefined) out.monthlyAmountSolo = round2(Math.max(0, c.monthlyAmountSolo));
    if (c.inResult !== undefined) out.inResult = c.inResult;
    if (c.from) out.from = c.from;
    if (c.to) out.to = c.to;
    if (c.note?.trim()) out.note = c.note.trim();
    return out;
  });
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function Previsionnel() {
  const [year, setYear] = useYearParam();
  const { toast } = useToast();
  const { inputs, settings, loading, notConfigured, error, reload } = useReportInputs(year);
  const [scenario, setScenario] = useState<Scenario>(readScenario);
  const [objective, setObjective] = useState<YearObjective>(DEFAULT_OBJECTIVE);
  const [charges, setCharges] = useState<FixedCharge[]>([]);
  const [objectiveDirty, setObjectiveDirty] = useState(false);
  const [chargesDirty, setChargesDirty] = useState(false);
  const [saving, setSaving] = useState<"objective" | "charges" | null>(null);

  // A year change always loads that year's objective; a settings reload keeps unsaved edits.
  useEffect(() => {
    setObjective(settings?.objectives?.[String(year)] ?? DEFAULT_OBJECTIVE);
    setObjectiveDirty(false);
  }, [year]);
  useEffect(() => {
    if (settings && !objectiveDirty) setObjective(settings.objectives?.[String(year)] ?? DEFAULT_OBJECTIVE);
  }, [settings]);
  useEffect(() => {
    if (settings && !chargesDirty) setCharges(settings.fixedCharges ?? []);
  }, [settings]);

  const nowYear = new Date().getFullYear();
  const types = settings?.prestationTypes ?? DEFAULT_PRESTATION_TYPES;
  const months = useMemo(() => yearMonths(year), [year]);

  const pv = useMemo(() => {
    if (!inputs) return null;
    const live = { ...inputs, settings: { ...inputs.settings, fixedCharges: charges, objectives: { ...inputs.settings.objectives, [String(year)]: objective } } };
    return previsionnel(year, live, scenario);
  }, [inputs, charges, objective, year, scenario]);

  const patchObjective = (patch: Partial<YearObjective>) => { setObjective((o) => ({ ...o, ...patch })); setObjectiveDirty(true); };
  const patchCharge = (id: string, patch: Partial<FixedCharge>) => { setCharges((cs) => cs.map((c) => (c.chargeId === id ? { ...c, ...patch } : c))); setChargesDirty(true); };
  const removeCharge = (id: string) => { setCharges((cs) => cs.filter((c) => c.chargeId !== id)); setChargesDirty(true); };
  const addCharge = () => { setCharges((cs) => [...cs, { chargeId: newId(), label: "", category: "frais", monthlyAmount: 0 }]); setChargesDirty(true); };

  const pickScenario = (s: Scenario) => { setScenario(s); writeScenario(s); };

  const setOverride = (key: "monthlyOverrides" | "hoursAvailableOverrides", ym: string, v: number | undefined) => {
    const next = { ...(objective[key] ?? {}) };
    delete next[ym.slice(5, 7)];
    if (v === undefined) delete next[ym]; else next[ym] = v;
    patchObjective({ [key]: Object.keys(next).length ? next : undefined });
  };

  const prestationRow = (type: string) => objective.byPrestation?.find((b) => b.type === type);
  const setPrestation = (type: string, patch: Partial<NonNullable<YearObjective["byPrestation"]>[number]>) => {
    const rows = [...(objective.byPrestation ?? [])];
    const i = rows.findIndex((b) => b.type === type);
    if (i >= 0) rows[i] = { ...rows[i], ...patch };
    else rows.push({ type, amount: 0, ...patch });
    patchObjective({ byPrestation: rows });
  };

  const copyPrevious = () => {
    const prev = settings?.objectives?.[String(year - 1)];
    if (!prev) return;
    setObjective({
      ...prev,
      corporateTaxActual: undefined,
      monthlyOverrides: rekeyOverrides(prev.monthlyOverrides, year),
      hoursAvailableOverrides: rekeyOverrides(prev.hoursAvailableOverrides, year),
    });
    setObjectiveDirty(true);
  };

  const saveObjective = async () => {
    if (!settings) return;
    setSaving("objective");
    try {
      // Re-read so objectives of other years saved elsewhere are kept.
      const fresh = await api.settings.get();
      await api.settings.update({ objectives: { ...fresh.objectives, [String(year)]: cleanObjective(objective) } });
      setObjectiveDirty(false);
      toast({ title: `Objectif ${year} enregistré` });
      reload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const saveCharges = async () => {
    if (charges.some((c) => !c.label.trim())) { toast({ title: "Chaque charge a besoin d'un intitulé", variant: "destructive" }); return; }
    setSaving("charges");
    try {
      await api.settings.update({ fixedCharges: cleanCharges(charges) });
      setChargesDirty(false);
      toast({ title: "Charges enregistrées" });
      reload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const annuelOf = (c: FixedCharge) => round2(months.filter((ym) => chargeActiveIn(c, ym)).length * chargeAmount(c, scenario));
  const inResultOf = (c: FixedCharge) => c.inResult ?? c.category !== "remboursement";

  const scenarioPill = (
    <SelectPill
      value={scenario}
      options={[{ value: "avec", label: "Avec salarié" }, { value: "seule", label: "Seule" }]}
      colour="gray"
      align="right"
      aria-label="Scénario"
      onChange={(v) => pickScenario(v as Scenario)}
    />
  );

  return (
    <div>
      <Toolbar
        left={<DateNav label={String(year)} onPrev={() => setYear(year - 1)} onNext={() => setYear(year + 1)} isToday={year === nowYear} onToday={() => setYear(nowYear)} todayLabel="Cette année" />}
        right={<span className="inline-flex items-center gap-1"><span className="text-sm text-muted-foreground">Scénario :</span>{scenarioPill}</span>}
      />
      <p className="mt-3 text-sm text-muted-foreground">Un objectif par année et une liste de charges fixes ; le seuil de rentabilité est calculé à partir des charges.</p>

      {notConfigured && <div className="mt-4"><Callout emoji="💶">{NOT_CONFIGURED}</Callout></div>}
      {error && <div className="mt-4"><Callout tone="danger">{error}</Callout></div>}
      {loading && <p className="mt-4 text-sm text-muted-foreground">Chargement…</p>}

      {settings && (
        <div className="mt-6 flex flex-col gap-10">
          {/* ── Objectif ── */}
          <section className="max-w-doc">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-h3">Objectif {year}</h2>
              <div className="flex flex-wrap gap-1">
                <Button variant="subtle" size="sm" onClick={copyPrevious} disabled={!settings.objectives?.[String(year - 1)]}>Copier l'objectif de {year - 1}</Button>
                <Button variant="primary" size="sm" onClick={saveObjective} disabled={!objectiveDirty || saving !== null}>Enregistrer</Button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="obj-ca">CA annuel (HTVA)</FieldLabel>
                <OptNum id="obj-ca" value={objective.annualRevenue || undefined} min={0} onChange={(v) => patchObjective({ annualRevenue: v ?? 0 })} className="w-40" suffix="€" placeholder="0" />
              </div>
              <div>
                <FieldLabel htmlFor="obj-months">Mois actifs</FieldLabel>
                <OptNum id="obj-months" value={objective.monthsActive} min={1} step={1} onChange={(v) => patchObjective({ monthsActive: v ?? 10 })} className="w-24" />
                <p className="mt-1 text-sm text-muted-foreground">Objectif mensuel {fmtMoney(objective.monthsActive ? round2(objective.annualRevenue / objective.monthsActive) : undefined)}</p>
              </div>
              <div>
                <FieldLabel htmlFor="obj-hours">Heures disponibles par mois</FieldLabel>
                <OptNum id="obj-hours" value={objective.hoursAvailablePerMonth} min={0} onChange={(v) => patchObjective({ hoursAvailablePerMonth: v })} className="w-24" suffix="h" />
              </div>
              <div>
                <FieldLabel htmlFor="obj-mp">% matières premières</FieldLabel>
                <OptNum id="obj-mp" value={objective.rawMaterialPct === undefined ? undefined : round2(objective.rawMaterialPct * 100)} min={0} onChange={(v) => patchObjective({ rawMaterialPct: v === undefined ? undefined : Math.min(1, v / 100) })} className="w-24" suffix="%" placeholder="38" />
              </div>
              <div>
                <FieldLabel htmlFor="obj-isoc">Taux ISoc</FieldLabel>
                <OptNum id="obj-isoc" value={objective.corporateTaxRate === undefined ? undefined : round2(objective.corporateTaxRate * 100)} min={0} onChange={(v) => patchObjective({ corporateTaxRate: v === undefined ? undefined : Math.min(1, v / 100) })} className="w-24" suffix="%" placeholder="25" />
                <div className="mt-2 -mx-1">
                  <Checkbox checked={Boolean(objective.smeReducedRate)} onChange={(on) => patchObjective({ smeReducedRate: on || undefined })} label="Taux réduit PME" className="w-full" />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{ISOC_HELP}</p>
              </div>
              <div>
                <FieldLabel htmlFor="obj-isoc-actual">ISoc réel (chiffre du comptable)</FieldLabel>
                <OptNum id="obj-isoc-actual" value={objective.corporateTaxActual} min={0} onChange={(v) => patchObjective({ corporateTaxActual: v })} className="w-32" suffix="€" />
                <p className="mt-1 text-sm text-muted-foreground">Remplace l'estimation annuelle du compte de résultats, tagué « réel ».</p>
              </div>
              <div>
                <FieldLabel htmlFor="obj-extras">Budget extras (personnel)</FieldLabel>
                <OptNum id="obj-extras" value={objective.extrasBudget} min={0} onChange={(v) => patchObjective({ extrasBudget: v })} className="w-32" suffix="€" />
              </div>
              <div>
                <FieldLabel htmlFor="obj-treasury">Mois de trésorerie</FieldLabel>
                <OptNum id="obj-treasury" value={objective.treasuryMonths} min={0} onChange={(v) => patchObjective({ treasuryMonths: v })} className="w-24" placeholder="3" />
              </div>
              <div>
                <FieldLabel htmlFor="obj-saving">Épargne mensuelle</FieldLabel>
                <OptNum id="obj-saving" value={objective.treasurySavingPerMonth} min={0} onChange={(v) => patchObjective({ treasurySavingPerMonth: v })} className="w-32" suffix="€" placeholder="0" />
              </div>
            </div>

            <SectionToggle title="Heures disponibles par mois" storageKey="previsionnel-hours">
              <p className="text-sm text-muted-foreground">Laisser vide pour la valeur annuelle.</p>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {months.map((ym, i) => (
                  <div key={ym}>
                    <FieldLabel htmlFor={`h-${ym}`} className="text-sm">{MONTH_SHORT[i]}</FieldLabel>
                    <OptNum id={`h-${ym}`} value={objective.hoursAvailableOverrides?.[ym] ?? objective.hoursAvailableOverrides?.[ym.slice(5, 7)]} min={0} onChange={(v) => setOverride("hoursAvailableOverrides", ym, v)} className="w-full" />
                  </div>
                ))}
              </div>
            </SectionToggle>

            <SectionToggle title="Objectif par mois" storageKey="previsionnel-monthly">
              <p className="text-sm text-muted-foreground">Laisser vide pour CA annuel ÷ mois actifs.</p>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {months.map((ym, i) => (
                  <div key={ym}>
                    <FieldLabel htmlFor={`m-${ym}`} className="text-sm">{MONTH_SHORT[i]}</FieldLabel>
                    <OptNum id={`m-${ym}`} value={objective.monthlyOverrides?.[ym] ?? objective.monthlyOverrides?.[ym.slice(5, 7)]} min={0} onChange={(v) => setOverride("monthlyOverrides", ym, v)} className="w-full" />
                  </div>
                ))}
              </div>
            </SectionToggle>

            <SectionToggle title="Objectif par prestation" storageKey="previsionnel-prestations" defaultOpen>
              <div className="divide-y divide-border">
                {types.map((t) => {
                  const row = prestationRow(t.key);
                  return (
                    <div key={t.key} className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                      <div className="text-sm font-medium">{t.label}</div>
                      <div>
                        <FieldLabel htmlFor={`p-amt-${t.key}`} className="text-sm">Montant</FieldLabel>
                        <OptNum id={`p-amt-${t.key}`} value={row?.amount || undefined} min={0} onChange={(v) => setPrestation(t.key, { amount: v ?? 0 })} className="w-32" suffix="€" />
                      </div>
                      <div>
                        <FieldLabel htmlFor={`p-ev-${t.key}`} className="text-sm">Événements</FieldLabel>
                        <OptNum id={`p-ev-${t.key}`} value={row?.eventsNeeded} min={0} step={1} onChange={(v) => setPrestation(t.key, { eventsNeeded: v })} className="w-20" />
                      </div>
                      <div>
                        <FieldLabel htmlFor={`p-g-${t.key}`} className="text-sm">Convives / évén.</FieldLabel>
                        <OptNum id={`p-g-${t.key}`} value={row?.guestsPerEvent} min={0} onChange={(v) => setPrestation(t.key, { guestsPerEvent: v })} className="w-20" />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-sm text-muted-foreground tabular-nums">Total par prestation {fmtEur((objective.byPrestation ?? []).reduce((s, b) => s + (b.amount || 0), 0))}</p>
            </SectionToggle>

            <SectionToggle title="Investissements" storageKey="previsionnel-investments" defaultOpen>
              <div className="divide-y divide-border">
                {(objective.investments ?? []).map((inv, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 py-2">
                    <input aria-label="Intitulé" className="input-field flex-1" value={inv.label} onChange={(e) => { const list = [...(objective.investments ?? [])]; list[i] = { ...inv, label: e.target.value }; patchObjective({ investments: list }); }} />
                    <NumericInput value={inv.amount} min={0} onChange={(v) => { const list = [...(objective.investments ?? [])]; list[i] = { ...inv, amount: v }; patchObjective({ investments: list }); }} className="input-field w-32 text-right tabular-nums" suffix="€" />
                    <IconButton size="md" aria-label="Retirer l'investissement" icon={<X />} onClick={() => patchObjective({ investments: (objective.investments ?? []).filter((_, j) => j !== i) })} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <Button variant="subtle" size="sm" onClick={() => patchObjective({ investments: [...(objective.investments ?? []), { label: "", amount: 0 }] })}>+ Investissement</Button>
                <span className="text-sm tabular-nums">Total {fmtMoney(pv?.investmentsTotal)}</span>
              </div>
            </SectionToggle>
          </section>

          {/* ── Charges ── */}
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-h3">Charges fixes</h2>
              <div className="flex flex-wrap items-center gap-1">
                <Button variant="subtle" size="sm" onClick={addCharge}>+ Charge</Button>
                <Button variant="default" size="sm" onClick={saveCharges} disabled={!chargesDirty || saving !== null}>Enregistrer les charges</Button>
              </div>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Budget de caisse pour le seuil. Pour changer un montant à partir d'un mois, fermer la ligne avec « Jusqu'au » et en ajouter une avec « Depuis ».</p>

            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="table">
                <thead>
                  <tr>
                    <th>Intitulé</th>
                    <th>Catégorie</th>
                    <th className="text-right">Mensuel</th>
                    <th className="text-right">Mensuel seule</th>
                    <th className="text-right">Annuel</th>
                    <th>Dans le résultat</th>
                    <th>Depuis</th>
                    <th>Jusqu'au</th>
                    <th><span className="sr-only">Retirer</span></th>
                  </tr>
                </thead>
                <tbody>
                  {charges.map((c) => (
                    <tr key={c.chargeId} className="group">
                      <td>
                        <input aria-label="Intitulé" className="input-field input-compact w-44" value={c.label} onChange={(e) => patchCharge(c.chargeId, { label: e.target.value })} />
                        {!inResultOf(c) && <Tag colour="gray" className="ml-1">hors résultat</Tag>}
                      </td>
                      <td>
                        <SelectPill
                          value={c.category}
                          options={CATEGORIES.map((k) => ({ value: k, label: CATEGORY_LABEL[k] }))}
                          colour="gray"
                          aria-label="Catégorie"
                          onChange={(v) => patchCharge(c.chargeId, { category: v as FixedChargeCategory })}
                        />
                      </td>
                      <td className="text-right"><NumericInput value={c.monthlyAmount} min={0} onChange={(v) => patchCharge(c.chargeId, { monthlyAmount: v })} className="input-field input-compact w-28 text-right tabular-nums" /></td>
                      <td className="text-right"><OptNum value={c.monthlyAmountSolo} min={0} onChange={(v) => patchCharge(c.chargeId, { monthlyAmountSolo: v })} className="input-compact w-28 text-right" placeholder={String(c.monthlyAmount)} /></td>
                      <td className="text-right tabular-nums">{fmtEur(annuelOf(c))}</td>
                      <td><Checkbox aria-label="Dans le résultat" checked={inResultOf(c)} onChange={(on) => patchCharge(c.chargeId, { inResult: on })} /></td>
                      <td><input type="month" aria-label="Depuis" className="input-field input-compact w-auto" value={c.from ?? ""} onChange={(e) => patchCharge(c.chargeId, { from: e.target.value || undefined })} /></td>
                      <td><input type="month" aria-label="Jusqu'au" className="input-field input-compact w-auto" value={c.to ?? ""} onChange={(e) => patchCharge(c.chargeId, { to: e.target.value || undefined })} /></td>
                      <td><IconButton size="sm" aria-label="Retirer la charge" icon={<X />} className="reveal" onClick={() => removeCharge(c.chargeId)} /></td>
                    </tr>
                  ))}
                </tbody>
                {pv && (
                  <tfoot>
                    <tr>
                      <td colSpan={2}>Total charges mensuelles</td>
                      <td className="text-right">{fmtEur(pv.totals.mensuelCaisse.avec)}</td>
                      <td className="text-right">{fmtEur(pv.totals.mensuelCaisse.seule)}</td>
                      <td className="text-right">{fmtEur(pv.totals.annuelCaisse[scenario])}</td>
                      <td colSpan={4} />
                    </tr>
                    <tr>
                      <td colSpan={2} className="font-normal text-muted-foreground">dont hors résultat</td>
                      <td className="text-right font-normal text-muted-foreground">{fmtEur(pv.totals.horsResultat.avec)}</td>
                      <td className="text-right font-normal text-muted-foreground">{fmtEur(pv.totals.horsResultat.seule)}</td>
                      <td className="text-right font-normal text-muted-foreground">{fmtEur(round2(pv.totals.annuelCaisse[scenario] - pv.totals.annuelResultat[scenario]))}</td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="mt-4 divide-y divide-border md:hidden">
              {charges.map((c) => (
                <div key={c.chargeId} className="space-y-2 py-3">
                  <div className="flex items-center gap-2">
                    <input aria-label="Intitulé" className="input-field flex-1" placeholder="Intitulé" value={c.label} onChange={(e) => patchCharge(c.chargeId, { label: e.target.value })} />
                    <IconButton size="md" aria-label="Retirer la charge" icon={<X />} onClick={() => removeCharge(c.chargeId)} />
                  </div>
                  {!inResultOf(c) && <Tag colour="gray">hors résultat</Tag>}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FieldLabel>Catégorie</FieldLabel>
                      <SelectPill
                        value={c.category}
                        options={CATEGORIES.map((k) => ({ value: k, label: CATEGORY_LABEL[k] }))}
                        colour="gray"
                        aria-label="Catégorie"
                        onChange={(v) => patchCharge(c.chargeId, { category: v as FixedChargeCategory })}
                      />
                    </div>
                    <div>
                      <FieldLabel>Annuel</FieldLabel>
                      <div className="py-2 text-base tabular-nums">{fmtEur(annuelOf(c))}</div>
                    </div>
                    <div>
                      <FieldLabel>Mensuel</FieldLabel>
                      <NumericInput value={c.monthlyAmount} min={0} onChange={(v) => patchCharge(c.chargeId, { monthlyAmount: v })} className="input-field text-right tabular-nums" />
                    </div>
                    <div>
                      <FieldLabel>Mensuel seule</FieldLabel>
                      <OptNum value={c.monthlyAmountSolo} min={0} onChange={(v) => patchCharge(c.chargeId, { monthlyAmountSolo: v })} className="w-full text-right" placeholder={String(c.monthlyAmount)} />
                    </div>
                    <div>
                      <FieldLabel>Depuis</FieldLabel>
                      <input type="month" className="input-field" value={c.from ?? ""} onChange={(e) => patchCharge(c.chargeId, { from: e.target.value || undefined })} />
                    </div>
                    <div>
                      <FieldLabel>Jusqu'au</FieldLabel>
                      <input type="month" className="input-field" value={c.to ?? ""} onChange={(e) => patchCharge(c.chargeId, { to: e.target.value || undefined })} />
                    </div>
                  </div>
                  <div className="-mx-1">
                    <Checkbox checked={inResultOf(c)} onChange={(on) => patchCharge(c.chargeId, { inResult: on })} label="Dans le résultat" />
                  </div>
                </div>
              ))}
              {pv && (
                <dl className="grid grid-cols-2 gap-2 rounded-lg bg-surface p-3 text-sm tabular-nums">
                  <dt>Total charges mensuelles</dt><dd className="text-right font-semibold">{fmtEur(pv.totals.mensuelCaisse[scenario])}</dd>
                  <dt className="text-muted-foreground">dont hors résultat</dt><dd className="text-right text-muted-foreground">{fmtEur(pv.totals.horsResultat[scenario])}</dd>
                </dl>
              )}
            </div>
          </section>
        </div>
      )}

      {pv && (
        <Section title="Seuil de rentabilité" meta={scenario === "seule" ? "scénario seule" : "scénario avec salarié"}>
          <div className="grid grid-cols-2 rounded-lg bg-surface md:grid-cols-4">
            <MoneyTile flat label="Seuil annuel" value={fmtEur(pv.seuilAnnuel)} sub="Charges caisse + épargne + investissements" />
            <MoneyTile flat label="Seuil mensuel" value={fmtEur(pv.seuilMensuel)} sub="Seuil annuel ÷ 12" />
            <MoneyTile flat label="Seuil par mois actif" value={fmtMoney(pv.seuilParMoisActif)} sub={`Seuil annuel ÷ ${objective.monthsActive || "–"} mois`} />
            <MoneyTile flat label="Seuil ajusté matières" value={fmtEur(pv.seuilAjusteMatieres)} sub="Secondaire : seuil annuel ÷ (1 − % MP)" />
            <MoneyTile flat label="Besoin de trésorerie" value={fmtEur(pv.besoinTresorerie)} sub={`${objective.treasuryMonths ?? 3} mois de charges`} />
            <MoneyTile flat label="Résultat prévu après matières et extras" value={fmtMoney(pv.resultatPrevu)} sub="CA × (1 − % MP) − charges résultat − extras" />
            <MoneyTile flat label="ISoc prévu" value={fmtMoney(pv.isocPrevu)} sub={objective.smeReducedRate ? "taux réduit PME" : `taux ${fmtPct(objective.corporateTaxRate ?? 0.25, 0)}`} />
            <MoneyTile flat label="Marge nette après ISoc" value={fmtPct(pv.margeNetteApresIsoc)} sub="(résultat − ISoc) ÷ CA" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground tabular-nums">Objectif − seuil : {fmtMoney(pv.objectifMoinsSeuil)}</p>
          {!objective.annualRevenue && <p className="mt-1 text-sm text-muted-foreground">Saisir le CA annuel pour obtenir le résultat prévu et l'ISoc.</p>}
          <p className="mt-1 text-sm text-muted-foreground">Mois actifs {objective.monthsActive} · objectif mensuel {fmtMoney(objective.monthsActive ? round2(objective.annualRevenue / objective.monthsActive) : undefined)}</p>
        </Section>
      )}
    </div>
  );
}
