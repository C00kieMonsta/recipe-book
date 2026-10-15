import { useEffect, useRef, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import type { EventRevenueLine, RevenueLineKind, VatRate } from "@packages/types";
import { REVENUE_LINE_KINDS, REVENUE_LINE_KIND_LABELS, VAT_RATES, fmtEur, newRevenueLine, revenueLineKindOf, round2, sumMoney, withRevenueKind } from "@packages/types";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { ActionMenu, Button, EditableInlineNum, IconButton, Menu, MenuItem, Section, SelectPill, Tag, useMenu } from "@/components/ui";

export interface RevenueLinesProps {
  lines: EventRevenueLine[];
  onChange: (next: EventRevenueLine[]) => void;
  readOnly?: boolean;
  max?: number;
  // After « Ajouter », the amount cell of the new row opens for typing.
  focusAmountOnAdd?: boolean;
  title?: ReactNode;
  // The page passes the HTVA total and revenueByKindLabel when lines exist.
  meta?: ReactNode;
  // "draft" adds the Sous-total footer of the editor form.
  mode?: "page" | "draft";
}

export const REVENUE_LINES_MAX = 10;

const KIND_OPTIONS = REVENUE_LINE_KINDS.map((k) => ({ value: k, label: REVENUE_LINE_KIND_LABELS[k] }));
const VAT_OPTIONS = VAT_RATES.map((r) => ({ value: String(r), label: `${r} %` }));
// Below md the amount group drops under the label, right-aligned.
const ROW = "group flex min-h-9 flex-wrap items-center gap-2 rounded px-1 hover:bg-hover md:flex-nowrap touch:min-h-11";

export const REVENUE_LINES_EMPTY = "Aucun supplément. Service, livraison, location de vaisselle, boissons ou autre, facturés en plus du prix food, TVA 21 % par défaut.";

export default function RevenueLines({
  lines,
  onChange,
  readOnly = false,
  max = REVENUE_LINES_MAX,
  focusAmountOnAdd = true,
  title = "Service, livraison, autres",
  meta,
  mode = "page",
}: RevenueLinesProps) {
  const isTouch = useTouchScreen();
  const menu = useMenu();
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const [pendingFocus, setPendingFocus] = useState<number | null>(null);

  // The row exists only after the parent has re-rendered with the new line.
  useEffect(() => {
    if (pendingFocus === null) return;
    if (pendingFocus >= lines.length) return;
    const t = setTimeout(() => {
      rowRefs.current.get(pendingFocus)?.querySelector<HTMLElement>("[data-amount] [role=button]")?.click();
      setPendingFocus(null);
    }, 50);
    return () => clearTimeout(t);
  }, [pendingFocus, lines.length]);

  // A stored line without kind gets the inferred one written with the edit.
  const update = (idx: number, patch: Partial<EventRevenueLine>) =>
    onChange(lines.map((l, i) => (i === idx ? { ...l, kind: revenueLineKindOf(l), ...patch } : l)));
  const remove = (idx: number) => onChange(lines.filter((_, i) => i !== idx));
  const add = (kind: RevenueLineKind) => {
    if (lines.length >= max) return;
    const idx = lines.length;
    onChange([...lines, newRevenueLine(kind)]);
    if (focusAmountOnAdd) setPendingFocus(idx);
  };

  const full = lines.length >= max;
  const action = readOnly ? undefined : (
    <div ref={menu.ref} className="relative inline-flex">
      <Button
        variant="ghost"
        size="sm"
        icon={<Plus />}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        disabled={full}
        title={full ? `${max} lignes au maximum` : undefined}
        onClick={menu.toggle}
      >
        Ajouter ▾
      </Button>
      <Menu {...menu.props} align="right" title="Ajouter une ligne" aria-label="Ajouter une ligne">
        {KIND_OPTIONS.map((o) => (
          <MenuItem key={o.value} onSelect={() => add(o.value)}>{o.label}</MenuItem>
        ))}
      </Menu>
    </div>
  );

  // Below md the header has no room beside the title, so the meta becomes a caption.
  return (
    <Section title={title} meta={meta ? <span className="hidden md:inline">{meta}</span> : undefined} action={action}>
      {meta && <p className="mb-2 text-sm text-muted-foreground md:hidden">{meta}</p>}
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground touch:text-base">{REVENUE_LINES_EMPTY}</p>
      ) : (
        <div>
          {lines.map((line, i) => {
            const kind = revenueLineKindOf(line);
            return (
              <div
                key={i}
                ref={(el) => { if (el) rowRefs.current.set(i, el); else rowRefs.current.delete(i); }}
                className={ROW}
              >
                {readOnly ? (
                  <Tag colour="gray" title="Nature">{REVENUE_LINE_KIND_LABELS[kind]}</Tag>
                ) : (
                  <SelectPill
                    value={kind}
                    options={KIND_OPTIONS}
                    colour="gray"
                    aria-label="Nature"
                    title="Nature"
                    onChange={(k) => update(i, withRevenueKind(line, k as RevenueLineKind))}
                  />
                )}
                <span className="min-w-[6rem] flex-1 truncate text-sm touch:text-base">
                  {readOnly
                    ? <span className="font-medium">{line.label}</span>
                    : <InlineLabel value={line.label} placeholder={REVENUE_LINE_KIND_LABELS[kind]} onSave={(v) => { if (v.trim()) update(i, { label: v.trim() }); }} />}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <span className="w-20 shrink-0 text-right text-sm tabular-nums touch:text-base" data-amount>
                    {readOnly
                      ? <span className="font-medium">{fmtEur(line.amount)}</span>
                      : <EditableInlineNum value={line.amount} min={0} suffix=" €" onSave={(v) => update(i, { amount: round2(Math.max(0, v)) })} />}
                  </span>
                  {readOnly ? (
                    <Tag colour="gray" title="Taux de TVA">{line.vatRate} %</Tag>
                  ) : (
                    <SelectPill
                      value={String(line.vatRate)}
                      options={VAT_OPTIONS}
                      colour="gray"
                      align="right"
                      aria-label="Taux de TVA"
                      title="Taux de TVA"
                      onChange={(v) => update(i, { vatRate: Number(v) as VatRate })}
                    />
                  )}
                  {!readOnly && (isTouch ? (
                    <ActionMenu title={line.label} items={[{ label: "Retirer", onClick: () => remove(i), variant: "danger" }]} />
                  ) : (
                    <IconButton size="sm" aria-label="Retirer cette ligne" onClick={() => remove(i)} icon={<X />} className="reveal" />
                  ))}
                </span>
              </div>
            );
          })}
          {mode === "draft" && (
            <div className="flex justify-between border-t border-divider py-3 text-sm font-semibold">
              <span>Sous-total HTVA</span>
              <span className="tabular-nums">{fmtEur(sumMoney(lines.map((l) => l.amount || 0)))}</span>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

// Click to edit; the placeholder is the kind label of the row.
function InlineLabel({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  useEffect(() => { if (!editing) setText(value); }, [value, editing]);
  const commit = () => { setEditing(false); if (text !== value) onSave(text); };
  if (editing) {
    return (
      <input
        autoFocus
        aria-label="Intitulé"
        maxLength={60}
        placeholder={placeholder}
        className="-mx-1 w-32 max-w-full rounded border-0 bg-input-bg px-1 font-medium shadow-ring outline-none"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { e.preventDefault(); setText(value); setEditing(false); } }}
      />
    );
  }
  return (
    <strong
      role="button"
      tabIndex={0}
      className="prop-value block truncate font-medium touch:flex touch:min-h-11 touch:items-center"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditing(true); } }}
    >
      <span className="min-w-0 truncate">{value || <span className="font-normal text-placeholder">{placeholder}</span>}</span>
    </strong>
  );
}
