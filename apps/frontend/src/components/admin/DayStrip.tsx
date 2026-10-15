import { Link } from "react-router-dom";
import { parseYmd, shortDayLabel } from "@packages/types";
import { cn } from "@/lib/utils";

export interface DayStripProps {
  dates: string[];
  // Event count per date; blank when 0.
  counts: Record<string, number>;
  today: string;
  // The day page marks its own date.
  selected?: string;
  href: (date: string) => string;
  state?: unknown;
  className?: string;
  // Touch drag: the day under the finger gets the tint and the primary ring.
  dropDay?: string | null;
  // Touch drag in progress: every cell tints and the caption shows.
  dragging?: boolean;
}

const LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

const longDay = new Intl.DateTimeFormat("fr-BE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

// Seven 44px cells, one per day; a tap opens that day, a lifted row drops on it.
export default function DayStrip({ dates, counts, today, selected, href, state, className = "", dropDay, dragging = false }: DayStripProps) {
  return (
    <div role="group" aria-label="Jours de la semaine" className={`relative grid grid-cols-7 ${className}`}>
      {dates.map((date, i) => {
        const isToday = date === today;
        const isSelected = date === selected;
        const n = counts[date] ?? 0;
        const muted = isSelected ? "text-primary" : "text-muted-foreground";
        return (
          <Link
            key={date}
            to={href(date)}
            state={state}
            aria-label={longDay.format(parseYmd(date))}
            aria-current={isSelected ? "page" : isToday ? "date" : undefined}
            data-tour={isSelected ? "day-open" : undefined}
            data-drop-day={date}
            className={cn(
              "relative flex h-11 flex-col items-center justify-center gap-0.5 rounded hover:bg-hover",
              (isSelected || dragging) && "bg-selected",
              dropDay === date && "ring-2 ring-inset ring-primary",
            )}
          >
            <span className={`text-caption leading-none ${muted}`}>{LETTERS[i]}</span>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-sm font-medium leading-none tabular-nums touch:text-base ${isToday ? "bg-danger-solid text-white" : ""}`}>
              {Number(date.slice(8, 10))}
            </span>
            <span className={`text-caption leading-none tabular-nums ${n ? muted : "text-transparent"}`}>{n || "0"}</span>
          </Link>
        );
      })}
      {/* Floats under the strip so the rows do not shift under the finger. */}
      {dragging && (
        <p className={cn("absolute inset-x-0 top-full z-10 bg-background text-center text-caption leading-none", dropDay ? "font-medium text-primary" : "text-muted-foreground")}>
          {dropDay ? `Déposer sur ${shortDayLabel(dropDay)}` : "Déposez sur un jour"}
        </p>
      )}
    </div>
  );
}
