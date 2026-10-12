import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, FileText, Lock, LockOpen, Plus, X } from "lucide-react";
import type { CreateLedgerEntryRequest, LedgerBook, LedgerEntry, MpSource, PatchLedgerEntryRequest, PaymentMethod } from "@packages/types";
import { clientLabel, fmtEur, isCommissionEntry, prefillForClientMonth, rawMaterialOfMonth, sumMoney } from "@packages/types";
import { api } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { useReportInputs } from "@/lib/use-report-inputs";
import {
  MP_SOURCE_LABEL,
  PAYMENT_METHOD_LABEL,
  PURCHASE_FILTERS,
  SALES_FILTERS,
  aEncaisser,
  applyJournalFilter,
  entriesOfMonth,
  entryHours,
  fmtDateFr,
  kindLabel,
  ledgerErrorMessage,
  mmYyyy,
  monthLabel,
  personSummaries,
  prestationLabel,
  purchaseTotals,
  salesTotals,
  ymOptions,
  type JournalFilter,
} from "@/lib/accounting";
import { downloadMonthCsv, exportLedgerXlsx } from "@/lib/ledger-export";
import { Tag } from "@/components/ui";
import LedgerEntryForm from "@/components/comptes/LedgerEntryForm";

const NOT_CONFIGURED = "Comptabilité non configurée : la table ta-ledger n'existe pas encore";
const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[];

function money(n: number): string {
  return n === 0 ? "" : fmtEur(n);
}

// Full-screen sheet on phones, centred dialog on larger screens.
function Sheet({ children, onClose, wide }: { children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-card md:flex md:items-center md:justify-center md:bg-foreground/30 md:backdrop-blur-sm" onClick={onClose}>
      <div
        className={`h-full w-full overflow-auto p-4 md:h-auto md:max-h-[90vh] md:rounded-2xl md:bg-card md:p-7 md:shadow-xl ${wide ? "md:w-[92%] md:max-w-3xl" : "md:w-[92%] md:max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// Two-field "Réglé" popover shared with the event page and À facturer; the trigger defaults to the journal tag.
export function PaidPopover({ entry, onSaved, trigger, align = "left", className = "" }: { entry: LedgerEntry; onSaved: () => void; trigger?: ReactNode; align?: "left" | "right"; className?: string }) {
  const [open, setOpen] = useState(false);
  const [paid, setPaid] = useState(entry.paid);
  const [method, setMethod] = useState<string>(entry.paymentMethod ?? "");
  const [paidAt, setPaidAt] = useState(entry.paidAt ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    const body: PatchLedgerEntryRequest = { paid };
    if (paid && method) body.paymentMethod = method as PaymentMethod;
    if (paid && paidAt) body.paidAt = paidAt;
    try {
      await api.ledger.patch(entry.entryId, body);
      setOpen(false);
      onSaved();
    } catch (e) {
      setError(ledgerErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`relative ${className}`} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="inline-flex min-h-11 w-full items-center" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
        {trigger ?? <Tag variant={entry.paid ? "success" : "warning"}>{entry.paid ? "Réglé" : "Non réglé"}</Tag>}
      </button>
      {open && (
        <div className={`absolute top-full z-30 mt-1 w-64 rounded-xl border border-border bg-card p-3 text-left shadow-lg ${align === "right" ? "right-0" : "left-0"}`}>
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input type="checkbox" className="h-5 w-5" checked={paid} onChange={(e) => { setPaid(e.target.checked); if (e.target.checked && !paidAt) setPaidAt(todayIso()); }} />
            Réglé
          </label>
          {paid && (
            <>
              <select className="input-field mt-2" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Mode">
                <option value="">Mode non précisé</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>
                ))}
              </select>
              <input type="date" className="input-field mt-2" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} aria-label="Encaissé le" />
            </>
          )}
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} className="min-h-11 flex-1 rounded-lg bg-primary px-3 text-base text-primary-foreground disabled:opacity-50" onClick={() => void save()}>Enregistrer</button>
            <button type="button" className="min-h-11 rounded-lg px-3 text-base text-muted-foreground" onClick={() => setOpen(false)}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RailTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card-elevated p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-h3 tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-sm text-muted-foreground">{sub}</div>}
    </div>
  );
}

interface FormOpen {
  entry?: LedgerEntry;
  initial?: Partial<CreateLedgerEntryRequest>;
  above?: ReactNode;
}

export default function Journal() {
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const ym = /^\d{4}-\d{2}$/.test(params.get("ym") ?? "") ? (params.get("ym") as string) : today.slice(0, 7);
  const year = ym.slice(0, 4);
  const book: LedgerBook = params.get("book") === "achats" ? "achats" : "ventes";
  // "kind" is the alias other pages use for the filter chip.
  const filterParam = (params.get("filtre") ?? params.get("kind")) as JournalFilter | null;
  const chips = book === "ventes" ? SALES_FILTERS : PURCHASE_FILTERS;
  const filter: JournalFilter = filterParam && chips.some((c) => c.key === filterParam) ? filterParam : "tous";
  // Sales type filter: an empty value means entries without prestation type.
  const typeParam = book === "ventes" ? params.get("type") : null;

  const data = useReportInputs(year);
  const { inputs, entries, events, settings, clients, loading, notConfigured, error, reload } = data;

  const [form, setForm] = useState<FormOpen | null>(null);
  const [lockOpen, setLockOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [askLock, setAskLock] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const monthClose = settings?.monthCloses?.[ym];
  const locked = Boolean(monthClose?.lockedAt);
  const monthEntries = useMemo(() => entriesOfMonth(entries, ym, book), [entries, ym, book]);
  const shown = useMemo(() => {
    const filtered = applyJournalFilter(monthEntries, filter);
    return typeParam === null ? filtered : filtered.filter((e) => (e.prestationType ?? "") === typeParam);
  }, [monthEntries, filter, typeParam]);
  const sales = useMemo(() => salesTotals(shown, settings), [shown, settings]);
  const purchases = useMemo(() => purchaseTotals(shown), [shown]);
  const monthSales = useMemo(() => entriesOfMonth(entries, ym, "ventes"), [entries, ym]);
  const encaisser = useMemo(() => aEncaisser(monthSales), [monthSales]);
  const acomptes = useMemo(() => monthSales.filter((e) => e.kind === "acompte"), [monthSales]);
  const commissions = useMemo(() => monthSales.filter(isCommissionEntry), [monthSales]);
  const persons = useMemo(() => personSummaries(monthEntries), [monthEntries]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.clientId, c])), [clients]);

  const eventOptions = useMemo(
    () =>
      [...events]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((e) => ({ eventId: e.eventId, label: `${fmtDateFr(e.date)} · ${clientLabel(e, clients)}${e.name && e.name !== clientLabel(e, clients) ? ` · ${e.name}` : ""}` })),
    [events, clients],
  );
  const clientOptions = useMemo(() => clients.map((c) => ({ clientId: c.clientId, name: c.name })), [clients]);
  const refOptions = useMemo(
    () =>
      entries
        .filter((e) => e.book === "ventes" && (e.kind === "facture" || e.kind === "comptoir"))
        .map((e) => ({ entryId: e.entryId, label: `${e.number ? `${e.number} · ` : ""}${e.label} · ${fmtEur(e.totalTvac)}` })),
    [entries],
  );

  // "Facturer le mois" from a client page: open the form prefilled with that client's uninvoiced events.
  const prefillClient = params.get("prefill") === "month" ? params.get("client") : null;
  useEffect(() => {
    if (!prefillClient || loading || !settings) return;
    const client = clientById.get(prefillClient);
    if (!client) { setNotice("Client introuvable"); setParam({ prefill: null, client: null }); return; }
    const p = prefillForClientMonth(client, events, entries, settings, ym);
    setForm({
      initial: p.entry,
      above: (
        <div>
          <div className="flex flex-wrap justify-between gap-2">
            <span>Revenu prévu <span className="font-medium tabular-nums">{fmtEur(p.revenuePrevu)}</span></span>
            <span>Acomptes déjà reçus <span className="font-medium tabular-nums">{fmtEur(p.acomptesRecus)}</span></span>
          </div>
          {p.byMonth.length === 0 && <p className="mt-2 text-muted-foreground">Aucun événement non facturé jusqu'à {monthLabel(ym)}.</p>}
          {p.byMonth.map((g) => (
            <div key={g.ym} className="mt-2">
              <div className="text-sm text-muted-foreground">{monthLabel(g.ym)} · {fmtEur(g.revenue)}</div>
              <ul className="mt-1 list-disc pl-5">
                {g.events.map((e) => (
                  <li key={e.eventId}>{fmtDateFr(e.date)} · {e.name} · {e.guestCount} couverts</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ),
    });
    setParam({ prefill: null, client: null });
  }, [prefillClient, loading, settings]);

  const openNew = () =>
    setForm({ initial: book === "ventes" ? { book: "ventes", kind: "facture", date: ym === today.slice(0, 7) ? today : `${ym}-01` } : { book: "achats", kind: "mp", date: ym === today.slice(0, 7) ? today : `${ym}-01` } });

  const onExport = () => {
    if (!inputs) return;
    try {
      exportLedgerXlsx(Number(year), inputs);
      if (!locked) setAskLock(true);
    } catch (e) {
      setNotice(ledgerErrorMessage(e));
    }
  };

  if (notConfigured) {
    return <p className="max-w-doc rounded-lg bg-surface px-4 py-3 text-base">{NOT_CONFIGURED}</p>;
  }

  const toolbar = (
    <div className="no-print flex flex-wrap items-center gap-2">
      <select className="input-field w-auto min-h-11" value={year} aria-label="Année" onChange={(e) => setParam({ ym: `${e.target.value}${ym.slice(4)}` })}>
        {Array.from({ length: 5 }, (_, i) => String(Number(today.slice(0, 4)) + 1 - i)).map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <select className="input-field w-auto min-h-11" value={ym} aria-label="Mois" onChange={(e) => setParam({ ym: e.target.value })}>
        {ymOptions(year).map((o) => (
          <option key={o.ym} value={o.ym}>{o.label}</option>
        ))}
      </select>
      <div className="flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Livre">
        {(["ventes", "achats"] as LedgerBook[]).map((b) => (
          <button
            key={b}
            type="button"
            role="tab"
            aria-selected={book === b}
            className={`min-h-10 rounded-md px-4 text-base ${book === b ? "bg-primary-soft font-medium" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setParam({ book: b, filtre: null, kind: null, type: null })}
          >
            {b === "ventes" ? "Ventes" : "Achats"}
          </button>
        ))}
      </div>
    </div>
  );

  const actions = (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground hover:opacity-90" onClick={openNew}>
        <Plus className="h-4 w-4" /> Nouvelle ligne
      </button>
      <button type="button" disabled={!inputs} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-base hover:bg-hover disabled:opacity-50" onClick={onExport}>
        <Download className="h-4 w-4" /> Exporter {year} (xlsx)
      </button>
      <button type="button" disabled={!settings} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-base hover:bg-hover disabled:opacity-50" onClick={() => settings && downloadMonthCsv(ym, entries, settings)}>
        <FileText className="h-4 w-4" /> CSV du mois
      </button>
      {locked ? (
        <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-base hover:bg-hover" onClick={() => setUnlockOpen(true)}>
          <LockOpen className="h-4 w-4" /> Déverrouiller
        </button>
      ) : (
        <button type="button" disabled={!inputs} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-base hover:bg-hover disabled:opacity-50" onClick={() => setLockOpen(true)}>
          <Lock className="h-4 w-4" /> Verrouiller le mois
        </button>
      )}
    </div>
  );

  const typeOf = (e: LedgerEntry) => prestationLabel(settings, e.prestationType);

  const salesTable = (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr className="text-muted-foreground">
            <th>N°</th>
            <th>Date</th>
            <th>Intitulé</th>
            <th>Type</th>
            <th className="text-right">Total TVAC</th>
            <th className="text-right">HTVA</th>
            <th className="text-right">TVA 6 %</th>
            <th className="text-right">TVA 12 %</th>
            <th className="text-right">TVA 21 %</th>
            <th>Réglé</th>
            <th>Mode</th>
            <th>Encaissé le</th>
            <th>Description</th>
            <th className="text-right">KM</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((e) => (
            <tr key={e.entryId} className="cursor-pointer border-t border-border/60 hover:bg-hover" onClick={() => setForm({ entry: e })}>
              <td className="whitespace-nowrap">{e.number ?? ""}</td>
              <td className="whitespace-nowrap">{fmtDateFr(e.date)}</td>
              <td>
                <span className="font-medium">{e.label}</span>
                {e.kind !== "facture" && <span className="ml-2 text-muted-foreground">{kindLabel(e)}</span>}
              </td>
              <td className="whitespace-nowrap">{typeOf(e)}</td>
              <td className="text-right">{fmtEur(e.totalTvac)}</td>
              <td className="text-right">{fmtEur(e.htva)}</td>
              <td className="text-right">{e.vatRate === 6 ? fmtEur(e.vatAmount) : ""}</td>
              <td className="text-right">{e.vatRate === 12 ? fmtEur(e.vatAmount) : ""}</td>
              <td className="text-right">{e.vatRate === 21 ? fmtEur(e.vatAmount) : ""}</td>
              <td><PaidPopover entry={e} onSaved={reload} /></td>
              <td className="whitespace-nowrap">{e.paymentMethod ? PAYMENT_METHOD_LABEL[e.paymentMethod] : ""}</td>
              <td className="whitespace-nowrap">{fmtDateFr(e.paidAt)}</td>
              <td className="max-w-[16rem] truncate" title={e.description}>{e.description ?? ""}</td>
              <td className="text-right">{e.km ?? ""}</td>
            </tr>
          ))}
          {shown.length === 0 && (
            <tr><td colSpan={14} className="text-muted-foreground">Aucune ligne pour {monthLabel(ym)}.</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>Total</td>
            <td className="text-right">{fmtEur(sales.tvac)}</td>
            <td className="text-right">{fmtEur(sales.htva)}</td>
            <td className="text-right">{money(sales.vat6)}</td>
            <td className="text-right">{money(sales.vat12)}</td>
            <td className="text-right">{money(sales.vat21)}</td>
            <td colSpan={5} />
          </tr>
          <tr>
            <td colSpan={4}>Total CA {mmYyyy(ym)}</td>
            <td />
            <td className="text-right">{fmtEur(sales.totalCa)}</td>
            <td colSpan={8} />
          </tr>
          {sales.byType.filter((t) => t.amount !== 0).map((t) => (
            <tr key={t.label} className="font-normal text-muted-foreground">
              <td colSpan={4} className="!font-normal !border-t-0 pl-6">{t.label}</td>
              <td className="!border-t-0" />
              <td className="text-right !font-normal !border-t-0">{money(t.amount)}</td>
              <td colSpan={8} className="!border-t-0" />
            </tr>
          ))}
          <tr>
            <td colSpan={4}>Commissions (hors CA)</td>
            <td />
            <td className="text-right">{money(sales.commissions)}</td>
            <td colSpan={8} />
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const purchaseTable = (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr className="text-muted-foreground">
            <th>Date</th>
            <th>Intitulé</th>
            <th>Type</th>
            <th>Fournisseur ou Personne</th>
            <th className="text-right">Heures</th>
            <th className="text-right">Taux</th>
            <th className="text-right">HTVA</th>
            <th className="text-right">TVA</th>
            <th className="text-right">TVAC</th>
            <th>Réf.</th>
            <th>Réglé</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((e) => (
            <tr key={e.entryId} className="cursor-pointer border-t border-border/60 hover:bg-hover" onClick={() => setForm({ entry: e })}>
              <td className="whitespace-nowrap">{fmtDateFr(e.date)}</td>
              <td className="font-medium">{e.label}</td>
              <td>{kindLabel(e)}</td>
              <td>{e.personName ?? e.supplier ?? ""}</td>
              <td className="text-right">{e.kind === "personnel" && entryHours(e) ? entryHours(e) : ""}</td>
              <td className="text-right">{e.hourlyRate !== undefined ? fmtEur(e.hourlyRate) : ""}</td>
              <td className="text-right">{fmtEur(e.htva)}</td>
              <td className="text-right">{fmtEur(e.vatAmount)}</td>
              <td className="text-right">{fmtEur(e.totalTvac)}</td>
              <td className="whitespace-nowrap">{e.number ?? ""}</td>
              <td><PaidPopover entry={e} onSaved={reload} /></td>
            </tr>
          ))}
          {shown.length === 0 && (
            <tr><td colSpan={11} className="text-muted-foreground">Aucun achat pour {monthLabel(ym)}.</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>Total</td>
            <td className="text-right">{purchases.hours || ""}</td>
            <td />
            <td className="text-right">{fmtEur(purchases.htva)}</td>
            <td className="text-right">{fmtEur(purchases.vat)}</td>
            <td className="text-right">{fmtEur(purchases.tvac)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const cards = (
    <div className="flex flex-col gap-2">
      {shown.map((e) => (
        <button key={e.entryId} type="button" className="card-elevated flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-hover" onClick={() => setForm({ entry: e })}>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{e.label}</div>
            <div className="text-sm text-muted-foreground">
              {fmtDateFr(e.date)}{e.number ? ` · N° ${e.number}` : ""}{book === "ventes" ? (typeOf(e) ? ` · ${typeOf(e)}` : "") : ` · ${kindLabel(e)}`}
            </div>
            <div className="mt-2"><Tag variant={e.paid ? "success" : "warning"}>{e.paid ? "Réglé" : "Non réglé"}</Tag></div>
          </div>
          <div className="shrink-0 text-right tabular-nums">
            <div className="text-base font-semibold">{fmtEur(e.totalTvac)}</div>
            <div className="text-sm text-muted-foreground">{fmtEur(e.htva)} HTVA</div>
          </div>
        </button>
      ))}
      {shown.length === 0 && <p className="text-base text-muted-foreground">Aucune ligne pour {monthLabel(ym)}.</p>}
      <div className="sticky bottom-0 -mx-4 mt-2 border-t border-border bg-card px-4 py-3 text-base tabular-nums">
        {book === "ventes" ? (
          <>
            <div className="flex justify-between"><span>Σ TVAC</span><span className="font-semibold">{fmtEur(sales.tvac)}</span></div>
            <div className="flex justify-between"><span>Σ HTVA</span><span className="font-semibold">{fmtEur(sales.htva)}</span></div>
            <div className="flex justify-between"><span>Total CA {mmYyyy(ym)}</span><span className="font-semibold">{fmtEur(sales.totalCa)}</span></div>
          </>
        ) : (
          <>
            <div className="flex justify-between"><span>Σ HTVA</span><span className="font-semibold">{fmtEur(purchases.htva)}</span></div>
            <div className="flex justify-between"><span>Σ TVAC</span><span className="font-semibold">{fmtEur(purchases.tvac)}</span></div>
          </>
        )}
      </div>
    </div>
  );

  const rail = (
    <aside className="grid grid-cols-1 gap-3 sm:grid-cols-3 2xl:flex 2xl:w-72 2xl:shrink-0 2xl:flex-col">
      <RailTile label="Acomptes du mois" value={fmtEur(sumMoney(acomptes.map((e) => e.totalTvac)))} sub={`${acomptes.length} acompte${acomptes.length > 1 ? "s" : ""}`} />
      <RailTile label="Commissions" value={fmtEur(sumMoney(commissions.map((e) => e.htva)))} sub="hors CA" />
      <RailTile label="À encaisser" value={fmtEur(encaisser.total)} sub={`${encaisser.count} ligne${encaisser.count > 1 ? "s" : ""} non réglée${encaisser.count > 1 ? "s" : ""}`} />
      {book === "achats" && persons.map((p) => (
        <div key={p.personName} className="card-elevated p-4">
          <div className="text-sm text-muted-foreground">Résumé facture</div>
          <div className="mt-1 text-base font-semibold">{p.personName}</div>
          <div className="mt-1 text-sm text-muted-foreground">{p.dates.map(fmtDateFr).join(", ") || "Aucune date"}</div>
          <div className="mt-2 text-base tabular-nums">
            {p.hours} h{p.hourlyRate !== undefined ? ` × ${fmtEur(p.hourlyRate)}` : ""} = <span className="font-semibold">{fmtEur(p.amount)}</span>
          </div>
        </div>
      ))}
    </aside>
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {toolbar}
        {actions}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <h2 className="text-h3 capitalize">{monthLabel(ym)}</h2>
        {locked && monthClose?.lockedAt && <Tag variant="warning">Verrouillé le {fmtDateFr(monthClose.lockedAt.slice(0, 10))}</Tag>}
        {monthClose && !locked && monthClose.unlockedAt && <Tag variant="neutral">Déverrouillé le {fmtDateFr(monthClose.unlockedAt.slice(0, 10))}</Tag>}
      </div>

      <div className="no-print mt-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={filter === c.key}
            className={`min-h-11 rounded-full border px-4 text-base ${filter === c.key ? "border-primary bg-primary-soft font-medium" : "border-border hover:bg-hover"}`}
            onClick={() => setParam({ filtre: c.key === "tous" ? null : c.key, kind: null })}
          >
            {c.label}
          </button>
        ))}
        {typeParam !== null && (
          <button
            type="button"
            aria-pressed="true"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary bg-primary-soft px-4 text-base font-medium"
            onClick={() => setParam({ type: null })}
          >
            Type : {typeParam ? prestationLabel(settings, typeParam) : "Sans type"}
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {error && <p className="mt-4 rounded-lg bg-destructive-soft px-3 py-2 text-base text-destructive">{error}</p>}
      {notice && (
        <p className="mt-4 flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-base">
          <span>{notice}</span>
          <button type="button" className="min-h-11 px-2 text-muted-foreground" onClick={() => setNotice(null)}>Fermer</button>
        </p>
      )}
      {askLock && (
        <p className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-surface px-3 py-2 text-base">
          <span>Export téléchargé. Verrouiller {monthLabel(ym)} ?</span>
          <button type="button" className="min-h-11 rounded-lg bg-primary px-4 text-primary-foreground" onClick={() => { setAskLock(false); setLockOpen(true); }}>Oui</button>
          <button type="button" className="min-h-11 rounded-lg px-3 text-muted-foreground" onClick={() => setAskLock(false)}>Plus tard</button>
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-base text-muted-foreground">Chargement…</p>
      ) : (
        <div className="mt-4 flex flex-col gap-6 2xl:flex-row">
          <div className="min-w-0 flex-1">
            <div className="hidden md:block">{book === "ventes" ? salesTable : purchaseTable}</div>
            <div className="md:hidden">{cards}</div>
          </div>
          {rail}
        </div>
      )}

      {form && (
        <Sheet onClose={() => setForm(null)} wide>
          <LedgerEntryForm
            entry={form.entry}
            initial={form.initial}
            locked={form.entry ? locked || form.entry.locked : false}
            eventOptions={eventOptions}
            clientOptions={clientOptions}
            prestationTypes={settings?.prestationTypes}
            refOptions={refOptions}
            above={form.above}
            onSaved={(_saved, next) => { reload(); if (!next?.keepOpen) setForm(null); }}
            onCancel={() => setForm(null)}
            onDeleted={() => { reload(); setForm(null); }}
          />
        </Sheet>
      )}

      {lockOpen && inputs && (
        <Sheet onClose={() => setLockOpen(false)}>
          <LockDialog ym={ym} inputs={inputs} monthClose={monthClose} onDone={() => { setLockOpen(false); reload(); }} onCancel={() => setLockOpen(false)} />
        </Sheet>
      )}
      {unlockOpen && (
        <Sheet onClose={() => setUnlockOpen(false)}>
          <UnlockDialog ym={ym} onDone={() => { setUnlockOpen(false); reload(); }} onCancel={() => setUnlockOpen(false)} />
        </Sheet>
      )}
    </div>
  );
}

function LockDialog({
  ym,
  inputs,
  monthClose,
  onDone,
  onCancel,
}: {
  ym: string;
  inputs: NonNullable<ReturnType<typeof useReportInputs>["inputs"]>;
  monthClose?: { mpSource: MpSource; rawMaterial?: number; note?: string };
  onDone: () => void;
  onCancel: () => void;
}) {
  const mp = useMemo(() => rawMaterialOfMonth(ym, { ...inputs, monthClose }), [ym, inputs, monthClose]);
  const [source, setSource] = useState<MpSource>(monthClose?.mpSource ?? "calcule");
  const [saisi, setSaisi] = useState(monthClose?.rawMaterial !== undefined ? String(monthClose.rawMaterial) : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const rawMaterial = parseFloat(saisi.replace(",", "."));
    if (source === "saisi" && !Number.isFinite(rawMaterial)) { setError("Montant requis pour la source saisie."); return; }
    setBusy(true);
    setError(null);
    try {
      await api.ledger.lock({
        ym,
        mpSource: source,
        ...(source === "saisi" ? { rawMaterial: Math.round(rawMaterial * 100) / 100 } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onDone();
    } catch (e) {
      setError(ledgerErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const options: { key: MpSource; label: string; value: number | undefined }[] = [
    { key: "calcule", label: "Calculé (événements terminés)", value: mp.calcule },
    { key: "achats", label: "Achats (lignes MP du mois)", value: mp.achats },
    { key: "saisi", label: "Saisi", value: mp.saisi },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-serif text-h2">Verrouiller {monthLabel(ym)}</h2>
      <p className="text-base text-muted-foreground">Coût matières premières retenu pour le mois. Les montants, dates, numéros et types deviennent en lecture seule.</p>
      <div className="flex flex-col gap-1">
        {options.map((o) => (
          <label key={o.key} className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 ${source === o.key ? "border-primary bg-primary-soft" : "border-border"}`}>
            <span className="flex items-center gap-3 text-base">
              <input type="radio" name="mp-source" className="h-5 w-5" checked={source === o.key} onChange={() => setSource(o.key)} />
              {o.label}
            </span>
            <span className="tabular-nums">{o.value !== undefined ? fmtEur(o.value) : "–"}</span>
          </label>
        ))}
      </div>
      {mp.nonTermines ? <p className="text-sm text-muted-foreground">{mp.nonTermines} événement{mp.nonTermines > 1 ? "s" : ""} non terminé{mp.nonTermines > 1 ? "s" : ""} ce mois.</p> : null}
      {source === "saisi" && (
        <div>
          <label htmlFor="lock-saisi" className="mb-1 block text-base font-medium">Montant saisi (HTVA)</label>
          <input id="lock-saisi" inputMode="decimal" className="input-field text-right tabular-nums" value={saisi} onChange={(e) => setSaisi(e.target.value)} />
        </div>
      )}
      <div>
        <label htmlFor="lock-note" className="mb-1 block text-base font-medium">Note</label>
        <textarea id="lock-note" className="input-field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <p className="text-sm text-muted-foreground">Source actuelle : {MP_SOURCE_LABEL[mp.source]}.</p>
      {error && <p className="rounded-lg bg-destructive-soft px-3 py-2 text-base text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-base font-medium text-primary-foreground disabled:opacity-50" onClick={() => void submit()}>
          <Lock className="h-4 w-4" /> Verrouiller
        </button>
        <button type="button" className="min-h-11 rounded-lg px-4 text-base text-muted-foreground hover:bg-hover" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}

function UnlockDialog({ ym, onDone, onCancel }: { ym: string; onDone: () => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!reason.trim()) { setError("Indiquez la raison du déverrouillage."); return; }
    setBusy(true);
    setError(null);
    try {
      await api.ledger.unlock({ ym, reason: reason.trim() });
      onDone();
    } catch (e) {
      setError(ledgerErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-serif text-h2">Déverrouiller {monthLabel(ym)}</h2>
      <div>
        <label htmlFor="unlock-reason" className="mb-1 block text-base font-medium">Raison</label>
        <textarea id="unlock-reason" className="input-field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </div>
      {error && <p className="rounded-lg bg-destructive-soft px-3 py-2 text-base text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-base font-medium text-primary-foreground disabled:opacity-50" onClick={() => void submit()}>
          <LockOpen className="h-4 w-4" /> Déverrouiller
        </button>
        <button type="button" className="min-h-11 rounded-lg px-4 text-base text-muted-foreground hover:bg-hover" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}
