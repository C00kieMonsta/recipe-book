import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { AuReelRow } from "@packages/types";
import { DEFAULT_PRESTATION_TYPES, auReel, auReelYear, fmtEur, invoicedEventIds } from "@packages/types";
import { api } from "@/lib/api";
import { dayLabel, monthLabel } from "@/lib/dates";
import { useReportInputs } from "@/lib/use-report-inputs";
import { useToast } from "@/hooks/use-toast";
import { Button, Callout, DateNav, EditableInlineNum, EditableInlineText, ListRow, MoneyTile, Section, Tag, Toolbar } from "@/components/ui";

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
        {!type && <Tag colour="yellow">Sans type</Tag>}
        {r.kind === "entry" ? <Tag colour="purple">facturé</Tag> : <Tag colour="blue">signé</Tag>}
      </>
    );
    if (r.kind === "entry") {
      const linked = r.eventIds.map((id) => eventName.get(id)).filter((n): n is string => Boolean(n));
      const parts = [dayLabel(r.date), KIND_LABEL[r.entryKind] ?? r.entryKind, type ?? "Sans type"];
      if (linked.length) parts.push(linked.join(", "));
      return (
        <div key={`e-${r.entryId}`} className="border-b border-border">
          <ListRow
            title={r.label}
            subtitle={parts.join(" · ")}
            trailing={<><span className="text-foreground">{fmtEur(r.htva)}</span>{tags}</>}
            to={`/comptes/journal?ym=${ym}`}
          />
          {r.hours !== undefined && (
            <div className="px-2 pb-2 text-sm text-muted-foreground">Heures <strong className="font-medium text-foreground tabular-nums">{fmtHours(r.hours)}</strong></div>
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
        <span className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap touch:h-11">
          {r.hours === undefined && hoursFor !== r.eventId ? (
            <Button variant="link" size="sm" className="-ml-2" onClick={() => setHoursFor(r.eventId)}>ajouter des heures</Button>
          ) : (
            <>Heures <EditableInlineNum value={r.hours ?? 0} min={0} suffix=" h" onSave={(v) => { setHoursFor(null); saveEvent(r.eventId, { hoursSpent: v }); }} /></>
          )}
        </span>
        <span className="inline-flex h-7 min-w-0 items-center gap-1 truncate touch:h-11">
          Observations <EditableInlineText value={r.notes ?? ""} placeholder="ajouter" onSave={(v) => saveEvent(r.eventId, { notes: v })} />
        </span>
      </>
    );
    return (
      <div key={`v-${r.eventId}`} className="border-b border-border">
        <div className="flex items-center gap-3">
          <ListRow
            className="min-w-0 flex-1"
            title={r.label}
            subtitle={parts.join(" · ")}
            trailing={
              <>
                <span className="text-foreground">{fmtEur(r.htva)}</span>
                {toInvoice && <Tag colour="yellow">à facturer</Tag>}
                {tags}
              </>
            }
            to={toInvoice ? `/events/${r.eventId}?facturer=1` : `/events/${r.eventId}`}
          />
          <div className="hidden w-[21rem] shrink-0 items-center gap-x-4 pr-2 text-sm text-muted-foreground md:flex">{fields}</div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-2 pb-2 text-sm text-muted-foreground md:hidden">{fields}</div>
      </div>
    );
  };

  const nowYm = currentYm();
  const stat = (label: string, value: ReactNode, className = "") => (
    <div className="p-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-h3 tabular-nums ${className}`}>{value}</dd>
    </div>
  );

  return (
    <div className="max-w-doc pb-24 md:pb-0">
      <Toolbar
        left={
          <DateNav
            label={monthLabel(ym)}
            value={ym}
            pickerType="month"
            onPrev={() => setYm(shiftYm(ym, -1))}
            onNext={() => setYm(shiftYm(ym, 1))}
            onPick={(v) => setYm(v)}
            isToday={ym === nowYm}
            onToday={() => setYm(nowYm)}
            todayLabel="Ce mois"
          />
        }
      />
      <p className="mt-3 text-sm text-muted-foreground">Ce qui est facturé et ce qui est signé, mois par mois, face à l'objectif.</p>

      {notConfigured && <div className="mt-4"><Callout emoji="💶">{NOT_CONFIGURED}</Callout></div>}
      {error && <div className="mt-4"><Callout tone="danger">{error}</Callout></div>}
      {loading && <p className="mt-4 text-sm text-muted-foreground">Chargement…</p>}

      {month && (
        <>
          {month.rows.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Rien de facturé ni de signé ce mois-ci.</p>
          ) : (
            <div className="mt-3">{month.rows.map(renderRow)}</div>
          )}

          <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background p-4 md:static md:mt-6 md:border-0 md:p-0">
            <dl className="mx-auto grid max-w-doc grid-cols-2 gap-x-4 gap-y-2 text-base tabular-nums md:grid-cols-3 md:gap-0 md:rounded-lg md:bg-surface">
              {stat("Total signé", fmtEur(month.totalSigne))}
              {stat("Total heures", fmtHours(month.totalHeures))}
              {stat("Je vise", fmtMoney(month.jeVise))}
              {stat("Temps disponible", fmtHours(month.tempsDisponible))}
              {stat("Il me reste à signer", fmtMoney(month.resteASigner), month.resteASigner !== undefined && month.resteASigner <= 0 ? "text-success" : "")}
              {stat("Heures restantes", fmtHours(month.heuresRestantes), month.heuresRestantes !== undefined && month.heuresRestantes < 0 ? "text-warning" : "")}
            </dl>
            {!objective && (
              <p className="mt-2 text-sm text-muted-foreground">Pas d'objectif pour {year} : <Link to={`/comptes/previsionnel?year=${year}`} className="text-primary hover:underline">définir dans le Prévisionnel</Link>.</p>
            )}
          </footer>
        </>
      )}

      {yearSummary && (
        <Section title={`Année ${year}`} meta="signé et facturé">
          <div className="grid grid-cols-2 rounded-lg bg-surface">
            <MoneyTile flat label="Total signé" value={fmtEur(yearSummary.totalSigne)} />
            <MoneyTile flat label="Total heures" value={fmtHours(yearSummary.totalHeures)} />
            <MoneyTile flat label="Objectif annuel" value={fmtMoney(yearSummary.annualRevenue)} to={`/comptes/previsionnel?year=${year}`} />
            <MoneyTile
              flat
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
