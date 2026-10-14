import type { ReactNode } from "react";
import DayStrip from "@/components/admin/DayStrip";
import { DateNav, Toolbar, ViewTabs } from "@/components/ui";

export type PlanningView = "week" | "day" | "personne";

export interface PlanningBarProps {
  view: PlanningView;
  // Targets of the three view tabs; "Par personne" is hidden without a target.
  weekHref: string;
  dayHref: string;
  personHref?: string;
  // The period control.
  dateLabel: ReactNode;
  onPrev: () => void;
  onNext: () => void;
  onPick?: (raw: string) => void;
  pickValue?: string;
  isToday?: boolean;
  onToday?: () => void;
  // Right group on pointer screens; `rightTouch` replaces it on touch screens.
  right?: ReactNode;
  rightTouch?: ReactNode;
  filters?: ReactNode;
  // The seven-day strip.
  dates: string[];
  counts: Record<string, number>;
  today: string;
  selected?: string;
  stripHref: (date: string) => string;
  linkState?: unknown;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  // Touch drag: the strip tints, the target cell gets the ring and the caption shows.
  dropDay?: string | null;
  dragging?: boolean;
}

// One toolbar row shared by the week and the day page, then the seven-day strip.
export default function PlanningBar(props: PlanningBarProps) {
  const { view, weekHref, dayHref, personHref, dateLabel, onPrev, onNext, onPick, pickValue, isToday, onToday, right, rightTouch, filters } = props;
  const { dates, counts, today, selected, stripHref, linkState, onTouchStart, onTouchEnd, dropDay, dragging } = props;

  const tabs = [
    { key: "week", label: "Semaine", to: weekHref },
    { key: "day", label: "Jour", to: dayHref },
    ...(personHref ? [{ key: "personne", label: "Par personne", to: personHref, title: "Les lignes de chacun, pour un jour" }] : []),
  ];

  return (
    <>
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <Toolbar
          left={<div data-tour="planning-tabs" className="flex min-w-0"><ViewTabs items={tabs} value={view} aria-label="Affichage" className="-ml-2" /></div>}
          center={(
            <DateNav
              label={dateLabel}
              onPrev={onPrev}
              onNext={onNext}
              onPick={onPick}
              value={pickValue}
              pickerType="date"
              isToday={isToday}
              onToday={onToday}
              labelClassName="md:min-w-[15rem] justify-start"
              todayAlways
            />
          )}
          right={right}
          rightTouch={rightTouch && <span className="flex items-center gap-0.5 touch:-mr-1">{rightTouch}</span>}
          filters={filters}
        />
      </div>
      {/* At xl the DayHeads row carries the seven days on both pages, so the strip would repeat every date. */}
      <div className="no-print sticky top-topbar z-20 -mx-4 bg-background px-4 py-1 md:static md:mx-0 md:px-0 xl:hidden">
        <DayStrip dates={dates} counts={counts} today={today} selected={selected} href={stripHref} state={linkState} dropDay={dropDay} dragging={dragging} />
      </div>
    </>
  );
}
