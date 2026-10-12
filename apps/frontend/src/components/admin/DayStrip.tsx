import { parseYmd } from "@packages/types";

export interface DayStripProps {
  dates: string[];
  // Event count per date; blank when 0.
  counts: Record<string, number>;
  today: string;
  onPick: (date: string) => void;
  className?: string;
}

const LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

const longDay = new Intl.DateTimeFormat("fr-BE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

// Seven 44px cells, one per day; a tap scrolls that day into view.
export default function DayStrip({ dates, counts, today, onPick, className = "" }: DayStripProps) {
  return (
    <div role="group" aria-label="Jours de la semaine" className={`grid grid-cols-7 ${className}`}>
      {dates.map((date, i) => {
        const isToday = date === today;
        const n = counts[date] ?? 0;
        return (
          <button
            key={date}
            type="button"
            onClick={() => onPick(date)}
            aria-label={longDay.format(parseYmd(date))}
            aria-current={isToday ? "date" : undefined}
            className={`flex min-h-11 flex-col items-center justify-center rounded-lg leading-none ${isToday ? "bg-primary-soft" : "hover:bg-hover"}`}
          >
            <span className="text-caption leading-none text-muted-foreground">{LETTERS[i]}</span>
            <span className="text-base font-semibold leading-none tabular-nums">{Number(date.slice(8, 10))}</span>
            <span className={`text-caption leading-none tabular-nums ${n ? "text-muted-foreground" : "text-transparent"}`}>{n || "0"}</span>
          </button>
        );
      })}
    </div>
  );
}
