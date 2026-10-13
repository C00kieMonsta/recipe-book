const DAY_MS = 86_400_000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Reads only the YYYY-MM-DD part and builds a UTC midnight so the browser timezone cannot shift the day.
export function parseYmd(date: string): Date {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function addDays(date: string, n: number): string {
  const d = parseYmd(date);
  d.setUTCDate(d.getUTCDate() + n);
  return toYmd(d);
}

// Whole days from a to b, negative when b is before a.
export function daysBetween(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / DAY_MS);
}

export function ymOf(date: string): string {
  return date.slice(0, 7);
}

// ISO weekday, Monday = 1, Sunday = 7.
export function weekdayOf(date: string): number {
  return parseYmd(date).getUTCDay() || 7;
}

export function startOfWeekMonday(date: string): string {
  return addDays(date, 1 - weekdayOf(date));
}

export function endOfWeekSunday(date: string): string {
  return addDays(startOfWeekMonday(date), 6);
}

// Thursday rule: the ISO week is the week of the date's Thursday.
export function isoWeekOf(date: string): string {
  const d = parseYmd(date);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const dayOfYear = Math.floor((d.getTime() - Date.UTC(year, 0, 1)) / DAY_MS) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${year}-W${pad2(week)}`;
}

export function parseIsoWeek(isoWeek: string): { year: number; week: number } {
  const m = /^(\d{4})-W(\d{2})$/.exec(isoWeek);
  if (!m) throw new Error(`Invalid ISO week: ${isoWeek}`);
  return { year: Number(m[1]), week: Number(m[2]) };
}

// Week 1 is the week containing 4 January.
export function mondayOfIsoWeek(isoWeek: string): string {
  const { year, week } = parseIsoWeek(isoWeek);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday1 = jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * DAY_MS;
  return toYmd(new Date(monday1 + (week - 1) * 7 * DAY_MS));
}

export function datesOfIsoWeek(isoWeek: string): string[] {
  const monday = mondayOfIsoWeek(isoWeek);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function todayYmd(now: Date = new Date()): string {
  return toYmd(now);
}

const shortDay = new Intl.DateTimeFormat("fr-BE", { weekday: "short", day: "numeric", timeZone: "UTC" });
const longDay = new Intl.DateTimeFormat("fr-BE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "long", timeZone: "UTC" });
const dayMonthYear = new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("fr-BE", { month: "long", year: "numeric", timeZone: "UTC" });

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "Mar 13"
export function dayLabel(date: string): string {
  return capitalize(shortDay.format(parseYmd(date)).replace(".", ""));
}

// "jeu. 15"
export function shortDayLabel(date: string): string {
  return shortDay.format(parseYmd(date));
}

// "Mardi 13 octobre"
export function longDayLabel(date: string): string {
  return capitalize(longDay.format(parseYmd(date)));
}

// "13 octobre"
export function dayMonthLabel(date: string): string {
  return dayMonth.format(parseYmd(date));
}

// "Octobre 2026", from a YYYY-MM or a YYYY-MM-DD string.
export function monthLabel(ym: string): string {
  return capitalize(monthYear.format(parseYmd(`${ym.slice(0, 7)}-01`)));
}

// "12 au 18 octobre", "29 décembre au 4 janvier", "29 décembre 2025 au 4 janvier 2026".
export function rangeLabel(from: string, to: string): string {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${dayMonthYear.format(a)} au ${dayMonthYear.format(b)}`;
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${dayMonth.format(a)} au ${dayMonth.format(b)}`;
  return `${a.getUTCDate()} au ${dayMonth.format(b)}`;
}

export function weekLabel(isoWeek: string): string {
  const days = datesOfIsoWeek(isoWeek);
  return rangeLabel(days[0], days[6]);
}
