import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Camera, ExternalLink, FileText, Image as ImageIcon, RefreshCw, Upload, X } from "lucide-react";
import type { AppSettings, CreateLedgerEntryRequest, PurchaseKind, SalesKind } from "@packages/types";
import { fmtEur } from "@packages/types";
import { api, errorReason } from "@/lib/api";
import { PURCHASE_KIND_LABEL, SALES_KIND_LABEL, fmtDateFr } from "@/lib/accounting";
import { PAGE_ICONS } from "@/lib/page-icons";
import { plural } from "@/lib/use-planning-data";
import {
  canRetryInboxItem,
  confirmInboxItems,
  editInboxItem,
  enqueueInboxFiles,
  entryProblem,
  identityGap,
  ignoreInboxItem,
  retryInboxItem,
  setInboxReplace,
  useInboxQueue,
  type InboxConfirmSummary,
  type InboxField,
  type InboxFieldValue,
  type InboxItem,
  type InboxItemState,
} from "@/lib/inbox-queue";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { useAssistantEnabled } from "@/components/admin/AdminLayout";
import { Button, Callout, Checkbox, EmptyState, IconButton, ListRow, Property, PropertyList, SelectPill, Sheet, Tag, type SelectPillOption, type TagColour } from "@/components/ui";

const DISABLED_TEXT = "La lecture automatique n'est pas configurée (clé OPENAI). Vous pouvez saisir les factures à la main dans le Journal.";

const STATE_TAG: Record<InboxItemState, { label: string; colour: TagColour }> = {
  queued: { label: "En attente", colour: "gray" },
  uploading: { label: "Envoi…", colour: "blue" },
  extracting: { label: "Lecture…", colour: "blue" },
  review: { label: "À vérifier", colour: "yellow" },
  ready: { label: "Prêt", colour: "green" },
  added: { label: "Ajouté", colour: "gray" },
  error: { label: "Erreur", colour: "red" },
  duplicate: { label: "Doublon", colour: "gray" },
  locked: { label: "Mois verrouillé", colour: "red" },
};

const BOOK_OPTIONS: SelectPillOption[] = [
  { value: "ventes", label: "Ventes", colour: "blue" },
  { value: "achats", label: "Achats", colour: "orange" },
];
const SALES_OPTIONS: SelectPillOption[] = (Object.keys(SALES_KIND_LABEL) as SalesKind[]).filter((k) => k !== "ca_mensuel").map((k) => ({ value: k, label: SALES_KIND_LABEL[k] }));
const PURCHASE_OPTIONS: SelectPillOption[] = (Object.keys(PURCHASE_KIND_LABEL) as PurchaseKind[]).map((k) => ({ value: k, label: PURCHASE_KIND_LABEL[k] }));

const CELL_INPUT = "h-7 rounded bg-input-bg px-1.5 text-sm outline-none placeholder:text-placeholder focus:shadow-ring touch:h-11 touch:text-base";
const FIELD = "inline-flex items-center gap-1.5 text-sm";
const FIELD_NAME = "shrink-0 text-muted-foreground";

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

function kindLabelOf(entry: CreateLedgerEntryRequest): string {
  return entry.book === "ventes" ? SALES_KIND_LABEL[entry.kind] : PURCHASE_KIND_LABEL[entry.kind];
}

function journalLink(item: InboxItem): string {
  return `/comptes/journal?ym=${item.ym ?? ""}&entry=${item.entryId ?? ""}`;
}

function batchSummary(s: InboxConfirmSummary): string {
  const parts = [s.added === 0 ? "Aucune facture ajoutée" : plural(s.added, "facture ajoutée", "factures ajoutées")];
  if (s.duplicates) parts.push(plural(s.duplicates, "doublon ignoré", "doublons ignorés"));
  if (s.locked) parts.push(plural(s.locked, "mois verrouillé", "mois verrouillés"));
  if (s.errors) parts.push(plural(s.errors, "erreur", "erreurs"));
  return parts.join(", ");
}

// The server's flag messages as one muted sentence; a replaced duplicate says so.
function flagsSentence(item: InboxItem): string {
  const parts = item.flags.map((f) => (f.code === "duplicate" && item.replace ? `${f.message} · sera remplacée` : f.message));
  return parts.join(" · ");
}

function StateTag({ state }: { state: InboxItemState }) {
  const tag = STATE_TAG[state];
  return <Tag colour={tag.colour}>{tag.label}</Tag>;
}

function KindIcon({ contentType }: { contentType: string }) {
  const Icon = contentType === "application/pdf" ? FileText : ImageIcon;
  return <Icon className="h-4 w-4 shrink-0 text-icon" aria-hidden="true" />;
}

// Text while typing, a number on blur or Enter, like the entry form's money fields.
function MoneyInput({ value, onCommit, label, className }: { value: number; onCommit: (n: number) => void; label: string; className?: string }) {
  const [text, setText] = useState(value === 0 ? "" : String(Math.abs(value)));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(value === 0 ? "" : String(Math.abs(value))); }, [value, focused]);
  const commit = () => {
    const n = parseFloat(text.replace(",", "."));
    const next = Number.isFinite(n) ? n : 0;
    if (next !== Math.abs(value)) onCommit(next);
  };
  return (
    <input
      inputMode="decimal"
      aria-label={label}
      className={cn(CELL_INPUT, "w-20 text-right tabular-nums", className)}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => { if (e.target.value === "" || /^\d*[.,]?\d*$/.test(e.target.value)) setText(e.target.value); }}
      onBlur={() => { setFocused(false); commit(); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
    />
  );
}

const editable = (item: InboxItem) => Boolean(item.entry) && item.state !== "added" && !item.busy;

// Inline controls of one row at laptop width; the sheet on phones uses Property rows instead.
function InlineFields({ item, suppliers }: { item: InboxItem; suppliers: string[] }) {
  const entry = item.entry;
  if (!entry) return null;
  const edit = (field: InboxField, value: InboxFieldValue) => editInboxItem(item.id, field, value);
  if (!editable(item)) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span>{entry.book === "ventes" ? "Ventes" : "Achats"} · {kindLabelOf(entry)}</span>
        <span>{fmtDateFr(entry.date)}</span>
        {entry.number && <span>N° {entry.number}</span>}
        <span className="font-medium">{entry.label}</span>
        <span className="tabular-nums">{fmtEur(entry.htva)} + {fmtEur(entry.vatAmount)} = {fmtEur(entry.totalTvac)}</span>
        {entry.book === "ventes" && <span className="text-muted-foreground">{entry.paid ? "Payée" : "Non payée"}</span>}
        {entry.book === "achats" && entry.supplier && <span className="text-muted-foreground">{entry.supplier}</span>}
      </div>
    );
  }
  const listId = `suppliers-${item.id}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SelectPill value={entry.book} options={BOOK_OPTIONS} onChange={(v) => edit("book", v)} aria-label="Livre" />
        <SelectPill value={entry.kind} options={entry.book === "ventes" ? SALES_OPTIONS : PURCHASE_OPTIONS} colour="gray" onChange={(v) => edit("kind", v)} aria-label="Type" />
        <label className={FIELD}>
          <span className={FIELD_NAME}>Date</span>
          <input type="date" className={cn(CELL_INPUT, "w-[8.5rem]")} value={entry.date} onChange={(e) => edit("date", e.target.value)} />
        </label>
        <label className={FIELD}>
          <span className={FIELD_NAME}>N°</span>
          <input className={cn(CELL_INPUT, "w-28")} value={entry.number ?? ""} onChange={(e) => edit("number", e.target.value)} />
        </label>
        <label className={cn(FIELD, "min-w-[12rem] flex-1")}>
          <span className={FIELD_NAME}>Libellé</span>
          <input className={cn(CELL_INPUT, "w-full")} value={entry.label} onChange={(e) => edit("label", e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className={FIELD}>
          <span className={FIELD_NAME}>HTVA</span>
          <MoneyInput label="HTVA" value={entry.htva} onCommit={(n) => edit("htva", n)} />
        </label>
        <label className={FIELD}>
          <span className={FIELD_NAME}>TVA</span>
          <MoneyInput label="TVA" value={entry.vatAmount} onCommit={(n) => edit("vatAmount", n)} />
        </label>
        <label className={FIELD}>
          <span className={FIELD_NAME}>TVAC</span>
          <MoneyInput label="TVAC" value={entry.totalTvac} onCommit={(n) => edit("totalTvac", n)} />
        </label>
        <span className="text-sm text-muted-foreground">{entry.vatRate} %</span>
        {entry.book === "ventes" && <Checkbox checked={entry.paid} onChange={(v) => edit("paid", v)} label="Payé" className="-mx-1" />}
        {entry.book === "achats" && (
          <label className={cn(FIELD, "min-w-[10rem]")}>
            <span className={FIELD_NAME}>Fournisseur</span>
            <input className={cn(CELL_INPUT, "w-full")} list={listId} value={entry.supplier ?? ""} onChange={(e) => edit("supplier", e.target.value)} />
            <datalist id={listId}>{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
          </label>
        )}
      </div>
    </div>
  );
}

// Flags, the red identity line and the server error, under the fields.
function RowNotes({ item }: { item: InboxItem }) {
  const sentence = flagsSentence(item);
  const gap = item.entry ? identityGap(item.entry) : 0;
  const problem = item.entry && item.state !== "added" ? entryProblem(item.entry) : null;
  return (
    <>
      {sentence && <p className="text-sm text-muted-foreground">{sentence}</p>}
      {item.entry && gap >= 0.011 && item.state !== "added" && <p className="text-sm text-danger">HTVA + TVA diffère de TVAC de {fmtEur(gap)}.</p>}
      {problem && gap < 0.011 && item.state === "review" && <p className="text-sm text-danger">{problem}</p>}
      {item.state === "error" && item.error && <p className="text-sm text-danger">{item.error}</p>}
    </>
  );
}

interface Actions {
  onOpen: (item: InboxItem) => void;
  onAdd: (item: InboxItem) => void;
  onIgnore: (item: InboxItem) => void;
}

function RowActions({ item, actions, size = "sm" }: { item: InboxItem; actions: Actions; size?: "sm" | "md" }) {
  const problem = item.entry ? entryProblem(item.entry) : "Lecture en cours";
  const canAdd = (item.state === "ready" || item.state === "review") && !problem && !item.busy;
  if (item.state === "added") {
    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        <Button as={Link} to={journalLink(item)} variant="link" size={size}>Voir</Button>
        <IconButton size={size} aria-label="Ouvrir" title="Ouvrir" icon={<ExternalLink />} onClick={() => actions.onOpen(item)} />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {canRetryInboxItem(item) && (
        <Button variant="default" size={size} icon={<RefreshCw />} onClick={() => retryInboxItem(item.id)}>Réessayer</Button>
      )}
      {item.state === "duplicate" && (
        <Button variant="link" size={size} onClick={() => setInboxReplace(item.id, true)}>Remplacer</Button>
      )}
      {(item.state === "ready" || item.state === "review") && (
        <Button variant="default" size={size} disabled={!canAdd} title={problem ?? undefined} onClick={() => actions.onAdd(item)}>{item.busy ? "Ajout…" : "Ajouter"}</Button>
      )}
      <IconButton size={size} aria-label="Ouvrir" title="Ouvrir" icon={<ExternalLink />} onClick={() => actions.onOpen(item)} />
      <IconButton size={size} aria-label="Ignorer" title="Ignorer" icon={<X />} disabled={item.busy} onClick={() => actions.onIgnore(item)} />
    </div>
  );
}

// Phone: the row's fields as Property rows in a bottom sheet.
function ItemSheet({ item, suppliers, actions, onClose }: { item: InboxItem; suppliers: string[]; actions: Actions; onClose: () => void }) {
  const entry = item.entry;
  const edit = (field: InboxField) => (editable(item) ? (v: InboxFieldValue) => editInboxItem(item.id, field, v) : undefined);
  const money = (field: "htva" | "vatAmount" | "totalTvac", label: string) => (
    <Property kind="number" label={label} value={entry ? Math.abs(entry[field]) : null} decimals={2} suffix="€" onSave={edit(field)} />
  );
  return (
    <Sheet open onClose={onClose} title={item.name} className="flex flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <KindIcon contentType={item.contentType} />
          <span>{fmtSize(item.size)}</span>
          <StateTag state={item.state} />
        </div>
        <div className="mt-2 flex flex-col gap-1"><RowNotes item={item} /></div>
        {entry && (
          <PropertyList>
            <Property kind="select" label="Livre" value={entry.book} options={BOOK_OPTIONS} onSave={edit("book")} />
            <Property kind="select" label="Type" value={entry.kind} options={entry.book === "ventes" ? SALES_OPTIONS : PURCHASE_OPTIONS} colour="gray" onSave={edit("kind")} />
            <Property kind="date" label="Date" value={entry.date} format={fmtDateFr} onSave={edit("date")} />
            <Property kind="text" label="N°" value={entry.number ?? ""} placeholder="Sans numéro" onSave={edit("number")} />
            <Property kind="text" label="Libellé" value={entry.label} onSave={edit("label")} />
            {money("htva", "HTVA")}
            {money("vatAmount", "TVA")}
            {money("totalTvac", "TVAC")}
            <Property kind="computed" label="Taux TVA" value={`${entry.vatRate} %`} />
            {entry.book === "ventes" && (
              <Property kind="custom" label="Payé">
                <Checkbox checked={entry.paid} readOnly={!editable(item)} onChange={(v) => editInboxItem(item.id, "paid", v)} aria-label="Payé" className="-mx-1" />
              </Property>
            )}
            {entry.book === "achats" && (
              <Property kind="text" label="Fournisseur" value={entry.supplier ?? ""} placeholder="Aucun" sub={suppliers.length ? `Paramètres : ${suppliers.join(", ")}` : undefined} onSave={edit("supplier")} />
            )}
          </PropertyList>
        )}
      </div>
      <div className="mt-3 flex shrink-0 flex-wrap justify-end gap-2 px-4 pt-3">
        <RowActions item={item} actions={actions} size="md" />
      </div>
    </Sheet>
  );
}

export default function InvoiceInbox() {
  const { items, disabled: queueDisabled } = useInboxQueue();
  const assistant = useAssistantEnabled();
  const touch = useTouchScreen();
  const { toast } = useToast();
  const [over, setOver] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  // Object URLs for « Ouvrir », created on demand and revoked when the page unmounts.
  const urls = useRef(new Map<string, string>());

  const disabled = !assistant || queueDisabled;
  const suppliers = useMemo(() => settings?.suppliers.map((s) => s.name) ?? [], [settings]);
  const ready = items.filter((i) => i.state === "ready");
  const sheetItem = sheetId ? items.find((i) => i.id === sheetId) ?? null : null;

  useEffect(() => {
    let cancelled = false;
    api.settings.get().then((s) => { if (!cancelled) setSettings(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const map = urls.current;
    return () => {
      for (const url of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, []);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    enqueueInboxFiles(Array.from(list));
  };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    e.target.value = "";
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    addFiles(e.dataTransfer.files);
  };

  // Object URL before confirm, presigned URL after; the tab opens first so the browser does not block it.
  const openFile = async (item: InboxItem) => {
    if (item.entryId) {
      const tab = window.open("", "_blank");
      try {
        const { url } = await api.ledger.attachmentUrl(item.entryId);
        if (tab) tab.location.href = url;
        else window.open(url, "_blank");
      } catch (e) {
        tab?.close();
        toast({ title: "Pièce introuvable", description: errorReason(e) || undefined, variant: "destructive" });
      }
      return;
    }
    let url = urls.current.get(item.id);
    if (!url) {
      url = URL.createObjectURL(item.file);
      urls.current.set(item.id, url);
    }
    window.open(url, "_blank");
  };

  const confirm = async (ids: string[]) => {
    const summary = await confirmInboxItems(ids);
    toast({ title: batchSummary(summary), variant: summary.added === 0 && summary.errors > 0 ? "destructive" : "default" });
  };

  const actions: Actions = {
    onOpen: (item) => void openFile(item),
    onAdd: (item) => void confirm([item.id]),
    onIgnore: (item) => {
      const url = urls.current.get(item.id);
      if (url) { URL.revokeObjectURL(url); urls.current.delete(item.id); }
      if (sheetId === item.id) setSheetId(null);
      void ignoreInboxItem(item.id);
    },
  };

  const readyLabel = ready.length === 0 ? "Aucune facture prête" : plural(ready.length, "facture prête", "factures prêtes");

  const dropZone = (
    <div
      data-drop-zone
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn("flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-divider px-4 py-8 text-center transition-colors", over && "bg-callout")}
    >
      <Upload className="h-6 w-6 text-icon" aria-hidden="true" />
      <p className="text-base font-medium">Déposez vos factures ici</p>
      <p className="text-sm text-muted-foreground">PDF ou photo · 20 Mo par fichier</p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        <Button variant="default" size="md" onClick={() => fileRef.current?.click()}>Choisir des fichiers</Button>
        {touch && <Button variant="default" size="md" icon={<Camera />} onClick={() => cameraRef.current?.click()}>Prendre une photo</Button>}
      </div>
      <input ref={fileRef} type="file" multiple accept="application/pdf,image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onPick} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onPick} />
    </div>
  );

  const table = (
    <table className="table">
      <thead>
        <tr>
          <th style={{ width: "13rem" }}>Fichier</th>
          <th>Proposition</th>
          <th style={{ width: "12rem" }} className="text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} className="[&>td]:py-2 [&>td]:align-top">
            <td>
              <div className="flex items-start gap-2">
                <KindIcon contentType={item.contentType} />
                <div className="min-w-0">
                  <div className="truncate font-medium" title={item.name}>{item.name}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-caption text-muted-foreground">
                    <span>{fmtSize(item.size)}</span>
                    <StateTag state={item.state} />
                  </div>
                </div>
              </div>
            </td>
            <td>
              <div className="flex flex-col gap-1">
                <InlineFields item={item} suppliers={suppliers} />
                <RowNotes item={item} />
              </div>
            </td>
            <td><RowActions item={item} actions={actions} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const phoneList = (
    <div className="divide-y divide-border">
      {items.map((item) => {
        const entry = item.entry;
        const summary: ReactNode[] = [fmtSize(item.size)];
        if (entry) summary.push(entry.book === "ventes" ? "Ventes" : "Achats", fmtDateFr(entry.date), fmtEur(entry.totalTvac));
        if (item.state === "error" && item.error) summary.push(item.error);
        return (
          <ListRow
            key={item.id}
            icon={<KindIcon contentType={item.contentType} />}
            title={item.name}
            subtitle={summary.filter(Boolean).join(" · ")}
            trailing={<StateTag state={item.state} />}
            onClick={() => setSheetId(item.id)}
          />
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {disabled ? (
        <Callout emoji={PAGE_ICONS.depot}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{DISABLED_TEXT}</span>
            <Button as={Link} to="/comptes/journal" variant="link" size="sm">Ouvrir le journal</Button>
          </div>
        </Callout>
      ) : dropZone}

      {items.length === 0 ? (
        !disabled && <EmptyState message="Aucune facture déposée." />
      ) : (
        <>
          <div className="hidden md:block">{table}</div>
          <div className="md:hidden">{phoneList}</div>
          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-divider bg-background px-4 py-2 md:mx-0 md:px-0">
            <span className="text-sm text-muted-foreground">{readyLabel}</span>
            <Button variant="primary" size="lg" disabled={ready.length === 0 || ready.some((i) => i.busy)} onClick={() => void confirm(ready.map((i) => i.id))}>Ajouter au journal</Button>
          </div>
        </>
      )}

      {sheetItem && <ItemSheet item={sheetItem} suppliers={suppliers} actions={actions} onClose={() => setSheetId(null)} />}
    </div>
  );
}
