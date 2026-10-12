import { useRef } from "react";
import { ChevronDown } from "lucide-react";
import { rangeLabel } from "@packages/types";

export interface WeekPickerProps {
  from: string;
  to: string;
  // The date the hidden input holds, the Thursday of the week.
  value: string;
  onChange: (date: string) => void;
  className?: string;
}

// The range label as a button; the native date picker sits in a visually hidden input next to it.
export default function WeekPicker({ from, to, value, onChange, className = "" }: WeekPickerProps) {
  const input = useRef<HTMLInputElement>(null);

  const open = () => {
    const el = input.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") el.showPicker();
      else el.focus();
    } catch {
      el.focus();
    }
  };

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={open}
        aria-label={`Choisir la semaine, ${rangeLabel(from, to)}`}
        className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-base text-foreground hover:bg-hover"
      >
        {rangeLabel(from, to)}
        <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </button>
      <input
        ref={input}
        type="date"
        value={value}
        onChange={(e) => { if (e.target.value) onChange(e.target.value); }}
        aria-label="Date dans la semaine"
        tabIndex={-1}
        className="sr-only absolute bottom-0 left-0"
      />
    </span>
  );
}
