import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface PlanningFrameProps {
  weekNo: number;
  // Screen-reader suffix of the title on the day: " · Mardi 13 octobre".
  titleSuffix?: string;
  meta: ReactNode;
  // <PlanningBar …/>
  bar: ReactNode;
  error?: string | null;
  // FirstRunCallout + WeekChecklist
  callouts?: ReactNode;
  // <DayHeads …/>
  heads?: ReactNode;
  className?: string;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  children: ReactNode;
}

// Everything above the body of the week and the day page, so the two cannot drift.
export default function PlanningFrame({ weekNo, titleSuffix, meta, bar, error, callouts, heads, className, onTouchStart, onTouchEnd, children }: PlanningFrameProps) {
  return (
    <div className={cn("mx-auto max-w-wide", className)} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <PageHeader
        iconKey="semaine"
        className="no-print"
        meta={meta}
        title={<>Semaine {weekNo}{titleSuffix && <span className="sr-only">{titleSuffix}</span>}</>}
      />
      {bar}
      {error && <p className="no-print mt-3 text-sm text-danger">{error}</p>}
      {callouts && <div className="no-print mt-3" data-tour="week-checklist">{callouts}</div>}
      {heads && <div className="no-print mt-4 hidden xl:block">{heads}</div>}
      {children}
    </div>
  );
}
