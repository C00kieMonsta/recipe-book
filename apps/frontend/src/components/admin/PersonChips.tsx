import type { Person } from "@packages/types";
import { personInitials, personName } from "@packages/types";
import { UserPlus } from "lucide-react";

export type PersonChipSize = "sm" | "md";

const SIZE: Record<PersonChipSize, string> = {
  sm: "h-5 w-5 text-caption",
  md: "h-6 w-6 text-caption",
};

const CIRCLE = "inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium leading-none";

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
      className={`${CIRCLE} ${person ? "text-foreground" : "text-muted-foreground"} ${SIZE[size]} ${className}`}
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

  const inner = (
    <span className={`inline-flex items-center -space-x-1 ${inherited ? "opacity-50" : ""}`}>
      {shown.map((id) => (
        <PersonChip key={id} personId={id} people={people} size={size} className="ring-1 ring-background" />
      ))}
      {extra > 0 && (
        <span className={`${CIRCLE} text-muted-foreground ring-1 ring-background ${SIZE[size]}`} aria-hidden="true">
          +{extra}
        </span>
      )}
      {personIds.length === 0 && onClick && (
        <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-divider text-icon ${SIZE[size]}`}>
          <UserPlus className="h-3 w-3" />
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
      className={`inline-flex h-7 shrink-0 items-center justify-center rounded px-0.5 hover:bg-hover touch:h-11 ${className}`}
    >
      {inner}
    </button>
  );
}
