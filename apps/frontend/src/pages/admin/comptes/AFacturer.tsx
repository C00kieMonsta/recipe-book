import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AppEvent, EventCostSnapshot } from "@packages/types";
import { aFacturer, buildCostSnapshot, fmtEur, shortEventName } from "@packages/types";
import { api } from "@/lib/api";
import { dayMonthShortLabel, monthLabel, todayIso } from "@/lib/dates";
import { useReportInputs } from "@/lib/use-report-inputs";
import { useToast } from "@/hooks/use-toast";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { Button, Callout, MoneyTile, Section, Tag } from "@/components/ui";
import { PaidPopover } from "./Journal";

const NOT_CONFIGURED = "Comptabilité non configurée : la table ta-ledger n'existe pas encore";
const LATE_AFTER_DAYS = 30;

function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}

function ddmm(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

const LINK = "font-medium hover:underline";

// A 36px database row: text on the left, the action on the right (full width on phones).
function Row({ children, action }: { children: ReactNode; action: ReactNode }) {
  return (
    <div className="flex min-h-9 flex-col gap-2 px-2 py-1 text-sm touch:text-base md:flex-row md:items-center md:gap-4 md:hover:bg-hover">
      <div className="min-w-0 flex-1">{children}</div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export default function AFacturer() {
  const today = todayIso();
  const year = today.slice(0, 4);
  const { toast } = useToast();
  const touch = useTouchScreen();
  const { inputs, events, entries, clients, loading, notConfigured, error, reload } = useReportInputs(year);
  const [busy, setBusy] = useState<string | null>(null);

  const report = useMemo(() => aFacturer({ events, entries, clients }, today), [events, entries, clients, today]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.clientId, c])), [clients]);

  const complete = async (ev: AppEvent) => {
    if (!inputs) return;
    setBusy(ev.eventId);
    try {
      const costSnapshot = buildCostSnapshot(ev, inputs.recipeCostById, inputs.recipePortionsById) as EventCostSnapshot;
      await api.events.update(ev.eventId, { status: "completed", costSnapshot });
      toast({ title: "Événement terminé" });
      reload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const toInvoiceCount = report.toInvoice.length + report.toInvoiceMonthly.length;
  const nothing = report.toClose.length === 0 && toInvoiceCount === 0 && report.unpaid.length === 0;

  // Inline default button on desktop, full-width primary on phones.
  const actionVariant = touch ? "primary" : "default";
  const actionClass = touch ? "w-full" : undefined;

  if (loading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="max-w-doc pb-28 md:pb-0">
      {error && <div className="mb-4"><Callout tone="danger">{error}</Callout></div>}
      {notConfigured && <div className="mb-4"><Callout emoji="💶">{NOT_CONFIGURED}</Callout></div>}

      {!notConfigured && (
        <div className="hidden grid-cols-2 divide-x divide-border rounded-lg bg-surface md:grid">
          <MoneyTile flat label={`À facturer · ${toInvoiceCount}`} value={fmtEur(report.totals.toInvoiceHtva)} sub="HTVA" to="#a-facturer" />
          <MoneyTile flat label={`Impayées · ${report.unpaid.length}`} value={fmtEur(report.totals.unpaidTvac)} sub="TVAC" to="#impayes" />
        </div>
      )}

      {nothing && !notConfigured && <p className="mt-4 text-sm text-muted-foreground">Rien à facturer, rien d'impayé.</p>}

      <Section title="Événements passés à terminer" meta={report.toClose.length > 0 ? <Tag colour="gray">{report.toClose.length}</Tag> : undefined}>
        {report.toClose.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun événement passé à terminer.</p>
        ) : (
          <div className="divide-y divide-border">
            {report.toClose.map((ev) => (
              <Row
                key={ev.eventId}
                action={
                  <Button variant={actionVariant} size="sm" className={actionClass} disabled={busy === ev.eventId} onClick={() => void complete(ev)}>
                    Terminer
                  </Button>
                }
              >
                <Link to={`/events/${ev.eventId}`} className={LINK}>{shortEventName(ev, ev.clientId ? clientById.get(ev.clientId) : undefined)}</Link>
                <span className="text-muted-foreground">{` · ${dayMonthShortLabel(ev.date).toLowerCase()} · ${ev.guestCount} conv. · ${fmtEur(ev.sellingPricePerGuest * ev.guestCount)}`}</span>
              </Row>
            ))}
          </div>
        )}
      </Section>

      {!notConfigured && (
        <>
          <div id="a-facturer" className="scroll-mt-20">
            <Section
              title="À facturer"
              meta={toInvoiceCount > 0 ? <><Tag colour="gray">{toInvoiceCount}</Tag> · {fmtEur(report.totals.toInvoiceHtva)} HTVA</> : undefined}
            >
              {toInvoiceCount === 0 ? (
                <p className="text-sm text-muted-foreground">Rien à facturer.</p>
              ) : (
                <div className="divide-y divide-border">
                  {report.toInvoiceMonthly.map((m) => (
                    <Row
                      key={`${m.clientId}-${m.ym}`}
                      action={
                        <Button as={Link} to={`/comptes/journal?client=${m.clientId}&prefill=month&ym=${m.ym}`} variant={actionVariant} size="sm" className={actionClass}>
                          Facturer le mois
                        </Button>
                      }
                    >
                      <span className="font-medium">{m.clientName}</span>
                      <span className="text-muted-foreground">{` · ${monthLabel(m.ym)} · ${plural(m.eventIds.length, "événement")} · ${fmtEur(m.htva)} HTVA · `}</span>
                      <Tag colour="blue">mensuelle</Tag>
                    </Row>
                  ))}
                  {report.toInvoice.map((e) => (
                    <Row
                      key={e.eventId}
                      action={
                        <Button as={Link} to={`/events/${e.eventId}?facturer=1#facturation`} variant={actionVariant} size="sm" className={actionClass}>
                          Facturer
                        </Button>
                      }
                    >
                      <Link to={`/events/${e.eventId}`} className={LINK}>{e.label}</Link>
                      <span className="text-muted-foreground">
                        {` · ${dayMonthShortLabel(e.date).toLowerCase()} · ${fmtEur(e.htva)} HTVA`}
                        {e.acomptesHtva > 0 && ` · acompte reçu ${fmtEur(e.acomptesHtva)}`}
                      </span>
                    </Row>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <div id="impayes" className="scroll-mt-20">
            <Section
              title="Factures impayées"
              meta={report.unpaid.length > 0 ? <><Tag colour="gray">{report.unpaid.length}</Tag> · {fmtEur(report.totals.unpaidTvac)} TVAC</> : undefined}
            >
              {report.unpaid.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune facture impayée.</p>
              ) : (
                <div className="divide-y divide-border">
                  {report.unpaid.map((e) => (
                    <Row key={e.entryId} action={<PaidPopover entry={e} onSaved={reload} align="right" />}>
                      <Link to={`/comptes/journal?ym=${e.ym}&filtre=non_regles`} className={LINK}>
                        {e.number ? `n° ${e.number} · ` : ""}{e.label}
                      </Link>
                      <span className="text-muted-foreground">{` · ${ddmm(e.date)} · ${fmtEur(e.totalTvac)} TVAC · `}</span>
                      <span className={e.daysOutstanding > LATE_AFTER_DAYS ? "text-danger" : "text-muted-foreground"}>{plural(e.daysOutstanding, "jour")}</span>
                    </Row>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background p-4 md:hidden">
            <dl className="grid grid-cols-2 gap-x-4 text-base tabular-nums">
              <div>
                <dt className="text-sm text-muted-foreground">À facturer · {toInvoiceCount}</dt>
                <dd className="font-semibold">{fmtEur(report.totals.toInvoiceHtva)} <span className="text-sm font-normal text-muted-foreground">HTVA</span></dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Impayées · {report.unpaid.length}</dt>
                <dd className="font-semibold">{fmtEur(report.totals.unpaidTvac)} <span className="text-sm font-normal text-muted-foreground">TVAC</span></dd>
              </div>
            </dl>
          </footer>
        </>
      )}
    </div>
  );
}
