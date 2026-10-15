import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { GripVertical, MoreHorizontal, Plus } from "lucide-react";
import type { DocChoice, DocRow as DocRowData, DocRowKind } from "@packages/types";
import { DOC_TAG_PRESETS, DOC_UNIT_PRESETS, choiceLabelOf, fmtEur, unitKindOf } from "@packages/types";
import { cn } from "@/lib/utils";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { useLongPressDrag, type LongPressDragHandlers } from "@/hooks/use-long-press-drag";
import { Button, IconButton, Menu, MenuCheck, MenuItem, MenuRadio, MenuSection, MenuSeparator, NumericInput, SearchSelect, SelectPill, Tag, useMenu } from "@/components/ui";

// Client-side id for new rows and sections; the server checks uniqueness inside the document.
export function newDocId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

export interface RecipeOption {
  recipeId: string;
  name: string;
  category?: string;
}

export interface SectionOption {
  sectionId: string;
  title: string;
}

export const ROW_KIND_LABELS: Record<DocRowKind, string> = { plat: "Plat", exemple: "Exemple", sous_titre: "Sous-titre", note: "Note" };

const MAX_TAGS = 4;
const END_TARGET = "__end";
const TEXT_CLASS: Record<DocRowKind, string> = {
  plat: "text-sm touch:text-base",
  exemple: "text-sm italic text-muted-foreground touch:text-base",
  sous_titre: "text-sm font-semibold touch:text-base",
  note: "text-sm font-semibold italic touch:text-base",
};

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function grow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function withoutUndefined<T extends object>(o: T): T {
  const next = { ...o } as Record<string, unknown>;
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  return next as T;
}

// ---------------------------------------------------------------------------
// Inline editors shared by the row and the section header.

export interface InlineTextKeys {
  onEnter?: () => void;
  onBackspaceEmpty?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
}

export interface InlineTextProps {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  className?: string;
  // Edit mode opens when this turns true or focusTick changes; onEditEnd fires every time it closes.
  focused?: boolean;
  focusTick?: number;
  onEditEnd?: () => void;
  // Shift+Enter inserts a line break.
  multiline?: boolean;
  keys?: InlineTextKeys;
  readOnly?: boolean;
  "aria-label"?: string;
}

const INLINE_FIELD = "-mx-1.5 block w-full resize-none rounded border-0 bg-input-bg px-1.5 py-0 leading-normal shadow-ring outline-none";

// Click-to-edit text with the editor keys: Enter commits, Escape reverts, blur commits.
export function InlineText({ value, onSave, placeholder, className, focused, focusTick, onEditEnd, multiline, keys, readOnly, "aria-label": ariaLabel }: InlineTextProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  // True while the textarea is mounted, so a blur after Enter does not commit twice.
  const live = useRef(false);

  useEffect(() => { if (!editing) setText(value); }, [value, editing]);
  useEffect(() => { if (focused && !readOnly) setEditing(true); }, [focused, focusTick, readOnly]);
  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    live.current = true;
    grow(el);
    // Focus without the browser's own scroll, then bring the field into view by the smallest move.
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    el.scrollIntoView({ block: "nearest" });
  }, [editing]);

  const end = () => {
    if (!live.current) return false;
    live.current = false;
    setEditing(false);
    return true;
  };
  const commit = () => {
    const next = text;
    if (!end()) return;
    if (next !== value) onSave(next);
    onEditEnd?.();
  };
  const revert = () => {
    if (!end()) return;
    setText(value);
    onEditEnd?.();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (e.key === "Enter") {
      if (e.shiftKey && multiline) return;
      e.preventDefault();
      commit();
      keys?.onEnter?.();
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); revert(); return; }
    if (e.key === "Home" || e.key === "End") {
      // Chrome scrolls the page on Home and End when a one-line textarea has nothing to scroll; move the caret ourselves.
      e.preventDefault();
      const v = el.value;
      const whole = e.ctrlKey || e.metaKey;
      const pos = e.key === "Home"
        ? (whole ? 0 : v.lastIndexOf("\n", el.selectionStart - 1) + 1)
        : (whole ? v.length : (v.indexOf("\n", el.selectionEnd) === -1 ? v.length : v.indexOf("\n", el.selectionEnd)));
      if (!e.shiftKey) { el.setSelectionRange(pos, pos); return; }
      const anchor = el.selectionDirection === "backward" ? el.selectionEnd : el.selectionStart;
      el.setSelectionRange(Math.min(anchor, pos), Math.max(anchor, pos), pos < anchor ? "backward" : "forward");
      return;
    }
    if (e.key === "Backspace" && text === "" && keys?.onBackspaceEmpty) {
      e.preventDefault();
      if (!end()) return;
      onEditEnd?.();
      keys.onBackspaceEmpty();
      return;
    }
    if (e.key === "ArrowUp" && keys?.onArrowUp && !text.slice(0, el.selectionStart).includes("\n")) {
      e.preventDefault();
      commit();
      keys.onArrowUp();
      return;
    }
    if (e.key === "ArrowDown" && keys?.onArrowDown && !text.slice(el.selectionEnd).includes("\n")) {
      e.preventDefault();
      commit();
      keys.onArrowDown();
    }
  };

  if (readOnly) {
    return value ? <span className={cn("whitespace-pre-wrap", className)}>{value}</span> : null;
  }

  if (editing) {
    return (
      <textarea
        ref={ref}
        rows={1}
        aria-label={ariaLabel}
        className={cn(INLINE_FIELD, className)}
        value={text}
        placeholder={placeholder}
        onChange={(e) => { setText(e.target.value); grow(e.target); }}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      className={cn("prop-value whitespace-pre-wrap touch:inline-flex touch:min-h-11 touch:items-center", className, !value && "text-placeholder")}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditing(true); } }}
    >
      {value || placeholder || "Vide"}
    </span>
  );
}

export interface InlinePriceProps {
  value?: number;
  fromPrice?: boolean;
  // Empty input clears the price.
  onSave: (v: number | undefined) => void;
  placeholder?: string;
  readOnly?: boolean;
  "aria-label"?: string;
}

const PRICE_FIELD = "-mx-1 w-16 rounded border-0 bg-input-bg px-1 text-right font-medium tabular-nums shadow-ring outline-none";

// Price HTVA, « àpd » prefixed when fromPrice; empty allowed.
export function InlinePrice({ value, fromPrice, onSave, placeholder = "Prix", readOnly, "aria-label": ariaLabel }: InlinePriceProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const live = useRef(false);

  useEffect(() => { if (!editing) setText(value === undefined ? "" : String(value)); }, [value, editing]);
  useEffect(() => { if (editing) live.current = true; }, [editing]);

  const label = value === undefined ? undefined : `${fromPrice ? "àpd " : ""}${fmtEur(value)}`;

  const commit = () => {
    if (!live.current) return;
    live.current = false;
    setEditing(false);
    const cleaned = text.trim().replace(",", ".");
    if (cleaned === "") { if (value !== undefined) onSave(undefined); return; }
    const parsed = parseFloat(cleaned);
    if (Number.isNaN(parsed)) return;
    const final = Math.max(0, parsed);
    if (final !== value) onSave(final);
  };
  const revert = () => {
    if (!live.current) return;
    live.current = false;
    setText(value === undefined ? "" : String(value));
    setEditing(false);
  };

  if (readOnly) return label ? <span className="tabular-nums">{label}</span> : null;

  if (editing) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <input
          className={PRICE_FIELD}
          type="text"
          inputMode="decimal"
          aria-label={ariaLabel ?? "Prix"}
          value={text}
          onChange={(e) => { if (e.target.value === "" || /^\d*[.,]?\d*$/.test(e.target.value)) setText(e.target.value); }}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { e.preventDefault(); revert(); }
          }}
          autoFocus
        />
        <span>€</span>
      </span>
    );
  }

  return (
    <strong
      role="button"
      tabIndex={0}
      aria-label={ariaLabel ?? "Prix"}
      className="prop-value whitespace-nowrap font-medium tabular-nums touch:inline-flex touch:min-h-11 touch:items-center"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditing(true); } }}
    >
      {label ?? <span className="font-normal text-placeholder">{placeholder}</span>}
    </strong>
  );
}

export interface UnitPillProps {
  value?: string;
  // Undefined clears a row override (« Comme la section »).
  onChange: (unitLabel: string | undefined) => void;
  // The section's unit, offered as « Comme la section » and shown when the row has none.
  inherited?: string;
  placeholder?: string;
  readOnly?: boolean;
  "aria-label"?: string;
}

const UNIT_OTHER = "__other";
const UNIT_INHERIT = "__inherit";

// The unit pill over DOC_UNIT_PRESETS plus « Autre… » typed inline.
export function UnitPill({ value, onChange, inherited, placeholder = "Unité", readOnly, "aria-label": ariaLabel }: UnitPillProps) {
  const [custom, setCustom] = useState(false);
  const shown = value ?? inherited;

  if (readOnly) return shown ? <span className="text-muted-foreground">{shown}</span> : null;

  if (custom) {
    return (
      <InlineText
        value={value ?? ""}
        focused
        placeholder="Unité"
        aria-label="Unité"
        className="text-sm"
        onSave={(v) => { const t = v.trim(); if (t) onChange(t); }}
        onEditEnd={() => setCustom(false)}
      />
    );
  }

  const presets = Object.keys(DOC_UNIT_PRESETS);
  const options = [
    ...(value && !presets.includes(value) ? [{ value, label: value }] : []),
    ...presets.map((p) => ({ value: p, label: p })),
    { value: UNIT_OTHER, label: "Autre…" },
    ...(inherited ? [{ value: UNIT_INHERIT, label: <span className="text-muted-foreground">{value ? `Comme la section (${inherited})` : inherited}</span> }] : []),
  ];
  const current = value ?? (inherited ? UNIT_INHERIT : "");

  return (
    <SelectPill
      value={current}
      options={options}
      placeholder={placeholder}
      align="right"
      aria-label={ariaLabel ?? "Unité"}
      onChange={(v) => {
        if (v === UNIT_OTHER) setCustom(true);
        else if (v === UNIT_INHERIT) onChange(undefined);
        else onChange(v);
      }}
    />
  );
}

export interface ChipMenuProps {
  // The chip text; the add link shows when absent.
  label?: string;
  addLabel: string;
  addClassName?: string;
  title: string;
  readOnly?: boolean;
  // Called before the menu opens from the add link, to create the value.
  onAdd?: () => void;
  children: ReactNode;
}

// A muted chip (or a reveal « + … » link) that opens a small Menu of fields.
export function ChipMenu({ label, addLabel, addClassName, title, readOnly, onAdd, children }: ChipMenuProps) {
  const menu = useMenu();
  if (readOnly) return label ? <Tag colour="gray">{label}</Tag> : null;
  return (
    <span ref={menu.ref} className="relative inline-flex">
      {label ? (
        <button
          type="button"
          onClick={menu.toggle}
          aria-haspopup="menu"
          aria-expanded={menu.open}
          className="inline-flex h-7 items-center rounded px-0.5 hover:bg-hover touch:h-11"
        >
          <Tag colour="gray">{label}</Tag>
        </button>
      ) : (
        <Button variant="link" size="sm" className={cn("reveal", addClassName)} onClick={() => { onAdd?.(); menu.setOpen(true); }} aria-haspopup="menu" aria-expanded={menu.open}>
          {addLabel}
        </Button>
      )}
      <Menu {...menu.props} title={title} aria-label={title}>
        {children}
      </Menu>
    </span>
  );
}

export function MenuField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 px-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

// The « un choix pour la table » chip of a sous_titre row.
function ChoiceChip({ choice, onChange, readOnly }: { choice?: DocChoice; onChange: (c: DocChoice | undefined) => void; readOnly?: boolean }) {
  const current = choice ?? { count: 1, scope: "table" as const };
  return (
    <ChipMenu label={choice ? choiceLabelOf(choice) : undefined} addLabel="+ Choix" title="Choix" readOnly={readOnly} onAdd={() => onChange(current)}>
      <MenuField label="Nombre">
        <NumericInput value={current.count} min={1} aria-label="Nombre" className="input-field input-compact w-16 text-right" onChange={(v) => onChange({ ...current, count: Math.max(1, Math.round(v)) })} />
      </MenuField>
      <MenuRadio checked={current.scope === "table"} onSelect={() => onChange({ ...current, scope: "table" })}>pour la table</MenuRadio>
      <MenuRadio checked={current.scope === "convive"} onSelect={() => onChange({ ...current, scope: "convive" })}>par convive</MenuRadio>
      <MenuField label="Texte imprimé">
        <InlineText value={current.label ?? ""} placeholder={choiceLabelOf({ ...current, label: undefined })} className="max-w-40 text-sm" aria-label="Texte imprimé" onSave={(v) => onChange(withoutUndefined({ ...current, label: v.trim() || undefined }))} />
      </MenuField>
      <MenuSeparator />
      <MenuItem danger onSelect={() => onChange(undefined)}>Retirer</MenuItem>
    </ChipMenu>
  );
}

// ---------------------------------------------------------------------------
// One row.

export interface DocRowDrag {
  dragging: boolean;
  dropBefore: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  // Touch: the long-press handlers spread on the row.
  lift?: LongPressDragHandlers;
}

export interface DocRowProps {
  row: DocRowData;
  // Price list: the price column on every plat row. Formula: only when the row has a price or a price note.
  priceList: boolean;
  sectionUnitLabel?: string;
  readOnly?: boolean;
  focused?: boolean;
  focusTick?: number;
  onEditEnd?: () => void;
  recipes?: RecipeOption[];
  // Category of the recipe created from « Lier à une recette… »; the nearest sous_titre when it matches one.
  recipeCategory?: string;
  otherSections?: SectionOption[];
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  // Keys set to undefined are removed from the row.
  onChange: (patch: Partial<DocRowData>) => void;
  onEnter?: () => void;
  onBackspaceEmpty?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onInsertExample?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onMoveTo?: (sectionId: string) => void;
  onRemove?: () => void;
  // Opens the page's NewRecipeDialog; the page links the row once the recipe exists.
  onCreateRecipe?: (name: string, category?: string) => void;
  drag?: DocRowDrag;
  className?: string;
}

export default function DocRow({
  row, priceList, sectionUnitLabel, readOnly, focused, focusTick, onEditEnd, recipes, recipeCategory, otherSections, canMoveUp, canMoveDown,
  onChange, onEnter, onBackspaceEmpty, onArrowUp, onArrowDown, onInsertExample, onMoveUp, onMoveDown, onMoveTo, onRemove, onCreateRecipe, drag, className,
}: DocRowProps) {
  const touch = useTouchScreen();
  const [linking, setLinking] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const isPlat = row.kind === "plat";
  const showPrice = isPlat && (priceList || row.price !== undefined || Boolean(row.priceNote) || editingNote);
  const recipe = row.recipeId ? recipes?.find((r) => r.recipeId === row.recipeId) : undefined;
  const linkable = isPlat && Boolean(recipes);

  const recipeOptions = linking
    ? [...(recipes ?? [])].sort((a, b) => a.name.localeCompare(b.name, "fr")).map((r) => ({ value: r.recipeId, label: r.name, detail: r.category }))
    : [];

  const setKind = (kind: DocRowKind) => {
    if (kind === row.kind) return;
    onChange({ kind, choice: kind === "sous_titre" ? row.choice : undefined });
  };
  const addTag = (tag: string) => {
    const t = tag.trim();
    const tags = row.tags ?? [];
    if (!t || tags.includes(t) || tags.length >= MAX_TAGS) return;
    onChange({ tags: [...tags, t] });
  };
  const removeTag = (tag: string) => {
    const tags = (row.tags ?? []).filter((t) => t !== tag);
    onChange({ tags: tags.length ? tags : undefined });
  };

  return (
    <div
      data-drop-day={row.rowId}
      {...(drag?.lift ?? {})}
      className={cn(
        "group relative flex min-h-9 flex-wrap items-center gap-x-1 rounded px-1 hover:bg-hover touch:min-h-11",
        row.kind === "sous_titre" && "bg-callout",
        drag?.dragging && "opacity-40",
        drag?.dropBefore && "shadow-[0_-2px_0_0_var(--primary)]",
        className,
      )}
      onDragOver={drag && !touch ? (e) => { e.preventDefault(); e.stopPropagation(); drag.onDragOver(); } : undefined}
      onDrop={drag && !touch ? (e) => { e.preventDefault(); e.stopPropagation(); drag.onDrop(); } : undefined}
    >
      {drag && !touch && !readOnly && (
        <span
          draggable
          onDragStart={drag.onDragStart}
          onDragEnd={drag.onDragEnd}
          className="reveal flex h-7 w-5 shrink-0 cursor-grab items-center justify-center text-icon active:cursor-grabbing"
          aria-label="Glisser pour réordonner"
        >
          <GripVertical className="h-4 w-4" />
        </span>
      )}
      <div className={cn("min-w-0 flex-1 px-1 py-1", row.kind === "exemple" && "pl-5")}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="min-w-0 max-w-full has-[textarea]:flex-1">
            {row.kind === "exemple" && <span className="text-sm italic text-muted-foreground touch:text-base">ex : </span>}
            <InlineText
              value={row.text}
              placeholder={row.kind === "sous_titre" ? "Sous-titre" : row.kind === "exemple" ? "exemple" : "Plat"}
              className={TEXT_CLASS[row.kind]}
              aria-label="Texte"
              multiline
              focused={focused}
              focusTick={focusTick}
              onEditEnd={onEditEnd}
              readOnly={readOnly}
              onSave={(v) => onChange({ text: v })}
              keys={{ onEnter, onBackspaceEmpty, onArrowUp, onArrowDown }}
            />
          </span>
          {row.tags?.map((tag) =>
            readOnly ? (
              <Tag key={tag} colour="gray">{tag}</Tag>
            ) : (
              <button key={tag} type="button" title="Retirer la mention" className="rounded-sm hover:opacity-70 touch:inline-flex touch:min-h-11 touch:items-center touch:px-1" onClick={() => removeTag(tag)}>
                <Tag colour="gray">{tag}</Tag>
              </button>
            ),
          )}
          {row.recipeId && (
            <Link to={`/recipes/${row.recipeId}`} title={recipe?.name ?? "Ouvrir la recette"} className="rounded-sm hover:opacity-80 touch:inline-flex touch:min-h-11 touch:items-center touch:px-1">
              <Tag colour="blue">Recette</Tag>
            </Link>
          )}
          {row.kind === "sous_titre" && (
            <ChoiceChip choice={row.choice} readOnly={readOnly} onChange={(choice) => onChange({ choice })} />
          )}
        </div>
        {linking && (
          <div className="mt-1 flex items-center gap-2">
            <SearchSelect
              options={recipeOptions}
              value=""
              placeholder="Lier à une recette…"
              autoFocus
              className="max-w-xs flex-1"
              onChange={(recipeId) => { setLinking(false); onChange({ recipeId }); }}
              onCreateNew={onCreateRecipe ? (name) => { setLinking(false); onCreateRecipe(name, recipeCategory); } : undefined}
            />
            <Button variant="ghost" size="sm" onClick={() => setLinking(false)}>Annuler</Button>
          </div>
        )}
      </div>
      {showPrice && (
        <div className="order-3 flex basis-full flex-wrap items-center gap-x-2 px-1 pb-1 text-sm text-muted-foreground tabular-nums touch:text-base md:order-none md:basis-auto md:shrink-0 md:justify-end md:pb-0">
          <span className="text-foreground">
            <InlinePrice value={row.price} fromPrice={row.fromPrice} readOnly={readOnly} onSave={(price) => onChange({ price })} />
          </span>
          {row.price === undefined && (row.priceNote || editingNote) ? (
            <InlineText
              value={row.priceNote ?? ""}
              placeholder="Mention de prix"
              className="text-sm italic text-muted-foreground touch:text-base"
              aria-label="Mention de prix"
              readOnly={readOnly}
              focused={editingNote}
              onEditEnd={() => setEditingNote(false)}
              onSave={(v) => onChange({ priceNote: v.trim() || undefined })}
            />
          ) : (
            <UnitPill
              value={row.unitLabel}
              inherited={sectionUnitLabel}
              readOnly={readOnly}
              onChange={(unitLabel) => onChange({ unitLabel, unitKind: unitLabel ? unitKindOf(unitLabel) : undefined })}
            />
          )}
        </div>
      )}
      {!readOnly && (
        <RowMenu
          row={row}
          linkable={linkable}
          otherSections={otherSections ?? []}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onKind={setKind}
          onAddTag={addTag}
          onLink={() => setLinking(true)}
          onUnlink={() => onChange({ recipeId: undefined })}
          onFromPrice={(v) => onChange({ fromPrice: v || undefined })}
          onPriceNote={() => setEditingNote(true)}
          onInsertExample={onInsertExample}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onMoveTo={onMoveTo}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}

type RowMenuView = "main" | "kind" | "tags" | "move";

function RowMenu({ row, linkable, otherSections, canMoveUp, canMoveDown, onKind, onAddTag, onLink, onUnlink, onFromPrice, onPriceNote, onInsertExample, onMoveUp, onMoveDown, onMoveTo, onRemove }: {
  row: DocRowData;
  linkable: boolean;
  otherSections: SectionOption[];
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onKind: (k: DocRowKind) => void;
  onAddTag: (t: string) => void;
  onLink: () => void;
  onUnlink: () => void;
  onFromPrice: (v: boolean) => void;
  onPriceNote: () => void;
  onInsertExample?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onMoveTo?: (sectionId: string) => void;
  onRemove?: () => void;
}) {
  const menu = useMenu();
  const [view, setView] = useState<RowMenuView>("main");
  const [freeTag, setFreeTag] = useState("");
  useEffect(() => { if (!menu.open) { setView("main"); setFreeTag(""); } }, [menu.open]);
  // A sub-view replaces the focused item, so the keyboard lands on its first entry.
  useEffect(() => {
    if (view !== "main") menu.ref.current?.querySelector<HTMLElement>("[role=menu] [role^=menuitem]")?.focus();
  }, [view, menu.ref]);

  const isPlat = row.kind === "plat";
  const tags = row.tags ?? [];
  const title = row.text || ROW_KIND_LABELS[row.kind];
  const presets = DOC_TAG_PRESETS.filter((t) => !tags.includes(t));

  return (
    <div ref={menu.ref} className={cn("reveal relative inline-flex shrink-0", menu.open && "!opacity-100")}>
      <IconButton size="sm" aria-label="Plus d'actions" aria-haspopup="menu" aria-expanded={menu.open} onClick={menu.toggle} icon={<MoreHorizontal />} />
      <Menu {...menu.props} align="right" title={title} aria-label="Plus d'actions">
        {view === "kind" && (
          <MenuSection label="Transformer en">
            {(Object.keys(ROW_KIND_LABELS) as DocRowKind[]).map((k) => (
              <MenuRadio key={k} checked={k === row.kind} onSelect={() => onKind(k)}>{ROW_KIND_LABELS[k]}</MenuRadio>
            ))}
          </MenuSection>
        )}
        {view === "tags" && (
          <MenuSection label="Ajouter une mention">
            {presets.map((t) => (
              <MenuItem key={t} onSelect={() => onAddTag(t)} disabled={tags.length >= MAX_TAGS}>{t}</MenuItem>
            ))}
            <div className="px-3 py-1">
              <input
                className="input-field input-compact"
                placeholder="Autre…"
                aria-label="Autre mention"
                value={freeTag}
                disabled={tags.length >= MAX_TAGS}
                onChange={(e) => setFreeTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onAddTag(freeTag); menu.close(); }
                }}
              />
            </div>
          </MenuSection>
        )}
        {view === "move" && (
          <MenuSection label="Déplacer vers">
            {otherSections.map((s) => (
              <MenuRadio key={s.sectionId} checked={false} onSelect={() => onMoveTo?.(s.sectionId)}>{s.title || "Sans titre"}</MenuRadio>
            ))}
          </MenuSection>
        )}
        {view === "main" && (
          <>
            <MenuItem onSelect={() => setView("kind")} closeOnSelect={false} trailing={ROW_KIND_LABELS[row.kind]}>Transformer en</MenuItem>
            <MenuItem onSelect={() => setView("tags")} closeOnSelect={false} disabled={tags.length >= MAX_TAGS}>Ajouter une mention</MenuItem>
            {linkable && !row.recipeId && <MenuItem onSelect={onLink}>Lier à une recette…</MenuItem>}
            {linkable && row.recipeId && <MenuItem onSelect={onUnlink}>Retirer la recette</MenuItem>}
            {isPlat && (
              <>
                <MenuCheck checked={Boolean(row.fromPrice)} onChange={onFromPrice}>Prix à partir de</MenuCheck>
                <MenuItem onSelect={onPriceNote}>Mention de prix…</MenuItem>
              </>
            )}
            {onInsertExample && <MenuItem onSelect={onInsertExample}>Insérer un exemple dessous</MenuItem>}
            <MenuSeparator />
            <MenuItem onSelect={onMoveUp} disabled={!canMoveUp}>Monter</MenuItem>
            <MenuItem onSelect={onMoveDown} disabled={!canMoveDown}>Descendre</MenuItem>
            {otherSections.length > 0 && onMoveTo && <MenuItem onSelect={() => setView("move")} closeOnSelect={false}>Déplacer vers…</MenuItem>}
            <MenuSeparator />
            <MenuItem danger onSelect={onRemove}>Supprimer</MenuItem>
          </>
        )}
      </Menu>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The rows of one section (or of the services block): keyboard flow, drag order, draft rows.

export interface DocRowsProps {
  rows: DocRowData[];
  onChange: (rows: DocRowData[]) => void;
  priceList: boolean;
  sectionUnitLabel?: string;
  readOnly?: boolean;
  recipes?: RecipeOption[];
  // Recipe categories, matched against the nearest sous_titre for a new recipe.
  categories?: string[];
  otherSections?: SectionOption[];
  // The parent removes the row here and appends it to the target section.
  onMoveRowTo?: (row: DocRowData, sectionId: string) => void;
  onCreateRecipe?: (rowId: string, name: string, category?: string) => void;
  addLabel?: string;
  className?: string;
}

interface Draft {
  rowId: string;
  // Null appends at the end.
  afterId: string | null;
  kind: DocRowKind;
}

function insertDraft(rows: DocRowData[], draft: Draft, text = ""): DocRowData[] {
  const row: DocRowData = { rowId: draft.rowId, kind: draft.kind, text };
  if (draft.afterId === null) return [...rows, row];
  const i = rows.findIndex((r) => r.rowId === draft.afterId);
  if (i < 0) return [...rows, row];
  return [...rows.slice(0, i + 1), row, ...rows.slice(i + 1)];
}

function moveRow(rows: DocRowData[], rowId: string, beforeId: string): DocRowData[] {
  const row = rows.find((r) => r.rowId === rowId);
  if (!row) return rows;
  const rest = rows.filter((r) => r.rowId !== rowId);
  if (beforeId === END_TARGET) return [...rest, row];
  const i = rest.findIndex((r) => r.rowId === beforeId);
  if (i < 0) return rows;
  return [...rest.slice(0, i), row, ...rest.slice(i)];
}

// The lifted row's label, drawn above the finger.
function RowGhost({ point, label }: { point: { x: number; y: number } | null; label: string }) {
  if (!point) return null;
  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-50 flex h-11 max-w-[calc(100vw-16px)] items-center rounded-lg bg-background px-3 text-sm shadow-dialog"
      style={{ left: Math.max(8, point.x - 24), top: point.y - 56 < 8 ? point.y + 24 : point.y - 56 }}
    >
      <span className="min-w-0 truncate">{label.length > 32 ? `${label.slice(0, 31).trimEnd()}…` : label || "Ligne"}</span>
    </div>,
    document.body,
  );
}

export function DocRows({ rows, onChange, priceList, sectionUnitLabel, readOnly, recipes, categories, otherSections, onMoveRowTo, onCreateRecipe, addLabel = "Ligne", className }: DocRowsProps) {
  const touch = useTouchScreen();
  const [draft, setDraftState] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const setDraft = (d: Draft | null) => { draftRef.current = d; setDraftState(d); };
  // The draft row that just became a real row, so Enter on it opens the next one.
  const committedRef = useRef<string | null>(null);
  const [focus, setFocus] = useState<{ rowId: string; tick: number } | null>(null);
  const setFocusId = (rowId: string) => setFocus((cur) => ({ rowId, tick: (cur?.tick ?? 0) + 1 }));
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const lift = useLongPressDrag<DocRowData>({
    enabled: touch && !readOnly,
    onEnd: (target, item) => {
      if (target && target !== item.rowId) onChange(moveRow(rows, item.rowId, target));
    },
  });

  const list = draft ? insertDraft(rows, draft) : rows;

  const startDraft = (afterId: string | null, kind: DocRowKind) => {
    const d = { rowId: newDocId(), afterId, kind };
    setDraft(d);
    setFocusId(d.rowId);
  };

  const patch = (rowId: string, change: Partial<DocRowData>) => {
    const d = draftRef.current;
    if (d && d.rowId === rowId) {
      const text = change.text?.trim() ?? "";
      if (!text) {
        if (change.kind) setDraft({ ...d, kind: change.kind });
        return;
      }
      setDraft(null);
      committedRef.current = rowId;
      onChange(insertDraft(rows, d, text).map((r) => (r.rowId === rowId ? withoutUndefined({ ...r, ...change, text }) : r)));
      return;
    }
    if (change.text !== undefined && !change.text.trim()) return;
    onChange(rows.map((r) => (r.rowId === rowId ? withoutUndefined({ ...r, ...change }) : r)));
  };

  const remove = (rowId: string) => {
    if (draftRef.current?.rowId === rowId) { setDraft(null); return; }
    const next = rows.filter((r) => r.rowId !== rowId);
    if (next.length !== rows.length) onChange(next);
  };

  const onEditEnd = (rowId: string) => {
    setFocus((cur) => (cur?.rowId === rowId ? null : cur));
    if (draftRef.current?.rowId === rowId) setDraft(null);
  };

  const indexOf = (rowId: string) => list.findIndex((r) => r.rowId === rowId);
  const focusNeighbour = (rowId: string, delta: number) => {
    const i = indexOf(rowId);
    const next = list[i + delta];
    if (next) setFocusId(next.rowId);
  };

  const swap = (rowId: string, delta: number) => {
    const i = rows.findIndex((r) => r.rowId === rowId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  // The category of the nearest sous_titre above, when it names a recipe category.
  const categoryFor = (index: number): string | undefined => {
    if (!categories?.length) return undefined;
    for (let i = index - 1; i >= 0; i--) {
      const r = list[i];
      if (r.kind !== "sous_titre") continue;
      const key = fold(r.text);
      return categories.find((c) => fold(c) === key);
    }
    return undefined;
  };

  const drop = (beforeId: string) => {
    if (dragId && dragId !== beforeId) onChange(moveRow(rows, dragId, beforeId));
    setDragId(null);
    setDropTarget(null);
  };

  return (
    <div className={className}>
      {list.map((row, i) => {
        const persisted = row.rowId !== draft?.rowId;
        return (
          <DocRow
            key={row.rowId}
            row={row}
            priceList={priceList}
            sectionUnitLabel={sectionUnitLabel}
            readOnly={readOnly}
            focused={focus?.rowId === row.rowId}
            focusTick={focus?.tick}
            onEditEnd={() => onEditEnd(row.rowId)}
            recipes={recipes}
            recipeCategory={categoryFor(i)}
            otherSections={persisted ? otherSections : undefined}
            canMoveUp={persisted && i > 0}
            canMoveDown={persisted && i < list.length - 1}
            onChange={(change) => patch(row.rowId, change)}
            onEnter={() => {
              // Enter on a still-empty draft keeps it where it is (the edit end just discarded it).
              if (!persisted && draft && committedRef.current !== row.rowId) { setDraft({ ...draft, kind: row.kind }); setFocusId(row.rowId); return; }
              startDraft(row.rowId, "plat");
            }}
            onBackspaceEmpty={() => {
              const prev = list[i - 1];
              remove(row.rowId);
              if (prev) setFocusId(prev.rowId);
            }}
            onArrowUp={() => focusNeighbour(row.rowId, -1)}
            onArrowDown={() => focusNeighbour(row.rowId, 1)}
            onInsertExample={persisted ? () => startDraft(row.rowId, "exemple") : undefined}
            onMoveUp={() => swap(row.rowId, -1)}
            onMoveDown={() => swap(row.rowId, 1)}
            onMoveTo={persisted && onMoveRowTo ? (sectionId) => onMoveRowTo(row, sectionId) : undefined}
            onRemove={() => remove(row.rowId)}
            onCreateRecipe={onCreateRecipe && persisted ? (name, category) => onCreateRecipe(row.rowId, name, category) : undefined}
            drag={readOnly || !persisted ? undefined : {
              dragging: dragId === row.rowId || lift.item?.rowId === row.rowId,
              dropBefore: (dropTarget ?? lift.target) === row.rowId && (dragId ?? lift.item?.rowId) !== row.rowId,
              onDragStart: () => setDragId(row.rowId),
              onDragEnd: () => { setDragId(null); setDropTarget(null); },
              onDragOver: () => setDropTarget(row.rowId),
              onDrop: () => drop(row.rowId),
              lift: touch ? lift.handlers(row) : undefined,
            }}
          />
        );
      })}
      {!readOnly && (
        <div
          data-drop-day={END_TARGET}
          className={cn("mt-0.5", (dropTarget ?? lift.target) === END_TARGET && "shadow-[0_-2px_0_0_var(--primary)]")}
          onDragOver={!touch && dragId ? (e) => { e.preventDefault(); setDropTarget(END_TARGET); } : undefined}
          onDrop={!touch && dragId ? (e) => { e.preventDefault(); drop(END_TARGET); } : undefined}
        >
          <Button variant="ghost" size="sm" icon={<Plus />} className="text-muted-foreground" onClick={() => startDraft(null, "plat")}>
            {addLabel}
          </Button>
        </div>
      )}
      {lift.item && <RowGhost point={lift.ghost} label={lift.item.text} />}
    </div>
  );
}
