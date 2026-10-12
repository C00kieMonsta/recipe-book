import { useEffect, useRef, useState } from "react";
import type { Person } from "@packages/types";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Sheet from "@/components/ui/Sheet";
import PersonChips, { PersonChip, type PersonChipSize } from "./PersonChips";

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

const ROW = "flex h-8 w-auto items-center gap-2 rounded px-2 text-sm hover:bg-hover";
const ROW_TOUCH = "flex h-11 w-auto items-center gap-2 rounded-none px-4 text-base";

// Checkbox rows; a Menu panel on pointer screens and a bottom Sheet on touch screens.
// Mount it inside a `relative` element next to the chips; the parent owns the open state.
export default function PersonPicker({ value, options, onChange, allowInherit = false, onNext, onClose, title = "Assigner", align = "left", className = "" }: PersonPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const touch = useTouchScreen();
  const active = options.filter((p) => p.active);
  const unknown = value.filter((id) => !options.some((p) => p.personId === id));

  useEffect(() => {
    if (touch) return;
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
  }, [onClose, touch]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const row = touch ? ROW_TOUCH : ROW;

  const rows = (
    <div role="group" aria-label={title}>
      {active.map((p) => (
        <Checkbox
          key={p.personId}
          checked={value.includes(p.personId)}
          onChange={() => toggle(p.personId)}
          className={row}
          label={<span className="inline-flex items-center gap-2"><PersonChip personId={p.personId} people={options} size="sm" /><span className="truncate">{p.name}</span></span>}
        />
      ))}
      {unknown.map((id) => (
        <Checkbox
          key={id}
          checked
          onChange={() => toggle(id)}
          className={`${row} text-muted-foreground`}
          label={<span className="inline-flex items-center gap-2"><PersonChip personId={id} people={options} size="sm" /><span className="truncate">{id}</span></span>}
        />
      ))}
      <Checkbox
        shape="circle"
        checked={value.length === 0}
        onChange={() => onChange([])}
        className={`${row} text-muted-foreground`}
        label={allowInherit ? "Comme l'événement" : "Personne"}
      />
      {onNext && (
        <div className={touch ? "px-4 pt-2" : "px-1 pt-1"}>
          <Button variant="primary" size="sm" className="w-full" onClick={onNext}>Suivant</Button>
        </div>
      )}
    </div>
  );

  if (touch) {
    return (
      <Sheet open onClose={onClose} title={title} aria-label={title} className={className}>
        <div className="pb-2">{rows}</div>
      </Sheet>
    );
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      className={`absolute top-full z-50 mt-1 min-w-[220px] rounded-lg bg-background p-1 shadow-menu animate-pop ${align === "right" ? "right-0" : "left-0"} ${className}`}
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
