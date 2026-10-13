import type { AppEvent } from "@packages/types";

// Default event for a new task on a day: same day first, then the nearest after, then the nearest before.
export function defaultTaskEventId(events: Pick<AppEvent, "eventId" | "date">[], date: string): string {
  const sameDay = events.find((e) => e.date === date);
  if (sameDay) return sameDay.eventId;
  const after = events.filter((e) => e.date > date).sort((a, b) => a.date.localeCompare(b.date));
  if (after.length) return after[0].eventId;
  const before = events.filter((e) => e.date < date).sort((a, b) => b.date.localeCompare(a.date));
  if (before.length) return before[0].eventId;
  return "";
}
