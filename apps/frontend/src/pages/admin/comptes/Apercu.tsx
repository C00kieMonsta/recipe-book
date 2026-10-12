import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ApercuRow, MixRow, Scenario } from "@packages/types";
import { DEFAULT_PRESTATION_TYPES, apercu, fmtEur, incomeStatement, isCaEntry, mix, previsionnel, rangeLabel, sumMoney } from "@packages/types";
import { monthLabel } from "@/lib/dates";
import { useReportInputs } from "@/lib/use-report-inputs";
import { Button, Callout, DateNav, MoneyTile, Section, SectionToggle, Table, Tag, Toolbar, type TableColumn } from "@/components/ui";

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
      <Tag colour="gray">saisi</Tag>
    </span>
  );
}

// ── Chart ───────────────────────────────────────────────────────────────────
const COLOR_N1 = "#787774";
const COLOR_N = "#2383e2";
const COLOR_OBJ = "#448361";
const COLOR_PREV = "#37352f";
const COLOR_GRID = "rgba(55,53,47,0.09)";
const COLOR_AXIS = "#787774";
const COLOR_HOVER = "rgba(55,53,47,0.08)";

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
            <line x1={x0} y1={yOf(t)} x2={x1} y2={yOf(t)} stroke={COLOR_GRID} strokeWidth={1} />
            <text x={x0 - 8} y={yOf(t) + 4} textAnchor="end" fontSize={12} fill={COLOR_AXIS}>{compactEuro(t)}</text>
          </g>
        ))}

        {data.map((d) => {
          const c = center(d.month);
          return (
            <g key={d.month} onMouseEnter={() => setHover(d.month)} onMouseLeave={() => setHover(null)}>
              {hover === d.month && <rect x={x0 + d.month * groupW} y={y0} width={groupW} height={plotH} fill={COLOR_HOVER} />}
              {d.n1 !== undefined && bar(c - 1.5 * barW - gap, d.n1, COLOR_N1, "n1")}
              {bar(c - 0.5 * barW, d.n, COLOR_N, "n")}
              {d.obj !== undefined && bar(c + 0.5 * barW + gap, d.obj, COLOR_OBJ, "obj")}
              <text x={c} y={H - 10} textAnchor="middle" fontSize={12} fill={COLOR_AXIS}>{MONTH_SHORT[d.month]}</text>
            </g>
          );
        })}

        <polyline points={line} fill="none" stroke={COLOR_PREV} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d) => <circle key={d.month} cx={center(d.month)} cy={yOf(d.prev)} r={3} fill={COLOR_PREV} />)}
      </svg>

      {hover !== null && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg bg-background px-3 py-2 text-sm shadow-menu tabular-nums">
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
  const { inputs, entries, settings, loading, notConfigured, error } = useReportInputs(year);
  const [scenario, setScenario] = useState<Scenario>(readScenario);

  useEffect(() => { setScenario(readScenario()); }, [year]);

  const nowYear = new Date().getFullYear();
  const currentYm = `${nowYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

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
    const unpaid = entries.filter((e) => isCaEntry(e) && !e.paid && e.ym.startsWith(yearPrefix));
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

  const atteintTag = (v: boolean | undefined) => (v === undefined ? "–" : v ? <Tag colour="green">Oui</Tag> : <Tag colour="yellow">Non</Tag>);

  const monthColumns: TableColumn<ApercuRow>[] = [
    { key: "month", label: "Mois", render: (r) => <span className="font-medium">{monthLabel(r.ym)}</span> },
    { key: "n1", label: `CA HTVA ${year - 1}`, align: "right", render: (r) => <>{fmtMoney(r.caN1.amount)}{r.caN1.source === "saisi" && r.caN1.amount !== undefined && <SaisiTag note={r.caN1.note} />}</> },
    { key: "n", label: `CA HTVA ${year}`, align: "right", trailing: true, render: (r) => <>{fmtMoney(r.caN.amount)}{r.caN.source === "saisi" && r.caN.amount !== undefined && <SaisiTag note={r.caN.note} />}</> },
    { key: "delta", label: "Δ %", align: "right", render: (r) => fmtPct(r.delta, 1) },
    { key: "obj", label: "Objectif", align: "right", render: (r) => fmtMoney(r.objectif) },
    { key: "prev", label: "Prévision (signé)", align: "right", render: (r) => fmtEur(r.prevision) },
    { key: "atteint", label: "Atteint", render: (r) => atteintTag(r.atteint) },
  ];

  const mixColumns: TableColumn<MixRow>[] = [
    { key: "type", label: "Type", render: (r) => <span className="font-medium">{r.type ? (typeLabel.get(r.type) ?? r.label) : r.label}</span> },
    { key: "n1", label: `CA ${year - 1}`, align: "right", render: (r) => <>{fmtMoney(r.caN1)}{r.caN1Source === "saisi" && <SaisiTag note={settings?.yearActuals?.[String(year - 1)]?.note} />}</> },
    { key: "shareN1", label: "%", align: "right", render: (r) => fmtPct(r.shareN1) },
    { key: "n", label: `CA ${year}`, align: "right", trailing: true, render: (r) => fmtEur(r.caN) },
    { key: "shareN", label: "%", align: "right", render: (r) => fmtPct(r.shareN) },
    { key: "obj", label: "Objectif", align: "right", render: (r) => fmtMoney(r.objectif) },
    { key: "shareObj", label: "%", align: "right", render: (r) => fmtPct(r.shareObjectif) },
    { key: "nb", label: "Nb nécessaires", align: "right", render: (r) => (r.nbNecessaires === undefined ? "–" : `≈ ${Math.ceil(r.nbNecessaires)}`) },
  ];

  return (
    <div>
      <Toolbar
        left={<DateNav label={String(year)} onPrev={() => setYear(year - 1)} onNext={() => setYear(year + 1)} isToday={year === nowYear} onToday={() => setYear(nowYear)} todayLabel="Cette année" />}
        right={
          <>
            <Button as={Link} to={`/comptes/previsionnel?year=${year}`} variant="subtle" size="sm">Modifier l'objectif</Button>
            <Button as={Link} to="/settings#finances" variant="subtle" size="sm">Années précédentes</Button>
          </>
        }
      />
      <p className="mt-3 text-sm text-muted-foreground">
        {objective ? `Objectif annuel ${fmtEur(objective.annualRevenue)} sur ${objective.monthsActive} mois actifs` : "Aucun objectif défini pour cette année"}
      </p>

      {notConfigured && <div className="mt-4"><Callout emoji="💶">{NOT_CONFIGURED}</Callout></div>}
      {error && <div className="mt-4"><Callout tone="danger">{error}</Callout></div>}
      {loading && <p className="mt-4 text-sm text-muted-foreground">Chargement…</p>}

      {report && (
        <>
          <div className="mt-4 grid grid-cols-2 rounded-lg bg-surface md:grid-cols-3">
            <MoneyTile flat label="CA année" value={fmtEur(report.ap.totals.caN)} sub="HTVA, hors commissions" />
            <MoneyTile flat label="Objectif année" value={fmtMoney(objective?.annualRevenue)} sub="Modifier l'objectif" to={`/comptes/previsionnel?year=${year}`} />
            <MoneyTile
              flat
              label="Atteint"
              value={fmtPct(atteint)}
              sub={objective ? `${fmtEur(report.ap.totals.caN)} sur ${fmtEur(objective.annualRevenue)}` : "Pas d'objectif"}
              progress={objective?.annualRevenue ? { value: report.ap.totals.caN, max: objective.annualRevenue } : undefined}
            />
            <MoneyTile
              flat
              label={scenario === "seule" ? "Seuil mensuel (seule)" : "Seuil mensuel (avec salarié)"}
              value={fmtEur(report.pv.seuilMensuel)}
              sub={`Seuil annuel ${fmtEur(report.pv.seuilAnnuel)}`}
              to={`/comptes/previsionnel?year=${year}`}
            />
            <MoneyTile flat label="À encaisser" value={fmtEur(report.unpaidTvac)} sub={`${report.unpaidCount} ${report.unpaidCount > 1 ? "lignes impayées" : "ligne impayée"} · TVAC`} to="/comptes/a-facturer#impayes" />
            <MoneyTile flat label="Marge brute du mois" value={fmtPct(report.margeBrutePct)} sub={monthLabel(report.focusYm)} to={`/comptes/resultats?year=${year}`} />
          </div>

          <Section title="CA par mois" action={<Legend year={year} />}>
            <MonthlyChart data={chartData} />
          </Section>

          <Section title="Par mois" meta="CA HTVA">
            <Table
              columns={monthColumns}
              rows={report.ap.rows}
              rowKey={(r) => r.ym}
              rowHref={(r) => `/comptes/journal?ym=${r.ym}`}
              footer={{
                month: `Total ${year}`,
                n1: fmtMoney(report.ap.totals.caN1),
                n: fmtEur(report.ap.totals.caN),
                delta: fmtPct(report.ap.totals.delta, 1),
                obj: fmtMoney(report.ap.totals.objectif),
                prev: fmtEur(report.ap.totals.prevision),
                atteint: atteintTag(report.ap.totals.atteint),
              }}
            />
            <p className="mt-3 text-sm text-muted-foreground tabular-nums">
              Autres produits (commissions) {year} : {fmtEur(report.ap.autresProduits.n)} / {year - 1} : {fmtMoney(report.ap.autresProduits.n1)}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm tabular-nums md:grid-cols-3">
              <div><dt className="text-muted-foreground">Seuil annuel</dt><dd>{fmtEur(report.pv.seuilAnnuel)}</dd></div>
              <div><dt className="text-muted-foreground">Seuil mensuel</dt><dd>{fmtEur(report.pv.seuilMensuel)}</dd></div>
              <div><dt className="text-muted-foreground">Seuil par mois actif</dt><dd>{fmtMoney(report.pv.seuilParMoisActif)}</dd></div>
              <div><dt className="text-muted-foreground">Objectif annuel</dt><dd>{fmtMoney(objective?.annualRevenue)}</dd></div>
              <div><dt className="text-muted-foreground">Objectif mensuel</dt><dd>{fmtMoney(objective && objective.monthsActive ? objective.annualRevenue / objective.monthsActive : undefined)}</dd></div>
            </dl>
          </Section>

          <Section title="Mix par prestation" meta="hors commissions">
            <Table
              columns={mixColumns}
              rows={report.mx.rows}
              rowKey={(r) => r.type ?? "sans"}
              rowHref={(r) => `/comptes/journal?ym=${report.focusYm}&type=${encodeURIComponent(r.type ?? "")}`}
              footer={{
                type: "Total",
                n1: fmtMoney(report.mx.totals.caN1),
                shareN1: report.mx.totals.caN1 !== undefined ? "100 %" : "–",
                n: fmtEur(report.mx.totals.caN),
                shareN: report.mx.totals.caN > 0 ? "100 %" : "–",
                obj: fmtMoney(report.mx.totals.objectif),
                shareObj: report.mx.totals.objectif ? "100 %" : "–",
              }}
            />
          </Section>

          <SectionToggle title="Comparaison par période" storageKey="apercu-periodes">
            <div className="divide-y divide-border">
              {report.ap.periodComparison.map((p) => (
                <div key={`${p.from}-${p.to}`} className="py-3">
                  <div className="text-sm font-medium">{rangeLabel(`${year}-${p.from}`, `${year}-${p.to}`)}</div>
                  <div className="mt-1 grid grid-cols-3 gap-3 text-sm tabular-nums">
                    {p.byYear.map((y) => (
                      <div key={y.year}>
                        <div className="text-muted-foreground">{y.year}</div>
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
