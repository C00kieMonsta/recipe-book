import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ApercuRow, MixRow, Scenario } from "@packages/types";
import { DEFAULT_PRESTATION_TYPES, apercu, fmtEur, incomeStatement, isCaEntry, mix, previsionnel, rangeLabel, sumMoney } from "@packages/types";
import { monthLabel } from "@/lib/dates";
import { useReportInputs } from "@/lib/use-report-inputs";
import { PageHeader, Section, SectionToggle, Tag, MoneyTile } from "@/components/ui";

const SCENARIO_KEY = "recipe-book:scenario";
const MONTH_SHORT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const NOT_CONFIGURED = "Comptabilité non configurée : la table ta-ledger n'existe pas encore";

function readScenario(): Scenario {
  try { return localStorage.getItem(SCENARIO_KEY) === "seule" ? "seule" : "avec"; } catch { return "avec"; }
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

function fmtPct(x: number | undefined, digits = 0): string {
  if (x === undefined || !Number.isFinite(x)) return "–";
  return `${(x * 100).toFixed(digits).replace(".", ",")} %`;
}

function fmtMoney(x: number | undefined): string {
  return x === undefined ? "–" : fmtEur(x);
}

function SaisiTag({ note }: { note?: string }) {
  return (
    <span title={note} className="ml-1 inline-flex">
      <Tag variant="neutral">saisi</Tag>
    </span>
  );
}

// ── Chart ───────────────────────────────────────────────────────────────────
const COLOR_N1 = "hsl(var(--muted-foreground))";
const COLOR_N = "hsl(var(--primary))";
const COLOR_OBJ = "hsl(var(--success))";
const COLOR_PREV = "hsl(var(--foreground))";

interface ChartDatum { month: number; n1?: number; n: number; obj?: number; prev: number }

function compactEuro(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return `${(n / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(".", ",")} k`;
  return String(Math.round(n));
}

function Legend({ year }: { year: number }) {
  const item = (color: string, label: string, line = false) => (
    <span className="flex items-center gap-1.5">
      <span className={line ? "h-0.5 w-4" : "h-3 w-3 rounded-sm"} style={{ background: color }} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
      {item(COLOR_N1, `CA ${year - 1}`)}
      {item(COLOR_N, `CA ${year}`)}
      {item(COLOR_OBJ, "Objectif")}
      {item(COLOR_PREV, "Prévision (signé)", true)}
    </div>
  );
}

function MonthlyChart({ data }: { data: ChartDatum[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 800, H = 320;
  const padL = 60, padR = 12, padT = 16, padB = 32;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const plotW = x1 - x0, plotH = y1 - y0;
  const groupW = plotW / 12;

  const maxVal = Math.max(0, ...data.flatMap((d) => [d.n1 ?? 0, d.n, d.obj ?? 0, d.prev]));
  const minVal = Math.min(0, ...data.map((d) => d.n));
  const yMax = maxVal === 0 && minVal === 0 ? 100 : maxVal * 1.1;
  const yMin = minVal * 1.1;
  const span = yMax - yMin || 1;

  const yOf = (v: number) => y1 - ((v - yMin) / span) * plotH;
  const center = (m: number) => x0 + (m + 0.5) * groupW;
  const zeroY = yOf(0);
  const barW = Math.min(12, groupW * 0.22);
  const gap = 2;

  const ticks = Array.from({ length: 5 }, (_, i) => yMin + (span * i) / 4);
  const line = data.map((d) => `${center(d.month)},${yOf(d.prev)}`).join(" ");

  const bar = (x: number, v: number, color: string, key: string) => {
    const top = v >= 0 ? yOf(v) : zeroY;
    const h = Math.abs(yOf(v) - zeroY);
    return <rect key={key} x={x} y={top} width={barW} height={h} rx={2} fill={color} />;
  };

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }} role="img" aria-label="CA par mois">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={x0} y1={yOf(t)} x2={x1} y2={yOf(t)} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray={t === 0 ? "0" : "3 3"} opacity={t === 0 ? 0.9 : 0.5} />
            <text x={x0 - 8} y={yOf(t) + 4} textAnchor="end" fontSize={12} fill="hsl(var(--muted-foreground))">{compactEuro(t)}</text>
          </g>
        ))}

        {data.map((d) => {
          const c = center(d.month);
          return (
            <g key={d.month} onMouseEnter={() => setHover(d.month)} onMouseLeave={() => setHover(null)}>
              {hover === d.month && <rect x={x0 + d.month * groupW} y={y0} width={groupW} height={plotH} fill="hsl(var(--muted))" opacity={0.5} />}
              {d.n1 !== undefined && bar(c - 1.5 * barW - gap, d.n1, COLOR_N1, "n1")}
              {bar(c - 0.5 * barW, d.n, COLOR_N, "n")}
              {d.obj !== undefined && bar(c + 0.5 * barW + gap, d.obj, COLOR_OBJ, "obj")}
              <text x={c} y={H - 10} textAnchor="middle" fontSize={12} fill="hsl(var(--muted-foreground))">{MONTH_SHORT[d.month]}</text>
            </g>
          );
        })}

        <polyline points={line} fill="none" stroke={COLOR_PREV} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d) => <circle key={d.month} cx={center(d.month)} cy={yOf(d.prev)} r={3} fill={COLOR_PREV} />)}
      </svg>

      {hover !== null && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm tabular-nums">
          <p className="mb-0.5 font-semibold">{MONTH_SHORT[hover]}</p>
          {data[hover].n1 !== undefined && <p>CA N−1 : <span className="font-medium">{fmtEur(data[hover].n1 as number)}</span></p>}
          <p>CA N : <span className="font-medium">{fmtEur(data[hover].n)}</span></p>
          {data[hover].obj !== undefined && <p>Objectif : <span className="font-medium">{fmtEur(data[hover].obj as number)}</span></p>}
          <p>Prévision : <span className="font-medium">{fmtEur(data[hover].prev)}</span></p>
        </div>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function Apercu() {
  const [year, setYear] = useYearParam();
  const navigate = useNavigate();
  const { inputs, entries, settings, loading, notConfigured, error } = useReportInputs(year);
  const [scenario, setScenario] = useState<Scenario>(readScenario);

  useEffect(() => { setScenario(readScenario()); }, [year]);

  const nowYear = new Date().getFullYear();
  const currentYm = `${nowYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  const years = useMemo(() => {
    const ys = new Set<number>([nowYear - 3, nowYear - 2, nowYear - 1, nowYear, nowYear + 1, year]);
    for (const k of Object.keys(settings?.objectives ?? {})) ys.add(Number(k));
    return Array.from(ys).filter((y) => Number.isInteger(y)).sort();
  }, [settings, year, nowYear]);

  const report = useMemo(() => {
    if (!inputs) return null;
    const ap = apercu(year, inputs);
    const mx = mix(year, inputs);
    const pv = previsionnel(year, inputs, scenario);
    const income = incomeStatement(year, inputs, scenario);
    const yearPrefix = `${year}-`;
    const inYear = income.months.filter((m) => m.ym.startsWith(yearPrefix));
    const focusYm = currentYm.startsWith(yearPrefix) ? currentYm : (inYear.filter((m) => m.ca > 0).pop()?.ym ?? `${year}-12`);
    const focus = income.months.find((m) => m.ym === focusYm);
    const unpaid = entries.filter((e) => isCaEntry(e) && !e.paid);
    return {
      ap, mx, pv,
      focusYm,
      margeBrutePct: focus && focus.ca > 0 ? focus.margeBrute / focus.ca : undefined,
      unpaidCount: unpaid.length,
      unpaidTvac: sumMoney(unpaid.map((e) => e.totalTvac)),
    };
  }, [inputs, entries, year, scenario, currentYm]);

  const typeLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of settings?.prestationTypes ?? DEFAULT_PRESTATION_TYPES) map.set(t.key, t.label);
    return map;
  }, [settings]);

  const objective = settings?.objectives?.[String(year)];
  const atteint = objective?.annualRevenue && report ? report.ap.totals.caN / objective.annualRevenue : undefined;

  const chartData: ChartDatum[] = (report?.ap.rows ?? []).map((r, i) => ({
    month: i,
    n1: r.caN1.amount,
    n: r.caN.amount ?? 0,
    obj: r.objectif,
    prev: r.prevision,
  }));

  return (
    <div className="max-w-wide mx-auto">
      <PageHeader
        breadcrumb={[{ label: "Comptabilité", to: "/comptes" }, { label: "Aperçu par mois" }]}
        title={`Aperçu ${year}`}
        meta={objective ? `Objectif annuel ${fmtEur(objective.annualRevenue)} sur ${objective.monthsActive} mois actifs` : "Aucun objectif défini pour cette année"}
        actions={
          <>
            <select aria-label="Année" className="input-field min-h-11 w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <Link to={`/comptes/previsionnel?year=${year}`} className="inline-flex min-h-11 items-center rounded-lg border px-3 text-base hover:bg-hover">Modifier l'objectif</Link>
            <Link to="/settings" className="inline-flex min-h-11 items-center rounded-lg border px-3 text-base hover:bg-hover">Années précédentes</Link>
          </>
        }
      />

      {notConfigured && <p className="card-elevated mb-6 p-4 text-base text-muted-foreground">{NOT_CONFIGURED}</p>}
      {error && <p className="mb-6 text-base text-destructive">{error}</p>}
      {loading && <p className="text-base text-muted-foreground">Chargement…</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <MoneyTile label="CA année" value={fmtEur(report.ap.totals.caN)} sub="HTVA, hors commissions" />
            <MoneyTile label="Objectif année" value={fmtMoney(objective?.annualRevenue)} sub="Modifier l'objectif" to={`/comptes/previsionnel?year=${year}`} />
            <MoneyTile
              label="Atteint"
              value={fmtPct(atteint)}
              sub={objective ? `${fmtEur(report.ap.totals.caN)} sur ${fmtEur(objective.annualRevenue)}` : "Pas d'objectif"}
              progress={objective?.annualRevenue ? { value: report.ap.totals.caN, max: objective.annualRevenue } : undefined}
            />
            <MoneyTile
              label={scenario === "seule" ? "Seuil mensuel (seule)" : "Seuil mensuel (avec salarié)"}
              value={fmtEur(report.pv.seuilMensuel)}
              sub={`Seuil annuel ${fmtEur(report.pv.seuilAnnuel)}`}
              to={`/comptes/previsionnel?year=${year}`}
            />
            <MoneyTile label="À encaisser" value={fmtEur(report.unpaidTvac)} sub={`${report.unpaidCount} ${report.unpaidCount > 1 ? "lignes impayées" : "ligne impayée"} · TVAC`} to="/comptes/journal" />
            <MoneyTile label="Marge brute du mois" value={fmtPct(report.margeBrutePct)} sub={monthLabel(report.focusYm)} to={`/comptes/resultats?year=${year}`} />
          </div>

          <div className="card-elevated mt-block p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-h3">CA par mois</h2>
              <Legend year={year} />
            </div>
            <MonthlyChart data={chartData} />
          </div>

          <Section title="Par mois" meta="CA HTVA">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr className="text-muted-foreground">
                    <th>Mois</th>
                    <th className="text-right">CA HTVA {year - 1}</th>
                    <th className="text-right">CA HTVA {year}</th>
                    <th className="text-right">Δ %</th>
                    <th className="text-right">Objectif</th>
                    <th className="text-right">Prévision (signé)</th>
                    <th>Atteint</th>
                  </tr>
                </thead>
                <tbody>
                  {report.ap.rows.map((r: ApercuRow) => (
                    <tr key={r.ym} className="cursor-pointer border-t border-border/60 hover:bg-hover" onClick={() => navigate(`/comptes/journal?ym=${r.ym}`)}>
                      <td><Link to={`/comptes/journal?ym=${r.ym}`} className="font-medium">{monthLabel(r.ym)}</Link></td>
                      <td className="text-right">{fmtMoney(r.caN1.amount)}{r.caN1.source === "saisi" && r.caN1.amount !== undefined && <SaisiTag note={r.caN1.note} />}</td>
                      <td className="text-right">{fmtMoney(r.caN.amount)}{r.caN.source === "saisi" && r.caN.amount !== undefined && <SaisiTag note={r.caN.note} />}</td>
                      <td className="text-right">{fmtPct(r.delta, 1)}</td>
                      <td className="text-right">{fmtMoney(r.objectif)}</td>
                      <td className="text-right">{fmtEur(r.prevision)}</td>
                      <td>{r.atteint === undefined ? "–" : r.atteint ? <Tag variant="success">Oui</Tag> : <Tag variant="warning">Non</Tag>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total {year}</td>
                    <td className="text-right">{fmtMoney(report.ap.totals.caN1)}</td>
                    <td className="text-right">{fmtEur(report.ap.totals.caN)}</td>
                    <td className="text-right">{fmtPct(report.ap.totals.delta, 1)}</td>
                    <td className="text-right">{fmtMoney(report.ap.totals.objectif)}</td>
                    <td className="text-right">{fmtEur(report.ap.totals.prevision)}</td>
                    <td>{report.ap.totals.atteint === undefined ? "–" : report.ap.totals.atteint ? <Tag variant="success">Oui</Tag> : <Tag variant="warning">Non</Tag>}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-3 text-base text-muted-foreground tabular-nums">
              Autres produits (commissions) {year} : {fmtEur(report.ap.autresProduits.n)} / {year - 1} : {fmtMoney(report.ap.autresProduits.n1)}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-base tabular-nums md:grid-cols-3">
              <div><dt className="text-sm text-muted-foreground">Seuil annuel</dt><dd>{fmtEur(report.pv.seuilAnnuel)}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Seuil mensuel</dt><dd>{fmtEur(report.pv.seuilMensuel)}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Seuil par mois actif</dt><dd>{fmtMoney(report.pv.seuilParMoisActif)}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Objectif annuel</dt><dd>{fmtMoney(objective?.annualRevenue)}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Objectif mensuel</dt><dd>{fmtMoney(objective && objective.monthsActive ? objective.annualRevenue / objective.monthsActive : undefined)}</dd></div>
            </dl>
          </Section>

          <Section title="Mix par prestation" meta="hors commissions">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr className="text-muted-foreground">
                    <th>Type</th>
                    <th className="text-right">CA {year - 1}</th>
                    <th className="text-right">%</th>
                    <th className="text-right">CA {year}</th>
                    <th className="text-right">%</th>
                    <th className="text-right">Objectif</th>
                    <th className="text-right">%</th>
                    <th className="text-right">Nb nécessaires</th>
                  </tr>
                </thead>
                <tbody>
                  {report.mx.rows.map((r: MixRow) => {
                    const to = `/comptes/journal?type=${encodeURIComponent(r.type ?? "")}`;
                    return (
                      <tr key={r.type ?? "sans"} className="cursor-pointer border-t border-border/60 hover:bg-hover" onClick={() => navigate(to)}>
                        <td><Link to={to} className="font-medium">{r.type ? (typeLabel.get(r.type) ?? r.label) : r.label}</Link></td>
                        <td className="text-right">{fmtMoney(r.caN1)}{r.caN1Source === "saisi" && <SaisiTag note={settings?.yearActuals?.[String(year - 1)]?.note} />}</td>
                        <td className="text-right">{fmtPct(r.shareN1)}</td>
                        <td className="text-right">{fmtEur(r.caN)}</td>
                        <td className="text-right">{fmtPct(r.shareN)}</td>
                        <td className="text-right">{fmtMoney(r.objectif)}</td>
                        <td className="text-right">{fmtPct(r.shareObjectif)}</td>
                        <td className="text-right">{r.nbNecessaires === undefined ? "–" : `≈ ${Math.ceil(r.nbNecessaires)}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="text-right">{fmtMoney(report.mx.totals.caN1)}</td>
                    <td className="text-right">{report.mx.totals.caN1 !== undefined ? "100 %" : "–"}</td>
                    <td className="text-right">{fmtEur(report.mx.totals.caN)}</td>
                    <td className="text-right">{report.mx.totals.caN > 0 ? "100 %" : "–"}</td>
                    <td className="text-right">{fmtMoney(report.mx.totals.objectif)}</td>
                    <td className="text-right">{report.mx.totals.objectif ? "100 %" : "–"}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Section>

          <SectionToggle title="Comparaison par période" storageKey="apercu-periodes">
            <div className="divide-y divide-border/60">
              {report.ap.periodComparison.map((p) => (
                <div key={`${p.from}-${p.to}`} className="py-3">
                  <div className="text-base font-medium">{rangeLabel(`${year}-${p.from}`, `${year}-${p.to}`)}</div>
                  <div className="mt-1 grid grid-cols-3 gap-3 text-base tabular-nums">
                    {p.byYear.map((y) => (
                      <div key={y.year}>
                        <div className="text-sm text-muted-foreground">{y.year}</div>
                        <div>{fmtMoney(y.amount)}{y.source === "saisi" && y.amount !== undefined && <SaisiTag note={y.note} />}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionToggle>
        </>
      )}
    </div>
  );
}
