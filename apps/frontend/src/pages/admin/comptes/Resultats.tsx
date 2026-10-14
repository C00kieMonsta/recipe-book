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
import { ActionMenu, Button, Callout, Checkbox, DateNav, Dialog, FieldLabel, ListRow, NumericInput, Property, PropertyList, Section, SelectPill, Table, Tag, Toolbar, type TableColumn } from "@/components/ui";

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
    <Checkbox
      shape="circle"
      checked={source === value}
      onChange={() => setSource(value)}
      label={`${label} · ${figure}`}
      className="mx-0 flex h-8 w-full items-center gap-2 rounded px-2 text-sm hover:bg-hover touch:h-11 touch:text-base"
    />
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Source MP · ${monthLabel(row.ym)}`}
      size="md"
      footer={
        <>
          <Button variant="default" size="md" onClick={onClose}>Annuler</Button>
          <Button variant="primary" size="md" onClick={save} disabled={saving}>Enregistrer</Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">Le coût matières du mois vient de la source choisie ici.</p>
      <div className="-mx-2 mt-3 flex flex-col">
        {option("calcule", "Calculé (événements terminés)", fmtEur(row.mp.calcule))}
        {option("achats", "Achats (entrées MP du journal)", fmtEur(row.mp.achats))}
        {option("saisi", "Saisi (total du classeur)", row.mp.saisi !== undefined ? fmtEur(row.mp.saisi) : "–")}
      </div>
      {source === "saisi" && (
        <div className="mt-3">
          <FieldLabel htmlFor="mp-saisi">Montant saisi (HTVA)</FieldLabel>
          <NumericInput id="mp-saisi" value={saisi} onChange={setSaisi} min={0} className="input-field text-right tabular-nums" suffix="€" />
        </div>
      )}

      <h3 className="mt-5 text-base font-semibold">Achats MP du mois</h3>
      {purchases.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">Aucun achat MP dans le journal pour ce mois.</p>
      ) : (
        <div className="mt-1 divide-y divide-border">
          {purchases.map((p) => (
            <ListRow key={p.entryId} title={p.label} subtitle={`${dayLabel(p.date)}${p.supplier ? ` · ${p.supplier}` : ""}`} trailing={<span className="text-foreground">{fmtEur(p.htva)}</span>} to={`/comptes/journal?book=achats&ym=${row.ym}`} />
          ))}
        </div>
      )}
      <Button as={Link} to={`/comptes/journal?book=achats&ym=${row.ym}`} variant="link" size="sm" className="mt-2 -ml-2">Ajouter un achat</Button>
    </Dialog>
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
    <button type="button" onClick={() => setMpRow(r)} className="-mx-1 inline-flex flex-wrap items-center justify-end gap-1 rounded px-1 py-0.5 text-right hover:bg-hover" aria-label={`Source MP ${monthLabel(r.ym)}`}>
      <span className="tabular-nums">{fmtEur(r.mp.amount)}</span>
      <Tag colour={r.mp.source === "saisi" ? "gray" : r.mp.source === "achats" ? "purple" : "blue"}>{MP_LABEL[r.mp.source]}</Tag>
    </button>
  );

  const mpNote = (r: IncomeRow) => {
    if (r.ym >= currentYm) {
      return r.mp.upcoming !== undefined ? <span className="text-caption text-muted-foreground tabular-nums">MP prévu {fmtEur(r.mp.upcoming)}</span> : null;
    }
    if (r.mp.achatsPartiels !== undefined) {
      return <span className="text-caption text-muted-foreground tabular-nums">{fmtEur(r.mp.achatsPartiels)} achats partiels</span>;
    }
    return r.mp.nonTermines ? (
      <Link to="/events" className="text-caption text-warning hover:underline" onClick={(e) => e.stopPropagation()}>
        {r.mp.nonTermines} {r.mp.nonTermines > 1 ? "événements non terminés" : "événement non terminé"}
      </Link>
    ) : null;
  };

  const neg = (n: number) => (n < 0 ? "text-danger" : "");

  // Short header with the full wording on hover, so the columns fit at 1366 without a hidden scroll.
  const head = (short: string, full: string) => <span title={full}>{short}</span>;
  const wrap = "whitespace-normal";

  // Tags sit inline when the column has room and wrap under the amount otherwise; inline-flex keeps the phone list on one line.
  const caCell = (r: IncomeRow) => (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      {fmtEur(r.ca)}
      {r.caSource === "saisi" && <span title={r.caNote} className="inline-flex"><Tag colour="gray">saisi</Tag></span>}
    </span>
  );

  const resultatCell = (resultat: number, margePct: number | undefined) => (
    <span className="inline-flex flex-col items-end">
      <span className={`font-medium ${neg(resultat)}`}>{signed(resultat)}</span>
      {margePct !== undefined && <span className="text-caption font-normal text-muted-foreground">{fmtPct(margePct)}</span>}
    </span>
  );

  const columns: TableColumn<IncomeRow>[] = [
    { key: "month", label: "Mois", render: (r) => <Link to={`/comptes/journal?ym=${r.ym}`} className="font-medium hover:underline">{monthName(r.ym)}</Link> },
    { key: "ca", label: "CA HTVA", align: "right", className: wrap, render: caCell },
    { key: "mp", label: "Coûts MP", align: "right", className: wrap, render: (r) => <span className="inline-flex flex-col items-end">{mpCell(r)}{mpNote(r)}</span> },
    { key: "marge", label: "Marge brute", align: "right", className: wrap, render: (r) => signed(r.margeBrute) },
    { key: "autresProduits", label: head("Autres prod.", "Autres produits"), align: "right", className: wrap, render: (r) => fmtEur(r.autresProduits) },
    { key: "charges", label: "Charges fixes", align: "right", className: wrap, render: (r) => fmtEur(r.chargesFixes) },
    { key: "personnel", label: head("Pers. extra", "Personnel extra"), align: "right", className: wrap, render: (r) => <Link to={`/comptes/journal?book=achats&kind=personnel&ym=${r.ym}`} className="tabular-nums hover:underline">{fmtEur(r.personnelExtra)}</Link> },
    { key: "autresCouts", label: head("Autres coûts", "Autres coûts (location, transport, divers)"), align: "right", className: wrap, render: (r) => fmtEur(r.autresCouts) },
    { key: "resultat", label: head("Rés. av. impôts", "Résultat avant impôts, et en dessous la marge en % du CA"), align: "right", className: wrap, render: (r) => resultatCell(r.resultat, r.margePct) },
    { key: "impots", label: head("Impôts (est.)", "Impôts (estimation)"), align: "right", className: wrap, render: (r) => fmtEur(r.impots) },
    { key: "net", label: head("Rés. net", "Résultat net"), align: "right", className: wrap, trailing: true, render: (r) => <span className={`font-medium ${neg(r.resultatNet)}`}>{signed(r.resultatNet)}</span> },
  ];

  const scenarioPill = (
    <SelectPill
      value={scenario}
      options={[{ value: "avec", label: "Avec salarié" }, { value: "seule", label: "Seule" }]}
      colour="gray"
      align="right"
      aria-label="Scénario de simulation"
      onChange={(v) => pickScenario(v as Scenario)}
    />
  );

  const ratio = (label: string, value: string) => (
    <div className="flex h-8 items-center justify-between gap-3 border-b border-border text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );

  return (
    <div>
      <Toolbar
        left={<DateNav label={String(year)} onPrev={() => setYear(year - 1)} onNext={() => setYear(year + 1)} isToday={year === nowYear} onToday={() => setYear(nowYear)} todayLabel="Cette année" />}
        right={<ActionMenu items={[{ label: `Exporter ${year} (xlsx)`, icon: <Download />, onClick: onExport, disabled: !inputs }]} />}
      />
      <p className="mt-3 text-sm text-muted-foreground">Gestion, HTVA. Les mois réalisés lisent le journal; les charges fixes sont celles du scénario avec salarié.</p>

      {notConfigured && <div className="mt-4"><Callout emoji="💶">{NOT_CONFIGURED}</Callout></div>}
      {error && <div className="mt-4"><Callout tone="danger">{error}</Callout></div>}
      {loading && <p className="mt-4 text-sm text-muted-foreground">Chargement…</p>}

      {st && (
        <>
          <div className="mt-4">
            <Table
              columns={columns}
              rows={st.months}
              rowKey={(r) => r.ym}
              className="md:overflow-x-auto [&_td]:px-1.5 [&_th]:px-1.5"
              footer={{
                month: "Total année",
                ca: fmtEur(st.annual.ca),
                mp: fmtEur(st.annual.mp),
                marge: signed(st.annual.margeBrute),
                autresProduits: fmtEur(st.annual.autresProduits),
                charges: fmtEur(st.annual.chargesFixes),
                personnel: fmtEur(st.annual.personnelExtra),
                autresCouts: fmtEur(st.annual.autresCouts),
                resultat: resultatCell(st.annual.resultat, st.annual.margePct),
                impots: <span className="inline-flex items-center gap-1">{fmtEur(st.annual.impots)}{st.annual.impotsSource === "reel" && <Tag colour="green">réel</Tag>}</span>,
                net: <span className={neg(st.annual.resultatNet)}>{signed(st.annual.resultatNet)}</span>,
              }}
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">Impôts : le total annuel est calculé sur le résultat cumulé, pas additionné.</p>

          <Section title="Ratios">
            <div className="max-w-doc">
              {ratio("MP / CA", fmtPct(st.ratios.mpSurCa))}
              {ratio("Marge brute / CA", fmtPct(st.ratios.margeBruteSurCa))}
              {ratio("Charges fixes / CA", fmtPct(st.ratios.chargesFixesSurCa))}
            </div>
          </Section>

          {st.simulation && (
            <Section title="Simulation" action={scenarioPill}>
              <dl className="grid grid-cols-2 rounded-lg bg-surface text-base tabular-nums md:grid-cols-4">
                {([
                  ["CA", fmtEur(st.simulation.ca), ""],
                  ["MP", fmtEur(st.simulation.mp), ""],
                  ["Marge brute", signed(st.simulation.margeBrute), ""],
                  ["Charges fixes", fmtEur(st.simulation.chargesFixes), ""],
                  ["Personnel extra", fmtEur(st.simulation.personnelExtra), ""],
                  ["Résultat avant impôts", signed(st.simulation.resultat), neg(st.simulation.resultat)],
                  ["Impôts", fmtEur(st.simulation.impots), ""],
                  ["Résultat net", signed(st.simulation.resultatNet), neg(st.simulation.resultatNet)],
                ] as const).map(([label, value, cls]) => (
                  <div key={label} className="p-3">
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className={`mt-0.5 text-h3 ${cls}`}>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-sm text-muted-foreground">Marge {fmtPct(st.simulation.margePct)}</p>
            </Section>
          )}

          <Section
            title={`Taux ISoc ${fmtPct(taxRate, 0)}`}
            meta={objective?.smeReducedRate ? "taux réduit PME activé" : undefined}
            action={<Button as={Link} to={`/comptes/previsionnel?year=${year}`} variant="subtle" size="sm">Objectif dans le Prévisionnel</Button>}
          >
            <PropertyList className="mt-0 max-w-doc">
              <Property label="Taux ISoc" kind="number" value={round2(taxRate * 100)} min={0} max={100} decimals={2} suffix="%" onSave={(v) => saveTax({ corporateTaxRate: Math.min(1, v / 100) })} />
              <Property label="Taux réduit PME" kind="custom">
                <Checkbox checked={Boolean(objective?.smeReducedRate)} onChange={(on) => void saveTax({ smeReducedRate: on || undefined })} label={objective?.smeReducedRate ? "Activé" : "Désactivé"} className="-mx-1" />
              </Property>
            </PropertyList>
            <p className="mt-3 max-w-doc text-sm text-muted-foreground">{ISOC_HELP}</p>
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
