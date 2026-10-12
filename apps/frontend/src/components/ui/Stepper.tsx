import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

export interface StepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  label?: string;
  className?: string;
}

const BTN = "inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-hover hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent touch:h-11 touch:w-11";
const TEXT_BTN = "inline-flex h-7 items-center rounded px-1.5 text-sm text-muted-foreground hover:bg-hover hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent touch:h-11 touch:px-3 touch:text-base";

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
      <div className="inline-flex items-center gap-0.5">
        <button type="button" className={BTN} onClick={() => set(value - 1)} disabled={value <= min} aria-label="Moins">
          <Minus className="h-4 w-4 touch:h-5 touch:w-5" />
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
          className="h-7 w-12 rounded bg-input-bg text-center text-sm font-medium tabular-nums shadow-input outline-none focus:shadow-ring touch:h-11 touch:w-14 touch:text-base"
        />
        <button type="button" className={BTN} onClick={() => set(value + 1)} aria-label="Plus">
          <Plus className="h-4 w-4 touch:h-5 touch:w-5" />
        </button>
      </div>
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
      <div className="inline-flex items-center gap-0.5">
        <button type="button" className={TEXT_BTN} onClick={() => set(value * 2)} aria-label="Doubler">
          ×2
        </button>
        <button type="button" className={TEXT_BTN} onClick={() => set(value / 2)} disabled={value <= min} aria-label="Diviser par deux">
          ÷2
        </button>
      </div>
    </div>
  );
}
