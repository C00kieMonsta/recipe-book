import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download } from "lucide-react";
import type { IncomeRow, LedgerEntry, MonthClose, MpSource, Scenario, YearObjective } from "@packages/types";
import { fmtEur, incomeStatement, round2 } from "@packages/types";
import { api } from "@/lib/api";
import { dayLabel, monthLabel } from "@/lib/dates";
import { useReportInputs } from "@/lib/use-report-inputs";
import { ledgerErrorMessage } from "@/lib/accounting";
import { exportLedgerXlsx } from "@/lib/ledger-export";
import { useToast } from "@/hooks/use-toast";
import { PageHeader, Section, Tag, ListRow, NumericInput, FieldLabel } from "@/components/ui";

const SCENARIO_KEY = "recipe-book:scenario";
const NOT_CONFIGURED = "Comptabilité non configurée : la table ta-ledger n'existe pas encore";
const ISOC_HELP =
  "25 % par défaut. Le taux réduit de 20 % sur les premiers 100 000 € suppose une rémunération de dirigeant d'au moins 45 000 € (ou au moins égale au résultat imposable) et d'autres conditions PME; à confirmer avec le comptable. Le classeur utilisait 15 %, qui n'existe plus.";

const MP_LABEL: Record<MpSource, string> = { calcule: "calculé", achats: "achats", saisi: "saisi" };

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

function monthName(ym: string): string {
  return monthLabel(ym).split(" ")[0];
}

function signed(n: number): string {
  return n < 0 ? `−${fmtEur(-n)}` : fmtEur(n);
}

// ── Source MP dialog ────────────────────────────────────────────────────────
function SourceMpDialog({ row, existing, purchases, onClose, onSaved }: {
  row: IncomeRow;
  existing?: MonthClose;
  purchases: LedgerEntry[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [source, setSource] = useState<MpSource>(row.mp.source);
  const [saisi, setSaisi] = useState<number>(row.mp.saisi ?? 0);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const settings = await api.settings.get();
      const close: MonthClose = { ...existing, mpSource: source, rawMaterial: source === "saisi" ? round2(saisi) : existing?.rawMaterial };
      await api.settings.update({ monthCloses: { ...settings.monthCloses, [row.ym]: close } });
      toast({ title: "Source MP enregistrée" });
      onSaved();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const option = (value: MpSource, label: string, figure: string) => (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-hover">
      <input type="radio" name="mp-source" className="h-5 w-5" checked={source === value} onChange={() => setSource(value)} />
      <span className="flex-1 text-base">{label}</span>
      <span className="text-base tabular-nums">{figure}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 md:items-center md:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="mp-title" className="max-h-[90vh] w-full max-w-doc overflow-y-auto rounded-t-xl bg-card p-5 md:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="mp-title" className="text-h3">Source MP · {monthLabel(row.ym)}</h2>
        <p className="mt-1 text-base text-muted-foreground">Le coût matières du mois vient de la source choisie ici.</p>
        <div className="mt-4 space-y-1">
          {option("calcule", "Calculé (événements terminés)", fmtEur(row.mp.calcule))}
          {option("achats", "Achats (entrées MP du journal)", fmtEur(row.mp.achats))}
          {option("saisi", "Saisi (total du classeur)", row.mp.saisi !== undefined ? fmtEur(row.mp.saisi) : "–")}
        </div>
        {source === "saisi" && (
          <div className="mt-3">
            <FieldLabel htmlFor="mp-saisi">Montant saisi (HTVA)</FieldLabel>
            <NumericInput value={saisi} onChange={setSaisi} min={0} className="input-field min-h-11 text-right tabular-nums" suffix="€" />
          </div>
        )}

        <h3 className="mt-6 text-base font-semibold">Achats MP du mois</h3>
        {purchases.length === 0 ? (
          <p className="mt-1 text-base text-muted-foreground">Aucun achat MP dans le journal pour ce mois.</p>
        ) : (
          <div className="mt-1 divide-y divide-border/60">
            {purchases.map((p) => (
              <ListRow key={p.entryId} title={p.label} subtitle={`${dayLabel(p.date)}${p.supplier ? ` · ${p.supplier}` : ""}`} trailing={<span className="tabular-nums">{fmtEur(p.htva)}</span>} to={`/comptes/journal?book=achats&ym=${row.ym}`} />
            ))}
          </div>
        )}
        <Link to={`/comptes/journal?book=achats&ym=${row.ym}`} className="mt-2 inline-flex min-h-11 items-center text-base text-primary hover:underline">Ajouter un achat</Link>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border px-4 text-base hover:bg-hover">Annuler</button>
          <button type="button" onClick={save} disabled={saving} className="min-h-11 rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground disabled:opacity-60">Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function Resultats() {
  const { toast } = useToast();
  const [year, setYear] = useYearParam();
  const { inputs, entries, settings, loading, notConfigured, error, reload } = useReportInputs(year);
  const [scenario, setScenario] = useState<Scenario>(readScenario);
  const [mpRow, setMpRow] = useState<IncomeRow | null>(null);

  useEffect(() => { setScenario(readScenario()); }, [year]);

  const nowYear = new Date().getFullYear();
  const currentYm = `${nowYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  const years = useMemo(() => {
    const ys = new Set<number>([nowYear - 3, nowYear - 2, nowYear - 1, nowYear, nowYear + 1, year]);
    for (const k of Object.keys(settings?.objectives ?? {})) ys.add(Number(k));
    return Array.from(ys).filter((y) => Number.isInteger(y)).sort();
  }, [settings, year, nowYear]);

  const st = useMemo(() => (inputs ? incomeStatement(year, inputs, scenario) : null), [inputs, year, scenario]);
  const objective = settings?.objectives?.[String(year)];
  const taxRate = objective?.corporateTaxRate ?? 0.25;

  const pickScenario = (s: Scenario) => { setScenario(s); writeScenario(s); };

  const saveTax = async (patch: Partial<YearObjective>) => {
    try {
      // Re-read so objectives of other years saved elsewhere are kept.
      const fresh = await api.settings.get();
      const current = fresh.objectives?.[String(year)] ?? { annualRevenue: 0, monthsActive: 10 };
      await api.settings.update({ objectives: { ...fresh.objectives, [String(year)]: { ...current, ...patch } } });
      reload();
    } catch (e) {
      toast({ title: ledgerErrorMessage(e), variant: "destructive" });
    }
  };

  const onExport = () => {
    if (!inputs) return;
    try {
      exportLedgerXlsx(year, inputs);
    } catch (e) {
      toast({ title: ledgerErrorMessage(e), variant: "destructive" });
    }
  };

  const purchasesOf = (ym: string) => entries.filter((e) => e.book === "achats" && e.kind === "mp" && e.date.slice(0, 7) === ym);

  const mpCell = (r: IncomeRow) => (
    <button type="button" onClick={() => setMpRow(r)} className="flex min-h-11 w-full flex-col items-end justify-center rounded px-1 text-right hover:bg-hover" aria-label={`Source MP ${monthLabel(r.ym)}`}>
      <span className="flex items-center gap-1 tabular-nums">
        {fmtEur(r.mp.amount)}
        <Tag variant={r.mp.source === "saisi" ? "neutral" : r.mp.source === "achats" ? "info" : "primary"}>{MP_LABEL[r.mp.source]}</Tag>
      </span>
      {r.mp.achatsPartiels !== undefined && (
        <span className="flex items-center gap-1 text-sm text-muted-foreground tabular-nums">{fmtEur(r.mp.achatsPartiels)} <Tag variant="warning">achats partiels</Tag></span>
      )}
    </button>
  );

  const mpNote = (r: IncomeRow) => {
    if (r.ym >= currentYm) {
      return r.mp.upcoming !== undefined ? <span className="text-sm text-muted-foreground tabular-nums">MP prévu {fmtEur(r.mp.upcoming)}</span> : null;
    }
    return r.mp.nonTermines ? (
      <Link to="/events" className="text-sm text-warning hover:underline" onClick={(e) => e.stopPropagation()}>
        {r.mp.nonTermines} {r.mp.nonTermines > 1 ? "événements non terminés" : "événement non terminé"}
      </Link>
    ) : null;
  };

  const personnelLink = (r: IncomeRow) => (
    <Link to={`/comptes/journal?book=achats&kind=personnel&ym=${r.ym}`} className="inline-flex min-h-11 items-center justify-end tabular-nums hover:underline">{fmtEur(r.personnelExtra)}</Link>
  );

  const scenarioPicker = (
    <select aria-label="Scénario de simulation" className="input-field input-compact min-h-11 w-auto" value={scenario} onChange={(e) => pickScenario(e.target.value as Scenario)}>
      <option value="avec">Avec salarié</option>
      <option value="seule">Seule</option>
    </select>
  );

  return (
    <div className="max-w-wide mx-auto">
      <PageHeader
        breadcrumb={[{ label: "Comptabilité", to: "/comptes" }, { label: "Compte de résultats" }]}
        title={`Compte de résultats ${year}`}
        meta="Gestion, HTVA. Les mois réalisés lisent le journal; les charges fixes sont celles du scénario avec salarié."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Année" className="input-field min-h-11 w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="button" disabled={!inputs} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-base hover:bg-hover disabled:opacity-50" onClick={onExport}>
              <Download className="h-4 w-4" /> Exporter {year} (xlsx)
            </button>
          </div>
        }
      />

      {notConfigured && <p className="card-elevated mb-6 p-4 text-base text-muted-foreground">{NOT_CONFIGURED}</p>}
      {error && <p className="mb-6 text-base text-destructive">{error}</p>}
      {loading && <p className="text-base text-muted-foreground">Chargement…</p>}

      {st && (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="table">
              <thead>
                <tr className="text-muted-foreground">
                  <th>Mois</th>
                  <th className="text-right">CA HTVA</th>
                  <th className="text-right">Coûts MP</th>
                  <th className="text-right">Marge brute</th>
                  <th className="text-right">Autres produits</th>
                  <th className="text-right">Charges fixes</th>
                  <th className="text-right">Personnel extra</th>
                  <th className="text-right">Autres coûts</th>
                  <th className="text-right">Résultat avant impôts</th>
                  <th className="text-right">Marge %</th>
                  <th className="text-right">Impôts (estimation)</th>
                  <th className="text-right">Résultat net</th>
                </tr>
              </thead>
              <tbody>
                {st.months.map((r) => (
                  <tr key={r.ym} className="border-t border-border/60 align-top">
                    <td><Link to={`/comptes/journal?ym=${r.ym}`} className="inline-flex min-h-11 items-center font-medium hover:underline">{monthName(r.ym)}</Link></td>
                    <td className="text-right">{fmtEur(r.ca)}</td>
                    <td className="text-right">{mpCell(r)}<div className="text-right">{mpNote(r)}</div></td>
                    <td className="text-right">{signed(r.margeBrute)}</td>
                    <td className="text-right">{fmtEur(r.autresProduits)}</td>
                    <td className="text-right">{fmtEur(r.chargesFixes)}</td>
                    <td className="text-right">{personnelLink(r)}</td>
                    <td className="text-right">{fmtEur(r.autresCouts)}</td>
                    <td className={`text-right font-medium ${r.resultat < 0 ? "text-destructive" : ""}`}>{signed(r.resultat)}</td>
                    <td className="text-right">{fmtPct(r.margePct)}</td>
                    <td className="text-right">{fmtEur(r.impots)}</td>
                    <td className={`text-right font-medium ${r.resultatNet < 0 ? "text-destructive" : ""}`}>{signed(r.resultatNet)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total année</td>
                  <td className="text-right">{fmtEur(st.annual.ca)}</td>
                  <td className="text-right">{fmtEur(st.annual.mp)}</td>
                  <td className="text-right">{signed(st.annual.margeBrute)}</td>
                  <td className="text-right">{fmtEur(st.annual.autresProduits)}</td>
                  <td className="text-right">{fmtEur(st.annual.chargesFixes)}</td>
                  <td className="text-right">{fmtEur(st.annual.personnelExtra)}</td>
                  <td className="text-right">{fmtEur(st.annual.autresCouts)}</td>
                  <td className={`text-right ${st.annual.resultat < 0 ? "text-destructive" : ""}`}>{signed(st.annual.resultat)}</td>
                  <td className="text-right">{fmtPct(st.annual.margePct)}</td>
                  <td className="text-right">
                    <span className="inline-flex items-center gap-1">{fmtEur(st.annual.impots)}{st.annual.impotsSource === "reel" && <Tag variant="success">réel</Tag>}</span>
                  </td>
                  <td className={`text-right ${st.annual.resultatNet < 0 ? "text-destructive" : ""}`}>{signed(st.annual.resultatNet)}</td>
                </tr>
                <tr className="text-muted-foreground">
                  <td className="font-normal">MP / CA</td>
                  <td /><td className="text-right font-normal">{fmtPct(st.ratios.mpSurCa)}</td><td colSpan={9} />
                </tr>
                <tr className="text-muted-foreground">
                  <td className="font-normal">Marge brute / CA</td>
                  <td /><td /><td className="text-right font-normal">{fmtPct(st.ratios.margeBruteSurCa)}</td><td colSpan={8} />
                </tr>
                <tr className="text-muted-foreground">
                  <td className="font-normal">Charges fixes / CA</td>
                  <td colSpan={4} /><td className="text-right font-normal">{fmtPct(st.ratios.chargesFixesSurCa)}</td><td colSpan={6} />
                </tr>
                {st.simulation && (
                  <tr className="border-t border-border">
                    <td><span className="flex flex-col gap-1"><span>Simulation</span>{scenarioPicker}</span></td>
                    <td className="text-right">{fmtEur(st.simulation.ca)}</td>
                    <td className="text-right">{fmtEur(st.simulation.mp)}</td>
                    <td className="text-right">{signed(st.simulation.margeBrute)}</td>
                    <td className="text-right">–</td>
                    <td className="text-right">{fmtEur(st.simulation.chargesFixes)}</td>
                    <td className="text-right">{fmtEur(st.simulation.personnelExtra)}</td>
                    <td className="text-right">–</td>
                    <td className={`text-right ${st.simulation.resultat < 0 ? "text-destructive" : ""}`}>{signed(st.simulation.resultat)}</td>
                    <td className="text-right">{fmtPct(st.simulation.margePct)}</td>
                    <td className="text-right">{fmtEur(st.simulation.impots)}</td>
                    <td className={`text-right ${st.simulation.resultatNet < 0 ? "text-destructive" : ""}`}>{signed(st.simulation.resultatNet)}</td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>

          {/* Phone cards */}
          <div className="space-y-3 md:hidden">
            {st.months.map((r) => (
              <div key={r.ym} className="card-elevated p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/comptes/journal?ym=${r.ym}`} className="text-base font-semibold hover:underline">{monthLabel(r.ym)}</Link>
                  <span className={`text-base font-semibold tabular-nums ${r.resultatNet < 0 ? "text-destructive" : ""}`}>{signed(r.resultatNet)}</span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-base tabular-nums">
                  <div><dt className="text-sm text-muted-foreground">CA HTVA</dt><dd>{fmtEur(r.ca)}</dd></div>
                  <div><dt className="text-sm text-muted-foreground">Coûts MP</dt><dd>{mpCell(r)}{mpNote(r)}</dd></div>
                  <div><dt className="text-sm text-muted-foreground">Résultat avant impôts</dt><dd className={r.resultat < 0 ? "text-destructive" : ""}>{signed(r.resultat)}</dd></div>
                  <div><dt className="text-sm text-muted-foreground">Résultat net</dt><dd className={r.resultatNet < 0 ? "text-destructive" : ""}>{signed(r.resultatNet)}</dd></div>
                </dl>
                <details className="mt-2">
                  <summary className="flex min-h-11 cursor-pointer items-center text-base text-muted-foreground">Détails</summary>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-base tabular-nums">
                    <div><dt className="text-sm text-muted-foreground">Marge brute</dt><dd>{signed(r.margeBrute)}</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Autres produits</dt><dd>{fmtEur(r.autresProduits)}</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Charges fixes</dt><dd>{fmtEur(r.chargesFixes)}</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Personnel extra</dt><dd>{personnelLink(r)}</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Autres coûts</dt><dd>{fmtEur(r.autresCouts)}</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Marge %</dt><dd>{fmtPct(r.margePct)}</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Impôts (estimation)</dt><dd>{fmtEur(r.impots)}</dd></div>
                  </dl>
                </details>
              </div>
            ))}
            <div className="card-elevated p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold">Total année</span>
                <span className={`text-base font-semibold tabular-nums ${st.annual.resultatNet < 0 ? "text-destructive" : ""}`}>{signed(st.annual.resultatNet)}</span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-base tabular-nums">
                <div><dt className="text-sm text-muted-foreground">CA HTVA</dt><dd>{fmtEur(st.annual.ca)}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Coûts MP</dt><dd>{fmtEur(st.annual.mp)}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Résultat avant impôts</dt><dd className={st.annual.resultat < 0 ? "text-destructive" : ""}>{signed(st.annual.resultat)}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Impôts</dt><dd className="flex items-center gap-1">{fmtEur(st.annual.impots)}{st.annual.impotsSource === "reel" && <Tag variant="success">réel</Tag>}</dd></div>
                <div><dt className="text-sm text-muted-foreground">MP / CA</dt><dd>{fmtPct(st.ratios.mpSurCa)}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Marge brute / CA</dt><dd>{fmtPct(st.ratios.margeBruteSurCa)}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Charges fixes / CA</dt><dd>{fmtPct(st.ratios.chargesFixesSurCa)}</dd></div>
              </dl>
            </div>
            {st.simulation && (
              <div className="card-elevated p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-base font-semibold">Simulation</span>
                  {scenarioPicker}
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-base tabular-nums">
                  <div><dt className="text-sm text-muted-foreground">CA</dt><dd>{fmtEur(st.simulation.ca)}</dd></div>
                  <div><dt className="text-sm text-muted-foreground">MP</dt><dd>{fmtEur(st.simulation.mp)}</dd></div>
                  <div><dt className="text-sm text-muted-foreground">Charges fixes</dt><dd>{fmtEur(st.simulation.chargesFixes)}</dd></div>
                  <div><dt className="text-sm text-muted-foreground">Personnel extra</dt><dd>{fmtEur(st.simulation.personnelExtra)}</dd></div>
                  <div><dt className="text-sm text-muted-foreground">Résultat avant impôts</dt><dd>{signed(st.simulation.resultat)}</dd></div>
                  <div><dt className="text-sm text-muted-foreground">Résultat net</dt><dd>{signed(st.simulation.resultatNet)}</dd></div>
                </dl>
              </div>
            )}
          </div>

          <p className="mt-3 text-base text-muted-foreground">Impôts : le total annuel est calculé sur le résultat cumulé, pas additionné.</p>

          <Section title={`Taux ISoc ${fmtPct(taxRate, 0)}`} meta={objective?.smeReducedRate ? "taux réduit PME activé" : undefined} action={<Link to={`/comptes/previsionnel?year=${year}`} className="inline-flex min-h-11 items-center text-base text-primary hover:underline">Objectif dans le Prévisionnel</Link>}>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <FieldLabel htmlFor="res-isoc">Taux ISoc</FieldLabel>
                <NumericInput value={round2(taxRate * 100)} min={0} onChange={(v) => void saveTax({ corporateTaxRate: Math.min(1, v / 100) })} className="input-field min-h-11 w-24 text-right tabular-nums" suffix="%" />
              </div>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base">
                <input type="checkbox" className="h-5 w-5" checked={Boolean(objective?.smeReducedRate)} onChange={(e) => void saveTax({ smeReducedRate: e.target.checked || undefined })} />
                Taux réduit PME
              </label>
            </div>
            <p className="mt-3 max-w-doc text-base text-muted-foreground">{ISOC_HELP}</p>
          </Section>
        </>
      )}

      {mpRow && (
        <SourceMpDialog
          row={mpRow}
          existing={settings?.monthCloses?.[mpRow.ym]}
          purchases={purchasesOf(mpRow.ym)}
          onClose={() => setMpRow(null)}
          onSaved={() => { setMpRow(null); reload(); }}
        />
      )}
    </div>
  );
}
