import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

export interface StepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  label?: string;
  className?: string;
}

const BTN = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-input bg-card text-foreground hover:bg-hover disabled:opacity-40 disabled:hover:bg-card";

export default function Stepper({ value, onChange, min = 1, label, className = "" }: StepperProps) {
  const [text, setText] = useState(String(value));

  useEffect(() => { setText(String(value)); }, [value]);

  const set = (n: number) => {
    const next = Math.max(min, Math.round(n));
    if (next !== value) onChange(next);
  };

  const commit = () => {
    const parsed = parseInt(text.replace(",", "."), 10);
    if (isNaN(parsed)) { setText(String(value)); return; }
    set(parsed);
    setText(String(Math.max(min, parsed)));
  };

  return (
    <div className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      <div className="inline-flex items-center gap-1">
        <button type="button" className={BTN} onClick={() => set(value - 1)} disabled={value <= min} aria-label="Moins">
          <Minus className="h-5 w-5" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={label ?? "Quantité"}
          value={text}
          onChange={(e) => { if (/^\d*$/.test(e.target.value)) setText(e.target.value); }}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
          className="min-h-11 w-16 rounded-lg border border-input bg-card text-center text-base font-semibold tabular-nums outline-none focus:border-primary focus:shadow-ring"
        />
        <button type="button" className={BTN} onClick={() => set(value + 1)} aria-label="Plus">
          <Plus className="h-5 w-5" />
        </button>
      </div>
      {label && <span className="text-base text-muted-foreground">{label}</span>}
      <div className="inline-flex items-center gap-1">
        <button type="button" className={`${BTN} px-2 text-sm font-semibold`} onClick={() => set(value * 2)} aria-label="Doubler">
          ×2
        </button>
        <button type="button" className={`${BTN} px-2 text-sm font-semibold`} onClick={() => set(value / 2)} disabled={value <= min} aria-label="Diviser par deux">
          ÷2
        </button>
      </div>
    </div>
  );
}
