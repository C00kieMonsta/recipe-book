import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { WeekPlan } from "@packages/types";
import { fmtEur0 } from "@/lib/use-planning-data";

export interface WeekMetaProps {
  weekTotals: Pick<WeekPlan, "signedRevenue" | "guests" | "linesDone" | "linesTotal">;
  // monday <= today; decides whether the « faites sur » fragment shows.
  started: boolean;
  monthLink: { to: string; text: string; short: string };
  state?: unknown;
}

// The week's stat line under the title, shared by the week and the day page.
export default function WeekMeta({ weekTotals, started, monthLink, state }: WeekMetaProps) {
  const { linesDone, linesTotal } = weekTotals;
  const doneFragment = started && linesTotal > 0 ? (
    <>
      <span className="hidden md:inline"> · {linesDone} {linesDone === 1 ? "ligne de préparation faite" : "lignes de préparation faites"} sur {linesTotal}</span>
      <span className="md:hidden"> · {linesDone}/{linesTotal} lignes faites</span>
    </>
  ) : null;

  return (
    <span className="tabular-nums" data-tour="week-stats">
      <abbr title="Chiffre d'affaires HTVA des événements confirmés" className="no-underline">Signé</abbr> {fmtEur0(weekTotals.signedRevenue)} HTVA · <span className="whitespace-nowrap">{weekTotals.guests} <span className="hidden md:inline">convives</span><span className="md:hidden">conv.</span></span>{doneFragment}
      {/* The separator travels with the link so a wrapped line never ends on a lone dot. */}
      {" "}
      <span className="whitespace-nowrap">
        {"· "}
        <Link to={monthLink.to} state={state} className="inline-flex items-center gap-0.5 rounded text-primary hover:bg-hover touch:min-h-11">
          <span className="hidden md:inline">{monthLink.text}</span>
          <span className="md:hidden">{monthLink.short}</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </span>
    </span>
  );
}
