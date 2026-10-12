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
import { parseYmd } from "@packages/types";

const shortDayMonth = new Intl.DateTimeFormat("fr-BE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

// "Mar 13 oct"
export function dayMonthShortLabel(date: string): string {
  const s = shortDayMonth.format(parseYmd(date)).replace(/\./g, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Local calendar date, unlike todayYmd which reads the UTC date.
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
