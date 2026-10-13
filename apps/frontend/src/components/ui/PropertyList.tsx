import { useEffect, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, ExternalLink, Check } from "lucide-react";
import type { Person } from "@packages/types";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { PersonAssign } from "@/components/admin/PersonPicker";
import Button from "./Button";
import SelectPill, { type SelectPillOption } from "./SelectPill";
import type { TagColour } from "./Tag";
import { Menu, MenuItem, MenuSeparator, useMenu } from "./Menu";

type IconProp = ComponentType<{ className?: string }> | string;

export type PropertyKind = "text" | "multiline" | "number" | "date" | "select" | "status" | "relation" | "people" | "url" | "computed" | "custom";

interface PropertyBase {
  icon?: IconProp;
  label: ReactNode;
  placeholder?: string;
  sub?: ReactNode;
  className?: string;
}

export interface RelationOption {
  value: string;
  label: string;
  detail?: string;
}

export type PropertyProps = PropertyBase & (
  | { kind: "text"; value: string | null | undefined; onSave?: (v: string) => void | Promise<unknown> }
  | { kind: "url"; value: string | null | undefined; onSave?: (v: string) => void | Promise<unknown> }
  | { kind: "multiline"; value: string | null | undefined; onSave?: (v: string) => void | Promise<unknown> }
  | { kind: "number"; value: number | null | undefined; onSave?: (v: number) => void | Promise<unknown>; min?: number; max?: number; decimals?: number; suffix?: ReactNode; format?: (v: number) => string }
  | { kind: "date"; value: string | null | undefined; onSave?: (iso: string) => void | Promise<unknown>; format?: (iso: string) => string }
  | { kind: "select" | "status"; value: string | null | undefined; options: (string | SelectPillOption)[]; onSave?: (v: string) => void | Promise<unknown>; colour?: TagColour; align?: "left" | "right" }
  | { kind: "relation"; value: string | null | undefined; options: RelationOption[]; href?: (id: string) => string; onSave?: (id: string) => void | Promise<unknown>; onCreateNew?: (name: string) => void; createLabel?: string; allowEmpty?: boolean }
  | { kind: "people"; value: string[]; people: Person[]; onSave?: (ids: string[]) => void | Promise<unknown>; allowInherit?: boolean; inherited?: boolean }
  | { kind: "computed"; value: ReactNode }
  | { kind: "custom"; children: ReactNode }
);

const DT = "flex h-[34px] w-40 shrink-0 items-center gap-1.5 text-sm text-muted-foreground touch:h-11 touch:w-40";
const DD = "flex min-h-[34px] min-w-0 flex-1 flex-wrap items-center gap-1 py-1.5 text-base touch:min-h-11";
const INPUT = "-mx-1.5 w-full min-w-0 rounded bg-input-bg px-1.5 text-base shadow-ring outline-none";

const dateFmt = new Intl.DateTimeFormat("fr-BE", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const s = dateFmt.format(d).replace(/\./g, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtNumber(v: number, decimals?: number): string {
  return v.toLocaleString("fr-BE", { minimumFractionDigits: decimals ?? 0, maximumFractionDigits: decimals ?? 2 });
}

// Optimistic value: renders at once, reverts with a toast when the save rejects.
function useOptimistic<T>(value: T, onSave?: (v: T) => void | Promise<unknown>): [T, (next: T) => void] {
  const [local, setLocal] = useState(value);
  const { toast } = useToast();
  useEffect(() => { setLocal(value); }, [value]);
  const commit = (next: T) => {
    const prev = local;
    setLocal(next);
    try {
      const r = onSave?.(next);
      if (r && typeof (r as Promise<unknown>).then === "function") {
        (r as Promise<unknown>).catch(() => {
          setLocal(prev);
          toast({ title: "Modification non enregistrée", variant: "destructive" });
        });
      }
    } catch {
      setLocal(prev);
      toast({ title: "Modification non enregistrée", variant: "destructive" });
    }
  };
  return [local, commit];
}

function PropertyIcon({ icon }: { icon?: IconProp }) {
  if (!icon) return <span className="w-4" aria-hidden="true" />;
  if (typeof icon === "string") return <span className="w-4 text-center text-sm leading-none" aria-hidden="true">{icon}</span>;
  const Icon = icon;
  return <Icon className="h-4 w-4 shrink-0 text-icon" />;
}

function Row({ icon, label, sub, className, children, editable = true }: PropertyBase & { children: ReactNode; editable?: boolean }) {
  return (
    <div className={cn("group flex min-h-[34px] items-start gap-2 touch:min-h-11", className)}>
      <dt className={DT}>
        <PropertyIcon icon={icon} />
        <span className="truncate">{label}</span>
      </dt>
      <dd className={cn(DD, !editable && "cursor-default")}>
        {children}
        {sub && <span className="text-caption text-muted-foreground">{sub}</span>}
      </dd>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <span className="text-placeholder">{text}</span>;
}

// Text and number: click or Enter edits in place; Enter commits, Escape reverts, blur commits.
function TextValue({ value, onCommit, placeholder, numeric, suffix, className }: {
  value: string;
  onCommit: (v: string) => void;
  placeholder: string;
  numeric?: boolean;
  suffix?: ReactNode;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!editing) setText(value); }, [value, editing]);
  useEffect(() => {
    if (!editing || !ref.current) return;
    const el = ref.current;
    el.focus();
    if (numeric) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
  }, [editing, numeric]);

  const commit = () => { setEditing(false); if (text !== value) onCommit(text); };
  const revert = () => { setText(value); setEditing(false); };

  if (editing) {
    return (
      <span className="flex w-full items-center gap-1">
        <input
          ref={ref}
          className={cn(INPUT, className)}
          value={text}
          inputMode={numeric ? "decimal" : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { e.preventDefault(); revert(); }
          }}
        />
        {suffix && <span className="shrink-0 text-muted-foreground">{suffix}</span>}
      </span>
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      className={cn("prop-value min-h-6 w-full", className)}
      onClick={() => setEditing(true)}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(true); } }}
    >
      {value ? <>{value}{suffix && <span className="text-muted-foreground"> {suffix}</span>}</> : <Empty text={placeholder} />}
    </span>
  );
}

function MultilineValue({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!editing) setText(value); }, [value, editing]);
  const grow = () => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } };
  useEffect(() => {
    if (!editing || !ref.current) return;
    const el = ref.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    grow();
  }, [editing]);
  const commit = () => { setEditing(false); if (text !== value) onCommit(text); };
  if (editing) {
    return (
      <textarea
        ref={ref}
        className={cn(INPUT, "resize-none py-0.5 leading-normal")}
        value={text}
        rows={1}
        onChange={(e) => { setText(e.target.value); grow(); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); commit(); } }}
      />
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      className="prop-value min-h-6 w-full whitespace-pre-wrap"
      onClick={() => setEditing(true)}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); setEditing(true); } }}
    >
      {value || <Empty text={placeholder} />}
    </span>
  );
}

function DateValue({ value, onCommit, placeholder, format }: { value: string; onCommit: (iso: string) => void; placeholder: string; format?: (iso: string) => string }) {
  const input = useRef<HTMLInputElement>(null);
  const open = () => {
    const el = input.current;
    if (!el) return;
    try { if (typeof el.showPicker === "function") el.showPicker(); else el.focus(); } catch { el.focus(); }
  };
  return (
    <span className="relative inline-flex min-h-6 w-full">
      <span
        role="button"
        tabIndex={0}
        className="prop-value w-full"
        onClick={open}
        onKeyDown={(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
      >
        {value ? (format ?? fmtDate)(value) : <Empty text={placeholder} />}
      </span>
      <input
        ref={input}
        type="date"
        value={value}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only absolute bottom-0 left-0"
        onChange={(e) => { if (e.target.value) onCommit(e.target.value); }}
      />
    </span>
  );
}

function RelationValue({ value, options, href, onCommit, onCreateNew, createLabel, placeholder, editable, allowEmpty }: {
  value: string;
  options: RelationOption[];
  href?: (id: string) => string;
  onCommit: (id: string) => void;
  onCreateNew?: (name: string) => void;
  createLabel?: string;
  placeholder: string;
  editable: boolean;
  allowEmpty?: boolean;
}) {
  const menu = useMenu();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const current = options.find((o) => o.value === value);
  useEffect(() => { if (menu.open) { setQuery(""); setTimeout(() => searchRef.current?.focus(), 0); } }, [menu.open]);
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const link = current && href ? (
    <Link to={href(current.value)} className="text-foreground underline decoration-divider underline-offset-2 hover:decoration-foreground">{current.label}</Link>
  ) : current ? <span>{current.label}</span> : <Empty text={placeholder} />;

  return (
    <div ref={menu.ref} className="relative flex min-w-0 items-center gap-1">
      {link}
      {editable && (
        <button type="button" onClick={menu.toggle} aria-label="Changer" aria-haspopup="menu" aria-expanded={menu.open} className={cn("inline-flex h-6 w-6 items-center justify-center rounded text-icon hover:bg-hover hover:text-foreground touch:h-11 touch:w-11", current ? "reveal" : "")}>
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
      <Menu {...menu.props} className="w-[280px]" title="Choisir">
        <div className="px-2 pb-1 pt-1">
          <input ref={searchRef} className="input-field" placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {allowEmpty && (
            <MenuItem onSelect={() => onCommit("")} selected={!value}><span className="text-muted-foreground">Aucun</span></MenuItem>
          )}
          {filtered.map((o) => (
            <MenuItem key={o.value} onSelect={() => { if (o.value !== value) onCommit(o.value); }} trailing={o.detail} selected={o.value === value}>
              <span className="flex items-center gap-2">{o.label}{o.value === value && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}</span>
            </MenuItem>
          ))}
          {filtered.length === 0 && !onCreateNew && <div className="px-3 py-2 text-sm text-muted-foreground">Aucun résultat</div>}
        </div>
        {onCreateNew && (
          <>
            <MenuSeparator />
            <MenuItem onSelect={() => onCreateNew(query.trim())} className="text-primary">{q ? `+ Créer « ${query.trim()} »` : (createLabel ?? "+ Créer")}</MenuItem>
          </>
        )}
      </Menu>
    </div>
  );
}

export function Property(props: PropertyProps) {
  const placeholder = props.placeholder ?? "Vide";
  const base = { icon: props.icon, label: props.label, sub: props.sub, className: props.className };

  switch (props.kind) {
    case "custom":
      return <Row {...base}>{props.children}</Row>;
    case "computed":
      return <Row {...base} editable={false}><span className="cursor-default">{props.value ?? <Empty text={placeholder} />}</span></Row>;
    case "text":
      return <TextProperty {...props} base={base} placeholder={placeholder} />;
    case "url":
      return <UrlProperty {...props} base={base} placeholder={placeholder} />;
    case "multiline":
      return <MultilineProperty {...props} base={base} placeholder={placeholder} />;
    case "number":
      return <NumberProperty {...props} base={base} placeholder={placeholder} />;
    case "date":
      return <DateProperty {...props} base={base} placeholder={placeholder} />;
    case "select":
    case "status":
      return <SelectProperty {...props} base={base} placeholder={placeholder} />;
    case "relation":
      return <RelationProperty {...props} base={base} placeholder={placeholder} />;
    case "people":
      return <PeopleProperty {...props} base={base} placeholder={placeholder} />;
  }
}

type Base = { base: PropertyBase; placeholder: string };

function TextProperty({ base, placeholder, value, onSave }: Base & Extract<PropertyProps, { kind: "text" }>) {
  const [local, commit] = useOptimistic(value ?? "", onSave);
  if (!onSave) return <Row {...base} editable={false}>{local || <Empty text={placeholder} />}</Row>;
  return <Row {...base}><TextValue value={local} onCommit={commit} placeholder={placeholder} /></Row>;
}

function UrlProperty({ base, placeholder, value, onSave }: Base & Extract<PropertyProps, { kind: "url" }>) {
  const [local, commit] = useOptimistic(value ?? "", onSave);
  const link = local ? (
    <a href={/^https?:/.test(local) ? local : `https://${local}`} target="_blank" rel="noreferrer" aria-label="Ouvrir le lien" className="inline-flex h-6 w-6 items-center justify-center rounded text-icon hover:bg-hover hover:text-foreground reveal">
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  ) : null;
  if (!onSave) return <Row {...base} editable={false}>{local ? <a href={local} className="text-primary underline underline-offset-2">{local}</a> : <Empty text={placeholder} />}</Row>;
  return (
    <Row {...base}>
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <TextValue value={local} onCommit={commit} placeholder={placeholder} className="text-primary" />
        {link}
      </span>
    </Row>
  );
}

function MultilineProperty({ base, placeholder, value, onSave }: Base & Extract<PropertyProps, { kind: "multiline" }>) {
  const [local, commit] = useOptimistic(value ?? "", onSave);
  if (!onSave) return <Row {...base} editable={false}><span className="whitespace-pre-wrap">{local || <Empty text={placeholder} />}</span></Row>;
  return <Row {...base}><MultilineValue value={local} onCommit={commit} placeholder={placeholder} /></Row>;
}

function NumberProperty({ base, placeholder, value, onSave, min, max, decimals, suffix, format }: Base & Extract<PropertyProps, { kind: "number" }>) {
  const [local, commit] = useOptimistic<number | null>(value ?? null, onSave ? (v) => (v === null ? undefined : onSave(v)) : undefined);
  const display = local === null || local === undefined ? "" : (format ?? ((v: number) => fmtNumber(v, decimals)))(local);
  if (!onSave) return <Row {...base} editable={false}>{display ? <>{display}{suffix && <span className="text-muted-foreground"> {suffix}</span>}</> : <Empty text={placeholder} />}</Row>;
  const parse = (text: string) => {
    const cleaned = text.replace(/\s/g, "").replace(",", ".");
    if (cleaned === "") return null;
    let n = parseFloat(cleaned);
    if (Number.isNaN(n)) return undefined;
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    if (decimals !== undefined) n = Math.round(n * 10 ** decimals) / 10 ** decimals;
    return n;
  };
  return (
    <Row {...base}>
      <TextValue
        value={display}
        numeric
        suffix={suffix}
        placeholder={placeholder}
        className="tabular-nums"
        onCommit={(text) => { const n = parse(text); if (n !== undefined && n !== local) commit(n); }}
      />
    </Row>
  );
}

function DateProperty({ base, placeholder, value, onSave, format }: Base & Extract<PropertyProps, { kind: "date" }>) {
  const [local, commit] = useOptimistic(value ?? "", onSave);
  if (!onSave) return <Row {...base} editable={false}>{local ? (format ?? fmtDate)(local) : <Empty text={placeholder} />}</Row>;
  return <Row {...base}><DateValue value={local} onCommit={commit} placeholder={placeholder} format={format} /></Row>;
}

function SelectProperty({ base, placeholder, value, options, onSave, colour, align }: Base & Extract<PropertyProps, { kind: "select" | "status" }>) {
  const [local, commit] = useOptimistic(value ?? "", onSave);
  const opts: SelectPillOption[] = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  if (!onSave) {
    const cur = opts.find((o) => o.value === local);
    return <Row {...base} editable={false}>{cur ? <SelectPill value={local} options={opts} onChange={() => {}} colour={colour} className="pointer-events-none" /> : <Empty text={placeholder} />}</Row>;
  }
  return (
    <Row {...base}>
      <SelectPill value={local} options={opts} onChange={commit} placeholder={placeholder} colour={colour} align={align} aria-label={typeof base.label === "string" ? base.label : undefined} />
    </Row>
  );
}

function RelationProperty({ base, placeholder, value, options, href, onSave, onCreateNew, createLabel, allowEmpty }: Base & Extract<PropertyProps, { kind: "relation" }>) {
  const [local, commit] = useOptimistic(value ?? "", onSave);
  return (
    <Row {...base} editable={Boolean(onSave)}>
      <RelationValue value={local} options={options} href={href} onCommit={commit} onCreateNew={onCreateNew} createLabel={createLabel} placeholder={placeholder} editable={Boolean(onSave)} allowEmpty={allowEmpty} />
    </Row>
  );
}

function PeopleProperty({ base, placeholder, value, people, onSave, allowInherit, inherited }: Base & Extract<PropertyProps, { kind: "people" }>) {
  const [local, commit] = useOptimistic(value, onSave);
  if (!onSave) {
    return <Row {...base} editable={false}>{local.length ? <PersonAssign value={local} options={people} onChange={() => {}} size="sm" inherited={inherited} className="pointer-events-none" /> : <Empty text={placeholder} />}</Row>;
  }
  return (
    <Row {...base}>
      <PersonAssign value={local} options={people} onChange={commit} size="sm" allowInherit={allowInherit} inherited={inherited} title={typeof base.label === "string" ? base.label : undefined} />
    </Row>
  );
}

export interface PropertyListProps {
  children: ReactNode;
  // Rows past this index hide behind a "n propriétés de plus" row.
  collapsibleAfter?: number;
  className?: string;
}

export function PropertyList({ children, collapsibleAfter, className }: PropertyListProps) {
  const [open, setOpen] = useState(false);
  const items = Array.isArray(children) ? children.flat() : [children];
  const visible = collapsibleAfter !== undefined && !open ? items.slice(0, collapsibleAfter) : items;
  const hidden = collapsibleAfter !== undefined ? Math.max(0, items.filter(Boolean).length - collapsibleAfter) : 0;
  return (
    <dl className={cn("mt-3 flex flex-col", className)}>
      {visible}
      {hidden > 0 && (
        <div className="mt-1">
          <Button variant="subtle" size="sm" onClick={() => setOpen((o) => !o)} icon={<ChevronRight className={cn("transition-transform", open && "rotate-90")} />}>
            {open ? "Masquer" : `${hidden} propriété${hidden > 1 ? "s" : ""} de plus`}
          </Button>
        </div>
      )}
    </dl>
  );
}

export default PropertyList;
