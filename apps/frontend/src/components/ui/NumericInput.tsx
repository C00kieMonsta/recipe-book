import { useState, useEffect } from "react";

interface NumericInputProps {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  placeholder?: string;
  suffix?: string;
  autoFocus?: boolean;
  min?: number;
}

export default function NumericInput({ value, onChange, className = "", placeholder, suffix, autoFocus, min }: NumericInputProps) {
  const [text, setText] = useState(value ? String(value) : "");

  useEffect(() => {
    const parsed = parseFloat(text);
    if (isNaN(parsed) || parsed !== value) {
      setText(value ? String(value) : "");
    }
  }, [value]);

  const commit = (raw: string) => {
    const cleaned = raw.replace(",", ".");
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) { onChange(min ?? 0); return; }
    onChange(min !== undefined ? Math.max(min, parsed) : parsed);
  };

  return (
    <div className={suffix ? "flex items-center justify-end gap-1" : ""}>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "" || /^-?\d*[.,]?\d*$/.test(v)) setText(v);
        }}
        onBlur={() => commit(text)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(text); (e.target as HTMLInputElement).blur(); } }}
        className={className}
      />
      {suffix && <span className="text-muted-foreground text-xs w-4">{suffix}</span>}
    </div>
  );
}
