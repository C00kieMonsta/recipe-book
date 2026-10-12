export {
  parseYmd,
  toYmd,
  addDays,
  ymOf,
  weekdayOf,
  startOfWeekMonday,
  endOfWeekSunday,
  isoWeekOf,
  parseIsoWeek,
  mondayOfIsoWeek,
  datesOfIsoWeek,
  todayYmd,
  dayLabel,
  longDayLabel,
  dayMonthLabel,
  monthLabel,
  rangeLabel,
  weekLabel,
} from "@packages/types";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Local calendar date, unlike todayYmd which reads the UTC date.
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
