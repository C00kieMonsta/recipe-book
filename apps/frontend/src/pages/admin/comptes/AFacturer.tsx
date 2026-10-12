import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AppEvent, EventCostSnapshot } from "@packages/types";
import { aFacturer, buildCostSnapshot, fmtEur, shortEventName } from "@packages/types";
import { api } from "@/lib/api";
import { dayMonthShortLabel, monthLabel, todayIso } from "@/lib/dates";
import { useReportInputs } from "@/lib/use-report-inputs";
import { useToast } from "@/hooks/use-toast";
import { MoneyTile, Section, Tag } from "@/components/ui";
import { PaidPopover } from "./Journal";

const NOT_CONFIGURED = "Comptabilité non configurée : la table ta-ledger n'existe pas encore";
const LATE_AFTER_DAYS = 30;

const btnPrimary = "inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 md:w-auto";
const btnSecondary = "inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border px-4 text-base font-medium hover:bg-hover md:w-auto";

function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}

function ddmm(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

// One line of text on the left, a full-width button on the phone and an inline one on the laptop.
function Row({ children, action }: { children: ReactNode; action: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border/60 py-3 last:border-b-0 md:flex-row md:items-center md:gap-4">
      <div className="min-w-0 flex-1 text-base">{children}</div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

export default function AFacturer() {
  const today = todayIso();
  const year = today.slice(0, 4);
  const { toast } = useToast();
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

  if (loading) return <p className="text-base text-muted-foreground">Chargement…</p>;

  return (
    <div className="max-w-doc pb-28 md:pb-0">
      {error && <p className="mb-6 text-base text-destructive">{error}</p>}
      {notConfigured && <p className="card-elevated mb-6 p-4 text-base text-muted-foreground">{NOT_CONFIGURED}</p>}

      {!notConfigured && (
        <div className="hidden grid-cols-2 gap-3 md:grid">
          <MoneyTile label={`À facturer · ${toInvoiceCount}`} value={fmtEur(report.totals.toInvoiceHtva)} sub="HTVA" to="#a-facturer" />
          <MoneyTile label={`Impayées · ${report.unpaid.length}`} value={fmtEur(report.totals.unpaidTvac)} sub="TVAC" to="#impayes" />
        </div>
      )}

      {nothing && !notConfigured && <p className="mt-6 text-base text-muted-foreground">Rien à facturer, rien d'impayé.</p>}

      <Section title="Événements passés à terminer" meta={report.toClose.length > 0 ? plural(report.toClose.length, "événement") : undefined}>
        {report.toClose.length === 0 ? (
          <p className="text-base text-muted-foreground">Aucun événement passé à terminer.</p>
        ) : (
          <div>
            {report.toClose.map((ev) => (
              <Row
                key={ev.eventId}
                action={
                  <button type="button" className={btnPrimary} disabled={busy === ev.eventId} onClick={() => void complete(ev)}>
                    Terminer
                  </button>
                }
              >
                <Link to={`/events/${ev.eventId}`} className="font-medium hover:underline">{shortEventName(ev, ev.clientId ? clientById.get(ev.clientId) : undefined)}</Link>
                {` · ${dayMonthShortLabel(ev.date).toLowerCase()} · ${ev.guestCount} conv. · ${fmtEur(ev.sellingPricePerGuest * ev.guestCount)}`}
              </Row>
            ))}
          </div>
        )}
      </Section>

      {!notConfigured && (
        <>
          <div id="a-facturer" className="scroll-mt-20">
            <Section title="À facturer" meta={toInvoiceCount > 0 ? `Σ ${fmtEur(report.totals.toInvoiceHtva)} HTVA` : undefined}>
              {toInvoiceCount === 0 ? (
                <p className="text-base text-muted-foreground">Rien à facturer.</p>
              ) : (
                <div>
                  {report.toInvoiceMonthly.map((m) => (
                    <Row
                      key={`${m.clientId}-${m.ym}`}
                      action={
                        <Link to={`/comptes/journal?client=${m.clientId}&prefill=month&ym=${m.ym}`} className={btnPrimary}>
                          Facturer le mois
                        </Link>
                      }
                    >
                      <span className="font-medium">{m.clientName}</span>
                      {` · ${monthLabel(m.ym)} · ${plural(m.eventIds.length, "événement")} · ${fmtEur(m.htva)} HTVA · `}
                      <Tag variant="info">mensuelle</Tag>
                    </Row>
                  ))}
                  {report.toInvoice.map((e) => (
                    <Row
                      key={e.eventId}
                      action={
                        <Link to={`/events/${e.eventId}?facturer=1#facturation`} className={btnPrimary}>
                          Facturer
                        </Link>
                      }
                    >
                      <Link to={`/events/${e.eventId}`} className="font-medium hover:underline">{e.label}</Link>
                      {` · ${dayMonthShortLabel(e.date).toLowerCase()} · ${fmtEur(e.htva)} HTVA`}
                      {e.acomptesHtva > 0 && ` · acompte reçu ${fmtEur(e.acomptesHtva)}`}
                    </Row>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <div id="impayes" className="scroll-mt-20">
            <Section title="Factures impayées" meta={report.unpaid.length > 0 ? `Σ ${fmtEur(report.totals.unpaidTvac)} TVAC` : undefined}>
              {report.unpaid.length === 0 ? (
                <p className="text-base text-muted-foreground">Aucune facture impayée.</p>
              ) : (
                <div>
                  {report.unpaid.map((e) => (
                    <Row
                      key={e.entryId}
                      action={
                        <PaidPopover
                          entry={e}
                          onSaved={reload}
                          align="right"
                          className="w-full md:w-auto"
                          trigger={<span className={btnSecondary}>Réglé ▾</span>}
                        />
                      }
                    >
                      <Link to={`/comptes/journal?ym=${e.ym}&filtre=non_regles`} className="font-medium hover:underline">
                        {e.number ? `n° ${e.number} · ` : ""}{e.label}
                      </Link>
                      {` · ${ddmm(e.date)} · ${fmtEur(e.totalTvac)} TVAC · `}
                      <span className={e.daysOutstanding > LATE_AFTER_DAYS ? "text-destructive" : undefined}>{plural(e.daysOutstanding, "jour")}</span>
                    </Row>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card p-4 md:hidden">
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
