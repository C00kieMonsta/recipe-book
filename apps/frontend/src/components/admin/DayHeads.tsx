import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import type { Person, WeekPlan } from "@packages/types";
import { dayLabel, longDayLabel, personName, shortDayLabel } from "@packages/types";
import { dayHeaderMeta, dayHeaderTitle } from "@/lib/use-planning-data";
import { cn } from "@/lib/utils";
import { PersonChip } from "@/components/admin/PersonChips";
import { IconButton } from "@/components/ui";

export interface DayHeadsProps {
  // Seven dates of the displayed week, from the URL; the row renders before data arrives.
  dates: string[];
  // weekPlan(events, monday, people); absent while loading (captions blank, same height).
  plan?: WeekPlan;
  // monday <= today; decides whether the « 0/1 faites » fragment shows.
  started: boolean;
  today: string;
  // Day page: the open day.
  selected?: string;
  href: (date: string) => string;
  // Target of the selected cell (back to the week).
  closeHref?: string;
  state?: unknown;
  newEventHref: (date: string) => string;
  people: Person[];
  selectedPerson?: string;
  onPersonFilter?: (personId: string) => void;
  // Touch drag: the day under the finger gets the tint and the primary ring.
  dropDay?: string | null;
  // Touch drag in progress: every cell tints and the caption shows.
  dragging?: boolean;
}

// The seven column heads of the week, one row shared by the week and the day page on cols.
export default function DayHeads({ dates, plan, started, today, selected, href, closeHref, state, newEventHref, people, selectedPerson, onPersonFilter, dropDay, dragging = false }: DayHeadsProps) {
  return (
    <div
      role="group"
      aria-label="Jours de la semaine"
      className="relative grid grid-cols-[repeat(7,minmax(0,1fr))] gap-2 bg-background pb-1"
    >
      {dates.map((date, i) => {
        const day = plan?.days[i];
        const isToday = date === today;
        const isSelected = date === selected;
        const past = date < today && !isSelected;
        const [dayName, dayNum] = dayLabel(date).split(" ");
        const dayPeople = plan?.peopleByDay[date] ?? [];
        return (
          <div
            key={date}
            data-tour={isSelected ? "day-open" : undefined}
            data-drop-day={date}
            className={cn(
              "group min-w-0 rounded",
              past && "opacity-60",
              (isSelected || dragging) && "bg-selected",
              dropDay === date && "ring-2 ring-inset ring-primary",
            )}
          >
            <div className="flex items-start gap-1">
              <Link
                to={isSelected && closeHref ? closeHref : href(date)}
                state={state}
                title={isSelected ? "Fermer le jour" : day ? dayHeaderTitle(day, started) : undefined}
                aria-current={isSelected ? "page" : undefined}
                data-tour={i === 0 ? "week-day" : undefined}
                className="min-w-0 flex-1 rounded px-1 hover:bg-hover"
              >
                <div className="flex h-7 items-center gap-1 text-sm font-semibold">
                  <span>{dayName}</span>
                  <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 tabular-nums ${isToday ? "bg-danger-solid text-white" : ""}`}>{dayNum}</span>
                </div>
                {/* A non-breaking space keeps the caption line while the plan loads. */}
                {dropDay === date ? (
                  <div className="truncate text-caption font-medium text-primary">Déposer ici</div>
                ) : (
                  <div className="truncate text-caption text-muted-foreground">{day ? dayHeaderMeta(day, started) : " "}</div>
                )}
              </Link>
              <IconButton size="sm" as={Link} to={newEventHref(date)} aria-label={`Nouvel événement le ${longDayLabel(date)}`} className="reveal mt-1" icon={<Plus />} />
            </div>
            {dayPeople.length > 0 && (
              <div className="flex h-7 items-center gap-0.5 px-1">
                <span className="mr-1 text-caption text-muted-foreground">Équipe</span>
                {dayPeople.slice(0, 4).map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selectedPerson === id}
                    aria-label={personName(people, id)}
                    title={`Filtrer sur ${personName(people, id)}`}
                    onClick={() => onPersonFilter?.(id)}
                    className={`rounded-full ${selectedPerson === id ? "shadow-[0_0_0_2px_#2383e2]" : ""}`}
                  >
                    <PersonChip personId={id} people={people} size="sm" />
                  </button>
                ))}
                {dayPeople.length > 4 && <span className="text-caption text-muted-foreground">+{dayPeople.length - 4}</span>}
              </div>
            )}
          </div>
        );
      })}
      {/* Takes the pb-1 gap instead of floating over the first card. */}
      {dragging && (
        <p className={cn("col-span-7 -mb-1 h-3 text-caption leading-none", dropDay ? "font-medium text-primary" : "text-muted-foreground")}>
          {dropDay ? `Déposer sur ${shortDayLabel(dropDay)}` : "Déposez sur un jour"}
        </p>
      )}
    </div>
  );
}
