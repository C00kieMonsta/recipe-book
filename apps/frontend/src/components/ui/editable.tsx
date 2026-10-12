import { useState, useEffect, useRef } from "react";
import NumericInput from "./NumericInput";

export function EditableNum({ value, onChange, suffix, placeholder }: {
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <NumericInput
      value={value}
      onChange={onChange}
      suffix={suffix}
      placeholder={placeholder}
      className="w-20 text-right px-2 py-0.5 border rounded-md bg-background text-sm font-semibold tabular-nums focus:border-primary outline-none"
    />
  );
}

export function EditableText({ value, onSave, className, inputClassName, placeholder, multiline }: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  useEffect(() => { setText(value); }, [value]);

  const commit = () => {
    setEditing(false);
    if (text !== value) onSave(text);
  };

  if (editing) {
    if (multiline) {
      return (
        <textarea
          className={inputClassName}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Escape") { setText(value); setEditing(false); } }}
          autoFocus
          rows={2}
        />
      );
    }
    return (
      <input
        className={inputClassName}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setText(value); setEditing(false); } }}
        autoFocus
      />
    );
  }

  return (
    <div
      className={`${className} cursor-pointer rounded px-1 -mx-1 hover:bg-hover transition-colors ${!value && placeholder ? "text-placeholder italic" : ""}`}
      onClick={() => setEditing(true)}
    >
      {value || placeholder || "–"}
    </div>
  );
}

export function EditableInlineText({ value, onSave, placeholder }: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  useEffect(() => { setText(value); }, [value]);

  const commit = () => {
    setEditing(false);
    if (text !== value) onSave(text);
  };

  if (editing) {
    return (
      <input
        className="border-b border-primary bg-transparent text-foreground font-semibold outline-none text-sm w-32"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setText(value); setEditing(false); } }}
        autoFocus
      />
    );
  }

  return (
    <strong
      className="text-foreground cursor-pointer hover:bg-hover rounded px-0.5 transition-colors"
      onClick={() => setEditing(true)}
    >
      {value || <span className="text-placeholder font-normal italic">{placeholder || "–"}</span>}
    </strong>
  );
}

export function EditableInlineNum({ value, onSave, suffix, min }: {
  value: number;
  onSave: (v: number) => void;
  suffix?: string;
  min?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));

  useEffect(() => { setText(String(value)); }, [value]);

  const commit = () => {
    setEditing(false);
    const cleaned = text.replace(",", ".");
    const parsed = parseFloat(cleaned);
    const final = isNaN(parsed) ? 0 : (min !== undefined ? Math.max(min, parsed) : parsed);
    if (final !== value) onSave(final);
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <input
          className="w-16 text-right px-1 py-0 border-b border-primary bg-transparent text-foreground font-semibold tabular-nums outline-none text-sm"
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => { if (e.target.value === "" || /^-?\d*[.,]?\d*$/.test(e.target.value)) setText(e.target.value); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setText(String(value)); setEditing(false); } }}
          autoFocus
        />
        {suffix && <span>{suffix}</span>}
      </span>
    );
  }

  return (
    <strong
      className="text-foreground cursor-pointer hover:bg-hover rounded px-0.5 transition-colors tabular-nums"
      onClick={() => setEditing(true)}
    >
      {value}{suffix || ""}
    </strong>
  );
}

export function EditableType({ value, options, onSave }: { value: string; options: string[]; onSave: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block mb-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center whitespace-nowrap rounded-sm bg-muted px-3 py-1 text-sm font-medium text-foreground transition-opacity hover:opacity-80"
      >
        {value}
      </button>
      {open && (
        <div role="listbox" className="absolute left-0 z-20 mt-1 overflow-hidden rounded-lg border bg-card shadow-lg">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={opt === value}
              onClick={() => { if (opt !== value) onSave(opt); setOpen(false); }}
              className={`flex min-h-11 w-full items-center whitespace-nowrap px-4 text-left text-base transition-colors hover:bg-hover ${opt === value ? "bg-muted font-semibold" : ""}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function EditableStatus({ value, onSave }: { value: "upcoming" | "completed"; onSave: (v: "upcoming" | "completed") => void }) {
  const toggle = () => onSave(value === "upcoming" ? "completed" : "upcoming");
  return (
    <button
      type="button"
      onClick={toggle}
      className={`mb-2 inline-flex items-center whitespace-nowrap rounded-sm px-2.5 py-0.5 text-sm font-medium transition-opacity hover:opacity-80 ${value === "upcoming" ? "bg-info-soft text-info" : "bg-success-soft text-success"}`}
    >
      {value === "upcoming" ? "À venir" : "Terminé"}
    </button>
  );
}
