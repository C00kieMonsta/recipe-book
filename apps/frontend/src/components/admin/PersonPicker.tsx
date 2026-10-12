import { useEffect, useRef, useState } from "react";
import type { Person } from "@packages/types";
import { X } from "lucide-react";
import PersonChips, { PersonChip, type PersonChipSize } from "./PersonChips";

function useTouchScreen(): boolean {
  const [touch, setTouch] = useState(() => typeof window !== "undefined" && window.matchMedia("(hover: none)").matches);
  useEffect(() => {
    const mql = window.matchMedia("(hover: none)");
    const onChange = () => setTouch(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return touch;
}

export interface PersonPickerProps {
  value: string[];
  options: Person[];
  onChange: (next: string[]) => void;
  // Line context: the empty row reads "Comme l'événement" instead of "Personne".
  allowInherit?: boolean;
  // Renders a "Suivant" button, used by the AssignSheet walk.
  onNext?: () => void;
  onClose: () => void;
  title?: string;
  // Popover side on pointer screens.
  align?: "left" | "right";
  className?: string;
}

// Checkbox rows of 44px; renders a popover on pointer screens and a bottom sheet on touch screens.
// Mount it inside a `relative` element next to the chips; the parent owns the open state.
export default function PersonPicker({ value, options, onChange, allowInherit = false, onNext, onClose, title = "Assigner", align = "left", className = "" }: PersonPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const touch = useTouchScreen();
  const active = options.filter((p) => p.active);
  const unknown = value.filter((id) => !options.some((p) => p.personId === id));

  useEffect(() => {
    const down = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("touchstart", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("touchstart", down);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  const rows = (
    <div role="group" aria-label={title}>
      {active.map((p) => {
        const checked = value.includes(p.personId);
        return (
          <label key={p.personId} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-base hover:bg-hover">
            <input type="checkbox" className="h-5 w-5 rounded border-input accent-primary" checked={checked} onChange={() => toggle(p.personId)} />
            <PersonChip personId={p.personId} people={options} size="md" />
            <span className="truncate">{p.name}</span>
          </label>
        );
      })}
      {unknown.map((id) => (
        <label key={id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-base text-muted-foreground hover:bg-hover">
          <input type="checkbox" className="h-5 w-5 rounded border-input accent-primary" checked onChange={() => toggle(id)} />
          <PersonChip personId={id} people={options} size="md" />
          <span className="truncate">{id}</span>
        </label>
      ))}
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-base text-muted-foreground hover:bg-hover">
        <input type="checkbox" className="h-5 w-5 rounded border-input accent-primary" checked={value.length === 0} onChange={() => onChange([])} />
        <span>{allowInherit ? "Comme l'événement" : "Personne"}</span>
      </label>
      {onNext && (
        <div className="px-2 pt-1">
          <button
            type="button"
            onClick={onNext}
            className="w-full min-h-11 rounded-lg bg-primary text-base font-semibold text-primary-foreground hover:opacity-90"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );

  if (touch) {
    return (
      <div className="fixed inset-0 z-50 flex items-end bg-overlay" role="presentation">
        <div ref={ref} role="dialog" aria-label={title} className={`w-full rounded-t-2xl bg-card p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-xl animate-fade-up ${className}`}>
          <div className="flex items-center justify-between px-3 py-1">
            <span className="text-base font-semibold">{title}</span>
            <button type="button" onClick={onClose} aria-label="Fermer" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-hover">
              <X className="h-5 w-5" />
            </button>
          </div>
          {rows}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      className={`card-elevated absolute top-full z-50 mt-1 min-w-[240px] p-1 shadow-lg animate-fade-up ${align === "right" ? "right-0" : "left-0"} ${className}`}
    >
      {rows}
    </div>
  );
}

export interface PersonAssignProps {
  value: string[];
  options: Person[];
  onChange: (next: string[]) => void;
  size?: PersonChipSize;
  inherited?: boolean;
  allowInherit?: boolean;
  title?: string;
  align?: "left" | "right";
  max?: number;
  className?: string;
}

// Chips that open the picker on tap; two taps assign one person.
export function PersonAssign({ value, options, onChange, size = "md", inherited = false, allowInherit = false, title, align, max, className = "" }: PersonAssignProps) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`relative inline-flex ${className}`}>
      <PersonChips personIds={value} people={options} size={size} inherited={inherited} max={max} onClick={() => setOpen((o) => !o)} />
      {open && (
        <PersonPicker value={value} options={options} onChange={onChange} allowInherit={allowInherit} onClose={() => setOpen(false)} title={title} align={align} />
      )}
    </span>
  );
}
