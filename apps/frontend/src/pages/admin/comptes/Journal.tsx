import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronDown, Download, FileText, Inbox, Lock, LockOpen, MoreHorizontal, Paperclip, Plus, Upload } from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import type {
  AppSettings,
  CreateLedgerEntryRequest,
  ImportLedgerRow,
  LedgerBook,
  LedgerEntry,
  MpSource,
  OdooField,
  PatchLedgerEntryRequest,
  PaymentMethod,
} from "@packages/types";
import {
  DEFAULT_PRESTATION_TYPES,
  ODOO_HEADERS,
  ODOO_REQUIRED_FIELDS,
  clientLabel,
  detectOdooColumns,
  fmtEur,
  isCommissionEntry,
  lastDayOfMonth,
  mapOdooRow,
  odooHeaderKey,
  prefillForClientMonth,
  rawMaterialOfMonth,
  sumMoney,
} from "@packages/types";
import { api, type ImportLedgerResponse } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { plural } from "@/lib/use-planning-data";
import { useReportInputs } from "@/lib/use-report-inputs";
import { useToast } from "@/hooks/use-toast";
import { useTouchScreen } from "@/hooks/use-touch-screen";
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
  type JournalFilter,
} from "@/lib/accounting";
import { downloadMonthCsv, exportLedgerXlsx } from "@/lib/ledger-export";
import {
  Button,
  Callout,
  Checkbox,
  DateNav,
  Dialog,
  EmptyState,
  FieldLabel,
  FilterChip,
  IconButton,
  ListRow,
  MENU_ITEM,
  MENU_ITEM_TOUCH,
  Menu,
  MenuItem,
  MenuRadio,
  MenuSection,
  MenuSeparator,
  SectionToggle,
  SelectPill,
  Table,
  Tag,
  Toolbar,
  ViewTabs,
  useMenu,
  useMenuContext,
  type TableColumn,
} from "@/components/ui";
import LedgerEntryForm, { openLedgerAttachment } from "@/components/comptes/LedgerEntryForm";

const NOT_CONFIGURED = "Comptabilité non configurée : la table ta-ledger n'existe pas encore";
const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[];

function money(n: number): string {
  return n === 0 ? "" : fmtEur(n);
}

function shiftYm(ym: string, delta: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1 + delta;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Where the line came from; hand entries show nothing. Older CSV imports carry only `imported`.
function SourceTag({ entry }: { entry: LedgerEntry }) {
  const label = entry.source === "depot" ? "dépôt" : entry.source === "import_csv" || entry.imported ? "import" : null;
  return label ? <Tag colour="gray" className="ml-2">{label}</Tag> : null;
}

// Paperclip of a line with an attached invoice; stops the row click.
function PieceButton({ entry }: { entry: LedgerEntry }) {
  const touch = useTouchScreen();
  const { toast } = useToast();
  if (!entry.attachment) return null;
  const open = () => {
    void openLedgerAttachment(entry.entryId, touch).then((ok) => { if (!ok) toast({ title: "Impossible d'ouvrir la pièce jointe", variant: "destructive" }); });
  };
  return (
    <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
      <IconButton size="sm" aria-label="Pièce" title={`Pièce : ${entry.attachment.name}`} icon={<Paperclip />} onClick={open} />
    </span>
  );
}

// Last column of both books; kept out of the first cells so the table's phone fallback never nests it in a row button.
const PIECE_COLUMN: TableColumn<LedgerEntry> = { key: "piece", label: "", width: "2.5rem", render: (e) => <PieceButton entry={e} /> };

function PaidTag({ paid }: { paid: boolean }) {
  return <Tag colour={paid ? "green" : "red"}>{paid ? "Réglée" : "Non réglée"}</Tag>;
}

// Body of the "Réglé" menu: two choices, the payment fields once "Réglée" is picked.
function PaidMenuBody({ entry, onSaved, onClose }: { entry: LedgerEntry; onSaved: () => void; onClose: () => void }) {
  const { touch } = useMenuContext();
  const [paid, setPaid] = useState(entry.paid);
  const [method, setMethod] = useState<string>(entry.paymentMethod ?? "");
  const [paidAt, setPaidAt] = useState(entry.paidAt ?? (entry.paid ? "" : todayIso()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: boolean) => {
    setBusy(true);
    setError(null);
    const body: PatchLedgerEntryRequest = { paid: next };
    if (next && method) body.paymentMethod = method as PaymentMethod;
    if (next && paidAt) body.paidAt = paidAt;
    if (!next) { body.paidAt = null; body.paymentMethod = null; }
    try {
      await api.ledger.patch(entry.entryId, body);
      onClose();
      onSaved();
    } catch (e) {
      setError(ledgerErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const item = `${MENU_ITEM} ${touch ? MENU_ITEM_TOUCH : ""}`;
  return (
    <div className="w-[260px] max-w-full touch:w-full">
      <button type="button" role="menuitemradio" aria-checked={!paid} className={item} onClick={() => { if (entry.paid) void save(false); else { setPaid(false); onClose(); } }}>
        <span className="flex-1"><PaidTag paid={false} /></span>
      </button>
      <button type="button" role="menuitemradio" aria-checked={paid} className={item} onClick={() => setPaid(true)}>
        <span className="flex-1"><PaidTag paid /></span>
      </button>
      {paid && (
        <div className={`flex flex-col gap-2 pt-2 ${touch ? "px-4" : "px-3"}`}>
          <div>
            <FieldLabel htmlFor={`paid-method-${entry.entryId}`}>Mode</FieldLabel>
            <select id={`paid-method-${entry.entryId}`} className="input-field" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">Non précisé</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor={`paid-at-${entry.entryId}`}>Encaissé le</FieldLabel>
            <input id={`paid-at-${entry.entryId}`} type="date" className="input-field" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pb-1">
            <Button variant="subtle" size="sm" onClick={onClose}>Annuler</Button>
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void save(true)}>Enregistrer</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// "Réglé" pill shared with the event page and À facturer; opens a Menu (a Sheet on touch) with the payment fields.
export function PaidPopover({ entry, onSaved, trigger, align = "left", className = "" }: { entry: LedgerEntry; onSaved: () => void; trigger?: ReactNode; align?: "left" | "right"; className?: string }) {
  const menu = useMenu();
  return (
    <div ref={menu.ref} className={`relative inline-flex ${className}`} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="group -mx-1 inline-flex h-7 items-center gap-1 rounded px-1 hover:bg-hover touch:h-11"
        onClick={menu.toggle}
        aria-expanded={menu.open}
        aria-haspopup="menu"
        aria-label="Réglé"
      >
        {trigger ?? <PaidTag paid={entry.paid} />}
        {!trigger && <ChevronDown className="h-3 w-3 text-icon reveal" aria-hidden="true" />}
      </button>
      <Menu {...menu.props} align={align} title="Réglé" aria-label="Réglé">
        {menu.open && <PaidMenuBody entry={entry} onSaved={onSaved} onClose={menu.close} />}
      </Menu>
    </div>
  );
}

function StatRowLine({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex h-8 items-center justify-between gap-3 border-b border-border text-sm last:border-b-0 touch:h-11">
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

interface QueuedForm {
  initial: Partial<CreateLedgerEntryRequest>;
  title: string;
}

interface FormOpen {
  entry?: LedgerEntry;
  initial?: Partial<CreateLedgerEntryRequest>;
  above?: ReactNode;
  kind?: "facture" | "acompte" | "ca_mensuel";
  title?: string;
  // Forms still to open after this one is saved: one invoice per VAT rate of the billed lines.
  queue?: QueuedForm[];
}

// « Facture 2 / 2 · service, livraison, autres (21 %) » for each extra entry of a prefill.
function queueOf(extraEntries: Partial<CreateLedgerEntryRequest>[]): QueuedForm[] {
  const total = extraEntries.length + 1;
  return extraEntries.map((initial, i) => ({ initial, title: `Facture ${i + 2} / ${total} · service, livraison, autres (${initial.vatRate ?? 0} %)` }));
}

export default function Journal() {
  const [params, setParams] = useSearchParams();
  const touch = useTouchScreen();
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
  const { inputs, entries, events, settings, clients, invoicing, loading, notConfigured, error, reload } = data;
  // Invoices issued in another tool (Odoo): the month's revenue is typed or imported.
  const externe = invoicing === "externe";
  const { toast } = useToast();

  const [form, setForm] = useState<FormOpen | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [askLock, setAskLock] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const more = useMenu();

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
  const doubleCount = useMemo(() => monthSales.some((e) => e.kind === "facture") && monthSales.some((e) => e.kind === "ca_mensuel"), [monthSales]);
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
      queue: queueOf(p.extraEntries),
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

  // « Voir » from the Dépôt tab: open that line once the year has loaded.
  const entryParam = params.get("entry");
  useEffect(() => {
    if (!entryParam || loading) return;
    const found = entries.find((e) => e.entryId === entryParam);
    if (found) setForm({ entry: found });
    else setNotice("Ligne introuvable");
    setParam({ entry: null, ...(found ? { book: found.book === "achats" ? "achats" : null, ym: found.date.slice(0, 7) } : {}) });
  }, [entryParam, loading]);

  const openNew = () =>
    setForm({ initial: book === "ventes" ? { book: "ventes", kind: "facture", date: ym === today.slice(0, 7) ? today : `${ym}-01` } : { book: "achats", kind: "mp", date: ym === today.slice(0, 7) ? today : `${ym}-01` } });

  // One CA line per month and VAT rate, dated the last day of the month, at the first prestation type's rate.
  const openMonthly = () => {
    const vatRate = (settings?.prestationTypes ?? DEFAULT_PRESTATION_TYPES)[0]?.defaultVatRate ?? 0;
    setForm({ kind: "ca_mensuel", initial: { book: "ventes", kind: "ca_mensuel", date: lastDayOfMonth(ym), vatRate } });
  };

  const onImported = (result: ImportLedgerResponse) => {
    setImportOpen(false);
    const parts = [
      result.created === 1 ? "1 facture importée" : `${result.created} factures importées`,
      result.updated === 1 ? "1 mise à jour" : `${result.updated} mises à jour`,
    ];
    if (result.skippedLocked > 0) parts.push(result.skippedLocked === 1 ? "1 mois verrouillé" : `${result.skippedLocked} mois verrouillés`);
    toast({ title: parts.join(" · ") });
    if (result.invalid.length > 0) setNotice(`Lignes invalides : ${result.invalid.join(" ; ")}`);
    reload();
  };

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
    return <Callout emoji="💶">{NOT_CONFIGURED}</Callout>;
  }

  const typeOf = (e: LedgerEntry) => prestationLabel(settings, e.prestationType);
  const filterOptions = chips.map((c) => ({ value: c.key, label: c.label }));
  const filterLabel = chips.find((c) => c.key === filter)?.label ?? "Tous";

  const toolbar = (
    <Toolbar
      left={
        <ViewTabs
          aria-label="Livre"
          value={book}
          items={[{ key: "ventes", label: "Ventes" }, { key: "achats", label: "Achats" }]}
          onChange={(b) => setParam({ book: b, filtre: null, kind: null, type: null })}
        />
      }
      center={
        <DateNav
          label={monthLabel(ym)}
          value={ym}
          pickerType="month"
          onPrev={() => setParam({ ym: shiftYm(ym, -1) })}
          onNext={() => setParam({ ym: shiftYm(ym, 1) })}
          onPick={(v) => setParam({ ym: v })}
          isToday={ym === today.slice(0, 7)}
          onToday={() => setParam({ ym: today.slice(0, 7) })}
          todayLabel="Ce mois"
        />
      }
      right={
        <>
          <span className="ml-1 inline-flex items-center gap-1 touch:hidden">
            <span className="text-sm text-muted-foreground">Filtrer :</span>
            <SelectPill
              value={filter}
              options={filterOptions}
              colour="gray"
              align="right"
              aria-label="Filtrer"
              onChange={(k) => setParam({ filtre: k === "tous" ? null : k, kind: null })}
            />
          </span>
          <div ref={more.ref} className="relative inline-flex">
            <IconButton size="sm" aria-label="Plus d'actions" aria-haspopup="menu" aria-expanded={more.open} onClick={more.toggle} icon={<MoreHorizontal />} />
            <Menu {...more.props} align="right" title="Actions" aria-label="Plus d'actions">
              {touch && (
                <>
                  <MenuSection label="Filtrer">
                    {chips.map((c) => (
                      <MenuRadio key={c.key} checked={filter === c.key} onSelect={() => setParam({ filtre: c.key === "tous" ? null : c.key, kind: null })}>{c.label}</MenuRadio>
                    ))}
                  </MenuSection>
                  <MenuSeparator />
                </>
              )}
              {externe && (
                <>
                  <MenuItem icon={<CalendarDays />} onSelect={openMonthly}>Saisir le CA du mois…</MenuItem>
                  <MenuItem icon={<Upload />} disabled={!settings} onSelect={() => setImportOpen(true)}>Importer des factures (CSV)…</MenuItem>
                </>
              )}
              <MenuItem icon={<Inbox />} to="/comptes/depot">Déposer des factures…</MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Download />} disabled={!inputs} onSelect={onExport}>Exporter {year} (xlsx)</MenuItem>
              <MenuItem icon={<FileText />} disabled={!settings} onSelect={() => settings && downloadMonthCsv(ym, entries, settings)}>CSV du mois</MenuItem>
              <MenuSeparator />
              {locked ? (
                <MenuItem icon={<LockOpen />} onSelect={() => setUnlockOpen(true)}>Déverrouiller</MenuItem>
              ) : (
                <MenuItem icon={<Lock />} danger disabled={!inputs} onSelect={() => setLockOpen(true)}>Verrouiller le mois</MenuItem>
              )}
            </Menu>
          </div>
          <Button variant="primary" size="sm" icon={<Plus />} onClick={openNew}>Nouvelle ligne</Button>
        </>
      }
      filters={
        typeParam !== null || (touch && filter !== "tous") ? (
          <>
            {typeParam !== null && (
              <FilterChip onRemove={() => setParam({ type: null })}>Type : {typeParam ? prestationLabel(settings, typeParam) : "Sans type"}</FilterChip>
            )}
            {touch && filter !== "tous" && (
              <FilterChip onRemove={() => setParam({ filtre: null, kind: null })}>{filterLabel}</FilterChip>
            )}
          </>
        ) : undefined
      }
    />
  );

  const statLine = (
    <p className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-muted-foreground tabular-nums">
      <span>Ce mois ·</span>
      <span>Acomptes <span className="text-foreground">{fmtEur(sumMoney(acomptes.map((e) => e.totalTvac)))}</span></span>
      <span aria-hidden="true">·</span>
      <span>Commissions <span className="text-foreground">{fmtEur(sumMoney(commissions.map((e) => e.htva)))}</span> (hors CA)</span>
      <span aria-hidden="true">·</span>
      <span>À encaisser <span className="text-foreground">{fmtEur(encaisser.total)}</span></span>
      <span aria-hidden="true">·</span>
      <span>{plural(encaisser.count, "facture non réglée", "factures non réglées")}</span>
      {locked && monthClose?.lockedAt && <Tag colour="yellow" className="ml-1">Verrouillé le {fmtDateFr(monthClose.lockedAt.slice(0, 10))}</Tag>}
      {monthClose && !locked && monthClose.unlockedAt && <Tag colour="gray" className="ml-1">Déverrouillé le {fmtDateFr(monthClose.unlockedAt.slice(0, 10))}</Tag>}
    </p>
  );

  const salesColumns: TableColumn<LedgerEntry>[] = [
    { key: "number", label: "N°", width: "6rem", render: (e) => e.number ?? "" },
    { key: "date", label: "Date", width: "7rem", render: (e) => fmtDateFr(e.date) },
    { key: "label", label: "Intitulé", render: (e) => <>{e.label}{e.kind !== "facture" && <span className="ml-2 text-muted-foreground">{kindLabel(e)}</span>}<SourceTag entry={e} /></> },
    { key: "type", label: "Type", render: (e) => (typeOf(e) ? <Tag colour="gray">{typeOf(e)}</Tag> : "") },
    { key: "tvac", label: "Total TVAC", align: "right", render: (e) => fmtEur(e.totalTvac) },
    { key: "htva", label: "HTVA", align: "right", render: (e) => fmtEur(e.htva) },
    { key: "vat", label: "TVA %", align: "right", width: "5rem", render: (e) => `${e.vatRate} %` },
    { key: "paid", label: "Réglé", width: "8rem", render: (e) => <PaidPopover entry={e} onSaved={reload} align="right" /> },
    PIECE_COLUMN,
  ];

  const purchaseColumns: TableColumn<LedgerEntry>[] = [
    { key: "date", label: "Date", width: "7rem", render: (e) => fmtDateFr(e.date) },
    { key: "label", label: "Intitulé", render: (e) => <>{e.label}<SourceTag entry={e} /></> },
    { key: "type", label: "Type", render: (e) => <Tag colour="gray">{kindLabel(e)}</Tag> },
    { key: "who", label: "Fournisseur ou Personne", render: (e) => e.personName ?? e.supplier ?? "" },
    { key: "hours", label: "Heures", align: "right", render: (e) => (e.kind === "personnel" && entryHours(e) ? String(entryHours(e)) : "") },
    { key: "rate", label: "Taux", align: "right", render: (e) => (e.hourlyRate !== undefined ? fmtEur(e.hourlyRate) : "") },
    { key: "htva", label: "HTVA", align: "right", render: (e) => fmtEur(e.htva) },
    { key: "vat", label: "TVA", align: "right", render: (e) => fmtEur(e.vatAmount) },
    { key: "tvac", label: "TVAC", align: "right", render: (e) => fmtEur(e.totalTvac) },
    { key: "number", label: "Réf.", render: (e) => e.number ?? "" },
    { key: "paid", label: "Réglé", width: "8rem", render: (e) => <PaidPopover entry={e} onSaved={reload} align="right" /> },
    PIECE_COLUMN,
  ];

  const emptyText = book === "ventes"
    ? externe ? "Aucune vente ce mois. Saisissez le CA du mois ou importez les factures." : `Aucune ligne pour ${monthLabel(ym)}.`
    : `Aucun achat pour ${monthLabel(ym)}.`;
  const emptyAction = book === "ventes" && externe ? { label: "Saisir le CA du mois", onClick: openMonthly } : { label: "+ Nouvelle ligne", onClick: openNew };

  const table = (
    <Table
      columns={book === "ventes" ? salesColumns : purchaseColumns}
      rows={shown}
      rowKey={(e) => e.entryId}
      onRowClick={(e) => setForm({ entry: e })}
      empty={<EmptyState message={emptyText} action={emptyAction} />}
      footer={
        book === "ventes"
          ? { label: "Total", tvac: fmtEur(sales.tvac), htva: fmtEur(sales.htva) }
          : { label: "Total", hours: purchases.hours ? String(purchases.hours) : "", htva: fmtEur(purchases.htva), vat: fmtEur(purchases.vat), tvac: fmtEur(purchases.tvac) }
      }
    />
  );

  const phoneList = (
    <div>
      <div className="divide-y divide-border">
        {shown.map((e) => (
          <div key={e.entryId} className="flex items-center gap-1">
            <ListRow
              className="min-w-0 flex-1"
              title={<>{e.label}<SourceTag entry={e} /></>}
              subtitle={[e.number ? `N° ${e.number}` : "", fmtDateFr(e.date), book === "ventes" ? typeOf(e) : kindLabel(e)].filter(Boolean).join(" · ")}
              trailing={<><span className="text-foreground">{fmtEur(e.totalTvac)}</span><PaidTag paid={e.paid} /></>}
              onClick={() => setForm({ entry: e })}
            />
            <PieceButton entry={e} />
          </div>
        ))}
      </div>
      {shown.length === 0 && <EmptyState message={emptyText} action={emptyAction} />}
      <div className="sticky bottom-0 -mx-4 mt-2 border-t border-divider bg-background px-4 py-2 text-sm tabular-nums">
        {book === "ventes" ? (
          <>
            <div className="flex justify-between"><span className="text-muted-foreground">Σ TVAC</span><span className="font-semibold">{fmtEur(sales.tvac)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Σ HTVA</span><span className="font-semibold">{fmtEur(sales.htva)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total CA {mmYyyy(ym)}</span><span className="font-semibold">{fmtEur(sales.totalCa)}</span></div>
          </>
        ) : (
          <>
            <div className="flex justify-between"><span className="text-muted-foreground">Σ HTVA</span><span className="font-semibold">{fmtEur(purchases.htva)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Σ TVAC</span><span className="font-semibold">{fmtEur(purchases.tvac)}</span></div>
          </>
        )}
      </div>
    </div>
  );

  const salesDetail = (
    <SectionToggle title={`Détail du CA par type · ${fmtEur(sales.totalCa)}`} storageKey="journal-ca-type">
      <div>
        <StatRowLine label={`Total CA ${mmYyyy(ym)}`} value={<span className="font-medium">{fmtEur(sales.totalCa)}</span>} />
        {sales.byType.filter((t) => t.amount !== 0).map((t) => (
          <StatRowLine key={t.label} label={t.label} value={money(t.amount)} />
        ))}
        <StatRowLine label="Commissions (hors CA)" value={money(sales.commissions)} />
        {sales.vat6 !== 0 && <StatRowLine label="TVA 6 %" value={money(sales.vat6)} />}
        {sales.vat12 !== 0 && <StatRowLine label="TVA 12 %" value={money(sales.vat12)} />}
        {sales.vat21 !== 0 && <StatRowLine label="TVA 21 %" value={money(sales.vat21)} />}
      </div>
    </SectionToggle>
  );

  const personBlock = book === "achats" && persons.length > 0 && (
    <SectionToggle title="Résumé par personne" storageKey="journal-persons" defaultOpen>
      <div>
        {persons.map((p) => (
          <StatRowLine
            key={p.personName}
            label={`${p.personName} · ${p.dates.map(fmtDateFr).join(", ") || "Aucune date"}`}
            value={<>{p.hours} h{p.hourlyRate !== undefined ? ` × ${fmtEur(p.hourlyRate)}` : ""} = <span className="font-medium">{fmtEur(p.amount)}</span></>}
          />
        ))}
      </div>
    </SectionToggle>
  );

  return (
    <div>
      {toolbar}

      {error && <div className="mt-3"><Callout tone="danger">{error}</Callout></div>}
      {notice && (
        <div className="mt-3">
          <Callout>
            <div className="flex items-center justify-between gap-3">
              <span>{notice}</span>
              <Button variant="subtle" size="sm" onClick={() => setNotice(null)}>Fermer</Button>
            </div>
          </Callout>
        </div>
      )}
      {askLock && (
        <div className="mt-3">
          <Callout emoji="📦">
            <div className="flex flex-wrap items-center gap-3">
              <span>Export téléchargé. Verrouiller {monthLabel(ym)} ?</span>
              <Button variant="default" size="sm" onClick={() => { setAskLock(false); setLockOpen(true); }}>Oui</Button>
              <Button variant="subtle" size="sm" onClick={() => setAskLock(false)}>Plus tard</Button>
            </div>
          </Callout>
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <>
          {statLine}
          {book === "ventes" && doubleCount && (
            <div className="mt-3">
              <Callout tone="warning">Ce mois contient des factures et un CA mensuel : le chiffre d'affaires est compté deux fois.</Callout>
            </div>
          )}
          <div className="mt-3 hidden md:block">{table}</div>
          <div className="mt-3 md:hidden">{phoneList}</div>
          {book === "ventes" && salesDetail}
          {personBlock}
        </>
      )}

      {form && (
        <LedgerEntryForm
          key={`${form.entry?.entryId ?? "new"}-${form.queue?.length ?? 0}`}
          layout="dialog"
          entry={form.entry}
          initial={form.initial}
          kind={form.kind}
          title={form.title}
          allowMonthly={externe}
          locked={form.entry ? locked || form.entry.locked : locked}
          eventOptions={eventOptions}
          clientOptions={clientOptions}
          prestationTypes={settings?.prestationTypes}
          refOptions={refOptions}
          above={form.above}
          onSaved={(_saved, next) => {
            reload();
            if (next?.keepOpen) return;
            const [head, ...rest] = form.queue ?? [];
            setForm(head ? { kind: "facture", initial: head.initial, title: head.title, queue: rest } : null);
          }}
          onCancel={() => setForm(null)}
          onDeleted={() => { reload(); setForm(null); }}
        />
      )}

      {importOpen && settings && (
        <ImportInvoicesDialog entries={entries} settings={settings} onImported={onImported} onCancel={() => setImportOpen(false)} />
      )}

      {lockOpen && inputs && (
        <LockDialog ym={ym} inputs={inputs} monthClose={monthClose} onDone={() => { setLockOpen(false); reload(); }} onCancel={() => setLockOpen(false)} />
      )}
      {unlockOpen && (
        <UnlockDialog ym={ym} onDone={() => { setUnlockOpen(false); reload(); }} onCancel={() => setUnlockOpen(false)} />
      )}
    </div>
  );
}

const OPTION_ROW = "mx-0 flex h-8 w-full items-center gap-2 rounded px-2 text-sm hover:bg-hover touch:h-11 touch:text-base";

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
    <Dialog
      open
      onClose={onCancel}
      title={`Verrouiller ${monthLabel(ym)}`}
      size="md"
      footer={
        <>
          <Button variant="default" size="md" onClick={onCancel}>Annuler</Button>
          <Button variant="primary" size="md" icon={<Lock />} disabled={busy} onClick={() => void submit()}>Verrouiller</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">Coût matières premières retenu pour le mois. Les montants, dates, numéros et types deviennent en lecture seule.</p>
        <div className="-mx-2 flex flex-col">
          {options.map((o) => (
            <Checkbox
              key={o.key}
              shape="circle"
              checked={source === o.key}
              onChange={() => setSource(o.key)}
              label={`${o.label} · ${o.value !== undefined ? fmtEur(o.value) : "–"}`}
              className={OPTION_ROW}
            />
          ))}
        </div>
        {mp.nonTermines ? <p className="text-sm text-muted-foreground">{mp.nonTermines} événement{mp.nonTermines > 1 ? "s" : ""} non terminé{mp.nonTermines > 1 ? "s" : ""} ce mois.</p> : null}
        {source === "saisi" && (
          <div>
            <FieldLabel htmlFor="lock-saisi">Montant saisi (HTVA)</FieldLabel>
            <input id="lock-saisi" inputMode="decimal" className="input-field text-right tabular-nums" value={saisi} onChange={(e) => setSaisi(e.target.value)} />
          </div>
        )}
        <div>
          <FieldLabel htmlFor="lock-note">Note</FieldLabel>
          <textarea id="lock-note" className="input-field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <p className="text-sm text-muted-foreground">Source actuelle : {MP_SOURCE_LABEL[mp.source]}.</p>
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Dialog>
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
    <Dialog
      open
      onClose={onCancel}
      title={`Déverrouiller ${monthLabel(ym)}`}
      size="md"
      footer={
        <>
          <Button variant="default" size="md" onClick={onCancel}>Annuler</Button>
          <Button variant="primary" size="md" icon={<LockOpen />} disabled={busy} onClick={() => void submit()}>Déverrouiller</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <FieldLabel htmlFor="unlock-reason">Raison</FieldLabel>
          <textarea id="unlock-reason" className="input-field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </div>
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Dialog>
  );
}

const ODOO_FIELD_LABEL: Record<OdooField, string> = {
  number: "Numéro",
  date: "Date",
  partner: "Partenaire",
  untaxed: "Montant HT",
  tax: "Taxes",
  total: "Total",
  status: "État du paiement",
  paidAt: "Date de paiement",
};

type PreviewStatus = "new" | "update" | "locked" | "ignored";

interface PreviewRow {
  id: number;
  status: PreviewStatus;
  number: string;
  row?: ImportLedgerRow;
  reason?: string;
}

const PREVIEW_TAG: Record<PreviewStatus, { label: string; colour: "green" | "blue" | "gray" | "red" }> = {
  new: { label: "Nouvelle", colour: "green" },
  update: { label: "Mise à jour", colour: "blue" },
  locked: { label: "Mois verrouillé", colour: "gray" },
  ignored: { label: "Ignorée", colour: "red" },
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Spreadsheet cells as text; dates keep their local calendar day.
function cellText(v: unknown): string {
  if (v instanceof Date) return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  if (v === null || v === undefined) return "";
  return String(v);
}

function countLabel(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

// Two steps like the ingredient import: the file, then the preview with one tag per row.
function ImportInvoicesDialog({
  entries,
  settings,
  onImported,
  onCancel,
}: {
  entries: LedgerEntry[];
  settings: AppSettings;
  onImported: (result: ImportLedgerResponse) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const importedNumbers = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) if (e.book === "ventes" && e.imported && e.number) set.add(e.number);
    return set;
  }, [entries]);

  const processRows = (headers: string[], data: Record<string, string>[]) => {
    const columns = detectOdooColumns(headers);
    if (!columns) {
      const missing = ODOO_REQUIRED_FIELDS.find((f) => !headers.some((h) => ODOO_HEADERS[f].includes(odooHeaderKey(h))));
      setProblem(`Colonne manquante : ${ODOO_FIELD_LABEL[missing ?? "number"]}. Colonnes lues : ${headers.filter(Boolean).join(", ") || "aucune"}.`);
      return;
    }
    const preview: PreviewRow[] = data.map((raw, i) => {
      const mapped = mapOdooRow(raw, columns);
      const rawNumber = columns.number ? String(raw[columns.number] ?? "").trim() : "";
      if (!mapped.ok) return { id: i, status: "ignored", number: rawNumber || `ligne ${i + 1}`, reason: mapped.reason };
      const row = mapped.row;
      const locked = Boolean(settings.monthCloses?.[row.date.slice(0, 7)]?.lockedAt);
      const status: PreviewStatus = locked ? "locked" : importedNumbers.has(row.number) ? "update" : "new";
      return { id: i, status, number: row.number, row };
    });
    setRows(preview);
    setStep("preview");
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setFileName(file.name);
    if (/\.xlsx?$/i.test(file.name)) {
      file.arrayBuffer().then((buf) => {
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) { setProblem("Le classeur ne contient aucune feuille."); return; }
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });
        const headers = json.length ? Object.keys(json[0]) : [];
        const data = json.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cellText(v)])));
        processRows(headers, data);
      }).catch(() => setProblem("Fichier illisible."));
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => processRows(results.meta.fields ?? [], results.data),
      error: () => setProblem("Fichier illisible."),
    });
  };

  const counts = {
    new: rows.filter((r) => r.status === "new").length,
    update: rows.filter((r) => r.status === "update").length,
    locked: rows.filter((r) => r.status === "locked").length,
    ignored: rows.filter((r) => r.status === "ignored").length,
  };
  const toImport = counts.new + counts.update;
  const summary = [
    countLabel(counts.new, "nouvelle", "nouvelles"),
    countLabel(counts.update, "mise à jour", "mises à jour"),
    countLabel(counts.ignored, "ignorée", "ignorées"),
  ];
  if (counts.locked > 0) summary.push(countLabel(counts.locked, "mois verrouillé", "mois verrouillés"));

  const submit = async () => {
    const payload = rows.filter((r): r is PreviewRow & { row: ImportLedgerRow } => r.row !== undefined).map((r) => r.row);
    if (payload.length === 0) return;
    setImporting(true);
    setProblem(null);
    try {
      onImported(await api.ledger.import(payload));
    } catch (e) {
      setProblem(ledgerErrorMessage(e));
    } finally {
      setImporting(false);
    }
  };

  const columns: TableColumn<PreviewRow>[] = [
    {
      key: "number",
      label: "Numéro",
      render: (r) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Tag colour={PREVIEW_TAG[r.status].colour} title={r.reason}>{PREVIEW_TAG[r.status].label}</Tag>
          <span className="font-medium">{r.number}</span>
        </span>
      ),
    },
    { key: "date", label: "Date", width: "6.5rem", render: (r) => (r.row ? fmtDateFr(r.row.date) : "") },
    { key: "label", label: "Client", render: (r) => r.row?.label ?? <span className="text-muted-foreground">{r.reason}</span> },
    { key: "htva", label: "HTVA", align: "right", render: (r) => (r.row ? fmtEur(r.row.htva) : "") },
    { key: "vat", label: "TVA", align: "right", render: (r) => (r.row ? fmtEur(r.row.vatAmount) : "") },
    { key: "tvac", label: "TVAC", align: "right", trailing: true, render: (r) => (r.row ? <span>{fmtEur(r.row.totalTvac)}</span> : "") },
    { key: "paid", label: "Payé", width: "3.5rem", trailing: true, render: (r) => (r.row ? <span>{r.row.paid ? "Oui" : "Non"}</span> : "") },
  ];

  const footer = step === "upload" ? (
    <Button variant="default" size="md" onClick={onCancel}>Annuler</Button>
  ) : (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <Button variant="default" size="md" onClick={() => { setStep("upload"); setRows([]); }}>Changer de fichier</Button>
      <span className="flex gap-2">
        <Button variant="default" size="md" onClick={onCancel} disabled={importing}>Annuler</Button>
        <Button variant="primary" size="md" disabled={importing || toImport === 0} onClick={() => void submit()}>
          {importing ? "Import en cours…" : `Importer ${countLabel(toImport, "facture", "factures")}`}
        </Button>
      </span>
    </div>
  );

  // Seven preview columns need a little more than the lg width.
  return (
    <Dialog open onClose={onCancel} title="Importer des factures (CSV)" size="lg" className="max-w-3xl" footer={footer}>
      {step === "upload" ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg bg-surface p-10 text-muted-foreground hover:bg-hover focus-visible:outline-none focus-visible:shadow-ring"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-8 w-8" aria-hidden="true" />
            <span className="text-base font-medium text-foreground">Déposez l'export Odoo (CSV ou XLSX) ou cliquez pour choisir</span>
          </button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
          <p className="text-caption text-muted-foreground">Export Facturation › Factures clients, avec les colonnes Numéro, Date, Partenaire, Montant HT, Taxes, Total, État du paiement.</p>
          {problem && <Callout tone="danger">{problem}</Callout>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-4 py-2.5">
            <span className="text-sm font-medium">{fileName}</span>
            <span className="text-sm text-muted-foreground">{summary.join(" · ")}</span>
          </div>
          <Table columns={columns} rows={rows} rowKey={(r) => String(r.id)} />
          {problem && <Callout tone="danger">{problem}</Callout>}
        </div>
      )}
    </Dialog>
  );
}
