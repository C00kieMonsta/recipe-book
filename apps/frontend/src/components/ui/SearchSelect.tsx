import { useState, useRef, useEffect } from "react";

export interface SearchSelectOption {
  value: string;
  label: string;
  detail?: string;
}

interface SearchSelectProps {
  options: SearchSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function SearchSelect({ options, value, onChange, placeholder = "Rechercher…", className = "" }: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.value === value);
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        className="w-full border rounded-md px-2 py-1 text-xs bg-background focus:border-primary outline-none"
        placeholder={placeholder}
        value={open ? query : selected?.label || ""}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
          if (e.key === "Enter" && filtered.length === 1) {
            onChange(filtered[0].value);
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-card border rounded-lg shadow-lg max-h-48 overflow-auto">
          {filtered.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); setQuery(""); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex justify-between items-center gap-2 ${opt.value === value ? "bg-muted/50 font-semibold" : ""}`}
            >
              <span className="truncate">{opt.label}</span>
              {opt.detail && <span className="text-muted-foreground text-[11px] shrink-0">{opt.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
