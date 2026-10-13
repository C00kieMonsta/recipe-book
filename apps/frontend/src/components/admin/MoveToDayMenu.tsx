import { useRef, type RefObject } from "react";
import { shortDayLabel } from "@packages/types";
import { Menu, MenuItem, MenuRadio, MenuSeparator } from "@/components/ui/Menu";

export const OTHER_DATE = "__autre__";

export interface MoveToDayMenuProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement>;
  align?: "left" | "right";
  // "Déplacer « Poulet basquaise »"
  title: string;
  eventDate: string;
  // Current prep day.
  current: string;
  // Days listed in ascending order: the displayed week on the week and day pages, the seven days ending on the event day elsewhere.
  days: string[];
  // date === eventDate means "le jour même"; the caller sends prepDate: null for a line.
  onPick: (date: string) => void;
}

// Shared with the fiche SelectPill: the event day first, the other days, then "Autre date…".
export function moveDayOptions(eventDate: string, days: string[]): { value: string; label: string }[] {
  return [
    { value: eventDate, label: `Le jour même · ${shortDayLabel(eventDate)}` },
    ...days.filter((d) => d !== eventDate).map((d) => ({ value: d, label: shortDayLabel(d) })),
    { value: OTHER_DATE, label: "Autre date…" },
  ];
}

export default function MoveToDayMenu({ open, onClose, anchorRef, align = "left", title, eventDate, current, days, onPick }: MoveToDayMenuProps) {
  const input = useRef<HTMLInputElement>(null);
  const options = moveDayOptions(eventDate, days).filter((o) => o.value !== OTHER_DATE);

  const openPicker = () => {
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
    <Menu open={open} onClose={onClose} anchorRef={anchorRef} align={align} title={title} aria-label={title}>
      {options.map((o) => (
        <MenuRadio key={o.value} checked={o.value === current} onSelect={() => onPick(o.value)}>
          {o.label}
        </MenuRadio>
      ))}
      <MenuSeparator />
      <div className="relative">
        <MenuItem onSelect={openPicker} closeOnSelect={false}>Autre date…</MenuItem>
        <input
          ref={input}
          type="date"
          value={current}
          onChange={(e) => { if (e.target.value) { onPick(e.target.value); onClose(); } }}
          aria-label="Choisir une date"
          tabIndex={-1}
          className="sr-only absolute bottom-0 left-0"
        />
      </div>
      <p className="text-caption text-muted-foreground px-3 pb-2">Les courses restent celles de l'événement.</p>
    </Menu>
  );
}
