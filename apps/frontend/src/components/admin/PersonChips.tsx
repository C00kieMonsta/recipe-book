import type { Person } from "@packages/types";
import { personInitials, personName } from "@packages/types";
import { UserPlus } from "lucide-react";

export type PersonChipSize = "sm" | "md";

const SIZE: Record<PersonChipSize, string> = {
  sm: "h-5 w-5 text-[10px]",
  md: "h-7 w-7 text-caption",
};

export interface PersonChipProps {
  personId: string;
  people: Person[];
  size?: PersonChipSize;
  className?: string;
}

// One initials circle; an unknown id shows the id itself in muted text.
export function PersonChip({ personId, people, size = "md", className = "" }: PersonChipProps) {
  const person = people.find((p) => p.personId === personId);
  const name = personName(people, personId);
  const text = person ? personInitials(person) : personId.slice(0, 2).toUpperCase();
  return (
    <span
      title={name}
      aria-label={name}
      role="img"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold leading-none ${
        person ? "text-foreground" : "text-muted-foreground"
      } ${SIZE[size]} ${className}`}
    >
      {text}
    </span>
  );
}

export interface PersonChipsProps {
  personIds: string[];
  people: Person[];
  size?: PersonChipSize;
  // Chips of a line that follows its event.
  inherited?: boolean;
  // When given the chips become a button; an empty list shows a dashed add circle.
  onClick?: () => void;
  // Chips shown before the "+n" overflow.
  max?: number;
  label?: string;
  className?: string;
}

export default function PersonChips({ personIds, people, size = "md", inherited = false, onClick, max = 3, label, className = "" }: PersonChipsProps) {
  const shown = personIds.slice(0, max);
  const extra = personIds.length - shown.length;
  const names = personIds.map((id) => personName(people, id)).join(", ");
  const ring = size === "sm" ? "ring-1" : "ring-2";

  const inner = (
    <span className={`inline-flex items-center ${size === "sm" ? "-space-x-1" : "-space-x-1.5"} ${inherited ? "opacity-60" : ""}`}>
      {shown.map((id) => (
        <PersonChip key={id} personId={id} people={people} size={size} className={`${ring} ring-card`} />
      ))}
      {extra > 0 && (
        <span
          className={`inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold leading-none text-muted-foreground ${ring} ring-card ${SIZE[size]}`}
          aria-hidden="true"
        >
          +{extra}
        </span>
      )}
      {personIds.length === 0 && onClick && (
        <span
          aria-hidden="true"
          className={`inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground text-muted-foreground ${SIZE[size]}`}
        >
          <UserPlus className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} />
        </span>
      )}
    </span>
  );

  if (!onClick) {
    if (personIds.length === 0) return null;
    return (
      <span className={`inline-flex items-center ${className}`} title={names} aria-label={label ?? names}>
        {inner}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      title={names || "Assigner"}
      aria-label={label ?? (names ? `Assigné à ${names}. Modifier` : "Assigner")}
      aria-haspopup="dialog"
      className={`inline-flex items-center justify-center rounded-lg px-1 hover:bg-hover ${
        size === "sm" ? "min-h-7 touch:min-h-11 touch:min-w-11" : "min-h-9 min-w-9 touch:min-h-11 touch:min-w-11"
      } ${className}`}
    >
      {inner}
    </button>
  );
}
