import { useState, useEffect, useRef, type RefObject } from "react";
import { fmtEur } from "@packages/types";
import { cn } from "@/lib/utils";
import NumericInput from "./NumericInput";
import SelectPill from "./SelectPill";

const EDIT_INPUT = "-mx-1.5 w-full min-w-0 rounded border-0 bg-input-bg px-1.5 shadow-ring outline-none";

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
      className="input-field w-20 text-right tabular-nums"
    />
  );
}

// Click to edit in place; Enter commits, Escape reverts, blur commits.
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
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => { if (!editing) setText(value); }, [value, editing]);
  useEffect(() => {
    if (!editing || !ref.current) return;
    const el = ref.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    if (el instanceof HTMLTextAreaElement) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (text !== value) onSave(text);
  };
  const revert = () => { setText(value); setEditing(false); };

  if (editing) {
    if (multiline) {
      return (
        <textarea
          ref={ref as RefObject<HTMLTextAreaElement>}
          className={cn(className, inputClassName, EDIT_INPUT, "resize-none py-0.5 leading-normal")}
          value={text}
          rows={2}
          onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); revert(); } }}
        />
      );
    }
    return (
      <input
        ref={ref as RefObject<HTMLInputElement>}
        className={cn(className, inputClassName, EDIT_INPUT)}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); revert(); }
        }}
      />
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(className, "prop-value touch:inline-flex touch:min-h-11 touch:items-center", multiline && "whitespace-pre-wrap", !value && placeholder && "text-placeholder")}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditing(true); } }}
    >
      {value || placeholder || "Vide"}
    </div>
  );
}

const INLINE_INPUT = "-mx-1 w-32 rounded border-0 bg-input-bg px-1 font-medium shadow-ring outline-none";

export function EditableInlineText({ value, onSave, placeholder }: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  useEffect(() => { if (!editing) setText(value); }, [value, editing]);

  const commit = () => {
    setEditing(false);
    if (text !== value) onSave(text);
  };

  if (editing) {
    return (
      <input
        className={INLINE_INPUT}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); setText(value); setEditing(false); }
        }}
        autoFocus
      />
    );
  }

  return (
    <strong
      role="button"
      tabIndex={0}
      className="prop-value font-medium touch:inline-flex touch:min-h-11 touch:items-center"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditing(true); } }}
    >
      {value || <span className="font-normal text-placeholder">{placeholder || "Vide"}</span>}
    </strong>
  );
}

const fmtNum = (n: number) => new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 2 }).format(n);

export function EditableInlineNum({ value, onSave, suffix, min, step, placeholder }: {
  // Undefined shows the placeholder; callers that pass a number are unchanged.
  value: number | undefined;
  onSave: (v: number) => void;
  suffix?: string;
  min?: number;
  // The typed number is rounded to the nearest multiple on commit.
  step?: number;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const money = suffix?.trim() === "€";

  useEffect(() => { if (!editing) setText(value === undefined ? "" : String(value)); }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const cleaned = text.replace(",", ".");
    const parsed = parseFloat(cleaned);
    // An empty field on an unset value stays unset.
    if (isNaN(parsed) && value === undefined) return;
    const clamped = isNaN(parsed) ? 0 : (min !== undefined ? Math.max(min, parsed) : parsed);
    const final = step ? Math.round(clamped / step) * step : clamped;
    if (final !== value) onSave(final);
  };
  const revert = () => { setText(value === undefined ? "" : String(value)); setEditing(false); };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <input
          className={cn(INLINE_INPUT, "w-16 text-right tabular-nums")}
          type="text"
          inputMode="decimal"
          step={step}
          value={text}
          onChange={(e) => { if (e.target.value === "" || /^-?\d*[.,]?\d*$/.test(e.target.value)) setText(e.target.value); }}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { e.preventDefault(); revert(); }
          }}
          autoFocus
        />
        {suffix && <span>{suffix}</span>}
      </span>
    );
  }

  return (
    <strong
      role="button"
      tabIndex={0}
      className="prop-value font-medium tabular-nums touch:inline-flex touch:min-h-11 touch:items-center"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditing(true); } }}
    >
      {value === undefined
        ? <span className="font-normal text-placeholder">{placeholder ?? "Vide"}</span>
        : money ? fmtEur(value) : `${fmtNum(value)}${suffix || ""}`}
    </strong>
  );
}

export function EditableType({ value, options, onSave }: { value: string; options: string[]; onSave: (v: string) => void }) {
  const opts = options.includes(value) || !value ? options : [value, ...options];
  return (
    <SelectPill
      value={value}
      options={opts.map((o) => ({ value: o, label: o }))}
      onChange={(v) => { if (v !== value) onSave(v); }}
      colour="gray"
      placeholder="Choisir"
      aria-label="Type"
    />
  );
}

const EVENT_STATUS_OPTIONS = [
  { value: "upcoming", label: "À venir", colour: "blue" as const },
  { value: "completed", label: "Terminé", colour: "green" as const },
];

export function EditableStatus({ value, onSave }: { value: "upcoming" | "completed"; onSave: (v: "upcoming" | "completed") => void }) {
  return (
    <SelectPill
      value={value}
      options={EVENT_STATUS_OPTIONS}
      onChange={(v) => { if (v !== value) onSave(v as "upcoming" | "completed"); }}
      aria-label="Statut"
    />
  );
}
