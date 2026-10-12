import { useRef, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Button, { IconButton } from "./Button";

export interface DateNavProps {
  label: ReactNode;
  onPrev: () => void;
  onNext: () => void;
  // Receives the raw value of the native input: "2026-10-17", "2026-W43" or "2026-10".
  onPick?: (value: string) => void;
  // Value held by the hidden native input.
  value?: string;
  pickerType?: "date" | "week" | "month";
  isToday?: boolean;
  onToday?: () => void;
  todayLabel?: string;
  className?: string;
  "aria-label"?: string;
}

export default function DateNav({ label, onPrev, onNext, onPick, value, pickerType = "date", isToday = false, onToday, todayLabel = "Aujourd'hui", className, "aria-label": ariaLabel }: DateNavProps) {
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
    <div className={cn("inline-flex items-center gap-0.5", className)} role="group" aria-label={ariaLabel ?? "Période"}>
      <IconButton size="sm" aria-label="Précédent" onClick={onPrev} icon={<ChevronLeft />} />
      <span className="relative inline-flex">
        <button
          type="button"
          onClick={onPick ? open : undefined}
          aria-haspopup={onPick ? "dialog" : undefined}
          className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded px-2 text-sm font-medium hover:bg-hover touch:h-11 touch:text-base"
        >
          {label}
          {onPick && <ChevronDown className="h-3.5 w-3.5 text-icon" aria-hidden="true" />}
        </button>
        {onPick && (
          <input
            ref={input}
            type={pickerType}
            value={value ?? ""}
            onChange={(e) => { if (e.target.value) onPick(e.target.value); }}
            aria-label="Choisir une date"
            tabIndex={-1}
            className="sr-only absolute bottom-0 left-0"
          />
        )}
      </span>
      <IconButton size="sm" aria-label="Suivant" onClick={onNext} icon={<ChevronRight />} />
      {onToday && !isToday && (
        <Button variant="subtle" size="sm" onClick={onToday}>{todayLabel}</Button>
      )}
    </div>
  );
}
