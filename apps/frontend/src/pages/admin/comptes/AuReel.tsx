import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AuReelRow } from "@packages/types";
import { DEFAULT_PRESTATION_TYPES, auReel, auReelYear, fmtEur, invoicedEventIds } from "@packages/types";
import { api } from "@/lib/api";
import { dayLabel, monthLabel } from "@/lib/dates";
import { useReportInputs } from "@/lib/use-report-inputs";
import { useToast } from "@/hooks/use-toast";
import { PageHeader, Section, Tag, ListRow, MoneyTile, EditableInlineNum, EditableInlineText } from "@/components/ui";

const NOT_CONFIGURED = "Comptabilité non configurée : la table ta-ledger n'existe pas encore";

const KIND_LABEL: Record<string, string> = {
  facture: "Facture",
  acompte: "Acompte",
  comptoir: "Comptoir",
  bon_cadeau: "Bon cadeau",
  note_de_credit: "Note de crédit",
  autre: "Autre",
};

function currentYm(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftYm(ym: string, delta: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1 + delta;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function useYmParam(): [string, (ym: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("ym") ?? "";
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : currentYm();
  const setYm = (next: string) => {
    const p = new URLSearchParams(params);
    p.set("ym", next);
    setParams(p);
  };
  return [ym, setYm];
}

function fmtMoney(x: number | undefined): string {
  return x === undefined ? "–" : fmtEur(x);
}

function fmtHours(x: number | undefined): string {
  return x === undefined ? "–" : `${String(x).replace(".", ",")} h`;
}

export default function AuReel() {
  const [ym, setYm] = useYmParam();
  const year = Number(ym.slice(0, 4));
  const { toast } = useToast();
  const { inputs, events, entries, settings, loading, notConfigured, error, reload } = useReportInputs(year);

  const typeLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of settings?.prestationTypes ?? DEFAULT_PRESTATION_TYPES) map.set(t.key, t.label);
    return map;
  }, [settings]);

  const eventName = useMemo(() => new Map(events.map((e) => [e.eventId, e.name])), [events]);
  const invoiced = useMemo(() => invoicedEventIds(entries), [entries]);

  const month = useMemo(() => (inputs ? auReel(ym, inputs) : null), [inputs, ym]);
  const yearSummary = useMemo(() => (inputs ? auReelYear(year, inputs) : null), [inputs, year]);

  const objective = settings?.objectives?.[String(year)];
  // Event whose "ajouter des heures" link was tapped; the first saved value creates hoursSpent.
  const [hoursFor, setHoursFor] = useState<string | null>(null);

  const saveEvent = async (eventId: string, patch: { hoursSpent?: number; notes?: string }) => {
    try {
      await api.events.update(eventId, patch);
      reload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    }
  };

  const typeOf = (r: AuReelRow) => (r.prestationType ? (typeLabel.get(r.prestationType) ?? r.prestationType) : undefined);

  const renderRow = (r: AuReelRow) => {
    const type = typeOf(r);
    const tags = (
      <>
        {!type && <Tag variant="warning">Sans type</Tag>}
        {r.kind === "entry" ? <Tag variant="primary">facturé</Tag> : <Tag variant="info">signé</Tag>}
      </>
    );
    if (r.kind === "entry") {
      const linked = r.eventIds.map((id) => eventName.get(id)).filter((n): n is string => Boolean(n));
      const parts = [dayLabel(r.date), KIND_LABEL[r.entryKind] ?? r.entryKind, type ?? "Sans type"];
      if (linked.length) parts.push(linked.join(", "));
      return (
        <div key={`e-${r.entryId}`} className="border-b border-border/60">
          <ListRow
            title={r.label}
            subtitle={parts.join(" · ")}
            trailing={<><span className="text-base tabular-nums">{fmtEur(r.htva)}</span>{tags}</>}
            to={`/comptes/journal?ym=${ym}`}
          />
          {r.hours !== undefined && (
            <div className="px-3 pb-3 text-base text-muted-foreground">Heures <strong className="text-foreground tabular-nums">{fmtHours(r.hours)}</strong></div>
          )}
        </div>
      );
    }
    const ev = events.find((e) => e.eventId === r.eventId);
    const detail = ev ? `${fmtEur(ev.sellingPricePerGuest)} × ${ev.guestCount}` : undefined;
    const parts = [dayLabel(r.date), type ?? "Sans type"];
    if (detail) parts.push(detail);
    if (ev && ev.name !== r.label) parts.push(ev.name);
    const toInvoice = r.status === "completed" && !invoiced.has(r.eventId);
    const fields = (
      <>
        <span className="inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap">
          {r.hours === undefined && hoursFor !== r.eventId ? (
            <button type="button" className="text-primary hover:underline" onClick={() => setHoursFor(r.eventId)}>ajouter des heures</button>
          ) : (
            <>Heures <EditableInlineNum value={r.hours ?? 0} min={0} suffix=" h" onSave={(v) => { setHoursFor(null); saveEvent(r.eventId, { hoursSpent: v }); }} /></>
          )}
        </span>
        <span className="block min-h-11 min-w-0 truncate leading-[2.75rem]">
          Observations <EditableInlineText value={r.notes ?? ""} placeholder="ajouter" onSave={(v) => saveEvent(r.eventId, { notes: v })} />
        </span>
      </>
    );
    return (
      <div key={`v-${r.eventId}`} className="border-b border-border/60">
        <div className="flex items-center gap-3">
          <ListRow
            className="min-w-0 flex-1"
            title={r.label}
            subtitle={parts.join(" · ")}
            trailing={
              <>
                <span className="text-base tabular-nums">{fmtEur(r.htva)}</span>
                {toInvoice && <Tag variant="warning">à facturer</Tag>}
                {tags}
              </>
            }
            to={toInvoice ? `/events/${r.eventId}?facturer=1` : `/events/${r.eventId}`}
          />
          <div className="hidden w-[21rem] shrink-0 items-center gap-x-4 pr-3 text-base text-muted-foreground md:flex">{fields}</div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-3 pb-3 text-base text-muted-foreground md:hidden">{fields}</div>
      </div>
    );
  };

  const navBtn = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border hover:bg-hover";

  return (
    <div className="max-w-doc mx-auto pb-24 md:pb-0">
      <PageHeader
        breadcrumb={[{ label: "Comptabilité", to: "/comptes" }, { label: "Au réel" }]}
        title={`Au réel · ${monthLabel(ym)}`}
        meta="Ce qui est facturé et ce qui est signé, mois par mois, face à l'objectif."
        actions={
          <>
            <button type="button" className={navBtn} aria-label="Mois précédent" onClick={() => setYm(shiftYm(ym, -1))}><ChevronLeft className="h-5 w-5" /></button>
            <span className="inline-flex min-h-11 min-w-[9rem] items-center justify-center text-base font-medium capitalize" aria-live="polite">{monthLabel(ym)}</span>
            <button type="button" className={navBtn} aria-label="Mois suivant" onClick={() => setYm(shiftYm(ym, 1))}><ChevronRight className="h-5 w-5" /></button>
          </>
        }
      />

      {notConfigured && <p className="card-elevated mb-6 p-4 text-base text-muted-foreground">{NOT_CONFIGURED}</p>}
      {error && <p className="mb-6 text-base text-destructive">{error}</p>}
      {loading && <p className="text-base text-muted-foreground">Chargement…</p>}

      {month && (
        <>
          {month.rows.length === 0 ? (
            <p className="text-base text-muted-foreground">Rien de facturé ni de signé ce mois-ci.</p>
          ) : (
            <div>{month.rows.map(renderRow)}</div>
          )}

          <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card p-4 md:static md:mt-6 md:rounded-xl md:border">
            <dl className="mx-auto grid max-w-doc grid-cols-2 gap-x-4 gap-y-2 text-base tabular-nums md:grid-cols-3">
              <div><dt className="text-sm text-muted-foreground">Total signé</dt><dd className="font-semibold">{fmtEur(month.totalSigne)}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Total heures</dt><dd className="font-semibold">{fmtHours(month.totalHeures)}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Je vise</dt><dd>{fmtMoney(month.jeVise)}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Temps disponible</dt><dd>{fmtHours(month.tempsDisponible)}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Il me reste à signer</dt><dd className={month.resteASigner !== undefined && month.resteASigner <= 0 ? "text-success" : ""}>{fmtMoney(month.resteASigner)}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Heures restantes</dt><dd className={month.heuresRestantes !== undefined && month.heuresRestantes < 0 ? "text-warning" : ""}>{fmtHours(month.heuresRestantes)}</dd></div>
            </dl>
            {!objective && (
              <p className="mt-2 text-sm text-muted-foreground">Pas d'objectif pour {year} : <Link to={`/comptes/previsionnel?year=${year}`} className="text-primary hover:underline">définir dans le Prévisionnel</Link>.</p>
            )}
          </footer>
        </>
      )}

      {yearSummary && (
        <Section title={`Année ${year}`} meta="signé et facturé">
          <div className="grid grid-cols-2 gap-3">
            <MoneyTile label="Total signé" value={fmtEur(yearSummary.totalSigne)} />
            <MoneyTile label="Total heures" value={fmtHours(yearSummary.totalHeures)} />
            <MoneyTile label="Objectif annuel" value={fmtMoney(yearSummary.annualRevenue)} to={`/comptes/previsionnel?year=${year}`} />
            <MoneyTile
              label="Écart à l'objectif"
              value={fmtMoney(yearSummary.ecart)}
              sub={yearSummary.ecart === undefined ? "Pas d'objectif" : yearSummary.ecart <= 0 ? "Objectif atteint" : "Reste à signer"}
              progress={yearSummary.annualRevenue ? { value: yearSummary.totalSigne, max: yearSummary.annualRevenue } : undefined}
            />
          </div>
        </Section>
      )}
    </div>
  );
}
