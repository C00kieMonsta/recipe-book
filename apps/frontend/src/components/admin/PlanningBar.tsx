import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import DayStrip from "@/components/admin/DayStrip";
import WeekPicker from "@/components/admin/WeekPicker";

const ICON_BTN = "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-hover";
const TODAY_BTN = "inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-base font-medium text-primary hover:bg-hover";
// Hidden on phones, where the top bar already carries the same back link.
const BACK_BTN = "hidden md:inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-border bg-primary-soft pl-2 pr-3 text-base font-medium text-foreground hover:opacity-90";

interface Common {
  // The seven dates of the week shown in the strip.
  dates: string[];
  counts: Record<string, number>;
  today: string;
  weekNo: number;
  // Target of a strip cell.
  dayHref: (date: string) => string;
  linkState?: unknown;
  // Right side of row 1 from xl.
  right?: ReactNode;
  // Rendered under row 1 below xl.
  below?: ReactNode;
  // Rendered at the end of row 1 on phones only (the week's "⋯").
  phoneTrailing?: ReactNode;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
}

interface WeekMode extends Common {
  view: "week";
  prevHref: string;
  nextHref: string;
  todayHref?: string;
  range: { from: string; to: string; value: string; onChange: (date: string) => void };
  // Target of the "Jour" segment.
  dayViewHref: string;
}

interface DayMode extends Common {
  view: "day";
  date: string;
  // Target of the back button and the "Semaine" segment.
  weekHref: string;
  prevHref: string;
  nextHref: string;
  todayHref?: string;
}

export type PlanningBarProps = WeekMode | DayMode;

// Same two rows on the week and the day page: navigation, then the seven-day strip.
export default function PlanningBar(props: PlanningBarProps) {
  const navigate = useNavigate();
  const { dates, counts, today, weekNo, dayHref, linkState, right, below, phoneTrailing, onTouchStart, onTouchEnd } = props;
  const isWeek = props.view === "week";
  const weekTarget = isWeek ? undefined : props.weekHref;
  const dayTarget = isWeek ? props.dayViewHref : undefined;

  const segment = (active: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      aria-pressed={active}
      onClick={active ? undefined : onClick}
      className={`min-h-11 rounded-md px-3 text-base font-medium ${active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-hover"}`}
    >
      {label}
    </button>
  );
  const switcher = (
    <div role="group" aria-label="Affichage" className="inline-flex shrink-0 rounded-lg border border-border bg-card p-0.5">
      {segment(isWeek, "Semaine", () => weekTarget && navigate(weekTarget))}
      {segment(!isWeek, "Jour", () => dayTarget && navigate(dayTarget, { state: linkState }))}
    </div>
  );
  const todayLink = props.todayHref && (
    <Link to={props.todayHref} state={linkState} className={TODAY_BTN}>Aujourd'hui</Link>
  );

  // Two siblings, not one wrapper: the strip sticks to the page, not to the bar.
  return (
    <>
      {/* Row 1: one line from md; on phones the switcher and "Aujourd'hui" drop to a second line */}
      <div className="no-print flex min-h-14 flex-wrap items-center gap-x-2 gap-y-1 md:flex-nowrap md:gap-x-3" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {isWeek ? (
          <div className="flex shrink-0 items-center">
            <Link to={props.prevHref} state={linkState} aria-label="Semaine précédente" className={ICON_BTN}><ChevronLeft className="h-6 w-6" /></Link>
            <h1 className="whitespace-nowrap px-1 font-serif text-h2">Semaine {weekNo}</h1>
            <Link to={props.nextHref} state={linkState} aria-label="Semaine suivante" className={ICON_BTN}><ChevronRight className="h-6 w-6" /></Link>
          </div>
        ) : (
          <>
            <Link to={props.weekHref} className={BACK_BTN}>
              <ChevronLeft className="h-5 w-5" aria-hidden="true" /> Semaine {weekNo}
            </Link>
            <div className="flex shrink-0 items-center">
              <Link to={props.prevHref} state={linkState} aria-label="Jour précédent" className={ICON_BTN}><ChevronLeft className="h-6 w-6" /></Link>
              <Link to={props.nextHref} state={linkState} aria-label="Jour suivant" className={ICON_BTN}><ChevronRight className="h-6 w-6" /></Link>
            </div>
          </>
        )}
        {phoneTrailing && <div className="ml-auto md:hidden">{phoneTrailing}</div>}
        {/* Second line on phones; from md its children join row 1 in the order given by md:order-* */}
        <div className="flex min-h-11 w-full flex-wrap items-center gap-2 md:contents">
          <div className="md:order-3">{switcher}</div>
          {todayLink && <div className="md:order-2">{todayLink}</div>}
          {isWeek && (
            <div className="ml-auto whitespace-nowrap md:order-1 md:ml-0">
              <WeekPicker from={props.range.from} to={props.range.to} value={props.range.value} onChange={props.range.onChange} />
            </div>
          )}
        </div>
        {right && <div className="ml-auto hidden xl:order-4 xl:block">{right}</div>}
      </div>
      {below && <div className="no-print xl:hidden">{below}</div>}
      {/* On the laptop week the seven columns are the days, so the strip would repeat every date. */}
      <div className={`no-print sticky top-0 z-20 -mx-4 bg-background px-4 py-1.5 md:static md:mx-0 md:px-0${isWeek ? " xl:hidden" : ""}`}>
        <DayStrip dates={dates} counts={counts} today={today} selected={isWeek ? undefined : props.date} href={dayHref} state={linkState} />
      </div>
    </>
  );
}
