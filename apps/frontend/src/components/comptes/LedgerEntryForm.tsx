import { useMemo, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  CreateLedgerEntryRequest,
  LedgerBook,
  LedgerEntry,
  PatchLedgerEntryRequest,
  PaymentMethod,
  PrestationTypeSetting,
  PurchaseKind,
  SalesKind,
  VatRate,
} from "@packages/types";
import { DEFAULT_PRESTATION_TYPES, VAT_RATES, fmtEur, round2, splitTvac, sumMoney } from "@packages/types";
import { api } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import {
  PAYMENT_METHOD_LABEL,
  PURCHASE_KIND_LABEL,
  SALES_KIND_LABEL,
  fmtDateFr,
  ledgerErrorMessage,
} from "@/lib/accounting";
import { FieldLabel, Tag } from "@/components/ui";

export interface LedgerEntryFormProps {
  initial?: Partial<CreateLedgerEntryRequest>;
  entry?: LedgerEntry;
  kind?: "facture" | "acompte";
  eventOptions?: { eventId: string; label: string }[];
  clientOptions?: { clientId: string; name: string }[];
  onSaved: (entry: LedgerEntry, next?: { keepOpen: boolean }) => void;
  onCancel: () => void;
  // Read-only amounts and dates; payment fields still save through PATCH.
  locked?: boolean;
  prestationTypes?: PrestationTypeSetting[];
  // Sales entries of the year a credit note can correct.
  refOptions?: { entryId: string; label: string }[];
  // Read-only block shown above the fields (Revenu prévu, events grouped by month).
  above?: ReactNode;
  // Shown when set and the entry is unlocked; the form confirms before calling it.
  onDeleted?: (entryId: string) => void;
}

const SALES_KINDS = Object.keys(SALES_KIND_LABEL) as SalesKind[];
const PURCHASE_KINDS = Object.keys(PURCHASE_KIND_LABEL) as PurchaseKind[];
const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[];

interface ShiftRow {
  date: string;
  hours: string;
}

interface FormState {
  book: LedgerBook;
  kind: string;
  date: string;
  number: string;
  label: string;
  clientId: string;
  eventIds: string[];
  prestationType: string;
  vatRate: VatRate;
  tvac: string;
  htva: string;
  tva: string;
  paid: boolean;
  paymentMethod: string;
  paidAt: string;
  km: string;
  description: string;
  personName: string;
  hourlyRate: string;
  shifts: ShiftRow[];
  supplier: string;
  refEntryId: string;
}

function num(s: string): number {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function txt(n: number | undefined): string {
  return n === undefined || n === 0 ? "" : String(Math.abs(n));
}

// Every field either request shape or the stored entry can carry, all optional.
type EntrySource = Partial<Omit<LedgerEntry, "book" | "kind">> & { book?: LedgerBook; kind?: string };

function initialState(props: LedgerEntryFormProps): FormState {
  const src: EntrySource = (props.entry ?? props.initial ?? {}) as EntrySource;
  const book: LedgerBook = src.book ?? "ventes";
  const kind = props.kind ?? src.kind ?? (book === "ventes" ? "facture" : "mp");
  const sales = src;
  const purchase = src;
  return {
    book,
    kind,
    date: src.date ?? todayIso(),
    number: src.number ?? "",
    label: src.label ?? "",
    clientId: src.clientId ?? "",
    eventIds: src.eventIds ?? [],
    prestationType: sales.prestationType ?? "",
    vatRate: src.vatRate ?? 0,
    tvac: txt(src.totalTvac),
    htva: txt(src.htva),
    tva: txt(src.vatAmount),
    paid: sales.paid ?? (kind === "acompte"),
    paymentMethod: sales.paymentMethod ?? "",
    paidAt: sales.paidAt ?? (kind === "acompte" && !props.entry ? src.date ?? todayIso() : ""),
    km: sales.km !== undefined ? String(sales.km) : "",
    description: src.description ?? "",
    personName: purchase.personName ?? "",
    hourlyRate: purchase.hourlyRate !== undefined ? String(purchase.hourlyRate) : "",
    shifts: (purchase.shifts ?? []).map((s) => ({ date: s.date, hours: String(s.hours) })),
    supplier: purchase.supplier ?? "",
    refEntryId: sales.refEntryId ?? "",
  };
}

function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export default function LedgerEntryForm(props: LedgerEntryFormProps) {
  const { entry, eventOptions = [], clientOptions = [], onSaved, onCancel, refOptions = [], above, onDeleted } = props;
  const locked = Boolean(props.locked || entry?.locked);
  const bookFixed = Boolean(props.kind || entry);
  const types = props.prestationTypes ?? DEFAULT_PRESTATION_TYPES;
  const [f, setF] = useState<FormState>(() => initialState(props));
  const [eventQuery, setEventQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedNumber, setSavedNumber] = useState<string | null>(null);
  const [createNext, setCreateNext] = useState(false);
  // After "Ajouter une ligne pour l'autre taux" the next save creates a new entry.
  const target = createNext ? undefined : entry;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));
  const isSales = f.book === "ventes";
  const isCredit = isSales && f.kind === "note_de_credit";
  const isPersonnel = !isSales && f.kind === "personnel";
  const sign = isCredit ? -1 : 1;

  const onTvac = (s: string) => {
    const { htva, vatAmount } = splitTvac(num(s), f.vatRate);
    setF((p) => ({ ...p, tvac: s, htva: txt(htva), tva: txt(vatAmount) }));
  };
  const onHtva = (s: string) => {
    const htva = num(s);
    const vat = round2((htva * f.vatRate) / 100);
    setF((p) => ({ ...p, htva: s, tva: txt(vat), tvac: txt(sumMoney([htva, vat])) }));
  };
  const onTva = (s: string) => {
    setF((p) => ({ ...p, tva: s, tvac: txt(sumMoney([num(p.htva), num(s)])) }));
  };
  const onRate = (rate: VatRate) => {
    const { htva, vatAmount } = splitTvac(num(f.tvac), rate);
    setF((p) => ({ ...p, vatRate: rate, htva: txt(htva), tva: txt(vatAmount) }));
  };
  const onKind = (kind: string) => {
    setF((p) => ({ ...p, kind, paid: kind === "acompte" ? true : p.paid }));
    if (kind === "commission") onRate(0);
  };
  const onPrestationType = (key: string) => {
    const rate = types.find((t) => t.key === key)?.defaultVatRate;
    set("prestationType", key);
    if (rate !== undefined && !f.tvac && !f.htva) set("vatRate", rate);
    else if (rate !== undefined) onRate(rate);
  };

  const identityGap = Math.abs(num(f.htva) + num(f.tva) - num(f.tvac));
  const identityOk = identityGap < 0.011;
  const suggestedHtva = useMemo(
    () => round2(f.shifts.reduce((n, s) => n + num(s.hours), 0) * num(f.hourlyRate)),
    [f.shifts, f.hourlyRate],
  );
  const filteredEvents = useMemo(() => {
    const q = eventQuery.trim().toLowerCase();
    return q ? eventOptions.filter((o) => o.label.toLowerCase().includes(q)) : eventOptions;
  }, [eventOptions, eventQuery]);

  const toggleEvent = (id: string) =>
    setF((p) => ({ ...p, eventIds: p.eventIds.includes(id) ? p.eventIds.filter((x) => x !== id) : [...p.eventIds, id] }));

  const buildBody = (): CreateLedgerEntryRequest => {
    const base = {
      date: f.date,
      label: f.label.trim(),
      number: f.number.trim() || undefined,
      description: f.description.trim() || undefined,
      eventIds: f.eventIds.length ? f.eventIds : undefined,
      clientId: f.clientId || undefined,
      totalTvac: round2(sign * num(f.tvac)),
      htva: round2(sign * num(f.htva)),
      vatRate: f.vatRate,
      vatAmount: round2(sign * num(f.tva)),
    };
    if (isSales) {
      return compact({
        ...base,
        book: "ventes" as const,
        kind: f.kind as SalesKind,
        prestationType: f.prestationType || undefined,
        refEntryId: isCredit && f.refEntryId ? f.refEntryId : undefined,
        paid: f.paid,
        paymentMethod: f.paid && f.paymentMethod ? (f.paymentMethod as PaymentMethod) : undefined,
        paidAt: f.paid && f.paidAt ? f.paidAt : undefined,
        km: f.km.trim() ? num(f.km) : undefined,
      });
    }
    return compact({
      ...base,
      book: "achats" as const,
      kind: f.kind as PurchaseKind,
      supplier: f.kind === "mp" && f.supplier.trim() ? f.supplier.trim() : undefined,
      personName: isPersonnel && f.personName.trim() ? f.personName.trim() : undefined,
      hourlyRate: isPersonnel && f.hourlyRate.trim() ? num(f.hourlyRate) : undefined,
      shifts: isPersonnel && f.shifts.length ? f.shifts.filter((s) => s.date && num(s.hours) > 0).map((s) => ({ date: s.date, hours: num(s.hours) })) : undefined,
    });
  };

  const patchBody = (): PatchLedgerEntryRequest => ({
    paid: f.paid,
    ...(f.paymentMethod ? { paymentMethod: f.paymentMethod as PaymentMethod } : {}),
    ...(f.paidAt ? { paidAt: f.paidAt } : {}),
    description: f.description.trim(),
  });

  const validate = (): string | null => {
    if (locked) return null;
    if (!f.label.trim()) return "L'intitulé est requis.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return "La date est requise.";
    if (!identityOk) return "HTVA + TVA doit égaler TVAC (écart de 0,01 toléré).";
    if (isCredit && !f.number.trim()) return "Le numéro est requis pour une note de crédit.";
    if (isSales && f.kind === "commission" && num(f.tva) !== 0) return "Une commission n'a pas de TVA.";
    if (f.paid && f.paidAt && !/^\d{4}-\d{2}-\d{2}$/.test(f.paidAt)) return "La date d'encaissement est invalide.";
    return null;
  };

  const save = async (keepOpen: boolean) => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError(null);
    try {
      let saved: LedgerEntry;
      if (locked && target) {
        saved = await api.ledger.patch(target.entryId, patchBody());
      } else {
        const body = buildBody();
        saved = target ? await api.ledger.replace(target.entryId, body) : await api.ledger.create(body);
        // Purchases carry no paid flag on create, so payment fields go through PATCH.
        if (body.book === "achats" && (f.paid || f.paymentMethod || f.paidAt)) saved = await api.ledger.patch(saved.entryId, patchBody());
      }
      onSaved(saved, { keepOpen });
      if (keepOpen) {
        const other = otherRate(f.vatRate);
        setSavedNumber(f.number);
        setF((p) => ({ ...p, vatRate: other, tvac: "", htva: "", tva: "" }));
        setCreateNext(true);
      }
    } catch (e) {
      setError(ledgerErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!target || !onDeleted) return;
    setSaving(true);
    setError(null);
    try {
      await api.ledger.delete(target.entryId);
      onDeleted(target.entryId);
    } catch (e) {
      setError(ledgerErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const ro = locked;
  const field = `input-field ${ro ? "bg-muted text-muted-foreground" : ""}`;
  const kinds = isSales ? SALES_KINDS : PURCHASE_KINDS;
  const kindLabelOf = (k: string) => (isSales ? SALES_KIND_LABEL[k as SalesKind] : PURCHASE_KIND_LABEL[k as PurchaseKind]);
  const title = target ? "Modifier la ligne" : props.kind === "acompte" ? "Enregistrer un acompte" : props.kind === "facture" ? "Créer la facture" : "Nouvelle ligne";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => { e.preventDefault(); void save(false); }}
      noValidate
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h2">{title}</h2>
        {locked && <Tag variant="warning">Mois verrouillé</Tag>}
        {savedNumber !== null && <Tag variant="success">Ligne {savedNumber || "sans numéro"} enregistrée, ajoutez l'autre taux</Tag>}
      </div>

      {above && <div className="rounded-lg bg-surface p-3 text-base">{above}</div>}

      {!bookFixed && (
        <div className="flex gap-2">
          {(["ventes", "achats"] as LedgerBook[]).map((b) => (
            <button
              key={b}
              type="button"
              disabled={ro}
              onClick={() => setF((p) => ({ ...p, book: b, kind: b === "ventes" ? "facture" : "mp" }))}
              className={`min-h-11 rounded-lg border px-4 text-base ${f.book === b ? "border-primary bg-selected font-medium" : "border-border bg-card"}`}
            >
              {b === "ventes" ? "Ventes" : "Achats"}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="le-kind">Nature</FieldLabel>
          <select id="le-kind" className={field} value={f.kind} disabled={ro || Boolean(props.kind)} onChange={(e) => onKind(e.target.value)}>
            {kinds.map((k) => (
              <option key={k} value={k}>{kindLabelOf(k)}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="le-date">Date</FieldLabel>
          <input id="le-date" type="date" className={field} value={f.date} readOnly={ro} onChange={(e) => set("date", e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="le-number">{isSales ? "N° (Falco)" : "Réf."}{isCredit ? " · requis" : ""}</FieldLabel>
          <input id="le-number" className={field} value={f.number} readOnly={ro} onChange={(e) => set("number", e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="le-label">Intitulé</FieldLabel>
          <input id="le-label" className={field} value={f.label} readOnly={ro} onChange={(e) => set("label", e.target.value)} />
        </div>
      </div>

      {isSales && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="le-client">Client</FieldLabel>
            <select id="le-client" className={field} value={f.clientId} disabled={ro} onChange={(e) => set("clientId", e.target.value)}>
              <option value="">Aucun</option>
              {clientOptions.map((c) => (
                <option key={c.clientId} value={c.clientId}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="le-type">Type de prestation</FieldLabel>
            <select id="le-type" className={field} value={f.prestationType} disabled={ro} onChange={(e) => onPrestationType(e.target.value)}>
              <option value="">Sans type</option>
              {types.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {isCredit && (
        <div>
          <FieldLabel htmlFor="le-ref">Facture corrigée</FieldLabel>
          <select id="le-ref" className={field} value={f.refEntryId} disabled={ro} onChange={(e) => set("refEntryId", e.target.value)}>
            <option value="">Aucune</option>
            {refOptions.map((o) => (
              <option key={o.entryId} value={o.entryId}>{o.label}</option>
            ))}
          </select>
          <p className="mt-1 text-sm text-muted-foreground">Montants saisis en positif, enregistrés en négatif.</p>
        </div>
      )}

      {eventOptions.length > 0 && (
        <div>
          <FieldLabel htmlFor="le-event-search">Événements{f.eventIds.length ? ` · ${f.eventIds.length} sélectionné${f.eventIds.length > 1 ? "s" : ""}` : ""}</FieldLabel>
          {!ro && (
            <input id="le-event-search" className="input-field mb-2" placeholder="Rechercher un événement" value={eventQuery} onChange={(e) => setEventQuery(e.target.value)} />
          )}
          <div className="max-h-56 overflow-auto rounded-lg border border-border">
            {(ro ? eventOptions.filter((o) => f.eventIds.includes(o.eventId)) : filteredEvents).map((o) => (
              <label key={o.eventId} className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 text-base hover:bg-hover ${ro ? "cursor-default" : ""}`}>
                <input type="checkbox" className="h-5 w-5" checked={f.eventIds.includes(o.eventId)} disabled={ro} onChange={() => toggleEvent(o.eventId)} />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
            {filteredEvents.length === 0 && !ro && <p className="px-3 py-2 text-sm text-muted-foreground">Aucun événement</p>}
            {ro && f.eventIds.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Aucun événement lié</p>}
          </div>
        </div>
      )}

      {isPersonnel && (
        <div className="rounded-lg border border-border p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="le-person">Personne</FieldLabel>
              <input id="le-person" className={field} value={f.personName} readOnly={ro} onChange={(e) => set("personName", e.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="le-rate">Taux horaire</FieldLabel>
              <input id="le-rate" inputMode="decimal" className={field} value={f.hourlyRate} readOnly={ro} onChange={(e) => set("hourlyRate", e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-base font-medium">Prestations</span>
            {!ro && (
              <button type="button" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-base text-primary hover:bg-hover" onClick={() => set("shifts", [...f.shifts, { date: f.date, hours: "" }])}>
                <Plus className="h-4 w-4" /> Ajouter une date
              </button>
            )}
          </div>
          {f.shifts.map((s, i) => (
            <div key={i} className="mt-2 flex items-center gap-2">
              <input type="date" className={field} value={s.date} readOnly={ro} onChange={(e) => set("shifts", f.shifts.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
              <input inputMode="decimal" className={`${field} w-28`} placeholder="Heures" value={s.hours} readOnly={ro} onChange={(e) => set("shifts", f.shifts.map((x, j) => (j === i ? { ...x, hours: e.target.value } : x)))} />
              {!ro && (
                <button type="button" aria-label="Retirer" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-hover" onClick={() => set("shifts", f.shifts.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {f.shifts.length > 0 && (
            <p className="mt-2 text-base text-muted-foreground">
              Σ {f.shifts.reduce((n, s) => n + num(s.hours), 0)} h × {num(f.hourlyRate)} € = <span className="font-medium text-foreground">{fmtEur(suggestedHtva)}</span>
              {!ro && suggestedHtva > 0 && num(f.htva) !== suggestedHtva && (
                <button type="button" className="ml-2 min-h-11 text-primary underline" onClick={() => onHtva(String(suggestedHtva))}>Utiliser comme HTVA</button>
              )}
            </p>
          )}
        </div>
      )}

      {!isSales && f.kind === "mp" && (
        <div>
          <FieldLabel htmlFor="le-supplier">Fournisseur</FieldLabel>
          <input id="le-supplier" className={field} value={f.supplier} readOnly={ro} onChange={(e) => set("supplier", e.target.value)} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <FieldLabel htmlFor="le-tvac">Total TVAC</FieldLabel>
          <input id="le-tvac" inputMode="decimal" className={`${field} text-right tabular-nums`} value={f.tvac} readOnly={ro} onChange={(e) => onTvac(e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="le-rate-select">Taux TVA</FieldLabel>
          <select id="le-rate-select" className={field} value={f.vatRate} disabled={ro} onChange={(e) => onRate(Number(e.target.value) as VatRate)}>
            {VAT_RATES.map((r) => (
              <option key={r} value={r}>{r} %</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="le-htva">HTVA</FieldLabel>
          <input id="le-htva" inputMode="decimal" className={`${field} text-right tabular-nums`} value={f.htva} readOnly={ro} onChange={(e) => onHtva(e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="le-tva">TVA</FieldLabel>
          <input id="le-tva" inputMode="decimal" className={`${field} text-right tabular-nums`} value={f.tva} readOnly={ro} onChange={(e) => onTva(e.target.value)} />
        </div>
      </div>
      {!identityOk && !ro && (
        <p className="text-sm text-destructive">HTVA + TVA diffère de TVAC de {fmtEur(round2(identityGap))}.</p>
      )}
      {f.kind === "acompte" && (
        <p className="text-sm text-muted-foreground">Traitement TVA des acomptes à confirmer avec le comptable.</p>
      )}

      <div className="rounded-lg border border-border p-3">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base">
          <input type="checkbox" className="h-5 w-5" checked={f.paid} onChange={(e) => set("paid", e.target.checked)} />
          Réglé
        </label>
        {f.paid && (
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="le-method">Mode</FieldLabel>
              <select id="le-method" className="input-field" value={f.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>
                <option value="">Non précisé</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="le-paidat">Encaissé le</FieldLabel>
              <input id="le-paidat" type="date" className="input-field" value={f.paidAt} onChange={(e) => set("paidAt", e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem]">
        <div>
          <FieldLabel htmlFor="le-desc">Description</FieldLabel>
          <textarea id="le-desc" className="input-field" rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        {isSales && (
          <div>
            <FieldLabel htmlFor="le-km">KM</FieldLabel>
            <input id="le-km" inputMode="decimal" className={`${field} text-right tabular-nums`} value={f.km} readOnly={ro} onChange={(e) => set("km", e.target.value)} />
          </div>
        )}
      </div>

      {target && (
        <p className="text-sm text-muted-foreground">
          Créée le {fmtDateFr(target.createdAt.slice(0, 10))}{target.updatedAt !== target.createdAt ? `, modifiée le ${fmtDateFr(target.updatedAt.slice(0, 10))}` : ""}
        </p>
      )}

      {error && <p className="rounded-lg bg-destructive-soft px-3 py-2 text-base text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-primary px-5 text-base font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        {!ro && (
          <button type="button" disabled={saving} className="min-h-11 rounded-lg border border-border px-4 text-base hover:bg-hover disabled:opacity-50" onClick={() => void save(true)}>
            Ajouter une ligne pour l'autre taux
          </button>
        )}
        <button type="button" className="min-h-11 rounded-lg px-4 text-base text-muted-foreground hover:bg-hover" onClick={onCancel}>
          Annuler
        </button>
        {target && onDeleted && !ro && (
          <div className="ml-auto flex items-center gap-2">
            {confirmDelete ? (
              <>
                <span className="text-sm text-muted-foreground">Supprimer cette ligne ?</span>
                <button type="button" disabled={saving} className="min-h-11 rounded-lg bg-destructive px-4 text-base text-destructive-foreground" onClick={() => void remove()}>Oui</button>
                <button type="button" className="min-h-11 rounded-lg px-3 text-base" onClick={() => setConfirmDelete(false)}>Non</button>
              </>
            ) : (
              <button type="button" className="min-h-11 rounded-lg px-3 text-base text-destructive hover:bg-destructive-soft" onClick={() => setConfirmDelete(true)}>
                Supprimer
              </button>
            )}
          </div>
        )}
      </div>
    </form>
  );
}

// The other common rate of a line: 6 pairs with 12 (mixed take-away and on-site), 21 with 6.
function otherRate(rate: VatRate): VatRate {
  if (rate === 6) return 12;
  if (rate === 12) return 6;
  if (rate === 21) return 6;
  return 6;
}
