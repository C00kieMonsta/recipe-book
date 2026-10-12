import { useState, useRef, useEffect } from "react";
import type { KeyboardEvent } from "react";

export interface SearchSelectOption {
  value: string;
  label: string;
  detail?: string;
}

export interface SearchSelectProps {
  options: SearchSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onCreateNew?: (query: string) => void;
  autoFocus?: boolean;
  id?: string;
}

const ROW = "mx-1 flex h-7 items-center justify-between gap-2 rounded px-2 text-left text-sm hover:bg-hover touch:h-11 touch:text-base";

export default function SearchSelect({ options, value, onChange, placeholder = "Rechercher…", className = "", onCreateNew, autoFocus, id }: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const selected = options.find((o) => o.value === value);
  const trimmed = query.trim();
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;
  const canCreate = Boolean(onCreateNew && trimmed);
  const rowCount = filtered.length + (canCreate ? 1 : 0);

  const close = () => { setOpen(false); setQuery(""); setActive(-1); };
  const select = (v: string) => { onChange(v); close(); };
  const create = () => { onCreateNew?.(trimmed); close(); };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { close(); inputRef.current?.blur(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((a) => Math.min(a + 1, rowCount - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      if (active >= 0 && active < filtered.length) { e.preventDefault(); select(filtered[active].value); inputRef.current?.blur(); return; }
      if (active === filtered.length && canCreate) { e.preventDefault(); create(); inputRef.current?.blur(); return; }
      if (filtered.length === 1) { e.preventDefault(); select(filtered[0].value); inputRef.current?.blur(); }
    }
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className="input-field"
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={open ? query : selected?.label || ""}
        onFocus={() => { setOpen(true); setQuery(""); setActive(-1); }}
        onChange={(e) => { setQuery(e.target.value); setActive(-1); }}
        onKeyDown={onKeyDown}
      />
      {open && rowCount > 0 && (
        <div ref={listRef} role="listbox" className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg bg-background py-1 shadow-menu">
          {filtered.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              data-active={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => select(opt.value)}
              className={`${ROW} ${i === active ? "bg-hover" : ""} ${opt.value === value ? "font-medium" : ""}`}
            >
              <span className="truncate">{opt.label}</span>
              {opt.detail && <span className="shrink-0 text-caption text-muted-foreground">{opt.detail}</span>}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              role="option"
              aria-selected={false}
              data-active={active === filtered.length}
              onMouseEnter={() => setActive(filtered.length)}
              onClick={create}
              className={`${ROW} mt-1 rounded-none border-t border-border pt-1 text-primary ${active === filtered.length ? "bg-hover" : ""}`}
            >
              + Créer « {trimmed} »
            </button>
          )}
        </div>
      )}
    </div>
  );
}
