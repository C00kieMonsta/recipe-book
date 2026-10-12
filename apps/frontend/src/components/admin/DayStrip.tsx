import { Link } from "react-router-dom";
import { parseYmd } from "@packages/types";

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
}

const LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

const longDay = new Intl.DateTimeFormat("fr-BE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

// Seven 44px cells, one per day; a tap opens that day.
export default function DayStrip({ dates, counts, today, selected, href, state, className = "" }: DayStripProps) {
  return (
    <div role="group" aria-label="Jours de la semaine" className={`grid grid-cols-7 ${className}`}>
      {dates.map((date, i) => {
        const isToday = date === today;
        const isSelected = date === selected;
        const n = counts[date] ?? 0;
        return (
          <Link
            key={date}
            to={href(date)}
            state={state}
            aria-label={longDay.format(parseYmd(date))}
            aria-current={isSelected ? "page" : isToday ? "date" : undefined}
            className={`relative flex min-h-11 flex-col items-center justify-center rounded-lg leading-none ${isToday ? "bg-selected" : "hover:bg-hover"} ${isSelected ? "font-semibold after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-full after:bg-primary" : ""}`}
          >
            <span className={`text-caption leading-none ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>{LETTERS[i]}</span>
            <span className="text-base font-semibold leading-none tabular-nums">{Number(date.slice(8, 10))}</span>
            <span className={`text-caption leading-none tabular-nums ${!n ? "text-transparent" : isSelected ? "text-foreground" : "text-muted-foreground"}`}>{n || "0"}</span>
          </Link>
        );
      })}
    </div>
  );
}
